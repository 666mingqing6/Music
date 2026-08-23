/**
 * 账户模块：登录 / 注册 / 登出 + 播放计数云端同步
 * API 挂在 meting-api Worker 上（/auth/* /user/*），Bearer token 鉴权
 */
class AuthModule {
    constructor(apiBase) {
        this.apiBase = apiBase.replace(/\/+$/, '');  // https://meting-api.646474.xyz
        this.token = '';
        this.username = '';
        this._loadSession();
        this.els = {};
    }

    // ===== 会话持久化（localStorage）=====
    _loadSession() {
        try {
            this.token = localStorage.getItem('mq_auth_token') || '';
            this.username = localStorage.getItem('mq_auth_username') || '';
        } catch { /* ignore */ }
    }

    _saveSession() {
        try {
            if (this.token) {
                localStorage.setItem('mq_auth_token', this.token);
                localStorage.setItem('mq_auth_username', this.username);
            } else {
                localStorage.removeItem('mq_auth_token');
                localStorage.removeItem('mq_auth_username');
            }
        } catch { /* ignore */ }
    }

    isLoggedIn() {
        return !!this.token;
    }

    // ===== API =====
    async register(username, password) {
        return this._authRequest('/auth/register', username, password);
    }

    async login(username, password) {
        return this._authRequest('/auth/login', username, password);
    }

    async _authRequest(path, username, password) {
        const resp = await fetch(this.apiBase + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
        this.token = data.token;
        this.username = data.username || username;
        this._saveSession();
        return data;
    }

    async logout() {
        if (this.token) {
            try {
                await fetch(this.apiBase + '/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.token },
                });
            } catch { /* 即使失败也本地登出 */ }
        }
        this.token = '';
        this.username = '';
        this._saveSession();
    }

    // 401 时清除本地过期 token
    _handleUnauthorized() {
        this.token = '';
        this.username = '';
        this._saveSession();
    }

    async fetchPlayCounts() {
        const resp = await fetch(this.apiBase + '/user/playcounts', {
            headers: { 'Authorization': 'Bearer ' + this.token },
        });
        if (resp.status === 401) {
            this._handleUnauthorized();
            throw new Error('登录已过期，请重新登录');
        }
        if (!resp.ok) throw new Error('同步失败 (HTTP ' + resp.status + ')');
        const data = await resp.json();
        return data.counts || {};
    }

