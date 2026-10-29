/* =========================================================
   calendar.js — 미니 달력 / 큰 달력 / 날짜 상세 / 일정(직전·주말보강)
   ========================================================= */
const EVENT_TYPES = {
  pre: { label: '직전보강', dot: 'dot-pre' },
  weekend: { label: '주말보강', dot: 'dot-weekend' },
  etc: { label: '기타 일정', dot: 'dot-etc' },
};
const EXAM_KIND = { mid: '중간', final: '기말' };

function examTitle(ex) {
  return schoolGradeLabel(ex.school, ex.grade).replace(/^학교미정 /, '') + ' ' + (EXAM_KIND[ex.kind] || '') + '고사';
}
function eventTarget(ev) {
  if (ev.school) return schoolShort(ev.school) + (ev.grade ? gradeNum(ev.grade) : '');
  return ev.grade ? gradeLabel(ev.grade) : '';
}
function eventTitle(ev) {
  const t = EVENT_TYPES[ev.type] || EVENT_TYPES.etc;
  const tg = eventTarget(ev);
  return t.label + (tg ? ' ' + tg : '') + (ev.title ? ' · ' + ev.title : '');
}
function eventTime(ev) { return ev.start ? ev.start + (ev.end ? '~' + ev.end : '') : ''; }

// 시험이 걸친 날짜들 (최대 31일)
function examDates(ex) {
  if (!isYmd(ex.start)) return [];
  const end = isYmd(ex.end) && ex.end >= ex.start ? ex.end : ex.start;
  const out = [];
  let d = ex.start;
  for (let i = 0; i < 31 && d <= end; i++) { out.push(d); d = addDaysStr(d, 1); }
  return out;
}

/* 날짜별 일정 색인: { 'YYYY-MM-DD': { exam:[], pre:[], weekend:[], etc:[] } } */
const CalIndex = {
  build() {
    const idx = {};
    const slot = (d) => (idx[d] = idx[d] || { exam: [], pre: [], weekend: [], etc: [] });
    Store.all('exams').forEach(ex => examDates(ex).forEach(d => slot(d).exam.push(ex)));
    Store.all('events').forEach(ev => {
      if (!isYmd(ev.date)) return;
      const k = EVENT_TYPES[ev.type] ? ev.type : 'etc';
      slot(ev.date)[k].push(ev);
    });
    Object.values(idx).forEach(o => {
      ['pre', 'weekend', 'etc'].forEach(k => o[k].sort((a, b) => ko(a.start, b.start)));
      o.exam.sort((a, b) => ko(examTitle(a), examTitle(b)));
    });
    return idx;
  },
};

