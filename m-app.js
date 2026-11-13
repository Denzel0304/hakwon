/* =========================================================
   m-app.js — 모바일 전용 (index-mobile.html)
   - 데이터·로그인·동기화는 PC와 같은 파일(config/util/store/…)을 그대로 쓴다
   - 화면: 할일 · 시간표 · 일정 · SMS · 진도 · 보강
   - 문자는 PC 문자 화면(SmsPage)을 그대로 사용 (기능 동일)
   - 할일은 일정관리 앱처럼 추가·수정 가능 (todo-ext.js, 수업일지 할일은 완료 체크만)
   - 나머지는 보기 전용 (데이터를 바꾸지 않음)
   - PC 전용 자동 처리(빈 수업일지 정리 · 반 색 배정 · 진급 확인)는 하지 않음
     → PC로 접속하면 처리됨. 예약된 휴원·퇴원·복귀 적용만 여기서도 실행
   ========================================================= */

const M_ICON = {
  timetable: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/></svg>',
  sms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg>',
  events: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8" cy="15" r="1.2" fill="currentColor"/></svg>',
  makeups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/><path d="M12 8v4l3 2"/></svg>',
  todos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="6" height="6" rx="1.5"/><path d="M5 7l1.2 1.2L8.5 6"/><rect x="3.5" y="14" width="6" height="6" rx="1.5"/><path d="M13 7h7.5M13 17h7.5"/></svg>',
};
const M_TABS = [['todos', '할일'], ['timetable', '시간표'], ['events', '일정'], ['sms', 'SMS'], ['progress', '진도'], ['makeups', '보강']];

/* ---------- 공용 ---------- */
// 검색칸: 입력할 때 목록만 다시 그린다 (입력칸을 새로 만들지 않아 한글 입력이 끊기지 않음)
function mSearchHtml(val, ph) {
  return `<input type="search" data-q value="${esc(val)}" placeholder="${esc(ph)}" class="m-grow" enterkeyhint="search">`;
}
// 좌우 스와이프 감지: onSwipe(1) = 왼쪽으로 밀기(다음), onSwipe(-1) = 오른쪽으로 밀기(이전)
function mSwipe(el, onSwipe) {
  let x0 = null, y0 = 0, t0 = 0;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - t0 < 800) onSwipe(dx < 0 ? 1 : -1);
  }, { passive: true });
  el.addEventListener('touchcancel', () => { x0 = null; }, { passive: true });
}

/* =========================================================
   시간표 — 하루씩 보기 (월~금, 좌우 스와이프로 요일 이동) · 보기 전용
   블록 모양·배치·학생 명단은 PC 시간표(Timetable)의 것을 그대로 쓴다
   ========================================================= */
