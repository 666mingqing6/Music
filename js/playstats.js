/**
 * 播放统计模块
 * - song_key 稳定标识（网易云 ne:{id} / 本地 lo:{url}），歌单增删改序不影响计数
 * - localStorage 本地存储（游客模式完整可用）
 *
 * ===== 云端同步设计（写入配额友好版）=====
 * 配额现实：云端按"写入行数"计费，写是瓶颈、读几乎用不完。
 * 旧方案每次播放 → 防抖 2 秒 → GET 合并 → PUT 全量替换，而 PUT 在服务端是
 * DELETE 全部 + INSERT 全部，一次同步写 ≈ 2N 行（N = 歌曲数，约 300 行）。
 * 现方案改为"增量 + 节流"：
 *   1. 增量上报：只上报发生变化的 key（pending），服务端 UPSERT 取 max，
 *      一次同步写 1~3 行而非 ~600 行（详见 meting-api /user/playcounts/merge）
 *   2. 写入节流：防抖 syncDebounceMs + 最小间隔 syncMinIntervalMs
 *      + 最长等待 syncMaxWaitMs 保底，参数集中在 config.js
 *   3. 无 GET：merge 语义是 max 合并，天然幂等且多设备互不覆盖，
 *      上报前不再需要"先读云端再全量写回"，读请求也一并省掉
 *   4. pending 持久化到 localStorage：即使长时间未上报、页面崩溃，
 *      下次开页仍会补传，不丢数据（这是可以放宽节流的前提）
 *   5. 失败指数退避：服务端异常时不会持续重试刷写
 * - 关页兜底：pagehide 时 keepalive 直接上报 pending（见 auth.js）
 */
class PlayStats {
    constructor() {
        this.counts = {};              // {song_key: 播放次数}
        this.pending = {};             // {song_key: 待上报的本地最新计数}（只含变化项）
        this.auth = null;              // AuthModule，登录后注入
        this._syncTimer = null;
        this._syncing = false;         // 上报串行锁（防并发乱序）
        this._pendingSince = 0;        // 最早未上报变更的时间戳（最长等待保底用）
        this._lastFlushAt = 0;         // 上次成功写入云端的时间（最小间隔用）
        this._failCount = 0;           // 连续失败次数（指数退避用）
        this._load();
    }

    // ===== 配置读取（config.js 为全站唯一配置入口，读取时兜底默认值）=====
    _cfg() {
        const num = (v, d) => (typeof v === 'number' && isFinite(v) && v >= 0) ? v : d;
        const g = (typeof window !== 'undefined') ? window : {};
        return {
            debounce: Math.max(1000, num(g.syncDebounceMs, 30000)),
            minInterval: num(g.syncMinIntervalMs, 60000),
            maxWait: num(g.syncMaxWaitMs, 180000),
            maxKeys: Math.max(1, num(g.syncMaxKeysPerReq, 300)),
        };
    }

    // ===== 歌曲稳定标识 =====
    // 网易云歌（歌单内 / 搜索点播加入的）都走 meting 的 url 字段，含 type=url|lrc|pic & id=
    // 本地音乐用用户配置的稳定直链
    // 兜底用歌名|歌手（理论上不会走到）
    static keyFor(track) {
        if (!track) return '';
        const url = track.url || '';
        const m = url.match(/[?&]id=(\d+)/);
        if (m && (url.includes('type=url') || url.includes('type=lrc') || url.includes('type=pic'))) {
            return 'ne:' + m[1];
        }
        if (track._searchId) return 'ne:' + track._searchId;
        if (url) return 'lo:' + url;
        return 'ti:' + (track.name || '') + '|' + (track.artist || '');
    }

    get(key) {
        return this.counts[key] || 0;
    }

    hasPending() {
        return Object.keys(this.pending).length > 0;
    }

    increment(key) {
        if (!key) return;
        this.counts[key] = (this.counts[key] || 0) + 1;
        this._save();
        this._markPending(key);
        this._scheduleSync();
    }

