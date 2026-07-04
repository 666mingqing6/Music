// 默认配置
var userId = "12675886878"; 
var userServer = "netease";
var userType = "playlist";

// 本地音乐配置
var localMusic = [
  {
    name: '清明上河图(DJ版)',
    artist: '李玉刚',
    url: 'https://tu.646474.xyz/qmsht.mp3',
    cover: 'https://tu.646474.xyz/1772539733099.jpg',
    lrc: 'https://tu.646474.xyz/1772550079435.lrc'
  },
  {
    name: '游山恋(DJKK版0.8X)',
    artist: '浅影阿',
    url: 'https://tu.646474.xyz/1772819880601.mp3',
    cover: 'https://tu.646474.xyz/1772774531443.jpg',
    lrc: 'https://tu.646474.xyz/1772774629714.lrc'
  },
  {
    name: '精卫-我以为你能听懂我的隐喻',
    artist: '一颗狼星',
    url: 'https://tu.646474.xyz/1772844561679.flac',
    cover: 'https://tu.646474.xyz/1772844819459.jpg',
    lrc: 'https://tu.646474.xyz/%E7%BA%AF%E9%9F%B3%E4%B9%90.lrc'
  },
  {
    name: 'Bleeding Love',
    artist: 'Ni/Co',
    url: 'https://tu.646474.xyz/BleedingLove.mp3',
    cover: 'https://tu.646474.xyz/BleedingLove.jpg',
    lrc: 'https://tu.646474.xyz/BleedingLove.lrc'
  },
  {
    name: 'Nevada (Vicetone Lofi Mix)',
    artist: 'Cozi Zuehlsdorff, Vicetone',
    url: 'https://tu.646474.xyz/Nevada%20_Vicetone%20Lofi%20Mix.mp3',
    cover: 'https://tu.646474.xyz/Nevada%20_Vicetone%20Lofi%20Mix.jpg',
    lrc: 'https://tu.646474.xyz/Nevada%20_Vicetone%20Lofi%20Mix.lrc'
  },
  {
    name: 'Sacred Play Secret Place',
    artist: 'Matryoshka',
    url: 'https://tu.646474.xyz/Sacred%20Play%20Secret%20Place.mp3',
    cover: 'https://tu.646474.xyz/Sacred%20Play%20Secret%20Place.jpg',
    lrc: 'https://tu.646474.xyz/Sacred%20Play%20Secret%20Place.lrc'
  },
  {
    name: '游京 (我闻着饼香)',
    artist: 'Dj阿农',
    url: 'https://tu.646474.xyz/%E6%B8%B8%E4%BA%AC_%E6%88%91%E9%97%BB%E7%9D%80%E9%A5%BC%E9%A6%99.mp3',
    cover: 'https://tu.646474.xyz/%E6%B8%B8%E4%BA%AC_%E6%88%91%E9%97%BB%E7%9D%80%E9%A5%BC%E9%A6%99.jpg',
    lrc: 'https://tu.646474.xyz/%E6%B8%B8%E4%BA%AC_%E6%88%91%E9%97%BB%E7%9D%80%E9%A5%BC%E9%A6%99.lrc'
  },
  {
    name: 'Ice On My Baby (sped-up)',
    artist: 'Yung Bleu',
    url: 'https://tu.646474.xyz/Ice%20On%20My%20Baby%20_sped-up.mp3',
    cover: 'https://tu.646474.xyz/Ice%20On%20My%20Baby%20_sped-up.jpg',
    lrc: 'https://tu.646474.xyz/Ice%20On%20My%20Baby%20_sped-up.lrc'
  },
  {
    name: '春庭雪 (0.9x版DJ Wave版)',
    artist: '等什么君',
    url: 'https://tu.646474.xyz/%E9%82%93%E5%AF%93%E5%90%9B_%E7%AD%89%E4%BB%80%E4%B9%88%E5%90%9B_%20-%20%E6%98%A5%E5%BA%AD%E9%9B%AA%20_0.mp3',
    cover: 'https://tu.646474.xyz/%E9%82%93%E5%AF%93%E5%90%9B_%E7%AD%89%E4%BB%80%E4%B9%88%E5%90%9B_%20-%20%E6%98%A5%E5%BA%AD%E9%9B%AA%20_0.jpg',
    lrc: 'https://tu.646474.xyz/%E9%82%93%E5%AF%93%E5%90%9B_%E7%AD%89%E4%BB%80%E4%B9%88%E5%90%9B_%20-%20%E6%98%A5%E5%BA%AD%E9%9B%AA%20_0.lrc'
  },
  {
    name: '辞九门回忆+莫问归期dj',
    artist: 'DJ阿玄',
    url: 'https://tu.646474.xyz/%E8%BE%9E%E4%B9%9D%E9%97%A8%E5%9B%9E%E5%BF%86_%E8%8E%AB%E9%97%AE%E5%BD%92%E6%9C%9F.mp3',
    cover: 'https://tu.646474.xyz/%E8%BE%9E%E4%B9%9D%E9%97%A8%E5%9B%9E%E5%BF%86_%E8%8E%AB%E9%97%AE%E5%BD%92%E6%9C%9F.jpg',
    lrc: 'https://tu.646474.xyz/%E8%BE%9E%E4%B9%9D%E9%97%A8%E5%9B%9E%E5%BF%86_%E8%8E%AB%E9%97%AE%E5%BD%92%E6%9C%9F.lrc'
  },
  {
    name: '青衣 (DJ阿泽版)',
    artist: '草帽酱, DJ阿泽',
    url: 'https://tu.646474.xyz/%E9%9D%92%E8%A1%A3%20_DJ%E9%98%BF%E6%B3%BD%E7%89%88.mp3',
    cover: 'https://tu.646474.xyz/%E9%9D%92%E8%A1%A3%20_DJ%E9%98%BF%E6%B3%BD%E7%89%88.jpg',
    lrc: 'https://tu.646474.xyz/%E9%9D%92%E8%A1%A3.lrc'
  },
  {
    name: '天亮以前说再见DJ 0.74x(保尔柯察金进行曲)',
    artist: '云野',
    url: 'https://tu.646474.xyz/%E5%A4%A9%E4%BA%AE%E4%BB%A5%E5%89%8D%E8%AF%B4%E5%86%8D%E8%A7%81.mp3',
    cover: 'https://tu.646474.xyz/%E5%A4%A9%E4%BA%AE%E4%BB%A5%E5%89%8D%E8%AF%B4%E5%86%8D%E8%A7%81.jpg',
    lrc: 'https://tu.646474.xyz/%E5%A4%A9%E4%BA%AE%E4%BB%A5%E5%89%8D%E8%AF%B4%E5%86%8D%E8%A7%81.lrc'
  },
  {
    name: '唐人恋曲',
    artist: '小唐人',
    url: 'https://tu.646474.xyz/%E5%94%90%E4%BA%BA%E6%81%8B%E6%9B%B2.mp3',
    cover: 'https://tu.646474.xyz/%E5%94%90%E4%BA%BA%E6%81%8B%E6%9B%B2.webp',
    lrc: 'https://tu.646474.xyz/%E5%94%90%E4%BA%BA%E6%81%8B%E6%9B%B2.lrc'
  },
  {
    name: '复兴小曲-游山恋(琪大妈)',
    artist: '琪大妈',
    url: 'https://tu.646474.xyz/%E5%A4%8D%E5%85%B4%E5%B0%8F%E6%9B%B2.mp3',
    cover: 'https://tu.646474.xyz/%E5%A4%8D%E5%85%B4%E5%B0%8F%E6%9B%B2.jpg',
    lrc: 'https://tu.646474.xyz/%E5%A4%8D%E5%85%B4%E5%B0%8F%E6%9B%B2.lrc'
  },
  {
    name: '下潜',
    artist: '川青',
    url: 'https://tu.646474.xyz/%E4%B8%8B%E6%BD%9C.mp3',
    cover: 'https://tu.646474.xyz/%E4%B8%8B%E6%BD%9C.jpg',
    lrc: 'https://tu.646474.xyz/%E4%B8%8B%E6%BD%9C.lrc'
  },
  {
    name: '潮汐',
    artist: 'IN-K, 安苏羽, 傅梦彤',
    url: 'https://tu.646474.xyz/%E6%BD%AE%E6%B1%90.mp3',
    cover: 'https://tu.646474.xyz/%E6%BD%AE%E6%B1%90.jpg',
    lrc: 'https://tu.646474.xyz/%E6%BD%AE%E6%B1%90.lrc'
  },
  {
    name: '潮汐',
    artist: '傅梦彤',
    url: 'https://tu.646474.xyz/%E6%BD%AE%E6%B1%90-%E5%82%85%E6%A2%A6%E5%BD%A4.mp3',
    cover: 'https://tu.646474.xyz/%E6%BD%AE%E6%B1%90-%E5%82%85%E6%A2%A6%E5%BD%A4.jpg',
    lrc: 'https://tu.646474.xyz/%E6%BD%AE%E6%B1%90-%E5%82%85%E6%A2%A6%E5%BD%A4.lrc'
  },
  {
    name: '夫妻双双把家还 天仙配',
    artist: '李文, 瑞鸣音乐',
    url: 'https://tu.646474.xyz/%E5%A4%AB%E5%A6%BB%E5%8F%8C%E5%8F%8C%E6%8A%8A%E5%AE%B6%E8%BF%98.mp3',
    cover: 'https://tu.646474.xyz/%E5%A4%AB%E5%A6%BB%E5%8F%8C%E5%8F%8C%E6%8A%8A%E5%AE%B6%E8%BF%98.jpg',
    lrc: 'https://tu.646474.xyz/%E5%A4%AB%E5%A6%BB%E5%8F%8C%E5%8F%8C%E6%8A%8A%E5%AE%B6%E8%BF%98.lrc'
  },
  {
    name: '好想爱这个世界啊',
    artist: '蓝心羽',
    url: 'https://tu.646474.xyz/%E5%A5%BD%E6%83%B3%E7%88%B1%E8%BF%99%E4%B8%AA%E4%B8%96%E7%95%8C%E5%95%8A.mp3',
    cover: 'https://tu.646474.xyz/%E5%A5%BD%E6%83%B3%E7%88%B1%E8%BF%99%E4%B8%AA%E4%B8%96%E7%95%8C%E5%95%8A.png',
    lrc: 'https://tu.646474.xyz/%E5%A5%BD%E6%83%B3%E7%88%B1%E8%BF%99%E4%B8%AA%E4%B8%96%E7%95%8C%E5%95%8A.lrc'
  },
  {
    name: '最后一页',
    artist: '江语晨',
    url: 'https://tu.646474.xyz/%E6%9C%80%E5%90%8E%E4%B8%80%E9%A1%B5.mp3',
    cover: 'https://tu.646474.xyz/%E6%9C%80%E5%90%8E%E4%B8%80%E9%A1%B5.jpg',
    lrc: 'https://tu.646474.xyz/%E6%9C%80%E5%90%8E%E4%B8%80%E9%A1%B5.lrc'
  },
  {
    name: '怎叹',
    artist: '郑鱼',
    url: 'https://tu.646474.xyz/%E6%80%8E%E5%8F%B9.mp3',
    cover: 'https://tu.646474.xyz/%E6%80%8E%E5%8F%B9.jpg',
    lrc: 'https://tu.646474.xyz/%E6%80%8E%E5%8F%B9.lrc'
  },
  {
    name: '隔岸',
    artist: '姚十六',
    url: 'https://tu.646474.xyz/%E9%9A%94%E5%B2%B8.mp3',
    cover: 'https://tu.646474.xyz/%E9%9A%94%E5%B2%B8.jpg',
    lrc: 'https://tu.646474.xyz/%E9%9A%94%E5%B2%B8.lrc'
  },
  {
    name: '烟袋斜街',
    artist: '接个吻，开一枪, SaMZIng',
    url: 'https://tu.646474.xyz/%E7%83%9F%E8%A2%8B%E6%96%9C%E8%A1%97.mp3',
    cover: 'https://tu.646474.xyz/%E7%83%9F%E8%A2%8B%E6%96%9C%E8%A1%97.jpg',
    lrc: 'https://tu.646474.xyz/%E7%83%9F%E8%A2%8B%E6%96%9C%E8%A1%97.lrc'
  },
  {
    name: '落了白',
    artist: '蒋雪儿Snow.J',
    url: 'https://tu.646474.xyz/%E8%90%BD%E4%BA%86%E7%99%BD.mp3',
    cover: 'https://tu.646474.xyz/%E8%90%BD%E4%BA%86%E7%99%BD.jpg',
    lrc: 'https://tu.646474.xyz/%E8%90%BD%E4%BA%86%E7%99%BD.lrc'
  },
  {
    name: '燕无歇',
    artist: '蒋雪儿Snow.J',
    url: 'https://tu.646474.xyz/%E7%87%95%E6%97%A0%E6%AD%87.mp3',
    cover: 'https://tu.646474.xyz/%E7%87%95%E6%97%A0%E6%AD%87.jpg',
    lrc: 'https://tu.646474.xyz/%E7%87%95%E6%97%A0%E6%AD%87.lrc'
  },
  {
    name: '献天缘',
    artist: '姜姜',
    url: 'https://tu.646474.xyz/%E7%8C%AE%E5%A4%A9%E7%BC%98.mp3',
    cover: 'https://tu.646474.xyz/%E7%8C%AE%E5%A4%A9%E7%BC%98.jpg',
    lrc: 'https://tu.646474.xyz/1779513160984.lrc'
  },
  {
    name: 'III',
    artist: 'Athletics',
    url: 'https://tu.646474.xyz/III.mp3',
    cover: 'https://tu.646474.xyz/III.jpg',
    lrc: 'https://tu.646474.xyz/III.lrc'
  },
  {
    name: '寒江雪',
    artist: '郑源,储兰兰,DJ细霖',
    url: 'https://tu.646474.xyz/%E5%AF%92%E6%B1%9F%E9%9B%AA.mp3',
    cover: 'https://tu.646474.xyz/%E5%AF%92%E6%B1%9F%E9%9B%AA.jpg',
    lrc: 'https://tu.646474.xyz/1779514180705.lrc'
  },
  {
    name: '琵琶行(抒情版)',
    artist: '奇然, 沈谧仁',
    url: 'https://tu.646474.xyz/%E7%90%B5%E7%90%B6%E8%A1%8C.mp3',
    cover: 'https://tu.646474.xyz/1779194271953.jpg',
    lrc: 'https://tu.646474.xyz/1779514520798.lrc'
  },
  {
    name: '鸳鸯戏',
    artist: '邓寓君(等什么君)',
    url: 'https://tu.646474.xyz/%E9%B8%B3%E9%B8%AF%E6%88%8F.mp3',
    cover: 'https://tu.646474.xyz/%E9%B8%B3%E9%B8%AF%E6%88%8F.jpg',
    lrc: 'https://tu.646474.xyz/%E9%B8%B3%E9%B8%AF%E6%88%8F.lrc'
  },
  {
    name: '人间惊鸿宴(DJ降速版)',
    artist: '指尖笑',
    url: 'https://tu.646474.xyz/%E4%BA%BA%E9%97%B4%E6%83%8A%E9%B8%BF%E5%AE%B4_DJ%E9%99%8D%E9%80%9F%E7%89%88.mp3',
    cover: 'https://tu.646474.xyz/%E4%BA%BA%E9%97%B4%E6%83%8A%E9%B8%BF%E5%AE%B4_DJ%E9%99%8D%E9%80%9F%E7%89%88.jpg',
    lrc: 'https://tu.646474.xyz/%E4%BA%BA%E9%97%B4%E6%83%8A%E9%B8%BF%E5%AE%B4_DJ%E9%99%8D%E9%80%9F%E7%89%88.lrc'
  },
  {
    name: '纵此生(戏腔0.8x版)',
    artist: '泽国同学',
    url: 'https://tu.646474.xyz/%E7%BA%B5%E6%AD%A4%E7%94%9F.mp3',
    cover: 'https://tu.646474.xyz/%E7%BA%B5%E6%AD%A4%E7%94%9F.jpg',
    lrc: 'https://tu.646474.xyz/%E7%BA%B5%E6%AD%A4%E7%94%9F.lrc'
  },
  {
    name: '游京(悠悠的古城中)',
    artist: 'DJ东东',
    url: 'https://tu.646474.xyz/%E6%88%B7.mp3',
    cover: 'https://tu.646474.xyz/%E6%88%B7.jpg',
    lrc: 'https://tu.646474.xyz/%E6%88%B7.lrc'
  },
  {
    name: '春庭風月',
    artist: '祥嘞嘞, 平生不晚',
    url: 'https://tu.646474.xyz/%E6%98%A5%E5%BA%AD%E9%A3%8E%E6%9C%88.mp3',
    cover: 'https://tu.646474.xyz/%E6%98%A5%E5%BA%AD%E9%A3%8E%E6%9C%88.jpeg',
    lrc: 'https://tu.646474.xyz/%E6%98%A5%E5%BA%AD%E9%A3%8E%E6%9C%88.lrc'
  }
];