const MTimetable = {
  FULL_S: 15 * 60, FULL_E: 24 * 60,   // PC 시간표와 같은 전체 범위 (오후 3시 ~ 밤 12시)
  PAD: 15,                            // 첫 수업 앞·마지막 수업 뒤 여유 (분)
  MIN_SPAN: 240,                      // 수업이 적은 날도 최소 4시간은 보여줌 (블록이 지나치게 커지지 않게)
  DAYS: [1, 2, 3, 4, 5],
  dow: undefined,         // 보고 있는 요일 (undefined: 오늘 기준으로 정함 → 평일=오늘, 주말=선택 없음 / null: 선택 없음 = 빈 화면)
  _dir: 0,                // 넘긴 방향 (넘김 효과용)
  onLeave() { Timetable.stopNow(); this.dow = undefined; },   // 다른 탭에 다녀오면 다시 오늘 기준으로

  render(main) {
    const today = todayStr(), tdow = dowOf(today);
    if (this.dow === undefined) this.dow = this.DAYS.includes(tdow) ? tdow : null;
    else if (this.dow !== null && !this.DAYS.includes(this.dow)) this.dow = null;
    const seg = `<div class="m-dayseg">${this.DAYS.map(d => `<button type="button" data-dow="${d}" class="${d === this.dow ? 'on' : ''}${d === tdow ? ' today' : ''}">${DOW[d]}${d === tdow ? '<small>오늘</small>' : ''}</button>`).join('')}</div>`;
    // 요일 버튼: 다른 요일 → 그 요일 보기 / 보고 있는 요일을 다시 누르면 해제(빈 화면)
    const onSeg = (e) => {
      const b = e.target.closest('[data-dow]');
      if (!b) return;
      const d = +b.dataset.dow;
      if (d === this.dow) { this.dow = null; this._dir = 0; }
      else { this._dir = this.dow == null ? 0 : (d > this.dow ? 1 : -1); this.dow = d; }
      App.render();
    };
    // 선택된 요일이 없으면: 요일 버튼만 두고 화면은 비움 (스와이프도 하지 않음)
    // 단, 오늘이 주말이면 쉬는 날 인사 문구를 보여줌
    if (this.dow === null) {
      const rest = this.DAYS.includes(tdow) ? '' : `<div class="m-tt-rest">
          <div class="m-tt-rest-ic" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
            <circle cx="24" cy="24" r="8.5" fill="currentColor" fill-opacity=".18"/>
            <path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M10.6 37.4l3.5-3.5M33.9 14.1l3.5-3.5"/></svg></div>
          <div class="m-tt-rest-t">오늘은 수업이 없는 날입니다.</div>
          <div class="m-tt-rest-s">즐거운 하루 보내세요!</div>
        </div>`;
      main.innerHTML = `<div class="m-tt-page">${seg}<div class="m-tt-view">${rest}</div></div>`;
      main.onclick = onSeg;
      Timetable.stopNow();
      return;
    }
    const dow = this.dow, isToday = dow === tdow;
    // 금요일 개인 시간 학생은 같은 시간 다른 반 블록 안 또는 개별 블록으로 (PC 시간표와 같은 규칙)
    const list = Timetable.dayItems(Store.all('classes').filter(c => c.active !== false), dow, today);
    const items = dow === 5 ? Timetable.layoutFri(list) : Timetable.layout(list);
    // 모바일은 폭이 좁으므로: 같은 시간에 겹치는 반이 없는 오른쪽 칸은 모두 써서 가로로 넓힌다
    // (PC 시간표의 배치는 그대로 두고, 여기서만 span을 계산)
    items.forEach(it => {
      let sp = 1;
      while (it.col + sp < it.cols && !items.some(o => o !== it && o.col === it.col + sp && o.s < it.e && o.e > it.s)) sp++;
      it.span = sp;
    });
    const twoLine = [];

    // 시간 범위를 그날 수업에 맞춘다: 첫 수업 시작 ~ 마지막 수업 끝 (수업이 없으면 전체 범위)
    let S = this.FULL_S, E = this.FULL_E;
    if (items.length) {
      const mn = Math.min(...items.map(it => it.s)), mx = Math.max(...items.map(it => it.e));
      S = Math.max(this.FULL_S, Math.floor((mn - this.PAD) / 5) * 5);
      E = Math.min(this.FULL_E, Math.ceil((mx + this.PAD) / 5) * 5);
      if (E - S < this.MIN_SPAN) { E = Math.min(this.FULL_E, S + this.MIN_SPAN); S = Math.max(this.FULL_S, E - this.MIN_SPAN); }
    }
    const span = E - S;
    const hourOff = (60 - S % 60) % 60;   // 첫 정시까지의 분 (가로선을 정시에 맞추기 위함)

    let h = `<div class="m-tt-page">${seg}
      <div class="m-tt-view"><div class="tt2 m-tt1"><div class="tt2-body"><div class="tt2-time">`;
    for (let t = Math.ceil(S / 60) * 60; t < E; t += 60) {
      const hr = t / 60;
      h += `<span style="top:calc(var(--ppm) * ${t - S})">${hr > 12 ? hr - 12 : hr}시</span>`;
    }
    h += `</div><div class="tt2-col${isToday ? ' today' : ''}" style="--bgy:calc(var(--ppm) * ${hourOff})">${isToday ? '<div class="tt2-now" hidden></div>' : ''}`;
    items.forEach(it => {
      const s = Math.max(it.s, S), e = Math.min(it.e, E);
      if (e <= s) return;
      const w = 100 / it.cols, c = it.c, cc = Classes.colorOf(c);
      const nmH = esc(c.name) + Timetable.indivTag(it);
      const two = `<div class="hd"><div class="nm" style="color:var(--ink)"><b>${nmH}</b></div>
        <div class="tm">${esc(Timetable.timeText(it, dow))} · ${Timetable.cntText(it)}</div></div>`;
      twoLine.push(two);
      h += `<div class="tt-blk${it.indiv ? ' indiv' : ''}" data-hi="${twoLine.length - 1}"${isToday ? ` data-end="${it.e}"` : ''}
        style="--c:${cc};top:calc(var(--ppm) * ${s - S} + 1px);height:calc(var(--ppm) * ${e - s} - 3px);left:calc(${it.col * w}% + 3px);width:calc(${it.span * w}% - 6px);background:${Timetable.blkBg(it, cc, isToday)};border-color:${cc}73;box-shadow:inset 5px 0 0 ${cc}">
        ${it.span === it.cols   // 한 줄을 다 쓰는 블록: 반 이름 뒤에 (시간 · 인원)을 붙여 한 줄로
          ? `<div class="hd one"><div class="nm" style="color:var(--ink)"><b>${nmH}</b> <span class="tm">(${esc(Timetable.timeText(it, dow))} · ${Timetable.cntText(it)})</span></div></div>`
          : it.span / it.cols < 0.5   // 폭이 절반보다 좁은 블록: 이름 + 인원만 작게 (시간은 반 이름에 들어 있음)
            ? `<div class="hd nar"><div class="nm" style="color:var(--ink)"><b>${nmH}</b> <span class="cnt">${Timetable.cntText(it, true)}</span></div></div>`
            : two}
        <div class="sts-g">${Timetable.groupedHtml(it.roster, it.up, (sid, date) => Classes.partDays(c.id, sid, date || today))}${Timetable.guestsHtml(it, today)}</div></div>`;
    });
    if (!items.length) h += '<div class="m-tt-empty">수업 없음</div>';
    h += '</div></div></div></div></div>';
    main.innerHTML = h;

    // 위에서 정한 시간 범위를 화면 높이에 맞춤 (너무 작은 화면이면 아래로 스크롤)
    const view = $('.m-tt-view', main), box = $('.tt2', main);
    box.style.setProperty('--span', span);   // 표 높이 = 1분당 높이 × 보여주는 분
    box.style.setProperty('--ppm', Math.max(0.9, (view.clientHeight - 14) / span) + 'px');
    // 한 줄 제목이 블록 폭보다 길면 두 줄 제목으로 되돌림 (글자가 잘리지 않게)
    const fixHead = () => $$('.tt-blk', main).forEach(blk => {
      const nm = $('.hd.one .nm', blk);
      if (nm && nm.scrollWidth > nm.clientWidth + 1) $('.hd', blk).outerHTML = twoLine[+blk.dataset.hi];
    });
    fixHead();
    Timetable.fitStudents(main);
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (box.isConnected) { fixHead(); Timetable.fitStudents(main); } });
    if (this._dir) { view.classList.add(this._dir > 0 ? 'm-slide-l' : 'm-slide-r'); this._dir = 0; }

    mSwipe(view, (d) => this.move(d));
    main.onclick = onSeg;
    Timetable.START = S; Timetable.END = E;
    if (isToday) Timetable.startNow(main, today); else Timetable.stopNow();
  },
  // 월요일·금요일 끝에서는 멈춤
  move(d) {
    if (this.dow == null) return;
    const i = this.DAYS.indexOf(this.dow) + d;
    if (i < 0 || i >= this.DAYS.length) return;
    this._dir = d;
    this.dow = this.DAYS[i];
    App.render();
  },
};

/* =========================================================
   문자 — PC 문자 화면(SmsPage)을 그대로 쓰고, 반 선택 버튼 줄만 드롭다운으로 바꿔 보여준다
   (드롭다운을 바꾸면 숨겨 둔 원래 반 버튼을 눌러 주므로 동작은 PC와 같음)
   ========================================================= */
const MSms = {
  onLeave() { SmsPage.onLeave(); },
  render(main) { SmsPage.render(main); }     // 반 드롭다운은 PC와 같은 것을 그대로 씀
};

/* =========================================================
   진도 — 보기 전용 (반별 수업 기록 · 내신 요약)
   ========================================================= */
