/* =========================================================
   lessons.js — 수업일지(입력 전용) / 출석부 / 진도 / 결석 보강
   lesson: id = L_반ID_YYYYMMDD, { classId, date, progress, homework, memo, att:{학생ID:'P'|'L'|'A'|'E'} }
   todo:   { lessonId, classId, date(할일 날짜), text, done, createdAt }
   makeup: id = M_수업ID_학생ID, { lessonId, studentId, classId, absentDate, date, time, status, memo }
   ========================================================= */
const ATT = { P: '출석', L: '지각', A: '결석', E: '조퇴' };
const ATT_SHORT = { P: '출', L: '지', A: '결', E: '조' };
const MK_STATUS = { none: '미지정', plan: '예정', done: '완료', skip: '보강 안 함' };

/* =========================================================
   수업일지 — 입력 전용 화면
   - 입력 내용은 저장 전까지 화면에만 있음 (저장 없이 나가면 버림)
   - 저장하면 출석부·진도·할일로 들어가고, 입력칸은 비워짐
   - 저장된 반은 선택 목록에서 ✓ 표시 + 선택 불가 (수정은 진도·출석부 탭)
   ========================================================= */
const Lessons = {
  form: null,     // { date, classId, att, progress, homework, memo, todos:[{text,date}] }

  lessonId(classId, date) { return 'L_' + classId + '_' + compactDate(date); },
  getOrNew(classId, date) {
    return Store.get('lessons', this.lessonId(classId, date)) ||
      { id: this.lessonId(classId, date), classId, date, progress: '', homework: '', memo: '', att: {} };
  },
  isSaved(classId, date) { return !!Store.get('lessons', this.lessonId(classId, date)); },
  classesOn(date) {
    const dow = dowOf(date);
    return Classes.sortedOn(Store.all('classes').filter(c => c.active !== false && (c.days || []).includes(dow)), dow);
  },
  // 다른 화면에서 반·날짜를 열 때: 저장된 수업이면 진도 탭, 아니면 수업일지
  open(date, classId) {
    App.selDate = date; MiniCal.showMonthOf(date);
    if (this.isSaved(classId, date)) App.go('progress', { classId, date });
    else App.go('lessons', { date, classId });
  },
  onLeave() { this.form = null; },
  newForm(date, classId) { return { date, classId, att: {}, progress: '', homework: '', memo: '', todos: [{ text: '', date }] }; },

  render(main, p) {
    const date = isYmd(p.date) ? p.date : App.selDate;
    const sched = this.classesOn(date);
    const others = Classes.sorted(Store.all('classes').filter(c => c.active !== false && !sched.find(x => x.id === c.id)));
    const ok = (id) => id && Store.get('classes', id) && !this.isSaved(id, date);
    let classId = ok(p.classId) ? p.classId : null;
    if (!classId && this.form && this.form.date === date && ok(this.form.classId)) classId = this.form.classId;
    if (!classId) { const nx = sched.find(c => ok(c.id)); classId = nx ? nx.id : null; }
    if (!this.form || this.form.date !== date || this.form.classId !== classId) this.form = this.newForm(date, classId);
    const f = this.form;
    const savedCnt = sched.filter(c => this.isSaved(c.id, date)).length;
    const opt = (c) => {
      const sv = this.isSaved(c.id, date);
      return `<option value="${c.id}" ${sv ? 'disabled' : ''} ${c.id === classId ? 'selected' : ''}>${sv ? '✓ ' : ''}${esc(c.name)} (${esc(Classes.timeOn(c, dowOf(date)).start)})${sv ? ' — 저장됨' : ''}</option>`;
    };

    let h = `<div class="page-narrow"><div class="page-head"><h1>수업일지</h1>
      <button class="btn sm" data-a="prev">‹</button><input type="date" data-date value="${date}"><button class="btn sm" data-a="next">›</button>
      <button class="btn sm" data-a="today">오늘</button><span class="sub">${DOW[dowOf(date)]}요일</span>
      <span class="grow"></span>${classId ? '<button class="btn primary" data-save>저장</button>' : ''}</div>
      <div class="toolbar"><select data-cls style="min-width:260px">
        ${classId ? '' : '<option value="" selected>입력할 반을 선택하세요</option>'}
        ${sched.length ? `<optgroup label="${DOW[dowOf(date)]}요일 수업">${sched.map(opt).join('')}</optgroup>` : ''}
        ${others.length ? `<optgroup label="다른 반">${others.map(opt).join('')}</optgroup>` : ''}
      </select><span class="small muted">${sched.length ? `이 날 정규 수업 ${sched.length}개 중 ${savedCnt}개 저장` : '이 날은 정규 수업이 없습니다'}</span></div>`;

    if (!classId) {
      h += `<div class="panel"><div class="empty">${sched.length && savedCnt === sched.length
        ? '이 날 정규 수업 일지를 모두 저장했습니다. 수정은 진도·출석부 탭에서 하세요.'
        : '입력할 반을 선택하세요.'}</div></div></div>`;
      main.innerHTML = h;
      this.bind(main, date, null);
      return;
    }

    const c = Store.get('classes', classId);
    const roster = Classes.rosterAt(classId, date);
    const cnt = { P: 0, L: 0, A: 0, E: 0, none: 0 };
    roster.forEach(s => { const a = f.att[s.id]; if (a) cnt[a]++; else cnt.none++; });

    h += `<div class="grid-2"><div class="panel">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><h2 style="margin:0;flex:1">출석 <span class="sub">${esc(c.name)} · ${DOW[dowOf(date)]} ${esc(Classes.dayTimeLabel(c, dowOf(date)))}</span></h2>
      <button class="btn sm" data-allp ${roster.length ? '' : 'disabled'}>전원 출석</button>
      <button class="btn sm" data-clearatt>전체 해제</button></div>
      <div class="att-sum"><span>출석 ${cnt.P}</span><span>지각 ${cnt.L}</span><span>결석 ${cnt.A}</span><span>조퇴 ${cnt.E}</span><span class="muted">미체크 ${cnt.none}</span></div>`;
    h += roster.length ? roster.map(s => {
      const a = f.att[s.id] || '';
      return `<div class="att-row"><div class="nm"><b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span></div>
        <div class="att-seg">${Object.keys(ATT).map(k => `<button class="${k} ${a === k ? 'on' : ''}" data-att="${k}" data-sid="${s.id}">${ATT[k]}</button>`).join('')}</div></div>`;
    }).join('') : '<div class="empty">이 날짜에 이 반 수강생이 없습니다. 반 관리에서 학생을 배정하세요.</div>';
    h += `</div><div class="panel">
      <h2>수업 내용</h2>
      <div class="lesson-field"><label>진도</label><textarea data-f="progress" rows="4" placeholder="오늘 나간 진도">${esc(f.progress)}</textarea></div>
      <div class="lesson-field"><label>숙제</label><textarea data-f="homework" rows="3" placeholder="내준 숙제">${esc(f.homework)}</textarea></div>
      <div class="lesson-field"><label>메모</label><textarea data-f="memo" rows="3">${esc(f.memo)}</textarea></div>
      <div class="lesson-field"><label>할일</label>
        <div class="todo-drafts">${f.todos.map((d, i) => `<div class="todo-row"><input type="text" data-dtext="${i}" value="${esc(d.text)}" placeholder="할일"><input type="date" class="todo-date" data-ddate="${i}" value="${esc(d.date)}"><button class="icon-btn" data-ddel="${i}" title="칸 지우기">✕</button></div>`).join('')}</div>
        <div class="todo-actions"><button class="btn sm" data-dadd>+ 할일 칸 추가</button></div></div>
      <p class="small muted" style="margin:10px 0 0">“저장”을 누르면 출석은 출석부로, 진도·숙제·메모는 진도 탭으로, 할일은 정한 날짜의 할일로 들어갑니다. 저장하지 않고 다른 곳으로 가면 입력한 내용은 버려집니다. (Ctrl+Enter도 저장)</p>
    </div></div></div>`;
    main.innerHTML = h;
    this.bind(main, date, classId);
    $$('textarea[data-f]', main).forEach(ta => enhanceTextarea(ta, { onSave: () => this.save() }));
  },

  bind(main, date, classId) {
    const go = (d, cid) => { App.selDate = d; MiniCal.showMonthOf(d); App.go('lessons', { date: d, classId: cid }); };
    const f = this.form;
    main.onclick = (e) => {
      const a = e.target.closest('[data-a]');
      if (a) {
        if (a.dataset.a === 'today') go(todayStr(), null);
        else go(addDaysStr(date, a.dataset.a === 'prev' ? -1 : 1), null);
        return;
      }
      if (!classId) return;
      if (e.target.closest('[data-save]')) { this.save(); return; }
      if (e.target.closest('[data-clearatt]')) { f.att = {}; App.render(); return; }
      if (e.target.closest('[data-allp]')) {
        Classes.rosterAt(classId, date).forEach(s => { if (!f.att[s.id]) f.att[s.id] = 'P'; });
        App.render();
        return;
      }
      const at = e.target.closest('[data-att]');
      if (at) {
        if (f.att[at.dataset.sid] === at.dataset.att) delete f.att[at.dataset.sid];
        else f.att[at.dataset.sid] = at.dataset.att;
        App.render();
        return;
      }
      if (e.target.closest('[data-dadd]')) {
        f.todos.push({ text: '', date });
        App.render();
        const all = $$('[data-dtext]', $('#main')); if (all.length) all[all.length - 1].focus();
        return;
      }
      const dd = e.target.closest('[data-ddel]');
      if (dd) { f.todos.splice(+dd.dataset.ddel, 1); if (!f.todos.length) f.todos.push({ text: '', date }); App.render(); }
    };
    main.onkeydown = (e) => {
      if (e.target.matches('[data-dtext]') && e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const i = +e.target.dataset.dtext;
        if (i === f.todos.length - 1) f.todos.push({ text: '', date: f.todos[i].date || date });
        App.render();
        const n = $(`[data-dtext="${i + 1}"]`, $('#main')); if (n) n.focus();
      }
    };
    // 입력값은 저장 전까지 화면 메모리(form)에만 둔다
    main.oninput = (e) => {
      if (!classId) return;
      if (e.target.matches('textarea[data-f]')) f[e.target.dataset.f] = e.target.value;
      if (e.target.matches('[data-dtext]')) f.todos[+e.target.dataset.dtext].text = e.target.value;
      if (e.target.matches('[data-ddate]')) f.todos[+e.target.dataset.ddate].date = e.target.value;
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-date]') && isYmd(e.target.value)) go(e.target.value, null);
      if (e.target.matches('[data-cls]') && e.target.value) go(date, e.target.value);
    };
  },

  async save() {
    const f = this.form;
    if (!f || !f.classId) return;
    $$('textarea[data-f]', $('#main')).forEach(ta => { f[ta.dataset.f] = ta.value; });
    const id = this.lessonId(f.classId, f.date);
    if (Store.get('lessons', id)) { toast('이미 저장된 수업입니다. 수정은 진도 탭에서 하세요'); this.form = null; App.go('lessons', { date: f.date }); return; }
    Store.put('lessons', { id, classId: f.classId, date: f.date, progress: stripZws(f.progress), homework: stripZws(f.homework), memo: stripZws(f.memo), att: Object.assign({}, f.att) });
    const now = Date.now();
    const todos = f.todos.filter(d => d.text.trim());
    todos.forEach((d, i) => Store.put('todos', { id: uid('TD'), lessonId: id, classId: f.classId, date: isYmd(d.date) ? d.date : f.date, text: d.text.trim(), done: false, createdAt: new Date(now + i).toISOString() }));
    const cname = (Store.get('classes', f.classId) || {}).name || '';
    this.form = null;
    App.go('lessons', { date: f.date });
    await Store.syncNow();
    toast(`${cname} 저장 완료` + (todos.length ? ` · 할일 ${todos.length}개` : '') + (Store.pendingCount() ? ' (인터넷 연결 후 자동 전송)' : ''));
  },
};

