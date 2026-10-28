/* =========================================================
   exams.js — 시험정보 + 성적(내신 / 모의고사)
   exam:  { school, grade, year, semester, kind:'mid'|'final', start, end, range,
            mcCount, mcPoints, essayCount, essayPoints, memo }
   score: id = S_학생_연도_학기_시험, { studentId, year, semester, kind, score, level:'9-2'|'5-1'|'', school, grade }
   mock:  { year, month, grade, memo }
   mock_score: id = MS_회차_학생, { mockId, studentId, raw, wrong:[번호] }
   ========================================================= */
const Exams = {
  year: '',
  sem: '',
  q: '',

  formatLabel(ex) {
    const mc = +ex.mcCount || 0, es = +ex.essayCount || 0;
    if (!mc && !es) return '';
    if (!es) return `전 문항 객관식 ${mc}문항` + (ex.mcPoints !== '' && ex.mcPoints != null ? ` (${ex.mcPoints}점)` : '');
    const a = mc ? `객관식 ${mc}문항${ex.mcPoints !== '' && ex.mcPoints != null ? ' ' + ex.mcPoints + '점' : ''}` : '';
    const b = `서술형 ${es}문항${ex.essayPoints !== '' && ex.essayPoints != null ? ' ' + ex.essayPoints + '점' : ''}`;
    return [a, b].filter(Boolean).join(' / ');
  },

  render(main) {
    const all = Store.all('exams');
    const years = [...new Set([new Date().getFullYear(), ...all.map(e => +e.year)])].sort((a, b) => b - a);
    const q = this.q.trim();
    const list = all.filter(e => (!this.year || +e.year === +this.year) && (!this.sem || +e.semester === +this.sem))
      .filter(e => !q || [e.school, examTitle(e), e.range, e.memo].some(v => String(v || '').includes(q)))
      .sort((a, b) => b.year - a.year || b.semester - a.semester || (a.kind === b.kind ? 0 : a.kind === 'final' ? -1 : 1) || ko(a.school, b.school) || a.grade - b.grade);
    let h = `<div class="page-head"><h1>시험정보</h1><span class="sub">학교별 시험 기간·범위·형식</span><span class="grow"></span><button class="btn primary" data-a="add">+ 시험 등록</button></div>
      <div class="toolbar">
        <select data-year><option value="">전체 연도</option>${years.map(y => `<option value="${y}" ${+this.year === y ? 'selected' : ''}>${y}년</option>`).join('')}</select>
        <select data-sem><option value="">전체 학기</option><option value="1" ${this.sem === '1' ? 'selected' : ''}>1학기</option><option value="2" ${this.sem === '2' ? 'selected' : ''}>2학기</option></select>
        <input type="search" data-q placeholder="학교, 범위, 메모 검색" value="${esc(this.q)}" style="width:240px">
        <span class="muted small">${list.length}건</span></div>`;
    h += list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>학교·학년</th><th>시험</th><th>시험 기간</th><th>범위</th><th>형식</th></tr></thead><tbody>${list.map(e => `
      <tr class="click" data-id="${e.id}"><td class="nowrap"><b>${highlight(schoolShort(e.school), q)}</b> ${gradeLabel(e.grade)}</td>
      <td class="nowrap">${e.year}년 ${e.semester}학기 ${EXAM_KIND[e.kind]}</td>
      <td class="nowrap">${e.start ? fmtMD(e.start) + (e.end && e.end !== e.start ? ' ~ ' + fmtMD(e.end) : '') : '<span class="muted">미정</span>'}</td>
      <td class="pre small">${highlight(e.range || '', q)}</td><td class="small">${esc(this.formatLabel(e))}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 시험이 없습니다.' : '등록된 시험이 없습니다. “시험 등록”으로 학교별 시험 범위를 기록하세요.'}</div></div>`;
    main.innerHTML = h;
    main.onclick = (e) => {
      if (e.target.closest('[data-a=add]')) { this.openModal(null); return; }
      const tr = e.target.closest('tr[data-id]'); if (tr) this.openModal(tr.dataset.id);
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-year]')) { this.year = e.target.value; App.render(); }
      if (e.target.matches('[data-sem]')) { this.sem = e.target.value; App.render(); }
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) { this.q = e.target.value; App.render(); const i = $('[data-q]', main); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    }, 250);
  },

  openModal(id) {
    const ex = id ? Store.get('exams', id) : null;
    const now = new Date();
    const v = ex || { school: '', grade: 10, year: now.getFullYear(), semester: now.getMonth() >= 6 ? 2 : 1, kind: 'mid', start: '', end: '', range: '', mcCount: '', mcPoints: '', essayCount: '', essayPoints: '', memo: '' };
    const body = `<div class="form">
      <label class="req">학교·학년</label><div class="row"><input type="text" name="school" list="dl-schools" value="${esc(v.school)}" placeholder="예: 금천고" style="flex:1"><select name="grade">${gradeOptions(v.grade)}</select></div>
      <label class="req">시험</label><div class="row"><input type="number" name="year" value="${esc(v.year)}" min="2000" max="2100" style="width:90px">년
        <select name="semester"><option value="1" ${+v.semester === 1 ? 'selected' : ''}>1학기</option><option value="2" ${+v.semester === 2 ? 'selected' : ''}>2학기</option></select>
        <select name="kind"><option value="mid" ${v.kind === 'mid' ? 'selected' : ''}>중간고사</option><option value="final" ${v.kind === 'final' ? 'selected' : ''}>기말고사</option></select></div>
      <label>시험 기간</label><div class="row"><input type="date" name="start" value="${esc(v.start)}"> ~ <input type="date" name="end" value="${esc(v.end)}"><span class="hint">하루면 시작일만</span></div>
      <label class="top">시험 범위</label><textarea name="range" rows="5" placeholder="예: 26년 10월 모의고사, 능률(오) 교과서 3-4과">${esc(v.range)}</textarea>
      <label>객관식</label><div class="row"><input type="number" name="mcCount" min="0" max="100" value="${esc(v.mcCount)}">문항 <input type="number" name="mcPoints" min="0" max="1000" step="0.1" value="${esc(v.mcPoints)}">점</div>
      <label>서술형</label><div class="row"><input type="number" name="essayCount" min="0" max="100" value="${esc(v.essayCount)}">문항 <input type="number" name="essayPoints" min="0" max="1000" step="0.1" value="${esc(v.essayPoints)}">점<span class="hint">없으면 비워 두세요 (전 문항 객관식)</span></div>
      <label class="top">메모</label><textarea name="memo" rows="3">${esc(v.memo)}</textarea>
    </div>`;
    Modal.open({
      title: ex ? '시험 수정' : '시험 등록', body, size: 'lg',
      onMount: (b) => enhanceAll(b),
      buttons: [
        ...(ex ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 시험 정보를 삭제할까요?', '삭제', true)) return false;
          Store.del('exams', ex.id); toast('삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body, g = (n) => $(`[name=${n}]`, b).value;
          const num = (n) => g(n) === '' ? '' : +g(n);
          const rec = Object.assign({}, ex || { id: uid('EX'), createdAt: new Date().toISOString() }, {
            school: g('school').trim(), grade: +g('grade'), year: +g('year'), semester: +g('semester'), kind: g('kind'),
            start: g('start'), end: g('end'), range: stripZws(g('range')),
            mcCount: num('mcCount'), mcPoints: num('mcPoints'), essayCount: num('essayCount'), essayPoints: num('essayPoints'),
            memo: stripZws(g('memo')),
          });
          if (!rec.school) { toast('학교를 입력하세요'); return false; }
          if (!rec.year || rec.year < 2000) { toast('연도를 확인하세요'); return false; }
          if (rec.end && !rec.start) { toast('시작일을 입력하세요'); return false; }
          if (rec.start && rec.end && rec.end < rec.start) { toast('종료일이 시작일보다 빠릅니다'); return false; }
          if (rec.start && !rec.end) rec.end = rec.start;
          Store.put('exams', rec);
          toast('시험 정보를 저장했습니다');
          App.render();
        } },
      ],
    });
  },
};

