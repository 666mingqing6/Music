/**
 * Cloudflare Workers — 自建 Meting API
 *
 * 替代 api.injahow.cn，直接对接网易云音乐 weapi。
 * 支持 playlist / song / url / pic / lrc 五种 type。
 *
 * 部署：
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy
 *
 * 部署后将 js/player.js 里的 this.api 替换为你的 Worker 域名即可。
 */

// ============================================================
//  MD5 (RFC 1321) — 纯 JS，Web Crypto 不支持 MD5
// ============================================================

// input: string（文本）或 Uint8Array（二进制）
function md5Raw(input) {
  function rotateLeft(x, n) { return (x << n) | (x >>> (32 - n)); }
  function addUnsigned(x, y) { return ((x & 0x7fffffff) + (y & 0x7fffffff)) ^ (x & 0x80000000) ^ (y & 0x80000000); }

  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const len = bytes.length;
  const padded = new Uint8Array((((len + 8) >>> 6) + 1) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, len * 8, true);

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  for (let i = 0; i < padded.length; i += 64) {
    const chunk = new Uint32Array(padded.buffer.slice(i, i + 64));
    for (let j = 0; j < 16; j++) chunk[j] = (new DataView(padded.buffer)).getUint32(i + j * 4, true);

    let aa = a, bb = b, cc = c, dd = d;

    function f(x, y, z) { return (x & y) | (~x & z); }
    function g(x, y, z) { return (x & z) | (y & ~z); }
    function h(x, y, z) { return x ^ y ^ z; }
    function i(x, y, z) { return y ^ (x | ~z); }

    const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    const S41 = 6, S42 = 10, S43 = 15, S44 = 21;

    const T = [];
    for (let j = 1; j <= 64; j++) T[j] = Math.floor((1 << 30) * Math.abs(Math.sin(j)));

    // Round 1
    function op(aa_val, bb_val, cc_val, dd_val, k, s, i_idx) {
      return addUnsigned(rotateLeft(addUnsigned(addUnsigned(aa_val, f(bb_val, cc_val, dd_val)), addUnsigned(chunk[k], T[i_idx])), s), bb_val);
    }
    a = op(a, b, c, d, 0, S11, 1);  d = op(d, a, b, c, 1, S12, 2);
    c = op(c, d, a, b, 2, S13, 3);  b = op(b, c, d, a, 3, S14, 4);
    a = op(a, b, c, d, 4, S11, 5);  d = op(d, a, b, c, 5, S12, 6);
    c = op(c, d, a, b, 6, S13, 7);  b = op(b, c, d, a, 7, S14, 8);
    a = op(a, b, c, d, 8, S11, 9);  d = op(d, a, b, c, 9, S12, 10);
    c = op(c, d, a, b, 10, S13, 11); b = op(b, c, d, a, 11, S14, 12);
    a = op(a, b, c, d, 12, S11, 13); d = op(d, a, b, c, 13, S12, 14);
    c = op(c, d, a, b, 14, S13, 15); b = op(b, c, d, a, 15, S14, 16);

    // Round 2
    function opG(aa_val, bb_val, cc_val, dd_val, k, s, i_idx) {
      return addUnsigned(rotateLeft(addUnsigned(addUnsigned(aa_val, g(bb_val, cc_val, dd_val)), addUnsigned(chunk[k], T[i_idx])), s), bb_val);
    }
    a = opG(a, b, c, d, 1, S21, 17);  d = opG(d, a, b, c, 6, S22, 18);
    c = opG(c, d, a, b, 11, S23, 19); b = opG(b, c, d, a, 0, S24, 20);
    a = opG(a, b, c, d, 5, S21, 21);  d = opG(d, a, b, c, 10, S22, 22);
    c = opG(c, d, a, b, 15, S23, 23); b = opG(b, c, d, a, 4, S24, 24);
    a = opG(a, b, c, d, 9, S21, 25);  d = opG(d, a, b, c, 14, S22, 26);
    c = opG(c, d, a, b, 3, S23, 27);  b = opG(b, c, d, a, 8, S24, 28);
    a = opG(a, b, c, d, 13, S21, 29); d = opG(d, a, b, c, 2, S22, 30);
    c = opG(c, d, a, b, 7, S23, 31);  b = opG(b, c, d, a, 12, S24, 32);

    // Round 3
    function opH(aa_val, bb_val, cc_val, dd_val, k, s, i_idx) {
      return addUnsigned(rotateLeft(addUnsigned(addUnsigned(aa_val, h(bb_val, cc_val, dd_val)), addUnsigned(chunk[k], T[i_idx])), s), bb_val);
    }
    a = opH(a, b, c, d, 5, S31, 33);  d = opH(d, a, b, c, 8, S32, 34);
    c = opH(c, d, a, b, 11, S33, 35); b = opH(b, c, d, a, 14, S34, 36);
    a = opH(a, b, c, d, 1, S31, 37);  d = opH(d, a, b, c, 4, S32, 38);
    c = opH(c, d, a, b, 7, S33, 39);  b = opH(b, c, d, a, 10, S34, 40);
    a = opH(a, b, c, d, 13, S31, 41); d = opH(d, a, b, c, 0, S32, 42);
    c = opH(c, d, a, b, 3, S33, 43);  b = opH(b, c, d, a, 6, S34, 44);
    a = opH(a, b, c, d, 9, S31, 45);  d = opH(d, a, b, c, 12, S32, 46);
    c = opH(c, d, a, b, 15, S33, 47); b = opH(b, c, d, a, 2, S34, 48);

    // Round 4
    function opI(aa_val, bb_val, cc_val, dd_val, k, s, i_idx) {
      return addUnsigned(rotateLeft(addUnsigned(addUnsigned(aa_val, i(bb_val, cc_val, dd_val)), addUnsigned(chunk[k], T[i_idx])), s), bb_val);
    }
    a = opI(a, b, c, d, 0, S41, 49);  d = opI(d, a, b, c, 7, S42, 50);
    c = opI(c, d, a, b, 14, S43, 51); b = opI(b, c, d, a, 5, S44, 52);
    a = opI(a, b, c, d, 12, S41, 53); d = opI(d, a, b, c, 3, S42, 54);
    c = opI(c, d, a, b, 10, S43, 55); b = opI(b, c, d, a, 1, S44, 56);
    a = opI(a, b, c, d, 8, S41, 57);  d = opI(d, a, b, c, 15, S42, 58);
    c = opI(c, d, a, b, 6, S43, 59);  b = opI(b, c, d, a, 13, S44, 60);
    a = opI(a, b, c, d, 4, S41, 61);  d = opI(d, a, b, c, 11, S42, 62);
    c = opI(c, d, a, b, 2, S43, 63);  b = opI(b, c, d, a, 9, S44, 64);

    a = addUnsigned(a, aa); b = addUnsigned(b, bb);
    c = addUnsigned(c, cc); d = addUnsigned(d, dd);
  }

  const result = new Uint8Array(16);
  const dv = new DataView(result.buffer);
  dv.setUint32(0, a, true);
  dv.setUint32(4, b, true);
  dv.setUint32(8, c, true);
  dv.setUint32(12, d, true);
  return result;
}

