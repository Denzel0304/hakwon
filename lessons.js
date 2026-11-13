/* =========================================================
   lessons.js — 수업일지(입력 전용) / 출석부 / 진도 / 결석 보강
   lesson: id = L_반ID_YYYYMMDD, { classId, date, progress, homework, memo, att:{학생ID:'P'|'L'|'A'|'E'}, npExams, np, dist, gp }  (np·dist: 아래 내신 진도 / gp: 비내신 진도)
   todo:   { lessonId, classId, date(할일 날짜), text, done, createdAt }
   makeup: id = M_수업ID_학생ID, { lessonId, studentId, classId, absentDate, date, time, status, memo, distGot:[배부 자료 순번] }
           결석 예정이면 + { pre:true, absKey, createdAt } — 출결(att)에는 쓰지 않고, 그 날 출결이 따로 기록되기 전까지
           출석부·수업일지·보강에서 '결석'으로 본다. status 'skip'(보강 안 함)은 보강 목록에서 지운 것으로 보고 어디에도 보이지 않는다
   결석 예정 할일: 일반 할일(lessonId·classId 없음) + absKey = AB_학생ID_YYYYMMDD
   결석 예정 할일 템플릿(meta): id ABT_…, { kind:'abs_tpl', text, off(결석일 기준 며칠 뒤), importance, memo, remind, checklist, time, createdAt }
   결석 예정 할일의 날짜는 결석일 기준 (숙제 안내 = 결석일 당일, 그 날 수업이 끝나는 시각)
   일지 건너뛰기(meta 테이블): id = SK_반ID_YYYYMMDD, { kind:'lskip', classId, date, reason, createdAt }
   결석 후 첫 등원 할일: 일반 할일 id = TDR_학생ID_YYYYMMDD(결석일) + retKey · 만든 기록(meta) id = RT_학생ID_YYYYMMDD, { kind:'ret_todo', studentId, absentDate, createdAt }
   ========================================================= */
const ATT = { P: '출석', L: '지각', A: '결석', E: '조퇴' };
const ATT_SHORT = { P: '출', L: '지', A: '결', E: '조' };
const MK_STATUS = { none: '미지정', plan: '예정', done: '완료', skip: '보강 안 함' };

/* =========================================================
   내신 진도 — 교재 · 시험 범위 · 진도 · 수업 준비 · 배부 자료 (공용)
   교재(meta):      id MT_…, { kind:'mat', type:'mock'|'text'|'sub', name, year, month, grade, units:[{ id, name }], createdAt }  ← 시험 교재
                    id MT_…, { kind:'mat', type:'gen', name, units:[{ id, name }], classIds:[반ID], createdAt }               ← 일반 교재 (비내신, 시험 범위에는 못 씀)
   시험(exams):      done: true 이면 완료된 시험 → 수업일지·진도 요약의 시험 후보에서 빠짐 (진도 기간 계산에는 그대로 쓰임)
   시험 범위(exams): items:[ { matId, nums:[] }                                  ← 모의고사 (18~45번)
                             { matId, units:[{ id(단위ID), note, nums:[] }] } ]  ← 교과서·부교재 (nums 비면 단위 전체)
   수업일지(lessons): npExams:[시험ID], np:[ { matId, nums:[] }                  ← 모의고사: 이 날 나간 번호
                                            { matId, unitId, nums:[], text, done } ] ← 과·강: 번호 / 메모 / 완결
                      dist:[ { name, refs:['교재ID' | '교재ID:단위ID'], memo } ]  ← 배부 자료
                      gp:[ { matId(일반 교재), unitId, text, done } ]             ← 비내신 진도 (내신과 동시에 쓰지 않음)
   수동 진도(meta):  id PM_반ID_시험ID, { kind:'pman', classId, examId, mats:{ 교재ID: 표시 } }   (날짜 없이 끝낸 것으로 표시)
   수업 준비(meta):  id PP_교재ID, { kind:'prep', matId, mark: 표시 }                              (교재 기준, 모든 반 공통)
   표시 = { nums:[], units:{ 단위ID: true }, unums:{ 단위ID: [번호] } }
   ========================================================= */
