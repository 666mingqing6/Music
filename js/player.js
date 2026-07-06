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
        
        // 播放次数统计（平均随机用，localStorage 持久化）
        this.playCount = this._loadPlayCount();
        
        // API
        this.apiUrl = 'https://meting-api.646474.xyz/?server=:server&type=:type&id=:id&r=:r';
        
        // DOM 元素缓存
        this.els = {};
        
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
            btnLyrics: $('btn-lyrics'),
            btnQueue: $('btn-queue'),
            
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
        });
        
        // 进度条滑块拖动
        if (this.els.progressSlider) {
            this.els.progressSlider.oninput = e => {
                const percent = parseFloat(e.target.value);
                const duration = this.els.audio.duration;
                if (!isNaN(duration)) {
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
        const volume = 0.8;
        this.els.audio.volume = volume;
        this.els.volumeSlider.value = volume * 100;
        this.updateVolumeIcon(volume);
    }
    
    // ========== 数据加载 ==========
    
    async loadPlaylist() {
        const localData = typeof localMusic !== 'undefined' ? localMusic : [];
        
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
                        this.playlist = [...localData, ...onlineData];
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
        
        // 3 次都失败，仅使用本地音乐
        console.log('API 3 次均失败，仅使用本地音乐');
        this.playlist = localData;
    }
    
    async loadTrack(index, autoPlay = false) {
        if (index < 0 || index >= this.playlist.length) return;
        
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
        this.els.audio.src = track.url;
        
        // 加载歌词
        await this.loadLyrics(track.lrc);
        
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
                lrcText = await response.text();
            } else {
                lrcText = source;
            }
            
            this.parseLyrics(lrcText);
            this.renderLyrics(this.lyrics);
        } catch (error) {
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
        
        // 移动端歌词点击（修复手机不能跳转）
        this.els.mobileLyricsContainer.querySelectorAll('.lyric-line').forEach(el => {
            el.onclick = () => this.seekToLyric(parseFloat(el.dataset.time));
        });
        
        // 移动端全屏歌词视图也需要绑定
        const mobileLyricsScroll = document.getElementById('mobile-lyrics-scroll');
        if (mobileLyricsScroll) {
            mobileLyricsScroll.querySelectorAll('.lyric-line').forEach(el => {
                el.onclick = () => this.seekToLyric(parseFloat(el.dataset.time));
            });
        }
    }
    
    updateLyrics(time) {
        if (this.lyrics.length === 0 || this.isLyricScrolling) return;
        
        let newIndex = 0;
        for (let i = 0; i < this.lyrics.length; i++) {
            if (time >= this.lyrics[i].time) {
                newIndex = i;
            } else {
                break;
            }
        }
        
        if (newIndex === this.currentLyricIndex) return;
        this.currentLyricIndex = newIndex;
        
        // 桌面端
        const desktopLines = this.els.lyricsContainer.querySelectorAll('.lyric-line');
        desktopLines.forEach((el, idx) => {
            el.classList.toggle('active', idx === newIndex);
        });
        
        // 移动端
        const mobileLines = this.els.mobileLyricsContainer.querySelectorAll('.lyric-line');
        mobileLines.forEach((el, idx) => {
            el.classList.toggle('active', idx === newIndex);
        });
        
        // 桌面端滚动 - 使用 scrollIntoView 实现居中
        const activeLine = desktopLines[newIndex];
        if (activeLine && this.els.lyricsScroll) {
            activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        // 移动端滚动
        const mobileActiveLine = mobileLines[newIndex];
        const mobileScroll = document.getElementById('mobile-lyrics-scroll');
        if (mobileActiveLine && mobileScroll) {
            mobileActiveLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    smoothScrollLyric(container, targetTop) {
        if (this.lyricScrollRAF) {
            cancelAnimationFrame(this.lyricScrollRAF);
        }
        
        const startTop = container.scrollTop;
        const distance = targetTop - startTop;
        const duration = 400;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            
            container.scrollTop = startTop + distance * ease;
            
            if (progress < 1) {
                this.lyricScrollRAF = requestAnimationFrame(animate);
            }
        };
        
        this.lyricScrollRAF = requestAnimationFrame(animate);
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
    
    // 保存播放次数
    _savePlayCount() {
        localStorage.setItem('mq_play_count', JSON.stringify(this.playCount));
    }
    
    // 获取当前播放次数最少的歌曲索引（平均随机）
    _getLeastPlayedIndex(excludeIdx) {
        const counts = this.playlist.map((_, i) => this.playCount[i] || 0);
        const minCount = Math.min(...counts);
        // 找出所有播放次数为最小值的索引
        const candidates = counts
            .map((c, i) => ({ count: c, idx: i }))
            .filter(({ idx }) => idx !== excludeIdx)
            .filter(({ count }) => count === minCount)
            .map(({ idx }) => idx);
        // 候选里随机选一个
        return candidates[Math.floor(Math.random() * candidates.length)];
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
        }
    }
    
    next() {
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
            }
        } else {
            index = this.currentIndex + 1;
            if (index >= this.playlist.length) index = 0;
        }
        this.loadTrack(index, this.isPlaying);
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
        if (isNaN(duration)) return;
        
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
        if (isNaN(duration)) return;
        
        // 获取已缓冲的最大时间
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const percent = (bufferedEnd / duration) * 100;
        
        if (this.els.progressBuffer) {
            this.els.progressBuffer.style.width = percent + '%';
        }
    }
    
    seekTo(e) {
        const rect = this.els.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.els.audio.currentTime = percent * this.els.audio.duration;
    }
    
    startDrag() {
        const onMove = e => {
            const rect = this.els.progressBar.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.els.audio.currentTime = percent * this.els.audio.duration;
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
        this.els.queueList.querySelectorAll('.queue-item').forEach((el, idx) => {
            el.classList.toggle('active', idx === this.currentIndex);
        });
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
        
        // 重试 3 次
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const url = `${MusicPlayer.GD_API}?types=search&source=netease&name=${encodeURIComponent(query)}&count=30`;
                console.log(`搜索 (第${attempt}次):`, url);
                
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
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
                if (attempt < 3) {
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
        
        // 异步加载封面缩略图（控制并发，避免代理 503）
        this._loadCovers(container.querySelectorAll('.search-result-cover'));
    }
    
    async _loadCovers(imgs) {
        const CONCURRENCY = 3;
        const items = Array.from(imgs).filter(img => img.dataset.picid);
        for (let i = 0; i < items.length; i += CONCURRENCY) {
            await Promise.all(items.slice(i, i + CONCURRENCY).map(img => this._loadCover(img)));
        }
    }
    
    async _loadCover(img) {
        const picId = img.dataset.picid;
        if (!picId) return;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const resp = await fetch(`${MusicPlayer.GD_API}?types=pic&source=netease&id=${picId}&size=300`);
                if (resp.ok) {
                    const d = await resp.json();
                    if (d.url) { img.src = d.url; return; }
                }
            } catch (e) {}
            if (attempt < 2) await new Promise(r => setTimeout(r, 600));
        }
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
                console.warn('无法获取播放地址');
                return;
            }
            
            // 添加到播放列表并播放
            const newTrack = {
                name: track.name,
                artist: track.artist,
                url: audioUrl,
                pic: `${MusicPlayer.GD_API}?types=pic&source=${track.source || 'netease'}&id=${track.pic_id || ''}&size=500`,
                lrc: lrcResp.lyric || lrcResp.tlyric || '',
                source: track.source
            };
            
            this.playlist.push(newTrack);
            const newIndex = this.playlist.length - 1;
            this.renderQueue();
            this.loadTrack(newIndex, true);
            
            // 切换到播放列表
            this.switchPanel('queue');
        } catch (e) {
            console.error('搜索播放失败:', e);
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
                this.els.audio.currentTime -= 5;
                break;
            case 'ArrowRight':
                this.els.audio.currentTime += 5;
                break;
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
}

// 初始化播放器
const player = new MusicPlayer();
window.player = player;
