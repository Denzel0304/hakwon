/* =========================================================
   calendar.js — 일정(시험 일정·직전 보강·영어 시험·기타) / 미니 달력 / 큰 달력 / 날짜 요약 / 일정 탭
   event: { type:'exam'|'pre'|'weekend'|'etc', date(시작일), endDate(기간일 때 끝날, 아니면 ''),
            start, end(시간, 선택), school, grades:[학년…](선택, 여러 개), title, memo,
            year, semester, kind:'mid'|'final' }  ← 시험 일정만 (학교·학년과 함께 필수) — 시험+교재의 시험 기간이 이것으로 자동 연동
   ※ 예전 기록의 grade(학년 하나)도 그대로 읽는다 (evGrades)
   ※ 영어 시험의 저장 키는 예전 이름 'weekend'를 그대로 쓴다 (하루짜리 일정)
   ※ 시험+교재 탭의 시험 기간은 학교·학년·연도·학기·중간/기말이 같은 '시험 일정'에서 자동으로 가져온다 (Exams.syncDates)
   ※ 공휴일: type 'holiday', { date, endDate, title(이름) } — '공휴일 추가' 창(HolidayModal)으로만 입력.
      공휴일에는 수업이 없다고 본다: 출석부는 '휴'(누를 수 없음, 기록이 있으면 그대로) · 수업일지는 작성 대상에서 뺀다
      (미니 달력 '일지 미작성' 없음 · 수업일지/날짜 요약에 안내, '그래도 일지 쓰기' 가능) · 결석 예정 등록 불가. 시간표에는 영향 없음
   ※ 일정+공휴일 탭: 시작일의 연도로 '올해(+내년 이후)' / '이전 해'를 나눠 보여준다 (1월 1일이 되면 저절로 넘어감)
   ※ 월초 공휴일 확인 창(HolidayRemind): 달마다 처음 열 때 띄움. 확인 = 다음에 또 뜸 / 완료 = 그 달은 다시 안 뜸
      (완료 기록 meta: id HR_YYYYMM, { kind:'hol_done', ym, createdAt })
   ========================================================= */
const EVENT_TYPES = {
  exam: { label: '시험 일정' },
  pre: { label: '직전 보강' },
  weekend: { label: '영어 시험' },      // 키는 예전 '주말 보강'의 것을 그대로 사용
  etc: { label: '기타 일정' },
  holiday: { label: '공휴일' },          // 공휴일 추가 창으로만 입력 (일정 추가 창의 종류에는 없음)
};
const EXAM_KIND = { mid: '중간', final: '기말' };
const NEED_TIME = { pre: true };          // 직전 보강만 시간 필수
const ONE_DAY = { weekend: true };        // 영어 시험은 하루짜리 (기간 없음)