    async putPlayCounts(counts, keepalive = false) {
        const resp = await fetch(this.apiBase + '/user/playcounts', {
            method: 'PUT',
            keepalive,   // 关页兜底场景：页面销毁后浏览器仍把请求发完
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.token,
            },
            body: JSON.stringify({ counts }),
        });
        if (resp.status === 401) {
            this._handleUnauthorized();
            return false;
        }
        return resp.ok;
    }

    // ===== UI =====
    initUI(player) {
        this.player = player;
        this.stats = player.stats;
        this.mode = 'login';   // 'login' | 'register'（选项卡当前模式）

        this.els = {
            btnUser: document.getElementById('btn-user'),
            popup: document.getElementById('user-popup'),
            loginForm: document.getElementById('user-login-form'),
            logged: document.getElementById('user-logged'),
            tabLogin: document.getElementById('tab-user-login'),
            tabRegister: document.getElementById('tab-user-register'),
            nameInput: document.getElementById('user-name-input'),
            passInput: document.getElementById('user-pass-input'),
            btnSubmit: document.getElementById('btn-user-submit'),
            formMsg: document.getElementById('user-form-msg'),
            nameDisplay: document.getElementById('user-name-display'),
            syncInfo: document.getElementById('user-sync-info'),
            btnSync: document.getElementById('btn-sync-now'),
            btnLogout: document.getElementById('btn-logout'),
        };
        if (!this.els.btnUser) return;

        // 按钮点击切换弹窗
        this.els.btnUser.onclick = e => {
            e.stopPropagation();
            this.els.popup.classList.toggle('active');
        };

        // 选项卡切换：登录 <-> 注册
        if (this.els.tabLogin) {
            this.els.tabLogin.onclick = () => this._setMode('login');
        }
        if (this.els.tabRegister) {
            this.els.tabRegister.onclick = () => this._setMode('register');
        }

        // 提交按钮：按当前选项卡执行登录或注册
        if (this.els.btnSubmit) {
            this.els.btnSubmit.onclick = () => this._doLogin(this.mode === 'register');
        }
        // 回车提交
        [this.els.nameInput, this.els.passInput].forEach(el => {
            if (el) el.onkeydown = e => {
                if (e.key === 'Enter') this._doLogin(this.mode === 'register');
            };
        });
        // 立即同步 / 退出
        if (this.els.btnSync) {
            this.els.btnSync.onclick = () => this._doSync();
        }
        if (this.els.btnLogout) {
            this.els.btnLogout.onclick = () => this._doLogout();
        }

        // 页面隐藏时冲刷未上报的计数（完整流程：GET 合并 + PUT）
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.stats.flush();
            }
        });

        // 关页兜底：pagehide 时页面即将销毁，用 keepalive 直接 PUT 本地全量
        // （visibilitychange 在部分移动端浏览器关页时不可靠，双保险）
        window.addEventListener('pagehide', () => {
            this.stats.flushOnExit();
        });

        // 已登录开页：后台拉云端计数合并到本地
        // - 开页后的洗牌队列直接用最新计数（别台设备播过的记录立即可见）
        // - 防止本地旧数据在下次全量 PUT 时把云端更高计数覆盖回去
        if (this.isLoggedIn()) {
            this.fetchPlayCounts().then(remote => {
                this.stats._lastRemoteMergeAt = Date.now();
                if (this.stats.mergeMax(remote) && this.player) {
                    // 云端有更新：作废已构建的洗牌队列，下首歌起用最新计数重建
                    this.player._shuffleVersion = -1;
                }
            }).catch(() => { /* 拉取失败不阻塞开页，登录/同步时再合并 */ });
        }

        this._renderState();
    }

    // 切换登录/注册模式：页签高亮 + 主按钮文案联动
    _setMode(mode) {
        this.mode = mode;
        if (this.els.tabLogin) {
            this.els.tabLogin.classList.toggle('active', mode === 'login');
        }
        if (this.els.tabRegister) {
            this.els.tabRegister.classList.toggle('active', mode === 'register');
        }
        if (this.els.btnSubmit) {
            this.els.btnSubmit.textContent = mode === 'login' ? '登录' : '注册';
        }
        this._setMsg('');
    }

    _setMsg(text, isError) {
        if (!this.els.formMsg) return;
        this.els.formMsg.textContent = text || '';
        this.els.formMsg.className = 'user-form-msg' + (isError ? ' error' : '');
    }

    _renderState() {
        if (!this.els.loginForm) return;
        const logged = this.isLoggedIn();
        this.els.loginForm.style.display = logged ? 'none' : '';
        this.els.logged.style.display = logged ? '' : 'none';
        if (logged) {
            if (this.els.nameDisplay) this.els.nameDisplay.textContent = this.username;
        } else {
            this._setMode('login');   // 未登录/已登出时重置为登录选项卡
        }
        // 已登录时按钮加个小标识
        if (this.els.btnUser) {
            this.els.btnUser.classList.toggle('logged-in', logged);
        }
    }

    async _doLogin(isRegister) {
        const username = (this.els.nameInput.value || '').trim();
        const password = this.els.passInput.value || '';
        if (!username || !password) {
            this._setMsg('请输入用户名和密码', true);
            return;
        }
        this._setMsg(isRegister ? '注册中...' : '登录中...');
        try {
            if (isRegister) {
                await this.register(username, password);
            } else {
                await this.login(username, password);
            }
        } catch (e) {
            this._setMsg(e.message, true);
            return;
        }

        // 登录成功：拉取云端计数并与本地合并（取 max），再全量回传
        this._renderState();
        this._setMsg('');
        this.els.passInput.value = '';
        try {
            const remote = await this.fetchPlayCounts();
            this.stats.mergeMax(remote);
            this.stats._lastRemoteMergeAt = Date.now();
            // 登录场景强制全量同步一次（不受 _dirty 限制，把合并结果落库）
            await this.putPlayCounts(this.stats.exportAll());
            this.stats._dirty = false;
            this._setMsg('');
            if (this.player) this.player.showToast('已登录：播放记录已同步', 'info', 2500);
        } catch (e) {
            this._setMsg(e.message, true);
        }
    }

    async _doSync() {
        if (!this.isLoggedIn()) return;
        this._setMsg('同步中...');
        try {
            const remote = await this.fetchPlayCounts();
            this.stats.mergeMax(remote);
            this.stats._lastRemoteMergeAt = Date.now();
            await this.putPlayCounts(this.stats.exportAll());
            this.stats._dirty = false;
            this._setMsg('同步完成 (' + new Date().toLocaleTimeString() + ')');
            if (this.player) this.player.showToast('播放记录已同步', 'info', 2000);
        } catch (e) {
            this._setMsg(e.message, true);
        }
    }

    async _doLogout() {
        await this.logout();
        this._renderState();
        if (this.player) this.player.showToast('已退出登录（本地记录保留）', 'info', 2500);
    }
}
