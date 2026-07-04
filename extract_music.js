const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const mm = require('music-metadata');
const vm = require('vm');

// 配置信息
const CONFIG_FILE = path.join(__dirname, 'config.js');
const OUTPUT_DIR = path.join(__dirname, 'LocalMusicFiles');
const LOG_FILE = path.join(__dirname, 'download.log');
const MANIFEST_FILE = path.join(__dirname, 'local_files_manifest.json');
const RETRY_LIMIT = 3;

// 确保输出目录存在
fs.ensureDirSync(OUTPUT_DIR);

// 日志记录函数
function log(message) {
    const timestamp = new Date().toLocaleString();
    const logEntry = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(LOG_FILE, logEntry);
}

// 读取并解析 config.js
function parseConfig() {
    try {
        const content = fs.readFileSync(CONFIG_FILE, 'utf8');
        const sandbox = { localMusic: [] };
        vm.createContext(sandbox);
        vm.runInContext(content, sandbox);
        return {
            localMusic: sandbox.localMusic || []
        };
    } catch (err) {
        log(`错误: 无法解析 config.js - ${err.message}`);
        return null;
    }
}

// 下载文件（支持重试）
async function downloadFile(url, destPath) {
    const fileName = path.basename(destPath);
    
    for (let i = 0; i <= RETRY_LIMIT; i++) {
        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream',
                timeout: 30000
            });

            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
                return true;
            }
            throw new Error('文件下载后大小为0');
        } catch (err) {
            log(`下载失败 [${i}/${RETRY_LIMIT}]: ${fileName} - ${err.message}`);
            if (i === RETRY_LIMIT) {
                if (fs.existsSync(destPath)) fs.removeSync(destPath);
                return false;
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// 规范化名称
function sanitize(str) {
    return str ? str.replace(/[\\/:*?"<>|]/g, '_').trim() : 'Unknown';
}

// 主函数
async function main() {
    log('=== HeoMusic 原始文件提取工具启动 (localMusic Only) ===');
    
    const config = parseConfig();
    if (!config) return;

    const allMusic = config.localMusic;
    const uniqueMusic = [];
    const seen = new Set();

    for (const song of allMusic) {
        const key = `${song.url}`.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            uniqueMusic.push(song);
        }
    }

    log(`准备提取 ${uniqueMusic.length} 个原始文件`);

    const manifest = [];

    for (let i = 0; i < uniqueMusic.length; i++) {
        const song = uniqueMusic[i];
        const artist = sanitize(song.artist);
        const title = sanitize(song.name);
        
        // 自动检测后缀名
        let ext = '.mp3';
        try {
            const urlObj = new URL(song.url);
            ext = path.extname(urlObj.pathname) || '.mp3';
        } catch (e) {
            if (song.url.toLowerCase().includes('.flac')) ext = '.flac';
            else if (song.url.toLowerCase().includes('.wav')) ext = '.wav';
            else if (song.url.toLowerCase().includes('.lrc')) ext = '.lrc';
            else if (song.url.toLowerCase().includes('.jpg')) ext = '.jpg';
            else if (song.url.toLowerCase().includes('.png')) ext = '.png';
            else if (song.url.toLowerCase().includes('.webp')) ext = '.webp';
        }

        const fileName = `${artist} - ${title}${ext}`;
        const destPath = path.join(OUTPUT_DIR, fileName);

        log(`[${i + 1}/${uniqueMusic.length}] 提取中: ${fileName}`);

        if (fs.existsSync(destPath)) {
            log(`  - 文件已存在，跳过`);
            manifest.push({ ...song, localPath: destPath, status: 'exists' });
            continue;
        }

        const success = await downloadFile(song.url, destPath);
        if (success) {
            log(`  - 提取成功`);
            manifest.push({ ...song, localPath: destPath, status: 'downloaded' });
        } else {
            log(`  - 提取失败`);
            manifest.push({ ...song, localPath: destPath, status: 'failed' });
        }
    }

    fs.writeJsonSync(MANIFEST_FILE, manifest, { spaces: 2 });
    log(`\n=== 提取完成 ===`);
    log(`- 文件保存目录: ${OUTPUT_DIR}`);
    log(`- 提取日志: ${LOG_FILE}`);
    log(`- 文件清单: ${MANIFEST_FILE}`);
}

main().catch(err => log(`致命错误: ${err.message}`));
