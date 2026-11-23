/* =========================================================
   words.js — 단어 시험 기록부 (학생 › 단어)
   반별·월별 표. 학생마다 한 줄, 그 학생이 오는 날만 칸으로 나온다 (여러 반에 다니면 반 순서상 앞선 반에 한 번만).
   칸을 누르면 그 날의 단어 시험(범위·결과·점수·메모, 재시험 포함)을 기록한다.
   단어장 연결은 쓰지 않는다 (기록에 필요 없음). 학생 › 교재에 진행 중인 단어장이 있으면 그 이름만 기록에 조용히 남긴다.
   기록은 meta 테이블에 저장 (서버 SQL 변경 없음):
   wtest: { id 'WT_학생ID_날짜', kind:'wtest', studentId, date, classId(기록한 반), matId, matName(교재 이름 사본),
            tries:[ { kind:'new'|'re', of(다른 날 시험의 재시험이면 그 날짜), from, to, res:'pass'|'fail'|'abs'|''(예정), score, total, memo,
                      fu(결과를 고른 뒤 이어 잡은 시험: 날짜 | 'same' 당일) } ], createdAt, updatedAt }
   학생별 기억값: WS_학생ID { kind:'wset', total(만점), mode('direct'|'rule') } · 단어 시험 안 하는 반: WCFG { kind:'wcfg', off:[반ID] }
   ========================================================= */
const WT_RES = { pass: '합격', fail: '불합격', abs: '결시' };
const WT_MARK = { pass: '○', fail: '✕', abs: '결시' };

