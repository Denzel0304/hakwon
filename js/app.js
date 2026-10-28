/* =========================================================
   app.js — 화면 전환 / 로그인 / 시작 / 동기화 시점
   ========================================================= */
const App = {
  page: 'today',
  params: {},
  selDate: todayStr(),
  _needRender: false,
  pages: {
    today: Today, students: Students, classes: Classes, timetable: Timetable,
    lessons: Lessons, makeups: Makeups, exams: Exams, scores: Scores,
    counsels: Counsels, calendar: BigCal, day: DayPage, settings: Settings,
  },

  go(page, params = {}) {
    const same = page === this.page;
    this.page = page;
    this.params = params;
    this.render(!same);
  },

  render(toTop = false) {
    const main = $('#main');
    const st = main.scrollTop;
    main.onclick = main.onchange = main.oninput = main.onkeydown = null;
    try {
      (this.pages[this.page] || Today).render(main, this.params);
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="panel"><div class="empty">화면을 그리는 중 오류가 났습니다: ${esc(e.message)}</div></div>`;
    }
    main.scrollTop = toTop ? 0 : st;
    const navKey = this.page === 'day' ? '' : this.page;
    $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === navKey));
    MiniCal.render();
    this.refreshSchools();
    this._needRender = false;
  },

  // 서버에서 바뀐 내용이 들어왔을 때: 입력 중이면 입력이 끝난 뒤 다시 그린다
  onRemoteChange() {
    if (this.isEditingMain()) this._needRender = true;
    else this.render();
  },
  isEditingMain() {
    const a = document.activeElement;
    return !!(a && $('#main').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  },
  flushRender() { if (this._needRender && !this.isEditingMain()) this.render(); },

  pickDate(date) {
    this.selDate = date;
    MiniCal.showMonthOf(date);
    if (this.page === 'lessons') this.go('lessons', { date });
    else if (this.page === 'timetable') this.go('timetable', { week: ymd(mondayOf(parseYmd(date))) });
    else this.go('day', { date });
  },

  refreshSchools() {
    const set = new Set();
    Store.all('students').forEach(s => { if (s.school) set.add(s.school.trim()); });
    Store.all('exams').forEach(s => { if (s.school) set.add(s.school.trim()); });
    Store.all('events').forEach(s => { if (s.school) set.add(s.school.trim()); });
    const html = [...set].sort(ko).map(s => `<option value="${esc(s)}"></option>`).join('');
    const dl = $('#dl-schools');
    if (dl.innerHTML !== html) dl.innerHTML = html;
  },

  /* ---------- 동기화 표시 ---------- */
  setSync(text) { const el = $('#sync-bar'); if (el) el.textContent = text; },
  updateSyncBar() {
    const n = Store.pendingCount();
    this.setSync(n ? `● 저장 대기 ${n}개` : (Store.lastSyncAt ? '✓ 동기화됨 ' + new Date(Store.lastSyncAt).toTimeString().slice(0, 5) : ''));
  },

  afterFirstPull() { Promo.check(); },

  /* ---------- 로그인 ---------- */
  showLogin() {
    document.body.classList.remove('app-on');
    $('#mg-login').classList.add('active');
    $('#login-btn').disabled = false;
    $('#login-msg').textContent = '';
    $('#login-msg').className = 'login-msg';
    $('#pin-input').value = '';
    setTimeout(() => $('#pin-input').focus(), 50);
  },
  showApp() {
    $('#mg-login').classList.remove('active');
    document.body.classList.add('app-on');
  },

  async doLogin() {
    const pin = $('#pin-input').value.trim();
    const msg = $('#login-msg'), btn = $('#login-btn');
    const err = (t) => { msg.className = 'login-msg err'; msg.textContent = t; $('#pin-input').value = ''; btn.disabled = false; };
    if (!new RegExp('^\\d{' + CFG.PIN_LEN + '}$').test(pin)) { err(`PIN ${CFG.PIN_LEN}자리 숫자를 입력하세요`); return; }
    if (btn.disabled) return;
    btn.disabled = true; msg.className = 'login-msg'; msg.textContent = '확인 중...';
    try {
      const r = await Store.rpc('mg77_login', { p_pin: pin });
      if (!r.ok) { err('서버 오류 (' + r.status + ')'); return; }
      const data = r.json || {};
      if (data.ok) {
        Auth.setKey(data.key);
        Auth.ok();
        msg.className = 'login-msg ok'; msg.textContent = '로그인 성공';
        await IDB.destroy();
        Store.reset();
        this.showApp();
        this.render(true);
        await Store.syncNow(true);
      } else if (data.reason === 'wrong_pin') err(`PIN이 맞지 않습니다 (남은 시도 ${data.remaining}회)`);
      else if (data.reason === 'locked') err(`잠금 상태입니다. ${new Date(data.until).toLocaleString('ko-KR')} 이후 다시 시도하세요`);
      else if (data.reason === 'no_pin') err('PIN이 등록되지 않았습니다');
      else if (data.reason === 'bad_format') err(`PIN ${CFG.PIN_LEN}자리 숫자를 입력하세요`);
      else err('로그인 실패');
    } catch (e) { err('네트워크 오류'); }
  },

  async logout(force) {
    if (!force) {
      const n = Store.pendingCount();
      if (!await confirmDlg('이 기기에서 로그아웃할까요?\n다시 열려면 PIN이 필요합니다.' + (n ? `\n(아직 저장되지 않은 변경 ${n}개를 먼저 보냅니다)` : ''), '로그아웃', true)) return;
      const ok = await Store.flush();
      if (!ok && Store.pendingCount() && !await confirmDlg('저장하지 못한 변경이 있습니다. 그래도 로그아웃하면 이 변경은 사라집니다.', '로그아웃', true)) return;
    }
    const key = Auth.key();
    if (key) { try { await Store.rpc('mg77_logout', { p_key: key }); } catch (_) {} }
    Modal.closeAll();
    // 이 앱의 저장소만 지운다 (같은 주소의 다른 앱 데이터는 건드리지 않음)
    Object.keys(localStorage).forEach(k => { if (k.startsWith(CFG.PREFIX)) localStorage.removeItem(k); });
    await IDB.destroy();
    Store.reset();
    Auth.ok();
    $('#main').innerHTML = '';
    this.setSync('');
    this.showLogin();
  },
};

/* =========================================================
   시작
   ========================================================= */
(function boot() {
  // 메뉴
  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    const p = b.dataset.page;
    if (p === 'lessons') App.go('lessons', { date: App.selDate });
    else if (p === 'timetable') App.go('timetable', { week: ymd(mondayOf(parseYmd(App.selDate))) });
    else App.go(p, {});
  });
  // 입력이 끝나면 미뤄 둔 화면 갱신
  $('#main').addEventListener('focusout', () => setTimeout(() => App.flushRender(), 0));

  // PIN: 6자리 자동 로그인 / Enter
  const pinEl = $('#pin-input');
  pinEl.addEventListener('input', (e) => { if (e.target.value.length === CFG.PIN_LEN) App.doLogin(); });
  pinEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') App.doLogin(); });
  $('#login-btn').addEventListener('click', () => App.doLogin());

  // Esc → 맨 위 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Escape' && Modal.stack.length) { e.preventDefault(); Modal.top().close(); }
  });

  // 저장된 키가 있으면 자동 로그인 (키는 로그아웃 전까지 영구)
  if (Auth.key()) {
    App.showApp();
    Store.loadCache().then(() => { App.render(true); Store.syncNow(); });
  } else {
    App.showLogin();
  }

  // 다른 기기에서 고친 내용 받아오기: 화면으로 돌아올 때 / 네트워크 복구 / 1분마다 변경 확인
  let lastVis = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !Auth.key()) return;
    if (Date.now() - lastVis < 3000) return;
    lastVis = Date.now();
    Store.syncNow();
  });
  window.addEventListener('online', () => { if (Auth.key()) Store.syncNow(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted && Auth.key()) Store.syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible' && Auth.key()) Store.checkRemote(); }, CFG.POLL_MS);

  // 창을 닫기 전 저장 대기분을 로컬에 기록
  window.addEventListener('beforeunload', () => { Store.persist(); });

  // 날짜가 바뀌면 '오늘' 갱신 + 진급 확인
  let _today = todayStr();
  setInterval(() => {
    const t = todayStr();
    if (t === _today) return;
    if (App.selDate === _today) App.selDate = t;
    _today = t;
    if (!Auth.key()) return;
    App.render();
    Promo.check();
  }, 60000);
})();