/* =========================================================
   출석부 — 반별·월별 표 (칸을 누르면 바로 수정)
   ========================================================= */
const AttBook = {
  classId: '',
  month: '',
  allDays: true,       // true: 그 달 모든 날짜 / false: 정규 수업일 + 기록 있는 날
  CYCLE: ['', 'P', 'L', 'A', 'E'],

  render(main, p) {
    const classes = Classes.sorted(Store.all('classes')).sort((a, b) => (a.active === false) - (b.active === false));
    if (p.classId) this.classId = p.classId;
    if (!this.classId || !Store.get('classes', this.classId)) this.classId = classes[0] ? classes[0].id : '';
    if (!this.month) this.month = App.selDate.slice(0, 7);
    const [Y, M] = this.month.split('-').map(Number);
    let h = `<div class="page-narrow"><div class="page-head"><h1>출석부</h1>
      <select data-cls>${classes.map(c => `<option value="${c.id}" ${c.id === this.classId ? 'selected' : ''}>${esc(c.name)}${c.active === false ? ' (종료)' : ''}</option>`).join('')}</select>
      <button class="btn sm" data-m="-1">‹</button><input type="month" data-month value="${this.month}"><button class="btn sm" data-m="1">›</button>
      <button class="btn sm" data-m="0">이번 달</button>
      <label class="chk small"><input type="checkbox" data-alldays ${this.allDays ? '' : 'checked'}>정규 수업일만 보기</label></div>`;
    if (!this.classId) { main.innerHTML = h + '<div class="panel"><div class="empty">반이 없습니다. 반 관리에서 반을 만드세요.</div></div></div>'; this.bind(main); return; }
    const c = Store.get('classes', this.classId);
    const last = new Date(Y, M, 0).getDate();
    const dates = [];
    for (let d = 1; d <= last; d++) {
      const ds = Y + '-' + pad(M) + '-' + pad(d);
      if (this.allDays || (c.days || []).includes(dowOf(ds)) || Lessons.isSaved(c.id, ds)) dates.push(ds);
    }
    const sids = new Set();
    dates.forEach(d => {
      Classes.rosterAt(c.id, d).forEach(s => sids.add(s.id));
      const l = Store.get('lessons', Lessons.lessonId(c.id, d));
      if (l) Object.keys(l.att || {}).forEach(id => sids.add(id));
    });
    const studs = [...sids].map(id => Store.get('students', id)).filter(Boolean).sort((a, b) => Students.sortFn(a, b));
    const enrolledOn = (sid, d) => Store.where('enrollments', e => e.studentId === sid && e.classId === c.id && Classes.enrollValid(e, d)).length > 0;
    const today = todayStr();

    h += `<div class="toolbar small soft"><span>${esc(Classes.timeLabel(c))}</span><span>칸을 누를 때마다 출 → 지 → 결 → 조 → 빈칸 순으로 바뀌고 바로 저장됩니다. 정규 수업일이 아닌 날도 체크할 수 있습니다.</span></div>`;
    if (!dates.length || !studs.length) {
      h += `<div class="panel"><div class="empty">${!dates.length ? '이 달에 수업 날짜가 없습니다.' : '이 달에 이 반 수강생이 없습니다.'}</div></div></div>`;
      main.innerHTML = h; this.bind(main); return;
    }
    h += `<div class="tbl-wrap"><table class="tbl compact ab"><thead><tr><th class="ab-name">이름</th>${dates.map(d => {
      const sv = Lessons.isSaved(c.id, d);
      const reg = (c.days || []).includes(dowOf(d));
      return `<th class="ab-d ${d === today ? 'today' : ''} ${reg ? 'reg' : 'offday'} ${dowOf(d) === 0 ? 'sun' : ''}" title="${reg ? '정규 수업일' : '정규 수업일 아님'}${sv ? ' · 기록 있음' : ''}">${+d.slice(8)}<small>${DOW[dowOf(d)]}</small></th>`;
    }).join('')}<th class="num">출</th><th class="num">지</th><th class="num">결</th><th class="num">조</th></tr></thead><tbody>`;
    studs.forEach(s => {
      const sum = { P: 0, L: 0, A: 0, E: 0 };
      h += `<tr><td class="nowrap ab-name"><b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span></td>`;
      dates.forEach(d => {
        const l = Store.get('lessons', Lessons.lessonId(c.id, d));
        const st = l && l.att ? l.att[s.id] || '' : '';
        if (st) sum[st]++;
        const out = !enrolledOn(s.id, d);
        const reg = (c.days || []).includes(dowOf(d));
        h += `<td class="ab-c ${st} ${out ? 'out' : ''} ${reg ? 'reg' : ''}" data-d="${d}" data-sid="${s.id}" title="${out ? '수강 기간 밖' : ''}">${ATT_SHORT[st] || '<span class="dash">-</span>'}</td>`;
      });
      h += `<td class="num">${sum.P}</td><td class="num">${sum.L}</td><td class="num">${sum.A}</td><td class="num">${sum.E}</td></tr>`;
    });
    h += '</tbody></table></div></div>';
    main.innerHTML = h;
    this.bind(main);
  },

  bind(main) {
    main.onclick = (e) => {
      const m = e.target.closest('[data-m]');
      if (m) {
        if (m.dataset.m === '0') this.month = todayStr().slice(0, 7);
        else { const [y, mo] = this.month.split('-').map(Number); const d = new Date(y, mo - 1 + +m.dataset.m, 1); this.month = d.getFullYear() + '-' + pad(d.getMonth() + 1); }
        App.render(); return;
      }
      const cell = e.target.closest('td[data-d]');
      if (cell) {
        const l = Lessons.getOrNew(this.classId, cell.dataset.d);
        const att = Object.assign({}, l.att || {});
        const cur = att[cell.dataset.sid] || '';
        const next = this.CYCLE[(this.CYCLE.indexOf(cur) + 1) % this.CYCLE.length];
        if (next) att[cell.dataset.sid] = next; else delete att[cell.dataset.sid];
        Store.put('lessons', Object.assign({}, l, { att }));
        App.render();
      }
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-alldays]')) { this.allDays = !e.target.checked; App.render(); return; }
      if (e.target.matches('[data-cls]')) { this.classId = e.target.value; App.render(); }
      if (e.target.matches('[data-month]') && /^\d{4}-\d{2}$/.test(e.target.value)) { this.month = e.target.value; App.render(); }
    };
  },
};