// 시험정보(시험 범위 기록) 표시용
function examTitle(ex) {
  return schoolGradeLabel(ex.school, ex.grade).replace(/^학교미정 /, '') + ' ' + (EXAM_KIND[ex.kind] || '') + '고사';
}
// 날짜가 속한 학기 (3~8월 1학기 / 9~12월 2학기 / 1~2월은 지난해 2학기) — 시험 일정의 연도·학기 기본값
function evTerm(d) {
  if (!isYmd(d)) { const n = new Date(); return { year: n.getFullYear(), sem: n.getMonth() >= 6 ? 2 : 1 }; }
  const y = +d.slice(0, 4), m = +d.slice(5, 7);
  return m >= 3 && m <= 8 ? { year: y, sem: 1 } : m >= 9 ? { year: y, sem: 2 } : { year: y - 1, sem: 2 };
}
function evType(ev) { return EVENT_TYPES[ev.type] ? ev.type : 'etc'; }
// 일정의 학년 목록 (예전 기록은 grade 하나)
function evGrades(ev) {
  const gs = Array.isArray(ev.grades) ? ev.grades : (ev.grade ? [ev.grade] : []);
  return [...new Set(gs.map(Number).filter(Boolean))].sort((a, b) => a - b);
}
// 학교가 있으면 "1·2", 없으면 "고1·2" / 학교급이 섞이면 "중3·고1"
function gradesLabel(gs, withLevel) {
  if (!gs.length) return '';
  if (!withLevel) return gs.map(gradeNum).join('·');
  const pre = (g) => gradeLabel(g).slice(0, 1);
  return gs.map((g, i) => (i && pre(g) === pre(gs[i - 1]) ? gradeNum(g) : gradeLabel(g))).join('·');
}
function eventTarget(ev) {
  const gs = evGrades(ev);
  if (ev.school) return schoolShort(ev.school) + gradesLabel(gs, false);
  return gradesLabel(gs, true);
}
function eventTitle(ev) {
  const tg = eventTarget(ev);
  return EVENT_TYPES[evType(ev)].label + (tg ? ' ' + tg : '') + (ev.title ? ' · ' + ev.title : '');
}
// 달력 띠·칸에 쓰는 짧은 이름: "금천고1·2 기말" / "영어 시험 금천고1"
function eventShort(ev) {
  const tg = eventTarget(ev);
  if (evType(ev) === 'holiday') return ev.title || '공휴일';
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
function barKey(ev) { return evType(ev) + '|' + (ev.school || '') + '|' + evGrades(ev).join(',') + '|' + (ev.title || '') + (evType(ev) === 'exam' ? '' : '|' + ev.id); }
// 화면에 보이는 기간 일정들에 색을 차례로 배정 → 서로 다른 일정은 다른 색
function barColorMap(list) {
  const map = {};
  let n = 0;
  list.forEach(ev => { const k = barKey(ev); if (!(k in map)) map[k] = BAR_COLORS[n++ % BAR_COLORS.length]; });
  return map;
}

/* 날짜별 일정 색인: { 'YYYY-MM-DD': { exam:[], pre:[], weekend:[], etc:[] } } */
const CalIndex = {
  build() {
    const idx = {};
    const slot = (d) => (idx[d] = idx[d] || { exam: [], pre: [], weekend: [], etc: [], holiday: [] });
    Store.all('events').forEach(ev => eventDates(ev).forEach(d => slot(d)[evType(ev)].push(ev)));
    Object.values(idx).forEach(o => Object.keys(o).forEach(k => o[k].sort((a, b) => ko(a.start, b.start) || ko(eventShort(a), eventShort(b)))));
    return idx;
  },
};

/* ---------- 공휴일 ---------- */
const Holidays = {
  // 공휴일 날짜 → 이름 { 'YYYY-MM-DD': '추석' } (기간이면 그 안의 날짜 모두)
  map() {
    const m = {};
    Store.all('events').filter(ev => evType(ev) === 'holiday').forEach(ev => eventDates(ev).forEach(d => { m[d] = m[d] ? m[d] + ', ' + eventShort(ev) : eventShort(ev); }));
    return m;
  },
  has(d, map) { return !!(map || this.map())[d]; },
  name(d) { return this.map()[d] || ''; },
  // 그 달(YYYY-MM)에 걸친 공휴일 일정
  ofMonth(ym) {
    return Store.all('events').filter(ev => evType(ev) === 'holiday' && isYmd(ev.date) && ev.date.slice(0, 7) <= ym && evEnd(ev).slice(0, 7) >= ym)
      .sort((a, b) => ko(a.date, b.date));
  },
};

/* ---------- 공휴일 추가·수정 창 ---------- */
const HolidayModal = {
  // onSaved: 저장·삭제 뒤 부를 함수 (월초 확인 창의 목록 갱신용)
  open(id, preset = {}, onSaved) {
    const ev = id ? Store.get('events', id) : null;
    const v = ev || { date: preset.date || App.selDate, endDate: '', title: '' };
    const ranged = isRange(v);
    const body = `<div class="form ev-form">
      <label class="req">날짜</label><div class="row" style="flex-wrap:nowrap;gap:6px"><input type="date" name="date" value="${esc(v.date)}" style="width:148px">
        <label class="chk"><input type="checkbox" name="ranged" ${ranged ? 'checked' : ''}>기간</label>
        <span data-endwrap ${ranged ? '' : 'class="off"'}>~ <input type="date" name="endDate" value="${esc(ranged ? v.endDate : '')}" ${ranged ? '' : 'disabled'} style="width:148px"></span></div>
      <label class="req">이름</label><input type="text" name="title" value="${esc(v.title || '')}" placeholder="예: 추석, 개천절, 학원 휴무" maxlength="30">
      <div></div><div class="hint">이 날은 출석부에 '휴'로 표시되고, 수업일지를 쓰지 않아도 됩니다. (시간표는 그대로)</div>
    </div>`;
    Modal.open({
      title: ev ? '공휴일 수정' : '공휴일 추가', size: 'md', body,
      onMount: (b) => {
        const chk = $('[name=ranged]', b), endIn = $('[name=endDate]', b), wrap = $('[data-endwrap]', b), dIn = $('[name=date]', b);
        chk.addEventListener('change', () => {
          endIn.disabled = !chk.checked;
          wrap.classList.toggle('off', !chk.checked);
          if (chk.checked && (!endIn.value || endIn.value <= dIn.value) && isYmd(dIn.value)) endIn.value = addDaysStr(dIn.value, 1);
        });
        setTimeout(() => $('[name=title]', b).focus(), 30);
      },
      buttons: [
        ...(ev ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 공휴일을 삭제할까요?', '삭제', true)) return false;
          Store.del('events', ev.id);
          toast('공휴일을 삭제했습니다'); App.render();
          if (onSaved) onSaved();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body;
          const ranged2 = $('[name=ranged]', b).checked;
          const rec = Object.assign({}, ev || { id: uid('EV'), createdAt: new Date().toISOString() }, {
            type: 'holiday', date: $('[name=date]', b).value, endDate: ranged2 ? $('[name=endDate]', b).value : '',
            start: '', end: '', school: '', grades: [], title: $('[name=title]', b).value.trim(), memo: (ev && ev.memo) || '',
          });
          if (!isYmd(rec.date)) { toast('날짜를 선택하세요'); return false; }
          if (!rec.title) { toast('공휴일 이름을 입력하세요'); return false; }
          if (ranged2) {
            if (!isYmd(rec.endDate)) { toast('끝나는 날짜를 선택하세요'); return false; }
            if (rec.endDate < rec.date) { toast('끝나는 날짜가 시작일보다 빠릅니다'); return false; }
            if (rec.endDate === rec.date) rec.endDate = '';
          }
          Store.put('events', rec);
          toast('공휴일을 저장했습니다');
          App.render();
          if (onSaved) onSaved();
        } },
      ],
    });
  },
};

