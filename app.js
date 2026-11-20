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
    lessons: Lessons, attendance: AttBook, report: Reports, words: WordBook, vocas: Vocas, books: Books, progress: ProgressBook, psum: ProgressSum, sms: SmsPage, makeups: Makeups, exams: Exams, scores: Scores, prints: Prints,
    counsels: Counsels, calendar: BigCal, events: EventsPage, day: DayPage, settings: Settings, lessonplan: LessonPlan, software: SoftwarePage,
  },

  go(page, params = {}) {
    const same = page === this.page;
    const cur = this.pages[this.page];
    if (!same && cur && cur.onLeave) cur.onLeave();   // 예: 수업일지 저장 안 한 입력 버리기
    this.page = page;
    this.params = params;
    this.render(!same);
  },

  render(toTop = false) {
    const main = $('#main');
    const st = main.scrollTop;
    main.onclick = main.onchange = main.oninput = main.onkeydown = null;
    main.dataset.page = this.page;      // 시간표·큰 달력만 넓게, 나머지는 폭 제한 (CSS)
    try {
      (this.pages[this.page] || Today).render(main, this.params);
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="panel"><div class="empty">화면을 그리는 중 오류가 났습니다: ${esc(e.message)}</div></div>`;
    }
    main.scrollTop = toTop ? 0 : st;
    const navKey = this.page === 'day' ? '' : (this.page === 'lessons' || this.page === 'psum') ? 'progress' : this.page;   // 수업일지·진도 요약은 '진도+일지' 메뉴의 탭
    $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === navKey));
    MiniCal.render();
    this.refreshSchools();
    this._needRender = false;
  },

  // 서버에서 바뀐 내용이 들어왔을 때: 입력 중이면 입력이 끝난 뒤 다시 그린다
  onRemoteChange() {
    this.applySchedules();
    if (this.isEditingMain()) this._needRender = true;
    else this.render();
    this.refreshModals();
  },
  // 열려 있는 모달 중 다시 그릴 수 있는 것(학생 상세)은 다시 그린다 (입력 중이면 모달이 알아서 미룸)
  refreshModals() { Modal.stack.forEach(m => { if (m.refresh) m.refresh(); }); },
  // 날짜가 된 예약(미래 날짜 휴원·퇴원·복귀·재등록)을 실제 상태로 바꾼다.
  // 서버 내용을 처음 받은 뒤에만 실행 (다른 기기에서 취소한 예약을 옛 캐시로 적용하지 않도록)
  applySchedules() {
    if (!Store.firstPullDone) return 0;
    return Students.applyDue();
  },
  isEditingMain() {
    const a = document.activeElement;
    return !!(a && $('#main').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  },
  flushRender() { if (this._needRender && !this.isEditingMain()) this.render(); },

  pickDate(date) {
    this.selDate = date;
    MiniCal.showMonthOf(date);
    this.go(date === todayStr() ? 'today' : 'day', { date });
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

  afterFirstPull() {
    // 빈 수업일지 기록 정리 + 색 없는 반에 색 배정 + 날짜가 된 예약 적용
    const n = Lessons.cleanEmpty() + Classes.assignColors() + this.applySchedules();
    if (n) { this.render(); this.refreshModals(); }
    Promo.check();
    HolidayRemind.check();            // 달마다 처음 열 때 공휴일 입력 확인
    Makeups.retSync();                // 결석 후 첫 등원 할일 만들기 · 정리
    Books.autoSync();                 // 반 교재(독해·문법) 학생 교재 자동 등록 · 정리
    StartRemind.check();              // 접속 알림: 결석+보강 처리 필요 · SMS 신규생 안내 (다른 창이 닫힌 뒤)
  },

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
    await Vocas.wipe();               // 단어 출제: 이 기기에 등록한 단어장(IndexedDB mg77_voca)도 함께 지움
    Store.reset();
    Auth.ok();
    $('#main').innerHTML = '';
    this.setSync('');
    this.showLogin();
  },
};

/* =========================================================
   접속 알림 (PC 전용 · 사이트를 열거나 새로고침할 때마다, 서버 내용을 처음 받은 뒤 한 번)
   - 결석+보강 › 처리 필요 탭의 결석 전부 (탭 숫자와 같은 기준: 오늘까지의 결석 중 미지정·예정)
   - SMS › 신규생: 날짜가 오늘이거나 지난 미완료 안내 (교재 안내 · 첫 문자 · 첫 상담 안내 — 칩의 '오늘'·'지남')
     날짜 없는 '미완료'(일정 등록 '안 함' 등)는 넣지 않는다
   - 해결하기 전까지는 접속할 때마다 뜬다 (따로 '다시 보지 않기' 기록 없음). 탭으로 돌아오기만 하면 뜨지 않음
   - 공휴일 확인 · 진급 등 다른 창이 열려 있으면 모두 닫힌 뒤에 띄운다 (띄울 때 다시 계산)
   - 칸마다 최대 LIMIT건, 나머지는 '외 N건'
   ========================================================= */
const StartRemind = {
  LIMIT: 8,
  _t: null,

  check() {
    clearTimeout(this._t);
    let tries = 0;
    const tick = () => {
      if (!Auth.key() || !Store.firstPullDone) return;
      if (Modal.stack.length || !document.body.classList.contains('app-on')) {
        if (++tries < 1500) this._t = setTimeout(tick, 400);   // 다른 창이 닫힐 때까지 기다림 (약 10분까지)
        return;
      }
      try { this.show(); } catch (e) { console.warn('[mg77] 접속 알림 실패', e); }
    };
    this._t = setTimeout(tick, 700);   // 시작 직후 뜨는 다른 확인창이 먼저 열리도록 잠시 기다림
  },

  // 결석+보강 › 처리 필요와 같은 목록 · 같은 순서
  makeups() {
    return Makeups.collect().filter(o => !o.fut && ['none', 'plan'].includes(o.status))
      .sort((a, b) => (a.status === 'plan' ? 0 : 1) - (b.status === 'plan' ? 0 : 1) || ko(a.mk && a.mk.date, b.mk && b.mk.date) || ko(b.l.date, a.l.date));
  },
  // SMS 신규생: 날짜가 오늘까지인 미완료 단계 (오래된 날짜 먼저)
  newStu() {
    const today = todayStr(), out = [], seen = new Set();
    NewStu._bc = new Map();            // 제외 반 판단 캐시를 새로 (신규생 탭 groups()와 같음)
    Store.where('todos', t => t.nwKey && t.nwStep && !t.done).forEach(t => {
      const sid = t.nwKey, k = t.nwStep, key = sid + '|' + k;
      if (seen.has(key) || !NewStu.KEYS.includes(k)) return;
      seen.add(key);
      const s = Store.get('students', sid);
      if (!s || (s.status || 'active') !== 'active' || !(s.name || '').trim()) return;
      const st = NewStu.state(sid, k);
      if (st.done || !isYmd(st.date) || st.date > today) return;
      out.push({ s, k, date: st.date, c: NewStu.baseCls(sid), late: st.date < today });
    });
    return out.sort((a, b) => ko(a.date, b.date) || Students.sortFn(a.s, b.s) || NewStu.KEYS.indexOf(a.k) - NewStu.KEYS.indexOf(b.k));
  },

  show() {
    const mk = this.makeups(), nw = this.newStu();
    if (!mk.length && !nw.length) return;
    const more = (n) => n > this.LIMIT ? `<div class="small soft" style="margin-top:4px">외 ${n - this.LIMIT}건</div>` : '';
    const row = (inner) => `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:5px 0;border-bottom:1px solid var(--line)">${inner}</div>`;
    const head = (t, n, go, btn) => `<div style="display:flex;align-items:center;gap:8px;margin:0 0 6px"><b>${t}</b><span class="badge red">${n}건</span><span style="flex:1"></span><button type="button" class="btn sm primary" data-srgo="${go}">${btn}</button></div>`;
    let body = '';
    if (mk.length) {
      body += `<div style="margin-bottom:16px">${head('결석+보강 · 처리 필요', mk.length, 'mk', '결석+보강으로 이동')}`;
      body += mk.slice(0, this.LIMIT).map(o => {
        const m = o.mk || {};
        const stt = o.status === 'plan'
          ? `<span class="badge orange">예정${isYmd(m.date) ? ' ' + fmtMD(m.date) + (m.time ? ' ' + esc(m.time) : '') : ' (보강일 없음)'}</span>`
          : '<span class="badge gray">미지정</span>';
        return row(`<b>${esc(o.s.name)}</b><span class="tag">${esc(stTag(o.s))}</span><span class="badge red">결석 ${fmtMD(o.l.date)}</span>${stt}<span class="small soft">${esc(o.c ? o.c.name : '(삭제된 반)')}</span>`);
      }).join('') + more(mk.length) + '</div>';
    }
    if (nw.length) {
      body += `<div>${head('SMS · 신규생 안내', nw.length, 'nw', 'SMS 신규생으로 이동')}`;
      body += nw.slice(0, this.LIMIT).map(o => {
        const x = parseYmd(o.date), md = (x.getMonth() + 1) + '/' + x.getDate();
        return row(`<b>${esc(o.s.name)}</b><span class="tag">${esc(stTag(o.s))}</span><span>${esc(NewStu.LABEL[o.k])}</span>${o.late ? `<span class="badge red">지남 ${md}</span>` : '<span class="badge orange">오늘</span>'}<span class="small soft">${esc(o.c ? o.c.name : '')}</span>`);
      }).join('') + more(nw.length) + '</div>';
    }
    body += '<p class="small muted" style="margin:12px 0 0">처리하기 전까지는 사이트에 접속할 때마다 알려줍니다.</p>';
    Modal.open({
      title: '확인할 일', size: 'md', autofocus: false, body,
      onMount: (b, m) => {
        b.addEventListener('click', (e) => {
          const g = e.target.closest('[data-srgo]');
          if (!g) return;
          m.close();
          if (g.dataset.srgo === 'mk') { Makeups.tab = 'open'; Makeups.q = ''; App.go('makeups', {}); }
          else { SmsPage.tab = 'new'; NewStu.cls = ''; NewStu.q = ''; NewStu.todo = true; App.go('sms', {}); }
        });
      },
      buttons: [{ text: '닫기', cls: 'primary', primary: true }],
    });
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
    const cat = b.closest('.nav-cat');           // 하위 메뉴를 고르면 바로 닫음 (마우스가 탭을 벗어나면 다시 열 수 있음)
    if (cat) cat.classList.add('nav-hold');
    const p = b.dataset.page;
    if (p === 'lessons') App.go('lessons', { date: App.selDate });
    else {
      if (p === 'progress') { ProgressBook.classId = ''; ProgressSum.classId = ''; }   // 메뉴로 열면 진도는 '선택 안 함'에서 시작 (진도 요약은 '전체')
      App.go(p, {});
    }
  });
  $$('#nav .nav-cat').forEach(c => c.addEventListener('mouseleave', () => c.classList.remove('nav-hold')));
  // 시간표 아이콘 → 시간표만 팝업으로
  $('#nav-tt').addEventListener('click', () => Timetable.openPopup());
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

  // 창 크기가 바뀌면 큰 달력 높이를 다시 맞춤 (직접 늘린 경우 제외)
  window.addEventListener('resize', debounce(() => { if (!Modal.stack.length && ((App.page === 'calendar' && !BigCal.userH) || (App.page === 'timetable' && !Timetable.userH))) App.render(); }, 200));

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
    App.applySchedules();
    App.render();
    App.refreshModals();
    Promo.check();
    HolidayRemind.check();            // 달이 바뀌면 공휴일 입력 확인
    Makeups.retSync();                // 결석 후 첫 등원 할일 만들기 · 정리
    Books.autoSync();                 // 반 교재 자동 등록 (날짜가 바뀌면 반에서 빠진 학생 정리)
  }, 60000);
})();
