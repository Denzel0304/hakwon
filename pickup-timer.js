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
  MIN_H: 120,
  BOX_V: 4,
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
    if (ms <= 0) return '하원!';
    const m = Math.ceil(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} 남음` : `${m}분 남음`;
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
    el.innerHTML = `<div class="lt-head"><b>🕒 하원 타이머<span class="lt-cnt" data-lt-cnt></span></b><button type="button" class="lt-x" data-lt-close title="닫기 (진행 중인 학생이 있으면 확인 후 목록을 지웁니다)" aria-label="닫기">✕</button></div>
      <div class="lt-body">
        <div class="lt-add">
          <input type="text" data-lt-name placeholder="학생 이름" maxlength="20" autocomplete="off">
          <span class="att-seg lt-seg" data-lt-dur title="수업시간 (고른 값을 기억합니다)">${[80, 90].map(v => `<button type="button" data-lt-d="${v}">${v}분</button>`).join('')}</span>
          <button type="button" class="btn sm primary" data-lt-now title="지금 시각을 도착 시각으로 추가합니다">지금 시작</button>
          <span class="lt-at" title="늦게 입력할 때: 실제로 도착한 시각을 넣고 추가"><input type="time" data-lt-time step="60" placeholder="도착" aria-label="도착 시각"><button type="button" class="btn sm" data-lt-at>추가</button></span>
        </div>
        <div class="lt-list" data-lt-list></div>
      </div>
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
      const tg = t.closest('[data-lt-tg]');
      if (tg) { const x = this.st.list.find(v => v.id === tg.dataset.ltTg); if (x) this.upd(x.id, { dur: x.dur === 90 ? 80 : 90 }); return; }   // 줄의 수업시간 80 ↔ 90
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
        <input type="time" step="60" class="lt-st" data-lt-st="${esc(x.id)}" value="${this.hm(x.start)}" title="도착 시각 (눌러서 고치기)">
        <button type="button" class="lt-dur" data-lt-tg="${esc(x.id)}" title="수업시간 (누르면 80 ↔ 90)">${x.dur}분</button>
        <span class="lt-out" title="하원 시각"><i>→</i><b>${this.hm(this.endOf(x))}</b></span>
        <span class="lt-left" data-lt-left>${this.leftText(x)}</span>
        <button type="button" class="btn sm lt-done" data-lt-done="${esc(x.id)}" title="하원 처리 (목록에서 뺍니다)">하원</button></div>`).join('')
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
  /* 처음 자리 (사용자가 옮기거나 크기를 바꾸기 전까지 · 창 크기가 바뀌면 다시 계산)
     - 본문(최대 1080px) 오른쪽 빈 공간에 좌우 여백(GAP)을 두고 그 폭에 맞춤. 넓은 모니터에서는 MAX_W까지만 쓰고 빈 공간 가운데에
     - 빈 공간이 좁으면(노트북) FALL_W 폭으로 화면 오른쪽 끝에 (본문 위에 겹침 → 끌어서 옮길 수 있음)
     - 위치: 위 = 본문 제목줄 높이 / 높이 = 내용만큼 (학생이 늘면 아래로 길어짐), 아래 한계 = 왼쪽 근무 게이지 아래 실선(#sync-bar 위 선)
       → 넘치면 창 안에서 스크롤 */
  GAP: 16,
  MAX_W: 440,
  FALL_W: 424,
  CONTENT_W: 1080,          // style.css: #main > * { max-width: 1080px }
  defBox() {
    const main = $('#main'), vw = document.documentElement.clientWidth;
    let x, y = 26, w;
    if (main) {
      const r = main.getBoundingClientRect(), cs = getComputedStyle(main);
      const padL = parseFloat(cs.paddingLeft) || 0, padT = parseFloat(cs.paddingTop) || 0;
      const inner = main.clientWidth - padL - (parseFloat(cs.paddingRight) || 0);   // 스크롤바 뺀 본문 폭
      const contentR = r.left + padL + Math.min(this.CONTENT_W, inner);
      const right = r.left + main.clientWidth;                                     // 스크롤바 왼쪽
      const avail = right - contentR - this.GAP * 2;
      y = r.top + padT;
      if (avail >= this.MIN_W) { w = Math.min(this.MAX_W, avail); x = contentR + this.GAP + (avail - w) / 2; }
    }
    if (w == null) { w = Math.min(this.FALL_W, vw - this.GAP * 2); x = vw - w - this.GAP; }
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: null };
  },
  // 아래 한계: 왼쪽 근무 게이지 아래 실선 (#sync-bar 위 테두리). 없으면 화면 아래
  bottomLine() {
    const sb = $('#sync-bar');
    const r = sb && sb.offsetParent ? sb.getBoundingClientRect() : null;
    return r && r.top > 100 ? r.top : window.innerHeight - 10;
  },
  place() {
    const b = this.st.box || this.defBox();
    Object.assign(this.el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h ? b.h + 'px' : '' });
    this.clampIn();
  },
  // 창이 화면 밖으로 완전히 사라지지 않게 + 높이 한계 맞추기
  clampIn() {
    const box = this.el;
    if (!box || box.style.display === 'none') return;
    const vw = document.documentElement.clientWidth;
    const w = Math.max(this.MIN_W, Math.min(parseFloat(box.style.width) || this.FALL_W, vw - 20));
    box.style.width = w + 'px';
    const l = parseFloat(box.style.left) || 0, t = parseFloat(box.style.top) || 0;
    box.style.left = Math.max(60 - w, Math.min(vw - 60, l)) + 'px';
    box.style.top = Math.max(0, Math.min(window.innerHeight - 40, t)) + 'px';
    this.fitH();
  },
  // 높이: 직접 정하지 않았으면 내용만큼 (아래 실선까지) / 직접 정했으면 그 높이 (화면 안까지)
  fitH() {
    const box = this.el, top = parseFloat(box.style.top) || 0;
    if (box.style.height) {
      const h = Math.max(this.MIN_H, Math.min(parseFloat(box.style.height), window.innerHeight - top - 10));
      box.style.height = h + 'px';
      box.style.maxHeight = '';
    } else box.style.maxHeight = Math.max(this.MIN_H, this.bottomLine() - top) + 'px';
  },
  saveBox() {
    const s = this.el.style;
    this.st.box = { v: this.BOX_V, x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: s.height ? parseFloat(s.height) : null };
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
      const w0 = parseFloat(box.style.width), h0 = box.getBoundingClientRect().height;   // 높이를 정하지 않은 상태(내용만큼)에서도 지금 높이부터
      const maxW = document.documentElement.clientWidth - 20, maxH = window.innerHeight - 20;
      document.body.style.setProperty('--ttp-cur', getComputedStyle(e.target).cursor);
      document.body.classList.add('ttp-drag');           // 끄는 동안 커서 유지 · 글자 선택 막기 (시간표 팝업과 같은 클래스)
      const mv = (ev) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!d) {
          box.style.left = clamp(l0 + dx, 60 - w0, window.innerWidth - 60) + 'px';
          box.style.top = clamp(t0 + dy, 0, window.innerHeight - 40) + 'px';
          this.fitH();                                 // 내용만큼 높이일 때: 아래 한계를 새 위치에 맞춤
          return;
        }
        if (d.includes('e')) box.style.width = clamp(w0 + dx, this.MIN_W, maxW) + 'px';
        if (d.includes('w')) { const w = clamp(w0 - dx, this.MIN_W, maxW); box.style.width = w + 'px'; box.style.left = (l0 + w0 - w) + 'px'; }
        if (/[ns]/.test(d)) box.style.maxHeight = '';   // 세로로 직접 크기를 정하면 그 높이로 고정
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
  // 자명종 시계: 테두리는 버튼 글자색, 시계판은 연한 녹색, 바늘은 녹색 (테마 색을 따름)
  ICON: '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 6.6a3.8 3.8 0 0 1 4.2-3.8"/><path d="M20.6 6.6a3.8 3.8 0 0 0-4.2-3.8"/><path d="M7.2 19.4 5.6 21.2M16.8 19.4l1.6 1.8"/><circle cx="12" cy="13" r="7.4" style="fill:var(--ok-soft)"/><path d="M12 8.9V13l2.8 1.7" style="stroke:var(--ok)" stroke-width="2.1"/><circle cx="12" cy="13" r="1" style="fill:var(--ok);stroke:none"/></svg>',
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
.btn.lt-btn { width: 36px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }   /* 버튼 크기는 예전 그대로 (36×32), 아이콘만 크게 */
#lt-win { position: fixed; z-index: 480; display: flex; flex-direction: column; box-sizing: border-box;
  background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); border-top: 3px solid var(--ok);
  border-radius: 12px; box-shadow: 0 10px 28px rgba(22, 48, 70, .22); font-size: 14px; cursor: move; }
#lt-win .lt-head { display: flex; align-items: center; justify-content: space-between; padding: 7px 8px 5px 12px; flex: none; font-size: 13.5px; }
#lt-win .lt-cnt { color: var(--ok); margin-left: 4px; }
#lt-win .lt-x { border: 0; background: none; color: var(--ink-mute); cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 6px; }
#lt-win .lt-x:hover { color: var(--ink); background: var(--line); }
#lt-win .lt-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 8px 8px; }
#lt-win input, #lt-win select { cursor: auto; }
#lt-win button { cursor: pointer; }
/* 추가 줄: 이름 · 80분/90분 · 지금 시작 · (도착 시각 + 추가) — 늘 한 줄. 폭이 모자라면 이름 칸 · 도착 칸이 먼저 줄어듦 */
#lt-win .lt-add { display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; padding: 6px; border-radius: 9px; background: var(--ok-soft); margin-bottom: 4px; }
#lt-win .lt-add [data-lt-name] { flex: 0 1 70px; width: 70px; min-width: 46px; padding: 4px 7px; }   /* 이름은 4글자 정도 */
#lt-win .lt-add .btn.sm { flex: none; padding: 4px 9px; white-space: nowrap; }
#lt-win .lt-add .lt-seg { flex: none; }
#lt-win .lt-seg button { font: inherit; font-size: 13px; padding: 4px 7px; white-space: nowrap; }
#lt-win .lt-seg button.on { background: var(--ok); color: #fff; font-weight: 700; }   /* 고른 수업시간 */
#lt-win .lt-at { display: inline-flex; align-items: center; gap: 3px; margin-left: auto; flex: 0 1 auto; min-width: 0; }   /* 남는 폭은 '지금 시작'과 도착 칸 사이로 */
#lt-win .lt-at input.fp-in { flex: 0 1 76px; width: 76px; min-width: 50px; padding-left: 6px; padding-right: 24px; background-position: right 6px center; background-size: 13px 13px; padding-top: 4px; padding-bottom: 4px; }
/* 학생 줄: 이름 | 도착 | 수업 | → 하원 | 남은 시간 | 하원 버튼 */
#lt-win .lt-item { display: grid; grid-template-columns: minmax(40px, 66px) 50px 46px 62px minmax(0, 1fr) auto;   /* 이름 4글자 · 남는 폭은 남은 시간 칸으로 */ align-items: center; column-gap: 5px;
  padding: 4px 4px 4px 6px; border-radius: 8px; }
#lt-win .lt-item + .lt-item { box-shadow: 0 -1px 0 var(--line); }
#lt-win .lt-nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 도착 시각: 글자처럼 보이다가 마우스를 올리거나 고칠 때만 칸 표시 · 줄 색을 그대로 따름 (깜빡일 때도 보임) */
#lt-win .lt-st { width: 50px; padding: 2px 3px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: inherit;
  font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; opacity: .8; }
#lt-win .lt-st:hover, #lt-win .lt-st:focus { border-color: var(--line-strong); opacity: 1; outline: none; }
/* 프로그램 공용 시간 선택판(calendar.js FieldPick)이 시간 칸을 '시간 선택' 칸(fp-in: 최소 폭 92px · 시계 그림)으로 바꾸므로 여기서만 작게 */
#lt-win input.lt-st.fp-in { width: 50px; min-width: 0; padding: 2px 3px; background-image: none; background-color: transparent; color: inherit; border-color: transparent; }
#lt-win input.lt-st.fp-in:hover, #lt-win input.lt-st.fp-in.fp-open { border-color: var(--line-strong); box-shadow: none; }
#lt-win .lt-dur { padding: 1px 0; border: 1px solid currentColor; border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 12px; opacity: .75; }
#lt-win .lt-dur:hover { opacity: 1; }
#lt-win .lt-out { white-space: nowrap; font-variant-numeric: tabular-nums; }
#lt-win .lt-out i { font-style: normal; opacity: .6; margin-right: 3px; }
#lt-win .lt-out b { color: var(--ok); font-size: 15px; }
#lt-win .lt-left { font-size: 12px; color: var(--ink-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
#lt-win .lt-done { padding: 3px 9px; }
#lt-win .lt-empty { padding: 10px 4px; }
/* 하원 시각이 된 줄: 할일 알림창과 같은 깜빡임 (흰색 ↔ 녹색) · 마우스를 올리면 멈춤
   줄 안의 글자 · 도착 칸 · 수업 칩은 모두 줄 색을 따라 함께 바뀐다 */
#lt-win .lt-item.due { animation: lt-blink 1.2s steps(1, end) infinite; box-shadow: none; }
#lt-win .lt-item.due + .lt-item { box-shadow: none; }
#lt-win .lt-item.due:hover { animation: none; background: var(--ok-soft); color: var(--ink); }
#lt-win .lt-item.due .lt-left { font-weight: 800; font-size: 13px; }
#lt-win .lt-item.due .lt-left, #lt-win .lt-item.due .lt-out b { color: inherit; }
@keyframes lt-blink {
  0%   { background: var(--surface); color: var(--ink); }
  50%  { background: var(--ok); color: #fff; }
}
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
    // 창 크기가 바뀌면: 처음 자리 그대로인 창은 새 화면에 맞춰 다시 계산, 옮긴 창은 화면 안으로만
    window.addEventListener('resize', debounce(() => { if (this.el && this.el.style.display !== 'none') { if (this.st.box) { this.clampIn(); this.saveBox(); } else this.place(); } }, 200));
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
