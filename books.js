/* =========================================================
   books.js — 학생 교재 관리 (학생이 지금 쓰는 교재 / 끝낸 교재)
   교재는 시험+교재 > 일반 교재(NP.genMats)에 등록된 것을 연결한다.
   기록은 meta 테이블에 저장 (서버 SQL 변경 없음):
   sbook: { kind:'sbook', studentId, matId, matName(교재 이름 사본 — 교재를 지워도 이력에 이름이 남게),
            cat:'read'|'gram'|'listen'|'word', status:'ing'|'done'|'stop',
            start(시작일), plan(예정 종료일, 선택), end(끝난 날 — 완료·중단일 때), memo, createdAt }
   분류는 교재에 분류(m.cat)가 있으면 그것을 따르고, 없으면 기록의 cat을 쓴다.
   ========================================================= */
const BOOK_CAT = { read: '독해', gram: '문법', listen: '듣기', word: '단어' };
const BOOK_CATS = ['read', 'gram', 'listen', 'word'];
const BOOK_ST = { ing: '진행 중', done: '완료', stop: '중단' };

const Books = {
  view: 'student',   // 'student' 학생별 / 'book' 교재별
  q: '',             // 학생 이름·학교 검색
  bq: '',            // 교재 이름 검색
  cls: '',           // 반 필터
  grade: '',         // 학년 필터
  st: 'active',      // 학생 상태 필터: active / pause / left / all
  flt: '',           // '' 전체 / 'none' 진행 교재 없음 / 'over' 예정일 지남
  cat: '',           // 교재별 보기의 분류 필터 ('' 전체 / 분류 키 / 'none' 미분류)

  /* ---------- 데이터 ---------- */
  recs() { return Store.where('meta', r => r.kind === 'sbook'); },
  recsOf(sid) { return this.recs().filter(r => r.studentId === sid); },
  recsOfMat(mid) { return this.recs().filter(r => r.matId === mid); },
  catOf(r) { const m = NP.mat(r.matId); return m && BOOK_CAT[m.cat] ? m.cat : r.cat; },
  nameOf(r) { const m = NP.mat(r.matId); return m ? m.name : (r.matName || '(삭제된 교재)'); },
  over(r) { return r.status === 'ing' && isYmd(r.plan) && r.plan < todayStr(); },
  // 진행 중은 시작일 늦은 순, 끝낸 것은 끝난 날 늦은 순
  sortIng(list) { return list.sort((a, b) => ko(b.start, a.start) || ko(this.nameOf(a), this.nameOf(b))); },
  sortDone(list) { return list.sort((a, b) => ko(b.end || b.start, a.end || a.start) || ko(this.nameOf(a), this.nameOf(b))); },
  ingOf(sid, cat) { return this.sortIng(this.recsOf(sid).filter(r => r.status === 'ing' && (!cat || this.catOf(r) === cat))); },
  doneOf(sid, cat) { return this.sortDone(this.recsOf(sid).filter(r => r.status !== 'ing' && (!cat || this.catOf(r) === cat))); },
  // 이 교재를 진행 중인 학생 수 (교재 삭제 막기에 사용)
  ingCountOfMat(mid) { return this.recsOfMat(mid).filter(r => r.status === 'ing').length; },
  // 교재를 지우기 전: 기록에 남긴 교재 이름을 지금 이름으로 맞춘다 (삭제 뒤에도 이력에 이름이 보이게)
  keepName(m) {
    this.recsOfMat(m.id).filter(r => r.matName !== m.name).forEach(r => Store.put('meta', Object.assign({}, r, { matName: m.name })));
  },
  studentsOfMat(mid) {
    return this.recsOfMat(mid).filter(r => r.status === 'ing').map(r => Store.get('students', r.studentId)).filter(Boolean);
  },

  /* ---------- 반별 정렬 (반 메뉴와 같은 원칙) ----------
     반 순서: 반 메뉴 순서(요일 → 시간) / 여러 반이면 가장 앞선 반 / 반 안에서는 학년 → 학교 → 이름 / 반 없는 학생은 맨 아래 */
  // [{ c: 반 또는 null, list: [학생] }]  — fixedCls가 있으면 그 반으로 묶음 (반 필터)
  groupByClass(students, fixedCls) {
    const order = {};
    Classes.sorted(Store.all('classes')).forEach((c, i) => { order[c.id] = i; });
    const fixed = fixedCls ? Store.get('classes', fixedCls) : null;
    const mainOf = (sid) => {
      if (fixed) return fixed;
      let cs = Students.activeClassesOf(sid);
      if (!cs.length) cs = Students.upcomingClassesOf(sid).map(o => o.c);
      return cs.length ? cs.reduce((a, b) => (order[b.id] < order[a.id] ? b : a)) : null;
    };
    const groups = new Map();
    students.forEach(st => {
      const c = mainOf(st.id), k = c ? c.id : '';
      if (!groups.has(k)) groups.set(k, { c, list: [] });
      groups.get(k).list.push(st);
    });
    const out = [...groups.values()].sort((a, b) => (a.c ? order[a.c.id] : 1e9) - (b.c ? order[b.c.id] : 1e9));
    out.forEach(g => g.list.sort((a, b) => Students.sortFn(a, b)));
    return out;
  },
  // 학생 입력칸 목록 (label → id) 을 반별 순서로
  stuChoicesByClass(filter) {
    const map = studentChoices(filter), inv = {};
    Object.keys(map).forEach(k => { inv[map[k]] = k; });
    const list = Object.values(map).map(id => Store.get('students', id)).filter(Boolean);
    const out = {};
    this.groupByClass(list).forEach(g => g.list.forEach(st => { out[inv[st.id]] = st.id; }));
    return out;
  },
  clsLabel(m) {
    const cls = ((m && m.classIds) || []).map(id => Store.get('classes', id)).filter(Boolean);
    return cls.length ? cls.map(c => esc(c.name)).join(', ') : (m && m.noCls ? '반 미지정' : '없음');
  },

  /* ---------- 표시 ---------- */
  catTag(cat) { return `<span class="bk-cat ${BOOK_CAT[cat] ? cat : 'none'}">${BOOK_CAT[cat] || '미분류'}</span>`; },
  // 올해면 11/3, 다른 해면 25.11.3
  sd(s) {
    if (!isYmd(s)) return '';
    const [y, m, d] = s.split('-').map(Number);
    return (y === new Date().getFullYear() ? '' : String(y).slice(-2) + '.') + m + '/' + d;
  },
  daysBetween(a, b) { return isYmd(a) && isYmd(b) ? Math.round((parseYmd(b) - parseYmd(a)) / 86400000) + 1 : 0; },
  stBadge(r) {
    if (r.status === 'done') return '<span class="badge green">완료</span>';
    if (r.status === 'stop') return '<span class="badge gray">중단</span>';
    return this.over(r) ? '<span class="badge orange">예정일 지남</span>' : '<span class="badge">진행 중</span>';
  },
  stuLabel(s) { return s ? esc(s.name) + (stTag(s) ? ` <span class="tag">${esc(stTag(s))}</span>` : '') + (s.status === 'pause' ? ' <span class="badge orange">휴원</span>' : s.status === 'left' ? ' <span class="badge gray">퇴원</span>' : '') : '<span class="muted">(삭제된 학생)</span>'; },

  /* =========================================================
     화면
     ========================================================= */
  render(main) {
    if (this.view === 'book') this.renderBooks(main); else this.renderStudents(main);
  },

  headHtml() {
    return `<div class="page-head"><h1>교재</h1><button class="btn primary" data-a="add">+ 교재 등록</button>
      <span class="sub">학생별 독해·문법·듣기·단어 교재 · 시작일과 끝난 날 기록</span></div>
      <div class="tabs"><button data-view="student" class="${this.view === 'student' ? 'active' : ''}">학생별</button><button data-view="book" class="${this.view === 'book' ? 'active' : ''}">교재별<span class="cnt">${NP.genMats().length}</span></button></div>`;
  },

  // 검색칸 입력 → 다시 그리고 커서 유지
  bindSearch(main) {
    main.oninput = debounce((e) => {
      const k = e.target.dataset.bks;
      if (!k) return;
      this[k] = e.target.value;
      const pos = e.target.selectionStart;
      App.render();
      const inp = $(`[data-bks="${k}"]`, main); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
    }, 250);
  },

  /* ---------- 학생별 ---------- */
  renderStudents(main) {
    const q = this.q.trim().toLowerCase(), bq = this.bq.trim().toLowerCase();
    const all = Store.all('students');
    const list = all.filter(s => this.st === 'all' || (s.status || 'active') === this.st)
      .filter(s => !this.grade || +s.grade === +this.grade)
      .filter(s => !this.cls || Students.activeClassesOf(s.id).some(c => c.id === this.cls))
      .filter(s => !q || [s.name, s.school, stTag(s)].some(v => String(v || '').toLowerCase().includes(q)))
      .filter(s => !bq || this.recsOf(s.id).some(r => this.nameOf(r).toLowerCase().includes(bq)))
      .filter(s => {
        if (!this.flt) return true;
        const ing = this.ingOf(s.id);
        return this.flt === 'none' ? !ing.length : ing.some(r => this.over(r));
      });
    const clsList = Classes.sorted(Store.all('classes').filter(c => c.active !== false));
    let h = `<div class="page-narrow">${this.headHtml()}
      <div class="toolbar">
        <input type="search" data-bks="q" placeholder="학생 이름, 학교 검색" value="${esc(this.q)}" style="width:190px">
        <input type="search" data-bks="bq" placeholder="교재 이름 검색" value="${esc(this.bq)}" style="width:170px">
        <select data-f="st">${[['active', '재원'], ['pause', '휴원'], ['left', '퇴원·졸업'], ['all', '전체 학생']].map(([k, t]) => `<option value="${k}" ${this.st === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select data-f="cls"><option value="">전체 반</option>${clsList.map(c => `<option value="${c.id}" ${this.cls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select data-f="grade">${gradeOptions(this.grade, '전체 학년')}</select>
        <select data-f="flt">${[['', '모든 학생'], ['none', '진행 교재 없음'], ['over', '예정일 지난 교재']].map(([k, t]) => `<option value="${k}" ${this.flt === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <span class="muted small">${list.length}명</span>
      </div>`;
    if (!list.length) {
      h += `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 학생이 없습니다.' : '등록된 학생이 없습니다.'}</div></div>`;
    } else {
      h += `<div class="tbl-wrap"><table class="tbl compact bk-tbl"><thead><tr><th>이름</th><th>수강반</th>${BOOK_CATS.map(c => `<th>${this.catTag(c)}</th>`).join('')}<th class="num">끝낸 교재</th></tr></thead><tbody>`;
      this.groupByClass(list, this.cls).forEach(g => {
      h += `<tr class="bk-grp"><td colspan="7">${g.c ? `${Classes.dot(g.c)}<b>${esc(g.c.name)}</b>${g.c.active === false ? ' <span class="badge gray">종료</span>' : ''}` : '<b>수강 중인 반 없음</b>'} <span class="small muted">${g.list.length}명</span></td></tr>`;
      g.list.forEach(s => {
        const cls = Students.activeClassesOf(s.id).map(c => c.name).join(', ');
        const doneN = this.doneOf(s.id).length;
        h += `<tr data-sid="${s.id}"><td class="nowrap bk-name" data-open="${s.id}"><b>${highlight(s.name, this.q)}</b>${stTag(s) ? `<div class="small soft">${highlight(stTag(s), this.q)}</div>` : ''}${s.status === 'pause' ? '<span class="badge orange">휴원</span>' : s.status === 'left' ? '<span class="badge gray">퇴원</span>' : ''}</td>
          <td class="small">${esc(cls) || '<span class="muted">-</span>'}</td>`;
        BOOK_CATS.forEach(cat => {
          const ing = this.ingOf(s.id, cat);
          h += `<td class="bk-cell${ing.length ? ' has' : ''}">${ing.map(r => `<div class="bk-item${this.over(r) ? ' over' : ''}" data-r="${r.id}" title="${esc(this.nameOf(r))}${r.memo ? '\n' + esc(firstLine(r.memo)) : ''}">
              <b>${highlight(this.nameOf(r), this.bq)}</b><span class="d">${this.sd(r.start)}~${r.plan ? (this.over(r) ? ' <em>' + this.sd(r.plan) + ' 예정</em>' : ' ' + this.sd(r.plan) + ' 예정') : ''}${r.memo ? ' · 메모' : ''}</span></div>`).join('')}
            <button type="button" class="bk-add" data-add="${s.id}|${cat}" title="${BOOK_CAT[cat]} 교재 등록">+</button></td>`;
        });
        h += `<td class="num"><button type="button" class="bk-cnt" data-open="${s.id}">${doneN || '-'}</button></td></tr>`;
      });
      });
      h += '</tbody></table></div>';
      h += '<p class="small muted" style="margin-top:8px">칸의 교재를 누르면 수정·완료 처리, 학생 이름을 누르면 그 학생의 교재 이력을 봅니다.</p>';
    }
    h += '</div>';
    main.innerHTML = h;
    main.onclick = (e) => {
      if (this.commonClick(e)) return;
      const ad = e.target.closest('[data-add]');
      if (ad) { const [sid, cat] = ad.dataset.add.split('|'); this.openRec(null, { sid, cat }); return; }
      const it = e.target.closest('[data-r]');
      if (it) { this.openRec(it.dataset.r); return; }
      const op = e.target.closest('[data-open]');
      if (op) this.openStudent(op.dataset.open);
    };
    main.onchange = (e) => {
      const f = e.target.dataset.f;
      if (f) { this[f] = e.target.value; App.render(); }
    };
    this.bindSearch(main);
  },

  commonClick(e) {
    if (e.target.closest('[data-a=add]')) { this.openRec(null, {}); return true; }
    const v = e.target.closest('[data-view]');
    if (v) { if (this.view !== v.dataset.view) { this.view = v.dataset.view; App.render(true); } return true; }
    return false;
  },

  /* ---------- 교재별 ---------- */
  renderBooks(main) {
    const bq = this.bq.trim().toLowerCase();
    const all = NP.genMats().sort((a, b) => (BOOK_CATS.indexOf(a.cat) + 1 || 9) - (BOOK_CATS.indexOf(b.cat) + 1 || 9) || ko(a.name, b.name));
    const list = all.filter(m => !this.cat || (this.cat === 'none' ? !BOOK_CAT[m.cat] : m.cat === this.cat))
      .filter(m => !bq || String(m.name || '').toLowerCase().includes(bq));
    let h = `<div class="page-narrow">${this.headHtml()}
      <div class="toolbar">
        <input type="search" data-bks="bq" placeholder="교재 이름 검색" value="${esc(this.bq)}" style="width:200px">
        <select data-f="cat"><option value="">전체 분류</option>${BOOK_CATS.map(c => `<option value="${c}" ${this.cat === c ? 'selected' : ''}>${BOOK_CAT[c]}</option>`).join('')}<option value="none" ${this.cat === 'none' ? 'selected' : ''}>미분류</option></select>
        <span class="muted small">${list.length}개 · 교재는 시험+교재 › 일반 교재에서 등록·수정합니다</span>
        <span style="flex:1"></span><button class="btn sm" data-a="gomat">일반 교재 관리</button>
      </div>`;
    if (!list.length) {
      h += `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 교재가 없습니다.' : '등록된 일반 교재가 없습니다. 시험+교재 › 일반 교재에서 먼저 등록하세요.'}</div></div>`;
    } else {
      h += `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>분류</th><th>교재</th><th>사용하는 반</th><th>진행 중 학생</th><th class="num">끝낸 학생</th></tr></thead><tbody>${list.map(m => {
        const ing = this.studentsOfMat(m.id).sort((a, b) => ko(a.name, b.name));
        const done = this.recsOfMat(m.id).filter(r => r.status !== 'ing').length;
        const cls = (m.classIds || []).map(id => Store.get('classes', id)).filter(Boolean);
        return `<tr class="click" data-mat="${m.id}"><td class="nowrap">${this.catTag(m.cat)}</td><td class="nowrap"><b>${highlight(m.name, this.bq)}</b></td>
          <td class="small">${cls.map(c => `<span class="nowrap">${Classes.dot(c)}${esc(c.name)}</span>`).join(', ') || (m.noCls ? '<span class="badge gray">반 미지정</span>' : '<span class="muted">-</span>')}</td>
          <td class="small">${ing.map(s => esc(s.name)).join(', ') || '<span class="muted">없음</span>'}${ing.length ? ` <span class="muted">(${ing.length}명)</span>` : ''}</td>
          <td class="num">${done || '<span class="muted">-</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    }
    h += '</div>';
    main.innerHTML = h;
    main.onclick = (e) => {
      if (this.commonClick(e)) return;
      if (e.target.closest('[data-a=gomat]')) { Exams.tab = 'gen'; Exams.sel.clear(); App.go('exams', {}); return; }
      const tr = e.target.closest('tr[data-mat]');
      if (tr) this.openMat(tr.dataset.mat);
    };
    main.onchange = (e) => {
      const f = e.target.dataset.f;
      if (f) { this[f] = e.target.value; App.render(); }
    };
    this.bindSearch(main);
  },

  /* =========================================================
     학생 한 명의 교재 (교재 화면의 학생 창 + 학생 상세 창의 '교재' 탭 공용)
     ========================================================= */
  studentHtml(sid) {
    let h = '';
    BOOK_CATS.forEach(cat => {
      const ing = this.ingOf(sid, cat), done = this.doneOf(sid, cat);
      h += `<div class="bk-sec"><div class="bk-sec-h">${this.catTag(cat)}<span class="small muted">${ing.length ? '진행 ' + ing.length : ''}${ing.length && done.length ? ' · ' : ''}${done.length ? '끝냄 ' + done.length : ''}</span>
        <span style="flex:1"></span><button type="button" class="btn sm" data-add="${sid}|${cat}">+ 등록</button></div>`;
      if (!ing.length && !done.length) h += '<div class="small muted bk-none">등록된 교재가 없습니다.</div>';
      ing.forEach(r => {
        h += `<div class="bk-card${this.over(r) ? ' over' : ''}" data-r="${r.id}"><div class="bk-card-m"><b>${esc(this.nameOf(r))}</b> ${this.stBadge(r)}
            <div class="small soft">${fmtDate(r.start, false)} 시작${r.plan ? ' · ' + fmtDate(r.plan, false) + ' 끝낼 예정' : ''} · ${this.daysBetween(r.start, todayStr()) || 0}일째</div>
            ${r.memo ? `<div class="small pre bk-memo">${esc(r.memo)}</div>` : ''}</div>
          <div class="bk-card-b"><button type="button" class="btn sm primary" data-fin="${r.id}|done">완료</button><button type="button" class="btn sm" data-fin="${r.id}|stop">중단</button></div></div>`;
      });
      if (done.length) {
        h += `<div class="bk-hist">${done.map(r => `<div class="bk-hrow" data-r="${r.id}">${this.stBadge(r)}<b>${esc(this.nameOf(r))}</b>
          <span class="small soft nowrap">${fmtDate(r.start, false)} ~ ${fmtDate(r.end, false)}${this.daysBetween(r.start, r.end) ? ` (${this.daysBetween(r.start, r.end)}일)` : ''}</span>
          ${r.memo ? `<span class="small muted bk-hmemo">${esc(firstLine(r.memo))}</span>` : ''}</div>`).join('')}</div>`;
      }
      h += '</div>';
    });
    return h;
  },
  // studentHtml 안의 클릭 처리. 처리했으면 true
  studentClick(e, refresh) {
    const ad = e.target.closest('[data-add]');
    if (ad) { const [sid, cat] = ad.dataset.add.split('|'); this.openRec(null, { sid, cat }, refresh); return true; }
    const fn = e.target.closest('[data-fin]');
    if (fn) { const [id, st] = fn.dataset.fin.split('|'); this.finish(id, st, refresh); return true; }
    const it = e.target.closest('[data-r]');
    if (it) { this.openRec(it.dataset.r, {}, refresh); return true; }
    return false;
  },

  // 자동 갱신(다른 기기에서 바뀜)용: 입력 중이거나 맨 위 창이 아니면 미룸
  bindRefresh(m, draw) {
    m.refresh = () => {
      if (m.closed) return;
      const a = document.activeElement;
      if ((a && m.el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || Modal.top() !== m) { m.stale = true; return; }
      m.stale = false; draw();
    };
    m.el.addEventListener('focusout', () => setTimeout(() => { if (m.stale) m.refresh(); }, 0));
  },

  openStudent(sid) {
    const s = Store.get('students', sid);
    if (!s) return;
    const m = Modal.open({
      title: s.name + (stTag(s) ? '  ' + stTag(s) : '') + ' · 교재', size: 'lg', autofocus: false, body: '',
      buttons: [
        { text: '학생 정보', left: true, onClick: () => { Students.openDetail(sid, 'book'); return false; } },
        { text: '닫기' },
      ],
    });
    const draw = () => {
      if (!Store.get('students', sid)) { m.close(); return; }
      m.body.innerHTML = this.studentHtml(sid);
    };
    const refresh = () => { draw(); App.render(); };
    m.body.addEventListener('click', (e) => this.studentClick(e, refresh));
    this.bindRefresh(m, draw);
    draw();
  },

  /* =========================================================
     교재 한 권 — 쓰는 학생 / 끝낸 학생 + 학생 여러 명 한꺼번에 등록
     ========================================================= */
  openMat(mid) {
    const m0 = NP.mat(mid);
    if (!m0) return;
    const m = Modal.open({
      title: m0.name, size: 'lg', autofocus: false, body: '',
      buttons: [{ text: '닫기' }],
    });
    const draw = () => {
      const mt = NP.mat(mid);
      if (!mt) { m.close(); return; }
      $('.mg-modal-head h3', m.el).textContent = mt.name;
      const recs = this.recsOfMat(mid);
      const ing = this.sortIng(recs.filter(r => r.status === 'ing')), done = this.sortDone(recs.filter(r => r.status !== 'ing'));
      let h = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">${this.catTag(mt.cat)}<span class="small soft">사용하는 반: ${this.clsLabel(mt)}</span>
        <span style="flex:1"></span><button type="button" class="btn sm primary" data-assign>+ 학생 추가</button></div>`;
      h += `<h2 class="bk-h2">진행 중 <span class="muted">${ing.length}명</span></h2>`;
      h += ing.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>학생</th><th>시작일</th><th>끝낼 예정</th><th>메모</th><th></th></tr></thead><tbody>${ing.map(r => `
        <tr class="click" data-r="${r.id}"><td class="nowrap">${this.stuLabel(Store.get('students', r.studentId))}</td><td class="nowrap">${fmtDate(r.start, false)}</td>
        <td class="nowrap">${r.plan ? (this.over(r) ? `<span class="bk-over">${fmtDate(r.plan, false)}</span>` : fmtDate(r.plan, false)) : '<span class="muted">-</span>'}</td>
        <td class="small">${esc(firstLine(r.memo)) || '<span class="muted">-</span>'}</td>
        <td class="nowrap"><button type="button" class="btn sm" data-fin="${r.id}|done">완료</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">이 교재를 쓰는 학생이 없습니다.</div>';
      h += `<h2 class="bk-h2" style="margin-top:16px">끝낸 학생 <span class="muted">${done.length}명</span></h2>`;
      h += done.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>학생</th><th>상태</th><th>기간</th><th>메모</th></tr></thead><tbody>${done.map(r => `
        <tr class="click" data-r="${r.id}"><td class="nowrap">${this.stuLabel(Store.get('students', r.studentId))}</td><td>${this.stBadge(r)}</td>
        <td class="nowrap small">${fmtDate(r.start, false)} ~ ${fmtDate(r.end, false)}${this.daysBetween(r.start, r.end) ? ` (${this.daysBetween(r.start, r.end)}일)` : ''}</td>
        <td class="small">${esc(firstLine(r.memo)) || '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">아직 끝낸 학생이 없습니다.</div>';
      m.body.innerHTML = h;
    };
    const refresh = () => { draw(); App.render(); };
    m.body.addEventListener('click', (e) => {
      if (e.target.closest('[data-assign]')) { this.openAssign(mid, refresh); return; }
      const fn = e.target.closest('[data-fin]');
      if (fn) { const [id, st] = fn.dataset.fin.split('|'); this.finish(id, st, refresh); return; }
      const tr = e.target.closest('[data-r]');
      if (tr) this.openRec(tr.dataset.r, {}, refresh);
    });
    this.bindRefresh(m, draw);
    draw();
  },

  // 한 교재를 여러 학생에게 한꺼번에 등록 (재원생만, 이 교재를 쓰는 반 학생이 위)
  openAssign(mid, onSaved) {
    const mt = NP.mat(mid);
    if (!mt) return;
    const sel = new Set();
    let q = '';
    const ingSet = new Set(this.recsOfMat(mid).filter(r => r.status === 'ing').map(r => r.studentId));
    const doneSet = new Set(this.recsOfMat(mid).filter(r => r.status === 'done').map(r => r.studentId));
    const matCls = new Set(mt.classIds || []);
    const stu = [];
    this.groupByClass(Store.where('students', s => (s.status || 'active') === 'active')).forEach(g => g.list.forEach(s => {
      const cls = Students.activeClassesOf(s.id);
      stu.push({ s, cls, g: g.c ? g.c.name : '수강 중인 반 없음', mine: cls.some(c => matCls.has(c.id)) });
    }));
    const hasCat = !!BOOK_CAT[mt.cat];
    const body = `<div class="form">
      <label>교재</label><div>${this.catTag(mt.cat)} <b>${esc(mt.name)}</b></div>
      ${hasCat ? '' : `<label class="req">분류</label><div class="row">${BOOK_CATS.map(c => `<label class="chk"><input type="radio" name="bcat" value="${c}">${BOOK_CAT[c]}</label>`).join('')}<span class="hint">교재에 분류가 없어 여기서 고릅니다</span></div>`}
      <label class="req">시작일</label><input type="date" name="start" value="${todayStr()}" style="width:170px">
      <label>끝낼 예정</label><input type="date" name="plan" style="width:170px">
      <label class="top req">학생</label><div>
        <div class="row" style="margin-bottom:6px"><input type="search" data-sq placeholder="이름·학교 검색" style="flex:1">${matCls.size ? '<button type="button" class="btn sm ghost" data-mineall>이 교재 반 학생 모두</button>' : ''}<button type="button" class="btn sm ghost" data-clr>선택 해제</button></div>
        <div class="pick-list bk-pick" data-list></div><div class="small soft" style="margin-top:4px" data-cnt>0명 선택</div></div>
    </div>`;
    Modal.open({
      title: '학생 추가', size: 'md', body, autofocus: false,
      onMount: (b) => {
        const box = $('[data-list]', b);
        const draw = () => {
          const qq = q.trim().toLowerCase();
          const rows = stu.filter(o => !qq || [o.s.name, o.s.school, stTag(o.s)].some(v => String(v || '').toLowerCase().includes(qq)));
          let h = '', grp = null;
          rows.forEach(o => {
            const g = o.g;
            if (g !== grp) { h += `<div class="grp">${g}</div>`; grp = g; }
            const busy = ingSet.has(o.s.id);
            h += `<label class="${busy ? 'bk-dis' : ''}"><input type="checkbox" data-pk="${o.s.id}" ${sel.has(o.s.id) ? 'checked' : ''} ${busy ? 'disabled' : ''}>
              <span>${esc(o.s.name)} <span class="tag">${esc(stTag(o.s))}</span>${o.mine ? ' <span class="badge">이 교재 반</span>' : ''}</span><span class="small muted" style="margin-left:auto">${busy ? '이미 진행 중' : doneSet.has(o.s.id) ? '완료한 적 있음 · ' : ''}${busy ? '' : esc(o.cls.map(c => c.name).join(', '))}</span></label>`;
          });
          box.innerHTML = h || '<div class="small muted" style="padding:8px">학생이 없습니다.</div>';
          $('[data-cnt]', b).textContent = sel.size + '명 선택';
        };
        draw();
        b.addEventListener('input', (e) => { if (e.target.matches('[data-sq]')) { q = e.target.value; draw(); } });
        b.addEventListener('change', (e) => {
          if (e.target.matches('[data-pk]')) { if (e.target.checked) sel.add(e.target.dataset.pk); else sel.delete(e.target.dataset.pk); $('[data-cnt]', b).textContent = sel.size + '명 선택'; }
        });
        b.addEventListener('click', (e) => {
          if (e.target.closest('[data-mineall]')) { stu.filter(o => o.mine && !ingSet.has(o.s.id)).forEach(o => sel.add(o.s.id)); draw(); return; }
          if (e.target.closest('[data-clr]')) { sel.clear(); draw(); }
        });
      },
      buttons: [
        { text: '취소' },
        { text: '등록', cls: 'primary', primary: true, onClick: (md) => {
          const b = md.body;
          const cur = NP.mat(mid);
          if (!cur) { toast('교재가 삭제되었습니다'); return; }
          const cat = BOOK_CAT[cur.cat] ? cur.cat : ($('[name=bcat]:checked', b) || {}).value;
          const start = $('[name=start]', b).value, plan = $('[name=plan]', b).value;
          if (!cat) { toast('분류를 고르세요'); return false; }
          if (!isYmd(start)) { toast('시작일을 선택하세요'); return false; }
          if (plan && plan < start) { toast('끝낼 예정일이 시작일보다 빠릅니다'); return false; }
          if (!sel.size) { toast('학생을 한 명 이상 고르세요'); return false; }
          const now = new Date().toISOString();
          let n = 0;
          sel.forEach(sid => {
            if (this.recsOfMat(mid).some(r => r.studentId === sid && r.status === 'ing')) return;   // 그 사이 다른 곳에서 등록됨
            Store.put('meta', { id: uid('SB'), kind: 'sbook', studentId: sid, matId: mid, matName: cur.name, cat, status: 'ing', start, plan: plan || '', end: '', memo: '', createdAt: now });
            n++;
          });
          toast(`${n}명에게 교재를 등록했습니다`);
          App.render();
          if (onSaved) onSaved();
        } },
      ],
    });
  },

  /* =========================================================
     교재 기록 등록 / 수정
     preset = { sid, cat, start }  (새로 등록할 때 정해 둘 값)
     ========================================================= */
  openRec(id, preset = {}, onSaved) {
    const r = id ? Store.get('meta', id) : null;
    if (id && !r) return;
    let sid = r ? r.studentId : (preset.sid || '');
    let cat = r ? this.catOf(r) : (preset.cat || '');
    let matId = r ? r.matId : '';
    let status = r ? r.status : 'ing';
    let mq = '';
    const fixedStu = !!sid;
    const stMap = fixedStu ? null : this.stuChoicesByClass(s => (s.status || 'active') === 'active');
    const s0 = sid ? Store.get('students', sid) : null;
    const body = `<div class="form">
      <label class="req">학생</label>${fixedStu ? `<div>${this.stuLabel(s0)}</div>` : `<div>${studentInputHtml('dl-bk-stu', '')}</div>`}
      <label class="req">분류</label><div class="row" data-cats>${BOOK_CATS.map(c => `<label class="chk"><input type="radio" name="bcat" value="${c}" ${cat === c ? 'checked' : ''}>${BOOK_CAT[c]}</label>`).join('')}<span class="hint" data-cathint></span></div>
      <label class="top req">교재</label><div>
        <input type="search" data-mq placeholder="교재 이름 검색" style="width:100%;margin-bottom:6px">
        <div class="bk-mats" data-mats></div></div>
      <label class="req">시작일</label><input type="date" name="start" value="${esc(r ? r.start : (preset.start || todayStr()))}" style="width:170px">
      <label>끝낼 예정</label><div class="row"><input type="date" name="plan" value="${esc(r ? r.plan || '' : '')}" style="width:170px"><span class="hint">선택 · 지나면 주황색으로 표시</span></div>
      <label>상태</label><div class="row">${Object.keys(BOOK_ST).map(k => `<label class="chk"><input type="radio" name="bst" value="${k}" ${status === k ? 'checked' : ''}>${BOOK_ST[k]}</label>`).join('')}</div>
      <label class="req" data-endrow>끝난 날</label><input type="date" name="end" data-endrow value="${esc(r && r.end ? r.end : todayStr())}" style="width:170px">
      <label class="top">메모</label><textarea name="memo" rows="3" placeholder="예: 3강까지 빠르게, 단어 시험 병행">${esc(r ? r.memo || '' : '')}</textarea>
    </div>`;
    const md = Modal.open({
      title: r ? '교재 기록 수정' : '교재 등록', size: 'md', body, autofocus: false,
      onMount: (b) => {
        enhanceAll(b);
        if (!fixedStu) {
          bindStudentInput(b, 'dl-bk-stu', stMap);
          const inp = $('.st-input', b);
          inp.addEventListener('input', () => { sid = stMap[inp.value.trim()] || ''; drawMats(); });
          setTimeout(() => inp.focus(), 30);
        }
        const box = $('[data-mats]', b);
        const drawMats = () => {
          const qq = mq.trim().toLowerCase();
          const myCls = new Set(sid ? Students.activeClassesOf(sid).map(c => c.id) : []);
          const ingIds = new Set(sid ? this.recsOf(sid).filter(x => x.status === 'ing' && x.id !== id).map(x => x.matId) : []);
          const mats = NP.genMats().filter(m => !cat || !BOOK_CAT[m.cat] || m.cat === cat)
            .filter(m => !qq || String(m.name || '').toLowerCase().includes(qq) || m.id === matId)
            .map(m => ({ m, mine: (m.classIds || []).some(c => myCls.has(c)) }))
            .sort((a, b2) => (b2.mine - a.mine) || ko(a.m.name, b2.m.name));
          let h = '';
          const mineL = mats.filter(o => o.mine), other = mats.filter(o => !o.mine);
          const chip = (o) => `<button type="button" class="np-c ${o.m.id === matId ? 'on' : ''}" data-pm="${o.m.id}" ${ingIds.has(o.m.id) ? 'title="이 학생이 이미 진행 중인 교재"' : ''}>${esc(o.m.name)}${!BOOK_CAT[o.m.cat] ? '<i>미분류</i>' : ''}${ingIds.has(o.m.id) ? '<i>진행 중</i>' : ''}</button>`;
          if (mineL.length) h += `<div class="small soft">수강반 교재</div><div class="np-chips">${mineL.map(chip).join('')}</div>`;
          if (other.length) h += `${mineL.length ? '<div class="small soft" style="margin-top:6px">다른 교재</div>' : ''}<div class="np-chips">${other.map(chip).join('')}</div>`;
          if (r && matId && !NP.mat(matId)) h = `<div class="small" style="margin-bottom:4px">현재: <b>${esc(r.matName || '')}</b> <span class="muted">(삭제된 교재 — 바꾸려면 아래에서 고르세요)</span></div>` + h;
          if (!mats.length) h += `<div class="small muted">${NP.genMats().length ? '조건에 맞는 교재가 없습니다.' : '등록된 일반 교재가 없습니다. 시험+교재 › 일반 교재에서 먼저 등록하세요.'}</div>`;
          box.innerHTML = h;
          // 고른 교재에 분류가 있으면 분류를 그 교재에 맞춰 고정
          const pm = NP.mat(matId), lock = !!(pm && BOOK_CAT[pm.cat]);
          $$('[name=bcat]', b).forEach(x => { x.disabled = lock && x.value !== pm.cat; });
          $('[data-cathint]', b).textContent = lock ? '교재에 정해진 분류' : '';
        };
        const syncSt = () => { $$('[data-endrow]', b).forEach(x => { x.style.display = status === 'ing' ? 'none' : ''; }); };
        drawMats(); syncSt();
        b.addEventListener('input', (e) => { if (e.target.matches('[data-mq]')) { mq = e.target.value; drawMats(); } });
        b.addEventListener('change', (e) => {
          if (e.target.name === 'bcat') {
            cat = e.target.value;
            const pm = NP.mat(matId);
            if (pm && BOOK_CAT[pm.cat] && pm.cat !== cat) matId = '';   // 분류가 다른 교재는 선택 해제
            drawMats();
          }
          if (e.target.name === 'bst') { status = e.target.value; syncSt(); }
        });
        b.addEventListener('click', (e) => {
          const p = e.target.closest('[data-pm]');
          if (!p) return;
          matId = matId === p.dataset.pm && !r ? '' : p.dataset.pm;
          const pm = NP.mat(matId);
          if (pm && BOOK_CAT[pm.cat]) { cat = pm.cat; const rd = $(`[name=bcat][value="${cat}"]`, b); if (rd) rd.checked = true; }
          drawMats();
        });
      },
      buttons: [
        ...(r ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg(`“${this.nameOf(r)}” 교재 기록을 삭제할까요?\n완료 이력으로 남기려면 삭제 대신 완료·중단으로 바꾸세요.`, '삭제', true)) return false;
          Store.del('meta', r.id);
          toast('교재 기록을 삭제했습니다');
          App.render();
          if (onSaved) onSaved();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: async (mm) => {
          const b = mm.body;
          if (!sid || !Store.get('students', sid)) { toast('학생을 목록에서 고르세요'); return false; }
          const pm = NP.mat(matId);
          if (!matId || (!pm && !(r && r.matId === matId))) { toast('교재를 고르세요'); return false; }
          const c = pm && BOOK_CAT[pm.cat] ? pm.cat : cat;
          if (!BOOK_CAT[c]) { toast('분류를 고르세요'); return false; }
          const start = $('[name=start]', b).value, plan = $('[name=plan]', b).value, end = status === 'ing' ? '' : $('[name=end]', b).value;
          if (!isYmd(start)) { toast('시작일을 선택하세요'); return false; }
          if (plan && plan < start) { toast('끝낼 예정일이 시작일보다 빠릅니다'); return false; }
          if (status !== 'ing' && !isYmd(end)) { toast('끝난 날을 선택하세요'); return false; }
          if (status !== 'ing' && end < start) { toast('끝난 날이 시작일보다 빠릅니다'); return false; }
          const others = this.recsOf(sid).filter(x => x.id !== id && x.matId === matId);
          if (status === 'ing' && others.some(x => x.status === 'ing')) { toast('이 학생이 이미 진행 중인 교재입니다'); return false; }
          if (!r && others.some(x => x.status === 'done') && !await confirmDlg(`이 학생은 “${pm ? pm.name : ''}” 교재를 이미 완료한 적이 있습니다.\n다시 등록할까요?`, '등록')) return false;
          const rec = Object.assign({}, r || { id: uid('SB'), kind: 'sbook', createdAt: new Date().toISOString() }, {
            studentId: sid, matId, matName: pm ? pm.name : (r ? r.matName : ''), cat: c, status, start, plan: plan || '', end, memo: stripZws($('[name=memo]', b).value).trim(),
          });
          Store.put('meta', rec);
          toast('교재 기록을 저장했습니다');
          App.render();
          if (onSaved) onSaved();
          // 진행 중이던 교재를 끝냈으면 같은 분류의 다음 교재 등록 창을 바로 연다
          if (r && r.status === 'ing' && status !== 'ing') setTimeout(() => this.openRec(null, { sid, cat: c, start: end }, onSaved), 0);
        } },
      ],
    });
    return md;
  },

  // 완료 / 중단 처리 (끝난 날을 물은 뒤, 같은 분류의 다음 교재 등록 창을 연다)
  finish(id, st, onSaved) {
    const r = Store.get('meta', id);
    if (!r || r.status !== 'ing') return;
    const t = todayStr(), def = isYmd(r.start) && r.start > t ? r.start : t;
    Modal.open({
      title: st === 'done' ? '교재 완료' : '교재 중단', size: 'sm',
      body: `<div class="form"><label>교재</label><div><b>${esc(this.nameOf(r))}</b></div>
        <label class="req">끝난 날</label><input type="date" name="end" value="${def}" style="width:170px"></div>
        <p class="small muted" style="margin:10px 0 0">처리하면 같은 분류의 다음 교재 등록 창이 열립니다. (필요 없으면 취소)</p>`,
      buttons: [
        { text: '취소' },
        { text: st === 'done' ? '완료 처리' : '중단 처리', cls: 'primary', primary: true, onClick: (mm) => {
          const end = $('[name=end]', mm.body).value;
          const cur = Store.get('meta', id);
          if (!cur) { toast('기록이 삭제되었습니다'); return; }
          if (!isYmd(end)) { toast('끝난 날을 선택하세요'); return false; }
          if (isYmd(cur.start) && end < cur.start) { toast('끝난 날이 시작일보다 빠릅니다'); return false; }
          Store.put('meta', Object.assign({}, cur, { status: st, end, matName: this.nameOf(cur) }));
          toast(st === 'done' ? '완료한 교재로 옮겼습니다' : '중단한 교재로 옮겼습니다');
          App.render();
          if (onSaved) onSaved();
          setTimeout(() => this.openRec(null, { sid: cur.studentId, cat: this.catOf(cur), start: end }, onSaved), 0);
        } },
      ],
    });
  },
};

/* 교재 화면 전용 스타일 */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.bk-cat { display: inline-block; font-size: 12px; font-weight: 700; line-height: 19px; padding: 0 7px; border-radius: 9px; white-space: nowrap; }
.bk-cat.read { background: #E3F0FB; color: #1D5E93; }
.bk-cat.gram { background: #EDE7FA; color: #5B3FA6; }
.bk-cat.listen { background: #E2F4EC; color: #1F7A52; }
.bk-cat.word { background: #FCEFDC; color: #A9650B; }
.bk-cat.none { background: #EEF2F5; color: var(--ink-soft); }
.bk-tbl td { vertical-align: top; }
.bk-tbl .bk-name { cursor: pointer; }
.bk-tbl .bk-name:hover b { color: var(--accent-ink); text-decoration: underline; }
.bk-tbl tr:hover td { background: #FAFCFE; }
.bk-tbl tr.bk-grp td, .bk-tbl tr.bk-grp:hover td { background: #F1F7FC; padding-top: 6px; padding-bottom: 6px; border-bottom: 1px solid var(--line-strong); }
.bk-cell { min-width: 120px; max-width: 190px; }
.bk-item { display: block; padding: 3px 7px; margin-bottom: 3px; border-radius: 6px; background: var(--accent-soft); border: 1px solid transparent; cursor: pointer; line-height: 1.35; }
.bk-item:hover { border-color: var(--accent); }
.bk-item b { display: block; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-item .d { font-size: 12px; color: var(--ink-soft); white-space: nowrap; }
.bk-item.over { background: var(--warn-soft); }
.bk-item em, .bk-over { font-style: normal; color: var(--warn); font-weight: 700; }
.bk-add { border: 1px dashed var(--line-strong); background: transparent; color: var(--ink-mute); border-radius: 6px; width: 100%; padding: 1px 0; font-size: 13px; line-height: 1.4; cursor: pointer; }
.bk-add:hover { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft); }
.bk-cell.has .bk-add { opacity: 0; }
.bk-tbl tr:hover .bk-cell.has .bk-add, .bk-cell.has .bk-add:focus-visible { opacity: 1; }
.bk-cnt { border: 0; background: transparent; color: var(--accent-ink); font-weight: 600; cursor: pointer; padding: 2px 6px; border-radius: 5px; }
.bk-cnt:hover { background: var(--accent-soft); }
.bk-sec { margin-bottom: 14px; }
.bk-sec:last-child { margin-bottom: 0; }
.bk-sec-h { display: flex; align-items: center; gap: 8px; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid var(--line); }
.bk-none { padding: 2px 2px 4px; }
.bk-card { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--line-strong); border-left: 3px solid var(--accent); border-radius: 8px; cursor: pointer; }
.bk-card:hover { background: var(--accent-soft); }
.bk-card.over { border-left-color: var(--warn); }
.bk-card-m { flex: 1; min-width: 0; }
.bk-card-b { display: flex; gap: 4px; flex: none; }
.bk-memo { margin-top: 3px; color: var(--ink-soft); }
.bk-hist { display: flex; flex-direction: column; gap: 2px; }
.bk-hrow { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 6px; cursor: pointer; flex-wrap: wrap; }
.bk-hrow:hover { background: var(--accent-soft); }
.bk-hrow b { font-weight: 600; font-size: 14px; }
.bk-hmemo { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
.bk-h2 { font-size: 14px; margin: 0 0 6px; }
.bk-pick { max-height: 300px; }
.bk-pick label.bk-dis { opacity: .55; cursor: default; }
.bk-mats { max-height: 210px; overflow-y: auto; }
`;
  document.head.appendChild(st);
})();
