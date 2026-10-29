/* =========================================================
   misc.js — 상담 / 오늘 / 설정 / 진급 처리
   counsel: { studentId, date, content }
   meta(id='meta'): { promotedYear }
   ========================================================= */

/* ---------- 상담 ---------- */
const Counsels = {
  q: '', from: '', to: '',
  render(main) {
    const q = this.q.trim();
    const list = Store.all('counsels').filter(c => {
      if (this.from && c.date < this.from) return false;
      if (this.to && c.date > this.to) return false;
      if (!q) return true;
      const s = Store.get('students', c.studentId);
      return (s && s.name.includes(q)) || String(c.content || '').includes(q);
    }).sort((a, b) => ko(b.date, a.date) || ko(b.createdAt, a.createdAt));
    let h = `<div class="page-head"><h1>상담</h1><span class="grow"></span><button class="btn primary" data-a="add">+ 상담 기록</button></div>
      <div class="toolbar"><input type="search" data-q value="${esc(this.q)}" placeholder="학생 이름이나 상담 내용 검색" style="width:280px">
        <input type="date" data-from value="${esc(this.from)}"> ~ <input type="date" data-to value="${esc(this.to)}">
        ${this.from || this.to || this.q ? '<button class="btn sm ghost" data-a="clear">조건 지우기</button>' : ''}
        <span class="muted small">${list.length}건</span></div>`;
    h += list.length ? '<div class="panel"><div class="list">' + list.map(c => {
      const s = Store.get('students', c.studentId);
      return `<div class="list-item click" data-id="${c.id}"><span class="when">${fmtDate(c.date)}</span>
        <div class="what"><b data-st="${c.studentId}">${s ? highlight(s.name, q) : '(삭제된 학생)'}</b><span class="tag">${esc(stTag(s))}</span>
        <div class="pre small">${highlight(c.content, q)}</div></div></div>`;
    }).join('') + '</div></div>' : `<div class="panel"><div class="empty">${Store.all('counsels').length ? '조건에 맞는 상담이 없습니다.' : '상담 기록이 없습니다.'}</div></div>`;
    main.innerHTML = h;
    main.onclick = (e) => {
      const a = e.target.closest('[data-a]');
      if (a) { if (a.dataset.a === 'add') this.openModal(null); else { this.q = this.from = this.to = ''; App.render(); } return; }
      const it = e.target.closest('[data-id]'); if (it) this.openModal(it.dataset.id);
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-from]')) { this.from = e.target.value; App.render(); }
      if (e.target.matches('[data-to]')) { this.to = e.target.value; App.render(); }
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) { this.q = e.target.value; App.render(); const i = $('[data-q]', main); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    }, 250);
  },

  openModal(id, preset = {}, after) {
    const c = id ? Store.get('counsels', id) : null;
    const v = c || Object.assign({ studentId: '', date: todayStr(), content: '' }, preset);
    const map = studentChoices();
    Modal.open({
      title: c ? '상담 수정' : '상담 기록', size: 'lg',
      body: `<div class="form"><label class="req">학생</label>${studentInputHtml('dl-counsel-st', v.studentId ? labelOfStudent(v.studentId) : '')}
        <label class="req">날짜</label><div class="row"><input type="date" name="date" value="${esc(v.date)}"></div>
        <label class="top req">상담 내용</label><textarea name="content" rows="10">${esc(v.content)}</textarea></div>`,
      onMount: (b) => { bindStudentInput(b, 'dl-counsel-st', map); enhanceAll(b); },
      buttons: [
        ...(c ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 상담 기록을 삭제할까요?', '삭제', true)) return false;
          Store.del('counsels', c.id); toast('삭제했습니다'); App.render(); if (after) after();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const label = $('.st-input', m.body).value.trim();
          const sid = map[label] || (v.studentId && label === labelOfStudent(v.studentId) ? v.studentId : '');
          const date = $('[name=date]', m.body).value;
          const content = stripZws($('[name=content]', m.body).value);
          if (!sid) { toast('목록에서 학생을 선택하세요'); return false; }
          if (!isYmd(date)) { toast('날짜를 선택하세요'); return false; }
          if (!content.trim()) { toast('상담 내용을 입력하세요'); return false; }
          Store.put('counsels', Object.assign({}, c || { id: uid('CO'), createdAt: new Date().toISOString() }, { studentId: sid, date, content }));
          toast('상담 기록을 저장했습니다'); App.render(); if (after) after();
        } },
      ],
    });
  },
};

