/* =========================================================
   exams.js — 시험정보 + 성적(내신 / 모의고사)
   exam:  { school, grade, year, semester, kind:'mid'|'final', start, end, range(기타 범위·메모),
            items(구조화된 시험 범위 — lessons.js의 NP 설명 참고), mcCount, mcPoints, essayCount, essayPoints, memo }
   교재(모의고사·교과서·부교재)는 meta 테이블에 저장 (NP.mats)
   score: id = S_학생_연도_학기_시험, { studentId, year, semester, kind, score, level:'9-2'|'5-1'|'', school, grade }
   mock:  { year, month, grade, memo }
   mock_score: id = MS_회차_학생, { mockId, studentId, raw, wrong:[번호] }
   ========================================================= */
const Exams = {
  year: '',
  sem: '',
  q: '',
  tab: 'exam',          // 'exam' 시험 / 'mat' 교재
  matType: '',

  formatLabel(ex) {
    const mc = +ex.mcCount || 0, es = +ex.essayCount || 0;
    if (!mc && !es) return '';
    if (!es) return `전 문항 객관식 ${mc}문항` + (ex.mcPoints !== '' && ex.mcPoints != null ? ` (${ex.mcPoints}점)` : '');
    const a = mc ? `객관식 ${mc}문항${ex.mcPoints !== '' && ex.mcPoints != null ? ' ' + ex.mcPoints + '점' : ''}` : '';
    const b = `서술형 ${es}문항${ex.essayPoints !== '' && ex.essayPoints != null ? ' ' + ex.essayPoints + '점' : ''}`;
    return [a, b].filter(Boolean).join(' / ');
  },

  render(main) {
    if (this.tab === 'mat') { this.renderMats(main); return; }
    const all = Store.all('exams');
    const years = [...new Set([new Date().getFullYear(), ...all.map(e => +e.year)])].sort((a, b) => b - a);
    const q = this.q.trim();
    const list = all.filter(e => (!this.year || +e.year === +this.year) && (!this.sem || +e.semester === +this.sem))
      .filter(e => !q || [e.school, examTitle(e), e.range, NP.rangeText(e), e.memo].some(v => String(v || '').includes(q)))
      .sort((a, b) => b.year - a.year || b.semester - a.semester || (a.kind === b.kind ? 0 : a.kind === 'final' ? -1 : 1) || ko(a.school, b.school) || a.grade - b.grade);
    let h = `<div class="page-head"><h1>시험정보</h1><button class="btn primary" data-a="add">+ 시험 등록</button><span class="sub">학교별 시험 기간·범위·형식</span></div>
      ${this.tabsHtml()}
      <div class="toolbar">
        <select data-year><option value="">전체 연도</option>${years.map(y => `<option value="${y}" ${+this.year === y ? 'selected' : ''}>${y}년</option>`).join('')}</select>
        <select data-sem><option value="">전체 학기</option><option value="1" ${this.sem === '1' ? 'selected' : ''}>1학기</option><option value="2" ${this.sem === '2' ? 'selected' : ''}>2학기</option></select>
        <input type="search" data-q placeholder="학교, 범위, 메모 검색" value="${esc(this.q)}" style="width:240px">
        <span class="muted small">${list.length}건</span></div>`;
    h += list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>학교·학년</th><th>시험</th><th>시험 기간</th><th>범위</th><th>형식</th></tr></thead><tbody>${list.map(e => `
      <tr class="click" data-id="${e.id}"><td class="nowrap"><b>${highlight(schoolShort(e.school), q)}</b> ${gradeLabel(e.grade)}</td>
      <td class="nowrap">${e.year}년 ${e.semester}학기 ${EXAM_KIND[e.kind]}</td>
      <td class="nowrap">${e.start ? fmtMD(e.start) + (e.end && e.end !== e.start ? ' ~ ' + fmtMD(e.end) : '') : '<span class="muted">미정</span>'}</td>
      <td class="pre small">${NP.rangeText(e) ? `<div>${highlight(NP.rangeText(e), q)}</div>` : ''}${e.range ? `<div class="${NP.rangeText(e) ? 'soft' : ''}">${highlight(e.range, q)}</div>` : ''}</td><td class="small">${esc(this.formatLabel(e))}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 시험이 없습니다.' : '등록된 시험이 없습니다. “시험 등록”으로 학교별 시험 범위를 기록하세요.'}</div></div>`;
    main.innerHTML = h;
    main.onclick = (e) => {
      if (this.tabClick(e)) return;
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
    // 구조화된 시험 범위 (편집용 사본)
    const items = JSON.parse(JSON.stringify(v.items || [])).filter(it => NP.mat(it.matId));
    const body = `<div class="form">
      <label class="req">학교·학년</label><div class="row"><input type="text" name="school" list="dl-schools" value="${esc(v.school)}" placeholder="예: 금천고" style="flex:1"><select name="grade">${gradeOptions(v.grade)}</select></div>
      <label class="req">시험</label><div class="row"><input type="number" name="year" value="${esc(v.year)}" min="2000" max="2100" style="width:90px">년
        <select name="semester"><option value="1" ${+v.semester === 1 ? 'selected' : ''}>1학기</option><option value="2" ${+v.semester === 2 ? 'selected' : ''}>2학기</option></select>
        <select name="kind"><option value="mid" ${v.kind === 'mid' ? 'selected' : ''}>중간고사</option><option value="final" ${v.kind === 'final' ? 'selected' : ''}>기말고사</option></select></div>
      <label>시험 기간</label><div class="row"><input type="date" name="start" value="${esc(v.start)}"> ~ <input type="date" name="end" value="${esc(v.end)}"><span class="hint">하루면 시작일만</span></div>
      <label class="top">시험 범위</label><div data-rbox></div>
      <label class="top">기타 범위·메모</label><textarea name="range" rows="3" placeholder="교재로 등록하지 않은 범위나 참고 사항 (예: 프린트 1-3)">${esc(v.range)}</textarea>
      <label>객관식</label><div class="row"><input type="number" name="mcCount" min="0" max="100" value="${esc(v.mcCount)}">문항 <input type="number" name="mcPoints" min="0" max="1000" step="0.1" value="${esc(v.mcPoints)}">점</div>
      <label>서술형</label><div class="row"><input type="number" name="essayCount" min="0" max="100" value="${esc(v.essayCount)}">문항 <input type="number" name="essayPoints" min="0" max="1000" step="0.1" value="${esc(v.essayPoints)}">점<span class="hint">없으면 비워 두세요 (전 문항 객관식)</span></div>
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
          if (t.closest('[data-gomat]')) { Modal.top().close(); this.tab = 'mat'; App.go('exams', {}); }
        });
      },
      buttons: [
        ...(ex ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 시험 정보를 삭제할까요?', '삭제', true)) return false;
          Store.del('exams', ex.id);
          Store.delWhere('meta', m => m.kind === 'pman' && m.examId === ex.id);   // 이 시험의 수동 진도 표시
          toast('삭제했습니다'); App.render();
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
          // 시험 범위 정리·확인
          const out = [];
          for (const it of items) {
            const m = NP.mat(it.matId); if (!m) continue;
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
          App.render();
        } },
      ],
    });
  },

  /* ---------- 시험 / 교재 하위 탭 ---------- */
  tabsHtml() {
    return `<div class="tabs"><button data-xtab="exam" class="${this.tab === 'exam' ? 'active' : ''}">시험<span class="cnt">${Store.all('exams').length}</span></button>
      <button data-xtab="mat" class="${this.tab === 'mat' ? 'active' : ''}">교재<span class="cnt">${NP.mats().length}</span></button></div>`;
  },
  tabClick(e) { const t = e.target.closest('[data-xtab]'); if (!t) return false; this.tab = t.dataset.xtab; App.render(); return true; },

  /* ---------- 시험 범위 입력 (시험 모달 안) ---------- */
  rangeHtml(items, grade) {
    const middle = isMiddle(grade);
    const used = new Set(items.map(it => it.matId));
    const avail = NP.sortMats(NP.mats().filter(m => !used.has(m.id) && (!middle || m.type === 'text')));
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
        r += `<div class="np-chips">${(m.units || []).map(u => `<button type="button" class="np-c ${sel.has(u.id) ? 'on' : ''}" data-runit="${i}|${u.id}">${esc(u.name)}</button>`).join('') || '<span class="small muted">이 교재에 단위가 없습니다. 교재 탭에서 추가하세요.</span>'}</div>`;
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

  /* ---------- 교재 목록 ---------- */
  renderMats(main) {
    const all = NP.sortMats(NP.mats());
    const list = all.filter(m => !this.matType || m.type === this.matType);
    const usedBy = (m) => Store.where('exams', e => (e.items || []).some(it => it.matId === m.id)).length;
    let h = `<div class="page-head"><h1>시험정보</h1><button class="btn primary" data-a="addmat">+ 교재 등록</button><span class="sub">시험 범위·진도에 쓰는 모의고사·교과서·부교재</span></div>
      ${this.tabsHtml()}
      <div class="toolbar"><select data-mtype><option value="">전체 종류</option>${Object.keys(MAT_TYPE).map(k => `<option value="${k}" ${this.matType === k ? 'selected' : ''}>${MAT_TYPE[k]}</option>`).join('')}</select><span class="muted small">${list.length}개</span></div>`;
    h += list.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>종류</th><th>이름</th><th>단위</th><th class="num">쓰는 시험</th></tr></thead><tbody>${list.map(m => `
      <tr class="click" data-mat="${m.id}"><td class="nowrap"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span></td><td class="nowrap"><b>${esc(NP.matName(m))}</b></td>
      <td class="small">${m.type === 'mock' ? `${NP.MOCK_MIN}~${NP.MOCK_MAX}번` : esc((m.units || []).map(u => u.name).join(', ')) || '<span class="muted">-</span>'}</td><td class="num">${usedBy(m) || '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 교재가 없습니다.' : '등록된 교재가 없습니다. “교재 등록”으로 모의고사·교과서·부교재를 먼저 등록하면 시험 범위를 고를 수 있습니다.'}</div></div>`;
    main.innerHTML = h;
    main.onclick = (e) => {
      if (this.tabClick(e)) return;
      if (e.target.closest('[data-a=addmat]')) { this.openMatModal(null); return; }
      const tr = e.target.closest('tr[data-mat]'); if (tr) this.openMatModal(tr.dataset.mat);
    };
    main.onchange = (e) => { if (e.target.matches('[data-mtype]')) { this.matType = e.target.value; App.render(); } };
    main.oninput = null;
  },

  /* ---------- 교재 등록 / 수정 ---------- */
  openMatModal(id) {
    const m = id ? NP.mat(id) : null;
    const now = new Date();
    let type = m ? m.type : 'mock';
    const units = JSON.parse(JSON.stringify((m && m.units) || []));
    const body = `<div class="form">
      <label class="req">종류</label><div class="row">${Object.keys(MAT_TYPE).map(k => `<label class="chk"><input type="radio" name="mtype" value="${k}" ${type === k ? 'checked' : ''} ${m ? 'disabled' : ''}>${MAT_TYPE[k]}</label>`).join('')}</div>
      <label class="req" data-mk="mock">모의고사</label><div class="row" data-mk="mock"><input type="number" name="year" min="2000" max="2100" value="${esc(m && m.type === 'mock' ? m.year : now.getFullYear())}" style="width:90px">년
        <select name="month">${Array.from({ length: 12 }, (_, i) => i + 1).map(i => `<option value="${i}" ${(m && m.type === 'mock' ? +m.month : 3) === i ? 'selected' : ''}>${i}월</option>`).join('')}</select>
        <select name="mgrade">${GRADES.filter(isHigh).map(g => `<option value="${g}" ${(m && m.type === 'mock' ? +m.grade : 10) === g ? 'selected' : ''}>${gradeLabel(g)}</option>`).join('')}</select>
        <span class="hint">${NP.MOCK_MIN}~${NP.MOCK_MAX}번</span></div>
      <label class="req" data-mk="book">이름</label><input type="text" name="mname" data-mk="book" value="${esc(m && m.type !== 'mock' ? m.name : '')}" placeholder="예: 능률(오) 고2, 수능특강 영어독해" maxlength="40">
      <label class="top req" data-mk="book">단위</label><div data-mk="book"><div data-units></div>
        <div class="row" style="margin-top:6px"><button type="button" class="btn sm" data-uadd>+ 단위 추가</button>
        <span class="small soft">한 번에 만들기</span><input type="number" data-qn min="1" max="60" value="8" style="width:70px"><span class="small soft">개</span>
        <input type="text" data-qs value="${type === 'sub' ? '강' : '과'}" style="width:60px"><button type="button" class="btn sm ghost" data-qmake>만들기</button></div>
        <div class="hint" style="margin-top:4px">예: 1과, 2과 … / Special Lesson / 1강 … 단위 이름은 나중에 바꿔도 기록이 유지됩니다.</div></div>
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
          type = ($('[name=mtype]:checked', b) || {}).value || type;
          $$('[data-mk=mock]', b).forEach(x => { x.style.display = type === 'mock' ? '' : 'none'; });
          $$('[data-mk=book]', b).forEach(x => { x.style.display = type === 'mock' ? 'none' : ''; });
        };
        drawU(); sync();
        b.addEventListener('change', (e) => {
          if (e.target.name === 'mtype') { sync(); $('[data-qs]', b).value = type === 'sub' ? '강' : '과'; }
        });
        b.addEventListener('input', (e) => { if (e.target.matches('[data-uname]')) units[+e.target.dataset.uname].name = e.target.value; });
        b.addEventListener('click', (e) => {
          const t = e.target;
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
          const n = Store.where('exams', e => (e.items || []).some(it => it.matId === m.id)).length;
          if (n) { toast(`시험 ${n}개의 범위에서 쓰고 있어 삭제할 수 없습니다. 먼저 시험 범위에서 빼세요`); return false; }
          if (!await confirmDlg(`“${NP.matName(m)}” 교재를 삭제할까요?\n이 교재의 수업 준비 표시도 함께 지워집니다.`, '삭제', true)) return false;
          Store.del('meta', m.id); Store.del('meta', NP.ppId(m.id));
          toast('교재를 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: async (md) => {
          const b = md.body;
          const rec = Object.assign({}, m || { id: uid('MT'), kind: 'mat', createdAt: new Date().toISOString() }, { type });
          if (type === 'mock') {
            rec.year = +$('[name=year]', b).value; rec.month = +$('[name=month]', b).value; rec.grade = +$('[name=mgrade]', b).value;
            if (!rec.year || rec.year < 2000) { toast('연도를 확인하세요'); return false; }
            if (NP.mats().some(x => x.id !== rec.id && x.type === 'mock' && +x.year === rec.year && +x.month === rec.month && +x.grade === rec.grade)) { toast('같은 모의고사가 이미 있습니다'); return false; }
            delete rec.name; delete rec.units;
          } else {
            rec.name = $('[name=mname]', b).value.trim();
            const us = units.map(u => ({ id: u.id, name: stripZws(u.name || '').trim() })).filter(u => u.name);
            if (!rec.name) { toast('교재 이름을 입력하세요'); return false; }
            if (!us.length) { toast('단위(과·강)를 하나 이상 넣으세요'); return false; }
            // 지운 단위가 시험 범위에 들어 있으면 확인 후 범위에서도 뺀다
            const gone = ((m && m.units) || []).filter(u => !us.some(x => x.id === u.id)).map(u => u.id);
            const hit = gone.length ? Store.where('exams', e => (e.items || []).some(it => it.matId === rec.id && (it.units || []).some(u => gone.includes(u.id)))) : [];
            if (hit.length && !await confirmDlg(`지운 단위가 시험 ${hit.length}개의 범위에 들어 있습니다.\n그 시험 범위에서도 빠집니다. 계속할까요?`, '계속', true)) return false;
            hit.forEach(e => Store.put('exams', Object.assign({}, e, {
              items: e.items.map(it => it.matId === rec.id ? Object.assign({}, it, { units: it.units.filter(u => !gone.includes(u.id)) }) : it)
                .filter(it => it.matId !== rec.id || it.units.length),
            })));
            rec.units = us;
            delete rec.year; delete rec.month; delete rec.grade;
          }
          Store.put('meta', rec);
          toast('교재를 저장했습니다');
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