/* =========================================================
   진도 — 반별 진도·숙제·메모·할일 기록 (확인 / 수정)
   ========================================================= */
const ProgressBook = {
  classId: '',
  q: '', from: '', to: '',

  render(main, p) {
    const classes = Classes.sorted(Store.all('classes')).sort((a, b) => (a.active === false) - (b.active === false));
    if (p.classId) this.classId = p.classId;
    if (!this.classId || !Store.get('classes', this.classId)) this.classId = classes[0] ? classes[0].id : '';
    const act = classes.filter(c => c.active !== false), ended = classes.filter(c => c.active === false);
    let h = `<div class="page-narrow"><div class="page-head"><h1>진도</h1></div>
      <div class="toolbar class-chips">${act.map(c => `<button class="chip ${c.id === this.classId ? 'active' : ''}" data-cls="${c.id}">${esc(c.name)}</button>`).join('')}
      ${ended.length ? `<select data-ended><option value="">종료된 반…</option>${ended.map(c => `<option value="${c.id}" ${c.id === this.classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}</div>`;
    if (!this.classId) { main.innerHTML = h + '<div class="panel"><div class="empty">반이 없습니다.</div></div></div>'; this.bind(main); return; }
    const q = this.q.trim();
    const todosOf = (lid) => Store.where('todos', t => t.lessonId === lid).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt));
    const list = Store.where('lessons', l => l.classId === this.classId)
      .filter(l => (!this.from || l.date >= this.from) && (!this.to || l.date <= this.to))
      .filter(l => !q || [l.progress, l.homework, l.memo, ...todosOf(l.id).map(t => t.text)].some(v => String(v || '').includes(q)))
      .sort((a, b) => ko(b.date, a.date));
    h += `<div class="toolbar"><input type="search" data-q value="${esc(this.q)}" placeholder="진도·숙제·메모·할일 검색" style="width:240px">
      <input type="date" data-from value="${esc(this.from)}"> ~ <input type="date" data-to value="${esc(this.to)}">
      ${this.q || this.from || this.to ? '<button class="btn sm ghost" data-clear>조건 지우기</button>' : ''}<span class="muted small">${list.length}회</span></div>`;
    h += list.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>날짜</th><th>출석</th><th>진도</th><th>숙제</th><th>메모</th><th>할일</th></tr></thead><tbody>${list.map(l => {
      const v = Object.values(l.att || {});
      const n = (k) => v.filter(x => x === k).length;
      const att = v.length ? `출${n('P')}${n('L') ? ' 지' + n('L') : ''}${n('A') ? ' <span style="color:var(--danger)">결' + n('A') + '</span>' : ''}${n('E') ? ' 조' + n('E') : ''}` : '<span class="muted">-</span>';
      const tds = todosOf(l.id);
      return `<tr class="click ${p.date === l.date ? 'hl' : ''}" data-id="${l.id}"><td class="nowrap"><b>${fmtMD(l.date)}</b></td><td class="nowrap small">${att}</td>
        <td class="pre">${highlight(l.progress || '', q)}</td><td class="pre">${highlight(l.homework || '', q)}</td><td class="pre small soft">${highlight(l.memo || '', q)}</td>
        <td class="small">${tds.map(t => `<div class="${t.done ? 'muted' : ''}">${t.done ? '☑' : '☐'} ${highlight(t.text, q)} <span class="muted">${fmtMD(t.date)}</span></div>`).join('')}</td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="panel"><div class="empty">${Store.where('lessons', l => l.classId === this.classId).length ? '조건에 맞는 기록이 없습니다.' : '이 반은 저장된 수업일지가 없습니다.'}</div></div>`;
    h += '</div>';
    main.innerHTML = h;
    this.bind(main);
    const hl = $('tr.hl', main); if (hl) hl.scrollIntoView({ block: 'center' });
  },

  bind(main) {
    main.onclick = (e) => {
      const ch = e.target.closest('[data-cls]'); if (ch) { this.classId = ch.dataset.cls; App.go('progress', {}); return; }
      if (e.target.closest('[data-clear]')) { this.q = this.from = this.to = ''; App.render(); return; }
      const tr = e.target.closest('tr[data-id]'); if (tr) this.openModal(tr.dataset.id);
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-ended]') && e.target.value) { this.classId = e.target.value; App.go('progress', {}); }
      if (e.target.matches('[data-from]')) { this.from = e.target.value; App.render(); }
      if (e.target.matches('[data-to]')) { this.to = e.target.value; App.render(); }
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) { this.q = e.target.value; App.render(); const i = $('[data-q]', main); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    }, 250);
  },

  openModal(id) {
    const l = Store.get('lessons', id);
    if (!l) return;
    const c = Store.get('classes', l.classId);
    const olds = Store.where('todos', t => t.lessonId === id).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt));
    const rows = olds.map(t => ({ id: t.id, text: t.text, date: t.date, done: !!t.done, del: false }));
    rows.push({ id: null, text: '', date: l.date, done: false, del: false });
    const todoHtml = () => rows.map((r, i) => r.del ? '' : `<div class="todo-row ${r.done ? 'done' : ''}">
      <input type="checkbox" data-rdone="${i}" ${r.done ? 'checked' : ''} ${r.id ? '' : 'disabled'}>
      <input type="text" data-rtext="${i}" value="${esc(r.text)}" placeholder="${r.id ? '' : '새 할일'}">
      <input type="date" class="todo-date" data-rdate="${i}" value="${esc(r.date)}">
      <button type="button" class="icon-btn" data-rdel="${i}" title="삭제">✕</button></div>`).join('');
    Modal.open({
      title: `${c ? c.name : ''} · ${fmtDate(l.date)}`, size: 'lg',
      body: `<div class="lesson-field"><label>수업 날짜</label><input type="date" name="ldate" value="${esc(l.date)}"></div>
        <div class="lesson-field"><label>진도</label><textarea name="progress" rows="4">${esc(l.progress)}</textarea></div>
        <div class="lesson-field"><label>숙제</label><textarea name="homework" rows="3">${esc(l.homework)}</textarea></div>
        <div class="lesson-field"><label>메모</label><textarea name="memo" rows="3">${esc(l.memo)}</textarea></div>
        <div class="lesson-field"><label>할일</label><div data-rows>${todoHtml()}</div>
          <div class="todo-actions"><button type="button" class="btn sm" data-radd>+ 할일 칸 추가</button></div></div>
        <p class="small muted">출석은 출석부 탭에서 고칩니다.</p>`,
      onMount: (b) => {
        enhanceAll(b);
        const box = $('[data-rows]', b);
        const redraw = () => { box.innerHTML = todoHtml(); };
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-rtext]')) rows[+t.dataset.rtext].text = t.value;
          if (t.matches('[data-rdate]')) rows[+t.dataset.rdate].date = t.value;
        });
        b.addEventListener('change', (e) => { if (e.target.matches('[data-rdone]')) { rows[+e.target.dataset.rdone].done = e.target.checked; redraw(); } });
        b.addEventListener('click', (e) => {
          const d = e.target.closest('[data-rdel]'); if (d) { rows[+d.dataset.rdel].del = true; redraw(); return; }
          if (e.target.closest('[data-radd]')) { rows.push({ id: null, text: '', date: l.date, done: false, del: false }); redraw(); const ins = $$('[data-rtext]', box); ins[ins.length - 1].focus(); }
        });
      },
      buttons: [
        { text: '완전 삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmHard('이 수업일지를 삭제할까요?\n출석, 진도·숙제·메모, 할일, 보강 기록이 함께 삭제됩니다.')) return false;
          Store.delWhere('todos', t => t.lessonId === id);
          Store.delWhere('makeups', m => m.lessonId === id);
          Store.del('lessons', id);
          toast('삭제했습니다'); App.render();
        } },
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const g = (n) => stripZws($(`[name=${n}]`, m.body).value);
          const nd = $('[name=ldate]', m.body).value;
          if (!isYmd(nd)) { toast('수업 날짜를 선택하세요'); return false; }
          let lid = id;
          if (nd !== l.date) {
            const nid = Lessons.lessonId(l.classId, nd);
            if (Store.get('lessons', nid)) { toast(fmtDate(nd) + '에 이 반 수업일지가 이미 있습니다'); return false; }
            lid = nid;
          }
          Store.put('lessons', Object.assign({}, Store.get('lessons', id) || l, { id: lid, date: nd, progress: g('progress'), homework: g('homework'), memo: g('memo') }));
          if (lid !== id) {
            // 날짜를 옮기면 딸린 할일·보강 기록도 새 날짜 수업으로 옮긴다
            Store.where('todos', t => t.lessonId === id).forEach(t => Store.put('todos', Object.assign({}, t, { lessonId: lid })));
            Store.where('makeups', mk => mk.lessonId === id).forEach(mk => {
              Store.del('makeups', mk.id);
              Store.put('makeups', Object.assign({}, mk, { id: Makeups.id(lid, mk.studentId), lessonId: lid, absentDate: nd }));
            });
            Store.del('lessons', id);
          }
          const now = Date.now();
          rows.forEach((r, i) => {
            const text = r.text.trim();
            if (r.id) {
              const t = Store.get('todos', r.id); if (!t) return;
              if (r.del || !text) Store.del('todos', r.id);
              else Store.put('todos', Object.assign({}, t, { text, date: isYmd(r.date) ? r.date : t.date, done: r.done }));
            } else if (!r.del && text) {
              Store.put('todos', { id: uid('TD'), lessonId: lid, classId: l.classId, date: isYmd(r.date) ? r.date : nd, text, done: false, createdAt: new Date(now + i).toISOString() });
            }
          });
          toast(lid !== id ? `저장했습니다 (${fmtMD(nd)}로 이동)` : '저장했습니다');
          if (lid !== id) App.go('progress', { classId: l.classId, date: nd }); else App.render();
        } },
      ],
    });
  },
};

