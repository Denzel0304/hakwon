/* =========================================================
   classes.js — 반 관리 + 주간 시간표
   class: { name, nameEdited, days:[0~6], start:'HH:MM', duration(분), memo, active }
   enrollment: { studentId, classId, from, to, days? }   ← from <= 날짜 < to 이면 수강 중
               days: 반의 일부 요일만 수강할 때 그 요일 [1] 등 (없으면 반의 모든 요일)
   ========================================================= */
const Classes = {
  showEnded: false,

  /* ---------- 반 색 ---------- */
  // 서로 확연히 구분되는 16색 (색상·밝기를 함께 벌려 고름). 진행 중인 반끼리는 같은 색을 쓸 수 없다.
  PALETTE: [
    { c: '#1F6FD1', n: '파랑' }, { c: '#D93025', n: '빨강' }, { c: '#1E9E45', n: '초록' }, { c: '#8A3FD1', n: '보라' },
    { c: '#F28C00', n: '주황' }, { c: '#00A6A6', n: '청록' }, { c: '#E0458F', n: '분홍' }, { c: '#8B5A2B', n: '갈색' },
    { c: '#7CB300', n: '연두' }, { c: '#22336B', n: '남색' }, { c: '#D4AC0D', n: '겨자' }, { c: '#6B7280', n: '회색' },
    { c: '#8E1B4A', n: '와인' }, { c: '#4FB3F0', n: '하늘' }, { c: '#5F6B1E', n: '올리브' }, { c: '#F08F6E', n: '살구' },
  ],
  NO_COLOR: '#A8B3BF',
  colorOf(c) { return (c && c.color) || this.NO_COLOR; },
  dot(c) { return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${this.colorOf(c)};margin-right:6px;vertical-align:middle;flex:none"></span>`; },
  // 다른 진행 중인 반이 쓰는 색 { 색: 반 }
  usedColors(exceptId) {
    const o = {};
    Store.all('classes').forEach(c => { if (c.id !== exceptId && c.active !== false && c.color) o[c.color] = c; });
    return o;
  },
  freeColor(exceptId) { const u = this.usedColors(exceptId); const f = this.PALETTE.find(p => !u[p.c]); return f ? f.c : ''; },
  // 색이 없거나 다른 진행 중인 반과 겹치는 반에 남는 색을 준다 (만든 순서대로). 바꾼 개수를 돌려준다.
  assignColors() {
    let n = 0;
    const list = Store.all('classes').filter(c => c.active !== false).sort((a, b) => ko(a.createdAt, b.createdAt) || ko(a.id, b.id));
    const taken = {};
    list.forEach(c => { if (c.color && !taken[c.color] && this.PALETTE.some(p => p.c === c.color)) taken[c.color] = c.id; });
    list.forEach(c => {
      if (c.color && taken[c.color] === c.id) return;
      const f = this.PALETTE.find(p => !taken[p.c]);
      if (!f) return;
      taken[f.c] = c.id;
      Store.put('classes', Object.assign({}, c, { color: f.c }));
      n++;
    });
    return n;
  },

  /* ---------- 공용 ---------- */
  enrollValid(e, date) { return e.from <= date && (!e.to || date < e.to); },

  /* ---------- 일부 요일 수강 ---------- */
  // 수강 요일 정리: 반 요일 안에서만, 반의 모든 요일이면(또는 남는 요일이 없으면) null = 전체 수강
  normDays(days, c) {
    if (!days || !days.length || !c) return null;
    const cd = c.days || [];
    const d = DAY_ORDER.filter(x => days.includes(x) && cd.includes(x));
    return d.length && d.length < cd.length ? d : null;
  },
  sameDays(a, b) { return String(a || '') === String(b || ''); },
  // 이 학생이 date에 이 반을 일부 요일만 수강하면 그 요일, 아니면 null
  partDays(classId, studentId, date) {
    const c = Store.get('classes', classId);
    const e = Store.where('enrollments', x => x.studentId === studentId && x.classId === classId && this.enrollValid(x, date))[0];
    return e && c ? this.normDays(e.days, c) : null;
  },
  // 반 이름 뒤에 붙이는 요일 표시: "(월)" (전체 수강이면 빈 문자열)
  daysTag(classId, studentId, date) { const d = this.partDays(classId, studentId, date); return d ? '(' + daysLabel(d) + ')' : ''; },
  // 그 날짜 수업에 오는지: 기간 + 요일 (반의 정규 요일이 아닌 날(보강 등)은 기간만 본다)
  attendsOn(e, date, c) {
    if (!this.enrollValid(e, date)) return false;
    c = c || Store.get('classes', e.classId);
    const dw = dowOf(date);
    if (!c || !(c.days || []).includes(dw)) return true;
    const d = this.normDays(e.days, c);
    return !d || d.includes(dw);
  },
  // 그 날짜 수업 명단 (출석·수업일지·달력용) — 그 요일에 오지 않는 학생은 뺀다
  rosterOn(classId, date) {
    const c = Store.get('classes', classId);
    const seen = {};
    return Store.where('enrollments', e => e.classId === classId && this.attendsOn(e, date, c))
      .map(e => Store.get('students', e.studentId)).filter(s => s && !seen[s.id] && (seen[s.id] = 1))
      .sort((a, b) => Students.sortFn(a, b));
  },
  // date 기준 소속 학생 중 dow 요일에 오는 학생 (시간표용)
  rosterOnDow(classId, dow, date) {
    return this.rosterAt(classId, date).filter(s => { const d = this.partDays(classId, s.id, date); return !d || d.includes(dow); });
  },
  // from 날짜부터 이 반을 days 요일만(null = 모든 요일) 수강하도록 맞춘다. 요일이 바뀌면 기록을 그 날짜에서 나눈다.
  // openEnd: true면 끝날짜(빠짐 예정)를 없애 계속 수강하게 한다 (학생 화면의 '반 추가')
  // 돌려주는 값: 'added' / 'extended' / 'changed' 요일 변경 / 'exists' 이미 같은 요일로 수강 중
  enrollDays(studentId, classId, from, days, openEnd) {
    const c = Store.get('classes', classId);
    days = this.normDays(days, c);
    const withDays = (rec) => { const r = Object.assign({}, rec); if (days) r.days = days; else delete r.days; return r; };
    const mine = Store.where('enrollments', e => e.studentId === studentId && e.classId === classId);
    const cur = mine.find(e => this.enrollValid(e, from));
    const later = mine.filter(e => e.from > from && e !== cur);
    if (!cur) {
      later.forEach(e => Store.del('enrollments', e.id));
      const adj = mine.find(e => e.to === from && this.sameDays(this.normDays(e.days, c), days));   // 바로 앞 기록에 이어 붙임
      if (adj) { Store.put('enrollments', Object.assign({}, adj, { to: null })); return 'extended'; }
      Store.put('enrollments', withDays({ id: uid('EN'), studentId, classId, from, to: null }));
      return 'added';
    }
    if (openEnd) later.forEach(e => Store.del('enrollments', e.id));
    const to = openEnd ? null : (cur.to || null);
    if (this.sameDays(this.normDays(cur.days, c), days)) {
      if (openEnd && cur.to) { Store.put('enrollments', Object.assign({}, cur, { to: null })); return 'extended'; }
      return 'exists';
    }
    if (cur.from >= from) Store.put('enrollments', withDays(Object.assign({}, cur, { to })));
    else {
      Store.put('enrollments', Object.assign({}, cur, { to: from }));
      Store.put('enrollments', withDays({ id: uid('EN'), studentId, classId, from, to }));
    }
    return 'changed';
  },
  rosterAt(classId, date) {
    const seen = {};
    return Store.where('enrollments', e => e.classId === classId && this.enrollValid(e, date))
      .map(e => Store.get('students', e.studentId)).filter(s => s && !seen[s.id] && (seen[s.id] = 1))
      .sort((a, b) => Students.sortFn(a, b));
  },
  // from 날짜부터 계속 수강하도록 만든다.
  // 그 날짜에 이미 수강 중(또는 그 날 끝나는 기록)이면 끝날짜를 없애 이어 붙이고,
  // 그 뒤에 시작하는 같은 반 기록(예정 등)은 새 기록에 포함되므로 지운다.
  // 돌려주는 값: 'added' 새로 추가 / 'extended' 기존 기록을 늘림 / 'exists' 이미 그 날짜부터 계속 수강 중
  enroll(studentId, classId, from) {
    const mine = Store.where('enrollments', e => e.studentId === studentId && e.classId === classId);
    const cover = mine.find(e => e.from <= from && (!e.to || e.to >= from));
    const later = mine.filter(e => e.from > from && e !== cover);
    if (cover && !cover.to && !later.length) return 'exists';
    if (cover) { if (cover.to) Store.put('enrollments', Object.assign({}, cover, { to: null })); }
    else Store.put('enrollments', { id: uid('EN'), studentId, classId, from, to: null });
    later.forEach(e => Store.del('enrollments', e.id));
    return cover ? 'extended' : 'added';
  },
  // date 이후에 수강을 시작할 예정인 학생 [{ s, from }] (date에 이미 수강 중인 학생은 제외)
  upcomingAt(classId, date, exclude) {
    const ex = new Set(exclude || this.rosterAt(classId, date).map(s => s.id));
    const best = {};
    Store.where('enrollments', e => e.classId === classId && e.from > date).forEach(e => {
      if (ex.has(e.studentId)) return;
      if (!best[e.studentId] || e.from < best[e.studentId]) best[e.studentId] = e.from;
    });
    return Object.keys(best).map(id => ({ s: Store.get('students', id), from: best[id] })).filter(o => o.s)
      .sort((a, b) => ko(a.from, b.from) || Students.sortFn(a.s, b.s));
  },
  md(s) { return (+s.slice(5, 7)) + '/' + (+s.slice(8, 10)); },     // 2026-11-05 → 11/5
  closeEnrollments(studentId, date) {
    Store.where('enrollments', e => e.studentId === studentId && (!e.to || e.to > date)).forEach(e => {
      if (e.from >= date) Store.del('enrollments', e.id);
      else Store.put('enrollments', Object.assign({}, e, { to: date }));
    });
  },
  // 그 요일의 시간 { start, duration } — '요일마다 시간 다르게'면 요일별 값, 아니면 공통 값
  timeOn(c, dow) {
    const t = c.perDay && c.times && c.times[dow];
    if (t && t.start) return { start: t.start, duration: +t.duration || 90 };
    return { start: c.start, duration: +c.duration || 90 };
  },
  endTime(c, dow) { const t = this.timeOn(c, dow); return fromMin(toMin(t.start) + t.duration); },
  // 같은 시간인 요일끼리 묶기: [{ days:[1,3], start, duration }, { days:[5], ... }]
  groups(c) {
    const out = [];
    DAY_ORDER.filter(d => (c.days || []).includes(d)).forEach(d => {
      const t = this.timeOn(c, d);
      const g = out.find(x => x.start === t.start && x.duration === t.duration);
      if (g) g.days.push(d); else out.push({ days: [d], start: t.start, duration: t.duration });
    });
    return out;
  },
  timeLabel(c) {
    const gs = this.groups(c);
    if (!gs.length) return '';
    return gs.map(g => daysLabel(g.days) + ' ' + g.start + '~' + fromMin(toMin(g.start) + g.duration)).join(' / ');
  },
  dayTimeLabel(c, dow) { const t = this.timeOn(c, dow); return t.start + '~' + fromMin(toMin(t.start) + t.duration); },
  // 반 이름: 요일 + 시작 시간 (요일마다 다르면 "월수 6시 30분 · 금 8시")
  autoName(days, start, times) {
    if (!times) return start ? daysLabel(days) + ' ' + nameTime(start) : daysLabel(days);
    const gs = [];
    DAY_ORDER.filter(d => days.includes(d)).forEach(d => {
      const st = (times[d] && times[d].start) || start;
      const g = gs.find(x => x.start === st);
      if (g) g.days.push(d); else gs.push({ days: [d], start: st });
    });
    return gs.map(g => g.start ? daysLabel(g.days) + ' ' + nameTime(g.start) : daysLabel(g.days)).join(' · ');
  },
  sorted(list) { return list.sort((a, b) => ko(a.start, b.start) || ko(daysLabel(a.days), daysLabel(b.days)) || ko(a.name, b.name)); },
  sortedOn(list, dow) { return list.sort((a, b) => ko(this.timeOn(a, dow).start, this.timeOn(b, dow).start) || ko(a.name, b.name)); },

  /* ---------- 반 관리 화면 ---------- */
  render(main) {
    const all = this.sorted(Store.all('classes'));
    const today = todayStr();
    const act = all.filter(c => c.active !== false), ended = all.filter(c => c.active === false);
    const row = (c) => {
      const r = this.rosterAt(c.id, today);
      const up = this.upcomingAt(c.id, today, r.map(s => s.id));
      const pday = (sid, date) => { const d = this.partDays(c.id, sid, date); return d ? `<span class="pday" title="${esc(daysLabel(d))}요일만 수강">${esc(daysLabel(d))}만</span>` : ''; };
      const names = r.map(s => `<span class="nw">${esc(s.name)}<span class="tag">${esc(stTag(s))}</span>${pday(s.id, today)}</span>`)
        .concat(up.map(o => `<span class="nw" style="opacity:.55" title="${esc(fmtDate(o.from))}부터 수강 예정">${esc(o.s.name)}<span class="tag">${esc(stTag(o.s))} ${this.md(o.from)}~</span>${pday(o.s.id, o.from)}</span>`));
      // 일부 요일 수강생이 있으면 요일별 인원도 보여 준다
      const cd = DAY_ORDER.filter(d => (c.days || []).includes(d));
      const byDay = cd.length > 1 && r.some(s => this.partDays(c.id, s.id, today))
        ? `<div class="small soft nowrap">${cd.map(d => DOW[d] + ' ' + this.rosterOnDow(c.id, d, today).length).join(' · ')}</div>` : '';
      return `<tr class="click" data-id="${c.id}"><td class="nowrap">${this.dot(c)}<b>${esc(c.name)}</b>${c.active === false ? ' <span class="badge gray">종료</span>' : ''}</td>
        <td class="nowrap">${esc(this.timeLabel(c))}${c.perDay ? '' : ` <span class="muted small">(${+c.duration || 90}분)</span>`}</td>
        <td class="num">${r.length}${byDay}${up.length ? `<div class="small muted">+${up.length} 예정</div>` : ''}</td><td class="small">${names.join(', ') || '<span class="muted">-</span>'}</td></tr>`;
    };
    let h = `<div class="page-narrow"><div class="page-head"><h1>반 관리</h1><button class="btn primary" data-a="add">+ 반 만들기</button>
      <span class="sub">진행 중 ${act.length}개</span><span class="grow"></span>
      <label class="chk small"><input type="checkbox" data-ended ${this.showEnded ? 'checked' : ''}>종료된 반 보기 (${ended.length})</label></div>`;
    const show = this.showEnded ? [...act, ...ended] : act;
    h += show.length ? `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>반 이름</th><th>요일·시간</th><th class="num">인원</th><th>학생</th></tr></thead><tbody>${show.map(row).join('')}</tbody></table></div>`
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
    let nameEdited = c ? !!c.nameEdited : false;
    let pickedColor = (c && c.color && !this.usedColors(c.id)[c.color]) ? c.color : this.freeColor(c && c.id);
    const colorsHtml = () => {
      const used = this.usedColors(c && c.id);
      return this.PALETTE.map(p => {
        const u = used[p.c];
        return `<button type="button" data-color="${p.c}" ${u ? 'disabled' : ''} title="${esc(p.n + (u ? ' — ' + u.name + ' 사용 중' : ''))}"
          style="width:26px;height:26px;border-radius:50%;background:${p.c};cursor:${u ? 'not-allowed' : 'pointer'};opacity:${u ? .18 : 1};
          border:3px solid ${p.c === pickedColor ? 'var(--ink)' : '#fff'};box-shadow:0 0 0 1px ${p.c === pickedColor ? 'var(--ink)' : 'var(--line)'};padding:0"></button>`;
      }).join('');
    };
    let m_times = {};
    // 학생별 수강 요일 { 학생: [요일] | null(전체) } — 체크 목록을 그릴 때 그 날짜 기준으로 채운다
    let pd = {};
    let modalDays = (v.days || []).slice();
    const pkdHtml = (sid) => {
      const cd = DAY_ORDER.filter(d => modalDays.includes(d));
      if (cd.length < 2) return '';
      const sel = pd[sid] ? cd.filter(d => pd[sid].includes(d)) : cd;
      const part = sel.length && sel.length < cd.length;
      return cd.map(d => `<button type="button" data-pkday="${d}" class="${(part ? sel.includes(d) : true) ? 'on' : ''}" title="${DOW[d]}요일 수강 켜기/끄기">${DOW[d]}</button>`).join('')
        + (part ? `<em>${esc(daysLabel(sel))}만</em>` : '');
    };
    // 학생 체크 목록: 적용일 기준 명단으로 체크하고, 그 날 수강 중이거나 예정인 학생은 상태와 관계없이 보여 준다
    const picksHtml = (date) => {
      const inIds = c ? this.rosterAt(c.id, date).map(s => s.id) : [];
      const upFrom = {};
      if (c) this.upcomingAt(c.id, date, inIds).forEach(o => { upFrom[o.s.id] = o.from; });
      const students = Store.where('students', s => s.status === 'active' || inIds.includes(s.id) || upFrom[s.id]).sort((a, b) => Students.sortFn(a, b));
      pd = {};
      if (c) inIds.forEach(sid => { pd[sid] = this.partDays(c.id, sid, date); });
      if (!students.length) return '<div class="muted small" style="padding:6px">재원 중인 학생이 없습니다.</div>';
      return students.map(s => `<label data-nm="${esc((s.name + ' ' + stTag(s)).toLowerCase())}"><input type="checkbox" name="st" value="${s.id}" ${inIds.includes(s.id) ? 'checked' : ''}>${esc(s.name)}<span class="tag">${esc(stTag(s))}</span>${s.status !== 'active' ? ' ' + Students.statusBadge(s) : ''}${upFrom[s.id] ? ` <span class="small muted">${this.md(upFrom[s.id])}~ 예정</span>` : ''}<span class="pkd" data-pkd="${s.id}">${pkdHtml(s.id)}</span></label>`).join('');
    };
    const body = `<div class="form">
      <label class="req">요일</label><div class="day-picks">${DAY_ORDER.map(d => `<label><input type="checkbox" name="day" value="${d}" ${(v.days || []).includes(d) ? 'checked' : ''}>${DOW[d]}</label>`).join('')}</div>
      <label class="req">시작 시간</label><div class="row"><input type="time" name="start" step="300" value="${esc(v.start)}">
        <span>수업 길이</span><input type="number" name="duration" min="10" max="600" step="5" value="${+v.duration || 90}"><span>분</span>
        <span class="soft" data-end></span></div>
      <label></label><div><label class="chk"><input type="checkbox" name="perDay" ${v.perDay ? 'checked' : ''}>요일마다 시간 다르게</label>
        <div class="pd-rows" data-pd></div></div>
      <label class="req">반 이름</label><div class="row"><input type="text" name="name" value="${esc(v.name)}" style="flex:1" maxlength="40"><button class="btn sm" type="button" data-autoname>자동 이름</button></div>
      <label class="top">메모</label><textarea name="memo" rows="3">${esc(v.memo)}</textarea>
      <label>시간표 색</label><div><div data-colors style="display:flex;gap:6px;flex-wrap:wrap">${colorsHtml()}</div>
        <div class="hint" data-colorhint style="margin-top:4px">${pickedColor ? '흐린 색은 다른 진행 중인 반이 쓰고 있어 고를 수 없습니다.' : '남은 색이 없습니다. 다른 반을 종료하면 그 색을 쓸 수 있습니다.'}</div></div>
      <label>진행 상태</label><label class="chk"><input type="checkbox" name="ended" ${v.active === false ? 'checked' : ''}>종료된 반 (시간표·수업일지에서 숨김)</label>
      <label class="top">학생</label><div>
        <div class="row" style="margin-bottom:6px"><input type="search" data-filter placeholder="학생 검색" style="flex:1"><span class="small soft">변경 적용일</span><input type="date" name="apply" value="${today}"></div>
        <div class="pick-list" data-picks>${picksHtml(today)}</div>
        <div class="hint" style="margin-top:4px">체크 상태는 적용일 기준 명단입니다. 체크한 학생은 적용일부터 출석부에 들어가고, 체크를 푼 학생은 적용일부터 빠집니다.<br>이름 오른쪽 요일 버튼을 끄면 그 요일은 빠지고 나머지 요일만 수강합니다 (예: 월수반을 월요일만).</div></div>
    </div>`;
    Modal.open({
      title: c ? '반 수정' : '반 만들기', size: 'lg', body,
      onMount: (b) => {
        enhanceAll(b);
        const nameIn = $('[name=name]', b);
        const readDays = () => $$('[name=day]:checked', b).map(i => +i.value);
        const pdChk = $('[name=perDay]', b), pdBox = $('[data-pd]', b);
        const times = JSON.parse(JSON.stringify(v.times || {}));     // { 요일: { start, duration } }
        const common = () => ({ start: $('[name=start]', b).value, duration: +$('[name=duration]', b).value || 90 });
        const curName = () => this.autoName(readDays(), common().start, pdChk.checked ? times : null);
        // 요일별 줄 그리기 (체크한 요일만, 없던 요일은 공통 시간으로 채움)
        const drawPd = () => {
          if (!pdChk.checked) { pdBox.innerHTML = ''; return; }
          const cm = common();
          pdBox.innerHTML = DAY_ORDER.filter(d => readDays().includes(d)).map(d => {
            const t = times[d] = times[d] && times[d].start ? times[d] : { start: cm.start, duration: cm.duration };
            return `<div class="pd-row"><b>${DOW[d]}</b><input type="time" step="300" data-ps="${d}" value="${esc(t.start)}">
              <input type="number" min="10" max="600" step="5" data-pdu="${d}" value="${+t.duration || 90}"><span>분</span>
              <span class="soft" data-pe="${d}">→ ${t.start ? fromMin(toMin(t.start) + (+t.duration || 90)) + ' 종료' : ''}</span></div>`;
          }).join('') || '<div class="hint">요일을 먼저 고르세요.</div>';
        };
        const upd = () => {
          const cm = common();
          $('[data-end]', b).textContent = cm.start ? '→ ' + fromMin(toMin(cm.start) + cm.duration) + ' 종료' : '';
          if (!nameEdited) nameIn.value = curName();
        };
        drawPd();
        if (!c) upd(); else { const cm = common(); $('[data-end]', b).textContent = cm.start ? '→ ' + fromMin(toMin(cm.start) + cm.duration) + ' 종료' : ''; }
        let picksTouched = false, drawnDate = today;
        const redrawPicks = (date) => {
          $('[data-picks]', b).innerHTML = picksHtml(date);
          drawnDate = date; picksTouched = false;
          const q = $('[data-filter]', b).value.trim().toLowerCase();
          if (q) $$('.pick-list label', b).forEach(l => { l.style.display = l.dataset.nm.includes(q) ? '' : 'none'; });
        };
        b.addEventListener('change', async (e) => {
          if (e.target.matches('[name=day],[name=perDay]')) {
            drawPd(); upd();
            if (e.target.matches('[name=day]')) { modalDays = readDays(); $$('[data-pkd]', b).forEach(x => { x.innerHTML = pkdHtml(x.dataset.pkd); }); }
          }
          else if (e.target.matches('[name=start],[name=duration]')) upd();
          else if (e.target.matches('[name=st]')) picksTouched = true;
          else if (e.target.matches('[name=apply]')) {
            const d = e.target.value;
            if (!isYmd(d) || d === drawnDate) return;
            if (picksTouched && !await confirmDlg('적용일 기준 명단으로 체크를 다시 표시할까요?\n직접 바꾼 체크는 사라집니다.', '다시 표시')) return;
            if ($('[name=apply]', b).value === d) redrawPicks(d);
          }
        });
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-ps],[data-pdu]')) {
            const d = t.dataset.ps || t.dataset.pdu;
            times[d] = times[d] || {};
            if (t.dataset.ps) times[d].start = t.value; else times[d].duration = +t.value || 90;
            const x = times[d];
            $(`[data-pe="${d}"]`, b).textContent = x.start ? '→ ' + fromMin(toMin(x.start) + (+x.duration || 90)) + ' 종료' : '';
            if (!nameEdited) nameIn.value = curName();
            return;
          }
          if (t === nameIn) nameEdited = nameIn.value.trim() !== '' && nameIn.value.trim() !== curName();
          if (t.matches('[name=start],[name=duration]')) upd();
          if (e.target.matches('[data-filter]')) {
            const q = e.target.value.trim().toLowerCase();
            $$('.pick-list label', b).forEach(l => { l.style.display = !q || l.dataset.nm.includes(q) ? '' : 'none'; });
          }
        });
        $('[data-autoname]', b).onclick = () => { nameEdited = false; upd(); };
        // 학생별 요일 버튼 (마지막 하루는 끌 수 없음)
        b.addEventListener('click', (e) => {
          const k = e.target.closest('[data-pkday]');
          if (!k) return;
          e.preventDefault();
          const box = k.closest('[data-pkd]'), sid = box.dataset.pkd, d = +k.dataset.pkday;
          const cd = DAY_ORDER.filter(x => modalDays.includes(x));
          let sel = pd[sid] ? cd.filter(x => pd[sid].includes(x)) : cd.slice();
          if (!sel.length) sel = cd.slice();
          sel = sel.includes(d) ? sel.filter(x => x !== d) : DAY_ORDER.filter(x => x === d || sel.includes(x));
          if (!sel.length) { toast('최소 하루는 수강해야 합니다. 빼려면 체크를 푸세요'); return; }
          pd[sid] = sel.length === cd.length ? null : sel;
          box.innerHTML = pkdHtml(sid);
          picksTouched = true;
        });
        $('[data-colors]', b).addEventListener('click', (e) => {
          const k = e.target.closest('[data-color]');
          if (!k || k.disabled) return;
          pickedColor = k.dataset.color;
          $('[data-colors]', b).innerHTML = colorsHtml();
        });
        m_times = times;
      },
      buttons: [
        ...(c ? [{ text: '완전 삭제', cls: 'danger', left: true, onClick: async () => {
          const ok = await confirmHard(`“${c.name}” 반을 완전히 삭제할까요?\n이 반의 수강 기록, 수업일지(출석·진도·할일), 보강 기록이 모두 삭제됩니다.\n(수업이 끝난 반은 삭제 대신 “종료된 반”으로 표시하세요)`);
          if (!ok) return false;
          this.hardDelete(c.id); toast('반을 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: async (m) => {
          const b = m.body;
          const days = $$('[name=day]:checked', b).map(i => +i.value);
          const start = $('[name=start]', b).value;
          const duration = Math.max(10, Math.min(600, +$('[name=duration]', b).value || 90));
          const apply = $('[name=apply]', b).value;
          if (!days.length) { toast('요일을 하나 이상 고르세요'); return false; }
          if (!start) { toast('시작 시간을 입력하세요'); return false; }
          if (!isYmd(apply)) { toast('변경 적용일을 선택하세요'); return false; }
          // 요일별 시간 정리: 체크한 요일만 남기고, 모두 같으면 공통 시간으로 저장
          let perDay = $('[name=perDay]', b).checked, times = null;
          if (perDay) {
            times = {};
            for (const d of days) {
              const t = m_times[d] || {};
              if (!t.start) { toast(DOW[d] + '요일 시작 시간을 입력하세요'); return false; }
              times[d] = { start: t.start, duration: Math.max(10, Math.min(600, +t.duration || 90)) };
            }
            const vals = Object.values(times);
            if (vals.every(t => t.start === vals[0].start && t.duration === vals[0].duration)) { perDay = false; times = null; }
          }
          const st0 = perDay ? times[DAY_ORDER.find(d => days.includes(d))].start : start;
          const du0 = perDay ? times[DAY_ORDER.find(d => days.includes(d))].duration : duration;
          const auto = this.autoName(days, st0, times);
          const name = $('[name=name]', b).value.trim() || auto;
          const active = !$('[name=ended]', b).checked;
          // 진행 중인 반끼리 색이 겹치면 저장하지 않는다 (종료된 반을 다시 진행할 때 등)
          if (active && pickedColor && this.usedColors(c && c.id)[pickedColor]) { toast('다른 진행 중인 반이 이 색을 쓰고 있습니다. 다른 색을 고르세요'); return false; }
          // 반 요일을 바꿔서 수강하던 요일이 모두 없어지는 학생 → 모든 요일 수강으로 바뀐다는 확인
          const checked0 = $$('[name=st]:checked', b).map(i => i.value);
          const lost = checked0.filter(sid => pd[sid] && !pd[sid].some(d => days.includes(d)));
          if (lost.length) {
            const nm = lost.map(sid => (Store.get('students', sid) || {}).name).filter(Boolean).join(', ');
            if (!await confirmDlg(`${nm} 학생은 수강하던 요일이 반에서 빠집니다.\n이 학생은 남은 모든 요일을 수강하도록 바뀝니다. 계속할까요?`, '계속')) return false;
            lost.forEach(sid => { pd[sid] = null; });
          }
          const rec = Object.assign({}, c || { id: uid('CL'), createdAt: new Date().toISOString() }, {
            name, nameEdited: name !== auto, days, start: st0, duration: du0, perDay, times,
            memo: stripZws($('[name=memo]', b).value), active, color: pickedColor || '',
          });
          Store.put('classes', rec);
          const shown = $$('[name=st]', b).map(i => i.value);
          const checked = $$('[name=st]:checked', b).map(i => i.value);
          const nowIn = this.rosterAt(rec.id, apply).map(s => s.id);
          // 새로 체크한 학생은 추가, 이미 수강 중인 학생은 요일이 바뀐 경우만 적용일부터 바꾼다
          checked.forEach(sid => this.enrollDays(sid, rec.id, apply, pd[sid] || null));
          // 목록에 보이는 학생 중 체크를 푼 학생만 뺀다 (목록에 없는 학생은 건드리지 않음)
          nowIn.filter(sid => shown.includes(sid) && !checked.includes(sid)).forEach(sid => {
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
    const tdow = dowOf(today);
    const classes = Store.all('classes').filter(c => c.active !== false);
    const cols = DAY_ORDER.map(dow => {
      const items = classes.filter(c => (c.days || []).includes(dow)).map(c => {
        const t = Classes.timeOn(c, dow);
        const s = toMin(t.start), e = s + t.duration;
        // 이 요일에 오는 학생만 (일부 요일 수강생은 그 요일 블록에만 나온다)
        const roster = Classes.rosterOnDow(c.id, dow, today);
        const up = Classes.upcomingAt(c.id, today, Classes.rosterAt(c.id, today).map(x => x.id))
          .filter(o => { const d = Classes.partDays(c.id, o.s.id, o.from); return !d || d.includes(dow); });
        return { c, s, e, roster, up };
      });
      return { dow, items: this.layout(items) };
    });
    const span = this.END - this.START;
    let h = `<div class="page-head"><h1>시간표</h1><span class="sub">블록을 누르면 반 정보를 수정합니다</span></div>
      <div class="tt2"><div class="tt2-head"><div></div>${DAY_ORDER.map(d => `<div class="tt2-wd ${d === 0 ? 'sun' : d === 6 ? 'sat' : ''}${d === tdow ? ' today' : ''}">${DOW[d]}${d === tdow ? '<span class="tt2-today">오늘</span>' : ''}</div>`).join('')}</div>
      <div class="tt2-body"><div class="tt2-time">`;
    for (let t = this.START; t < this.END; t += 60) {
      const hr = t / 60;
      h += `<span style="top:calc(var(--ppm) * ${t - this.START})">${hr > 12 ? hr - 12 : hr}시</span>`;
    }
    h += '</div>';
    cols.forEach(col => {
      const isToday = col.dow === tdow;
      h += `<div class="tt2-col${isToday ? ' today' : ''}">`;
      col.items.forEach(it => {
        const s = Math.max(it.s, this.START), e = Math.min(it.e, this.END);
        if (e <= s) return;
        const w = 100 / it.cols;
        const c = it.c;
        const cc = Classes.colorOf(c);
        h += `<div class="tt-blk" data-cls="${c.id}" title="${esc(c.name)} — 눌러서 반 수정"
          style="--c:${cc};top:calc(var(--ppm) * ${s - this.START} + 1px);height:calc(var(--ppm) * ${e - s} - 3px);left:calc(${it.col * w}% + 3px);width:calc(${w}% - 6px);background:${isToday ? `linear-gradient(${cc}1F,${cc}1F),#fff` : cc + '1F'};border-color:${cc}73;box-shadow:inset 5px 0 0 ${cc}">
          <div class="hd"><div class="nm" style="color:var(--ink)"><b>${esc(c.name)}</b></div>
          <div class="tm">${esc(Classes.dayTimeLabel(c, col.dow))} · ${it.roster.length}명${it.up.length ? ` +${it.up.length} 예정` : ''}</div></div>
          <div class="sts-g">${this.groupedHtml(it.roster, it.up)}</div></div>`;
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

  // 가로 나열용: 같은 학교·학년끼리 묶어 "(이름 이름) [학교]" 로 이어서 나열, 예정 학생은 맨 끝
  groupedHtml(roster, up) {
    const groups = [];
    roster.forEach(s => {
      const t = stTag(s);
      const g = groups[groups.length - 1];
      if (g && g.t === t) g.list.push(s); else groups.push({ t, list: [s] });
    });
    const chip = (t) => t ? `<i class="sc">${esc(t)}</i>` : '';
    let out = groups.map(g => {
      const multi = g.list.length > 1, last = g.list.length - 1;
      return g.list.map((s, i) => `<span class="n${i === last ? ' gl' : ''}" title="${esc(s.name + ' ' + g.t)}">${multi && i === 0 ? '(' : ''}${esc(s.name)}${i === last ? (multi ? ')' : '') + chip(g.t) : ''}</span>`).join(' ');
    }).join(' ');
    if (up.length) out += ' ' + up.map(o => `<span class="n gl up" title="${esc(o.s.name + ' ' + stTag(o.s) + ' · ' + fmtDate(o.from) + '부터 수강 예정')}">${esc(o.s.name)}${chip(stTag(o.s))}<em>${Classes.md(o.from)}~</em></span>`).join(' ');
    return out;
  },

  // 학생 명단 글씨 크기: 블록 안에 다 들어가는 가장 큰 크기 (최대 15px → 넘치면 0.5px씩 줄여 최소 10px)
  // 인원이 적으면 크게, 많으면 작게. 블록 높이(수업 길이·시간표 높이 조절)에 따라 자동으로 맞춰진다.
  FS_MAX: 15,
  FS_MIN: 10,
  fitStudents(main) {
    $$('.tt-blk', main).forEach(b => {
      let fs = this.FS_MAX;
      b.style.setProperty('--fs', fs + 'px');
      while (fs > this.FS_MIN && b.scrollHeight > b.clientHeight + 1) { fs -= 0.5; b.style.setProperty('--fs', fs + 'px'); }
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