/* =========================================================
   성적
   ========================================================= */
const Scores = {
  tab: 'school',
  year: new Date().getFullYear(),
  sem: new Date().getMonth() >= 6 ? 2 : 1,
  kind: 'mid',
  school: '',
  mockId: '',

  levelLabel(lv) {
    if (!lv) return '-';
    const [sys, n] = String(lv).split('-');
    return n + '등급' + (sys === '5' ? ' (5등급제)' : '');
  },
  levelOptions(sel) {
    let h = '<option value="">등급 없음</option><optgroup label="9등급제">';
    for (let i = 1; i <= 9; i++) h += `<option value="9-${i}" ${sel === '9-' + i ? 'selected' : ''}>${i}등급</option>`;
    h += '</optgroup><optgroup label="5등급제">';
    for (let i = 1; i <= 5; i++) h += `<option value="5-${i}" ${sel === '5-' + i ? 'selected' : ''}>${i}등급 (5등급제)</option>`;
    return h + '</optgroup>';
  },
  scoreId(sid, y, s, k) { return 'S_' + sid + '_' + y + '_' + s + '_' + k; },
  mockTitle(mk) { return `${mk.year}년 ${mk.month}월 ${gradeLabel(mk.grade)} 모의고사`; },
  compressNums(arr) {
    const a = [...new Set(arr.map(Number))].filter(n => n >= 1 && n <= 45).sort((x, y) => x - y);
    const out = [];
    for (let i = 0; i < a.length; i++) {
      let j = i;
      while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
      out.push(j - i >= 2 ? a[i] + '-' + a[j] : (j > i ? a[i] + ', ' + a[j] : String(a[i])));
      i = j;
    }
    return out.join(', ');
  },
  parseNums(txt) {
    const nums = new Set(), bad = [];
    String(txt || '').split(/[\s,./]+/).filter(Boolean).forEach(tok => {
      let m;
      if ((m = tok.match(/^(\d{1,2})[-~](\d{1,2})$/))) {
        const a = +m[1], b = +m[2];
        if (a < 1 || b > 45 || a > b) { bad.push(tok); return; }
        for (let i = a; i <= b; i++) nums.add(i);
      } else if (/^\d{1,2}$/.test(tok) && +tok >= 1 && +tok <= 45) nums.add(+tok);
      else bad.push(tok);
    });
    return { nums: [...nums].sort((a, b) => a - b), bad };
  },

  render(main) {
    let h = `<div class="page-head"><h1>성적</h1></div>
      <div class="tabs"><button data-tab="school" class="${this.tab === 'school' ? 'active' : ''}">내신</button><button data-tab="mock" class="${this.tab === 'mock' ? 'active' : ''}">모의고사</button></div><div data-body></div>`;
    main.innerHTML = h;
    const body = $('[data-body]', main);
    main.onclick = (e) => { const tb = e.target.closest('[data-tab]'); if (tb) { this.tab = tb.dataset.tab; App.render(); } };
    main.onchange = null; main.oninput = null;
    if (this.tab === 'school') this.renderSchool(body); else this.renderMock(body);
  },

  /* ---------- 내신 ---------- */
  renderSchool(el) {
    const y = +this.year, s = +this.sem, k = this.kind;
    const existing = Store.where('scores', x => +x.year === y && +x.semester === s && x.kind === k);
    const exMap = {}; existing.forEach(x => { exMap[x.studentId] = x; });
    const cands = Store.where('students', st => (st.status === 'active' || st.status === 'pause') && +st.grade >= 7);
    const ids = new Set([...cands.map(st => st.id), ...existing.map(x => x.studentId)]);
    let rows = [...ids].map(id => Store.get('students', id)).filter(Boolean).map(st => {
      const sc = exMap[st.id];
      return { st, sc, school: sc ? sc.school : st.school, grade: sc ? sc.grade : st.grade };
    });
    const schools = [...new Set(rows.map(r => r.school || '학교미정'))].sort(ko);
    if (this.school) rows = rows.filter(r => (r.school || '학교미정') === this.school);
    rows.sort((a, b) => ko(a.school, b.school) || a.grade - b.grade || ko(a.st.name, b.st.name));
    const years = [...new Set([new Date().getFullYear(), ...Store.all('scores').map(x => +x.year)])].sort((a, b) => b - a);
    let h = `<div class="toolbar">
      <select data-y>${years.map(v => `<option value="${v}" ${v === y ? 'selected' : ''}>${v}년</option>`).join('')}</select>
      <select data-s><option value="1" ${s === 1 ? 'selected' : ''}>1학기</option><option value="2" ${s === 2 ? 'selected' : ''}>2학기</option></select>
      <select data-k><option value="mid" ${k === 'mid' ? 'selected' : ''}>중간고사</option><option value="final" ${k === 'final' ? 'selected' : ''}>기말고사</option></select>
      <select data-sch><option value="">전체 학교</option>${schools.map(v => `<option ${this.school === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
      <span class="muted small">입력 ${existing.length}명 · 점수를 입력하고 칸을 벗어나면 저장됩니다</span></div>`;
    h += rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>이름</th><th>학교·학년</th><th>점수</th><th>등급</th><th></th></tr></thead><tbody>${rows.map(r => `
      <tr data-sid="${r.st.id}"><td class="nowrap"><b>${esc(r.st.name)}</b> ${r.st.status !== 'active' ? Students.statusBadge(r.st) : ''}</td>
      <td class="nowrap">${esc(schoolGradeLabel(r.school, r.grade))}</td>
      <td><input type="number" class="score-in" data-score step="0.1" min="0" max="1000" value="${r.sc ? esc(r.sc.score) : ''}"></td>
      <td>${isHigh(r.grade) ? `<select data-level>${this.levelOptions(r.sc ? r.sc.level : '')}</select>` : '<span class="muted small">중학교 (등급 없음)</span>'}</td>
      <td class="small" data-st>${r.sc ? '<span class="badge green">저장됨</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="panel"><div class="empty">중·고등 학생이 없습니다.</div></div>';
    el.innerHTML = h;
    el.onchange = (e) => {
      if (e.target.matches('[data-y]')) { this.year = +e.target.value; App.render(); return; }
      if (e.target.matches('[data-s]')) { this.sem = +e.target.value; App.render(); return; }
      if (e.target.matches('[data-k]')) { this.kind = e.target.value; App.render(); return; }
      if (e.target.matches('[data-sch]')) { this.school = e.target.value; App.render(); return; }
      const tr = e.target.closest('tr[data-sid]');
      if (tr) this.saveSchoolRow(tr, y, s, k);
    };
  },
  saveSchoolRow(tr, y, s, k) {
    const sid = tr.dataset.sid, st = Store.get('students', sid);
    const scoreV = $('[data-score]', tr).value.trim();
    const lvEl = $('[data-level]', tr), level = lvEl ? lvEl.value : '';
    const id = this.scoreId(sid, y, s, k);
    const cur = Store.get('scores', id);
    const ind = $('[data-st]', tr);
    if (scoreV === '') {
      if (level) { ind.innerHTML = '<span class="badge red">점수를 입력하세요</span>'; return; }
      if (cur) { Store.del('scores', id); ind.innerHTML = '<span class="muted">삭제됨</span>'; }
      return;
    }
    const n = +scoreV;
    if (isNaN(n) || n < 0) { ind.innerHTML = '<span class="badge red">점수 확인</span>'; return; }
    Store.put('scores', Object.assign({}, cur || { id, studentId: sid, year: y, semester: s, kind: k, school: st.school, grade: st.grade }, { score: n, level }));
    ind.innerHTML = '<span class="badge green">저장됨</span>';
  },

  /* ---------- 모의고사 ---------- */
  renderMock(el) {
    const mocks = Store.all('mocks').sort((a, b) => b.year - a.year || b.month - a.month || a.grade - b.grade);
    if (!this.mockId || !Store.get('mocks', this.mockId)) this.mockId = mocks[0] ? mocks[0].id : '';
    let h = `<div class="split"><div class="panel mock-list"><div style="display:flex;align-items:center;margin-bottom:6px"><h2 style="margin:0;flex:1">회차</h2><button class="btn sm primary" data-addmock>+ 회차</button></div>`;
    h += mocks.length ? '<div class="list">' + mocks.map(mk => {
      const n = Store.where('mock_scores', x => x.mockId === mk.id).length;
      return `<div class="list-item click ${mk.id === this.mockId ? 'sel' : ''}" data-mock="${mk.id}"><div class="what">${esc(this.mockTitle(mk))}<div class="small muted">${n}명 입력</div></div></div>`;
    }).join('') + '</div>' : '<div class="empty">회차를 먼저 만드세요.</div>';
    h += '</div><div data-mockbody></div></div>';
    el.innerHTML = h;
    el.onclick = (e) => {
      if (e.target.closest('[data-addmock]')) { this.openMockModal(null); return; }
      const mk = e.target.closest('[data-mock]'); if (mk) { this.mockId = mk.dataset.mock; App.render(); }
    };
    if (this.mockId) this.renderMockBody($('[data-mockbody]', el), Store.get('mocks', this.mockId));
  },

  renderMockBody(el, mk) {
    const curY = new Date().getFullYear();
    const scores = Store.where('mock_scores', x => x.mockId === mk.id);
    const map = {}; scores.forEach(x => { map[x.studentId] = x; });
    const target = +mk.grade - (curY - +mk.year);          // 그 해 학년 → 지금 학년
    const cands = Store.where('students', s => (s.status === 'active' || s.status === 'pause') && +s.grade === target);
    const ids = new Set([...cands.map(s => s.id), ...scores.map(x => x.studentId)]);
    const rows = [...ids].map(id => Store.get('students', id)).filter(Boolean).sort((a, b) => ko(a.school, b.school) || ko(a.name, b.name));
    const raws = scores.filter(x => x.raw !== '' && x.raw != null).map(x => +x.raw);
    const avg = raws.length ? (raws.reduce((a, b) => a + b, 0) / raws.length).toFixed(1) : '-';
    const wc = {}; scores.forEach(x => (x.wrong || []).forEach(n => { wc[n] = (wc[n] || 0) + 1; }));
    const top = Object.keys(wc).map(Number).sort((a, b) => wc[b] - wc[a] || a - b).slice(0, 10);
    let h = `<div class="panel"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h2 style="margin:0;flex:1">${esc(this.mockTitle(mk))}</h2>
      <button class="btn sm" data-editmock>회차 수정</button></div>
      ${mk.memo ? `<div class="pre small soft" style="margin-top:4px">${esc(mk.memo)}</div>` : ''}
      <div style="display:flex;gap:18px;margin-top:10px;flex-wrap:wrap" class="small"><span>응시 <b>${raws.length}</b>명</span><span>평균 원점수 <b>${avg}</b></span></div>
      ${top.length ? `<div style="margin-top:8px"><div class="small soft" style="margin-bottom:4px">많이 틀린 문항</div><div class="top-wrong">${top.map(n => `<span class="badge red">${n}번 · ${wc[n]}명</span>`).join('')}</div></div>` : ''}
    </div>`;
    h += rows.length ? `<div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>이름</th><th>학교·학년</th><th class="num">원점수</th><th>틀린 번호</th><th></th></tr></thead><tbody>${rows.map(s => {
      const x = map[s.id];
      return `<tr><td class="nowrap"><b>${esc(s.name)}</b></td><td class="nowrap">${esc(stTag(s))}</td><td class="num"><b>${x && x.raw !== '' && x.raw != null ? esc(x.raw) : '<span class="muted">-</span>'}</b></td>
        <td class="small">${x && (x.wrong || []).length ? esc(this.compressNums(x.wrong)) + ` <span class="muted">(${x.wrong.length}개)</span>` : '<span class="muted">-</span>'}</td>
        <td class="nowrap"><button class="btn sm" data-ms="${s.id}">입력</button></td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="panel" style="margin-top:14px"><div class="empty">이 회차 학년(${gradeLabel(mk.grade)})에 해당하는 학생이 없습니다.</div></div>`;
    el.innerHTML = h;
    el.onclick = (e) => {
      if (e.target.closest('[data-editmock]')) { this.openMockModal(mk.id); return; }
      const b = e.target.closest('[data-ms]'); if (b) this.openWrongModal(mk, b.dataset.ms);
    };
  },

  openMockModal(id) {
    const mk = id ? Store.get('mocks', id) : null;
    const now = new Date();
    const v = mk || { year: now.getFullYear(), month: now.getMonth() + 1, grade: 10, memo: '' };
    Modal.open({
      title: mk ? '회차 수정' : '모의고사 회차 추가', size: 'sm',
      body: `<div class="form"><label class="req">연도</label><input type="number" name="year" value="${esc(v.year)}" min="2000" max="2100">
        <label class="req">월</label><select name="month">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${+v.month === i + 1 ? 'selected' : ''}>${i + 1}월</option>`).join('')}</select>
        <label class="req">학년</label><select name="grade">${gradeOptions(v.grade)}</select>
        <label class="top">메모</label><textarea name="memo" rows="3">${esc(v.memo)}</textarea></div>`,
      onMount: (b) => enhanceAll(b),
      buttons: [
        ...(mk ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmHard('이 회차와 입력된 학생 성적을 모두 삭제할까요?')) return false;
          Store.delWhere('mock_scores', x => x.mockId === mk.id); Store.del('mocks', mk.id); toast('삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const g = (n) => $(`[name=${n}]`, m.body).value;
          const rec = Object.assign({}, mk || { id: uid('MK') }, { year: +g('year'), month: +g('month'), grade: +g('grade'), memo: stripZws(g('memo')) });
          if (!rec.year || rec.year < 2000) { toast('연도를 확인하세요'); return false; }
          const dup = Store.where('mocks', x => x.id !== rec.id && +x.year === rec.year && +x.month === rec.month && +x.grade === rec.grade);
          if (dup.length) { toast('같은 회차가 이미 있습니다'); return false; }
          Store.put('mocks', rec); this.mockId = rec.id; App.render();
        } },
      ],
    });
  },

  openWrongModal(mk, sid) {
    const s = Store.get('students', sid);
    const id = 'MS_' + mk.id + '_' + sid;
    const cur = Store.get('mock_scores', id);
    let sel = new Set(cur ? cur.wrong || [] : []);
    let grid = '';
    for (let i = 1; i <= 45; i++) grid += `<button type="button" data-n="${i}" class="${sel.has(i) ? 'on' : ''}">${i}</button>`;
    Modal.open({
      title: `${s.name} · ${this.mockTitle(mk)}`, size: 'lg',
      body: `<div class="form"><label class="req">원점수</label><div class="row"><input type="number" name="raw" min="0" max="100" step="1" value="${cur && cur.raw != null ? esc(cur.raw) : ''}" style="width:100px"><span class="hint">0~100</span></div>
        <label>틀린 번호</label><div class="row"><input type="text" name="quick" value="${esc(this.compressNums([...sel]))}" placeholder="예: 3, 7, 12-15, 29" style="flex:1"><span data-cnt class="soft small"></span></div></div>
        <div class="wrong-err" data-err></div>
        <div class="wrong-grid">${grid}</div>
        <p class="small muted">번호를 눌러 켜고 끄거나, 위 칸에 쉼표·띄어쓰기로 입력하세요. 연속 번호는 12-15처럼 입력할 수 있습니다.</p>`,
      onMount: (b) => {
        const quick = $('[name=quick]', b), err = $('[data-err]', b), cnt = $('[data-cnt]', b);
        const paint = () => { $$('[data-n]', b).forEach(btn => btn.classList.toggle('on', sel.has(+btn.dataset.n))); cnt.textContent = sel.size + '개'; };
        paint();
        quick.addEventListener('input', () => {
          const r = this.parseNums(quick.value);
          sel = new Set(r.nums);
          err.textContent = r.bad.length ? '알 수 없는 입력: ' + r.bad.join(', ') + ' (1~45 사이 숫자만)' : '';
          paint();
        });
        $('.wrong-grid', b).addEventListener('click', (e) => {
          const btn = e.target.closest('[data-n]'); if (!btn) return;
          const n = +btn.dataset.n;
          if (sel.has(n)) sel.delete(n); else sel.add(n);
          quick.value = this.compressNums([...sel]); err.textContent = '';
          paint();
        });
      },
      buttons: [
        ...(cur ? [{ text: '기록 삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 학생의 이 회차 기록을 삭제할까요?', '삭제', true)) return false;
          Store.del('mock_scores', id); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const rawV = $('[name=raw]', m.body).value.trim();
          if (rawV === '') { toast('원점수를 입력하세요'); return false; }
          const raw = +rawV;
          if (isNaN(raw) || raw < 0 || raw > 100) { toast('원점수는 0~100 사이로 입력하세요'); return false; }
          if ($('[data-err]', m.body).textContent) { toast('틀린 번호 입력을 확인하세요'); return false; }
          Store.put('mock_scores', { id, mockId: mk.id, studentId: sid, raw, wrong: [...sel].sort((a, b) => a - b) });
          toast('저장했습니다'); App.render();
        } },
      ],
    });
  },
};
