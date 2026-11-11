/* =========================================================
   words.js — 단어 시험 기록부 (학생 › 단어)
   반별·월별 표. 학생마다 한 줄, 그 학생이 오는 날만 칸으로 나온다 (여러 반에 다니면 반 순서상 앞선 반에 한 번만).
   칸을 누르면 그 날의 단어 시험(범위·결과·점수·메모, 재시험 포함)을 기록한다.
   단어장은 학생 › 교재에서 분류 '단어'로 진행 중인 교재(sbook)를 그대로 쓴다.
   기록은 meta 테이블에 저장 (서버 SQL 변경 없음):
   wtest: { id 'WT_학생ID_날짜', kind:'wtest', studentId, date, classId(기록한 반), matId, matName(교재 이름 사본),
            tries:[ { from, to, res:'pass'|'fail'|'abs', score, total, memo } ], createdAt, updatedAt }
   ========================================================= */
const WT_RES = { pass: '합격', fail: '불합격', abs: '결시' };
const WT_MARK = { pass: '○', fail: '✕', abs: '결시' };

const WordBook = {
  month: '',
  extra: {},           // 직접 추가한 날짜 { '학생ID|날짜': 1 } (페이지를 떠나면 사라짐, 기록하면 남음)
  onLeave() { this.extra = {}; },

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
  rangeLabel(t) { return t.from && t.to ? (+t.from === +t.to ? String(t.from) : t.from + '-' + t.to) : ''; },
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
    const act = all.filter(c => c.active !== false);
    const ended = all.filter(c => c.active === false).filter(c => this.monthData(c, Y, M).studs.length);
    return [...act, ...ended];
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
        if (!o) { o = { s, gi, items: new Map(), cls: new Set() }; per.set(s.id, o); }
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
    per.forEach(o => {
      o.list = [...o.items.values()].sort((a, b) => ko(a.d, b.d));
      // 그 날 결석: 결석 기록이 있고, 출석·지각·조퇴 기록은 없음
      o.list.forEach(it => { it.absent = it.ents.some(e => e.att === 'A') && !it.ents.some(e => e.att && e.att !== 'A'); });
      groups[o.gi].rows.push(o);
    });
    groups.forEach(g => g.rows.sort((a, b) => Students.sortFn(a.s, b.s)));
    return groups;
  },

  // 학생 한 줄의 이 달 합격·불합격 횟수
  countOf(sid, dates) {
    const n = { pass: 0, fail: 0 };
    dates.forEach(d => { const r = this.rec(sid, d); if (r) (r.tries || []).forEach(t => { if (t.res in n) n[t.res]++; }); });
    return n;
  },

  /* ---------- 표 ---------- */
  cellInner(r) {
    if (!r || !(r.tries || []).length) return '<span class="dash">-</span>';
    return r.tries.map(t => `<div class="wt-t ${t.res}">${t.res === 'abs' ? '' : `<b>${esc(this.rangeLabel(t))}</b>`}<i>${WT_MARK[t.res] || ''}</i>${this.scoreLabel(t) ? `<small>${esc(this.scoreLabel(t))}</small>` : ''}${t.memo ? '<em title="메모">•</em>' : ''}</div>`).join('');
  },
  cellTip(r) {
    if (!r) return '';
    return (r.tries || []).map((t, i) => `${i + 1}차 ${t.res === 'abs' ? '' : this.rangeLabel(t) + ' '}${WT_RES[t.res] || ''}${this.scoreLabel(t) ? ' ' + this.scoreLabel(t) : ''}${t.memo ? ' · ' + t.memo : ''}`).join('\n')
      + (r.matName ? '\n단어장: ' + r.matName : '');
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
      const bk = this.curBook(s.id);
      const n = this.countOf(s.id, o.list.map(it => it.d));
      const multi = o.cls.size > 1;
      const others = multi ? [...o.cls].filter(id => id !== g.c.id).map(id => Store.get('classes', id)).filter(Boolean) : [];
      h += `<tr data-row="${s.id}"><td class="nowrap ab-name"><b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span>
        ${others.length ? `<div class="wt-oc">${others.map(c => `${Classes.dot(c)}${esc(c.name)}`).join(' ')}</div>` : ''}
        <div class="wt-bk">${bk ? `<button type="button" class="wt-bkname" data-bk="${bk.id}" title="단어장 수정">${esc(Books.nameOf(bk))}</button>` : `<button type="button" class="wt-bkadd" data-bkadd="${s.id}">+ 단어장 연결</button>`}
        <button type="button" class="wt-addd" data-addday="${s.id}" title="이 학생의 재시험 날짜 추가">+ 날짜</button></div></td>`;
      o.list.forEach(it => {
        const r = this.rec(s.id, it.d);
        const reg = it.ents.some(e => e.reg);
        const cls = `${it.d === today ? 'today' : ''} ${it.d > today ? 'future' : ''} ${reg ? '' : 'added'}`;
        if (it.absent && !r) { h += `<td class="ab-c wt-c wt-absent ${cls}" title="출석부에 결석으로 기록된 날">${this.dateHead(it, multi)}<div class="wt-ab">결석</div></td>`; return; }
        h += `<td class="ab-c wt-c ${cls}" data-wcid="${g.c.id}" data-d="${it.d}" data-sid="${s.id}" title="${esc((reg ? '' : '수업일 아님 (추가한 날)\n') + this.cellTip(r))}">${this.dateHead(it, multi)}${this.cellInner(r)}</td>`;
      });
      for (let i = o.list.length; i < maxN; i++) h += '<td class="wt-pad"></td>';
      h += `<td class="num wt-n pass">${n.pass}</td><td class="num wt-n fail">${n.fail}</td></tr>`;
    });
    return h + '</tbody></table></div>';
  },

  render(main) {
    if (!this.month) this.month = App.selDate.slice(0, 7);
    const [Y, M] = this.month.split('-').map(Number);
    let h = `<div class="page-narrow"><div class="page-head"><h1>단어</h1>
      <button class="btn sm" data-m="-1">‹</button><input type="month" data-month value="${this.month}"><button class="btn sm" data-m="1">›</button>
      <button class="btn sm" data-m="0">이번 달</button><button class="btn sm" data-pdf style="margin-left:4px;background:var(--accent-soft);border-color:#B9D7EF;color:var(--accent-ink);font-weight:700" title="이 달 전체 반 단어 시험 기록을 A4 가로로 인쇄 · PDF 저장">PDF 저장</button></div>`;
    const all = Classes.sorted(Store.all('classes'));
    if (!all.length) { main.innerHTML = h + '<div class="panel"><div class="empty">반이 없습니다. 반 메뉴에서 반을 만드세요.</div></div></div>'; this.bind(main); return; }
    h += `<div class="toolbar small soft"><span>학생마다 한 줄, 그 학생이 오는 날만 칸으로 나옵니다 (여러 반에 다니면 앞선 반에 한 번만). 칸을 누르면 범위 · 합격/불합격/결시 · 점수 · 메모를 기록하고, 재시험은 같은 칸에 “+ 재시험 추가”, 수업 없는 날 재시험은 이름 아래 “+ 날짜”로 넣습니다. 출석부에서 결석인 날은 회색입니다.</span></div>`;
    this.build(Y, M).forEach(g => {
      const c = g.c;
      if (c.active === false && !g.rows.length) return;
      h += `<div class="panel ab-sec" data-sec="${c.id}"><div class="ab-sec-head"><h2>${Classes.dot(c)}${esc(c.name)}${c.active === false ? ' <span class="badge gray">종료</span>' : ''}
        <span class="sub">${esc(Classes.timeLabel(c))}</span></h2><span class="grow"></span>${g.rows.length ? `<span class="small muted">${g.rows.length}명</span>` : ''}</div>`;
      if (!g.rows.length) h += `<div class="empty">${g.had ? '이 반 학생은 모두 앞선 반에 함께 표시됩니다.' : '이 달에 이 반 수강생이 없습니다.'}</div>`;
      else h += this.tableHtml(g);
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
      const bk = e.target.closest('[data-bk]');
      if (bk) { Books.openRec(bk.dataset.bk, {}, () => App.render()); return; }
      const ba = e.target.closest('[data-bkadd]');
      if (ba) { Books.openRec(null, { sid: ba.dataset.bkadd, cat: 'word' }, () => App.render()); return; }
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
      if (e.target.matches('[data-month]') && /^\d{4}-\d{2}$/.test(e.target.value)) { this.month = e.target.value; App.render(); }
    };
  },

  /* ---------- 한 칸 기록 창 ---------- */
  // 새 시험의 기본 범위: 이 칸의 마지막 시험 → 이 학생의 가장 최근 기록 → 1~1
  defRange(sid, d, tries) {
    const lastT = tries.filter(t => t.res !== 'abs' && t.from).pop();
    if (lastT) return { from: lastT.from, to: lastT.to };
    const prev = this.recs().filter(r => r.studentId === sid && r.date < d && (r.tries || []).some(t => t.res !== 'abs' && t.from)).sort((a, b) => ko(b.date, a.date))[0];
    const pt = prev ? prev.tries.filter(t => t.res !== 'abs' && t.from).pop() : null;
    return pt ? { from: pt.from, to: pt.to } : { from: 1, to: 1 };
  },

  openCell(cid, sid, d) {
    const s = Store.get('students', sid);
    if (!s) return;
    const r = this.rec(sid, d);
    const bk = r ? null : this.bookOn(sid, d);
    if (!r && !bk) {
      confirmDlg(`${s.name} 학생에게 진행 중인 단어장이 없습니다.\n단어장을 먼저 연결할까요?`, '단어장 연결').then(ok => {
        if (ok) Books.openRec(null, { sid, cat: 'word' }, () => { App.render(); if (this.curBook(sid)) this.openCell(cid, sid, d); });
      });
      return;
    }
    const matId = r ? r.matId : bk.matId;
    const matName = r ? (NP.mat(r.matId) ? NP.mat(r.matId).name : r.matName) : Books.nameOf(bk);
    const mat = NP.mat(matId);
    const units = (mat && mat.units) || [];
    const tries = JSON.parse(JSON.stringify((r && r.tries) || []));
    if (!tries.length) { const dr = this.defRange(sid, d, []); tries.push({ from: dr.from, to: dr.to, res: '', score: '', total: '', memo: '' }); }
    const maxN = Math.max(units.length, ...tries.map(t => +t.to || 0), ...tries.map(t => +t.from || 0), 1);
    const opt = (v) => {
      let o = '';
      for (let i = 1; i <= maxN; i++) {
        const u = units[i - 1];
        const nm = u && u.name && u.name !== String(i) ? ` · ${u.name}` : '';
        o += `<option value="${i}" ${+v === i ? 'selected' : ''}>${i}${esc(nm)}</option>`;
      }
      return o;
    };
    const body = `<div class="wt-modal">
      <div class="wt-mhead small"><span>단어장 <b>${esc(matName || '(교재 없음)')}</b>${mat ? ` <span class="muted">(${units.length}개 단위)</span>` : ' <span class="muted">(삭제된 교재)</span>'}</span></div>
      <div data-tries></div>
      <button type="button" class="btn sm" data-tadd style="margin-top:8px">+ 재시험 추가</button>
    </div>`;
    const md = Modal.open({
      title: `${s.name} · ${fmtMD(d)} 단어 시험`, size: 'lg', body, autofocus: false,
      onMount: (b) => {
        const box = $('[data-tries]', b);
        const draw = () => {
          box.innerHTML = tries.map((t, i) => `<div class="wt-try" data-i="${i}">
            <div class="wt-try-h"><b>${i + 1}차</b>${i ? '<span class="small muted">재시험</span>' : ''}<span style="flex:1"></span>${tries.length > 1 ? `<button type="button" class="icon-btn" data-tdel="${i}" title="이 시험 삭제">✕</button>` : ''}</div>
            <div class="form">
              <label class="req">결과</label><div class="row">${Object.keys(WT_RES).map(k => `<label class="chk"><input type="radio" name="res${i}" value="${k}" ${t.res === k ? 'checked' : ''}>${WT_RES[k]}</label>`).join('')}</div>
              <label class="req" data-nabs>범위</label><div class="row" data-nabs><select data-f="from" data-i="${i}">${opt(t.from)}</select>~<select data-f="to" data-i="${i}">${opt(t.to)}</select></div>
              <label data-nabs>점수</label><div class="row" data-nabs><input type="number" data-f="score" data-i="${i}" value="${esc(t.score)}" min="0" style="width:90px"> / <input type="number" data-f="total" data-i="${i}" value="${esc(t.total)}" min="0" style="width:90px" placeholder="만점"><span class="hint">선택</span></div>
              <label class="top">메모</label><textarea data-f="memo" data-i="${i}" rows="2">${esc(t.memo || '')}</textarea>
            </div></div>`).join('');
          tries.forEach((t, i) => { $$(`[data-i="${i}"] [data-nabs]`, box).forEach(x => { x.style.display = t.res === 'abs' ? 'none' : ''; }); });
        };
        draw();
        b.addEventListener('change', (e) => {
          const rd = e.target.name && /^res\d+$/.test(e.target.name) ? e.target : null;
          if (rd) { tries[+rd.name.slice(3)].res = rd.value; draw(); return; }
          const f = e.target.dataset.f;
          if (f === 'from' || f === 'to') tries[+e.target.dataset.i][f] = +e.target.value;
        });
        b.addEventListener('input', (e) => {
          const f = e.target.dataset.f;
          if (f === 'score' || f === 'total' || f === 'memo') tries[+e.target.dataset.i][f] = e.target.value;
        });
        b.addEventListener('click', (e) => {
          if (e.target.closest('[data-tadd]')) {
            const dr = this.defRange(sid, d, tries);
            tries.push({ from: dr.from, to: dr.to, res: '', score: '', total: '', memo: '' });
            draw(); return;
          }
          const del = e.target.closest('[data-tdel]');
          if (del) { tries.splice(+del.dataset.tdel, 1); draw(); }
        });
      },
      buttons: [
        ...(r ? [{ text: '기록 삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg(`${s.name} · ${fmtMD(d)} 단어 시험 기록을 모두 삭제할까요?`, '삭제', true)) return false;
          Store.del('meta', r.id);
          toast('단어 시험 기록을 삭제했습니다');
          App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: () => {
          const out = [];
          for (let i = 0; i < tries.length; i++) {
            const t = tries[i];
            if (!WT_RES[t.res]) { toast(`${i + 1}차 결과(합격·불합격·결시)를 고르세요`); return false; }
            if (t.res === 'abs') { out.push({ from: '', to: '', res: 'abs', score: '', total: '', memo: stripZws(t.memo || '').trim() }); continue; }
            const from = +t.from, to = +t.to;
            if (!from || !to) { toast(`${i + 1}차 범위를 고르세요`); return false; }
            if (from > to) { toast(`${i + 1}차 범위의 시작이 끝보다 큽니다`); return false; }
            const sc = String(t.score === null || t.score === undefined ? '' : t.score).trim(), tt = String(t.total === null || t.total === undefined ? '' : t.total).trim();
            if (sc !== '' && isNaN(+sc)) { toast(`${i + 1}차 점수를 숫자로 넣으세요`); return false; }
            if (tt !== '' && isNaN(+tt)) { toast(`${i + 1}차 만점을 숫자로 넣으세요`); return false; }
            if (sc !== '' && tt !== '' && +sc > +tt) { toast(`${i + 1}차 점수가 만점보다 큽니다`); return false; }
            out.push({ from, to, res: t.res, score: sc === '' ? '' : +sc, total: tt === '' ? '' : +tt, memo: stripZws(t.memo || '').trim() });
          }
          const now = new Date().toISOString();
          const rec = Object.assign({}, r || { id: this.recId(sid, d), kind: 'wtest', studentId: sid, date: d, classId: cid, createdAt: now }, {
            matId, matName: matName || (r ? r.matName : ''), tries: out, updatedAt: now,
          });
          Store.put('meta', rec);
          toast('단어 시험을 저장했습니다');
          App.render();
        } },
      ],
    });
    return md;
  },

  /* ---------- PDF: A4 가로, 반마다 표 (학생 한 줄 = 그 학생이 오는 날만) ---------- */
  pdf() {
    const [Y, M] = this.month.split('-').map(Number);
    let body = '';
    this.build(Y, M).forEach(g => {
      const c = g.c;
      if (!g.rows.length) return;
      const maxN = Math.max(1, ...g.rows.map(o => o.list.length));
      const head = `<tr><th class="ttl" colspan="${maxN + 3}"><span class="dot" style="background:${Classes.colorOf(c)}"></span>${esc(c.name)}${c.active === false ? ' (종료)' : ''}<span class="sub">${esc(Classes.timeLabel(c))} · ${g.rows.length}명</span></th></tr>
        <tr><th class="nm">이름</th><th colspan="${maxN}">날짜별 단어 시험</th><th class="sm">합격</th><th class="sm">불합격</th></tr>`;
      const rows = g.rows.map(o => {
        const s = o.s;
        const bk = this.curBook(s.id);
        const n = this.countOf(s.id, o.list.map(it => it.d));
        const cells = o.list.map(it => {
          const r = this.rec(s.id, it.d);
          const dh = `<div class="dh ${dowOf(it.d) === 0 ? 'sun' : dowOf(it.d) === 6 ? 'sat' : ''}">${+it.d.slice(5, 7)}/${+it.d.slice(8)} ${DOW[dowOf(it.d)]}</div>`;
          if (it.absent && !r) return `<td class="absent">${dh}결석</td>`;
          if (!r) return `<td>${dh}</td>`;
          return `<td>${dh}${(r.tries || []).map(t => `<div class="${t.res}">${t.res === 'abs' ? '결시' : esc(this.rangeLabel(t)) + ' ' + (WT_MARK[t.res] || '')}${this.scoreLabel(t) ? ' <small>' + esc(this.scoreLabel(t)) + '</small>' : ''}</div>`).join('')}</td>`;
        }).join('');
        let fill = ''; for (let i = o.list.length; i < maxN; i++) fill += '<td class="pad"></td>';
        return `<tr><td class="nm"><b>${esc(s.name)}</b> <span class="tag">${esc(stTag(s))}</span>${bk ? `<div class="bk">${esc(Books.nameOf(bk))}</div>` : ''}</td>${cells}${fill}<td>${n.pass}</td><td>${n.fail}</td></tr>`;
      }).join('');
      let cg = ''; for (let i = 0; i < maxN; i++) cg += '<col>';
      const cols = `<colgroup><col class="c-nm">${cg}<col class="c-sm"><col class="c-sm"></colgroup>`;
      body += `<table>${cols}<thead>${head}</thead><tbody>${rows}</tbody></table>`;
    });
    if (!body) { toast('이 달에 넣을 학생이 없습니다'); return; }
    const title = `단어시험_${this.month}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: A4 landscape; margin: 8mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #111; font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif; font-size: 7.5pt; }
      h1 { font-size: 13pt; margin: 0 0 3mm; display: flex; justify-content: space-between; align-items: baseline; }
      h1 small { font-size: 8pt; font-weight: normal; color: #666; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4mm; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 0.5pt solid #9aa3ad; padding: 0.6mm 0.4mm; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.25; overflow: hidden; }
      td { height: 7mm; }
      th { background: #eef2f7; height: 7mm; font-weight: bold; line-height: 1.1; white-space: nowrap; }
      th small { display: block; font-size: 6pt; font-weight: normal; color: #666; }
      th.ttl { text-align: left; padding-left: 2mm; height: 6.5mm; background: #dfe7f1; font-size: 9.5pt; }
      th.ttl .dot { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 4pt; vertical-align: -0.5pt; }
      th.ttl .sub { font-weight: normal; color: #555; font-size: 8pt; margin-left: 6pt; }
      col.c-nm { width: 40mm; } col.c-sm { width: 11mm; }
      th.nm, td.nm { text-align: left; padding-left: 1.5mm; white-space: nowrap; text-overflow: ellipsis; }
      td.nm .tag { color: #777; font-size: 6.5pt; }
      td.nm .bk { color: #555; font-size: 6.5pt; overflow: hidden; text-overflow: ellipsis; }
      th.sun { color: #c62828; } th.sat { color: #1f5fbf; }
      td div { white-space: nowrap; }
      td small { color: #555; font-size: 6.5pt; }
      .pass { color: #1b7a52; } .fail { color: #c62828; font-weight: bold; } .abs { color: #777; }
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
.wt-dh.sat, .wt-dh.sat small { color: var(--accent); }
.wt-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 2px; vertical-align: 1px; }
.tbl.wt td.wt-c.today { box-shadow: inset 0 0 0 2px var(--accent); }
.tbl.wt td.wt-c.today .wt-dh { color: var(--accent); }
.tbl.wt td.wt-c.future { background-color: #FBFDFF; }
.tbl.wt td.wt-c.future .wt-dh { color: var(--ink-mute); font-weight: 500; }
.tbl.wt td.wt-c.added { background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(43,127,193,.05) 6px 8px); }
.tbl.wt td.wt-pad { background: #FBFCFD; cursor: default; }
.wt-ab { padding-top: 2px; }
.wt-oc { font-size: 11px; color: var(--ink-soft); margin-top: 1px; }
.wt-addd { border: 0; background: none; padding: 0 0 0 6px; font: inherit; font-size: 11.5px; color: var(--accent); cursor: pointer; vertical-align: bottom; }
.wt-addd:hover, .wt-bkadd:hover { text-decoration: underline; }
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
.wt-bkname, .wt-bkadd { border: 0; background: none; padding: 0; font: inherit; font-size: 11.5px; cursor: pointer; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
.wt-bkname { color: var(--ink-soft); }
.wt-bkname:hover { color: var(--accent); text-decoration: underline; }
.wt-bkadd { color: var(--accent); }
.wt-mhead { margin-bottom: 10px; }
.wt-try { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; margin-top: 8px; }
.wt-try-h { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
`;
  document.head.appendChild(st);
})();