const MProgress = {
  classId: '', q: '', npOn: false, npSel: {}, gpOn: false,   // gpOn: 비내신 요약
  jump: '',                 // 보강에서 '진도 보기'로 왔을 때 그 날짜로 스크롤

  classes() { return Classes.sorted(Store.all('classes')).sort((a, b) => (a.active === false) - (b.active === false)); },
  todosOf(lid) { return Store.where('todos', t => t.lessonId === lid).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt)); },

  render(main, p) {
    if (typeof Exams !== 'undefined') Exams.syncDates();   // 시험 기간을 일정의 시험 일정에 맞춤 (내신 요약용)
    const classes = this.classes();
    if (p.classId) this.classId = p.classId;
    if (!this.classId || !Store.get('classes', this.classId)) this.classId = classes[0] ? classes[0].id : '';
    const act = classes.filter(c => c.active !== false), ended = classes.filter(c => c.active === false);
    if (!this.classId) { main.innerHTML = '<div class="panel"><div class="empty">반이 없습니다.</div></div>'; this.bind(main); return; }
    const opt = (c) => `<option value="${c.id}" ${c.id === this.classId ? 'selected' : ''}>${esc(c.name)}</option>`;
    let h = `<div class="m-bar">${Classes.selDot(Store.get('classes', this.classId))}<select data-clsel class="m-grow m-clsel" aria-label="반 선택">${act.map(opt).join('')}${ended.length ? `<optgroup label="종료된 반">${ended.map(opt).join('')}</optgroup>` : ''}</select></div>`;
    h += `<div class="m-bar" style="flex-wrap:wrap">${mSearchHtml(this.q, '전체 반에서 진도·숙제·메모·할일 검색')}<label class="chk m-tg"><input type="checkbox" data-npsum ${this.npOn ? 'checked' : ''}>내신 요약</label><label class="chk m-tg"><input type="checkbox" data-gpsum ${this.gpOn ? 'checked' : ''}>비내신 요약</label></div>`;
    // 요약은 한 반 기준이라 전체 반 검색 중에는 숨김 (검색어 입력 때 #m-sum 표시를 바꿈)
    h += `<div id="m-sum" ${this.q.trim() ? 'style="display:none"' : ''}>`;
    if (this.npOn) {
      const today = todayStr();
      const sel = NP.liveIds(this.npSel[this.classId] || NP.autoExams(this.classId, today).map(e => e.id));   // 진행중인 시험만
      const cands = NP.candExams(this.classId, today, sel);
      h += `<div class="np-exams m-npx">${NP.groupExams(cands).map(g => `<button type="button" class="np-ex ${g.ids.some(id => sel.includes(id)) ? 'on' : ''}" data-npsx="${g.ids.join(',')}">${esc(NP.examLabel(g.ex))} <small>${esc(NP.examDates(g.ex))}</small></button>`).join('') || '<span class="small muted">등록된 시험이 없습니다.</span>'}
        ${this.npSel[this.classId] ? '<button type="button" class="np-auto" data-npsauto>자동</button>' : ''}</div>
        <div class="m-ro">${NP.summaryHtml(this.classId, sel)}</div>`;
    }
    if (this.gpOn) h += `<div class="m-ro">${NP.genSummaryHtml(this.classId)}</div>`;
    h += '</div>';
    h += `<div id="m-list">${this.listHtml(p.date)}</div>`;
    main.innerHTML = h;
    this.bind(main);
    if (this.jump) {
      const t = $(`.m-card[data-date="${this.jump}"]`, main);
      this.jump = '';
      if (t) setTimeout(() => t.scrollIntoView({ block: 'center' }), 0);
    }
  },

  listHtml(hlDate) {
    const q = this.q.trim();
    // 검색어가 있으면 진행 중인 모든 반에서 찾는다 (종료된 반 제외) · 없으면 선택한 반만
    const allCls = !!q;
    const actIds = this.classes().filter(c => c.active !== false).map(c => c.id);
    const clsOrd = (cid) => { const i = actIds.indexOf(cid); return i < 0 ? 999 : i; };
    const all = Store.where('lessons', l => (allCls ? actIds.includes(l.classId) : l.classId === this.classId) && !Lessons.isEmpty(l));
    const list = all.filter(l => !q || [l.progress, l.homework, l.memo, NP.text(l), NP.genText(l), ...(l.dist || []).map(d => NP.distText(d)), ...this.todosOf(l.id).map(t => t.text)].some(v => String(v || '').includes(q)))
      .sort((a, b) => ko(b.date, a.date) || clsOrd(a.classId) - clsOrd(b.classId));
    if (!list.length) return `<div class="panel"><div class="empty">${allCls || all.length ? '조건에 맞는 기록이 없습니다.' : '이 반은 저장된 수업일지가 없습니다.'}</div></div>`;
    return `<div class="m-cnt">${allCls ? '전체 반 ' : ''}${list.length}회</div>` + list.map(l => {
      const v = Object.values(l.att || {});
      const n = (k) => v.filter(x => x === k).length;
      const att = v.length ? `출${n('P')}${n('L') ? ' 지' + n('L') : ''}${n('A') ? ' <span style="color:var(--danger)">결' + n('A') + '</span>' : ''}${n('E') ? ' 조' + n('E') : ''}` : '';
      const tds = this.todosOf(l.id);
      const pg = stripZws(l.progress || '').trim(), hw = stripZws(l.homework || '').trim(), mm = stripZws(l.memo || '').trim();
      let f = `<span class="k">진도</span><div class="pre">${pg ? highlight(pg, q) : ((l.np || []).length || (l.gp || []).length || (l.dist || []).length ? '' : '<span class="muted">-</span>')}${(l.np || []).length ? `<div class="np-line">내신 ${highlight(NP.text(l), q)}</div>` : ''}${(l.gp || []).length ? `<div class="np-line">비내신 ${highlight(NP.genText(l), q)}</div>` : ''}${(l.dist || []).map(d => `<div class="np-line dist">배부 ${highlight(NP.distText(d), q)}</div>`).join('')}</div>`;
      f += `<span class="k">숙제</span><div class="pre">${hw ? highlight(hw, q) : '<span class="muted">-</span>'}</div>`;
      if (mm) f += `<span class="k">메모</span><div class="pre soft">${highlight(mm, q)}</div>`;
      if (tds.length) f += `<span class="k">할일</span><div>${tds.map(t => `<div class="${t.done ? 'muted' : ''}">${t.done ? '☑' : '☐'} ${highlight(t.text, q)} <span class="muted small">${fmtMD(t.date)}</span></div>`).join('')}</div>`;
      const lc = allCls ? Store.get('classes', l.classId) : null;
      return `<div class="m-card ${hlDate === l.date && l.classId === this.classId ? 'hl' : ''}" data-date="${l.date}">
        <div class="m-card-hd"><b class="m-date">${fmtMD(l.date)}</b>${lc ? `<span class="small">${Classes.dot(lc)}${esc(lc.name)}</span>` : ''}${att ? `<span class="small soft">${att}</span>` : ''}</div>
        <div class="m-f">${f}</div></div>`;
    }).join('');
  },

  bind(main) {
    main.onclick = (e) => {
      const sx = e.target.closest('[data-npsx]');
      if (sx) {
        const cur = this.npSel[this.classId] || NP.autoExams(this.classId, todayStr()).map(x => x.id);
        this.npSel[this.classId] = NP.toggleGroup(cur, sx.dataset.npsx.split(','));
        App.render(); return;
      }
      if (e.target.closest('[data-npsauto]')) { delete this.npSel[this.classId]; App.render(); }
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-npsum]')) { this.npOn = e.target.checked; App.render(); return; }
      if (e.target.matches('[data-gpsum]')) { this.gpOn = e.target.checked; App.render(); return; }
      if (e.target.matches('[data-clsel]') && e.target.value) { this.classId = e.target.value; e.target.blur(); App.params = {}; App.render(true); }
    };
    main.oninput = debounce((e) => {
      if (!e.target.matches('[data-q]')) return;
      this.q = e.target.value;
      const box = $('#m-list', main); if (box) box.innerHTML = this.listHtml(App.params.date);
      const sm = $('#m-sum', main); if (sm) sm.style.display = this.q.trim() ? 'none' : '';
    }, 250);
  },
};

