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

    async putPlayCounts(counts) {
        const resp = await fetch(this.apiBase + '/user/playcounts', {
            method: 'PUT',
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

        this.els = {
            btnUser: document.getElementById('btn-user'),
            popup: document.getElementById('user-popup'),
            loginForm: document.getElementById('user-login-form'),
            logged: document.getElementById('user-logged'),
            nameInput: document.getElementById('user-name-input'),
            passInput: document.getElementById('user-pass-input'),
            btnLogin: document.getElementById('btn-user-login'),
            btnRegister: document.getElementById('btn-user-register'),
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

        // 登录
        if (this.els.btnLogin) {
            this.els.btnLogin.onclick = () => this._doLogin(false);
        }
        // 注册
        if (this.els.btnRegister) {
            this.els.btnRegister.onclick = () => this._doLogin(true);
        }
        // 回车提交
        [this.els.nameInput, this.els.passInput].forEach(el => {
            if (el) el.onkeydown = e => {
                if (e.key === 'Enter') this._doLogin(false);
            };
        });
        // 立即同步 / 退出
        if (this.els.btnSync) {
            this.els.btnSync.onclick = () => this._doSync();
        }
        if (this.els.btnLogout) {
            this.els.btnLogout.onclick = () => this._doLogout();
        }

        // 页面隐藏时冲刷未上报的计数
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.stats.flush();
            }
        });

        this._renderState();
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
            this._setMsg('');
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
            await this.stats.flush();
            // flush 只在 _dirty 时上报；登录场景强制全量同步一次
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
