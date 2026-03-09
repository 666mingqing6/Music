class MetingJSElement extends HTMLElement {

  connectedCallback() {
    if (window.APlayer && window.fetch) {
      this._init()
      this._parse()
    }
  }

  disconnectedCallback() {
    if (!this.lock) {
      this.aplayer.destroy()
    }
  }

  _camelize(str) {
    return str
      .replace(/^[_.\- ]+/, '')
      .toLowerCase()
      .replace(/[_.\- ]+(\w|$)/g, (m, p1) => p1.toUpperCase())
  }

  _init() {
    let config = {}
    for (let i = 0; i < this.attributes.length; i += 1) {
      config[this._camelize(this.attributes[i].name)] = this.attributes[i].value
    }
    let keys = [
      'server', 'type', 'id', 'api', 'auth',
      'auto', 'lock',
      'name', 'title', 'artist', 'author', 'url', 'cover', 'pic', 'lyric', 'lrc',
    ]
    this.meta = {}
    for (let key of keys) {
      this.meta[key] = config[key]
      delete config[key]
    }
    this.config = config

    this.api = this.meta.api || window.meting_api || 'https://music.zhheo.com/meting-api/?server=:server&type=:type&id=:id&r=:r'
    if (this.meta.auto) this._parse_link()
  }

  _parse_link() {
    let rules = [
      ['music.163.com.*song.*id=(\\d+)', 'netease', 'song'],
      ['music.163.com.*album.*id=(\\d+)', 'netease', 'album'],
      ['music.163.com.*artist.*id=(\\d+)', 'netease', 'artist'],
      ['music.163.com.*playlist.*id=(\\d+)', 'netease', 'playlist'],
      ['music.163.com.*discover/toplist.*id=(\\d+)', 'netease', 'playlist'],
      ['y.qq.com.*song/(\\w+).html', 'tencent', 'song'],
      ['y.qq.com.*album/(\\w+).html', 'tencent', 'album'],
      ['y.qq.com.*singer/(\\w+).html', 'tencent', 'artist'],
      ['y.qq.com.*playsquare/(\\w+).html', 'tencent', 'playlist'],
      ['y.qq.com.*playlist/(\\w+).html', 'tencent', 'playlist'],
      ['xiami.com.*song/(\\w+)', 'xiami', 'song'],
      ['xiami.com.*album/(\\w+)', 'xiami', 'album'],
      ['xiami.com.*artist/(\\w+)', 'xiami', 'artist'],
      ['xiami.com.*collect/(\\w+)', 'xiami', 'playlist'],
    ]

    for (let rule of rules) {
      let patt = new RegExp(rule[0])
      let res = patt.exec(this.meta.auto)
      if (res !== null) {
        this.meta.server = rule[1]
        this.meta.type = rule[2]
        this.meta.id = res[1]
        return
      }
    }
  }

  _parse() {
    let localData = [];
    if (typeof localMusic !== 'undefined' && Array.isArray(localMusic)) {
      localData = localMusic.map(item => ({
        name: item.name,
        artist: item.artist,
        url: this._encodeNonAscii(item.url),
        cover: this._encodeNonAscii(item.cover),
        lrc: this._encodeNonAscii(item.lrc),
        type: 'local'
      }));
    }

    if (this.meta.url) {
      let result = {
        name: this.meta.name || this.meta.title || 'Audio name',
        artist: this.meta.artist || this.meta.author || 'Audio artist',
        url: this.meta.url,
        cover: this.meta.cover || this.meta.pic,
        lrc: this.meta.lrc || this.meta.lyric || '',
        type: this.meta.type || 'auto',
      }
      if (!result.lrc) {
        this.meta.lrcType = 0
      }
      if (this.innerText) {
        result.lrc = this.innerText
        this.meta.lrcType = 2
      }
      this._loadPlayer([...localData, result])
      return
    }

    let url = this.api
      .replace(':server', this.meta.server)
      .replace(':type', this.meta.type)
      .replace(':id', this.meta.id)
      .replace(':auth', this.meta.auth)
      .replace(':r', Math.random())

    fetch(url)
      .then(res => res.json())
      .then(result => {
        // 过滤掉无效结果并合并
        const validOnlineResult = Array.isArray(result) ? result : [];
        const combinedData = [...localData, ...validOnlineResult];
        this._loadPlayer(combinedData);
      })
      .catch(err => {
        console.error('Fetch online music error:', err);
        // 如果在线音乐获取失败，仍然加载本地音乐
        if (localData.length > 0) {
          this._loadPlayer(localData);
        }
      });
  }

  _encodeNonAscii(str) {
    if (!str) return str;
    return str.replace(/[^\x00-\x7F]/g, function(c) {
      return encodeURIComponent(c);
    });
  }

  _loadPlayer(data) {

    let defaultOption = {
      audio: data,
      mutex: true,
      lrcType: this.meta.lrcType || 3,
      storageName: 'metingjs',
      listFolded: window.innerWidth < 768 ? true : false
    }

    if (!data || !data.length) {
      if (typeof localMusic !== 'undefined' && Array.isArray(localMusic) && data !== localMusic) {
        // 如果在线音乐返回空，尝试只加载本地音乐
        let localData = localMusic.map(item => ({
          name: item.name,
          artist: item.artist,
          url: this._encodeNonAscii(item.url),
          cover: this._encodeNonAscii(item.cover),
          lrc: this._encodeNonAscii(item.lrc),
          type: 'local'
        }));
        if (localData.length) {
          this._loadPlayer(localData);
          return;
        }
      }
      return;
    }

    let options = {
      ...defaultOption,
      ...this.config,
    }
    for (let optkey in options) {
      if (options[optkey] === 'true' || options[optkey] === 'false') {
        options[optkey] = (options[optkey] === 'true')
      }
    }

    let div = document.createElement('div')
    options.container = div
    this.appendChild(div)

    this.aplayer = new APlayer(options)
    window.ap = this.aplayer;

    heo.setupMediaSessionHandlers(this.aplayer);
  }

}

console.log('\n %c MetingJS v2.0.1 %c https://github.com/metowolf/MetingJS \n', 'color: #fadfa3; background: #030307; padding:5px 0;', 'background: #fadfa3; padding:5px 0;')

if (window.customElements && !window.customElements.get('meting-js')) {
  window.MetingJSElement = MetingJSElement
  window.customElements.define('meting-js', MetingJSElement)
}
