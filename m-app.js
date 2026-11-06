/* =========================================================
   m-app.js — 모바일 전용 (index-mobile.html)
   - 데이터·로그인·동기화는 PC와 같은 파일(config/util/store/…)을 그대로 쓴다
   - 화면: 시간표 · 문자 · 진도 · 일정 · 보강 · 시험정보
   - 문자는 PC 문자 화면(SmsPage)을 그대로 사용 (기능 동일)
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
  exams: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/></svg>',
};
const M_TABS = [['timetable', '시간표'], ['sms', '문자'], ['progress', '진도'], ['events', '일정'], ['makeups', '보강'], ['exams', '시험정보']];

/* ---------- 공용 ---------- */
// 검색칸: 입력할 때 목록만 다시 그린다 (입력칸을 새로 만들지 않아 한글 입력이 끊기지 않음)
function mSearchHtml(val, ph) {
  return `<input type="search" data-q value="${esc(val)}" placeholder="${esc(ph)}" class="m-grow" enterkeyhint="search">`;
}
function mDday(start, end) {
  if (!isYmd(start)) return '';
  const today = todayStr();
  const dd = Math.round((parseYmd(start) - parseYmd(today)) / 864e5);
  if (dd > 0) return `<span class="badge ${dd <= 14 ? 'orange' : ''}">D-${dd}</span>`;
  if (dd === 0) return '<span class="badge red">D-day</span>';
  if ((end || start) >= today) return '<span class="badge red">시험 중</span>';
  return '<span class="badge gray">지난 시험</span>';
}

/* =========================================================
   시간표 — PC 시간표를 그대로 그린 뒤 보기 전용으로 바꾼다 (가로·세로 스크롤)
   ========================================================= */