/* ---------- 월초 공휴일 확인 창 (PC) ---------- */
const HolidayRemind = {
  shown: '',                   // 이번에 연 동안 이미 띄운 달 (확인을 누르면 다음에 열 때 다시 뜸)
  doneId(ym) { return 'HR_' + ym.replace('-', ''); },
  check() {
    if (!Store.firstPullDone) return;
    const ym = todayStr().slice(0, 7);
    if (this.shown === ym || Store.get('meta', this.doneId(ym))) return;
    this.shown = ym;
    const [Y, M] = ym.split('-').map(Number);
    const listHtml = () => {
      const hs = Holidays.ofMonth(ym);
      return hs.length ? hs.map(ev => `<div class="small">· ${esc(eventRangeLabel(ev))} <b>${esc(eventShort(ev))}</b></div>`).join('')
        : '<div class="small muted">아직 등록된 공휴일이 없습니다.</div>';
    };
    Modal.open({
      title: `${M}월 공휴일 확인`, size: 'sm', autofocus: false,
      body: `<p class="confirm-msg">${Y}년 ${M}월 공휴일·쉬는 날을 입력했는지 확인하세요.</p>
        <div class="small soft" style="margin:8px 0 4px">이번 달에 등록된 공휴일</div><div data-hrlist>${listHtml()}</div>
        <p class="small muted" style="margin:10px 0 0">확인: 다음에 열 때 다시 알려줍니다 · 완료: 이번 달은 다시 띄우지 않습니다</p>`,
      buttons: [
        { text: '공휴일 추가', left: true, onClick: (m) => {
          HolidayModal.open(null, { date: ym + '-01' }, () => { const el = $('[data-hrlist]', m.body); if (el) el.innerHTML = listHtml(); });
          return false;
        } },
        { text: '확인' },
        { text: '완료', cls: 'primary', primary: true, onClick: () => {
          Store.put('meta', { id: this.doneId(ym), kind: 'hol_done', ym, createdAt: new Date().toISOString() });
          toast(`${M}월 공휴일 확인을 완료했습니다`);
        } },
      ],
    });
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
    const first = new Date(y, m, 1);
    const start = addDays(first, -first.getDay());
    const last = new Date(y, m + 1, 0);
    const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
    // 할일 점 (반복 일정 회차 · 상기 포함, todo-ext.js)
    const tdIdx = TodoX.dotIndex(ymd(start), weeks * 7, today0);
    const today = todayStr();
    // 일지 미작성 수업이 있는 날 (오늘까지, 보이는 칸만 계산)
    const actCls = Store.all('classes').filter(c => c.active !== false);
    const noLog = (k) => k <= today && actCls.some(c => Lessons.needsLog(c, k));
    const hol = Holidays.map();                 // 공휴일은 날짜를 빨간색으로
    let h = `<div class="mc-head">
      <button class="mc-nav" data-mc="prev" aria-label="이전 달">‹</button>
      <button type="button" class="mc-title ym-btn" data-ympick title="년·월 이동">${y}년 ${m + 1}월 ▾</button>
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
      if (hol[k]) cls.push('hol');
      let dots = '';
      if (o) {
        if (o.late) dots += '<i class="dot-late"></i>';
        if (o.todo) dots += '<i class="dot-todo"></i>';
      }
      if (noLog(k)) dots += '<i class="dot-nolog"></i>';
      h += `<button class="${cls.join(' ')}" data-date="${k}"${hol[k] ? ` title="${esc(hol[k])}"` : ''}><span class="n">${d.getDate()}</span><span class="mc-dots">${dots}</span></button>`;
    }
    h += `</div><div class="mc-legend"><span><i class="dot-todo"></i>할일</span><span><i class="dot-late"></i>밀린 할일</span><span><i class="dot-nolog"></i>일지 미작성</span></div>`;
    el.innerHTML = h;
    if (!this.bound) {
      this.bound = true;
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-ympick]')) {
          MonthPick.open(this.month.getFullYear(), this.month.getMonth() + 1).then(r => { if (r) { this.month = new Date(r.y, r.m - 1, 1); this.render(); } });
          return;
        }
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
  filters: { exam: true, pre: true, weekend: true, etc: true, holiday: true },
  userH: 0,                        // 끌어서 바꾼 높이 (큰 달력을 떠나면 초기화)
  onLeave() { this.userH = 0; },
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
    const colors = barColorMap(ranges.filter(ev => evEnd(ev) >= ymd(start) && ev.date <= ymd(addDays(start, weeks * 7 - 1))));

    let h = `<div class="page-head">
      <h1><button type="button" class="ym-btn ym-h" data-ympick title="년·월 이동">${y}년 ${m + 1}월 ▾</button></h1>
      <button class="btn sm" data-a="prev">‹ 이전 달</button>
      <button class="btn sm" data-a="this" style="background:var(--accent-soft);border-color:var(--accent-line-2);color:var(--accent-ink)">이번 달</button>
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
        const col = colors[barKey(sg.ev)];
        const label = (sg.contL ? '→ ' : '') + eventShort(sg.ev) + (sg.ev.start && !sg.contL ? ' ' + sg.ev.start : '') + (sg.contR ? '  →' : '');
        h += `<div class="bc2-bar ${sg.contL ? 'cont-l' : 'tl'} ${sg.contR ? 'cont-r' : 'tr'}" data-ev="${sg.ev.id}"
          style="left:calc(${sg.c0 / 7 * 100}% + 3px);width:calc(${(sg.c1 - sg.c0 + 1) / 7 * 100}% - 6px);top:calc(var(--bar-top) + ${sg.ln} * var(--bar-h));background:${col}"
          title="${esc(eventShort(sg.ev) + ' (' + eventRangeLabel(sg.ev) + ')')}">${esc(label)}</div>`;
      });
      h += '</div>';
    }
    h += `</div><div class="bc2-resize" title="끌어서 달력 높이 조절"><span></span></div>`;
    main.innerHTML = h;

    // 높이: 처음에는 달력 끝이 왼쪽 아래 '동기화됨' 칸 윗선에 오도록 맞춤 (스크롤 없음)
    const box = $('.bc2', main);
    const grip = $('.bc2-resize', main);
    const minH = weeks * 70;
    const sb = $('#sync-bar');
    // 왼쪽 메뉴가 화면보다 길어 '동기화됨' 칸이 화면 밖이면 화면 아래에서 그 칸 높이만큼 띄움
    const bottom = Math.min(sb.getBoundingClientRect().top, window.innerHeight - sb.offsetHeight);
    const boxTop = box.getBoundingClientRect().top + main.scrollTop;      // 스크롤 맨 위 기준 위치
    const fit = bottom - boxTop - $('.bc2-wds', box).offsetHeight - grip.offsetHeight - 3;
    box.style.setProperty('--wh', Math.max(minH, this.userH || fit) / weeks + 'px');
    let saved = 0;
    grip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const y0 = e.clientY, h0 = box.getBoundingClientRect().height - $('.bc2-wds', box).offsetHeight - 2;
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
        if (saved) this.userH = Math.round(saved);
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    grip.addEventListener('dblclick', () => { this.userH = 0; App.render(); });

    main.onclick = (e) => {
      if (e.target.closest('[data-ympick]')) {
        MonthPick.open(y, m + 1).then(r => { if (r) App.go('calendar', { month: r.y + '-' + pad(r.m) }); });
        return;
      }
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
    const o = idx[date] || { exam: [], pre: [], weekend: [], etc: [], holiday: [] };
    const evs = [...o.holiday, ...o.pre, ...o.weekend, ...o.etc].sort((a, b) => ko(a.start, b.start));
    const classes = Lessons.classesOn(date);
    // 할일 (todo-ext.js: 반복·상기·체크리스트·중요도 포함)
    const tdList = TodoX.listHtml(date);
    const tdLate = isToday ? TodoX.lateHtml(today) : { n: 0, html: '' };
    const pending = isToday ? Promo.pendingStudents() : [];
    const end14 = addDaysStr(date, 14);
    const upcoming = Store.all('events').filter(ev => isYmd(ev.date) && ev.date > date && ev.date <= end14)
      .sort((a, b) => ko(a.date, b.date) || ko(a.start, b.start));
    const evRow = (ev) => `<div class="list-item click" data-ev="${ev.id}"><span class="when">${isRange(ev) ? esc(eventRangeLabel(ev)) : (esc(eventTime(ev)) || '시간 없음')}</span>
      <div class="what"><b>${esc(eventShort(ev))}</b>${isRange(ev) && ev.start ? ` <span class="small muted">${esc(eventTime(ev))}</span>` : ''}${ev.memo ? `<div class="pre small soft">${esc(ev.memo)}</div>` : ''}</div></div>`;

    let h = `<div class="page-head"><h1>${isToday ? '오늘' : fmtDate(date)}</h1>${isToday ? `<span class="sub">${fmtDate(date)}</span>` : ''}
      <button class="btn sm" data-a="prev">‹ 전날</button><button class="btn sm" data-a="next">다음날 ›</button>
      ${isToday ? '' : '<button class="btn sm" data-a="today">오늘</button>'}
      <button class="btn primary" data-a="addtodo">+ 할일 추가</button></div>`;
    if (pending.length) h += `<div class="panel notice" style="margin-bottom:14px"><b>학교 입력이 필요한 학생 ${pending.length}명</b> <span class="small soft">진급으로 학교미정이 된 학생입니다.</span> <button class="btn sm" data-a="school">학교 입력</button></div>`;
    // 카드 배치: 왼쪽 열(수업 → 다가오는 일정 → 시험 일정 → 일정) / 오른쪽 열(할일 → 밀린 할일)
    // 수업·할일은 항상 맨 위에 고정, 일정 카드들은 수업 아래에 붙는다.
    // 두 열은 따로 쌓여서, 한쪽 카드가 길어도 다른 쪽에 빈 공간이 생기지 않는다.
    // 화면이 좁아 한 열이 되면 --o 순서(다가오는 일정 → 시험 일정 → 일정 → 수업 → 할일 → 밀린 할일)로 보인다.
    // 다가오는 일정 · 시험 일정 · 일정은 있을 때만 표시
    const tops = [];
    if (o.exam.length) tops.push(`<div class="panel" style="--o:2"><h2>시험 일정</h2><div class="list">${o.exam.map(evRow).join('')}</div></div>`);
    if (evs.length) tops.push(`<div class="panel" style="--o:3"><h2>일정</h2><div class="list">${evs.map(evRow).join('')}</div></div>`);
    const upHtml = !upcoming.length ? '' : `<div class="panel" style="--o:1"><h2>다가오는 일정 <span class="sub">2주</span></h2><div class="list">${upcoming.map(ev => `<div class="list-item click" data-ev="${ev.id}"><span class="when">${fmtMD(ev.date)} ${esc(ev.start || '')}</span>
        <div class="what">${evType(ev) === 'exam' ? '<span class="badge red">시험</span> ' : ''}<b>${esc(eventShort(ev))}</b>${isRange(ev) ? ` <span class="small muted">~${fmtMD(evEnd(ev))}</span>` : ''}</div></div>`).join('')}</div></div>`;

    const unwritten = classes.filter(c => !Lessons.isSaved(c.id, date) && !Lessons.isSkipped(c.id, date));
    const hol = Holidays.name(date);           // 공휴일: 수업 목록을 흐리게 + 안내 (일지는 눌러서 쓸 수 있음)
    h += `<div class="grid-2 day-cols"><div class="day-col">
      <div class="panel" style="--o:4"><h2>수업 <span class="sub">${DOW[dowOf(date)]}요일</span>${!hol && unwritten.length > 1 ? '<button class="btn sm ghost" data-skipall style="float:right;margin-top:-3px" title="이 날 아직 쓰지 않은 수업 일지를 모두 건너뜁니다">남은 일지 모두 건너뛰기</button>' : ''}</h2>`;
    if (hol && classes.length) h += `<div class="hol-note">공휴일(${esc(hol)})입니다. 수업이 없어 일지를 쓰지 않아도 됩니다.</div>`;
    h += classes.length ? `<div class="list${hol ? ' hol-dim' : ''}">` + classes.map(c => {
      const les = Lessons.isSaved(c.id, date) ? Store.get('lessons', Lessons.lessonId(c.id, date)) : null;
      const sk = !les && Lessons.isSkipped(c.id, date);
      const roster = Classes.rosterOn(c.id, date);
      // 출석 = 실제로 온 학생(출석·지각·조퇴), checked = 출결을 입력한 학생
      const checked = les ? roster.filter(s => les.att && les.att[s.id]).length : 0;
      const came = les ? roster.filter(s => les.att && ['P', 'L', 'E'].includes(les.att[s.id])).length : 0;
      const absent = les ? roster.filter(s => les.att && les.att[s.id] === 'A').length : 0;
      return `<div class="list-item click" data-class="${c.id}"><span class="when">${esc(Classes.dayTimeLabel(c, dowOf(date)))}</span>
        <div class="what">${Classes.dot(c)}<b>${esc(c.name)}</b> <span class="muted small">${roster.length}명</span>
        ${les ? '<span class="badge green">작성 완료</span>' : sk ? Lessons.skipBadge(c.id, date) : hol ? '<span class="badge gray">공휴일</span>' : '<span class="badge gray">일지 작성 전</span>'}
        ${les && checked ? `<span class="badge">출석 ${came}/${roster.length}</span>` : ''}${absent ? ` <span class="badge red">결석 ${absent}</span>` : ''}</div>
        ${les || (hol && !sk) ? '' : sk ? `<button class="btn sm ghost" data-unskip="${c.id}" title="건너뛰기 취소">건너뛰기 취소</button>` : `<button class="btn sm ghost" data-skip="${c.id}" title="이 수업은 일지를 쓰지 않음">일지 건너뛰기</button>`}</div>`;
    }).join('') + '</div>' : '<div class="empty">이 요일에 정규 수업이 없습니다.</div>';
    h += `</div>${upHtml}${tops.join('')}</div><div class="day-col">
      <div class="panel todo-panel" style="--o:5"><h2>할일 <span class="sub">${tdList.left}개 남음</span></h2>
      ${tdList.html}</div>
      ${tdLate.n ? `<div class="panel todo-panel late" style="--o:6"><h2>밀린 할일 <span class="sub">${tdLate.n}개</span></h2>${tdLate.html}</div>` : ''}
    </div></div>`;
    main.innerHTML = h;
    TodoX.mount(main);
    main.onclick = (e) => {
      const a = e.target.closest('[data-a]');
      if (a) {
        const act = a.dataset.a;
        if (act === 'add') { EventModal.open(null, { date }); return; }
        if (act === 'addtodo') { TodoX.add(date); return; }
        if (act === 'school') { Promo.openSchoolModal(); return; }
        App.pickDate(act === 'today' ? today : addDaysStr(date, act === 'prev' ? -1 : 1));
        return;
      }
      if (e.target.closest('[data-skipall]')) {
        Lessons.askSkip(Lessons.classesOn(date).filter(c => !Lessons.isSaved(c.id, date) && !Lessons.isSkipped(c.id, date)).map(c => c.id), date);
        return;
      }
      const sk = e.target.closest('[data-skip]'); if (sk) { Lessons.askSkip([sk.dataset.skip], date); return; }
      const us = e.target.closest('[data-unskip]'); if (us) { Lessons.unskip(us.dataset.unskip, date); return; }
      if (TodoX.handleClick(e)) return;
      const ev = e.target.closest('[data-ev]'); if (ev) { EventModal.open(ev.dataset.ev); return; }
      const cl = e.target.closest('[data-class]'); if (cl) { Lessons.open(date, cl.dataset.class); }
    };
    main.onchange = null;
  },
};