/* ---------- 미니 달력 (좌상단) ---------- */
const MiniCal = {
  month: null,
  bound: false,
  render() {
    const el = $('#mini-cal');
    if (!this.month) { const d = parseYmd(App.selDate); this.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    const y = this.month.getFullYear(), m = this.month.getMonth();
    const today0 = todayStr();
    const tdIdx = {};
    Store.all('todos').forEach(t => {
      if (t.done || !isYmd(t.date)) return;
      const o = tdIdx[t.date] = tdIdx[t.date] || { late: false, todo: false };
      if (t.date < today0) o.late = true; else o.todo = true;
    });
    const first = new Date(y, m, 1);
    const start = addDays(first, -first.getDay());
    const last = new Date(y, m + 1, 0);
    const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
    const today = todayStr();
    let h = `<div class="mc-head">
      <button class="mc-nav" data-mc="prev" aria-label="이전 달">‹</button>
      <div class="mc-title">${y}년 ${m + 1}월</div>
      <button class="mc-today" data-mc="today">오늘</button>
      <button class="mc-nav" data-mc="next" aria-label="다음 달">›</button>
    </div><div class="mc-grid">`;
    DOW.forEach((w, i) => { h += `<div class="mc-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`; });
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i), k = ymd(d), o = tdIdx[k];
      const cls = ['mc-day'];
      if (d.getMonth() !== m) cls.push('other');
      if (d.getDay() === 0) cls.push('sun');
      if (d.getDay() === 6) cls.push('sat');
      if (k === today) cls.push('today');
      if (k === App.selDate) cls.push('sel');
      let dots = '';
      if (o) {
        if (o.late) dots += '<i class="dot-late"></i>';
        if (o.todo) dots += '<i class="dot-todo"></i>';
      }
      h += `<button class="${cls.join(' ')}" data-date="${k}"><span class="n">${d.getDate()}</span><span class="mc-dots">${dots}</span></button>`;
    }
    h += `</div><div class="mc-legend"><span><i class="dot-todo"></i>할일</span><span><i class="dot-late"></i>밀린 할일</span></div>`;
    el.innerHTML = h;
    if (!this.bound) {
      this.bound = true;
      el.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-mc]');
        if (nav) {
          const a = nav.dataset.mc;
          if (a === 'prev') this.month = new Date(this.month.getFullYear(), this.month.getMonth() - 1, 1);
          else if (a === 'next') this.month = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 1);
          else { const t = new Date(); this.month = new Date(t.getFullYear(), t.getMonth(), 1); App.pickDate(todayStr()); return; }
          this.render();
          return;
        }
        const day = e.target.closest('[data-date]');
        if (day) App.pickDate(day.dataset.date);
      });
    }
  },
  showMonthOf(dateStr) { const d = parseYmd(dateStr); this.month = new Date(d.getFullYear(), d.getMonth(), 1); },
};

/* ---------- 큰 달력 ---------- */
const BigCal = {
  filters: { exam: true, pre: true, weekend: true, etc: true },
  render(main, p) {
    const base = p.month ? parseYmd(p.month + '-01') : parseYmd(App.selDate);
    const y = base.getFullYear(), m = base.getMonth();
    const mKey = y + '-' + pad(m + 1);
    const idx = CalIndex.build();
    const first = new Date(y, m, 1);
    const start = addDays(first, -first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
    const today = todayStr();
    const f = this.filters;
    let h = `<div class="page-head">
      <h1>${y}년 ${m + 1}월</h1>
      <button class="btn sm" data-a="prev">‹ 이전 달</button>
      <button class="btn sm" data-a="this">이번 달</button>
      <button class="btn sm" data-a="next">다음 달 ›</button>
      <span class="grow"></span>
      <label class="chk"><input type="checkbox" data-f="exam" ${f.exam ? 'checked' : ''}>시험</label>
      <label class="chk"><input type="checkbox" data-f="pre" ${f.pre ? 'checked' : ''}>직전보강</label>
      <label class="chk"><input type="checkbox" data-f="weekend" ${f.weekend ? 'checked' : ''}>주말보강</label>
      <label class="chk"><input type="checkbox" data-f="etc" ${f.etc ? 'checked' : ''}>기타</label>
      <button class="btn primary" data-a="add">+ 일정 추가</button>
    </div><div class="bc">`;
    DOW.forEach((w, i) => { h += `<div class="bc-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`; });
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i), k = ymd(d), o = idx[k];
      const cls = ['bc-cell'];
      if (d.getMonth() !== m) cls.push('other');
      if (d.getDay() === 0) cls.push('sun');
      if (d.getDay() === 6) cls.push('sat');
      if (k === today) cls.push('today');
      let items = '';
      if (o) {
        if (f.exam) o.exam.forEach(ex => { items += `<span class="bc-item exam" data-exam="${ex.id}" title="${esc(examTitle(ex))}">${esc(examTitle(ex))}</span>`; });
        ['pre', 'weekend', 'etc'].forEach(t => {
          if (!f[t]) return;
          o[t].forEach(ev => {
            const txt = (ev.start ? ev.start + ' ' : '') + eventTitle(ev);
            items += `<span class="bc-item ${t}" data-ev="${ev.id}" title="${esc(txt)}">${esc(txt)}</span>`;
          });
        });
      }
      h += `<div class="${cls.join(' ')}" data-date="${k}"><span class="n">${d.getDate()}</span>${items}</div>`;
    }
    h += '</div>';
    main.innerHTML = h;
    main.onclick = (e) => {
      const a = e.target.closest('[data-a]');
      if (a) {
        const act = a.dataset.a;
        if (act === 'add') { EventModal.open(null, { date: App.selDate }); return; }
        let nm;
        if (act === 'prev') nm = new Date(y, m - 1, 1);
        else if (act === 'next') nm = new Date(y, m + 1, 1);
        else nm = new Date();
        App.go('calendar', { month: nm.getFullYear() + '-' + pad(nm.getMonth() + 1) });
        return;
      }
      const ex = e.target.closest('[data-exam]');
      if (ex) { Exams.openModal(ex.dataset.exam); return; }
      const ev = e.target.closest('[data-ev]');
      if (ev) { EventModal.open(ev.dataset.ev); return; }
      const cell = e.target.closest('[data-date]');
      if (cell) { App.selDate = cell.dataset.date; MiniCal.showMonthOf(cell.dataset.date); App.go('day', { date: cell.dataset.date }); }
    };
    main.onchange = (e) => {
      const fi = e.target.closest('[data-f]');
      if (fi) { this.filters[fi.dataset.f] = fi.checked; App.go('calendar', { month: mKey }); }
    };
  },
};