const MAT_TYPE = { mock: '모의고사', text: '교과서', sub: '부교재' };
const MAT_ORDER = { mock: 0, text: 1, sub: 2, gen: 3 };
const NP = {
  MOCK_MIN: 18, MOCK_MAX: 45,

  /* ---------- 교재 ---------- */
  mats() { return Store.where('meta', m => m.kind === 'mat'); },
  mat(id) { const m = Store.get('meta', id); return m && m.kind === 'mat' ? m : null; },
  examMats() { return this.mats().filter(m => m.type !== 'gen'); },       // 시험 교재 (시험 범위에 쓰는 것)
  genMats() { return this.mats().filter(m => m.type === 'gen'); },        // 일반 교재 (비내신)
  // 수업 진도용 일반 교재인지 (듣기·단어는 진도를 나가지 않으므로 수업일지·비내신 요약에서 뺀다)
  isLessonMat(m) { return !!m && m.cat !== 'listen' && m.cat !== 'word'; },
  // 이 반에 연결된 일반 교재 (+ 이미 기록에 쓴 교재는 연결을 풀었어도 보이게) — 독해·문법만
  genMatsFor(classId, extraIds) {
    const ex = new Set(extraIds || []);
    return this.genMats().filter(m => this.isLessonMat(m) && ((m.classIds || []).includes(classId) || ex.has(m.id))).sort((a, b) => ko(a.name, b.name));
  },
  matName(m) {
    if (!m) return '(삭제된 교재)';
    return m.type === 'mock' ? `${String(m.year).slice(-2)}년 ${m.month}월 ${gradeLabel(m.grade)} 모의고사` : (m.name || '');
  },
  // 칩·문장에 쓰는 짧은 이름
  shortName(m) {
    if (!m) return '(삭제된 교재)';
    return m.type === 'mock' ? `${String(m.year).slice(-2)}년${m.month}월 모의` : (m.name || '');
  },
  unitName(m, uid) { const u = m && (m.units || []).find(x => x.id === uid); return u ? u.name : '(삭제된 단위)'; },
  sortMats(list) {
    return list.sort((a, b) => (MAT_ORDER[a.type] - MAT_ORDER[b.type])
      || (a.type === 'mock' ? (b.year - a.year) || (b.month - a.month) || (a.grade - b.grade) : ko(a.name, b.name)));
  },

  /* ---------- 번호 ---------- */
  parseNums(txt, min, max) {
    const nums = new Set(), bad = [];
    String(txt || '').split(/[\s,./]+/).filter(Boolean).forEach(tok => {
      let m;
      if ((m = tok.match(/^(\d{1,3})[-~](\d{1,3})$/))) {
        const a = +m[1], b = +m[2];
        if (a < min || b > max || a > b) { bad.push(tok); return; }
        for (let i = a; i <= b; i++) nums.add(i);
      } else if (/^\d{1,3}$/.test(tok) && +tok >= min && +tok <= max) nums.add(+tok);
      else bad.push(tok);
    });
    return { nums: [...nums].sort((a, b) => a - b), bad };
  },
  // [23,25,28,31,32,33] → "23, 25, 28, 31-33"
  compress(arr) {
    const a = [...new Set((arr || []).map(Number))].filter(n => n > 0).sort((x, y) => x - y);
    const out = [];
    for (let i = 0; i < a.length; i++) {
      let j = i;
      while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
      out.push(j - i >= 2 ? a[i] + '-' + a[j] : (j > i ? a[i] + ', ' + a[j] : String(a[i])));
      i = j;
    }
    return out.join(', ');
  },

  /* ---------- 시험 ---------- */
  sch(s) { return schoolShort(s || ''); },
  examLabel(ex) { return `${this.sch(ex.school)}${gradeNum(ex.grade)} · ${ex.year}년 ${ex.semester}학기 ${EXAM_KIND[ex.kind] || ''}`; },
  examDates(ex) { return ex.start ? fmtMD(ex.start) + (ex.end && ex.end !== ex.start ? '~' + fmtMD(ex.end) : '') : '날짜 미정'; },
  examKey(e) { return (+e.year) * 100 + (+e.semester) * 10 + (e.kind === 'final' ? 1 : 0); },
  examsFor(school, grade) { const s = this.sch(school); return Store.where('exams', e => s && this.sch(e.school) === s && +e.grade === +grade); },
  // 날짜가 속한 학기 (3~8월 1학기 / 9~12월 2학기 / 1~2월은 지난해 2학기)
  term(date) {
    const y = +date.slice(0, 4), m = +date.slice(5, 7);
    return m >= 3 && m <= 8 ? { year: y, sem: 1 } : m >= 9 ? { year: y, sem: 2 } : { year: y - 1, sem: 2 };
  },
  // 이 날짜의 "이번 시험": 아직 끝나지 않은 가장 가까운 시험 → 없으면 이번 학기의 날짜 미정 시험
  autoExam(school, grade, date) {
    const list = this.examsFor(school, grade).filter(e => !e.done);     // 완료된 시험은 자동 선택하지 않음
    const dated = list.filter(e => e.start && (e.end || e.start) >= date).sort((a, b) => ko(a.start, b.start));
    if (dated.length) return dated[0];
    const t = this.term(date);
    const und = list.filter(e => !e.start && +e.year === t.year && +e.semester === t.sem).sort((a, b) => this.examKey(a) - this.examKey(b));
    return und[0] || null;
  },
  // 반 학생들의 학교·학년 묶음
  groupsOf(classId, date) {
    const seen = {}, out = [];
    Classes.rosterOn(classId, date).forEach(s => {
      const sc = this.sch(s.school);
      if (!sc || !+s.grade) return;
      const k = sc + '|' + s.grade;
      if (!seen[k]) { seen[k] = 1; out.push({ school: sc, grade: +s.grade }); }
    });
    return out;
  },
  autoExams(classId, date) {
    const seen = {}, out = [];
    this.groupsOf(classId, date).forEach(g => {
      const a = this.autoExam(g.school, g.grade, date); if (!a) return;
      // 같은 시험(학교·학년·연도·학기·중간/기말)으로 여러 건 등록된 것도 함께 고른다
      this.examsFor(g.school, g.grade).filter(e => !e.done && this.sameKey(e) === this.sameKey(a))
        .forEach(e => { if (!seen[e.id]) { seen[e.id] = 1; out.push(e); } });
    });
    return out;
  },
  // 같은 시험으로 묶는 기준: 학교·학년·연도·학기·중간/기말
  sameKey(e) { return [this.sch(e.school), +e.grade, +e.year, +e.semester, e.kind].join('|'); },
  // 시험 목록을 같은 시험끼리 묶음 (순서 유지) → [{ ex(대표), ids:[...], exams:[...] }]
  groupExams(list) {
    const map = {}, out = [];
    list.forEach(e => {
      const k = this.sameKey(e);
      if (!map[k]) { map[k] = { ex: e, ids: [], exams: [] }; out.push(map[k]); }
      map[k].ids.push(e.id); map[k].exams.push(e);
    });
    return out;
  },
  // 묶음 버튼 누름: 하나라도 골라져 있으면 묶음 전체를 빼고, 아니면 묶음 전체를 넣는다
  toggleGroup(cur, ids) {
    return ids.some(id => cur.includes(id)) ? cur.filter(id => !ids.includes(id)) : cur.concat(ids.filter(id => !cur.includes(id)));
  },
  // 고를 수 있는 시험 (반 학생들의 학교·학년 시험, 최근 것 먼저) + 이미 고른 시험
  candExams(classId, date, sel) {
    const seen = {};
    const list = [];
    this.groupsOf(classId, date).forEach(g => this.examsFor(g.school, g.grade).filter(e => !e.done).forEach(e => { if (!seen[e.id]) { seen[e.id] = 1; list.push(e); } }));
    (sel || []).forEach(id => { const e = Store.get('exams', id); if (e && !seen[e.id]) { seen[e.id] = 1; list.push(e); } });
    return list.sort((a, b) => this.examKey(b) - this.examKey(a) || ko(this.sch(a.school), this.sch(b.school)) || a.grade - b.grade);
  },
  // 진행중인 시험만 남김 (진도 탭 요약에서 고른 시험 중 완료 처리된 것은 뺀다)
  liveIds(ids) { return (ids || []).filter(id => { const e = Store.get('exams', id); return e && !e.done; }); },
  // 이 시험을 위한 진도로 셀 기간: 바로 앞 시험이 끝난 다음날 ~ 이 시험 끝나는 날
  window(ex) {
    const prev = this.examsFor(ex.school, ex.grade).filter(e => e.id !== ex.id && e.end && this.examKey(e) < this.examKey(ex) && (!ex.start || e.end < ex.start));
    let from;
    if (prev.length) from = addDaysStr(prev.map(e => e.end).sort().pop(), 1);
    else if (ex.start) from = addDaysStr(ex.start, -150);
    else from = (+ex.semester === 1 ? ex.year + '-02-01' : ex.year + '-07-01');
    return { from, to: ex.end || ex.start || '9999-12-31' };
  },

  /* ---------- 시험 범위 (여러 시험을 합침) ---------- */
  // → [{ mat, nums:[] } | { mat, units:[{ id, name, nums:[]|null(전체), notes:[] }] }]
  rangeOf(exams) {
    const multi = new Set(exams.map(e => this.sch(e.school) + '|' + e.grade)).size > 1;   // 같은 시험 여러 건은 한 시험으로 본다
    const map = {};
    exams.forEach(ex => (ex.items || []).forEach(it => {
      const m = this.mat(it.matId); if (!m) return;
      const r = map[m.id] = map[m.id] || { mat: m, nums: new Set(), units: {} };
      if (m.type === 'mock') (it.nums || []).forEach(n => r.nums.add(+n));
      else (it.units || []).forEach(u => {
        if (!(m.units || []).some(x => x.id === u.id)) return;
        const ru = r.units[u.id] = r.units[u.id] || { id: u.id, nums: new Set(), whole: false, notes: [] };
        if (u.nums && u.nums.length) u.nums.forEach(n => ru.nums.add(+n)); else ru.whole = true;
        if (u.note && u.note.trim()) ru.notes.push((multi ? this.sch(ex.school) + ': ' : '') + u.note.trim());
      });
    }));
    return this.sortMats(Object.values(map).map(r => r.mat)).map(m => {
      const r = map[m.id];
      if (m.type === 'mock') return { mat: m, nums: [...r.nums].sort((a, b) => a - b) };
      const units = (m.units || []).filter(u => r.units[u.id]).map(u => {
        const ru = r.units[u.id];
        return { id: u.id, name: u.name, nums: ru.whole || !ru.nums.size ? null : [...ru.nums].sort((a, b) => a - b), notes: ru.notes };
      });
      return { mat: m, units };
    }).filter(r => r.mat.type === 'mock' ? r.nums.length : r.units.length);
  },
  // 시험정보 목록·요약에 쓰는 범위 문장
  rangeText(ex) {
    return this.rangeOf([ex]).map(r => r.mat.type === 'mock'
      ? `${this.matName(r.mat)} ${this.compress(r.nums)}`
      : `${r.mat.name} ` + r.units.map(u => u.name + (u.nums ? ' ' + this.compress(u.nums) + '번' : '') + (u.notes.length ? '(' + u.notes.join(', ') + ')' : '')).join(', ')).join('\n');
  },

  /* ---------- 표시(수동 진도·수업 준비) ---------- */
  emptyMark() { return { nums: [], units: {}, unums: {} }; },
  normMark(k) { k = k || {}; return { nums: (k.nums || []).slice(), units: Object.assign({}, k.units || {}), unums: JSON.parse(JSON.stringify(k.unums || {})) }; },
  toggleIn(arr, n) { const i = arr.indexOf(n); if (i >= 0) arr.splice(i, 1); else arr.push(n); arr.sort((a, b) => a - b); return arr; },
  toggleMark(k, what, uid, n) {
    if (what === 'num') this.toggleIn(k.nums, n);
    else if (what === 'unit') { if (k.units[uid]) delete k.units[uid]; else k.units[uid] = true; }
    else { k.unums[uid] = this.toggleIn(k.unums[uid] || [], n); if (!k.unums[uid].length) delete k.unums[uid]; }
    return k;
  },
  pmId(classId, examId) { return 'PM_' + classId + '_' + examId; },
  ppId(matId) { return 'PP_' + matId; },
  prepOf(matId) { const r = Store.get('meta', this.ppId(matId)); return this.normMark(r && r.mark); },
  togglePrep(matId, what, uid, n) {
    const k = this.toggleMark(this.prepOf(matId), what, uid, n);
    Store.put('meta', { id: this.ppId(matId), kind: 'prep', matId, mark: k });
  },
  toggleManual(classId, examId, matId, what, uid, n) {
    const id = this.pmId(classId, examId);
    const r = Store.get('meta', id) || { id, kind: 'pman', classId, examId, mats: {} };
    const mats = JSON.parse(JSON.stringify(r.mats || {}));
    mats[matId] = this.toggleMark(this.normMark(mats[matId]), what, uid, n);
    Store.put('meta', Object.assign({}, r, { mats }));
  },

  // 묶인 시험들의 수동 진도 표시: 어느 하나에 표시가 있으면 모두에서 지우고, 없으면 이 교재가 들어 있는 시험에 표시
  toggleManualGroup(classId, exIds, matId, what, uid, n) {
    const has = (exId) => {
      const r = Store.get('meta', this.pmId(classId, exId));
      const k = this.normMark(r && r.mats && r.mats[matId]);
      return what === 'num' ? k.nums.includes(n) : what === 'unit' ? !!k.units[uid] : (k.unums[uid] || []).includes(n);
    };
    const on = exIds.filter(has);
    if (on.length) { on.forEach(id => this.toggleManual(classId, id, matId, what, uid, n)); return; }
    const home = exIds.find(id => { const e = Store.get('exams', id); return e && (e.items || []).some(it => it.matId === matId); }) || exIds[0];
    this.toggleManual(classId, home, matId, what, uid, n);
  },

  /* ---------- 진도 상황 ---------- */
  // 이 반이 이 시험들을 위해 나간 진도 (exclude: 지금 고치는 수업일지는 빼고 계산)
  progress(classId, exams, exclude) {
    const st = { mats: {}, man: {}, dist: [] };
    if (!exams.length) return st;
    const ws = exams.map(e => this.window(e));
    const from = ws.map(w => w.from).sort()[0], to = ws.map(w => w.to).sort().pop();
    const slot = (o, mid) => (o[mid] = o[mid] || { nums: new Set(), units: new Set(), unums: {}, last: {} });
    Store.where('lessons', l => l.classId === classId && l.id !== exclude && l.date >= from && l.date <= to)
      .sort((a, b) => ko(a.date, b.date)).forEach(l => {
        (l.np || []).forEach(en => {
          const s = slot(st.mats, en.matId);
          if (!en.unitId) { (en.nums || []).forEach(n => s.nums.add(+n)); return; }
          if (en.done) s.units.add(en.unitId);
          if (en.nums && en.nums.length) { const u = s.unums[en.unitId] = s.unums[en.unitId] || new Set(); en.nums.forEach(n => u.add(+n)); }
          if (en.text && en.text.trim()) s.last[en.unitId] = { date: l.date, text: en.text.trim() };
        });
        (l.dist || []).forEach(d => st.dist.push(Object.assign({ date: l.date, lessonId: l.id }, d)));
      });
    exams.forEach(ex => {
      const r = Store.get('meta', this.pmId(classId, ex.id));
      Object.keys((r && r.mats) || {}).forEach(mid => {
        const k = this.normMark(r.mats[mid]), s = slot(st.man, mid);
        k.nums.forEach(n => s.nums.add(+n));
        Object.keys(k.units).forEach(u => s.units.add(u));
        Object.keys(k.unums).forEach(u => { const x = s.unums[u] = s.unums[u] || new Set(); k.unums[u].forEach(n => x.add(+n)); });
      });
    });
    return st;
  },
  // 상태: 'les' 수업일지로 끝남 / 'man' 직접 끝남 표시 / '' 아직
  numSt(st, mid, n) {
    if (st.mats[mid] && st.mats[mid].nums.has(n)) return 'les';
    if (st.man[mid] && st.man[mid].nums.has(n)) return 'man';
    return '';
  },
  unumSt(st, mid, uid, n) {
    const a = st.mats[mid], b = st.man[mid];
    if (a && ((a.unums[uid] && a.unums[uid].has(n)) || a.units.has(uid))) return 'les';
    if (b && ((b.unums[uid] && b.unums[uid].has(n)) || b.units.has(uid))) return 'man';
    return '';
  },
  // 과·강: 완결 체크 / 범위 번호를 모두 나감 → 끝, 메모만 있으면 'part'(진행 중)
  unitSt(st, mid, ru) {
    const a = st.mats[mid], b = st.man[mid];
    if (a && a.units.has(ru.id)) return 'les';
    if (b && b.units.has(ru.id)) return 'man';
    if (ru.nums && ru.nums.length) {
      const all = ru.nums.map(n => this.unumSt(st, mid, ru.id, n));
      if (all.every(Boolean)) return all.includes('les') ? 'les' : 'man';
      if (all.some(Boolean)) return 'part';
    }
    if (a && (a.last[ru.id] || (a.unums[ru.id] && a.unums[ru.id].size))) return 'part';
    return '';
  },
  lastText(st, mid, uid) { const a = st.mats[mid]; return a && a.last[uid] ? a.last[uid] : null; },
  // 비내신: 이 반이 일반 교재로 나간 진도 (exclude: 지금 고치는 수업일지는 빼고 계산)
  genProgress(classId, exclude) {
    const st = { done: new Set(), any: new Set(), last: {} };
    Store.where('lessons', l => l.classId === classId && l.id !== exclude).sort((a, b) => ko(a.date, b.date)).forEach(l => {
      (l.gp || []).forEach(en => {
        const k = this.key(en.matId, en.unitId);
        st.any.add(k);
        if (en.done) st.done.add(k);
        if (en.text && en.text.trim()) st.last[k] = { date: l.date, text: en.text.trim() };
      });
    });
    return st;
  },
  genSt(st, mid, uid) { const k = this.key(mid, uid); return st.done.has(k) ? 'les' : st.any.has(k) ? 'part' : ''; },
  prepNum(k, n) { return k.nums.includes(n); },
  prepUnit(k, ru) { return !!k.units[ru.id] || !!(ru.nums && ru.nums.length && ru.nums.every(n => (k.unums[ru.id] || []).includes(n))); },
  prepUnum(k, uid, n) { return !!k.units[uid] || (k.unums[uid] || []).includes(n); },

  /* ---------- 문장으로 (진도 목록·보강 복사) ---------- */
  refLabel(ref) {
    const [mid, uid] = String(ref).split(':');
    const m = this.mat(mid);
    return this.shortName(m) + (uid ? ' ' + this.unitName(m, uid) : '');
  },
  text(l) {
    const groups = {};
    (l.np || []).forEach(en => { (groups[en.matId] = groups[en.matId] || []).push(en); });
    return Object.keys(groups).map(mid => {
      const m = this.mat(mid), ens = groups[mid];
      if (m && m.type === 'mock') return this.shortName(m) + ' ' + this.compress([].concat(...ens.map(e => e.nums || []))) + '번';
      return this.shortName(m) + ' ' + ens.map(e => this.unitName(m, e.unitId)
        + (e.nums && e.nums.length ? ' ' + this.compress(e.nums) + '번' : '')
        + (e.text && e.text.trim() ? ' ' + e.text.trim() : '') + (e.done ? '(완결)' : '')).join(', ');
    }).join(' / ');
  },
  // 비내신 진도 문장
  genText(l) {
    const groups = {};
    (l.gp || []).forEach(en => { (groups[en.matId] = groups[en.matId] || []).push(en); });
    return Object.keys(groups).map(mid => {
      const m = this.mat(mid);
      return this.shortName(m) + ' ' + groups[mid].map(e => this.unitName(m, e.unitId)
        + (e.text && e.text.trim() ? ' ' + e.text.trim() : '') + (e.done ? '(완결)' : '')).join(', ');
    }).join(' / ');
  },
  distText(d) { return (d.name || '자료') + ': ' + (d.refs || []).map(r => this.refLabel(r)).join(', ') + (d.memo ? ' ' + d.memo : ''); },
  distNames() {
    const set = new Set();
    Store.all('lessons').forEach(l => (l.dist || []).forEach(d => { if (d.name && d.name.trim()) set.add(d.name.trim()); }));
    return [...set].sort(ko);
  },

  /* ---------- 수업일지 입력 (수업일지 탭 · 진도 탭 수정 창 공용) ---------- */
  // 입력 상태: { on(내신), exams:null(자동)|[시험ID], items:{ 키: 항목 }, dist:[{ name, refs, memo }], gen(비내신), gitems:{ 키: { matId, unitId, text, done } } }
  // 내신(on)과 비내신(gen)은 둘 중 하나만 켤 수 있다
  newState() { return { on: false, exams: null, items: {}, dist: [], gen: false, gitems: {} }; },
  key(mid, uid) { return uid ? mid + ':' + uid : mid; },
  fromLesson(l) {
    const st = this.newState();
    if (!l) return st;
    (l.np || []).forEach(en => { st.items[this.key(en.matId, en.unitId)] = JSON.parse(JSON.stringify(en)); });
    st.dist = JSON.parse(JSON.stringify(l.dist || []));
    st.exams = l.npExams && l.npExams.length ? l.npExams.slice() : null;
    st.on = !!((l.np && l.np.length) || st.dist.length || (l.npExams && l.npExams.length));
    (l.gp || []).forEach(en => { st.gitems[this.key(en.matId, en.unitId)] = JSON.parse(JSON.stringify(en)); });
    st.gen = !st.on && !!(l.gp && l.gp.length);
    return st;
  },
  selExams(st, ctx) {
    const ids = st.exams || this.autoExams(ctx.classId, ctx.date).map(e => e.id);
    return ids.map(id => Store.get('exams', id)).filter(Boolean);
  },
  // 수업일지에 저장할 값 (내신을 끄면 모두 비움)
  toLesson(st, ctx) {
    if (st.gen) {   // 비내신: 일반 교재 진도만
      const gp = Object.values(st.gitems).filter(en => { const m = this.mat(en.matId); return m && (m.units || []).some(u => u.id === en.unitId); })
        .map(en => ({ matId: en.matId, unitId: en.unitId, text: stripZws(en.text || '').trim(), done: !!en.done }));
      return { np: [], npExams: [], dist: [], gp };
    }
    if (!st.on) return { np: [], npExams: [], dist: [], gp: [] };
    const np = Object.values(st.items).map(en => {
      const e = { matId: en.matId };
      if (en.unitId) { e.unitId = en.unitId; e.nums = (en.nums || []).slice(); e.text = stripZws(en.text || '').trim(); e.done = !!en.done; }
      else e.nums = (en.nums || []).slice();
      return e;
    }).filter(e => (e.nums && e.nums.length) || e.text || e.done || e.unitId);
    const dist = st.dist.map(d => Object.assign({ name: (d.name || '').trim(), refs: (d.refs || []).slice(), memo: (d.memo || '').trim() }, d.grp ? { grp: d.grp } : {}))
      .filter(d => d.name || d.refs.length || d.memo);
    return { np, npExams: this.selExams(st, ctx).map(e => e.id), dist, gp: [] };
  },
  hasInput(st) {
    if (st && st.gen) return Object.keys(st.gitems).length > 0;
    return !!(st && st.on && (Object.keys(st.items).length || st.dist.some(d => (d.name || '').trim() || (d.refs || []).length)));
  },

  chipCls(s) { return s === 'les' ? 'done' : s === 'man' ? 'done man' : s === 'part' ? 'part' : ''; },
  editorHtml(st, ctx) {
    let h = `<div style="display:flex;gap:16px;flex-wrap:wrap"><label class="chk np-on"><input type="checkbox" data-np-on ${st.on ? 'checked' : ''}>내신</label>
      <label class="chk np-on"><input type="checkbox" data-np-gen ${st.gen ? 'checked' : ''}>비내신</label></div>`;
    if (st.gen) return h + this.genEditorHtml(st, ctx);
    if (!st.on) return h;
    const sel = this.selExams(st, ctx);
    const cands = this.candExams(ctx.classId, ctx.date, sel.map(e => e.id));
    // 등록된 시험이 없으면 안내 문구 하나만 (줄바꿈 없이 이어서)
    if (!cands.length) return h + '<div class="np-box"><div class="small muted np-msg">이 반 학생의 학교·학년으로 등록된 시험이 없습니다. 시험+교재 탭에서 시험과 범위를 등록하세요.</div></div>';
    const selIds = sel.map(e => e.id);
    h += `<div class="np-box"><div class="np-exams"><span class="small soft">시험</span>${this.groupExams(cands).map(g => `<button type="button" class="np-ex ${g.ids.some(id => selIds.includes(id)) ? 'on' : ''}" data-np-ex="${g.ids.join(',')}" title="${esc(this.examDates(g.ex))}">${esc(this.examLabel(g.ex))} <small>${esc(this.examDates(g.ex))}</small></button>`).join('')}
      ${st.exams ? '<button type="button" class="np-auto" data-np-auto title="수업 날짜 기준으로 다시 고르기">자동</button>' : ''}</div>`;
    const range = this.rangeOf(sel);
    if (!sel.length) return h + '<div class="small muted np-msg">위에서 시험을 고르세요.</div></div>';
    if (!range.length) return h + '<div class="small muted" style="padding:6px 0">고른 시험에 구조화된 시험 범위가 없습니다. 시험+교재 탭에서 범위를 입력하세요.</div></div>';
    const prog = this.progress(ctx.classId, sel, ctx.lessonId);
    // 학교별 숙제(수업일지 작성 화면만, ctx.hw): 교재를 학교·학년 순으로 모으고, 그 학교의 마지막 교재 바로 아래에 그 학교 숙제
    const hwAt = {}, own = {}, cardOf = {};      // cardOf[교재 순번] = 이 교재부터 시작하는 학교 카드 이름
    ctx.hwPlaced = new Set();
    // 배부 자료 한 줄 (i: st.dist 안의 번호, refs: 고를 수 있는 교재·단위)
    const refsOfR = (r) => r.mat.type === 'mock' ? [r.mat.id] : r.units.map(u => r.mat.id + ':' + u.id);
    const drow = (d, i, refs) => `<div class="np-drow"><input type="text" list="dl-npdist" data-np-dname="${i}" value="${esc(d.name || '')}" placeholder="자료 이름 (예: 변형문제)">
      <button type="button" class="icon-btn" data-np-ddel="${i}" title="삭제">✕</button>
      <div class="np-chips">${refs.map(rf => `<button type="button" class="np-c sm ${(d.refs || []).includes(rf) ? 'on' : ''}" data-np-dref="${i}|${rf}">${esc(this.refLabel(rf))}</button>`).join('')}</div>
      <input type="text" data-np-dmemo="${i}" value="${esc(d.memo || '')}" placeholder="메모 (선택, 예: 31-42번 / 2회분)"></div>`;
    if (ctx.hw) {
      const lbOf = (e) => this.sch(e.school) + gradeNum(e.grade);
      const lbs = [];
      sel.forEach(e => {
        const lb = lbOf(e); if (!lbs.includes(lb)) lbs.push(lb);
        (e.items || []).forEach(it => { (own[it.matId] = own[it.matId] || new Set()).add(lb); });
      });
      const first = (r) => Math.min(...[...(own[r.mat.id] || [])].map(lb => lbs.indexOf(lb)).concat(lbs.length));
      range.map((r, i) => ({ r, i })).sort((a, b) => first(a.r) - first(b.r) || a.i - b.i).forEach((x, i) => { range[i] = x.r; });
      lbs.filter(lb => ctx.hw.order.includes(lb)).forEach(lb => {
        let last = -1; range.forEach((r, i) => { if ((own[r.mat.id] || new Set()).has(lb)) last = i; });
        if (last >= 0) { (hwAt[last] = hwAt[last] || []).push(lb); ctx.hwPlaced.add(lb); }
      });
      // 학교별 카드: 학교가 바뀌는 첫 교재 위에 학교 이름 (진한 구분선)
      if (ctx.hwPlaced.size) { let prev = ''; range.forEach((r, i) => { const lb = lbs[first(r)] || ''; if (lb && lb !== prev) cardOf[i] = lb; prev = lb; }); }
    }
    range.forEach((r, ri) => {
      const m = r.mat, mid = m.id;
      h += `<div class="np-mat${cardOf[ri] ? ' np-school' : ''}">${cardOf[ri] ? `<div class="np-school-h">${esc(cardOf[ri])}</div>` : ''}<div class="np-mhead"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span><b>${esc(this.matName(m))}</b></div>`;
      if (m.type === 'mock') {
        const en = st.items[mid];
        h += '<div class="np-chips">' + r.nums.map(n => `<button type="button" class="np-c ${this.chipCls(this.numSt(prog, mid, n))} ${en && (en.nums || []).includes(n) ? 'on' : ''}" data-np-num="${mid}|${n}">${n}</button>`).join('') + '</div>';
      } else {
        const whole = r.units.filter(u => !u.nums), numbered = r.units.filter(u => u.nums);
        if (whole.length) h += '<div class="np-chips">' + whole.map(u => `<button type="button" class="np-c ${this.chipCls(this.unitSt(prog, mid, u))} ${st.items[this.key(mid, u.id)] ? 'on' : ''}" data-np-unit="${mid}|${u.id}" title="${esc(u.notes.join(' · '))}">${esc(u.name)}${u.notes.length ? '<i>일부</i>' : ''}</button>`).join('') + '</div>';
        numbered.forEach(u => {
          const en = st.items[this.key(mid, u.id)];
          h += `<div class="np-chips"><span class="np-ul">${esc(u.name)}</span>` + u.nums.map(n => `<button type="button" class="np-c ${this.chipCls(this.unumSt(prog, mid, u.id, n))} ${en && (en.nums || []).includes(n) ? 'on' : ''}" data-np-unum="${mid}|${u.id}|${n}">${n}</button>`).join('')
            + (u.notes.length ? `<span class="small soft">${esc(u.notes.join(' · '))}</span>` : '') + '</div>';
        });
        // 고른 과·강마다 메모 + 완결
        whole.filter(u => st.items[this.key(mid, u.id)]).forEach(u => {
          const k = this.key(mid, u.id), en = st.items[k], last = this.lastText(prog, mid, u.id);
          h += `<div class="np-urow"><span class="np-ul">${esc(u.name)}</span><input type="text" data-np-text="${k}" value="${esc(en.text || '')}" placeholder="${esc(last ? '지난 수업(' + fmtMD(last.date) + '): ' + last.text : '예: 본문3, 3번까지')}">
            <label class="chk small"><input type="checkbox" data-np-done="${k}" ${en.done ? 'checked' : ''}>완결</label>${u.notes.length ? `<span class="small soft">${esc(u.notes.join(' · '))}</span>` : ''}</div>`;
        });
      }
      (hwAt[ri] || []).forEach(lb => {
        h += `<div class="hw-row np-hw"><span class="hw-lb">${esc(lb)} 숙제</span><textarea data-hw="${esc(lb)}" rows="2" placeholder="${esc(lb)} 숙제 (선택)">${esc(ctx.hw.by[lb] || '')}</textarea></div>`;
        // 그 학교 배부 자료 (그 학교 교재만 고를 수 있음)
        const lbRefs = [];
        range.forEach(x => { if ((own[x.mat.id] || new Set()).has(lb)) lbRefs.push(...refsOfR(x)); });
        h += `<div class="np-sdist"><div class="np-mhead"><b>${esc(lb)} 배부 자료</b><button type="button" class="btn sm" data-np-dadd="${esc(lb)}">+ 배부 추가</button></div>`
          + st.dist.map((d, i) => d.grp === lb ? drow(d, i, lbRefs) : '').join('') + '</div>';
      });
      h += '</div>';
    });
    // 배부 자료
    const refs = [];
    range.forEach(r => refs.push(...refsOfR(r)));
    const split = ctx.hwPlaced.size > 0;                  // 학교별로 나눠 붙였는지
    const rest = st.dist.map((d, i) => [d, i]).filter(([d]) => !split || !(d.grp && ctx.hwPlaced.has(d.grp)));
    if (!split || rest.length) {
      h += `<div class="np-dist"><div class="np-mhead"><b>${split ? '배부 자료 (학교 지정 안 됨)' : '배부 자료'}</b>${split ? '' : '<button type="button" class="btn sm" data-np-dadd>+ 배부 추가</button>'}</div>`;
      h += rest.map(([d, i]) => drow(d, i, refs)).join('') + '</div>';
    }
    h += `<datalist id="dl-npdist">${this.distNames().map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
    h += '<div class="np-legend small soft"><span class="np-c done">나감</span><span class="np-c part">진행 중</span><span class="np-c on">오늘</span></div></div>';
    return h;
  },
  // 비내신 입력: 이 반에 연결된 일반 교재의 과·강을 고르고 메모·완결
  genEditorHtml(st, ctx) {
    const mats = this.genMatsFor(ctx.classId, Object.values(st.gitems).map(en => en.matId));
    if (!mats.length) return '<div class="np-box"><div class="small muted">이 반에 연결된 독해·문법 교재가 없습니다. 시험+교재 탭의 일반 교재에서 이 반을 연결하세요.</div></div>';
    const gpr = this.genProgress(ctx.classId, ctx.lessonId);
    let h = '<div class="np-box">';
    mats.forEach(m => {
      const units = m.units || [];
      h += `<div class="np-mat"><div class="np-mhead"><span class="np-tag">일반</span><b>${esc(m.name)}</b></div>`;
      h += '<div class="np-chips">' + (units.map(u => `<button type="button" class="np-c ${this.chipCls(this.genSt(gpr, m.id, u.id))} ${st.gitems[this.key(m.id, u.id)] ? 'on' : ''}" data-np-gunit="${m.id}|${u.id}">${esc(u.name)}</button>`).join('')
        || '<span class="small muted">이 교재에 단위가 없습니다.</span>') + '</div>';
      units.filter(u => st.gitems[this.key(m.id, u.id)]).forEach(u => {
        const k = this.key(m.id, u.id), en = st.gitems[k], last = gpr.last[k];
        h += `<div class="np-urow"><span class="np-ul">${esc(u.name)}</span><input type="text" data-np-gtext="${k}" value="${esc(en.text || '')}" placeholder="${esc(last ? '지난 수업(' + fmtMD(last.date) + '): ' + last.text : '예: 본문3, 3번까지')}">
          <label class="chk small"><input type="checkbox" data-np-gdone="${k}" ${en.done ? 'checked' : ''}>완결</label></div>`;
      });
      h += '</div>';
    });
    h += '<div class="np-legend small soft"><span class="np-c done">완결</span><span class="np-c part">진행 중</span><span class="np-c on">오늘</span></div></div>';
    return h;
  },
  // 이벤트 처리 → 'redraw'(다시 그림) / true(처리함) / false(관계없음)
  handle(e, st, ctx, type) {
    const t = e.target;
    if (type === 'change') {
      if (t.matches('[data-np-on]')) { st.on = t.checked; if (t.checked) st.gen = false; return 'redraw'; }     // 내신·비내신은 하나만
      if (t.matches('[data-np-gen]')) { st.gen = t.checked; if (t.checked) st.on = false; return 'redraw'; }
      if (t.matches('[data-np-gdone]')) { const en = st.gitems[t.dataset.npGdone]; if (en) en.done = t.checked; return true; }
      if (t.matches('[data-np-done]')) { const en = st.items[t.dataset.npDone]; if (en) en.done = t.checked; return true; }
      return false;
    }
    if (type === 'input') {
      if (t.matches('[data-np-text]')) { const en = st.items[t.dataset.npText]; if (en) en.text = t.value; return true; }
      if (t.matches('[data-np-gtext]')) { const en = st.gitems[t.dataset.npGtext]; if (en) en.text = t.value; return true; }
      if (t.matches('[data-np-dname]')) { const d = st.dist[+t.dataset.npDname]; if (d) d.name = t.value; return true; }
      if (t.matches('[data-np-dmemo]')) { const d = st.dist[+t.dataset.npDmemo]; if (d) d.memo = t.value; return true; }
      return false;
    }
    const b = (s) => t.closest(s);
    let x;
    if ((x = b('[data-np-ex]'))) {
      const cur = this.selExams(st, ctx).map(ex => ex.id);
      st.exams = this.toggleGroup(cur, x.dataset.npEx.split(','));
      return 'redraw';
    }
    if (b('[data-np-auto]')) { st.exams = null; return 'redraw'; }
    if ((x = b('[data-np-gunit]'))) {
      const [mid, uid] = x.dataset.npGunit.split('|'), k = this.key(mid, uid);
      if (st.gitems[k]) delete st.gitems[k]; else st.gitems[k] = { matId: mid, unitId: uid, text: '', done: false };
      return 'redraw';
    }
    if ((x = b('[data-np-num]'))) {
      const [mid, n] = x.dataset.npNum.split('|');
      const en = st.items[mid] = st.items[mid] || { matId: mid, nums: [] };
      this.toggleIn(en.nums, +n);
      if (!en.nums.length) delete st.items[mid];
      return 'redraw';
    }
    if ((x = b('[data-np-unit]'))) {
      const [mid, uid] = x.dataset.npUnit.split('|'), k = this.key(mid, uid);
      if (st.items[k]) delete st.items[k]; else st.items[k] = { matId: mid, unitId: uid, nums: [], text: '', done: false };
      return 'redraw';
    }
    if ((x = b('[data-np-unum]'))) {
      const [mid, uid, n] = x.dataset.npUnum.split('|'), k = this.key(mid, uid);
      const en = st.items[k] = st.items[k] || { matId: mid, unitId: uid, nums: [], text: '', done: false };
      this.toggleIn(en.nums, +n);
      if (!en.nums.length && !en.text && !en.done) delete st.items[k];
      return 'redraw';
    }
    if ((x = b('[data-np-dadd]'))) { st.dist.push(Object.assign({ name: '', refs: [], memo: '' }, x.dataset.npDadd ? { grp: x.dataset.npDadd } : {})); return 'redraw'; }
    if ((x = b('[data-np-ddel]'))) { st.dist.splice(+x.dataset.npDdel, 1); return 'redraw'; }
    if ((x = b('[data-np-dref]'))) {
      const i = x.dataset.npDref.indexOf('|');
      const d = st.dist[+x.dataset.npDref.slice(0, i)], rf = x.dataset.npDref.slice(i + 1);
      if (d) { d.refs = d.refs || []; const j = d.refs.indexOf(rf); if (j >= 0) d.refs.splice(j, 1); else d.refs.push(rf); }
      return 'redraw';
    }
    return false;
  },

  /* ---------- 진도 탭: 내신 요약 ---------- */
  summaryHtml(classId, examIds) {
    const today = todayStr();
    const exams = examIds.map(id => Store.get('exams', id)).filter(Boolean);
    if (!exams.length) return '<div class="panel np-sum"><div class="empty">이 반 학생의 학교·학년으로 볼 시험이 없습니다. 시험+교재 탭에서 시험과 범위를 등록하세요.</div></div>';
    return this.groupExams(exams).map(g => {
      const ex = g.ex, exIdStr = g.ids.join(',');        // 같은 시험 여러 건은 한 패널로 합쳐 보여준다
      const prog = this.progress(classId, g.exams, null);
      const range = this.rangeOf(g.exams);
      const memoRange = g.exams.map(e => (e.range || '').trim()).filter(Boolean).join('\n');
      const dd = ex.start ? Math.round((parseYmd(ex.start) - parseYmd(today)) / 864e5) : null;
      let h = `<div class="panel np-sum"><h2>${esc(this.examLabel(ex))} <span class="sub">${esc(this.examDates(ex))}${dd != null ? (dd > 0 ? ' · D-' + dd : dd === 0 ? ' · D-day' : (ex.end || ex.start) >= today ? ' · 시험 중' : ' · 지난 시험') : ''}</span></h2>`;
      if (memoRange) h += `<div class="small soft pre" style="margin:-6px 0 8px">${esc(memoRange)}</div>`;
      if (!range.length) return h + '<div class="empty">구조화된 시험 범위가 없습니다. 시험+교재 탭에서 범위를 입력하세요.</div></div>';
      range.forEach(r => {
        const m = r.mat, mid = m.id, pk = this.prepOf(mid);
        let cells = [], prepCells = [], tot = 0, dn = 0, pr = 0;
        if (m.type === 'mock') {
          r.nums.forEach(n => {
            const s = this.numSt(prog, mid, n); tot++; if (s) dn++; if (this.prepNum(pk, n)) pr++;
            cells.push(`<button type="button" class="np-c ${this.chipCls(s)}" data-pm="${exIdStr}|${mid}|num||${n}">${n}</button>`);
            prepCells.push(`<button type="button" class="np-c ${this.prepNum(pk, n) ? 'prep' : ''}" data-pp="${mid}|num||${n}">${n}</button>`);
          });
        } else {
          r.units.forEach(u => {
            const s = this.unitSt(prog, mid, u), last = this.lastText(prog, mid, u.id);
            tot++; if (s === 'les' || s === 'man') dn++; if (this.prepUnit(pk, u)) pr++;
            const note = u.notes.length ? `<i>${esc(u.notes.join(' · '))}</i>` : '';
            if (!u.nums) {
              cells.push(`<button type="button" class="np-c ${this.chipCls(s)}" data-pm="${exIdStr}|${mid}|unit|${u.id}|" title="${esc(last ? fmtMD(last.date) + ' ' + last.text : '')}">${esc(u.name)}${s === 'part' && last ? ' · ' + esc(last.text) : ''}${note}</button>`);
              prepCells.push(`<button type="button" class="np-c ${this.prepUnit(pk, u) ? 'prep' : ''}" data-pp="${mid}|unit|${u.id}|">${esc(u.name)}</button>`);
            } else {
              cells.push(`<span class="np-grp"><span class="np-ul">${esc(u.name)}</span>${u.nums.map(n => `<button type="button" class="np-c ${this.chipCls(this.unumSt(prog, mid, u.id, n))}" data-pm="${exIdStr}|${mid}|unum|${u.id}|${n}">${n}</button>`).join('')}${note}</span>`);
              prepCells.push(`<span class="np-grp"><span class="np-ul">${esc(u.name)}</span>${u.nums.map(n => `<button type="button" class="np-c ${this.prepUnum(pk, u.id, n) ? 'prep' : ''}" data-pp="${mid}|unum|${u.id}|${n}">${n}</button>`).join('')}</span>`);
            }
          });
        }
        const refsOf = (d) => (d.refs || []).filter(rf => rf.split(':')[0] === mid);
        const dist = prog.dist.filter(d => refsOf(d).length);
        h += `<div class="np-srow"><div class="np-mhead"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span><b>${esc(this.matName(m))}</b>
          <span class="small soft">진도 ${dn}/${tot} · 준비 ${pr}/${tot}</span></div>
          <div class="np-sgrid"><span class="np-sl">진도</span><div class="np-chips">${cells.join('')}</div>
          <span class="np-sl">수업 준비</span><div class="np-chips">${prepCells.join('')}</div>
          <span class="np-sl">배부</span><div class="small">${dist.length ? dist.map(d => `<div><b>${esc(d.name || '자료')}</b> <span class="muted">${fmtMD(d.date)}</span> ${esc(refsOf(d).map(rf => rf.includes(':') ? this.unitName(m, rf.split(':')[1]) : '전체').join(', '))}${d.memo ? ' <span class="soft">' + esc(d.memo) + '</span>' : ''}</div>`).join('') : '<span class="muted">-</span>'}</div></div></div>`;
      });
      return h + '</div>';
    }).join('');
  },
  /* ---------- 진도 탭: 비내신 요약 (보기 전용) ---------- */
  genSummaryHtml(classId) {
    const used = [];
    Store.where('lessons', l => l.classId === classId).forEach(l => (l.gp || []).forEach(en => used.push(en.matId)));
    const mats = this.genMatsFor(classId, used);
    if (!mats.length) return '<div class="panel np-sum"><div class="empty">이 반에 연결된 독해·문법 교재가 없습니다. 시험+교재 탭의 일반 교재에서 이 반을 연결하세요.</div></div>';
    const gpr = this.genProgress(classId, null);
    return '<div class="panel np-sum"><h2>비내신 진도</h2>' + mats.map(m => {
      const units = m.units || [];
      const dn = units.filter(u => this.genSt(gpr, m.id, u.id) === 'les').length;
      return `<div class="np-srow"><div class="np-mhead"><span class="np-tag">일반</span><b>${esc(m.name)}</b><span class="small soft">완결 ${dn}/${units.length}</span></div>
        <div class="np-chips">${units.map(u => {
          const s = this.genSt(gpr, m.id, u.id), last = gpr.last[this.key(m.id, u.id)];
          return `<span class="np-c ${this.chipCls(s)}" style="cursor:default" title="${esc(last ? fmtMD(last.date) + ' ' + last.text : '')}">${esc(u.name)}${s === 'part' && last ? ' · ' + esc(last.text) : ''}</span>`;
        }).join('') || '<span class="small muted">단위가 없습니다.</span>'}</div></div>`;
    }).join('') + '<div class="np-legend small soft"><span class="np-c done">완결</span><span class="np-c part">진행 중</span></div></div>';
  },
  // 요약 칸 클릭 (처리했으면 true)
  handleSummary(e, classId) {
    const pm = e.target.closest('[data-pm]');
    if (pm) {
      const [exIds, mid, what, uid, n] = pm.dataset.pm.split('|');
      if (pm.classList.contains('done') && !pm.classList.contains('man')) { toast('수업일지에 기록된 진도입니다. 바꾸려면 아래 목록에서 그 날 일지를 고치세요'); return true; }
      this.toggleManualGroup(classId, exIds.split(','), mid, what, uid, n ? +n : null);
      App.render();
      return true;
    }
    const pp = e.target.closest('[data-pp]');
    if (pp) {
      const [mid, what, uid, n] = pp.dataset.pp.split('|');
      this.togglePrep(mid, what, uid, n ? +n : null);
      App.render();
      return true;
    }
    return false;
  },
};

/* =========================================================
   수업일지 — 입력 전용 화면
   - 입력 내용은 저장 전까지 화면에만 있음 (저장 없이 나가면 버림)
   - 저장하면 출석부·진도·할일로 들어가고, 입력칸은 비워짐
   - 저장된 반은 선택 목록에서 ✓ 표시(회색) · 고르면 저장된 일지를 불러와 수정
   - 저장·취소하면 들어오기 전 화면(수업일지 탭 / 날짜 요약)으로 돌아감
   ========================================================= */
const Lessons = {
  form: null,     // { date, classId, att, progress, homework, hw(학교·학년별 숙제), memo, todos:[{text,date, +상세: importance,memo,remind,checklist,time}] }

  lessonId(classId, date) { return 'L_' + classId + '_' + compactDate(date); },
  getOrNew(classId, date) {
    return Store.get('lessons', this.lessonId(classId, date)) ||
      { id: this.lessonId(classId, date), classId, date, progress: '', homework: '', memo: '', att: {} };
  },
  // 출석·진도·숙제·메모·할일·보강이 하나도 없는 기록은 '없는 것'으로 본다
  isEmpty(l) {
    if (!l) return true;
    if (Object.keys(l.att || {}).length) return false;
    if ([l.progress, l.homework, l.memo].some(v => stripZws(v || '').trim())) return false;
    if ((l.np && l.np.length) || (l.dist && l.dist.length) || (l.gp && l.gp.length)) return false;
    if (Store.where('todos', t => t.lessonId === l.id).length) return false;
    if (Store.where('makeups', m => m.lessonId === l.id && !m.pre).length) return false;   // 결석 예정 기록은 일지가 아님
    return true;
  },
  isSaved(classId, date) { return !this.isEmpty(Store.get('lessons', this.lessonId(classId, date))); },
  // 이미 쌓여 있는 빈 기록 정리. 지운 개수를 돌려준다.
  cleanEmpty() {
    const list = Store.where('lessons', l => this.isEmpty(l));
    list.forEach(l => Store.del('lessons', l.id));
    return list.length;
  },
  /* ---------- 일지 작성 건너뛰기 (수업은 그대로, 일지만 쓰지 않음 · 취소 가능) ---------- */
  skipId(classId, date) { return 'SK_' + classId + '_' + compactDate(date); },
  skipOf(classId, date) { const r = Store.get('meta', this.skipId(classId, date)); return r && r.kind === 'lskip' ? r : null; },
  isSkipped(classId, date) { return !!this.skipOf(classId, date); },
  // 일지가 필요한데 작성도 건너뛰기도 안 한 수업인지
  // (진행 중인 반 · 수업 시작일 ~ 오늘 · 정규 수업 요일 · 그 날 수강생이 있을 때)
  needsLog(c, date) {
    if (!c || c.active === false || date > todayStr()) return false;
    const st = Classes.startOf(c);
    if (!st || date < st) return false;
    if (!(c.days || []).includes(dowOf(date))) return false;
    if (this.isSaved(c.id, date) || this.isSkipped(c.id, date)) return false;
    if (Holidays.has(date)) return false;                 // 공휴일은 일지를 쓰지 않는다
    return Classes.rosterOn(c.id, date).length > 0;
  },
  // 건너뛰기 (사유는 선택). classIds: 여러 반을 한꺼번에 건너뛸 수 있다
  askSkip(classIds, date) {
    const ids = classIds.filter(id => Store.get('classes', id) && !this.isSaved(id, date));
    if (!ids.length) return;
    const names = ids.map(id => Store.get('classes', id).name);
    Modal.open({
      title: '일지 작성 건너뛰기', size: 'sm',
      body: `<p class="small" style="margin-top:0"><b>${esc(fmtDate(date))}</b><br>${esc(names.join(', '))}</p>
        <div class="lesson-field"><label>사유 (선택)</label><input type="text" name="reason" maxlength="60" placeholder="예: 휴강, 공휴일, 특강" style="width:100%"></div>
        <p class="small muted" style="margin-bottom:0">건너뛴 수업은 달력에 일지 미작성으로 표시되지 않습니다. 나중에 취소할 수 있습니다.</p>`,
      onMount: (b, m) => {
        $('[name=reason]', b).addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const btn = $('[data-primary]', m.foot); if (btn) btn.click(); }
        });
      },
      buttons: [
        { text: '취소' },
        { text: '건너뛰기', cls: 'primary', primary: true, onClick: (m) => {
          const reason = $('[name=reason]', m.body).value.trim();
          const now = new Date().toISOString();
          ids.forEach(cid => { if (!this.isSaved(cid, date)) Store.put('meta', { id: this.skipId(cid, date), kind: 'lskip', classId: cid, date, reason, createdAt: now }); });
          if (this.form && this.form.date === date && ids.includes(this.form.classId)) this.form = null;
          toast(ids.length > 1 ? `수업 ${ids.length}개의 일지 작성을 건너뛰었습니다` : '일지 작성을 건너뛰었습니다');
          App.render();
        } },
      ],
    });
  },
  unskip(classId, date) {
    if (!this.isSkipped(classId, date)) return;
    Store.del('meta', this.skipId(classId, date));
    toast('건너뛰기를 취소했습니다');
    App.render();
  },
  // 건너뛰기 표시 (사유가 있으면 함께)
  skipBadge(classId, date) {
    const k = this.skipOf(classId, date);
    return k ? `<span class="badge orange" title="${esc(k.reason || '사유 없음')}">일지 건너뜀${k.reason ? ' · ' + esc(k.reason) : ''}</span>` : '';
  },
  classesOn(date) {
    const dow = dowOf(date);
    // 반 수업 시작일 전 날짜는 뺀다 (그 날 이미 저장한 일지가 있으면 보인다)
    return Classes.sortedOn(Store.all('classes').filter(c => c.active !== false && (c.days || []).includes(dow)
      && (!(Classes.startOf(c) > date) || this.isSaved(c.id, date))), dow);
  },
  // 날짜 요약에서 반을 열 때: 저장된 수업이면 수업일지 탭에서 불러와 수정, 아니면 새로 작성
  // 날짜 요약에서 연 일지는 저장 후 요약으로 돌아간다
  open(date, classId) {
    App.selDate = date; MiniCal.showMonthOf(date);
    this.ret = { date, classId };
    if (this.isSaved(classId, date)) App.go('lessons', { date, classId, edit: 1 });
    else App.go('lessons', { date, classId });
  },
  ret: null,
  onLeave() { this.form = null; this.ret = null; },
  // 새 일지: 출석은 그 날 수강생 전원 '출석'이 기본
  // 결석 예정으로 등록한 학생은 '결석'이 기본
  defAtt(classId, date) { const a = {}; if (classId) Classes.rosterOn(classId, date).forEach(s => { a[s.id] = Makeups.preRec(classId, date, s.id) ? 'A' : 'P'; }); return a; },
  newForm(date, classId) { return { date, classId, att: this.defAtt(classId, date), progress: '', homework: '', memo: '', todos: [{ text: '', date }], np: NP.newState() }; },
  // 출석이 기본값(전원 출석) 그대로인지
  attIsDefault(f) {
    const d = this.defAtt(f.classId, f.date), a = f.att || {};
    return Object.keys(a).length === Object.keys(d).length && Object.keys(d).every(id => a[id] === d[id]);
  },
  /* ---------- 숙제: 학교·학년이 섞인 반은 공통 + 학교·학년별로 나눠 입력 ----------
     저장은 숙제 칸 하나에 합쳐서: 공통 숙제 다음 줄부터 "[금천고2] 숙제" (다시 열면 나눠서 보여줌) */
  hwLabels(classId, date) { return NP.groupsOf(classId, date).map(g => g.school + gradeNum(g.grade)).sort(ko); },
  parseHw(text, labels) {
    const order = labels.slice(), lines = { '': [] };
    let cur = '';
    stripZws(text || '').split('\n').forEach(line => {
      const m = line.match(/^\[([^\]\n]+)\] ?(.*)$/);
      // 학교·학년 표시([금천고2]처럼 숫자로 끝남)만 나눔 표시로 본다 ([필수] 같은 건 그냥 내용)
      if (m && (labels.includes(m[1]) || /\d$/.test(m[1]))) {
        cur = m[1];
        if (!lines[cur]) { lines[cur] = []; if (!order.includes(cur)) order.push(cur); }
        lines[cur].push(m[2]);
      } else lines[cur].push(line);
    });
    const by = {};
    order.forEach(lb => { by[lb] = (lines[lb] || []).join('\n'); });
    return { common: lines[''].join('\n'), by, order };
  },
  joinHw(hw) {
    const out = [];
    if (hw.common.trim()) out.push(hw.common.replace(/\s+$/, ''));
    hw.order.forEach(lb => { const t = (hw.by[lb] || '').trim(); if (t) out.push('[' + lb + '] ' + t); });
    return out.join('\n');
  },
  hwOf(f) { return f.hw ? this.joinHw(f.hw) : f.homework; },
  // 이 학생에게 해당하는 숙제만: 공통 숙제 + 그 학생 학교·학년 숙제 (나눠 쓰지 않은 숙제는 그대로)
  // 학생의 학교·학년 이름(금천고2)이 목록에 있으면 그 이름
  stuLabel(labels, s) {
    const sc = s ? NP.sch(s.school) : '';
    if (!sc || !+s.grade) return '';
    const lb = sc + gradeNum(s.grade);
    return labels.includes(lb) ? lb : '';
  },
  // 결석생 보강용: 이 학생 학교·학년의 내신 진도 · 배부 자료만 남긴 일지 (학교를 알 수 없으면 그대로)
  forStudent(l, s) {
    const lbOf = (e) => NP.sch(e.school) + gradeNum(e.grade);
    const exs = (l.npExams || []).map(id => Store.get('exams', id)).filter(Boolean);
    const out = Object.assign({}, l);
    const labels = [...new Set(exs.map(lbOf))];
    const lb = labels.length > 1 ? this.stuLabel(labels, s) : '';
    if (lb) {
      const mats = new Set();
      exs.filter(e => lbOf(e) === lb).forEach(e => (e.items || []).forEach(it => mats.add(it.matId)));
      out.np = (l.np || []).filter(en => mats.has(en.matId));
    }
    const grps = [...new Set((l.dist || []).map(d => d.grp).filter(Boolean))];
    const dl = grps.length ? this.stuLabel(grps, s) : '';
    if (dl) out.dist = (l.dist || []).filter(d => !d.grp || d.grp === dl);     // 학교 지정 안 된 자료 + 그 학교 자료
    return out;
  },
  hwFor(text, s) {
    const hw = this.parseHw(text, []);
    if (!hw.order.length) return stripZws(text || '');
    const lb = this.stuLabel(hw.order, s);
    const out = [];
    if (hw.common.trim()) out.push(hw.common.replace(/\s+$/, ''));
    const t = lb ? (hw.by[lb] || '').trim() : '';
    if (t) out.push(t);
    return out.join('\n');
  },
  // 취소: 들어오기 전 화면으로 (날짜 요약에서 왔으면 요약, 아니면 수업일지 탭)
  cancel() {
    const f = this.form;
    const date = f ? f.date : App.selDate;
    const back = !!(f && this.ret && this.ret.date === f.date && this.ret.classId === f.classId);
    this.form = null; this.ret = null;
    if (back) App.pickDate(date);
    else App.go('lessons', { date });
  },
  // 저장된 일지를 불러온 수정용 폼 (editId: 수정 중인 일지 id, 할일은 기존 할일 + 빈 칸 하나)
  editForm(date, classId) {
    const l = Store.get('lessons', this.lessonId(classId, date));
    const todos = Store.where('todos', t => t.lessonId === l.id).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt))
      .map(t => ({ id: t.id, text: t.text, date: t.date, done: !!t.done, importance: +t.importance || 0, memo: t.memo || '', remind: +t.remind || 0,
        checklist: JSON.parse(JSON.stringify(Array.isArray(t.checklist) ? t.checklist : [])), time: t.time || '' }));
    todos.push({ text: '', date });
    const att = Object.assign({}, l.att || {});
    Classes.rosterOn(classId, date).forEach(s => { if (!att[s.id] && Makeups.preRec(classId, date, s.id)) att[s.id] = 'A'; });   // 결석 예정 학생
    return { date, classId, editId: l.id, att, progress: l.progress || '', homework: l.homework || '', memo: l.memo || '', todos, np: NP.fromLesson(l) };
  },

  render(main, p) {
    if (typeof Exams !== 'undefined') Exams.syncDates();   // 시험 기간을 일정 탭의 시험 일정에 맞춤 (내신 자동 시험 선택용)
    const date = isYmd(p.date) ? p.date : App.selDate;
    const sched = this.classesOn(date);
    const inSched = (id) => !!sched.find(x => x.id === id);
    // 수정 모드: 저장된 일지를 불러와 고친다 (날짜 요약에서 연 경우)
    const editing = (id) => id && this.isSaved(id, date) && (
      (p.edit && p.classId === id) || (this.form && this.form.editId === this.lessonId(id, date)));
    // 그 요일 수업만 입력할 수 있다 (저장된 일지 수정은 예외: 반 요일이 나중에 바뀐 예전 기록도 고칠 수 있게)
    const ok = (id) => id && Store.get('classes', id) && ((inSched(id) && !this.isSaved(id, date)) || editing(id));
    let classId = ok(p.classId) ? p.classId : null;
    if (!classId && this.form && this.form.date === date && ok(this.form.classId)) classId = this.form.classId;
    const hol = Holidays.name(date);            // 공휴일: 반을 자동으로 고르지 않는다 (직접 고르거나 '그래도 일지 쓰기')
    if (!classId && !hol) { const nx = sched.find(c => ok(c.id) && !this.isSaved(c.id, date) && !this.isSkipped(c.id, date)); classId = nx ? nx.id : null; }
    const isEdit = !!(classId && this.isSaved(classId, date));
    if (!this.form || this.form.date !== date || this.form.classId !== classId || !!this.form.editId !== isEdit)
      this.form = isEdit ? this.editForm(date, classId) : this.newForm(date, classId);
    const f = this.form;
    // 학교·학년이 섞인 반이면 숙제를 나눠 입력 (처음 그릴 때 저장된 숙제를 나눠 담는다)
    if (classId && !f.hw) { const lbs = this.hwLabels(classId, date); if (lbs.length > 1) f.hw = this.parseHw(f.homework, lbs); }
    const savedCnt = sched.filter(c => this.isSaved(c.id, date)).length;
    const skipCnt = sched.filter(c => !this.isSaved(c.id, date) && this.isSkipped(c.id, date)).length;
    const opt = (c) => {
      const sv = this.isSaved(c.id, date);
      const sk = !sv && this.isSkipped(c.id, date);
      const ed = sv && isEdit && c.id === classId;
      return `<option value="${c.id}" ${sv && !ed ? 'style="color:#9AA3AD"' : ''} ${c.id === classId ? 'selected' : ''}>${sv ? '✓ ' : sk ? '⤼ ' : ''}${esc(c.name)} (${esc(Classes.timeOn(c, dowOf(date)).start)})${ed ? ' — 저장됨 · 수정 중' : sv ? ' — 저장됨' : sk ? ' — 일지 건너뜀' : ''}</option>`;
    };
    const skipped = classId && this.isSkipped(classId, date);
    const leftCnt = sched.filter(c => !this.isSaved(c.id, date) && !this.isSkipped(c.id, date)).length;
    const allDone = sched.length > 0 && leftCnt === 0;          // 저장 또는 건너뛰기로 모두 처리
    const editOther = classId && !inSched(classId) ? Store.get('classes', classId) : null;   // 다른 요일 반의 저장된 일지 수정
    // 취소 버튼: 저장된 일지 수정 중이거나, 날짜 요약에서 들어왔을 때
    const canCancel = isEdit || !!(classId && this.ret && this.ret.date === date && this.ret.classId === classId);

    let h = `<div class="page-narrow"><div class="page-head"><h1>수업일지</h1>${isEdit ? '<span class="badge orange">수정 중</span>' : ''}
      <button class="btn sm" data-a="prev">‹</button><input type="date" data-date value="${date}"><button class="btn sm" data-a="next">›</button>
      <button class="btn sm" data-a="today">오늘</button><span class="sub">${DOW[dowOf(date)]}요일</span>
      <span class="grow"></span>${classId && !skipped ? (isEdit ? '' : '<button class="btn" data-skip>일지 건너뛰기</button>') + (canCancel ? '<button class="btn" data-cancel>취소</button>' : '') + '<button class="btn primary" data-save>저장</button>' : ''}</div>
      <div class="toolbar"><span style="display:inline-flex;align-items:center">${Classes.selDot(classId ? Store.get('classes', classId) : null)}<select data-cls style="min-width:260px">
        ${classId ? '' : `<option value="" selected>${allDone ? '모두 작성되었습니다' : '입력할 반을 선택하세요'}</option>`}
        ${sched.length ? `<optgroup label="${DOW[dowOf(date)]}요일 수업">${sched.map(opt).join('')}</optgroup>` : ''}
        ${editOther ? `<optgroup label="수정 중인 일지">${opt(editOther)}</optgroup>` : ''}
      </select></span><span class="small muted">${sched.length ? `이 날 정규 수업 ${sched.length}개 중 ${savedCnt}개 저장${skipCnt ? ` · ${skipCnt}개 건너뜀` : ''}` : '이 날은 정규 수업이 없습니다'}${hol ? ` · 공휴일(${esc(hol)})` : ''}</span>
      ${!hol && leftCnt > 1 ? '<button class="btn sm ghost" data-skipall title="이 날 아직 쓰지 않은 정규 수업 일지를 모두 건너뜁니다">남은 일지 모두 건너뛰기</button>' : ''}</div>`;

    if (!classId && hol && !allDone) {
      h += `<div class="panel"><div class="empty">공휴일(${esc(hol)})입니다. 수업이 없어 일지를 쓰지 않아도 됩니다.
        ${sched.some(c => !this.isSaved(c.id, date) && !this.isSkipped(c.id, date)) ? '<div style="margin-top:12px"><button class="btn" data-holwrite>그래도 일지 쓰기</button></div>' : ''}</div></div></div>`;
      main.innerHTML = h;
      this.bind(main, date, null);
      return;
    }
    if (!classId) {
      h += `<div class="panel"><div class="empty">${allDone
        ? (date === todayStr() ? '오늘 수업일지는 모두 작성되었습니다.' : '이 날 수업일지는 모두 작성되었습니다.')
        : sched.length ? '입력할 반을 선택하세요.' : '이 날은 정규 수업이 없습니다.'}</div></div></div>`;
      main.innerHTML = h;
      this.bind(main, date, null);
      return;
    }

    const c = Store.get('classes', classId);
    if (skipped) {
      const k = this.skipOf(classId, date);
      h += `<div class="panel"><div class="empty">${Classes.dot(c)}<b>${esc(c.name)}</b> · ${fmtDate(date)} 수업은 일지 작성을 건너뛰었습니다.
        <div style="margin-top:6px">${k.reason ? '사유: <b>' + esc(k.reason) + '</b>' : '<span class="muted">사유 없음</span>'}</div>
        <div style="margin-top:12px"><button class="btn" data-unskip>건너뛰기 취소하고 일지 쓰기</button></div></div></div></div>`;
      main.innerHTML = h;
      this.bind(main, date, classId);
      return;
    }
    const roster = Classes.rosterOn(classId, date);
    const cnt = { P: 0, L: 0, A: 0, E: 0, none: 0 };
    roster.forEach(s => { const a = f.att[s.id]; if (a) cnt[a]++; else cnt.none++; });

    h += `<div class="grid-2"><div class="panel">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><h2 style="margin:0;flex:1">출석 <span class="sub">${esc(c.name)} · ${DOW[dowOf(date)]} ${esc(Classes.dayTimeLabel(c, dowOf(date)))}</span></h2>
      <button class="btn sm" data-allp ${roster.length ? '' : 'disabled'}>전원 출석</button>
      <button class="btn sm" data-clearatt>전체 해제</button></div>
      <div class="att-sum"><span>출석 ${cnt.P}</span><span>지각 ${cnt.L}</span><span>결석 ${cnt.A}</span><span>조퇴 ${cnt.E}</span><span class="muted">미체크 ${cnt.none}</span></div>`;
    h += roster.length ? roster.map(s => {
      const a = f.att[s.id] || '';
      return `<div class="att-row"><div class="nm"><b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span></div>
        <div class="att-seg">${Object.keys(ATT).map(k => `<button class="${k} ${a === k ? 'on' : ''}" data-att="${k}" data-sid="${s.id}">${ATT[k]}</button>`).join('')}</div></div>`;
    }).join('') : '<div class="empty">이 날짜에 이 반 수강생이 없습니다. 반 메뉴에서 학생을 배정하세요.</div>';
    // 내신 진도 입력 (학교별 숙제는 그 학교 교재 바로 아래에 들어감 · 못 넣은 학교 숙제는 진도 칸 아래에 따로)
    const npCtx0 = { classId, date, lessonId: f.editId || null, hw: f.hw || null };
    const npHtml = NP.editorHtml(f.np, npCtx0);
    const hwRest = f.hw ? f.hw.order.filter(lb => !npCtx0.hwPlaced || !npCtx0.hwPlaced.has(lb)) : [];
    h += `</div><div class="panel">
      <h2>수업 내용</h2>
      <div class="lesson-field"><label>진도</label><div data-npbox>${npHtml}</div>${hwRest.length ? `<div class="hw-split" style="margin:0 0 8px">
        <div class="small soft">학교별 숙제 (선택)</div>
        ${hwRest.map(lb => `<div class="hw-row"><span class="hw-lb">${esc(lb)}</span><textarea data-hw="${esc(lb)}" rows="2" placeholder="${esc(lb)} 숙제 (선택)">${esc(f.hw.by[lb] || '')}</textarea></div>`).join('')}</div>` : ''}</div>
      <div class="lesson-field"><label>공통 진도</label><textarea data-f="progress" rows="4" placeholder="${f.np.on ? '그 외 진도 (자유 입력)' : '오늘 나간 진도'}">${esc(f.progress)}</textarea></div>
      <div class="lesson-field"><label>${f.hw ? '공통 숙제' : '숙제'}</label>${f.hw ? `<textarea data-hw="" rows="3" placeholder="모든 학생 공통 숙제 (학교별 숙제는 진도 아래 칸)">${esc(f.hw.common)}</textarea>`
        : `<textarea data-f="homework" rows="3" placeholder="내준 숙제">${esc(f.homework)}</textarea>`}</div>
      <div class="lesson-field"><label>메모</label><textarea data-f="memo" rows="3">${esc(f.memo)}</textarea></div>
      <div class="lesson-field"><label>할일</label>
        <div class="todo-drafts">${f.todos.map((d, i) => { const sm = TodoX.detailSummary(d); return `<div class="todo-row"><input type="text" data-dtext="${i}" value="${esc(d.text)}" placeholder="할일"><input type="date" class="todo-date" data-ddate="${i}" value="${esc(d.date)}"><button type="button" class="btn sm todo-detb${sm ? ' on' : ''}" data-ddet="${i}" title="시간·중요도·메모·상기·체크리스트">상세</button><button class="icon-btn" data-ddel="${i}" title="칸 지우기">✕</button></div>${sm ? `<div class="todo-det">${esc(sm)}</div>` : ''}`; }).join('')}</div>
        <div class="todo-actions"><button class="btn sm" data-dadd>+ 할일 칸 추가</button></div></div>
      <p class="small muted" style="margin:10px 0 0">${isEdit ? '저장된 일지를 고치는 중입니다. ' : ''}“저장”을 누르면 출석은 출석부로, 진도·숙제·메모는 진도 탭으로, 할일은 정한 날짜의 할일로 들어갑니다. 저장하지 않고 다른 곳으로 가면 입력한 내용은 버려집니다. (Ctrl+Enter도 저장)</p>
    </div></div></div>`;
    main.innerHTML = h;
    this.bind(main, date, classId);
    $$('textarea[data-f], textarea[data-hw]', main).forEach(ta => enhanceTextarea(ta, { onSave: () => this.save() }));
  },

  bind(main, date, classId) {
    // 저장된 반을 고르면 수정 모드로 불러온다
    const go = (d, cid) => { App.selDate = d; MiniCal.showMonthOf(d); App.go('lessons', cid && this.isSaved(cid, d) ? { date: d, classId: cid, edit: 1 } : { date: d, classId: cid }); };
    const f = this.form;
    const npCtx = { classId, date, lessonId: (f && f.editId) || null };
    const npDo = (e, type) => {
      if (!classId || !f || !f.np || !e.target.closest('[data-npbox]')) return false;
      const r = NP.handle(e, f.np, npCtx, type);
      if (r === 'redraw') App.render();
      return !!r;
    };
    main.onclick = (e) => {
      if (npDo(e, 'click')) return;
      const a = e.target.closest('[data-a]');
      if (a) {
        if (a.dataset.a === 'today') go(todayStr(), null);
        else go(addDaysStr(date, a.dataset.a === 'prev' ? -1 : 1), null);
        return;
      }
      if (e.target.closest('[data-holwrite]')) {         // 공휴일에 보강 등으로 실제 수업을 한 경우
        const nx = this.classesOn(date).find(c => !this.isSaved(c.id, date) && !this.isSkipped(c.id, date));
        if (nx) go(date, nx.id);
        return;
      }
      if (e.target.closest('[data-skipall]')) {
        this.askSkip(this.classesOn(date).filter(c => !this.isSaved(c.id, date) && !this.isSkipped(c.id, date)).map(c => c.id), date);
        return;
      }
      if (!classId) return;
      if (e.target.closest('[data-unskip]')) { this.unskip(classId, date); go(date, classId); return; }
      if (e.target.closest('[data-skip]')) {
        // 입력하던 내용이 있으면 버려진다는 확인
        const has = !this.attIsDefault(f) || [f.progress, this.hwOf(f), f.memo].some(v => stripZws(v || '').trim()) || f.todos.some(t => t.text.trim()) || NP.hasInput(f.np);
        (has ? confirmDlg('입력한 내용은 저장되지 않고 버려집니다.\n일지 작성을 건너뛸까요?', '계속') : Promise.resolve(true))
          .then(go2 => { if (go2) this.askSkip([classId], date); });
        return;
      }
      if (e.target.closest('[data-save]')) { this.save(); return; }
      if (e.target.closest('[data-cancel]')) { this.cancel(); return; }
      const dt = e.target.closest('[data-ddet]');
      if (dt) { const d = f.todos[+dt.dataset.ddet]; if (d) TodoX.detailDlg(d).then(ok => { if (ok && this.form === f) App.render(); }); return; }
      if (e.target.closest('[data-clearatt]')) { Classes.rosterOn(classId, date).forEach(s => { delete f.att[s.id]; }); App.render(); return; }
      if (e.target.closest('[data-allp]')) {
        Classes.rosterOn(classId, date).forEach(s => { if (!f.att[s.id]) f.att[s.id] = 'P'; });
        App.render();
        return;
      }
      const at = e.target.closest('[data-att]');
      if (at) {
        if (f.att[at.dataset.sid] === at.dataset.att) delete f.att[at.dataset.sid];
        else f.att[at.dataset.sid] = at.dataset.att;
        App.render();
        return;
      }
      if (e.target.closest('[data-dadd]')) {
        f.todos.push({ text: '', date });
        App.render();
        const all = $$('[data-dtext]', $('#main')); if (all.length) all[all.length - 1].focus();
        return;
      }
      const dd = e.target.closest('[data-ddel]');
      if (dd) { f.todos.splice(+dd.dataset.ddel, 1); if (!f.todos.length) f.todos.push({ text: '', date }); App.render(); }
    };
    main.onkeydown = (e) => {
      if (e.target.matches('[data-dtext]') && e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const i = +e.target.dataset.dtext;
        if (i === f.todos.length - 1) f.todos.push({ text: '', date: f.todos[i].date || date });
        App.render();
        const n = $(`[data-dtext="${i + 1}"]`, $('#main')); if (n) n.focus();
      }
    };
    // 입력값은 저장 전까지 화면 메모리(form)에만 둔다
    main.oninput = (e) => {
      if (!classId) return;
      if (npDo(e, 'input')) return;
      if (e.target.matches('textarea[data-f]')) f[e.target.dataset.f] = e.target.value;
      if (e.target.matches('textarea[data-hw]') && f.hw) { const k = e.target.dataset.hw; if (k) f.hw.by[k] = e.target.value; else f.hw.common = e.target.value; }
      if (e.target.matches('[data-dtext]')) f.todos[+e.target.dataset.dtext].text = e.target.value;
      if (e.target.matches('[data-ddate]')) f.todos[+e.target.dataset.ddate].date = e.target.value;
    };
    main.onchange = (e) => {
      if (npDo(e, 'change')) return;
      if (e.target.matches('[data-date]') && isYmd(e.target.value)) go(e.target.value, null);
      if (e.target.matches('[data-cls]') && e.target.value) go(date, e.target.value);
    };
  },

  async save() {
    const f = this.form;
    if (!f || !f.classId) return;
    $$('textarea[data-f]', $('#main')).forEach(ta => { f[ta.dataset.f] = ta.value; });
    if (f.hw) { $$('textarea[data-hw]', $('#main')).forEach(ta => { const k = ta.dataset.hw; if (k) f.hw.by[k] = ta.value; else f.hw.common = ta.value; }); f.homework = this.joinHw(f.hw); }
    const id = this.lessonId(f.classId, f.date);
    if (!f.editId && this.isSaved(f.classId, f.date)) { toast('이미 저장된 수업입니다. 수정은 진도 탭에서 하세요'); this.form = null; App.go('lessons', { date: f.date }); return; }
    $$('[data-np-text],[data-np-dname],[data-np-dmemo],[data-np-gtext]', $('#main')).forEach(i => NP.handle({ target: i }, f.np, { classId: f.classId, date: f.date }, 'input'));
    if (f.editId) { await this.saveEdit(f); return; }
    const np = NP.toLesson(f.np, { classId: f.classId, date: f.date, lessonId: null });
    const rec = { id, classId: f.classId, date: f.date, progress: stripZws(f.progress), homework: stripZws(f.homework), memo: stripZws(f.memo), att: Object.assign({}, f.att) };
    if (np.np.length || np.dist.length) Object.assign(rec, { np: np.np, npExams: np.npExams, dist: np.dist });      // 내신 진도·배부 자료
    if (np.gp.length) rec.gp = np.gp;                                 // 비내신 진도
    // 아무것도 입력하지 않았으면 저장하지 않는다 (빈 일지는 '작성 안 됨'으로 남기 때문)
    if (!Object.keys(rec.att).length && ![rec.progress, rec.homework, rec.memo].some(v => (v || '').trim())
      && !(rec.np && rec.np.length) && !(rec.dist && rec.dist.length) && !(rec.gp && rec.gp.length) && !f.todos.some(d => d.text.trim())) {
      await alertDlg('저장할 내용 없음', '입력한 내용이 없습니다.\n이 수업의 일지를 쓰지 않으려면 "일지 건너뛰기"를 사용하세요.');
      return;
    }
    Store.put('lessons', rec);
    if (this.isSkipped(f.classId, f.date)) Store.del('meta', this.skipId(f.classId, f.date));   // 일지를 쓰면 건너뛰기 표시는 없앤다
    const now = Date.now();
    const todos = f.todos.filter(d => d.text.trim());
    todos.forEach((d, i) => Store.put('todos', this.newTodo(d, i, now, id, f.classId, f.date)));
    const cname = (Store.get('classes', f.classId) || {}).name || '';
    this.form = null;
    const back = this.ret && this.ret.date === f.date && this.ret.classId === f.classId;
    this.ret = null;
    if (back) App.pickDate(f.date);                 // 날짜 요약에서 들어왔으면 그 요약 화면으로
    else App.go('lessons', { date: f.date });
    await Store.syncNow();
    toast(`${cname} 저장 완료` + (todos.length ? ` · 할일 ${todos.length}개` : '') + (Store.pendingCount() ? ' (인터넷 연결 후 자동 전송)' : ''));
  },

  // 수업일지 할일 저장용 레코드 (상세 값은 할일 창과 같은 규칙 · 체크리스트가 있으면 모두 체크해야 완료)
  newTodo(d, i, now, lessonId, classId, ldate) {
    const v = TodoX.detailVals(d);
    const rec = Object.assign({ id: uid('TD'), lessonId, classId, date: isYmd(d.date) ? d.date : ldate, text: d.text.trim(), done: false, createdAt: new Date(now + i).toISOString() }, v);
    if (v.checklist.length) rec.done = v.checklist.every(x => x.d);
    return rec;
  },
  editTodo(t, d, text, done) {
    const v = TodoX.detailVals(d);
    const rec = Object.assign({}, t, { text, date: isYmd(d.date) ? d.date : t.date, done }, v);
    if (rec.date !== t.date || v.remind !== (+t.remind || 0)) rec.remindDone = false;
    if (v.checklist.length) rec.done = v.checklist.every(x => x.d);
    if (rec.done !== !!t.done) rec.doneAt = rec.done ? new Date().toISOString() : '';
    return rec;
  },

  // 저장된 일지 수정 저장: 출석·진도·숙제·메모·내신 진도를 고치고, 할일은 고치기·지우기·추가
  async saveEdit(f) {
    const id = f.editId;
    const old = Store.get('lessons', id);
    if (!old) { toast('일지를 찾을 수 없습니다'); this.form = null; App.go('lessons', { date: f.date }); return; }
    const np = NP.toLesson(f.np, { classId: f.classId, date: f.date, lessonId: id });
    const rec = Object.assign({}, old, { progress: stripZws(f.progress), homework: stripZws(f.homework), memo: stripZws(f.memo), att: Object.assign({}, f.att) });
    if (np.np.length || np.dist.length) Object.assign(rec, { np: np.np, npExams: np.npExams, dist: np.dist }); else { delete rec.np; delete rec.npExams; delete rec.dist; }
    if (np.gp.length) rec.gp = np.gp; else delete rec.gp;
    Store.put('lessons', rec);
    // 할일: 폼에 남은 기존 할일은 고치고, 빠진 기존 할일은 지우고, 새 칸은 추가
    const keep = new Set(f.todos.filter(d => d.id && d.text.trim()).map(d => d.id));
    Store.where('todos', t => t.lessonId === id && !keep.has(t.id)).forEach(t => Store.del('todos', t.id));
    const now = Date.now();
    f.todos.forEach((d, i) => {
      const text = d.text.trim();
      if (!text) return;
      if (d.id) { const t = Store.get('todos', d.id); if (t) Store.put('todos', this.editTodo(t, d, text, !!t.done)); }
      else Store.put('todos', this.newTodo(d, i, now, id, f.classId, f.date));
    });
    if (this.isEmpty(Store.get('lessons', id))) Store.del('lessons', id);   // 다 비우면 기록 자체를 지운다
    const cname = (Store.get('classes', f.classId) || {}).name || '';
    this.form = null;
    const back = this.ret && this.ret.date === f.date && this.ret.classId === f.classId;
    this.ret = null;
    if (back) App.pickDate(f.date);                 // 날짜 요약에서 들어왔으면 그 요약 화면으로
    else App.go('lessons', { date: f.date });
    await Store.syncNow();
    toast(`${cname} 수정 저장 완료` + (Store.pendingCount() ? ' (인터넷 연결 후 자동 전송)' : ''));
  },
};

/* =========================================================
   출석부 — 반별·월별 표 (칸을 누르면 바로 수정)
   ========================================================= */
const AttBook = {
  month: '',
  extra: {},           // 정규 수업일이 아닌데 직접 추가한 날짜 { '반ID|날짜': 1 } (출석부를 떠나면 사라짐, 체크하면 기록으로 남음)
  CYCLE: ['', 'P', 'L', 'A', 'E'],
  onLeave() { this.extra = {}; },

  // ---------- 반 이동 ----------
  // 이 반 수강이 모두 끝났고(오늘까지), 끝난 뒤 다른 반 수강을 시작했으면 '반 이동'.
  // 이동한 학생은 마지막으로 옮겨간 반의 출석부에만 보이고, 이전 반 시절 출결도 그 반 표에 함께 보인다.
  // (실제 기록은 원래 반의 수업일지에 그대로 두고, 칸을 누르면 원래 기록을 고친다)
  _mv: null,
  moveTarget(sid, cid) {
    const k = sid + '|' + cid;
    if (k in this._mv) return this._mv[k];
    this._mv[k] = null;                       // 되돌아오는 경우 무한 반복 방지
    const mine = Store.where('enrollments', e => e.studentId === sid && e.classId === cid);
    let r = null;
    if (mine.length && mine.every(e => e.to)) {
      const end = mine.map(e => e.to).sort().pop();
      if (end <= todayStr()) {
        const nx = Store.where('enrollments', e => e.studentId === sid && e.classId !== cid && e.from >= end && Store.get('classes', e.classId))
          .sort((a, b) => ko(a.from, b.from))[0];
        if (nx) r = this.moveTarget(sid, nx.classId) || nx.classId;
      }
    }
    this._mv[k] = r;
    return r;
  },
  // 이 반으로 옮겨온 학생과 그 학생의 이전 반들 { 학생ID: [반ID, ...] }
  movedIn(c) {
    const srcs = {};
    Store.all('enrollments').forEach(e => {
      if (e.classId === c.id) return;
      if (this.moveTarget(e.studentId, e.classId) !== c.id) return;
      const a = srcs[e.studentId] || (srcs[e.studentId] = []);
      if (!a.includes(e.classId)) a.push(e.classId);
    });
    return srcs;
  },
  enrolledOn(sid, cid, d) {
    const c = Store.get('classes', cid);
    return Store.where('enrollments', e => e.studentId === sid && e.classId === cid && Classes.attendsOn(e, d, c)).length > 0;
  },
  // 이 칸(학생·날짜)의 출결이 들어 있는(들어갈) 반: 이 반 기록 → 이전 반 기록 → 그 날 다니던 이전 반 → 이 반
  cellSrc(c, srcs, sid, d) {
    const att = (cid) => { const l = Store.get('lessons', Lessons.lessonId(cid, d)); return l && l.att ? l.att[sid] || '' : ''; };
    if (att(c.id)) return c.id;
    const ss = srcs[sid] || [];
    for (const x of ss) if (att(x)) return x;
    for (const x of ss) if (this.enrolledOn(sid, x, d)) return x;
    return c.id;
  },

  // 이 달 한 반의 날짜·학생 (정규 수업일 + 기록이 있는 날 + 직접 추가한 날 + 옮겨온 학생의 이전 반 기록 날짜)
  monthData(c, Y, M) {
    const last = new Date(Y, M, 0).getDate();
    const pre = Y + '-' + pad(M) + '-';
    const dset = new Set();
    for (let d = 1; d <= last; d++) {
      const ds = pre + pad(d);
      if (((c.days || []).includes(dowOf(ds)) && !(Classes.startOf(c) > ds)) || Lessons.isSaved(c.id, ds) || this.extra[c.id + '|' + ds]) dset.add(ds);   // 정규 수업일은 반 수업 시작일부터
    }
    const sids = new Set();
    [...dset].forEach(d => {
      Classes.rosterOn(c.id, d).forEach(s => sids.add(s.id));
      const l = Store.get('lessons', Lessons.lessonId(c.id, d));
      if (l) Object.keys(l.att || {}).forEach(id => sids.add(id));
    });
    [...sids].forEach(id => { if (this.moveTarget(id, c.id)) sids.delete(id); });   // 다른 반으로 옮긴 학생은 뺀다
    // 이 반으로 옮겨온 학생: 이전 반에서 이 달에 출결 기록이 있는 날짜를 가져온다
    const srcs = this.movedIn(c);
    Object.keys(srcs).forEach(sid => {
      srcs[sid].forEach(x => {
        Store.where('lessons', l => l.classId === x && String(l.date).startsWith(pre) && l.att && l.att[sid]).forEach(l => { dset.add(l.date); sids.add(sid); });
      });
    });
    const dates = [...dset].sort();
    const studs = [...sids].map(id => Store.get('students', id)).filter(Boolean).sort((a, b) => Students.sortFn(a, b));
    return { dates, studs, srcs };
  },

  // 반 하나의 출석표
  tableHtml(c, dates, studs, srcs) {
    const today = todayStr();
    const hol = Holidays.map();             // 공휴일: 기록이 없는 칸은 '휴' (누를 수 없음)
    let h = `<div class="tbl-wrap"><table class="tbl compact ab"><thead><tr><th class="ab-name">이름</th>${dates.map(d => {
      const sv = Lessons.isSaved(c.id, d);
      const reg = (c.days || []).includes(dowOf(d));
      const hn = hol[d];
      return `<th class="ab-d ${d === today ? 'today' : ''} ${reg ? 'reg' : 'offday'} ${dowOf(d) === 0 ? 'sun' : ''} ${hn ? 'hol' : ''}" title="${hn ? '공휴일: ' + esc(hn) : reg ? '정규 수업일' : '정규 수업일 아님'}${sv ? ' · 기록 있음' : ''}">${+d.slice(8)}<small>${DOW[dowOf(d)]}</small></th>`;
    }).join('')}<th class="num">출</th><th class="num">지</th><th class="num">결</th><th class="num">조</th></tr></thead><tbody>`;
    studs.forEach(s => {
      const sum = { P: 0, L: 0, A: 0, E: 0 };
      h += `<tr><td class="nowrap ab-name"><b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span></td>`;
      dates.forEach(d => {
        const src = this.cellSrc(c, srcs, s.id, d);
        const sc = Store.get('classes', src);
        const l = Store.get('lessons', Lessons.lessonId(src, d));
        const st0 = l && l.att ? l.att[s.id] || '' : '';
        const pre = !st0 && Makeups.preRec(src, d, s.id);        // 결석 예정 (출결 기록 전)
        const st = st0 || (pre ? 'A' : '');
        if (st) sum[st]++;
        const out = !this.enrolledOn(s.id, src, d);
        const reg = (c.days || []).includes(dowOf(d));
        const fut = d > today;
        if (hol[d] && !st) { h += `<td class="ab-c hol" title="공휴일: ${esc(hol[d])}">휴</td>`; return; }
        const tip = [src !== c.id ? `이전 반: ${sc ? sc.name : ''}` : out ? '수강하지 않는 날' : '', pre ? '결석 예정' : '', fut ? '내일 이후 날짜는 고칠 수 없습니다' : ''].filter(Boolean).join(' · ');
        h += `<td class="ab-c ${st} ${pre ? 'pre' : ''} ${fut ? 'fut' : ''} ${out ? 'out' : ''} ${reg ? 'reg' : ''}" data-cid="${src}" data-d="${d}" data-sid="${s.id}" title="${esc(tip)}">${ATT_SHORT[st] || '<span class="dash">-</span>'}</td>`;
      });
      h += `<td class="num">${sum.P}</td><td class="num">${sum.L}</td><td class="num">${sum.A}</td><td class="num">${sum.E}</td></tr>`;
    });
    return h + '</tbody></table></div>';
  },

  // 출석부에 보일 반: 진행 중인 반은 모두, 종료된 반은 이 달에 보일 학생이 있을 때만 (맨 아래)
  shownClasses(Y, M) {
    const all = Classes.sorted(Store.all('classes'));
    const pre = this.month + '-';
    const act = all.filter(c => c.active !== false);
    const ended = all.filter(c => c.active === false).filter(c =>
      this.monthData(c, Y, M).studs.length || Object.keys(this.extra).some(k => k.startsWith(c.id + '|' + pre)));
    return [...act, ...ended];
  },

  // 월별 출석부 PDF: A4 가로, 1~말일, 반마다 표를 이어 붙여 넘치면 다음 쪽 (반 이름은 쪽마다 표 머리에 반복)
  pdf() {
    this._mv = {};
    const [Y, M] = this.month.split('-').map(Number);
    const last = new Date(Y, M, 0).getDate();
    const days = []; for (let d = 1; d <= last; d++) days.push(Y + '-' + pad(M) + '-' + pad(d));
    const list = this.shownClasses(Y, M);
    const hol = Holidays.map();
    let body = '';
    list.forEach(c => {
      const { dates, studs, srcs } = this.monthData(c, Y, M);
      if (!studs.length) return;
      const on = new Set(dates);
      const head = `<tr><th class="ttl" colspan="${days.length + 5}"><span class="dot" style="background:${Classes.colorOf(c)}"></span>${esc(c.name)}${c.active === false ? ' (종료)' : ''}<span class="sub">${esc(Classes.timeLabel(c))} · ${studs.length}명</span></th></tr>
        <tr><th class="nm">이름</th>${days.map(d => `<th class="${on.has(d) ? '' : 'off'} ${dowOf(d) === 0 ? 'sun' : dowOf(d) === 6 ? 'sat' : ''}">${+d.slice(8)}<small>${DOW[dowOf(d)]}</small></th>`).join('')}<th class="sm">출</th><th class="sm">지</th><th class="sm">결</th><th class="sm">조</th></tr>`;
      const rows = studs.map(s => {
        const sum = { P: 0, L: 0, A: 0, E: 0 };
        const cells = days.map(d => {
          if (!on.has(d)) return '<td class="off"></td>';
          const src = this.cellSrc(c, srcs, s.id, d);
          const l = Store.get('lessons', Lessons.lessonId(src, d));
          const st = (l && l.att ? l.att[s.id] || '' : '') || (Makeups.preRec(src, d, s.id) ? 'A' : '');   // 결석 예정 포함
          if (st) sum[st]++;
          const out = !this.enrolledOn(s.id, src, d);
          if (hol[d] && !st) return '<td class="hol">휴</td>';          // 공휴일
          return `<td class="${st} ${!st && out ? 'out' : ''}">${ATT_SHORT[st] || ''}</td>`;
        }).join('');
        return `<tr><td class="nm"><b>${esc(s.name)}</b> <span class="tag">${esc(stTag(s))}</span></td>${cells}<td>${sum.P}</td><td>${sum.L}</td><td>${sum.A}</td><td>${sum.E}</td></tr>`;
      }).join('');
      // 첫 줄이 반 제목(합친 칸)이라 열 너비를 colgroup으로 정한다 (이름 넓게, 날짜·합계는 글자 하나 폭)
      const cols = `<colgroup><col class="c-nm">${days.map(() => '<col>').join('')}<col class="c-sm"><col class="c-sm"><col class="c-sm"><col class="c-sm"></colgroup>`;
      body += `<table>${cols}<thead>${head}</thead><tbody>${rows}</tbody></table>`;
    });
    if (!body) { toast('이 달에 출석부에 넣을 학생이 없습니다'); return; }
    const title = `출석부_${this.month}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: A4 landscape; margin: 8mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #111; font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif; font-size: 8pt; }
      h1 { font-size: 13pt; margin: 0 0 3mm; display: flex; justify-content: space-between; align-items: baseline; }
      h1 small { font-size: 8pt; font-weight: normal; color: #666; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4mm; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 0.5pt solid #9aa3ad; height: 5.2mm; padding: 0; text-align: center; white-space: nowrap; overflow: hidden; font-size: 8pt; }
      th { background: #eef2f7; height: 7mm; font-weight: bold; line-height: 1.1; }
      th small { display: block; font-size: 6pt; font-weight: normal; color: #666; }
      th.ttl { text-align: left; padding-left: 2mm; height: 6.5mm; background: #dfe7f1; font-size: 9.5pt; }
      th.ttl .dot { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 4pt; vertical-align: -0.5pt; }
      th.ttl .sub { font-weight: normal; color: #555; font-size: 8pt; margin-left: 6pt; }
      col.c-nm { width: 38mm; } col.c-sm { width: 5mm; }
      th.nm, td.nm { text-align: left; padding-left: 1.5mm; text-overflow: ellipsis; }
      td.nm .tag { color: #777; font-size: 6.5pt; }
      th.sun { color: #c62828; } th.sat { color: #1f5fbf; }
      th.off { background: #d9dde2; color: #888; }
      td.off { background: #e4e7eb; }
      td.out { background: #f3f4f6; }
      td.hol { background: #e4e7eb; color: #888; font-size: 6.5pt; }
      td.A { color: #c62828; font-weight: bold; } td.L { color: #c77700; } td.E { color: #1f5fbf; }
    </style></head><body><h1>${Y}년 ${M}월 출석부<small>출력일 ${todayStr()}</small></h1>${body}</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open(); doc.write(html); doc.close();
    const t0 = document.title;
    setTimeout(() => {
      document.title = title;                 // 저장 파일 이름
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally {
        document.title = t0;
        setTimeout(() => fr.remove(), 1000);
      }
    }, 300);
  },

  render(main) {
    if (!this.month) this.month = App.selDate.slice(0, 7);
    const [Y, M] = this.month.split('-').map(Number);
    let h = `<div class="page-narrow"><div class="page-head"><h1>출석부</h1>
      <button class="btn sm" data-m="-1">‹</button><input type="month" data-month value="${this.month}"><button class="btn sm" data-m="1">›</button>
      <button class="btn sm" data-m="0">이번 달</button><button class="btn sm" data-pdf style="margin-left:4px;background:var(--accent-soft);border-color:var(--accent-line-2);color:var(--accent-ink);font-weight:700" title="이 달 전체 반 출석부를 A4 가로로 인쇄 · PDF 저장">PDF 저장</button></div>`;
    this._mv = {};
    const all = Classes.sorted(Store.all('classes'));
    if (!all.length) { main.innerHTML = h + '<div class="panel"><div class="empty">반이 없습니다. 반 메뉴에서 반을 만드세요.</div></div></div>'; this.bind(main); return; }
    h += `<div class="toolbar small soft"><span>칸을 누를 때마다 출 → 지 → 결 → 조 → 빈칸 순으로 바뀌고 바로 저장됩니다 (오늘까지만). 보강 등 다른 날은 반마다 “+ 날짜 추가”로 넣고 해당 학생만 체크하세요. 미리 알게 된 결석은 결석+보강의 “결석 예정”에서 등록합니다 (점선 칸).</span></div>`;
    this.shownClasses(Y, M).forEach(c => {
      const { dates, studs, srcs } = this.monthData(c, Y, M);
      h += `<div class="panel ab-sec" data-sec="${c.id}"><div class="ab-sec-head"><h2>${Classes.dot(c)}${esc(c.name)}${c.active === false ? ' <span class="badge gray">종료</span>' : ''}
        <span class="sub">${esc(Classes.timeLabel(c))}</span></h2><span class="grow"></span>
        <button class="btn sm" data-addday="${c.id}" title="보강 등 정규 수업일이 아닌 날의 출석을 체크할 때">+ 날짜 추가</button></div>`;
      if (!dates.length || !studs.length) h += `<div class="empty">${!dates.length ? '이 달에 수업 날짜가 없습니다.' : '이 달에 이 반 수강생이 없습니다.'}</div>`;
      else h += this.tableHtml(c, dates, studs, srcs);
      h += '</div>';
    });
    h += '</div>';
    main.innerHTML = h;
    this.bind(main);
  },

  bind(main) {
    main.onclick = (e) => {
      const m = e.target.closest('[data-m]');
      if (m) {
        if (m.dataset.m === '0') this.month = todayStr().slice(0, 7);
        else { const [y, mo] = this.month.split('-').map(Number); const d = new Date(y, mo - 1 + +m.dataset.m, 1); this.month = d.getFullYear() + '-' + pad(d.getMonth() + 1); }
        App.render(); return;
      }
      if (e.target.closest('[data-pdf]')) { this.pdf(); return; }
      const cell = e.target.closest('td[data-d]');
      if (cell) {
        if (cell.dataset.d > todayStr()) { toast('내일 이후 날짜는 결석+보강의 “결석 예정”에서 등록하세요'); return; }
        const l = Lessons.getOrNew(cell.dataset.cid, cell.dataset.d);
        const att = Object.assign({}, l.att || {});
        const cur = att[cell.dataset.sid] || '';
        const next = this.CYCLE[(this.CYCLE.indexOf(cur) + 1) % this.CYCLE.length];
        if (next) att[cell.dataset.sid] = next; else delete att[cell.dataset.sid];
        const nl = Object.assign({}, l, { att });
        // 다 비워져 아무 내용도 없으면 기록 자체를 지운다 (진도 탭에 빈 날짜가 생기지 않도록)
        if (Lessons.isEmpty(nl)) { if (Store.get('lessons', nl.id)) Store.del('lessons', nl.id); }
        else Store.put('lessons', nl);
        App.render();
        return;
      }
      const ad = e.target.closest('[data-addday]');
      if (ad) {
        const cid = ad.dataset.addday;
        DatePicker.open(todayStr().startsWith(this.month) ? todayStr() : this.month + '-01', '출석 체크할 날짜 추가').then(d => {
          if (!isYmd(d) || !Store.get('classes', cid)) return;
          this.extra[cid + '|' + d] = 1;
          this.month = d.slice(0, 7);
          App.render();
          const sec = $(`[data-sec="${cid}"]`, $('#main')); if (sec) sec.scrollIntoView({ block: 'start' });
        });
      }
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-month]') && /^\d{4}-\d{2}$/.test(e.target.value)) { this.month = e.target.value; App.render(); }
    };
  },
};

/* =========================================================
   진도 — 반별 진도·숙제·메모·할일 기록 (확인 / 수정)
   ========================================================= */
const ProgressBook = {
  classId: '',
  q: '', from: '', to: '',
  npOn: false,          // 내신 요약 보기
  npSel: {},            // 반별로 고른 시험 { 반ID: [시험ID] } (없으면 오늘 기준 자동)
  gpOn: false,          // 비내신 요약 보기

  render(main, p) {
    if (typeof Exams !== 'undefined') Exams.syncDates();   // 시험 기간을 일정 탭의 시험 일정에 맞춤 (내신 요약 D-day·자동 선택용)
    // 진도 탭은 진행 중인 반만 (종료된 반은 제외)
    // 단, 할일·보강 등 다른 화면의 링크로 종료된 반의 기록을 열 때는 그 반을 잠시 목록에 넣어 보여준다
    const act = Classes.sorted(Store.all('classes')).filter(c => c.active !== false);
    if (p.classId) this.classId = p.classId;
    const linked = p.classId && Store.get('classes', p.classId);
    if (linked && linked.active === false && this.classId === linked.id) act.push(linked);
    if (!this.classId || !act.some(c => c.id === this.classId)) this.classId = act[0] ? act[0].id : '';
    const cur = act.find(c => c.id === this.classId);
    let h = `<div class="page-narrow"><div class="page-head"><h1>진도</h1></div>`;
    // 반 선택 드롭다운 (검색칸 왼쪽, 선택된 반의 색 점 표시)
    const clsSel = act.length ? `<span style="display:inline-flex;align-items:center">${Classes.selDot(cur)}<select data-pcls style="min-width:180px">${act.map(c => `<option value="${c.id}" ${c.id === this.classId ? 'selected' : ''}>${esc(c.name)}${c.active === false ? ' (종료)' : ''}</option>`).join('')}</select></span>` : '';
    if (!this.classId) { main.innerHTML = h + '<div class="panel"><div class="empty">반이 없습니다.</div></div></div>'; this.bind(main); return; }
    const q = this.q.trim();
    const todosOf = (lid) => Store.where('todos', t => t.lessonId === lid).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt));
    // 검색어가 있으면 진행 중인 모든 반에서 찾는다 (종료된 반 제외) · 없으면 선택한 반만
    const allCls = !!q;
    const actIds = act.filter(c => c.active !== false).map(c => c.id);
    const clsOrd = (cid) => { const i = actIds.indexOf(cid); return i < 0 ? 999 : i; };
    const list = Store.where('lessons', l => (allCls ? actIds.includes(l.classId) : l.classId === this.classId) && !Lessons.isEmpty(l))
      .filter(l => (!this.from || l.date >= this.from) && (!this.to || l.date <= this.to))
      .filter(l => !q || [l.progress, l.homework, l.memo, NP.text(l), NP.genText(l), ...(l.dist || []).map(d => NP.distText(d)), ...todosOf(l.id).map(t => t.text)].some(v => String(v || '').includes(q)))
      .sort((a, b) => ko(b.date, a.date) || clsOrd(a.classId) - clsOrd(b.classId));
    h += `<div class="toolbar">${clsSel}<input type="search" data-q value="${esc(this.q)}" placeholder="전체 반에서 진도·숙제·메모·할일 검색" style="width:260px">
      <input type="date" data-from value="${esc(this.from)}"> ~ <input type="date" data-to value="${esc(this.to)}">
      ${this.q || this.from || this.to ? '<button class="btn sm ghost" data-clear>조건 지우기</button>' : ''}<span class="muted small">${allCls ? '전체 반 ' : ''}${list.length}회</span>
      <span class="grow" style="flex:1"></span><label class="chk"><input type="checkbox" data-npsum ${this.npOn ? 'checked' : ''}>내신 요약</label><label class="chk"><input type="checkbox" data-gpsum ${this.gpOn ? 'checked' : ''}>비내신 요약</label></div>`;
    // 내신 요약: 시험 범위 · 진도 · 수업 준비 · 배부 자료
    if (allCls && (this.npOn || this.gpOn)) h += '<p class="small muted" style="margin:0 0 10px">전체 반 검색 중에는 내신·비내신 요약을 숨깁니다 (검색어를 지우면 다시 보입니다).</p>';
    if (this.npOn && !allCls) {
      const today = todayStr();
      const sel = NP.liveIds(this.npSel[this.classId] || NP.autoExams(this.classId, today).map(e => e.id));   // 진행중인 시험만
      const cands = NP.candExams(this.classId, today, sel);
      h += `<div class="np-exams" style="margin-bottom:10px"><span class="small soft">시험</span>${NP.groupExams(cands).map(g => `<button type="button" class="np-ex ${g.ids.some(id => sel.includes(id)) ? 'on' : ''}" data-npsx="${g.ids.join(',')}">${esc(NP.examLabel(g.ex))} <small>${esc(NP.examDates(g.ex))}</small></button>`).join('') || '<span class="small muted">등록된 시험이 없습니다.</span>'}
        ${this.npSel[this.classId] ? '<button type="button" class="np-auto" data-npsauto>자동</button>' : ''}</div>`;
      h += NP.summaryHtml(this.classId, sel);
      h += '<p class="small muted" style="margin:6px 0 14px">진도 칸을 누르면 날짜 없이 끝낸 것으로 표시하거나 취소합니다 (수업일지로 기록된 칸은 그 날 일지에서 고칩니다). 수업 준비는 교재 기준이라 모든 반에 같이 표시됩니다.</p>';
    }
    if (this.gpOn && !allCls) h += NP.genSummaryHtml(this.classId) + '<div style="height:14px"></div>';
    h += list.length ? `<div class="tbl-wrap"><table class="tbl compact" style="table-layout:fixed;min-width:${allCls ? 880 : 760}px"><colgroup><col style="width:100px">${allCls ? '<col style="width:120px">' : ''}<col style="width:120px"><col><col><col><col></colgroup><thead><tr><th>날짜</th>${allCls ? '<th>반</th>' : ''}<th>출석</th><th>진도</th><th>숙제</th><th>메모</th><th>할일</th></tr></thead><tbody>${list.map(l => {
      const v = Object.values(l.att || {});
      const n = (k) => v.filter(x => x === k).length;
      const att = v.length ? `출${n('P')}${n('L') ? ' 지' + n('L') : ''}${n('A') ? ' <span style="color:var(--danger)">결' + n('A') + '</span>' : ''}${n('E') ? ' 조' + n('E') : ''}` : '<span class="muted">-</span>';
      const tds = todosOf(l.id);
      const lc = allCls ? Store.get('classes', l.classId) : null;
      return `<tr class="click ${p.date === l.date && l.classId === this.classId ? 'hl' : ''}" data-id="${l.id}"><td class="nowrap"><b>${fmtMD(l.date)}</b></td>${allCls ? `<td class="nowrap small">${lc ? Classes.dot(lc) + esc(lc.name) : '<span class="muted">-</span>'}</td>` : ''}<td class="nowrap small">${att}</td>
        <td class="pre">${highlight(l.progress || '', q)}${(l.np || []).length ? `<div class="np-line">내신 ${highlight(NP.text(l), q)}</div>` : ''}${(l.gp || []).length ? `<div class="np-line">비내신 ${highlight(NP.genText(l), q)}</div>` : ''}${(l.dist || []).map(d => `<div class="np-line dist">배부 ${highlight(NP.distText(d), q)}</div>`).join('')}</td><td class="pre">${highlight(l.homework || '', q)}</td><td class="pre small soft">${highlight(l.memo || '', q)}</td>
        <td class="small">${tds.map(t => `<div class="${t.done ? 'muted' : ''}">${t.done ? '☑' : '☐'} ${highlight(t.text, q)} <span class="muted">${fmtMD(t.date)}</span></div>`).join('')}</td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="panel"><div class="empty">${allCls || Store.where('lessons', l => l.classId === this.classId && !Lessons.isEmpty(l)).length ? '조건에 맞는 기록이 없습니다.' : '이 반은 저장된 수업일지가 없습니다.'}</div></div>`;
    h += '</div>';
    main.innerHTML = h;
    this.bind(main);
    const hl = $('tr.hl', main); if (hl) hl.scrollIntoView({ block: 'center' });
  },

  bind(main) {
    main.onclick = (e) => {
      if (NP.handleSummary(e, this.classId)) return;
      const sx = e.target.closest('[data-npsx]');
      if (sx) {
        const cur = this.npSel[this.classId] || NP.autoExams(this.classId, todayStr()).map(x => x.id);
        this.npSel[this.classId] = NP.toggleGroup(cur, sx.dataset.npsx.split(','));
        App.render(); return;
      }
      if (e.target.closest('[data-npsauto]')) { delete this.npSel[this.classId]; App.render(); return; }
      if (e.target.closest('[data-clear]')) { this.q = this.from = this.to = ''; App.render(); return; }
      const tr = e.target.closest('tr[data-id]'); if (tr) this.openModal(tr.dataset.id);
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-npsum]')) { this.npOn = e.target.checked; App.render(); return; }
      if (e.target.matches('[data-gpsum]')) { this.gpOn = e.target.checked; App.render(); return; }
      if (e.target.matches('[data-pcls]') && e.target.value) { this.classId = e.target.value; App.go('progress', {}); return; }
      if (e.target.matches('[data-from]')) { this.from = e.target.value; App.render(); }
      if (e.target.matches('[data-to]')) { this.to = e.target.value; App.render(); }
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) { this.q = e.target.value; App.render(); const i = $('[data-q]', main); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    }, 250);
  },

  openModal(id) {
    const l = Store.get('lessons', id);
    if (!l) return;
    const c = Store.get('classes', l.classId);
    const olds = Store.where('todos', t => t.lessonId === id).sort((a, b) => ko(a.date, b.date) || ko(a.createdAt, b.createdAt));
    const rows = olds.map(t => ({ id: t.id, text: t.text, date: t.date, done: !!t.done, del: false, importance: +t.importance || 0, memo: t.memo || '', remind: +t.remind || 0,
      checklist: JSON.parse(JSON.stringify(Array.isArray(t.checklist) ? t.checklist : [])), time: t.time || '' }));
    rows.push({ id: null, text: '', date: l.date, done: false, del: false });
    const npSt = NP.fromLesson(l), npCtx = { classId: l.classId, date: l.date, lessonId: l.id };
    const todoHtml = () => rows.map((r, i) => r.del ? '' : `<div class="todo-row ${r.done ? 'done' : ''}">
      <input type="checkbox" data-rdone="${i}" ${r.done ? 'checked' : ''} ${r.id ? '' : 'disabled'}>
      <input type="text" data-rtext="${i}" value="${esc(r.text)}" placeholder="${r.id ? '' : '새 할일'}">
      <input type="date" class="todo-date" data-rdate="${i}" value="${esc(r.date)}">
      <button type="button" class="btn sm todo-detb${TodoX.detailHas(r) ? ' on' : ''}" data-rdet="${i}" title="시간·중요도·메모·상기·체크리스트">상세</button>
      <button type="button" class="icon-btn" data-rdel="${i}" title="삭제">✕</button></div>${TodoX.detailHas(r) ? `<div class="todo-det">${esc(TodoX.detailSummary(r))}</div>` : ''}`).join('');
    Modal.open({
      title: `${c ? c.name : ''} · ${fmtDate(l.date)}`, size: 'lg',
      body: `<div class="lesson-field"><label>수업 날짜</label><input type="date" name="ldate" value="${esc(l.date)}"></div>
        <div class="lesson-field"><label>진도</label><div data-npbox></div><textarea name="progress" rows="4">${esc(l.progress)}</textarea></div>
        <div class="lesson-field"><label>숙제</label><textarea name="homework" rows="3">${esc(l.homework)}</textarea></div>
        <div class="lesson-field"><label>메모</label><textarea name="memo" rows="3">${esc(l.memo)}</textarea></div>
        <div class="lesson-field"><label>할일</label><div data-rows>${todoHtml()}</div>
          <div class="todo-actions"><button type="button" class="btn sm" data-radd>+ 할일 칸 추가</button></div></div>
        <p class="small muted">출석은 출석부 탭에서 고칩니다.</p>`,
      onMount: (b) => {
        enhanceAll(b);
        // 내신 진도·배부 자료 (날짜를 바꾸면 그 날짜 기준으로 다시 그림)
        const npBox = $('[data-npbox]', b);
        const npDraw = () => { npCtx.date = isYmd($('[name=ldate]', b).value) ? $('[name=ldate]', b).value : l.date; npBox.innerHTML = NP.editorHtml(npSt, npCtx); };
        npDraw();
        ['click', 'input', 'change'].forEach(type => npBox.addEventListener(type, (e) => { if (NP.handle(e, npSt, npCtx, type) === 'redraw') npDraw(); }));
        $('[name=ldate]', b).addEventListener('change', npDraw);
        const box = $('[data-rows]', b);
        const redraw = () => { box.innerHTML = todoHtml(); };
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-rtext]')) rows[+t.dataset.rtext].text = t.value;
          if (t.matches('[data-rdate]')) rows[+t.dataset.rdate].date = t.value;
        });
        b.addEventListener('change', (e) => { if (e.target.matches('[data-rdone]')) { rows[+e.target.dataset.rdone].done = e.target.checked; redraw(); } });
        b.addEventListener('click', (e) => {
          const d = e.target.closest('[data-rdel]'); if (d) { rows[+d.dataset.rdel].del = true; redraw(); return; }
          const dt = e.target.closest('[data-rdet]'); if (dt) { TodoX.detailDlg(rows[+dt.dataset.rdet]).then(ok => { if (ok) redraw(); }); return; }
          if (e.target.closest('[data-radd]')) { rows.push({ id: null, text: '', date: l.date, done: false, del: false }); redraw(); const ins = $$('[data-rtext]', box); ins[ins.length - 1].focus(); }
        });
      },
      buttons: [
        { text: '완전 삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmHard('이 수업일지를 삭제할까요?\n출석, 진도·숙제·메모, 할일, 보강 기록이 함께 삭제됩니다.')) return false;
          Store.delWhere('todos', t => t.lessonId === id);
          Store.delWhere('makeups', m => m.lessonId === id);
          Store.del('lessons', id);
          toast('삭제했습니다'); App.render();
        } },
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const g = (n) => stripZws($(`[name=${n}]`, m.body).value);
          const nd = $('[name=ldate]', m.body).value;
          if (!isYmd(nd)) { toast('수업 날짜를 선택하세요'); return false; }
          let lid = id;
          if (nd !== l.date) {
            const nid = Lessons.lessonId(l.classId, nd);
            if (Lessons.isSaved(l.classId, nd)) { toast(fmtDate(nd) + '에 이 반 수업일지가 이미 있습니다'); return false; }
            lid = nid;
          }
          const npv = NP.toLesson(npSt, { classId: l.classId, date: nd, lessonId: id });
          const nrec = Object.assign({}, Store.get('lessons', id) || l, { id: lid, date: nd, progress: g('progress'), homework: g('homework'), memo: g('memo') });
          if (npv.np.length || npv.dist.length) Object.assign(nrec, { np: npv.np, npExams: npv.npExams, dist: npv.dist }); else { delete nrec.np; delete nrec.npExams; delete nrec.dist; }
          if (npv.gp.length) nrec.gp = npv.gp; else delete nrec.gp;
          Store.put('lessons', nrec);
          if (lid !== id) {
            // 날짜를 옮기면 딸린 할일·보강 기록도 새 날짜 수업으로 옮긴다
            Store.where('todos', t => t.lessonId === id).forEach(t => Store.put('todos', Object.assign({}, t, { lessonId: lid })));
            Store.where('makeups', mk => mk.lessonId === id).forEach(mk => {
              Store.del('makeups', mk.id);
              Store.put('makeups', Object.assign({}, mk, { id: Makeups.id(lid, mk.studentId), lessonId: lid, absentDate: nd }));
            });
            Store.del('lessons', id);
          }
          const now = Date.now();
          rows.forEach((r, i) => {
            const text = r.text.trim();
            if (r.id) {
              const t = Store.get('todos', r.id); if (!t) return;
              if (r.del || !text) Store.del('todos', r.id);
              else Store.put('todos', Lessons.editTodo(t, r, text, r.done));
            } else if (!r.del && text) {
              Store.put('todos', Lessons.newTodo(r, i, now, lid, l.classId, nd));
            }
          });
          toast(lid !== id ? `저장했습니다 (${fmtMD(nd)}로 이동)` : '저장했습니다');
          if (lid !== id) App.go('progress', { classId: l.classId, date: nd }); else App.render();
        } },
      ],
    });
  },
};

/* =========================================================
   결석+보강 — 출석부의 결석 + 결석 예정을 모아 보여준다 (결석 예정 탭: 내일 이후 / 처리 필요·완료·전체: 오늘까지)
   ========================================================= */
const Makeups = {
  tab: 'open',
  q: '',
  id(lessonId, sid) { return 'M_' + lessonId + '_' + sid; },
  absKey(sid, date) { return 'AB_' + sid + '_' + compactDate(date); },
  // 이 반·날짜·학생의 결석 예정 기록 (없으면 null)
  preRec(cid, d, sid) { const m = Store.get('makeups', this.id(Lessons.lessonId(cid, d), sid)); return m && m.pre ? m : null; },

  // 결석 목록: 출석부의 결석 + 결석 예정(그 날 출결이 따로 기록되기 전까지). 보강 안 함(skip)은 지운 것으로 보고 뺀다
  // fut: 내일 이후 날짜 (결석 예정 탭에만 보임)
  collect() {
    const out = [], seen = new Set(), today = todayStr();
    Store.all('lessons').forEach(l => {
      Object.keys(l.att || {}).forEach(sid => {
        if (l.att[sid] !== 'A') return;
        const s = Store.get('students', sid);
        if (!s) return;
        const key = this.id(l.id, sid);
        seen.add(key);
        const mk = Store.get('makeups', key);
        if (mk && mk.status === 'skip') return;
        out.push({ l, s, c: Store.get('classes', l.classId), mk, status: (mk && mk.status) || 'none', fut: l.date > today });
      });
    });
    Store.where('makeups', m => m.pre && m.status !== 'skip' && !seen.has(m.id)).forEach(mk => {
      const l0 = Store.get('lessons', mk.lessonId);
      if (l0 && l0.att && l0.att[mk.studentId]) return;          // 그 날 출결을 따로 기록함 (출석 등)
      const s = Store.get('students', mk.studentId);
      if (!s || !isYmd(mk.absentDate)) return;
      const l = l0 || { id: mk.lessonId, classId: mk.classId, date: mk.absentDate, progress: '', homework: '', memo: '', att: {} };
      out.push({ l, s, c: Store.get('classes', mk.classId), mk, status: mk.status || 'none', fut: l.date > today });
    });
    return out;
  },

  // 결석생 몫: 그 학생 학교의 내신 진도·숙제·배부 자료 (배부 자료는 원래 순번 i를 같이 — 전달 체크 distGot이 이 순번을 씀)
  mine(o) {
    const lf = Lessons.forStudent(o.l, o.s);
    const keep = new Set(lf.dist || []);
    const dist = (o.l.dist || []).map((d, i) => [d, i]).filter(([d]) => keep.has(d));
    const got = ((o.mk && o.mk.distGot) || []);
    return {
      np: (lf.np || []).length ? NP.text(lf) : '', hw: Lessons.hwFor(o.l.homework, o.s).trim(), memo: stripZws(o.l.memo || '').trim(),
      dist, left: dist.filter(([, i]) => !got.includes(i)).length,
    };
  },
  copyText(o) {
    const lf = Lessons.forStudent(o.l, o.s);           // 학교가 섞인 반: 그 학생 학교의 진도·배부 자료만
    const np = NP.text(lf), gp = NP.genText(o.l), dist = (lf.dist || []).map(d => NP.distText(d));
    const pg = stripZws(o.l.progress);
    const lines = [`[${fmtDate(o.l.date)} ${o.c ? o.c.name : ''}]`];
    if (pg || (!np && !gp)) lines.push('진도: ' + (pg || '-'));
    if (np) lines.push('내신 진도: ' + np);
    if (gp) lines.push('비내신 진도: ' + gp);
    if (dist.length) lines.push('배부 자료: ' + dist.join(' / '));
    lines.push('숙제: ' + (Lessons.hwFor(o.l.homework, o.s).trim() || '-'));      // 공통 + 그 학생 학교·학년 숙제만
    const memo = stripZws(o.l.memo || '').trim();
    if (memo) lines.push('메모: ' + memo);
    return lines.join('\n');
  },

  /* ---------- 결석 예정 ---------- */
  // 할일 앞에 붙는 말: "홍길동 결석 예정(11/14 금) — "
  prefix(s, date) { const d = parseYmd(date); return `${s.name} 결석 예정(${d.getMonth() + 1}/${d.getDate()} ${DOW[d.getDay()]}) — `; },
  dayDiff(a, b) { return Math.round((parseYmd(a) - parseYmd(b)) / 864e5); },
  offLabel(off) { off = +off || 0; return off === 0 ? '당일' : off > 0 ? '+' + off + '일' : off + '일'; },
  // 이 학생이 그 날 수강하는 반 (반의 정규 요일 · 수강 기간 · 일부 요일 수강 반영, 시작 시간 순)
  // future: 앞으로의 날짜면 종료된 반은 뺀다
  classesFor(sid, date, future) {
    const dw = dowOf(date), seen = {};
    return Store.where('enrollments', e => e.studentId === sid).map(e => ({ e, c: Store.get('classes', e.classId) }))
      .filter(({ e, c }) => c && (!future || c.active !== false) && (c.days || []).includes(dw) && !(Classes.startOf(c) > date) && Classes.attendsOn(e, date, c))
      .map(x => x.c).filter(c => !seen[c.id] && (seen[c.id] = 1))
      .sort((a, b) => ko(Classes.stuTimeOn(a, sid, dw).start, Classes.stuTimeOn(b, sid, dw).start));   // 금요일 개인 시간 반영
  },
  // 그 날 마지막 수업이 끝나는 시각 (그 날 수업이 없으면 '')
  endOn(sid, d) {
    if (!isYmd(d)) return '';
    const cs = this.classesFor(sid, d, true);
    if (!cs.length) return '';
    return cs.map(c => { const t = Classes.stuTimeOn(c, sid, dowOf(d)); return fromMin(toMin(t.start) + t.duration); }).sort().pop();   // 금요일 개인 시간 반영
  },
  // sid: 그 학생의 금요일 개인 시간으로 표시 (없으면 반 시간)
  clsLabel(cs, d, sid) { return cs.map(c => `${c.name} ${sid ? Classes.ftLabel(Classes.stuTimeOn(c, sid, dowOf(d))) : Classes.dayTimeLabel(c, dowOf(d))}`).join(', '); },

  tpls() { return Store.where('meta', m => m.kind === 'abs_tpl').sort((a, b) => (+a.off || 0) - (+b.off || 0) || ko(a.text, b.text)); },

  // 결석 예정 묶음 (학생·날짜마다 하나, 그 날 여러 반이면 함께)
  preGroups(all) {
    const g = {};
    all.filter(o => o.fut).forEach(o => {
      const k = this.absKey(o.s.id, o.l.date);
      (g[k] = g[k] || { key: k, s: o.s, date: o.l.date, items: [] }).items.push(o);
    });
    return Object.values(g).sort((a, b) => ko(a.date, b.date) || ko(a.s.name, b.s.name));
  },
  linkedTodos(key) { return Store.where('todos', t => t.absKey === key).sort((a, b) => ko(a.date, b.date) || Todos.sortFn(a, b)); },

  // 결석 예정 등록 / 수정 창. key가 있으면 그 결석 예정을 고친다 (학생은 고정, 결석일·할일 수정 가능)
  absDlg(key) {
    const today = todayStr();
    const g0 = key ? this.preGroups(this.collect()).find(g => g.key === key) : null;
    if (key && !g0) { toast('결석 예정을 찾을 수 없습니다'); return; }
    const edit = !!g0;
    const st = { sid: edit ? g0.s.id : '', date: edit ? g0.date : '', rows: [] };     // 할일 날짜 = 결석일 + off
    const blank = (text, off) => ({ text: text || '', off: off || 0, date: '', importance: 3, memo: '', remind: 0, checklist: [], time: '', autoTime: false });     // 결석 예정 할일은 중요도 '높음'
    if (edit) {
      const pre = this.prefix(g0.s, g0.date);
      st.rows = this.linkedTodos(key).map(t => ({
        id: t.id, done: !!t.done, text: String(t.text || '').startsWith(pre) ? t.text.slice(pre.length) : t.text, date: t.date,
        off: this.dayDiff(t.date, st.date), importance: +t.importance || 0, memo: t.memo || '', remind: +t.remind || 0,
        checklist: JSON.parse(JSON.stringify(Array.isArray(t.checklist) ? t.checklist : [])), time: t.time || '', autoTime: false,
      }));
    } else {
      const r = blank('숙제 안내', 0); r.autoTime = true;      // 언제나 들어가는 할일 (결석일 당일, 그 날 수업이 끝나는 시각이 기본)
      st.rows = [r];
    }
    // 학생 목록: 학생 탭 기본 순서 (학년 → 학교 → 이름)
    const map0 = studentChoices(s => s.status !== 'left'), map = {};
    Object.keys(map0).sort((a, b) => Students.sortFn(Store.get('students', map0[a]), Store.get('students', map0[b])) || ko(a, b)).forEach(k => { map[k] = map0[k]; });
    const body = `<div class="form ab-form">
      <label class="req">학생</label>${edit ? `<div><b>${esc(g0.s.name)}</b> <span class="tag">${esc(stTag(g0.s))}</span></div>` : `<div>${studentInputHtml('dl-absst', '')}</div>`}
      <label class="req">결석일</label><div class="row"><input type="date" data-absdate min="${today}" value="${edit ? esc(g0.date) : ''}" style="width:150px"><span class="small soft" data-absinfo></span></div>
      <label class="top">할일</label><div><div class="small soft ab-prefix" data-absprefix></div><div data-absrows></div>
        <div class="ab-tplbar"><button type="button" class="btn sm" data-radd>+ 직접 입력</button><span class="small soft">저장된 할일</span><span data-abstpls></span></div>
        <p class="small muted" style="margin:6px 0 0">할일 내용 앞에 “학생 결석 예정(날짜) — ”가 자동으로 붙습니다. 할일 날짜는 결석일 기준이라, 결석일을 바꾸면 같이 옮겨집니다. “☆ 저장”을 누르면 그 할일을 결석일 기준 며칠 뒤인지와 함께 저장해 다음에 불러 쓸 수 있습니다.</p></div>
    </div>`;
    return new Promise(res => {
      Modal.open({
        title: edit ? '결석 예정 수정' : '결석 예정 등록', size: 'lg', body, autofocus: !edit,
        onMount: (b) => {
          const rowsEl = $('[data-absrows]', b), tplEl = $('[data-abstpls]', b);
          if (!edit) bindStudentInput(b, 'dl-absst', map);
          const stu = () => Store.get('students', st.sid);
          const drawPrefix = () => { const s = stu(); $('[data-absprefix]', b).textContent = s && isYmd(st.date) ? this.prefix(s, st.date) : '학생과 결석일을 고르면 할일 앞에 붙을 말이 보입니다'; };
          // 결석일이 바뀌면 할일 날짜를 같은 간격으로 옮기고, 그 날 수업 끝 시각 기본값도 맞춘다
          const applyBase = () => {
            const end = st.sid ? this.endOn(st.sid, st.date) : '';
            st.rows.forEach(r => {
              if (r.done) return;                      // 완료한 할일은 옮기지 않음
              if (isYmd(st.date)) r.date = addDaysStr(st.date, r.off);
              if (r.autoTime) r.time = end;
            });
          };
          const drawRows = () => {
            rowsEl.innerHTML = st.rows.length ? st.rows.map((r, i) => { const sm = TodoX.detailSummary(r); return `<div class="todo-row"><input type="text" data-rtext="${i}" value="${esc(r.text)}" placeholder="할일 (예: 숙제 안내)"><input type="date" class="todo-date" data-rdate="${i}" value="${esc(r.date)}">
              <button type="button" class="btn sm todo-detb${sm ? ' on' : ''}" data-rdet="${i}" title="시간·중요도·메모·상기·체크리스트">상세</button>
              <button type="button" class="btn sm" data-rsave="${i}" title="이 할일을 다음에 불러 쓸 수 있게 저장">☆ 저장</button>
              <button type="button" class="icon-btn" data-rdel="${i}" title="칸 지우기">✕</button></div>${sm || r.done ? `<div class="todo-det">${r.done ? '✓ 완료한 할일 · ' : ''}${esc(sm)}</div>` : ''}`; }).join('')
              : '<div class="small muted" style="padding:4px 0">할일이 없습니다. 아래에서 추가하세요.</div>';
          };
          const drawTpls = () => {
            const ts = this.tpls();
            tplEl.innerHTML = ts.length ? ts.map(t => `<span class="ab-chip"><button type="button" data-tpl="${t.id}" title="눌러서 할일에 추가">${esc(t.text)} · ${this.offLabel(t.off)}${t.time ? ' ' + esc(t.time) : ''}</button><button type="button" class="x" data-tpldel="${t.id}" title="저장된 할일 삭제">✕</button></span>`).join('')
              : '<span class="small muted">없음 (할일 칸의 ☆ 저장으로 만듭니다)</span>';
          };
          const refresh = () => { drawPrefix(); drawRows(); };
          // 학생·결석일이 정해지면: 그 날 수업 표시 + 할일 날짜·시간 맞추기
          const recalc = () => {
            const info = $('[data-absinfo]', b);
            if (st.sid && isYmd(st.date)) {
              const cs = this.classesFor(st.sid, st.date, true);
              const dk = this.absKey(st.sid, st.date);
              const dup = dk !== key && Store.where('makeups', m => m.pre && m.absKey === dk && m.status !== 'skip').length;
              info.innerHTML = (cs.length ? esc(this.clsLabel(cs, st.date, st.sid)) : '<span style="color:var(--danger)">이 날 수강하는 수업이 없습니다</span>')
                + (Holidays.has(st.date) ? ' · <span style="color:var(--danger)">공휴일 (등록 불가)</span>' : '') + (dup ? ' · <span style="color:var(--danger)">이미 등록된 결석 예정</span>' : '');
              applyBase();
            } else {
              if (info) info.textContent = '';
              if (isYmd(st.date)) applyBase();
            }
            refresh();
          };
          recalc();
          drawTpls();

          b.addEventListener('input', (e) => {
            const t = e.target;
            if (t.matches('[data-rtext]')) st.rows[+t.dataset.rtext].text = t.value;
            else if (t.matches('.st-input')) { const sid = map[t.value.trim()] || ''; if (sid !== st.sid) { st.sid = sid; recalc(); } }
          });
          b.addEventListener('change', (e) => {
            const t = e.target;
            if (t.matches('[data-absdate]')) { st.date = isYmd(t.value) ? t.value : ''; recalc(); }
            else if (t.matches('[data-rdate]')) {
              const r = st.rows[+t.dataset.rdate];
              r.date = isYmd(t.value) ? t.value : '';
              if (r.date && isYmd(st.date)) r.off = this.dayDiff(r.date, st.date);
            }
          });
          b.addEventListener('click', async (e) => {
            const add = (r) => { st.rows.push(r); drawRows(); const all = $$('[data-rtext]', rowsEl); if (all.length) all[all.length - 1].focus(); };
            if (e.target.closest('[data-radd]')) { const r = blank('', 0); if (isYmd(st.date)) r.date = st.date; add(r); return; }
            const tp = e.target.closest('[data-tpl]');
            if (tp) {
              const t = Store.get('meta', tp.dataset.tpl); if (!t) return;
              const r = Object.assign(blank(t.text, +t.off || 0), { importance: 3, memo: t.memo || '', remind: +t.remind || 0,
                checklist: JSON.parse(JSON.stringify(Array.isArray(t.checklist) ? t.checklist : [])).map(x => ({ t: x.t, d: false })), time: t.time || '' });
              if (isYmd(st.date)) r.date = addDaysStr(st.date, r.off);
              add(r);
              return;
            }
            const td = e.target.closest('[data-tpldel]');
            if (td) {
              const t = Store.get('meta', td.dataset.tpldel); if (!t) return;
              if (!await confirmDlg(`저장된 할일 “${t.text}”을 삭제할까요?\n(이미 만든 할일은 그대로 남습니다)`, '삭제', true)) return;
              Store.del('meta', t.id); drawTpls(); toast('저장된 할일을 삭제했습니다');
              return;
            }
            const dl = e.target.closest('[data-rdel]'); if (dl) { st.rows.splice(+dl.dataset.rdel, 1); drawRows(); return; }
            const dt = e.target.closest('[data-rdet]');
            if (dt) { const r = st.rows[+dt.dataset.rdet]; if (r && await TodoX.detailDlg(r, '할일 내용과 날짜는 할일 칸에서 입력합니다. 결석 예정을 저장할 때 함께 저장됩니다.')) { r.autoTime = false; drawRows(); } return; }
            const sv = e.target.closest('[data-rsave]');
            if (sv) {
              const r = st.rows[+sv.dataset.rsave]; if (!r) return;
              const text = r.text.trim();
              if (!text) { toast('할일 내용을 먼저 입력하세요'); return; }
              const off = isYmd(r.date) && isYmd(st.date) ? this.dayDiff(r.date, st.date) : (+r.off || 0);
              const same = this.tpls().find(t => t.text === text);
              if (same && !await confirmDlg(`“${text}” 저장된 할일을 지금 내용으로 바꿀까요?`, '바꾸기')) return;
              const v = TodoX.detailVals(r);
              Store.put('meta', Object.assign({}, same || { id: uid('ABT'), kind: 'abs_tpl', createdAt: new Date().toISOString() },
                { text, off, importance: v.importance, memo: v.memo, remind: v.remind, checklist: v.checklist.map(x => ({ t: x.t, d: false })), time: v.time }));
              drawTpls();
              toast(`“${text}” (${this.offLabel(off)})을 저장했습니다`);
            }
          });
        },
        buttons: [
          { text: '취소' },
          { text: edit ? '저장' : '등록', cls: 'primary', primary: true, onClick: () => {
            const s = Store.get('students', st.sid);
            if (!s) { toast('학생을 목록에서 고르세요'); return false; }
            if (!isYmd(st.date)) { toast('결석일을 고르세요'); return false; }
            const k = this.absKey(s.id, st.date);
            let cs = [];
            const moved = edit && k !== key;                 // 수정에서 결석일을 바꿈
            if (!edit || moved) {
              if (st.date < today) { toast('지난 날짜는 출석부에서 결석으로 체크하세요'); return false; }
              cs = this.classesFor(s.id, st.date, true);
              if (Holidays.has(st.date)) { toast('공휴일이라 수업이 없습니다'); return false; }
              if (!cs.length) { toast('이 날 이 학생이 수강하는 수업이 없습니다'); return false; }
              if (Store.where('makeups', m => m.pre && m.absKey === k && m.status !== 'skip').length) { toast('이미 등록된 결석 예정입니다. 결석 예정 탭에서 할일을 고치세요'); return false; }
            }
            const rows = st.rows.filter(r => r.text.trim());
            if (rows.some(r => !isYmd(r.date))) { toast('할일 날짜를 모두 고르세요'); return false; }
            const pre = this.prefix(s, st.date);
            const now = Date.now(), iso = new Date(now).toISOString();
            const memos = {};                                // 결석일을 옮길 때 반별 메모 유지
            if (moved) {                                     // 이전 결석일의 결석 예정 기록 정리 (결석 예정 취소와 같은 방식)
              g0.items.forEach(o => {
                if (o.mk) { if (o.mk.memo) memos[o.mk.classId] = o.mk.memo; Store.del('makeups', o.mk.id); }
                const l = Store.get('lessons', o.l.id);
                if (l && l.att && l.att[s.id] === 'A') {
                  const att = Object.assign({}, l.att); delete att[s.id];
                  const nl = Object.assign({}, l, { att });
                  if (Lessons.isEmpty(nl)) Store.del('lessons', nl.id); else Store.put('lessons', nl);
                }
              });
            }
            if (!edit || moved) {
              cs.forEach(c => {
                const lid = Lessons.lessonId(c.id, st.date), id = this.id(lid, s.id);
                const old = Store.get('makeups', id) || {};
                Store.put('makeups', Object.assign({}, old, { id, lessonId: lid, studentId: s.id, classId: c.id, absentDate: st.date, date: '', time: '', status: 'none', memo: old.memo || memos[c.id] || '',
                  pre: true, absKey: k, createdAt: iso }));
              });
            }
            if (edit) {
              const keep = new Set(rows.filter(r => r.id).map(r => r.id));
              this.linkedTodos(key).forEach(t => { if (!keep.has(t.id)) Store.del('todos', t.id); });
            }
            let n = 0;
            rows.forEach((r, i) => {
              const text = pre + r.text.trim();
              const cur = r.id ? Store.get('todos', r.id) : null;
              if (cur) {
                const rec = Object.assign(Lessons.editTodo(cur, r, text, !!cur.done), { absKey: k });
                // 체크리스트를 고치지 않았으면 완료 상태는 그대로 (카드·할일 탭에서 체크박스로 완료한 경우 풀리지 않게)
                const norm = (cl) => JSON.stringify((Array.isArray(cl) ? cl : []).map(x => ({ t: String(x.t || '').trim(), d: !!x.d })).filter(x => x.t));
                if (norm(rec.checklist) === norm(cur.checklist)) { rec.done = !!cur.done; rec.doneAt = cur.doneAt || ''; }
                Store.put('todos', rec); return;
              }
              const rec = Object.assign(Lessons.newTodo(Object.assign({}, r, { text }), i, now, '', '', r.date), { order: TodoX.maxOrder(r.date) + 1, doneAt: '', remindDone: false, absKey: k });
              Store.put('todos', rec);
              n++;
            });
            toast(edit ? (moved ? `결석 예정을 ${fmtMD(st.date)}로 옮겼습니다` : '결석 예정을 저장했습니다') : `${s.name} ${fmtMD(st.date)} 결석 예정 등록` + (n ? ` · 할일 ${n}개` : ''));
            App.render();
            res(true);
          } },
        ],
        onClose() { res(false); },
      });
    });
  },

  // 결석 예정 취소: 결석 예정 기록 + 완료하지 않은 할일 삭제 (완료한 할일은 남김)
  async cancelPre(g) {
    const tds = this.linkedTodos(g.key), open = tds.filter(t => !t.done);
    if (!await confirmDlg(`${g.s.name} ${fmtMD(g.date)} 결석 예정을 취소할까요?` + (open.length ? `\n완료하지 않은 할일 ${open.length}개도 함께 삭제됩니다.` : ''), '결석 예정 취소', true)) return;
    g.items.forEach(o => {
      if (o.mk) Store.del('makeups', o.mk.id);
      const l = Store.get('lessons', o.l.id);
      if (l && l.att && l.att[g.s.id] === 'A') {           // 출석부에서 미리 결석으로 찍어 둔 경우
        const att = Object.assign({}, l.att); delete att[g.s.id];
        const nl = Object.assign({}, l, { att });
        if (Lessons.isEmpty(nl)) Store.del('lessons', nl.id); else Store.put('lessons', nl);
      }
    });
    open.forEach(t => Store.del('todos', t.id));
    toast('결석 예정을 취소했습니다');
    App.render();
  },

  preHtml(groups) {
    const today = todayStr();
    if (!groups.length) return `<div class="panel"><div class="empty">결석 예정이 없습니다. 미리 알게 된 결석은 “+ 결석 예정 등록”으로 넣으세요.</div></div>`;
    return groups.map(g => {
      const tds = this.linkedTodos(g.key), pre = this.prefix(g.s, g.date);
      const dd = this.dayDiff(g.date, today);
      return `<div class="mk-card ab-card" data-abs="${g.key}">
        <div class="mk-top"><span class="who">${esc(g.s.name)}</span><span class="tag">${esc(stTag(g.s))}</span>
          ${g.s.status !== 'active' ? Students.statusBadge(g.s) : ''}
          <span class="badge red">결석 예정 ${fmtMD(g.date)}</span><span class="badge gray">D-${dd}</span>
          <span class="soft small">${esc(this.clsLabel(g.items.map(o => o.c).filter(Boolean), g.date, g.s.id) || '(삭제된 반)')}</span>
          <span style="flex:1"></span><button class="btn sm" data-absedit="${g.key}">수정</button>
          <button class="btn sm danger" data-abscancel="${g.key}">결석 예정 취소</button></div>
        ${tds.length ? `<div class="ab-tds">${tds.map(t => `<label class="ab-td ${t.done ? 'done' : ''} ${!t.done && t.date < today ? 'late' : ''}"><input type="checkbox" data-abstd="${t.id}" ${t.done ? 'checked' : ''}>
          <span class="nowrap when">${fmtMD(t.date)}${t.time ? ' ' + esc(t.time) : ''}</span><span>${esc(String(t.text || '').startsWith(pre) ? t.text.slice(pre.length) : t.text)}</span></label>`).join('')}</div>`
          : '<div class="small muted">연결된 할일이 없습니다.</div>'}</div>`;
    }).join('');
  },

  /* ---------- 결석 후 첫 등원 할일 ----------
     학생·결석일마다 하나. 그 날 결석 중 보강 '미지정'이 있으면, 결석 뒤 처음 오는 날의 가장 빠른 수업 시작 시각으로
     "홍길동 결석(11/12 수) 후 첫 등원 - 결석부분 처리 요망"(중요도 높음)을 한 번만 만든다.
     · 만든 기록(meta RT_…)이 있으면 다시 만들지 않음 (직접 삭제·날짜 변경해도 그대로) · id가 정해져 있어 PC·모바일 중복 없음
     · 그 날 결석이 모두 보강 완료 → 할일 완료 / 결석이 없어짐(결석 예정 취소·출석으로 바꿈·보강 안 함) → 미완료 할일 삭제 + 기록 삭제
     · 첫 등원일: 결석 다음 날부터. 공휴일, 그 날 모든 수업이 결석(출석부 결석·결석 예정)인 날은 건너뜀 */
  RET_DAYS: 120,                  // 첫 등원일을 찾는 범위 (결석 뒤 며칠까지)
  _rtT: null,
  retKey(sid, date) { return sid + '_' + compactDate(date); },
  retText(s, date) { const d = parseYmd(date); return `${s.name} 결석(${d.getMonth() + 1}/${d.getDate()} ${DOW[d.getDay()]}) 후 첫 등원 - 결석부분 처리 요망`; },
  // 첫 등원일 { date, time(그 날 가장 빠른 수업 시작) } (찾지 못하면 null)
  retDay(sid, date, hol, today) {
    for (let i = 1; i <= this.RET_DAYS; i++) {
      const d = addDaysStr(date, i);
      if (Holidays.has(d, hol)) continue;
      const come = this.classesFor(sid, d, d >= today).filter(c => {
        const l = Store.get('lessons', Lessons.lessonId(c.id, d));
        const a = l && l.att ? l.att[sid] || '' : '';
        return a ? a !== 'A' : !this.preRec(c.id, d, sid);
      });
      if (!come.length) continue;
      const dw = dowOf(d);
      return { date: d, time: come.map(c => Classes.stuTimeOn(c, sid, dw).start || '').filter(Boolean).sort()[0] || '' };   // 금요일 개인 시간 반영
    }
    return null;
  },
  // 결석 기록을 보고 할일을 만들기 · 완료 · 삭제 (서버 내용을 처음 받은 뒤에만). 바뀐 개수를 돌려준다
  retSync() {
    if (!Store.firstPullDone || !Auth.key()) return 0;
    const today = todayStr(), hol = Holidays.map(), iso = new Date().toISOString();
    const groups = {};
    this.collect().forEach(o => {
      const k = this.retKey(o.s.id, o.l.date);
      (groups[k] = groups[k] || { s: o.s, date: o.l.date, st: [] }).st.push(o.status);
    });
    let add = 0, chg = 0;
    Object.keys(groups).forEach(k => {
      const g = groups[k], mid = 'RT_' + k, t = Store.get('todos', 'TDR_' + k);
      if (Store.get('meta', mid)) {
        if (t && !t.done && g.st.every(x => x === 'done')) { Store.put('todos', Object.assign({}, t, { done: true, doneAt: iso })); chg++; }
        return;
      }
      if (!g.st.includes('none')) return;
      const r = this.retDay(g.s.id, g.date, hol, today);
      if (!r) return;
      Store.put('meta', { id: mid, kind: 'ret_todo', studentId: g.s.id, absentDate: g.date, createdAt: iso });
      if (!t) {
        Store.put('todos', Object.assign({ id: 'TDR_' + k, lessonId: '', classId: '', date: r.date, text: this.retText(g.s, g.date), done: false, createdAt: iso,
          order: TodoX.maxOrder(r.date) + 1, doneAt: '', remindDone: false, retKey: k }, TodoX.detailVals({ importance: 3, time: r.time })));
        add++;
      }
    });
    // 결석이 없어진 것: 미완료 할일 삭제 + 만든 기록 삭제 (완료한 할일은 남김)
    Store.where('meta', m => m.kind === 'ret_todo' && !groups[m.id.slice(3)]).forEach(m => {
      const t = Store.get('todos', 'TDR_' + m.id.slice(3));
      if (t && !t.done) { Store.del('todos', t.id); chg++; }
      Store.del('meta', m.id);
    });
    if (add) toast(`결석 후 첫 등원 할일 ${add}개를 추가했습니다`);
    if (add || chg) {
      if (App.isEditingMain && App.isEditingMain()) App._needRender = true; else App.render();
      if (App.refreshModals) App.refreshModals();
    }
    return add + chg;
  },
  // 출결·결석 예정·보강 상태가 바뀌면 잠시 뒤 한 번 (출석부 칸을 연달아 누르는 동안은 기다림)
  retSoon() {
    clearTimeout(this._rtT);
    this._rtT = setTimeout(() => { try { this.retSync(); } catch (e) { console.warn('[mg77] 첫 등원 할일 처리 실패', e); } }, 1500);
  },

  render(main) {
    const all = this.collect();
    const groups = this.preGroups(all);
    const past = all.filter(o => !o.fut);
    const cnt = { pre: groups.length, open: 0, done: 0, all: past.length };
    past.forEach(o => { if (o.status === 'done') cnt.done++; else cnt.open++; });
    const q = this.q.trim();
    let h = `<div class="page-head"><h1>결석+보강</h1><button class="btn primary" data-absadd>+ 결석 예정 등록</button><span class="sub">출석부에서 결석 처리한 학생과 지난 결석 예정이 처리 필요로 모입니다</span></div>
      <div class="tabs">${[['pre', '결석 예정'], ['open', '처리 필요'], ['done', '완료'], ['all', '전체']].map(([k, t]) => `<button data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${t}<span class="cnt">${cnt[k]}</span></button>`).join('')}</div>
      <div class="toolbar"><input type="search" data-q placeholder="학생 이름, 반 이름 검색" value="${esc(this.q)}" style="width:260px"></div>`;
    let list = [];
    if (this.tab === 'pre') {
      h += this.preHtml(groups.filter(g => !q || g.s.name.includes(q) || g.items.some(o => o.c && o.c.name.includes(q))));
    } else {
      list = past.filter(o => this.tab === 'all' || (this.tab === 'open' ? ['none', 'plan'].includes(o.status) : o.status === this.tab))
        .filter(o => !q || o.s.name.includes(q) || (o.c && o.c.name.includes(q)));
      if (this.tab === 'open') list.sort((a, b) => (a.status === 'plan' ? 0 : 1) - (b.status === 'plan' ? 0 : 1) || ko(a.mk && a.mk.date, b.mk && b.mk.date) || ko(b.l.date, a.l.date));
      else list.sort((a, b) => ko(b.l.date, a.l.date));
      if (!list.length) h += `<div class="panel"><div class="empty">${past.length ? '해당하는 보강이 없습니다.' : '결석 기록이 없습니다.'}</div></div>`;
    }
    list.forEach(o => {
      const mk = o.mk || {};
      const key = this.id(o.l.id, o.s.id);
      const my = this.mine(o);                 // 학교가 섞인 반: 이 학생 학교 것만
      h += `<div class="mk-card ${o.status === 'done' ? 'done' : ''}" data-key="${key}">
        <div class="mk-top"><span class="who">${esc(o.s.name)}</span><span class="tag">${esc(stTag(o.s))}</span>
          ${o.s.status !== 'active' ? Students.statusBadge(o.s) : ''}
          <span class="badge red">결석 ${fmtMD(o.l.date)}</span>${mk.pre ? '<span class="badge gray" title="미리 등록한 결석 예정">예정</span>' : ''}<span class="soft small">${esc(o.c ? o.c.name : '(삭제된 반)')}</span>
          ${my.left ? `<span class="badge orange">미전달 자료 ${my.left}</span>` : ''}
          <span style="flex:1"></span><button class="btn sm" data-copy="${key}">진도·숙제 복사</button>
          <button class="btn sm ghost" data-golesson="${o.l.id}">진도 보기</button></div>
        <div class="mk-copy"><div><span class="k">진도</span><span class="pre">${esc(stripZws(o.l.progress)) || '<span class="muted">입력 전</span>'}</span></div>
          ${my.np ? `<div><span class="k">내신</span><span>${esc(my.np)}</span></div>` : ''}
          ${(o.l.gp || []).length ? `<div><span class="k">비내신</span><span>${esc(NP.genText(o.l))}</span></div>` : ''}
          <div><span class="k">숙제</span><span class="pre">${esc(my.hw) || '<span class="muted">입력 전</span>'}</span></div>
          ${my.memo ? `<div><span class="k">수업 메모</span><span class="pre">${esc(my.memo)}</span></div>` : ''}
          ${my.dist.length ? `<div><span class="k">배부</span><span>${my.dist.map(([d, i]) => `<label class="chk small mk-dist ${(mk.distGot || []).includes(i) ? 'got' : ''}"><input type="checkbox" data-mdist="${i}" ${(mk.distGot || []).includes(i) ? 'checked' : ''}>${esc(NP.distText(d))}</label>`).join('')}</span></div>` : ''}</div>
        <div class="mk-ctl">
          <span class="small soft">보강일</span><input type="date" data-mf="date" value="${esc(mk.date || '')}">
          <input type="time" data-mf="time" step="300" value="${esc(mk.time || '')}">
          <select data-mf="status">${Object.keys(MK_STATUS).map(k => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${MK_STATUS[k]}</option>`).join('')}</select>
          <input type="text" data-mf="memo" value="${esc(mk.memo || '')}" placeholder="보강 메모"></div></div>`;
    });
    main.innerHTML = h;
    const byKey = {}; list.forEach(o => { byKey[this.id(o.l.id, o.s.id)] = o; });
    const gByKey = {}; groups.forEach(g => { gByKey[g.key] = g; });
    const saveField = (card, field, val) => {
      const o = byKey[card.dataset.key]; if (!o) return;
      const cur = Store.get('makeups', card.dataset.key) || { id: card.dataset.key, lessonId: o.l.id, studentId: o.s.id, classId: o.l.classId, absentDate: o.l.date, date: '', time: '', status: 'none', memo: '' };
      const rec = Object.assign({}, cur, { [field]: val });
      if (field === 'date' && val && rec.status === 'none') rec.status = 'plan';
      if (field === 'status' && val === 'done' && !rec.date) rec.date = todayStr();
      Store.put('makeups', rec);
    };
    main.onclick = async (e) => {
      const tb = e.target.closest('[data-tab]'); if (tb) { this.tab = tb.dataset.tab; App.render(); return; }
      if (e.target.closest('[data-absadd]')) { this.absDlg(); return; }
      const ae = e.target.closest('[data-absedit]'); if (ae) { this.absDlg(ae.dataset.absedit); return; }
      const ac = e.target.closest('[data-abscancel]'); if (ac) { const g = gByKey[ac.dataset.abscancel]; if (g) this.cancelPre(g); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) {
        const txt = this.copyText(byKey[cp.dataset.copy]);
        try { await navigator.clipboard.writeText(txt); toast('진도와 숙제를 복사했습니다'); }
        catch (_) { alertDlg('복사할 내용', txt); }
        return;
      }
      const gl = e.target.closest('[data-golesson]');
      if (gl) { const l = Store.get('lessons', gl.dataset.golesson); if (l) { App.selDate = l.date; MiniCal.showMonthOf(l.date); App.go('progress', { classId: l.classId, date: l.date }); } }
    };
    main.onchange = async (e) => {
      const at = e.target.closest('[data-abstd]');
      if (at) {
        const t = Store.get('todos', at.dataset.abstd);
        if (t) {
          // 할일 탭과 같은 규칙: 체크리스트가 남아 있으면 완료할 수 없음 (수정 창에서 저장할 때 완료가 풀리는 것 방지)
          const prog = TodoX.clProg(t.checklist);
          if (at.checked && prog && prog.done < prog.total) { at.checked = false; toast('상세에서 체크리스트를 모두 완료하세요'); return; }
          if (!at.checked && prog && prog.done === prog.total) { at.checked = true; toast('상세에서 체크리스트를 해제하세요'); return; }   // 할일 탭과 같은 규칙
          Store.put('todos', Object.assign({}, t, { done: at.checked, doneAt: at.checked ? new Date().toISOString() : '' })); App.render();
        }
        return;
      }
      const md = e.target.closest('[data-mdist]');
      if (md) {
        // 결석생에게 배부 자료를 전달했는지
        const card = md.closest('[data-key]'), o = byKey[card.dataset.key];
        const cur = Store.get('makeups', card.dataset.key);
        const got = ((cur && cur.distGot) || []).filter(i => i !== +md.dataset.mdist);
        if (md.checked) got.push(+md.dataset.mdist);
        saveField(card, 'distGot', got.sort((a, b) => a - b));
        App.render();
        return;
      }
      const f = e.target.closest('[data-mf]'); if (!f) return;
      // 보강 안 함 = 보강 목록에서 삭제 (출석부의 결석 기록은 그대로)
      if (f.dataset.mf === 'status' && f.value === 'skip') {
        const card = f.closest('[data-key]'), o = byKey[card.dataset.key];
        if (!await confirmDlg(`${o ? o.s.name + ' ' + fmtMD(o.l.date) + ' ' : ''}결석을 보강 목록에서 삭제할까요?\n출석부의 결석 기록은 그대로 남습니다.\n삭제하면 되돌릴 수 없습니다.`, '삭제', true)) { App.render(); return; }
        saveField(card, 'status', 'skip');
        toast('보강 목록에서 삭제했습니다');
        App.render();
        return;
      }
      saveField(f.closest('[data-key]'), f.dataset.mf, f.value.trim());
      if (f.dataset.mf !== 'memo') App.render();
    };
    main.oninput = debounce((e) => {
      if (e.target.matches('[data-q]')) {
        this.q = e.target.value;
        App.render();
        const inp = $('[data-q]', main); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }
    }, 250);
  },
};

// 이 기기에서 수업일지(출결)·보강 기록을 고치면 결석 후 첫 등원 할일을 맞춘다 (서버에서 받아온 변경은 그 기기가 이미 맞춤)
['put', 'del'].forEach(fn => {
  const f0 = Store[fn];
  Store[fn] = function (t, ...a) { const r = f0.call(this, t, ...a); if (t === 'lessons' || t === 'makeups') Makeups.retSoon(); return r; };
});

/* =========================================================
   할일 공용 표시 (날짜 상세 · 오늘)
   ========================================================= */
const Todos = {
  // 끌어서 정한 순서(order) → 없으면 만든 순서
  sortFn(a, b) {
    const oa = a.order == null ? 1e9 : a.order, ob = b.order == null ? 1e9 : b.order;
    return oa - ob || ko(a.createdAt, b.createdAt);
  },
  rowsHtml(list, opt = {}) {
    return list.map(t => {
      const c = Store.get('classes', t.classId);
      return `<div class="todo-row big ${t.done ? 'done' : ''}" data-tid="${t.id}" ${opt.drag ? 'draggable="true"' : ''}>
        ${opt.drag ? '<span class="grip" title="끌어서 순서 바꾸기">⠿</span>' : ''}
        <input type="checkbox" data-tdone="${t.id}" ${t.done ? 'checked' : ''}>
        <span class="tx">${esc(t.text)}</span>
        <span class="small muted nowrap" data-tgo="${t.id}" style="cursor:pointer" title="진도 탭에서 보기">${opt.showDate ? fmtMD(t.date) + ' ' : ''}${esc(c ? c.name : '')}</span>
        <button type="button" class="kebab" data-tmenu="${t.id}" title="메뉴">⋮</button></div>`;
    }).join('');
  },
  // 처리했으면 true
  handleClick(e) {
    const td = e.target.closest('[data-tdone]');
    if (td) {
      const t = Store.get('todos', td.dataset.tdone);
      if (t) { Store.put('todos', Object.assign({}, t, { done: td.checked })); App.render(); }
      return true;
    }
    const mn = e.target.closest('[data-tmenu]');
    if (mn) {
      const t = Store.get('todos', mn.dataset.tmenu); if (!t) return true;
      popMenu(mn, [
        { text: '날짜 변경', onClick: async () => {
          const d = await DatePicker.open(t.date, '할일 날짜 변경');
          if (!d || d === t.date) return;
          const cur = Store.get('todos', t.id); if (!cur) return;
          const max = Math.max(-1, ...Store.where('todos', x => x.date === d && x.order != null).map(x => x.order));
          Store.put('todos', Object.assign({}, cur, { date: d, order: max + 1 }));
          toast(`${fmtMD(d)} 할일로 옮겼습니다`);
          App.render();
        } },
        { text: '삭제', danger: true, onClick: () => { Store.del('todos', t.id); toast('할일을 삭제했습니다'); App.render(); } },
      ]);
      return true;
    }
    const tg = e.target.closest('[data-tgo]');
    if (tg) {
      const t = Store.get('todos', tg.dataset.tgo); if (!t) return true;
      const l = Store.get('lessons', t.lessonId);
      App.go('progress', { classId: t.classId, date: l ? l.date : '' });
      return true;
    }
    return false;
  },
  // 끌어서 순서 바꾸기
  bindDrag(box) {
    let dragId = null;
    const clear = () => $$('.drop-before,.drop-after', box).forEach(x => x.classList.remove('drop-before', 'drop-after'));
    box.addEventListener('dragstart', (e) => {
      const r = e.target.closest('[data-tid]'); if (!r) return;
      dragId = r.dataset.tid; r.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    box.addEventListener('dragend', () => { dragId = null; clear(); $$('.dragging', box).forEach(x => x.classList.remove('dragging')); });
    box.addEventListener('dragover', (e) => {
      const r = e.target.closest('[data-tid]'); if (!r || !dragId) return;
      e.preventDefault();
      clear();
      if (r.dataset.tid === dragId) return;
      const rc = r.getBoundingClientRect();
      r.classList.add(e.clientY > rc.top + rc.height / 2 ? 'drop-after' : 'drop-before');
    });
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      const r = e.target.closest('[data-tid]');
      if (!r || !dragId || r.dataset.tid === dragId) { clear(); return; }
      const after = r.classList.contains('drop-after');
      const ids = $$('[data-tid]', box).map(x => x.dataset.tid).filter(id => id !== dragId);
      let i = ids.indexOf(r.dataset.tid); if (after) i++;
      ids.splice(i, 0, dragId);
      ids.forEach((id, k) => { const t = Store.get('todos', id); if (t && t.order !== k) Store.put('todos', Object.assign({}, t, { order: k })); });
      dragId = null;
      App.render();
    });
  },
};
