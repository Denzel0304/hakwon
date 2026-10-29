/* =========================================================
   lessons.js — 수업일지(출석·진도·숙제·메모·할일) + 결석 보강
   lesson: id = L_반ID_YYYYMMDD, { classId, date, progress, homework, memo, att:{학생ID:'P'|'L'|'A'|'E'} }
   todo:   { lessonId, classId, date, text, done, createdAt }
   makeup: id = M_수업ID_학생ID, { lessonId, studentId, classId, absentDate, date, time, status, memo }
   ========================================================= */
const ATT = { P: '출석', L: '지각', A: '결석', E: '조퇴' };
const MK_STATUS = { none: '미지정', plan: '예정', done: '완료', skip: '보강 안 함' };

const Lessons = {
  lessonId(classId, date) { return 'L_' + classId + '_' + compactDate(date); },
  getOrNew(classId, date) {
    return Store.get('lessons', this.lessonId(classId, date)) ||
      { id: this.lessonId(classId, date), classId, date, progress: '', homework: '', memo: '', att: {} };
  },
  classesOn(date) {
    const dow = dowOf(date);
    return Classes.sorted(Store.all('classes').filter(c => c.active !== false && (c.days || []).includes(dow)));
  },

  render(main, p) {
    const date = isYmd(p.date) ? p.date : App.selDate;
    const sched = this.classesOn(date);
    // 그날 일지가 있는 비정규 반도 칩에 포함
    const extra = Store.where('lessons', l => l.date === date && !sched.find(c => c.id === l.classId))
      .map(l => Store.get('classes', l.classId)).filter(Boolean);
    const chips = [...sched, ...extra];
    let classId = p.classId && Store.get('classes', p.classId) ? p.classId : (chips[0] && chips[0].id);
    if (classId && !chips.find(c => c.id === classId)) chips.push(Store.get('classes', classId));
    const others = Classes.sorted(Store.all('classes').filter(c => !chips.find(x => x.id === c.id)));

    let h = `<div class="page-narrow"><div class="page-head"><h1>수업일지</h1>
      <button class="btn sm" data-a="prev">‹</button><input type="date" data-date value="${date}"><button class="btn sm" data-a="next">›</button>
      <button class="btn sm" data-a="today">오늘</button><span class="sub">${DOW[dowOf(date)]}요일</span>
      <span class="grow"></span>${classId ? '<button class="btn primary" data-save>저장</button>' : ''}</div>
      <div class="toolbar class-chips">${chips.map(c => `<button class="chip ${c.id === classId ? 'active' : ''}" data-cls="${c.id}">${esc(c.name)}<small>${esc(c.start)}</small></button>`).join('')}
      ${others.length ? `<select data-other><option value="">다른 반 선택…</option>${others.map(c => `<option value="${c.id}">${esc(c.name)}${c.active === false ? ' (종료)' : ''}</option>`).join('')}</select>` : ''}</div>`;
    if (!classId) {
      h += `<div class="panel"><div class="empty">이 날은 정규 수업이 있는 반이 없습니다.${others.length ? ' 위의 “다른 반 선택”으로 일지를 쓸 반을 고르세요.' : ' 반 관리에서 반을 먼저 만드세요.'}</div></div></div>`;
      main.innerHTML = h;
      this.bind(main, date, null);
      return;
    }
    const c = Store.get('classes', classId);
    const les = this.getOrNew(classId, date);
    const roster = Classes.rosterAt(classId, date);
    const extraSt = Object.keys(les.att || {}).filter(sid => !roster.find(s => s.id === sid)).map(sid => Store.get('students', sid)).filter(Boolean);
    const people = [...roster, ...extraSt];
    const cnt = { P: 0, L: 0, A: 0, E: 0, none: 0 };
    people.forEach(s => { const a = les.att[s.id]; if (a) cnt[a]++; else cnt.none++; });
    const todos = Store.where('todos', t => t.lessonId === les.id).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt));
    const drafts = this.draftsOf(les.id, date);

    h += `<div class="grid-2"><div class="panel">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><h2 style="margin:0;flex:1">출석 <span class="sub">${esc(c.name)} · ${esc(Classes.timeLabel(c))}</span></h2>
      <button class="btn sm" data-allp ${people.length ? '' : 'disabled'}>전원 출석</button>
      <button class="btn sm" data-clearatt ${Object.keys(les.att || {}).length ? '' : 'disabled'}>전체 해제</button></div>
      <div class="att-sum"><span>출석 ${cnt.P}</span><span>지각 ${cnt.L}</span><span>결석 ${cnt.A}</span><span>조퇴 ${cnt.E}</span><span class="muted">미체크 ${cnt.none}</span></div>`;
    h += people.length ? people.map(s => {
      const a = les.att[s.id] || '';
      const mk = a === 'A' ? Store.get('makeups', Makeups.id(les.id, s.id)) : null;
      const mkTxt = a === 'A' ? `<span class="badge ${mk && mk.status === 'done' ? 'green' : mk && mk.status === 'plan' ? '' : 'red'}" data-gomk="${s.id}" style="cursor:pointer">보강 ${MK_STATUS[(mk && mk.status) || 'none']}</span>` : '';
      return `<div class="att-row"><div class="nm"><b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span>
        ${!roster.find(r => r.id === s.id) ? '<span class="badge gray">반 외</span>' : ''} ${mkTxt}</div>
        <div class="att-seg">${Object.keys(ATT).map(k => `<button class="${k} ${a === k ? 'on' : ''}" data-att="${k}" data-sid="${s.id}">${ATT[k]}</button>`).join('')}</div></div>`;
    }).join('') : '<div class="empty">이 날짜에 이 반 수강생이 없습니다. 반 관리에서 학생을 배정하세요.</div>';
    h += `</div><div class="panel">
      <div style="display:flex;align-items:center;margin-bottom:8px"><h2 style="margin:0;flex:1">수업 내용</h2><span class="save-ind" data-ind></span></div>
      <div class="lesson-field"><label>진도</label><textarea data-f="progress" rows="4" placeholder="오늘 나간 진도">${esc(les.progress)}</textarea></div>
      <div class="lesson-field"><label>숙제</label><textarea data-f="homework" rows="3" placeholder="내준 숙제">${esc(les.homework)}</textarea></div>
      <div class="lesson-field"><label>메모</label><textarea data-f="memo" rows="3">${esc(les.memo)}</textarea></div>
      <div class="lesson-field"><label>할일</label>
        <div data-todos>${todos.map(t => `<div class="todo-row ${t.done ? 'done' : ''}"><input type="checkbox" data-tdone="${t.id}" ${t.done ? 'checked' : ''}><span class="tx" data-tedit="${t.id}">${esc(t.text)}</span><input type="date" class="todo-date" data-tdate="${t.id}" value="${esc(t.date)}"><button class="icon-btn" data-tdel="${t.id}" title="삭제">✕</button></div>`).join('')}</div>
        <div class="todo-drafts">${drafts.map((d, i) => `<div class="todo-row"><input type="text" data-dtext="${i}" value="${esc(d.text)}" placeholder="새 할일"><input type="date" class="todo-date" data-ddate="${i}" value="${esc(d.date)}"><button class="icon-btn" data-ddel="${i}" title="칸 지우기">✕</button></div>`).join('')}</div>
        <div class="todo-actions"><button class="btn sm" data-dadd>+ 할일 칸 추가</button><button class="btn sm primary" data-dsave>일괄 추가</button></div></div>
      <p class="small muted" style="margin:10px 0 0">위의 “저장”을 누르면 출석·진도·숙제·메모·입력한 할일이 모두 저장됩니다. (Ctrl+Enter도 저장)</p>
    </div></div></div>`;
    main.innerHTML = h;
    this.bind(main, date, classId);

    // 텍스트 자동 저장
    const ind = $('[data-ind]', main);
    const save = () => {
      const cur = this.getOrNew(classId, date);
      $$('textarea[data-f]', main).forEach(ta => { cur[ta.dataset.f] = stripZws(ta.value); });
      Store.put('lessons', cur);
      ind.textContent = '저장됨 ' + new Date().toTimeString().slice(0, 5);
    };
    const later = debounce(save, 800);
    $$('textarea[data-f]', main).forEach(ta => {
      enhanceTextarea(ta, { onSave: () => this.saveAll(main, classId, date) });
      ta.addEventListener('input', () => { ind.textContent = '입력 중…'; later(); });
      ta.addEventListener('blur', () => { if (ind.textContent === '입력 중…') save(); });
    });
  },

  bind(main, date, classId) {
    const go = (d, cid) => { App.selDate = d; MiniCal.showMonthOf(d); App.go('lessons', { date: d, classId: cid }); };
    main.onclick = async (e) => {
      const a = e.target.closest('[data-a]');
      if (a) {
        if (a.dataset.a === 'today') go(todayStr(), null);
        else go(addDaysStr(date, a.dataset.a === 'prev' ? -1 : 1), null);
        return;
      }
      const ch = e.target.closest('[data-cls]'); if (ch) { go(date, ch.dataset.cls); return; }
      if (!classId) return;
      if (e.target.closest('[data-save]')) { this.saveAll(main, classId, date); return; }
      if (e.target.closest('[data-clearatt]')) {
        if (!await confirmDlg('이 수업의 출석 체크를 모두 해제할까요?', '전체 해제', true)) return;
        const cur = this.getOrNew(classId, date);
        Store.put('lessons', Object.assign({}, cur, { att: {} }));
        App.render();
        return;
      }
      const les0 = this.lessonId(classId, date);
      if (e.target.closest('[data-dadd]')) {
        this.draftsOf(les0, date).push({ text: '', date });
        App.render();
        const all = $$('[data-dtext]', $('#main')); if (all.length) all[all.length - 1].focus();
        return;
      }
      if (e.target.closest('[data-dsave]')) {
        const n = this.commitDrafts(classId, date);
        App.render();
        toast(n ? `할일 ${n}개를 추가했습니다` : '추가할 할일을 입력하세요');
        return;
      }
      const dd = e.target.closest('[data-ddel]');
      if (dd) { this.draftsOf(les0, date).splice(+dd.dataset.ddel, 1); App.render(); return; }
      const at = e.target.closest('[data-att]');
      if (at) {
        const cur = this.getOrNew(classId, date);
        cur.att = Object.assign({}, cur.att);
        if (cur.att[at.dataset.sid] === at.dataset.att) delete cur.att[at.dataset.sid];
        else cur.att[at.dataset.sid] = at.dataset.att;
        Store.put('lessons', cur);
        App.render();
        return;
      }
      if (e.target.closest('[data-allp]')) {
        const cur = this.getOrNew(classId, date);
        cur.att = Object.assign({}, cur.att);
        Classes.rosterAt(classId, date).forEach(s => { if (!cur.att[s.id]) cur.att[s.id] = 'P'; });
        Store.put('lessons', cur);
        App.render();
        return;
      }
      const gm = e.target.closest('[data-gomk]'); if (gm) { Makeups.q = (Store.get('students', gm.dataset.gomk) || {}).name || ''; Makeups.tab = 'all'; App.go('makeups'); return; }
      const td = e.target.closest('[data-tdone]');
      if (td) { const t = Store.get('todos', td.dataset.tdone); if (t) { Store.put('todos', Object.assign({}, t, { done: td.checked })); App.render(); } return; }
      const tdel = e.target.closest('[data-tdel]');
      if (tdel) { Store.del('todos', tdel.dataset.tdel); App.render(); return; }
      const te = e.target.closest('[data-tedit]');
      if (te) {
        const t = Store.get('todos', te.dataset.tedit); if (!t) return;
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = t.text;
        te.replaceWith(inp); inp.focus();
        const fin = (ok) => {
          if (inp._done) return; inp._done = true;
          const v = inp.value.trim();
          if (ok && v && v !== t.text) Store.put('todos', Object.assign({}, t, { text: v }));
          App.render();
        };
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) fin(true); if (ev.key === 'Escape') { ev.stopPropagation(); fin(false); } });
        inp.addEventListener('blur', () => fin(true));
      }
    };
    // 새 할일 칸: Enter → 다음 칸 추가
    main.onkeydown = (e) => {
      if (e.target.matches('[data-dtext]') && e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const list = this.draftsOf(this.lessonId(classId, date), date);
        const i = +e.target.dataset.dtext;
        if (i === list.length - 1) list.push({ text: '', date: list[i].date || date });
        App.render();
        const n = $(`[data-dtext="${i + 1}"]`, $('#main')); if (n) n.focus();
      }
    };
    // 새 할일 칸의 입력값은 화면이 다시 그려져도 남도록 기억한다
    main.oninput = (e) => {
      if (!classId) return;
      const list = this.draftsOf(this.lessonId(classId, date), date);
      if (e.target.matches('[data-dtext]')) list[+e.target.dataset.dtext].text = e.target.value;
      if (e.target.matches('[data-ddate]')) list[+e.target.dataset.ddate].date = e.target.value;
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-date]') && isYmd(e.target.value)) go(e.target.value, null);
      if (e.target.matches('[data-other]') && e.target.value) go(date, e.target.value);
      if (e.target.matches('[data-tdate]') && isYmd(e.target.value)) {
        const t = Store.get('todos', e.target.dataset.tdate);
        if (t) { Store.put('todos', Object.assign({}, t, { date: e.target.value })); App.render(); }
      }
    };
  },

  /* ---------- 새 할일 칸 (아직 추가 전) ---------- */
  drafts: {},
  draftsOf(lessonId, date) {
    if (!this.drafts[lessonId] || !this.drafts[lessonId].length) this.drafts[lessonId] = [{ text: '', date }];
    return this.drafts[lessonId];
  },
  // 입력한 새 할일을 한꺼번에 추가하고 추가한 개수를 돌려준다
  commitDrafts(classId, date) {
    const les = this.getOrNew(classId, date);
    const list = (this.drafts[les.id] || []).filter(d => d.text.trim());
    if (!list.length) return 0;
    if (!Store.get('lessons', les.id)) Store.put('lessons', les);
    const now = Date.now();
    list.forEach((d, i) => {
      Store.put('todos', { id: uid('TD'), lessonId: les.id, classId, date: isYmd(d.date) ? d.date : date, text: d.text.trim(), done: false, createdAt: new Date(now + i).toISOString() });
    });
    delete this.drafts[les.id];
    return list.length;
  },

  /* ---------- 저장: 진도·숙제·메모 + 새 할일을 저장하고 서버에 바로 반영 ---------- */
  async saveAll(main, classId, date) {
    const cur = this.getOrNew(classId, date);
    $$('textarea[data-f]', main).forEach(ta => { cur[ta.dataset.f] = stripZws(ta.value); });
    Store.put('lessons', cur);
    const n = this.commitDrafts(classId, date);
    App.render();
    await Store.syncNow();
    const extra = n ? ` · 할일 ${n}개 추가` : '';
    toast(Store.pendingCount() ? '저장했습니다 (인터넷 연결 후 서버에 자동 전송)' + extra : '저장했습니다' + extra);
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
          <button class="btn sm ghost" data-golesson="${o.l.id}">수업일지 보기</button></div>
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
      if (gl) { const l = Store.get('lessons', gl.dataset.golesson); if (l) { App.selDate = l.date; MiniCal.showMonthOf(l.date); App.go('lessons', { date: l.date, classId: l.classId }); } }
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
