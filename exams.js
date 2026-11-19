/* =========================================================
   exams.js — 시험정보 + 성적(내신 / 모의고사)
   exam:  { school, grade, year, semester, kind:'mid'|'final', start, end, range(기타 범위·메모),
            items(구조화된 시험 범위 — lessons.js의 NP 설명 참고), fmt:'mc'(객관식만)|'mix'(객관식+서술형), memo,
            done(완료된 시험), doneAt, dateEv(true: 시험 기간을 일정 탭의 시험 일정에서 가져옴) }
   시험 기간(start·end)은 일정 탭의 '시험 일정'(학교·학년·연도·학기·중간/기말이 같은 것)에서만 정한다 → syncDates
   교재는 meta 테이블에 저장 (NP.mats): 시험 교재(모의고사·교과서·부교재) / 일반 교재(type 'gen', 사용하는 반 classIds)
   교과서 ↔ 학교 연결(선택 사항): 교과서(type 'text')의 schools:[{ school(짧은 이름), grade, sem }]
     중학교 sem 0(1년 내내) / 고등학교 sem 1·2(그 학기만) 또는 0(1·2학기 모두) → 시험 등록 창의 교과서 추천에 쓴다
   score: id = S_학생_연도_학기_시험, { studentId, year, semester, kind, score, level:'9-2'|'5-1'|'', school, grade }
   mock:  { year, month, grade, memo }
   mock_score: id = MS_회차_학생, { mockId, studentId, raw, wrong:[번호], date(시행일 — 없으면 회차 달 1일로 봄) }
   성적 설정(meta): id SC_CFG, { kind:'sccfg', start:{ y, s, k } }  ← 성적 화면의 시작 시험
   교재 목록(meta, 보기 전용 — 다른 교재와 연결 없음): { id 'LU…', kind:'lineup', area:'read'|'gram'|'word'|'listen',
     series(시리즈), name, pub(출판사), level, memo, g1, g2(g1 또는 g1+1) }
   교재 목록 시리즈 순서(meta): id LU_ORDER, { kind:'luorder', areas:{ read:[시리즈 키…], … } }  ← 시리즈 키 = 시리즈명 (없으면 '#'+책 id)
   ========================================================= */
