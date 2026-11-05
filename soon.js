/* =========================================================
   Soon — 근무 진행률 (학원 관리 왼쪽 사이드바용)
   index.html 의 <div id="sn-root"></div> 안에 그려진다.
   모든 id·class 는 sn- 로 시작 → 학원 관리 코드와 서로 영향 없음.
   설정은 이 기기 localStorage('soon.settings.v1', 'soon.mode.v1')에 저장.
   ========================================================= */

(function () {
  'use strict';

  /* ===== 화면 만들기 (사이드바 #sn-root 안 + 설정창·축하는 화면 전체) ===== */
  const ROOT = document.getElementById('sn-root');
  if (!ROOT) return;
  ROOT.classList.add('sn-scope');
  ROOT.innerHTML = `
  <div class="sn-top">
    <div class="sn-modes" role="group" aria-label="게이지 모드">
      <button type="button" data-mode="beer" aria-pressed="true">맥주</button>
      <button type="button" data-mode="sand" aria-pressed="false">모래시계</button>
      <button type="button" data-mode="pay" aria-pressed="false" hidden>급여</button>
    </div>
    <button type="button" class="sn-icon-btn" id="sn-openSettings" aria-label="근무시간 설정" title="근무시간 설정">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
      </svg>
    </button>
  </div>
  <div class="sn-stage">
    <div class="sn-vessel" id="sn-vessel" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <span class="sn-badge sn-num" id="sn-badge"></span>
      <svg id="sn-beerSvg" viewBox="0 0 200 300" aria-hidden="true">
        <defs>
          <clipPath id="sn-glassClip"><path d="M30 22 L30 274 Q30 286 42 286 L138 286 Q150 286 150 274 L150 22 Z"/></clipPath>
          <clipPath id="sn-liqClip"><rect id="sn-liqClipRect" x="0" y="300" width="200" height="320"/></clipPath>
          <linearGradient id="sn-beerGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#F7B733"/><stop offset="1" stop-color="#D98800"/>
          </linearGradient>
        </defs>
        <path class="sn-glass-back" d="M150 60 Q192 60 192 102 L192 204 Q192 246 150 246 L150 224 Q170 224 170 202 L170 104 Q170 82 150 82 Z"/>
        <path class="sn-glass-line" d="M150 60 Q192 60 192 102 L192 204 Q192 246 150 246 L150 224 Q170 224 170 202 L170 104 Q170 82 150 82 Z"/>
        <path class="sn-glass-back" d="M30 22 L30 274 Q30 286 42 286 L138 286 Q150 286 150 274 L150 22 Z"/>
        <g clip-path="url(#sn-glassClip)">
          <g id="sn-beerLiquid" transform="translate(0,300)">
            <g class="sn-wave sn-slow"><path class="sn-beer-back" id="sn-waveBack"/></g>
            <rect class="sn-beer-body" x="-20" y="6" width="240" height="320"/>
            <g class="sn-wave"><path class="sn-foam" id="sn-waveFoam"/></g>
          </g>
          <g clip-path="url(#sn-liqClip)" id="sn-bubbles"></g>
        </g>
        <path class="sn-facet" d="M60 40 L60 266 M80 40 L80 266 M100 40 L100 266 M120 40 L120 266"/>
        <path class="sn-glass-line" d="M30 22 L30 274 Q30 286 42 286 L138 286 Q150 286 150 274 L150 22"/>
        <path class="sn-glare" d="M41 40 L41 250"/>
      </svg>
      <svg id="sn-paySvg" viewBox="0 0 200 300" aria-hidden="true" hidden>
        <ellipse class="sn-bill-shadow" cx="100" cy="288" rx="92" ry="9"/>
        <g id="sn-billStack"></g>
        <g class="sn-drop-bill" id="sn-dropBill">
          <polygon points="62,14 132,6 142,18 72,26" fill="#A8D497" stroke="#5E9A5A" stroke-width="0.8"/>
          <ellipse cx="120" cy="15" rx="6" ry="3" fill="#8CC283"/>
        </g>
      </svg>
      <svg id="sn-sandSvg" viewBox="0 0 200 300" aria-hidden="true" hidden>
        <defs>
          <clipPath id="sn-topBulb"><path d="M46 26 L154 26 Q154 96 106 146 L106 150 L94 150 L94 146 Q46 96 46 26 Z"/></clipPath>
          <clipPath id="sn-botBulb"><path d="M94 150 L106 150 L106 154 Q154 204 154 274 L46 274 Q46 204 94 154 Z"/></clipPath>
        </defs>
        <rect class="sn-wood" x="24" y="22" width="8" height="256" rx="3"/>
        <rect class="sn-wood" x="168" y="22" width="8" height="256" rx="3"/>
        <path class="sn-glass-back" d="M46 26 L154 26 Q154 96 106 146 L106 154 Q154 204 154 274 L46 274 Q46 204 94 154 L94 146 Q46 96 46 26 Z"/>
        <g clip-path="url(#sn-topBulb)"><path class="sn-sand" id="sn-sandTop"/></g>
        <g clip-path="url(#sn-botBulb)"><path class="sn-sand-pile" id="sn-sandBot"/></g>
        <line class="sn-stream" id="sn-stream" x1="100" y1="146" x2="100" y2="274"/>
        <path class="sn-glass-line" d="M46 26 L154 26 Q154 96 106 146 L106 154 Q154 204 154 274 L46 274 Q46 204 94 154 L94 146 Q46 96 46 26 Z"/>
        <path class="sn-glare" d="M60 40 Q62 80 84 116"/>
        <rect class="sn-wood" x="12" y="8" width="176" height="18" rx="5"/>
        <rect class="sn-wood" x="12" y="274" width="176" height="18" rx="5"/>
      </svg>
    </div>
    <section class="sn-info" aria-live="off">
      <div id="sn-workInfo">
        <div class="sn-pct sn-num"><span id="sn-pct">0.00</span><small>%</small></div>
        <div class="sn-remain">
          <span class="sn-remain-label">남은 시간</span>
          <span class="sn-remain-val sn-num" id="sn-remain">00:00:00</span>
        </div>
      </div>
      <div id="sn-payInfo" hidden>
        <div class="sn-pay-label">이번 달 누적</div>
        <div class="sn-pay-big sn-num"><span id="sn-payMonth">0</span><small>원</small></div>
        <div class="sn-pay-sub">
          <span class="sn-pay-today sn-num" id="sn-payToday">+0원</span>
          <span class="sn-pay-state" id="sn-payState"></span>
        </div>
      </div>
      <div class="sn-msg" id="sn-msg" hidden></div>
      <div class="sn-times" id="sn-times"></div>
    </section>
  </div>`;

  const CEL = document.createElement('div');
  CEL.className = 'sn-celebrate sn-scope';
  CEL.id = 'sn-celebrate';
  CEL.hidden = true;
  CEL.setAttribute('aria-label', '축하 연출, 누르면 닫힘');
  CEL.innerHTML = '<canvas id="sn-confetti"></canvas>';
  document.body.appendChild(CEL);

  const SHEET = document.createElement('div');
  SHEET.className = 'sn-sheet-backdrop sn-scope';
  SHEET.id = 'sn-sheet';
  SHEET.hidden = true;
  SHEET.innerHTML = `
  <div class="sn-sheet" role="dialog" aria-modal="true" aria-labelledby="sn-sheetTitle">
    <div class="sn-sheet-head">
      <h2 id="sn-sheetTitle">근무시간 설정</h2>
      <button type="button" class="sn-icon-btn" id="sn-sheetClose" aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <section>
      <h3>요일별 기본 근무</h3>
      <p class="sn-hint">꺼둔 요일은 쉬는 날로 표시돼요.</p>
      <label class="sn-chk"><input type="checkbox" id="sn-weekUniform"> 모든 요일 같은 시간</label>
      <div id="sn-weekRows"></div>
    </section>
    <section>
      <h3>특정 날짜 근무</h3>
      <p class="sn-hint">지정한 날짜는 요일별 설정보다 우선 적용돼요. 날짜가 지나면 자동으로 지워지고, 같은 날짜를 다시 추가하면 시간이 바뀌어요.</p>
      <label class="sn-chk"><input type="checkbox" id="sn-spRange"> 기간으로 한꺼번에 추가</label>
      <div class="sn-sp-add" id="sn-spAddBox">
        <div class="sn-sp-dates">
          <input type="date" id="sn-spDate" aria-label="날짜">
          <span class="sn-tilde sn-range-only">~</span>
          <input type="date" class="sn-range-only" id="sn-spDateEnd" aria-label="종료 날짜">
        </div>
        <div class="sn-day-chips" id="sn-spDays" hidden></div>
        <input type="time" id="sn-spStart" value="09:00" aria-label="출근 시각">
        <span class="sn-tilde">~</span>
        <input type="time" id="sn-spEnd" value="18:00" aria-label="퇴근 시각">
        <button type="button" class="sn-btn sn-ghost" id="sn-spAdd">추가</button>
      </div>
      <ul class="sn-sp-list" id="sn-spList"></ul>
    </section>
    <section>
      <h3>월 급여</h3>
      <p class="sn-hint">요일별 기본 근무의 이번 달 근무시간으로 나눠서, 근무 중에 실시간으로 쌓여요. 특정 날짜 근무는 급여에 포함되지 않아요.</p>
      <label class="sn-chk"><input type="checkbox" id="sn-payOn"> 급여 모드 사용</label>
      <div class="sn-pay-input">
        <input type="text" id="sn-payAmount" inputmode="numeric" autocomplete="off" placeholder="예: 3,000,000" aria-label="월 급여">
        <span>원</span>
      </div>
    </section>
    <p class="sn-error" id="sn-setError" role="alert"></p>
    <div class="sn-sheet-foot">
      <button type="button" class="sn-btn sn-ghost" id="sn-setCancel">취소</button>
      <button type="button" class="sn-btn sn-primary" id="sn-setSave">저장</button>
    </div>
  </div>`;
  document.body.appendChild(SHEET);

  /* ===== 상수 ===== */
  const KST_OFFSET = 9 * 3600 * 1000;
  const KEY_SET = 'soon.settings.v1';
  const KEY_MODE = 'soon.mode.v1';
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const CELEBRATE_MS = 4000;
  const MILESTONES = [50, 75];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ===== 시간 유틸 (한국 시간 고정) ===== */
  const pad = n => String(n).padStart(2, '0');
  const kstNow = () => new Date(Date.now() + KST_OFFSET);
  const dateKey = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const toMin = s => {
    if (!/^\d{2}:\d{2}$/.test(s || '')) return null;
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const weekdayOf = key => new Date(key + 'T00:00:00Z').getUTCDay();

  /* ===== 저장 (기기별 localStorage) ===== */
  function defaultSettings() {
    const weekly = {};
    for (let i = 0; i < 7; i++) weekly[i] = { on: i >= 1 && i <= 5, start: '09:00', end: '18:00' };
    return { weekly, special: [], uniform: true, salary: { on: false, amount: 0 } };
  }
  function normalize(s) {
    const def = defaultSettings();
    const out = { weekly: {}, special: [] };
    for (let i = 0; i < 7; i++) {
      const w = s && s.weekly && s.weekly[i];
      out.weekly[i] = (w && typeof w === 'object')
        ? {
            on: !!w.on,
            start: toMin(w.start) !== null ? w.start : def.weekly[i].start,
            end: toMin(w.end) !== null ? w.end : def.weekly[i].end
          }
        : def.weekly[i];
    }
    if (s && typeof s.uniform === 'boolean') {
      out.uniform = s.uniform;
    } else {
      const on = [0, 1, 2, 3, 4, 5, 6].map(i => out.weekly[i]).filter(w => w.on);
      out.uniform = on.every(w => w.start === on[0].start && w.end === on[0].end);
    }
    if (s && Array.isArray(s.special)) {
      out.special = s.special
        .filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
          toMin(x.start) !== null && toMin(x.end) !== null && toMin(x.end) > toMin(x.start))
        .map(x => ({ date: x.date, start: x.start, end: x.end }));
    }
    const sal = s && s.salary;
    const amt = sal ? Math.floor(Number(sal.amount)) : 0;
    out.salary = {
      on: !!(sal && sal.on),
      amount: Number.isFinite(amt) && amt > 0 ? Math.min(amt, 9999999999) : 0
    };
    return out;
  }
  function loadSettings() {
    try {
      const raw = localStorage.getItem(KEY_SET);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* 저장소 사용 불가 시 기본값 */ }
    return defaultSettings();
  }
  function storeSettings(s) {
    try { localStorage.setItem(KEY_SET, JSON.stringify(s)); return true; }
    catch (e) { return false; }
  }
  function loadMode() {
    try {
      const m = localStorage.getItem(KEY_MODE);
      if (m === 'beer' || m === 'sand' || m === 'pay') return m;
    } catch (e) { /* 무시 */ }
    return 'beer';
  }
  function storeMode(m) {
    try { localStorage.setItem(KEY_MODE, m); } catch (e) { /* 무시 */ }
  }
  function purgeExpired(s, today) {
    const before = s.special.length;
    s.special = s.special.filter(x => x.date >= today);
    return s.special.length !== before;
  }

  /* ===== DOM ===== */
  const $ = id => document.getElementById('sn-' + id);
  const els = {
    vessel: $('vessel'), badge: $('badge'),
    beerSvg: $('beerSvg'), sandSvg: $('sandSvg'),
    beerLiquid: $('beerLiquid'), liqClipRect: $('liqClipRect'), bubbles: $('bubbles'),
    sandTop: $('sandTop'), sandBot: $('sandBot'), stream: $('stream'),
    workInfo: $('workInfo'), pct: $('pct'), remain: $('remain'), msg: $('msg'), times: $('times'),
    celebrate: $('celebrate'), confetti: $('confetti'),
    sheet: $('sheet'), weekRows: $('weekRows'), spList: $('spList'),
    spDate: $('spDate'), spStart: $('spStart'), spEnd: $('spEnd'), setError: $('setError'),
    weekUniform: $('weekUniform'), spRange: $('spRange'), spDateEnd: $('spDateEnd'),
    spDays: $('spDays'), spAddBox: $('spAddBox'),
    paySvg: $('paySvg'), billStack: $('billStack'), dropBill: $('dropBill'),
    payInfo: $('payInfo'), payMonth: $('payMonth'), payToday: $('payToday'), payState: $('payState'),
    payOn: $('payOn'), payAmount: $('payAmount')
  };

  /* ===== 상태 ===== */
  let settings = loadSettings();
  let mode = loadMode();
  if (mode === 'pay' && !settings.salary.on) mode = 'beer';
  let lastState = null;
  let lastP = null;
  let lastDay = null;
  let celebrateUntil = 0;

  /* ===== 맥주 그래픽 준비 ===== */
  function wavePath(y, amp, period, bottom) {
    let d = `M-120 ${y}`;
    for (let x = -120; x < 330; x += period) {
      d += ` q ${period / 4} ${-amp} ${period / 2} 0 t ${period / 2} 0`;
    }
    return d + ` L330 ${bottom} L-120 ${bottom} Z`;
  }
  $('waveBack').setAttribute('d', wavePath(-2, 4, 50, 40));
  $('waveFoam').setAttribute('d', wavePath(-7, 3, 50, 9));

  (function makeBubbles() {
    const NS = 'http://www.w3.org/2000/svg';
    const total = 22;
    for (let i = 0; i < total; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', (62 + Math.random() * 76).toFixed(1));
      c.setAttribute('cy', '282');
      c.setAttribute('r', (1.2 + Math.random() * 1.8).toFixed(1));
      c.setAttribute('class', i < 10 ? 'sn-bubble' : 'sn-bubble sn-extra');
      c.style.setProperty('--d', (3 + Math.random() * 3).toFixed(2) + 's');
      c.style.setProperty('--dl', (-Math.random() * 6).toFixed(2) + 's');
      els.bubbles.appendChild(c);
    }
  })();

  /* ===== 게이지 그리기 ===== */
  function drawBeer(p) {
    const top = p <= 0 ? 300 : 286 - 262 * (p / 100);
    els.beerLiquid.setAttribute('transform', `translate(0,${top.toFixed(2)})`);
    els.liqClipRect.setAttribute('y', (top + 6).toFixed(2));
  }
  function drawSand(p, running) {
    const a = 1 - p / 100;
    if (a > 0) {
      const sy = 150 - 118 * a;
      const dip = 2 + 6 * a;
      els.sandTop.setAttribute('d', `M0 ${sy.toFixed(2)} L100 ${(sy + dip).toFixed(2)} L200 ${sy.toFixed(2)} L200 160 L0 160 Z`);
    } else {
      els.sandTop.setAttribute('d', '');
    }
    let peak = 274;
    if (p > 0) {
      const h = 116 * (p / 100);
      const sy = 274 - h;
      const mound = Math.min(14, h * 0.6);
      peak = sy - mound / 2;
      els.sandBot.setAttribute('d', `M0 300 L0 ${(sy + mound / 2).toFixed(2)} L100 ${peak.toFixed(2)} L200 ${(sy + mound / 2).toFixed(2)} L200 300 Z`);
    } else {
      els.sandBot.setAttribute('d', '');
    }
    els.stream.setAttribute('y2', peak.toFixed(2));
    els.stream.style.display = running ? '' : 'none';
  }

  function applyMode() {
    els.beerSvg.toggleAttribute('hidden', mode !== 'beer');
    els.sandSvg.toggleAttribute('hidden', mode !== 'sand');
    els.paySvg.toggleAttribute('hidden', mode !== 'pay');
    document.querySelector('#sn-root .sn-modes button[data-mode="pay"]').hidden = !settings.salary.on;
    document.querySelectorAll('#sn-root .sn-modes button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    });
  }

  /* ===== 오늘 일정 ===== */
  function scheduleFor(d) {
    const key = dateKey(d);
    const sp = settings.special.find(x => x.date === key);
    if (sp) return { start: sp.start, end: sp.end, special: true };
    const w = settings.weekly[d.getUTCDay()];
    if (w && w.on && toMin(w.end) > toMin(w.start)) return { start: w.start, end: w.end, special: false };
    return null;
  }

  function compute() {
    const d = kstNow();
    const sch = scheduleFor(d);
    const sec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
    let state = 'off', p = 0, remain = 0;
    if (sch) {
      const s = toMin(sch.start) * 60;
      const e = toMin(sch.end) * 60;
      if (sec < s) state = 'before';
      else if (sec >= e) { state = 'after'; p = 100; }
      else { state = 'work'; p = (sec - s) / (e - s) * 100; remain = e - sec; }
    }
    return { d, sch, state, p, remain };
  }

  /* ===== 급여 계산 (요일별 기본 근무만, 1일~말일) ===== */
  function computePay(d) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), today = d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const sec = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
    let total = 0, done = 0, todayDur = 0, todayDone = 0, days = 0, doneDays = 0, state = 'off', tw = null;
    for (let day = 1; day <= last; day++) {
      const w = settings.weekly[new Date(Date.UTC(y, m, day)).getUTCDay()];
      if (!w || !w.on) continue;
      const s = toMin(w.start) * 60, e = toMin(w.end) * 60;
      if (!(e > s)) continue;
      const dur = e - s;
      total += dur; days++;
      if (day < today) { done += dur; doneDays++; }
      else if (day === today) {
        todayDur = dur;
        todayDone = Math.min(dur, Math.max(0, sec - s));
        done += todayDone;
        state = sec < s ? 'before' : sec >= e ? 'after' : 'work';
        tw = w;
      }
    }
    const rate = total ? settings.salary.amount / total : 0;
    return {
      state, w: tw, days, total, doneDays,
      frac: todayDur ? todayDone / todayDur : 0,
      month: rate * done, today: rate * todayDone, todayFull: rate * todayDur,
      p: total ? done / total * 100 : 0
    };
  }
  const won = v => Math.floor(v).toLocaleString('ko-KR');

  /* ===== 지폐 다발 (근무일 1일 = 1묶음) ===== */
  const BILL_X = 25, BILL_W = 120, BILL_DX = 30, BILL_DY = 18, BILL_BASE = 282;
  const BILL_SOLID = { front: '#5E9A5A', line: '#8CC283', side: '#3F7A3C', top: '#A8D497', band: '#E8730A', band2: '#F28C2B', deco: '#8CC283', edge: '#5E9A5A' };
  const BILL_GHOST = { front: '#E4EDDC', line: '#F1F6EC', side: '#D3E0C9', top: '#EEF4E8', band: '#F6DCC0', band2: '#F9E5CF', deco: '#E2ECD9', edge: '#D3E0C9' };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let billKey = '';
  let billClipRect = null;

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  }
  function drawBundle(parent, y, h, c, isTop) {
    const x = BILL_X, W = BILL_W, dx = BILL_DX, dy = BILL_DY;
    svgEl('rect', { x, y, width: W, height: h, fill: c.front }, parent);
    for (let i = 2; i < h - 0.5; i += 2.4) {
      svgEl('line', { x1: x, y1: y + i, x2: x + W, y2: y + i, stroke: c.line, 'stroke-width': 0.7 }, parent);
    }
    svgEl('line', { x1: x, y1: y + h - 0.5, x2: x + W, y2: y + h - 0.5, stroke: c.side, 'stroke-width': 1 }, parent);
    svgEl('polygon', { points: `${x + W},${y} ${x + W + dx},${y - dy} ${x + W + dx},${y - dy + h} ${x + W},${y + h}`, fill: c.side }, parent);
    svgEl('polygon', { points: `${x},${y} ${x + W},${y} ${x + W + dx},${y - dy} ${x + dx},${y - dy}`, fill: c.top, stroke: c.edge, 'stroke-width': 0.6 }, parent);
    svgEl('rect', { x: x + 50, y, width: 18, height: h, fill: c.band }, parent);
    if (isTop) {
      svgEl('polygon', { points: `${x + 9},${y - 3} ${x + 113},${y - 3} ${x + 135},${y - dy + 3} ${x + 31},${y - dy + 3}`, fill: 'none', stroke: c.deco, 'stroke-width': 0.8 }, parent);
      svgEl('ellipse', { cx: x + 104, cy: y - dy / 2, rx: 10, ry: 4.5, fill: c.deco }, parent);
      svgEl('polygon', { points: `${x + 50},${y} ${x + 68},${y} ${x + 68 + dx},${y - dy} ${x + 50 + dx},${y - dy}`, fill: c.band2 }, parent);
    }
  }
  function drawBills(pay) {
    const n = pay.days;
    const h = n ? Math.min(12, (BILL_BASE - 40 - BILL_DY) / n) : 0;
    const todayIdx = pay.w ? pay.doneDays : -1;
    const key = `${n}|${pay.doneDays}|${todayIdx}`;
    if (key !== billKey) {
      billKey = key;
      billClipRect = null;
      els.billStack.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const y = BILL_BASE - (i + 1) * h;
        const isTop = i === n - 1;
        if (i < pay.doneDays) {
          drawBundle(els.billStack, y, h, BILL_SOLID, isTop);
        } else if (i === todayIdx) {
          drawBundle(els.billStack, y, h, BILL_GHOST, isTop);
          const clip = svgEl('clipPath', { id: 'sn-todayBillClip' }, els.billStack);
          billClipRect = svgEl('rect', { x: BILL_X - 2, y: 0, width: 0, height: 300 }, clip);
          const g = svgEl('g', { 'clip-path': 'url(#sn-todayBillClip)' }, els.billStack);
          drawBundle(g, y, h, BILL_SOLID, isTop);
        } else {
          drawBundle(els.billStack, y, h, BILL_GHOST, isTop);
        }
      }
    }
    if (billClipRect) {
      billClipRect.setAttribute('width', (pay.frac * (BILL_W + BILL_DX + 4)).toFixed(2));
    }
    const target = todayIdx >= 0 ? BILL_BASE - (todayIdx + 1) * h - BILL_DY / 2 : BILL_BASE;
    els.dropBill.style.setProperty('--fall', Math.max(0, target - 20).toFixed(1) + 'px');
  }

  function renderPay() {
    const pay = computePay(kstNow());
    drawBills(pay);
    els.vessel.classList.remove('sn-idle', 'sn-busy', 'sn-glow');
    els.vessel.classList.toggle('sn-earning', pay.state === 'work' && settings.salary.amount > 0);
    els.vessel.setAttribute('aria-valuenow', pay.p.toFixed(2));
    els.workInfo.hidden = true;
    els.msg.hidden = true;
    els.payInfo.hidden = false;
    els.payMonth.textContent = won(pay.month);
    els.payToday.textContent = `+${won(pay.today)}원`;
    els.payState.textContent =
      pay.state === 'work' ? '오늘 쌓이는 중' :
      pay.state === 'before' ? '오늘 출근 전' :
      pay.state === 'after' ? '오늘 몫 완료' : '오늘은 급여 근무 없음';
    if (!settings.salary.amount) {
      els.times.textContent = '설정에서 월 급여를 입력해 주세요.';
    } else if (!pay.days) {
      els.times.textContent = '이번 달 요일별 근무일이 없어요.';
    } else if (pay.w) {
      els.times.innerHTML = `오늘 <span class="sn-num">${pay.w.start} ~ ${pay.w.end}</span> · 하루 <span class="sn-num">${won(pay.todayFull)}원</span>`;
    } else {
      els.times.innerHTML = `이번 달 근무 <span class="sn-num">${pay.days}</span>일 · <span class="sn-num">${pay.p.toFixed(2)}%</span> 적립`;
    }
  }

  function fmtRemain(sec) {
    const t = Math.max(0, Math.ceil(sec));
    return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
  }

  /* ===== 구간 효과 ===== */
  function flashMilestone(m) {
    els.badge.textContent = m + '%';
    els.badge.classList.remove('sn-show');
    els.vessel.classList.remove('sn-pulse');
    void els.badge.offsetWidth;
    els.badge.classList.add('sn-show');
    els.vessel.classList.add('sn-pulse');
    setTimeout(() => els.vessel.classList.remove('sn-pulse'), 1300);
  }

  /* ===== 메인 루프 ===== */
  function tick() {
    const now = compute();
    const today = dateKey(now.d);

    if (today !== lastDay) {
      if (purgeExpired(settings, today)) storeSettings(settings);
      lastDay = today;
    }

    if (lastState === 'work' && now.state === 'after') celebrate();
    if (celebrateUntil && (now.state !== 'after' || performance.now() >= celebrateUntil)) endCelebrate();

    if (mode !== 'pay' && now.state === 'work' && lastState === 'work' && lastP !== null) {
      MILESTONES.forEach(m => { if (lastP < m && now.p >= m) flashMilestone(m); });
    }

    render(now);
    lastState = now.state;
    lastP = now.p;
  }

  function render(now) {
    const celebrating = celebrateUntil > 0;
    const p = now.p;
    const showGauge = now.state === 'work' || celebrating;

    if (mode === 'pay') { renderPay(); return; }
    els.payInfo.hidden = true;
    els.vessel.classList.remove('sn-earning');

    if (mode === 'beer') drawBeer(p);
    else drawSand(p, now.state === 'work');

    els.vessel.classList.toggle('sn-idle', now.state === 'off' || now.state === 'before');
    els.vessel.classList.toggle('sn-busy', now.state === 'work' && p >= 75);
    els.vessel.classList.toggle('sn-glow', now.state === 'work' && p >= 90);
    els.vessel.setAttribute('aria-valuenow', p.toFixed(2));

    els.workInfo.hidden = !showGauge;
    els.msg.hidden = showGauge;

    if (showGauge) {
      const shown = celebrating ? 100 : Math.floor(p * 100) / 100;
      els.pct.textContent = shown.toFixed(2);
      els.remain.textContent = celebrating ? '00:00:00' : fmtRemain(now.remain);
      els.remain.classList.toggle('sn-hot', !celebrating && p >= 90);
      els.remain.classList.toggle('sn-beat', !celebrating && p >= 99);
    } else {
      els.msg.textContent =
        now.state === 'before' ? '출근 전 자유' :
        now.state === 'after' ? '퇴근 후 자유' : '오늘은 쉬는 날';
    }

    if (now.sch) {
      els.times.innerHTML = `오늘 <span class="sn-num">${now.sch.start} ~ ${now.sch.end}</span>` +
        (now.sch.special ? '<span class="sn-tag">특정 날짜</span>' : '');
    } else {
      els.times.textContent = '';
    }
  }

  /* ===== 축하 연출 ===== */
  let confettiParts = [];
  let confettiRAF = 0;

  function celebrate() {
    celebrateUntil = performance.now() + CELEBRATE_MS;
    els.celebrate.hidden = false;
    els.vessel.classList.remove('sn-cheer');
    void els.vessel.offsetWidth;
    els.vessel.classList.add('sn-cheer');
    startConfetti();
  }
  function endCelebrate() {
    celebrateUntil = 0;
    els.celebrate.hidden = true;
    els.vessel.classList.remove('sn-cheer');
    stopConfetti();
  }

  function startConfetti() {
    const cv = els.confetti;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = mode === 'sand'
      ? ['#D8A65B', '#B07D35', '#5B4636', '#E8730A', '#F0A202']
      : ['#F0A202', '#F7B733', '#FFFDF6', '#E8730A', '#FF9F6B'];
    const count = reduceMotion ? 0 : (w < 600 ? 110 : 180);
    confettiParts = [];
    for (let i = 0; i < count; i++) {
      const fromLeft = i % 2 === 0;
      confettiParts.push({
        x: fromLeft ? -10 : w + 10,
        y: h * (0.55 + Math.random() * 0.35),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
        vy: -(9 + Math.random() * 9),
        s: 5 + Math.random() * 6,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        c: colors[i % colors.length]
      });
    }
    cancelAnimationFrame(confettiRAF);
    const step = () => {
      ctx.clearRect(0, 0, w, h);
      confettiParts.forEach(q => {
        q.vy += 0.32; q.vx *= 0.99;
        q.x += q.vx; q.y += q.vy; q.r += q.vr;
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.r);
        ctx.fillStyle = q.c;
        ctx.fillRect(-q.s / 2, -q.s / 4, q.s, q.s / 2);
        ctx.restore();
      });
      if (celebrateUntil) confettiRAF = requestAnimationFrame(step);
    };
    confettiRAF = requestAnimationFrame(step);
  }
  function stopConfetti() {
    cancelAnimationFrame(confettiRAF);
    const ctx = els.confetti.getContext('2d');
    ctx.clearRect(0, 0, els.confetti.width, els.confetti.height);
    confettiParts = [];
  }

  els.celebrate.addEventListener('click', () => { endCelebrate(); tick(); });

  /* ===== 모드 전환 ===== */
  document.querySelectorAll('#sn-root .sn-modes button').forEach(b => {
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      storeMode(mode);
      applyMode();
      tick();
    });
  });

  /* ===== 설정 화면 ===== */
  let draft = null;

  function openSheet() {
    draft = JSON.parse(JSON.stringify(settings));
    purgeExpired(draft, dateKey(kstNow()));
    els.setError.textContent = '';
    els.spDate.value = '';
    els.spDate.min = dateKey(kstNow());
    els.spDateEnd.value = '';
    els.spDateEnd.min = dateKey(kstNow());
    els.weekUniform.checked = !!draft.uniform;
    els.spRange.checked = false;
    spDaySel = new Set([0, 1, 2, 3, 4, 5, 6]);
    applyRangeMode();
    renderWeekRows();
    renderSpecial();
    els.payOn.checked = !!draft.salary.on;
    els.payAmount.value = draft.salary.amount ? draft.salary.amount.toLocaleString('ko-KR') : '';
    els.payAmount.disabled = !draft.salary.on;
    els.sheet.hidden = false;
    $('sheetClose').focus();
  }
  function closeSheet() {
    els.sheet.hidden = true;
    draft = null;
    $('openSettings').focus();
  }

  function makeChips(box, isOn, onToggle) {
    box.innerHTML = '';
    DAY_ORDER.forEach(i => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-chip' + (i === 0 ? ' sn-sun' : i === 6 ? ' sn-sat' : '');
      b.textContent = DAY_NAMES[i];
      b.setAttribute('aria-pressed', String(isOn(i)));
      b.setAttribute('aria-label', `${DAY_NAMES[i]}요일`);
      b.addEventListener('click', () => {
        onToggle(i);
        b.setAttribute('aria-pressed', String(isOn(i)));
      });
      box.appendChild(b);
    });
  }

  function syncUniform() {
    const src = DAY_ORDER.map(i => draft.weekly[i]).find(w => w.on) || draft.weekly[1];
    for (let i = 0; i < 7; i++) {
      draft.weekly[i].start = src.start;
      draft.weekly[i].end = src.end;
    }
  }

  function renderUniform() {
    const chips = document.createElement('div');
    chips.className = 'sn-day-chips';
    makeChips(chips, i => draft.weekly[i].on, i => { draft.weekly[i].on = !draft.weekly[i].on; });
    const t = document.createElement('div');
    t.className = 'sn-uni-time';
    t.innerHTML =
      `<input type="time" class="sn-t-start" value="${draft.weekly[1].start}" aria-label="출근 시각">` +
      `<span class="sn-tilde">~</span>` +
      `<input type="time" class="sn-t-end" value="${draft.weekly[1].end}" aria-label="퇴근 시각">`;
    const ts = t.querySelector('.sn-t-start');
    const te = t.querySelector('.sn-t-end');
    ts.addEventListener('input', () => { for (let i = 0; i < 7; i++) draft.weekly[i].start = ts.value; });
    te.addEventListener('input', () => { for (let i = 0; i < 7; i++) draft.weekly[i].end = te.value; });
    els.weekRows.appendChild(chips);
    els.weekRows.appendChild(t);
  }

  els.weekUniform.addEventListener('change', () => {
    draft.uniform = els.weekUniform.checked;
    if (draft.uniform) syncUniform();
    renderWeekRows();
  });

  function renderWeekRows() {
    els.weekRows.innerHTML = '';
    if (draft.uniform) { renderUniform(); return; }
    DAY_ORDER.forEach(i => {
      const w = draft.weekly[i];
      const row = document.createElement('div');
      row.className = 'sn-day-row' + (w.on ? '' : ' sn-off');
      const cls = i === 0 ? 'sn-sun' : i === 6 ? 'sn-sat' : '';
      row.innerHTML =
        `<span class="sn-day-name ${cls}">${DAY_NAMES[i]}</span>` +
        `<label class="sn-switch"><input type="checkbox" ${w.on ? 'checked' : ''} aria-label="${DAY_NAMES[i]}요일 근무"><span></span></label>` +
        `<input type="time" class="sn-t-start" value="${w.start}" aria-label="${DAY_NAMES[i]}요일 출근 시각" ${w.on ? '' : 'disabled'}>` +
        `<span class="sn-tilde">~</span>` +
        `<input type="time" class="sn-t-end" value="${w.end}" aria-label="${DAY_NAMES[i]}요일 퇴근 시각" ${w.on ? '' : 'disabled'}>`;
      const chk = row.querySelector('input[type="checkbox"]');
      const ts = row.querySelector('.sn-t-start');
      const te = row.querySelector('.sn-t-end');
      chk.addEventListener('change', () => {
        w.on = chk.checked;
        row.classList.toggle('sn-off', !w.on);
        ts.disabled = te.disabled = !w.on;
      });
      ts.addEventListener('input', () => { w.start = ts.value; });
      te.addEventListener('input', () => { w.end = te.value; });
      els.weekRows.appendChild(row);
    });
  }

  function renderSpecial() {
    els.spList.innerHTML = '';
    const list = draft.special.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'sn-empty';
      li.textContent = '등록된 날짜가 없어요.';
      els.spList.appendChild(li);
      return;
    }
    list.forEach(x => {
      const li = document.createElement('li');
      li.className = 'sn-sp-item';
      li.innerHTML =
        `<span><span class="sn-num">${x.date}</span> (${DAY_NAMES[weekdayOf(x.date)]})</span>` +
        `<button type="button" class="sn-sp-del" aria-label="${x.date} 삭제">삭제</button>` +
        `<div class="sn-sp-times">` +
        `<input type="time" class="sn-t-start" value="${x.start}" aria-label="${x.date} 출근 시각">` +
        `<span class="sn-tilde">~</span>` +
        `<input type="time" class="sn-t-end" value="${x.end}" aria-label="${x.date} 퇴근 시각">` +
        `</div>`;
      const ts = li.querySelector('.sn-t-start');
      const te = li.querySelector('.sn-t-end');
      ts.addEventListener('input', () => { x.start = ts.value; });
      te.addEventListener('input', () => { x.end = te.value; });
      li.querySelector('.sn-sp-del').addEventListener('click', () => {
        draft.special = draft.special.filter(y => y.date !== x.date);
        renderSpecial();
      });
      els.spList.appendChild(li);
    });
  }

  let spDaySel = new Set([0, 1, 2, 3, 4, 5, 6]);

  function applyRangeMode() {
    const on = els.spRange.checked;
    els.spAddBox.classList.toggle('sn-range', on);
    els.spDays.hidden = !on;
    els.spDate.setAttribute('aria-label', on ? '시작 날짜' : '날짜');
    if (on) makeChips(els.spDays, i => spDaySel.has(i), i => { spDaySel.has(i) ? spDaySel.delete(i) : spDaySel.add(i); });
  }
  els.spRange.addEventListener('change', applyRangeMode);

  els.payOn.addEventListener('change', () => {
    draft.salary.on = els.payOn.checked;
    els.payAmount.disabled = !draft.salary.on;
    if (draft.salary.on) els.payAmount.focus();
  });
  els.payAmount.addEventListener('input', () => {
    const digits = els.payAmount.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
    draft.salary.amount = digits ? Number(digits) : 0;
    els.payAmount.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  });

  function addRange() {
    const from = els.spDate.value, to = els.spDateEnd.value;
    const s = els.spStart.value, e = els.spEnd.value;
    const today = dateKey(kstNow());
    if (!from || !to) { els.setError.textContent = '시작일과 종료일을 선택해 주세요.'; return; }
    if (to < from) { els.setError.textContent = '종료일은 시작일과 같거나 늦어야 해요.'; return; }
    if (to < today) { els.setError.textContent = '오늘 이후 날짜만 추가할 수 있어요.'; return; }
    if (!spDaySel.size) { els.setError.textContent = '요일을 하나 이상 선택해 주세요.'; return; }
    if (toMin(s) === null || toMin(e) === null) { els.setError.textContent = '출근·퇴근 시각을 입력해 주세요.'; return; }
    if (toMin(e) <= toMin(s)) { els.setError.textContent = '퇴근 시각은 출근 시각보다 늦어야 해요.'; return; }
    const DAY_MS = 86400000;
    const t0 = Date.parse(from + 'T00:00:00Z'), t1 = Date.parse(to + 'T00:00:00Z');
    if ((t1 - t0) / DAY_MS > 365) { els.setError.textContent = '기간은 최대 1년까지 지정할 수 있어요.'; return; }
    const keys = [];
    for (let t = t0; t <= t1; t += DAY_MS) {
      const d = new Date(t);
      const key = dateKey(d);
      if (key >= today && spDaySel.has(d.getUTCDay())) keys.push(key);
    }
    if (!keys.length) { els.setError.textContent = '해당 기간에 선택한 요일이 없어요.'; return; }
    draft.special = draft.special.filter(x => !keys.includes(x.date));
    keys.forEach(date => draft.special.push({ date, start: s, end: e }));
    els.setError.textContent = '';
    els.spDate.value = '';
    els.spDateEnd.value = '';
    renderSpecial();
  }

  $('spAdd').addEventListener('click', () => {
    if (els.spRange.checked) { addRange(); return; }
    const date = els.spDate.value;
    const s = els.spStart.value, e = els.spEnd.value;
    const today = dateKey(kstNow());
    if (!date) { els.setError.textContent = '날짜를 선택해 주세요.'; return; }
    if (date < today) { els.setError.textContent = '오늘 이후 날짜만 추가할 수 있어요.'; return; }
    if (toMin(s) === null || toMin(e) === null) { els.setError.textContent = '출근·퇴근 시각을 입력해 주세요.'; return; }
    if (toMin(e) <= toMin(s)) { els.setError.textContent = '퇴근 시각은 출근 시각보다 늦어야 해요.'; return; }
    draft.special = draft.special.filter(x => x.date !== date);
    draft.special.push({ date, start: s, end: e });
    els.setError.textContent = '';
    els.spDate.value = '';
    renderSpecial();
  });

  $('setSave').addEventListener('click', () => {
    for (const i of DAY_ORDER) {
      const w = draft.weekly[i];
      if (!w.on) continue;
      const pre = draft.uniform ? '' : `${DAY_NAMES[i]}요일: `;
      if (toMin(w.start) === null || toMin(w.end) === null) {
        els.setError.textContent = `${pre}출근·퇴근 시각을 입력해 주세요.`; return;
      }
      if (toMin(w.end) <= toMin(w.start)) {
        els.setError.textContent = `${pre}퇴근 시각은 출근 시각보다 늦어야 해요.`; return;
      }
    }
    for (const x of draft.special.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      if (toMin(x.start) === null || toMin(x.end) === null) {
        els.setError.textContent = `${x.date}: 출근·퇴근 시각을 입력해 주세요.`; return;
      }
      if (toMin(x.end) <= toMin(x.start)) {
        els.setError.textContent = `${x.date}: 퇴근 시각은 출근 시각보다 늦어야 해요.`; return;
      }
    }
    if (draft.salary.on && !(draft.salary.amount > 0)) {
      els.setError.textContent = '월 급여를 입력해 주세요.'; return;
    }
    const next = normalize(draft);
    if (!storeSettings(next)) {
      els.setError.textContent = '이 브라우저에서는 설정을 저장할 수 없어요. 개인정보 보호 모드인지 확인해 주세요.';
      return;
    }
    settings = next;
    lastState = null;
    lastP = null;
    if (mode === 'pay' && !settings.salary.on) { mode = 'beer'; storeMode(mode); }
    applyMode();
    closeSheet();
    tick();
  });

  $('openSettings').addEventListener('click', openSheet);
  $('sheetClose').addEventListener('click', closeSheet);
  $('setCancel').addEventListener('click', closeSheet);
  els.sheet.addEventListener('click', e => { if (e.target === els.sheet) closeSheet(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!els.sheet.hidden) closeSheet();
    else if (celebrateUntil) { endCelebrate(); tick(); }
  });

  /* ===== 다시 열었을 때 축하 ===== */
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (away >= 30000 && compute().state === 'after' && !celebrateUntil) celebrate();
    tick();
  });
  window.addEventListener('pageshow', e => {
    if (e.persisted && compute().state === 'after' && !celebrateUntil) celebrate();
  });

  /* ===== 시작 ===== */
  applyMode();
  if (compute().state === 'after') celebrate();
  tick();
  setInterval(tick, 250);
})();