/* =========================================================
   결석 보강 — 출석부의 결석을 자동으로 모아 보여준다
   ========================================================= */
const Makeups = {
  tab: 'open',
  q: '',
  id(lessonId, sid) { return 'M_' + lessonId + '_' + sid; },

  collect() {
    const out = [];
    Store.all('lessons').forEach(l => {
      Object.keys(l.att || {}).forEach(sid => {
        if (l.att[sid] !== 'A') return;
        const s = Store.get('students', sid);
        if (!s) return;
        const mk = Store.get('makeups', this.id(l.id, sid));
        out.push({ l, s, c: Store.get('classes', l.classId), mk, status: (mk && mk.status) || 'none' });
      });
    });
    return out;
  },

  copyText(o) {
    return `[${fmtDate(o.l.date)} ${o.c ? o.c.name : ''}]\n진도: ${stripZws(o.l.progress) || '-'}\n숙제: ${stripZws(o.l.homework) || '-'}`;
  },

  render(main) {
    const all = this.collect();
    const cnt = { open: 0, done: 0, skip: 0, all: all.length };
    all.forEach(o => { if (o.status === 'done') cnt.done++; else if (o.status === 'skip') cnt.skip++; else cnt.open++; });
    const q = this.q.trim();
    let list = all.filter(o => this.tab === 'all' || (this.tab === 'open' ? ['none', 'plan'].includes(o.status) : o.status === this.tab))
      .filter(o => !q || o.s.name.includes(q) || (o.c && o.c.name.includes(q)));
    if (this.tab === 'open') list.sort((a, b) => (a.status === 'plan' ? 0 : 1) - (b.status === 'plan' ? 0 : 1) || ko(a.mk && a.mk.date, b.mk && b.mk.date) || ko(b.l.date, a.l.date));
    else list.sort((a, b) => ko(b.l.date, a.l.date));

    let h = `<div class="page-head"><h1>보강</h1><span class="sub">출석부에서 결석 처리한 학생이 자동으로 모입니다</span></div>
      <div class="tabs">${[['open', '처리 필요'], ['done', '완료'], ['skip', '보강 안 함'], ['all', '전체']].map(([k, t]) => `<button data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${t}<span class="cnt">${cnt[k]}</span></button>`).join('')}</div>
      <div class="toolbar"><input type="search" data-q placeholder="학생 이름, 반 이름 검색" value="${esc(this.q)}" style="width:260px"></div>`;
    if (!list.length) h += `<div class="panel"><div class="empty">${all.length ? '해당하는 보강이 없습니다.' : '결석 기록이 없습니다.'}</div></div>`;
    list.forEach(o => {
      const mk = o.mk || {};
      const key = this.id(o.l.id, o.s.id);
      h += `<div class="mk-card ${o.status === 'done' || o.status === 'skip' ? 'done' : ''}" data-key="${key}">
        <div class="mk-top"><span class="who">${esc(o.s.name)}</span><span class="tag">${esc(stTag(o.s))}</span>
          ${o.s.status !== 'active' ? Students.statusBadge(o.s) : ''}
          <span class="badge red">결석 ${fmtMD(o.l.date)}</span><span class="soft small">${esc(o.c ? o.c.name : '(삭제된 반)')}</span>
          <span style="flex:1"></span><button class="btn sm" data-copy="${key}">진도·숙제 복사</button>
          <button class="btn sm ghost" data-golesson="${o.l.id}">진도 보기</button></div>
        <div class="mk-copy"><div><span class="k">진도</span><span class="pre">${esc(stripZws(o.l.progress)) || '<span class="muted">입력 전</span>'}</span></div>
          <div><span class="k">숙제</span><span class="pre">${esc(stripZws(o.l.homework)) || '<span class="muted">입력 전</span>'}</span></div></div>
        <div class="mk-ctl">
          <span class="small soft">보강일</span><input type="date" data-mf="date" value="${esc(mk.date || '')}">
          <input type="time" data-mf="time" step="300" value="${esc(mk.time || '')}">
          <select data-mf="status">${Object.keys(MK_STATUS).map(k => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${MK_STATUS[k]}</option>`).join('')}</select>
          <input type="text" data-mf="memo" value="${esc(mk.memo || '')}" placeholder="보강 메모"></div></div>`;
    });
    main.innerHTML = h;
    const byKey = {}; list.forEach(o => { byKey[this.id(o.l.id, o.s.id)] = o; });
    const saveField = (card, field, val) => {
      const o = byKey[card.dataset.key]; if (!o) return;
      const cur = Store.get('makeups', card.dataset.key) || { id: card.dataset.key, lessonId: o.l.id, studentId: o.s.id, classId: o.l.classId, absentDate: o.l.date, date: '', time: '', status: 'none', memo: '' };
      const rec = Object.assign({}, cur, { [field]: val });
      if (field === 'date' && val && rec.status === 'none') rec.status = 'plan';
      if (field === 'status' && val === 'done' && !rec.date) rec.date = todayStr();
      Store.put('makeups', rec);
    };
    main.onclick = async (e) => {
      const tb = e.target.closest('[data-tab]'); if (tb) { this.tab = tb.dataset.tab; App.render(); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const txt = this.copyText(byKey[cp.dataset.copy]);
        try { await navigator.clipboard.writeText(txt); toast('진도와 숙제를 복사했습니다'); }
        catch (_) { alertDlg('복사할 내용', txt); }
        return;
      }
      const gl = e.target.closest('[data-golesson]');
      if (gl) { const l = Store.get('lessons', gl.dataset.golesson); if (l) { App.selDate = l.date; MiniCal.showMonthOf(l.date); App.go('progress', { classId: l.classId, date: l.date }); } }
    };
    main.onchange = (e) => {
      const f = e.target.closest('[data-mf]'); if (!f) return;
      saveField(f.closest('[data-key]'), f.dataset.mf, f.value.trim());
      if (f.dataset.mf !== 'memo') App.render();
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) {
        this.q = e.target.value;
        App.render();
        const inp = $('[data-q]', main); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }
    }, 250);
  },
};

/* =========================================================
   할일 공용 표시 (날짜 상세 · 오늘)
   ========================================================= */
const Todos = {
  // 끌어서 정한 순서(order) → 없으면 만든 순서
  sortFn(a, b) {
    const oa = a.order == null ? 1e9 : a.order, ob = b.order == null ? 1e9 : b.order;
    return oa - ob || ko(a.createdAt, b.createdAt);
  },
  rowsHtml(list, opt = {}) {
    return list.map(t => {
      const c = Store.get('classes', t.classId);
      return `<div class="todo-row big ${t.done ? 'done' : ''}" data-tid="${t.id}" ${opt.drag ? 'draggable="true"' : ''}>
        ${opt.drag ? '<span class="grip" title="끌어서 순서 바꾸기">⠿</span>' : ''}
        <input type="checkbox" data-tdone="${t.id}" ${t.done ? 'checked' : ''}>
        <span class="tx">${esc(t.text)}</span>
        <span class="small muted nowrap" data-tgo="${t.id}" style="cursor:pointer" title="진도 탭에서 보기">${opt.showDate ? fmtMD(t.date) + ' ' : ''}${esc(c ? c.name : '')}</span>
        <button type="button" class="kebab" data-tmenu="${t.id}" title="메뉴">⋮</button></div>`;
    }).join('');
  },
  // 처리했으면 true
  handleClick(e) {
    const td = e.target.closest('[data-tdone]');
    if (td) {
      const t = Store.get('todos', td.dataset.tdone);
      if (t) { Store.put('todos', Object.assign({}, t, { done: td.checked })); App.render(); }
      return true;
    }
    const mn = e.target.closest('[data-tmenu]');
    if (mn) {
      const t = Store.get('todos', mn.dataset.tmenu); if (!t) return true;
      popMenu(mn, [
        { text: '날짜 변경', onClick: async () => {
          const d = await DatePicker.open(t.date, '할일 날짜 변경');
          if (!d || d === t.date) return;
          const cur = Store.get('todos', t.id); if (!cur) return;
          const max = Math.max(-1, ...Store.where('todos', x => x.date === d && x.order != null).map(x => x.order));
          Store.put('todos', Object.assign({}, cur, { date: d, order: max + 1 }));
          toast(`${fmtMD(d)} 할일로 옮겼습니다`);
          App.render();
        } },
        { text: '삭제', danger: true, onClick: () => { Store.del('todos', t.id); toast('할일을 삭제했습니다'); App.render(); } },
      ]);
      return true;
    }
    const tg = e.target.closest('[data-tgo]');
    if (tg) {
      const t = Store.get('todos', tg.dataset.tgo); if (!t) return true;
      const l = Store.get('lessons', t.lessonId);
      App.go('progress', { classId: t.classId, date: l ? l.date : '' });
      return true;
    }
    return false;
  },
  // 끌어서 순서 바꾸기
  bindDrag(box) {
    let dragId = null;
    const clear = () => $$('.drop-before,.drop-after', box).forEach(x => x.classList.remove('drop-before', 'drop-after'));
    box.addEventListener('dragstart', (e) => {
      const r = e.target.closest('[data-tid]'); if (!r) return;
      dragId = r.dataset.tid; r.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    box.addEventListener('dragend', () => { dragId = null; clear(); $$('.dragging', box).forEach(x => x.classList.remove('dragging')); });
    box.addEventListener('dragover', (e) => {
      const r = e.target.closest('[data-tid]'); if (!r || !dragId) return;
      e.preventDefault();
      clear();
      if (r.dataset.tid === dragId) return;
      const rc = r.getBoundingClientRect();
      r.classList.add(e.clientY > rc.top + rc.height / 2 ? 'drop-after' : 'drop-before');
    });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      const r = e.target.closest('[data-tid]');
      if (!r || !dragId || r.dataset.tid === dragId) { clear(); return; }
      const after = r.classList.contains('drop-after');
      const ids = $$('[data-tid]', box).map(x => x.dataset.tid).filter(id => id !== dragId);
      let i = ids.indexOf(r.dataset.tid); if (after) i++;
      ids.splice(i, 0, dragId);
      ids.forEach((id, k) => { const t = Store.get('todos', id); if (t && t.order !== k) Store.put('todos', Object.assign({}, t, { order: k })); });
      dragId = null;
      App.render();
    });
  },
};
