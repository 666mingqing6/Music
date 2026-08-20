# MQ Music · 音乐馆

沉浸式个人音乐播放器（纯静态前端，零构建），数据来自[自建 Meting API](https://github.com/666mingqing6/meting-api)（Cloudflare Workers + D1）。

## 功能

- **网易云歌单 + 本地音乐混合播放**：`config.js` 配置网易云歌单 ID 与本地音乐直链
- **加权洗牌"平均随机"**：Gumbel-top 加权无放回抽样
  - 一轮内零重复（告别"过几首又播同一首"）
  - 播放次数低的歌优先，长期收敛到人人平等
  - 新歌按"已播 4 次"起步（贝叶斯平滑），优先但不霸占
- **账户系统**：注册/登录后播放计数云端同步（D1），换浏览器/设备不丢失；游客模式完整可用（纯 localStorage）
- **Web Audio 音效**：3D 环绕 / 沉浸 / 现场感 / 迷幻 / 流行 / 重低音
- **逐行 + 逐字歌词**、MediaSession（锁屏控制）、移动端适配、PWA

## 架构

```
├── index.html        # 入口页面
├── config.js         # 唯一配置入口（API 地址 / 歌单 / 本地音乐 / 随机参数）
├── js/
│   ├── player.js     # 播放器核心（播放/歌词/音效/搜索/洗牌队列）
│   ├── playstats.js  # 播放计数（song_key 稳定标识 + 云同步调度）
│   └── auth.js       # 账户模块（登录/注册/登出 + 计数同步 UI）
├── css/modern.css    # 样式
├── img/              # 图标与默认封面
└── manifest.json     # PWA manifest
```

后端 API（独立仓库）：[666mingqing6/meting-api](https://github.com/666mingqing6/meting-api)
- 音乐数据：`?type=playlist|song|url|pic|lrc|search`（网易云 weapi 直连 + 代理回退解决 525 封锁）
- 账户：`/auth/register|login|logout` + `/user/playcounts`（D1 存储，PBKDF2 密码哈希 + 登录限流）

## 配置（config.js）

```js
var userId = "12675886878";     // 网易云歌单 ID
var metingApiBase = "https://meting-api.646474.xyz";  // API 地址（全站唯一）
var shufflePrior = 4;           // 新歌冷启动平滑底数（越大新歌特权越小）
var shuffleAlpha = 1;           // 播放次数偏置强度（0=纯均匀，1=线性）
var localMusic = [ ... ];       // 本地音乐（url/cover/lrc 直链）
```

## 部署（Cloudflare Pages）

纯静态站，两种方式：

1. **Dashboard 连接 GitHub**：Workers & Pages → Create → Pages → Connect to Git → 选本仓库，框架预设 `None`，构建命令留空，输出目录 `/`。之后 push 即自动部署。
2. **wrangler 直传**：`npx wrangler pages deploy . --project-name=music`

国内访问：`*.pages.dev` 同样被 DNS 污染，参照 meting-api 仓库 README 的华为云 DNS 方案（CNAME + 大陆 A 记录指向 CF 边缘 IP）。

## 致谢

基于 [HeoMusic](https://github.com/zhheo/HeoMusic)（Apache-2.0）深度重构。