const MTimetable = {
  ZOOMS: [1.0, 1.25, 1.5, 1.8, 2.2, 2.6],      // 1분당 px
  zi: 2,
  LS_ZOOM: 'mg77_m_ttzoom',
  onLeave() { Timetable.onLeave(); },

  render(main) {
    try { const z = localStorage.getItem(this.LS_ZOOM); if (z !== null && +z >= 0 && +z < this.ZOOMS.length) this.zi = +z; } catch (_) {}
    // 다시 그릴 때 보던 위치 유지
    const old = $('.m-tt-scroll', main);
    const pos = old ? { l: old.scrollLeft, t: old.scrollTop } : null;

    Timetable.render(main);
    main.onclick = null;                                   // 블록을 눌러도 반 수정 창을 열지 않음
    const head = $('.page-head', main); if (head) head.remove();
    const grip = $('.tt2-resize', main); if (grip) grip.remove();
    const box = $('.tt2', main);
    if (!box) return;
    $$('.tt-blk', box).forEach(b => b.removeAttribute('title'));

    // 표 전체 폭 = 시간 칸 + 요일 칸 최소 폭 합 (이보다 좁아지지 않게 → 가로 스크롤)
    let w = 56;
    ((($('.tt2-head', box) || box).getAttribute('style') || '').match(/minmax\((\d+)px/g) || []).forEach(x => { w += +x.match(/\d+/)[0]; });
    box.style.width = w + 'px';
    box.style.minWidth = w + 'px';

    const page = document.createElement('div');
    page.className = 'm-tt-page';
    const wrap = document.createElement('div');
    wrap.className = 'm-tt-scroll';
    box.parentNode.insertBefore(page, box);
    page.appendChild(wrap);
    wrap.appendChild(box);
    page.insertAdjacentHTML('beforeend', `<div class="m-tt-zoom"><button type="button" data-z="-1" aria-label="작게">−</button><button type="button" data-z="1" aria-label="크게">+</button></div>`);

    this.apply(main);
    if (pos) { wrap.scrollLeft = pos.l; wrap.scrollTop = pos.t; }
    else {
      const tc = $('.tt2-col.today', box);
      if (tc) wrap.scrollLeft = Math.max(0, tc.offsetLeft - 60);
    }

    main.onclick = (e) => {
      const z = e.target.closest('[data-z]');
      if (!z) return;
      const ni = Math.max(0, Math.min(this.ZOOMS.length - 1, this.zi + +z.dataset.z));
      if (ni === this.zi) return;
      const r = wrap.scrollTop / Math.max(1, wrap.scrollHeight);
      this.zi = ni;
      try { localStorage.setItem(this.LS_ZOOM, String(ni)); } catch (_) {}
      this.apply(main);
      wrap.scrollTop = r * wrap.scrollHeight;
    };
  },
  apply(main) {
    const box = $('.tt2', main);
    if (!box) return;
    box.style.setProperty('--ppm', this.ZOOMS[this.zi] + 'px');
    Timetable.fitStudents(main);
    $$('.m-tt-zoom [data-z]', main).forEach(b => { b.disabled = (+b.dataset.z < 0 && this.zi === 0) || (+b.dataset.z > 0 && this.zi === this.ZOOMS.length - 1); });
  },
};

/* =========================================================
   진도 — 보기 전용 (반별 수업 기록 · 내신 요약)
   ========================================================= */
const MProgress = {
  classId: '', q: '', npOn: false, npSel: {},
  jump: '',                 // 보강에서 '진도 보기'로 왔을 때 그 날짜로 스크롤

  classes() { return Classes.sorted(Store.all('classes')).sort((a, b) => (a.active === false) - (b.active === false)); },
  todosOf(lid) { return Store.where('todos', t => t.lessonId === lid).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt)); },

  render(main, p) {
    const classes = this.classes();
    if (p.classId) this.classId = p.classId;
    if (!this.classId || !Store.get('classes', this.classId)) this.classId = classes[0] ? classes[0].id : '';
    const act = classes.filter(c => c.active !== false), ended = classes.filter(c => c.active === false);
    let h = `<div class="m-chips">${act.map(c => `<button type="button" class="chip ${c.id === this.classId ? 'active' : ''}" data-cls="${c.id}">${Classes.dot(c)}${esc(c.name)}</button>`).join('')}</div>`;
    if (ended.length) h += `<div class="m-bar"><select data-ended class="m-grow"><option value="">종료된 반 보기…</option>${ended.map(c => `<option value="${c.id}" ${c.id === this.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
    if (!this.classId) { main.innerHTML = h + '<div class="panel"><div class="empty">반이 없습니다.</div></div>'; this.bind(main); return; }
    h += `<div class="m-bar">${mSearchHtml(this.q, '진도·숙제·메모·할일 검색')}<label class="chk m-tg"><input type="checkbox" data-npsum ${this.npOn ? 'checked' : ''}>내신 요약</label></div>`;
    if (this.npOn) {
      const today = todayStr();
      const sel = this.npSel[this.classId] || NP.autoExams(this.classId, today).map(e => e.id);
      const cands = NP.candExams(this.classId, today, sel);
      h += `<div class="np-exams m-npx">${cands.map(e => `<button type="button" class="np-ex ${sel.includes(e.id) ? 'on' : ''}" data-npsx="${e.id}">${esc(NP.examLabel(e))} <small>${esc(NP.examDates(e))}</small></button>`).join('') || '<span class="small muted">등록된 시험이 없습니다.</span>'}
        ${this.npSel[this.classId] ? '<button type="button" class="np-auto" data-npsauto>자동</button>' : ''}</div>
        <div class="m-ro">${NP.summaryHtml(this.classId, sel)}</div>`;
    }
    h += `<div id="m-list">${this.listHtml(p.date)}</div>`;
    main.innerHTML = h;
    this.bind(main);
    const ac = $('.m-chips .chip.active', main); if (ac) ac.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (this.jump) {
      const t = $(`.m-card[data-date="${this.jump}"]`, main);
      this.jump = '';
      if (t) setTimeout(() => t.scrollIntoView({ block: 'center' }), 0);
    }
  },

  listHtml(hlDate) {
    const q = this.q.trim();
    const all = Store.where('lessons', l => l.classId === this.classId && !Lessons.isEmpty(l));
    const list = all.filter(l => !q || [l.progress, l.homework, l.memo, NP.text(l), ...(l.dist || []).map(d => NP.distText(d)), ...this.todosOf(l.id).map(t => t.text)].some(v => String(v || '').includes(q)))
      .sort((a, b) => ko(b.date, a.date));
    if (!list.length) return `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 기록이 없습니다.' : '이 반은 저장된 수업일지가 없습니다.'}</div></div>`;
    return `<div class="m-cnt">${list.length}회</div>` + list.map(l => {
      const v = Object.values(l.att || {});
      const n = (k) => v.filter(x => x === k).length;
      const att = v.length ? `출${n('P')}${n('L') ? ' 지' + n('L') : ''}${n('A') ? ' <span style="color:var(--danger)">결' + n('A') + '</span>' : ''}${n('E') ? ' 조' + n('E') : ''}` : '';
      const tds = this.todosOf(l.id);
      const pg = stripZws(l.progress || '').trim(), hw = stripZws(l.homework || '').trim(), mm = stripZws(l.memo || '').trim();
      let f = `<span class="k">진도</span><div class="pre">${pg ? highlight(pg, q) : ((l.np || []).length || (l.dist || []).length ? '' : '<span class="muted">-</span>')}${(l.np || []).length ? `<div class="np-line">내신 ${highlight(NP.text(l), q)}</div>` : ''}${(l.dist || []).map(d => `<div class="np-line dist">배부 ${highlight(NP.distText(d), q)}</div>`).join('')}</div>`;
      f += `<span class="k">숙제</span><div class="pre">${hw ? highlight(hw, q) : '<span class="muted">-</span>'}</div>`;
      if (mm) f += `<span class="k">메모</span><div class="pre soft">${highlight(mm, q)}</div>`;
      if (tds.length) f += `<span class="k">할일</span><div>${tds.map(t => `<div class="${t.done ? 'muted' : ''}">${t.done ? '☑' : '☐'} ${highlight(t.text, q)} <span class="muted small">${fmtMD(t.date)}</span></div>`).join('')}</div>`;
      return `<div class="m-card ${hlDate === l.date ? 'hl' : ''}" data-date="${l.date}">
        <div class="m-card-hd"><b class="m-date">${fmtMD(l.date)}</b>${att ? `<span class="small soft">${att}</span>` : ''}</div>
        <div class="m-f">${f}</div></div>`;
    }).join('');
  },

  bind(main) {
    main.onclick = (e) => {
      const sx = e.target.closest('[data-npsx]');
      if (sx) {
        const cur = this.npSel[this.classId] || NP.autoExams(this.classId, todayStr()).map(x => x.id);
        this.npSel[this.classId] = cur.includes(sx.dataset.npsx) ? cur.filter(id => id !== sx.dataset.npsx) : cur.concat(sx.dataset.npsx);
        App.render(); return;
      }
      if (e.target.closest('[data-npsauto]')) { delete this.npSel[this.classId]; App.render(); return; }
      const ch = e.target.closest('[data-cls]');
      if (ch) { this.classId = ch.dataset.cls; App.params = {}; App.render(true); }
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-npsum]')) { this.npOn = e.target.checked; App.render(); return; }
      if (e.target.matches('[data-ended]') && e.target.value) { this.classId = e.target.value; App.params = {}; App.render(true); }
    };
    main.oninput = debounce((e) => {
      if (!e.target.matches('[data-q]')) return;
      this.q = e.target.value;
      const box = $('#m-list', main); if (box) box.innerHTML = this.listHtml(App.params.date);
    }, 250);
  },
};

