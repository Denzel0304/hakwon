/* =========================================================
   weather.js — 오늘 날씨 (PC 전용 · 날짜 요약 화면의 '할일 검색' 오른쪽)
   · 날씨 정보: Open-Meteo (https://open-meteo.com) — API 키 없음 · 무료
   · 지역: 설정에서 고른 지역 (이 기기에만 저장). 정하지 않으면 서울
   · 날씨 상태 = 지금 날씨(밤에 맑으면 달) · 최저/최고 = 오늘 하루 · 강수확률 = 남은 시간 중 최고
   · 화면을 켜 둔 동안 30분마다 칩만 자동 갱신 (실패하면 이전 값 유지)
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
  _key(l) { return 'v2|' + this._today() + '|' + l.lat.toFixed(3) + ',' + l.lon.toFixed(3); },
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
        // 날씨 상태 = 지금 날씨 / 최저·최고 = 오늘 하루 / 강수확률 = 지금부터 오늘 밤까지 남은 시간 중 최고
        const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon
          + '&current=weather_code,is_day'
          + '&hourly=precipitation_probability'
          + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
          + '&timezone=Asia%2FSeoul&forecast_days=1';
        const j = await this._json(u);
        const dl = j && j.daily, cur = j && j.current, hr = j && j.hourly;
        const num = (v) => (v !== null && v !== undefined && v !== '' && isFinite(v)) ? +v : null;
        const hi = num(dl && dl.temperature_2m_max && dl.temperature_2m_max[0]);
        const lo = num(dl && dl.temperature_2m_min && dl.temperature_2m_min[0]);
        let code = num(cur && cur.weather_code);
        if (code === null) code = num(dl && dl.weather_code && dl.weather_code[0]);      // 지금 날씨가 없으면 하루 날씨로
        if (code === null || hi === null || lo === null) return null;
        // 남은 시간 강수확률: 지금 시각(정시 기준) 이후의 시간별 값 중 최고. 없으면 하루 최고값으로
        let pop = null;
        try {
          const nowH = (cur && typeof cur.time === 'string') ? cur.time.slice(0, 13) : '';
          if (nowH && hr && Array.isArray(hr.time) && Array.isArray(hr.precipitation_probability)) {
            hr.time.forEach((t, i) => {
              const v = num(hr.precipitation_probability[i]);
              if (typeof t === 'string' && t.slice(0, 13) >= nowH && v !== null) pop = pop === null ? v : Math.max(pop, v);
            });
          }
        } catch (e) { pop = null; }
        if (pop === null) pop = num(dl && dl.precipitation_probability_max && dl.precipitation_probability_max[0]);
        const day = num(cur && cur.is_day);
        const d = { code, hi: Math.round(hi), lo: Math.round(lo), pop: pop === null ? null : Math.round(pop), night: day === 0 };
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
  _moon(cls) {
    return `<svg class="wx-moon ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 13.6A8.6 8.6 0 1 1 10.4 3.5a6.9 6.9 0 0 0 10.1 10.1z"/></svg>`;
  },
  _stars() {
    return '<i class="wx-star" style="--x:6px;--y:6px;--d:0s"></i><i class="wx-star" style="--x:40px;--y:21px;--d:-1.1s"></i><i class="wx-star" style="--x:11px;--y:22px;--d:-2.2s"></i><i class="wx-star" style="--x:43px;--y:5px;--d:-.6s"></i>';
  },
  _art(k) {
    if (k === 'moon') return this._stars() + this._moon('big');
    if (k === 'mpart') return this._stars() + this._moon('sm') + this._cloud('c1 gray');
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
      slot.dataset.today = isToday === false ? '0' : '1';
      btn.after(slot);
      const hit = this._fresh();
      if (hit) this._show(slot, hit);                       // 저장본이 있으면 바로 (깜빡임 없음)
      else this.get().then(d => this._show(slot, d), () => {});
      this._startTimer();
    } catch (e) {}
  },
  _show(slot, d) {
    try { if (d && slot && slot.isConnected) this._fill(slot, d, slot.dataset.today !== '0'); }
    catch (e) { try { slot.remove(); } catch (_) {} }
  },

  /* ---------- 자동 갱신 ----------
     1분마다 '저장본이 30분 지났는지'만 확인 (인터넷 요청 없음) → 지났으면 그때만 새로 받아 칩만 바꾼다.
     화면 전체는 다시 그리지 않고, 받기에 실패하면 이전 값을 그대로 둔다.
     창이 숨겨진(최소화·다른 탭) 동안은 쉬고, 다시 보일 때 바로 확인한다. */
  _timer: null,
  _startTimer() {
    if (this._timer) return;
    try {
      this._timer = setInterval(() => this._tick(), 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this._tick(); });
    } catch (e) {}
  },
  _tick() {
    try {
      if (document.hidden) return;
      const slot = document.querySelector('#main .page-head .wx');
      if (!slot) return;                                    // 날씨가 보이는 화면이 아니면 아무것도 안 함
      if (this._fresh() && !slot.hidden) return;            // 아직 30분 안 지남
      this.get().then(d => this._show(slot, d), () => {});
    } catch (e) {}
  },

  _fill(slot, d, isToday) {
    const l = this.loc();
    let [k, txt] = this.kind(d.code);
    if (d.night && k === 'sun') k = 'moon';                 // 밤에 맑으면 달
    if (d.night && k === 'part') k = 'mpart';
    // 값이 그대로면 다시 그리지 않음 (애니메이션이 끊기지 않도록)
    const sig = [l.name, l.lat, l.lon, k, txt, d.lo, d.hi, d.pop, isToday].join('|');
    if (slot.dataset.sig === sig && !slot.hidden) return;
    slot.dataset.sig = sig;
    const esc2 = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    slot.className = 'wx wx-k-' + k + (d.night ? ' wx-night' : '');
    slot.title = `${l.name}${l.sub ? ' (' + l.sub + ')' : ''} 오늘 날씨\n지금: ${txt}\n오늘 최저 ${d.lo}° / 최고 ${d.hi}°${d.pop !== null ? '\n남은 시간 강수확률: ' + d.pop + '%' : ''}\n(30분마다 자동 갱신 · 날씨 정보: Open-Meteo.com)`;
    slot.innerHTML = `<span class="wx-art" aria-hidden="true">${this._art(k)}</span>
      <span class="wx-info"><span class="wx-city">${isToday === false ? '<em>오늘</em>' : ''}${esc2(l.name)}</span><span class="wx-txt">${esc2(txt)}</span></span>
      <span class="wx-tmp"><b class="lo">${d.lo}°</b><i>/</i><b class="hi">${d.hi}°</b></span>
      ${d.pop !== null ? `<span class="wx-pop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2C9 7.6 6.5 10.6 6.5 14a5.5 5.5 0 0 0 11 0c0-3.4-2.5-6.4-5.5-10.8z"/></svg>${d.pop}%</span>` : ''}`;
    slot.hidden = false;
  },
};