/* =========================================================
   보강 — 보기 전용 (출석부 결석 + 지난 결석 예정이 자동으로 모임) + 진도·숙제 복사
   보강 안 함은 목록에서 삭제된 것이라 보이지 않고, 내일 이후 결석 예정은 PC의 결석+보강에서만 본다
   ========================================================= */
const MMakeups = {
  tab: 'open', q: '',
  ST_BADGE: { none: 'gray', plan: '', done: 'green', skip: 'gray' },

  render(main) {
    const all = Makeups.collect().filter(o => !o.fut);
    const cnt = { open: 0, done: 0, all: all.length };
    all.forEach(o => { if (o.status === 'done') cnt.done++; else cnt.open++; });
    if (!(this.tab in cnt)) this.tab = 'open';
    main.innerHTML = `<div class="tabs m-tabs4">${[['open', '처리 필요'], ['done', '완료'], ['all', '전체']].map(([k, t]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${t}<span class="cnt">${cnt[k]}</span></button>`).join('')}</div>
      <div class="m-bar">${mSearchHtml(this.q, '학생 이름, 반 이름 검색')}</div>
      <div id="m-list">${this.listHtml(all)}</div>`;
    this.bind(main);
  },

  filtered(all) {
    const q = this.q.trim();
    const list = all.filter(o => this.tab === 'all' || (this.tab === 'open' ? ['none', 'plan'].includes(o.status) : o.status === this.tab))
      .filter(o => !q || o.s.name.includes(q) || (o.c && o.c.name.includes(q)));
    if (this.tab === 'open') list.sort((a, b) => (a.status === 'plan' ? 0 : 1) - (b.status === 'plan' ? 0 : 1) || ko(a.mk && a.mk.date, b.mk && b.mk.date) || ko(b.l.date, a.l.date));
    else list.sort((a, b) => ko(b.l.date, a.l.date));
    return list;
  },

  listHtml(all) {
    all = all || Makeups.collect().filter(o => !o.fut);
    const list = this.filtered(all);
    this._byKey = {};
    if (!list.length) return `<div class="panel"><div class="empty">${all.length ? '해당하는 보강이 없습니다.' : '결석 기록이 없습니다.'}</div></div>`;
    const q = this.q.trim();
    return list.map(o => {
      const mk = o.mk || {};
      const key = Makeups.id(o.l.id, o.s.id);
      this._byKey[key] = o;
      const my = Makeups.mine(o);                // 학교가 섞인 반: 이 학생 학교 것만
      const got = mk.distGot || [];
      const when = mk.date ? fmtDate(mk.date) + (mk.time ? ' ' + mk.time : '') : '';
      let f = `<span class="k">보강일</span><div>${when ? esc(when) : '<span class="muted">미정</span>'}</div>`;
      if (mk.memo) f += `<span class="k">메모</span><div class="pre">${esc(mk.memo)}</div>`;
      f += `<span class="k">진도</span><div class="pre">${esc(stripZws(o.l.progress)) || '<span class="muted">입력 전</span>'}</div>`;
      if (my.np) f += `<span class="k">내신</span><div>${esc(my.np)}</div>`;
      if ((o.l.gp || []).length) f += `<span class="k">비내신</span><div>${esc(NP.genText(o.l))}</div>`;
      f += `<span class="k">숙제</span><div class="pre">${esc(my.hw) || '<span class="muted">입력 전</span>'}</div>`;
      if (my.memo) f += `<span class="k">수업 메모</span><div class="pre">${esc(my.memo)}</div>`;
      if (my.dist.length) f += `<span class="k">배부</span><div>${my.dist.map(([d, i]) => `<div class="small mk-dist ${got.includes(i) ? 'got' : ''}">${got.includes(i) ? '☑' : '☐'} ${esc(NP.distText(d))}</div>`).join('')}</div>`;
      return `<div class="m-card ${o.status === 'done' ? 'm-dim' : ''}">
        <div class="m-card-hd"><b class="m-who">${highlight(o.s.name, q)}</b><span class="tag">${esc(stTag(o.s))}</span>
          ${o.s.status !== 'active' ? Students.statusBadge(o.s) : ''}
          <span class="m-grow"></span><span class="badge ${this.ST_BADGE[o.status] || 'gray'}">${MK_STATUS[o.status] || '미지정'}</span></div>
        <div class="m-card-sub"><span class="badge red">결석 ${fmtMD(o.l.date)}</span><span class="soft small">${o.c ? highlight(o.c.name, q) : '(삭제된 반)'}</span>
          ${my.left ? `<span class="badge orange">미전달 자료 ${my.left}</span>` : ''}</div>
        <div class="m-f">${f}</div>
        <div class="m-card-act"><button type="button" class="btn sm" data-copy="${esc(key)}">진도·숙제 복사</button>
          <button type="button" class="btn sm ghost" data-golesson="${esc(o.l.id)}">진도 보기</button></div></div>`;
    }).join('');
  },

  bind(main) {
    main.onclick = async (e) => {
      const tb = e.target.closest('[data-tab]'); if (tb) { this.tab = tb.dataset.tab; App.render(true); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const o = this._byKey && this._byKey[cp.dataset.copy]; if (!o) return;
        const txt = Makeups.copyText(o);
        try { await navigator.clipboard.writeText(txt); toast('진도와 숙제를 복사했습니다'); }
        catch (_) { alertDlg('복사할 내용', txt); }
        return;
      }
      const gl = e.target.closest('[data-golesson]');
      if (gl) {
        const l = Store.get('lessons', gl.dataset.golesson);
        if (l) { MProgress.classId = l.classId; MProgress.q = ''; MProgress.jump = l.date; App.go('progress', { classId: l.classId, date: l.date }); }
      }
    };
    main.oninput = debounce((e) => {
      if (!e.target.matches('[data-q]')) return;
      this.q = e.target.value;
      const box = $('#m-list', main); if (box) box.innerHTML = this.listHtml();
    }, 250);
  },
};

/* =========================================================
   일정 — 보기 전용 (달력 / 목록 전환)
   달력: PC 큰 달력처럼 기간 일정은 화살표 띠, 하루 일정은 글자로 표시 · 좌우 스와이프로 달 이동
   ========================================================= */
const MEvents = {
  mode: 'cal',            // 'cal' | 'list'
  type: 'exam',           // 종류 필터 ('' = 전체) — 처음에는 시험 일정
  q: '', hidePast: true,
  month: '',              // 'YYYY-MM'
  sel: '',                // 달력에서 고른 날짜
  _dir: 0,                // 넘긴 방향 (넘김 효과용)
  TCLS: { exam: 'red', pre: '', weekend: 'green', etc: 'purple', holiday: 'orange' },
  ORDER: ['exam', 'pre', 'weekend', 'etc', 'holiday'],

  render(main) {
    const today = todayStr();
    if (!isYmd(this.sel)) this.sel = today;
    if (!/^\d{4}-\d{2}$/.test(this.month)) this.month = this.sel.slice(0, 7);
    let h = `<div class="m-bar"><div class="m-seg m-grow" role="group" aria-label="보기 방식">
        <button type="button" data-mode="cal" class="${this.mode === 'cal' ? 'on' : ''}">달력</button>
        <button type="button" data-mode="list" class="${this.mode === 'list' ? 'on' : ''}">목록</button></div>
      <select data-type class="m-typesel" aria-label="일정 종류"><option value="" ${this.type ? '' : 'selected'}>전체</option>${this.ORDER.map(k => `<option value="${k}" ${this.type === k ? 'selected' : ''}>${EVENT_TYPES[k].label}</option>`).join('')}</select></div>`;
    h += this.mode === 'cal' ? this.calHtml(today) : this.listShellHtml(today);
    main.innerHTML = h;
    this.bind(main);
    const cal = $('.m-cal', main);
    if (cal) {
      mSwipe(cal, (d) => this.moveMonth(d));
      if (this._dir) cal.classList.add(this._dir > 0 ? 'm-slide-l' : 'm-slide-r');
    }
    this._dir = 0;
  },

  okType(ev) { return !this.type || evType(ev) === this.type; },

  moveMonth(n) {
    const [Y, M] = this.month.split('-').map(Number);
    const d = new Date(Y, M - 1 + n, 1);
    this.month = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    this._dir = n;
    App.render();
  },

  evRow(ev, showDate) {
    const t = eventTime(ev);
    return `<button type="button" class="m-ev ${evEnd(ev) < todayStr() ? 'past' : ''}" data-ev="${ev.id}">
      <span class="badge ${this.TCLS[evType(ev)]}">${EVENT_TYPES[evType(ev)].label}</span>
      <span class="m-ev-b"><b>${esc(eventShort(ev))}</b>
        <span class="small soft">${[showDate || isRange(ev) ? eventRangeLabel(ev) : '', t].filter(Boolean).map(esc).join(' ')}</span>
        ${ev.memo ? `<span class="small muted m-ev-memo">${esc(firstLine(ev.memo))}</span>` : ''}</span></button>`;
  },

  calHtml(today) {
    const [Y, M] = this.month.split('-').map(Number);
    const first = new Date(Y, M - 1, 1);
    const start = addDays(first, -first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(Y, M, 0).getDate()) / 7);
    const evs = Store.all('events').filter(ev => isYmd(ev.date) && this.okType(ev));
    const ranges = evs.filter(isRange).sort((a, b) => ko(a.date, b.date) || ko(evEnd(b), evEnd(a)));
    const singles = evs.filter(ev => !isRange(ev));
    const colors = barColorMap(ranges.filter(ev => evEnd(ev) >= ymd(start) && ev.date <= ymd(addDays(start, weeks * 7 - 1))));

    let h = `<div class="panel m-cal"><div class="mc-head"><button type="button" class="mc-title ym-btn" data-ympick>${Y}년 ${M}월 ▾</button>
        <button type="button" class="mc-nav" data-mon="-1" aria-label="이전 달">‹</button>
        <button type="button" class="mc-today" data-mon="0">오늘</button>
        <button type="button" class="mc-nav" data-mon="1" aria-label="다음 달">›</button></div>
      <div class="m-bc-wds">${DOW.map((w, i) => `<div class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}</div>`;
    for (let w = 0; w < weeks; w++) {
      const wd = Array.from({ length: 7 }, (_, i) => ymd(addDays(start, w * 7 + i)));
      const ws = wd[0], we = wd[6];
      // 이 주에 걸치는 기간 일정 → 줄(lane) 배정 (PC 큰 달력과 같은 방식)
      const lanes = [], segs = [];
      ranges.forEach(ev => {
        const s = ev.date, e = evEnd(ev);
        if (e < ws || s > we) return;
        const c0 = s < ws ? 0 : wd.indexOf(s), c1 = e > we ? 6 : wd.indexOf(e);
        let ln = lanes.findIndex(end => end < c0);
        if (ln < 0) { ln = lanes.length; lanes.push(-1); }
        lanes[ln] = c1;
        segs.push({ ev, c0, c1, ln, contL: s < ws, contR: e > we });
      });
      h += `<div class="m-bc-week" style="--lanes:${lanes.length}">`;
      wd.forEach((k, i) => {
        const d = parseYmd(k);
        const cls = ['m-bc-cell'];
        if (d.getMonth() !== M - 1) cls.push('other');
        if (i === 0) cls.push('sun');
        if (i === 6) cls.push('sat');
        if (k === today) cls.push('today');
        if (k === this.sel) cls.push('sel');
        const items = singles.filter(ev => ev.date === k).sort((a, b) => ko(a.start, b.start))
          .map(ev => `<span class="bc-item ${evType(ev)}" data-ev="${ev.id}">${esc(eventShort(ev))}</span>`).join('');
        h += `<div class="${cls.join(' ')}" data-d="${k}"><span class="n">${d.getDate()}</span><div class="m-bc-items">${items}</div></div>`;
      });
      segs.forEach(sg => {
        const label = (sg.contL ? '→ ' : '') + eventShort(sg.ev) + (sg.contR ? ' →' : '');
        h += `<div class="m-bc-bar ${sg.contL ? 'cont-l' : 'tl'} ${sg.contR ? 'cont-r' : 'tr'}" data-ev="${sg.ev.id}"
          style="left:calc(${sg.c0 / 7 * 100}% + 2px);width:calc(${(sg.c1 - sg.c0 + 1) / 7 * 100}% - 4px);top:calc(var(--bt) + ${sg.ln} * var(--bh));background:${colors[barKey(sg.ev)]}">${esc(label)}</div>`;
      });
      h += '</div>';
    }
    h += '</div>';
    const daysEv = evs.filter(ev => eventDates(ev).includes(this.sel))
      .sort((a, b) => this.ORDER.indexOf(evType(a)) - this.ORDER.indexOf(evType(b)) || ko(a.start, b.start) || ko(eventShort(a), eventShort(b)));
    h += `<div class="m-sec-t">${esc(fmtDate(this.sel))}${this.sel === today ? ' <span class="badge">오늘</span>' : ''}</div>`;
    h += daysEv.length ? `<div class="m-evs">${daysEv.map(ev => this.evRow(ev, false)).join('')}</div>` : '<div class="panel"><div class="empty">이 날은 일정이 없습니다.</div></div>';
    return h;
  },

  listShellHtml(today) {
    const pastCnt = Store.all('events').filter(ev => isYmd(ev.date) && this.okType(ev) && evEnd(ev) < today).length;
    return `<div class="m-bar">${mSearchHtml(this.q, '학교, 제목, 메모 검색')}</div>
      <div class="m-bar"><label class="chk small"><input type="checkbox" data-past ${this.hidePast ? 'checked' : ''}>지난 일정 숨기기 (${pastCnt})</label></div>
      <div id="m-list">${this.listHtml(today)}</div>`;
  },

  listHtml(today) {
    today = today || todayStr();
    const q = this.q.trim();
    const all = Store.all('events').filter(ev => isYmd(ev.date));
    const list = all.filter(ev => this.okType(ev))
      .filter(ev => !this.hidePast || evEnd(ev) >= today)
      .filter(ev => !q || [ev.school, eventShort(ev), ev.title, ev.memo].some(v => String(v || '').includes(q)))
      .sort((a, b) => {
        const pa = evEnd(a) < today, pb = evEnd(b) < today;
        if (pa !== pb) return pa ? 1 : -1;                 // 다가오는 일정 먼저
        return pa ? ko(b.date, a.date) : ko(a.date, b.date) || ko(a.start, b.start);
      });
    if (!list.length) return `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 일정이 없습니다.' : '등록된 일정이 없습니다.'}</div></div>`;
    return `<div class="m-cnt">${list.length}건</div><div class="m-evs">${list.map(ev => this.evRow(ev, true)).join('')}</div>`;
  },

  openEv(id) {
    const ev = Store.get('events', id);
    if (!ev) return;
    const tg = eventTarget(ev), t = eventTime(ev);
    let f = `<span class="k">날짜</span><div>${esc(isRange(ev) ? fmtDate(ev.date) + ' ~ ' + fmtDate(evEnd(ev)) : fmtDate(ev.date))}</div>`;
    if (t) f += `<span class="k">시간</span><div>${esc(t)}</div>`;
    if (tg) f += `<span class="k">대상</span><div>${esc(ev.school ? ev.school + ' ' + gradesLabel(evGrades(ev), false) + (evGrades(ev).length ? '학년' : '') : tg)}</div>`;
    if (ev.title) f += `<span class="k">제목</span><div>${esc(ev.title)}</div>`;
    if (ev.memo) f += `<span class="k">메모</span><div class="pre">${esc(ev.memo)}</div>`;
    Modal.open({
      title: EVENT_TYPES[evType(ev)].label, size: 'sm', autofocus: false,
      body: `<div class="m-f m-f-lg">${f}</div>`,
      buttons: [{ text: '닫기', cls: 'primary', primary: true }],
    });
  },

  // 제목 '2026년 11월 ▾' → 년·월 고르기
  pickYm() {
    const [Y, M] = this.month.split('-').map(Number);
    MonthPick.open(Y, M).then(r => {
      if (!r) return;
      const nm = r.y + '-' + pad(r.m);
      if (nm !== this.month) { this._dir = nm > this.month ? 1 : -1; this.month = nm; }
      App.render();
    });
  },

  bind(main) {
    main.onclick = (e) => {
      const md = e.target.closest('[data-mode]'); if (md) { this.mode = md.dataset.mode; App.render(true); return; }
      if (e.target.closest('[data-ympick]')) { this.pickYm(); return; }
      const mo = e.target.closest('[data-mon]');
      if (mo) {
        const n = +mo.dataset.mon;
        if (n) { this.moveMonth(n); return; }
        this.sel = todayStr(); this.month = this.sel.slice(0, 7);
        App.render(); return;
      }
      const ev = e.target.closest('[data-ev]'); if (ev) { this.openEv(ev.dataset.ev); return; }   // 띠·일정 글자를 누르면 상세
      const dd = e.target.closest('[data-d]');
      if (dd) { this.sel = dd.dataset.d; if (this.sel.slice(0, 7) !== this.month) { this._dir = this.sel > this.month ? 1 : -1; this.month = this.sel.slice(0, 7); } App.render(); }
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-type]')) { this.type = e.target.value; e.target.blur(); App.render(); return; }
      if (e.target.matches('[data-past]')) { this.hidePast = e.target.checked; App.render(); }
    };
    main.oninput = debounce((e) => {
      if (!e.target.matches('[data-q]')) return;
      this.q = e.target.value;
      const box = $('#m-list', main); if (box) box.innerHTML = this.listHtml();
    }, 250);
  },
};

