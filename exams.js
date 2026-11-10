/* =========================================================
   exams.js — 시험정보 + 성적(내신 / 모의고사)
   exam:  { school, grade, year, semester, kind:'mid'|'final', start, end, range(기타 범위·메모),
            items(구조화된 시험 범위 — lessons.js의 NP 설명 참고), fmt:'mc'(객관식만)|'mix'(객관식+서술형), memo,
            done(완료된 시험), doneAt }
   교재는 meta 테이블에 저장 (NP.mats): 시험 교재(모의고사·교과서·부교재) / 일반 교재(type 'gen', 사용하는 반 classIds)
   score: id = S_학생_연도_학기_시험, { studentId, year, semester, kind, score, level:'9-2'|'5-1'|'', school, grade }
   mock:  { year, month, grade, memo }
   mock_score: id = MS_회차_학생, { mockId, studentId, raw, wrong:[번호] }
   ========================================================= */
const Exams = {
  year: '',
  sem: '',
  q: '',
  tab: 'exam',          // 'exam' 진행중인 시험 / 'done' 완료된 시험 / 'mat' 시험 교재 / 'gen' 일반 교재
  matType: '',
  sel: new Set(),       // 체크한 항목 (탭을 바꾸거나 조건을 바꾸면 비움)
  prepOpen: new Set(),  // 수업 준비 칸을 펼친 시험

  FMT: { mc: '객관식만', mix: '객관식+서술형' },
  // 형식: fmt 'mc' | 'mix' (예전 기록은 문항 수로 판단)
  fmtOf(ex) { return this.FMT[ex.fmt] ? ex.fmt : (+ex.essayCount ? 'mix' : +ex.mcCount ? 'mc' : ''); },
  formatLabel(ex) { return this.FMT[this.fmtOf(ex)] || ''; },

  /* ---------- 공통 머리 · 탭 · 일괄 처리 줄 ---------- */
  headHtml() {
    return `<div class="page-head"><h1>시험+교재</h1><button class="btn primary" data-a="add">+ 시험 등록</button><button class="btn primary" data-a="addmat">+ 교재 등록</button>
      <span class="sub">학교별 시험 기간·범위·형식 · 시험 교재 · 일반 교재</span></div>`;
  },
  tabsHtml() {
    const ex = Store.all('exams'), dn = ex.filter(e => e.done).length;
    const t = (k, label, n) => `<button data-xtab="${k}" class="${this.tab === k ? 'active' : ''}">${label}<span class="cnt">${n}</span></button>`;
    return `<div class="tabs">${t('exam', '진행중인 시험', ex.length - dn)}${t('done', '완료된 시험', dn)}${t('mat', '시험 교재', NP.examMats().length)}${t('gen', '일반 교재', NP.genMats().length)}</div>`;
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
    if (e.target.closest('[data-a=addmat]')) { this.openMatModal(null); return true; }
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
    if (this.tab === 'mat' || this.tab === 'gen') { this.renderMats(main); return; }
    const done = this.tab === 'done';
    const all = Store.all('exams');
    const years = [...new Set([new Date().getFullYear(), ...all.map(e => +e.year)])].sort((a, b) => b - a);
    const q = this.q.trim();
    const list = all.filter(e => !!e.done === done)
      .filter(e => (!this.year || +e.year === +this.year) && (!this.sem || +e.semester === +this.sem))
      .filter(e => !q || [e.school, examTitle(e), e.range, NP.rangeText(e), e.memo].some(v => String(v || '').includes(q)))
      .sort((a, b) => b.year - a.year || b.semester - a.semester || (a.kind === b.kind ? 0 : a.kind === 'final' ? -1 : 1) || ko(a.school, b.school) || a.grade - b.grade);
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
    if (m.type === 'gen') return (m.classIds || []).map(id => Store.get('classes', id)).filter(Boolean).map(c => '반: ' + c.name + (c.active === false ? ' (종료)' : ''));
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
        <span class="soft">(시험 교재: 시험 범위에서 빼기 / 일반 교재: 교재 수정에서 반 연결 해제)</span></p>
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
    if (!await confirmDlg(`교재 ${ok.length}개를 삭제할까요?${blocked.length ? `\n연결된 교재 ${blocked.length}개는 삭제하지 않습니다.` : ''}\n시험 교재의 수업 준비 표시도 함께 지워집니다.`, '삭제', true)) return;
    ok.forEach(m => { Store.del('meta', m.id); Store.del('meta', NP.ppId(m.id)); this.sel.delete(m.id); });
    toast(`교재 ${ok.length}개를 삭제했습니다`);
    App.render();
    if (blocked.length) this.showBlocked(blocked, ok.length);
  },

  /* ---------- 시험 등록 / 수정 ---------- */
  openModal(id) {
    const ex = id ? Store.get('exams', id) : null;
    const now = new Date();
    const v = ex || { school: '', grade: 10, year: now.getFullYear(), semester: now.getMonth() >= 6 ? 2 : 1, kind: 'mid', start: '', end: '', range: '', memo: '' };
    const fmt = ex ? this.fmtOf(ex) : '';
    // 구조화된 시험 범위 (편집용 사본)
    const items = JSON.parse(JSON.stringify(v.items || [])).filter(it => { const m = NP.mat(it.matId); return m && m.type !== 'gen'; });
    const body = `<div class="form">
      <label class="req">학교·학년</label><div class="row"><input type="text" name="school" list="dl-schools" value="${esc(v.school)}" placeholder="예: 금천고" style="flex:1"><select name="grade">${gradeOptions(v.grade)}</select></div>
      <label class="req">시험</label><div class="row"><input type="number" name="year" value="${esc(v.year)}" min="2000" max="2100" style="width:90px">년
        <select name="semester"><option value="1" ${+v.semester === 1 ? 'selected' : ''}>1학기</option><option value="2" ${+v.semester === 2 ? 'selected' : ''}>2학기</option></select>
        <select name="kind"><option value="mid" ${v.kind === 'mid' ? 'selected' : ''}>중간고사</option><option value="final" ${v.kind === 'final' ? 'selected' : ''}>기말고사</option></select></div>
      <label>시험 기간</label><div class="row"><input type="date" name="start" value="${esc(v.start)}"> ~ <input type="date" name="end" value="${esc(v.end)}"><span class="hint">하루면 시작일만</span></div>
      <label class="top">시험 범위</label><div data-rbox></div>
      <label class="top">기타 범위·메모</label><textarea name="range" rows="3" placeholder="교재로 등록하지 않은 범위나 참고 사항 (예: 프린트 1-3)">${esc(v.range)}</textarea>
      <label class="req">형식</label><div class="row">${Object.keys(this.FMT).map(k => `<label class="chk"><input type="radio" name="fmt" value="${k}" ${fmt === k ? 'checked' : ''}>${this.FMT[k]}</label>`).join('')}</div>
      <label class="top">메모</label><textarea name="memo" rows="3">${esc(v.memo)}</textarea>
    </div>`;
    Modal.open({
      title: ex ? '시험 수정' : '시험 등록', body, size: 'lg',
      onMount: (b) => {
        enhanceAll(b);
        const rb = $('[data-rbox]', b), gSel = $('[name=grade]', b);
        const draw = () => { rb.innerHTML = this.rangeHtml(items, +gSel.value); };
        draw();
        gSel.addEventListener('change', draw);
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
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body, g = (n) => $(`[name=${n}]`, b).value;
          const fv = ($('[name=fmt]:checked', b) || {}).value || '';
          const rec = Object.assign({}, ex || { id: uid('EX'), createdAt: new Date().toISOString() }, {
            school: g('school').trim(), grade: +g('grade'), year: +g('year'), semester: +g('semester'), kind: g('kind'),
            start: g('start'), end: g('end'), range: stripZws(g('range')), fmt: fv,
            memo: stripZws(g('memo')),
          });
          delete rec.mcCount; delete rec.mcPoints; delete rec.essayCount; delete rec.essayPoints;   // 예전 문항 수·배점 (형식으로 바뀜)
          if (!rec.school) { toast('학교를 입력하세요'); return false; }
          if (!rec.year || rec.year < 2000) { toast('연도를 확인하세요'); return false; }
          if (rec.end && !rec.start) { toast('시작일을 입력하세요'); return false; }
          if (rec.start && rec.end && rec.end < rec.start) { toast('종료일이 시작일보다 빠릅니다'); return false; }
          if (!this.FMT[rec.fmt]) { toast('형식을 고르세요 (객관식만 / 객관식+서술형)'); return false; }
          if (rec.start && !rec.end) rec.end = rec.start;
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
  rangeHtml(items, grade) {
    const middle = isMiddle(grade);
    const used = new Set(items.map(it => it.matId));
    const avail = NP.sortMats(NP.examMats().filter(m => !used.has(m.id) && (!middle || m.type === 'text')));
    let h = items.map((it, i) => {
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
    h += `<div class="row"><select data-addmat><option value="">+ 교재 추가…</option>${['mock', 'text', 'sub'].filter(t => !middle || t === 'text').map(t => {
      const list = avail.filter(m => m.type === t);
      return list.length ? `<optgroup label="${MAT_TYPE[t]}">${list.map(m => `<option value="${m.id}">${esc(NP.matName(m))}</option>`).join('')}</optgroup>` : '';
    }).join('')}</select><button type="button" class="btn sm ghost" data-gomat>교재 관리</button>
      <span class="hint">${middle ? '중학교는 교과서만 고를 수 있습니다.' : '모의고사는 번호(18~45), 교과서는 과, 부교재는 강과 번호를 고릅니다.'}</span></div>`;
    return h;
  },

  /* ---------- 교재 목록 (시험 교재 / 일반 교재) ---------- */
  renderMats(main) {
    const gen = this.tab === 'gen';
    const all = NP.sortMats(gen ? NP.genMats() : NP.examMats());
    const list = gen ? all : all.filter(m => !this.matType || m.type === this.matType);
    const ids = list.map(m => m.id);
    [...this.sel].forEach(id => { if (!ids.includes(id)) this.sel.delete(id); });
    const usedBy = (m) => Store.where('exams', e => (e.items || []).some(it => it.matId === m.id)).length;
    const clsOf = (m) => (m.classIds || []).map(id => Store.get('classes', id)).filter(Boolean);
    let h = this.headHtml() + this.tabsHtml();
    h += gen ? `<div class="toolbar"><span class="muted small">${list.length}개 · 비내신 수업에 쓰는 교재 (시험 범위에는 쓰지 않음)</span></div>`
      : `<div class="toolbar"><select data-mtype><option value="">전체 종류</option>${Object.keys(MAT_TYPE).map(k => `<option value="${k}" ${this.matType === k ? 'selected' : ''}>${MAT_TYPE[k]}</option>`).join('')}</select><span class="muted small">${list.length}개 · 시험 범위·내신 진도에 쓰는 교재</span></div>`;
    h += this.bulkHtml([['delmat', '선택 삭제', 'danger']]);
    if (!list.length) {
      h += `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 교재가 없습니다.' : gen ? '등록된 일반 교재가 없습니다. “교재 등록”에서 일반 교재를 고르고 사용하는 반을 연결하세요.' : '등록된 시험 교재가 없습니다. “교재 등록”으로 모의고사·교과서·부교재를 먼저 등록하면 시험 범위를 고를 수 있습니다.'}</div></div>`;
    } else if (gen) {
      h += `<div class="tbl-wrap"><table class="tbl compact"><thead><tr>${this.chkTh(ids)}<th>이름</th><th>단위</th><th>사용하는 반</th></tr></thead><tbody>${list.map(m => `
      <tr class="click" data-mat="${m.id}">${this.chkTd(m.id)}<td class="nowrap"><b>${esc(m.name)}</b></td>
      <td class="small">${esc((m.units || []).map(u => u.name).join(', ')) || '<span class="muted">-</span>'}</td>
      <td class="small">${clsOf(m).map(c => `<span class="nowrap">${Classes.dot(c)}${esc(c.name)}${c.active === false ? ' (종료)' : ''}</span>`).join(', ') || '<span class="muted">연결된 반 없음</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      h += `<div class="tbl-wrap"><table class="tbl compact"><thead><tr>${this.chkTh(ids)}<th>종류</th><th>이름</th><th>단위</th><th class="num">쓰는 시험</th></tr></thead><tbody>${list.map(m => `
      <tr class="click" data-mat="${m.id}">${this.chkTd(m.id)}<td class="nowrap"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span></td><td class="nowrap"><b>${esc(NP.matName(m))}</b></td>
      <td class="small">${m.type === 'mock' ? `${NP.MOCK_MIN}~${NP.MOCK_MAX}번` : esc((m.units || []).map(u => u.name).join(', ')) || '<span class="muted">-</span>'}</td><td class="num">${usedBy(m) || '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    }
    main.innerHTML = h;
    this.updBulk(main);
    main.onclick = (e) => {
      if (this.commonClick(e, main)) return;
      const tr = e.target.closest('tr[data-mat]'); if (tr) this.openMatModal(tr.dataset.mat);
    };
    main.onchange = (e) => {
      if (this.commonChange(e, main)) return;
      if (e.target.matches('[data-mtype]')) { this.matType = e.target.value; this.sel.clear(); App.render(); }
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
    const clsList = Classes.sorted(Store.all('classes')).filter(c => c.active !== false || cls.has(c.id));
    const body = `<div class="form">
      <label class="req">구분</label><div class="row">${[['exam', '시험 교재'], ['gen', '일반 교재']].map(([k, t]) => `<label class="chk"><input type="radio" name="mcat" value="${k}" ${cat === k ? 'checked' : ''} ${m ? 'disabled' : ''}>${t}</label>`).join('')}
        <span class="hint">${m ? '등록한 뒤에는 바꿀 수 없습니다' : '시험 교재는 시험 범위·내신, 일반 교재는 비내신 수업에 씁니다'}</span></div>
      <label class="req" data-mc="exam">종류</label><div class="row" data-mc="exam">${Object.keys(MAT_TYPE).map(k => `<label class="chk"><input type="radio" name="mtype" value="${k}" ${type === k ? 'checked' : ''} ${m ? 'disabled' : ''}>${MAT_TYPE[k]}</label>`).join('')}</div>
      <label class="req" data-mk="mock">모의고사</label><div class="row" data-mk="mock"><input type="number" name="year" min="2000" max="2100" value="${esc(m && m.type === 'mock' ? m.year : now.getFullYear())}" style="width:90px">년
        <select name="month">${Array.from({ length: 12 }, (_, i) => i + 1).map(i => `<option value="${i}" ${(m && m.type === 'mock' ? +m.month : 3) === i ? 'selected' : ''}>${i}월</option>`).join('')}</select>
        <select name="mgrade">${GRADES.filter(isHigh).map(g => `<option value="${g}" ${(m && m.type === 'mock' ? +m.grade : 10) === g ? 'selected' : ''}>${gradeLabel(g)}</option>`).join('')}</select>
        <span class="hint">${NP.MOCK_MIN}~${NP.MOCK_MAX}번</span></div>
      <label class="req" data-mk="book">이름</label><input type="text" name="mname" data-mk="book" value="${esc(m && m.type !== 'mock' ? m.name : '')}" placeholder="예: 능률(오) 고2, 수능특강 영어독해" maxlength="40">
      <label class="top req" data-mk="book">단위</label><div data-mk="book"><div data-units></div>
        <div class="row" style="margin-top:6px"><button type="button" class="btn sm" data-uadd>+ 단위 추가</button>
        <span class="small soft">한 번에 만들기</span><input type="number" data-qn min="1" max="60" value="8" style="width:70px"><span class="small soft">개</span>
        <input type="text" data-qs value="${cat === 'gen' || type === 'sub' ? '강' : '과'}" style="width:60px"><button type="button" class="btn sm ghost" data-qmake>만들기</button></div>
        <div class="hint" style="margin-top:4px">예: 1과, 2과 … / Special Lesson / 1강 … 단위 이름은 나중에 바꿔도 기록이 유지됩니다.</div></div>
      <label class="top req" data-mc="gen">사용하는 반</label><div data-mc="gen"><div class="np-chips" data-cls>${clsList.map(c => `<button type="button" class="np-c ${cls.has(c.id) ? 'on' : ''}" data-mcls="${c.id}">${esc(c.name)}${c.active === false ? ' (종료)' : ''}</button>`).join('') || '<span class="small muted">반이 없습니다.</span>'}</div>
        <div class="hint" style="margin-top:4px">고른 반의 수업일지에서 “비내신”을 체크하면 이 교재가 나옵니다.</div></div>
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
          $('[name=mname]', b).placeholder = cat === 'gen' ? '예: 리딩튜터 2, 문법 기본편' : '예: 능률(오) 고2, 수능특강 영어독해';
        };
        drawU(); sync();
        b.addEventListener('change', (e) => {
          if (e.target.name === 'mtype' || e.target.name === 'mcat') { sync(); $('[data-qs]', b).value = cat === 'gen' || type === 'sub' ? '강' : '과'; }
        });
        b.addEventListener('input', (e) => { if (e.target.matches('[data-uname]')) units[+e.target.dataset.uname].name = e.target.value; });
        b.addEventListener('click', (e) => {
          const t = e.target;
          const cb = t.closest('[data-mcls]');
          if (cb) { const cid = cb.dataset.mcls; if (cls.has(cid)) cls.delete(cid); else cls.add(cid); cb.classList.toggle('on', cls.has(cid)); return; }
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
          if (!await confirmDlg(`“${NP.matName(m)}” 교재를 삭제할까요?${m.type === 'gen' ? '' : '\n이 교재의 수업 준비 표시도 함께 지워집니다.'}`, '삭제', true)) return false;
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
            delete rec.name; delete rec.units;
          } else {
            rec.name = $('[name=mname]', b).value.trim();
            const us = units.map(u => ({ id: u.id, name: stripZws(u.name || '').trim() })).filter(u => u.name);
            if (!rec.name) { toast('교재 이름을 입력하세요'); return false; }
            if (!us.length) { toast('단위(과·강)를 하나 이상 넣으세요'); return false; }
            if (rec.type === 'gen') {
              if (!cls.size) { toast('사용하는 반을 하나 이상 고르세요'); return false; }
              rec.classIds = [...cls];
            } else {
              // 지운 단위가 시험 범위에 들어 있으면 확인 후 범위에서도 뺀다
              const gone = ((m && m.units) || []).filter(u => !us.some(x => x.id === u.id)).map(u => u.id);
              const hit = gone.length ? Store.where('exams', e => (e.items || []).some(it => it.matId === rec.id && (it.units || []).some(u => gone.includes(u.id)))) : [];
              if (hit.length && !await confirmDlg(`지운 단위가 시험 ${hit.length}개의 범위에 들어 있습니다.\n그 시험 범위에서도 빠집니다. 계속할까요?`, '계속', true)) return false;
              hit.forEach(e => Store.put('exams', Object.assign({}, e, {
                items: e.items.map(it => it.matId === rec.id ? Object.assign({}, it, { units: it.units.filter(u => !gone.includes(u.id)) }) : it)
                  .filter(it => it.matId !== rec.id || it.units.length),
              })));
              delete rec.classIds;
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
.x7-prow > td { background: #F9FCFE; padding: 8px 12px 10px; cursor: default; }
.x7-prow .np-srow:first-child { border-top: 0; padding-top: 0; }
.np-c.x7-next { outline: 2px dashed var(--accent); outline-offset: 1px; }
.x7-blk { border-top: 1px dashed var(--line); padding: 8px 0; user-select: text; }
.x7-blk ul { margin: 4px 0 0; padding-left: 20px; font-size: 13.5px; }
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
