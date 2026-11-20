/* =========================================================
   weather.js — 오늘 날씨 (PC 전용 · 날짜 요약 화면의 '할일 검색' 오른쪽)
   · 날씨 정보: Open-Meteo (https://open-meteo.com) — API 키 없음 · 무료
   · 지역: 설정에서 고른 지역 (이 기기에만 저장). 정하지 않으면 서울
   · 무슨 오류가 나도 날씨만 표시하지 않고, 다른 기능에는 영향 없음
   ========================================================= */
const Weather = {
  // 저장 키: 'mg77_' 접두사가 아니라서 로그아웃해도 지역 설정은 남는다
  LS_LOC: 'mg77wx_loc',
  LS_CACHE: 'mg77wx_cache',
  DEF: { name: '서울', lat: 37.5665, lon: 126.9780 },
  TTL: 30 * 60 * 1000,        // 30분마다 새로 받기
  TIMEOUT: 4000,              // 4초 안에 응답이 없으면 포기 (표시 안 함)
  _mem: null,                 // 받아 둔 날씨 { key, at, d }
  _job: null,                 // 진행 중인 요청 (같은 요청을 여러 번 보내지 않도록)

  /* ---------- 지역 ---------- */
  loc() {
    try {
      const o = JSON.parse(localStorage.getItem(this.LS_LOC) || 'null');
      if (o && o.name && isFinite(o.lat) && isFinite(o.lon)) return { name: String(o.name), lat: +o.lat, lon: +o.lon, sub: o.sub || '' };
    } catch (e) {}
    return { ...this.DEF, def: true };
  },
  setLoc(o) {
    try { localStorage.setItem(this.LS_LOC, JSON.stringify({ name: o.name, lat: o.lat, lon: o.lon, sub: o.sub || '' })); } catch (e) {}
    this._mem = null;
  },
  resetLoc() {
    try { localStorage.removeItem(this.LS_LOC); } catch (e) {}
    this._mem = null;
  },

  /* ---------- 받아오기 ---------- */
  _today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  _key(l) { return this._today() + '|' + l.lat.toFixed(3) + ',' + l.lon.toFixed(3); },
  async _json(url) {
    const ac = window.AbortController ? new AbortController() : null;
    const t = setTimeout(() => { if (ac) ac.abort(); }, this.TIMEOUT);
    try {
      const r = await fetch(url, ac ? { signal: ac.signal, cache: 'no-store' } : { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  },
  // 아직 유효한 저장본 (메모리 → 이 기기 저장소)
  _fresh() {
    const key = this._key(this.loc()), now = Date.now();
    if (this._mem && this._mem.key === key && now - this._mem.at < this.TTL) return this._mem.d;
    try {
      const c = JSON.parse(localStorage.getItem(this.LS_CACHE) || 'null');
      if (c && c.key === key && now - c.at < this.TTL && c.d) { this._mem = c; return c.d; }
    } catch (e) {}
    return null;
  },
  async get() {
    const hit = this._fresh();
    if (hit) return hit;
    const l = this.loc(), key = this._key(l);
    if (this._job && this._job.key === key) return this._job.p;
    const p = (async () => {
      try {
        const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon
          + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
          + '&timezone=Asia%2FSeoul&forecast_days=1';
        const j = await this._json(u);
        const dl = j && j.daily;
        const code = dl && dl.weather_code && dl.weather_code[0];
        const hi = dl && dl.temperature_2m_max && dl.temperature_2m_max[0];
        const lo = dl && dl.temperature_2m_min && dl.temperature_2m_min[0];
        if (!isFinite(code) || !isFinite(hi) || !isFinite(lo)) return null;
        const pop = dl.precipitation_probability_max && dl.precipitation_probability_max[0];
        const d = { code: +code, hi: Math.round(hi), lo: Math.round(lo), pop: isFinite(pop) && pop !== null ? Math.round(pop) : null };
        this._mem = { key, at: Date.now(), d };
        try { localStorage.setItem(this.LS_CACHE, JSON.stringify(this._mem)); } catch (e) {}
        return d;
      } catch (e) { return null; }
      finally { if (this._job && this._job.key === key) this._job = null; }
    })();
    this._job = { key, p };
    return p;
  },

  // 지역 검색 (설정 화면) — 결과 배열 / 실패하면 null
  async search(q) {
    try {
      q = String(q || '').trim();
      if (q.length < 2) return [];
      const j = await this._json('https://geocoding-api.open-meteo.com/v1/search?count=10&language=ko&format=json&countryCode=KR&name=' + encodeURIComponent(q));
      return ((j && j.results) || []).filter(r => r && r.name && isFinite(r.latitude) && isFinite(r.longitude)).map(r => ({
        name: r.name, lat: +r.latitude, lon: +r.longitude,
        sub: [r.admin1, r.admin2, r.admin3].filter((x, i, a) => x && x !== r.name && a.indexOf(x) === i).join(' '),
      }));
    } catch (e) { return null; }
  },

  /* ---------- 날씨 종류 (WMO 코드) ---------- */
  kind(c) {
    if (c === 0) return ['sun', '맑음'];
    if (c === 1) return ['sun', '대체로 맑음'];
    if (c === 2) return ['part', '구름 조금'];
    if (c === 3) return ['cloud', '흐림'];
    if (c === 45 || c === 48) return ['fog', '안개'];
    if (c >= 51 && c <= 55) return ['drizzle', '이슬비'];
    if (c === 56 || c === 57 || c === 66 || c === 67) return ['sleet', '진눈깨비'];
    if (c >= 61 && c <= 65) return ['rain', c === 65 ? '많은 비' : '비'];
    if (c >= 80 && c <= 82) return ['rain', '소나기'];
    if (c >= 71 && c <= 77) return ['snow', c === 75 ? '많은 눈' : '눈'];
    if (c === 85 || c === 86) return ['snow', '소낙눈'];
    if (c >= 95) return ['storm', '뇌우'];
    return ['cloud', '흐림'];
  },

  /* ---------- 그림 (작은 하늘 창) ---------- */
  _cloud(cls) {
    return `<svg class="wx-cl ${cls}" viewBox="0 0 40 22" aria-hidden="true"><path d="M10 21h21a7 7 0 0 0 .6-14A9.5 9.5 0 0 0 13.3 6.6 7.3 7.3 0 0 0 10 21z"/></svg>`;
  },
  _sun(cls) {
    let rays = '';
    for (let i = 0; i < 8; i++) rays += `<line x1="12" y1="1.6" x2="12" y2="4.4" transform="rotate(${i * 45} 12 12)"/>`;
    return `<svg class="wx-sun ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><g class="wx-rays">${rays}</g><circle class="wx-core" cx="12" cy="12" r="5.2"/></svg>`;
  },
  // 빗방울·눈송이 자리 (고정 배열이라 매번 같은 모양)
  _drops(n, cls) {
    const X = [6, 13, 20, 27, 34, 41, 9, 17, 24, 31, 38, 3];
    const D = [0, .55, .2, .8, .35, .65, .45, .1, .9, .3, .7, .5];
    let h = '';
    for (let i = 0; i < n; i++) h += `<i class="${cls}" style="--x:${X[i % X.length]}px;--d:-${D[i % D.length]}s"></i>`;
    return h;
  },
  _art(k) {
    if (k === 'sun') return this._sun('big');
    if (k === 'part') return this._sun('sm') + this._cloud('c1');
    if (k === 'cloud') return this._cloud('c2 gray') + this._cloud('c1');
    if (k === 'fog') return this._cloud('c1 gray') + '<b class="wx-fb f1"></b><b class="wx-fb f2"></b><b class="wx-fb f3"></b>';
    if (k === 'drizzle') return this._drops(6, 'wx-drop slow') + this._cloud('top gray');
    if (k === 'rain') return this._drops(10, 'wx-drop') + this._cloud('top dark');
    if (k === 'sleet') return this._drops(5, 'wx-drop') + this._drops(5, 'wx-flake mix') + this._cloud('top gray');
    if (k === 'snow') return this._drops(10, 'wx-flake') + this._cloud('top snowc');
    if (k === 'storm') return this._drops(8, 'wx-drop fast') + this._cloud('top dark') + '<svg class="wx-bolt" viewBox="0 0 10 16" aria-hidden="true"><path d="M6 0 1 9h3.5L3 16l6-9.5H5.4L7 0z"/></svg>';
    return this._cloud('c1');
  },

  /* ---------- 화면에 붙이기 (DayPage에서 호출) ---------- */
  mount(main, isToday) {
    try {
      const btn = main && main.querySelector('.page-head [data-a="tdsearch"]');
      if (!btn) return;
      const slot = document.createElement('span');
      slot.className = 'wx';
      slot.hidden = true;
      btn.after(slot);
      const show = (d) => { try { if (d && slot.isConnected) this._fill(slot, d, isToday); } catch (e) { slot.remove(); } };
      const hit = this._fresh();
      if (hit) show(hit);                                   // 저장본이 있으면 바로 (깜빡임 없음)
      else this.get().then(show, () => {});
    } catch (e) {}
  },
  _fill(slot, d, isToday) {
    const l = this.loc();
    const [k, txt] = this.kind(d.code);
    const esc2 = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    slot.className = 'wx wx-k-' + k;
    slot.title = `${l.name}${l.sub ? ' (' + l.sub + ')' : ''} 오늘 날씨 · ${txt} · 최저 ${d.lo}° / 최고 ${d.hi}°${d.pop !== null ? ' · 강수확률 ' + d.pop + '%' : ''}\n날씨 정보: Open-Meteo.com`;
    slot.innerHTML = `<span class="wx-art" aria-hidden="true">${this._art(k)}</span>
      <span class="wx-info"><span class="wx-city">${isToday === false ? '<em>오늘</em>' : ''}${esc2(l.name)}</span><span class="wx-txt">${esc2(txt)}</span></span>
      <span class="wx-tmp"><b class="lo">${d.lo}°</b><i>/</i><b class="hi">${d.hi}°</b></span>
      ${d.pop !== null ? `<span class="wx-pop" title="강수확률"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2C9 7.6 6.5 10.6 6.5 14a5.5 5.5 0 0 0 11 0c0-3.4-2.5-6.4-5.5-10.8z"/></svg>${d.pop}%</span>` : ''}`;
    slot.hidden = false;
  },
};