/* =========================================================
   할일 — 일정관리 앱처럼 (추가 · 수정 · 완료 · 날짜 이동 · 삭제 · 순서)
   위: 작은 달력 (할일 · 밀린 할일 점, 좌우 스와이프로 달 이동) / 아래: 고른 날짜의 할일 + (오늘이면) 밀린 할일
   목록·추가 창·반복 계산은 PC와 같은 todo-ext.js(TodoX)를 쓴다
   · 수업일지에 딸린 할일은 모바일에서 완료 체크만 (수정·메뉴는 PC에서)
   ========================================================= */
const MTodos = {
  month: '',              // 'YYYY-MM'
  sel: '',                // 고른 날짜
  _dir: 0,
  OPT: { mobile: true },

  render(main) {
    const today = todayStr();
    if (!isYmd(this.sel)) this.sel = today;
    if (!/^\d{4}-\d{2}$/.test(this.month)) this.month = this.sel.slice(0, 7);
    const [Y, M] = this.month.split('-').map(Number);
    const first = new Date(Y, M - 1, 1);
    const start = addDays(first, -first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(Y, M, 0).getDate()) / 7);
    const idx = TodoX.dotIndex(ymd(start), weeks * 7, today);

    let h = `<div class="panel m-cal m-tdcal"><div class="mc-head"><button type="button" class="mc-title ym-btn" data-ympick>${Y}년 ${M}월 ▾</button>
        <button type="button" class="mc-nav" data-mon="-1" aria-label="이전 달">‹</button>
        <button type="button" class="mc-today" data-mon="0">오늘</button>
        <button type="button" class="mc-nav" data-mon="1" aria-label="다음 달">›</button></div>
      <div class="mc-grid">${DOW.map((w, i) => `<div class="mc-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}`;
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i), k = ymd(d), o = idx[k];
      const cls = ['mc-day'];
      if (d.getMonth() !== M - 1) cls.push('other');
      if (d.getDay() === 0) cls.push('sun');
      if (d.getDay() === 6) cls.push('sat');
      if (k === today) cls.push('today');
      if (k === this.sel) cls.push('sel');
      const dots = o ? (o.late ? '<i class="dot-late"></i>' : '') + (o.todo ? '<i class="dot-todo"></i>' : '') : '';
      h += `<button type="button" class="${cls.join(' ')}" data-d="${k}"><span class="n">${d.getDate()}</span><span class="mc-dots">${dots}</span></button>`;
    }
    h += `</div><div class="mc-legend"><span><i class="dot-todo"></i>할일</span><span><i class="dot-late"></i>밀린 할일</span></div></div>`;

    const list = TodoX.listHtml(this.sel, this.OPT);
    h += `<div class="m-sec-t">${esc(fmtDate(this.sel))}${this.sel === today ? ' <span class="badge">오늘</span>' : ''}<span class="m-grow"></span><span class="small soft">${list.left ? list.left + '개 남음' : ''}</span></div>`;
    h += list.left || list.html.includes('tx-list') ? `<div class="panel m-tds">${list.html}</div>` : `<div class="panel">${list.html}</div>`;
    if (this.sel === today) {
      const late = TodoX.lateHtml(today, this.OPT);
      if (late.n) h += `<div class="m-sec-t m-late-t">밀린 할일<span class="m-grow"></span><span class="small">${late.n}개</span></div><div class="panel m-tds m-late">${late.html}</div>`;
    }
    h += '<button type="button" class="m-fab" data-addtodo aria-label="할일 추가">+</button>';
    main.innerHTML = h;

    const cal = $('.m-cal', main);
    mSwipe(cal, (n) => this.moveMonth(n));
    if (this._dir) cal.classList.add(this._dir > 0 ? 'm-slide-l' : 'm-slide-r');
    this._dir = 0;
    TodoX.mount(main, this.OPT);
    this.bind(main);
  },

  moveMonth(n) {
    const [Y, M] = this.month.split('-').map(Number);
    const d = new Date(Y, M - 1 + n, 1);
    this.month = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    this._dir = n;
    App.render();
  },

  // 제목 '2026년 11월 ▾' → 년·월 고르기
  pickYm() {
    const [Y, M] = this.month.split('-').map(Number);
    MonthPick.open(Y, M).then(r => {
      if (!r) return;
      const nm = r.y + '-' + pad(r.m);
      if (nm !== this.month) { this._dir = nm > this.month ? 1 : -1; this.month = nm; }
      App.render();
    });
  },

  bind(main) {
    main.onclick = (e) => {
      if (e.target.closest('[data-addtodo]')) { TodoX.add(this.sel, this.OPT); return; }
      if (e.target.closest('[data-ympick]')) { this.pickYm(); return; }
      const mo = e.target.closest('[data-mon]');
      if (mo) {
        const n = +mo.dataset.mon;
        if (n) { this.moveMonth(n); return; }
        this.sel = todayStr(); this.month = this.sel.slice(0, 7);
        App.render(); return;
      }
      const dd = e.target.closest('[data-d]');
      if (dd) {
        this.sel = dd.dataset.d;
        if (this.sel.slice(0, 7) !== this.month) { this._dir = this.sel > this.month ? 1 : -1; this.month = this.sel.slice(0, 7); }
        App.render(); return;
      }
      TodoX.handleClick(e, this.OPT);
    };
  },
};