/* ---------- 년·월 고르기 (달력 제목 '2026년 11월 ▾'을 누르면) ----------
   MonthPick.open(년, 월 1~12) → Promise<{ y, m } | null>. 연도는 ‹ ›, 월은 버튼 */
const MonthPick = {
  _css: false,
  css() {
    if (this._css) return;
    this._css = true;
    const st = document.createElement('style');
    st.textContent = `
.ym-btn { background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: left; font-family: inherit; }
.ym-btn:hover { text-decoration: underline; text-underline-offset: 3px; }
.ym-h { font-size: inherit; font-weight: inherit; color: inherit; }
.ym-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.ym-head b { font-size: 17px; }
.ym-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.ym-m { padding: 10px 0; border: 1px solid var(--line, #D6E7F4); border-radius: 8px; background: var(--surface, #fff); color: var(--ink, #1E3243); font: inherit; font-size: 14px; cursor: pointer; }
.ym-m:hover { border-color: var(--accent, #2B7FC1); }
.ym-m.today { font-weight: 800; color: var(--accent, #2B7FC1); }
.ym-m.sel { background: var(--accent, #2B7FC1); border-color: var(--accent, #2B7FC1); color: #fff; }`;
    document.head.appendChild(st);
  },
  open(y, m) {
    this.css();
    return new Promise(res => {
      let yy = +y, picked = null;
      const now = new Date(), ty = now.getFullYear(), tm = now.getMonth() + 1;
      const draw = (box) => {
        box.innerHTML = `<div class="ym-head"><button type="button" class="mc-nav" data-yp="-1" aria-label="이전 해">‹</button><b>${yy}년</b><button type="button" class="mc-today" data-yp="0">올해</button><button type="button" class="mc-nav" data-yp="1" aria-label="다음 해">›</button></div>
          <div class="ym-grid">${Array.from({ length: 12 }, (_, i) => i + 1).map(k => `<button type="button" class="ym-m${yy === +y && k === +m ? ' sel' : ''}${yy === ty && k === tm ? ' today' : ''}" data-mp="${k}">${k}월</button>`).join('')}</div>`;
      };
      Modal.open({
        title: '년·월 이동', size: 'sm', autofocus: false, body: '<div class="ym-box"></div>',
        onMount: (b, md) => {
          const box = $('.ym-box', b);
          draw(box);
          box.addEventListener('click', (e) => {
            const n = e.target.closest('[data-yp]');
            if (n) { const v = +n.dataset.yp; yy = v ? yy + v : ty; draw(box); return; }
            const k = e.target.closest('[data-mp]');
            if (k) { picked = { y: yy, m: +k.dataset.mp }; md.close(); }
          });
        },
        onClose() { res(picked); },
      });
    });
  },
};
MonthPick.css();     // 제목 버튼 모양은 처음부터 필요

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
        let h = `<div class="mc-head"><button class="mc-nav" data-dp="prev">‹</button><button type="button" class="mc-title ym-btn" data-ympick title="년·월 이동">${y}년 ${m + 1}월 ▾</button><button class="mc-today" data-dp="today">오늘</button><button class="mc-nav" data-dp="next">›</button></div><div class="mc-grid">`;
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
            if (e.target.closest('[data-ympick]')) {
              MonthPick.open(month.getFullYear(), month.getMonth() + 1).then(r => { if (r) { month = new Date(r.y, r.m - 1, 1); draw(box); } });
              return;
            }
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
    if (ev && evType(ev) === 'holiday') { HolidayModal.open(id); return; }     // 공휴일은 공휴일 창에서 고친다
    const d0 = preset.date || App.selDate;
    const v = ev || Object.assign({ type: '', date: d0, endDate: '', start: '', end: '', school: '', grades: [], title: '', memo: '' }, preset);
    let grades = evGrades(v);          // 고른 학년 (여러 개)
    const ranged = isRange(v);
    const tm = evTerm(v.date);         // 시험 일정의 연도·학기 기본값 (날짜 기준)
    const exY = v.year || tm.year, exS = +v.semester || tm.sem, exK = v.kind || '';
    const body = `<div class="form ev-form">
      <label class="req">종류</label><div class="row">${Object.keys(EVENT_TYPES).filter(k => k !== 'holiday').map(k => `<label class="chk"><input type="radio" name="type" value="${k}" ${v.type && evType(v) === k ? 'checked' : ''}>${EVENT_TYPES[k].label}</label>`).join('')}</div>
      <label class="req">날짜</label><div class="row" style="flex-wrap:nowrap;gap:6px"><input type="date" name="date" value="${esc(v.date)}" style="width:148px">
        <label class="chk" data-rangedwrap><input type="checkbox" name="ranged" ${ranged ? 'checked' : ''}>기간</label>
        <span data-endwrap ${ranged ? '' : 'class="off"'}>~ <input type="date" name="endDate" value="${esc(ranged ? v.endDate : '')}" ${ranged ? '' : 'disabled'} style="width:148px"></span></div>
      <label data-timelabel>시간</label><div class="row"><input type="time" name="start" step="300" value="${esc(v.start)}"> ~ <input type="time" name="end" step="300" value="${esc(v.end)}"></div>
      <label data-schlabel>학교</label><div class="row"><input type="text" name="school" class="combo-input" autocomplete="off" value="${esc(v.school)}" placeholder="예: 금천고" style="width:180px"><button type="button" class="msel" data-gsel></button></div>
      <label class="req" data-exrow>시험</label><div class="row" data-exrow><input type="number" name="exYear" min="2000" max="2100" value="${esc(exY)}" style="width:90px">년
        <select name="exSem"><option value="1" ${exS === 1 ? 'selected' : ''}>1학기</option><option value="2" ${exS === 2 ? 'selected' : ''}>2학기</option></select>
        <select name="exKind"><option value="" ${exK ? '' : 'selected'}>선택 없음</option><option value="mid" ${exK === 'mid' ? 'selected' : ''}>중간고사</option><option value="final" ${exK === 'final' ? 'selected' : ''}>기말고사</option></select>
        <span class="hint">시험+교재의 같은 시험에 기간이 자동으로 들어갑니다</span></div>
      <label>제목</label><input type="text" name="title" value="${esc(v.title)}" placeholder="선택 (예: 기말, 3과 집중)">
      <label class="top">메모</label><textarea name="memo" rows="4">${esc(v.memo)}</textarea>
    </div>`;
    Modal.open({
      title: ev ? '일정 수정' : '일정 추가', body,
      onMount: (b, m) => {
        enhanceAll(b);
        bindCombo($('[name=school]', b), schoolOptions);
        const chk = $('[name=ranged]', b), endIn = $('[name=endDate]', b), wrap = $('[data-endwrap]', b), dIn = $('[name=date]', b);
        const sync = () => {
          endIn.disabled = !chk.checked;
          wrap.classList.toggle('off', !chk.checked);
          if (chk.checked && (!endIn.value || endIn.value <= dIn.value) && isYmd(dIn.value)) endIn.value = addDaysStr(dIn.value, 1);
        };
        chk.addEventListener('change', sync);
        const tl = $('[data-timelabel]', b), rw = $('[data-rangedwrap]', b);
        // 시험 일정: 연도·학기는 날짜를 따라가다가, 직접 고치면 그대로 둔다
        let exTouched = !!(ev && ev.year);
        ['exYear', 'exSem'].forEach(n => $(`[name=${n}]`, b).addEventListener('change', () => { exTouched = true; }));
        dIn.addEventListener('change', () => { if (exTouched) return; const t = evTerm(dIn.value); $('[name=exYear]', b).value = t.year; $('[name=exSem]', b).value = t.sem; });
        const typeSync = () => {
          const t = $('[name=type]:checked', b);
          const isEx = !!(t && t.value === 'exam');      // 시험 일정만 학교·학년·연도·학기·중간/기말 필수
          $$('[data-exrow]', b).forEach(x => { x.style.display = isEx ? '' : 'none'; });
          $('[data-schlabel]', b).classList.toggle('req', isEx);
          tl.classList.toggle('req', !!(t && NEED_TIME[t.value]));
          // 영어 시험은 하루짜리: 기간 끄고 숨김
          const one = !!(t && ONE_DAY[t.value]);
          rw.style.display = one ? 'none' : '';
          if (one && chk.checked) { chk.checked = false; sync(); }
          wrap.style.display = one ? 'none' : '';
        };
        b.addEventListener('change', (e) => { if (e.target.name === 'type') typeSync(); });
        typeSync();

        // 학년 여러 개 고르기 (누르면 펼쳐지는 체크 목록, 선택 안 해도 됨)
        const gBtn = $('[data-gsel]', b), schIn = $('[name=school]', b);
        const drawBtn = () => { gBtn.textContent = grades.length ? gradesLabel(grades, true) : '학년 선택 안 함'; gBtn.classList.toggle('empty', !grades.length); };
        // 학교 이름으로 학교급을 짐작해 그 학년만 보여 준다 (이미 고른 학년은 항상 보임)
        const gradeList = () => {
          const sc = schoolShort(schIn.value);
          const lv = /고$/.test(sc) ? GRADES.filter(isHigh) : /중$/.test(sc) ? GRADES.filter(isMiddle) : /초$/.test(sc) ? GRADES.filter(g => g <= 6) : GRADES;
          return GRADES.filter(g => lv.includes(g) || grades.includes(g));
        };
        let pop = null;
        const hidePop = () => {
          if (!pop) return;
          pop.remove(); pop = null;
          document.removeEventListener('mousedown', outside, true);
          document.removeEventListener('keydown', escKey, true);
          BackGuard.remove(hidePop);
        };
        const outside = (e) => { if (pop && !pop.contains(e.target) && e.target !== gBtn) hidePop(); };
        const escKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hidePop(); } };
        const drawPop = () => {
          pop.innerHTML = gradeList().map(g => `<label class="combo-item msel-item"><input type="checkbox" data-g="${g}" ${grades.includes(g) ? 'checked' : ''}>${gradeLabel(g)}</label>`).join('')
            + `<div class="combo-item msel-clear" data-gclear>선택 해제</div>`;
        };
        gBtn.addEventListener('click', () => {
          if (pop) { hidePop(); return; }
          pop = document.createElement('div');
          pop.className = 'combo-box msel-pop';
          drawPop();
          const r = gBtn.getBoundingClientRect();
          pop.style.left = r.left + 'px'; pop.style.top = (r.bottom + 2) + 'px'; pop.style.minWidth = r.width + 'px';
          document.body.appendChild(pop);
          document.addEventListener('mousedown', outside, true);
          document.addEventListener('keydown', escKey, true);
          BackGuard.add(hidePop);   // 뒤로가기 → 펼친 목록 닫기
          pop.addEventListener('change', (e) => {
            const g = +e.target.dataset.g; if (!g) return;
            grades = e.target.checked ? [...new Set([...grades, g])].sort((x, y) => x - y) : grades.filter(x => x !== g);
            drawBtn();
          });
          pop.addEventListener('click', (e) => { if (e.target.closest('[data-gclear]')) { grades = []; drawBtn(); drawPop(); } });
        });
        b.closest('.mg-modal-body').addEventListener('scroll', hidePop, { passive: true });
        schIn.addEventListener('input', hidePop);
        m.onClose = hidePop;            // 모달을 닫으면 펼친 목록도 닫는다
        drawBtn();
      },
      buttons: [
        ...(ev ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 일정을 삭제할까요?', '삭제', true)) return false;
          Store.del('events', ev.id);
          if (typeof Exams !== 'undefined') Exams.syncDates();   // 이 일정에서 가져온 시험 기간도 맞춘다
          toast('일정을 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body;
          const ranged2 = $('[name=ranged]', b).checked;
          if (!$('[name=type]:checked', b)) { toast('종류를 선택하세요'); return false; }
          const rec = Object.assign({}, ev || { id: uid('EV'), createdAt: new Date().toISOString() }, {
            type: $('[name=type]:checked', b).value,
            date: $('[name=date]', b).value,
            endDate: ranged2 ? $('[name=endDate]', b).value : '',
            start: $('[name=start]', b).value,
            end: $('[name=end]', b).value,
            school: $('[name=school]', b).value.trim(),
            grades: grades.slice(),
            title: $('[name=title]', b).value.trim(),
            memo: stripZws($('[name=memo]', b).value),
          });
          delete rec.grade;                                   // 예전 학년 하나 필드는 grades로 대체
          if (rec.type === 'exam') {                          // 시험 일정: 학교·학년·연도·학기·중간/기말 필수
            rec.year = +$('[name=exYear]', b).value; rec.semester = +$('[name=exSem]', b).value; rec.kind = $('[name=exKind]', b).value;
            if (!rec.school) { toast('시험 일정은 학교를 입력하세요'); return false; }
            if (!rec.grades.length) { toast('시험 일정은 학년을 고르세요'); return false; }
            if (!rec.year || rec.year < 2000) { toast('시험 연도를 확인하세요'); return false; }
            if (!rec.kind) { toast('중간고사·기말고사를 고르세요'); return false; }
          } else { delete rec.year; delete rec.semester; delete rec.kind; }
          if (ONE_DAY[rec.type]) rec.endDate = '';            // 영어 시험은 하루짜리
          if (!isYmd(rec.date)) { toast('날짜를 선택하세요'); return false; }
          if (ranged2 && !ONE_DAY[rec.type]) {
            if (!isYmd(rec.endDate)) { toast('끝나는 날짜를 선택하세요'); return false; }
            if (rec.endDate < rec.date) { toast('끝나는 날짜가 시작일보다 빠릅니다'); return false; }
            if (rec.endDate === rec.date) rec.endDate = '';
          }
          if (NEED_TIME[rec.type] && !rec.start) { toast('직전 보강은 시작 시간을 입력하세요'); return false; }
          if (rec.end && !rec.start) { toast('시작 시간을 입력하세요'); return false; }
          if (rec.start && rec.end && rec.end <= rec.start) { toast('종료 시간이 시작 시간보다 늦어야 합니다'); return false; }
          Store.put('events', rec);
          if (typeof Exams !== 'undefined') Exams.syncDates();   // 같은 시험의 시험 기간을 바로 맞춘다
          toast('일정을 저장했습니다');
          App.render();
        } },
      ],
    });
  },
};

