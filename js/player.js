/**
 * MQ Music - 现代音乐播放器核心
 * @version 2.0.0
 */

class MusicPlayer {
    constructor() {
        // 状态
        this.playlist = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.playMode = 'shuffle'; // shuffle, loop, repeat-one
        this.lyrics = [];
        this.currentLyricIndex = -1;

        // 封面 URL 缓存（用于列表缩略图）
        this.coverUrlCache = new Map();

        // 歌词滚动状态
        this.isLyricScrolling = false;
        this.lyricScrollTimer = null;
        this.lyricScrollRAF = null;

        // 封面缓存
        this.coverCache = new Map();

        // 播放路径（一个确定性数组 + 当前位置指针）
        this.playPath = [];
        this.pathPos = -1;

        // 加载令牌：用于丢弃快速切换歌曲时过期的异步结果，避免竞态
        this._loadId = 0;
        this._lyricLoadId = 0;

        // 播放次数统计（平均随机用，localStorage 持久化）
        this.playCount = this._loadPlayCount();

        // 错误自动恢复：连续出错计数 + 跳过定时器
        this._consecutiveErrors = 0;
        this._errorSkipTimer = null;

        // 音效（Web Audio API）
        this.audioContext = null;
        this.sourceNode = null;
        this.audioEffect = 'none';
        this._effectNodes = [];
        this._effectInitInProgress = false;
        this._effectApplyId = 0;

        // CORS 代理（用于不支持 CORS 的音频源，如网易云，启用音效时代理音频为 blob URL）
        this.corsProxy = typeof corsProxyUrl !== 'undefined' ? corsProxyUrl : '';
        this._blobUrlCache = new Map();

        // API
        this.apiUrl = 'https://meting-api.646474.xyz/?server=:server&type=:type&id=:id&r=:r';

        // DOM 元素缓存
        this.els = {};

        // Toast 队列
        this._toastContainer = null;

        // 初始化
        this.init();
    }
    
    async init() {
        this.cacheElements();
        this.bindEvents();
        this.initVolume();
        
        // 先立即隐藏加载遮罩，不等数据加载
        setTimeout(() => {
            if (this.els.loadingOverlay) {
                this.els.loadingOverlay.classList.add('hidden');
            }
        }, 300);
        
        try {
            await this.loadPlaylist();
            this.renderQueue();
            if (this.playlist.length > 0) {
                const randomIndex = Math.floor(Math.random() * this.playlist.length);
                this.playPath = [randomIndex];
                this.pathPos = 0;
                this.loadTrack(randomIndex, true);
            }
            this.resolveAllCovers();
        } catch (error) {
            console.error('初始化失败:', error);
        }
    }
    
    cacheElements() {
        const $ = id => document.getElementById(id);
        
        this.els = {
            // 音频
            audio: $('audio-player'),
            
            // 背景
            bgCover: $('bg-cover'),
            
            // 封面
            coverContainer: $('cover-container'),
            coverArt: $('cover-art'),
            coverGlow: $('cover-glow'),
            
            // 歌曲信息
            trackTitle: $('track-title'),
            trackArtist: $('track-artist'),
            
            // 进度
            progressBar: $('progress-bar'),
            progressBuffer: $('progress-buffer'),
            progressFill: $('progress-fill'),
            progressSlider: $('progress-slider'),
            timeCurrent: $('time-current'),
            timeTotal: $('time-total'),
            
            // 主控制
            btnPrev: $('btn-prev'),
            btnPlay: $('btn-play'),
            btnNext: $('btn-next'),
            btnMode: $('btn-mode'),
            
            // 次要控制
            btnVolume: $('btn-volume'),
            volumeSlider: $('volume-slider'),
            volumeFill: $('volume-fill'),

            // 音效
            btnEffect: $('btn-effect'),
            effectControl: $('effect-control'),
            effectPopup: $('effect-popup'),
            effectItems: document.querySelectorAll('.effect-item'),

            // 面板
            panelTabs: document.querySelectorAll('.panel-tab'),
            panelLyrics: $('panel-lyrics'),
            panelQueue: $('panel-queue'),
            
            // 歌词
            lyricsScroll: $('lyrics-scroll'),
            lyricsContainer: $('lyrics-container'),
            
            // 播放列表
            queueCount: $('queue-count'),
            queueList: $('queue-list'),
            queueSearchInput: $('queue-search-input'),
            
            // 移动端列表
            mobileQueueDrawer: $('mobile-queue-drawer'),
            mobileQueueList: $('mobile-queue-list'),
            mobileQueueSearchInput: $('mobile-queue-search-input'),
            btnCloseQueue: $('btn-close-queue'),
            
            // 移动端
            mobileNav: $('mobile-nav'),
            mobileLyricsView: $('mobile-lyrics-view'),
            mobileTrackTitle: $('mobile-track-title'),
            mobileTrackArtist: $('mobile-track-artist'),
            mobileLyricsContainer: $('mobile-lyrics-container'),
            mobileBtnPlay: $('mobile-btn-play'),
            btnCloseLyrics: $('btn-close-lyrics'),
            
            // 加载
            loadingOverlay: $('loading-overlay'),
            
            // 在线搜索
            searchInput: $('search-input'),
            searchResults: $('search-results'),
            searchHint: $('search-hint'),
            searchLoading: $('search-loading'),
            
            // 移动端搜索
            mobileSearchDrawer: $('mobile-search-drawer'),
            mobileSearchInput: $('mobile-search-input'),
            mobileSearchResults: $('mobile-search-results'),
            mobileSearchHint: $('mobile-search-hint'),
            mobileSearchLoading: $('mobile-search-loading'),
            btnCloseSearch: $('btn-close-search')
        };
    }
    
    // GD Studio API 基础地址（通过代理访问，国内被墙）
    static get GD_API() { return 'https://proxy.646474.xyz/https://music-api.gdstudio.xyz/api.php'; }
    