/* =========================================================
   App — 화면 전환 / 로그인 / 동기화 표시 (store.js·sms.js 등이 부르는 이름 그대로)
   ========================================================= */
const App = {
  page: 'todos',
  params: {},
  selDate: todayStr(),
  _needRender: false,
  pages: { todos: MTodos, timetable: MTimetable, sms: MSms, progress: MProgress, events: MEvents, makeups: MMakeups },

  go(page, params = {}) {
    if (!this.pages[page]) page = 'todos';
    const same = page === this.page;
    const cur = this.pages[this.page];
    if (!same && cur && cur.onLeave) cur.onLeave();
    this.page = page;
    this.params = params;
    this.render(!same);
  },

  render(toTop = false) {
    const main = $('#main');
    const st = main.scrollTop;
    main.onclick = main.onchange = main.oninput = main.onkeydown = null;
    main.dataset.page = this.page;
    try {
      (this.pages[this.page] || MTodos).render(main, this.params);
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="panel"><div class="empty">화면을 그리는 중 오류가 났습니다: ${esc(e.message)}</div></div>`;
    }
    main.scrollTop = toTop ? 0 : st;
    const tab = M_TABS.find(t => t[0] === this.page);
    $('#m-title').textContent = tab ? tab[1] : '';
    $$('#m-tabs [data-page]').forEach(b => {
      const on = b.dataset.page === this.page;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    this._needRender = false;
  },

  onRemoteChange() {
    this.applySchedules();
    if (this.isEditingMain()) this._needRender = true;
    else this.render();
    this.refreshModals();
  },
  refreshModals() { Modal.stack.forEach(m => { if (m.refresh) m.refresh(); }); },
  applySchedules() {
    if (!Store.firstPullDone) return 0;
    return Students.applyDue();
  },
  isEditingMain() {
    const a = document.activeElement;
    return !!(a && $('#main').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  },
  flushRender() { if (this._needRender && !this.isEditingMain()) this.render(); },
  refreshSchools() {},

  /* ---------- 동기화 표시 ---------- */
  setSync(text) { const el = $('#sync-bar'); if (el) el.textContent = text; },
  updateSyncBar() {
    const n = Store.pendingCount();
    this.setSync(n ? `● 저장 대기 ${n}` : (Store.lastSyncAt ? '✓ ' + new Date(Store.lastSyncAt).toTimeString().slice(0, 5) : ''));
  },

  // 모바일: 예약된 휴원·퇴원·복귀 적용만 (나머지 자동 정리는 PC에서)
  afterFirstPull() {
    const n = this.applySchedules();
    if (n) { this.render(); this.refreshModals(); }
    Makeups.retSync();                // 결석 후 첫 등원 할일 만들기 · 정리 (PC와 같은 id라 중복 없음)
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
        $('#pin-input').blur();
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
    const cur = this.pages[this.page];
    if (cur && cur.onLeave) cur.onLeave();
    Modal.closeAll();
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
  // 하단 탭
  $('#m-tabs').innerHTML = M_TABS.map(([k, t]) => `<button type="button" data-page="${k}">${M_ICON[k]}<span>${t}</span></button>`).join('');
  $('#m-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    if (b.dataset.page === App.page) { $('#main').scrollTop = 0; return; }   // 같은 탭을 다시 누르면 맨 위로
    App.go(b.dataset.page, {});
  });

  // 위쪽: 동기화 표시(누르면 지금 동기화) / 메뉴
  $('#sync-bar').addEventListener('click', () => { if (Auth.key()) Store.syncNow(); });
  $('#m-menu').addEventListener('click', (e) => {
    popMenu(e.currentTarget, [
      { text: '지금 동기화', onClick: () => { if (Auth.key()) Store.syncNow(); } },
      { text: '로그아웃', danger: true, onClick: () => App.logout() },
    ]);
  });

  // 입력이 끝나면 미뤄 둔 화면 갱신
  $('#main').addEventListener('focusout', () => setTimeout(() => App.flushRender(), 0));

  // PIN: 6자리 자동 로그인 / Enter
  const pinEl = $('#pin-input');
  pinEl.addEventListener('input', (e) => { if (e.target.value.length === CFG.PIN_LEN) App.doLogin(); });
  pinEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') App.doLogin(); });
  $('#login-btn').addEventListener('click', () => App.doLogin());

  // 저장된 키가 있으면 자동 로그인
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

  // 화면 크기가 바뀌면(가로·세로 전환 등) 시간표 높이를 다시 맞춤
  let _vw = window.innerWidth, _vh = window.innerHeight;
  window.addEventListener('resize', debounce(() => {
    const w = window.innerWidth, h = window.innerHeight;
    if (w === _vw && Math.abs(h - _vh) < 80) return;          // 주소창이 접히는 정도는 무시
    _vw = w; _vh = h;
    if (App.page === 'timetable' && !Modal.stack.length && Auth.key()) App.render();
  }, 200));

  // 화면을 닫거나 다른 앱으로 넘어가기 전 저장 대기분을 로컬에 기록
  window.addEventListener('beforeunload', () => { Store.persist(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.persist(); });

  // 날짜가 바뀌면 '오늘' 갱신 + 예약 적용
  let _today = todayStr();
  setInterval(() => {
    const t = todayStr();
    if (t === _today) return;
    if (App.selDate === _today) App.selDate = t;
    if (MEvents.sel === _today) { MEvents.sel = t; MEvents.month = t.slice(0, 7); }
    if (MTodos.sel === _today) { MTodos.sel = t; MTodos.month = t.slice(0, 7); }
    MTimetable.dow = undefined;   // 날짜가 바뀌면 시간표는 다시 오늘 기준으로 (평일=오늘, 주말=빈 화면)
    _today = t;
    if (!Auth.key()) return;
    App.applySchedules();
    App.render();
    App.refreshModals();
    Makeups.retSync();                // 결석 후 첫 등원 할일 만들기 · 정리
  }, 60000);
})();