// ============================================================
//  Crypto helpers
// ============================================================

function randomHex(length) {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

// AES-128-CBC encrypt, returns base64 string
async function aesEncrypt(plaintext, keyStr, ivStr) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const key = encoder.encode(keyStr);
  const iv = encoder.encode(ivStr);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'AES-CBC' }, false, ['encrypt']
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv }, cryptoKey, data
  );
  return bytesToBase64(new Uint8Array(encrypted));
}

// BigInt modular exponentiation (textbook RSA)
function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function rsaEncrypt(text) {
  const modulus = BigInt(
    '0x00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725' +
    '152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ec' +
    'bda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813' +
    'cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'
  );
  const pubkey = 0x010001n;

  // Reverse the text, convert to hex bigint
  const reversed = text.split('').reverse().join('');
  const hex = Array.from(new TextEncoder().encode(reversed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const m = BigInt('0x' + hex);
  const result = modPow(m, pubkey, modulus);
  return result.toString(16).padStart(256, '0');
}

// ============================================================
//  Netease weapi encryption
// ============================================================

const NONCE = '0CoJUm6Qyw8W8jud';
const IV = '0102030405060708';
// 安全后备：当 BigInt 不可用时的 encSecKey (对应 skey='B3v3kH4vRPWRJFfH')
const FALLBACK_ENCSECKEY =
  '85302b818aea19b68db899c25dac229412d9bba9b3fcfe4f714dc016bc1686fc' +
  '446a08844b1f8327fd9cb623cc189be00c5a365ac835e93d4858ee66f43fdc59' +
  'e32aaed3ef24f0675d70172ef688d376a4807228c55583fe5bac647d10ecef15' +
  '220feef61477c28cae8406f6f9896ed329d6db9f88757e31848a6c2ce2f94308';

async function weapiEncrypt(object) {
  const body = JSON.stringify(object);

  // 生成随机 AES 密钥（或用后备）
  let skey;
  try { skey = randomHex(16); } catch (_) { skey = 'B3v3kH4vRPWRJFfH'; }

  // 两重 AES-128-CBC 加密
  const firstPass = await aesEncrypt(body, NONCE, IV);
  const params = await aesEncrypt(firstPass, skey, IV);

  // RSA 加密 skey
  let encSecKey;
  try {
    encSecKey = rsaEncrypt(skey);
  } catch (_) {
    encSecKey = FALLBACK_ENCSECKEY;
  }

  return { params, encSecKey };
}

// ============================================================
//  Netease API 请求
// ============================================================

function randomChinaIP() {
  // PHP Meting 的 IP 范围：112.90.0.0 ~ 112.91.35.255 (中国广东)
  const base = (112 << 24) | (90 << 16);
  const range = (1 << 16) | (35 << 8) | 255; // ~ 112.91.35.255
  const ip = base + Math.floor(Math.random() * range);
  return `${(ip >> 24) & 0xff}.${(ip >> 16) & 0xff}.${(ip >> 8) & 0xff}.${ip & 0xff}`;
}

function buildHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://music.163.com/',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': 'appver=8.2.30; os=iPhone OS; osver=15.0; EVNSM=1.0.0; buildver=2206; channel=distribution; machineid=iPhone13.3',
    'X-Real-IP': randomChinaIP(),
  };
}

