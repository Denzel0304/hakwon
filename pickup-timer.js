/* =========================================================
   pickup-timer.js — 하원 타이머 (PC 전용 · index.html에서만 불러옴)
   - 열기: 오늘·날짜 화면 제목줄 '할일 검색' 바로 오른쪽의 시계 아이콘 (그 오른쪽에 날씨)
   - 학생 이름(직접 입력) + 수업시간 80/90분 → 도착 시각 + 수업시간 = 하원 시각
     · '지금 시작': 지금 시각으로 추가 / 도착 칸에 시각을 넣고 '추가': 그 시각으로 추가 (늦게 입력한 경우)
     · 이름 칸에서 Enter: 도착 칸이 비었으면 지금 시작, 차 있으면 그 시각으로 추가
     · 수업시간은 학생마다 고르고, 추가할 때 고른 값을 기억해 다음 기본값으로 (처음 80분)
     · 추가한 뒤에도 줄에서 도착 시각 · 수업시간을 고칠 수 있음
   - 목록은 하원 시각 순. 하원 시각이 되면 그 줄이 녹색으로 깜빡임 (할일 알림창 깜빡임과 같은 방식 · 마우스를 올리면 멈춤)
     '하원' 버튼을 누르면 목록에서 빠짐. '진행 중' = 아직 하원 버튼을 누르지 않은 학생
   - 창: 화면을 덮지 않고 떠 있음 (다른 메뉴·입력을 그대로 쓸 수 있음, 바깥을 눌러도 · Esc로도 닫히지 않음)
     · 입력칸·버튼이 아닌 곳을 잡고 끌면 이동 / 가장자리·모서리를 끌면 크기 조절 (시간표 팝업과 같은 방식)
     · X 또는 '닫기'로만 닫힘. 진행 중인 학생이 있으면 확인 후 목록을 모두 지우고 닫음
   - 저장: 이 PC 브라우저 localStorage mg77_ltimer { open, dur, list:[{ id, name, start(ms), dur }], box:{ x, y, w, h } }
     → 새로고침해도 목록 · 창 위치 · 크기 그대로 다시 뜸 (mg77_ 접두사라 로그아웃하면 함께 지워짐)
     · 같은 PC의 다른 탭과도 맞춰짐
   ========================================================= */
