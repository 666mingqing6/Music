# HeoMusic 参考项目深度分析报告

## 一、项目概述

HeoMusic 是一个基于 [APlayer](https://github.com/DIYgod/APlayer) 和 [MetingJS](https://github.com/metowolf/MetingJS) 的静态音乐播放器，由张洪Heo开发。项目采用纯前端架构，后端仅提供一个 PHP 编写的 Meting-API 用于获取在线音乐数据。

**核心技术栈：**
- 前端播放器：APlayer (已修改版)
- 音乐数据源适配：MetingJS (Web Component)
- 后端 API：PHP (Meting 框架)
- 支持平台：网易云、QQ音乐、酷狗、虾米、百度、酷我

---

## 二、网易云音乐封面图片获取方式

### 2.1 封面 URL 构造

封面图片的获取在 PHP 后端 `Meting.php` 的 `pic()` 方法中实现。网易云音乐的封面 URL 构造方式如下：

```php
// 文件: meting-api/src/Meting.php 第824-828行
public function pic($id, $size = 300)
{
    switch ($this->server) {
        case 'netease':
        $url = 'https://p3.music.126.net/'.$this->netease_encryptId($id).'/'.$id.'.jpg?param='.$size.'y'.$size;
        break;
```

**关键参数说明：**
- **域名**：`p3.music.126.net`（网易云 CDN）
- **加密 ID**：通过 `netease_encryptId()` 方法对原始 pic_id 进行加密生成
- **原始 ID**：歌曲的 pic_id（从歌单/歌曲详情 API 获取）
- **图片格式**：`.jpg`
- **尺寸参数**：`?param={size}y{size}`，例如 `?param=300y300` 表示 300x300 像素

### 2.2 ID 加密算法

```php
// 文件: meting-api/src/Meting.php 第1068-1079行
private function netease_encryptId($id)
{
    $magic = str_split('3go8&$8*3*3h0k(2)2');
    $song_id = str_split($id);
    for ($i = 0; $i < count($song_id); $i++) {
        $song_id[$i] = chr(ord($song_id[$i]) ^ ord($magic[$i % count($magic)]));
    }
    $result = base64_encode(md5(implode('', $song_id), 1));
    $result = str_replace(array('/', '+'), array('_', '-'), $result);
    return $result;
}
```

加密流程：原始 ID -> 与 magic 字符串逐字符 XOR -> MD5 哈希 -> Base64 编码 -> URL 安全字符替换

### 2.3 实际请求尺寸

在 `meting-api/index.php` 中，实际请求封面时使用的尺寸为 **800x800**：

```php
// 文件: meting-api/index.php 第172行
case 'pic':
    $data = json_decode($api->pic($id, 800))->url;
    break;
```

最终生成的封面 URL 格式示例：
```
https://p3.music.126.net/{encrypted_id}/{pic_id}.jpg?param=800y800
```

### 2.4 封面在前端的使用

前端通过 API 返回的 `pic` 字段获取封面 URL。API 返回的是重定向 URL（HTTP 302），浏览器会自动跟随重定向获取实际图片。

```php
// 文件: meting-api/index.php 第222-226行
function return_data($type, $data)
{
    if (in_array($type, ['url', 'pic'])) {
        header('Location: ' . $data);  // 302 重定向到实际图片地址
    } else {
        echo $data;
    }
    exit;
}
```

### 2.5 QQ音乐封面格式

```php
case 'tencent':
$url = 'https://y.gtimg.cn/music/photo_new/T002R'.$size.'x'.$size.'M000'.$id.'.jpg?max_age=2592000';
break;
```

QQ音乐封面 URL 格式：`https://y.gtimg.cn/music/photo_new/T002R{size}x{size}M000{album_mid}.jpg?max_age=2592000`

---

## 三、歌词解析和滚动实现

### 3.1 歌词获取

歌词通过 Meting API 获取，支持原始歌词和翻译歌词合并：

```php
// 文件: meting-api/index.php 第175-206行
case 'lrc':
    $lrc_data = json_decode($api->lyric($id));
    if ($lrc_data->lyric == '') {
        $lrc = '[00:00.00]这似乎是一首纯音乐呢，请尽情欣赏它吧！';
    } else if ($lrc_data->tlyric == '') {
        $lrc = $lrc_data->lyric;
    } else if (TLYRIC) {
        // 将翻译歌词合并到原文歌词中，格式：原文 (翻译)
        $lrc_arr = explode("\n", $lrc_data->lyric);
        $lrc_cn_arr = explode("\n", $lrc_data->tlyric);
        $lrc_cn_map = array();
        foreach ($lrc_cn_arr as $i => $v) {
            if ($v == '') continue;
            $line = explode(']', $v, 2);
            $line[1] = trim(preg_replace('/\s\s+/', ' ', $line[1]));
            $lrc_cn_map[$line[0]] = $line[1];
        }
        foreach ($lrc_arr as $i => $v) {
            if ($v == '') continue;
            $key = explode(']', $v, 2)[0];
            if (!empty($lrc_cn_map[$key]) && $lrc_cn_map[$key] != '//') {
                $lrc_arr[$i] .= ' (' . $lrc_cn_map[$key] . ')';
            }
        }
        $lrc = implode("\n", $lrc_arr);
    }
```

歌词格式为标准 LRC 格式：`[mm:ss.xx]歌词内容`，翻译歌词以括号形式追加在原文后面。

### 3.2 歌词解析（APlayer 内置）

歌词的解析由 APlayer 内部完成（`APlayer.min.js`），使用 `lrcType: 3` 表示通过 URL 异步加载歌词：

```javascript
// 文件: js/Meting.js 第112行
lrcType: this.meta.lrcType || 3,
```

APlayer 会将 LRC 格式歌词解析为时间戳+文本的数组，存储在 `player.lrc.current` 中。

### 3.3 歌词滚动实现

歌词滚动是 HeoMusic 最核心的自定义功能之一，在 `main.js` 中实现：

#### 3.3.1 滚动动画函数

```javascript
// 文件: js/main.js 第122-169行
scrollLyric: function () {
    if (isScrolling) return;

    const lrcContent = document.querySelector('.aplayer-lrc');
    const currentLyric = document.querySelector('.aplayer-lrc-current');

    if (lrcContent && currentLyric) {
        let startScrollTop = lrcContent.scrollTop;
        let targetScrollTop = currentLyric.offsetTop - (window.innerHeight - 150) * 0.3;
        let distance = targetScrollTop - startScrollTop;
        let duration = 600;
        let startTime = null;

        function easeOutQuad(t) {
            return t * (2 - t);
        }

        function animateScroll(currentTime) {
            if (isScrolling) {
                animationFrameId = null;
                return;
            }
            if (startTime === null) startTime = currentTime;
            let timeElapsed = currentTime - startTime;
            let progress = Math.min(timeElapsed / duration, 1);
            // 移动端使用线性滚动，桌面端使用缓动函数
            let easeProgress = window.innerWidth < 768 ? progress : easeOutQuad(progress);
            lrcContent.scrollTop = startScrollTop + (distance * easeProgress);

            if (timeElapsed < duration) {
                animationFrameId = requestAnimationFrame(animateScroll);
            } else {
                animationFrameId = null;
            }
        }

        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = requestAnimationFrame(animateScroll);
    }
},
```

**滚动机制要点：**
- 使用 `requestAnimationFrame` 实现平滑动画
- 目标位置：当前歌词偏移到视口 **30%** 高度处
- 动画时长：600ms
- 桌面端使用 `easeOutQuad` 缓动函数，移动端使用线性滚动
- 支持中断：用户手动滚动时立即停止自动滚动

#### 3.3.2 用户滚动检测

```javascript
// 文件: js/main.js 第57-107行
handleScrollOrTouch: function(event, isTouchEvent) {
    let targetElement = event.target;
    let isInTargetArea = false;

    while (targetElement && targetElement !== document) {
        if (targetElement.classList) {
            if (isTouchEvent) {
                if (targetElement.classList.contains('aplayer-body') ||
                    targetElement.classList.contains('aplayer-lrc')) {
                    isInTargetArea = true;
                    break;
                }
            } else {
                if (targetElement.classList.contains('aplayer-body')) {
                    isInTargetArea = true;
                    break;
                }
            }
        }
        targetElement = targetElement.parentNode;
    }

    if (isInTargetArea) {
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        isScrolling = true;
        if(scrollTimer !== null) clearTimeout(scrollTimer);
        // 触摸事件4.5秒后恢复，鼠标滚轮4秒后恢复
        const timeoutDuration = isTouchEvent ? 4500 : 4000;
        scrollTimer = setTimeout(function() {
            isScrolling = false;
            heo.scrollLyric();
        }, timeoutDuration);
    }
},
```

**交互设计：**
- 鼠标滚轮事件：仅在 `.aplayer-body` 区域内触发
- 触摸滑动事件：在 `.aplayer-body` 和 `.aplayer-lrc` 区域内触发
- 用户滚动后，4秒（触摸4.5秒）无操作自动恢复歌词跟随

#### 3.3.3 歌词点击跳转

```javascript
// 文件: js/main.js 第215-245行
addLyricClickEvent: function () {
    const lrcContent = document.querySelector('.aplayer-lrc-contents');
    if (lrcContent) {
        lrcContent.addEventListener('click', function (event) {
            if (event.target.tagName.toLowerCase() === 'p') {
                const lyrics = lrcContent.getElementsByTagName('p');
                for (let i = 0; i < lyrics.length; i++) {
                    if (lyrics[i] === event.target) {
                        const player = ap;
                        if (player.lrc.current[i]) {
                            const time = player.lrc.current[i][0];
                            player.seek(time);
                            isScrolling = false;
                            clearTimeout(scrollTimer);
                            if (player.paused) player.play();
                        }
                        event.stopPropagation();
                        break;
                    }
                }
            }
        });
    }
},
```

点击歌词后立即跳转到对应时间点播放，并立即恢复歌词跟随（不等待4秒）。

### 3.4 歌词视觉效果

```css
/* 文件: css/main.css 第198-243行 */
#heoMusic-page .aplayer-info .aplayer-lrc p {
    font-size: 36px;
    line-height: 1.38;
    padding: 8px;
    border-radius: 8px;
    color: #fff;
    font-weight: bold;
    text-align: left;
    filter: blur(2px);        /* 非当前行模糊 */
    opacity: 0.3;             /* 非当前行半透明 */
    transition: all 0.9s cubic-bezier(0.56, 0.17, 0.22, 0.76);
    cursor: pointer;
    word-break: break-all;    /* 强制换行 */
}

#heoMusic-page .aplayer-info .aplayer-lrc p.aplayer-lrc-current {
    filter: blur(0px);        /* 当前行清晰 */
    opacity: 1;               /* 当前行完全不透明 */
    transition: all 0.3s cubic-bezier(0.56, 0.17, 0.22, 0.76);
    text-shadow: 0px 2px 16px #ffffff94;  /* 文字发光效果 */
}

/* 桌面端悬停时显示所有歌词 */
@media screen and (min-width: 768px) {
    #heoMusic-page .aplayer-info .aplayer-lrc:hover p {
        filter: blur(0px);
    }
}
```

**视觉效果要点：**
- 非当前歌词行：模糊(2px) + 30%透明度
- 当前行：清晰 + 100%不透明 + 文字发光
- 切换动画：非当前行0.9s缓动，当前行0.3s快速响应
- 桌面端鼠标悬停在歌词区域时，所有歌词变清晰
- 歌词上下渐隐遮罩：`mask-image: linear-gradient(to bottom, #0000, #000 10%, #000 90%, #0000)`

---

## 四、逐字歌词（Word-by-Word Lyrics）实现

### 结论：HeoMusic **不支持**逐字歌词

经过全面代码分析，HeoMusic **没有实现逐字歌词功能**。具体证据如下：

1. **歌词 API 仅获取标准 LRC 格式**：`Meting.php` 的 `lyric()` 方法只获取 `lrc`（原始歌词）和 `tlyric`（翻译歌词），均为行级时间戳格式 `[mm:ss.xx]`，不包含字级时间戳。

2. **网易云歌词请求参数**：
```php
// 文件: meting-api/src/Meting.php 第741-753行
case 'netease':
$api = array(
    'method' => 'POST',
    'url'    => 'http://music.163.com/api/song/lyric',
    'body'   => array(
        'id' => $id,
        'os' => 'linux',
        'lv' => -1,  // 歌词版本
        'kv' => -1,  // 卡拉OK版本（逐字歌词），设为-1表示不获取
        'tv' => -1,  // 翻译版本
    ),
```

参数 `kv` 设为 `-1`，意味着**没有请求逐字歌词数据**。如果要获取逐字歌词，需要将 `kv` 设为 `1`，网易云会返回包含字级时间戳的 KRC 格式歌词。

3. **APlayer 本身不支持逐字歌词渲染**：APlayer 只支持行级歌词切换，没有字符级高亮动画的 API。

4. **前端无逐字歌词解析逻辑**：`main.js` 和 `Meting.js` 中没有任何解析 KRC 格式或逐字时间戳的代码。

---

## 五、移动端适配方案

### 5.1 断点策略

项目使用 **768px** 作为移动端/桌面端的分界点：

```javascript
// 文件: js/Meting.js 第114行
listFolded: window.innerWidth < 768 ? true : false
```

```javascript
// 文件: js/main.js 第421-428行
window.addEventListener('resize', function() {
  if (window.innerWidth > 768) {
    ap.list.show();
  } else {
    ap.list.hide();
  }
});
```

### 5.2 移动端布局变化

移动端采用完全不同的布局策略：

#### 封面图片隐藏
```css
/* 文件: css/main.css 第713-715行 */
#heoMusic-page .aplayer-pic {
    display: none;  /* 移动端隐藏封面图 */
}
```

#### 歌词区域全屏化
```css
/* 文件: css/main.css 第574-589行 */
#heoMusic-page .aplayer-body {
    width: 100%;
    overflow: hidden;
    position: fixed;
    margin: auto;
    left: 0;
    right: 0;
    top: 0;
    height: calc(100dvh - 200px);
}
#heoMusic-page .aplayer-info .aplayer-lrc {
    margin-top: 0;
    height: calc(100dvh - 100px);
    mask-image: linear-gradient(to bottom, #000, #000, #000, #000, #0000, #0000);
}
```

#### 控制栏重新布局
```css
/* 文件: css/main.css 第591-654行 */
#heoMusic-page .aplayer-info .aplayer-controller {
    width: 100%;
    bottom: 120px;
}
/* 播放按钮居中放大 */
#heoMusic-page .aplayer-info .aplayer-time .aplayer-icon-play {
    margin: auto;
    right: 0;
    left: 0;
    width: 56px;
    height: 56px;
}
/* 上一曲/下一曲按钮对称分布 */
#heoMusic-page .aplayer-info .aplayer-time .aplayer-icon-back {
    margin: auto;
    right: 110px;
}
#heoMusic-page .aplayer-info .aplayer-time .aplayer-icon-forward {
    margin: auto;
    left: 110px;
    right: 0;
}
```

#### 歌曲信息显示在底部
```css
/* 文件: css/main.css 第670-707行 */
#heoMusic-page .aplayer-info .aplayer-music {
    display: flex;
    position: fixed;
    top: calc(100dvh - 178px);
    left: 0;
    margin-left: 32px;
    height: 21px;
    max-width: calc(100vw - 110px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.6;
}
```

#### 歌曲列表弹出式
```css
/* 文件: css/main.css 第508-568行 */
#heoMusic-page .aplayer-list {
    position: fixed;
    z-index: 1003;
    width: 100vw;
    top: 0px;
    left: 0;
    background: var(--heo-white);
    border-radius: 0px 0px 16px 16px;
    height: calc(100dvh - 240px);
}
#heoMusic-page .aplayer-list.aplayer-list-hide {
    top: -100% !important;  /* 隐藏时滑出屏幕 */
}
```

#### 歌词字号调整
```css
/* 文件: css/main.css 第667-669行 */
#heoMusic-page .aplayer-info .aplayer-lrc p {
    font-size: 32px;  /* 桌面端为36px */
}
```

#### 音量控制隐藏
```css
/* 文件: css/main.css 第659-666行 */
#heoMusic-page .aplayer .aplayer-info .aplayer-controller .aplayer-volume-wrap {
    left: -66px;
    display: none;  /* 移动端隐藏音量控制 */
}
```

### 5.3 PWA 支持

```json
// 文件: manifest.json
{
  "name": "HeoMusic",
  "short_name": "HeoMusic",
  "theme_color": "#000000",
  "background_color": "#000000",
  "display": "fullscreen",
  "scope": "/",
  "start_url": "/",
  "icons": [
    { "src": "img/icon-r_mini.webp", "sizes": "192x192", "type": "image/webp" },
    { "src": "img/icon-r.webp", "sizes": "512x512", "type": "image/webp" }
  ]
}
```

支持全屏模式安装到手机桌面，提供类似原生应用的体验。

### 5.4 Media Session API

```javascript
// 文件: js/main.js 第246-336行
setMediaMetadata: function (aplayerObj, isSongPlaying) {
    // 播放时显示当前歌词行作为标题
    if (isSongPlaying && currentLrcContent) {
        songName = currentLrcContent;
        songArtist = `${audio.artist} / ${audio.name}`;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
        title: songName,
        artist: songArtist,
        album: audio.album,
        artwork: [
            { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
            // ... 多种尺寸
            { src: coverUrl, sizes: '512x512', type: 'image/jpeg' }
        ]
    });
},
setupMediaSessionHandlers: function (aplayer) {
    // 系统媒体控制按钮：播放/暂停、上一曲/下一曲、进度条拖动
    navigator.mediaSession.setActionHandler('play', () => aplayer.play());
    navigator.mediaSession.setActionHandler('pause', () => aplayer.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => aplayer.skipBack());
    navigator.mediaSession.setActionHandler('nexttrack', () => aplayer.skipForward());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
        aplayer.audio.currentTime = details.seekTime;
    });
}
```

在手机锁屏界面和通知栏显示歌曲信息、封面和控制按钮。

---

## 六、UI 设计思路

### 6.1 整体设计理念

HeoMusic 采用**沉浸式全屏音乐播放器**设计，以深色为基底，突出封面和歌词内容。

### 6.2 背景设计

```css
/* 文件: css/main.css 第56-84行 */
#music_bg {
    display: none;
    position: fixed;
    z-index: -999;
    width: 200%;
    height: 200%;
    top: -50%;
    left: -50%;
    background-size: 40%;
    transition: 0.6s;
    background-image: url(/img/cover.webp);
}

#music_bg::before {
    content: '';
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(200px);       /* 超强毛玻璃效果 */
    -webkit-backdrop-filter: blur(200px);
    position: fixed;
    z-index: -998;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
}
```

背景使用封面图片放大200%并平铺，叠加 `rgba(0,0,0,0.4)` 黑色半透明层和 200px 模糊的毛玻璃效果，营造沉浸式氛围。

### 6.3 布局结构

**桌面端布局（>768px）：**
```
+--------------------------------------------------+
|  [封面图 300x300]  |  [歌词滚动区域]  | [歌曲列表] |
|                    |                   |            |
|                    |                   |            |
+--------------------------------------------------+
|  [进度条]                                         |
|  [控制按钮: 随机/上一曲/播放/下一曲/循环] [音量]    |
+--------------------------------------------------+
```

关键 CSS：
```css
#heoMusic-page .aplayer {
    display: flex;
    flex-direction: row;
    height: calc(100dvh - 170px);
    gap: 40px;
}
#heoMusic-page .aplayer-body { width: 70%; }
#heoMusic-page .aplayer-list { width: 100%; flex: 1; }
```

**移动端布局（<=768px）：**
```
+------------------------+
|                        |
|    [歌词滚动区域]       |
|    (全屏)              |
|                        |
+------------------------+
| [歌曲名 - 歌手]        |
+------------------------+
| [进度条]               |
+------------------------+
| [随机] [<<] [播放] [>>] [循环] |
+------------------------+
```

### 6.4 封面图动效

```css
/* 文件: css/main.css 第149-164行 */
#heoMusic-page .aplayer-pic {
    width: 300px;
    height: 300px;
    border-radius: 12px;
    transform: scale(0.9);      /* 默认缩小 */
    margin-top: 8px;
}

#heoMusic-page.aplayer_playing .aplayer-pic {
    transform: scale(1);         /* 播放时放大到原始大小 */
    box-shadow: var(--heo-shadow-black);
}
```

播放状态时封面从 0.9 倍放大到 1.0 倍，配合阴影变化，产生"呼吸"效果。

### 6.5 歌曲列表高亮

```css
/* 文件: css/main.css 第372-425行 */
#heoMusic-page ol > li.aplayer-list-light {
    background: var(--heo-black-op);
    border-radius: 6px;
    height: 60px;
    display: flex;
    flex-direction: column;
    opacity: 1;
}
#heoMusic-page ol > li.aplayer-list-light .aplayer-list-title {
    font-size: 20px;
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
```

当前播放歌曲在列表中以更大字号、粗体、背景高亮显示。

### 6.6 主题色动态提取

```javascript
// 文件: js/main.js 第337-361行
updateThemeColorWithImage(img) {
    if (local) {
        const updateThemeColor = (colorThief) => {
            const dominantColor = colorThief.getColor(img);
            const metaThemeColor = document.querySelector('meta[name="theme-color"]');
            if (metaThemeColor) {
                // 叠加rgba(0,0,0,0.4)的效果
                const r = Math.round(dominantColor[0] * 0.6);
                const g = Math.round(dominantColor[1] * 0.6);
                const b = Math.round(dominantColor[2] * 0.6);
                metaThemeColor.setAttribute('content', `rgb(${r},${g},${b})`);
            }
        };
        // 使用 color-thief 库提取封面主色调
    }
}
```

仅对本地音乐模式生效，使用 ColorThief 库提取封面主色调，动态设置浏览器主题色。

### 6.7 CSS 变量系统

```css
/* 文件: css/main.css 第3-27行 */
:root {
  --heo-white: #fff;
  --heo-white-op: rgba(255, 255, 255, 0.2);
  --heo-black: #000;
  --heo-black-op: rgba(0, 0, 0, 0.2);
  --heo-gray: #999999;
  --heo-main: var(--heo-theme);
  --heo-shadow-theme: 0 8px 12px -3px var(--heo-theme-op);
  /* ... */
}
```

使用 CSS 自定义属性统一管理颜色、阴影等设计令牌。

---

## 七、播放顺序/随机播放实现

### 7.1 播放模式配置

播放模式通过 `<meting-js>` 标签的 `order` 属性配置：

```javascript
// 文件: js/main.js 第179行
heoMusicPage.innerHTML = `<meting-js id="${id}" server="${server}" type="${playlistType}" mutex="true" preload="auto" order="random"></meting-js>`;
```

默认使用 `order="random"`（随机播放）。

### 7.2 APlayer 内置播放模式

播放顺序/随机播放的逻辑由 **APlayer 内部实现**（`APlayer.min.js`），HeoMusic 没有自定义这部分逻辑。APlayer 支持以下播放模式：

- `order="list"`：顺序播放
- `order="random"`：随机播放
- `order="single"`：单曲循环

用户可以通过界面上的循环模式按钮（`aplayer-icon-loop`）切换播放模式。

### 7.3 循环模式按钮

```css
/* 文件: css/main.css 第465-467行 */
body .aplayer .aplayer-info .aplayer-controller .aplayer-time .aplayer-icon.aplayer-icon-loop {
    margin-right: 7px;
}
```

移动端循环/随机按钮样式：
```css
/* 文件: css/main.css 第632-645行 */
#heoMusic-page .aplayer-info .aplayer-time .aplayer-icon-order {
    position: absolute;
    left: 22px;
    width: 24px;
    height: 24px;
    opacity: 0.4;
}
#heoMusic-page .aplayer-info .aplayer-time .aplayer-icon-loop {
    position: absolute;
    right: 25px;
    width: 24px;
    height: 24px;
    opacity: 0.4;
}
```

### 7.4 互斥播放

```javascript
// meting-js 标签中 mutex="true"
```

`mutex=true` 确保同一时间只有一首歌曲在播放，防止多个播放器实例同时发声。

---

## 八、其他重要实现细节

### 8.1 音乐数据加载策略

```javascript
// 文件: js/main.js 第17-47行
if (typeof remoteMusic !== 'undefined' && remoteMusic) {
  fetch(remoteMusic)
    .then(response => response.json())
    .then(data => {
      if (Array.isArray(data)) {
        localMusic = data;
      }
      loadMusicScript();
    })
    .catch(error => {
      console.error('Error fetching remoteMusic:', error);
      loadMusicScript();
    });
} else {
  loadMusicScript();
}

function loadMusicScript() {
  if (typeof localMusic === 'undefined' || !Array.isArray(localMusic) || localMusic.length === 0) {
    // 加载 Meting.js（在线音乐模式）
    var script = document.createElement('script');
    script.src = './js/Meting.js';
    document.body.appendChild(script);
  } else {
    // 加载 localEngine.js（本地音乐模式）
    var script = document.createElement('script');
    script.src = './js/localEngine.js';
    document.body.appendChild(script);
    local = true;
  }
}
```

三种音乐来源的优先级：`remoteMusic` > `localMusic` > 在线API

### 8.2 键盘快捷键

```javascript
// 文件: js/main.js 第383-418行
document.addEventListener("keydown", function (event) {
  if (event.code === "Space") { ap.toggle(); }        // 空格：播放/暂停
  if (event.keyCode === 39) { ap.skipForward(); }      // 右箭头：下一曲
  if (event.keyCode === 37) { ap.skipBack(); }         // 左箭头：上一曲
  if (event.keyCode === 38) { volume += 0.1; ap.volume(volume, true); }  // 上箭头：音量+
  if (event.keyCode === 40) { volume += -0.1; ap.volume(volume, true); } // 下箭头：音量-
});
```

### 8.3 URL 参数支持自定义歌单

```javascript
// 文件: js/main.js 第171-184行
getCustomPlayList: function () {
    const heoMusicPage = document.getElementById("heoMusic-page");
    const playlistType = params.get("type") || "playlist";

    if (params.get("id") && params.get("server")) {
        var id = params.get("id")
        var server = params.get("server")
        heoMusicPage.innerHTML = `<meting-js id="${id}" server="${server}" type="${playlistType}" mutex="true" preload="auto" order="random"></meting-js>`;
    } else {
        heoMusicPage.innerHTML = `<meting-js id="${userId}" server="${userServer}" type="${userType}" mutex="true" preload="auto" order="random"></meting-js>`;
    }
},
```

支持通过 URL 参数 `?id=xxx&server=xxx&type=xxx` 动态切换歌单。

### 8.4 本地音乐 URL 编码

```javascript
// 文件: js/localEngine.js 第1-15行
var encodedLocalMusic = localMusic.map(item => ({
  name: item.name,
  artist: item.artist,
  url: encodeNonAscii(item.url),
  cover: encodeNonAscii(item.cover),
  lrc: encodeNonAscii(item.lrc)
}));

function encodeNonAscii(str) {
  return str.replace(/[^\x00-\x7F]/g, function(c) {
    return encodeURIComponent(c);
  });
}
```

对本地音乐路径中的非 ASCII 字符（如中文文件名）进行 URL 编码，确保文件能正确加载。

---

## 九、项目文件结构

```
HeoMusic/
├── index.html              # 主页面
├── config.js.demo          # 配置文件模板
├── manifest.json           # PWA 配置
├── css/
│   ├── APlayer.css         # APlayer 基础样式
│   └── main.css            # HeoMusic 自定义样式（核心）
├── js/
│   ├── APlayer.min.js      # APlayer 播放器核心（已修改）
│   ├── Meting.js           # MetingJS Web Component
│   ├── main.js             # HeoMusic 主逻辑（核心）
│   ├── localEngine.js      # 本地音乐引擎
│   └── color-thief.min.js  # 颜色提取库
├── img/                    # 图标和默认封面
└── meting-api/             # PHP 后端 API
    ├── index.php           # API 入口（路由和业务逻辑）
    ├── src/Meting.php      # Meting 框架（多平台音乐数据获取）
    └── public/index.php    # API 文档页面
```

---

## 十、总结与关键发现

| 功能 | 实现方式 | 核心文件 |
|------|---------|---------|
| 封面图片 | CDN URL + ID加密 + 尺寸参数(800x800) | `Meting.php` pic() |
| 歌词获取 | LRC格式 + 翻译歌词合并 | `Meting.php` lyric() + `index.php` |
| 歌词滚动 | requestAnimationFrame + easeOutQuad缓动 | `main.js` scrollLyric() |
| 逐字歌词 | **不支持** (kv参数为-1) | - |
| 移动端适配 | 768px断点 + 完全重排布局 | `main.css` @media |
| UI设计 | 深色沉浸式 + 毛玻璃背景 + 歌词模糊/清晰切换 | `main.css` |
| 播放模式 | APlayer内置 (list/random/single) | `APlayer.min.js` |
| PWA支持 | manifest.json + Media Session API | `manifest.json` + `main.js` |
