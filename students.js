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
  sortKey: '',      // '' 기본 정렬 / name / school / cls / join
  sortDir: 0,       // 1 오름차순, -1 내림차순
  sel: new Set(),   // 목록에서 체크한 학생 id (일괄 처리용)

  statusBadge(s) {
    if (s.status === 'pause') return '<span class="badge orange">휴원</span>';
    if (s.status === 'left') return s.leftKind === 'graduate' ? '<span class="badge purple">졸업</span>' : '<span class="badge gray">퇴원</span>';
    return '<span class="badge green">재원</span>';
  },

  activeClassesOf(sid, date = todayStr()) {
    return Store.where('enrollments', e => e.studentId === sid && Classes.enrollValid(e, date))
      .map(e => Store.get('classes', e.classId)).filter(Boolean).sort((a, b) => ko(a.name, b.name));
  },

  // 오늘 이후 수강을 시작할 예정인 반 [{ c, from }] (오늘 이미 수강 중인 반은 제외)
  upcomingClassesOf(sid, date = todayStr()) {
    const now = new Set(this.activeClassesOf(sid, date).map(c => c.id));
    const best = {};
    Store.where('enrollments', e => e.studentId === sid && e.from > date).forEach(e => {
      if (now.has(e.classId)) return;
      if (!best[e.classId] || e.from < best[e.classId]) best[e.classId] = e.from;
    });
    return Object.keys(best).map(id => ({ c: Store.get('classes', id), from: best[id] })).filter(o => o.c).sort((a, b) => ko(a.from, b.from));
  },
  schedBadge(s) {
    return s.sched && isYmd(s.sched.date) ? ` <span class="badge orange">${Classes.md(s.sched.date)} ${LOG_LABEL[s.sched.act] || ''} 예정</span>` : '';
  },

  sortFn(a, b) { return (+a.grade || 99) - (+b.grade || 99) || ko(a.school, b.school) || ko(a.name, b.name); },

  // 머리글 정렬 (값이 없는 학생은 오름·내림 모두 맨 아래, 같으면 기본 정렬)
  sortList(list) {
    const base = (a, b) => this.sortFn(a, b);
    const k = this.sortKey, d = this.sortDir;
    if (!k || !d || (k === 'cls' && this.tab !== 'active')) return list.sort(base);
    let keyOf, cmp;
    if (k === 'name') { keyOf = s => (s.name || '').trim() || null; cmp = ko; }
    else if (k === 'school') { keyOf = s => +s.grade ? s : null; cmp = (a, b) => (+a.grade) - (+b.grade) || ko(a.school, b.school); }
    else if (k === 'join') { keyOf = s => { const j = this.joinDateOf(s); return isYmd(j) ? j : null; }; cmp = ko; }
    else {   // 수강반: 반 관리의 반 순서(시간순) 기준, 여러 반이면 가장 앞선 반
      const order = {};
      Classes.sorted(Store.all('classes')).forEach((c, i) => { order[c.id] = i; });
      keyOf = s => {
        let ids = this.activeClassesOf(s.id).map(c => c.id);
        if (!ids.length) ids = this.upcomingClassesOf(s.id).map(o => o.c.id);
        return ids.length ? Math.min(...ids.map(id => order[id])) : null;
      };
      cmp = (a, b) => a - b;
    }
    const key = new Map(list.map(s => [s.id, keyOf(s)]));
    return list.sort((a, b) => {
      const x = key.get(a.id), y = key.get(b.id);
      if (x == null || y == null) return (x == null) - (y == null) || base(a, b);
      return cmp(x, y) * d || base(a, b);
    });
  },
  // 등록일 + 수강 기간: 26.3.4 (3개월)  — 30일이 찰 때마다 1개월
  joinCell(s) {
    const j = this.joinDateOf(s);
    if (!isYmd(j)) return '<span class="muted">-</span>';
    const jd = parseYmd(j);
    const label = String(jd.getFullYear()).slice(2) + '.' + (jd.getMonth() + 1) + '.' + jd.getDate();
    const end = (s.status === 'left' && isYmd(s.statusDate)) ? s.statusDate : todayStr();
    const days = Math.round((parseYmd(end) - jd) / 86400000);
    const m = Math.floor(days / 30);
    const per = days < 0 ? '등록 예정' : m < 1 ? '1개월 미만' : m + '개월';
    return `${label} <span class="small soft">(${per})</span>`;
  },

  sortTh(k, label) {
    const on = this.sortKey === k && this.sortDir;
    return `<th class="sortable${on ? ' on' : ''}" data-sort="${k}" title="눌러서 정렬 (오름차순 → 내림차순 → 기본)">${label}<span class="ar">${on ? (this.sortDir === 1 ? '▲' : '▼') : '↕'}</span></th>`;
  },

  render(main) {
    const all = Store.all('students');
    const counts = { active: 0, pause: 0, left: 0 };
    all.forEach(s => { counts[s.status || 'active'] = (counts[s.status || 'active'] || 0) + 1; });
    const q = this.q.trim().toLowerCase();
    const list = all.filter(s => (s.status || 'active') === this.tab)
      .filter(s => !this.grade || +s.grade === +this.grade)
      .filter(s => !q || [s.name, s.school, s.phone, s.parentPhone, s.memo, stTag(s)].some(v => String(v || '').toLowerCase().includes(q)));
    this.sortList(list);
    // 지금 목록에 보이지 않는 학생은 선택에서 뺀다 (탭·검색·학년이 바뀌면 보이는 학생만 남음)
    const vis = new Set(list.map(s => s.id));
    [...this.sel].forEach(id => { if (!vis.has(id)) this.sel.delete(id); });
    const bulkActs = this.tab === 'active' ? [['pause', '휴원'], ['leave', '퇴원'], ['graduate', '졸업']]
      : this.tab === 'pause' ? [['leave', '퇴원'], ['graduate', '졸업']] : [];

    let h = `<div class="page-narrow"><div class="page-head"><h1>학생</h1><button class="btn primary" data-a="add">+ 학생 등록</button><button class="btn" data-a="gimport">구글 연락처 가져오기</button></div>
      <div class="tabs">${['active', 'pause', 'left'].map(t => `<button data-tab="${t}" class="${this.tab === t ? 'active' : ''}">${t === 'left' ? '퇴원·졸업' : STATUS_LABEL[t]}<span class="cnt">${counts[t] || 0}</span></button>`).join('')}</div>
      <div class="toolbar">
        <input type="search" data-q placeholder="이름, 학교, 연락처, 메모 검색" value="${esc(this.q)}" style="width:280px">
        <select data-grade>${gradeOptions(this.grade, '전체 학년')}</select>
        <span class="muted small">${list.length}명</span>
      </div>
      <div class="bulk-bar${this.sel.size ? '' : ' off'}" data-bulkbar><b data-selcnt>${this.sel.size}명 선택</b>
        ${this.tab === 'active' ? `<button class="btn sm" data-bulk="ctsave" ${this.sel.size ? '' : 'disabled'}>연락처 저장</button>` : ''}
        ${bulkActs.map(([a, t]) => `<button class="btn sm" data-bulk="${a}" ${this.sel.size ? '' : 'disabled'}>선택 ${t}</button>`).join('')}
        <button class="btn sm danger" data-bulk="delete" ${this.sel.size ? '' : 'disabled'}>선택 삭제</button><span style="flex:1"></span><button class="btn sm" data-bulk="clear" ${this.sel.size ? '' : 'disabled'}>선택 해제</button></div>`;
    if (!list.length) {
      h += `<div class="panel"><div class="empty">${all.length ? '조건에 맞는 학생이 없습니다.' : '등록된 학생이 없습니다. 오른쪽 위 “학생 등록”으로 시작하세요.'}</div></div>`;
    } else {
      const allOn = list.every(s => this.sel.has(s.id));
      h += `<div class="tbl-wrap"><table class="tbl compact"><thead><tr>
        <th class="chk-th"><label class="chk-hit" title="전체 선택"><input type="checkbox" data-chkall ${allOn ? 'checked' : ''}></label></th>${this.sortTh('name', '이름')}${this.sortTh('school', '학교·학년')}${this.tab === 'active' ? this.sortTh('cls', '수강반') : '<th>상태</th>'}<th>학생 연락처</th><th>부모님 연락처</th>${this.sortTh('join', '등록일')}</tr></thead><tbody>`;
      list.forEach(s => {
        const third = this.tab === 'active'
          ? [esc(this.activeClassesOf(s.id).map(c => c.name + Classes.daysTag(c.id, s.id, todayStr())).join(', '))].concat(this.upcomingClassesOf(s.id).map(o => `<span class="muted">${esc(o.c.name + Classes.daysTag(o.c.id, s.id, o.from))} (${Classes.md(o.from)}~)</span>`)).filter(Boolean).join(', ') || '<span class="muted">-</span>'
          : `${this.statusBadge(s)} <span class="small soft">${fmtDate(s.statusDate, false)}</span>${s.statusReason ? `<div class="small muted">${esc(firstLine(s.statusReason))}</div>` : ''}`;
        h += `<tr class="click" data-id="${s.id}">
          <td class="chk-td"><label class="chk-hit"><input type="checkbox" data-chk="${s.id}" ${this.sel.has(s.id) ? 'checked' : ''}></label></td>
          <td class="nowrap"><b>${highlight(s.name, this.q)}</b>${this.schedBadge(s)}</td>
          <td class="nowrap">${highlight(stTag(s), this.q)}${s.schoolPending ? ' <span class="badge orange">학교 입력 필요</span>' : ''}</td>
          <td>${third}</td>
          <td class="nowrap">${highlight(s.phone || '', this.q)}</td>
          <td class="nowrap">${highlight(s.parentPhone || '', this.q)}</td>
          <td class="nowrap">${this.joinCell(s)}</td></tr>`;
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    main.innerHTML = h;
    { const ca = $('[data-chkall]', main); if (ca) ca.indeterminate = this.sel.size > 0 && !ca.checked; }
    main.onclick = (e) => {
      if (e.target.closest('.chk-hit')) return;          // 체크박스 칸은 학생 창을 열지 않음
      const bk = e.target.closest('[data-bulk]');
      if (bk) { this.bulkAction(bk.dataset.bulk); return; }
      if (e.target.closest('[data-a=add]')) { this.openNew(); return; }
      if (e.target.closest('[data-a=gimport]')) { this.importContacts(); return; }
      const th = e.target.closest('th[data-sort]');
      if (th) {   // 오름차순 → 내림차순 → 기본 정렬
        const k = th.dataset.sort;
        if (this.sortKey !== k) { this.sortKey = k; this.sortDir = 1; }
        else if (this.sortDir === 1) this.sortDir = -1;
        else { this.sortKey = ''; this.sortDir = 0; }
        App.render(); return;
      }
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
    main.onchange = (e) => {
      if (e.target.matches('[data-grade]')) { this.grade = e.target.value; App.render(); return; }
      if (e.target.matches('[data-chk]')) {
        if (e.target.checked) this.sel.add(e.target.dataset.chk); else this.sel.delete(e.target.dataset.chk);
        this.updBulk(main); return;
      }
      if (e.target.matches('[data-chkall]')) {
        $$('[data-chk]', main).forEach(c => { c.checked = e.target.checked; if (c.checked) this.sel.add(c.dataset.chk); else this.sel.delete(c.dataset.chk); });
        this.updBulk(main);
      }
    };
  },
  // 체크 상태가 바뀌면 다시 그리지 않고 일괄 처리 줄과 전체 선택 칸만 맞춘다
  updBulk(main) {
    const bar = $('[data-bulkbar]', main), cnt = $('[data-selcnt]', main), ca = $('[data-chkall]', main);
    const boxes = $$('[data-chk]', main);
    if (bar) {   // 줄은 늘 자리를 차지하고, 선택이 있을 때만 버튼이 살아난다 (목록이 밀려 내려가지 않게)
      bar.classList.toggle('off', !this.sel.size);
      $$('[data-bulk]', bar).forEach(b => { b.disabled = !this.sel.size; });
    }
    if (cnt) cnt.textContent = this.sel.size + '명 선택';
    if (ca) { ca.checked = boxes.length > 0 && boxes.every(c => c.checked); ca.indeterminate = this.sel.size > 0 && !ca.checked; }
  },

  /* ---------- 일괄 처리 (휴원·퇴원·졸업·완전 삭제) ---------- */
  async bulkAction(act) {
    if (act === 'clear') { this.sel.clear(); App.render(); return; }
    const list = [...this.sel].map(id => Store.get('students', id)).filter(Boolean);
    if (!list.length) return;
    if (act === 'ctsave') { this.bulkContactSave(list); return; }
    if (act === 'delete') {
      const ok = await confirmHard(`선택한 ${list.length}명을 완전히 삭제할까요?\n${list.map(s => s.name).join(', ')}\n\n수강 기록, 이력, 교재, 성적, 상담, 보강 기록이 모두 함께 삭제됩니다.\n(그만둔 학생은 삭제 대신 “퇴원 처리”를 쓰세요)`);
      if (!ok) return;
      list.forEach(s => this.hardDelete(s.id));
      this.sel.clear();
      toast(list.length + '명을 삭제했습니다');
      App.render();
      this.contactRemove(list);
      return;
    }
    this.openBulkStatus(act, list);
  },
  openBulkStatus(act, list) {
    const titles = { pause: '휴원 처리', leave: '퇴원 처리', graduate: '졸업 처리' };
    const busy = (s) => !!(s.sched && isYmd(s.sched.date));
    const skip = list.filter(busy), go = list.filter(s => !busy(s));
    if (!go.length) { alertDlg('선택 ' + titles[act], '선택한 학생 모두 이미 예약이 걸려 있어 처리할 수 없습니다.\n학생별 “상태·이력”에서 예약을 먼저 취소하세요.'); return; }
    const help = act === 'pause' ? '휴원일부터 출석부에서 빠지고, 복귀할 때 반을 다시 고릅니다.' : (act === 'leave' ? '퇴원' : '졸업') + '일부터 출석부에서 빠집니다. 기록은 모두 보존됩니다.';
    const body = `<div class="form">
      <label class="req">날짜</label><div class="row"><input type="date" name="d" value="${todayStr()}"></div>
      <label class="top">사유</label><textarea name="reason" rows="3" placeholder="선택 입력 (모든 학생에게 같게 들어감)"></textarea>
    </div><p class="small muted">${esc(help)} 미래 날짜를 고르면 학생마다 예약으로 들어갑니다.</p>
    <p class="small"><b>${go.length}명</b> · ${esc(go.map(s => s.name).join(', '))}</p>
    ${skip.length ? `<p class="small" style="color:#A9650B">이미 예약이 걸린 ${skip.length}명은 제외: ${esc(skip.map(s => s.name).join(', '))}</p>` : ''}`;
    Modal.open({
      title: '선택 ' + titles[act], body,
      onMount: (b) => enhanceAll(b),
      buttons: [{ text: '취소' }, { text: `${go.length}명 ${titles[act]}`, cls: act === 'leave' ? 'danger' : 'primary', primary: true, onClick: async (m) => {
        const d = $('[name=d]', m.body).value;
        if (!isYmd(d)) { toast('날짜를 선택하세요'); return false; }
        const reason = stripZws($('[name=reason]', m.body).value);
        const done = [];
        go.forEach(s => {
          const cur = Store.get('students', s.id);
          if (!cur || busy(cur)) return;
          if (this.statusOut(cur.id, act, d, reason)) done.push(cur);
        });
        this.sel.clear();
        toast(d > todayStr() ? `${go.length}명 ${fmtDate(d, false)} ${titles[act]}를 예약했습니다` : `${go.length}명 ${titles[act]}했습니다`);
        App.render();
        this.contactRemove(done);
      } }],
    });
  },

  /* ---------- 구글 연락처 가져오기 (재원생, 빈 칸만 채움) ---------- */
  // 구글 주소록 번호 → 프로그램 형식 (+82 → 0)
  normGPhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('82')) d = '0' + d.slice(2);
    return d;
  },

  async importContacts() {
    if (this.importing) { toast('가져오기가 진행 중입니다'); return; }
    if (!CFG.GAS_CONTACT_URL) { toast('연락처 저장 주소(GAS_CONTACT_URL)가 설정되지 않았습니다'); return; }
    const key = Auth.key();
    if (!key) { toast('로그인이 필요합니다'); return; }

    const active = Store.all('students').filter(s => (s.status || 'active') === 'active');
    const targets = active.filter(s => (s.name || '').trim() && (!s.phone || !s.parentPhone));   // 둘 다 차 있으면 건너뜀
    if (!targets.length) { toast('연락처가 비어 있는 재원생이 없습니다'); return; }

    // 프로그램 안 같은 이름(재원생 기준) → 안내만
    const cnt = {};
    active.forEach(s => { const n = (s.name || '').trim(); if (n) cnt[n] = (cnt[n] || 0) + 1; });
    const dupInApp = [...new Set(targets.map(s => s.name.trim()).filter(n => cnt[n] > 1))];
    const work = targets.filter(s => cnt[s.name.trim()] === 1);

    if (!await confirmDlg(`연락처가 비어 있는 재원생 ${targets.length}명을 구글 주소록에서 찾아 빈 칸을 채울까요?`, '가져오기')) return;

    this.importing = true;
    const btn = $('[data-a=gimport]');
    if (btn) { btn.disabled = true; btn.textContent = '가져오는 중…'; }
    const bz = Busy.open('구글 연락처 가져오기', { text: `${work.length}명의 연락처를 구글 주소록에서 찾는 중…` });

    let d = null;
    try {
    if (work.length) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 120000);
      try {
        const r = await fetch(CFG.GAS_CONTACT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ key, action: 'fetch', names: work.map(s => s.name.trim()) }),
          signal: ctl.signal,
        });
        d = await r.json();
      } catch (e) {
        toast(e.name === 'AbortError' ? '가져오기 실패: 응답 시간 초과' : '가져오기 실패: 네트워크 오류');
      } finally {
        clearTimeout(timer);
      }
      if (d && !d.ok) {
        toast(d.reason === 'unauthorized' ? '로그인 키가 유효하지 않습니다. 다시 로그인하세요'
          : d.reason === 'busy' ? '다른 작업이 진행 중입니다. 잠시 후 다시 누르세요'
          : '가져오기 실패: ' + (d.message || d.reason || '알 수 없는 오류'));
        d = null;
      }
    }
    } finally { bz.close(); }
    this.importing = false;
    const btn2 = $('[data-a=gimport]');
    if (btn2) { btn2.disabled = false; btn2.textContent = '구글 연락처 가져오기'; }
    if (work.length && !d) return;

    const contacts = (d && d.contacts) || {};
    const res = { students: 0, phone: 0, parent: 0, notFound: [], dupInGoogle: [], multiNum: [] };
    // 주소록에서 한 이름의 번호 하나를 고른다. 애매하면 안내 목록에 넣고 null
    const pick = (cn) => {
      const list = contacts[cn] || [];
      if (!list.length) { res.notFound.push(cn); return null; }
      if (list.length > 1) { res.dupInGoogle.push(cn); return null; }
      const nums = [...new Set((list[0] || []).map(v => this.normGPhone(v)).filter(Boolean))];
      if (!nums.length) { res.notFound.push(cn); return null; }
      if (nums.length > 1) { res.multiNum.push(cn); return null; }
      return fmtPhone(nums[0]);
    };

    work.forEach(s => {
      const name = s.name.trim();
      const rec = Object.assign({}, s);
      let changed = false;
      if (!s.phone) { const v = pick(name); if (v) { rec.phone = v; res.phone++; changed = true; } }
      if (!s.parentPhone) { const v = pick(name + ' 어머님'); if (v) { rec.parentPhone = v; res.parent++; changed = true; } }
      if (changed) { Store.put('students', rec); res.students++; }
    });
    App.render();

    const sec = (title, arr, note) => arr.length
      ? `<div style="margin-top:14px"><b>${esc(title)} (${arr.length})</b>${note ? ` <span class="muted small">${esc(note)}</span>` : ''}<div style="margin-top:4px;user-select:text">${arr.map(esc).join(', ')}</div></div>` : '';
    const body = `<div style="line-height:1.7">
      <div>채운 학생: <b>${res.students}명</b> <span class="muted small">(학생 번호 ${res.phone}건 · 어머님 번호 ${res.parent}건)</span></div>
      ${sec('프로그램에 같은 이름의 재원생이 여러 명', dupInApp, '건너뜀 — 직접 처리')}
      ${sec('구글 주소록에 같은 이름이 여러 개', res.dupInGoogle, '건너뜀 — 직접 처리')}
      ${sec('한 연락처에 번호가 여러 개', res.multiNum, '건너뜀 — 직접 처리')}
      ${sec('구글 주소록에 없음', res.notFound, '')}
    </div>`;
    Modal.open({ title: '구글 연락처 가져오기 결과', size: 'md', autofocus: false, body, buttons: [{ text: '닫기', cls: 'primary' }] });
  },

  /* ---------- 기본 정보 폼 ---------- */
  joinDateOf(s) {
    if (s.joinDate) return s.joinDate;
    const lg = Store.where('student_log', l => l.studentId === s.id && l.type === 'join').sort((a, b) => ko(a.date, b.date))[0];
    return lg ? lg.date : (s.statusDate || '');
  },

  infoFormHtml(s) {
    return `<div class="form">
      <label class="req">이름</label><input type="text" name="name" value="${esc(s.name)}" maxlength="30" style="width:160px">
      <label class="req">등록일</label><div class="row"><input type="date" name="joinDate" value="${esc(s.id ? this.joinDateOf(s) : (s.joinDate || todayStr()))}"></div>
      <label>학교·학년</label><div class="row"><input type="text" name="school" class="combo-input" value="${esc(s.school)}" placeholder="비워 두면 학년만 표시" autocomplete="off" style="width:200px"><select name="grade">${gradeOptions(s.grade, '학년 선택')}</select></div>
      <label>학생 연락처</label><input type="tel" name="phone" value="${esc(s.phone)}" placeholder="010-0000-0000" style="width:180px">
      <label>부모님 연락처</label><input type="tel" name="parentPhone" value="${esc(s.parentPhone)}" placeholder="010-0000-0000" style="width:180px">
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
    const sch = $('[name=school]', b);
    if (sch) bindCombo(sch, schoolOptions);
  },

  classPickHtml(selected = []) {
    const cls = Classes.sorted(Store.all('classes').filter(c => c.active !== false));   // 반 관리와 같은 순서
    if (!cls.length) return '<div class="muted small">만들어진 반이 없습니다. 반 메뉴에서 먼저 반을 만드세요.</div>';
    return '<div class="pick-list">' + cls.map(c => `<label><input type="checkbox" name="cls" value="${c.id}" ${selected.includes(c.id) ? 'checked' : ''}>${esc(c.name)} <span class="muted small">${esc(Classes.timeLabel(c))}</span><span class="pkd" data-ckd="${c.id}">${this.ckdHtml(c, null)}</span></label>`).join('') + '</div>';
  },
  // 수강반 목록의 요일 버튼 (반을 체크하면 보임, 끈 요일은 빼고 수강). sel: 켜진 요일, null = 전부
  ckdHtml(c, sel) {
    const cd = DAY_ORDER.filter(d => (c.days || []).includes(d));
    if (cd.length < 2) return '';
    const part = sel && sel.length && sel.length < cd.length;
    // '월만' 표시는 버튼 왼쪽에 둔다 (오른쪽 정렬이라 버튼 위치가 바뀌지 않음)
    return (part ? `<em>${esc(daysLabel(sel))}만</em>` : '')
      + cd.map(d => `<button type="button" data-ckday="${d}" class="${!part || sel.includes(d) ? 'on' : ''}" title="${DOW[d]}요일 수강 켜기/끄기">${DOW[d]}</button>`).join('');
  },
  bindClassPick(b) {
    b.addEventListener('click', (e) => {
      const k = e.target.closest('[data-ckday]');
      if (!k) return;
      e.preventDefault();
      const box = k.closest('[data-ckd]'), c = Store.get('classes', box.dataset.ckd);
      if (!c) return;
      const cd = DAY_ORDER.filter(d => (c.days || []).includes(d)), d = +k.dataset.ckday;
      let sel = $$('button.on', box).map(x => +x.dataset.ckday);
      sel = sel.includes(d) ? sel.filter(x => x !== d) : DAY_ORDER.filter(x => x === d || sel.includes(x));
      if (!sel.length) { toast('최소 하루는 수강해야 합니다. 빼려면 반 체크를 푸세요'); return; }
      box.innerHTML = this.ckdHtml(c, sel.length === cd.length ? null : sel);
    });
  },
  // 체크한 반과 수강 요일: [{ cid, days }] (days = null 이면 모든 요일)
  readClassPicks(b) {
    return $$('[name=cls]:checked', b).map(i => {
      const box = $(`[data-ckd="${i.value}"]`, b);
      const all = box ? $$('button', box).length : 0;
      const on = box ? $$('button.on', box).map(x => +x.dataset.ckday) : [];
      return { cid: i.value, days: all && on.length < all ? on : null };
    });
  },

  /* ---------- 신규 등록 ---------- */
  openNew() {
    const body = this.infoFormHtml({}) + `<div class="form" style="margin-top:10px">
      <label class="top">수강반</label><div>${this.classPickHtml()}</div></div>`;
    Modal.open({
      title: '학생 등록', body, size: 'md',
      onMount: (b) => { enhanceAll(b); this.bindPhones(b); this.bindClassPick(b); },
      buttons: [
        { text: '취소' },
        { text: '연락처 저장', onClick: (m) => this.sendContact(m, m.body) },
        { text: '등록', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body, info = this.readInfo(b);
          const joinDate = $('[name=joinDate]', b).value;
          if (!info.name) { toast('이름을 입력하세요'); return false; }
          if (!isYmd(joinDate)) { toast('등록일을 선택하세요'); return false; }
          const s = Object.assign({ id: uid('ST'), status: 'active', joinDate, statusDate: joinDate, statusReason: '', schoolPending: false, createdAt: new Date().toISOString() }, info);
          Store.put('students', s);
          this.addLog(s.id, 'join', joinDate, '');
          this.readClassPicks(b).forEach(p => Classes.enrollDays(s.id, p.cid, joinDate, p.days, true));
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
      title: s.name, size: 'md', autofocus: false,
      body: `<div class="tabs" data-tabs>
        <button data-t="info">기본정보</button><button data-t="cls">수강반</button><button data-t="status">상태·이력</button>
        <button data-t="book">교재</button><button data-t="score">성적</button><button data-t="counsel">상담</button></div><div data-pane></div>`,
      buttons: [
        { text: '완전 삭제', cls: 'danger', left: true, onClick: async (mm) => {
          const ok = await confirmHard(`${s.name} 학생을 완전히 삭제할까요?\n수강 기록, 이력, 교재, 성적, 상담, 보강 기록이 모두 함께 삭제됩니다.\n(그만둔 학생은 삭제 대신 “퇴원 처리”를 쓰세요)`);
          if (!ok) return false;
          const gone = Store.get('students', s.id) || s;
          this.hardDelete(s.id);
          toast('학생을 삭제했습니다');
          App.render();
          this.contactRemove([gone]);
        } },
        { text: '연락처 저장', onClick: (mm) => this.sendContact(mm, null, s.id) },
        { text: '정보 저장', cls: 'primary', primary: true, onClick: (mm) => (mm.tab === 'info' ? this.saveInfo(mm, s.id) : false) },
        { text: '닫기' },
      ],
    });
    m.tab = tab;
    m.contactBtn = $$('.btn', m.foot).find(x => x.textContent === '연락처 저장');
    m.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]');
      if (t) { m.tab = t.dataset.t; this.renderPane(m, id); }
    });
    // 기본정보에서 입력한 내용이 있으면 자동 갱신으로 지우지 않는다
    m.body.addEventListener('input', () => { if (m.tab === 'info') m.dirty = true; });
    // 다른 곳(다른 기기 포함)에서 데이터가 바뀌면 입력 중이 아닐 때 다시 그린다
    m.refresh = () => {
      if (m.closed) return;
      const a = document.activeElement;
      const editing = a && m.el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
      if (editing || (m.tab === 'info' && m.dirty) || Modal.top() !== m) { m.stale = true; return; }
      this.renderPane(m, id);
    };
    m.el.addEventListener('focusout', () => setTimeout(() => { if (m.stale) m.refresh(); }, 0));
    this.renderPane(m, id);
  },

  renderPane(m, id) {
    const s = Store.get('students', id);
    if (!s) { m.close(); return; }
    m.stale = false; m.dirty = false;
    $('.mg-modal-head h3', m.el).textContent = s.name + (stTag(s) ? '  ' + stTag(s) : '');
    $$('[data-t]', m.body).forEach(b => b.classList.toggle('active', b.dataset.t === m.tab));
    const pane = $('[data-pane]', m.body);
    pane.onclick = null;
    const saveBtn = $('[data-primary]', m.foot);
    if (saveBtn) saveBtn.style.display = m.tab === 'info' ? '' : 'none';
    if (m.contactBtn) m.contactBtn.style.display = m.tab === 'info' ? '' : 'none';
    this['pane_' + m.tab](pane, s, m);
  },

  pane_info(pane, s, m) {
    pane.innerHTML = this.infoFormHtml(s);
    enhanceAll(pane);
    this.bindPhones(pane);
  },

  // 기본정보 저장 (false를 돌려주면 모달이 닫히지 않음)
  async saveInfo(m, sid) {
    const pane = $('[data-pane]', m.body);
    const s = { id: sid };
    {
      const info = this.readInfo(pane);
      const joinDate = $('[name=joinDate]', pane).value;
      if (!info.name) { toast('이름을 입력하세요'); return false; }
      if (!isYmd(joinDate)) { toast('등록일을 선택하세요'); return false; }
      const cur = Store.get('students', s.id);
      const rec = Object.assign({}, cur, info, { joinDate });
      // 등록일이 바뀌면 옛 등록일에 시작한 수강 기록의 시작일도 함께 옮긴다
      const oldJoin = this.joinDateOf(cur);
      if (isYmd(oldJoin) && oldJoin !== joinDate) {
        Store.where('enrollments', e => e.studentId === s.id && e.from === oldJoin && (!e.to || joinDate < e.to))
          .forEach(e => Store.put('enrollments', Object.assign({}, e, { from: joinDate })));
      }
      if (cur.status === 'active' && cur.statusDate === this.joinDateOf(cur)) rec.statusDate = joinDate;
      const jl = Store.where('student_log', l => l.studentId === s.id && l.type === 'join').sort((a, b) => ko(a.date, b.date))[0];
      if (jl) { if (jl.date !== joinDate) Store.put('student_log', Object.assign({}, jl, { date: joinDate })); }
      else this.addLog(s.id, 'join', joinDate, '');
      if (info.school) rec.schoolPending = false;
      // 부모 번호가 바뀌면: 같은 옛 번호를 쓰는 형제도 바꿀지 묻고, 주소록에 아직 반영 안 했으면 옛 번호를 기억해 둔다
      const op = this.ctNorm(cur.parentPhone), np = this.ctNorm(info.parentPhone);
      if (op && np && op !== np) {
        await this.askSibs(m, s.id, cur.parentPhone, info.parentPhone);
        if (m.ctDone !== np && !cur.ctOldParent) rec.ctOldParent = cur.parentPhone;
      }
      if (rec.ctOldParent && this.ctNorm(rec.ctOldParent) === np) delete rec.ctOldParent;
      Store.put('students', rec);
      toast('저장했습니다');
      App.render();
    }
  },

  // 연락처 저장: 기본정보 화면의 이름·번호를 GAS 웹앱으로 보내 구글 주소록에 등록/업데이트한다
  // (항상 false를 돌려줘 모달은 닫지 않는다)
  // root: 입력칸이 들어 있는 영역 (신규 등록 모달은 m.body, 학생 상세 모달은 생략 → 기본정보 탭)
  async sendContact(m, root, sid) {
    if (!root) {
      if (m.tab !== 'info') return false;
      root = $('[data-pane]', m.body);
    }
    const info = this.readInfo(root);
    if (!info.name) { toast('이름을 입력하세요'); return false; }
    if (!info.phone && !info.parentPhone) { toast('저장할 연락처가 없습니다'); return false; }
    if (!CFG.GAS_CONTACT_URL) { toast('연락처 저장 주소(GAS_CONTACT_URL)가 설정되지 않았습니다'); return false; }
    const key = Auth.key();
    if (!key) { toast('로그인이 필요합니다'); return false; }
    // 부모 번호를 바꾼 경우: 주소록에 있는 옛 번호(형제가 더 쓰지 않을 때만)를 새 번호로 바꾼다
    const cur = sid ? Store.get('students', sid) : null;
    let oldParentPhone = '';
    if (cur) {
      const op = this.ctNorm(cur.parentPhone), np = this.ctNorm(info.parentPhone);
      if (op && np && op !== np) {                 // 정보 저장 전에 번호를 바꿈
        await this.askSibs(m, sid, cur.parentPhone, info.parentPhone);
        oldParentPhone = cur.ctOldParent || cur.parentPhone;
      } else oldParentPhone = cur.ctOldParent || '';
    }
    const bz = Busy.open('구글 주소록에 연락처 저장', { text: info.name });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch(CFG.GAS_CONTACT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // 사전 요청(CORS preflight) 없이 GAS로 보내기 위함
        body: JSON.stringify({ key, name: info.name, phone: info.phone, parentPhone: info.parentPhone, oldParentPhone, keepParents: this.ctKeep(sid ? [sid] : []) }),
        signal: ctl.signal,
      });
      const d = await r.json();
      if (!d.ok) {
        toast(d.reason === 'unauthorized' ? '로그인 키가 유효하지 않습니다. 다시 로그인하세요'
          : d.reason === 'busy' ? '다른 저장이 진행 중입니다. 잠시 후 다시 누르세요'
          : '연락처 저장 실패: ' + (d.message || d.reason || '알 수 없는 오류'));
        return false;
      }
      const parts = [];
      if (d.added) parts.push(`등록 ${d.added}건`);
      if (d.updated) parts.push(`번호 변경 ${d.updated}건`);
      if (d.skipped) parts.push(`변경 없음 ${d.skipped}건`);
      if (d.errors && d.errors.length) toast(`일부 실패 (${parts.join(' · ') || '처리 0건'}) — ${d.errors[0]}`);
      else {
        toast('연락처 저장 완료 · ' + parts.join(' · '));
        if (m) m.ctDone = this.ctNorm(info.parentPhone);                 // 정보 저장 때 옛 번호를 다시 기억하지 않게
        const now = sid ? Store.get('students', sid) : null;
        if (now && now.ctOldParent) { const n = Object.assign({}, now); delete n.ctOldParent; Store.put('students', n); }
      }
    } catch (e) {
      toast(e.name === 'AbortError' ? '연락처 저장 실패: 응답 시간 초과' : '연락처 저장 실패: 네트워크 오류');
    } finally {
      clearTimeout(timer);
      bz.close();
    }
    return false;
  },

  pane_cls(pane, s, m) {
    const today = todayStr();
    const ens = Store.where('enrollments', e => e.studentId === s.id).sort((a, b) => ko(b.from, a.from));
    const cur = ens.filter(e => !e.to || e.to > today);
    const past = ens.filter(e => e.to && e.to <= today);
    // 오늘 수강 중이면서 끝날짜가 없는 반만 추가 목록에서 뺀다 (예정·빠짐 예정인 반은 날짜를 바꿔 다시 추가 가능)
    const curIds = cur.filter(e => !e.to && e.from <= today).map(e => e.classId);
    const canAdd = s.status === 'active';
    const addable = Classes.sorted(Store.all('classes').filter(c => c.active !== false && !curIds.includes(c.id)));   // 반 관리와 같은 순서
    let h = '<h2 style="font-size:14px;margin:0 0 6px">현재 수강반</h2>';
    h += cur.length ? '<div class="list">' + cur.map(e => {
      const c = Store.get('classes', e.classId);
      const pd = c ? Classes.normDays(e.days, c) : null;
      const canDays = c && c.active !== false && (c.days || []).length > 1;
      return `<div class="list-item"><div class="what"><b>${esc(c ? c.name : '(삭제된 반)')}</b> ${pd ? `<span class="pday">${esc(daysLabel(pd))}만</span> ` : ''}${c && c.active === false ? '<span class="badge gray">종료된 반</span>' : ''}${e.from > today ? '<span class="badge orange">예정</span>' : ''}
        <span class="muted small">${fmtDate(e.from, false)}부터${e.to ? ' · ' + fmtDate(e.to, false) + '에 빠짐 예정' : ''}</span></div>
        ${canDays ? `<button class="btn sm" data-days="${e.id}" title="이 반의 일부 요일만 수강하도록 바꿉니다">수강 요일</button>` : ''}
        <button class="btn sm" data-leave="${e.id}">반에서 빼기</button></div>`;
    }).join('') + '</div>' : '<div class="empty">수강 중인 반이 없습니다.</div>';
    if (canAdd) {
      h += `<div class="row" style="display:flex;gap:8px;align-items:center;margin:10px 0 4px;flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center">${Classes.selDot(addable[0] || null)}<select data-addcls>${addable.length ? addable.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') : '<option value="">추가할 반 없음</option>'}</select></span>
        <span class="day-picks" data-adddays></span>
        <input type="date" data-adddate value="${today}"><button class="btn primary sm" data-add ${addable.length ? '' : 'disabled'}>반 추가</button>
        <span class="muted small">선택한 날짜부터 출석부에 들어갑니다. 요일을 끄면 그 요일은 빼고 수강합니다.</span></div>`;
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
    // 반 추가: 고른 반의 요일 (기본 전부 켜짐, 요일이 하나뿐인 반은 표시하지 않음)
    const drawAddDays = () => {
      const box = $('[data-adddays]', pane), sel = $('[data-addcls]', pane);
      if (!box || !sel) return;
      const c = Store.get('classes', sel.value);
      const cd = c ? DAY_ORDER.filter(d => (c.days || []).includes(d)) : [];
      box.innerHTML = cd.length > 1 ? cd.map(d => `<label><input type="checkbox" value="${d}" checked>${DOW[d]}</label>`).join('') : '';
    };
    drawAddDays();
    pane.onchange = (e) => { if (e.target.matches('[data-addcls]')) drawAddDays(); };
    pane.onclick = async (e) => {
      const dy = e.target.closest('[data-days]');
      if (dy) {
        const en = Store.get('enrollments', dy.dataset.days), c = en && Store.get('classes', en.classId);
        if (!c) return;
        const r = await this.askDays(c, en, today);
        if (!r) return;
        if (!await Classes.confirmAttConflicts([{ sid: s.id, cid: c.id, from: r.date, days: r.days }])) return;
        const res = Classes.enrollDays(s.id, c.id, r.date, r.days);
        toast(res === 'exists' ? '수강 요일이 그대로입니다' : (r.days && Classes.normDays(r.days, c) ? daysLabel(Classes.normDays(r.days, c)) + '요일만 수강하도록 바꿨습니다' : '모든 요일 수강으로 바꿨습니다'));
        this.renderPane(m, s.id); App.render();
        return;
      }
      const lv = e.target.closest('[data-leave]');
      if (lv) {
        const en = Store.get('enrollments', lv.dataset.leave);
        const d = await this.askDate('반에서 빼기', '이 날짜부터 출석부에서 빠집니다.', today);
        if (!d) return;
        if (d < en.from && !await confirmDlg(`선택한 날짜가 수강 시작일(${fmtDate(en.from, false)})보다 앞입니다.\n이 수강 기록을 삭제할까요?`, '삭제', true)) return;
        if (d <= en.from) Store.del('enrollments', en.id);
        else Store.put('enrollments', Object.assign({}, en, { to: d }));
        toast('반에서 뺐습니다'); this.renderPane(m, s.id); App.render();
        return;
      }
      if (e.target.closest('[data-add]')) {
        const cid = $('[data-addcls]', pane).value, d = $('[data-adddate]', pane).value;
        if (!cid || !isYmd(d)) return;
        const dbox = $$('[data-adddays] input', pane);
        const days = dbox.filter(i => i.checked).map(i => +i.value);
        if (dbox.length && !days.length) { toast('수강할 요일을 하나 이상 고르세요'); return; }
        if (dbox.length && !await Classes.confirmAttConflicts([{ sid: s.id, cid, from: d, days }])) return;
        const r = Classes.enrollDays(s.id, cid, d, dbox.length ? days : null, true);
        if (r === 'exists') { toast('그 날짜에 이미 이 반을 수강 중입니다'); return; }
        toast(r === 'extended' ? '기존 수강 기록에 이어서 반을 추가했습니다' : r === 'changed' ? '수강 요일을 바꿨습니다' : (d > today ? fmtDate(d, false) + '부터 수강하도록 예약했습니다' : '반을 추가했습니다'));
        this.renderPane(m, s.id); App.render();
        return;
      }
      const de = e.target.closest('[data-delen]');
      if (de && await confirmDlg('이 지난 수강 기록을 삭제할까요?', '삭제', true)) {
        Store.del('enrollments', de.dataset.delen); this.renderPane(m, s.id); App.render();
      }
    };
  },

  // 수강 요일 변경: { date, days } (모든 요일이면 days = null)
  askDays(c, en, today) {
    const cd = DAY_ORDER.filter(d => (c.days || []).includes(d));
    const cur = Classes.normDays(en.days, c) || cd;
    const def = en.from > today ? en.from : today;
    return new Promise(res => {
      Modal.open({
        title: '수강 요일 — ' + c.name, size: 'sm',
        body: `<div class="form"><label>수강 요일</label><div class="day-picks">${cd.map(d => `<label><input type="checkbox" name="pd" value="${d}" ${cur.includes(d) ? 'checked' : ''}>${DOW[d]}</label>`).join('')}</div>
          <label>적용일</label><input type="date" name="pdate" value="${def}"></div>
          <p class="small muted">끈 요일은 적용일부터 시간표·출석부·수업일지에서 빠집니다. 적용일 전 기록은 그대로 남습니다.</p>`,
        buttons: [{ text: '취소', onClick() { res(null); } }, { text: '저장', cls: 'primary', primary: true, onClick(mm) {
          const days = $$('[name=pd]:checked', mm.body).map(i => +i.value);
          const date = $('[name=pdate]', mm.body).value;
          if (!days.length) { toast('최소 하루는 수강해야 합니다. 그만두려면 “반에서 빼기”를 쓰세요'); return false; }
          if (!isYmd(date)) { toast('적용일을 선택하세요'); return false; }
          if (date < en.from) { toast('적용일은 수강 시작일(' + fmtDate(en.from, false) + ') 이후여야 합니다'); return false; }
          if (en.to && date >= en.to) { toast('적용일이 이 반에서 빠지는 날(' + fmtDate(en.to, false) + ')보다 앞이어야 합니다'); return false; }
          res({ date, days: days.length === cd.length ? null : days });
        } }],
        onClose() { res(null); },
      });
    });
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
    if (s.sched && isYmd(s.sched.date)) acts = `<span class="badge orange">${fmtDate(s.sched.date)} ${LOG_LABEL[s.sched.act] || ''} 예정</span><button class="btn" data-act="cancelsched">예약 취소</button>`;
    else if (s.status === 'active') acts = '<button class="btn" data-act="pause">휴원 처리</button><button class="btn danger" data-act="leave">퇴원 처리</button><button class="btn" data-act="graduate">졸업 처리</button>';
    else if (s.status === 'pause') acts = '<button class="btn primary" data-act="resume">복귀 처리</button><button class="btn danger" data-act="leave">퇴원 처리</button><button class="btn" data-act="graduate">졸업 처리</button>';
    else acts = '<button class="btn primary" data-act="rejoin">재등록</button>';
    let h = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <span>현재 상태</span> ${this.statusBadge(s)} <span class="small soft">${fmtDate(s.statusDate)}</span><span class="grow" style="flex:1"></span>${acts}</div>`;
    if (s.sched && s.sched.reason) h += `<div class="panel" style="margin-bottom:12px"><div class="small soft">예약 사유</div><div class="pre">${esc(s.sched.reason)}</div></div>`;
    if (s.status !== 'active' && s.statusReason) h += `<div class="panel" style="margin-bottom:12px"><div class="small soft">사유</div><div class="pre">${esc(s.statusReason)}</div></div>`;
    h += '<h2 style="font-size:14px;margin:0 0 6px">이력</h2>';
    h += logs.length ? '<div class="list">' + logs.map(l => `<div class="list-item"><span class="when">${fmtDate(l.date, false)}</span>
      <div class="what"><b>${LOG_LABEL[l.type] || l.type}</b> ${l.note ? `<span class="small soft">${esc(l.note)}</span>` : ''}${l.reason ? `<div class="pre small soft">${esc(l.reason)}</div>` : ''}</div>
      <button class="icon-btn" data-dellog="${l.id}" title="이력 삭제">✕</button></div>`).join('') + '</div>' : '<div class="empty">이력이 없습니다.</div>';
    pane.innerHTML = h;
    pane.onclick = async (e) => {
      const a = e.target.closest('[data-act]');
      if (a && a.dataset.act === 'cancelsched') {
        const cur = Store.get('students', s.id);
        if (!cur.sched || !await confirmDlg(`${fmtDate(cur.sched.date)} ${LOG_LABEL[cur.sched.act] || ''} 예약을 취소할까요?\n예약하면서 바뀐 수강 기록도 원래대로 돌아갑니다.`, '예약 취소', true)) return;
        this.cancelSched(s.id);
        toast('예약을 취소했습니다'); this.renderPane(m, s.id); App.render();
        return;
      }
      if (a) { this.openStatusAction(a.dataset.act, s.id, () => { this.renderPane(m, s.id); App.render(); }); return; }
      const dl = e.target.closest('[data-dellog]');
      if (!dl) return;
      const lg = Store.get('student_log', dl.dataset.dellog);
      if (!lg) return;
      if (this.isRevertible(Store.get('students', s.id), lg)) {
        const how = await this.askLogDelete(lg);
        if (!how) return;
        if (how === 'revert') this.revertStatus(s.id, lg);
        Store.del('student_log', lg.id);
        toast(how === 'revert' ? '이력을 삭제하고 상태를 되돌렸습니다' : '이력을 삭제했습니다');
        this.renderPane(m, s.id); App.render();
        return;
      }
      if (await confirmDlg('이 이력을 삭제할까요?\n(이력만 지워지고 현재 상태는 바뀌지 않습니다)', '삭제', true)) {
        Store.del('student_log', lg.id); this.renderPane(m, s.id); App.render();
      }
    };
  },

  openStatusAction(act, sid, done) {
    const s = Store.get('students', sid);
    const titles = { pause: '휴원 처리', leave: '퇴원 처리', graduate: '졸업 처리', resume: '복귀 처리', rejoin: '재등록' };
    const needCls = act === 'resume' || act === 'rejoin';
    const body = `<div class="form">
      <label class="req">날짜</label><div class="row"><input type="date" name="d" value="${todayStr()}"></div>
      ${needCls ? `<label class="top">수강반</label><div>${this.classPickHtml()}</div>` : `<label class="top">사유</label><textarea name="reason" rows="3" placeholder="선택 입력"></textarea>`}
    </div><p class="small muted">${act === 'pause' ? '휴원일부터 출석부에서 빠지고, 복귀할 때 반을 다시 고릅니다.' : act === 'leave' ? '퇴원일부터 출석부에서 빠집니다. 기록은 모두 보존됩니다.' : act === 'graduate' ? '졸업일부터 출석부에서 빠집니다. 기록은 모두 보존됩니다.' : '선택한 반의 출석부에 날짜부터 들어갑니다.'}</p>`;
    Modal.open({
      title: s.name + ' · ' + titles[act], body,
      onMount: (b) => { enhanceAll(b); if (needCls) this.bindClassPick(b); },
      buttons: [{ text: '취소' }, { text: titles[act], cls: act === 'leave' ? 'danger' : 'primary', primary: true, onClick: async (m) => {
        const d = $('[name=d]', m.body).value;
        if (!isYmd(d)) { toast('날짜를 선택하세요'); return false; }
        const picks = needCls ? this.readClassPicks(m.body) : [];
        if (picks.length && !await Classes.confirmAttConflicts(picks.map(p => ({ sid, cid: p.cid, from: d, days: p.days })))) return false;
        const cur = Store.get('students', sid);
        const future = d > todayStr();          // 미래 날짜면 예약 → 그 날짜가 되면 자동으로 상태가 바뀜
        const before = this.enSnap(sid);
        if (act === 'pause' || act === 'leave' || act === 'graduate') {
          const reason = stripZws($('[name=reason]', m.body).value);
          if (this.statusOut(sid, act, d, reason)) this.contactRemove([cur]);
        } else {
          picks.forEach(p => Classes.enrollDays(sid, p.cid, d, p.days, true));
          if (future) Store.put('students', Object.assign({}, cur, { sched: { act, date: d, reason: '', undo: this.enDiff(before, sid) } }));
          else {
            Store.put('students', Object.assign({}, cur, { status: 'active', leftKind: '', statusDate: d, statusReason: '', sched: null }));
            this.addLog(sid, act, d, '');
            this.contactAdd([cur]);
          }
        }
        toast(future ? fmtDate(d, false) + ' ' + titles[act] + '를 예약했습니다' : titles[act] + '했습니다');
        if (done) done();
      } }],
    });
  },

  // 휴원·퇴원·졸업 처리 (미래 날짜면 예약). 바로 적용됐으면 true
  statusOut(sid, act, d, reason) {
    const cur = Store.get('students', sid);
    const future = d > todayStr();
    const before = this.enSnap(sid);
    Classes.closeEnrollments(sid, d);
    const undo = this.enDiff(before, sid);
    if (future) { Store.put('students', Object.assign({}, cur, { sched: { act, date: d, reason, undo } })); return false; }
    Store.put('students', Object.assign({}, cur, { status: act === 'pause' ? 'pause' : 'left', leftKind: this.leftKindOf(act, cur), statusDate: d, statusReason: reason, sched: null }));
    this.addLog(sid, act, d, reason, { undo });
    return true;
  },
  leftKindOf(act, cur) { return act === 'leave' ? 'leave' : act === 'graduate' ? 'graduate' : (cur.leftKind || ''); },

  /* ---------- 예약(미래 날짜 상태 변경) · 되돌리기 ---------- */
  // 학생의 수강 기록 사진 { id: JSON }
  enSnap(sid) {
    const o = {};
    Store.where('enrollments', e => e.studentId === sid).forEach(e => { o[e.id] = JSON.stringify(e); });
    return o;
  },
  // 사진 이후 바뀐 내용 → 되돌리기 정보 { created:[새로 생긴 id], prev:[바뀌거나 지워진 원래 기록] }
  enDiff(before, sid) {
    const after = this.enSnap(sid);
    return {
      created: Object.keys(after).filter(id => !before[id]),
      prev: Object.keys(before).filter(id => after[id] !== before[id]).map(id => JSON.parse(before[id])),
    };
  },
  mergeUndo(a, b) {
    if (!a) return b;
    if (!b) return a;
    const prevIds = new Set((a.prev || []).map(r => r.id));
    return {
      created: [...new Set([...(a.created || []), ...(b.created || [])])],
      prev: (a.prev || []).concat((b.prev || []).filter(r => !prevIds.has(r.id) && !(a.created || []).includes(r.id))),
    };
  },
  undoApply(u) {
    if (!u) return;
    (u.created || []).forEach(id => Store.del('enrollments', id));
    (u.prev || []).forEach(r => Store.put('enrollments', r));
  },
  cancelSched(sid) {
    const s = Store.get('students', sid);
    if (!s || !s.sched) return;
    this.undoApply(s.sched.undo);
    Store.put('students', Object.assign({}, s, { sched: null }));
  },
  // 날짜가 된 예약을 실제 상태로 바꾼다. 바꾼 학생 수를 돌려준다. (여러 기기에서 동시에 해도 결과가 같도록 이력 id 고정)
  applyDue() {
    const today = todayStr();
    let n = 0;
    const outs = [], ins = [];     // 구글 주소록: 빠지는 학생은 삭제, 돌아오는 학생은 등록
    Store.where('students', s => s.sched && isYmd(s.sched.date) && s.sched.date <= today).forEach(s => {
      const sc = s.sched, d = sc.date;
      const logId = 'LG_sc_' + s.id + '_' + compactDate(d) + '_' + sc.act;
      if (sc.act === 'pause' || sc.act === 'leave' || sc.act === 'graduate') {
        const before = this.enSnap(s.id);
        Classes.closeEnrollments(s.id, d);          // 예약 뒤에 추가된 수강도 정리
        const undo = this.mergeUndo(sc.undo, this.enDiff(before, s.id));
        Store.put('students', Object.assign({}, s, { status: sc.act === 'pause' ? 'pause' : 'left', leftKind: this.leftKindOf(sc.act, s), statusDate: d, statusReason: sc.reason || '', sched: null }));
        this.addLog(s.id, sc.act, d, sc.reason || '', { undo }, logId);
        outs.push(s);
      } else {
        Store.put('students', Object.assign({}, s, { status: 'active', leftKind: '', statusDate: d, statusReason: '', sched: null }));
        this.addLog(s.id, sc.act, d, '', {}, logId);
        ins.push(s);
      }
      n++;
    });
    this.contactRemove(outs);
    this.contactAdd(ins);
    return n;
  },
  // 가장 최근의 휴원·퇴원·졸업 이력이고 지금 상태가 그 이력 때문인지
  isRevertible(s, l) {
    if (!s || !['pause', 'leave', 'graduate'].includes(l.type)) return false;
    if (!((l.type === 'pause' && s.status === 'pause') || (l.type !== 'pause' && s.status === 'left'))) return false;
    if (s.statusDate !== l.date) return false;
    const top = Store.where('student_log', x => x.studentId === s.id && ['join', 'pause', 'resume', 'leave', 'rejoin', 'graduate'].includes(x.type))
      .sort((a, b) => ko(b.date, a.date) || ko(b.createdAt, a.createdAt))[0];
    return !!top && top.id === l.id;
  },
  askLogDelete(l) {
    return new Promise(res => {
      Modal.open({
        title: '이력 삭제', size: 'sm', autofocus: false,
        body: `<p class="confirm-msg">${esc(fmtDate(l.date, false) + ' ' + (LOG_LABEL[l.type] || l.type))} 이력을 삭제합니다.\n현재 상태도 이 처리 전(재원)으로 되돌릴까요?\n되돌리면 이 처리로 빠졌던 수강반도 다시 들어갑니다.</p>`,
        buttons: [
          { text: '취소', onClick() { res(null); } },
          { text: '이력만 삭제', onClick() { res('log'); } },
          { text: '상태도 되돌리기', cls: 'primary', primary: true, onClick() { res('revert'); } },
        ],
        onClose() { res(null); },
      });
    });
  },
  revertStatus(sid, l) {
    const s = Store.get('students', sid);
    if (l.undo) this.undoApply(l.undo);
    else Store.where('enrollments', e => e.studentId === sid && e.to === l.date).forEach(e => Store.put('enrollments', Object.assign({}, e, { to: null })));
    const prev = Store.where('student_log', x => x.studentId === sid && x.id !== l.id && ['join', 'resume', 'rejoin'].includes(x.type) && x.date <= l.date)
      .sort((a, b) => ko(b.date, a.date) || ko(b.createdAt, a.createdAt))[0];
    Store.put('students', Object.assign({}, s, { status: 'active', leftKind: '', statusDate: prev ? prev.date : this.joinDateOf(s), statusReason: '' }));
    this.contactAdd([s]);
  },

  pane_book(pane, s, m) {
    pane.innerHTML = Books.studentHtml(s.id) + '<p class="small muted" style="margin-top:10px">교재 전체 현황은 왼쪽 메뉴의 “교재”에서 봅니다.</p>';
    pane.onclick = (e) => Books.studentClick(e, () => { this.renderPane(m, s.id); App.render(); });
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

  /* ---------- 구글 주소록 자동 정리 ----------
     휴원·퇴원·졸업·완전 삭제 → 주소록에서 삭제 (학생: 이름·번호가 모두 같은 연락처만)
       · 부모 연락처: 같은 부모 번호를 쓰는 형제가 재원 중이면 남기고, 마지막 형제가 빠질 때 그 번호의 '○○ 어머님'을 이름과 상관없이 삭제
     복귀·재등록·상태 되돌리기 → 주소록에 등록 (이미 있으면 건너뜀, 부모 번호는 형제 이름으로 있어도 건너뜀)
     요청은 한 줄로 세워 차례로 보낸다 (GAS 쪽 잠금과 부딪히지 않게). 실패하면 모달로 알림 */
  _ctQ: null,
  ctItems(list) {
    return (list || []).filter(Boolean)
      .map(s => ({ id: s.id, name: String(s.name || '').trim(), phone: String(s.phone || '').trim(), parentPhone: String(s.parentPhone || '').trim(), oldParentPhone: String(s.ctOldParent || '').trim() }))
      .filter(o => o.name && (o.phone || o.parentPhone));
  },
  // 형제 = 부모 번호(숫자만)가 같은 학생
  ctNorm(v) { return this.normGPhone(v); },
  sibsOf(sid, phone) { const p = this.ctNorm(phone); return p ? Store.where('students', s => s.id !== sid && this.ctNorm(s.parentPhone) === p) : []; },
  // 재원생이 쓰는 부모 번호 (휴원·퇴원 제외, 예약만 걸린 학생은 재원) — 주소록에서 지우거나 덮어쓰면 안 되는 번호
  ctKeep(exclude) {
    const ex = new Set(exclude || []);
    return [...new Set(Store.where('students', s => !ex.has(s.id) && (s.status || 'active') === 'active').map(s => this.ctNorm(s.parentPhone)).filter(Boolean))];
  },
  // 부모 번호 변경: 같은 옛 번호를 쓰는 형제도 함께 바꿀지 묻는다 (한 창에서 같은 변경은 한 번만)
  async askSibs(m, sid, oldP, newP) {
    const k = this.ctNorm(oldP) + '>' + this.ctNorm(newP);
    if (m && m.sibAsked === k) return;
    if (m) m.sibAsked = k;
    const sibs = this.sibsOf(sid, oldP);
    if (!sibs.length) return;
    const names = sibs.map(x => x.name + ((x.status || 'active') !== 'active' ? `(${STATUS_LABEL[x.status] || x.status})` : '')).join(', ');
    if (!await confirmDlg(`같은 부모님 번호(${oldP})를 쓰는 형제가 있습니다.\n${names}\n\n이 학생들의 부모님 연락처도 ${newP}(으)로 바꿀까요?`, '함께 바꾸기')) return;
    sibs.forEach(x => Store.put('students', Object.assign({}, x, { parentPhone: newP })));
    toast(`형제 ${sibs.length}명의 부모님 연락처도 바꿨습니다`);
  },
  clearCtOld(items) {
    items.forEach(o => { const t = o.oldParentPhone && Store.get('students', o.id); if (t && t.ctOldParent) { const n = Object.assign({}, t); delete n.ctOldParent; Store.put('students', n); } });
  },
  ctTargets(items) {
    const out = [];
    items.forEach(o => {
      if (o.phone) out.push({ contactName: o.name, phone: o.phone });
      if (o.parentPhone) out.push({ contactName: o.name + ' 어머님', phone: o.parentPhone });
    });
    return out;
  },
  ctRun(task, chip) {
    const h = chip ? Busy.chip(chip) : null;           // 뒤에서 도는 주소록 작업: 화면 구석에 진행 표시
    const p = (this._ctQ || Promise.resolve()).then(task).catch(e => console.error('주소록 처리 오류', e)).finally(() => { if (h) h.close(); });
    this._ctQ = p;
    return p;
  },
  async ctPost(body, ms) {
    if (!CFG.GAS_CONTACT_URL) throw new Error('연락처 저장 주소(GAS_CONTACT_URL)가 설정되지 않았습니다');
    const key = Auth.key();
    if (!key) throw new Error('로그인이 필요합니다');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(CFG.GAS_CONTACT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ key }, body)),
        signal: ctl.signal,
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.reason === 'unauthorized' ? '로그인 키가 유효하지 않습니다. 다시 로그인하세요'
        : d.reason === 'busy' ? '다른 주소록 작업이 진행 중이었습니다'
        : (d.message || d.reason || '알 수 없는 오류'));
      return d;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('응답 시간 초과');
      if (e instanceof TypeError) throw new Error('네트워크 오류');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },
  contactRemove(list) {
    const items = this.ctItems(list);
    if (!items.length) return;
    // 학생 연락처는 이름·번호로, 부모 연락처는 번호로 지운다 (재원 중인 형제가 쓰는 번호는 남김)
    const keep = new Set(this.ctKeep(items.map(o => o.id)));
    const pm = new Map();
    let kept = 0;
    items.forEach(o => [o.parentPhone, o.oldParentPhone].forEach((p, i) => {
      const n = this.ctNorm(p);
      if (!n || pm.has(n)) return;
      if (keep.has(n)) { if (i === 0) kept++; return; }
      pm.set(n, p);
    }));
    const stItems = items.filter(o => o.phone).map(o => ({ name: o.name, phone: o.phone }));
    const parents = [...pm.values()].map(p => ({ phone: p }));
    const keptMsg = kept ? ` · 형제가 재원 중이라 어머님 연락처 ${kept}건 유지` : '';
    if (!stItems.length && !parents.length) { if (kept) toast('형제가 재원 중이라 어머님 연락처는 남겨 두었습니다'); return; }
    const rows = stItems.map(o => ({ contactName: o.name, phone: o.phone })).concat(parents.map(p => ({ contactName: '(어머님)', phone: p.phone })));
    this.ctRun(async () => {
      let d;
      try { d = await this.ctPost({ action: 'delete', items: stItems, parents }, 300000); }
      catch (e) { this.ctFailModal('delete', e.message, { errors: rows }); return; }
      const nf = (d.notFound || []).length;
      if ((d.mismatch || []).length || (d.errors || []).length) this.ctFailModal('delete', '', d);
      else toast(`구글 주소록에서 ${(d.deleted || []).length}건 삭제했습니다` + (nf ? ` · 주소록에 없음 ${nf}건` : '') + keptMsg);
    }, '구글 주소록 정리 중…');
  },
  contactAdd(list) {
    const items = this.ctItems(list);
    if (!items.length) return;
    this.ctRun(async () => {
      let d;
      try { d = await this.ctPost({ action: 'saveMany', items, keepParents: this.ctKeep(items.map(o => o.id)) }, 300000); }
      catch (e) { this.ctFailModal('add', e.message, { errors: this.ctTargets(items) }); return; }
      if ((d.errors || []).length) { this.ctFailModal('add', '', d); return; }
      this.clearCtOld(items);
      const parts = [];
      if (d.added) parts.push(`등록 ${d.added}건`);
      if (d.updated) parts.push(`번호 변경 ${d.updated}건`);
      if (d.skipped) parts.push(`변경 없음 ${d.skipped}건`);
      toast('구글 주소록 등록 완료 · ' + (parts.join(' · ') || '처리 0건'));
    }, '구글 주소록 등록 중…');
  },
  /* ---------- 선택 학생 연락처 일괄 저장 (재원 탭) ----------
     이미 있는 연락처는 건너뜀. 이름은 있지만 번호가 다르면 바꾸지 않고 결과 창에 목록으로 보여 준다
     (동명이인·잘못 입력한 번호로 덮어쓰는 것 방지 → 확인 후 학생 창의 '연락처 저장'으로 처리) */
  async bulkContactSave(list) {
    const items = this.ctItems(list);
    const noNum = list.filter(s => !this.ctItems([s]).length).map(s => s.name || '(이름 없음)');
    if (!items.length) { alertDlg('연락처 저장', '선택한 학생 중 저장할 연락처(이름·번호)가 있는 학생이 없습니다.'); return; }
    if (!await confirmDlg(`선택한 ${items.length}명의 연락처를 구글 주소록에 저장할까요?\n이미 있는 연락처는 건너뜁니다.` + (noNum.length ? `\n(번호가 없는 ${noNum.length}명은 제외)` : ''), '저장')) return;
    const bz = Busy.open('구글 주소록에 연락처 저장', { total: items.length, unit: '명', text: '다른 주소록 작업이 끝나기를 기다리는 중…' });
    this.ctRun(async () => {
      const CH = 10;                                   // 10명씩 나눠 보내 진행률을 보여 준다 (끊겨도 앞 묶음은 저장됨)
      const sum = { added: 0, updated: 0, skipped: 0, errors: [], mismatch: [], addedList: [], updatedList: [] };
      try {
        for (let i = 0; i < items.length; i += CH) {
          const part = items.slice(i, i + CH);
          bz.set(i, `${part[0].name}${part.length > 1 ? ` 외 ${part.length - 1}명` : ''} 처리 중…`);
          let d;
          try { d = await this.ctPost({ action: 'saveMany', items: part, keepParents: this.ctKeep(items.map(o => o.id)), noReplace: true }, 300000); }
          catch (e) {                                  // 이 묶음부터 처리하지 못함 → 결과 창의 오류 목록에 남김
            this.ctTargets(items.slice(i)).forEach(x => sum.errors.push(Object.assign({ message: e.message }, x)));
            break;
          }
          ['added', 'updated', 'skipped'].forEach(k => { sum[k] += +d[k] || 0; });
          ['errors', 'mismatch', 'addedList', 'updatedList'].forEach(k => { sum[k] = sum[k].concat(d[k] || []); });
          if (!(d.errors || []).length && !(d.mismatch || []).length) this.clearCtOld(part);
          bz.set(i + part.length);
        }
      } finally { bz.close(); }
      this.ctSaveResultModal(sum, noNum);
    });
  },
  ctSaveResultModal(d, noNum) {
    const row = (x) => `${x.contactName} · ${fmtPhone(x.phone)}`;
    const secs = [];
    const add = (title, rows, note) => { if (rows.length) secs.push({ title, rows, note }); };
    add('이름은 있지만 번호가 달라 건너뜀', (d.mismatch || []).map(x => `${x.contactName} · 앱 번호 ${fmtPhone(x.phone)} / 주소록 번호 ${(x.found || []).join(', ') || '없음'}`), '확인 후 학생 창의 “연락처 저장”으로 처리하거나 주소록에서 직접 고치세요');
    add('오류로 처리하지 못함', (d.errors || []).map(x => row(x) + (x.message ? ' — ' + x.message : '')), '직접 등록하세요');
    add('번호가 없어 제외', noNum || [], '');
    add('새로 등록', (d.addedList || []).map(row), '');
    add('번호 변경 (부모 번호를 바꾼 학생)', (d.updatedList || []).map(row), '');
    const head = `등록 ${d.added || 0}건 · 번호 변경 ${d.updated || 0}건 · 이미 있음(건너뜀) ${d.skipped || 0}건`
      + ((d.mismatch || []).length ? ` · 번호 달라 건너뜀 ${(d.mismatch || []).length}건` : '') + ((d.errors || []).length ? ` · 오류 ${(d.errors || []).length}건` : '');
    const text = ['구글 주소록 저장 결과', head, ...secs.map(sc => `\n[${sc.title}]\n` + sc.rows.join('\n'))].join('\n');
    Modal.open({
      title: '구글 주소록 저장 결과', size: 'md', autofocus: false,
      body: `<p class="confirm-msg">${esc(head)}</p>` + secs.map(sc => `<div style="margin-top:12px"><div class="small soft"><b>${esc(sc.title)}</b> (${sc.rows.length})${sc.note ? ' — ' + esc(sc.note) : ''}</div><div class="pre small" style="user-select:text">${esc(sc.rows.join('\n'))}</div></div>`).join(''),
      buttons: [
        { text: '목록 복사', onClick: () => {
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('복사했습니다'), () => toast('복사하지 못했습니다'));
          else toast('복사하지 못했습니다');
          return false;
        } },
        { text: '닫기', cls: 'primary', primary: true },
      ],
    });
  },
  // 실패 목록 모달 (메모해서 직접 처리할 수 있게 이름·번호를 모두 보여 주고 복사 버튼을 둔다)
  ctFailModal(kind, reason, d) {
    const isDel = kind === 'delete';
    const secs = [];
    const add = (title, rows) => { if (rows.length) secs.push({ title, rows }); };
    add('오류로 처리하지 못함', (d.errors || []).map(x => `${x.contactName} · ${x.phone}${x.message ? ' — ' + x.message : ''}`));
    if (isDel) {
      add('이름은 있지만 번호가 달라 지우지 않음', (d.mismatch || []).map(x => `${x.contactName} · 앱 번호 ${x.phone} / 주소록 번호 ${(x.found || []).join(', ') || '없음'}`));
      add('주소록에 없음 (참고)', (d.notFound || []).map(x => `${x.contactName} · ${x.phone}`));
      add('삭제됨', (d.deleted || []).map(x => `${x.contactName} · ${x.phone}`));
    } else {
      if (d.added || d.updated || d.skipped) secs.push({ title: '처리됨', rows: [`등록 ${d.added || 0}건 · 번호 변경 ${d.updated || 0}건 · 변경 없음 ${d.skipped || 0}건`] });
    }
    const title = isDel ? '구글 주소록 삭제 실패' : '구글 주소록 등록 실패';
    const head = (reason ? `요청이 실패했습니다: ${reason}\n` : '') + (isDel ? '아래 연락처는 구글 주소록에서 직접 삭제하세요.' : '아래 연락처는 구글 주소록에 직접 등록하세요.');
    const text = [title, head, ...secs.map(sc => `\n[${sc.title}]\n` + sc.rows.join('\n'))].join('\n');
    Modal.open({
      title, size: 'md', autofocus: false,
      body: `<p class="confirm-msg">${esc(head)}</p>` + secs.map(sc => `<div style="margin-top:12px"><div class="small soft"><b>${esc(sc.title)}</b> (${sc.rows.length})</div><div class="pre small">${esc(sc.rows.join('\n'))}</div></div>`).join(''),
      buttons: [
        { text: '목록 복사', onClick: () => {
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('복사했습니다'), () => toast('복사하지 못했습니다'));
          else toast('복사하지 못했습니다');
          return false;
        } },
        { text: '확인', cls: 'primary', primary: true },
      ],
    });
  },

  hardDelete(sid) {
    Store.delWhere('enrollments', e => e.studentId === sid);
    Store.delWhere('student_log', e => e.studentId === sid);
    Store.delWhere('scores', e => e.studentId === sid);
    Store.delWhere('mock_scores', e => e.studentId === sid);
    Store.delWhere('counsels', e => e.studentId === sid);
    Store.delWhere('makeups', e => e.studentId === sid);
    Store.delWhere('meta', e => e.kind === 'sbook' && e.studentId === sid);   // 학생 교재 기록
    Store.where('lessons', l => l.att && l.att[sid]).forEach(l => {
      const att = Object.assign({}, l.att); delete att[sid];
      Store.put('lessons', Object.assign({}, l, { att }));
    });
    Store.del('students', sid);
  },
};