/* ---------- 날짜 요약 (오늘 / 달력에서 고른 날짜) ---------- */
const DayPage = {
  render(main, p) {
    const today = todayStr();
    const date = isYmd(p.date) ? p.date : App.selDate;
    const isToday = date === today;
    const idx = CalIndex.build();
    const o = idx[date] || { exam: [], pre: [], weekend: [], etc: [] };
    const evs = [...o.pre, ...o.weekend, ...o.etc].sort((a, b) => ko(a.start, b.start));
    const classes = Lessons.classesOn(date);
    const counsels = Store.where('counsels', c => c.date === date);
    const todos = Store.where('todos', t => t.date === date).sort(Todos.sortFn);
    const late = isToday ? Store.where('todos', t => !t.done && isYmd(t.date) && t.date < today).sort((a, b) => ko(a.date, b.date) || Todos.sortFn(a, b)) : [];
    const mks = Store.where('makeups', m => m.status === 'plan' && m.date && (isToday ? m.date <= date : m.date === date)).sort((a, b) => ko(a.date, b.date) || ko(a.time, b.time));
    const pending = isToday ? Promo.pendingStudents() : [];
    const upcoming = [];
    for (let i = 1; i <= 14; i++) {
      const d = addDaysStr(date, i), x = idx[d];
      if (!x) continue;
      x.exam.forEach(ex => { if (ex.start === d) upcoming.push({ d, kind: 'exam', item: ex }); });
      [...x.pre, ...x.weekend, ...x.etc].forEach(ev => upcoming.push({ d, kind: 'ev', item: ev }));
    }

    let h = `<div class="page-head"><h1>${isToday ? '오늘' : fmtDate(date)}</h1>${isToday ? `<span class="sub">${fmtDate(date)}</span>` : ''}
      <button class="btn sm" data-a="prev">‹ 전날</button><button class="btn sm" data-a="next">다음날 ›</button>
      ${isToday ? '' : '<button class="btn sm" data-a="today">오늘</button>'}
      <button class="btn primary" data-a="add">+ 일정 추가</button></div>`;
    if (pending.length) h += `<div class="panel notice" style="margin-bottom:14px"><b>학교 입력이 필요한 학생 ${pending.length}명</b> <span class="small soft">진급으로 학교미정이 된 학생입니다.</span> <button class="btn sm" data-a="school">학교 입력</button></div>`;
    h += `<div class="grid-2"><div>
      <div class="panel todo-panel"><h2>할일 <span class="sub">${todos.filter(t => !t.done).length}개 남음</span></h2>
      ${todos.length ? `<div data-todolist>${Todos.rowsHtml(todos, { drag: true })}</div><p class="small muted" style="margin:6px 0 0">끌어서 순서를 바꿀 수 있습니다.</p>` : '<div class="empty">이 날 할일이 없습니다.</div>'}</div>
      ${late.length ? `<div class="panel todo-panel late"><h2>밀린 할일 <span class="sub">${late.length}개</span></h2>${Todos.rowsHtml(late, { showDate: true })}</div>` : ''}
      <div class="panel"><h2>수업 <span class="sub">${DOW[dowOf(date)]}요일</span></h2>`;
    h += classes.length ? '<div class="list">' + classes.map(c => {
      const les = Store.get('lessons', Lessons.lessonId(c.id, date));
      const roster = Classes.rosterAt(c.id, date);
      const checked = les ? roster.filter(s => les.att && les.att[s.id]).length : 0;
      const absent = les ? roster.filter(s => les.att && les.att[s.id] === 'A').length : 0;
      return `<div class="list-item click" data-class="${c.id}"><span class="when">${esc(c.start)}~${esc(Classes.endTime(c))}</span>
        <div class="what"><b>${esc(c.name)}</b> <span class="muted small">${roster.length}명</span>
        ${les ? '<span class="badge green">일지 저장</span>' : '<span class="badge gray">일지 전</span>'}
        ${les && checked ? `<span class="badge">출석 ${checked}/${roster.length}</span>` : ''}${absent ? ` <span class="badge red">결석 ${absent}</span>` : ''}</div></div>`;
    }).join('') + '</div>' : '<div class="empty">이 요일에 정규 수업이 없습니다.</div>';
    h += `</div><div class="panel"><h2>보강 예정</h2>`;
    h += mks.length ? '<div class="list">' + mks.map(m => {
      const s = Store.get('students', m.studentId), c = Store.get('classes', m.classId);
      return `<div class="list-item click" data-mk="${esc(s ? s.name : '')}"><span class="when">${m.date === today ? '오늘' : fmtMD(m.date)} ${esc(m.time || '')}</span>
        <div class="what"><b>${esc(s ? s.name : '(삭제된 학생)')}</b> <span class="small soft">${esc(c ? c.name : '')} · ${fmtMD(m.absentDate)} 결석분</span></div></div>`;
    }).join('') + '</div>' : '<div class="empty">예정된 보강이 없습니다.</div>';
    h += `</div></div><div><div class="panel"><h2>시험</h2>`;
    h += o.exam.length ? '<div class="list">' + o.exam.map(ex => `
        <div class="list-item click" data-exam="${ex.id}"><span class="when"><span class="badge red">시험</span></span>
        <div class="what"><b>${esc(examTitle(ex))}</b> <span class="muted small">${esc(ex.year)}년 ${esc(ex.semester)}학기 · ${fmtMD(ex.start)}${ex.end && ex.end !== ex.start ? ' ~ ' + fmtMD(ex.end) : ''}</span>
        ${ex.range ? `<div class="pre small soft">${esc(ex.range)}</div>` : ''}</div></div>`).join('') + '</div>'
      : '<div class="empty">이 날 시험이 없습니다.</div>';
    h += `</div><div class="panel"><h2>일정</h2>`;
    h += evs.length ? '<div class="list">' + evs.map(ev => `
        <div class="list-item click" data-ev="${ev.id}"><span class="when">${esc(eventTime(ev)) || '시간 미정'}</span>
        <div class="what"><b>${esc(eventTitle(ev))}</b>${ev.memo ? `<div class="pre small soft">${esc(ev.memo)}</div>` : ''}</div></div>`).join('') + '</div>'
      : '<div class="empty">이 날 일정이 없습니다.</div>';
    h += `</div><div class="panel"><h2>상담</h2>`;
    h += counsels.length ? '<div class="list">' + counsels.map(c => {
      const s = Store.get('students', c.studentId);
      return `<div class="list-item click" data-counsel="${c.id}"><span class="when">${esc(s ? s.name : '(삭제된 학생)')}</span><div class="what pre small">${esc(c.content)}</div></div>`;
    }).join('') + '</div>' : '<div class="empty">이 날 상담 기록이 없습니다.</div>';
    h += `</div><div class="panel"><h2>다가오는 일정 <span class="sub">2주</span></h2>`;
    h += upcoming.length ? '<div class="list">' + upcoming.map(u => u.kind === 'exam'
      ? `<div class="list-item click" data-exam="${u.item.id}"><span class="when">${fmtMD(u.d)}</span><div class="what"><span class="badge red">시험</span> <b>${esc(examTitle(u.item))}</b>${u.item.end && u.item.end !== u.item.start ? ` <span class="small muted">~${fmtMD(u.item.end)}</span>` : ''}</div></div>`
      : `<div class="list-item click" data-ev="${u.item.id}"><span class="when">${fmtMD(u.d)} ${esc(u.item.start || '')}</span><div class="what"><b>${esc(eventTitle(u.item))}</b></div></div>`).join('') + '</div>'
      : '<div class="empty">2주 안에 시험이나 일정이 없습니다.</div>';
    h += '</div></div></div>';
    main.innerHTML = h;
    const list = $('[data-todolist]', main);
    if (list) Todos.bindDrag(list);
    main.onclick = (e) => {
      const a = e.target.closest('[data-a]');
      if (a) {
        const act = a.dataset.a;
        if (act === 'add') { EventModal.open(null, { date }); return; }
        if (act === 'school') { Promo.openSchoolModal(); return; }
        App.pickDate(act === 'today' ? today : addDaysStr(date, act === 'prev' ? -1 : 1));
        return;
      }
      if (Todos.handleClick(e)) return;
      const ex = e.target.closest('[data-exam]'); if (ex) { Exams.openModal(ex.dataset.exam); return; }
      const ev = e.target.closest('[data-ev]'); if (ev) { EventModal.open(ev.dataset.ev); return; }
      const cl = e.target.closest('[data-class]'); if (cl) { Lessons.open(date, cl.dataset.class); return; }
      const mk = e.target.closest('[data-mk]'); if (mk) { Makeups.q = mk.dataset.mk; Makeups.tab = 'open'; App.go('makeups'); return; }
      const co = e.target.closest('[data-counsel]'); if (co) { Counsels.openModal(co.dataset.counsel); }
    };
    main.onchange = null;
  },
};