const WordBook = {
  month: '',
  extra: {},           // 직접 추가한 날짜 { '학생ID|날짜': 1 } (페이지를 떠나면 사라짐, 기록하면 남음)
  cls: undefined,      // 화면에서 고른 반 ('' 선택 안 함 · undefined: 다음에 열 때 지금 시각 수업 반으로 자동 선택)
  onLeave() { this.extra = {}; this.cls = undefined; },

  /* ---------- 데이터 ---------- */
  recId(sid, d) { return 'WT_' + sid + '_' + compactDate(d); },
  rec(sid, d) { const r = Store.get('meta', this.recId(sid, d)); return r && r.kind === 'wtest' ? r : null; },
  recs() { return Store.where('meta', r => r.kind === 'wtest'); },
  // 지금 진행 중인 단어장 기록 (한 학생 한 권)
  curBook(sid) { return Books.ingOf(sid, 'word')[0] || null; },
  // 그 날짜에 쓰던 단어장 기록: 기간 안에 있는 것 → 없으면 지금 진행 중인 것
  bookOn(sid, d) {
    const hit = Books.recsOf(sid).filter(r => Books.catOf(r) === 'word' && isYmd(r.start) && r.start <= d && (r.status === 'ing' || !isYmd(r.end) || r.end >= d))
      .sort((a, b) => ko(b.start, a.start))[0];
    return hit || this.curBook(sid);
  },
  rangeLabel(t) { return t.from ? (!t.to || +t.from === +t.to ? String(t.from) : t.from + '-' + t.to) : ''; },
  scoreLabel(t) { return t.score !== '' && t.score != null ? String(t.score) + (t.total !== '' && t.total != null ? '/' + t.total : '') : ''; },

  // 이 칸 학생이 그 날 결석인지 (출석부 기록 기준)
  absentOn(c, srcs, sid, d) {
    const src = AttBook.cellSrc(c, srcs, sid, d);
    const l = Store.get('lessons', Lessons.lessonId(src, d));
    return !!(l && l.att && l.att[sid] === 'A');
  },

  // 이 달 한 반의 날짜·학생 (출석부와 같은 날짜 + 직접 추가한 날 + 단어 시험 기록이 있는 날)
  monthData(c, Y, M) {
    const last = new Date(Y, M, 0).getDate();
    const pre = Y + '-' + pad(M) + '-';
    const dset = new Set();
    for (let d = 1; d <= last; d++) {
      const ds = pre + pad(d);
      if (((c.days || []).includes(dowOf(ds)) && !(Classes.startOf(c) > ds)) || Lessons.isSaved(c.id, ds) || this.extra[c.id + '|' + ds]) dset.add(ds);
    }
    const mine = this.recs().filter(r => r.classId === c.id && String(r.date).startsWith(pre));
    mine.forEach(r => dset.add(r.date));
    const sids = new Set();
    [...dset].forEach(d => {
      Classes.rosterOn(c.id, d).forEach(s => sids.add(s.id));
      const l = Store.get('lessons', Lessons.lessonId(c.id, d));
      if (l) Object.keys(l.att || {}).forEach(id => sids.add(id));
    });
    mine.forEach(r => sids.add(r.studentId));
    [...sids].forEach(id => { if (AttBook.moveTarget(id, c.id)) sids.delete(id); });   // 다른 반으로 옮긴 학생은 뺀다
    // 이 반으로 옮겨온 학생: 이전 반의 출결·단어 기록 날짜를 가져온다
    const srcs = AttBook.movedIn(c);
    Object.keys(srcs).forEach(sid => {
      srcs[sid].forEach(x => {
        Store.where('lessons', l => l.classId === x && String(l.date).startsWith(pre) && l.att && l.att[sid]).forEach(l => { dset.add(l.date); sids.add(sid); });
        this.recs().filter(r => r.studentId === sid && r.classId === x && String(r.date).startsWith(pre)).forEach(r => { dset.add(r.date); sids.add(sid); });
      });
    });
    const dates = [...dset].sort();
    const studs = [...sids].map(id => Store.get('students', id)).filter(Boolean).sort((a, b) => Students.sortFn(a, b));
    return { dates, studs, srcs };
  },

  shownClasses(Y, M) {
    const all = Classes.sorted(Store.all('classes'));
    return all.filter(c => c.active !== false && !this.isOff(c.id));          // 진행 중인 반만 · 단어 시험 안 하는 반은 뺀다
  },

  /* ---------- 학생 한 줄 = 그 학생이 오는 날만 ----------
     여러 반에 다니는 학생은 반 순서상 가장 앞선 반 아래에 한 번만 나온다.
     날짜: 그 학생이 다니는 모든 반의 수업일(그 요일에 오는 날) + 출결 기록이 있는 날 + 단어 기록이 있는 날 + 직접 추가한 날
     반환: { groups: [{ c, rows: [{ s, items: [{ d, ents:[{ c, att, reg }], absent }] , cls:Set }] }] } */
  build(Y, M) {
    AttBook._mv = {};
    const pre = Y + '-' + pad(M) + '-';
    const classes = this.shownClasses(Y, M);
    const per = new Map();
    const groups = classes.map(c => ({ c, rows: [], had: 0 }));
    classes.forEach((c, gi) => {
      const { dates, studs, srcs } = this.monthData(c, Y, M);
      groups[gi].had = studs.length;
      studs.forEach(s => {
        let o = per.get(s.id);
        if (!o) { o = { s, gi, gis: new Set(), items: new Map(), cls: new Set() }; per.set(s.id, o); }
        o.gis.add(gi);
        dates.forEach(d => {
          const src = AttBook.cellSrc(c, srcs, s.id, d);
          const sc = Store.get('classes', src) || c;
          const reg = (sc.days || []).includes(dowOf(d)) && !(Classes.startOf(sc) > d);
          const l = Store.get('lessons', Lessons.lessonId(src, d));
          const att = l && l.att ? l.att[s.id] || '' : '';
          if (!att && !(reg && AttBook.enrolledOn(s.id, src, d))) return;   // 그 날 오지 않는 학생
          let it = o.items.get(d);
          if (!it) { it = { d, ents: [] }; o.items.set(d, it); }
          if (!it.ents.some(e => e.c.id === sc.id)) it.ents.push({ c: sc, att, reg });
          o.cls.add(sc.id);
        });
      });
    });
    // 단어 기록이 있는 날 · 직접 추가한 날
    per.forEach(o => {
      this.recs().filter(r => r.studentId === o.s.id && String(r.date).startsWith(pre)).forEach(r => { if (!o.items.has(r.date)) o.items.set(r.date, { d: r.date, ents: [] }); });
      Object.keys(this.extra).forEach(k => {
        const [sid, d] = k.split('|');
        if (sid === o.s.id && String(d).startsWith(pre) && !o.items.has(d)) o.items.set(d, { d, ents: [] });
      });
    });
    // 표시할 반: 기준일(이번 달은 오늘, 지난 달은 말일, 앞으로 올 달은 1일)에 수강 중인 반 중 앞선 반 (없으면 처음 나온 반)
    //   같은 달에 잠깐 다녔던 다른 반이 앞 순서라서 지금 다니는 반에서 빠지는 일을 막는다
    const today = todayStr(), lastD = pre + pad(new Date(Y, M, 0).getDate());
    const base = today < pre + '01' ? pre + '01' : today > lastD ? lastD : today;
    per.forEach(o => {
      const cur = [...o.gis].sort((a, b) => a - b).find(gi => Store.where('enrollments', e => e.studentId === o.s.id && e.classId === groups[gi].c.id && Classes.enrollValid(e, base)).length);
      if (cur != null) o.gi = cur;
    });
    per.forEach(o => {
      o.list = [...o.items.values()].sort((a, b) => ko(a.d, b.d));
      // 그 날 결석: 결석 기록이 있고, 출석·지각·조퇴 기록은 없음
      o.list.forEach(it => { it.absent = it.ents.some(e => e.att === 'A') && !it.ents.some(e => e.att && e.att !== 'A'); });
      groups[o.gi].rows.push(o);
    });
    groups.forEach(g => g.rows.sort((a, b) => Students.sortFn(a.s, b.s)));
    groups.per = [...per.values()];      // 학생별 묶음 (반을 골라 볼 때 다시 나눔 — pick)
    return groups;
  },

  // 학생 한 줄의 이 달 합격·불합격 횟수
  countOf(sid, dates) {
    const n = { pass: 0, fail: 0 };
    dates.forEach(d => { const r = this.rec(sid, d); if (r) (r.tries || []).forEach(t => { if (t.res in n) n[t.res]++; }); });
    return n;
  },

  /* ---------- 표 ---------- */
  // 결과가 없는 시험 = 예정 (지난 날짜인데 결과가 없으면 'late'로 눈에 띄게)
  cellInner(r, d) {
    if (!r || !(r.tries || []).length) return '<span class="dash">-</span>';
    const late = d && d < todayStr();
    return r.tries.map((t, i) => {
      const plan = !WT_RES[t.res];
      const re = this.kindOf(t, i) === 're' ? `<span class="wt-re" title="${esc(isYmd(t.of) ? fmtMD(t.of) + ' 시험의 재시험' : '재시험')}">재</span>` : '';
      return `<div class="wt-t ${plan ? 'plan' + (late ? ' late' : '') : t.res}">${re}${t.res === 'abs' ? '' : `<b>${esc(this.rangeLabel(t))}</b>`}<i>${plan ? '예정' : WT_MARK[t.res] || ''}</i>${this.scoreLabel(t) ? `<small>${esc(this.scoreLabel(t))}</small>` : ''}${t.memo ? '<em title="메모">•</em>' : ''}</div>`;
    }).join('');
  },
  cellTip(r) {
    if (!r) return '';
    return (r.tries || []).map((t, i) => `${i + 1}. ${this.kindOf(t, i) === 're' ? '재시험' + (isYmd(t.of) ? '(' + fmtMD(t.of) + ')' : '') : '새 시험'} ${t.res === 'abs' ? '' : this.rangeLabel(t) + ' '}${WT_RES[t.res] || '예정'}${this.scoreLabel(t) ? ' ' + this.scoreLabel(t) : ''}${t.memo ? ' · ' + t.memo : ''}`).join('\n');
  },
  // 칸 위의 날짜 (여러 반에 다니면 그 날 반의 색 점)
  dateHead(it, multi) {
    const dots = multi ? it.ents.map(e => `<span class="wt-dot" style="background:${Classes.colorOf(e.c)}" title="${esc(e.c.name)}"></span>`).join('') : '';
    return `<div class="wt-dh ${dowOf(it.d) === 0 ? 'sun' : dowOf(it.d) === 6 ? 'sat' : ''}">${dots}${+it.d.slice(5, 7)}/${+it.d.slice(8)}<small>${DOW[dowOf(it.d)]}</small></div>`;
  },

  tableHtml(g) {
    const today = todayStr();
    const maxN = Math.max(1, ...g.rows.map(o => o.list.length));
    let h = `<div class="tbl-wrap"><table class="tbl compact ab wt"><thead><tr><th class="ab-name">이름</th><th colspan="${maxN}" class="wt-dcol">날짜별 단어 시험 <span class="small muted">(학생이 오는 날만)</span></th><th class="num">합격</th><th class="num">불합격</th></tr></thead><tbody>`;
    g.rows.forEach(o => {
      const s = o.s;
      const n = this.countOf(s.id, o.list.map(it => it.d));
      const multi = o.cls.size > 1;
      const others = multi ? [...o.cls].filter(id => id !== g.c.id).map(id => Store.get('classes', id)).filter(c => c && c.active !== false) : [];
      h += `<tr data-row="${s.id}"><td class="nowrap ab-name"><b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span>
        ${others.length ? `<div class="wt-oc">${others.map(c => `${Classes.dot(c)}${esc(c.name)}`).join(' ')}</div>` : ''}
        <div class="wt-bk"><button type="button" class="wt-addd" data-addday="${s.id}" title="이 학생의 재시험 날짜 추가">+ 날짜</button></div></td>`;
      o.list.forEach(it => {
        const r = this.rec(s.id, it.d);
        const reg = it.ents.some(e => e.reg);
        const cls = `${it.d === today ? 'today' : ''} ${it.d > today ? 'future' : ''} ${reg ? '' : 'added'}`;
        if (it.absent && !r) { h += `<td class="ab-c wt-c wt-absent ${cls}" title="출석부에 결석으로 기록된 날">${this.dateHead(it, multi)}<div class="wt-ab">결석</div></td>`; return; }
        h += `<td class="ab-c wt-c ${cls}" data-wcid="${g.c.id}" data-d="${it.d}" data-sid="${s.id}" title="${esc((reg ? '' : '수업일 아님 (추가한 날)\n') + this.cellTip(r))}">${this.dateHead(it, multi)}${this.cellInner(r, it.d)}</td>`;
      });
      for (let i = o.list.length; i < maxN; i++) h += '<td class="wt-pad"></td>';
      h += `<td class="num wt-n pass">${n.pass}</td><td class="num wt-n fail">${n.fail}</td></tr>`;
    });
    return h + '</tbody></table></div>';
  },

  /* ---------- 반 고르기 ----------
     단어 시험을 보지 않는 반(설정 meta WCFG { kind:'wcfg', off:[반ID] })은 목록·PDF·다음 수업 계산에서 뺀다.
     화면을 열면 지금 시각의 반을 자동으로 고른다 — 진도 탭과 같은 규칙 (ProgressBook.nowClass):
     수업 중 → 그 반 (붙어 있는 두 반은 경계 시각에 뒷반) / 쉬는 시간 → 다음 반 / 첫 수업 전·마지막 수업 후·수업 없는 날 → '선택 안 함' */
  cfg() { const r = Store.get('meta', 'WCFG'); return r && r.kind === 'wcfg' ? r : null; },
  isOff(cid) { const r = this.cfg(); return !!(r && (r.off || []).includes(cid)); },
  autoClass(list) { return ProgressBook.nowClass(list); },     // list: 단어 시험 보는 반만
  // 고른 반들만 보이게: 학생은 고른 반 중 한 곳에 한 번만 (원래 표시 반이 골라져 있으면 그 반, 아니면 고른 반 중 앞선 반)
  pick(groups, ids) {
    const set = new Set(ids);
    const res = groups.map(g => ({ c: g.c, had: g.had, rows: [] }));
    (groups.per || []).forEach(o => {
      const gi = set.has(groups[o.gi].c.id) ? o.gi : [...o.gis].sort((a, b) => a - b).find(i => set.has(groups[i].c.id));
      if (gi != null) res[gi].rows.push(o);
    });
    res.forEach(g => g.rows.sort((a, b) => Students.sortFn(a.s, b.s)));
    return res.filter(g => set.has(g.c.id));
  },
  // 드롭다운에 넣을 반: 진행 중인 반 (종료된 반 · 단어 시험 안 하는 반은 build에서 이미 뺌)
  listOf(groups) { return groups.filter(g => g.c.active !== false); },

  render(main) {
    if (!this.month) this.month = App.selDate.slice(0, 7);
    const [Y, M] = this.month.split('-').map(Number);
    let h = `<div class="page-narrow"><div class="page-head"><h1>단어 기록</h1>
      ${NavBar.month(this.month)}<button class="btn sm pdf" data-pdf title="이 달 단어 시험 기록을 A4 가로로 인쇄 · PDF 저장 (반 고르기)">PDF 저장</button><button type="button" class="btn sm" data-wcfg title="단어 시험을 보지 않는 반은 목록·PDF에서 뺍니다">⚙ 설정</button></div>`;
    const all = Classes.sorted(Store.all('classes'));
    if (!all.length) { main.innerHTML = h + '<div class="panel"><div class="empty">반이 없습니다. 반 메뉴에서 반을 만드세요.</div></div></div>'; this.bind(main); return; }
    const groups = this.build(Y, M);
    const list = this.listOf(groups);
    if (this.cls === undefined) this.cls = this.autoClass(list.map(g => g.c));
    if (this.cls && !list.some(g => g.c.id === this.cls)) this.cls = '';
    const cur = this.cls ? Store.get('classes', this.cls) : null;
    h += `<div class="toolbar wt-bar"><span style="display:inline-flex;align-items:center">${Classes.selDot(cur)}<select data-wcls style="min-width:220px">
        <option value="" ${cur ? '' : 'selected'}>선택 안 함</option>${list.map(g => `<option value="${g.c.id}" ${g.c.id === this.cls ? 'selected' : ''}>${esc(g.c.name)}</option>`).join('')}</select></span>
      <span class="small soft wt-help">칸을 누르면 기록합니다. 결과를 고르면 다음 시험(당일 · 다음 수업 · 다른 날)을 바로 잡을 수 있고, 결과가 없는 시험은 ‘예정’입니다. 수업 없는 날은 이름 아래 “+ 날짜”.</span></div>`;
    if (!cur) h += `<div class="panel"><div class="empty">${list.length ? '반을 선택하세요.<div class="small muted" style="margin-top:6px">수업 시간에 열면 그 시간 반이 자동으로 선택됩니다.</div>' : '단어 시험을 보는 반이 없습니다. ⚙ 설정에서 고르세요.'}</div></div>`;
    else {
      const g = this.pick(groups, [cur.id])[0];
      const c = g.c;
      h += `<div class="panel ab-sec" data-sec="${c.id}"><div class="ab-sec-head"><h2>${Classes.dot(c)}${esc(c.name)}${c.active === false ? ' <span class="badge gray">종료</span>' : ''}
        <span class="sub">${esc(Classes.timeLabel(c))}</span></h2><span class="grow"></span>${g.rows.length ? `<span class="small muted">${g.rows.length}명</span>` : ''}</div>`;
      if (!g.rows.length) h += '<div class="empty">이 달에 이 반 수강생이 없습니다.</div>';
      else h += this.tableHtml(g);
      h += '</div>';
    }
    h += '</div>';
    main.innerHTML = h;
    this.bind(main);
  },

  bind(main) {
    main.onclick = (e) => {
      if (e.target.closest('[data-mpick]')) { NavBar.pickMonth(this.month).then(v => { if (v && v !== this.month) { this.month = v; App.render(); } }); return; }
      const m = e.target.closest('[data-m]');
      if (m) {
        if (m.dataset.m === '0') this.month = todayStr().slice(0, 7);
        else { const [y, mo] = this.month.split('-').map(Number); const d = new Date(y, mo - 1 + +m.dataset.m, 1); this.month = d.getFullYear() + '-' + pad(d.getMonth() + 1); }
        App.render(); return;
      }
      if (e.target.closest('[data-pdf]')) { this.pdfDlg(); return; }
      if (e.target.closest('[data-wcfg]')) { this.cfgDlg(); return; }
      const cell = e.target.closest('td[data-wcid]');
      if (cell) { this.openCell(cell.dataset.wcid, cell.dataset.sid, cell.dataset.d); return; }
      const ad = e.target.closest('[data-addday]');
      if (ad) {
        const sid = ad.dataset.addday;
        DatePicker.open(todayStr().startsWith(this.month) ? todayStr() : this.month + '-01', '단어 시험 날짜 추가').then(d => {
          if (!isYmd(d) || !Store.get('students', sid)) return;
          this.extra[sid + '|' + d] = 1;
          this.month = d.slice(0, 7);
          App.render();
          const row = $(`[data-row="${sid}"]`, $('#main')); if (row) row.scrollIntoView({ block: 'center' });
        });
      }
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-month]') && /^\d{4}-\d{2}$/.test(e.target.value)) { this.month = e.target.value; App.render(); return; }
      if (e.target.matches('[data-wcls]')) { this.cls = e.target.value; App.render(); }
    };
  },

  // 단어 시험 반 설정 (체크 = 단어 시험을 봄)
  cfgDlg() {
    const all = Classes.sorted(Store.all('classes')).filter(c => c.active !== false);
    const off = new Set((this.cfg() || {}).off || []);
    Modal.open({
      title: '단어 기록 설정', size: 'md', autofocus: false,
      body: `<p class="small muted" style="margin-top:0">단어 시험을 보는 반만 체크하세요. 체크를 끈 반은 반 목록 · PDF · ‘다음 수업’ 날짜 계산에서 빠집니다. 이미 적은 기록은 지워지지 않습니다.</p>
        <div class="pick-list wt-cfg">${all.map(c => `<label><input type="checkbox" name="wc" value="${c.id}" ${off.has(c.id) ? '' : 'checked'}>${Classes.dot(c)}<b>${esc(c.name)}</b></label>`).join('') || '<div class="empty small">진행 중인 반이 없습니다.</div>'}</div>`,
      buttons: [
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const on = new Set($$('[name=wc]:checked', m.body).map(i => i.value));
          const keep = [...off].filter(id => !all.some(c => c.id === id));            // 종료된 반의 설정은 그대로
          const now = new Date().toISOString();
          Store.put('meta', Object.assign({}, this.cfg() || { id: 'WCFG', kind: 'wcfg', createdAt: now }, { off: keep.concat(all.filter(c => !on.has(c.id)).map(c => c.id)), updatedAt: now }));
          toast('설정을 저장했습니다');
          App.render();
        } },
      ],
    });
  },

  /* ---------- 한 칸 기록 창 ----------
     시험(try)마다 kind: 'new'(새 시험) | 're'(재시험), of: 다른 날짜에서 잡은 재시험이면 원래 시험 날짜
     res는 비어 있어도 됨 = 예정 (나중에 결과를 고름). 예전 기록은 kind가 없으므로 첫 시험은 새 시험, 나머지는 재시험으로 본다 */
  kindOf(t, i) { return t.kind === 'new' || t.kind === 're' ? t.kind : (i ? 're' : 'new'); },
  // 범위가 있는 시험 (결시 제외)
  hasRange(t) { return t.res !== 'abs' && +t.from > 0; },
  // 이 학생의 d 이전 기록 중 조건에 맞는 마지막 시험 { t, date }
  lastBefore(sid, d, pick) {
    const rs = this.recs().filter(r => r.studentId === sid && r.date < d).sort((a, b) => ko(b.date, a.date));
    for (const r of rs) { const t = (r.tries || []).filter(pick).pop(); if (t) return { t, date: r.date }; }
    return null;
  },
  // 새 시험의 기본 범위: 마지막 범위(이 칸 → 이전 기록) 다음부터 같은 개수만큼 (없으면 빈칸)
  defNew(sid, d, tries) {
    const in0 = tries.filter(t => this.hasRange(t)).pop();
    const t = in0 || ((this.lastBefore(sid, d, x => this.hasRange(x)) || {}).t);
    if (!t) return { from: '', to: '' };
    const f = +t.from, e = +t.to || f, n = e - f;
    return { from: e + 1, to: e + 1 + n };
  },
  // 재시험의 기본 범위: 이 칸의 마지막 불합격 → 이전 기록의 마지막 불합격(그 날짜를 of로) → 마지막 범위
  defRe(sid, d, tries) {
    const inF = tries.filter(t => t.res === 'fail' && this.hasRange(t)).pop();
    if (inF) return { from: inF.from, to: inF.to, of: '' };
    // 이전 기록에서 아직 합격하지 못한 마지막 불합격 (뒤에 같은 범위를 합격했으면 건너뜀)
    const key = (t) => +t.from + '-' + (+t.to || +t.from);
    const passed = new Set(tries.filter(t => t.res === 'pass' && this.hasRange(t)).map(key));
    const rs = this.recs().filter(x => x.studentId === sid && x.date < d).sort((a, b) => ko(b.date, a.date));
    for (const x of rs) {
      for (const t of [...(x.tries || [])].reverse()) {
        if (!this.hasRange(t)) continue;
        if (t.res === 'pass') passed.add(key(t));
        else if (t.res === 'fail' && !passed.has(key(t))) return { from: t.from, to: t.to, of: x.date };
      }
    }
    const last = tries.filter(t => this.hasRange(t)).pop();
    return last ? { from: last.from, to: last.to, of: '' } : { from: '', to: '', of: '' };
  },
  // 만점은 비워 두면 창에서 학생 기억값(처음 50)으로 채운다
  newTry(kind, r) { return { kind, of: (r && r.of) || '', from: r ? r.from : '', to: r ? r.to : '', res: '', score: '', total: '', memo: '' }; },

  /* ---------- 학생별 기억값 (meta WS_학생ID { kind:'wset', studentId, total, mode }) ----------
     total: 만점 (처음 50, 이후 마지막에 쓴 값) / mode: 다음 시험 범위 'direct' 직접 입력 · 'rule' 규칙
     규칙: 'n개씩' — 이번 범위를 n개만큼 뒤로 민다 (앞을 n개 자르고 뒤에 n개 붙임: 3-9, 2개씩 → 5-11).
           n은 매번 달라서 기억하지 않고, 그때그때 넣는다 */
  setId(sid) { return 'WS_' + sid; },
  setOf(sid) {
    const r = Store.get('meta', this.setId(sid));
    const ok = !!(r && r.kind === 'wset');
    const num = (v, def) => (ok && v !== '' && v != null && !isNaN(+v) ? +v : def);
    return { total: num(r && r.total, 50) > 0 ? num(r && r.total, 50) : 50, mode: ok && r.mode === 'rule' ? 'rule' : 'direct' };
  },
  saveSet(sid, v) {
    const now = new Date().toISOString();
    const cur = Store.get('meta', this.setId(sid));
    Store.put('meta', Object.assign({}, cur && cur.kind === 'wset' ? cur : { id: this.setId(sid), kind: 'wset', studentId: sid, createdAt: now },
      { total: v.total, mode: v.mode, updatedAt: now }));
  },
  ruleRange(base, cut, add) {
    const f = +base.from, t = +base.to || f;
    if (!(f > 0)) return null;
    const nf = f + (+cut || 0), nt = t + (+add || 0);
    return nf >= 1 && nt >= nf ? { from: nf, to: nt } : null;
  },
  // 그 날 이 학생이 오는 단어 시험 반 (시간 순 첫 반)
  classOn(sid, ds) {
    const list = Classes.sortedOn(Store.all('classes').filter(c => c.active !== false && !this.isOff(c.id) && (c.days || []).includes(dowOf(ds)) && !(Classes.startOf(c) > ds)), dowOf(ds));
    const c = list.find(x => Classes.rosterOn(x.id, ds).some(s => s.id === sid));
    return c ? c.id : '';
  },
  // d 다음 수업일 (공휴일 제외, 60일 안) → { date, cid } | null
  nextClass(sid, d) {
    for (let i = 1; i <= 60; i++) {
      const ds = addDaysStr(d, i);
      if (Holidays.has(ds)) continue;
      const cid = this.classOn(sid, ds);
      if (cid) return { date: ds, cid };
    }
    return null;
  },
  // 다른 날 칸에 시험(예정)을 넣는다 — 이미 같은 예정 시험이 있으면 넣지 않음
  addTries(sid, date, cid, list, matId, matName) {
    const now = new Date().toISOString();
    const key = (t, i) => this.kindOf(t, i) + '|' + (+t.from) + '|' + (+t.to || +t.from);
    const r = this.rec(sid, date);
    if (r) {
      const tries = (r.tries || []).slice();
      const have = new Set(tries.map((t, i) => WT_RES[t.res] ? '' : key(t, i)));
      list.forEach(t => { if (!have.has(key(t, 1))) tries.push(t); });
      Store.put('meta', Object.assign({}, r, { tries, updatedAt: now }));
    } else {
      const bk = this.bookOn(sid, date);
      Store.put('meta', { id: this.recId(sid, date), kind: 'wtest', studentId: sid, date, classId: cid,
        matId: bk ? bk.matId : matId, matName: bk ? Books.nameOf(bk) : matName, tries: list, createdAt: now, updatedAt: now });
    }
    if (!(this.classOn(sid, date))) this.extra[sid + '|' + date] = 1;    // 수업 없는 날이어도 칸이 보이게
  },

  // preset: 다른 날짜에서 잡은 재시험 { kind:'re', of, from, to } — 이 칸에 미리 채워 연다
  openCell(cid, sid, d, preset) {
    const s = Store.get('students', sid);
    if (!s) return;
    const r = this.rec(sid, d);
    // 단어장이 없어도 바로 기록 (있으면 이름만 조용히 남김)
    const bk = r ? null : this.bookOn(sid, d);
    const matId = r ? (r.matId || '') : (bk ? bk.matId : '');
    const matName = r ? (r.matName || '') : (bk ? Books.nameOf(bk) : '');
    const st = this.setOf(sid);                  // 이 학생의 만점 · 범위 규칙 (마지막에 쓴 값)
    const st0 = JSON.stringify(st);
    const sv = (v) => (v === null || v === undefined ? '' : String(v));
    const isInt = (v) => /^\d+$/.test(v);
    // 만점이 비어 있으면 기억한 만점으로 · 틀린 개수는 점수에서 거꾸로
    const fill = (t) => {
      if (!(+t.total > 0)) t.total = st.total;
      t.wrong = sv(t.score) !== '' && !isNaN(+t.score) ? +t.total - +t.score : '';
      return t;
    };
    const tries = JSON.parse(JSON.stringify((r && r.tries) || [])).map((t, i) => fill(Object.assign({ of: '', fu: '' }, t, { kind: this.kindOf(t, i) })));
    tries.forEach(t => { t._r0 = t.res || ''; });
    const mk = (kind, rg) => { const t = fill(this.newTry(kind, rg)); t._r0 = ''; return t; };
    const baseOf = (t) => (+t.from > 0 ? { from: +t.from, to: +t.to || +t.from } : null);
    // 규칙(n개씩): 이번 범위를 n개만큼 민 범위 (n이 비면 null)
    const ruleOf = (b, n) => (st.mode === 'rule' && b && isInt(sv(n).trim()) ? this.ruleRange(b, +n, +n) : null);
    if (preset) tries.push(mk('re', preset));
    else if (!tries.length) tries.push(mk('new', null));          // 범위는 빈칸으로 시작 (직접 입력)
    const nx = this.nextClass(sid, d);

    /* 결과를 고르면 그 시험 아래에 '다음 시험' 칸이 나온다 (이번에 결과를 바꾼 시험만, 이미 이어 잡은 시험은 제외)
       t._f = { tgt: 'next'|'other'|'none'|'', date(다른 날), withNew(불합격·결시: 새 시험도 함께), n(규칙: 몇 개씩), nf, nt(새 시험 범위) }
       t.fu (저장): 이어 잡은 날짜 · 'same'(당일) */
    const showF = (t) => !!WT_RES[t.res] && t.res !== t._r0 && !t.fu;
    const fillRule = (t) => { const g = t._f && ruleOf(baseOf(t), t._f.n); if (g) { t._f.nf = g.from; t._f.nt = g.to; } };
    const initF = (t) => { t._f = { tgt: t.res === 'pass' && nx ? 'next' : '', date: '', withNew: false, n: '', nf: '', nt: '' }; };
    // 당일에 이어서: 합격 → 새 시험 / 불합격·결시 → 같은 범위 재시험 (이 창에 바로 추가)
    const sameDay = (t) => {
      const nt = t.res === 'pass' ? mk('new', ruleOf(baseOf(t), t._f && t._f.n)) : mk('re', Object.assign({ of: '' }, baseOf(t) || { from: '', to: '' }));
      nt._src = t;
      t.fu = 'same'; t._f = null;
      tries.push(nt);
    };
    const scTxt = (t) => {
      const w = sv(t.wrong).trim(), tt = sv(t.total).trim();
      if (w === '') return '<span class="muted">점수 없음</span>';
      if (!isInt(w) || !isInt(tt) || +tt < 1 || +w > +tt) return '<span class="wt-bad">틀린 개수를 확인하세요</span>';
      return `= <b>${+tt - +w}</b> / ${+tt}`;
    };
    const calc = (t) => {
      const w = sv(t.wrong).trim(), tt = sv(t.total).trim();
      if (w === '') t.score = '';
      else if (isInt(w) && isInt(tt) && +tt >= 1 && +w <= +tt) t.score = +tt - +w;
    };
    const ofTxt = (t) => (t.kind === 're' && isYmd(t.of) && t.of !== d ? `<span class="wt-of">${fmtMD(t.of)} 시험의 재시험</span>` : '');
    const rngHtml = (i, f) => `<span class="wt-seg sm">${['direct', 'rule'].map(k => `<button type="button" data-fum="${i}|${k}" class="${st.mode === k ? 'on' : ''}">${k === 'direct' ? '직접 입력' : '규칙'}</button>`).join('')}</span>
      ${st.mode === 'rule' ? `<span class="wt-rule" title="이번 범위를 몇 개씩 밀지 (예: 3-9를 2개씩 → 5-11)"><input type="number" data-fun="n" data-i="${i}" value="${esc(sv(f.n))}" min="0">개씩</span>` : ''}
      <span class="wt-rng"><input type="number" data-fun="nf" data-i="${i}" value="${esc(sv(f.nf))}" min="1" placeholder="시작"> ~ <input type="number" data-fun="nt" data-i="${i}" value="${esc(sv(f.nt))}" min="1" placeholder="끝"></span>`;
    const fuHtml = (t, i) => {
      if (t.fu) return `<div class="wt-fu-done">↳ ${t.fu === 'same' ? '당일 시험을 아래에 추가했습니다' : `${fmtMD(t.fu)} 시험으로 이어서 잡았습니다`}</div>`;
      if (!showF(t)) return '';
      if (!t._f) initF(t);
      const f = t._f, pass = t.res === 'pass';
      const b = (k, label, dis) => `<button type="button" data-fut="${i}|${k}" class="${f.tgt === k ? 'on' : ''}" ${dis ? 'disabled' : ''}>${label}</button>`;
      const go = f.tgt === 'next' || (f.tgt === 'other' && f.date);
      let h = `<div class="wt-fu ${pass ? 'pass' : 'fail'}"><div class="wt-fu-row"><span class="wt-fu-h">${pass ? '다음 시험' : '재시험'}</span>
        <div class="wt-seg">${b('same', pass ? '당일 새 시험' : '당일 재시험')}${b('next', nx ? `다음 수업 <small>${fmtMD(nx.date)}</small>` : '다음 수업 없음', !nx)}${b('other', f.tgt === 'other' && f.date ? `다른 날 <small>${fmtMD(f.date)}</small>` : '다른 날')}${b('none', pass ? '안 함' : '나중에')}</div></div>`;
      if (go && !pass) h += `<div class="wt-fu-row"><span class="wt-fu-h"></span><span class="wt-chip re">재 ${esc(this.rangeLabel(baseOf(t) || {}) || '범위 없음')}</span><label class="chk"><input type="checkbox" data-fuw="${i}" ${f.withNew ? 'checked' : ''}>새 시험도 함께</label></div>`;
      if (go && (pass || f.withNew)) h += `<div class="wt-fu-row"><span class="wt-fu-h">${pass ? '범위' : '새 시험'}</span>${rngHtml(i, f)}</div>`;
      if (go) h += `<div class="wt-fu-note">저장하면 ${fmtMD(f.tgt === 'next' ? nx.date : f.date)} 칸에 예정으로 들어갑니다${pass || f.withNew ? ' (범위를 비우면 새 시험은 넣지 않음)' : ''}</div>`;
      return h + '</div>';
    };
    const tryHtml = (t, i) => `<div class="wt-try${t.kind === 're' ? ' re' : ''}" data-i="${i}">
      <div class="wt-try-h"><span class="wt-no">${i + 1}</span>
        <div class="wt-kind">${['new', 're'].map(k => `<button type="button" data-tkind="${i}|${k}" class="${t.kind === k ? 'on' : ''}">${k === 'new' ? '새 시험' : '재시험'}</button>`).join('')}</div>
        ${ofTxt(t)}${WT_RES[t.res] ? '' : '<span class="wt-plan-b">예정</span>'}
        <span style="flex:1"></span>${tries.length > 1 ? `<button type="button" class="icon-btn" data-tdel="${i}" title="이 시험 삭제">✕</button>` : ''}</div>
      <div class="wt-grid">
        <label>결과</label><div class="wt-res">${Object.keys(WT_RES).map(k => `<button type="button" data-tres="${i}|${k}" class="r-${k}${t.res === k ? ' on' : ''}">${WT_RES[k]}</button>`).join('')}
          ${WT_RES[t.res] ? `<button type="button" class="wt-clr" data-tclr="${i}" title="결과를 지우고 예정으로">결과 지우기</button>` : ''}</div>
        ${t.res === 'abs' ? '' : `<label class="req">범위</label><div class="wt-line"><input type="number" data-f="from" data-i="${i}" value="${esc(sv(t.from))}" min="1" style="width:76px">
          ~ <input type="number" data-f="to" data-i="${i}" value="${esc(sv(t.to))}" min="1" style="width:76px"><span class="hint">한 강이면 뒤 칸은 비워도 됩니다</span></div>
        <label>틀린 개수</label><div class="wt-line"><input type="number" data-f="wrong" data-i="${i}" value="${esc(sv(t.wrong))}" min="0" style="width:76px">
          <span class="wt-sc" data-sc="${i}">${scTxt(t)}</span><span class="wt-tot">만점 <input type="number" data-f="total" data-i="${i}" value="${esc(sv(t.total))}" min="1" style="width:62px"></span></div>`}
        <label class="top">메모</label><textarea data-f="memo" data-i="${i}" rows="1">${esc(t.memo || '')}</textarea>
      </div>${fuHtml(t, i)}</div>`;

    // 입력값 검사 → 저장할 시험 목록 (잘못되면 null)
    const collect = () => {
      const out = [];
      for (let i = 0; i < tries.length; i++) {
        const t = tries[i], no = `${i + 1}번째 시험`;
        const kind = t.kind, of = kind === 're' && isYmd(t.of) && t.of !== d ? t.of : '';
        const memo = stripZws(t.memo || '').trim();
        const fu = t.fu || '';
        if (t.res === 'abs') { out.push({ kind, of, from: '', to: '', res: 'abs', score: '', total: '', memo, fu }); continue; }
        const fs = sv(t.from).trim(), ts = sv(t.to).trim();
        if (!isInt(fs) || +fs < 1) { toast(`${no}: 범위 시작을 1 이상의 숫자로 넣으세요`); return null; }
        if (ts !== '' && (!isInt(ts) || +ts < 1)) { toast(`${no}: 범위 끝을 숫자로 넣으세요`); return null; }
        const from = +fs, to = ts === '' ? from : +ts;
        if (from > to) { toast(`${no}: 범위의 시작이 끝보다 큽니다`); return null; }
        const w = sv(t.wrong).trim(), tt = sv(t.total).trim();
        if (tt !== '' && (!isInt(tt) || +tt < 1)) { toast(`${no}: 만점을 1 이상의 숫자로 넣으세요`); return null; }
        if (w !== '' && !isInt(w)) { toast(`${no}: 틀린 개수를 숫자로 넣으세요`); return null; }
        if (w !== '' && tt === '') { toast(`${no}: 만점을 넣으세요`); return null; }
        if (w !== '' && +w > +tt) { toast(`${no}: 틀린 개수가 만점보다 많습니다`); return null; }
        out.push({ kind, of, from, to, res: WT_RES[t.res] ? t.res : '', score: w === '' ? '' : +tt - +w, total: tt === '' ? st.total : +tt, memo, fu });
      }
      return out;
    };
    // 다른 날로 이어 잡을 시험 → [{ i, date, cid, list }] (잘못되면 null)
    const plan = () => {
      const ops = [];
      for (let i = 0; i < tries.length; i++) {
        const t = tries[i], f = t._f;
        if (!showF(t) || !f) continue;
        const date = f.tgt === 'next' ? (nx && nx.date) : f.tgt === 'other' ? f.date : '';
        if (!isYmd(date)) continue;
        const nr = () => {
          const a = sv(f.nf).trim(), z = sv(f.nt).trim();
          if (a === '' && z === '') return '';
          if (!isInt(a) || +a < 1 || (z !== '' && (!isInt(z) || +z < +a))) return null;
          return { from: +a, to: z === '' ? +a : +z };
        };
        const list = [];
        const nt = (kind, g) => ({ kind, of: g.of || '', from: g.from, to: g.to, res: '', score: '', total: st.total, memo: '' });
        if (t.res !== 'pass') {
          const b0 = baseOf(t);
          if (!b0) { toast(`${i + 1}번째 시험: 범위가 없어 재시험을 잡을 수 없습니다`); return null; }
          list.push(nt('re', Object.assign({ of: d }, b0)));
        }
        if (t.res === 'pass' || f.withNew) {
          const g = nr();
          if (g === null) { toast(`${i + 1}번째 시험: 새 시험 범위를 확인하세요`); return null; }
          if (g) list.push(nt('new', g));
        }
        if (list.length) ops.push({ i, date, cid: nx && date === nx.date ? nx.cid : (this.classOn(sid, date) || cid), list });
      }
      return ops;
    };
    const save = (out) => {
      const now = new Date().toISOString();
      const rec = Object.assign({}, r || { id: this.recId(sid, d), kind: 'wtest', studentId: sid, date: d, classId: cid, createdAt: now }, {
        matId, matName: matName || (r ? r.matName : ''), tries: out, updatedAt: now,
      });
      Store.put('meta', rec);
    };
    const doSave = () => {
      const out = collect();
      if (!out) return false;
      const ops = plan();
      if (!ops) return false;
      ops.forEach(o => { out[o.i].fu = o.date; });
      save(out);
      ops.forEach(o => this.addTries(sid, o.date, o.cid, o.list, matId, matName));
      const lt = [...out].reverse().find(t => t.res !== 'abs' && +t.total > 0);
      if (lt) st.total = +lt.total;
      if (JSON.stringify(st) !== st0) this.saveSet(sid, st);
      toast(ops.length ? `저장했습니다 · ${[...new Set(ops.map(o => fmtMD(o.date)))].join(', ')}에 시험 예정 등록` : out.some(t => !t.res) ? '저장했습니다 (결과 없는 시험은 예정)' : '단어 시험을 저장했습니다');
      App.render();
      return true;
    };

    const body = `<div class="wt-modal">
      <div class="wt-mhead"><span class="small soft">${nx ? `다음 수업 <b>${fmtMD(nx.date)}</b>` : '다음 수업 없음'}</span></div>
      <div data-tries></div>
    </div>`;
    const md = Modal.open({
      title: `${s.name} · ${fmtMD(d)} 단어 시험`, size: 'lg', body, autofocus: false,
      onMount: (b, m) => {
        const box = $('[data-tries]', b);
        const draw = () => { box.innerHTML = tries.map(tryHtml).join(''); };
        const setRng = (j) => {
          const t = tries[j]; if (!t || !t._f) return;
          $$(`[data-fun][data-i="${j}"]`, box).forEach(x => { if (x !== document.activeElement) x.value = sv(t._f[x.dataset.fun]); });
        };
        draw();
        // 아래 줄 왼쪽: 시험 추가 · 기록 삭제 / 오른쪽: 취소 · 저장
        const fl = document.createElement('div');
        fl.className = 'wt-foot-l';
        fl.innerHTML = `<button type="button" class="btn sm wt-add-new" data-tadd="new">+ 새 시험</button><button type="button" class="btn sm wt-add-re" data-tadd="re">+ 재시험</button>
          ${r ? '<span class="wt-foot-sep"></span><button type="button" class="btn sm danger wt-delrec" data-tdelrec>기록 삭제</button>' : ''}`;
        m.foot.prepend(fl);
        fl.addEventListener('click', async (e) => {
          const ad = e.target.closest('[data-tadd]');
          if (ad) {
            const k = ad.dataset.tadd;
            // 범위는 빈칸으로 시작 (직접 입력). 재시험은 어느 날 불합격의 재시험인지(of)만 이어 받는다
            tries.push(k === 're' ? mk('re', { from: '', to: '', of: this.defRe(sid, d, tries).of }) : mk('new', null));
            draw();
            const last = box.lastElementChild; if (last) last.scrollIntoView({ block: 'nearest' });
            return;
          }
          if (e.target.closest('[data-tdelrec]')) {
            if (!await confirmDlg(`${s.name} · ${fmtMD(d)} 단어 시험 기록을 모두 삭제할까요?`, '삭제', true)) return;
            Store.del('meta', r.id);
            toast('단어 시험 기록을 삭제했습니다');
            m.close();
            App.render();
          }
        });
        b.addEventListener('change', (e) => {
          const w = e.target.closest('[data-fuw]');
          if (w) { const t = tries[+w.dataset.fuw]; t._f.withNew = w.checked; if (w.checked && sv(t._f.nf) === '') fillRule(t); draw(); }
        });
        b.addEventListener('input', (e) => {
          const el = e.target, i = +el.dataset.i, t = tries[i];
          if (!t) return;
          const f = el.dataset.f;
          if (f) {
            t[f] = el.value;
            if (f === 'wrong' || f === 'total') { calc(t); const sc = $(`[data-sc="${i}"]`, box); if (sc) sc.innerHTML = scTxt(t); }
            if ((f === 'from' || f === 'to') && t._f && st.mode === 'rule') { fillRule(t); setRng(i); }
            return;
          }
          if (el.dataset.fun && t._f) {
            t._f[el.dataset.fun] = el.value;
            if (el.dataset.fun === 'n') { fillRule(t); setRng(i); }       // 몇 개씩을 넣으면 범위가 바로 채워짐
          }
        });
        b.addEventListener('click', async (e) => {
          const rb = e.target.closest('[data-tres]');
          if (rb) {
            const [i, k] = rb.dataset.tres.split('|');
            const t = tries[+i];
            if (t.res !== k) { t.res = k; t._f = null; if (showF(t)) initF(t); draw(); }
            return;
          }
          const kb = e.target.closest('[data-tkind]');
          if (kb) {
            const [i, k] = kb.dataset.tkind.split('|');
            const t = tries[+i];
            if (t.kind !== k) { t.kind = k; if (k === 'new') t.of = ''; draw(); }
            return;
          }
          const cl = e.target.closest('[data-tclr]');
          if (cl) { const t = tries[+cl.dataset.tclr]; t.res = ''; t._f = null; draw(); return; }
          const del = e.target.closest('[data-tdel]');
          if (del) {
            const [t] = tries.splice(+del.dataset.tdel, 1);
            if (t && t._src && t._src.fu === 'same') t._src.fu = '';       // 당일로 이어 잡은 시험을 지우면 다시 고를 수 있게
            draw(); return;
          }
          const fm = e.target.closest('[data-fum]');
          if (fm) {
            const k = fm.dataset.fum.split('|')[1];
            if (st.mode !== k) { st.mode = k; if (k === 'rule') tries.forEach(x => { if (x._f) fillRule(x); }); draw(); }
            return;
          }
          const fb = e.target.closest('[data-fut]');
          if (fb) {
            const [i, k] = fb.dataset.fut.split('|');
            const t = tries[+i], f = t._f;
            if (!f) return;
            if (k === 'same') { sameDay(t); draw(); const last = box.lastElementChild; if (last) last.scrollIntoView({ block: 'nearest' }); return; }
            if (k === 'other') {
              const d2 = await DatePicker.open(f.date || (nx ? nx.date : addDaysStr(d, 1)), t.res === 'pass' ? '다음 시험 날짜' : '재시험 날짜');
              if (!isYmd(d2) || md.closed) return;
              if (d2 === d) { sameDay(t); draw(); return; }
              f.tgt = 'other'; f.date = d2; draw(); return;
            }
            f.tgt = k; draw();
          }
        });
      },
      buttons: [
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: () => doSave() },
      ],
    });
    return md;
  },

  /* ---------- PDF 창: 지금 반 / 단어 시험 반 전체 / 직접 고르기 + 반마다 새 페이지 ---------- */
  pdfScope: 'all',
  pdfPage: true,
  pdfPick: null,
  pdfDlg() {
    const [Y, M] = this.month.split('-').map(Number);
    const groups = this.build(Y, M);
    const list = this.listOf(groups);
    if (!list.length) { toast('단어 시험을 보는 반이 없습니다'); return; }
    const cur = this.cls && list.find(g => g.c.id === this.cls);
    const scope = this.pdfScope === 'cur' && !cur ? 'all' : this.pdfScope;
    const picked = new Set(this.pdfPick || (cur ? [cur.c.id] : []));
    const body = `<div class="form">
      <label>범위</label><div class="row">${[['cur', cur ? `지금 반 (${esc(cur.c.name)})` : '지금 반', !cur], ['all', '단어 시험 반 전체'], ['pick', '직접 고르기']].map(([k, t, dis]) => `<label class="chk"><input type="radio" name="wpscope" value="${k}" ${scope === k ? 'checked' : ''} ${dis ? 'disabled' : ''}>${t}</label>`).join('')}</div>
      <label class="top" data-wppick>반</label><div data-wppick><div class="pick-list">${list.map(g => `<label><input type="checkbox" name="wpc" value="${g.c.id}" ${picked.has(g.c.id) ? 'checked' : ''}>${Classes.dot(g.c)}${esc(g.c.name)}</label>`).join('')}</div></div>
      <label>쪽 나누기</label><div class="row"><label class="chk"><input type="checkbox" name="wppage" ${this.pdfPage ? 'checked' : ''}>반마다 새 페이지에서 시작</label></div>
    </div><p class="small muted" style="margin:10px 0 0">${Y}년 ${M}월 기록입니다. 여러 반을 넣으면 여러 반에 다니는 학생은 앞선 반에 한 번만 나옵니다. 인쇄 창에서 “PDF로 저장”을 고르면 파일로 저장됩니다.</p>`;
    Modal.open({
      title: '단어 시험 PDF 저장', size: 'md', autofocus: false, body,
      onMount: (b) => {
        const sync = () => { const pk = ($('[name=wpscope]:checked', b) || {}).value === 'pick'; $$('[data-wppick]', b).forEach(x => { x.style.display = pk ? '' : 'none'; }); };
        sync();
        b.addEventListener('change', (e) => { if (e.target.name === 'wpscope') sync(); });
      },
      buttons: [
        { text: '취소' },
        { text: 'PDF 저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body;
          this.pdfScope = $('[name=wpscope]:checked', b).value;
          this.pdfPage = $('[name=wppage]', b).checked;
          let ids;
          if (this.pdfScope === 'cur') ids = cur ? [cur.c.id] : [];
          else if (this.pdfScope === 'all') ids = list.map(g => g.c.id);
          else { ids = $$('[name=wpc]:checked', b).map(i => i.value); this.pdfPick = ids; }
          if (!ids.length) { toast('반을 고르세요'); return false; }
          if (!this.pdf(ids, this.pdfPage)) return false;
        } },
      ],
    });
  },

  /* ---------- PDF: A4 가로, 반마다 표 (학생 한 줄 = 그 학생이 오는 날만) ----------
     칸이 좁아도 잘리지 않게: 범위·결과·점수를 덩어리로 나눠 덩어리 사이에서만 줄바꿈, 칸이 많으면 글자를 줄임 */
  pdf(ids, newPage) {
    const [Y, M] = this.month.split('-').map(Number);
    const sel = this.pick(this.build(Y, M), ids).filter(g => g.rows.length);
    if (!sel.length) { toast('고른 반에 이 달 학생이 없습니다'); return false; }
    let body = '';
    sel.forEach((g, gi) => {
      const c = g.c;
      const maxN = Math.max(1, ...g.rows.map(o => o.list.length));
      const fz = maxN > 20 ? 'z3' : maxN > 15 ? 'z2' : maxN > 11 ? 'z1' : '';
      const head = `<tr><th class="ttl" colspan="${maxN + 3}"><span class="dot" style="background:${Classes.colorOf(c)}"></span>${esc(c.name)}${c.active === false ? ' (종료)' : ''}<span class="sub">${esc(Classes.timeLabel(c))} · ${g.rows.length}명</span></th></tr>
        <tr><th class="nm">이름</th><th colspan="${maxN}">날짜별 단어 시험</th><th class="sm">합격</th><th class="sm">불합격</th></tr>`;
      const rows = g.rows.map(o => {
        const s = o.s;
        const n = this.countOf(s.id, o.list.map(it => it.d));
        const cells = o.list.map(it => {
          const r = this.rec(s.id, it.d);
          const dh = `<div class="dh ${dowOf(it.d) === 0 ? 'sun' : dowOf(it.d) === 6 ? 'sat' : ''}">${+it.d.slice(5, 7)}/${+it.d.slice(8)} ${DOW[dowOf(it.d)]}</div>`;
          if (it.absent && !r) return `<td class="absent">${dh}결석</td>`;
          if (!r) return `<td>${dh}</td>`;
          return `<td>${dh}${(r.tries || []).map((t, i) => `<div class="t ${WT_RES[t.res] ? t.res : 'plan'}">${this.kindOf(t, i) === 're' ? '<span class="k">재</span> ' : ''}${t.res === 'abs' ? '<span class="u">결시</span>' : `<span class="u">${esc(this.rangeLabel(t))}</span> <span class="u">${WT_MARK[t.res] || '예정'}</span>`}${this.scoreLabel(t) ? ' <small class="u">' + esc(this.scoreLabel(t)) + '</small>' : ''}</div>`).join('')}</td>`;
        }).join('');
        let fill = ''; for (let i = o.list.length; i < maxN; i++) fill += '<td class="pad"></td>';
        return `<tr><td class="nm"><b>${esc(s.name)}</b> <span class="tag">${esc(stTag(s))}</span></td>${cells}${fill}<td>${n.pass}</td><td>${n.fail}</td></tr>`;
      }).join('');
      let cg = ''; for (let i = 0; i < maxN; i++) cg += '<col>';
      const cols = `<colgroup><col class="c-nm">${cg}<col class="c-sm"><col class="c-sm"></colgroup>`;
      body += `<table class="${fz}${newPage && gi ? ' pb' : ''}">${cols}<thead>${head}</thead><tbody>${rows}</tbody></table>`;
    });
    const title = `단어시험_${this.month}${sel.length === 1 ? '_' + sel[0].c.name : ''}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: A4 landscape; margin: 8mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #111; font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif; font-size: 7.5pt; }
      h1 { font-size: 13pt; margin: 0 0 3mm; display: flex; justify-content: space-between; align-items: baseline; }
      h1 small { font-size: 8pt; font-weight: normal; color: #666; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4mm; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      table.pb { break-before: page; page-break-before: always; }
      th, td { border: 0.5pt solid #9aa3ad; padding: 0.6mm 0.4mm; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.25; }
      td { height: 7mm; word-break: keep-all; overflow-wrap: anywhere; }
      th { background: #eef2f7; height: 7mm; font-weight: bold; line-height: 1.1; white-space: nowrap; }
      th small { display: block; font-size: 6pt; font-weight: normal; color: #666; }
      th.ttl { text-align: left; padding-left: 2mm; height: 6.5mm; background: #dfe7f1; font-size: 9.5pt; }
      th.ttl .dot { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 4pt; vertical-align: -0.5pt; }
      th.ttl .sub { font-weight: normal; color: #555; font-size: 8pt; margin-left: 6pt; }
      col.c-nm { width: 34mm; } col.c-sm { width: 10mm; }
      th.nm, td.nm { text-align: left; padding-left: 1.5mm; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
      td.nm .tag { color: #777; font-size: 6.5pt; }
      td.nm .bk { color: #555; font-size: 6.5pt; overflow: hidden; text-overflow: ellipsis; }
      th.sun { color: #c62828; } th.sat { color: #1f5fbf; }
      td .t { white-space: normal; line-height: 1.2; }
      td .t + .t { border-top: 0.3pt dashed #ccc; margin-top: 0.3mm; padding-top: 0.3mm; }
      td .u { white-space: nowrap; display: inline-block; }
      td .k { font-size: 0.85em; }
      td small { color: #555; font-size: 0.85em; }
      table.z1 td, table.z1 th { font-size: 7pt; } table.z2 td, table.z2 th { font-size: 6.4pt; } table.z3 td, table.z3 th { font-size: 5.8pt; }
      table.z2 td .dh, table.z3 td .dh { font-size: 5.4pt; }
      .pass { color: #1b7a52; } .fail { color: #c62828; font-weight: bold; } .abs { color: #777; } .plan { color: #8a6d1d; }
      td.absent { background: #f0f1f3; color: #999; font-size: 6.5pt; }
      td.pad { background: #fafafa; border-color: #e3e6ea; }
      td .dh { font-size: 6pt; color: #555; border-bottom: 0.3pt dotted #bbb; margin-bottom: 0.4mm; }
      td .dh.sun { color: #c62828; } td .dh.sat { color: #1f5fbf; }
      td { vertical-align: top; }
    </style></head><body><h1>${Y}년 ${M}월 단어 시험<small>출력일 ${todayStr()}</small></h1>${body}</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open(); doc.write(html); doc.close();
    const t0 = document.title;
    setTimeout(() => {
      document.title = title;
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally {
        document.title = t0;
        setTimeout(() => fr.remove(), 1000);
      }
    }, 300);
    return true;
  },
};

/* 단어 화면 전용 스타일 */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.tbl.wt th.wt-dcol { text-align: left; }
.tbl.wt td.wt-c { min-width: 58px; vertical-align: top; }
.wt-dh { font-size: 11px; color: var(--ink-soft); font-weight: 600; white-space: nowrap; border-bottom: 1px dotted var(--line); padding-bottom: 2px; margin-bottom: 3px; }
.wt-dh small { margin-left: 2px; font-weight: 400; color: var(--ink-mute); }
.wt-dh.sun, .wt-dh.sun small { color: var(--danger); }
.wt-dh.sat, .wt-dh.sat small { color: var(--sat); }
.wt-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 2px; vertical-align: 1px; }
.tbl.wt td.wt-c.today { box-shadow: inset 0 0 0 2px var(--accent); }
.tbl.wt td.wt-c.today .wt-dh { color: var(--accent); }
.tbl.wt td.wt-c.future { background-color: var(--tint-2); }
.tbl.wt td.wt-c.future .wt-dh { color: var(--ink-mute); font-weight: 500; }
.tbl.wt td.wt-c.added { background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(43,127,193,.05) 6px 8px); }
.tbl.wt td.wt-pad { background: #FBFCFD; cursor: default; }
.wt-ab { padding-top: 2px; }
.wt-oc { font-size: 11px; color: var(--ink-soft); margin-top: 1px; }
.wt-addd { border: 0; background: none; padding: 0; font: inherit; font-size: 11.5px; color: var(--accent); cursor: pointer; vertical-align: bottom; }
.wt-addd:hover { text-decoration: underline; }
.tbl.wt td.wt-c { font-weight: 500; padding: 4px 3px; vertical-align: middle; line-height: 1.25; }
.wt-t { white-space: nowrap; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.wt-t + .wt-t { border-top: 1px dashed var(--line); margin-top: 2px; padding-top: 2px; }
.wt-t b { font-weight: 600; color: var(--ink); }
.wt-t i { font-style: normal; font-weight: 800; margin-left: 2px; }
.wt-t.pass i { color: var(--ok); }
.wt-t.fail i { color: var(--danger); }
.wt-t.abs i { color: var(--ink-mute); font-weight: 600; font-size: 11.5px; }
.wt-t small { display: block; font-size: 11px; color: var(--ink-soft); }
.wt-t em { font-style: normal; color: var(--accent); margin-left: 1px; }
.tbl.wt td.wt-absent { color: var(--ink-mute); background: #F1F3F5; font-size: 11px; font-weight: 500; cursor: default; }
.tbl.wt td.wt-absent:hover { background: #F1F3F5; }
.tbl.wt td.wt-n { font-weight: 700; }
.tbl.wt td.wt-n.pass { color: var(--ok); }
.tbl.wt td.wt-n.fail { color: var(--danger); }
.wt-bk { margin-top: 2px; }
.wt-mhead { margin-bottom: 10px; }
.wt-try { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; margin-top: 8px; }
.wt-try-h { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.wt-try.re { border-color: #E3C9A0; background: #FFFBF4; }
.wt-kind { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 8px; overflow: hidden; }
.wt-kind button { border: 0; background: #fff; color: var(--ink-mute); font: inherit; font-size: 12.5px; padding: 2px 10px; cursor: pointer; }
.wt-kind button + button { border-left: 1px solid var(--line-strong); }
.wt-kind button.on { background: var(--accent); color: #fff; font-weight: 700; }
.wt-plan-b { font-size: 11.5px; font-weight: 700; color: #8A6D1D; background: #FFF4D6; border-radius: 6px; padding: 0 6px; line-height: 1.6; }
.wt-mhead { display: flex; flex-direction: column; gap: 2px; }
.wt-t.plan i { color: #8A6D1D; font-weight: 700; font-size: 11px; }
.wt-t.plan.late i { color: #fff; background: #D98A00; border-radius: 4px; padding: 0 3px; }
.wt-re { display: inline-block; font-size: 10px; font-weight: 800; color: #A9650B; border: 1px solid #E3C9A0; border-radius: 4px; padding: 0 2px; margin-right: 2px; line-height: 1.3; vertical-align: 1px; }
/* 반 고르기 줄 */
.wt-bar { flex-wrap: wrap; row-gap: 6px; }
.wt-bar .wt-help { flex: 1 1 320px; line-height: 1.45; }
.wt-cfg label { gap: 8px; }
.wt-cfg label .muted { margin-left: auto; }
/* 기록 창 */
.wt-mhead { flex-direction: row !important; align-items: baseline; justify-content: space-between; gap: 10px; padding: 8px 12px; background: var(--tint-2); border: 1px solid var(--line); border-radius: var(--radius); }
.wt-try { padding: 12px 14px 10px; background: #fff; }
.wt-try + .wt-try { margin-top: 10px; }
.wt-no { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-ink); font-weight: 800; font-size: 12.5px; }
.wt-try.re .wt-no { background: #FCEBD2; color: #A9650B; }
.wt-try.re .wt-kind button.on { background: #D98A00; }
.wt-of { font-size: 12px; color: #A9650B; background: #FFF4E5; border-radius: 6px; padding: 1px 7px; }
.wt-grid { display: grid; grid-template-columns: 74px 1fr; gap: 8px 10px; align-items: center; }
.wt-grid > label { font-size: 13px; color: var(--ink-soft); font-weight: 600; }
.wt-grid > label.top { align-self: start; padding-top: 6px; }
.wt-grid > label.req::after { content: ' *'; color: var(--danger); }
.wt-grid textarea { width: 100%; min-height: 34px; resize: vertical; }
.wt-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wt-res { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wt-res button { font: inherit; font-size: 13px; font-weight: 600; padding: 4px 16px; border-radius: 16px; border: 1.5px solid var(--line-strong); background: #fff; color: var(--ink-soft); cursor: pointer; transition: background .12s, border-color .12s; }
.wt-res button.r-pass:hover { border-color: var(--ok); color: var(--ok); }
.wt-res button.r-fail:hover { border-color: var(--danger); color: var(--danger); }
.wt-res button.r-abs:hover { border-color: #8C96A0; color: #59636D; }
.wt-res button.r-pass.on { background: var(--ok); border-color: var(--ok); color: #fff; }
.wt-res button.r-fail.on { background: var(--danger); border-color: var(--danger); color: #fff; }
.wt-res button.r-abs.on { background: #8C96A0; border-color: #8C96A0; color: #fff; }
.wt-res .wt-clr { border: 0 !important; background: none !important; color: var(--ink-mute) !important; font-size: 12px; font-weight: 500; padding: 4px 4px; text-decoration: underline; }
.wt-sc { font-size: 13px; color: var(--ink-soft); min-width: 96px; }
.wt-sc b { font-size: 15px; color: var(--ink); }
.wt-bad { color: var(--danger); font-size: 12px; }
.wt-tot { margin-left: auto; font-size: 12.5px; color: var(--ink-mute); display: inline-flex; align-items: center; gap: 5px; }
/* 결과 뒤 '다음 시험' 칸 */
.wt-fu { margin-top: 10px; border-radius: var(--radius); padding: 9px 12px; display: flex; flex-direction: column; gap: 7px; }
.wt-fu.pass { background: var(--ok-soft); border: 1px solid #BFE3D2; }
.wt-fu.fail { background: var(--danger-soft); border: 1px solid #F3C4C6; }
.wt-fu-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wt-fu-h { width: 62px; flex: none; font-size: 12.5px; font-weight: 800; }
.wt-fu.pass .wt-fu-h { color: #1F7A55; }
.wt-fu.fail .wt-fu-h { color: #B03A40; }
.wt-fu-note { font-size: 11.5px; color: var(--ink-mute); padding-left: 70px; }
.wt-fu-done { margin-top: 8px; font-size: 12px; color: var(--ink-mute); }
.wt-seg { display: inline-flex; background: #fff; border: 1px solid var(--line-strong); border-radius: 9px; padding: 2px; gap: 2px; flex-wrap: wrap; }
.wt-seg button { border: 0; background: none; font: inherit; font-size: 12.5px; padding: 3px 11px; border-radius: 7px; cursor: pointer; color: var(--ink-soft); }
.wt-seg button small { font-size: 11.5px; opacity: .85; margin-left: 2px; }
.wt-seg button:hover:not(:disabled):not(.on) { background: var(--accent-soft); }
.wt-seg button.on { background: var(--accent); color: #fff; font-weight: 700; }
.wt-fu.pass .wt-seg button.on { background: var(--ok); }
.wt-fu.fail .wt-seg button.on { background: var(--danger); }
.wt-seg button:disabled { color: var(--ink-mute); opacity: .55; cursor: default; }
.wt-seg.sm button { font-size: 12px; padding: 2px 9px; }
.wt-rule { display: inline-flex; align-items: center; gap: 3px; font-size: 12.5px; color: var(--ink-soft); }
.wt-rule { margin-right: 6px; }
.wt-rule input { width: 52px; }
.wt-rng { display: inline-flex; align-items: center; gap: 4px; }
.wt-rng input { width: 70px; }
.wt-chip { font-size: 12.5px; font-weight: 700; border-radius: 6px; padding: 1px 8px; }
.wt-chip.re { color: #A9650B; background: #FFF4E5; border: 1px solid #E3C9A0; }
/* 아래 줄: 왼쪽 시험 추가 · 오른쪽 취소/저장 */
.wt-foot-l { display: flex; align-items: center; gap: 10px; margin-right: auto; }
.wt-foot-l .wt-add-new { background: var(--accent-soft); border-color: var(--accent-line-2); color: var(--accent-ink); font-weight: 700; }
.wt-foot-l .wt-add-re { background: #FFF4E5; border-color: #E3C9A0; color: #A9650B; font-weight: 700; }
.wt-foot-l .wt-add-new:hover { background: #D6EAF8; }
.wt-foot-l .wt-add-re:hover { background: #FCE8CC; }
.wt-foot-sep { width: 1px; height: 18px; background: var(--line); }
`;
  document.head.appendChild(st);
})();
