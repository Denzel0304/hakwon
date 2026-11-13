/* =========================================================
   classes.js — 반 관리 + 주간 시간표
   class: { name, nameEdited, days:[0~6], start:'HH:MM', duration(분), memo, active, startDate(수업 시작일) }
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
  // 반 드롭다운 왼쪽 색 점 — 드롭다운 바로 앞에 둔다. 반을 바꾸면 점 색도 바로 바뀐다 (반이 없으면 자리만 차지)
  selDot(c) { return `<span data-clsdot style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c ? this.colorOf(c) : 'transparent'};margin-right:6px;vertical-align:middle;flex:none"></span>`; },
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
  // 수업 시작일: 저장된 값, 없으면(예전에 만든 반) 반을 만든 날
  startOf(c) {
    if (!c) return '';
    if (isYmd(c.startDate)) return c.startDate;
    if (c.createdAt) { const d = new Date(c.createdAt); if (!isNaN(d)) return ymd(d); }
    return '';
  },
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
  // 적용일 이후, 이번에 빠지는 요일에 이미 출석 기록이 있는 날짜들 (요일이 실제로 바뀌는 경우만 확인)
  // classDays: 반 수정 창처럼 아직 저장 전인 반 요일을 기준으로 볼 때
  attConflicts(sid, cid, from, days, classDays) {
    const c = Object.assign({}, Store.get('classes', cid) || {}, classDays ? { days: classDays } : {});
    const nd = this.normDays(days, c);
    if (!nd) return [];
    const cur = Store.where('enrollments', e => e.studentId === sid && e.classId === cid && this.enrollValid(e, from))[0];
    if (cur && this.sameDays(this.normDays(cur.days, c), nd)) return [];
    return Store.where('lessons', l => l.classId === cid && l.date >= from && l.att && l.att[sid]
      && (c.days || []).includes(dowOf(l.date)) && !nd.includes(dowOf(l.date))).map(l => l.date).sort();
  },
  // 위 기록이 있으면 확인 창 (기록은 지우지 않음). list: [{ sid, cid, from, days, classDays? }] → 진행하면 true
  async confirmAttConflicts(list) {
    const lines = [];
    list.forEach(o => {
      const ds = this.attConflicts(o.sid, o.cid, o.from, o.days, o.classDays);
      if (!ds.length) return;
      const st = Store.get('students', o.sid), c = Store.get('classes', o.cid);
      const shown = ds.slice(0, 4).map(d => this.md(d) + '(' + DOW[dowOf(d)] + ')').join(', ');
      lines.push(`· ${st ? st.name : ''}${c ? ' — ' + c.name : ''}: ${shown}${ds.length > 4 ? ` 외 ${ds.length - 4}건` : ''}`);
    });
    if (!lines.length) return true;
    return confirmDlg(`적용일 이후, 빼는 요일에 이미 출석 기록이 있습니다.\n${lines.join('\n')}\n\n기록은 지우지 않고 그대로 둡니다.\n(출석부에는 “수강하지 않는 날” 칸에 그대로 보이고, 결석이면 보강 목록에도 남습니다)\n계속할까요?`, '계속');
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
  // 학생의 첫 반이면 수강 시작일 = 학생 등록일 (반 수업 시작일보다 앞이면 반 시작일)
  // before 전에 시작한 수강 기록(어느 반이든)이 있으면 첫 반이 아님 → null (두 번째 반·반 이동·다시 들어옴)
  firstStart(sid, before, classStart) {
    if (Store.where('enrollments', e => e.studentId === sid && e.from < before).length) return null;
    const s = Store.get('students', sid), jd = s ? Students.joinDateOf(s) : '';
    if (!isYmd(jd)) return null;
    return isYmd(classStart) && classStart > jd ? classStart : jd;
  },
  // date에 이 반을 수강 중인 기록과, 그 앞뒤로 이어진 기록들 (요일만 바뀌어 나뉜 기록 포함)
  chainOf(sid, cid, date) {
    const mine = Store.where('enrollments', e => e.studentId === sid && e.classId === cid);
    const cur = mine.find(e => this.enrollValid(e, date));
    if (!cur) return [];
    const chain = [cur];
    for (let a = cur; ;) { const p = mine.find(e => e.to && e.to === a.from && !chain.includes(e)); if (!p) break; chain.unshift(p); a = p; }
    for (let z = cur; z.to;) { const n = mine.find(e => e.from === z.to && !chain.includes(e)); if (!n) break; chain.push(n); z = n; }
    return chain;
  },
  // 이미 수강 중인 학생: 요일은 그 반에 들어온 날부터 같게 (이어진 기록을 하나로 합침), from이 더 앞이면 시작일을 앞당김
  fixExisting(sid, cid, date, days, from) {
    const c = Store.get('classes', cid);
    days = this.normDays(days, c);
    const chain = this.chainOf(sid, cid, date);
    if (!chain.length) return;
    const first = chain[0], last = chain[chain.length - 1];
    const f = isYmd(from) && from < first.from ? from : first.from;
    if (chain.length === 1 && f === first.from && this.sameDays(this.normDays(first.days, c), days)) return;
    const r = Object.assign({}, first, { from: f, to: last.to || null });
    if (days) r.days = days; else delete r.days;
    chain.slice(1).forEach(e => Store.del('enrollments', e.id));
    Store.put('enrollments', r);
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
  /* ---------- 금요일 개인 시간 ----------
     class.ftimes: { 학생ID: { start, duration } } — 금요일만 반 시간과 다르게 오는 학생 (반 소속·일지·진도는 그대로) */
  FT_DOW: 5,
  // 이 학생의 금요일 개인 시간 (반에 금요일이 없거나 지정이 없으면 null)
  ftimeOf(c, sid) {
    const t = c && (c.days || []).includes(this.FT_DOW) && c.ftimes && c.ftimes[sid];
    return t && t.start ? { start: t.start, duration: +t.duration || 90 } : null;
  },
  // 이 학생이 그 요일에 실제로 오는 시간 (금요일 개인 시간 반영)
  stuTimeOn(c, sid, dow) { return (dow === this.FT_DOW && this.ftimeOf(c, sid)) || this.timeOn(c, dow); },
  ftLabel(t) { return t ? t.start + '~' + fromMin(toMin(t.start) + (+t.duration || 90)) : ''; },
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
  // 반 순서: 첫 수업 요일(월→일) → 그 요일의 시작 시간 → 요일 이름 → 반 이름
  firstDay(c) { const d = DAY_ORDER.find(x => (c.days || []).includes(x)); return d == null ? null : d; },
  sorted(list) {
    const key = (c) => { const d = this.firstDay(c); return d == null ? [99, ''] : [DAY_ORDER.indexOf(d), this.timeOn(c, d).start || '']; };
    return list.sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka[0] - kb[0] || ko(ka[1], kb[1]) || ko(daysLabel(a.days), daysLabel(b.days)) || ko(a.name, b.name);
    });
  },
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
      const pft = (sid) => { const t = this.ftimeOf(c, sid); return t ? `<span class="pft" title="${esc('금요일 개인 시간 ' + this.ftLabel(t))}">금 ${esc(t.start)}</span>` : ''; };
      const names = r.map(s => `<span class="nw">${esc(s.name)}<span class="tag">${esc(stTag(s))}</span>${pday(s.id, today)}${pft(s.id)}</span>`)
        .concat(up.map(o => `<span class="nw" style="opacity:.55" title="${esc(fmtDate(o.from))}부터 수강 예정">${esc(o.s.name)}<span class="tag">${esc(stTag(o.s))} ${this.md(o.from)}~</span>${pday(o.s.id, o.from)}</span>`));
      // 일부 요일 수강생이 있으면 요일별 인원도 보여 준다
      const cd = DAY_ORDER.filter(d => (c.days || []).includes(d));
      const byDay = cd.length > 1 && r.some(s => this.partDays(c.id, s.id, today))
        ? `<div class="small soft nowrap">${cd.map(d => DOW[d] + ' ' + this.rosterOnDow(c.id, d, today).length).join(' · ')}</div>` : '';
      return `<tr class="click" data-id="${c.id}"><td class="nowrap">${this.dot(c)}<b>${esc(c.name)}</b>${c.active === false ? ' <span class="badge gray">종료</span>' : ''}</td>
        <td class="nowrap">${esc(this.timeLabel(c))}${c.perDay ? '' : ` <span class="muted small">(${+c.duration || 90}분)</span>`}</td>
        <td class="num">${r.length}${byDay}${up.length ? `<div class="small muted">+${up.length} 예정</div>` : ''}</td><td class="small">${names.join(', ') || '<span class="muted">-</span>'}</td></tr>`;
    };
    let h = `<div class="page-narrow"><div class="page-head"><h1>반</h1><button class="btn primary" data-a="add">+ 반 만들기</button>
      <span class="sub">진행 중 ${act.length}개</span><span class="grow"></span>
      <label class="chk small"><input type="checkbox" data-ended ${this.showEnded ? 'checked' : ''}>종료된 반 보기 (${ended.length})</label></div>`;
    const show = this.showEnded ? [...act, ...ended] : act;
    h += show.length ? `<div class="tbl-wrap"><table class="tbl compact cls-tbl"><thead><tr><th>반 이름</th><th>요일·시간</th><th class="num">인원</th><th>학생</th></tr></thead><tbody>${show.map(row).join('')}</tbody></table></div>`
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
    // 학생별 금요일 개인 시간 { 학생: { start, duration } } — 저장할 때 정리한다
    const ft = JSON.parse(JSON.stringify(v.ftimes || {}));
    const pkdHtml = (sid) => {
      const cd = DAY_ORDER.filter(d => modalDays.includes(d));
      let h = '';
      if (cd.length >= 2) {
        const sel = pd[sid] ? cd.filter(d => pd[sid].includes(d)) : cd;
        const part = sel.length && sel.length < cd.length;
        // '월만' 표시는 버튼 왼쪽에 둔다 (오른쪽 정렬이라 버튼 위치가 바뀌지 않음)
        h = (part ? `<em>${esc(daysLabel(sel))}만</em>` : '')
          + cd.map(d => `<button type="button" data-pkday="${d}" class="${(part ? sel.includes(d) : true) ? 'on' : ''}" title="${DOW[d]}요일 수강 켜기/끄기">${DOW[d]}</button>`).join('');
      }
      // 금요일 개인 시간 버튼 (반에 금요일이 있고, 이 학생이 금요일에 올 때)
      if (cd.includes(this.FT_DOW) && (!pd[sid] || pd[sid].includes(this.FT_DOW))) {
        const t = ft[sid] && ft[sid].start ? ft[sid] : null;
        h += `<button type="button" data-pkft="${sid}" class="ft${t ? ' on' : ''}" title="${t ? esc('금요일 개인 시간 ' + this.ftLabel(t) + ' — 눌러서 바꾸기') : '금요일만 반 시간과 다르게 올 때 지정'}">${t ? '금 ' + esc(t.start) : '금 시간'}</button>`;
      }
      return h;
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
    const startDate0 = (c && this.startOf(c)) || today;
    const body = `<div class="form">
      <label class="req">수업 시작일</label><div class="row"><input type="date" name="startDate" value="${esc(startDate0)}"><span class="hint">이 날부터 일지를 쓰지 않은 수업이 달력에 표시됩니다</span></div>
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
        <div class="row" style="margin-bottom:6px"><input type="search" data-filter placeholder="학생 검색" style="flex:1"><span class="small soft">반 등록일(이동일)</span><input type="date" name="apply" value="${today}"></div>
        <div class="pick-list" data-picks>${picksHtml(today)}</div>
        <div class="cls-guide">
          <b>체크 기준</b><span>오른쪽 위 ‘반 등록일(이동일)’ 날짜의 명단입니다.</span>
          <b>처음 넣는 학생</b><span>학생 등록일부터 들어갑니다.<em>반 수업 시작일보다 빠르면 반 시작일부터</em></span>
          <b>반 이동 · 두 번째 반</b><span>등록일(이동일)부터 들어갑니다.</span>
          <b>체크를 푼 학생</b><span>등록일(이동일)부터 빠집니다.</span>
          <b>요일 버튼</b><span>이름 오른쪽 요일을 끄면 그 요일만 빠집니다.<em>예: 월수반을 월요일만 · 반에 들어온 날부터 적용</em></span>
        </div></div>
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
        // 금요일 개인 시간 지정 창 (반의 금요일 시간이 기본값)
        const friT = () => (pdChk.checked && times[this.FT_DOW] && times[this.FT_DOW].start ? times[this.FT_DOW] : common());
        const openFt = (sid, box) => {
          const s = Store.get('students', sid), base = friT();
          const cur = ft[sid] && ft[sid].start ? ft[sid] : null, t0 = cur || base;
          Modal.open({
            title: '금요일 개인 시간', size: 'sm',
            body: `<div class="form">
              <label>학생</label><div><b>${esc(s ? s.name : '')}</b> <span class="small soft">${esc(stTag(s))}</span></div>
              <label>반 금요일</label><div class="soft">${esc(base.start ? this.ftLabel(base) : '-')}</div>
              <label class="req">시작 시간</label><div class="row"><input type="time" step="300" name="fts" value="${esc(t0.start || '')}">
                <input type="number" name="ftd" min="10" max="600" step="5" value="${+t0.duration || 90}"><span>분</span></div>
              <label></label><div class="hint">반 소속·수업일지·진도는 그대로이고, 시간표에서만 이 시간에 표시됩니다.</div></div>`,
            buttons: [
              ...(cur ? [{ text: '반 시간으로', left: true, onClick: () => { delete ft[sid]; box.innerHTML = pkdHtml(sid); } }] : []),
              { text: '취소' },
              { text: '확인', cls: 'primary', primary: true, onClick: (mm) => {
                const st = $('[name=fts]', mm.body).value;
                const du = Math.max(10, Math.min(600, +$('[name=ftd]', mm.body).value || 90));
                if (!st) { toast('시작 시간을 입력하세요'); return false; }
                if (st === base.start && du === (+base.duration || 90)) delete ft[sid];   // 반 시간과 같으면 지정 없음
                else ft[sid] = { start: st, duration: du };
                box.innerHTML = pkdHtml(sid);
              } },
            ],
          });
        };
        // 학생별 요일 버튼 (마지막 하루는 끌 수 없음)
        b.addEventListener('click', (e) => {
          const fb = e.target.closest('[data-pkft]');
          if (fb) { e.preventDefault(); openFt(fb.dataset.pkft, fb.closest('[data-pkd]')); return; }
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
          const startDate = $('[name=startDate]', b).value;
          if (!isYmd(startDate)) { toast('수업 시작일을 선택하세요'); return false; }
          if (!days.length) { toast('요일을 하나 이상 고르세요'); return false; }
          if (!start) { toast('시작 시간을 입력하세요'); return false; }
          if (!isYmd(apply)) { toast('반 등록일(이동일)을 선택하세요'); return false; }
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
          // 수강 시작일: 새로 넣는 학생은 첫 반이면 학생 등록일(반 시작일보다 앞이면 반 시작일), 아니면 반 등록일(이동일)
          //             이미 수강 중인 학생은 그 반에 들어온 날 (첫 반인데 등록일보다 늦게 시작했으면 등록일로 앞당김)
          const inNow = c ? this.rosterAt(c.id, apply).map(s => s.id) : [];
          const fromOf = {};
          checked0.forEach(sid => {
            if (inNow.includes(sid)) {
              const f0 = this.chainOf(sid, c.id, apply)[0].from;
              const fs = this.firstStart(sid, f0, startDate);
              fromOf[sid] = fs && fs < f0 ? fs : f0;
            } else fromOf[sid] = this.firstStart(sid, apply, startDate) || apply;
          });
          // 빠지는 요일에 이미 출석 기록이 있으면 확인 (요일은 그 반에 들어온 날부터 적용)
          if (c && !await this.confirmAttConflicts(checked0.filter(sid => pd[sid]).map(sid => ({ sid, cid: c.id, from: fromOf[sid], days: pd[sid], classDays: days })))) return false;
          // 금요일 개인 시간 정리: 반에 금요일이 있을 때만, 금요일에 오는 학생만, 반 금요일 시간과 다른 것만 남긴다
          //   체크를 푼 학생(이번에 빠지는 학생)은 지우고, 목록에서 체크하지 않은 수강 예정 학생 것은 그대로 둔다
          const friOf = days.includes(this.FT_DOW) ? (perDay ? times[this.FT_DOW] : { start, duration }) : null;
          const ftimes = {};
          if (friOf) Object.keys(ft).forEach(sid => {
            const t = ft[sid];
            if (!t || !t.start) return;
            if (checked0.includes(sid)) { if (pd[sid] && !pd[sid].includes(this.FT_DOW)) return; }
            else if (inNow.includes(sid) || !(c && Store.where('enrollments', e => e.studentId === sid && e.classId === c.id && (!e.to || e.to > apply)).length)) return;
            const du = +t.duration || 90;
            if (t.start === friOf.start && du === (+friOf.duration || 90)) return;
            ftimes[sid] = { start: t.start, duration: du };
          });
          const rec = Object.assign({}, c || { id: uid('CL'), createdAt: new Date().toISOString() }, {
            name, nameEdited: name !== auto, days, start: st0, duration: du0, perDay, times,
            memo: stripZws($('[name=memo]', b).value), active, color: pickedColor || '', startDate,
          });
          if (Object.keys(ftimes).length) rec.ftimes = ftimes; else delete rec.ftimes;
          Store.put('classes', rec);
          const shown = $$('[name=st]', b).map(i => i.value);
          const checked = $$('[name=st]:checked', b).map(i => i.value);
          const nowIn = this.rosterAt(rec.id, apply).map(s => s.id);
          // 새로 체크한 학생은 위 시작일부터 추가, 이미 수강 중인 학생은 요일을 그 반에 들어온 날부터 맞춘다
          checked.forEach(sid => {
            if (nowIn.includes(sid)) this.fixExisting(sid, rec.id, apply, pd[sid] || null, fromOf[sid]);
            else this.enrollDays(sid, rec.id, fromOf[sid] || apply, pd[sid] || null);
          });
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
    Store.delWhere('meta', m => m.kind === 'lskip' && m.classId === cid);   // 일지 건너뛰기 표시
    Store.delWhere('meta', m => m.kind === 'pman' && m.classId === cid);    // 내신 수동 진도 표시
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
  nowTimer: null,                // 오늘 끝난 수업·현재 시각 선을 1분마다 맞추는 타이머
  onLeave() { this.userH = 0; this.stopNow(); },

  gridHtml(today, viewOnly = false) {
    const tdow = dowOf(today);
    const classes = Store.all('classes').filter(c => c.active !== false);
    // 토·일은 수업이 없으므로 시간표에서 제외 (혹시 지정된 데이터가 있어도 그리지 않음)
    const ttDays = DAY_ORDER.filter(d => d !== 0 && d !== 6);
    const cols = ttDays.map(dow => {
      const items = this.dayItems(classes, dow, today);
      return { dow, items: dow === 5 ? this.layoutFri(items) : this.layout(items) };
    });
    // 금요일 폭 = 슬롯 수(평소 2칸, 3개가 동시에 겹칠 때만 3칸) × 다른 요일 한 칸
    const friCol = cols.find(col => col.dow === 5);
    const friN = Math.max(2, ...friCol.items.map(it => it.cols));
    const gridCols = `grid-template-columns:56px ${ttDays.map(d => d === 5 ? `minmax(${130 * friN}px, ${friN}fr)` : 'minmax(130px, 1fr)').join(' ')}`;
    const span = this.END - this.START;
    let h = `<div class="tt2"><div class="tt2-head" style="${gridCols}"><div></div>${ttDays.map(d => `<div class="tt2-wd ${d === 0 ? 'sun' : d === 6 ? 'sat' : ''}${d === tdow ? ' today' : ''}">${DOW[d]}${d === tdow ? '<span class="tt2-today">오늘</span>' : ''}</div>`).join('')}</div>
      <div class="tt2-body" style="${gridCols}"><div class="tt2-time">`;
    for (let t = this.START; t < this.END; t += 60) {
      const hr = t / 60;
      h += `<span style="top:calc(var(--ppm) * ${t - this.START})">${hr > 12 ? hr - 12 : hr}시</span>`;
    }
    h += '</div>';
    cols.forEach(col => {
      const isToday = col.dow === tdow;
      h += `<div class="tt2-col${isToday ? ' today' : ''}">`;
      if (isToday) h += '<div class="tt2-now" hidden></div>';   // 현재 시각 선
      col.items.forEach(it => {
        const s = Math.max(it.s, this.START), e = Math.min(it.e, this.END);
        if (e <= s) return;
        const w = 100 / it.cols;
        const c = it.c;
        const cc = Classes.colorOf(c);
        h += `<div class="tt-blk${it.indiv ? ' indiv' : ''}" data-cls="${c.id}"${isToday ? ` data-end="${it.e}"` : ''} title="${esc(c.name)}${it.indiv ? ' · 금요일 개인 시간' : ''}${viewOnly ? '' : ' — 눌러서 반 수정'}"
          style="--c:${cc};top:calc(var(--ppm) * ${s - this.START} + 1px);height:calc(var(--ppm) * ${e - s} - 3px);left:calc(${it.col * w}% + 3px);width:calc(${w}% - 6px);background:${this.blkBg(it, cc, isToday)};border-color:${cc}73;box-shadow:inset 5px 0 0 ${cc}">
          <div class="hd"><div class="nm" style="color:var(--ink)"><b>${esc(c.name)}${this.indivTag(it)}</b></div>
          <div class="tm">${esc(this.timeText(it, col.dow))} · ${this.cntText(it)}</div></div>
          <div class="sts-g">${this.groupedHtml(it.roster, it.up, (sid, date) => Classes.partDays(c.id, sid, date || today))}${this.guestsHtml(it, today)}</div></div>`;
      });
      h += '</div>';
    });
    h += '</div></div>';
    return { html: h, span, gridCols };
  },

  render(main) {
    const today = todayStr();
    const g = this.gridHtml(today);
    const span = g.span;
    let h = `<div class="page-head"><h1>시간표</h1><span class="sub">블록을 누르면 반 정보를 수정합니다</span></div>` + g.html;
    h += `<div class="bc2-resize tt2-resize" title="끌어서 시간표 높이 조절"><span></span></div>`;
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
    // 웹폰트(Pretendard)가 늦게 받아지면 글자 폭이 바뀌므로, 다 받아진 뒤 한 번 더 맞춤
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (box.isConnected) this.fitStudents(main); });

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
    this.startNow(main, today);
  },

  // 오늘 끝난 수업은 흐리게, 오늘 칸에는 현재 시각 선. 다시 그리지 않고 표시만 바꾸므로 부담이 거의 없다.
  // 매 분 0초에 맞춰 1분마다 실행 (시간표를 떠나면 멈춤)
  startNow(main, day) {
    this.stopNow();
    const tick = () => {
      const col = $('.tt2-col.today', main);
      if (!main.isConnected || App.page !== 'timetable') { this.stopNow(); return; }
      if (todayStr() !== day) { this.stopNow(); App.render(); return; }   // 자정이 지나면 오늘 요일이 바뀜
      if (!col) return;                                                   // 주말: 오늘 칸 없음
      this.paintNow(col);
    };
    tick();
    const d = new Date();
    this.nowTimer = setTimeout(() => { tick(); this.nowTimer = setInterval(tick, 60000); }, (60 - d.getSeconds()) * 1000 - d.getMilliseconds() + 50);
  },
  stopNow() {
    if (this.nowTimer) { clearTimeout(this.nowTimer); clearInterval(this.nowTimer); this.nowTimer = null; }
  },
  // 오늘 칸(col)에 끝난 수업 흐림 + 현재 시각 선 표시 (페이지·팝업 공용)
  paintNow(col) {
    const d = new Date(), now = d.getHours() * 60 + d.getMinutes();
    $$('.tt-blk[data-end]', col).forEach(b => b.classList.toggle('done', now >= +b.dataset.end));
    const line = $('.tt2-now', col);
    if (line) {
      line.hidden = now < this.START || now > this.END;
      line.style.setProperty('--nowm', now - this.START);
    }
  },

  /* ---------- 시간표 팝업 (왼쪽 메뉴의 시간표 아이콘) ----------
     시간표 페이지에서 보이는 크기(너비·높이) 그대로 시간표만 띄운다. 보기 전용 (블록을 눌러도 반응 없음).
     화면보다 클 때만 스크롤. */
  popup: null,
  openPopup() {
    if (this.popup && !this.popup.closed) return;
    let timer = null, onResize = null;
    const m = Modal.open({
      title: '시간표', size: 'tt-pop', autofocus: false,
      onMount: (body, mm) => {
        mm.refresh = () => { if (!mm.closed) this.popupRender(mm); };   // 다른 기기에서 바뀐 내용이 들어오면 다시 그림
        this.popupRender(mm);
        this.popupMoveResize(mm);
        onResize = debounce(() => mm.refresh(), 200);
        window.addEventListener('resize', onResize);
        // 현재 시각 선·끝난 수업: 매 분 0초에 맞춰 1분마다 (자정이 지나면 다시 그림)
        const tick = () => {
          if (mm.closed) return;
          if (todayStr() !== mm.day) { mm.refresh(); return; }
          const col = $('.tt2-col.today', mm.body);
          if (col) this.paintNow(col);
        };
        const d = new Date();
        timer = setTimeout(() => { tick(); timer = setInterval(tick, 60000); }, (60 - d.getSeconds()) * 1000 - d.getMilliseconds() + 50);
      },
      onClose: () => {
        clearTimeout(timer); clearInterval(timer);
        if (onResize) window.removeEventListener('resize', onResize);
        document.body.classList.remove('ttp-drag');
        this.popup = null;
      },
    });
    this.popup = m;
  },
  // 시간표 페이지의 크기를 계산해 팝업 안에 같은 크기로 그린다
  popupRender(m) {
    const today = todayStr();
    m.day = today;
    const g = this.gridHtml(today, true);
    const span = g.span;
    const main = $('#main');
    const cs = getComputedStyle(main);
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0, padT = parseFloat(cs.paddingTop) || 0;
    // 시간표 페이지에서 시간표 폭 = 본문 영역 폭 (최소 1000px, CSS의 .tt2 min-width와 같음)
    const W = Math.max(1000, Math.floor(main.offsetWidth - padL - padR));
    // 시간표 페이지의 제목줄·요일줄·높이 손잡이 높이를 화면 밖에서 재어, 페이지와 같은 높이를 구한다
    const probe = document.createElement('div');
    probe.className = 'tt-probe';
    probe.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;visibility:hidden;pointer-events:none`;
    probe.innerHTML = `<div class="page-head"><h1>시간표</h1><span class="sub">블록을 누르면 반 정보를 수정합니다</span></div>${g.html}<div class="bc2-resize tt2-resize"><span></span></div>`;
    $('.tt2', probe).style.setProperty('--ppm', '0px');
    document.body.appendChild(probe);
    const ph = $('.page-head', probe);
    const phTopOnPage = main.getBoundingClientRect().top + padT + (parseFloat(getComputedStyle(ph).marginTop) || 0);
    const bodyTop = phTopOnPage + ($('.tt2-body', probe).getBoundingClientRect().top - ph.getBoundingClientRect().top);
    const gripH = $('.tt2-resize', probe).offsetHeight;
    probe.remove();
    const sb = $('#sync-bar');
    const bottom = Math.min(sb.getBoundingClientRect().top, window.innerHeight - sb.offsetHeight);
    const minH = span * 0.8;
    const fit = bottom - bodyTop - gripH - 3;
    const H = Math.max(minH, (App.page === 'timetable' && this.userH) || fit);
    m.body.innerHTML = g.html;
    const box = $('.tt2', m.body);
    box.style.width = W + 'px';
    box.style.setProperty('--ppm', (H / span) + 'px');
    this.fitStudents(m.body);
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (box.isConnected) this.fitStudents(m.body); });
    const col = $('.tt2-col.today', m.body);
    if (col) this.paintNow(col);
    if (m.fitBox) m.fitBox();   // 사용자가 줄여 둔 크기는 새 시간표 크기 안으로만 맞춤
  },
  // 팝업 이동(아무 곳이나 잡고 끌기) + 크기 줄이기(좌·우·아래 끝, 아래 두 모서리 끌기)
  // 처음 크기보다 크게는 늘어나지 않고, 줄어든 만큼 팝업 안에 스크롤이 생긴다. 닫으면 다음엔 처음 크기·가운데.
  popupMoveResize(m) {
    const box = $('.mg-modal', m.el);
    const MIN_W = 300, MIN_H = 200;
    ['l', 'r', 'b', 'bl', 'br'].forEach(d => box.insertAdjacentHTML('beforeend', `<div class="ttp-rz ${d}" data-rz="${d}"></div>`));
    // 처음(최대) 크기 = 시간표 + 팝업 안쪽 여백 + 테두리
    const natural = () => {
      const t = $('.tt2', m.body), cs = getComputedStyle(m.body), bs = getComputedStyle(box);
      const bx = (parseFloat(bs.borderLeftWidth) || 0) + (parseFloat(bs.borderRightWidth) || 0);
      const by = (parseFloat(bs.borderTopWidth) || 0) + (parseFloat(bs.borderBottomWidth) || 0);
      return {
        w: t.offsetWidth + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + bx,
        h: t.offsetHeight + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + by,
      };
    };
    let fixed = false;
    // 처음 끌 때: 가운데 정렬 상태의 위치·크기를 그대로 고정 좌표로 바꾼다
    const fix = () => {
      if (fixed) return;
      const r = box.getBoundingClientRect();
      box.classList.add('ttp-fixed');
      Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      fixed = true;
    };
    m.fitBox = () => {
      if (!fixed) return;
      const n = natural();
      if (parseFloat(box.style.width) > n.w) box.style.width = n.w + 'px';
      if (parseFloat(box.style.height) > n.h) box.style.height = n.h + 'px';
    };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    box.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('.mg-x')) return;
      const rz = e.target.closest('[data-rz]');
      // 스크롤바를 누른 경우는 끌지 않음 (스크롤 그대로)
      if (!rz) {
        const b = m.body, br = b.getBoundingClientRect();
        if (b.contains(e.target) && (e.clientX >= br.left + b.clientLeft + b.clientWidth || e.clientY >= br.top + b.clientTop + b.clientHeight)) return;
      }
      e.preventDefault();
      fix();
      const d = rz ? rz.dataset.rz : '';
      const x0 = e.clientX, y0 = e.clientY;
      const l0 = parseFloat(box.style.left), t0 = parseFloat(box.style.top);
      const w0 = parseFloat(box.style.width), h0 = parseFloat(box.style.height);
      const n = natural();
      const maxH = Math.min(n.h, window.innerHeight - 40);
      document.body.style.setProperty('--ttp-cur', getComputedStyle(e.target).cursor);
      document.body.classList.add('ttp-drag');
      const mv = (ev) => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!d) {   // 이동: 화면 밖으로 완전히 사라지지 않게
          box.style.left = clamp(l0 + dx, 60 - w0, window.innerWidth - 60) + 'px';
          box.style.top = clamp(t0 + dy, 0, window.innerHeight - 40) + 'px';
          return;
        }
        if (d.includes('r')) box.style.width = clamp(w0 + dx, MIN_W, n.w) + 'px';
        if (d.includes('l')) {
          const w = clamp(w0 - dx, MIN_W, n.w);
          box.style.width = w + 'px';
          box.style.left = (l0 + w0 - w) + 'px';   // 오른쪽 끝은 제자리
        }
        if (d.includes('b')) box.style.height = clamp(h0 + dy, MIN_H, Math.max(MIN_H, maxH)) + 'px';
      };
      const up = () => {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        document.body.classList.remove('ttp-drag');
        document.body.style.removeProperty('--ttp-cur');
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  },

  // 가로 나열용: 같은 학교·학년끼리 묶어 "(이름 이름) [학교]" 로 이어서 나열, 예정 학생은 맨 끝
  // partOf(학생ID, 날짜): 일부 요일 수강이면 그 요일 → 이름에 실선 밑줄
  groupedHtml(roster, up, partOf) {
    const nm = (s, date) => {
      const d = partOf ? partOf(s.id, date) : null;
      return d ? `<span class="pt" title="${esc(s.name + ' · ' + daysLabel(d) + '요일만 수강')}">${esc(s.name)}</span>` : esc(s.name);
    };
    const groups = [];
    roster.forEach(s => {
      const t = stTag(s);
      const g = groups[groups.length - 1];
      if (g && g.t === t) g.list.push(s); else groups.push({ t, list: [s] });
    });
    const chip = (t) => t ? `<i class="sc">${esc(t)}</i>` : '';
    // 그룹 끝의 학교 레이블은 마지막 이름과 따로 둔다 (<wbr>: 자리가 모자라면 레이블만 다음 줄로)
    let out = groups.map(g => {
      const last = g.list.length - 1;
      return g.list.map((s, i) => {
        const end = i === last;
        return `<span class="n${end && !g.t ? ' gl' : ''}" title="${esc(s.name + ' ' + g.t)}">${nm(s)}</span>${end && g.t ? `<wbr><i class="sc gl">${esc(g.t)}</i>` : ''}`;
      }).join(' ');
    }).join(' ');
    if (up.length) out += ' ' + up.map(o => `<span class="n gl up" title="${esc(o.s.name + ' ' + stTag(o.s) + ' · ' + fmtDate(o.from) + '부터 수강 예정')}">${nm(o.s, o.from)}${chip(stTag(o.s))}<em>${Classes.md(o.from)}~</em></span>`).join(' ');
    return out;
  },

  // 학생 명단 글씨 크기: 시간표 전체를 같은 크기로 통일
  //  1) 블록마다 들어가는 가장 큰 크기를 구한다 (15px에서 0.5px씩 줄여 최소 10px)
  //  2) 그중 가장 작은 값을 공통 크기로 전체에 적용 (단, 공통 크기는 11px 밑으로 내려가지 않음)
  //  3) 11px로도 안 들어가는 블록만 따로 10px까지 줄이고, 그래도 넘치면 그 블록만 스크롤
  FS_MAX: 15,
  FS_COMMON_MIN: 11,
  FS_MIN: 10,
  fitStudents(main) {
    const blks = $$('.tt-blk', main);
    // 재는 동안은 스크롤바를 숨겨서, 스크롤바 폭 때문에 줄바꿈이 바뀌는 일이 없게 한다
    const best = blks.map(b => {
      b.style.overflow = 'hidden';
      let fs = this.FS_MAX;
      b.style.setProperty('--fs', fs + 'px');
      while (fs > this.FS_MIN && b.scrollHeight > b.clientHeight) { fs -= 0.5; b.style.setProperty('--fs', fs + 'px'); }
      return fs;
    });
    const common = Math.max(this.FS_COMMON_MIN, Math.min(this.FS_MAX, ...best));
    blks.forEach((b, i) => {
      b.style.setProperty('--fs', Math.min(common, best[i]) + 'px');
      b.style.overflow = '';   // CSS 기본(auto)으로 복귀 → 정말 넘칠 때만 스크롤
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

  /* ---------- 그 요일 블록 만들기 (PC·팝업·모바일 시간표 공용) ----------
     금요일 개인 시간 학생(class.ftimes)은 반 정규 블록에서 빼고,
       - 개인 시간이 다른 반 정규 블록과 시작·끝이 완전히 같으면 그 반 블록 안에 '타반' 학생으로 (guests)
       - 아니면(혼자이거나 일부만 겹침) 자기 반 색의 개별 블록 (indiv)
     반 정규 블록은 금요일에 제시간에 오는 학생·예정 학생이 없고 개인 시간 학생만 있으면 그리지 않는다. */
  dayItems(classes, dow, today) {
    const regs = [], pers = [];
    classes.filter(c => (c.days || []).includes(dow)).forEach(c => {
      const t = Classes.timeOn(c, dow);
      const s = toMin(t.start), e = s + t.duration;
      // 이 요일에 오는 학생만 (일부 요일 수강생은 그 요일 블록에만 나온다)
      const all = Classes.rosterOnDow(c.id, dow, today);
      const upAll = Classes.upcomingAt(c.id, today, Classes.rosterAt(c.id, today).map(x => x.id))
        .filter(o => { const d = Classes.partDays(c.id, o.s.id, o.from); return !d || d.includes(dow); });
      const ftOf = (sid) => (dow === Classes.FT_DOW ? Classes.ftimeOf(c, sid) : null);
      const groups = {};
      const grp = (ft) => { const k = ft.start + '|' + ft.duration; return groups[k] || (groups[k] = { c, s: toMin(ft.start), e: toMin(ft.start) + ft.duration, roster: [], up: [] }); };
      const roster = [], up = [];
      all.forEach(st => { const ft = ftOf(st.id); if (ft) grp(ft).roster.push(st); else roster.push(st); });
      upAll.forEach(o => { const ft = ftOf(o.s.id); if (ft) grp(ft).up.push(o); else up.push(o); });
      const gl = Object.values(groups);
      if (roster.length || up.length || !gl.length) regs.push({ c, s, e, roster, up, guests: [] });
      gl.forEach(g => pers.push(g));
    });
    const ord = (c) => { const d = Classes.firstDay(c); return d == null ? 99 : DAY_ORDER.indexOf(d); };
    const items = regs.slice();
    pers.forEach(p => {
      const host = regs.filter(r => r.c.id !== p.c.id && r.s === p.s && r.e === p.e).sort((a, b) => ord(a.c) - ord(b.c) || ko(a.c.name, b.c.name))[0];
      if (host) {
        p.roster.forEach(st => host.guests.push({ c: p.c, s: st }));
        p.up.forEach(o => host.guests.push({ c: p.c, s: o.s, from: o.from }));
      } else items.push({ c: p.c, s: p.s, e: p.e, roster: p.roster, up: p.up, guests: [], indiv: true });
    });
    return items;
  },
  // 블록 배경: 개별 블록은 반 색 빗금
  blkBg(it, cc, isToday) {
    const base = isToday ? `linear-gradient(${cc}1F,${cc}1F),#fff` : cc + '1F';
    return it.indiv ? `repeating-linear-gradient(135deg,${cc}26 0 5px,transparent 5px 11px),${isToday ? '#fff' : cc + '12'}` : base;
  },
  indivTag(it) { return it.indiv ? ' <span class="ind-tag">개인</span>' : ''; },
  timeText(it, dow) { return it.indiv ? Classes.ftLabel({ start: fromMin(it.s), duration: it.e - it.s }) : Classes.dayTimeLabel(it.c, dow); },
  cntText(it, short) {
    const g = (it.guests || []).filter(x => !x.from).length, gu = (it.guests || []).filter(x => x.from).length;
    if (short) return `${it.roster.length}명${g ? `+타${g}` : ''}${it.up.length + gu ? `+${it.up.length + gu}` : ''}`;
    return `${it.roster.length}명${g ? ` + 타반 ${g}명` : ''}${it.up.length + gu ? ` +${it.up.length + gu} 예정` : ''}`;
  },
  // 다른 반 학생(금요일 개인 시간)이 이 블록에 함께 있을 때: 자기 반 색 점 + 점선 칩
  guestsHtml(it, today) {
    const gs = it.guests || [];
    if (!gs.length) return '';
    return ' ' + gs.map(o => {
      const cc = Classes.colorOf(o.c), tg = stTag(o.s);
      return `<span class="n gl gst${o.from ? ' up' : ''}" data-cls="${o.c.id}" style="--gc:${cc}" title="${esc(o.s.name + ' ' + tg + ' · ' + o.c.name + ' 반 (금요일 개인 시간)' + (o.from ? ' · ' + fmtDate(o.from) + '부터 수강 예정' : ''))}"><b></b>${esc(o.s.name)}${tg ? `<i class="sc">${esc(tg)}</i>` : ''}${o.from ? `<em>${Classes.md(o.from)}~</em>` : ''}</span>`;
    }).join(' ');
  },

  // 금요일 전용 배치: 다른 요일 한 칸 폭의 슬롯을 나란히 둔다
  //  - 반의 첫 요일이 앞선 반부터(월수금 → 화목금 → … → 금) 차례로,
  //    그 시간에 비어 있는 가장 왼쪽 슬롯에 넣는다 → 혼자 있는 반은 항상 왼쪽
  //  - 슬롯은 평소 2개, 동시에 3개 이상 겹칠 때만 그만큼 늘어난다
  layoutFri(items) {
    const ord = (c) => { const d = Classes.firstDay(c); return d == null ? 99 : DAY_ORDER.indexOf(d); };
    const sorted = [...items].sort((a, b) => ord(a.c) - ord(b.c) || a.s - b.s);
    const slots = [];
    sorted.forEach(it => {
      let ci = slots.findIndex(list => list.every(o => o.e <= it.s || o.s >= it.e));
      if (ci < 0) { ci = slots.length; slots.push([]); }
      slots[ci].push(it); it.col = ci;
    });
    const n = Math.max(2, slots.length);
    items.forEach(it => { it.cols = n; });
    return items;
  },
};

/* ---------- 반 드롭다운 색 점: 선택이 바뀌면 바로 앞 점의 색을 바꾼다 (모든 반 드롭다운 공통) ---------- */
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || t.tagName !== 'SELECT') return;
  const d = t.previousElementSibling;
  if (!d || !d.hasAttribute('data-clsdot')) return;
  const c = t.value ? Store.get('classes', t.value) : null;
  d.style.background = c ? Classes.colorOf(c) : 'transparent';
}, true);