/* ---------- 날짜 고르기 모달 (달력) ---------- */
const DatePicker = {
  open(init, title = '날짜 선택') {
    return new Promise(res => {
      let cur = parseYmd(isYmd(init) ? init : todayStr());
      let month = new Date(cur.getFullYear(), cur.getMonth(), 1);
      let picked = null;
      const draw = (box) => {
        const y = month.getFullYear(), m = month.getMonth();
        const first = new Date(y, m, 1), start = addDays(first, -first.getDay());
        const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
        const today = todayStr();
        let h = `<div class="mc-head"><button class="mc-nav" data-dp="prev">‹</button><div class="mc-title">${y}년 ${m + 1}월</div><button class="mc-today" data-dp="today">오늘</button><button class="mc-nav" data-dp="next">›</button></div><div class="mc-grid">`;
        DOW.forEach((w, i) => { h += `<div class="mc-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`; });
        for (let i = 0; i < weeks * 7; i++) {
          const d = addDays(start, i), k = ymd(d);
          const cls = ['mc-day'];
          if (d.getMonth() !== m) cls.push('other');
          if (d.getDay() === 0) cls.push('sun');
          if (d.getDay() === 6) cls.push('sat');
          if (k === today) cls.push('today');
          if (k === init) cls.push('sel');
          h += `<button type="button" class="${cls.join(' ')}" data-pick="${k}"><span class="n">${d.getDate()}</span></button>`;
        }
        box.innerHTML = h + '</div>';
      };
      Modal.open({
        title, size: 'sm', autofocus: false, body: '<div class="dp-box"></div>',
        onMount: (b, m) => {
          const box = $('.dp-box', b);
          draw(box);
          box.addEventListener('click', (e) => {
            const n = e.target.closest('[data-dp]');
            if (n) {
              if (n.dataset.dp === 'today') { picked = todayStr(); m.close(); return; }
              month = new Date(month.getFullYear(), month.getMonth() + (n.dataset.dp === 'prev' ? -1 : 1), 1);
              draw(box); return;
            }
            const d = e.target.closest('[data-pick]');
            if (d) { picked = d.dataset.pick; m.close(); }
          });
        },
        onClose() { res(picked); },
      });
    });
  },
};

