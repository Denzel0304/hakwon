/* =========================================================
   todo-alarm.js — 시간이 정해진 할일 알림 (PC 전용 · index.html에서만 불러옴)
   - 오늘 날짜의 할일 중 시간이 있고 완료되지 않은 것이, 그 시간이 되면 알림 (정각, 1분마다 확인)
   - 사이트를 열었을 때 오늘 이미 시간이 지난 미완료 할일은 한꺼번에 알림
   - 알림: 사이트 안 알림창(오른쪽 아래) + 다른 화면을 보고 있으면 윈도우 알림 (소리 없음)
   - 다시 알림: 5분 · 10분 · 30분 · 직접 입력 / X로 닫으면 5분 뒤 다시
   - 알림 끄기: 그 할일의 오늘 알림만 끔 (할일 완료는 할일 목록에서 따로)
   - 다시 알림·알림 끄기는 이 PC 브라우저에만 기억 (localStorage mg77_talarm · 날짜가 바뀌면 비움)
     할일의 시간을 바꾸면 새 알림으로 본다 (키 = 항목 키 @ 시간)
   - 탭을 여러 개 열어도 알림창 상태는 함께 바뀌고, 윈도우 알림은 한 번만
   ========================================================= */
const TodoAlarm = {
  LS: 'mg77_talarm',
  LS_N: 'mg77_talarm_n',
  el: null,
  shown: [],               // 지금 알림창에 있는 항목 [{ key, k, text, time }]
  timer: null,

  /* ---------- 이 PC에 기억하는 상태 ---------- */
  load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.LS) || 'null'); } catch (e) { s = null; }
    const t = todayStr();
    if (!s || s.date !== t) s = { date: t, off: {}, snz: {} };
    s.off = s.off || {}; s.snz = s.snz || {};
    return s;
  },
  save(s) { try { localStorage.setItem(this.LS, JSON.stringify(s)); } catch (e) { /* 저장 못 해도 이번 화면에서는 동작 */ } },

  /* ---------- 알릴 항목 ---------- */
  hhmm(v) {
    const m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
  },
  nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); },
  // 오늘 시간이 된 미완료 할일 (어디서 만든 것이든 · 상기 🔔 줄은 제외)
  dueItems() {
    if (typeof TodoX === 'undefined') return [];
    const now = this.nowHM();
    return TodoX.itemsOn(todayStr())
      .filter(it => !it.rem && !it.done && this.hhmm(it.time) && this.hhmm(it.time) <= now)
      .map(it => ({ key: it.k + '@' + this.hhmm(it.time), k: it.k, text: it.text || '', time: this.hhmm(it.time) }))
      .sort((a, b) => ko(a.time, b.time) || ko(a.text, b.text));
  },
  // 지금 보여 줄 항목 (알림 끄기·다시 알림 대기 중인 것 제외)
  pending(s) {
    const now = Date.now();
    return this.dueItems().filter(x => !s.off[x.key] && !(+s.snz[x.key] > now));
  },

  /* ---------- 확인 (1분마다 · 화면으로 돌아올 때) ---------- */
  check() {
    if (!Auth.key() || !document.body.classList.contains('app-on')) { this.hide(); return; }
    const s = this.load();
    const list = this.pending(s);
    const before = new Set(this.shown.map(x => x.key));
    const added = list.filter(x => !before.has(x.key));
    this.shown = list;
    this.draw();
    if (added.length) this.notify(added);
  },
  // 다시 그리기만 (새 알림은 띄우지 않음): 다른 곳에서 완료·삭제·시간 변경된 것을 알림창에서 뺀다
  refresh() {
    if (!this.shown.length) return;
    if (!Auth.key()) { this.hide(); return; }
    const s = this.load();
    const keep = new Set(this.pending(s).map(x => x.key));
    const cur = new Map(this.dueItems().map(x => [x.key, x]));
    this.shown = this.shown.filter(x => keep.has(x.key)).map(x => cur.get(x.key) || x);
    this.draw();
  },
  schedule() {
    clearTimeout(this.timer);
    const d = new Date();
    const wait = (60 - d.getSeconds()) * 1000 - d.getMilliseconds() + 300;   // 다음 정각 분 직후
    this.timer = setTimeout(() => { this.check(); this.schedule(); }, wait);
  },

  /* ---------- 윈도우 알림 (다른 화면을 보고 있을 때) ---------- */
  canNotify() { return typeof Notification !== 'undefined' && window.isSecureContext; },
  askPerm() {
    if (!this.canNotify() || Notification.permission !== 'default') return;
    try { const p = Notification.requestPermission(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 무시 */ }
  },
  notify(added) {
    if (!this.canNotify() || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;   // 보고 있으면 알림창으로 충분
    // 탭이 여러 개면 한 번만 (같은 내용을 1분 안에 이미 띄웠으면 건너뜀)
    const sig = added.map(x => x.key).sort().join(',');
    try {
      const last = JSON.parse(localStorage.getItem(this.LS_N) || 'null');
      if (last && last.sig === sig && Date.now() - last.at < 55000) return;
      localStorage.setItem(this.LS_N, JSON.stringify({ sig, at: Date.now() }));
    } catch (e) { /* 무시 */ }
    const body = added.slice(0, 5).map(x => `${TodoX.timeLabel(x.time)}  ${x.text}`).join('\n') + (added.length > 5 ? `\n외 ${added.length - 5}개` : '');
    try {
      const n = new Notification(added.length > 1 ? `할일 알림 ${added.length}개` : '할일 알림', { body, tag: 'mg77-todo-alarm', renotify: true, requireInteraction: true, silent: true });
      n.onclick = () => { try { window.focus(); } catch (e) { /* 무시 */ } n.close(); };
    } catch (e) { /* 알림을 못 띄워도 알림창은 그대로 */ }
  },

  /* ---------- 알림창 ---------- */
  hide() { this.shown = []; if (this.el) this.el.style.display = 'none'; },
  draw() {
    if (!this.el) this.build();
    if (!this.shown.length) { this.el.style.display = 'none'; return; }
    $('[data-ta-list]', this.el).innerHTML = this.shown.map(x => `<div class="ta-row">
      <span class="ta-time">${esc(TodoX.timeLabel(x.time))}</span>
      <button type="button" class="ta-text" data-ta-open="${esc(x.k)}" title="할일 열기">${esc(x.text)}</button>
      <button type="button" class="btn sm ghost" data-ta-off="${esc(x.key)}" title="이 할일의 오늘 알림을 끕니다 (할일 완료는 할일 목록에서)">알림 끄기</button></div>`).join('');
    $('[data-ta-cnt]', this.el).textContent = this.shown.length > 1 ? ` ${this.shown.length}개` : '';
    const perm = $('[data-ta-perm]', this.el);
    perm.style.display = this.canNotify() && Notification.permission === 'default' ? '' : 'none';
    this.el.style.display = '';
  },
  build() {
    const el = document.createElement('div');
    el.id = 'todo-alarm';
    el.style.display = 'none';
    el.innerHTML = `<div class="ta-head"><b>🕒 할일 알림<span data-ta-cnt></span></b><button type="button" class="ta-x" data-ta-x title="닫기 (5분 뒤 다시 알림)" aria-label="닫기">✕</button></div>
      <div class="ta-list" data-ta-list></div>
      <div class="ta-foot"><span class="small soft">다시 알림</span>
        <button type="button" class="btn sm" data-ta-snz="5">5분</button><button type="button" class="btn sm" data-ta-snz="10">10분</button><button type="button" class="btn sm" data-ta-snz="30">30분</button>
        <input type="number" data-ta-min min="1" max="720" placeholder="분" aria-label="다시 알림 분"><button type="button" class="btn sm" data-ta-snzin>분 뒤</button></div>
      <div class="ta-perm small" data-ta-perm style="display:none"><button type="button" class="ta-link" data-ta-perm-btn>윈도우 알림 허용하기</button> · 다른 화면을 보고 있을 때도 알려 줍니다</div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-ta-x]')) { this.snooze(5); return; }
      const sz = t.closest('[data-ta-snz]'); if (sz) { this.snooze(+sz.dataset.taSnz); return; }
      if (t.closest('[data-ta-snzin]')) { this.snoozeInput(); return; }
      const off = t.closest('[data-ta-off]'); if (off) { this.turnOff(off.dataset.taOff); return; }
      const op = t.closest('[data-ta-open]'); if (op) { TodoX.open(op.dataset.taOpen); return; }
      if (t.closest('[data-ta-perm-btn]')) {
        try { const p = Notification.requestPermission(); if (p && p.then) p.then(() => this.draw()); } catch (er) { /* 무시 */ }
      }
    });
    $('[data-ta-min]', el).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.snoozeInput(); } });
  },
  snoozeInput() {
    const n = Math.floor(+$('[data-ta-min]', this.el).value || 0);
    if (n < 1 || n > 720) { toast('다시 알림은 1~720분 사이로 입력하세요'); return; }
    this.snooze(n);
  },
  // 알림창의 모든 항목을 n분 뒤 다시
  snooze(n) {
    const s = this.load(), until = Date.now() + n * 60000;
    this.shown.forEach(x => { s.snz[x.key] = until; });
    this.save(s);
    this.shown = [];
    $('[data-ta-min]', this.el).value = '';
    this.draw();
    toast(`${n}분 뒤에 다시 알립니다`);
  },
  turnOff(key) {
    const s = this.load();
    s.off[key] = 1; delete s.snz[key];
    this.save(s);
    this.shown = this.shown.filter(x => x.key !== key);
    this.draw();
  },

  /* ---------- 시작 ---------- */
  init() {
    const st = document.createElement('style');
    st.textContent = `
#todo-alarm { position: fixed; right: 18px; bottom: 18px; z-index: 1500; width: 380px; max-width: calc(100vw - 36px);
  background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); border-left: 4px solid var(--accent);
  border-radius: 12px; box-shadow: 0 12px 34px rgba(22, 48, 70, .25); padding: 12px 14px; font-size: 14px; }
#todo-alarm .ta-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
#todo-alarm .ta-x { border: 0; background: none; color: var(--ink-mute); cursor: pointer; font-size: 15px; padding: 2px 4px; }
#todo-alarm .ta-x:hover { color: var(--ink); }
#todo-alarm .ta-list { max-height: 260px; overflow-y: auto; }
#todo-alarm .ta-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px dashed var(--line); }
#todo-alarm .ta-row:last-child { border-bottom: 0; }
#todo-alarm .ta-time { flex: none; font-weight: 700; color: var(--accent-ink, var(--accent)); white-space: nowrap; font-variant-numeric: tabular-nums; }
#todo-alarm .ta-text { flex: 1; min-width: 0; text-align: left; border: 0; background: none; color: var(--ink); cursor: pointer; padding: 0; font: inherit;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#todo-alarm .ta-text:hover { text-decoration: underline; }
#todo-alarm .ta-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); }
#todo-alarm .ta-foot input { width: 64px; }
#todo-alarm .ta-perm { margin-top: 8px; color: var(--ink-mute); }
#todo-alarm .ta-link { border: 0; background: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
`;
    document.head.appendChild(st);
    // 처음 클릭할 때 윈도우 알림 허용을 한 번 물어봄 (로그인한 뒤)
    const ask = () => { if (Auth.key()) { this.askPerm(); document.removeEventListener('click', ask, true); } };
    document.addEventListener('click', ask, true);
    // 화면이 다시 그려지면 알림창 목록도 맞춤 (할일 완료·삭제·시간 변경)
    if (typeof App !== 'undefined' && typeof App.render === 'function') {
      const r0 = App.render;
      App.render = function (...a) { const r = r0.apply(this, a); try { TodoAlarm.refresh(); } catch (e) { /* 무시 */ } return r; };
    }
    // 다른 탭에서 다시 알림·알림 끄기를 하면 이 탭 알림창도 맞춤
    window.addEventListener('storage', (e) => { if (e.key === this.LS) this.refresh(); });
    // 화면으로 돌아오면 바로 확인 (잠자기에서 깨어난 경우 포함)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.check(); });
    window.addEventListener('focus', () => this.check());
    // 시작: 데이터를 불러올 시간을 조금 둔 뒤 확인 (오늘 이미 지난 할일 한꺼번에) → 이후 매 분 정각
    setTimeout(() => this.check(), 3000);
    setTimeout(() => this.check(), 10000);
    this.schedule();
  },
};
TodoAlarm.init();
