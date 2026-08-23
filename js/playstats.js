/**
 * 播放统计模块
 * - song_key 稳定标识（网易云 ne:{id} / 本地 lo:{url}），歌单增删改序不影响计数
 * - localStorage 本地存储（游客模式完整可用）
 * - 登录后"播放即同步"：2 秒合并窗口防抖 → 上报前先 GET 云端 mergeMax
 *   （PUT 是全量替换语义，不合并会被别台设备的更高计数覆盖）→ 全量 PUT
 * - 关页兜底：pagehide 时 keepalive 直接 PUT（见 auth.js）
 */
class PlayStats {
    constructor() {
        this.counts = {};              // {song_key: 播放次数}
        this.auth = null;              // AuthModule，登录后注入
        this._syncTimer = null;
        this._dirty = false;           // 有未上报的本地变更
        this._syncing = false;         // 上报串行锁（防并发 PUT 乱序）
        this._load();
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

    increment(key) {
        if (!key) return;
        this.counts[key] = (this.counts[key] || 0) + 1;
        this._save();
        this._dirty = true;
        this._scheduleSync();
    }

    // 登录时合并：同 key 取 max（保守，永不丢数据）
    mergeMax(remote) {
        if (!remote || typeof remote !== 'object') return false;
        let changed = false;
        for (const k in remote) {
            const r = remote[k] | 0;
            if (r > (this.counts[k] || 0)) {
                this.counts[k] = r;
                changed = true;
            }
        }
        if (changed) this._save();
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

    // ===== 云端同步（登录后启用）=====
    attachAuth(auth) {
        this.auth = auth;
    }

    // 播放即同步：2 秒合并窗口（快速连切多首只发一个请求），到点上报
    _scheduleSync() {
        if (!this.auth || !this.auth.isLoggedIn()) return;
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => { this.flush(); }, 2000);
    }

    // 全量上报（幂等，失败下次重试）
    // 上报前先拉云端 mergeMax：PUT 是全量替换，若别台设备上报过更高计数，
    // 直接 PUT 本地旧值会把它覆盖回去
    async flush() {
        if (!this.auth || !this.auth.isLoggedIn() || !this._dirty) return;
        if (this._syncing) { this._scheduleSync(); return; }   // 已有上报进行中，稍后重试
        this._syncing = true;
        clearTimeout(this._syncTimer);
        try {
            try {
                const remote = await this.auth.fetchPlayCounts();
                this.mergeMax(remote);
            } catch { /* 云端拉取失败也要尽力上报本地数据 */ }
            const ok = await this.auth.putPlayCounts(this.counts);
            if (ok) this._dirty = false;
        } catch { /* 网络异常，下次再试 */ }
        finally { this._syncing = false; }
    }

    // 关页兜底：页面即将销毁，来不及 GET 合并，keepalive 直接 PUT 本地全量
    // （本会话内每次 flush 都已 merge 过云端，本地值 >= 云端，直接 PUT 安全）
    flushOnExit() {
        if (!this.auth || !this.auth.isLoggedIn() || !this._dirty) return;
        try {
            const p = this.auth.putPlayCounts(this.counts, true);
            p.then(ok => { if (ok) this._dirty = false; }).catch(() => {});
        } catch { /* ignore */ }
    }
}