const Exams = {
  year: '',
  sem: '',
  q: '',
  tab: 'exam',          // 'exam' 진행중인 시험 / 'done' 완료된 시험 / 'mat' 시험 교재 / 'gen' 일반 교재 / 'lu' 교재 목록
  matType: '',
  matSchool: '',        // 시험 교재 목록의 학교 필터 ('' 전체 / 학교 / '__none' 학교 연결 없는 교과서)
  sel: new Set(),       // 체크한 항목 (탭을 바꾸거나 조건을 바꾸면 비움)
  prepOpen: new Set(),  // 수업 준비 칸을 펼친 시험

  FMT: { mc: '객관식만', mix: '객관식+서술형' },
  // 형식: fmt 'mc' | 'mix' (예전 기록은 문항 수로 판단)
  fmtOf(ex) { return this.FMT[ex.fmt] ? ex.fmt : (+ex.essayCount ? 'mix' : +ex.mcCount ? 'mc' : ''); },
  formatLabel(ex) { return this.FMT[this.fmtOf(ex)] || ''; },

  /* ---------- 시험 기간 ← 일정 탭의 시험 일정 ---------- */
  // 학교·학년·연도·학기·중간/기말이 같은 시험 일정 (여러 개면 가장 이른 날 ~ 가장 늦은 날)
  evRange(school, grade, year, sem, kind) {
    const s = schoolShort(school || '');
    if (!s || !kind) return null;
    const evs = Store.where('events', ev => evType(ev) === 'exam' && isYmd(ev.date) && schoolShort(ev.school || '') === s
      && evGrades(ev).includes(+grade) && +ev.year === +year && +ev.semester === +sem && ev.kind === kind);
    if (!evs.length) return null;
    return { start: evs.map(ev => ev.date).sort()[0], end: evs.map(ev => evEnd(ev)).sort().pop() };
  },
  // 모든 시험의 기간을 시험 일정에 맞춘다 (바뀐 것만 저장). 일정이 없어진 시험은 '미정'으로,
  // 일정과 연결된 적 없는 예전 직접 입력 날짜는 그대로 둔다
  syncDates() {
    Store.all('exams').forEach(ex => {
      const r = this.evRange(ex.school, ex.grade, ex.year, ex.semester, ex.kind);
      if (r) {
        if (ex.start !== r.start || ex.end !== r.end || !ex.dateEv) Store.put('exams', Object.assign({}, ex, { start: r.start, end: r.end, dateEv: true }));
      } else if (ex.dateEv) {
        const n = Object.assign({}, ex, { start: '', end: '' }); delete n.dateEv; Store.put('exams', n);
      }
    });
  },
  dateText(start, end) { return start ? fmtMD(start) + (end && end !== start ? ' ~ ' + fmtMD(end) : '') : ''; },

  /* ---------- 공통 머리 · 탭 · 일괄 처리 줄 ---------- */
  headHtml() {
    return `<div class="page-head"><h1>시험+교재</h1><button class="btn primary" data-a="add">+ 시험 등록</button><button class="btn primary" data-a="addmat">+ 교재 등록</button>
      <span class="sub">학교별 시험 기간·범위·형식 · 시험 교재 · 일반 교재</span></div>`;
  },
  tabsHtml() {
    const ex = Store.all('exams'), dn = ex.filter(e => e.done).length;
    const t = (k, label, n) => `<button data-xtab="${k}" class="${this.tab === k ? 'active' : ''}">${label}<span class="cnt">${n}</span></button>`;
    return `<div class="tabs">${t('exam', '진행중인 시험', ex.length - dn)}${t('done', '완료된 시험', dn)}${t('mat', '시험 교재', NP.examMats().length)}${t('gen', '일반 교재', NP.genMats().length)}${t('lu', '교재 목록', this.luBooks().length)}</div>`;
  },
  tabClick(e) {
    const t = e.target.closest('[data-xtab]'); if (!t) return false;
    if (this.tab !== t.dataset.xtab) { this.tab = t.dataset.xtab; this.sel.clear(); }
    App.render(); return true;
  },
  // 체크하면 살아나는 버튼 줄 (늘 자리를 차지해서 목록이 밀리지 않게)
  bulkHtml(acts) {
    const n = this.sel.size;
    return `<div class="bulk-bar${n ? '' : ' off'}" data-bulkbar><b class="x7-cnt" data-selcnt>${n}개 선택</b>
      ${acts.map(([a, t, cls]) => `<button class="btn sm ${cls || ''}" data-bulk="${a}" ${n ? '' : 'disabled'}>${t}</button>`).join('')}
      <span style="flex:1"></span><button class="btn sm" data-bulk="clear" ${n ? '' : 'disabled'}>선택 해제</button></div>`;
  },
  chkTh(ids) {
    const all = ids.length > 0 && ids.every(id => this.sel.has(id));
    return `<th class="chk-th"><label class="chk-hit" title="전체 선택"><input type="checkbox" data-chkall ${all ? 'checked' : ''}></label></th>`;
  },
  chkTd(id) { return `<td class="chk-td"><label class="chk-hit"><input type="checkbox" data-chk="${id}" ${this.sel.has(id) ? 'checked' : ''}></label></td>`; },
  // 다시 그리지 않고 일괄 처리 줄과 전체 선택 칸만 맞춘다
  updBulk(main) {
    const bar = $('[data-bulkbar]', main), cnt = $('[data-selcnt]', main), ca = $('[data-chkall]', main);
    const boxes = $$('[data-chk]', main);
    if (bar) { bar.classList.toggle('off', !this.sel.size); $$('[data-bulk]', bar).forEach(b => { b.disabled = !this.sel.size; }); }
    if (cnt) cnt.textContent = this.sel.size + '개 선택';
    if (ca) { ca.checked = boxes.length > 0 && boxes.every(c => c.checked); ca.indeterminate = this.sel.size > 0 && !ca.checked; }
  },
  // 체크박스·일괄 버튼·등록 버튼 (시험·교재 화면 공용). 처리했으면 true
  commonClick(e, main) {
    if (this.tabClick(e)) return true;
    if (e.target.closest('[data-a=add]')) { this.openModal(null); return true; }
    if (e.target.closest('[data-a=addmat]')) { if (this.tab === 'lu') this.openLuModal(null); else this.openMatModal(null); return true; }
    const bk = e.target.closest('[data-bulk]');
    if (bk) { if (!bk.disabled) this.bulk(bk.dataset.bulk); return true; }
    if (e.target.closest('.chk-hit')) return true;       // 체크박스 칸은 창을 열지 않음
    return false;
  },
  commonChange(e, main) {
    if (e.target.matches('[data-chk]')) { if (e.target.checked) this.sel.add(e.target.dataset.chk); else this.sel.delete(e.target.dataset.chk); this.updBulk(main); return true; }
    if (e.target.matches('[data-chkall]')) {
      $$('[data-chk]', main).forEach(c => { c.checked = e.target.checked; if (c.checked) this.sel.add(c.dataset.chk); else this.sel.delete(c.dataset.chk); });
      this.updBulk(main); return true;
    }
    return false;
  },

  /* ---------- 시험 목록 (진행중 / 완료) ---------- */
  render(main) {
    this.syncDates();                   // 다른 기기에서 바뀐 시험 일정도 반영
    if (this.tab === 'lu') { this.renderLineup(main); return; }
    if (this.tab === 'mat' || this.tab === 'gen') { this.renderMats(main); return; }
    const done = this.tab === 'done';
    const all = Store.all('exams');
    const years = [...new Set([new Date().getFullYear(), ...all.map(e => +e.year)])].sort((a, b) => b - a);
    const q = this.q.trim();
    const list = all.filter(e => !!e.done === done)
      .filter(e => (!this.year || +e.year === +this.year) && (!this.sem || +e.semester === +this.sem))
      .filter(e => !q || [e.school, examTitle(e), e.range, NP.rangeText(e), e.memo].some(v => String(v || '').includes(q)))
      .sort(done
        ? (a, b) => b.year - a.year || b.semester - a.semester || (a.kind === b.kind ? 0 : a.kind === 'final' ? -1 : 1) || ko(a.school, b.school) || a.grade - b.grade
        // 진행중인 시험: 낮은 학년부터 → 같은 학년이면 학교 이름 순 (같은 학교·학년끼리는 최근 시험 먼저)
        : (a, b) => a.grade - b.grade || ko(schoolShort(a.school), schoolShort(b.school)) || b.year - a.year || b.semester - a.semester || (a.kind === b.kind ? 0 : a.kind === 'final' ? -1 : 1));
    const ids = list.map(e => e.id);
    [...this.sel].forEach(id => { if (!ids.includes(id)) this.sel.delete(id); });     // 보이지 않는 항목은 선택에서 뺀다
    const cols = done ? 6 : 7;
    let h = this.headHtml() + this.tabsHtml() + `
      <div class="toolbar">
        <select data-year><option value="">전체 연도</option>${years.map(y => `<option value="${y}" ${+this.year === y ? 'selected' : ''}>${y}년</option>`).join('')}</select>
        <select data-sem><option value="">전체 학기</option><option value="1" ${this.sem === '1' ? 'selected' : ''}>1학기</option><option value="2" ${this.sem === '2' ? 'selected' : ''}>2학기</option></select>
        <input type="search" data-q placeholder="학교, 범위, 메모 검색" value="${esc(this.q)}" style="width:240px">
        <span class="muted small">${list.length}건</span></div>`;
    h += this.bulkHtml(done ? [['undone', '진행중으로 되돌리기'], ['delexam', '선택 삭제', 'danger']] : [['done', '완료 처리'], ['delexam', '선택 삭제', 'danger']]);
    h += list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${this.chkTh(ids)}<th>학교·학년</th><th>시험</th><th>시험 기간</th><th>범위</th><th>형식</th>${done ? '' : '<th>수업 준비</th>'}</tr></thead><tbody>${list.map(e => {
      const open = !done && this.prepOpen.has(e.id);
      const pi = done ? null : this.prepInfo(e);
      return `<tr class="click" data-id="${e.id}">${this.chkTd(e.id)}<td class="nowrap"><b>${highlight(schoolShort(e.school), q)}</b> ${gradeLabel(e.grade)}</td>
      <td class="nowrap">${e.year}년 ${e.semester}학기 ${EXAM_KIND[e.kind]}</td>
      <td class="nowrap">${e.start ? fmtMD(e.start) + (e.end && e.end !== e.start ? ' ~ ' + fmtMD(e.end) : '') : '<span class="muted">미정</span>'}</td>
      <td class="pre small">${NP.rangeText(e) ? `<div>${highlight(NP.rangeText(e), q)}</div>` : ''}${e.range ? `<div class="${NP.rangeText(e) ? 'soft' : ''}">${highlight(e.range, q)}</div>` : ''}</td><td class="small nowrap">${esc(this.formatLabel(e))}</td>
      ${done ? '' : `<td class="x7-prepcell ${open ? 'on' : ''}" data-prep="${e.id}" title="눌러서 수업 준비 표시">${this.prepCellHtml(pi, open)}</td>`}</tr>
      ${open ? `<tr class="x7-prow"><td colspan="${cols}">${this.prepChipsHtml(pi)}</td></tr>` : ''}`;
    }).join('')}</tbody></table></div>`
      : `<div class="panel"><div class="empty">${all.some(e => !!e.done === done) ? '조건에 맞는 시험이 없습니다.' : done ? '완료된 시험이 없습니다. 진행중인 시험에서 체크한 뒤 “완료 처리”를 누르면 이곳으로 옮겨집니다.' : '진행중인 시험이 없습니다. “시험 등록”으로 학교별 시험 범위를 기록하세요.'}</div></div>`;
    main.innerHTML = h;
    this.updBulk(main);
    main.onclick = (e) => {
      if (this.commonClick(e, main)) return;
      const pp = e.target.closest('[data-pp]');
      if (pp) { const [mid, what, uid, n] = pp.dataset.pp.split('|'); NP.togglePrep(mid, what, uid, n ? +n : null); App.render(); return; }
      const pc = e.target.closest('[data-prep]');
      if (pc) { const id = pc.dataset.prep; if (this.prepOpen.has(id)) this.prepOpen.delete(id); else this.prepOpen.add(id); App.render(); return; }
      if (e.target.closest('.x7-prow')) return;
      const tr = e.target.closest('tr[data-id]'); if (tr) this.openModal(tr.dataset.id);
    };
    main.onchange = (e) => {
      if (this.commonChange(e, main)) return;
      if (e.target.matches('[data-year]')) { this.year = e.target.value; this.sel.clear(); App.render(); }
      if (e.target.matches('[data-sem]')) { this.sem = e.target.value; this.sel.clear(); App.render(); }
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) { this.q = e.target.value; this.sel.clear(); App.render(); const i = $('[data-q]', main); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    }, 250);
  },

  /* ---------- 수업 준비 (교재 기준 · 진도 탭 내신 요약과 같은 기록) ---------- */
  // 범위를 칸 하나하나로 펼쳐 준비 여부를 센다 → { groups:[{ mat, cells }], tot, ok, next }
  prepInfo(ex) {
    const groups = [];
    let tot = 0, ok = 0, next = null;
    NP.rangeOf([ex]).forEach(r => {
      const m = r.mat, pk = NP.prepOf(m.id), cells = [];
      const add = (c) => { cells.push(c); tot++; if (c.ok) ok++; else if (!next) { next = c; c.next = true; } };
      if (m.type === 'mock') r.nums.forEach(n => add({ ok: NP.prepNum(pk, n), pp: `${m.id}|num||${n}`, text: String(n), label: `${NP.shortName(m)} ${n}번` }));
      else r.units.forEach(u => {
        if (!u.nums) add({ ok: NP.prepUnit(pk, u), pp: `${m.id}|unit|${u.id}|`, text: u.name, label: `${m.name} ${u.name}` });
        else u.nums.forEach(n => add({ ok: NP.prepUnum(pk, u.id, n), pp: `${m.id}|unum|${u.id}|${n}`, text: String(n), unit: u, label: `${m.name} ${u.name} ${n}번` }));
      });
      groups.push({ mat: m, cells });
    });
    return { groups, tot, ok, next };
  },
  prepCellHtml(pi, open) {
    if (!pi.tot) return '<span class="small muted">범위 없음</span>';
    const pct = Math.round(pi.ok / pi.tot * 100);
    return `<div class="x7-pp"><b>준비 ${pi.ok} / ${pi.tot}</b><span class="x7-bar"><i style="width:${pct}%"></i></span><span class="x7-ar">${open ? '▲' : '▼'}</span></div>
      <div class="small ${pi.next ? 'x7-nx' : 'x7-ok'}">${pi.next ? '다음: ' + esc(pi.next.label) : '준비 완료 ✓'}</div>`;
  },
  prepChipsHtml(pi) {
    if (!pi.tot) return '<div class="small muted">구조화된 시험 범위가 없습니다. 시험을 눌러 범위를 입력하세요.</div>';
    const chip = (c) => `<button type="button" class="np-c ${c.ok ? 'prep' : ''} ${c.next ? 'x7-next' : ''}" data-pp="${c.pp}">${esc(c.text)}</button>`;
    return pi.groups.map(g => {
      const m = g.mat, okN = g.cells.filter(c => c.ok).length;
      // 번호가 있는 과·강은 이름표 뒤에 번호를 묶어 보여준다
      let body = '', grp = null;
      g.cells.forEach(c => {
        if (c.unit) {
          if (grp !== c.unit.id) { if (grp) body += '</span>'; grp = c.unit.id; body += `<span class="np-grp"><span class="np-ul">${esc(c.unit.name)}</span>`; }
        } else if (grp) { body += '</span>'; grp = null; }
        body += chip(c);
      });
      if (grp) body += '</span>';
      return `<div class="np-srow"><div class="np-mhead"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span><b>${esc(NP.matName(m))}</b><span class="small soft">준비 ${okN}/${g.cells.length}</span></div>
        <div class="np-chips">${body}</div></div>`;
    }).join('') + `<div class="np-legend small soft"><span class="np-c prep">준비 완료</span><span class="np-c x7-next">다음</span>
      <span>누르면 준비 완료 / 취소 · 같은 교재를 쓰는 다른 시험과 진도 탭 내신 요약에도 함께 표시됩니다</span></div>`;
  },

  /* ---------- 일괄 처리 ---------- */
  async bulk(act) {
    if (act === 'clear') { this.sel.clear(); App.render(); return; }
    if (act === 'delmat') { await this.delMats([...this.sel]); return; }
    const list = [...this.sel].map(id => Store.get('exams', id)).filter(Boolean);
    if (!list.length) return;
    if (act === 'done') {
      if (!await confirmDlg(`시험 ${list.length}개를 완료 처리할까요?\n완료된 시험 탭으로 옮겨지고, 수업일지·진도 요약의 시험 선택에는 나오지 않습니다.`, '완료 처리')) return;
      const now = new Date().toISOString();
      list.forEach(e => Store.put('exams', Object.assign({}, e, { done: true, doneAt: now })));
      list.forEach(e => this.prepOpen.delete(e.id));
      this.sel.clear(); toast(`시험 ${list.length}개를 완료된 시험으로 옮겼습니다`); App.render();
    } else if (act === 'undone') {
      if (!await confirmDlg(`시험 ${list.length}개를 진행중인 시험으로 되돌릴까요?`, '되돌리기')) return;
      list.forEach(e => { const r = Object.assign({}, e); delete r.done; delete r.doneAt; Store.put('exams', r); });
      this.sel.clear(); toast(`시험 ${list.length}개를 진행중인 시험으로 되돌렸습니다`); App.render();
    } else if (act === 'delexam') {
      if (!await confirmDlg(`시험 ${list.length}개를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`, '삭제', true)) return;
      list.forEach(e => {
        Store.del('exams', e.id);
        Store.delWhere('meta', m => m.kind === 'pman' && m.examId === e.id);   // 이 시험의 수동 진도 표시
        this.prepOpen.delete(e.id);
      });
      this.sel.clear(); toast(`시험 ${list.length}개를 삭제했습니다`); App.render();
    }
  },
  // 교재가 연결된 곳 (시험 교재: 시험 / 일반 교재: 반) → 문장 목록
  matLinks(m) {
    if (m.type === 'gen') return (m.classIds || []).map(id => Store.get('classes', id)).filter(Boolean).map(c => '반: ' + c.name + (c.active === false ? ' (종료)' : ''))
      .concat(Books.studentsOfMat(m.id).sort((a, b) => ko(a.name, b.name)).map(s => '학생(진행 중): ' + s.name + (stTag(s) ? ' ' + stTag(s) : '')));
    return Store.where('exams', e => (e.items || []).some(it => it.matId === m.id))
      .sort((a, b) => b.year - a.year || b.semester - a.semester || ko(a.school, b.school) || a.grade - b.grade)
      .map(e => `시험: ${schoolShort(e.school)} ${gradeLabel(e.grade)} · ${e.year}년 ${e.semester}학기 ${EXAM_KIND[e.kind] || ''}${e.done ? ' (완료된 시험)' : ''}`);
  },
  // 연결돼 있어 지우지 못한 교재 안내 (메모할 수 있게 모달로)
  showBlocked(blocked, deleted) {
    Modal.open({
      title: '삭제할 수 없는 교재', size: 'lg', autofocus: false,
      body: `${deleted ? `<p class="small" style="margin-top:0">${deleted}개는 삭제했습니다.</p>` : ''}
        <p class="small" style="margin-top:0">아래 교재는 연결된 곳이 있어 삭제하지 않았습니다. 연결을 먼저 풀어 주세요.
        <span class="soft">(시험 교재: 시험 범위에서 빼기 / 일반 교재: 교재 수정에서 반 연결 해제, 학생 › 교재에서 진행 중인 학생 완료·중단 처리)</span></p>
        ${blocked.map(({ m, links }) => `<div class="x7-blk"><div><span class="np-tag ${m.type}">${m.type === 'gen' ? '일반' : MAT_TYPE[m.type]}</span> <b>${esc(NP.matName(m))}</b> <span class="small soft">${links.length}곳</span></div>
          <ul>${links.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}`,
      buttons: [{ text: '확인', cls: 'primary', primary: true }],
    });
  },
  async delMats(ids) {
    const mats = ids.map(id => NP.mat(id)).filter(Boolean);
    if (!mats.length) return;
    const blocked = [], ok = [];
    mats.forEach(m => { const links = this.matLinks(m); if (links.length) blocked.push({ m, links }); else ok.push(m); });
    if (!ok.length) { this.showBlocked(blocked, 0); return; }
    const hist = ok.reduce((n, m) => n + (m.type === 'gen' ? Books.recsOfMat(m.id).length : 0), 0);
    if (!await confirmDlg(`교재 ${ok.length}개를 삭제할까요?${blocked.length ? `\n연결된 교재 ${blocked.length}개는 삭제하지 않습니다.` : ''}\n시험 교재의 수업 준비 표시도 함께 지워집니다.${hist ? `\n학생 교재 이력 ${hist}건은 교재 이름으로 남습니다.` : ''}`, '삭제', true)) return;
    ok.forEach(m => { if (m.type === 'gen') Books.keepName(m); Store.del('meta', m.id); Store.del('meta', NP.ppId(m.id)); this.sel.delete(m.id); });
    toast(`교재 ${ok.length}개를 삭제했습니다`);
    App.render();
    if (blocked.length) this.showBlocked(blocked, ok.length);
  },

  /* ---------- 교과서 ↔ 학교 연결 (교과서에만 · 선택 사항) ----------
     연결이 없어도 모든 기능은 지금처럼 쓰고, 연결해 둔 교과서만 시험 등록 때 추천된다 */
  lkSem(grade, sem) { return isHigh(grade) && (+sem === 1 || +sem === 2) ? +sem : 0; },
  lkNorm(lk) { return { school: schoolShort(lk.school), grade: +lk.grade, sem: this.lkSem(lk.grade, lk.sem) }; },
  lkSort(list) { return list.sort((a, b) => ko(a.school, b.school) || a.grade - b.grade || (a.sem || 3) - (b.sem || 3)); },
  linksOf(m) {
    if (!m || m.type !== 'text') return [];
    return this.lkSort((m.schools || []).map(lk => this.lkNorm(lk)).filter(lk => lk.school && (isMiddle(lk.grade) || isHigh(lk.grade))));
  },
  // 금천중 중2 / 금천고 고2 1학기 / 금천고 고2 1·2학기
  lkLabel(lk) { return `${schoolShort(lk.school)} ${gradeLabel(lk.grade)}` + (isHigh(lk.grade) ? ' ' + (+lk.sem ? lk.sem + '학기' : '1·2학기') : ''); },
  // 이 연결이 그 학교·학년·학기에 해당하는지 (중학교는 학기 무관, 고등학교 sem 0은 두 학기 모두)
  lkHit(lk, school, grade, sem) { return lk.school === schoolShort(school) && lk.grade === +grade && (!isHigh(grade) || !lk.sem || lk.sem === +sem); },
  // 그 학교·학년·학기에 연결된 교과서
  textsFor(school, grade, sem) {
    if (!schoolShort(school) || !(isMiddle(grade) || isHigh(grade))) return [];
    return NP.sortMats(NP.examMats().filter(m => m.type === 'text' && this.linksOf(m).some(lk => this.lkHit(lk, school, grade, sem))));
  },
  // 이미 들어 있는 연결인지 (c.sem 0 = 두 학기 모두가 들어 있어야 함)
  lkCovered(links, c) {
    c = this.lkNorm(c);
    const same = links.filter(lk => lk.school === c.school && lk.grade === c.grade);
    if (!isHigh(c.grade)) return same.length > 0;
    if (same.some(lk => !lk.sem)) return true;
    return c.sem ? same.some(lk => lk.sem === c.sem) : (same.some(lk => lk.sem === 1) && same.some(lk => lk.sem === 2));
  },
  // 연결 추가 → 새 목록 (이미 있으면 null). 고등학교는 1·2학기 모두(또는 1학기+2학기)가 되면 하나로 합친다
  lkAdd(links, c) {
    c = this.lkNorm(c);
    if (!c.school || !(isMiddle(c.grade) || isHigh(c.grade)) || this.lkCovered(links, c)) return null;
    let out = links.slice();
    if (isHigh(c.grade)) {
      const other = c.sem && out.some(lk => lk.school === c.school && lk.grade === c.grade && lk.sem === 3 - c.sem);
      if (!c.sem || other) { out = out.filter(lk => !(lk.school === c.school && lk.grade === c.grade)); c = Object.assign({}, c, { sem: 0 }); }
    }
    out.push(c);
    return this.lkSort(out);
  },
  // [{ mat, school, grade, sem }] → 교과서별로 모아 저장. 추가한 연결 수
  lkApply(list) {
    const by = new Map(); let n = 0;
    list.forEach(c => {
      const m = NP.mat(c.mat.id); if (!m || m.type !== 'text') return;
      const cur = by.get(m.id) || { m, links: this.linksOf(m), ch: false };
      const nx = this.lkAdd(cur.links, c);
      if (nx) { cur.links = nx; cur.ch = true; n++; }
      by.set(m.id, cur);
    });
    by.forEach(({ m, links, ch }) => { if (ch) Store.put('meta', Object.assign({}, m, { schools: links })); });
    return n;
  },
  // 학교 고르기 목록: 프로그램에 있는 학교(학생·시험·일정) + 교과서에 연결된 학교 (같은 학교는 하나로)
  schoolPick() {
    const seen = new Set(), out = [];
    const links = NP.examMats().reduce((a, m) => a.concat(this.linksOf(m).map(lk => lk.school)), []);
    schoolOptions().concat(links).forEach(s => { const k = schoolShort(s); if (k && !seen.has(k)) { seen.add(k); out.push(s.trim()); } });
    return out.sort(ko);
  },
  // 기존 시험 범위에서 찾은, 아직 연결되지 않은 교과서·학교 (matId를 주면 그 교과서만)
  // 고등학교: 한 학기 시험에만 쓰였으면 그 학기, 두 학기 시험에 다 쓰였으면 1·2학기 모두
  lkCands(matId) {
    const map = new Map();
    Store.all('exams').forEach(ex => {
      const sch = schoolShort(ex.school), g = +ex.grade;
      if (!sch || !(isMiddle(g) || isHigh(g))) return;
      (ex.items || []).forEach(it => {
        if (matId && it.matId !== matId) return;
        const m = NP.mat(it.matId); if (!m || m.type !== 'text') return;
        const k = m.id + '|' + sch + '|' + g;
        let o = map.get(k);
        if (!o) { o = { mat: m, school: sch, grade: g, sems: new Set(), exams: [] }; map.set(k, o); }
        o.sems.add(+ex.semester); o.exams.push(ex);
      });
    });
    const out = [];
    map.forEach(o => {
      const c = { mat: o.mat, school: o.school, grade: o.grade, sem: isHigh(o.grade) && o.sems.size === 1 ? [...o.sems][0] : 0,
        exams: o.exams.sort((a, b) => NP.examKey(b) - NP.examKey(a)) };
      if (!this.lkCovered(this.linksOf(o.mat), c)) out.push(c);
    });
    return out.sort((a, b) => ko(NP.matName(a.mat), NP.matName(b.mat)) || ko(a.school, b.school) || a.grade - b.grade || a.sem - b.sem);
  },
  // 시험 교재 목록의 “기존 시험에서 학교 연결 찾기”
  openLkFind() {
    const cands = this.lkCands();
    if (!cands.length) { toast('새로 연결할 교과서가 없습니다 (기존 시험 범위 기준)'); return; }
    const exText = (c) => { const e = c.exams[0]; return `${schoolShort(e.school)} ${e.year}년 ${e.semester}학기 ${EXAM_KIND[e.kind] || ''}` + (c.exams.length > 1 ? ` 외 ${c.exams.length - 1}개` : ''); };
    Modal.open({
      title: '기존 시험에서 학교 연결 찾기', size: 'lg', autofocus: false,
      body: `<p class="small soft" style="margin-top:0">시험 범위에 들어간 교과서를 보고 찾은 연결입니다. 맞는 것만 체크한 채로 “연결”을 누르세요.<br>
        고등학교는 그 시험의 학기로 연결하고, 1학기·2학기 시험에 모두 쓰였으면 1·2학기 모두로 연결합니다.</p>
        <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th class="chk-th"><label class="chk-hit" title="전체 선택"><input type="checkbox" data-lkall checked></label></th><th>교과서</th><th>연결할 학교·학년</th><th>쓰인 시험</th></tr></thead><tbody>
        ${cands.map((c, i) => `<tr><td class="chk-td"><label class="chk-hit"><input type="checkbox" data-lkc="${i}" checked></label></td><td class="nowrap"><b>${esc(NP.matName(c.mat))}</b></td>
          <td class="nowrap">${esc(this.lkLabel(c))}</td><td class="small soft">${esc(exText(c))}</td></tr>`).join('')}</tbody></table></div>`,
      onMount: (b) => {
        b.addEventListener('change', (e) => {
          if (e.target.matches('[data-lkall]')) $$('[data-lkc]', b).forEach(x => { x.checked = e.target.checked; });
          else if (e.target.matches('[data-lkc]')) { const boxes = $$('[data-lkc]', b), all = $('[data-lkall]', b); all.checked = boxes.every(x => x.checked); all.indeterminate = !all.checked && boxes.some(x => x.checked); }
        });
      },
      buttons: [
        { text: '취소' },
        { text: '연결', cls: 'primary', primary: true, onClick: (md) => {
          const pick = $$('[data-lkc]:checked', md.body).map(x => cands[+x.dataset.lkc]);
          if (!pick.length) { toast('연결할 항목을 체크하세요'); return false; }
          const n = this.lkApply(pick);
          toast(`교과서 학교 연결 ${n}개를 추가했습니다`); App.render();
        } },
      ],
    });
  },
  // 두 갈래 확인 창 → true(예) / false(아니요) / null(창을 닫음)
  askDlg(msg, yesText, noText) {
    return new Promise(res => {
      let done = false; const r = (v) => { if (!done) { done = true; res(v); } };
      Modal.open({
        title: '확인', size: 'sm', autofocus: false,
        body: `<p class="confirm-msg">${esc(msg)}</p>`,
        buttons: [{ text: noText, onClick() { r(false); } }, { text: yesText, cls: 'primary', primary: true, onClick() { r(true); } }],
        onClose() { r(null); },
      });
    });
  },

  /* ---------- 시험 등록 / 수정 ---------- */
  openModal(id) {
    this.syncDates();
    const ex = id ? Store.get('exams', id) : null;
    const now = new Date();
    const v = ex || { school: '', grade: 10, year: now.getFullYear(), semester: now.getMonth() >= 6 ? 2 : 1, kind: '', start: '', end: '', range: '', memo: '' };
    const fmt = ex ? this.fmtOf(ex) : '';
    // 구조화된 시험 범위 (편집용 사본)
    const items = JSON.parse(JSON.stringify(v.items || [])).filter(it => { const m = NP.mat(it.matId); return m && m.type !== 'gen'; });
    const body = `<div class="form">
      <label class="req">학교·학년</label><div class="row"><input type="text" name="school" list="dl-schools" value="${esc(v.school)}" placeholder="예: 금천고" style="flex:1"><select name="grade">${gradeOptions(v.grade)}</select></div>
      <label class="req">시험</label><div class="row"><input type="number" name="year" value="${esc(v.year)}" min="2000" max="2100" style="width:90px">년
        <select name="semester"><option value="1" ${+v.semester === 1 ? 'selected' : ''}>1학기</option><option value="2" ${+v.semester === 2 ? 'selected' : ''}>2학기</option></select>
        <select name="kind"><option value="" ${v.kind ? '' : 'selected'}>선택 없음</option><option value="mid" ${v.kind === 'mid' ? 'selected' : ''}>중간고사</option><option value="final" ${v.kind === 'final' ? 'selected' : ''}>기말고사</option></select></div>
      <label>시험 기간</label><div class="row"><input type="text" data-dshow readonly tabindex="-1" style="width:200px;cursor:not-allowed;background:var(--bg, #F4F6F8)"><span class="hint" data-dhint></span></div>
      <label class="top">시험 범위</label><div data-rbox></div>
      <label class="top">기타 범위·메모</label><textarea name="range" rows="3" placeholder="교재로 등록하지 않은 범위나 참고 사항 (예: 프린트 1-3)">${esc(v.range)}</textarea>
      <label class="req">형식</label><div class="row">${Object.keys(this.FMT).map(k => `<label class="chk"><input type="radio" name="fmt" value="${k}" ${fmt === k ? 'checked' : ''}>${this.FMT[k]}</label>`).join('')}</div>
      <label class="top">메모</label><textarea name="memo" rows="3">${esc(v.memo)}</textarea>
    </div>`;
    Modal.open({
      title: ex ? '시험 수정' : '시험 등록', body, size: 'lg',
      onMount: (b) => {
        enhanceAll(b);
        bindCombo($('[name=school]', b), () => this.schoolPick());   // 학교 칸: 누르면 학교 목록
        // 시험 기간: 일정 탭의 시험 일정에서만 가져온다 (여기서는 보기만)
        const ds = $('[data-dshow]', b), dh = $('[data-dhint]', b);
        const drawDates = () => {
          const g = (n) => $(`[name=${n}]`, b).value;
          const r = this.evRange(g('school'), g('grade'), g('year'), g('semester'), g('kind'));
          if (r) { ds.value = this.dateText(r.start, r.end); dh.textContent = '일정에서 가져옴'; }
          else if (ex && !ex.dateEv && ex.start) { ds.value = this.dateText(ex.start, ex.end); dh.textContent = '예전에 직접 입력한 날짜 · 일정 탭에 이 시험의 시험 일정을 등록하면 그 날짜로 바뀝니다'; }
          else { ds.value = '미정'; dh.textContent = '일정 탭에 이 시험의 시험 일정을 등록하면 자동으로 들어옵니다'; }
        };
        drawDates();
        ['school', 'grade', 'year', 'semester', 'kind'].forEach(n => { const x = $(`[name=${n}]`, b); x.addEventListener('input', drawDates); x.addEventListener('change', drawDates); });
        const noEdit = (e) => { if (e.type === 'keydown' && (e.key === 'Tab' || e.key === 'Escape')) return; e.preventDefault(); toast('시험 일정변경은 일정 탭에서 해주세요.'); };
        ds.addEventListener('mousedown', noEdit); ds.addEventListener('keydown', noEdit);
        const rb = $('[data-rbox]', b), gSel = $('[name=grade]', b);
        // 학교·학년·학기에 연결된 교과서를 추천하려고 함께 넘긴다
        const draw = () => { rb.innerHTML = this.rangeHtml(items, +gSel.value, { school: $('[name=school]', b).value, sem: +$('[name=semester]', b).value }); };
        draw();
        gSel.addEventListener('change', draw);
        $('[name=school]', b).addEventListener('input', draw);
        $('[name=school]', b).addEventListener('change', draw);
        $('[name=semester]', b).addEventListener('change', draw);
        rb.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-addmat]') && t.value) {
            const m = NP.mat(t.value);
            if (m) items.push(m.type === 'mock' ? { matId: m.id, nums: [] } : { matId: m.id, units: [] });
            draw();
            if (m && m.type === 'mock') { const ins = $$('[data-rnums]', rb); if (ins.length) ins[ins.length - 1].focus(); }
          }
        });
        rb.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-rnums]')) {
            const it = items[+t.dataset.rnums]; it._txt = t.value;
            const p = NP.parseNums(t.value, NP.MOCK_MIN, NP.MOCK_MAX);
            const out = t.parentElement.querySelector('[data-rprev]');
            if (out) out.innerHTML = p.bad.length ? `<span class="np-err">인식 못 함: ${esc(p.bad.join(' '))} (${NP.MOCK_MIN}~${NP.MOCK_MAX}번)</span>` : (p.nums.length ? `${p.nums.length}문항` : '');
          }
          if (t.matches('[data-rnote]')) { const [i, uid] = t.dataset.rnote.split('|'); const u = (items[+i].units || []).find(x => x.id === uid); if (u) u.note = t.value; }
          if (t.matches('[data-runums]')) {
            const [i, uid] = t.dataset.runums.split('|'); const u = (items[+i].units || []).find(x => x.id === uid); if (!u) return;
            u._txt = t.value;
            const p = NP.parseNums(t.value, 1, 999);
            const out = t.parentElement.querySelector('[data-rprev]');
            if (out) out.innerHTML = p.bad.length ? `<span class="np-err">인식 못 함: ${esc(p.bad.join(' '))}</span>` : (p.nums.length ? '' : '강 전체');
          }
        });
        rb.addEventListener('click', (e) => {
          const t = e.target;
          const d = t.closest('[data-rdel]'); if (d) { items.splice(+d.dataset.rdel, 1); draw(); return; }
          const sg = t.closest('[data-rsug]');      // 이 학교 교과서 추천 → 범위에 넣기
          if (sg) { const m = NP.mat(sg.dataset.rsug); if (m && !items.some(it => it.matId === m.id)) items.push({ matId: m.id, units: [] }); draw(); return; }
          const u = t.closest('[data-runit]');
          if (u) {
            const [i, uid] = u.dataset.runit.split('|'), it = items[+i];
            const k = it.units.findIndex(x => x.id === uid);
            if (k >= 0) it.units.splice(k, 1); else it.units.push({ id: uid, note: '', nums: [] });
            const m = NP.mat(it.matId);
            it.units.sort((a, b) => (m.units || []).findIndex(x => x.id === a.id) - (m.units || []).findIndex(x => x.id === b.id));
            draw();
            return;
          }
          if (t.closest('[data-gomat]')) { Modal.top().close(); this.tab = 'mat'; this.sel.clear(); App.go('exams', {}); }
        });
      },
      buttons: [
        ...(ex ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 시험 정보를 삭제할까요?', '삭제', true)) return false;
          Store.del('exams', ex.id);
          Store.delWhere('meta', m => m.kind === 'pman' && m.examId === ex.id);   // 이 시험의 수동 진도 표시
          this.sel.delete(ex.id); this.prepOpen.delete(ex.id);
          toast('삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: async (m) => {
          const b = m.body, g = (n) => $(`[name=${n}]`, b).value;
          const fv = ($('[name=fmt]:checked', b) || {}).value || '';
          const rec = Object.assign({}, ex || { id: uid('EX'), createdAt: new Date().toISOString() }, {
            school: g('school').trim(), grade: +g('grade'), year: +g('year'), semester: +g('semester'), kind: g('kind'),
            range: stripZws(g('range')), fmt: fv,
            memo: stripZws(g('memo')),
          });
          delete rec.mcCount; delete rec.mcPoints; delete rec.essayCount; delete rec.essayPoints;   // 예전 문항 수·배점 (형식으로 바뀜)
          if (!rec.school) { toast('학교를 입력하세요'); return false; }
          if (!rec.year || rec.year < 2000) { toast('연도를 확인하세요'); return false; }
          if (!rec.kind) { toast('중간고사·기말고사를 고르세요'); return false; }
          if (!this.FMT[rec.fmt]) { toast('형식을 고르세요 (객관식만 / 객관식+서술형)'); return false; }
          // 시험 기간: 일치하는 시험 일정 → 그 날짜 / 없으면 미정 (예전에 직접 입력한 날짜는 그대로)
          const dr = this.evRange(rec.school, rec.grade, rec.year, rec.semester, rec.kind);
          if (dr) Object.assign(rec, { start: dr.start, end: dr.end, dateEv: true });
          else {
            if (!ex || ex.dateEv) { rec.start = ''; rec.end = ''; }
            delete rec.dateEv;
          }
          // 시험 범위 정리·확인
          const out = [];
          for (const it of items) {
            const m = NP.mat(it.matId); if (!m || m.type === 'gen') continue;
            if (m.type === 'mock') {
              const p = NP.parseNums(it._txt != null ? it._txt : NP.compress(it.nums), NP.MOCK_MIN, NP.MOCK_MAX);
              if (p.bad.length) { toast(`${NP.matName(m)}: 번호를 확인하세요 (${p.bad.join(' ')})`); return false; }
              if (!p.nums.length) { toast(`${NP.matName(m)}: 범위 번호를 입력하세요`); return false; }
              out.push({ matId: m.id, nums: p.nums });
            } else {
              if (!it.units.length) { toast(`${NP.matName(m)}: 범위에 들어가는 ${m.type === 'text' ? '과' : '강'}를 고르세요`); return false; }
              const units = [];
              for (const u of it.units) {
                const p = NP.parseNums(u._txt != null ? u._txt : NP.compress(u.nums), 1, 999);
                if (m.type === 'sub' && p.bad.length) { toast(`${m.name} ${NP.unitName(m, u.id)}: 번호를 확인하세요 (${p.bad.join(' ')})`); return false; }
                units.push({ id: u.id, note: stripZws(u.note || '').trim(), nums: m.type === 'sub' ? p.nums : [] });
              }
              out.push({ matId: m.id, units });
            }
          }
          rec.items = out;
          // 범위의 교과서 중 이 학교·학년(·학기)에 연결 안 된 것 → 연결할지 묻는다 (고등학교는 이 시험의 학기로)
          if (isMiddle(rec.grade) || isHigh(rec.grade)) {
            const lk = { school: schoolShort(rec.school), grade: rec.grade, sem: this.lkSem(rec.grade, rec.semester) };
            const miss = out.map(it => NP.mat(it.matId)).filter(x => x && x.type === 'text' && !this.lkCovered(this.linksOf(x), lk));
            if (miss.length) {
              const a = await this.askDlg(`아래 교과서가 ${this.lkLabel(lk)}에 연결되어 있지 않습니다.\n연결해 두면 다음에 이 학교 시험을 등록할 때 바로 추천됩니다.\n\n${miss.map(x => '· ' + x.name).join('\n')}`
                + (isHigh(rec.grade) ? '\n\n1년 내내 쓰는 책이면 교재 수정에서 “1·2학기 모두”로 바꿀 수 있습니다.' : ''), '연결하고 저장', '연결 없이 저장');
              if (a === null) return false;            // 창을 닫으면 저장하지 않고 시험 창으로 돌아간다
              if (a) this.lkApply(miss.map(x => Object.assign({ mat: x }, lk)));
            }
          }
          Store.put('exams', rec);
          toast('시험 정보를 저장했습니다');
          const tab = rec.done ? 'done' : 'exam';          // 저장된 곳의 탭을 보여준다
          if (this.tab !== tab) { this.tab = tab; this.sel.clear(); }
          if (App.page === 'exams') App.render(); else App.go('exams', {});
        } },
      ],
    });
  },

  /* ---------- 시험 범위 입력 (시험 모달 안) — 시험 교재만 ---------- */
  rangeHtml(items, grade, ctx) {
    const middle = isMiddle(grade);
    const used = new Set(items.map(it => it.matId));
    // 이 학교·학년·학기에 연결된 교과서 (아직 범위에 넣지 않은 것) → 위에 추천, 교재 추가 목록에서는 맨 위 묶음
    const sug = ctx ? this.textsFor(ctx.school, grade, ctx.sem).filter(m => !used.has(m.id)) : [];
    const sugIds = new Set(sug.map(m => m.id));
    const where = sug.length ? this.lkLabel({ school: ctx.school, grade, sem: this.lkSem(grade, ctx.sem) }).replace(/ 1·2학기$/, '') : '';
    const avail = NP.sortMats(NP.examMats().filter(m => !used.has(m.id) && !sugIds.has(m.id) && (!middle || m.type === 'text')));
    let h = sug.length ? `<div class="x7-sug"><span class="small soft">${esc(where)} 교과서</span>${sug.map(m => `<button type="button" class="btn sm" data-rsug="${m.id}" title="범위에 넣기">+ ${esc(m.name)}</button>`).join('')}</div>` : '';
    h += items.map((it, i) => {
      const m = NP.mat(it.matId);
      let r = `<div class="np-ritem"><div class="np-mhead"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span><b>${esc(NP.matName(m))}</b>
        <span class="grow" style="flex:1"></span><button type="button" class="icon-btn" data-rdel="${i}" title="범위에서 빼기">✕</button></div>`;
      if (m.type === 'mock') {
        const txt = it._txt != null ? it._txt : NP.compress(it.nums);
        const p = NP.parseNums(txt, NP.MOCK_MIN, NP.MOCK_MAX);
        r += `<div class="row"><input type="text" data-rnums="${i}" value="${esc(txt)}" placeholder="예: 23, 25, 28, 31-42" style="flex:1"><span class="small soft" data-rprev>${p.bad.length ? `<span class="np-err">인식 못 함: ${esc(p.bad.join(' '))}</span>` : p.nums.length ? p.nums.length + '문항' : ''}</span></div>`;
      } else {
        const sel = new Set(it.units.map(u => u.id));
        r += `<div class="np-chips">${(m.units || []).map(u => `<button type="button" class="np-c ${sel.has(u.id) ? 'on' : ''}" data-runit="${i}|${u.id}">${esc(u.name)}</button>`).join('') || '<span class="small muted">이 교재에 단위가 없습니다. 시험 교재 탭에서 추가하세요.</span>'}</div>`;
        r += it.units.map(u => {
          const txt = u._txt != null ? u._txt : NP.compress(u.nums);
          return `<div class="np-urow"><span class="np-ul">${esc(NP.unitName(m, u.id))}</span>
            ${m.type === 'sub' ? `<input type="text" data-runums="${i}|${u.id}" value="${esc(txt)}" placeholder="번호 (비우면 강 전체)" style="width:150px"><span class="small soft" data-rprev>${txt ? '' : '강 전체'}</span>` : ''}
            <input type="text" data-rnote="${i}|${u.id}" value="${esc(u.note || '')}" placeholder="${m.type === 'text' ? '일부만이면 메모 (예: 대화문 제외, 본문 전까지)' : '메모 (선택)'}" style="flex:1"></div>`;
        }).join('');
      }
      return r + '</div>';
    }).join('');
    h += `<div class="row"><select data-addmat><option value="">+ 교재 추가…</option>${sug.length ? `<optgroup label="${esc(where)} 교과서">${sug.map(m => `<option value="${m.id}">${esc(NP.matName(m))}</option>`).join('')}</optgroup>` : ''}${['mock', 'text', 'sub'].filter(t => !middle || t === 'text').map(t => {
      const list = avail.filter(m => m.type === t);
      return list.length ? `<optgroup label="${MAT_TYPE[t]}">${list.map(m => `<option value="${m.id}">${esc(NP.matName(m))}</option>`).join('')}</optgroup>` : '';
    }).join('')}</select><button type="button" class="btn sm ghost" data-gomat>교재 관리</button>
      <span class="hint">${middle ? '중학교는 교과서만 고를 수 있습니다.' : '모의고사는 번호(18~45), 교과서는 과, 부교재는 강과 번호를 고릅니다.'}</span></div>`;
    return h;
  },

  /* ---------- 교재 목록 (학원 전체 교재 라인업 — 선생님 안내·신규 상담용 보기 전용) ----------
     영역(독해·문법·단어·듣기) × 학년(초6~고3) 로드맵 표. 시리즈마다 한 줄, 같은 시리즈에서 학년이 겹치는 권은 아랫줄로.
     시험 교재·일반 교재·학생 교재와 연결되지 않는다 */
  LU_AREAS: [['read', '독해'], ['gram', '문법'], ['word', '단어'], ['listen', '듣기']],
  LU_GRADES: [6, 7, 8, 9, 10, 11, 12],
  LU_ORDER_ID: 'LU_ORDER',
  luGrade: 0,             // 학년 필터 (0 전체) — 다른 학년은 흐리게, PDF는 그 학년 교재만
  luBooks() { return Store.where('meta', m => m.kind === 'lineup'); },
  luKey(b) { const s = String(b.series || '').trim(); return s || '#' + b.id; },
  luG2(b) { return Math.max(+b.g1, +b.g2 || +b.g1); },
  luHas(b, g) { return +g >= +b.g1 && +g <= this.luG2(b); },
  luGradeText(b) { return gradeLabel(b.g1) + (this.luG2(b) !== +b.g1 ? '~' + gradeLabel(this.luG2(b)) : ''); },
  luOrder() { const r = Store.get('meta', this.LU_ORDER_ID); return (r && r.areas) || {}; },
  // 영역의 시리즈 묶음 [{ key, series, books, lines:[[책…]], min, max }] — 저장한 순서 먼저, 나머지는 낮은 학년부터
  luGroups(area, books) {
    const by = new Map();
    books.filter(b => b.area === area).forEach(b => { const k = this.luKey(b); if (!by.has(k)) by.set(k, []); by.get(k).push(b); });
    const gs = [...by.entries()].map(([key, bs]) => {
      bs.sort((a, b) => a.g1 - b.g1 || this.luG2(a) - this.luG2(b) || ko(a.name, b.name));
      const lines = [];
      bs.forEach(b => {     // 학년이 겹치지 않는 첫 줄에 넣는다
        let ln = lines.find(l => l.every(x => this.luG2(x) < +b.g1 || +x.g1 > this.luG2(b)));
        if (!ln) { ln = []; lines.push(ln); }
        ln.push(b);
      });
      return { key, series: String(bs[0].series || '').trim(), books: bs, lines,
        min: Math.min(...bs.map(b => +b.g1)), max: Math.max(...bs.map(b => this.luG2(b))) };
    });
    const ord = this.luOrder()[area] || [];
    const pos = (k) => { const i = ord.indexOf(k); return i < 0 ? 1e9 : i; };
    return gs.sort((a, b) => pos(a.key) - pos(b.key) || a.min - b.min || a.max - b.max || ko(a.series || a.books[0].name, b.series || b.books[0].name));
  },
  luHeadHtml() {
    const fg = this.luGrade;
    return `<colgroup><col class="c-area"><col class="c-ser">${this.LU_GRADES.map(() => '<col>').join('')}</colgroup>
      <thead><tr><th>영역</th><th>시리즈</th>${this.LU_GRADES.map(g => `<th class="${fg === g ? 'on' : ''}">${gradeLabel(g)}</th>`).join('')}</tr></thead>`;
  },
  luBarHtml(b, a, pdf) {
    const dim = this.luGrade && !this.luHas(b, this.luGrade);
    const sub = [b.pub, b.level].map(s => String(s || '').trim()).filter(Boolean).join(' · ');
    const memo = String(b.memo || '').trim();
    const tip = [b.name, sub, this.luGradeText(b), memo].filter(Boolean).join('\n');
    return `<div class="lu-bar ${a}${dim ? ' dim' : ''}"${pdf ? '' : ` data-lu="${b.id}" title="${esc(tip)}"`}><b>${esc(b.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${memo ? `<p>${esc(memo).replace(/\n/g, '<br>')}</p>` : ''}</div>`;
  },
  // 표 본문 (화면·PDF 공용). PDF는 교재가 없는 영역을 뺀다
  luRowsHtml(books, pdf) {
    const G = this.LU_GRADES, fg = this.luGrade, last = G[G.length - 1];
    let h = '';
    this.LU_AREAS.forEach(([a, lb]) => {
      const gs = this.luGroups(a, books);
      if (pdf && !gs.length) return;
      const n = gs.reduce((s, g) => s + g.lines.length, 0) || 1;
      const areaTd = `<td class="lu-area ${a}" rowspan="${n}"><div class="lu-albl">${lb}</div>${pdf ? '' : `<div class="lu-aact"><button type="button" class="btn sm ghost" data-luadd="${a}" title="${lb} 교재 등록">+ 등록</button>${gs.length > 1 ? `<button type="button" class="btn sm ghost" data-luord="${a}" title="${lb} 시리즈 순서 바꾸기">순서</button>` : ''}</div>`}</td>`;
      if (!gs.length) { h += `<tr class="lu-first">${areaTd}<td class="lu-ser"></td><td colspan="${G.length}" class="lu-none">등록된 ${lb} 교재가 없습니다</td></tr>`; return; }
      let first = true;
      gs.forEach(g => g.lines.forEach((ln, li) => {
        h += `<tr class="${first ? 'lu-first' : li === 0 ? 'lu-sfirst' : ''}">`;
        if (first) h += areaTd;
        if (li === 0) h += `<td class="lu-ser" rowspan="${g.lines.length}">${esc(g.series)}</td>`;
        first = false;
        for (let i = 0; i < G.length;) {
          const gr = G[i], b = ln.find(x => +x.g1 === gr);
          if (b) {
            const span = Math.min(this.luG2(b), last) - gr + 1;
            h += `<td colspan="${span}" class="lu-cell${fg && this.luHas(b, fg) ? ' on' : ''}">${this.luBarHtml(b, a, pdf)}</td>`;
            i += span;
          } else { h += `<td class="lu-cell${fg === gr ? ' on' : ''}"></td>`; i++; }
        }
        h += '</tr>';
      }));
    });
    return h;
  },
  renderLineup(main) {
    const all = this.luBooks(), fg = this.luGrade;
    let h = this.headHtml() + this.tabsHtml();
    h += `<div class="toolbar"><select data-lugr><option value="">전체 학년</option>${this.LU_GRADES.map(g => `<option value="${g}" ${fg === g ? 'selected' : ''}>${gradeLabel(g)}</option>`).join('')}</select>
      <span class="muted small">${all.length}권${fg ? ` · ${gradeLabel(fg)} 대상 ${all.filter(b => this.luHas(b, fg)).length}권` : ''} · 학원 전체 교재 라인업 (선생님 안내·상담용 보기 전용)</span><span style="flex:1"></span>
      <button class="btn sm lu-pdfbtn" data-lupdf ${all.length ? '' : 'disabled'} title="${fg ? gradeLabel(fg) + ' 대상 교재만' : '전체 교재 로드맵을'} A4 가로로 인쇄 · PDF 저장">PDF 저장</button></div>`;
    h += `<div class="tbl-wrap"><table class="lu-tbl">${this.luHeadHtml()}<tbody>${this.luRowsHtml(all, false)}</tbody></table></div>`;
    main.innerHTML = h;
    main.onclick = (e) => {
      if (this.commonClick(e, main)) return;
      const ad = e.target.closest('[data-luadd]'); if (ad) { this.openLuModal(null, ad.dataset.luadd); return; }
      const od = e.target.closest('[data-luord]'); if (od) { this.openLuOrder(od.dataset.luord); return; }
      if (e.target.closest('[data-lupdf]')) { this.luPdf(); return; }
      const bar = e.target.closest('[data-lu]'); if (bar) this.openLuModal(bar.dataset.lu);
    };
    main.onchange = (e) => { if (e.target.matches('[data-lugr]')) { this.luGrade = +e.target.value || 0; App.render(); } };
    main.oninput = null;
  },

  /* ---------- 교재 목록: 등록 / 수정 ---------- */
  openLuModal(id, area) {
    const m = id ? Store.get('meta', id) : null;
    if (id && (!m || m.kind !== 'lineup')) { toast('교재를 찾을 수 없습니다'); App.render(); return; }
    const G = this.LU_GRADES;
    const ar0 = m ? m.area : (area || 'read');
    const g10 = m && G.includes(+m.g1) ? +m.g1 : 7, two0 = !!m && this.luG2(m) > +m.g1;
    const v = (k) => esc(m ? m[k] || '' : '');
    const body = `<div class="form">
      <label class="req">영역</label><div class="row">${this.LU_AREAS.map(([k, t]) => `<label class="chk"><input type="radio" name="luarea" value="${k}" ${ar0 === k ? 'checked' : ''}>${t}</label>`).join('')}</div>
      <label>시리즈</label><input type="text" name="luser" value="${v('series')}" placeholder="예: 리딩튜터 (같은 시리즈의 책은 한 줄로 묶입니다)" maxlength="40" autocomplete="off">
      <label class="req">책 이름</label><input type="text" name="luname" value="${v('name')}" placeholder="예: 리딩튜터 2" maxlength="40">
      <label>출판사</label><input type="text" name="lupub" value="${v('pub')}" placeholder="예: 능률, 쎄듀, EBS" maxlength="30" autocomplete="off">
      <label class="req">대상 학년</label><div class="row"><select name="lug1">${G.map(g => `<option value="${g}" ${g10 === g ? 'selected' : ''}>${gradeLabel(g)}</option>`).join('')}</select>
        <select name="lug2"></select><span class="hint">한 학년 또는 이어지는 두 학년</span></div>
      <label>레벨</label><input type="text" name="lulevel" value="${v('level')}" placeholder="예: 기초, 기본, 심화, Lv.2" maxlength="20">
      <label class="top">설명</label><textarea name="lumemo" rows="3" maxlength="300" placeholder="상담 때 보여줄 특징 한두 줄 (화면·PDF에 나옵니다)">${v('memo')}</textarea>
    </div>`;
    Modal.open({
      title: m ? '교재 목록 · 교재 수정' : '교재 목록 · 교재 등록', size: 'lg', body,
      onMount: (b) => {
        const s1 = $('[name=lug1]', b), s2 = $('[name=lug2]', b);
        const drawG2 = (two) => {
          const g = +s1.value;
          s2.innerHTML = `<option value="${g}">한 학년만</option>` + (g < G[G.length - 1] ? `<option value="${g + 1}" ${two ? 'selected' : ''}>${gradeLabel(g)}~${gradeLabel(g + 1)}</option>` : '');
        };
        drawG2(two0);
        s1.addEventListener('change', () => drawG2(s2.selectedIndex === 1));   // 두 학년을 골라 두었으면 유지
        const curArea = () => ($('[name=luarea]:checked', b) || {}).value || ar0;
        bindCombo($('[name=luser]', b), () => [...new Set(this.luBooks().filter(x => x.area === curArea()).map(x => String(x.series || '').trim()).filter(Boolean))].sort(ko));
        bindCombo($('[name=lupub]', b), () => [...new Set(this.luBooks().map(x => String(x.pub || '').trim()).filter(Boolean))].sort(ko));
      },
      buttons: [
        ...(m ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg(`교재 목록에서 “${m.name}”을(를) 삭제할까요?`, '삭제', true)) return false;
          Store.del('meta', m.id);
          toast('교재를 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (md) => {
          const b = md.body;
          const val = (n) => stripZws($(`[name=${n}]`, b).value || '').trim();
          const area = ($('[name=luarea]:checked', b) || {}).value;
          const name = val('luname'), series = val('luser');
          const g1 = +$('[name=lug1]', b).value, g2 = +$('[name=lug2]', b).value || g1;
          if (!area) { toast('영역을 고르세요'); return false; }
          if (!name) { toast('책 이름을 입력하세요'); return false; }
          if (!G.includes(g1) || (g2 !== g1 && g2 !== g1 + 1) || !G.includes(g2)) { toast('대상 학년을 확인하세요'); return false; }
          if (this.luBooks().some(x => x.id !== (m && m.id) && x.area === area && String(x.name || '').trim() === name)) { toast('같은 영역에 같은 이름의 교재가 이미 있습니다'); return false; }
          const rec = Object.assign({}, m || { id: uid('LU'), kind: 'lineup', createdAt: new Date().toISOString() },
            { area, series, name, pub: val('lupub'), level: val('lulevel'), memo: String($('[name=lumemo]', b).value || '').trim(), g1, g2, updatedAt: new Date().toISOString() });
          // 시리즈 이름을 바꿔서 옛 시리즈에 남은 책이 없으면, 정해 둔 순서 자리를 새 이름이 이어받는다
          if (m) {
            const ok = this.luKey(m), nk = this.luKey(rec), ord = this.luOrder();
            const left = this.luBooks().some(x => x.id !== m.id && x.area === m.area && this.luKey(x) === ok);
            if ((ok !== nk || m.area !== area) && !left && (ord[m.area] || []).includes(ok)) {
              const areas = Object.assign({}, ord);
              areas[m.area] = ord[m.area].filter(k => k !== ok);
              if (m.area === area && !(ord[area] || []).includes(nk)) areas[area] = ord[area].map(k => k === ok ? nk : k);
              const old = Store.get('meta', this.LU_ORDER_ID);
              Store.put('meta', Object.assign({}, old, { areas, updatedAt: new Date().toISOString() }));
            }
          }
          Store.put('meta', rec);
          toast('교재를 저장했습니다');
          if (this.tab !== 'lu') { this.tab = 'lu'; this.sel.clear(); }
          if (App.page === 'exams') App.render(); else App.go('exams', {});
        } },
      ],
    });
  },

  /* ---------- 교재 목록: 영역 안 시리즈 순서 ---------- */
  openLuOrder(area) {
    const lb = (this.LU_AREAS.find(x => x[0] === area) || [])[1] || '';
    const items = this.luGroups(area, this.luBooks()).map(g => ({ key: g.key, label: g.series || g.books[0].name,
      gr: gradeLabel(g.min) + (g.max !== g.min ? '~' + gradeLabel(g.max) : ''), n: g.books.length }));
    Modal.open({
      title: `${lb} 시리즈 순서`, size: 'sm', autofocus: false,
      body: `<div class="small muted" style="margin-bottom:8px">위에 있을수록 표에서 먼저 나옵니다.</div><div data-luol></div>`,
      onMount: (b) => {
        const box = $('[data-luol]', b);
        const draw = () => {
          box.innerHTML = items.map((it, i) => `<div class="np-urow lu-orow"><span class="small muted" style="width:22px">${i + 1}</span><span style="flex:1"><b>${esc(it.label)}</b> <span class="small muted">${it.gr} · ${it.n}권</span></span>
            <button type="button" class="icon-btn" data-oup="${i}" title="위로" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-btn" data-odn="${i}" title="아래로" ${i < items.length - 1 ? '' : 'disabled'}>↓</button></div>`).join('');
        };
        draw();
        box.addEventListener('click', (e) => {
          const up = e.target.closest('[data-oup]'), dn = e.target.closest('[data-odn]');
          const i = up ? +up.dataset.oup : dn ? +dn.dataset.odn : -1, j = up ? i - 1 : i + 1;
          if (i < 0 || j < 0 || j >= items.length) return;
          [items[i], items[j]] = [items[j], items[i]]; draw();
        });
      },
      buttons: [
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: () => {
          const old = Store.get('meta', this.LU_ORDER_ID) || { id: this.LU_ORDER_ID, kind: 'luorder', areas: {} };
          Store.put('meta', Object.assign({}, old, { areas: Object.assign({}, old.areas || {}, { [area]: items.map(it => it.key) }), updatedAt: new Date().toISOString() }));
          toast('순서를 저장했습니다'); App.render();
        } },
      ],
    });
  },

  /* ---------- 교재 목록: PDF (A4 가로) — 학년 필터를 골랐으면 그 학년 교재만 ---------- */
  luPdf() {
    const today = todayStr(), fg = this.luGrade;
    const books = this.luBooks().filter(b => !fg || this.luHas(b, fg));
    if (!books.length) { toast(fg ? `${gradeLabel(fg)} 대상 교재가 없습니다` : '등록된 교재가 없습니다'); return; }
    const cfg = typeof Reports !== 'undefined' && Reports.cfg ? Reports.cfg() : { academy: '', logo: '' };
    const academy = String(cfg.academy || '').trim(), logo = cfg.logo || '';
    const brand = `<div class="brand">${logo ? `<img src="${esc(logo)}" alt="">` : ''}${academy ? `<span>${esc(academy)}</span>` : ''}</div>`;
    const fname = '교재로드맵_' + (fg ? gradeLabel(fg) + '_' : '') + today;
    const body = `<div class="thead">${brand}<div class="ttl"><h1>교재 로드맵<small>영역별 · 학년별 교재 라인${fg ? ` · ${gradeLabel(fg)} 대상` : ''}</small></h1><div class="dt">${academy ? esc(academy) + ' · ' : ''}${today}</div></div></div>
      <table class="lu-tbl">${this.luHeadHtml()}<tbody>${this.luRowsHtml(books, true)}</tbody></table>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fname)}</title><style>
      @page { size: A4 landscape; margin: 9mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #1E2A36; font-family: 'Pretendard', 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif; font-size: 8.5pt; line-height: 1.45; }
      .brand { display: flex; align-items: center; gap: 6pt; min-height: 10mm; }
      .brand img { max-height: 11mm; max-width: 40mm; object-fit: contain; }
      .brand span { font-size: 11pt; font-weight: 800; color: #1D3557; letter-spacing: .3pt; }
      .thead { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 3mm; margin-bottom: 4mm; border-bottom: 1.2pt solid #1D3557; }
      .thead .ttl { text-align: right; } .thead h1 { margin: 0; font-size: 16pt; color: #12304D; letter-spacing: .5pt; }
      .thead h1 small { font-size: 8.5pt; color: #64748B; font-weight: 600; margin-left: 6pt; letter-spacing: 0; }
      .thead .dt { font-size: 8pt; color: #94A3B8; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      col.c-area { width: 15mm; } col.c-ser { width: 30mm; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 0.5pt solid #D5DDE6; padding: 1.2mm; vertical-align: middle; }
      th { background: #F1F5F9; font-size: 9pt; text-align: center; padding: 1.8mm 1mm; }
      th.on, td.on { background: #FFF6DA; }
      tr.lu-first > td { border-top: 1.2pt solid #94A3B8; }
      td.lu-area { text-align: center; font-size: 10.5pt; font-weight: 800; }
      td.lu-area.read { color: #1D5E93; } td.lu-area.gram { color: #5B3FA6; } td.lu-area.word { color: #A9650B; } td.lu-area.listen { color: #1F7A52; }
      td.lu-ser { font-weight: 700; font-size: 8.5pt; color: #12304D; word-break: keep-all; overflow-wrap: anywhere; }
      .lu-bar { border-radius: 1.5mm; padding: 1.3mm 2mm; border-left: 1.2mm solid; word-break: keep-all; overflow-wrap: anywhere; }
      .lu-bar.read { background: #E3F0FB; border-color: #1D5E93; } .lu-bar.gram { background: #EDE7FA; border-color: #5B3FA6; }
      .lu-bar.word { background: #FCEFDC; border-color: #A9650B; } .lu-bar.listen { background: #E2F4EC; border-color: #1F7A52; }
      .lu-bar b { display: block; font-size: 8.8pt; color: #12304D; }
      .lu-bar small { display: block; font-size: 7.3pt; color: #475569; }
      .lu-bar p { margin: 0.6mm 0 0; font-size: 7.3pt; color: #334155; }
    </style></head><body>${body}</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open(); doc.write(html); doc.close();
    const t0 = document.title;
    setTimeout(() => {
      document.title = fname;                 // 저장 파일 이름
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally {
        document.title = t0;
        setTimeout(() => fr.remove(), 1000);
      }
    }, 400);
  },

  /* ---------- 교재 목록 (시험 교재 / 일반 교재) ---------- */
  renderMats(main) {
    const gen = this.tab === 'gen';
    const all = NP.sortMats(gen ? NP.genMats() : NP.examMats());
    // 학교 필터: 교과서에 연결된 학교 목록 (없어진 학교를 골라 두었으면 전체로)
    const schs = gen ? [] : [...new Set(all.reduce((a, m) => a.concat(this.linksOf(m).map(lk => lk.school)), []))].sort(ko);
    if (this.matSchool && this.matSchool !== '__none' && !schs.includes(this.matSchool)) this.matSchool = '';
    const schOk = (m) => !this.matSchool || (this.matSchool === '__none' ? m.type === 'text' && !this.linksOf(m).length : this.linksOf(m).some(lk => lk.school === this.matSchool));
    const list = gen ? all : all.filter(m => (!this.matType || m.type === this.matType) && schOk(m));
    const ids = list.map(m => m.id);
    [...this.sel].forEach(id => { if (!ids.includes(id)) this.sel.delete(id); });
    const usedBy = (m) => Store.where('exams', e => (e.items || []).some(it => it.matId === m.id)).length;
    const clsOf = (m) => (m.classIds || []).map(id => Store.get('classes', id)).filter(Boolean);
    let h = this.headHtml() + this.tabsHtml();
    h += gen ? `<div class="toolbar"><span class="muted small">${list.length}개 · 비내신 수업에 쓰는 교재 (시험 범위에는 쓰지 않음)</span></div>`
      : `<div class="toolbar"><select data-mtype><option value="">전체 종류</option>${Object.keys(MAT_TYPE).map(k => `<option value="${k}" ${this.matType === k ? 'selected' : ''}>${MAT_TYPE[k]}</option>`).join('')}</select>
        <select data-msch><option value="">전체 학교</option>${schs.map(s => `<option value="${esc(s)}" ${this.matSchool === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}<option value="__none" ${this.matSchool === '__none' ? 'selected' : ''}>학교 연결 없는 교과서</option></select>
        <span class="muted small">${list.length}개 · 시험 범위·내신 진도에 쓰는 교재</span><span style="flex:1"></span>
        <button class="btn sm" data-a="lkfind" title="시험 범위에 들어간 교과서로 학교 연결을 찾아 채웁니다">기존 시험에서 학교 연결 찾기</button></div>`;
    h += this.bulkHtml([['delmat', '선택 삭제', 'danger']]);
    if (!list.length) {
      h += `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 교재가 없습니다.' : gen ? '등록된 일반 교재가 없습니다. “교재 등록”에서 일반 교재를 고르고 사용하는 반을 연결하세요.' : '등록된 시험 교재가 없습니다. “교재 등록”으로 모의고사·교과서·부교재를 먼저 등록하면 시험 범위를 고를 수 있습니다.'}</div></div>`;
    } else if (gen) {
      h += `<div class="tbl-wrap"><table class="tbl compact"><thead><tr>${this.chkTh(ids)}<th>분류</th><th>이름</th><th>단위</th><th>사용하는 반</th></tr></thead><tbody>${list.map(m => `
      <tr class="click" data-mat="${m.id}">${this.chkTd(m.id)}<td class="nowrap">${Books.catTag(m.cat)}</td><td class="nowrap"><b>${esc(m.name)}</b></td>
      <td class="small">${m.cat === 'listen' || m.cat === 'word' ? '<span class="muted">-</span>' : esc((m.units || []).map(u => u.name).join(', ')) || '<span class="muted">-</span>'}</td>
      <td class="small">${clsOf(m).map(c => `<span class="nowrap">${Classes.dot(c)}${esc(c.name)}${c.active === false ? ' (종료)' : ''}</span>`).join(', ') || (m.noCls ? '<span class="badge gray">반 미지정</span>' : '<span class="muted">연결된 반 없음</span>')}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      h += `<div class="tbl-wrap"><table class="tbl compact"><thead><tr>${this.chkTh(ids)}<th>종류</th><th>이름</th><th>단위</th><th>쓰는 학교</th><th class="num">쓰는 시험</th></tr></thead><tbody>${list.map(m => `
      <tr class="click" data-mat="${m.id}">${this.chkTd(m.id)}<td class="nowrap"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span></td><td class="nowrap"><b>${esc(NP.matName(m))}</b></td>
      <td class="small">${m.type === 'mock' ? `${NP.MOCK_MIN}~${NP.MOCK_MAX}번` : esc((m.units || []).map(u => u.name).join(', ')) || '<span class="muted">-</span>'}</td>
      <td class="small">${m.type !== 'text' ? '<span class="muted">-</span>' : this.linksOf(m).map(lk => `<span class="nowrap">${esc(this.lkLabel(lk))}</span>`).join(', ') || '<span class="muted">연결 없음</span>'}</td><td class="num">${usedBy(m) || '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    }
    main.innerHTML = h;
    this.updBulk(main);
    main.onclick = (e) => {
      if (this.commonClick(e, main)) return;
      if (e.target.closest('[data-a=lkfind]')) { this.openLkFind(); return; }
      const tr = e.target.closest('tr[data-mat]'); if (tr) this.openMatModal(tr.dataset.mat);
    };
    main.onchange = (e) => {
      if (this.commonChange(e, main)) return;
      if (e.target.matches('[data-mtype]')) { this.matType = e.target.value; this.sel.clear(); App.render(); }
      if (e.target.matches('[data-msch]')) { this.matSchool = e.target.value; this.sel.clear(); App.render(); }
    };
    main.oninput = null;
  },

  /* ---------- 교재 등록 / 수정 (시험 교재 · 일반 교재) ---------- */
  openMatModal(id) {
    const m = id ? NP.mat(id) : null;
    const now = new Date();
    let cat = m ? (m.type === 'gen' ? 'gen' : 'exam') : (this.tab === 'gen' ? 'gen' : 'exam');   // 등록한 뒤에는 바꿀 수 없음
    let type = m && m.type !== 'gen' ? m.type : 'mock';
    const units = JSON.parse(JSON.stringify((m && m.units) || []));
    const cls = new Set(((m && m.classIds) || []).filter(cid => Store.get('classes', cid)));
    let noCls = !!(m && m.noCls) && !cls.size;
    let links = this.linksOf(m);                 // 교과서 ↔ 학교 연결 (편집용 사본)   // 반 미지정: 수업일지에 나오지 않고 학생 교재 관리에만 쓰는 교재
    const clsList = Classes.sorted(Store.all('classes')).filter(c => c.active !== false || cls.has(c.id));
    const body = `<div class="form">
      <label class="req">구분</label><div class="row">${[['exam', '시험 교재'], ['gen', '일반 교재']].map(([k, t]) => `<label class="chk"><input type="radio" name="mcat" value="${k}" ${cat === k ? 'checked' : ''} ${m ? 'disabled' : ''}>${t}</label>`).join('')}
        <span class="hint">${m ? '등록한 뒤에는 바꿀 수 없습니다' : '시험 교재는 시험 범위·내신, 일반 교재는 비내신 수업에 씁니다'}</span></div>
      <label class="req" data-mc="gen">분류</label><div class="row" data-mc="gen">${BOOK_CATS.map(k => `<label class="chk"><input type="radio" name="bkcat" value="${k}" ${m && m.cat === k ? 'checked' : ''}>${BOOK_CAT[k]}</label>`).join('')}
        <span class="hint">학생 › 교재에서 이 분류 칸에 나옵니다</span></div>
      <label class="req" data-mc="exam">종류</label><div class="row" data-mc="exam">${Object.keys(MAT_TYPE).map(k => `<label class="chk"><input type="radio" name="mtype" value="${k}" ${type === k ? 'checked' : ''} ${m ? 'disabled' : ''}>${MAT_TYPE[k]}</label>`).join('')}</div>
      <label class="req" data-mk="mock">모의고사</label><div class="row" data-mk="mock"><input type="number" name="year" min="2000" max="2100" value="${esc(m && m.type === 'mock' ? m.year : now.getFullYear())}" style="width:90px">년
        <select name="month">${Array.from({ length: 12 }, (_, i) => i + 1).map(i => `<option value="${i}" ${(m && m.type === 'mock' ? +m.month : 3) === i ? 'selected' : ''}>${i}월</option>`).join('')}</select>
        <select name="mgrade">${GRADES.filter(isHigh).map(g => `<option value="${g}" ${(m && m.type === 'mock' ? +m.grade : 10) === g ? 'selected' : ''}>${gradeLabel(g)}</option>`).join('')}</select>
        <span class="hint">${NP.MOCK_MIN}~${NP.MOCK_MAX}번</span></div>
      <label class="req" data-mk="book">이름</label><input type="text" name="mname" data-mk="book" value="${esc(m && m.type !== 'mock' ? m.name : '')}" placeholder="예: 능률(오) 고2, 수능특강 영어독해" maxlength="40">
      <label class="top req" data-mk="book" data-mu>단위</label><div data-mk="book" data-mu><div data-units></div>
        <div class="row" style="margin-top:6px"><button type="button" class="btn sm" data-uadd>+ 단위 추가</button>
        <span class="small soft">한 번에 만들기</span><input type="number" data-qn min="1" max="60" value="8" style="width:70px"><span class="small soft">개</span>
        <input type="text" data-qs value="${cat === 'gen' || type === 'sub' ? '강' : '과'}" style="width:60px"><button type="button" class="btn sm ghost" data-qmake>만들기</button></div>
        <div class="hint" style="margin-top:4px">예: 1과, 2과 … / Special Lesson / 1강 … 단위 이름은 나중에 바꿔도 기록이 유지됩니다.</div></div>
      <label class="top" data-mt="text">쓰는 학교</label><div data-mt="text"><div class="np-chips" data-links></div>
        <div class="row" style="margin-top:6px"><input type="text" data-lksch placeholder="학교 (예: 금천고)" autocomplete="off" style="width:150px">
        <select data-lkgr><option value="">학년</option>${GRADES.filter(g => isMiddle(g) || isHigh(g)).map(g => `<option value="${g}">${gradeLabel(g)}</option>`).join('')}</select>
        <select data-lksem style="display:none"><option value="1">1학기</option><option value="2">2학기</option><option value="0">1·2학기 모두</option></select>
        <button type="button" class="btn sm" data-lkadd>+ 연결</button>${m ? '<button type="button" class="btn sm ghost" data-lkfind title="이 교과서가 들어간 시험 범위로 학교 연결을 채웁니다">기존 시험에서 찾기</button>' : ''}</div>
        <div class="hint" style="margin-top:4px">선택 사항입니다. 연결해 두면 시험 등록 때 그 학교·학년의 교과서로 추천됩니다. 중학교는 학년에 1년 내내, 고등학교는 학기별(1년 쓰는 책은 1·2학기 모두)로 연결합니다.</div></div>
      <label class="top req" data-mc="gen">사용하는 반</label><div data-mc="gen"><div class="np-chips" data-cls>${clsList.map(c => `<button type="button" class="np-c ${cls.has(c.id) ? 'on' : ''}" data-mcls="${c.id}">${esc(c.name)}${c.active === false ? ' (종료)' : ''}</button>`).join('')}<button type="button" class="np-c ${noCls ? 'on' : ''}" data-mnocls>반 미지정</button></div>
        <div class="hint" style="margin-top:4px" data-clshint></div></div>
    </div>`;
    Modal.open({
      title: m ? '교재 수정' : '교재 등록', size: 'lg', body,
      onMount: (b) => {
        const ub = $('[data-units]', b);
        const drawU = () => {
          ub.innerHTML = units.length ? units.map((u, i) => `<div class="np-urow"><span class="small muted" style="width:22px">${i + 1}</span><input type="text" data-uname="${i}" value="${esc(u.name)}" style="flex:1">
            <button type="button" class="icon-btn" data-uup="${i}" title="위로" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-btn" data-udel="${i}" title="삭제">✕</button></div>`).join('')
            : '<div class="small muted">단위가 없습니다. 아래에서 추가하세요.</div>';
        };
        const sync = () => {
          cat = ($('[name=mcat]:checked', b) || {}).value || cat;
          type = ($('[name=mtype]:checked', b) || {}).value || type;
          const mock = cat === 'exam' && type === 'mock';
          $$('[data-mc=exam]', b).forEach(x => { x.style.display = cat === 'exam' ? '' : 'none'; });
          $$('[data-mc=gen]', b).forEach(x => { x.style.display = cat === 'gen' ? '' : 'none'; });
          $$('[data-mk=mock]', b).forEach(x => { x.style.display = mock ? '' : 'none'; });
          $$('[data-mk=book]', b).forEach(x => { x.style.display = mock ? 'none' : ''; });
          // 듣기·단어(일반 교재)는 진도를 나가지 않으므로 단위(과·강)를 넣지 않는다
          const bk = ($('[name=bkcat]:checked', b) || {}).value;
          const noUnit = cat === 'gen' && (bk === 'listen' || bk === 'word');
          $$('[data-mu]', b).forEach(x => { if (noUnit) x.style.display = 'none'; });
          $('[data-clshint]', b).textContent = noUnit
            ? '듣기·단어 교재는 수업일지에 나오지 않습니다. 고른 반 학생은 학생 › 교재에서 이 교재를 고를 때 먼저 추천됩니다.'
            : '고른 반의 수업일지에서 “비내신”을 체크하면 이 교재가 나옵니다. “반 미지정” 교재는 수업일지에 나오지 않고 학생 › 교재에서만 씁니다.'
              + (bk === 'read' || bk === 'gram' ? ' 독해·문법 교재는 고른 반 학생 모두의 학생 › 교재에 자동으로 등록됩니다 (나중에 들어오는 학생 포함).' : '');
          $('[name=mname]', b).placeholder = cat === 'gen' ? '예: 리딩튜터 2, 문법 기본편' : '예: 능률(오) 고2, 수능특강 영어독해';
        };
        // 쓰는 학교 (교과서만)
        const lb = $('[data-links]', b);
        const drawL = () => {
          lb.innerHTML = links.length ? links.map((lk, i) => `<span class="np-c x7-lk">${esc(this.lkLabel(lk))}<button type="button" data-lkdel="${i}" title="연결 빼기">✕</button></span>`).join('')
            : '<span class="small muted">연결된 학교가 없습니다.</span>';
        };
        const syncT = () => { $$('[data-mt=text]', b).forEach(x => { x.style.display = cat === 'exam' && type === 'text' ? '' : 'none'; }); };
        const lkSch = $('[data-lksch]', b), lkGr = $('[data-lkgr]', b), lkSem = $('[data-lksem]', b);
        bindCombo(lkSch, () => this.schoolPick());
        // 입력칸의 학교·학년(·학기)을 연결에 넣는다 → 'ok' / 'dup' / 'empty'(입력 없음) / 'bad'(빠진 칸)
        const addLk = (quiet) => {
          const sch = schoolShort(lkSch.value), gr = +lkGr.value;
          if (!sch && !gr) { if (!quiet) toast('학교와 학년을 고르세요'); return 'empty'; }
          if (!sch) { if (!quiet) toast('학교를 입력하세요'); return 'bad'; }
          if (!gr) { if (!quiet) toast('학년을 고르세요'); return 'bad'; }
          const nx = this.lkAdd(links, { school: sch, grade: gr, sem: isHigh(gr) ? +lkSem.value : 0 });
          if (!nx) { if (!quiet) toast('이미 연결되어 있습니다'); return 'dup'; }
          links = nx; drawL(); return 'ok';
        };
        b._addLk = addLk;
        drawU(); sync(); drawL(); syncT();
        b.addEventListener('change', (e) => {
          if (e.target.name === 'mtype' || e.target.name === 'mcat') { sync(); syncT(); $('[data-qs]', b).value = cat === 'gen' || type === 'sub' ? '강' : '과'; }
          if (e.target.name === 'bkcat') sync();
          if (e.target === lkGr) lkSem.style.display = isHigh(lkGr.value) ? '' : 'none';
        });
        lkSch.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && !e.defaultPrevented) { e.preventDefault(); addLk(); } });
        b.addEventListener('input', (e) => { if (e.target.matches('[data-uname]')) units[+e.target.dataset.uname].name = e.target.value; });
        b.addEventListener('click', (e) => {
          const t = e.target;
          if (t.closest('[data-lkadd]')) { addLk(); return; }
          const ld = t.closest('[data-lkdel]'); if (ld) { links.splice(+ld.dataset.lkdel, 1); drawL(); return; }
          if (t.closest('[data-lkfind]')) {
            let n = 0;
            this.lkCands(m.id).forEach(c => { const nx = this.lkAdd(links, c); if (nx) { links = nx; n++; } });
            drawL(); toast(n ? `기존 시험에서 학교 연결 ${n}개를 채웠습니다 (저장해야 반영됩니다)` : '기존 시험에서 새로 찾은 학교 연결이 없습니다');
            return;
          }
          const cb = t.closest('[data-mcls]');
          if (cb) { const cid = cb.dataset.mcls; if (cls.has(cid)) cls.delete(cid); else cls.add(cid); cb.classList.toggle('on', cls.has(cid));
            if (cls.size && noCls) { noCls = false; $('[data-mnocls]', b).classList.remove('on'); } return; }
          if (t.closest('[data-mnocls]')) {   // 반 미지정 ↔ 반 선택은 둘 중 하나만
            noCls = !noCls; t.closest('[data-mnocls]').classList.toggle('on', noCls);
            if (noCls) { cls.clear(); $$('[data-mcls]', b).forEach(x => x.classList.remove('on')); }
            return;
          }
          if (t.closest('[data-uadd]')) { units.push({ id: uid('U'), name: '' }); drawU(); const ins = $$('[data-uname]', ub); ins[ins.length - 1].focus(); return; }
          const d = t.closest('[data-udel]'); if (d) { units.splice(+d.dataset.udel, 1); drawU(); return; }
          const up = t.closest('[data-uup]'); if (up) { const i = +up.dataset.uup; if (i) { [units[i - 1], units[i]] = [units[i], units[i - 1]]; drawU(); } return; }
          if (t.closest('[data-qmake]')) {
            const n = Math.max(1, Math.min(60, +$('[data-qn]', b).value || 0)), sfx = $('[data-qs]', b).value.trim();
            const start = units.length + 1;
            for (let i = 0; i < n; i++) units.push({ id: uid('U'), name: (start + i) + sfx });
            drawU();
          }
        });
      },
      buttons: [
        ...(m ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          const links = this.matLinks(m);
          if (links.length) { this.showBlocked([{ m, links }], 0); return false; }
          const hist = m.type === 'gen' ? Books.recsOfMat(m.id).length : 0;
          if (!await confirmDlg(`“${NP.matName(m)}” 교재를 삭제할까요?${m.type === 'gen' ? '' : '\n이 교재의 수업 준비 표시도 함께 지워집니다.'}${hist ? `\n학생 교재 이력 ${hist}건은 교재 이름으로 남습니다.` : ''}`, '삭제', true)) return false;
          if (m.type === 'gen') Books.keepName(m);
          Store.del('meta', m.id); Store.del('meta', NP.ppId(m.id)); this.sel.delete(m.id);
          toast('교재를 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: async (md) => {
          const b = md.body;
          const rec = Object.assign({}, m || { id: uid('MT'), kind: 'mat', createdAt: new Date().toISOString() }, { type: cat === 'gen' ? 'gen' : type });
          if (rec.type === 'mock') {
            rec.year = +$('[name=year]', b).value; rec.month = +$('[name=month]', b).value; rec.grade = +$('[name=mgrade]', b).value;
            if (!rec.year || rec.year < 2000) { toast('연도를 확인하세요'); return false; }
            if (NP.mats().some(x => x.id !== rec.id && x.type === 'mock' && +x.year === rec.year && +x.month === rec.month && +x.grade === rec.grade)) { toast('같은 모의고사가 이미 있습니다'); return false; }
            delete rec.name; delete rec.units; delete rec.schools;
          } else {
            rec.name = $('[name=mname]', b).value.trim();
            let us = units.map(u => ({ id: u.id, name: stripZws(u.name || '').trim() })).filter(u => u.name);
            if (!rec.name) { toast('교재 이름을 입력하세요'); return false; }
            const bc = rec.type === 'gen' ? ($('[name=bkcat]:checked', b) || {}).value : '';
            if (rec.type === 'gen' && !bc) { toast('분류(독해·문법·듣기·단어)를 고르세요'); return false; }
            const noUnit = rec.type === 'gen' && (bc === 'listen' || bc === 'word');   // 듣기·단어: 단위 없음
            if (noUnit) us = JSON.parse(JSON.stringify((m && m.units) || []));   // 다른 분류에서 바꾼 교재의 기존 단위는 건드리지 않음 (새 교재는 없음)
            else if (!us.length) { toast('단위(과·강)를 하나 이상 넣으세요'); return false; }
            if (rec.type === 'gen') {
              if (!cls.size && !noCls) { toast('사용하는 반을 고르거나 “반 미지정”을 고르세요'); return false; }
              rec.cat = bc;
              delete rec.schools;
              rec.classIds = [...cls];
              // 반에 연결한 날 (반 교재 자동 등록의 시작일) — 새로 고른 반은 오늘, 원래 있던 반은 그대로
              const prevCls = new Set((m && m.classIds) || []), oldFrom = (m && m.clsFrom) || {}, clsFrom = {};
              rec.classIds.forEach(cid => {
                const f = prevCls.has(cid) ? oldFrom[cid] : todayStr();
                if (isYmd(f)) clsFrom[cid] = f;
              });
              if (Object.keys(clsFrom).length) rec.clsFrom = clsFrom; else delete rec.clsFrom;
              if (noCls) rec.noCls = true; else delete rec.noCls;
            } else {
              // 지운 단위가 시험 범위에 들어 있으면 확인 후 범위에서도 뺀다
              const gone = ((m && m.units) || []).filter(u => !us.some(x => x.id === u.id)).map(u => u.id);
              const hit = gone.length ? Store.where('exams', e => (e.items || []).some(it => it.matId === rec.id && (it.units || []).some(u => gone.includes(u.id)))) : [];
              if (hit.length && !await confirmDlg(`지운 단위가 시험 ${hit.length}개의 범위에 들어 있습니다.\n그 시험 범위에서도 빠집니다. 계속할까요?`, '계속', true)) return false;
              hit.forEach(e => Store.put('exams', Object.assign({}, e, {
                items: e.items.map(it => it.matId === rec.id ? Object.assign({}, it, { units: it.units.filter(u => !gone.includes(u.id)) }) : it)
                  .filter(it => it.matId !== rec.id || it.units.length),
              })));
              delete rec.classIds; delete rec.cat; delete rec.noCls; delete rec.clsFrom;
              // 쓰는 학교: 교과서만 (입력칸에 넣고 “+ 연결”을 누르지 않은 것도 함께 넣는다)
              if (rec.type === 'text') {
                const pend = b._addLk ? b._addLk(true) : 'empty';
                if (pend === 'bad') { toast('쓰는 학교: 학교와 학년을 모두 고르거나 입력칸을 비우세요'); return false; }
                rec.schools = links.map(lk => ({ school: lk.school, grade: lk.grade, sem: lk.sem }));
              } else delete rec.schools;
            }
            rec.units = us;
            delete rec.year; delete rec.month; delete rec.grade;
          }
          Store.put('meta', rec);
          toast('교재를 저장했습니다');
          const tab = rec.type === 'gen' ? 'gen' : 'mat';   // 저장된 곳의 탭을 보여준다
          if (this.tab !== tab) { this.tab = tab; this.sel.clear(); }
          if (App.page === 'exams') App.render(); else App.go('exams', {});
        } },
      ],
    });
  },
};