/* ---------- 오늘 ---------- */
const Today = {
  render(main) {
    const today = todayStr();
    const classes = Lessons.classesOn(today);
    const idx = CalIndex.build();
    const upcoming = [];
    for (let i = 0; i <= 14; i++) {
      const d = addDaysStr(today, i), o = idx[d];
      if (!o) continue;
      o.exam.forEach(ex => { if (ex.start === d || i === 0) upcoming.push({ d, kind: 'exam', item: ex }); });
      [...o.pre, ...o.weekend, ...o.etc].forEach(ev => upcoming.push({ d, kind: 'ev', item: ev }));
    }
    const mks = Store.where('makeups', m => m.status === 'plan' && m.date && m.date <= today).sort((a, b) => ko(a.date, b.date) || ko(a.time, b.time));
    const todos = Store.where('todos', t => !t.done).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt));
    const pending = Promo.pendingStudents();

    let h = `<div class="page-head"><h1>오늘</h1><span class="sub">${fmtDate(today)}</span></div>`;
    if (pending.length) h += `<div class="panel" style="margin-bottom:14px;border-color:#F1D3A1;background:#FFFBF3"><b>학교 입력이 필요한 학생 ${pending.length}명</b> <span class="small soft">진급으로 학교미정이 된 학생입니다.</span> <button class="btn sm" data-a="school">학교 입력</button></div>`;
    h += `<div class="grid-2"><div><div class="panel"><h2>오늘 수업</h2>`;
    h += classes.length ? '<div class="list">' + classes.map(c => {
      const les = Store.get('lessons', Lessons.lessonId(c.id, today));
      const roster = Classes.rosterAt(c.id, today);
      const checked = les ? roster.filter(s => les.att && les.att[s.id]).length : 0;
      const absent = les ? roster.filter(s => les.att && les.att[s.id] === 'A').length : 0;
      return `<div class="list-item click" data-class="${c.id}"><span class="when">${esc(c.start)}~${esc(Classes.endTime(c))}</span>
        <div class="what"><b>${esc(c.name)}</b> <span class="muted small">${roster.length}명</span>
        ${checked ? `<span class="badge green">출석 체크 ${checked}/${roster.length}</span>` : '<span class="badge gray">출석 전</span>'}
        ${absent ? `<span class="badge red">결석 ${absent}</span>` : ''} ${les && les.progress ? '<span class="badge">진도 입력</span>' : ''}</div></div>`;
    }).join('') + '</div>' : '<div class="empty">오늘은 정규 수업이 없습니다.</div>';
    h += `</div><div class="panel"><h2>보강 예정 <span class="sub">오늘까지</span></h2>`;
    h += mks.length ? '<div class="list">' + mks.map(m => {
      const s = Store.get('students', m.studentId), c = Store.get('classes', m.classId);
      return `<div class="list-item click" data-mk="${esc(s ? s.name : '')}"><span class="when">${m.date === today ? '오늘' : fmtMD(m.date)} ${esc(m.time || '')}</span>
        <div class="what"><b>${esc(s ? s.name : '(삭제된 학생)')}</b> <span class="small soft">${esc(c ? c.name : '')} · ${fmtMD(m.absentDate)} 결석분</span></div></div>`;
    }).join('') + '</div>' : '<div class="empty">예정된 보강이 없습니다.</div>';
    h += `</div></div><div><div class="panel"><h2>다가오는 일정 <span class="sub">2주</span></h2>`;
    h += upcoming.length ? '<div class="list">' + upcoming.map(u => u.kind === 'exam'
      ? `<div class="list-item click" data-exam="${u.item.id}"><span class="when">${u.d === today ? '오늘' : fmtMD(u.d)}</span><div class="what"><span class="badge red">시험</span> <b>${esc(examTitle(u.item))}</b>${u.item.end && u.item.end !== u.item.start ? ` <span class="small muted">~${fmtMD(u.item.end)}</span>` : ''}</div></div>`
      : `<div class="list-item click" data-ev="${u.item.id}"><span class="when">${u.d === today ? '오늘' : fmtMD(u.d)} ${esc(u.item.start || '')}</span><div class="what"><b>${esc(eventTitle(u.item))}</b></div></div>`).join('') + '</div>'
      : '<div class="empty">2주 안에 시험이나 일정이 없습니다.</div>';
    h += `</div><div class="panel"><h2>미완료 할일 <span class="sub">${todos.length}개</span></h2>`;
    h += todos.length ? todos.map(t => {
      const c = Store.get('classes', t.classId);
      return `<div class="todo-row"><input type="checkbox" data-tdone="${t.id}"><span class="tx">${esc(t.text)}</span><span class="small muted nowrap" data-tgo="${t.id}" style="cursor:pointer">${fmtMD(t.date)} ${esc(c ? c.name : '')}</span></div>`;
    }).join('') : '<div class="empty">남은 할일이 없습니다.</div>';
    h += '</div></div></div>';
    main.innerHTML = h;
    main.onclick = (e) => {
      if (e.target.closest('[data-a=school]')) { Promo.openSchoolModal(); return; }
      const cl = e.target.closest('[data-class]'); if (cl) { App.go('lessons', { date: today, classId: cl.dataset.class }); return; }
      const mk = e.target.closest('[data-mk]'); if (mk) { Makeups.q = mk.dataset.mk; Makeups.tab = 'open'; App.go('makeups'); return; }
      const ex = e.target.closest('[data-exam]'); if (ex) { Exams.openModal(ex.dataset.exam); return; }
      const ev = e.target.closest('[data-ev]'); if (ev) { EventModal.open(ev.dataset.ev); return; }
      const td = e.target.closest('[data-tdone]');
      if (td) { const t = Store.get('todos', td.dataset.tdone); if (t) { Store.put('todos', Object.assign({}, t, { done: true })); toast('완료했습니다'); App.render(); } return; }
      const tg = e.target.closest('[data-tgo]');
      if (tg) {
        const t = Store.get('todos', tg.dataset.tgo); if (!t) return;
        const l = Store.get('lessons', t.lessonId), d = l ? l.date : t.date;
        App.selDate = d; MiniCal.showMonthOf(d); App.go('lessons', { date: d, classId: t.classId });
      }
    };
    main.onchange = null;
  },
};

