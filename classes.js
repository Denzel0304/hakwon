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
   주간 시간표
   ========================================================= */
const Timetable = {
  render(main, p) {
    const mon = p.week ? parseYmd(p.week) : mondayOf(parseYmd(App.selDate));
    const monStr = ymd(mon);
    const dates = DAY_ORDER.map((_, i) => ymd(addDays(mon, i)));   // 월~일
    const today = todayStr();
    const classes = Store.all('classes').filter(c => c.active !== false);
    const events = Store.where('events', ev => isYmd(ev.date) && ev.start && ev.date <= dates[6] && evEnd(ev) >= dates[0]);
    const idx = CalIndex.build();

    // 날짜별 블록
    const cols = dates.map(d => {
      const dow = dowOf(d);
      // 이번 주의 지난 요일은 오늘 기준 명단(현재 반 구성)으로 보여준다
      const rosterDate = d < today && d >= ymd(mondayOf(new Date())) ? today : d;
      const items = [];
      classes.filter(c => (c.days || []).includes(dow)).forEach(c => {
        const s = toMin(c.start), e = s + (+c.duration || 90);
        items.push({ kind: 'class', c, s, e, roster: Classes.rosterAt(c.id, rosterDate) });
      });
      events.filter(ev => ev.date <= d && evEnd(ev) >= d).forEach(ev => {
        const s = toMin(ev.start), e = ev.end ? Math.max(toMin(ev.end), s + 30) : s + 60;
        items.push({ kind: 'event', ev, s, e });
      });
      return { date: d, items: this.layout(items) };
    });

    // 시간 범위
    let minS = 15 * 60, maxE = 22 * 60;
    cols.forEach(c => c.items.forEach(it => { minS = Math.min(minS, it.s); maxE = Math.max(maxE, it.e); }));
    minS = Math.floor(minS / 60) * 60; maxE = Math.min(24 * 60, Math.ceil(maxE / 60) * 60);
    // 학생 명단이 다 보이도록 분당 높이를 정한다
    let ppm = 1.6;
    cols.forEach(c => c.items.forEach(it => {
      if (it.kind !== 'class') return;
      const need = 40 + it.roster.length * 16.5;
      ppm = Math.max(ppm, need / (it.e - it.s) / (it.cols > 1 ? 0.8 : 1));
    }));
    ppm = Math.min(ppm, 6);
    const H = (maxE - minS) * ppm;

    const last = addDays(mon, 6);
    let h = `<div class="page-head"><h1>시간표</h1>
      <span class="sub">${mon.getFullYear()}.${pad(mon.getMonth() + 1)}.${pad(mon.getDate())} ~ ${pad(last.getMonth() + 1)}.${pad(last.getDate())}</span>
      <button class="btn sm" data-a="prev">‹ 이전 주</button><button class="btn sm" data-a="this">이번 주</button><button class="btn sm" data-a="next">다음 주 ›</button>
      <span class="grow"></span><span class="small muted">빈 칸을 누르면 그 시간에 일정을 추가합니다</span>
      <button class="btn primary" data-a="add">+ 일정 추가</button></div>
      <div class="tt-wrap"><div class="tt">
      <div class="tt-head"></div>`;
    dates.forEach(d => {
      const o = idx[d];
      const exams = o ? o.exam.map(ex => `<span class="ex">${esc(eventShort(ex))}</span>`).join('') : '';
      h += `<div class="tt-head ${d === today ? 'today' : ''} ${dowOf(d) === 0 ? 'sun' : ''}"><span class="d">${DOW[dowOf(d)]} ${fmtMD(d).replace(/\(.+\)/, '')}</span>${exams}</div>`;
    });
    const hourLines = `background-image: repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${60 * ppm}px); background-size: 100% ${60 * ppm}px;`;
    h += `<div class="tt-time" style="height:${H}px">`;
    for (let t = minS; t < maxE; t += 60) h += `<span style="top:${(t - minS) * ppm + 8}px">${t / 60}시</span>`;
    h += '</div>';
    cols.forEach(col => {
      h += `<div class="tt-col ${col.date === today ? 'today' : ''}" data-col="${col.date}" style="height:${H}px;${hourLines}">`;
      col.items.forEach(it => {
        const top = (it.s - minS) * ppm, ht = Math.max((it.e - it.s) * ppm - 2, 22);
        const w = 100 / it.cols, left = it.col * w;
        const pos = `top:${top}px;height:${ht}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px)`;
        if (it.kind === 'class') {
          const c = it.c;
          h += `<div class="tt-blk" style="${pos}" data-lesson="${c.id}" data-date="${col.date}" title="${esc(c.name)} — 눌러서 수업일지 열기">
            <div class="nm"><b>${esc(c.name)}</b><button class="edit" data-editcls="${c.id}" title="반 수정">✎</button></div>
            <div class="tm">${esc(c.start)}~${esc(Classes.endTime(c))} · ${it.roster.length}명</div>
            ${it.roster.map(s => `<span class="st">${esc(s.name)}<small>${esc(stTag(s))}</small></span>`).join('')}</div>`;
        } else {
          const ev = it.ev;
          h += `<div class="tt-blk ev ${esc(ev.type)}" style="${pos}" data-ev="${ev.id}">
            <div class="nm"><b>${esc(eventShort(ev))}</b></div><div class="tm">${esc(eventTime(ev))}</div>
            ${ev.memo ? `<div class="small soft pre">${esc(ev.memo)}</div>` : ''}</div>`;
        }
      });
      h += '</div>';
    });
    h += '</div></div>';
    main.innerHTML = h;

    main.onclick = (e) => {
      const a = e.target.closest('[data-a]');
      if (a) {
        if (a.dataset.a === 'add') { EventModal.open(null, { date: App.selDate >= dates[0] && App.selDate <= dates[6] ? App.selDate : dates[0] }); return; }
        const nm = a.dataset.a === 'this' ? mondayOf(new Date()) : addDays(mon, a.dataset.a === 'prev' ? -7 : 7);
        App.go('timetable', { week: ymd(nm) });
        return;
      }
      const ed = e.target.closest('[data-editcls]'); if (ed) { e.stopPropagation(); Classes.openModal(ed.dataset.editcls); return; }
      const ev = e.target.closest('[data-ev]'); if (ev) { EventModal.open(ev.dataset.ev); return; }
      const ls = e.target.closest('[data-lesson]');
      if (ls) { Lessons.open(ls.dataset.date, ls.dataset.lesson); return; }
      const col = e.target.closest('[data-col]');
      if (col) {
        const r = col.getBoundingClientRect();
        const min = minS + Math.round(((e.clientY - r.top) / ppm) / 30) * 30;
        const d = col.dataset.col;
        const dur = dowOf(d) % 6 === 0 ? 180 : 90;
        EventModal.open(null, { date: d, start: fromMin(min), end: fromMin(Math.min(min + dur, 24 * 60 - 1)), type: dowOf(d) % 6 === 0 ? 'weekend' : 'pre' });
      }
    };
    main.onchange = null;
    void monStr;
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