    // 直接导入本地已有计数（旧版索引计数迁移用），并标记待上报
    importLocal(key, value) {
        const v = value | 0;
        if (!key || v <= (this.counts[key] || 0)) return false;
        this.counts[key] = v;
        this._markPending(key);
        return true;
    }

    // 记录一个待上报项（值为"本地最新绝对计数"，服务端按 max 合并）
    _markPending(key) {
        if (!key) return;
        this.pending[key] = this.counts[key] || 0;
        if (!this._pendingSince) this._pendingSince = Date.now();
        this._savePending();
    }

    // 登录/开页合并：同 key 取 max（保守，永不丢数据）
    // - 云端更高 → 采纳云端值
    // - 本地更高 → 记入 pending，等待增量上报（离线期间/另一台设备播过的差异）
    // 返回"是否有云端数据被采纳"（调用方据此作废洗牌队列）
    mergeMax(remote) {
        if (!remote || typeof remote !== 'object') return false;
        let changed = false;
        let marked = false;
        for (const k in remote) {
            const r = remote[k] | 0;
            const local = this.counts[k] || 0;
            if (r > local) {
                this.counts[k] = r;
                changed = true;
            } else if (r < local) {
                this.pending[k] = local;
                marked = true;
            }
        }
        if (changed) this._save();
        if (marked) {
            if (!this._pendingSince) this._pendingSince = Date.now();
            this._savePending();
        }
        return changed;
    }

    exportAll() {
        return this.counts;
    }

    // ===== 本地存储 =====
    _load() {
        try {
            this.counts = JSON.parse(localStorage.getItem('mq_play_count_v2') || '{}') || {};
        } catch { this.counts = {}; }
        try {
            this.pending = JSON.parse(localStorage.getItem('mq_play_pending_v2') || '{}') || {};
        } catch { this.pending = {}; }
        // 上次会话遗留的待上报项：保留时间戳，让最长等待从本次开页重新计时
        if (this.hasPending()) this._pendingSince = Date.now();
    }

    _save() {
        try {
            // 轻量清理：超过 3000 条时删除计数为 1 的条目（歌曲总量远小于此，正常不会触发）
            const keys = Object.keys(this.counts);
            if (keys.length > 3000) {
                for (const k of keys) {
                    if (this.counts[k] <= 1) delete this.counts[k];
                }
            }
            localStorage.setItem('mq_play_count_v2', JSON.stringify(this.counts));
        } catch { /* localStorage 不可用或已满，忽略 */ }
    }

    _savePending() {
        try {
            if (this.hasPending()) {
                localStorage.setItem('mq_play_pending_v2', JSON.stringify(this.pending));
            } else {
                localStorage.removeItem('mq_play_pending_v2');
            }
        } catch { /* ignore */ }
    }

    // ===== 云端同步（登录后启用）=====
    attachAuth(auth) {
        this.auth = auth;
    }

    // 变更后的上报调度：三重节流
    //   debounce   最后一次变更后静默 N ms（连续切歌合并为一次请求）
    //   minInterval 距上次成功写入不足 N ms 则推迟（硬性限流）
    //   maxWait    自首次变更起最长等 N ms 强制上报（长会话保底，避免久不上云）
    //   失败退避   连续失败时 15s 起指数退避，上限 10 分钟
    _scheduleSync() {
        if (!this.auth || !this.auth.isLoggedIn()) return;
        if (!this.hasPending()) return;
        clearTimeout(this._syncTimer);

        const { debounce, minInterval, maxWait } = this._cfg();
        const now = Date.now();
        let delay = debounce;

        if (this._lastFlushAt) {
            const since = now - this._lastFlushAt;
            if (since < minInterval) delay = Math.max(delay, minInterval - since);
        }
        if (this._pendingSince && maxWait > 0) {
            const left = this._pendingSince + maxWait - now;
            if (left < delay) delay = Math.max(0, left);
        }
        if (this._failCount > 0) {
            const backoff = Math.min(600000, 15000 * Math.pow(2, this._failCount - 1));
            delay = Math.max(delay, backoff);
        }

        this._syncTimer = setTimeout(() => { this.flush(); }, delay);
    }