    bindEvents() {
        // 按钮点击兜底机制：2秒后自动移除 active 状态
        this.setupButtonFallback();
        
        // 播放控制
        this.els.btnPlay.onclick = () => this.togglePlay();
        this.els.btnPrev.onclick = () => this.prev();
        this.els.btnNext.onclick = () => this.next();
        if (this.els.btnMode) {
            this.els.btnMode.onclick = () => this.togglePlayMode();
        }
        
        // 移动端控制
        if (this.els.mobileBtnPlay) {
            this.els.mobileBtnPlay.onclick = () => this.togglePlay();
        }
        const mobilePrev = document.getElementById('mobile-btn-prev');
        const mobileNext = document.getElementById('mobile-btn-next');
        if (mobilePrev) mobilePrev.onclick = () => this.prev();
        if (mobileNext) mobileNext.onclick = () => this.next();
        if (this.els.btnCloseLyrics) this.els.btnCloseLyrics.onclick = () => this.closeMobileLyrics();
        
        // 进度条
        if (this.els.progressBar) {
            this.els.progressBar.onclick = e => this.seekTo(e);
            this.els.progressBar.onmousedown = () => this.startDrag();
        }
        
        // 音量
        if (this.els.volumeSlider) {
            this.els.volumeSlider.oninput = e => this.setVolume(e.target.value);
        }
        
        // 音量按钮点击切换滑块（移动端）
        if (this.els.btnVolume) {
            this.els.btnVolume.onclick = e => {
                e.stopPropagation();
                const volumeControl = document.getElementById('volume-control');
                if (volumeControl) {
                    volumeControl.classList.toggle('active');
                }
            };
        }
        
        // 点击外部关闭音量滑块
        document.addEventListener('click', e => {
            const volumeControl = document.getElementById('volume-control');
            if (volumeControl && !volumeControl.contains(e.target)) {
                volumeControl.classList.remove('active');
            }
            // 同时关闭音效弹窗
            const effectControl = document.getElementById('effect-control');
            if (effectControl && !effectControl.contains(e.target)) {
                effectControl.classList.remove('active');
            }
        });
        
        // 音效按钮：点击切换弹窗
        if (this.els.btnEffect) {
            this.els.btnEffect.onclick = e => {
                e.stopPropagation();
                const effectControl = document.getElementById('effect-control');
                if (effectControl) {
                    effectControl.classList.toggle('active');
                }
            };
        }
        
        // 音效选项点击
        if (this.els.effectItems) {
            this.els.effectItems.forEach(item => {
                item.onclick = e => {
                    e.stopPropagation();
                    const effect = item.dataset.effect;
                    this.applyEffect(effect);
                    // 更新选中状态
                    this.els.effectItems.forEach(el => el.classList.toggle('active', el === item));
                    // 移动端体验：选择后关闭弹窗
                    const effectControl = document.getElementById('effect-control');
                    if (effectControl && window.innerWidth <= 768) {
                        effectControl.classList.remove('active');
                    }
                };
            });
        }
        
        // 进度条滑块拖动
        if (this.els.progressSlider) {
            this.els.progressSlider.oninput = e => {
                const percent = parseFloat(e.target.value);
                const duration = this.els.audio.duration;
                if (isFinite(duration) && duration > 0) {
                    this.els.audio.currentTime = (percent / 100) * duration;
                }
            };
        }
        
        // 面板切换
        if (this.els.panelTabs) {
            this.els.panelTabs.forEach(tab => {
                if (tab.dataset.panel) {
                    tab.onclick = () => this.switchPanel(tab.dataset.panel);
                }
            });
        }
        

        
        // 移动端导航
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => this.switchMobileView(btn.dataset.view);
        });
        
        // 音频事件
        if (this.els.audio) {
            this.els.audio.ontimeupdate = () => this.updateProgress();
            this.els.audio.onprogress = () => this.updateBuffer();
            this.els.audio.onended = () => this.handleEnded();
            this.els.audio.onplay = () => this.onPlayStateChange(true);
            this.els.audio.onpause = () => this.onPlayStateChange(false);
            this.els.audio.onerror = e => this.handleError(e);
            // 音频成功加载后重置连续错误计数（说明当前轨道可正常播放）
            this.els.audio.onloadeddata = () => {
                this._consecutiveErrors = 0;
            };
        }
        
        // 搜索功能
        if (this.els.queueSearchInput) {
            this.els.queueSearchInput.oninput = e => this.filterQueue(e.target.value);
        }
        
        // 移动端列表搜索
        if (this.els.mobileQueueSearchInput) {
            this.els.mobileQueueSearchInput.oninput = e => this.filterMobileQueue(e.target.value);
        }
        
        // 关闭移动端列表
        if (this.els.btnCloseQueue) {
            this.els.btnCloseQueue.onclick = () => this.closeMobileQueue();
        }
        
        // 在线搜索（桌面端）
        if (this.els.searchInput) {
            this.els.searchInput.onkeydown = e => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) this.searchOnline(query);
                }
            };
        }
        
        // 在线搜索（移动端）
        if (this.els.mobileSearchInput) {
            this.els.mobileSearchInput.onkeydown = e => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) this.searchOnline(query, true);
                }
            };
        }
        if (this.els.btnCloseSearch) {
            this.els.btnCloseSearch.onclick = () => this.closeMobileSearch();
        }
        
        // 歌词滚动检测
        if (this.els.lyricsScroll) {
            this.els.lyricsScroll.addEventListener('wheel', () => this.pauseLyricScroll(), { passive: true });
            this.els.lyricsScroll.addEventListener('touchmove', () => this.pauseLyricScroll(true), { passive: true });
        }
        
        // 键盘快捷键
        document.addEventListener('keydown', e => this.handleKeyboard(e));
    }
    
    initVolume() {
        const saved = this._loadVolume();
        const volume = (saved !== null && saved >= 0 && saved <= 1) ? saved : 0.8;
        this.els.audio.volume = volume;
        this.els.volumeSlider.value = volume * 100;
        this.updateVolumeIcon(volume);
    }
    
    // ========== 数据加载 ==========
    
    async loadPlaylist() {
        const localData = typeof localMusic !== 'undefined' ? localMusic : [];
        // 本地音乐倒序：config.js 中最后面的歌曲在播放列表中排在最前
        // 这样网易云歌单在前，本地音乐（倒序）在后
        const reversedLocal = [...localData].reverse();
        
        // 重试 3 次
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const url = this.apiUrl
                    .replace(':server', typeof userServer !== 'undefined' ? userServer : 'netease')
                    .replace(':type', typeof userType !== 'undefined' ? userType : 'playlist')
                    .replace(':id', typeof userId !== 'undefined' ? userId : '12675886878')
                    .replace(':r', Math.random());
                
                console.log(`API 请求 (第${attempt}次):`, url);
                
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timer);
                
                if (response.ok) {
                    const onlineData = await response.json();
                    if (Array.isArray(onlineData) && onlineData.length > 0) {
                        console.log('API 成功，获取到', onlineData.length, '首歌曲');
                        // 网易云歌单在前 + 本地音乐（倒序）在后
                        this.playlist = [...onlineData, ...reversedLocal];
                        return;
                    }
                }
                console.warn(`API 第${attempt}次返回无效数据`);
            } catch (error) {
                console.warn(`API 请求失败 (第${attempt}次):`, error.message);
            }
            
            // 未到最后一次就等一会再重试
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }
        
        // 3 次都失败，仅使用本地音乐（保持倒序）
        console.log('API 3 次均失败，仅使用本地音乐');
        this.playlist = reversedLocal;
    }
    
    async loadTrack(index, autoPlay = false) {
        // 严格校验索引：过滤 undefined/NaN 等非法值（_getLeastPlayedIndex 在极端情况下可能返回 -1/undefined）
        if (!Number.isInteger(index) || index < 0 || index >= this.playlist.length) return;

        // 取消尚未触发的错误自动跳过（避免与新加载产生竞态）
        if (this._errorSkipTimer) {
            clearTimeout(this._errorSkipTimer);
            this._errorSkipTimer = null;
        }

        // 加载令牌：本次加载的标识，用于在 await 后判断是否已被更新的加载取代
        const loadId = ++this._loadId;
        this.currentIndex = index;
        const track = this.playlist[index];

        // 更新歌曲信息
        this.els.trackTitle.textContent = track.name || track.title || '未知歌曲';
        this.els.trackArtist.textContent = track.artist || track.author || '未知歌手';

        // 移动端歌曲信息
        this.els.mobileTrackTitle.textContent = track.name || track.title || '未知歌曲';
        this.els.mobileTrackArtist.textContent = track.artist || track.author || '未知歌手';

        // 加载封面
        const coverUrl = await this.getHighQualityCover(track.pic || track.cover);
        // 若期间已切到其它歌曲，丢弃本次过期的封面结果
        if (loadId !== this._loadId) return;
        this.els.coverArt.src = coverUrl;
        this.els.bgCover.style.backgroundImage = `url(${coverUrl})`;

        // 缓存封面 URL 供列表缩略图使用
        this.coverUrlCache.set(this.currentIndex, coverUrl);

        // 更新当前播放项的缩略图
        const currentCoverImg = document.querySelector(`.queue-item[data-idx="${this.currentIndex}"] .queue-item-cover`);
        if (currentCoverImg) {
            currentCoverImg.src = coverUrl;
            currentCoverImg.style.opacity = '1';
            currentCoverImg.style.display = '';
        }

        // 记录播放次数（平均随机用）
        this.playCount[index] = (this.playCount[index] || 0) + 1;
        this._savePlayCount();

        // 播放状态
        this.els.coverContainer.classList.toggle('playing', false);

        // 加载音频
        // 音效已初始化时，非 CORS 源需通过代理获取 blob URL（否则会被静音）
        if (this.sourceNode) {
            try {
                const audioUrl = await this._getEffectAudioUrl(track);
                if (loadId !== this._loadId) return;
                this.els.audio.src = audioUrl;
            } catch (e) {
                console.error('音效模式加载音频失败，回退原始URL:', e);
                this.showToast(e.message || '音效加载失败，回退原始URL', 'info', 2500);
                if (loadId !== this._loadId) return;
                this.els.audio.src = track.url;
            }
        } else {
            this.els.audio.src = track.url;
        }

        // 加载歌词
        await this.loadLyrics(track.lrc);
        if (loadId !== this._loadId) return;

        // 更新列表高亮
        this.updateQueueHighlight();

        // 更新 MediaSession
        this.updateMediaSession(track, coverUrl);

        // 重置进度
        this.els.progressFill.style.width = '0%';
        if (this.els.progressSlider) {
            this.els.progressSlider.value = 0;
        }
        this.els.timeCurrent.textContent = '0:00';
        this.els.timeTotal.textContent = '0:00';

        // 重置歌词滚动
        this.currentLyricIndex = -1;
        this.els.lyricsScroll.scrollTop = 0;

        if (autoPlay) {
            this.play();
        }
    }
    
    // 批量解析封面 URL（控制并发数=5，避免 API 限流）
    async resolveAllCovers() {
        const CONCURRENCY = 5;
        for (let i = 0; i < this.playlist.length; i += CONCURRENCY) {
            const batch = this.playlist.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map((track, batchIdx) => {
                const idx = i + batchIdx;
                return this.resolveCover(track, idx);
            }));
        }
        console.log('封面解析完成，缓存', this.coverUrlCache.size, '条');
    }
    
    async resolveCover(track, idx) {
        const picUrl = track.pic || track.cover || '';
        if (!picUrl) return;
        
        // 检测是否为代理 URL（自建 Meting API 或第三方），需要预解析真实地址
        const isProxy = picUrl.includes('type=pic') || picUrl.includes('?server=') || picUrl.includes('?source=') || picUrl.includes('/meting/') || picUrl.includes('/api.php');
        const isNeteaseCDN = picUrl.includes('music.126.net') || picUrl.includes('.126.net');
        
        let finalUrl = picUrl;
        if (isProxy || isNeteaseCDN) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
                const resp = await fetch(picUrl, {
                    redirect: 'follow',
                    referrerPolicy: 'no-referrer',
                    signal: controller.signal
                });
                clearTimeout(timer);
                finalUrl = resp.url || picUrl;
            } catch (e) {
                // 解析失败，保留原始 URL —— <img> 上的 referrerpolicy="no-referrer" 作为兜底
            }
        }
        
        this.coverUrlCache.set(idx, finalUrl);
        
        // 实时更新已渲染的列表缩略图（如果 DOM 已存在）
        const coverImg = document.querySelector(`.queue-item[data-idx="${idx}"] .queue-item-cover`);
        if (coverImg) {
            coverImg.src = finalUrl;
            coverImg.style.opacity = '1';
            coverImg.style.display = '';
        }
    }
    
    async getHighQualityCover(url) {
        if (!url || url.includes('cover.webp')) return './img/cover.webp';
        
        // 检查缓存
        if (this.coverCache.has(url)) {
            return this.coverCache.get(url);
        }
        
        let finalUrl = url;
        
        // 如果是 Meting API 代理 URL，获取真实 URL
        if (url.includes('type=pic') || url.includes('?server=') || url.includes('?source=') || url.includes('/meting/') || url.includes('/api.php')) {
            try {
                // 用 AbortController 设置 5 秒超时
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 5000);
                const resp = await fetch(url, { 
                    redirect: 'follow',
                    signal: controller.signal,
                    referrerPolicy: 'no-referrer'
                });
                clearTimeout(timer);
                finalUrl = resp.url || url;
            } catch (e) {
                console.warn('获取封面URL失败，使用原始URL:', e.message);
                finalUrl = url;
            }
        }
        
        // 替换网易云图片参数为高清
        if (/param=\d+[xy]\d+/i.test(finalUrl)) {
            finalUrl = finalUrl.replace(/param=\d+[xy]\d+/gi, 'param=800y800');
        } else if (/music\.126\.net|p\d+\.music\.126\.net|\.126\.net/.test(finalUrl)) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'param=800y800';
        }
        
        this.coverCache.set(url, finalUrl);
        return finalUrl;
    }
    
    // ========== 歌词处理 ==========
    
    async loadLyrics(source) {
        // 歌词加载令牌：丢弃过期的异步歌词结果，避免快速切歌时旧歌词覆盖新歌词
        const loadId = ++this._lyricLoadId;
        this.lyrics = [];
        this.currentLyricIndex = -1;

        if (!source) {
            this.renderLyrics([{ time: 0, text: '暂无歌词', isPlaceholder: true }]);
            return;
        }

        try {
            let lrcText = '';
            if (source.startsWith('http')) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 6000);
                const response = await fetch(source, { signal: controller.signal });
                clearTimeout(timer);
                if (loadId !== this._lyricLoadId) return; // 已被新歌词加载取代
                lrcText = await response.text();
            } else {
                lrcText = source;
            }

            this.parseLyrics(lrcText);
            if (loadId !== this._lyricLoadId) return;
            this.renderLyrics(this.lyrics);
        } catch (error) {
            if (loadId !== this._lyricLoadId) return;
            console.error('加载歌词失败:', error);
            this.renderLyrics([{ time: 0, text: '歌词加载失败', isPlaceholder: true }]);
        }
    }
    
    parseLyrics(text) {
        const lines = text.split('\n');
        const timePattern = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
        
        for (const line of lines) {
            const times = [];
            let match;
            timePattern.lastIndex = 0;
            
            while ((match = timePattern.exec(line)) !== null) {
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const ms = parseInt(match[3]);
                const time = min * 60 + sec + (ms > 99 ? ms / 1000 : ms / 100);
                times.push(time);
            }
            
            if (times.length === 0) continue;
            
            const content = line.slice(line.lastIndexOf(']') + 1).trim();
            if (!content) continue;
            
            // 解析逐字标签 <mm:ss.ms>
            const wordPattern = /<(\d{1,2}):(\d{2})\.(\d{2,3})>/g;
            const words = [];
            let wordMatch;
            
            while ((wordMatch = wordPattern.exec(content)) !== null) {
                const wMin = parseInt(wordMatch[1]);
                const wSec = parseInt(wordMatch[2]);
                const wMs = parseInt(wordMatch[3]);
                const wTime = wMin * 60 + wSec + (wMs > 99 ? wMs / 1000 : wMs / 100);
                words.push({ time: wTime });
            }
            
            // 如果有逐字标签，分配文字
            if (words.length > 1) {
                const pureText = content.replace(/<\d{1,2}:\d{2}\.\d{2,3}>/g, '');
                let charIdx = 0;
                
                for (let i = 0; i < words.length; i++) {
                    if (i < words.length - 1) {
                        words[i].duration = words[i + 1].time - words[i].time;
                    } else {
                        words[i].duration = 500;
                    }
                    
                    if (charIdx < pureText.length) {
                        words[i].text = pureText[charIdx];
                        charIdx++;
                    }
                }
                
                // 创建逐字歌词
                for (const word of words) {
                    if (word.text) {
                        this.lyrics.push({
                            time: word.time,
                            text: word.text,
                            duration: word.duration,
                            isWord: true
                        });
                    }
                }
            } else {
                // 普通歌词
                for (const time of times) {
                    this.lyrics.push({ time, text: content });
                }
            }
        }
        
        // 排序去重
        this.lyrics.sort((a, b) => a.time - b.time);
        this.lyrics = this.lyrics.filter((item, idx, arr) => 
            idx === 0 || item.time !== arr[idx - 1].time || item.text !== arr[idx - 1].text
        );
    }
    
    renderLyrics(lyrics) {
        const html = lyrics.map((item, idx) => {
            const cls = item.isPlaceholder ? 'lyric-placeholder' : 'lyric-line';
            const wordCls = item.isWord ? ' word-by-word' : '';
            return `<p class="${cls}${wordCls}" data-time="${item.time}" data-idx="${idx}">${this.escapeHtml(item.text)}</p>`;
        }).join('');
        
        this.els.lyricsContainer.innerHTML = html;
        this.els.mobileLyricsContainer.innerHTML = html;

        // 绑定点击事件
        // 桌面端歌词点击
        this.els.lyricsContainer.querySelectorAll('.lyric-line').forEach(el => {
            el.onclick = () => this.seekToLyric(parseFloat(el.dataset.time));
        });

        // 移动端歌词点击（#mobile-lyrics-container 位于 #mobile-lyrics-scroll 内，绑定一次即可，避免重复触发）
        this.els.mobileLyricsContainer.querySelectorAll('.lyric-line').forEach(el => {
            el.onclick = () => this.seekToLyric(parseFloat(el.dataset.time));
        });
    }
    
    updateLyrics(time) {
        if (this.lyrics.length === 0 || this.isLyricScrolling) return;

        // 二分查找当前歌词行
        let lo = 0, hi = this.lyrics.length - 1, newIndex = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.lyrics[mid].time <= time) {
                newIndex = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        if (newIndex === this.currentLyricIndex) return;
        const prevIndex = this.currentLyricIndex;
        this.currentLyricIndex = newIndex;

        // 桌面端
        const desktopLines = this.els.lyricsContainer.querySelectorAll('.lyric-line');
        if (desktopLines[newIndex]) desktopLines[newIndex].classList.add('active');
        if (prevIndex >= 0 && desktopLines[prevIndex]) desktopLines[prevIndex].classList.remove('active');

        // 桌面端滚动
        if (desktopLines[newIndex] && this.els.lyricsScroll) {
            desktopLines[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // 移动端（仅在可见时更新 DOM）
        const mobileLyricsView = this.els.mobileLyricsView;
        if (mobileLyricsView && mobileLyricsView.classList.contains('active')) {
            const mobileLines = this.els.mobileLyricsContainer.querySelectorAll('.lyric-line');
            if (mobileLines[newIndex]) mobileLines[newIndex].classList.add('active');
            if (prevIndex >= 0 && mobileLines[prevIndex]) mobileLines[prevIndex].classList.remove('active');

            const mobileActiveLine = mobileLines[newIndex];
            const mobileScroll = document.getElementById('mobile-lyrics-scroll');
            if (mobileActiveLine && mobileScroll) {
                mobileActiveLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
    
    pauseLyricScroll(isTouch = false) {
        this.isLyricScrolling = true;
        clearTimeout(this.lyricScrollTimer);
        
        this.lyricScrollTimer = setTimeout(() => {
            this.isLyricScrolling = false;
        }, isTouch ? 2500 : 2000);
    }
    
    seekToLyric(time) {
        this.els.audio.currentTime = time;
        this.isLyricScrolling = false;
        clearTimeout(this.lyricScrollTimer);
    }
    
    // ========== 播放控制 ==========
    
    // 读取播放次数（localStorage）
    _loadPlayCount() {
        try {
            return JSON.parse(localStorage.getItem('mq_play_count') || '{}');
        } catch { return {}; }
    }
    
    // 保存播放次数（自动清理：超过 500 条时清除旧数据）
    _savePlayCount() {
        const keys = Object.keys(this.playCount);
        if (keys.length > 500) {
            // 保留最近 200 条
            const recent = keys.slice(-200);
            const cleaned = {};
            recent.forEach(k => { cleaned[k] = this.playCount[k]; });
            this.playCount = cleaned;
        }
        localStorage.setItem('mq_play_count', JSON.stringify(this.playCount));
    }
    
    // 获取当前播放次数最少的歌曲索引（平均随机）
    _getLeastPlayedIndex(excludeIdx) {
        if (this.playlist.length === 0) return -1;
        if (this.playlist.length === 1) return 0;

        const counts = this.playlist.map((_, i) => this.playCount[i] || 0);
        const minCount = Math.min(...counts);
        // 找出所有播放次数为最小值的索引（排除当前正在播放的）
        let candidates = counts
            .map((c, i) => ({ count: c, idx: i }))
            .filter(({ idx }) => idx !== excludeIdx)
            .filter(({ count }) => count === minCount)
            .map(({ idx }) => idx);

        // 若最小播放次数的唯一拥有者就是被排除项，则从所有非排除项中随机选
        if (candidates.length === 0) {
            candidates = counts
                .map((_, i) => i)
                .filter(i => i !== excludeIdx);
        }

        // 兜底：仍无候选（理论上不会到达），返回一个合法索引
        if (candidates.length === 0) {
            return (typeof excludeIdx === 'number' && excludeIdx >= 0 && excludeIdx < this.playlist.length)
                ? excludeIdx
                : 0;
        }
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // 限制播放路径长度，避免长时间使用后无限增长（仅裁剪已播放过的历史，不影响当前位置）
    _capPlayPath() {
        const MAX = 200;
        if (this.playPath.length <= MAX) return;
        const drop = Math.min(this.playPath.length - MAX, this.pathPos);
        if (drop > 0) {
            this.playPath.splice(0, drop);
            this.pathPos -= drop;
        }
        if (this.playPath.length > MAX) {
            this.playPath.length = MAX;
        }
    }

    play() {
        this.els.audio.play().catch(e => console.warn('播放失败:', e));
    }
    
    pause() {
        this.els.audio.pause();
    }
    
    togglePlay() {
        this.isPlaying ? this.pause() : this.play();
    }
    
    prev() {
        // 播放路径上回退一步
        if (this.pathPos > 0) {
            this.pathPos--;
            const index = this.playPath[this.pathPos];
            this.loadTrack(index, this.isPlaying);
        } else if (this.playMode === 'shuffle') {
            // 路径开头：重新随机一首
            const index = this._getLeastPlayedIndex(this.currentIndex);
            this.playPath.unshift(index);
            this.pathPos = 0;
            this._capPlayPath();
            this.loadTrack(index, this.isPlaying);
        } else {
            // 顺序/单曲模式：回到上一曲
            let index = this.currentIndex - 1;
            if (index < 0) index = this.playlist.length - 1;
            this.loadTrack(index, this.isPlaying);
        }
    }
    
    next(forceAutoplay = false) {
        let index;
        if (this.playMode === 'shuffle') {
            // 如果路径上还有后续，就走确定路线
            if (this.pathPos < this.playPath.length - 1) {
                this.pathPos++;
                index = this.playPath[this.pathPos];
            } else {
                // 新歌：追加到路径末尾
                index = this._getLeastPlayedIndex(this.currentIndex);
                this.playPath.push(index);
                this.pathPos++;
                this._capPlayPath();
            }
        } else {
            index = this.currentIndex + 1;
            if (index >= this.playlist.length) index = 0;
        }
        this.loadTrack(index, forceAutoplay || this.isPlaying);
    }
    
    // 统一的播放模式切换（顺序 -> 随机 -> 单曲循环 -> 顺序）
    togglePlayMode() {
        const modes = ['loop', 'shuffle', 'repeat-one'];
        const icons = ['fa-arrow-right-arrow-left', 'fa-shuffle', 'fa-repeat'];
        const titles = ['顺序播放', '随机播放', '单曲循环'];
        
        const idx = modes.indexOf(this.playMode);
        this.playMode = modes[(idx + 1) % modes.length];
        
        // 更新按钮状态
        if (this.els.btnMode) {
            this.els.btnMode.classList.toggle('active', this.playMode !== 'loop');
            const icon = this.els.btnMode.querySelector('i');
            if (icon) {
                icon.className = 'fas ' + icons[modes.indexOf(this.playMode)];
            }
            this.els.btnMode.title = titles[modes.indexOf(this.playMode)];
        }
    }
    
    // 兼容旧方法
    toggleShuffle() {
        this.togglePlayMode();
    }
    
    toggleRepeat() {
        this.togglePlayMode();
    }
    
    handleEnded() {
        if (this.playMode === 'repeat-one') {
            this.els.audio.currentTime = 0;
            this.play();
        } else {
            let index;
            if (this.playMode === 'shuffle') {
                if (this.pathPos < this.playPath.length - 1) {
                    this.pathPos++;
                    index = this.playPath[this.pathPos];
                } else {
                    index = this._getLeastPlayedIndex(this.currentIndex);
                    this.playPath.push(index);
                    this.pathPos++;
                    this._capPlayPath();
                }
            } else {
                index = this.currentIndex + 1;
                if (index >= this.playlist.length) index = 0;
            }
            this.loadTrack(index, true);
        }
    }
    
    onPlayStateChange(playing) {
        this.isPlaying = playing;
        
        // 更新按钮图标
        const icon = playing ? 'fa-pause' : 'fa-play';
        this.els.btnPlay.querySelector('i').className = 'fas ' + icon;
        this.els.mobileBtnPlay.querySelector('i').className = 'fas ' + icon;
        
        // 封面动画
        this.els.coverContainer.classList.toggle('playing', playing);
    }
    
    // 按钮点击兜底机制：2秒后自动移除 active 状态
    setupButtonFallback() {
        const buttons = document.querySelectorAll('.control-btn, .nav-btn, .panel-tab');
        
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                // 添加临时 active 状态
                btn.classList.add('btn-temp-active');
                
                // 清除之前的定时器
                if (btn._fallbackTimer) {
                    clearTimeout(btn._fallbackTimer);
                }
                
                // 2秒后移除
                btn._fallbackTimer = setTimeout(() => {
                    btn.classList.remove('btn-temp-active');
                }, 2000);
            });
        });
        
        // 点击空白处移除所有临时 active
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.control-btn, .nav-btn, .panel-tab')) {
                document.querySelectorAll('.btn-temp-active').forEach(btn => {
                    btn.classList.remove('btn-temp-active');
                });
            }
        });
    }
    
    // ========== 进度控制 ==========
    
    updateProgress() {
        const { currentTime, duration } = this.els.audio;
        if (!isFinite(duration) || duration <= 0) return;
        
        const percent = (currentTime / duration) * 100;
        this.els.progressFill.style.width = percent + '%';
        
        // 同步滑块值（非拖动时）
        if (this.els.progressSlider && document.activeElement !== this.els.progressSlider) {
            this.els.progressSlider.value = percent;
        }
        
        this.els.timeCurrent.textContent = this.formatTime(currentTime);
        this.els.timeTotal.textContent = this.formatTime(duration);
        
        this.updateLyrics(currentTime);
    }
    
    updateBuffer() {
        const audio = this.els.audio;
        if (!audio.buffered || audio.buffered.length === 0) return;
        
        const duration = audio.duration;
        if (!isFinite(duration) || duration <= 0) return;
        
        // 获取已缓冲的最大时间
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const percent = (bufferedEnd / duration) * 100;
        
        if (this.els.progressBuffer) {
            this.els.progressBuffer.style.width = percent + '%';
        }
    }
    
    seekTo(e) {
        const duration = this.els.audio.duration;
        if (!isFinite(duration) || duration <= 0) return;
        const rect = this.els.progressBar.getBoundingClientRect();
        if (rect.width <= 0) return;
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.els.audio.currentTime = percent * duration;
    }
    
    startDrag() {
        const onMove = e => {
            const duration = this.els.audio.duration;
            if (!isFinite(duration) || duration <= 0) return;
            const rect = this.els.progressBar.getBoundingClientRect();
            if (rect.width <= 0) return;
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.els.audio.currentTime = percent * duration;
        };
        
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
    
    // ========== 音量控制 ==========
    
    setVolume(value) {
        const volume = value / 100;
        this.els.audio.volume = volume;
        this.updateVolumeIcon(volume);
        this._saveVolume(volume);
    }
    
    updateVolumeIcon(volume) {
        const volumeIcon = document.getElementById('volume-icon');
        if (!volumeIcon) return;
        
        // 移除所有状态类
        volumeIcon.classList.remove('muted');
        volumeIcon.removeAttribute('data-level');
        
        if (volume === 0) {
            // 静音状态
            volumeIcon.classList.add('muted');
        } else if (volume <= 0.33) {
            // 低音量：只显示第一层声波
            volumeIcon.setAttribute('data-level', '1');
        } else if (volume <= 0.66) {
            // 中音量：显示第一、二层声波
            volumeIcon.setAttribute('data-level', '2');
        } else {
            // 高音量：显示所有声波
            volumeIcon.setAttribute('data-level', '3');
        }
        
        // 同步滑块值
        if (this.els.volumeSlider) {
            this.els.volumeSlider.value = volume * 100;
        }
    }
    
    // ========== 音效处理（Web Audio API） ==========
    
    // 懒初始化音频图：仅在用户首次启用音效时调用，避免默认情况下设置 crossorigin 影响播放
    async _ensureAudioGraph() {
        if (this.sourceNode) return true; // 已初始化
        if (this._effectInitInProgress) return false;
        this._effectInitInProgress = true;

        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) {
                this.showToast('当前浏览器不支持音效功能', 'error');
                this._effectInitInProgress = false;
                return false;
            }

            // 预检：当前歌曲源是否支持 CORS
            // 一旦调用 createMediaElementSource，跨域且无CORS的音频会被静音且无法恢复，故必须先检查
            const track = this.playlist[this.currentIndex];
            if (!track || !track.url) {
                this.showToast('无法获取当前歌曲信息', 'error');
                this.audioEffect = 'none';
                this._effectInitInProgress = false;
                return false;
            }

            const corsOk = track.url.startsWith('data:') || track.url.startsWith('blob:')
                ? true : await this._checkCorsSupport(track.url);

            // 设置 crossorigin，使跨域音频能被 Web Audio API 处理（blob URL 同源不受影响）
            this.els.audio.crossOrigin = 'anonymous';

            // 若不支持 CORS，通过代理获取音频为 blob URL（同源，绕过 CORS 限制）
            if (!corsOk) {
                if (!this.corsProxy) {
                    this.showToast('当前歌曲源不支持 CORS 且未配置代理，无法启用音效', 'error', 3500);
                    this.audioEffect = 'none';
                    this._effectInitInProgress = false;
                    return false;
                }
                this.showToast('正在通过代理加载音频以启用音效...', 'info', 2500);
                try {
                    const blobUrl = await this._getProxiedBlobUrl(track.url);
                    track._effectUrl = blobUrl;
                } catch (e) {
                    console.error('代理加载音频失败:', e);
                    this.showToast('代理加载音频失败，无法启用音效', 'error', 3500);
                    this.audioEffect = 'none';
                    this._effectInitInProgress = false;
                    return false;
                }
            } else {
                track._effectUrl = track.url;
            }

            this.audioContext = new AC();
            this.sourceNode = this.audioContext.createMediaElementSource(this.els.audio);
            // 默认直通：source -> destination
            this.sourceNode.connect(this.audioContext.destination);

            // 用户手势期间恢复挂起的 AudioContext
            if (this.audioContext.state === 'suspended') {
                try { await this.audioContext.resume(); } catch (e) {}
            }

            // crossorigin 仅对后续加载生效，需要重新加载当前轨道以使现有音频可被处理
            await this._reloadCurrentForAudioGraph();
        } catch (e) {
            console.error('音效初始化失败:', e);
            this.audioEffect = 'none';
            this._effectInitInProgress = false;
            return false;
        }

        this._effectInitInProgress = false;
        return true;
    }

    // 检查 URL 是否支持 CORS（不抛错即说明 CORS 头已发送，可被 Web Audio 处理）
    async _checkCorsSupport(url) {
        if (!url || url.startsWith('data:') || url.startsWith('blob:')) return true;
        try {
            const u = new URL(url, location.href);
            if (u.origin === location.origin) return true; // 同源
        } catch (e) { /* 跨域继续检查 */ }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            await fetch(url, { mode: 'cors', method: 'HEAD', signal: controller.signal });
            clearTimeout(timer);
            return true;
        } catch (e) {
            return false;
        }
    }

    // 重新加载当前轨道（保持播放位置与播放状态），用于 crossorigin 生效
    async _reloadCurrentForAudioGraph() {
        const track = this.playlist[this.currentIndex];
        if (!track) return;

        const expectedIndex = this.currentIndex;
        const wasPlaying = this.isPlaying;
        const prevTime = this.els.audio.currentTime || 0;

        this.els.audio.src = track._effectUrl || track.url;
        this.els.audio.load();

        // 等待元数据加载（最长 3 秒）
        await new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this.els.audio.removeEventListener('loadedmetadata', finish);
                resolve();
            };
            this.els.audio.addEventListener('loadedmetadata', finish);
            setTimeout(finish, 3000);
        });

        // 若期间因错误自动跳过等导致 currentIndex 改变，则放弃恢复播放位置
        if (this.currentIndex !== expectedIndex) return;

        if (isFinite(prevTime) && prevTime > 0) {
            try { this.els.audio.currentTime = prevTime; } catch (e) {}
        }
        if (wasPlaying) {
            this.play();
        }
    }

    // 应用音效（外部入口）
    async applyEffect(effect) {
        this.audioEffect = effect;
        const applyId = ++this._effectApplyId;

        // 关闭音效：若已初始化音频图，则切回直通
        if (effect === 'none') {
            if (this.sourceNode) {
                this._disconnectEffectChain();
                try { this.sourceNode.connect(this.audioContext.destination); } catch (e) {}
            }
            // 更新按钮高亮
            this._updateEffectButton();
            this.showToast('音效已关闭', 'info', 1200);
            return;
        }

        // 启用音效：确保音频图已初始化，再挂载效果链
        const ok = await this._ensureAudioGraph();
        if (applyId !== this._effectApplyId) return; // 已被更新的选择取代
        if (!ok) return;
        this._applyEffectChain(effect);
        this._updateEffectButton();
        const labels = {
            '3d-surround': '3D环绕',
            'immersive': '沉浸',
            'live': '现场感',
            'echo': '迷幻',
            'pop': '流行',
            'bass-boost': '重低音'
        };
        this.showToast(`音效: ${labels[effect] || effect}`, 'info', 1200);
    }

    // 更新音效按钮的 active 状态
    _updateEffectButton() {
        if (this.els.btnEffect) {
            this.els.btnEffect.classList.toggle('active', this.audioEffect !== 'none');
        }
    }

    // 构建效果链（在 _ensureAudioGraph 之后调用）
    _applyEffectChain(effect) {
        if (!this.audioContext || !this.sourceNode) return;
        this._disconnectEffectChain();

        const ctx = this.audioContext;
        const source = this.sourceNode;
        const dest = ctx.destination;

        if (effect === '3d-surround') {
            // 3D环绕：立体声 LFO 摇摆 + 空间混响
            const panner = ctx.createStereoPanner();
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.frequency.value = 0.25;   // 慢速摇摆周期
            lfoGain.gain.value = 0.85;    // 摇摆深度
            lfo.connect(lfoGain);
            lfoGain.connect(panner.pan);
            lfo.start();

            const reverb = this._createReverb(ctx, 2.8, 2.5);
            const reverbGain = ctx.createGain();
            reverbGain.gain.value = 0.35;
            const dryGain = ctx.createGain();
            dryGain.gain.value = 0.85;

            source.connect(panner);
            panner.connect(dryGain);
            dryGain.connect(dest);
            panner.connect(reverb);
            reverb.connect(reverbGain);
            reverbGain.connect(dest);

            this._effectNodes = [panner, lfo, lfoGain, reverb, reverbGain, dryGain];
        } else if (effect === 'immersive') {
            // 沉浸：较重的空间混响
            const reverb = this._createReverb(ctx, 3.6, 2.2);
            const reverbGain = ctx.createGain();
            reverbGain.gain.value = 0.6;
            const dryGain = ctx.createGain();
            dryGain.gain.value = 0.7;

            source.connect(dryGain);
            dryGain.connect(dest);
            source.connect(reverb);
            reverb.connect(reverbGain);
            reverbGain.connect(dest);

            this._effectNodes = [reverb, reverbGain, dryGain];
        } else if (effect === 'live') {
            // 现场感：轻度厅堂混响
            const reverb = this._createReverb(ctx, 1.8, 2.0);
            const reverbGain = ctx.createGain();
            reverbGain.gain.value = 0.25;
            const dryGain = ctx.createGain();
            dryGain.gain.value = 0.9;

            source.connect(dryGain);
            dryGain.connect(dest);
            source.connect(reverb);
            reverb.connect(reverbGain);
            reverbGain.connect(dest);

            this._effectNodes = [reverb, reverbGain, dryGain];
        } else if (effect === 'echo') {
            // 迷幻：延迟回声
            const delay = ctx.createDelay(2);
            delay.delayTime.value = 0.25;
            const feedback = ctx.createGain();
            feedback.gain.value = 0.4;
            const wetGain = ctx.createGain();
            wetGain.gain.value = 0.35;
            const dryGain = ctx.createGain();
            dryGain.gain.value = 0.8;

            source.connect(dryGain);
            dryGain.connect(dest);
            source.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            delay.connect(wetGain);
            wetGain.connect(dest);

            this._effectNodes = [delay, feedback, wetGain, dryGain];
        } else if (effect === 'pop') {
            // 流行：三段 EQ
            const bass = ctx.createBiquadFilter();
            bass.type = 'lowshelf';
            bass.frequency.value = 200;
            bass.gain.value = 3;

            const mid = ctx.createBiquadFilter();
            mid.type = 'peaking';
            mid.frequency.value = 1000;
            mid.Q.value = 1;
            mid.gain.value = -2;

            const treble = ctx.createBiquadFilter();
            treble.type = 'highshelf';
            treble.frequency.value = 3500;
            treble.gain.value = 4;

            source.connect(bass);
            bass.connect(mid);
            mid.connect(treble);
            treble.connect(dest);

            this._effectNodes = [bass, mid, treble];
        } else if (effect === 'bass-boost') {
            // 重低音：低频架棚 + 60Hz 峰值
            const bass = ctx.createBiquadFilter();
            bass.type = 'lowshelf';
            bass.frequency.value = 150;
            bass.gain.value = 8;

            const sub = ctx.createBiquadFilter();
            sub.type = 'peaking';
            sub.frequency.value = 60;
            sub.Q.value = 1;
            sub.gain.value = 6;

            source.connect(bass);
            bass.connect(sub);
            sub.connect(dest);

            this._effectNodes = [bass, sub];
        } else {
            // 未知效果：直通，避免源被断开后静音
            try { source.connect(dest); } catch (e) {}
        }
    }

    // 断开当前效果链（含源节点的输出）
    _disconnectEffectChain() {
        this._effectNodes.forEach(node => {
            try { node.disconnect(); } catch (e) {}
            // 停止振荡器（LFO）
            if (node.stop && typeof node.stop === 'function') {
                try { node.stop(); } catch (e) {}
            }
        });
        this._effectNodes = [];
        if (this.sourceNode) {
            try { this.sourceNode.disconnect(); } catch (e) {}
        }
    }

    // 合成混响脉冲响应（噪声衰减）
    _createReverb(ctx, duration, decay) {
        const sampleRate = ctx.sampleRate;
        const length = Math.max(1, Math.floor(sampleRate * duration));
        const impulse = ctx.createBuffer(2, length, sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = impulse.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        const convolver = ctx.createConvolver();
        convolver.buffer = impulse;
        return convolver;
    }

    // 通过 CORS 代理获取音频，返回同源 blob URL（绕过 CORS 限制）
    // 代理格式：https://proxy.646474.xyz/原始URL （直接拼接，不编码）
    // 代理会自动跟随 302 重定向（包括 meting-api → music.163.com → 真实CDN 的多重定向链）
    async _getProxiedBlobUrl(url) {
        if (this._blobUrlCache.has(url)) return this._blobUrlCache.get(url);
        if (!this.corsProxy) throw new Error('未配置 CORS 代理');

        // 代理要求 URL 直接拼接，不进行 encodeURIComponent 编码
        const proxyUrl = this.corsProxy + url;
        const controller = new AbortController();
        // 音频文件可能较大（5-10MB），且代理需跟随多次重定向，给足 60 秒
        const timer = setTimeout(() => controller.abort(), 60000);
        try {
            // redirect: 'follow' 显式让浏览器跟随重定向（默认行为，显式声明更清晰）
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                redirect: 'follow'
            });
            clearTimeout(timer);
            if (!response.ok) throw new Error(`代理返回 ${response.status}`);
            const contentType = response.headers.get('content-type') || '';
            const blob = await response.blob();
            // 校验：必须是音频类型，避免代理返回 HTML 错误页被当成音频
            if (!contentType.startsWith('audio/') && !contentType.startsWith('application/') && !contentType.startsWith('video/')) {
                throw new Error(`代理返回非音频内容: ${contentType}`);
            }
            if (blob.size < 1024) throw new Error(`音频文件过小 (${blob.size} bytes)，可能为错误页`);
            const blobUrl = URL.createObjectURL(blob);
            this._blobUrlCache.set(url, blobUrl);
            return blobUrl;
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }

    // 解析网易云歌曲的真实 CDN URL（备用方案：当代理直接跟随重定向失败时使用）
    // 通过 meting-api 获取播放列表时返回的 url 字段本身就是 meting-api 的重定向 URL，
    // 代理能直接跟随此 URL 的重定向链，故此方法目前作为备用保留
    async _resolveNeteaseRealUrl(url) {
        let songId = null;
        const idMatch = url.match(/[?&]id=(\d+)/);
        if (idMatch) songId = idMatch[1];
        if (!songId) throw new Error('无法从URL提取歌曲ID');

        // 使用代理访问 gdstudio API（该 API 返回 JSON，不重定向）
        const apiUrl = `${MusicPlayer.GD_API}?types=url&source=netease&id=${songId}&br=320`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timer);
            if (!response.ok) throw new Error(`API返回 ${response.status}`);
            const data = await response.json();
            const realUrl = data && data.url;
            if (!realUrl || !realUrl.startsWith('http')) throw new Error('API未返回有效URL');
            return realUrl;
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }

    // 获取音效模式下的有效音频 URL（CORS 源用原始 URL，非 CORS 源用代理 blob URL）
    async _getEffectAudioUrl(track) {
        if (!this.sourceNode) return track.url;
        // 使用缓存的 URL（已处理过 CORS）
        if (track._effectUrl) return track._effectUrl;
        // data:/blob: URL 或同源 URL 无需 CORS 检查
        if (!track.url || track.url.startsWith('data:') || track.url.startsWith('blob:')) {
            track._effectUrl = track.url;
            return track.url;
        }
        // 检查 CORS 支持
        if (await this._checkCorsSupport(track.url)) {
            track._effectUrl = track.url;
            return track.url;
        }
        // 不支持 CORS：通过代理获取 blob URL
        try {
            const blobUrl = await this._getProxiedBlobUrl(track.url);
            track._effectUrl = blobUrl;
            return blobUrl;
        } catch (e) {
            console.error('代理加载音频失败:', e);
            throw new Error(`音效加载失败：${e.message || '网络错误'}，请稍后重试或切换其他歌曲`);
        }
    }

    // ========== 播放列表 ==========
    
    renderQueue() {
        this.els.queueCount.textContent = this.playlist.length + ' 首歌曲';
        
        const html = this.playlist.map((track, idx) => {
            // 优先使用缓存的封面 URL（已解析的真实 URL）
            let coverUrl = this.coverUrlCache.get(idx) || track.pic || track.cover || '';
            // 使用渐变背景作为占位，更优雅
            const placeholderStyle = `background: linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%);`;
            return `
            <div class="queue-item" data-idx="${idx}">
                <span class="queue-item-index">${(idx + 1).toString().padStart(2, '0')}</span>
                <div class="queue-item-cover-wrap" style="${placeholderStyle}">
                    <img class="queue-item-cover" src="${coverUrl}" alt="" referrerpolicy="no-referrer" onload="this.style.opacity=1;this.style.display=''" onerror="this.style.opacity='0'">
                    <span class="queue-item-cover-placeholder">♪</span>
                </div>
                <div class="queue-item-info">
                    <span class="queue-item-title">${this.escapeHtml(track.name || track.title || '')}</span>
                    <span class="queue-item-artist">${this.escapeHtml(track.artist || track.author || '')}</span>
                </div>
            </div>
        `}).join('');
        
        // 桌面端列表
        this.els.queueList.innerHTML = html;
        this.els.queueList.querySelectorAll('.queue-item').forEach(el => {
            el.onclick = async () => {
                try {
                    await this.loadTrack(parseInt(el.dataset.idx), true);
                } catch (e) {
                    console.error('加载歌曲失败:', e);
                }
            };
        });
        
        // 移动端列表
        if (this.els.mobileQueueList) {
            this.els.mobileQueueList.innerHTML = html;
            this.els.mobileQueueList.querySelectorAll('.queue-item').forEach(el => {
                el.onclick = async () => {
                    try {
                        await this.loadTrack(parseInt(el.dataset.idx), true);
                        this.closeMobileQueue();
                    } catch (e) {
                        console.error('加载歌曲失败:', e);
                    }
                };
            });
        }
        
        this.updateQueueHighlight();
    }
    
    updateQueueHighlight() {
        // 桌面端：只更新新旧 active 状态
        const desktopItems = this.els.queueList.querySelectorAll('.queue-item');
        desktopItems.forEach((el, idx) => {
            if (idx === this.currentIndex) {
                el.classList.add('active');
            } else if (el.classList.contains('active')) {
                el.classList.remove('active');
            }
        });
        // 移动端
        if (this.els.mobileQueueList) {
            const mobileItems = this.els.mobileQueueList.querySelectorAll('.queue-item');
            mobileItems.forEach((el, idx) => {
                if (idx === this.currentIndex) {
                    el.classList.add('active');
                } else if (el.classList.contains('active')) {
                    el.classList.remove('active');
                }
            });
        }
    }
    
    filterQueue(keyword) {
        const items = this.els.queueList.querySelectorAll('.queue-item');
        const lowerKeyword = keyword.toLowerCase().trim();
        
        items.forEach(item => {
            const title = item.querySelector('.queue-item-title')?.textContent?.toLowerCase() || '';
            const artist = item.querySelector('.queue-item-artist')?.textContent?.toLowerCase() || '';
            const match = title.includes(lowerKeyword) || artist.includes(lowerKeyword);
            item.style.display = match ? 'flex' : 'none';
        });
        
        // 更新计数
        const visibleCount = Array.from(items).filter(item => item.style.display !== 'none').length;
        this.els.queueCount.textContent = `${visibleCount} / ${this.playlist.length} 首歌曲`;
    }
    
    // ========== 在线搜索 ==========
    
    async searchOnline(query, mobile = false) {
        const resultsEl = mobile ? this.els.mobileSearchResults : this.els.searchResults;
        const hintEl = mobile ? this.els.mobileSearchHint : this.els.searchHint;
        const loadingEl = mobile ? this.els.mobileSearchLoading : this.els.searchLoading;
        if (!resultsEl) return;
        
        if (hintEl) hintEl.style.display = 'none';
        if (loadingEl) loadingEl.style.display = 'block';
        resultsEl.innerHTML = '';
        
        const noResult = '<div style="text-align:center;padding:24px;color:var(--color-text-tertiary)">未找到结果</div>';
        const failResult = '<div style="text-align:center;padding:24px;color:var(--color-text-tertiary)">搜索失败，请重试</div>';
        
        // 重试 5 次
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                const url = `${MusicPlayer.GD_API}?types=search&source=netease&name=${encodeURIComponent(query)}&count=30`;
                console.log(`搜索 (第${attempt}次):`, url);
                
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 10000);
                const resp = await fetch(url, { signal: controller.signal });
                clearTimeout(timer);
                
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                
                if (Array.isArray(data) && data.length > 0) {
                    if (loadingEl) loadingEl.style.display = 'none';
                    this.renderSearchResults(data, mobile);
                    return;
                }
                resultsEl.innerHTML = noResult;
                if (loadingEl) loadingEl.style.display = 'none';
                return;
            } catch (e) {
                console.warn(`搜索失败 (第${attempt}次):`, e.message);
                if (attempt < 5) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }
        
        resultsEl.innerHTML = failResult;
        if (loadingEl) loadingEl.style.display = 'none';
    }
    
    renderSearchResults(tracks, mobile = false) {
        const html = tracks.map(t => `
            <div class="search-result-item" data-id="${this.escapeHtml(t.id || '')}" data-source="${this.escapeHtml(t.source || 'netease')}" data-picid="${this.escapeHtml(t.pic_id || '')}" data-lyricid="${this.escapeHtml(t.lyric_id || '')}">
                <img class="search-result-cover" src="" alt="" data-picid="${this.escapeHtml(t.pic_id || '')}" onerror="this.style.display='none'">
                <div class="search-result-info">
                    <div class="search-result-name">${this.escapeHtml(t.name || '')}</div>
                    <div class="search-result-artist">${this.escapeHtml(t.artist || '')}</div>
                </div>
                <span class="search-result-source">${this.escapeHtml(t.source || '')}</span>
            </div>
        `).join('');
        
        const container = mobile ? this.els.mobileSearchResults : this.els.searchResults;
        if (!container) return;
        container.innerHTML = html;
        
        // 绑定点击事件
        container.querySelectorAll('.search-result-item').forEach(el => {
            el.onclick = () => {
                const id = el.dataset.id;
                const source = el.dataset.source;
                const picId = el.dataset.picid;
                const lyricId = el.dataset.lyricid;
                if (id) {
                    this.playSearchResult({ id, source, pic_id: picId, lyric_id: lyricId, name: el.querySelector('.search-result-name').textContent, artist: el.querySelector('.search-result-artist').textContent });
                    if (mobile) this.closeMobileSearch();
                }
            };
        });
        
        // 本地计算封面 CDN URL（零网络请求）
        this._loadCovers(container.querySelectorAll('.search-result-cover'));
    }
    
    _loadCovers(imgs) {
        // 本地计算 CDN URL，无需网络请求
        Array.from(imgs).forEach(img => this._loadCover(img));
    }
    
    // 网易云封面 ID → CDN URL（本地计算，零网络请求）
    _neteaseCoverUrl(picId, size = 300) {
        const magic = '3go8&$8*3*3h0k(2)2';
        let xored = '';
        for (let i = 0; i < picId.length; i++) {
            xored += String.fromCharCode(picId.charCodeAt(i) ^ magic.charCodeAt(i % magic.length));
        }
        const encrypted = this._md5base64(xored).replace(/\//g, '_').replace(/\+/g, '-');
        return `https://p3.music.126.net/${encrypted}/${picId}.jpg?param=${size}y${size}`;
    }
    
    // 已验证 MD5（joseph myers 实现）
    _md5base64(s) {
        const hex = this._md5hex(s);
        const raw = new Uint8Array(16);
        for (let i = 0; i < 16; i++) raw[i] = parseInt(hex.substr(i*2,2), 16);
        return btoa(String.fromCharCode(...raw));
    }
    
    _md5hex(s) {
        const n = s.length, state = [1732584193, -271733879, -1732584194, 271733878];
        let i = 64;
        for (; i <= n; i += 64) this._md5cycle(state, this._md5blk(s.substring(i - 64, i)));
        s = s.substring(i - 64);
        const tail = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
        for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) { this._md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
        tail[14] = n * 8;
        this._md5cycle(state, tail);
        return this._md5rhex(state[0]) + this._md5rhex(state[1]) + this._md5rhex(state[2]) + this._md5rhex(state[3]);
    }
    
    _md5cycle(x, k) {
        let a = x[0], b = x[1], c = x[2], d = x[3];
        a = this._md5ff(a,b,c,d,k[0],7,-680876936); d = this._md5ff(d,a,b,c,k[1],12,-389564586);
        c = this._md5ff(c,d,a,b,k[2],17,606105819); b = this._md5ff(b,c,d,a,k[3],22,-1044525330);
        a = this._md5ff(a,b,c,d,k[4],7,-176418897); d = this._md5ff(d,a,b,c,k[5],12,1200080426);
        c = this._md5ff(c,d,a,b,k[6],17,-1473231341); b = this._md5ff(b,c,d,a,k[7],22,-45705983);
        a = this._md5ff(a,b,c,d,k[8],7,1770035416); d = this._md5ff(d,a,b,c,k[9],12,-1958414417);
        c = this._md5ff(c,d,a,b,k[10],17,-42063); b = this._md5ff(b,c,d,a,k[11],22,-1990404162);
        a = this._md5ff(a,b,c,d,k[12],7,1804603682); d = this._md5ff(d,a,b,c,k[13],12,-40341101);
        c = this._md5ff(c,d,a,b,k[14],17,-1502002290); b = this._md5ff(b,c,d,a,k[15],22,1236535329);
        a = this._md5gg(a,b,c,d,k[1],5,-165796510); d = this._md5gg(d,a,b,c,k[6],9,-1069501632);
        c = this._md5gg(c,d,a,b,k[11],14,643717713); b = this._md5gg(b,c,d,a,k[0],20,-373897302);
        a = this._md5gg(a,b,c,d,k[5],5,-701558691); d = this._md5gg(d,a,b,c,k[10],9,38016083);
        c = this._md5gg(c,d,a,b,k[15],14,-660478335); b = this._md5gg(b,c,d,a,k[4],20,-405537848);
        a = this._md5gg(a,b,c,d,k[9],5,568446438); d = this._md5gg(d,a,b,c,k[14],9,-1019803690);
        c = this._md5gg(c,d,a,b,k[3],14,-187363961); b = this._md5gg(b,c,d,a,k[8],20,1163531501);
        a = this._md5gg(a,b,c,d,k[13],5,-1444681467); d = this._md5gg(d,a,b,c,k[2],9,-51403784);
        c = this._md5gg(c,d,a,b,k[7],14,1735328473); b = this._md5gg(b,c,d,a,k[12],20,-1926607734);
        a = this._md5hh(a,b,c,d,k[5],4,-378558); d = this._md5hh(d,a,b,c,k[8],11,-2022574463);
        c = this._md5hh(c,d,a,b,k[11],16,1839030562); b = this._md5hh(b,c,d,a,k[14],23,-35309556);
        a = this._md5hh(a,b,c,d,k[1],4,-1530992060); d = this._md5hh(d,a,b,c,k[4],11,1272893353);
        c = this._md5hh(c,d,a,b,k[7],16,-155497632); b = this._md5hh(b,c,d,a,k[10],23,-1094730640);
        a = this._md5hh(a,b,c,d,k[13],4,681279174); d = this._md5hh(d,a,b,c,k[0],11,-358537222);
        c = this._md5hh(c,d,a,b,k[3],16,-722521979); b = this._md5hh(b,c,d,a,k[6],23,76029189);
        a = this._md5hh(a,b,c,d,k[9],4,-640364487); d = this._md5hh(d,a,b,c,k[12],11,-421815835);
        c = this._md5hh(c,d,a,b,k[15],16,530742520); b = this._md5hh(b,c,d,a,k[2],23,-995338651);
        a = this._md5ii(a,b,c,d,k[0],6,-198630844); d = this._md5ii(d,a,b,c,k[7],10,1126891415);
        c = this._md5ii(c,d,a,b,k[14],15,-1416354905); b = this._md5ii(b,c,d,a,k[5],21,-57434055);
        a = this._md5ii(a,b,c,d,k[12],6,1700485571); d = this._md5ii(d,a,b,c,k[3],10,-1894986606);
        c = this._md5ii(c,d,a,b,k[10],15,-1051523); b = this._md5ii(b,c,d,a,k[1],21,-2054922799);
        a = this._md5ii(a,b,c,d,k[8],6,1873313359); d = this._md5ii(d,a,b,c,k[15],10,-30611744);
        c = this._md5ii(c,d,a,b,k[6],15,-1560198380); b = this._md5ii(b,c,d,a,k[13],21,1309151649);
        a = this._md5ii(a,b,c,d,k[4],6,-145523070); d = this._md5ii(d,a,b,c,k[11],10,-1120210379);
        c = this._md5ii(c,d,a,b,k[2],15,718787259); b = this._md5ii(b,c,d,a,k[9],21,-343485551);
        x[0] = this._md5add32(a, x[0]); x[1] = this._md5add32(b, x[1]);
        x[2] = this._md5add32(c, x[2]); x[3] = this._md5add32(d, x[3]);
    }
    
    _md5cmn(q, a, b, x, s, t) { return this._md5add32((this._md5add32(this._md5add32(a, q), this._md5add32(x, t)) << s) | (this._md5add32(this._md5add32(a, q), this._md5add32(x, t)) >>> (32 - s)), b); }
    _md5ff(a,b,c,d,x,s,t) { return this._md5cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    _md5gg(a,b,c,d,x,s,t) { return this._md5cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    _md5hh(a,b,c,d,x,s,t) { return this._md5cmn(b ^ c ^ d, a, b, x, s, t); }
    _md5ii(a,b,c,d,x,s,t) { return this._md5cmn(c ^ (b | (~d)), a, b, x, s, t); }
    _md5blk(s) { const b = []; for (let i = 0; i < 64; i += 4) b[i>>2] = s.charCodeAt(i) + (s.charCodeAt(i+1) << 8) + (s.charCodeAt(i+2) << 16) + (s.charCodeAt(i+3) << 24); return b; }
    _md5rhex(n) { let s = ''; for (let j = 0; j < 4; j++) s += '0123456789abcdef'.charAt((n >> (j*8+4)) & 0x0F) + '0123456789abcdef'.charAt((n >> (j*8)) & 0x0F); return s; }
    _md5add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    
    _loadCover(img) {
        const picId = img.dataset.picid;
        if (!picId) return;
        img.src = this._neteaseCoverUrl(picId, 300);
    }
    
    async playSearchResult(track) {
        try {
            // 并行获取 URL 和歌词
            const urlApi = `${MusicPlayer.GD_API}?types=url&source=${track.source || 'netease'}&id=${track.id}&br=320`;
            const lyricApi = `${MusicPlayer.GD_API}?types=lyric&source=${track.source || 'netease'}&id=${track.lyric_id || track.id}`;
            
            const [urlResp, lrcResp] = await Promise.all([
                fetch(urlApi).then(r => r.json()).catch(() => ({ url: '' })),
                fetch(lyricApi).then(r => r.json()).catch(() => ({ lyric: '' }))
            ]);
            
            const audioUrl = urlResp.url || '';
            if (!audioUrl) {
                this.showToast('无法获取播放地址，请稍后重试', 'error');
                return;
            }
            
            // 去重：基于 id 查找是否已存在
            const existingIdx = this.playlist.findIndex(t => t._searchId === track.id);
            if (existingIdx !== -1) {
                // 已存在，直接播放
                this.playPath.push(existingIdx);
                this.pathPos = this.playPath.length - 1;
                this._capPlayPath();
                this.loadTrack(existingIdx, true);
                this.showToast(`已在列表中: ${track.name}`);
                if (window.innerWidth > 768) this.switchPanel('queue');
                return;
            }

            // 添加到播放列表并播放
            const newTrack = {
                name: track.name,
                artist: track.artist,
                url: audioUrl,
                pic: this._neteaseCoverUrl(track.pic_id, 500),
                lrc: lrcResp.lyric || lrcResp.tlyric || '',
                source: track.source,
                _searchId: track.id  // 用于去重标记
            };
            
            this.playlist.push(newTrack);
            const newIndex = this.playlist.length - 1;
            // 加入播放路径
            this.playPath.push(newIndex);
            this.pathPos = this.playPath.length - 1;
            this._capPlayPath();
            this.renderQueue();
            this.loadTrack(newIndex, true);
            if (window.innerWidth > 768) this.switchPanel('queue');
        } catch (e) {
            console.error('搜索播放失败:', e);
            this.showToast('搜索播放失败，请重试', 'error');
        }
    }
    
    // ========== 面板切换 ==========
    
    switchPanel(panel) {
        this.els.panelTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.panel === panel);
        });
        
        this.els.panelLyrics.classList.toggle('active', panel === 'lyrics');
        this.els.panelQueue.classList.toggle('active', panel === 'queue');
        const panelSearch = document.getElementById('panel-search');
        if (panelSearch) panelSearch.classList.toggle('active', panel === 'search');
        
        // 切换到搜索面板时聚焦输入框
        if (panel === 'search' && this.els.searchInput) {
            setTimeout(() => this.els.searchInput.focus(), 100);
        }
    }
    
    // ========== 移动端 ==========
    
    switchMobileView(view) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        
        this.els.mobileLyricsView.classList.remove('active');
        this.els.mobileQueueDrawer.classList.remove('active');
        if (this.els.mobileSearchDrawer) this.els.mobileSearchDrawer.classList.remove('active');
        
        if (view === 'lyrics') {
            this.els.mobileLyricsView.classList.add('active');
        } else if (view === 'queue') {
            this.openMobileQueue();
        } else if (view === 'search') {
            this.openMobileSearch();
        }
    }
    
    openMobileQueue() {
        if (this.els.mobileQueueDrawer) {
            this.els.mobileQueueDrawer.classList.add('active');
        }
    }
    
    openMobileSearch() {
        if (this.els.mobileSearchDrawer) {
            this.els.mobileSearchDrawer.classList.add('active');
            setTimeout(() => { if (this.els.mobileSearchInput) this.els.mobileSearchInput.focus(); }, 300);
        }
    }
    
    closeMobileSearch() {
        if (this.els.mobileSearchDrawer) {
            this.els.mobileSearchDrawer.classList.remove('active');
        }
        const playerBtn = document.querySelector('.nav-btn[data-view="player"]');
        if (playerBtn) playerBtn.classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.dataset.view !== 'player') btn.classList.remove('active');
        });
    }
    
    closeMobileQueue() {
        if (this.els.mobileQueueDrawer) {
            this.els.mobileQueueDrawer.classList.remove('active');
        }
        document.querySelector('.nav-btn[data-view="player"]')?.classList.add('active');
        document.querySelector('.nav-btn[data-view="queue"]')?.classList.remove('active');
    }
    
    closeMobileLyrics() {
        this.els.mobileLyricsView.classList.remove('active');
        document.querySelector('.nav-btn[data-view="player"]')?.classList.add('active');
        document.querySelector('.nav-btn[data-view="lyrics"]')?.classList.remove('active');
    }
    
    filterMobileQueue(keyword) {
        const items = this.els.mobileQueueList.querySelectorAll('.queue-item');
        const lowerKeyword = keyword.toLowerCase().trim();
        
        items.forEach(item => {
            const title = item.querySelector('.queue-item-title')?.textContent?.toLowerCase() || '';
            const artist = item.querySelector('.queue-item-artist')?.textContent?.toLowerCase() || '';
            const match = title.includes(lowerKeyword) || artist.includes(lowerKeyword);
            item.style.display = match ? 'flex' : 'none';
        });
    }
    
    // ========== MediaSession ==========
    
    updateMediaSession(track, cover) {
        if (!('mediaSession' in navigator)) return;
        
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.name || track.title || '未知歌曲',
            artist: track.artist || track.author || '未知歌手',
            artwork: [{ src: cover, sizes: '512x512', type: 'image/jpeg' }]
        });
        
        navigator.mediaSession.setActionHandler('play', () => this.play());
        navigator.mediaSession.setActionHandler('pause', () => this.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    }
    
    // ========== 键盘快捷键 ==========
    
    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT') return;
        
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'ArrowLeft':
                this.els.audio.currentTime = Math.max(0, this.els.audio.currentTime - 5);
                break;
            case 'ArrowRight': {
                const d = this.els.audio.duration;
                this.els.audio.currentTime = isFinite(d) && d > 0
                    ? Math.min(d, this.els.audio.currentTime + 5)
                    : this.els.audio.currentTime + 5;
                break;
            }
            case 'ArrowUp':
                e.preventDefault();
                this.setVolume(Math.min(100, this.els.audio.volume * 100 + 5));
                this.els.volumeSlider.value = this.els.audio.volume * 100;
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.setVolume(Math.max(0, this.els.audio.volume * 100 - 5));
                this.els.volumeSlider.value = this.els.audio.volume * 100;
                break;
        }
    }
    
    // ========== 错误处理 ==========
    
    handleError(e) {
        console.error('音频加载错误:', e);
        const track = this.playlist[this.currentIndex];
        const name = track ? (track.name || track.title || '未知歌曲') : '未知歌曲';

        // 取消尚未触发的旧定时器
        if (this._errorSkipTimer) {
            clearTimeout(this._errorSkipTimer);
            this._errorSkipTimer = null;
        }

        // 累计连续错误，超过阈值则停止自动跳过，避免死循环
        this._consecutiveErrors = (this._consecutiveErrors || 0) + 1;
        if (this._consecutiveErrors > 5) {
            this.showToast('连续多首歌曲无法播放，已停止自动跳过', 'error', 4000);
            this._consecutiveErrors = 0;
            this.isPlaying = false;
            this.onPlayStateChange(false);
            return;
        }

        this.showToast(`无法播放: ${name}，自动跳过...`, 'error', 2000);

        // 1.2 秒后自动跳到下一首（强 autoplay），避免用户卡在坏掉的音轨上
        this._errorSkipTimer = setTimeout(() => {
            this._errorSkipTimer = null;
            // 单曲循环模式下也跳过（坏掉的音轨无法重复播放）
            this.next(true);
        }, 1200);
    }
    
    // ========== 工具方法 ==========
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== Toast 提示 ==========

    showToast(message, type = 'info', duration = 2500) {
        if (!this._toastContainer) {
            this._toastContainer = document.createElement('div');
            this._toastContainer.id = 'toast-container';
            document.body.appendChild(this._toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `toast${type !== 'info' ? ' toast-' + type : ''}`;
        toast.textContent = message;
        this._toastContainer.appendChild(toast);

        // 触发动画
        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('show'));
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ========== 音量持久化 ==========

    _loadVolume() {
        try {
            const v = localStorage.getItem('mq_volume');
            return v !== null ? parseFloat(v) : null;
        } catch { return null; }
    }

    _saveVolume(volume) {
        try {
            localStorage.setItem('mq_volume', volume.toString());
        } catch { /* ignore */ }
    }
}

// 初始化播放器
const player = new MusicPlayer();
window.player = player;