/* ---------- 설정 ---------- */
const Settings = {
  render(main) {
    const meta = Store.get('meta', 'meta');
    const last = Store.lastSyncAt ? new Date(Store.lastSyncAt).toLocaleString('ko-KR') : '아직 없음';
    const n = (t) => Store.all(t).length;
    main.innerHTML = `<div class="page-head"><h1>설정</h1></div>
      <div class="grid-2"><div class="panel"><h2>동기화</h2>
        <p class="small">마지막 동기화: <b>${esc(last)}</b><br>저장 대기: <b>${Store.pendingCount()}</b>개</p>
        <p class="small muted">다른 기기에서 고친 내용은 이 화면으로 돌아올 때, 그리고 켜 둔 동안 1분마다 확인해서 받아옵니다.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-a="sync">지금 동기화</button><button class="btn" data-a="full">전체 다시 받기</button></div>
      </div><div class="panel"><h2>진급</h2>
        <p class="small">마지막 진급 처리: <b>${meta && meta.promotedYear ? meta.promotedYear + '년' : '-'}</b></p>
        <p class="small muted">매년 1월 1일 이후 처음 접속할 때 전 학년이 한 단계 올라가고, 고3은 졸업 처리됩니다. 초6·중3은 학교미정으로 바뀌고, 3월 4일 이후 첫 평일부터 학교 입력 창이 뜹니다.</p>
        <button class="btn" data-a="school">학교미정 학생 학교 입력 (${Promo.pendingStudents().length}명)</button>
      </div></div>
      <div class="grid-2" style="margin-top:14px"><div class="panel"><h2>데이터</h2>
        <p class="small">학생 ${n('students')}명 · 반 ${n('classes')}개 · 수업일지 ${n('lessons')}건 · 시험정보 ${n('exams')}건 · 상담 ${n('counsels')}건</p>
      </div><div class="panel"><h2>로그인</h2>
        <p class="small muted">이 기기는 로그아웃하기 전까지 로그인이 유지됩니다. PIN을 바꾸면 모든 기기가 로그아웃됩니다.</p>
        <button class="btn danger" data-a="logout">이 기기에서 로그아웃</button></div></div>`;
    main.onclick = async (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'sync') { await Store.syncNow(); toast('동기화했습니다'); App.render(); }
      if (a.dataset.a === 'full') { await Store.syncNow(true); toast('전체 데이터를 다시 받았습니다'); App.render(); }
      if (a.dataset.a === 'school') Promo.openSchoolModal();
      if (a.dataset.a === 'logout') App.logout(false);
    };
    main.onchange = null;
  },
};

/* =========================================================
   진급 처리 (1월 1일) + 학교 입력 알림 (3월 4일 이후 첫 평일)
   ========================================================= */