async function weapiRequest(path, body) {
  const encrypted = await weapiEncrypt(body);
  const formBody = `params=${encodeURIComponent(encrypted.params)}&encSecKey=${encodeURIComponent(encrypted.encSecKey)}`;

  const url = `https://music.163.com${path}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: formBody,
  });
  return resp.json();
}

// ============================================================
//  netease_encryptId — 用于构造图片直链
// ============================================================

function neteaseEncryptId(id) {
  const magic = '3go8&$8*3*3h0k(2)2';
  // 直接操作原始字节，绕过 TextEncoder 的 UTF-8 编码
  // （XOR 结果可能包含 >127 的字节，UTF-8 会把它扩展成 2 字节导致 MD5 错误）
  const bytes = new Uint8Array(id.length);
  for (let i = 0; i < id.length; i++) {
    bytes[i] = id.charCodeAt(i) ^ magic.charCodeAt(i % magic.length);
  }
  const hash = md5Raw(bytes);
  const b64 = bytesToBase64(hash);
  return b64.replace(/\//g, '_').replace(/\+/g, '-');
}

// 从网易云 picUrl 中提取数字 ID（避免 JSON.parse 对大数丢失精度）
// picUrl 格式：https://p4.music.126.net/<encrypted>/<picId>.jpg?param=...
function extractPicId(picUrl) {
  if (!picUrl) return '';
  const match = picUrl.match(/\/(\d+)\.(jpg|png|webp)/);
  return match ? match[1] : '';
}

// ============================================================
//  API 处理器
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handlePlaylist(id, workerOrigin) {
  // 第 1 步：获取歌单元数据，拿到全部 trackIds
  const playlistData = await weapiRequest('/weapi/v3/playlist/detail', {
    id: id,
    n: 100000,
    s: 0,
  });

  if (!playlistData.playlist || !playlistData.playlist.trackIds) {
    return [];
  }

  const trackIds = playlistData.playlist.trackIds;
  if (!trackIds.length) return [];

  // 第 2 步：批量查歌曲详情（每批最多 500 首，一次搞定）
  const allTracks = [];
  const BATCH = 500;

  for (let i = 0; i < trackIds.length; i += BATCH) {
    const batch = trackIds.slice(i, i + BATCH);
    const c = JSON.stringify(batch.map(t => ({ id: t.id, v: 0 })));
    const songData = await weapiRequest('/weapi/v3/song/detail', { c });
    if (songData.songs) {
      allTracks.push(...songData.songs);
    }
  }

  // 第 3 步：格式化输出
  return allTracks.map(track => {
    const picUrl = (track.al && track.al.picUrl) ? track.al.picUrl : '';
    const picId = extractPicId(picUrl) || track.id;
    // 把 picUrl 带在 src 参数里，pic 端点直接用，绕开 md5(encryptId)
    const picSrc = picUrl ? `&src=${encodeURIComponent(picUrl)}` : '';
    return {
      name: track.name,
      artist: (track.ar || []).map(a => a.name).join('/'),
      url: `${workerOrigin}?server=netease&type=url&id=${track.id}`,
      pic: `${workerOrigin}?server=netease&type=pic&id=${picId}${picSrc}`,
      lrc: `${workerOrigin}?server=netease&type=lrc&id=${track.id}`,
    };
  });
}

async function handleSong(id, workerOrigin) {
  const data = await weapiRequest('/weapi/v3/song/detail', {
    c: JSON.stringify([{ id: id, v: 0 }]),
  });

  if (!data.songs || !data.songs[0]) {
    return [];
  }

  const song = data.songs[0];
  // 从 picUrl 提取 pic ID，避免 JS BigInt 精度丢失
  const picUrl = (song.al && song.al.picUrl) ? song.al.picUrl : '';
  const picId = extractPicId(picUrl) || song.id;
  // 把 picUrl 带在 src 参数里，pic 端点直接用，绕开 md5(encryptId)
  const picSrc = picUrl ? `&src=${encodeURIComponent(picUrl)}` : '';

  return [{
    name: song.name,
    artist: (song.ar || []).map(a => a.name).join('/'),
    url: `${workerOrigin}?server=netease&type=url&id=${song.id}`,
    pic: `${workerOrigin}?server=netease&type=pic&id=${picId}${picSrc}`,
    lrc: `${workerOrigin}?server=netease&type=lrc&id=${song.id}`,
  }];
}

async function handleUrl(id) {
  // Cloudflare Worker IP 被网易云封锁，拿不到 mp3 地址
  // 直接 302 到网易云公开直链，让用户浏览器自己的 IP 去跟
  const publicUrl = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
  return { ok: true, url: publicUrl };
}

async function handlePic(id, src) {
  // 优先使用 src 参数里的真实 picUrl（由 playlist/song 端点传入）
  // 这样完全绕开 md5(encryptId) 计算，不含任何自己算的加密 ID
  if (src) {
    let url = decodeURIComponent(src);
    url = url.replace(/param=\d+y\d+/, 'param=800y800');
    if (!url.includes('param=')) {
      url += (url.includes('?') ? '&' : '?') + 'param=800y800';
    }
    return url;
  }

  // 后备：自己算加密 ID 构造 URL（直接访问 ?type=pic&id=xxx 时走这里）
  const encryptedId = neteaseEncryptId(id);
  return `https://p3.music.126.net/${encryptedId}/${id}.jpg?param=800y800`;
}