/* ---------- 일정 탭: 모든 일정을 모아 관리 ---------- */
const EventsPage = {
  type: '', q: '', hidePast: false,
  view: 'cur',          // 'cur' 올해(+내년 이후) / 'past' 이전 해
  pastYear: '',
  render(main) {
    const today = todayStr();
    const q = this.q.trim();
    const thisY = today.slice(0, 4);
    const every = Store.all('events').filter(ev => isYmd(ev.date));
    // 일정은 시작일의 연도에 속한다 → 1월 1일이 되면 지난해 일정은 저절로 '이전 해'로 넘어간다
    const pastYears = [...new Set(every.map(ev => ev.date.slice(0, 4)).filter(y => y < thisY))].sort().reverse();
    if (!pastYears.includes(this.pastYear)) this.pastYear = pastYears[0] || '';
    const curAll = every.filter(ev => ev.date.slice(0, 4) >= thisY);
    const all = this.view === 'past' ? every.filter(ev => ev.date.slice(0, 4) === this.pastYear) : curAll;
    const pastCnt = this.view === 'past' ? 0 : all.filter(ev => evEnd(ev) < today).length;
    const list = all.filter(ev => (!this.type || evType(ev) === this.type))
      .filter(ev => this.view === 'past' || !this.hidePast || evEnd(ev) >= today)
      .filter(ev => !q || [ev.school, eventShort(ev), ev.title, ev.memo].some(v => String(v || '').includes(q)))
      .sort((a, b) => {
        const pa = evEnd(a) < today, pb = evEnd(b) < today;
        if (pa !== pb) return pa ? 1 : -1;                 // 다가오는 일정 먼저
        return pa ? ko(b.date, a.date) : ko(a.date, b.date) || ko(a.start, b.start);
      });
    let h = `<div class="page-head"><h1>일정+공휴일</h1><button class="btn primary" data-a="add">+ 일정 추가</button><button class="btn" data-a="addhol">+ 공휴일 추가</button><span class="sub">시험 일정 · 직전 보강 · 영어 시험 · 기타 · 공휴일</span></div>
      <div class="tabs"><button data-view="cur" class="${this.view === 'cur' ? 'active' : ''}">${thisY}년<span class="cnt">${curAll.length}</span></button><button data-view="past" class="${this.view === 'past' ? 'active' : ''}">이전 해<span class="cnt">${every.length - curAll.length}</span></button></div>
      <div class="toolbar">${this.view === 'past' ? (pastYears.length ? `<select data-pyear>${pastYears.map(y => `<option value="${y}" ${y === this.pastYear ? 'selected' : ''}>${y}년</option>`).join('')}</select>` : '') : ''}<select data-type><option value="">전체 종류</option>${Object.keys(EVENT_TYPES).map(k => `<option value="${k}" ${this.type === k ? 'selected' : ''}>${EVENT_TYPES[k].label}</option>`).join('')}</select>
      <input type="search" data-q value="${esc(this.q)}" placeholder="학교, 제목, 메모 검색" style="width:240px">
      ${this.view === 'past' ? '' : `<label class="chk small"><input type="checkbox" data-past ${this.hidePast ? 'checked' : ''}>지난 일정 숨기기 (${pastCnt})</label>`}
      <span class="muted small">${list.length}건</span></div>`;
    h += list.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>날짜</th><th>시간</th><th>종류</th><th>대상</th><th>제목·메모</th></tr></thead><tbody>${list.map(ev => {
      const past = evEnd(ev) < today;
      const tcls = { exam: 'red', pre: '', weekend: 'green', etc: 'purple', holiday: 'orange' }[evType(ev)];
      return `<tr class="click ${past ? 'past' : ''}" data-ev="${ev.id}"><td class="nowrap"><b>${esc(eventRangeLabel(ev))}</b></td><td class="nowrap">${esc(eventTime(ev)) || '<span class="muted">-</span>'}</td>
        <td class="nowrap"><span class="badge ${tcls}">${EVENT_TYPES[evType(ev)].label}</span></td><td class="nowrap">${highlight(eventTarget(ev), q) || '<span class="muted">-</span>'}</td>
        <td>${ev.title ? `<b>${highlight(ev.title, q)}</b> ` : ''}<span class="small soft">${highlight(firstLine(ev.memo), q)}</span></td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 일정이 없습니다.' : this.view === 'past' ? '이전 해 일정이 없습니다.' : '등록된 일정이 없습니다. “일정 추가”로 시험 일정이나 보강을 등록하세요.'}</div></div>`;
    main.innerHTML = h;
    main.onclick = (e) => {
      const vb = e.target.closest('[data-view]'); if (vb) { this.view = vb.dataset.view; App.render(true); return; }
      if (e.target.closest('[data-a=add]')) { EventModal.open(null, { date: today }); return; }
      if (e.target.closest('[data-a=addhol]')) { HolidayModal.open(null, { date: today }); return; }
      const tr = e.target.closest('[data-ev]'); if (tr) EventModal.open(tr.dataset.ev);
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-type]')) { this.type = e.target.value; App.render(); }
      if (e.target.matches('[data-past]')) { this.hidePast = e.target.checked; App.render(); }
      if (e.target.matches('[data-pyear]')) { this.pastYear = e.target.value; App.render(); }
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) { this.q = e.target.value; App.render(); const i = $('[data-q]', main); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    }, 250);
  },
};