const PickupTimer = {
  LS: 'mg77_ltimer',
  MIN_W: 320,
  MIN_H: 170,
  DEF_W: 600,               // 처음 너비: 학생 한 줄(이름 · 도착 · 수업 · 하원 · 남은 시간 · 하원 버튼)이 한 줄에 들어가는 폭
  DEF_H: 380,
  BOX_V: 2,
  el: null,
  st: null,
  _tick: null,

  /* ---------- 저장 ---------- */
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.LS) || 'null'); } catch (e) { s = null; }
    s = s && typeof s === 'object' ? s : {};
    return {
      open: !!s.open,
      dur: s.dur === 90 ? 90 : 80,
      list: Array.isArray(s.list) ? s.list.filter(x => x && x.id && isFinite(x.start)).map(x => ({ id: String(x.id), name: String(x.name || ''), start: +x.start, dur: x.dur === 90 ? 90 : 80 })) : [],
      box: s.box && s.box.v === this.BOX_V && isFinite(s.box.x) && isFinite(s.box.y) && isFinite(s.box.w) && isFinite(s.box.h) ? s.box : null,   // 예전 판의 위치·크기는 버리고 새 기본 크기로
    };
  },
  save() { try { localStorage.setItem(this.LS, JSON.stringify(this.st)); } catch (e) { /* 저장 못 해도 이번 화면에서는 동작 */ } },

  /* ---------- 시각 ---------- */
  hm(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); },
  // 'HH:MM' → 오늘 그 시각(ms)
  fromHM(v) {
    const m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
    return d.getTime();
  },
  endOf(x) { return x.start + x.dur * 60000; },
  // 지금 시각(분 단위로 자름) — 하원 시각이 '분'에 맞춰 나오도록
  nowMin() { const d = new Date(); d.setSeconds(0, 0); return d.getTime(); },
  isDue(x) { return Date.now() >= this.endOf(x); },
  leftText(x) {
    const ms = this.endOf(x) - Date.now();
    if (ms <= 0) return '하원 시간';
    const m = Math.ceil(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분 남음` : `${m}분 남음`;
  },
  sorted() { return this.st.list.slice().sort((a, b) => this.endOf(a) - this.endOf(b) || a.start - b.start); },

  /* ---------- 열기 · 닫기 ---------- */
  open() {
    this.st = this.load();
    this.st.open = true;
    this.save();
    this.show();
    const n = $('[data-lt-name]', this.el);
    if (n) setTimeout(() => n.focus(), 30);
  },
  show() {
    if (!this.el) this.build();
    this.el.style.display = '';
    this.place();
    this.drawList();
    this.paintDur();
    this.startTick();
  },
  hideOnly() {
    if (this.el) this.el.style.display = 'none';
    clearInterval(this._tick); this._tick = null;
  },
  async close() {
    const n = this.st.list.length;
    if (n && !await confirmDlg(`아직 하원하지 않은 학생이 ${n}명 있습니다.\n닫으면 목록이 모두 지워집니다. 닫을까요?`, '닫기', true)) return;
    this.st = this.load();             // 확인창이 떠 있는 동안 다른 탭에서 바뀐 것 반영
    this.st.list = [];
    this.st.open = false;
    this.save();
    this.hideOnly();
  },

  /* ---------- 추가 · 수정 · 하원 ---------- */
  add(useNow) {
    const nameEl = $('[data-lt-name]', this.el), timeEl = $('[data-lt-time]', this.el);
    const name = nameEl.value.trim();
    if (!name) { toast('학생 이름을 입력하세요'); nameEl.focus(); return; }
    let start;
    if (useNow) start = this.nowMin();
    else {
      start = this.fromHM(timeEl.value);
      if (start == null) { toast('도착 시각을 입력하세요'); timeEl.focus(); return; }
    }
    this.st.list.push({ id: 'LT' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, start, dur: this.st.dur });
    this.save();
    nameEl.value = ''; timeEl.value = '';
    this.drawList();
    nameEl.focus();
  },
  upd(id, o) {
    const x = this.st.list.find(v => v.id === id);
    if (!x) return;
    Object.assign(x, o);
    this.save();
    this.drawList();
  },
  done(id) {
    this.st.list = this.st.list.filter(v => v.id !== id);
    this.save();
    this.drawList();
  },

  /* ---------- 그리기 ---------- */
  build() {
    const el = document.createElement('div');
    el.id = 'lt-win';
    el.style.display = 'none';
    el.innerHTML = `<div class="lt-head"><b>🕒 하원 타이머<span class="lt-cnt" data-lt-cnt></span></b><button type="button" class="lt-x" data-lt-close title="닫기" aria-label="닫기">✕</button></div>
      <div class="lt-body">
        <div class="lt-add">
          <div class="lt-row"><input type="text" data-lt-name placeholder="학생 이름" maxlength="20" autocomplete="off">
            <span class="att-seg lt-seg" data-lt-dur>${[80, 90].map(v => `<button type="button" data-lt-d="${v}">${v}분</button>`).join('')}</span></div>
          <div class="lt-row"><button type="button" class="btn sm primary" data-lt-now title="지금 시각을 도착 시각으로 추가합니다">지금 시작</button>
            <span class="lt-or small soft">또는 도착</span><input type="time" data-lt-time step="60" title="실제로 도착한 시각 (늦게 입력할 때)">
            <button type="button" class="btn sm" data-lt-at title="입력한 도착 시각으로 추가합니다">추가</button></div>
        </div>
        <div class="lt-list" data-lt-list></div>
      </div>
      <div class="lt-foot"><button type="button" class="btn sm" data-lt-close>닫기</button></div>
      ${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(d => `<div class="lt-rz ${d}" data-lt-rz="${d}"></div>`).join('')}`;
    document.body.appendChild(el);
    this.el = el;

    el.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-lt-close]')) { this.close(); return; }
      if (t.closest('[data-lt-now]')) { this.add(true); return; }
      if (t.closest('[data-lt-at]')) { this.add(false); return; }
      const d = t.closest('[data-lt-d]');
      if (d) { this.st.dur = +d.dataset.ltD === 90 ? 90 : 80; this.save(); this.paintDur(); return; }
      const ok = t.closest('[data-lt-done]');
      if (ok) { this.done(ok.dataset.ltDone); return; }
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-lt-st]')) {                 // 줄의 도착 시각 고치기
        const v = this.fromHM(t.value);
        if (v == null) { this.drawList(); return; }
        this.upd(t.dataset.ltSt, { start: v });
        return;
      }
      if (t.matches('[data-lt-rd]')) { this.upd(t.dataset.ltRd, { dur: +t.value === 90 ? 90 : 80 }); return; }   // 줄의 수업시간 고치기
    });
    $('[data-lt-name]', el).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      this.add(!$('[data-lt-time]', el).value);
    });
    $('[data-lt-time]', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.add(false); } });
    this.bindMove();
  },
  paintDur() {
    if (!this.el) return;
    $$('[data-lt-d]', this.el).forEach(b => b.classList.toggle('on', +b.dataset.ltD === this.st.dur));
  },
  drawList() {
    if (!this.el) return;
    const list = this.sorted();
    $('[data-lt-cnt]', this.el).textContent = list.length ? ` ${list.length}명` : '';
    $('[data-lt-list]', this.el).innerHTML = list.length ? list.map(x => `<div class="lt-item${this.isDue(x) ? ' due' : ''}" data-lt-id="${esc(x.id)}">
        <b class="lt-nm" title="${esc(x.name)}">${esc(x.name)}</b>
        <span class="lt-in"><input type="time" step="60" data-lt-st="${esc(x.id)}" value="${this.hm(x.start)}" title="도착 시각"></span>
        <select data-lt-rd="${esc(x.id)}" title="수업시간">${[80, 90].map(v => `<option value="${v}" ${x.dur === v ? 'selected' : ''}>${v}분</option>`).join('')}</select>
        <span class="lt-out" title="하원 시각">→ <b>${this.hm(this.endOf(x))}</b></span>
        <span class="lt-left small" data-lt-left>${this.leftText(x)}</span>
        <button type="button" class="btn sm" data-lt-done="${esc(x.id)}" title="하원 처리 (목록에서 뺍니다)">하원</button></div>`).join('')
      : '<div class="lt-empty small muted">진행 중인 학생이 없습니다.</div>';
  },
  // 1초마다: 남은 시간 · 깜빡임만 바꿈 (입력 중인 칸을 다시 그리지 않도록)
  paintTick() {
    if (!this.el || this.el.style.display === 'none') return;
    $$('[data-lt-id]', this.el).forEach(row => {
      const x = this.st.list.find(v => v.id === row.dataset.ltId);
      if (!x) return;
      row.classList.toggle('due', this.isDue(x));
      const l = $('[data-lt-left]', row);
      const t = this.leftText(x);
      if (l && l.textContent !== t) l.textContent = t;
    });
  },
  startTick() {
    if (this._tick) return;
    this._tick = setInterval(() => {
      if (!Auth.key() || !document.body.classList.contains('app-on')) { this.hideOnly(); return; }   // 로그아웃
      this.paintTick();
    }, 1000);
  },

  /* ---------- 위치 · 크기 (시간표 팝업과 같은 방식: 아무 곳이나 잡고 끌기 · 가장자리로 크기) ---------- */
  place() {
    const box = this.el, b = this.st.box;
    if (b) Object.assign(box.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    else {
      const w = this.DEF_W, h = this.DEF_H;
      Object.assign(box.style, { width: w + 'px', height: h + 'px', left: Math.max(10, window.innerWidth - w - 30) + 'px', top: '80px' });
    }
    this.clampIn();
  },
  // 창이 화면 밖으로 완전히 사라지지 않게 (창 크기를 줄였을 때 등)
  clampIn() {
    const box = this.el;
    if (!box || box.style.display === 'none') return;
    const w = Math.min(parseFloat(box.style.width) || this.DEF_W, window.innerWidth - 20);
    const h = Math.min(parseFloat(box.style.height) || this.DEF_H, window.innerHeight - 20);
    box.style.width = Math.max(this.MIN_W, w) + 'px';
    box.style.height = Math.max(this.MIN_H, h) + 'px';
    const l = parseFloat(box.style.left) || 0, t = parseFloat(box.style.top) || 0;
    box.style.left = Math.max(60 - w, Math.min(window.innerWidth - 60, l)) + 'px';
    box.style.top = Math.max(0, Math.min(window.innerHeight - 40, t)) + 'px';
  },
  saveBox() {
    const s = this.el.style;
    this.st.box = { v: this.BOX_V, x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) };
    this.save();
  },
  bindMove() {
    const box = this.el;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    box.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const rz = e.target.closest('[data-lt-rz]');
      // 입력칸 · 버튼 · 고르기는 끌지 않음 (그대로 입력·클릭)
      if (!rz && e.target.closest('input, select, textarea, button, label, option')) return;
      // 목록 스크롤바를 누른 경우도 끌지 않음
      if (!rz) {
        const sc = e.target.closest('.lt-body');
        if (sc) { const r = sc.getBoundingClientRect(); if (e.clientX >= r.left + sc.clientLeft + sc.clientWidth || e.clientY >= r.top + sc.clientTop + sc.clientHeight) return; }
      }
      e.preventDefault();
      const d = rz ? rz.dataset.ltRz : '';
      const x0 = e.clientX, y0 = e.clientY;
      const l0 = parseFloat(box.style.left), t0 = parseFloat(box.style.top);
      const w0 = parseFloat(box.style.width), h0 = parseFloat(box.style.height);
      const maxW = window.innerWidth - 20, maxH = window.innerHeight - 20;
      document.body.style.setProperty('--ttp-cur', getComputedStyle(e.target).cursor);
      document.body.classList.add('ttp-drag');           // 끄는 동안 커서 유지 · 글자 선택 막기 (시간표 팝업과 같은 클래스)
      const mv = (ev) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!d) {
          box.style.left = clamp(l0 + dx, 60 - w0, window.innerWidth - 60) + 'px';
          box.style.top = clamp(t0 + dy, 0, window.innerHeight - 40) + 'px';
          return;
        }
        if (d.includes('e')) box.style.width = clamp(w0 + dx, this.MIN_W, maxW) + 'px';
        if (d.includes('w')) { const w = clamp(w0 - dx, this.MIN_W, maxW); box.style.width = w + 'px'; box.style.left = (l0 + w0 - w) + 'px'; }
        if (d.includes('s')) box.style.height = clamp(h0 + dy, this.MIN_H, maxH) + 'px';
        if (d.includes('n')) { const h = clamp(h0 - dy, this.MIN_H, maxH); box.style.height = h + 'px'; box.style.top = Math.max(0, t0 + h0 - h) + 'px'; }
      };
      const up = () => {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        document.body.classList.remove('ttp-drag');
        document.body.style.removeProperty('--ttp-cur');
        this.saveBox();
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  },

  /* ---------- 시계 아이콘 (오늘·날짜 화면 '할일 검색' 바로 오른쪽 → 그 오른쪽에 날씨) ---------- */
  ICON: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5M12 2.5V5"/></svg>',
  mountBtn() {
    const main = $('#main');
    const sb = main && main.querySelector('.page-head [data-a="tdsearch"]');
    if (!sb || main.querySelector('.page-head [data-ltimer]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn lt-btn';
    b.dataset.ltimer = '1';
    b.title = '하원 타이머';
    b.setAttribute('aria-label', '하원 타이머');
    b.innerHTML = this.ICON;
    sb.after(b);                                          // 날씨(.wx)가 이미 붙어 있어도 '할일 검색' 바로 뒤로 → 시계 · 날씨 순
  },

  /* ---------- 시작 ---------- */
  init() {
    const st = document.createElement('style');
    st.textContent = `
.btn.lt-btn { padding-left: 9px; padding-right: 9px; display: inline-flex; align-items: center; justify-content: center; }
#lt-win { position: fixed; z-index: 480; display: flex; flex-direction: column; box-sizing: border-box;
  background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); border-left: 4px solid var(--ok);
  border-radius: 12px; box-shadow: 0 12px 34px rgba(22, 48, 70, .25); font-size: 14px; cursor: move; }