async function handleLrc(id) {
  const data = await weapiRequest('/weapi/song/lyric', {
    id: id,
    os: 'linux',
    lv: -1,
    kv: -1,
    tv: -1,
  });
  return data.lrc ? (data.lrc.lyric || '') : '';
}

// ============================================================
//  Worker 入口
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { searchParams } = url;

    // OPTIONS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const server = searchParams.get('server') || 'netease';
    const type = searchParams.get('type') || 'playlist';
    const id = searchParams.get('id');

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'missing id parameter' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    // 目前只支持 netease
    if (server !== 'netease') {
      return new Response(
        JSON.stringify({ error: `server "${server}" not yet supported` }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    try {
      switch (type) {
        case 'playlist': {
          const result = await handlePlaylist(id, url.origin);
          return new Response(JSON.stringify(result), {
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          });
        }

        case 'song': {
          const result = await handleSong(id, url.origin);
          return new Response(JSON.stringify(result), {
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          });
        }

        case 'url': {
          const result = await handleUrl(id);
          if (result && result.ok) {
            return Response.redirect(result.url, 302);
          }
          return new Response(JSON.stringify(result || { error: 'url not found' }), {
            status: 404,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          });
        }

        case 'pic': {
          const src = searchParams.get('src');
          const picUrl = await handlePic(id, src);
          if (picUrl) {
            return Response.redirect(picUrl, 302);
          }
          return new Response(JSON.stringify({ error: 'pic not found' }), {
            status: 404,
            headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
          });
        }

        case 'lrc': {
          const lrc = await handleLrc(id);
          return new Response(lrc || '[00:00.00]暂无歌词', {
            headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        default:
          return new Response(
            JSON.stringify({ error: `unknown type "${type}"` }),
            { status: 400, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } }
          );
      }
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || 'internal error' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  },
};