const Promo = {
  running: false,

  pendingStudents() {
    return Store.where('students', s => s.status !== 'left' && s.schoolPending).sort((a, b) => Students.sortFn(a, b));
  },

  noticeDate(y) {
    let d = new Date(y, 2, 4);
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
    return ymd(d);
  },

  // 첫 동기화가 끝난 뒤(서버 최신 상태 기준) 호출
  check() {
    if (this.running || !Store.firstPullDone) return;
    this.running = true;
    try {
      const Y = new Date().getFullYear();
      const meta = Store.get('meta', 'meta');
      if (!meta) {
        // 처음 사용: 올해는 이미 진급된 것으로 보고 시작
        Store.put('meta', { id: 'meta', promotedYear: Y });
      } else if ((+meta.promotedYear || Y) < Y) {
        this.promote(+meta.promotedYear, Y, meta);
        return;
      }
      this.checkSchoolNotice();
    } finally { this.running = false; }
  },

  promote(fromY, toY, meta) {
    const steps = Math.min(toY - fromY, 12);
    const jan1 = toY + '-01-01';
    let up = 0, grad = 0, pend = 0;
    Store.where('students', s => s.status !== 'left' && +s.grade).forEach(s => {
      let g = +s.grade, school = s.school, pending = !!s.schoolPending, graduated = false;
      for (let i = 0; i < steps; i++) {
        if (g >= 12) { graduated = true; break; }
        g++;
        if (g === 7 || g === 10) { school = ''; pending = true; }
      }
      if (graduated) {
        Classes.closeEnrollments(s.id, jan1);
        Store.put('students', Object.assign({}, s, { status: 'left', leftKind: 'graduate', statusDate: jan1, statusReason: '' }));
        Students.addLog(s.id, 'graduate', jan1, '', {}, 'LG_grad_' + s.id + '_' + toY);
        grad++;
        return;
      }
      if (g === +s.grade) return;
      Store.put('students', Object.assign({}, s, { grade: g, school, schoolPending: pending }));
      Students.addLog(s.id, 'promote', jan1, '', { note: gradeLabel(s.grade) + ' → ' + gradeLabel(g) + (school !== s.school ? ' (학교미정)' : '') }, 'LG_promo_' + s.id + '_' + toY);
      up++;
      if (pending && !s.schoolPending) pend++;
    });
    Store.put('meta', Object.assign({}, meta, { promotedYear: toY }));
    Store.syncNow();
    App.render();
    alertDlg(toY + '년 진급 처리 완료',
      `진급 ${up}명, 졸업 ${grad}명을 처리했습니다.` +
      (pend ? `\n학교미정 ${pend}명은 ${fmtDate(this.noticeDate(toY))}부터 학교 입력 창이 뜹니다.` : '') +
      '\n자세한 내용은 학생별 “상태·이력”에서 볼 수 있습니다.');
  },

  checkSchoolNotice() {
    const today = todayStr();
    if (today < this.noticeDate(new Date().getFullYear())) return;
    if (!this.pendingStudents().length) return;
    if (localStorage.getItem(CFG.LS_SNOOZE) === today) return;
    if (Modal.stack.length) return;
    this.openSchoolModal(true);
  },

  openSchoolModal(isNotice) {
    const list = this.pendingStudents();
    if (!list.length) { toast('학교 입력이 필요한 학생이 없습니다'); return; }
    Modal.open({
      title: '진학 학교 입력', size: 'lg',
      body: `<p class="small soft" style="margin-top:0">진급하면서 학교미정이 된 학생입니다. 아는 학생만 입력하고 저장하면 됩니다.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>이름</th><th>학년</th><th>학교</th></tr></thead><tbody>${list.map(s => `
        <tr><td><b>${esc(s.name)}</b></td><td>${gradeLabel(s.grade)}</td><td><input type="text" list="dl-schools" data-sid="${s.id}" placeholder="학교 이름" style="width:100%"></td></tr>`).join('')}</tbody></table></div>`,
      buttons: [
        { text: isNotice ? '오늘은 그만 보기' : '닫기', onClick() { if (isNotice) localStorage.setItem(CFG.LS_SNOOZE, todayStr()); } },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          let n = 0;
          $$('[data-sid]', m.body).forEach(inp => {
            const v = inp.value.trim(); if (!v) return;
            const s = Store.get('students', inp.dataset.sid); if (!s) return;
            Store.put('students', Object.assign({}, s, { school: v, schoolPending: false }));
            Students.addLog(s.id, 'school', todayStr(), '', { note: v });
            n++;
          });
          if (!n) { toast('입력한 학교가 없습니다'); return false; }
          toast(n + '명의 학교를 저장했습니다'); App.render();
        } },
      ],
    });
  },
};