#lt-win .lt-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 6px; flex: none; }
#lt-win .lt-cnt { color: var(--ok); margin-left: 4px; }
#lt-win .lt-x { border: 0; background: none; color: var(--ink-mute); cursor: pointer; font-size: 15px; padding: 2px 4px; }
#lt-win .lt-x:hover { color: var(--ink); }
#lt-win .lt-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 12px; }
#lt-win .lt-add { padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--tint, transparent); margin-bottom: 8px; }
#lt-win .lt-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
#lt-win .lt-row + .lt-row { margin-top: 6px; }
#lt-win [data-lt-name] { flex: 1; min-width: 120px; }
#lt-win .lt-seg button { cursor: pointer; font: inherit; font-size: 13.5px; }
#lt-win .lt-seg button.on { background: var(--ok); color: #fff; font-weight: 700; }   /* 고른 수업시간 */
#lt-win input, #lt-win select, #lt-win button { cursor: auto; }
#lt-win button { cursor: pointer; }
#lt-win .lt-item { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; padding: 6px 8px; border-bottom: 1px dashed var(--line); border-radius: 8px; }
#lt-win .lt-item > * { flex: none; }
#lt-win .lt-item:last-child { border-bottom: 0; }
#lt-win .lt-nm { flex: 1 1 60px; min-width: 36px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#lt-win .lt-in input { width: 104px; }
#lt-win .lt-out { white-space: nowrap; font-variant-numeric: tabular-nums; }
#lt-win .lt-out b { color: var(--ok); font-size: 15px; }
#lt-win .lt-left { flex: 0 1 98px; color: var(--ink-mute); white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; }   /* 창을 줄이면 남은 시간 글자부터 줄어듦 */
#lt-win .lt-empty { padding: 10px 2px; }
#lt-win .lt-foot { flex: none; display: flex; justify-content: flex-end; padding: 8px 12px 10px; border-top: 1px solid var(--line); margin-top: 6px; }
/* 하원 시각이 된 줄: 할일 알림창과 같은 깜빡임 (흰색 ↔ 녹색) · 마우스를 올리면 멈춤 */
#lt-win .lt-item.due { animation: lt-blink 1.2s steps(1, end) infinite; border-bottom-color: transparent; }
#lt-win .lt-item.due:hover { animation: none; background: var(--ok-soft); }
#lt-win .lt-item.due .lt-left { font-weight: 800; }
@keyframes lt-blink {
  0%   { background: var(--surface); color: var(--ink); }
  50%  { background: var(--ok); color: #fff; }
}
#lt-win .lt-item.due .lt-left, #lt-win .lt-item.due .lt-out b { color: inherit; }
.lt-rz { position: absolute; z-index: 2; }
.lt-rz.n { top: -4px; left: 10px; right: 10px; height: 8px; cursor: ns-resize; }
.lt-rz.s { bottom: -4px; left: 10px; right: 10px; height: 8px; cursor: ns-resize; }
.lt-rz.e { right: -4px; top: 10px; bottom: 10px; width: 8px; cursor: ew-resize; }
.lt-rz.w { left: -4px; top: 10px; bottom: 10px; width: 8px; cursor: ew-resize; }
.lt-rz.ne { right: -4px; top: -4px; width: 12px; height: 12px; cursor: nesw-resize; }
.lt-rz.sw { left: -4px; bottom: -4px; width: 12px; height: 12px; cursor: nesw-resize; }
.lt-rz.nw { left: -4px; top: -4px; width: 12px; height: 12px; cursor: nwse-resize; }
.lt-rz.se { right: -4px; bottom: -4px; width: 12px; height: 12px; cursor: nwse-resize; }
`;
    document.head.appendChild(st);
    this.st = this.load();
    // 시계 아이콘: 화면이 다시 그려질 때마다 붙임 (오늘·날짜 화면에만 '할일 검색'이 있음)
    const main = $('#main');
    if (main && window.MutationObserver) new MutationObserver(() => { try { this.mountBtn(); } catch (e) { /* 무시 */ } }).observe(main, { childList: true });
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#main [data-ltimer]')) this.open(); });
    // 창 크기가 바뀌면 화면 안으로
    window.addEventListener('resize', debounce(() => { if (this.el && this.el.style.display !== 'none') { this.clampIn(); this.saveBox(); } }, 200));
    // 같은 PC의 다른 탭에서 바뀌면 맞춤
    window.addEventListener('storage', (e) => {
      if (e.key !== this.LS) return;
      this.st = this.load();
      if (this.st.open && Auth.key()) this.show(); else this.hideOnly();
    });
    // 새로고침: 열려 있던 창이면 다시 띄움 (로그인 상태일 때)
    const reopen = () => { if (this.st.open && Auth.key() && document.body.classList.contains('app-on')) this.show(); };
    reopen();
    if (!this.el || this.el.style.display === 'none') setTimeout(reopen, 1500);   // 로그인 화면을 거친 경우 등
  },
};
PickupTimer.init();