/* =========================================================
   보강 — 보기 전용 (출석부 결석이 자동으로 모임) + 진도·숙제 복사
   ========================================================= */
const MMakeups = {
  tab: 'open', q: '',
  ST_BADGE: { none: 'gray', plan: '', done: 'green', skip: 'gray' },

  render(main) {
    const all = Makeups.collect();
    const cnt = { open: 0, done: 0, skip: 0, all: all.length };
    all.forEach(o => { if (o.status === 'done') cnt.done++; else if (o.status === 'skip') cnt.skip++; else cnt.open++; });
    main.innerHTML = `<div class="tabs m-tabs4">${[['open', '처리 필요'], ['done', '완료'], ['skip', '안 함'], ['all', '전체']].map(([k, t]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${t}<span class="cnt">${cnt[k]}</span></button>`).join('')}</div>
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
    all = all || Makeups.collect();
    const list = this.filtered(all);
    this._byKey = {};
    if (!list.length) return `<div class="panel"><div class="empty">${all.length ? '해당하는 보강이 없습니다.' : '결석 기록이 없습니다.'}</div></div>`;
    const q = this.q.trim();
    return list.map(o => {
      const mk = o.mk || {};
      const key = Makeups.id(o.l.id, o.s.id);
      this._byKey[key] = o;
      const dist = o.l.dist || [];
      const got = (mk.distGot || []).filter(i => i < dist.length);
      const when = mk.date ? fmtDate(mk.date) + (mk.time ? ' ' + mk.time : '') : '';
      let f = `<span class="k">보강일</span><div>${when ? esc(when) : '<span class="muted">미정</span>'}</div>`;
      if (mk.memo) f += `<span class="k">메모</span><div class="pre">${esc(mk.memo)}</div>`;
      f += `<span class="k">진도</span><div class="pre">${esc(stripZws(o.l.progress)) || '<span class="muted">입력 전</span>'}</div>`;
      if ((o.l.np || []).length) f += `<span class="k">내신</span><div>${esc(NP.text(o.l))}</div>`;
      f += `<span class="k">숙제</span><div class="pre">${esc(stripZws(o.l.homework)) || '<span class="muted">입력 전</span>'}</div>`;
      if (dist.length) f += `<span class="k">배부</span><div>${dist.map((d, i) => `<div class="small mk-dist ${got.includes(i) ? 'got' : ''}">${got.includes(i) ? '☑' : '☐'} ${esc(NP.distText(d))}</div>`).join('')}</div>`;
      return `<div class="m-card ${o.status === 'done' || o.status === 'skip' ? 'm-dim' : ''}">
        <div class="m-card-hd"><b class="m-who">${highlight(o.s.name, q)}</b><span class="tag">${esc(stTag(o.s))}</span>
          ${o.s.status !== 'active' ? Students.statusBadge(o.s) : ''}
          <span class="m-grow"></span><span class="badge ${this.ST_BADGE[o.status] || 'gray'}">${MK_STATUS[o.status] || '미지정'}</span></div>
        <div class="m-card-sub"><span class="badge red">결석 ${fmtMD(o.l.date)}</span><span class="soft small">${o.c ? highlight(o.c.name, q) : '(삭제된 반)'}</span>
          ${dist.length > got.length ? `<span class="badge orange">미전달 자료 ${dist.length - got.length}</span>` : ''}</div>
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
   ========================================================= */
const MEvents = {
  mode: 'cal',            // 'cal' | 'list'
  type: '',               // 종류 필터 ('' = 전체)
  q: '', hidePast: true,
  month: '',              // 'YYYY-MM'
  sel: '',                // 달력에서 고른 날짜
  TCLS: { exam: 'red', pre: '', weekend: 'green', etc: 'purple' },
  ORDER: ['exam', 'pre', 'weekend', 'etc'],

  render(main) {
    const today = todayStr();
    if (!isYmd(this.sel)) this.sel = today;
    if (!/^\d{4}-\d{2}$/.test(this.month)) this.month = this.sel.slice(0, 7);
    let h = `<div class="m-seg" role="group" aria-label="보기 방식">
        <button type="button" data-mode="cal" class="${this.mode === 'cal' ? 'on' : ''}">달력</button>
        <button type="button" data-mode="list" class="${this.mode === 'list' ? 'on' : ''}">목록</button></div>
      <div class="m-chips"><button type="button" class="chip ${this.type ? '' : 'active'}" data-type="">전체</button>${this.ORDER.map(k => `<button type="button" class="chip ${this.type === k ? 'active' : ''}" data-type="${k}">${EVENT_TYPES[k].label}</button>`).join('')}</div>`;
    h += this.mode === 'cal' ? this.calHtml(today) : this.listShellHtml(today);
    main.innerHTML = h;
    this.bind(main);
  },

  okType(ev) { return !this.type || evType(ev) === this.type; },

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
    const idx = CalIndex.build();
    let h = `<div class="panel m-cal"><div class="mc-head"><span class="mc-title">${Y}년 ${M}월</span>
        <button type="button" class="mc-nav" data-mon="-1" aria-label="이전 달">‹</button>
        <button type="button" class="mc-today" data-mon="0">오늘</button>
        <button type="button" class="mc-nav" data-mon="1" aria-label="다음 달">›</button></div>
      <div class="mc-grid">${DOW.map((w, i) => `<div class="mc-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}`;
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i), k = ymd(d);
      const o = idx[k];
      const dots = o ? this.ORDER.filter(t => (!this.type || this.type === t) && o[t].length).map(t => `<i class="dot-${t}"></i>`).join('') : '';
      const cls = ['mc-day'];
      if (d.getMonth() !== M - 1) cls.push('other');
      if (d.getDay() === 0) cls.push('sun');
      if (d.getDay() === 6) cls.push('sat');
      if (k === today) cls.push('today');
      if (k === this.sel) cls.push('sel');
      h += `<button type="button" class="${cls.join(' ')}" data-d="${k}"><span class="n">${d.getDate()}</span><span class="mc-dots">${dots}</span></button>`;
    }
    h += `</div><div class="mc-legend">${this.ORDER.map(t => `<span><i class="dot-${t}"></i>${EVENT_TYPES[t].label}</span>`).join('')}</div></div>`;
    const o = idx[this.sel];
    const evs = o ? this.ORDER.filter(t => !this.type || this.type === t).flatMap(t => o[t]) : [];
    h += `<div class="m-sec-t">${esc(fmtDate(this.sel))}${this.sel === today ? ' <span class="badge">오늘</span>' : ''}</div>`;
    h += evs.length ? `<div class="m-evs">${evs.map(ev => this.evRow(ev, false)).join('')}</div>` : '<div class="panel"><div class="empty">이 날은 일정이 없습니다.</div></div>';
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

  bind(main) {
    main.onclick = (e) => {
      const md = e.target.closest('[data-mode]'); if (md) { this.mode = md.dataset.mode; App.render(true); return; }
      const ty = e.target.closest('[data-type]'); if (ty) { this.type = ty.dataset.type; App.render(); return; }
      const mo = e.target.closest('[data-mon]');
      if (mo) {
        const n = +mo.dataset.mon;
        if (!n) { this.sel = todayStr(); this.month = this.sel.slice(0, 7); }
        else { const [Y, M] = this.month.split('-').map(Number); const d = new Date(Y, M - 1 + n, 1); this.month = d.getFullYear() + '-' + pad(d.getMonth() + 1); }
        App.render(); return;
      }
      const dd = e.target.closest('[data-d]');
      if (dd) { this.sel = dd.dataset.d; this.month = this.sel.slice(0, 7); App.render(); return; }
      const ev = e.target.closest('[data-ev]'); if (ev) this.openEv(ev.dataset.ev);
    };
    main.onchange = (e) => {
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
   시험정보 — 보기 전용
   ========================================================= */
const MExams = {
  year: '', sem: '', q: '',

  render(main) {
    const all = Store.all('exams');
    const years = [...new Set([new Date().getFullYear(), ...all.map(e => +e.year).filter(Boolean)])].sort((a, b) => b - a);
    main.innerHTML = `<div class="m-bar">
        <select data-year class="m-grow"><option value="">전체 연도</option>${years.map(y => `<option value="${y}" ${+this.year === y ? 'selected' : ''}>${y}년</option>`).join('')}</select>
        <select data-sem class="m-grow"><option value="">전체 학기</option><option value="1" ${this.sem === '1' ? 'selected' : ''}>1학기</option><option value="2" ${this.sem === '2' ? 'selected' : ''}>2학기</option></select></div>
      <div class="m-bar">${mSearchHtml(this.q, '학교, 범위, 메모 검색')}</div>
      <div id="m-list">${this.listHtml()}</div>`;
    this.bind(main);
  },

  listHtml() {
    const all = Store.all('exams');
    const q = this.q.trim();
    const list = all.filter(e => (!this.year || +e.year === +this.year) && (!this.sem || +e.semester === +this.sem))
      .filter(e => !q || [e.school, examTitle(e), e.range, NP.rangeText(e), e.memo].some(v => String(v || '').includes(q)))
      .sort((a, b) => b.year - a.year || b.semester - a.semester || (a.kind === b.kind ? 0 : a.kind === 'final' ? -1 : 1) || ko(a.school, b.school) || a.grade - b.grade);
    if (!list.length) return `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 시험이 없습니다.' : '등록된 시험이 없습니다.'}</div></div>`;
    return `<div class="m-cnt">${list.length}건</div>` + list.map(e => {
      const rt = NP.rangeText(e), fm = Exams.formatLabel(e);
      let f = `<span class="k">기간</span><div>${e.start ? esc(fmtMD(e.start) + (e.end && e.end !== e.start ? ' ~ ' + fmtMD(e.end) : '')) : '<span class="muted">미정</span>'}</div>`;
      f += `<span class="k">범위</span><div class="pre">${rt ? `<div>${highlight(rt, q)}</div>` : ''}${e.range ? `<div class="${rt ? 'soft' : ''}">${highlight(e.range, q)}</div>` : ''}${!rt && !e.range ? '<span class="muted">-</span>' : ''}</div>`;
      if (fm) f += `<span class="k">형식</span><div>${esc(fm)}</div>`;
      if (e.memo) f += `<span class="k">메모</span><div class="pre soft">${highlight(e.memo, q)}</div>`;
      return `<div class="m-card">
        <div class="m-card-hd"><b class="m-who">${highlight(schoolShort(e.school), q)} ${gradeLabel(e.grade)}</b>
          <span class="small soft">${e.year}년 ${e.semester}학기 ${EXAM_KIND[e.kind] || ''}</span><span class="m-grow"></span>${mDday(e.start, e.end)}</div>
        <div class="m-f">${f}</div></div>`;
    }).join('');
  },

  bind(main) {
    main.onclick = null;
    main.onchange = (e) => {
      if (e.target.matches('[data-year]')) { this.year = e.target.value; App.render(); }
      if (e.target.matches('[data-sem]')) { this.sem = e.target.value; App.render(); }
    };
    main.oninput = debounce((e) => {
      if (!e.target.matches('[data-q]')) return;
      this.q = e.target.value;
      const box = $('#m-list', main); if (box) box.innerHTML = this.listHtml();
    }, 250);
  },
};

/* =========================================================
   App — 화면 전환 / 로그인 / 동기화 표시 (store.js·sms.js 등이 부르는 이름 그대로)
   ========================================================= */
const App = {
  page: 'timetable',
  params: {},
  selDate: todayStr(),
  _needRender: false,
  pages: { timetable: MTimetable, sms: SmsPage, progress: MProgress, events: MEvents, makeups: MMakeups, exams: MExams },

  go(page, params = {}) {
    if (!this.pages[page]) page = 'timetable';
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
      (this.pages[this.page] || MTimetable).render(main, this.params);
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
    _today = t;
    if (!Auth.key()) return;
    App.applySchedules();
    App.render();
    App.refreshModals();
  }, 60000);
})();