    // 增量上报（只发变化项，服务端 UPSERT 取 max）
    // force=true 跳过最小间隔（登录/手动同步/关页兜底等明确时机）
    async flush(opts) {
        const force = !!(opts && opts.force);
        if (!this.auth || !this.auth.isLoggedIn()) return;
        if (!this.hasPending()) { this._pendingSince = 0; return; }
        if (this._syncing) { this._scheduleSync(); return; }   // 已有上报进行中，稍后重试

        if (!force) {
            const { minInterval } = this._cfg();
            const since = Date.now() - this._lastFlushAt;
            if (this._lastFlushAt && since < minInterval) { this._scheduleSync(); return; }
        }

        this._syncing = true;
        clearTimeout(this._syncTimer);

        // 快照：上报期间可能又有新的播放，只清理"值未被再次更新"的项
        const snapshot = {};
        for (const k in this.pending) snapshot[k] = this.pending[k];

        try {
            const ok = await this._pushChunks(snapshot);
            if (ok) {
                this._lastFlushAt = Date.now();
                this._failCount = 0;
                for (const k in snapshot) {
                    if (this.pending[k] === snapshot[k]) delete this.pending[k];
                }
                if (!this.hasPending()) this._pendingSince = 0;
                this._savePending();
            } else {
                this._failCount++;
                this._scheduleSync();
            }
        } catch {
            this._failCount++;
            this._scheduleSync();
        } finally {
            this._syncing = false;
        }
    }

    // 按 maxKeysPerReq 分片上报（正常情况下 pending 只有 1~3 项，分片仅在首次登录
    // 把大量本地历史一次性上云时触发）
    async _pushChunks(snapshot) {
        // 后端未部署 merge 接口：直接降级为全量 PUT（写放大，但功能不中断）
        if (this.auth.mergeUnsupported) {
            return await this.auth.putPlayCounts(this.counts);
        }
        const { maxKeys } = this._cfg();
        const keys = Object.keys(snapshot);
        for (let i = 0; i < keys.length; i += maxKeys) {
            const chunk = {};
            for (const k of keys.slice(i, i + maxKeys)) chunk[k] = snapshot[k];
            const ok = await this.auth.mergePlayCounts(chunk);
            if (!ok) {
                // 首次探测到 404 → 立刻用全量 PUT 兜底，不等退避重试
                if (this.auth.mergeUnsupported) {
                    return await this.auth.putPlayCounts(this.counts);
                }
                return false;
            }
        }
        return true;
    }

    // 登录 / 手动同步：先拉云端取 max 合并，再把本地领先的差异项上推
    // 返回"云端是否有更新被采纳"（用于作废洗牌队列）
    async syncAll() {
        if (!this.auth || !this.auth.isLoggedIn()) return false;
        const remote = await this.auth.fetchPlayCounts();
        const changed = this.mergeMax(remote);
        await this.flush({ force: true });
        return changed;
    }

    // 开页静默同步（已登录时后台调用，失败不阻塞开页）
    async syncOnOpen() {
        if (!this.auth || !this.auth.isLoggedIn()) return false;
        try {
            const remote = await this.auth.fetchPlayCounts();
            const changed = this.mergeMax(remote);
            this._scheduleSync();   // 本地领先的项按节流规则择机上推
            return changed;
        } catch {
            return false;
        }
    }

    // 关页兜底：页面即将销毁，keepalive 直接上报 pending（keepalive 请求体会被
    // 浏览器保证发出，无需等待响应；失败也不影响本地数据，下次开页会补传）
    flushOnExit() {
        if (!this.auth || !this.auth.isLoggedIn()) return;
        if (!this.hasPending()) return;
        try {
            const snapshot = {};
            for (const k in this.pending) snapshot[k] = this.pending[k];
            const p = this.auth.mergePlayCounts(snapshot, true);
            if (p && typeof p.then === 'function') p.catch(() => {});
        } catch { /* ignore */ }
    }
}
