const axios = require('axios');

async function findKugouPlaylistId() {
    const keyword = '执风喜欢的音乐';
    const url = `http://mobilecdnbj.kugou.com/api/v3/search/special?keyword=${encodeURIComponent(keyword)}&pagesize=20`;
    
    try {
        const res = await axios.get(url);
        const list = res.data.data.info;
        console.log('搜索结果:');
        list.forEach(item => {
            console.log(`ID: ${item.specialid}, 名字: ${item.specialname}, 昵称: ${item.nickname}`);
        });
    } catch (err) {
        console.error('搜索失败:', err.message);
    }
}

findKugouPlaylistId();