/* ---------- 일정 입력 모달 (직전보강 / 주말보강 / 기타) ---------- */
const EventModal = {
  open(id, preset = {}) {
    const ev = id ? Store.get('events', id) : null;
    const v = ev || Object.assign({ type: dowOf(preset.date || App.selDate) % 6 === 0 ? 'weekend' : 'pre', date: App.selDate, start: '', end: '', school: '', grade: '', title: '', memo: '' }, preset);
    const body = `<div class="form">
      <label class="req">종류</label><div class="row">${Object.keys(EVENT_TYPES).map(k => `<label class="chk"><input type="radio" name="type" value="${k}" ${v.type === k ? 'checked' : ''}>${EVENT_TYPES[k].label}</label>`).join('')}</div>
      <label class="req">날짜</label><div class="row"><input type="date" name="date" value="${esc(v.date)}"></div>
      <label class="req">시간</label><div class="row"><input type="time" name="start" step="300" value="${esc(v.start)}"> ~ <input type="time" name="end" step="300" value="${esc(v.end)}"></div>
      <label>학교</label><div class="row"><input type="text" name="school" list="dl-schools" value="${esc(v.school)}" placeholder="예: 금천고" style="flex:1"><select name="grade">${gradeOptions(v.grade, '학년 선택 안 함')}</select></div>
      <label>제목</label><input type="text" name="title" value="${esc(v.title)}" placeholder="선택 (예: 3과 집중)">
      <label class="top">메모</label><textarea name="memo" rows="4">${esc(v.memo)}</textarea>
    </div>`;
    Modal.open({
      title: ev ? '일정 수정' : '일정 추가', body,
      onMount: (b) => enhanceAll(b),
      buttons: [
        ...(ev ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 일정을 삭제할까요?', '삭제', true)) return false;
          Store.del('events', ev.id); toast('일정을 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body;
          const rec = Object.assign({}, ev || { id: uid('EV'), createdAt: new Date().toISOString() }, {
            type: $('[name=type]:checked', b).value,
            date: $('[name=date]', b).value,
            start: $('[name=start]', b).value,
            end: $('[name=end]', b).value,
            school: $('[name=school]', b).value.trim(),
            grade: $('[name=grade]', b).value ? +$('[name=grade]', b).value : '',
            title: $('[name=title]', b).value.trim(),
            memo: stripZws($('[name=memo]', b).value),
          });
          if (!isYmd(rec.date)) { toast('날짜를 선택하세요'); return false; }
          if (!rec.start) { toast('시작 시간을 입력하세요'); return false; }
          if (rec.end && rec.end <= rec.start) { toast('종료 시간이 시작 시간보다 늦어야 합니다'); return false; }
          Store.put('events', rec);
          toast('일정을 저장했습니다');
          App.render();
        } },
      ],
    });
  },
};
