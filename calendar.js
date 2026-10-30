/* =========================================================
   calendar.js — 일정(시험 일정·직전 보강·주말 보강·기타) / 미니 달력 / 큰 달력 / 날짜 요약 / 일정 탭
   event: { type:'exam'|'pre'|'weekend'|'etc', date(시작일), endDate(기간일 때 끝날, 아니면 ''),
            start, end(시간, 선택), school, grade, title, memo }
   ※ 시험정보 탭(시험 범위 기록)과 일정의 '시험 일정'(달력 알림)은 서로 별개
   ========================================================= */
const EVENT_TYPES = {
  exam: { label: '시험 일정' },
  pre: { label: '직전 보강' },
  weekend: { label: '주말 보강' },
  etc: { label: '기타 일정' },
};
const EXAM_KIND = { mid: '중간', final: '기말' };
const NEED_TIME = { pre: true, weekend: true };   // 보강은 시간 필수

// 시험정보(시험 범위 기록) 표시용
function examTitle(ex) {
  return schoolGradeLabel(ex.school, ex.grade).replace(/^학교미정 /, '') + ' ' + (EXAM_KIND[ex.kind] || '') + '고사';
}
function evType(ev) { return EVENT_TYPES[ev.type] ? ev.type : 'etc'; }
function eventTarget(ev) {
  if (ev.school) return schoolShort(ev.school) + (ev.grade ? gradeNum(ev.grade) : '');
  return ev.grade ? gradeLabel(ev.grade) : '';
}
function eventTitle(ev) {
  const tg = eventTarget(ev);
  return EVENT_TYPES[evType(ev)].label + (tg ? ' ' + tg : '') + (ev.title ? ' · ' + ev.title : '');
}
// 달력 띠·칸에 쓰는 짧은 이름: "금천고1 기말" / "주말 보강 금천고1"
function eventShort(ev) {
  const tg = eventTarget(ev);
  if (evType(ev) === 'exam') return (tg ? tg + ' ' : '') + (ev.title || '시험');
  return EVENT_TYPES[evType(ev)].label + (tg ? ' ' + tg : '') + (ev.title ? ' · ' + ev.title : '');
}
function eventTime(ev) { return ev.start ? ev.start + (ev.end ? '~' + ev.end : '') : ''; }
function evEnd(ev) { return isYmd(ev.endDate) && ev.endDate > ev.date ? ev.endDate : ev.date; }
function isRange(ev) { return evEnd(ev) !== ev.date; }
function eventDates(ev) {
  if (!isYmd(ev.date)) return [];
  const end = evEnd(ev), out = [];
  let d = ev.date;
  for (let i = 0; i < 62 && d <= end; i++) { out.push(d); d = addDaysStr(d, 1); }
  return out;
}
function eventRangeLabel(ev) { return isRange(ev) ? fmtMD(ev.date) + ' ~ ' + fmtMD(evEnd(ev)) : fmtMD(ev.date); }

// 기간 띠 색: 같은 학교·학년의 같은 종류(·제목)는 같은 색
const BAR_COLORS = ['#DC5359', '#2B7FC1', '#2A9468', '#8A6CCB', '#D68A1C', '#1F98A6', '#C2537C', '#5C7F2C', '#3E5FBF', '#A0662B'];
function barColor(ev) {
  const key = evType(ev) + '|' + (ev.school || '') + '|' + (ev.grade || '') + '|' + (ev.title || '') + (evType(ev) === 'exam' ? '' : '|' + ev.id);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return BAR_COLORS[h % BAR_COLORS.length];
}