/* 시험+교재 화면 전용 스타일 */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.x7-cnt { display: inline-block; min-width: 5.2em; font-variant-numeric: tabular-nums; }
.x7-prepcell { min-width: 150px; cursor: pointer; }
.x7-prepcell:hover, .x7-prepcell.on { background: var(--accent-soft); }
.x7-pp { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; font-variant-numeric: tabular-nums; }
.x7-bar { flex: 1; min-width: 40px; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; }
.x7-bar i { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
.x7-ar { color: var(--ink-mute); font-size: 10px; }
.x7-nx { color: var(--accent-ink); font-weight: 600; margin-top: 2px; }
.x7-ok { color: var(--ok); font-weight: 600; margin-top: 2px; }
.x7-prow > td { background: var(--tint-2); padding: 8px 12px 10px; cursor: default; }
.x7-prow .np-srow:first-child { border-top: 0; padding-top: 0; }
.np-c.x7-next { outline: 2px dashed var(--accent); outline-offset: 1px; }
.x7-blk { border-top: 1px dashed var(--line); padding: 8px 0; user-select: text; }
.x7-blk ul { margin: 4px 0 0; padding-left: 20px; font-size: 13.5px; }
.x7-lk { display: inline-flex; align-items: center; gap: 4px; cursor: default; }
.x7-lk:hover { border-color: var(--line-strong); }
.x7-lk button { border: 0; background: none; padding: 0 2px; color: var(--ink-mute); cursor: pointer; font-size: 12px; line-height: 1; }
.x7-lk button:hover { color: var(--danger); }
.x7-sug { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 8px; margin-bottom: 8px; background: var(--accent-soft); border-radius: 6px; }
/* 교재 목록 (로드맵 표) */
.lu-pdfbtn { background: var(--accent-soft); border-color: var(--accent-line-2); color: var(--accent-ink); font-weight: 700; }
.lu-tbl { width: 100%; min-width: 900px; border-collapse: collapse; table-layout: fixed; background: var(--surface); }
.lu-tbl col.c-area { width: 96px; } .lu-tbl col.c-ser { width: 140px; }
.lu-tbl th, .lu-tbl td { border: 1px solid var(--line); padding: 5px; vertical-align: middle; }
.lu-tbl th { background: var(--tint-2); font-size: 13.5px; font-weight: 700; text-align: center; padding: 9px 4px; }
.lu-tbl th.on, .lu-tbl td.on { background: var(--accent-soft); }
.lu-tbl tr.lu-first > td { border-top: 2px solid var(--line-strong); }
.lu-tbl td.lu-area { text-align: center; }
.lu-albl { font-size: 15px; font-weight: 800; }
.lu-area.read .lu-albl { color: #1D5E93; } .lu-area.gram .lu-albl { color: #5B3FA6; } .lu-area.word .lu-albl { color: #A9650B; } .lu-area.listen .lu-albl { color: #1F7A52; }
.lu-aact { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-top: 6px; }
.lu-tbl td.lu-ser { font-size: 13.5px; font-weight: 700; color: var(--ink); word-break: keep-all; overflow-wrap: anywhere; }
.lu-tbl td.lu-none { text-align: center; color: var(--ink-mute); font-size: 13px; padding: 14px; }
.lu-bar { border-radius: 8px; padding: 6px 9px; border-left: 4px solid; cursor: pointer; word-break: keep-all; overflow-wrap: anywhere; transition: opacity .15s, box-shadow .15s; }
.lu-bar:hover { box-shadow: 0 1px 4px rgba(0,0,0,.15); }
.lu-bar.read { background: #E3F0FB; border-color: #1D5E93; } .lu-bar.gram { background: #EDE7FA; border-color: #5B3FA6; }
.lu-bar.word { background: #FCEFDC; border-color: #A9650B; } .lu-bar.listen { background: #E2F4EC; border-color: #1F7A52; }
.lu-bar b { display: block; font-size: 13.5px; color: #12304D; }
.lu-bar small { display: block; font-size: 11.5px; color: #475569; }
.lu-bar p { margin: 3px 0 0; font-size: 11.5px; color: #334155; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lu-bar.dim { opacity: .25; }
.lu-orow { align-items: center; gap: 6px; }
`;
  document.head.appendChild(st);
})();

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

  /* =========================================================
     성적 화면 — 반별 추이표 (출석부처럼 반마다 패널, 학생 한 줄, 시험은 시간순 열)
     설정(meta): { id 'SC_CFG', kind:'sccfg', start:{ y, s, k } }  ← 내신 시작 시험 (모의고사는 시작 없이 입력한 기록 전체)
     모의고사 점수 mock_score에 date(시행일) 추가 — 없으면 회차 달 1일로 본다. 열 = 시행일
     ========================================================= */
  CFG_ID: 'SC_CFG',
  edit: '',            // 내신 빠른 입력 중인 열 'y|s|k'
  TERM_MD: { '1mid': '04-25', '1final': '07-05', '2mid': '10-10', '2final': '12-05' },   // 학생 상세 그래프에서 내신 시험의 대략적인 날짜

  // 학년도 (3월에 학년이 바뀜)
  ayOf(d) { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 3 ? y : y - 1; },
  curTerm() { const t = todayStr(), y = +t.slice(0, 4), m = +t.slice(5, 7); return m >= 3 && m <= 8 ? { y, s: 1 } : m >= 9 ? { y, s: 2 } : { y: y - 1, s: 2 }; },
  // 그 학년도의 학년 (지금 학년에서 거꾸로 셈)
  gradeAt(st, ay) { const g = +st.grade - (this.ayOf(todayStr()) - ay); return g; },
  tKey(t) { return t.y * 100 + t.s * 10 + (t.k === 'final' ? 1 : 0); },
  tName(t) { return `${t.s}학기 ${t.k === 'final' ? '기말' : '중간'}`; },
  start() {
    const r = Store.get('meta', this.CFG_ID);
    if (r && r.start && r.start.y) return r.start;
    const ex = Store.all('scores').map(x => ({ y: +x.year, s: +x.semester, k: x.kind })).sort((a, b) => this.tKey(a) - this.tKey(b))[0];
    return ex || { y: this.curTerm().y, s: 1, k: 'mid' };
  },
  setStart(t) {
    const old = Store.get('meta', this.CFG_ID) || { id: this.CFG_ID, kind: 'sccfg' };
    Store.put('meta', Object.assign({}, old, { start: t, updatedAt: new Date().toISOString() }));
  },
  // 시작 시험 ~ 이번 학기 기말 (그 뒤 점수가 있으면 거기까지)
  terms() {
    const st = this.start(), cur = this.curTerm();
    let endKey = this.tKey({ y: cur.y, s: cur.s, k: 'final' });
    Store.all('scores').forEach(x => { const k = this.tKey({ y: +x.year, s: +x.semester, k: x.kind }); if (k > endKey) endKey = k; });
    const out = [];
    for (let y = st.y; y <= Math.floor(endKey / 100); y++) for (const s of [1, 2]) for (const k of ['mid', 'final']) {
      const t = { y, s, k };
      if (this.tKey(t) >= this.tKey(st) && this.tKey(t) <= endKey) out.push(t);
    }
    return out;
  },
  // 대상 학생: 재원 중·고등 (휴원·퇴원 제외), 반별로 (반 순서·학생 순서는 출석부와 같음)
  groups() {
    const list = Store.where('students', s => (s.status || 'active') === 'active' && +s.grade >= 7 && (s.name || '').trim());   // 휴원·퇴원 제외
    return Books.groupByClass(list).map(g => ({ c: g.c, list: g.list.slice().sort((a, b) => Students.sortFn(a, b)) })).filter(g => g.list.length);
  },
  lvShort(lv) { if (!lv) return ''; const [sys, n] = String(lv).split('-'); return n + '등급' + (sys === '5' ? '(5)' : ''); },
  mockLevel(raw) { const r = +raw; if (raw === '' || raw == null || isNaN(r)) return ''; return r >= 90 ? 1 : r >= 20 ? 10 - Math.floor(r / 10) : 9; },
  delta(cur, prev) {
    if (prev == null || cur == null) return '';
    const d = Math.round((cur - prev) * 10) / 10;
    return d > 0 ? `<i class="sc-up">▲${d}</i>` : d < 0 ? `<i class="sc-dn">▼${-d}</i>` : '<i class="sc-eq">-</i>';
  },
  // 추이 그래프 (0~100 고정 눈금 · 빈 칸은 건너뛰어 점선으로 이음)
  spark(vals, color) {
    const W = 104, H = 30, n = vals.length;
    if (!vals.some(v => v != null)) return '<span class="muted small">-</span>';
    const x = (i) => n === 1 ? W / 2 : 5 + i * (W - 10) / (n - 1);
    const y = (v) => 4 + (100 - Math.max(0, Math.min(100, v))) / 100 * (H - 8);
    let h = '', prev = null;
    vals.forEach((v, i) => {
      if (v == null) return;
      if (prev) h += `<line x1="${x(prev.i)}" y1="${y(prev.v)}" x2="${x(i)}" y2="${y(v)}" stroke="${color}" stroke-width="2"${i - prev.i > 1 ? ' stroke-dasharray="3 3"' : ''}/>`;
      prev = { i, v };
    });
    vals.forEach((v, i) => { if (v != null) h += `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${color}"/>`; });
    return `<svg class="sc-spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><line x1="0" y1="${y(50)}" x2="${W}" y2="${y(50)}" class="sc-mid"/>${h}</svg>`;
  },
  // 시작 시험 고르기 (내신 탭만) — 고정된 연도 없이, 내신 점수가 있는 가장 이른 해 ~ 올해
  //   (기록이 없으면 올해만, 지금 고른 시작 해는 항상 포함)
  dataMinYear() {
    const ys = Store.all('scores').map(x => +x.year).filter(Boolean);
    return ys.length ? Math.min(...ys) : this.curTerm().y;
  },
  startSelect() {
    const st = this.start(), cur = this.curTerm();
    let o = '';
    for (let y = Math.min(st.y, this.dataMinYear(), cur.y); y <= cur.y; y++) for (const s of [1, 2]) for (const k of ['mid', 'final']) {
      const v = `${y}|${s}|${k}`;
      o += `<option value="${v}" ${st.y === y && +st.s === s && st.k === k ? 'selected' : ''}>${y}년 ${s}학기 ${k === 'final' ? '기말' : '중간'}</option>`;
    }
    return `<label class="sc-start"><span>시작</span><select data-start>${o}</select></label>`;
  },

  render(main) {
    let h = `<div class="page-head"><h1>성적</h1>
      <div class="tabs sc-tabs"><button data-tab="school" class="${this.tab === 'school' ? 'active' : ''}">내신</button><button data-tab="mock" class="${this.tab === 'mock' ? 'active' : ''}">모의고사</button></div>
      <span class="grow"></span>${this.tab === 'school' ? this.startSelect() : ''}</div><div data-body></div>`;
    main.innerHTML = h;
    const body = $('[data-body]', main);
    main.onclick = (e) => {
      const tb = e.target.closest('[data-tab]'); if (tb) { this.tab = tb.dataset.tab; this.edit = ''; App.render(); return; }
      const nm = e.target.closest('[data-stu]'); if (nm) { this.openStudent(nm.dataset.stu); return; }
      if (this.tab === 'school') this.clickSchool(e); else this.clickMock(e);
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-start]')) { const [y, s, k] = e.target.value.split('|'); this.setStart({ y: +y, s: +s, k }); this.edit = ''; App.render(); return; }
      if (e.target.closest('[data-qin]')) this.saveQuick(e.target.closest('[data-qin]'));
    };
    main.oninput = null;
    if (this.tab === 'school') this.renderSchool(body); else this.renderMock(body);
    // 처음엔 최신 시험 쪽이 보이게
    $$('.sc-wrap', body).forEach(w => { w.scrollLeft = w.scrollWidth; });
  },

  /* ---------- 내신 ---------- */
  scoreOf(sid, t) { return Store.get('scores', this.scoreId(sid, t.y, t.s, t.k)); },
  renderSchool(el) {
    const terms = this.terms(), groups = this.groups();
    if (!groups.length) { el.innerHTML = '<div class="panel"><div class="empty">중·고등 학생이 없습니다.</div></div>'; return; }
    const years = []; terms.forEach(t => { const l = years[years.length - 1]; if (l && l.y === t.y) l.n++; else years.push({ y: t.y, n: 1 }); });
    const cols = `<colgroup><col class="sc-c-nm">${terms.map(() => '<col class="sc-c-t">').join('')}<col class="sc-c-tr"></colgroup>`;
    const yrow = `<tr class="sc-yr"><th class="sc-nm"></th>${years.map(o => `<th colspan="${o.n}" class="sc-ys">${o.y}</th>`).join('')}<th></th></tr>`;
    const trow = `<tr><th class="sc-nm">이름</th>${terms.map((t, i) => {
      const key = `${t.y}|${t.s}|${t.k}`, on = this.edit === key;
      return `<th class="sc-th${t.s === 1 && t.k === 'mid' || i === 0 ? ' sc-ys' : ''}${on ? ' on' : ''}" data-qcol="${key}" title="${on ? '빠른 입력 끝내기' : '이 시험 열을 한꺼번에 입력'}">${this.tName(t)}${on ? '<small>입력 중 · 끝내기</small>' : '<small>✎ 빠른 입력</small>'}</th>`;
    }).join('')}<th class="sc-tr">추이</th></tr>`;
    let h = `<div class="toolbar small soft"><span>칸을 누르면 점수·등급을 입력합니다. 시험 이름(열 머리)을 누르면 그 열 전체를 한꺼번에 입력할 수 있습니다. 이름을 누르면 그 학생의 내신·모의고사 추이를 크게 봅니다.</span></div>`;
    groups.forEach(g => {
      h += `<div class="panel sc-sec"><div class="sc-sec-h"><h2>${g.c ? Classes.dot(g.c) + esc(g.c.name) : '반 없음'}<span class="sub">${g.list.length}명</span></h2></div>
        <div class="sc-wrap"><table class="sc-tbl">${cols}<thead>${yrow}${trow}</thead><tbody>`;
      g.list.forEach(st => {
        let prev = null;
        const vals = [];
        const cells = terms.map((t, i) => {
          const sc = this.scoreOf(st.id, t), key = `${t.y}|${t.s}|${t.k}`;
          const gr = sc && +sc.grade ? +sc.grade : this.gradeAt(st, t.y);
          const ys = t.s === 1 && t.k === 'mid' || i === 0 ? ' sc-ys' : '';
          const v = sc && sc.score !== '' && sc.score != null ? +sc.score : null;
          vals.push(v);
          if (this.edit === key) {
            const r = `<td class="sc-q${ys}" data-qin="${st.id}|${key}"><input type="number" step="0.1" min="0" max="100" data-qs value="${v != null ? esc(v) : ''}" placeholder="${gr >= 7 ? '' : '-'}">`
              + (isHigh(gr) ? `<select data-ql>${this.levelOptions(sc ? sc.level : '').replace('등급 없음', '등급')}</select>` : '') + '</td>';
            if (v != null) prev = v;
            return r;
          }
          if (gr < 7) return `<td class="sc-na${ys}" title="초등 시기">·</td>`;
          if (v == null) return `<td class="sc-e${ys}" data-sc="${st.id}|${key}"></td>`;
          const d = this.delta(v, prev); prev = v;
          return `<td class="sc-v${ys}" data-sc="${st.id}|${key}" title="${esc(schoolGradeLabel(sc.school, gr))}"><b>${esc(v)}</b>${d}${sc.level ? `<small>${this.lvShort(sc.level)}</small>` : ''}</td>`;
        }).join('');
        h += `<tr><td class="sc-nm"><button type="button" class="sc-name" data-stu="${st.id}"><b>${esc(st.name)}</b><span>${esc(stTag(st))}</span></button>${st.status !== 'active' ? ' ' + Students.statusBadge(st) : ''}</td>${cells}<td class="sc-tr">${this.spark(vals, '#2B7FC1')}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
    });
    el.innerHTML = h;
  },
  clickSchool(e) {
    const q = e.target.closest('[data-qcol]');
    if (q) { this.edit = this.edit === q.dataset.qcol ? '' : q.dataset.qcol; App.render(); return; }
    const c = e.target.closest('td[data-sc]');
    if (c) { const [sid, y, s, k] = c.dataset.sc.split('|'); this.openSchoolCell(sid, { y: +y, s: +s, k }); }
  },
  // 저장 (score '' 이면 지움)
  putSchool(sid, t, score, level) {
    const st = Store.get('students', sid); if (!st) return false;
    const id = this.scoreId(sid, t.y, t.s, t.k), cur = Store.get('scores', id);
    if (score === '' || score == null) { if (cur) Store.del('scores', id); return true; }
    const n = +score;
    if (isNaN(n) || n < 0 || n > 100) { toast('점수는 0~100 사이로 입력하세요'); return false; }
    const gr = cur && +cur.grade ? +cur.grade : this.gradeAt(st, t.y);
    Store.put('scores', Object.assign({}, cur || { id, studentId: sid, year: t.y, semester: t.s, kind: t.k, school: st.school, grade: gr }, { score: n, level: isHigh(gr) ? (level || '') : '' }));
    return true;
  },
  saveQuick(td) {
    const [sid, y, s, k] = td.dataset.qin.split('|');
    const v = $('[data-qs]', td).value.trim(), lv = $('[data-ql]', td) ? $('[data-ql]', td).value : '';
    if (v === '' && lv) { toast('점수를 먼저 입력하세요'); return; }
    if (this.putSchool(sid, { y: +y, s: +s, k }, v, lv)) td.classList.add('saved');
  },
  openSchoolCell(sid, t) {
    const st = Store.get('students', sid), sc = this.scoreOf(sid, t);
    const gr = sc && +sc.grade ? +sc.grade : this.gradeAt(st, t.y);
    Modal.open({
      title: `${st.name} · ${t.y}년 ${this.tName(t)}`, size: 'sm',
      body: `<div class="form"><label class="req">점수</label><div class="row"><input type="number" name="score" step="0.1" min="0" max="100" value="${sc ? esc(sc.score) : ''}" style="width:110px"><span class="hint">${esc(schoolGradeLabel(sc ? sc.school : st.school, gr))}</span></div>
        ${isHigh(gr) ? `<label>등급</label><select name="level">${this.levelOptions(sc ? sc.level : '')}</select>` : ''}</div>`,
      buttons: [
        ...(sc ? [{ text: '삭제', cls: 'danger', left: true, onClick: () => { this.putSchool(sid, t, ''); toast('삭제했습니다'); App.render(); } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const v = $('[name=score]', m.body).value.trim(), lvEl = $('[name=level]', m.body);
          if (v === '') { toast('점수를 입력하세요'); return false; }
          if (!this.putSchool(sid, t, v, lvEl ? lvEl.value : '')) return false;
          App.render();
        } },
      ],
    });
  },

  /* ---------- 모의고사 ---------- */
  msDate(x) { const mk = Store.get('mocks', x.mockId); return isYmd(x.date) ? x.date : mk ? `${mk.year}-${pad(mk.month)}-01` : ''; },
  // 그 해 그 학년의 실제 시험인지 (아니면 지난 시험지·다른 학년 시험지로 연습)
  isReal(mk, st, date) { return +mk.year === +date.slice(0, 4) && +mk.grade === this.gradeAt(st, this.ayOf(date)); },
  mockShort(mk) { return `${String(mk.year).slice(-2)}년 ${mk.month}월 ${gradeLabel(mk.grade)}`; },
  // 이 반의 열: 시행일마다 하나 (시작 해 1월부터)
  mockCols(list) {
    const ids = new Set(list.map(s => s.id));
    const byDate = {};
    Store.where('mock_scores', x => ids.has(x.studentId) && Store.get('mocks', x.mockId)).forEach(x => {
      const d = this.msDate(x); if (!d) return;
      (byDate[d] = byDate[d] || []).push(x);
    });
    return Object.keys(byDate).sort().map(d => {
      const xs = byDate[d], mids = [...new Set(xs.map(x => x.mockId))], mks = mids.map(id => Store.get('mocks', id));
      const real = xs.every(x => this.isReal(Store.get('mocks', x.mockId), Store.get('students', x.studentId), d));
      const months = [...new Set(mks.map(m => +m.month))];
      const label = real && months.length === 1 ? `${months[0]}월 모고` : mks.length === 1 ? this.mockShort(mks[0]) : `모고 ${mks.length}종`;
      return { date: d, xs, mids, label, title: mks.map(m => this.mockTitle(m)).join(' / ') };
    });
  },
  renderMock(el) {
    const groups = this.groups();
    if (!groups.length) { el.innerHTML = '<div class="panel"><div class="empty">중·고등 학생이 없습니다.</div></div>'; return; }
    let h = `<div class="toolbar small soft"><span>고등 반은 시행일로 열을 맞추고(“6월 모고”), 중등 반은 학생마다 푼 순서대로 칸이 쌓입니다(“24년 6월 고1”). “+ 모의고사 입력”은 같은 시험지를 여럿이 함께 푼 경우, 중등의 줄 끝 “+ 추가”는 그 학생만 넣을 때 씁니다. 칸을 누르면 원점수·틀린 번호·시행일을 고칩니다. 등급은 영어 절대평가 기준으로 자동 표시됩니다.</span></div>`;
    groups.forEach(g => {
      // 표 모양: 고등 반(학생 절반 이상이 고등) = 날짜 맞춤 / 중등 반 = 학생별 순서
      g._per = g.list.filter(s => isHigh(s.grade)).length * 2 < g.list.length;
      if (g._per) { h += this.perHtml(g); return; }
      const cols = this.mockCols(g.list);
      const years = []; cols.forEach(c => { const y = +c.date.slice(0, 4), l = years[years.length - 1]; if (l && l.y === y) l.n++; else years.push({ y, n: 1 }); });
      h += `<div class="panel sc-sec"><div class="sc-sec-h"><h2>${g.c ? Classes.dot(g.c) + esc(g.c.name) : '반 없음'}<span class="sub">${g.list.length}명</span></h2><span class="grow"></span>
        <button class="btn sm primary" data-madd="${g.c ? g.c.id : ''}">+ 모의고사 입력</button></div>`;
      if (!cols.length) { h += `<div class="empty small">모의고사 기록이 없습니다. “+ 모의고사 입력”으로 넣으세요.</div></div>`; return; }
      const cg = `<colgroup><col class="sc-c-nm">${cols.map(() => '<col class="sc-c-t">').join('')}<col class="sc-c-tr"></colgroup>`;
      let firstY = {};
      h += `<div class="sc-wrap"><table class="sc-tbl">${cg}<thead><tr class="sc-yr"><th class="sc-nm"></th>${years.map(o => `<th colspan="${o.n}" class="sc-ys">${o.y}</th>`).join('')}<th></th></tr>
        <tr><th class="sc-nm">이름</th>${cols.map((c, i) => { const y = c.date.slice(0, 4), ys = !firstY[y]; firstY[y] = 1; return `<th class="sc-th${ys ? ' sc-ys' : ''}" data-mcol="${i}" title="${esc(c.title)} · 눌러서 회차 분석">${esc(c.label)}<small>${fmtMD(c.date)}</small></th>`; }).join('')}<th class="sc-tr">추이</th></tr></thead><tbody>`;
      g.list.forEach(st => {
        let prev = null; const vals = []; firstY = {};
        const cells = cols.map((c, i) => {
          const y = c.date.slice(0, 4), ys = !firstY[y] ? ' sc-ys' : ''; firstY[y] = 1;
          const x = c.xs.find(o => o.studentId === st.id);
          const v = x && x.raw !== '' && x.raw != null ? +x.raw : null;
          vals.push(v);
          if (v == null) return `<td class="sc-e${ys}" data-mc="${st.id}|${i}"></td>`;
          const d = this.delta(v, prev); prev = v;
          const mk = Store.get('mocks', x.mockId);
          return `<td class="sc-v${ys}" data-mc="${st.id}|${i}" title="${esc(this.mockTitle(mk))} · ${fmtMD(c.date)}${(x.wrong || []).length ? ' · 틀린 번호 ' + esc(this.compressNums(x.wrong)) : ''}"><b>${esc(v)}</b>${d}<small>${this.mockLevel(v)}등급</small></td>`;
        }).join('');
        h += `<tr><td class="sc-nm"><button type="button" class="sc-name" data-stu="${st.id}"><b>${esc(st.name)}</b><span>${esc(stTag(st))}</span></button></td>${cells}<td class="sc-tr">${this.spark(vals, '#1F8F78')}</td></tr>`;
      });
      h += '</tbody></table></div></div>';
      g._cols = cols;
    });
    el.innerHTML = h;
    this._mg = groups;                      // 칸 클릭 때 쓸 열 정보
  },
  // 학생별 순서 표 (중등): 학생마다 푼 순서대로 왼쪽부터, 칸 = 시험지 · 시행일 · 점수
  perList(st) {
    return Store.where('mock_scores', x => x.studentId === st.id && Store.get('mocks', x.mockId) && x.raw !== '' && x.raw != null)
      .map(x => ({ x, d: this.msDate(x), mk: Store.get('mocks', x.mockId) })).filter(o => o.d)
      .sort((a, b) => ko(a.d, b.d) || ko(a.x.mockId, b.x.mockId));
  },
  perHtml(g) {
    const rows = g.list.map(st => ({ st, list: this.perList(st) }));
    const n = Math.max(0, ...rows.map(r => r.list.length)) + 1;          // + 추가 칸 하나
    let h = `<div class="panel sc-sec"><div class="sc-sec-h"><h2>${g.c ? Classes.dot(g.c) + esc(g.c.name) : '반 없음'}<span class="sub">${g.list.length}명 · 학생별 순서</span></h2><span class="grow"></span>
      <button class="btn sm primary" data-madd="${g.c ? g.c.id : ''}">+ 모의고사 입력</button></div>
      <div class="sc-wrap"><table class="sc-tbl sc-per"><colgroup><col class="sc-c-nm">${Array.from({ length: n }, () => '<col class="sc-c-p">').join('')}<col class="sc-c-tr"></colgroup>
      <thead><tr><th class="sc-nm">이름</th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}회</th>`).join('')}<th class="sc-tr">추이</th></tr></thead><tbody>`;
    rows.forEach(({ st, list }) => {
      let prev = null;
      const cells = Array.from({ length: n }, (_, i) => {
        const o = list[i];
        if (!o) return i === list.length ? `<td class="sc-padd"><button type="button" class="sc-addbtn" data-padd="${st.id}">+ 추가</button></td>` : '<td class="sc-e0"></td>';
        const v = +o.x.raw, d = this.delta(v, prev); prev = v;
        const lb = this.isReal(o.mk, st, o.d) ? `${o.mk.month}월 모고` : this.mockShort(o.mk);
        return `<td class="sc-v sc-pc" data-pc="${o.x.id}" title="${esc(this.mockTitle(o.mk))} · ${esc(fmtDate(o.d))}${(o.x.wrong || []).length ? ' · 틀린 번호 ' + esc(this.compressNums(o.x.wrong)) : ''}"><em>${esc(lb)}</em><b>${v}</b>${d}<small>${this.mockLevel(v)}등급 · ${fmtMD(o.d)}</small></td>`;
      }).join('');
      h += `<tr><td class="sc-nm"><button type="button" class="sc-name" data-stu="${st.id}"><b>${esc(st.name)}</b><span>${esc(stTag(st))}</span></button></td>${cells}<td class="sc-tr">${this.spark(list.map(o => +o.x.raw), '#1F8F78')}</td></tr>`;
    });
    return h + '</tbody></table></div></div>';
  },
  // 한 학생만 추가: 시험지 · 시행일 고르고 → 원점수·틀린 번호 입력 창
  openStudentMock(sid) {
    const st = Store.get('students', sid);
    const opts = (sel) => Store.all('mocks').sort((a, b) => b.year - a.year || b.month - a.month || a.grade - b.grade)
      .map(mk => `<option value="${mk.id}" ${mk.id === sel ? 'selected' : ''}>${esc(this.mockTitle(mk))}</option>`).join('');
    Modal.open({
      title: `${st.name} · 모의고사 추가`, autofocus: false,
      body: `<div class="form"><label class="req">시험지</label><div class="row" style="flex-wrap:nowrap"><select name="mock" style="flex:1;min-width:0">${opts('') || '<option value="">회차가 없습니다</option>'}</select><button type="button" class="btn sm" data-newmk>+ 새 회차</button></div>
        <label class="req">시행일</label><input type="date" name="date" value="${todayStr()}" style="width:170px"></div>`,
      onMount: (b) => { $('[data-newmk]', b).addEventListener('click', () => this.openMockModal(null, (rec) => { $('[name=mock]', b).innerHTML = opts(rec.id); })); },
      buttons: [
        { text: '취소' },
        { text: '다음', cls: 'primary', primary: true, onClick: (m) => {
          const mid = $('[name=mock]', m.body).value, date = $('[name=date]', m.body).value;
          if (!mid) { toast('시험지를 고르세요'); return false; }
          if (!isYmd(date)) { toast('시행일을 입력하세요'); return false; }
          if (Store.get('mock_scores', 'MS_' + mid + '_' + sid)) toast('이미 푼 시험지입니다. 기존 기록을 고칩니다');
          setTimeout(() => this.openWrongModal(Store.get('mocks', mid), sid, date), 0);
        } },
      ],
    });
  },
  colOf(td) {
    const sec = td.closest('.sc-sec'), secs = $$('#main .sc-sec');
    const g = this._mg[secs.indexOf(sec)];
    return g ? g._cols : [];
  },
  clickMock(e) {
    const ad = e.target.closest('[data-madd]');
    if (ad) { const g = this._mg.find(x => (x.c ? x.c.id : '') === ad.dataset.madd); if (g) this.openMockEntry(g); return; }
    const pa = e.target.closest('[data-padd]');
    if (pa) { this.openStudentMock(pa.dataset.padd); return; }
    const pc = e.target.closest('[data-pc]');
    if (pc) { const x = Store.get('mock_scores', pc.dataset.pc); if (x) this.openWrongModal(Store.get('mocks', x.mockId), x.studentId); return; }
    const mc = e.target.closest('[data-mcol]');
    if (mc) { const c = this.colOf(mc)[+mc.dataset.mcol]; if (c) this.openMockStats(c); return; }
    const td = e.target.closest('td[data-mc]');
    if (td) {
      const [sid, i] = td.dataset.mc.split('|'), c = this.colOf(td)[+i]; if (!c) return;
      const x = c.xs.find(o => o.studentId === sid);
      const st = Store.get('students', sid);
      // 빈 칸: 그 학생 학년에 맞는 회차가 있으면 그 회차, 아니면 열의 첫 회차
      const mk = x ? Store.get('mocks', x.mockId) : (c.mids.map(id => Store.get('mocks', id)).find(m => this.isReal(m, st, c.date)) || Store.get('mocks', c.mids[0]));
      this.openWrongModal(mk, sid, c.date);
    }
  },
  // 반 단위 입력: 회차 · 시행일 고르고 원점수 한꺼번에
  openMockEntry(g) {
    const mocks = () => Store.all('mocks').sort((a, b) => b.year - a.year || b.month - a.month || a.grade - b.grade);
    const opts = (sel) => mocks().map(mk => `<option value="${mk.id}" ${mk.id === sel ? 'selected' : ''}>${esc(this.mockTitle(mk))}</option>`).join('');
    let sel = (mocks()[0] || {}).id || '';
    const rows = (b) => {
      const mid = $('[name=mock]', b).value;
      $('[data-rows]', b).innerHTML = g.list.map(st => {
        const x = mid ? Store.get('mock_scores', 'MS_' + mid + '_' + st.id) : null;
        return `<div class="sc-erow"><b>${esc(st.name)}</b><span class="muted small">${esc(stTag(st))}</span><input type="number" min="0" max="100" step="1" data-er="${st.id}" value="${x && x.raw != null ? esc(x.raw) : ''}" placeholder="원점수">${x ? `<span class="small soft">${fmtMD(this.msDate(x))} 입력됨</span>` : ''}</div>`;
      }).join('');
    };
    Modal.open({
      title: `${g.c ? g.c.name : '반 없음'} · 모의고사 입력`, size: 'lg', autofocus: false,
      body: `<div class="form"><label class="req">회차</label><div class="row"><select name="mock" style="min-width:260px">${opts(sel) || '<option value="">회차가 없습니다</option>'}</select><button type="button" class="btn sm" data-newmk>+ 새 회차</button></div>
        <label class="req">시행일</label><div class="row"><input type="date" name="date" value="${todayStr()}" style="width:170px"><span class="hint">실제로 시험을 본 날 (예: 11월 시험을 10월에 봤으면 10월 날짜)</span></div></div>
        <div class="sc-erows" data-rows></div><p class="small muted">비워 둔 학생은 저장하지 않습니다. 이미 입력된 학생은 원점수·시행일이 바뀝니다 (틀린 번호는 유지).</p>`,
      onMount: (b) => {
        rows(b);
        $('[name=mock]', b).addEventListener('change', () => rows(b));
        $('[data-newmk]', b).addEventListener('click', () => this.openMockModal(null, (rec) => { $('[name=mock]', b).innerHTML = opts(rec.id); rows(b); }));
      },
      buttons: [
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const mid = $('[name=mock]', m.body).value, date = $('[name=date]', m.body).value;
          if (!mid) { toast('회차를 고르세요'); return false; }
          if (!isYmd(date)) { toast('시행일을 입력하세요'); return false; }
          let n = 0;
          for (const inp of $$('[data-er]', m.body)) {
            const v = inp.value.trim(); if (v === '') continue;
            if (isNaN(+v) || +v < 0 || +v > 100) { toast('원점수는 0~100 사이로 입력하세요'); inp.focus(); return false; }
          }
          $$('[data-er]', m.body).forEach(inp => {
            const v = inp.value.trim(); if (v === '') return;
            const id = 'MS_' + mid + '_' + inp.dataset.er, cur = Store.get('mock_scores', id);
            Store.put('mock_scores', Object.assign({}, cur || { id, mockId: mid, studentId: inp.dataset.er, wrong: [] }, { raw: +v, date }));
            n++;
          });
          toast(n ? `${n}명 저장했습니다` : '입력한 점수가 없습니다'); App.render();
        } },
      ],
    });
  },
  // 열(시행일) 분석: 회차마다 응시 인원 · 평균 · 많이 틀린 문항
  openMockStats(c) {
    const body = c.mids.map(id => {
      const mk = Store.get('mocks', id), xs = Store.where('mock_scores', x => x.mockId === id);
      const raws = xs.filter(x => x.raw !== '' && x.raw != null).map(x => +x.raw);
      const avg = raws.length ? (raws.reduce((a, b) => a + b, 0) / raws.length).toFixed(1) : '-';
      const wc = {}; xs.forEach(x => (x.wrong || []).forEach(n => { wc[n] = (wc[n] || 0) + 1; }));
      const top = Object.keys(wc).map(Number).sort((a, b) => wc[b] - wc[a] || a - b).slice(0, 10);
      return `<div class="sc-stat"><div class="sc-stat-h"><b>${esc(this.mockTitle(mk))}</b><button type="button" class="btn sm" data-edmk="${mk.id}">회차 수정</button></div>
        ${mk.memo ? `<div class="pre small soft">${esc(mk.memo)}</div>` : ''}
        <div class="small" style="display:flex;gap:16px;margin:6px 0">응시 <b>${raws.length}</b>명 <span>평균 원점수 <b>${avg}</b></span><span class="muted">(이 회차 전체 · 모든 시행일)</span></div>
        ${top.length ? `<div class="top-wrong">${top.map(n => `<span class="badge red">${n}번 · ${wc[n]}명</span>`).join('')}</div>` : '<div class="small muted">틀린 번호 기록이 없습니다.</div>'}</div>`;
    }).join('');
    Modal.open({
      title: `${c.label} · ${fmtMD(c.date)}`, size: 'lg', body,
      onMount: (b, m) => b.addEventListener('click', (e) => { const x = e.target.closest('[data-edmk]'); if (x) { m.close(); this.openMockModal(x.dataset.edmk); } }),
      buttons: [{ text: '닫기', primary: true }],
    });
  },
  /* ---------- 학생 상세: 내신 · 모의고사 추이 그래프 ---------- */
  openStudent(sid) {
    const st = Store.get('students', sid); if (!st) return;
    const from = this.start().y + '-01-01';
    const sch = Store.where('scores', x => x.studentId === sid && x.score !== '' && x.score != null)
      .map(x => ({ d: `${x.year}-${this.TERM_MD[x.semester + x.kind]}`, v: +x.score, t: `${x.year}년 ${this.tName({ s: x.semester, k: x.kind })}`, lv: this.lvShort(x.level) }))
      .filter(p => p.d >= from).sort((a, b) => ko(a.d, b.d));
    const mok = Store.where('mock_scores', x => x.studentId === sid && x.raw !== '' && x.raw != null && Store.get('mocks', x.mockId))
      .map(x => { const mk = Store.get('mocks', x.mockId), d = this.msDate(x); return { d, v: +x.raw, t: (this.isReal(mk, st, d) ? `${mk.month}월 모고` : this.mockShort(mk)) + ' · ' + d.slice(2, 4) + '년 ' + fmtMD(d), lv: this.mockLevel(x.raw) + '등급' }; })
      .filter(p => p.d).sort((a, b) => ko(a.d, b.d));      // 모의고사는 기록 전체
    const all = sch.concat(mok);
    let chart = '<div class="empty">시작 시험 이후 기록이 없습니다.</div>';
    if (all.length) {
      const W = 820, H = 300, L = 40, R = 16, T = 14, B = 34;
      const ds = all.map(p => parseYmd(p.d).getTime()), t0 = Math.min(...ds), t1 = Math.max(...ds), span = Math.max(t1 - t0, 864e5 * 30);
      const x = (d) => L + (parseYmd(d).getTime() - t0) / span * (W - L - R);
      const y = (v) => T + (100 - v) / 100 * (H - T - B);
      let g = '';
      [0, 20, 40, 60, 80, 100].forEach(v => { g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="sc-grid"/><text x="${L - 8}" y="${y(v) + 4}" class="sc-ax" text-anchor="end">${v}</text>`; });
      // 연도·월 눈금 (분기마다)
      const d0 = new Date(t0), d1 = new Date(t0 + span);
      for (let dt = new Date(d0.getFullYear(), Math.floor(d0.getMonth() / 3) * 3, 1); dt <= d1; dt = new Date(dt.getFullYear(), dt.getMonth() + 3, 1)) {
        const xx = x(ymd(dt)); if (xx < L - 1) continue;
        g += `<text x="${xx}" y="${H - 12}" class="sc-ax" text-anchor="middle">${dt.getMonth() === 0 ? dt.getFullYear() + '.' : ''}${dt.getMonth() + 1}월</text>`;
      }
      const line = (pts, color) => pts.length ? `<polyline points="${pts.map(p => x(p.d) + ',' + y(p.v)).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>` + pts.map(p => `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4.5" fill="#fff" stroke="${color}" stroke-width="2.5"><title>${esc(p.t)} · ${p.v}점${p.lv ? ' · ' + p.lv : ''}</title></circle><text x="${x(p.d)}" y="${y(p.v) - 10}" class="sc-pt" text-anchor="middle" fill="${color}">${p.v}</text>`).join('') : '';
      chart = `<svg class="sc-big" viewBox="0 0 ${W} ${H}" width="100%">${g}${line(sch, '#2B7FC1')}${line(mok, '#1F8F78')}</svg>
        <div class="sc-legend"><span><i style="background:#2B7FC1"></i>내신</span><span><i style="background:#1F8F78"></i>모의고사</span><span class="muted">점에 마우스를 올리면 시험 이름이 보입니다</span></div>`;
    }
    const tbl = (title, pts) => `<div class="sc-list"><b>${title}</b>${pts.length ? pts.map(p => `<div><span>${esc(p.t)}</span><b>${p.v}</b><small>${esc(p.lv || '')}</small></div>`).join('') : '<div class="muted small">기록 없음</div>'}</div>`;
    Modal.open({
      title: `${st.name} · ${stTag(st)} 성적 추이`, size: 'xl',
      body: `${chart}<div class="sc-lists">${tbl('내신', sch)}${tbl('모의고사', mok)}</div>`,
      buttons: [{ text: '닫기', primary: true }],
    });
  },

  // onSaved(rec): 저장 뒤 부를 함수 (모의고사 입력 창에서 새 회차를 만들 때)
  openMockModal(id, onSaved) {
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
          if (onSaved) onSaved(rec);
        } },
      ],
    });
  },

  // date: 새로 넣을 때 시행일 기본값 (열의 날짜)
  openWrongModal(mk, sid, date) {
    const s = Store.get('students', sid);
    const id = 'MS_' + mk.id + '_' + sid;
    const cur = Store.get('mock_scores', id);
    let sel = new Set(cur ? cur.wrong || [] : []);
    let grid = '';
    for (let i = 1; i <= 45; i++) grid += `<button type="button" data-n="${i}" class="${sel.has(i) ? 'on' : ''}">${i}</button>`;
    Modal.open({
      title: `${s.name} · ${this.mockTitle(mk)}`, size: 'lg',
      body: `<div class="form"><label class="req">시행일</label><div class="row"><input type="date" name="date" value="${esc(cur ? this.msDate(cur) : (isYmd(date) ? date : todayStr()))}" style="width:170px"><span class="hint">실제로 시험을 본 날</span></div>
        <label class="req">원점수</label><div class="row"><input type="number" name="raw" min="0" max="100" step="1" value="${cur && cur.raw != null ? esc(cur.raw) : ''}" style="width:100px"><span class="hint">0~100</span></div>
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
          const dt = $('[name=date]', m.body).value;
          if (!isYmd(dt)) { toast('시행일을 입력하세요'); return false; }
          Store.put('mock_scores', { id, mockId: mk.id, studentId: sid, raw, wrong: [...sel].sort((a, b) => a - b), date: dt });
          toast('저장했습니다'); App.render();
        } },
      ],
    });
  },
};
