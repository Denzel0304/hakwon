/* =========================================================
   classes.js — 반 관리 + 주간 시간표
   class: { name, nameEdited, days:[0~6], start:'HH:MM', duration(분), memo, active }
   enrollment: { studentId, classId, from, to }   ← from <= 날짜 < to 이면 수강 중
   ========================================================= */
const Classes = {
  showEnded: false,

  /* ---------- 공용 ---------- */
  enrollValid(e, date) { return e.from <= date && (!e.to || date < e.to); },
  rosterAt(classId, date) {
    const seen = {};
    return Store.where('enrollments', e => e.classId === classId && this.enrollValid(e, date))
      .map(e => Store.get('students', e.studentId)).filter(s => s && !seen[s.id] && (seen[s.id] = 1))
      .sort((a, b) => Students.sortFn(a, b));
  },
  enroll(studentId, classId, from) {
    const dup = Store.where('enrollments', e => e.studentId === studentId && e.classId === classId && (!e.to || e.to > from));
    if (dup.length) return;
    Store.put('enrollments', { id: uid('EN'), studentId, classId, from, to: null });
  },
  closeEnrollments(studentId, date) {
    Store.where('enrollments', e => e.studentId === studentId && (!e.to || e.to > date)).forEach(e => {
      if (e.from >= date) Store.del('enrollments', e.id);
      else Store.put('enrollments', Object.assign({}, e, { to: date }));
    });
  },
  endTime(c) { return fromMin(toMin(c.start) + (+c.duration || 90)); },
  timeLabel(c) { return daysLabel(c.days) + ' ' + c.start + '~' + this.endTime(c); },
  autoName(days, start) { return start ? daysLabel(days) + ' ' + nameTime(start) : daysLabel(days); },
  sorted(list) { return list.sort((a, b) => ko(a.start, b.start) || ko(daysLabel(a.days), daysLabel(b.days)) || ko(a.name, b.name)); },

  /* ---------- 반 관리 화면 ---------- */
  render(main) {
    const all = this.sorted(Store.all('classes'));
    const today = todayStr();
    const act = all.filter(c => c.active !== false), ended = all.filter(c => c.active === false);
    const row = (c) => {
      const r = this.rosterAt(c.id, today);
      return `<tr class="click" data-id="${c.id}"><td class="nowrap"><b>${esc(c.name)}</b>${c.active === false ? ' <span class="badge gray">종료</span>' : ''}</td>
        <td class="nowrap">${esc(this.timeLabel(c))} <span class="muted small">(${+c.duration || 90}분)</span></td>
        <td class="num">${r.length}</td><td class="small">${r.map(s => esc(s.name) + `<span class="tag">${esc(stTag(s))}</span>`).join(', ') || '<span class="muted">-</span>'}</td>
        <td class="small soft">${esc(firstLine(c.memo))}</td></tr>`;
    };
    let h = `<div class="page-narrow"><div class="page-head"><h1>반 관리</h1><button class="btn primary" data-a="add">+ 반 만들기</button>
      <span class="sub">진행 중 ${act.length}개</span><span class="grow"></span>
      <label class="chk small"><input type="checkbox" data-ended ${this.showEnded ? 'checked' : ''}>종료된 반 보기 (${ended.length})</label></div>`;
    const show = this.showEnded ? [...act, ...ended] : act;
    h += show.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>반 이름</th><th>요일·시간</th><th class="num">인원</th><th>학생</th><th>메모</th></tr></thead><tbody>${show.map(row).join('')}</tbody></table></div>`
      : '<div class="panel"><div class="empty">만들어진 반이 없습니다. 위의 “반 만들기”로 시작하세요.</div></div>';
    h += '</div>';
    main.innerHTML = h;
    main.onclick = (e) => {
      if (e.target.closest('[data-a=add]')) { this.openModal(null); return; }
      const tr = e.target.closest('tr[data-id]'); if (tr) this.openModal(tr.dataset.id);
    };
    main.onchange = (e) => { if (e.target.matches('[data-ended]')) { this.showEnded = e.target.checked; App.render(); } };
  },

  /* ---------- 반 만들기 / 수정 ---------- */
  openModal(id) {
    const c = id ? Store.get('classes', id) : null;
    const v = c || { name: '', days: [], start: '20:00', duration: 90, memo: '', active: true };
    const today = todayStr();
    const enrolled = c ? this.rosterAt(c.id, today).map(s => s.id) : [];
    let nameEdited = c ? !!c.nameEdited : false;
    const students = Store.where('students', s => s.status === 'active').sort((a, b) => Students.sortFn(a, b));
    const body = `<div class="form">
      <label class="req">요일</label><div class="day-picks">${DAY_ORDER.map(d => `<label><input type="checkbox" name="day" value="${d}" ${(v.days || []).includes(d) ? 'checked' : ''}>${DOW[d]}</label>`).join('')}</div>
      <label class="req">시작 시간</label><div class="row"><input type="time" name="start" step="300" value="${esc(v.start)}">
        <span>수업 길이</span><input type="number" name="duration" min="10" max="600" step="5" value="${+v.duration || 90}"><span>분</span>
        <span class="soft" data-end></span></div>
      <label class="req">반 이름</label><div class="row"><input type="text" name="name" value="${esc(v.name)}" style="flex:1" maxlength="40"><button class="btn sm" type="button" data-autoname>자동 이름</button></div>
      <label class="top">메모</label><textarea name="memo" rows="3">${esc(v.memo)}</textarea>
      <label>진행 상태</label><label class="chk"><input type="checkbox" name="ended" ${v.active === false ? 'checked' : ''}>종료된 반 (시간표·수업일지에서 숨김)</label>
      <label class="top">학생</label><div>
        <div class="row" style="margin-bottom:6px"><input type="search" data-filter placeholder="학생 검색" style="flex:1"><span class="small soft">변경 적용일</span><input type="date" name="apply" value="${today}"></div>
        <div class="pick-list">${students.length ? students.map(s => `<label data-nm="${esc((s.name + ' ' + stTag(s)).toLowerCase())}"><input type="checkbox" name="st" value="${s.id}" ${enrolled.includes(s.id) ? 'checked' : ''}>${esc(s.name)}<span class="tag">${esc(stTag(s))}</span></label>`).join('') : '<div class="muted small" style="padding:6px">재원 중인 학생이 없습니다.</div>'}</div>
        <div class="hint" style="margin-top:4px">체크한 학생은 적용일부터 출석부에 들어가고, 체크를 푼 학생은 적용일부터 빠집니다.</div></div>
    </div>`;
    Modal.open({
      title: c ? '반 수정' : '반 만들기', size: 'lg', body,
      onMount: (b) => {
        enhanceAll(b);
        const nameIn = $('[name=name]', b);
        const readDays = () => $$('[name=day]:checked', b).map(i => +i.value);
        const upd = () => {
          const st = $('[name=start]', b).value, du = +$('[name=duration]', b).value || 90;
          $('[data-end]', b).textContent = st ? '→ ' + fromMin(toMin(st) + du) + ' 종료' : '';
          if (!nameEdited) nameIn.value = this.autoName(readDays(), st);
        };
        if (!c) upd(); else { const st = v.start; $('[data-end]', b).textContent = st ? '→ ' + this.endTime(v) + ' 종료' : ''; }
        b.addEventListener('change', (e) => { if (e.target.matches('[name=day],[name=start],[name=duration]')) upd(); });
        b.addEventListener('input', (e) => {
          if (e.target === nameIn) nameEdited = nameIn.value.trim() !== '' && nameIn.value.trim() !== this.autoName(readDays(), $('[name=start]', b).value);
          if (e.target.matches('[name=start],[name=duration]')) upd();
          if (e.target.matches('[data-filter]')) {
            const q = e.target.value.trim().toLowerCase();
            $$('.pick-list label', b).forEach(l => { l.style.display = !q || l.dataset.nm.includes(q) ? '' : 'none'; });
          }
        });
        $('[data-autoname]', b).onclick = () => { nameEdited = false; upd(); };
      },
      buttons: [
        ...(c ? [{ text: '완전 삭제', cls: 'danger', left: true, onClick: async () => {
          const ok = await confirmHard(`“${c.name}” 반을 완전히 삭제할까요?\n이 반의 수강 기록, 수업일지(출석·진도·할일), 보강 기록이 모두 삭제됩니다.\n(수업이 끝난 반은 삭제 대신 “종료된 반”으로 표시하세요)`);
          if (!ok) return false;
          this.hardDelete(c.id); toast('반을 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body;
          const days = $$('[name=day]:checked', b).map(i => +i.value);
          const start = $('[name=start]', b).value;
          const duration = Math.max(10, Math.min(600, +$('[name=duration]', b).value || 90));
          const name = $('[name=name]', b).value.trim() || this.autoName(days, start);
          const apply = $('[name=apply]', b).value;
          if (!days.length) { toast('요일을 하나 이상 고르세요'); return false; }
          if (!start) { toast('시작 시간을 입력하세요'); return false; }
          if (!isYmd(apply)) { toast('변경 적용일을 선택하세요'); return false; }
          const rec = Object.assign({}, c || { id: uid('CL'), createdAt: new Date().toISOString() }, {
            name, nameEdited: name !== this.autoName(days, start), days, start, duration,
            memo: stripZws($('[name=memo]', b).value), active: !$('[name=ended]', b).checked,
          });
          Store.put('classes', rec);
          const checked = $$('[name=st]:checked', b).map(i => i.value);
          const nowIn = this.rosterAt(rec.id, apply).map(s => s.id);
          checked.filter(sid => !nowIn.includes(sid)).forEach(sid => this.enroll(sid, rec.id, apply));
          enrolled.filter(sid => !checked.includes(sid)).forEach(sid => {
            Store.where('enrollments', e => e.studentId === sid && e.classId === rec.id && (!e.to || e.to > apply)).forEach(e => {
              if (e.from >= apply) Store.del('enrollments', e.id);
              else Store.put('enrollments', Object.assign({}, e, { to: apply }));
            });
          });
          toast('반을 저장했습니다');
          App.render();
        } },
      ],
    });
  },

  hardDelete(cid) {
    Store.delWhere('enrollments', e => e.classId === cid);
    Store.delWhere('todos', t => t.classId === cid);
    Store.delWhere('makeups', t => t.classId === cid);
    Store.delWhere('lessons', t => t.classId === cid);
    Store.del('classes', cid);
  },
};

/* =========================================================
   시간표 — 요일별 고정 시간표 (날짜 없음, 15시~24시)
   ========================================================= */
const Timetable = {
  START: 15 * 60,
  END: 24 * 60,
  userH: 0,                      // 끌어서 바꾼 높이 (시간표를 떠나면 초기화)
  onLeave() { this.userH = 0; },

  render(main) {
    const today = todayStr();
    const classes = Store.all('classes').filter(c => c.active !== false);
    const cols = DAY_ORDER.map(dow => {
      const items = classes.filter(c => (c.days || []).includes(dow)).map(c => {
        const s = toMin(c.start), e = s + (+c.duration || 90);
        return { c, s, e, roster: Classes.rosterAt(c.id, today) };
      });
      return { dow, items: this.layout(items) };
    });
    const span = this.END - this.START;
    let h = `<div class="page-head"><h1>시간표</h1><span class="sub">블록을 누르면 반 정보를 수정합니다</span></div>
      <div class="tt2"><div class="tt2-head"><div></div>${DAY_ORDER.map(d => `<div class="tt2-wd ${d === 0 ? 'sun' : d === 6 ? 'sat' : ''}">${DOW[d]}</div>`).join('')}</div>
      <div class="tt2-body"><div class="tt2-time">`;
    for (let t = this.START; t < this.END; t += 60) {
      const hr = t / 60;
      h += `<span style="top:calc(var(--ppm) * ${t - this.START})">${hr > 12 ? hr - 12 : hr}시</span>`;
    }
    h += '</div>';
    cols.forEach(col => {
      h += `<div class="tt2-col">`;
      col.items.forEach(it => {
        const s = Math.max(it.s, this.START), e = Math.min(it.e, this.END);
        if (e <= s) return;
        const w = 100 / it.cols;
        const c = it.c;
        h += `<div class="tt-blk" data-cls="${c.id}" title="${esc(c.name)} — 눌러서 반 수정"
          style="top:calc(var(--ppm) * ${s - this.START} + 1px);height:calc(var(--ppm) * ${e - s} - 3px);left:calc(${it.col * w}% + 3px);width:calc(${w}% - 6px)">
          <div class="nm"><b>${esc(c.name)}</b></div>
          <div class="tm">${esc(c.start)}~${esc(Classes.endTime(c))} · ${it.roster.length}명</div>
          <div class="sts">${it.roster.map(s2 => `<span class="st" title="${esc(s2.name + ' ' + stTag(s2))}">${esc(s2.name)}<small>${esc(stTag(s2))}</small></span>`).join('')}</div></div>`;
      });
      h += '</div>';
    });
    h += `</div></div><div class="bc2-resize tt2-resize" title="끌어서 시간표 높이 조절"><span></span></div>`;
    main.innerHTML = h;

    // 높이: 처음에는 아래 끝이 왼쪽 아래 '동기화됨' 칸 윗선에 오도록 맞춤
    const box = $('.tt2', main), body = $('.tt2-body', main), grip = $('.tt2-resize', main);
    const sb = $('#sync-bar');
    const bottom = Math.min(sb.getBoundingClientRect().top, window.innerHeight - sb.offsetHeight);
    const bodyTop = body.getBoundingClientRect().top + main.scrollTop;
    const minH = span * 0.8;
    const fit = bottom - bodyTop - grip.offsetHeight - 3;
    const apply = (H) => { box.style.setProperty('--ppm', (Math.max(minH, H) / span) + 'px'); this.fitStudents(main); };
    apply(this.userH || fit);

    grip.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const y0 = e.clientY, h0 = body.getBoundingClientRect().height;
      let nh = h0;
      document.body.classList.add('resizing');
      const mv = (ev) => {
        nh = Math.max(minH, h0 + ev.clientY - y0);
        box.style.setProperty('--ppm', (nh / span) + 'px');
        if (ev.clientY > window.innerHeight - 30) main.scrollTop += 20;
      };
      const up = () => {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        document.body.classList.remove('resizing');
        this.userH = Math.round(nh);
        this.fitStudents(main);
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    grip.addEventListener('dblclick', () => { this.userH = 0; App.render(); });

    main.onclick = (e) => {
      const b = e.target.closest('[data-cls]');
      if (b) Classes.openModal(b.dataset.cls);
    };
    main.onchange = null;
  },

  // 학생 명단이 세로로 다 들어가지 않으면 가로로 나열하며 내려간다
  fitStudents(main) {
    // 1단계: 가로로 나열(학교는 마우스를 올리면 표시) → 2단계: 그래도 넘치면 글씨를 줄임
    $$('.tt-blk', main).forEach(b => {
      b.classList.remove('wrap', 'tiny');
      if (b.scrollHeight > b.clientHeight + 1) b.classList.add('wrap');
      if (b.scrollHeight > b.clientHeight + 1) b.classList.add('tiny');
    });
  },

  // 겹치는 블록을 옆으로 나눠 배치
  layout(items) {
    items.sort((a, b) => a.s - b.s || b.e - a.e);
    let group = [], groupEnd = -1;
    const flush = () => {
      const colsEnd = [];
      group.forEach(it => {
        let ci = colsEnd.findIndex(end => end <= it.s);
        if (ci < 0) { ci = colsEnd.length; colsEnd.push(0); }
        colsEnd[ci] = it.e; it.col = ci;
      });
      group.forEach(it => { it.cols = colsEnd.length; });
      group = [];
    };
    items.forEach(it => {
      if (group.length && it.s >= groupEnd) { flush(); groupEnd = -1; }
      group.push(it); groupEnd = Math.max(groupEnd, it.e);
    });
    if (group.length) flush();
    return items;
  },
};