/* 날짜별 일정 색인: { 'YYYY-MM-DD': { exam:[], pre:[], weekend:[], etc:[] } } */
const CalIndex = {
  build() {
    const idx = {};
    const slot = (d) => (idx[d] = idx[d] || { exam: [], pre: [], weekend: [], etc: [] });
    Store.all('events').forEach(ev => eventDates(ev).forEach(d => slot(d)[evType(ev)].push(ev)));
    Object.values(idx).forEach(o => Object.keys(o).forEach(k => o[k].sort((a, b) => ko(a.start, b.start) || ko(eventShort(a), eventShort(b)))));
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
      <button class="mc-today" data-mc="today">오늘</button><button class="mc-today" data-mc="big">큰 달력</button>
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
          if (a === 'big') { App.go('calendar', { month: this.month.getFullYear() + '-' + pad(this.month.getMonth() + 1) }); return; }
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
  LS_H: 'mg77_bigcal_h',
  render(main, p) {
    const base = p.month ? parseYmd(p.month + '-01') : parseYmd(App.selDate);
    const y = base.getFullYear(), m = base.getMonth();
    const mKey = y + '-' + pad(m + 1);
    const first = new Date(y, m, 1);
    const start = addDays(first, -first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
    const today = todayStr();
    const f = this.filters;
    const evs = Store.all('events').filter(ev => isYmd(ev.date) && f[evType(ev)]);
    const ranges = evs.filter(isRange).sort((a, b) => ko(a.date, b.date) || ko(evEnd(b), evEnd(a)));
    const singles = evs.filter(ev => !isRange(ev));

    let h = `<div class="page-head">
      <h1>${y}년 ${m + 1}월</h1>
      <button class="btn sm" data-a="prev">‹ 이전 달</button>
      <button class="btn sm" data-a="this">이번 달</button>
      <button class="btn sm" data-a="next">다음 달 ›</button>
      <button class="btn primary" data-a="add">+ 일정 추가</button>
      <span class="grow"></span>
      ${Object.keys(EVENT_TYPES).map(k => `<label class="chk"><input type="checkbox" data-f="${k}" ${f[k] ? 'checked' : ''}>${EVENT_TYPES[k].label}</label>`).join('')}
    </div><div class="bc2"><div class="bc2-wds">${DOW.map((w, i) => `<div class="bc-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}</div>`;

    for (let w = 0; w < weeks; w++) {
      const wd = Array.from({ length: 7 }, (_, i) => ymd(addDays(start, w * 7 + i)));
      const ws = wd[0], we = wd[6];
      // 이 주에 걸치는 기간 일정 → 줄(lane) 배정
      const lanes = [];
      const segs = [];
      ranges.forEach(ev => {
        const s = ev.date, e = evEnd(ev);
        if (e < ws || s > we) return;
        const c0 = s < ws ? 0 : wd.indexOf(s), c1 = e > we ? 6 : wd.indexOf(e);
        let ln = lanes.findIndex(end => end < c0);
        if (ln < 0) { ln = lanes.length; lanes.push(-1); }
        lanes[ln] = c1;
        segs.push({ ev, c0, c1, ln, contL: s < ws, contR: e > we });
      });
      h += `<div class="bc2-week" style="--lanes:${lanes.length}">`;
      wd.forEach((k, i) => {
        const d = parseYmd(k);
        const cls = ['bc2-cell'];
        if (d.getMonth() !== m) cls.push('other');
        if (i === 0) cls.push('sun');
        if (i === 6) cls.push('sat');
        if (k === today) cls.push('today');
        const items = singles.filter(ev => ev.date === k).sort((a, b) => ko(a.start, b.start)).map(ev => {
          const txt = (ev.start ? ev.start + ' ' : '') + eventShort(ev);
          return `<span class="bc-item ${evType(ev)}" data-ev="${ev.id}" title="${esc(txt)}">${esc(txt)}</span>`;
        }).join('');
        h += `<div class="${cls.join(' ')}" data-date="${k}"><span class="n">${d.getDate()}</span><div class="bc2-items">${items}</div></div>`;
      });
      segs.forEach(sg => {
        const col = barColor(sg.ev);
        const label = (sg.contL ? '→ ' : '') + eventShort(sg.ev) + (sg.ev.start && !sg.contL ? ' ' + sg.ev.start : '') + (sg.contR ? '  →' : '');
        h += `<div class="bc2-bar ${sg.contL ? 'cont-l' : ''} ${sg.contR ? 'cont-r' : 'tip'}" data-ev="${sg.ev.id}"
          style="left:calc(${sg.c0 / 7 * 100}% + 3px);width:calc(${(sg.c1 - sg.c0 + 1) / 7 * 100}% - 6px);top:calc(var(--bar-top) + ${sg.ln} * var(--bar-h));background:${col}"
          title="${esc(eventShort(sg.ev) + ' (' + eventRangeLabel(sg.ev) + ')')}">${esc(label)}</div>`;
      });
      h += '</div>';
    }
    h += `</div><div class="bc2-resize" title="끌어서 달력 높이 조절"><span></span></div>`;
    main.innerHTML = h;

    // 높이: 저장된 값 → 없으면 화면에 꽉 차게
    const box = $('.bc2', main);
    const minH = weeks * 90;
    let saved = +localStorage.getItem(this.LS_H) || 0;
    const fit = Math.max(minH, window.innerHeight - box.getBoundingClientRect().top - 46);
    box.style.setProperty('--wh', Math.max(minH, saved || fit) / weeks + 'px');
    const grip = $('.bc2-resize', main);
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const y0 = e.clientY, h0 = box.getBoundingClientRect().height - $('.bc2-wds', box).offsetHeight;
      document.body.classList.add('resizing');
      const mv = (ev) => {
        const nh = Math.max(minH, h0 + ev.clientY - y0);
        box.style.setProperty('--wh', nh / weeks + 'px');
        saved = nh;
        // 아래로 끌면 화면도 따라 내려간다
        if (ev.clientY > window.innerHeight - 30) main.scrollTop += 20;
      };
      const up = () => {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing');
        if (saved) localStorage.setItem(this.LS_H, String(Math.round(saved)));
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    grip.addEventListener('dblclick', () => { localStorage.removeItem(this.LS_H); App.render(); });

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
      const ev = e.target.closest('[data-ev]');
      if (ev) { EventModal.open(ev.dataset.ev); return; }
      const cell = e.target.closest('[data-date]');
      if (cell) App.pickDate(cell.dataset.date);
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
    const todos = Store.where('todos', t => t.date === date).sort(Todos.sortFn);
    const late = isToday ? Store.where('todos', t => !t.done && isYmd(t.date) && t.date < today).sort((a, b) => ko(a.date, b.date) || Todos.sortFn(a, b)) : [];
    const pending = isToday ? Promo.pendingStudents() : [];
    const end14 = addDaysStr(date, 14);
    const upcoming = Store.all('events').filter(ev => isYmd(ev.date) && ev.date > date && ev.date <= end14)
      .sort((a, b) => ko(a.date, b.date) || ko(a.start, b.start));
    const evRow = (ev) => `<div class="list-item click" data-ev="${ev.id}"><span class="when">${isRange(ev) ? esc(eventRangeLabel(ev)) : (esc(eventTime(ev)) || '시간 없음')}</span>
      <div class="what"><b>${esc(eventShort(ev))}</b>${isRange(ev) && ev.start ? ` <span class="small muted">${esc(eventTime(ev))}</span>` : ''}${ev.memo ? `<div class="pre small soft">${esc(ev.memo)}</div>` : ''}</div></div>`;

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
        ${les ? '<span class="badge green">작성 완료</span>' : '<span class="badge gray">일지 작성 전</span>'}
        ${les && checked ? `<span class="badge">출석 ${checked}/${roster.length}</span>` : ''}${absent ? ` <span class="badge red">결석 ${absent}</span>` : ''}</div></div>`;
    }).join('') + '</div>' : '<div class="empty">이 요일에 정규 수업이 없습니다.</div>';
    h += `</div></div><div><div class="panel"><h2>시험 일정</h2>`;
    h += o.exam.length ? '<div class="list">' + o.exam.map(evRow).join('') + '</div>' : '<div class="empty">이 날 시험 일정이 없습니다.</div>';
    h += `</div><div class="panel"><h2>일정</h2>`;
    h += evs.length ? '<div class="list">' + evs.map(evRow).join('') + '</div>' : '<div class="empty">이 날 일정이 없습니다.</div>';
    h += `</div><div class="panel"><h2>다가오는 일정 <span class="sub">2주</span></h2>`;
    h += upcoming.length ? '<div class="list">' + upcoming.map(ev => `<div class="list-item click" data-ev="${ev.id}"><span class="when">${fmtMD(ev.date)} ${esc(ev.start || '')}</span>
        <div class="what">${evType(ev) === 'exam' ? '<span class="badge red">시험</span> ' : ''}<b>${esc(eventShort(ev))}</b>${isRange(ev) ? ` <span class="small muted">~${fmtMD(evEnd(ev))}</span>` : ''}</div></div>`).join('') + '</div>'
      : '<div class="empty">2주 안에 일정이 없습니다.</div>';
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
      const ev = e.target.closest('[data-ev]'); if (ev) { EventModal.open(ev.dataset.ev); return; }
      const cl = e.target.closest('[data-class]'); if (cl) { Lessons.open(date, cl.dataset.class); }
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


/* ---------- 일정 입력 모달 ---------- */
const EventModal = {
  open(id, preset = {}) {
    const ev = id ? Store.get('events', id) : null;
    const d0 = preset.date || App.selDate;
    const v = ev || Object.assign({ type: dowOf(d0) % 6 === 0 ? 'weekend' : 'pre', date: d0, endDate: '', start: '', end: '', school: '', grade: '', title: '', memo: '' }, preset);
    const ranged = isRange(v);
    const body = `<div class="form ev-form">
      <label class="req">종류</label><div class="row">${Object.keys(EVENT_TYPES).map(k => `<label class="chk"><input type="radio" name="type" value="${k}" ${evType(v) === k ? 'checked' : ''}>${EVENT_TYPES[k].label}</label>`).join('')}</div>
      <label class="req">날짜</label><div class="row" style="flex-wrap:nowrap;gap:6px"><input type="date" name="date" value="${esc(v.date)}" style="width:148px">
        <label class="chk"><input type="checkbox" name="ranged" ${ranged ? 'checked' : ''}>기간</label>
        <span data-endwrap ${ranged ? '' : 'class="off"'}>~ <input type="date" name="endDate" value="${esc(ranged ? v.endDate : '')}" ${ranged ? '' : 'disabled'} style="width:148px"></span></div>
      <label data-timelabel>시간</label><div class="row"><input type="time" name="start" step="300" value="${esc(v.start)}"> ~ <input type="time" name="end" step="300" value="${esc(v.end)}"></div>
      <label>학교</label><div class="row"><input type="text" name="school" class="combo-input" autocomplete="off" value="${esc(v.school)}" placeholder="예: 금천고" style="width:180px"><select name="grade">${gradeOptions(v.grade, '학년 선택 안 함')}</select></div>
      <label>제목</label><input type="text" name="title" value="${esc(v.title)}" placeholder="선택 (예: 기말, 3과 집중)">
      <label class="top">메모</label><textarea name="memo" rows="4">${esc(v.memo)}</textarea>
    </div>`;
    Modal.open({
      title: ev ? '일정 수정' : '일정 추가', body,
      onMount: (b) => {
        enhanceAll(b);
        bindCombo($('[name=school]', b), schoolOptions);
        const chk = $('[name=ranged]', b), endIn = $('[name=endDate]', b), wrap = $('[data-endwrap]', b), dIn = $('[name=date]', b);
        const sync = () => {
          endIn.disabled = !chk.checked;
          wrap.classList.toggle('off', !chk.checked);
          if (chk.checked && (!endIn.value || endIn.value <= dIn.value) && isYmd(dIn.value)) endIn.value = addDaysStr(dIn.value, 1);
        };
        chk.addEventListener('change', sync);
        const tl = $('[data-timelabel]', b);
        const typeSync = () => { tl.classList.toggle('req', !!NEED_TIME[$('[name=type]:checked', b).value]); };
        b.addEventListener('change', (e) => { if (e.target.name === 'type') typeSync(); });
        typeSync();
      },
      buttons: [
        ...(ev ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 일정을 삭제할까요?', '삭제', true)) return false;
          Store.del('events', ev.id); toast('일정을 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body;
          const ranged2 = $('[name=ranged]', b).checked;
          const rec = Object.assign({}, ev || { id: uid('EV'), createdAt: new Date().toISOString() }, {
            type: $('[name=type]:checked', b).value,
            date: $('[name=date]', b).value,
            endDate: ranged2 ? $('[name=endDate]', b).value : '',
            start: $('[name=start]', b).value,
            end: $('[name=end]', b).value,
            school: $('[name=school]', b).value.trim(),
            grade: $('[name=grade]', b).value ? +$('[name=grade]', b).value : '',
            title: $('[name=title]', b).value.trim(),
            memo: stripZws($('[name=memo]', b).value),
          });
          if (!isYmd(rec.date)) { toast('날짜를 선택하세요'); return false; }
          if (ranged2) {
            if (!isYmd(rec.endDate)) { toast('끝나는 날짜를 선택하세요'); return false; }
            if (rec.endDate < rec.date) { toast('끝나는 날짜가 시작일보다 빠릅니다'); return false; }
            if (rec.endDate === rec.date) rec.endDate = '';
          }
          if (NEED_TIME[rec.type] && !rec.start) { toast('보강은 시작 시간을 입력하세요'); return false; }
          if (rec.end && !rec.start) { toast('시작 시간을 입력하세요'); return false; }
          if (rec.start && rec.end && rec.end <= rec.start) { toast('종료 시간이 시작 시간보다 늦어야 합니다'); return false; }
          Store.put('events', rec);
          toast('일정을 저장했습니다');
          App.render();
        } },
      ],
    });
  },
};

/* ---------- 일정 탭: 모든 일정을 모아 관리 ---------- */
const EventsPage = {
  type: '', q: '', showPast: false,
  render(main) {
    const today = todayStr();
    const q = this.q.trim();
    const all = Store.all('events').filter(ev => isYmd(ev.date));
    const pastCnt = all.filter(ev => evEnd(ev) < today).length;
    const list = all.filter(ev => (!this.type || evType(ev) === this.type))
      .filter(ev => this.showPast || evEnd(ev) >= today)
      .filter(ev => !q || [ev.school, eventShort(ev), ev.title, ev.memo].some(v => String(v || '').includes(q)))
      .sort((a, b) => {
        const pa = evEnd(a) < today, pb = evEnd(b) < today;
        if (pa !== pb) return pa ? 1 : -1;                 // 다가오는 일정 먼저
        return pa ? ko(b.date, a.date) : ko(a.date, b.date) || ko(a.start, b.start);
      });
    let h = `<div class="page-head"><h1>일정</h1><button class="btn primary" data-a="add">+ 일정 추가</button><span class="sub">시험 일정 · 직전 보강 · 주말 보강 · 기타</span></div>
      <div class="toolbar"><select data-type><option value="">전체 종류</option>${Object.keys(EVENT_TYPES).map(k => `<option value="${k}" ${this.type === k ? 'selected' : ''}>${EVENT_TYPES[k].label}</option>`).join('')}</select>
      <input type="search" data-q value="${esc(this.q)}" placeholder="학교, 제목, 메모 검색" style="width:240px">
      <label class="chk small"><input type="checkbox" data-past ${this.showPast ? 'checked' : ''}>지난 일정 보기 (${pastCnt})</label>
      <span class="muted small">${list.length}건</span></div>`;
    h += list.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>날짜</th><th>시간</th><th>종류</th><th>대상</th><th>제목·메모</th></tr></thead><tbody>${list.map(ev => {
      const past = evEnd(ev) < today;
      const tcls = { exam: 'red', pre: '', weekend: 'green', etc: 'purple' }[evType(ev)];
      return `<tr class="click ${past ? 'past' : ''}" data-ev="${ev.id}"><td class="nowrap"><b>${esc(eventRangeLabel(ev))}</b></td><td class="nowrap">${esc(eventTime(ev)) || '<span class="muted">-</span>'}</td>
        <td class="nowrap"><span class="badge ${tcls}">${EVENT_TYPES[evType(ev)].label}</span></td><td class="nowrap">${highlight(eventTarget(ev), q) || '<span class="muted">-</span>'}</td>
        <td>${ev.title ? `<b>${highlight(ev.title, q)}</b> ` : ''}<span class="small soft">${highlight(firstLine(ev.memo), q)}</span></td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 일정이 없습니다.' : '등록된 일정이 없습니다. “일정 추가”로 시험 일정이나 보강을 등록하세요.'}</div></div>`;
    main.innerHTML = h;
    main.onclick = (e) => {
      if (e.target.closest('[data-a=add]')) { EventModal.open(null, { date: today }); return; }
      const tr = e.target.closest('[data-ev]'); if (tr) EventModal.open(tr.dataset.ev);
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-type]')) { this.type = e.target.value; App.render(); }
      if (e.target.matches('[data-past]')) { this.showPast = e.target.checked; App.render(); }
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) { this.q = e.target.value; App.render(); const i = $('[data-q]', main); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    }, 250);
  },
};
