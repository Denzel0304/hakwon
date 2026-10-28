/* =========================================================
   students.js — 학생 관리 (등록 / 수정 / 휴원 / 복귀 / 퇴원 / 완전 삭제)
   student: { name, phone, parentPhone, school, grade, status:'active'|'pause'|'left',
              leftKind:'leave'|'graduate', statusDate, statusReason, schoolPending, memo, createdAt }
   ========================================================= */
const STATUS_LABEL = { active: '재원', pause: '휴원', left: '퇴원' };
const LOG_LABEL = {
  join: '등록', pause: '휴원', resume: '복귀', leave: '퇴원', rejoin: '재등록',
  graduate: '졸업', promote: '진급', school: '학교 입력',
};

const Students = {
  tab: 'active',
  q: '',
  grade: '',

  statusBadge(s) {
    if (s.status === 'pause') return '<span class="badge orange">휴원</span>';
    if (s.status === 'left') return s.leftKind === 'graduate' ? '<span class="badge purple">졸업</span>' : '<span class="badge gray">퇴원</span>';
    return '<span class="badge green">재원</span>';
  },

  activeClassesOf(sid, date = todayStr()) {
    return Store.where('enrollments', e => e.studentId === sid && Classes.enrollValid(e, date))
      .map(e => Store.get('classes', e.classId)).filter(Boolean).sort((a, b) => ko(a.name, b.name));
  },

  sortFn(a, b) { return (+a.grade || 99) - (+b.grade || 99) || ko(a.school, b.school) || ko(a.name, b.name); },

  render(main) {
    const all = Store.all('students');
    const counts = { active: 0, pause: 0, left: 0 };
    all.forEach(s => { counts[s.status || 'active'] = (counts[s.status || 'active'] || 0) + 1; });
    const q = this.q.trim().toLowerCase();
    const list = all.filter(s => (s.status || 'active') === this.tab)
      .filter(s => !this.grade || +s.grade === +this.grade)
      .filter(s => !q || [s.name, s.school, s.phone, s.parentPhone, s.memo, stTag(s)].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => this.sortFn(a, b));

    let h = `<div class="page-head"><h1>학생</h1><span class="grow"></span><button class="btn primary" data-a="add">+ 학생 등록</button></div>
      <div class="tabs">${['active', 'pause', 'left'].map(t => `<button data-tab="${t}" class="${this.tab === t ? 'active' : ''}">${t === 'left' ? '퇴원·졸업' : STATUS_LABEL[t]}<span class="cnt">${counts[t] || 0}</span></button>`).join('')}</div>
      <div class="toolbar">
        <input type="search" data-q placeholder="이름, 학교, 연락처, 메모 검색" value="${esc(this.q)}" style="width:280px">
        <select data-grade>${gradeOptions(this.grade, '전체 학년')}</select>
        <span class="muted small">${list.length}명</span>
      </div>`;
    if (!list.length) {
      h += `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 학생이 없습니다.' : '등록된 학생이 없습니다. 오른쪽 위 “학생 등록”으로 시작하세요.'}</div></div>`;
    } else {
      h += `<div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>이름</th><th>학교·학년</th>${this.tab === 'active' ? '<th>수강반</th>' : '<th>상태</th>'}<th>학생 연락처</th><th>부모님 연락처</th><th>메모</th></tr></thead><tbody>`;
      list.forEach(s => {
        const third = this.tab === 'active'
          ? esc(this.activeClassesOf(s.id).map(c => c.name).join(', ')) || '<span class="muted">-</span>'
          : `${this.statusBadge(s)} <span class="small soft">${fmtDate(s.statusDate, false)}</span>${s.statusReason ? `<div class="small muted">${esc(firstLine(s.statusReason))}</div>` : ''}`;
        h += `<tr class="click" data-id="${s.id}">
          <td class="nowrap"><b>${highlight(s.name, this.q)}</b></td>
          <td class="nowrap">${highlight(stTag(s), this.q)}${s.schoolPending ? ' <span class="badge orange">학교 입력 필요</span>' : ''}</td>
          <td>${third}</td>
          <td class="nowrap">${highlight(s.phone || '', this.q)}</td>
          <td class="nowrap">${highlight(s.parentPhone || '', this.q)}</td>
          <td class="small soft">${highlight(firstLine(s.memo), this.q)}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    main.innerHTML = h;
    main.onclick = (e) => {
      if (e.target.closest('[data-a=add]')) { this.openNew(); return; }
      const tb = e.target.closest('[data-tab]');
      if (tb) { this.tab = tb.dataset.tab; App.render(); return; }
      const tr = e.target.closest('tr[data-id]');
      if (tr) this.openDetail(tr.dataset.id);
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) {
        this.q = e.target.value;
        const pos = e.target.selectionStart;
        App.render();
        const inp = $('[data-q]', main); if (inp) { inp.focus(); inp.setSelectionRange(pos, pos); }
      }
    }, 250);
    main.onchange = (e) => { if (e.target.matches('[data-grade]')) { this.grade = e.target.value; App.render(); } };
  },

  /* ---------- 기본 정보 폼 ---------- */
  infoFormHtml(s) {
    return `<div class="form">
      <label class="req">이름</label><input type="text" name="name" value="${esc(s.name)}" maxlength="30">
      <label>학교·학년</label><div class="row"><input type="text" name="school" list="dl-schools" value="${esc(s.school)}" placeholder="비워 두면 학교미정" style="flex:1"><select name="grade">${gradeOptions(s.grade, '학년 선택')}</select></div>
      <label>학생 연락처</label><input type="tel" name="phone" value="${esc(s.phone)}" placeholder="010-0000-0000">
      <label>부모님 연락처</label><input type="tel" name="parentPhone" value="${esc(s.parentPhone)}" placeholder="010-0000-0000">
      <label class="top">메모</label><textarea name="memo" rows="4">${esc(s.memo)}</textarea>
    </div>`;
  },
  readInfo(b) {
    return {
      name: $('[name=name]', b).value.trim(),
      school: $('[name=school]', b).value.trim(),
      grade: $('[name=grade]', b).value ? +$('[name=grade]', b).value : '',
      phone: fmtPhone($('[name=phone]', b).value),
      parentPhone: fmtPhone($('[name=parentPhone]', b).value),
      memo: stripZws($('[name=memo]', b).value),
    };
  },
  bindPhones(b) {
    $$('input[type=tel]', b).forEach(i => i.addEventListener('blur', () => { i.value = fmtPhone(i.value); }));
  },

  classPickHtml(selected = []) {
    const cls = Store.all('classes').filter(c => c.active !== false).sort((a, b) => ko(a.start, b.start) || ko(a.name, b.name));
    if (!cls.length) return '<div class="muted small">만들어진 반이 없습니다. 반 관리에서 먼저 반을 만드세요.</div>';
    return '<div class="pick-list">' + cls.map(c => `<label><input type="checkbox" name="cls" value="${c.id}" ${selected.includes(c.id) ? 'checked' : ''}>${esc(c.name)} <span class="muted small">${esc(Classes.timeLabel(c))}</span></label>`).join('') + '</div>';
  },

  /* ---------- 신규 등록 ---------- */
  openNew() {
    const body = this.infoFormHtml({}) + `<div class="form" style="margin-top:10px">
      <label class="req">등록일</label><div class="row"><input type="date" name="joinDate" value="${todayStr()}"></div>
      <label class="top">수강반</label><div>${this.classPickHtml()}</div></div>`;
    Modal.open({
      title: '학생 등록', body, size: 'lg',
      onMount: (b) => { enhanceAll(b); this.bindPhones(b); },
      buttons: [
        { text: '취소' },
        { text: '등록', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body, info = this.readInfo(b);
          const joinDate = $('[name=joinDate]', b).value;
          if (!info.name) { toast('이름을 입력하세요'); return false; }
          if (!isYmd(joinDate)) { toast('등록일을 선택하세요'); return false; }
          const s = Object.assign({ id: uid('ST'), status: 'active', statusDate: joinDate, statusReason: '', schoolPending: false, createdAt: new Date().toISOString() }, info);
          Store.put('students', s);
          this.addLog(s.id, 'join', joinDate, '');
          $$('[name=cls]:checked', b).forEach(i => Classes.enroll(s.id, i.value, joinDate));
          toast(s.name + ' 학생을 등록했습니다');
          App.render();
        } },
      ],
    });
  },

  addLog(studentId, type, date, reason, extra = {}, id) {
    Store.put('student_log', Object.assign({ id: id || uid('LG'), studentId, type, date, reason: reason || '', createdAt: new Date().toISOString() }, extra));
  },

  /* ---------- 학생 상세 ---------- */
  openDetail(id, tab = 'info') {
    const s = Store.get('students', id);
    if (!s) return;
    const m = Modal.open({
      title: s.name, size: 'lg', autofocus: false,
      body: `<div class="tabs" data-tabs>
        <button data-t="info">기본정보</button><button data-t="cls">수강반</button><button data-t="status">상태·이력</button>
        <button data-t="score">성적</button><button data-t="counsel">상담</button></div><div data-pane></div>`,
      buttons: [
        { text: '완전 삭제', cls: 'danger', left: true, onClick: async (mm) => {
          const ok = await confirmHard(`${s.name} 학생을 완전히 삭제할까요?\n수강 기록, 이력, 성적, 상담, 보강 기록이 모두 함께 삭제됩니다.\n(그만둔 학생은 삭제 대신 “퇴원 처리”를 쓰세요)`);
          if (!ok) return false;
          this.hardDelete(s.id);
          toast('학생을 삭제했습니다');
          App.render();
        } },
        { text: '닫기' },
      ],
    });
    m.tab = tab;
    m.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]');
      if (t) { m.tab = t.dataset.t; this.renderPane(m, id); }
    });
    this.renderPane(m, id);
  },

  renderPane(m, id) {
    const s = Store.get('students', id);
    if (!s) { m.close(); return; }
    $('.mg-modal-head h3', m.el).textContent = s.name + (stTag(s) ? '  ' + stTag(s) : '');
    $$('[data-t]', m.body).forEach(b => b.classList.toggle('active', b.dataset.t === m.tab));
    const pane = $('[data-pane]', m.body);
    pane.onclick = null;
    this['pane_' + m.tab](pane, s, m);
  },

  pane_info(pane, s, m) {
    pane.innerHTML = this.infoFormHtml(s) + `<div style="text-align:right;margin-top:12px"><button class="btn primary" data-save>정보 저장</button></div>`;
    enhanceAll(pane, { onSave: () => $('[data-save]', pane).click() });
    this.bindPhones(pane);
    $('[data-save]', pane).onclick = () => {
      const info = this.readInfo(pane);
      if (!info.name) { toast('이름을 입력하세요'); return; }
      const cur = Store.get('students', s.id);
      const rec = Object.assign({}, cur, info);
      if (info.school) rec.schoolPending = false;
      Store.put('students', rec);
      toast('저장했습니다');
      this.renderPane(m, s.id);
      App.render();
    };
  },

  pane_cls(pane, s, m) {
    const today = todayStr();
    const ens = Store.where('enrollments', e => e.studentId === s.id).sort((a, b) => ko(b.from, a.from));
    const cur = ens.filter(e => !e.to || e.to > today);
    const past = ens.filter(e => e.to && e.to <= today);
    const curIds = cur.map(e => e.classId);
    const canAdd = s.status === 'active';
    const addable = Store.all('classes').filter(c => c.active !== false && !curIds.includes(c.id)).sort((a, b) => ko(a.start, b.start));
    let h = '<h2 style="font-size:14px;margin:0 0 6px">현재 수강반</h2>';
    h += cur.length ? '<div class="list">' + cur.map(e => {
      const c = Store.get('classes', e.classId);
      return `<div class="list-item"><div class="what"><b>${esc(c ? c.name : '(삭제된 반)')}</b> ${c && c.active === false ? '<span class="badge gray">종료된 반</span>' : ''}
        <span class="muted small">${fmtDate(e.from, false)}부터${e.to ? ' · ' + fmtDate(e.to, false) + '에 빠짐 예정' : ''}</span></div>
        <button class="btn sm" data-leave="${e.id}">반에서 빼기</button></div>`;
    }).join('') + '</div>' : '<div class="empty">수강 중인 반이 없습니다.</div>';
    if (canAdd) {
      h += `<div class="row" style="display:flex;gap:8px;align-items:center;margin:10px 0 4px;flex-wrap:wrap">
        <select data-addcls>${addable.length ? addable.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') : '<option value="">추가할 반 없음</option>'}</select>
        <input type="date" data-adddate value="${today}"><button class="btn primary sm" data-add ${addable.length ? '' : 'disabled'}>반 추가</button>
        <span class="muted small">선택한 날짜부터 출석부에 들어갑니다.</span></div>`;
    } else {
      h += `<div class="muted small" style="margin-top:8px">${STATUS_LABEL[s.status]} 상태에서는 반을 배정할 수 없습니다. 상태·이력 탭에서 복귀 또는 재등록하면서 반을 고르세요.</div>`;
    }
    h += '<h2 style="font-size:14px;margin:18px 0 6px">지난 수강 기록</h2>';
    h += past.length ? '<div class="list">' + past.map(e => {
      const c = Store.get('classes', e.classId);
      return `<div class="list-item"><div class="what">${esc(c ? c.name : '(삭제된 반)')} <span class="muted small">${fmtDate(e.from, false)} ~ ${fmtDate(addDaysStr(e.to, -1), false)}</span></div>
        <button class="icon-btn" data-delen="${e.id}" title="기록 삭제">✕</button></div>`;
    }).join('') + '</div>' : '<div class="empty">지난 기록이 없습니다.</div>';
    pane.innerHTML = h;
    pane.onclick = async (e) => {
      const lv = e.target.closest('[data-leave]');
      if (lv) {
        const en = Store.get('enrollments', lv.dataset.leave);
        const d = await this.askDate('반에서 빼기', '이 날짜부터 출석부에서 빠집니다.', today);
        if (!d) return;
        if (d < en.from) { toast('수강 시작일보다 앞선 날짜는 선택할 수 없습니다'); return; }
        if (d === en.from) Store.del('enrollments', en.id);
        else Store.put('enrollments', Object.assign({}, en, { to: d }));
        toast('반에서 뺐습니다'); this.renderPane(m, s.id); App.render();
        return;
      }
      if (e.target.closest('[data-add]')) {
        const cid = $('[data-addcls]', pane).value, d = $('[data-adddate]', pane).value;
        if (!cid || !isYmd(d)) return;
        Classes.enroll(s.id, cid, d);
        toast('반을 추가했습니다'); this.renderPane(m, s.id); App.render();
        return;
      }
      const de = e.target.closest('[data-delen]');
      if (de && await confirmDlg('이 지난 수강 기록을 삭제할까요?', '삭제', true)) {
        Store.del('enrollments', de.dataset.delen); this.renderPane(m, s.id); App.render();
      }
    };
  },

  askDate(title, hint, def) {
    return new Promise(res => {
      Modal.open({
        title, size: 'sm', body: `<div class="form"><label>날짜</label><input type="date" value="${def}"></div><p class="small muted">${esc(hint)}</p>`,
        buttons: [{ text: '취소', onClick() { res(null); } }, { text: '확인', cls: 'primary', primary: true, onClick(mm) { const v = $('input', mm.body).value; if (!isYmd(v)) { toast('날짜를 선택하세요'); return false; } res(v); } }],
        onClose() { res(null); },
      });
    });
  },

  pane_status(pane, s, m) {
    const logs = Store.where('student_log', l => l.studentId === s.id).sort((a, b) => ko(b.date, a.date) || ko(b.createdAt, a.createdAt));
    let acts = '';
    if (s.status === 'active') acts = '<button class="btn" data-act="pause">휴원 처리</button><button class="btn danger" data-act="leave">퇴원 처리</button>';
    else if (s.status === 'pause') acts = '<button class="btn primary" data-act="resume">복귀 처리</button><button class="btn danger" data-act="leave">퇴원 처리</button>';
    else acts = '<button class="btn primary" data-act="rejoin">재등록</button>';
    let h = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <span>현재 상태</span> ${this.statusBadge(s)} <span class="small soft">${fmtDate(s.statusDate)}</span><span class="grow" style="flex:1"></span>${acts}</div>`;
    if (s.status !== 'active' && s.statusReason) h += `<div class="panel" style="margin-bottom:12px"><div class="small soft">사유</div><div class="pre">${esc(s.statusReason)}</div></div>`;
    h += '<h2 style="font-size:14px;margin:0 0 6px">이력</h2>';
    h += logs.length ? '<div class="list">' + logs.map(l => `<div class="list-item"><span class="when">${fmtDate(l.date, false)}</span>
      <div class="what"><b>${LOG_LABEL[l.type] || l.type}</b> ${l.note ? `<span class="small soft">${esc(l.note)}</span>` : ''}${l.reason ? `<div class="pre small soft">${esc(l.reason)}</div>` : ''}</div>
      <button class="icon-btn" data-dellog="${l.id}" title="이력 삭제">✕</button></div>`).join('') + '</div>' : '<div class="empty">이력이 없습니다.</div>';
    pane.innerHTML = h;
    pane.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      if (a) { this.openStatusAction(a.dataset.act, s.id, () => { this.renderPane(m, s.id); App.render(); }); return; }
      const dl = e.target.closest('[data-dellog]');
      if (dl && await confirmDlg('이 이력을 삭제할까요?\n(이력만 지워지고 현재 상태는 바뀌지 않습니다)', '삭제', true)) {
        Store.del('student_log', dl.dataset.dellog); this.renderPane(m, s.id);
      }
    };
  },

  openStatusAction(act, sid, done) {
    const s = Store.get('students', sid);
    const titles = { pause: '휴원 처리', leave: '퇴원 처리', resume: '복귀 처리', rejoin: '재등록' };
    const needCls = act === 'resume' || act === 'rejoin';
    const body = `<div class="form">
      <label class="req">날짜</label><div class="row"><input type="date" name="d" value="${todayStr()}"></div>
      ${needCls ? `<label class="top">수강반</label><div>${this.classPickHtml()}</div>` : `<label class="top">사유</label><textarea name="reason" rows="3" placeholder="선택 입력"></textarea>`}
    </div><p class="small muted">${act === 'pause' ? '휴원일부터 출석부에서 빠지고, 복귀할 때 반을 다시 고릅니다.' : act === 'leave' ? '퇴원일부터 출석부에서 빠집니다. 기록은 모두 보존됩니다.' : '선택한 반의 출석부에 날짜부터 들어갑니다.'}</p>`;
    Modal.open({
      title: s.name + ' · ' + titles[act], body,
      onMount: (b) => enhanceAll(b),
      buttons: [{ text: '취소' }, { text: titles[act], cls: act === 'leave' ? 'danger' : 'primary', primary: true, onClick: (m) => {
        const d = $('[name=d]', m.body).value;
        if (!isYmd(d)) { toast('날짜를 선택하세요'); return false; }
        const cur = Store.get('students', sid);
        if (act === 'pause' || act === 'leave') {
          const reason = stripZws($('[name=reason]', m.body).value);
          Classes.closeEnrollments(sid, d);
          Store.put('students', Object.assign({}, cur, { status: act === 'pause' ? 'pause' : 'left', leftKind: act === 'leave' ? 'leave' : (cur.leftKind || ''), statusDate: d, statusReason: reason }));
          this.addLog(sid, act, d, reason);
        } else {
          Store.put('students', Object.assign({}, cur, { status: 'active', leftKind: '', statusDate: d, statusReason: '' }));
          this.addLog(sid, act, d, '');
          $$('[name=cls]:checked', m.body).forEach(i => Classes.enroll(sid, i.value, d));
        }
        toast(titles[act] + '했습니다');
        if (done) done();
      } }],
    });
  },

  pane_score(pane, s) {
    const sc = Store.where('scores', x => x.studentId === s.id).sort((a, b) => b.year - a.year || b.semester - a.semester || (a.kind === 'final' ? -1 : 1));
    const ms = Store.where('mock_scores', x => x.studentId === s.id).map(x => ({ x, mk: Store.get('mocks', x.mockId) })).filter(o => o.mk)
      .sort((a, b) => b.mk.year - a.mk.year || b.mk.month - a.mk.month);
    let h = '<h2 style="font-size:14px;margin:0 0 6px">내신</h2>';
    h += sc.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>시험</th><th>당시 학교·학년</th><th class="num">점수</th><th>등급</th></tr></thead><tbody>${sc.map(x => `
      <tr><td>${x.year}년 ${x.semester}학기 ${EXAM_KIND[x.kind]}고사</td><td>${esc(schoolGradeLabel(x.school, x.grade))}</td><td class="num"><b>${esc(x.score)}</b></td><td>${esc(Scores.levelLabel(x.level))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">내신 기록이 없습니다.</div>';
    h += '<h2 style="font-size:14px;margin:18px 0 6px">모의고사</h2>';
    h += ms.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>회차</th><th class="num">원점수</th><th>틀린 번호</th></tr></thead><tbody>${ms.map(({ x, mk }) => `
      <tr><td>${esc(Scores.mockTitle(mk))}</td><td class="num"><b>${esc(x.raw ?? '')}</b></td><td class="small">${esc(Scores.compressNums(x.wrong || []))} <span class="muted">(${(x.wrong || []).length}개)</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">모의고사 기록이 없습니다.</div>';
    h += '<p class="small muted" style="margin-top:10px">성적 입력과 수정은 왼쪽 메뉴의 “성적”에서 합니다.</p>';
    pane.innerHTML = h;
  },

  pane_counsel(pane, s, m) {
    const list = Store.where('counsels', c => c.studentId === s.id).sort((a, b) => ko(b.date, a.date));
    let h = `<div style="text-align:right;margin-bottom:8px"><button class="btn primary sm" data-addc>+ 상담 기록</button></div>`;
    h += list.length ? '<div class="list">' + list.map(c => `<div class="list-item click" data-c="${c.id}"><span class="when">${fmtDate(c.date)}</span><div class="what pre">${esc(c.content)}</div></div>`).join('') + '</div>'
      : '<div class="empty">상담 기록이 없습니다.</div>';
    pane.innerHTML = h;
    const refresh = () => { this.renderPane(m, s.id); App.render(); };
    pane.onclick = (e) => {
      if (e.target.closest('[data-addc]')) { Counsels.openModal(null, { studentId: s.id }, refresh); return; }
      const c = e.target.closest('[data-c]');
      if (c) Counsels.openModal(c.dataset.c, {}, refresh);
    };
  },

  hardDelete(sid) {
    Store.delWhere('enrollments', e => e.studentId === sid);
    Store.delWhere('student_log', e => e.studentId === sid);
    Store.delWhere('scores', e => e.studentId === sid);
    Store.delWhere('mock_scores', e => e.studentId === sid);
    Store.delWhere('counsels', e => e.studentId === sid);
    Store.delWhere('makeups', e => e.studentId === sid);
    Store.where('lessons', l => l.att && l.att[sid]).forEach(l => {
      const att = Object.assign({}, l.att); delete att[sid];
      Store.put('lessons', Object.assign({}, l, { att }));
    });
    Store.del('students', sid);
  },
};
