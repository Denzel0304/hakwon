/* =========================================================
   mocktest.js — 변형 문제 › 변형문제 탭 › 모의 시험 (학교 기출과 비슷한 모의 시험지 조합)
   · 문항은 Banks(banks.js)가 모은 것 (은행 + 삽입·순서, 이 PC). 은행 파일은 고치지 않고 유형·원문/변형 표시만 보고 조합한다
   · 학교 틀 (동기화 저장, meta): id 'MXT_'+학교·학년(예: '주성고 고2'), { kind:'mxtpl', school, counts:{ 유형: 문항 수 }, updatedAt }
       틀이 없는 학교·학년은 기본 틀(22문항)로 시작 → 숫자를 고치고 "이 학교·학년 틀로 저장" (있으면 덮어씀)
       출제 기록도 학교·학년별
   · 출제 기록 (동기화 저장, meta): id MXH_…, { kind:'mxhist', school, title, at, keys:[문항 키 — 인쇄 순서], ratio, total }
       "이 세트 기록" 을 누를 때만 남김. 다음에 같은 학교로 뽑을 때 기록된 문항은 빼고 고름 (모자라면 다시 씀)
       기록한 세트는 "다시 인쇄"로 똑같이 다시 뽑을 수 있음
   · 한 지문 두 번 쓰기 규칙 (답이 새지 않게 — 문항 수를 맞추는 것보다 우선)
       A 글자형 (어법·어법 선택·어휘·어휘 선택·빈칸·무관·순서·삽입): 원문 글이 보이면 답이 드러남 → 그 지문에서 한 번만
       B 대의형 (요지·주제·제목·주장·함축·요약) / C 세부형 (일치·불일치): 같은 묶음끼리는 서로 답을 알려 줌
       → 한 지문을 두 번 쓸 수 있는 건 B 하나 + C 하나뿐. 원문과 변형(약·중·강)은 같은 지문으로 본다
       지문이 모자라면 틀의 문항 수를 다 못 채움 → 남은 칸은 규칙 안에서 다른 유형으로 채우고 배정 결과에 '조정'으로 보여 줌
   · 변형 비율 0 / 30 / 50% : 시험 문항 중 변형 지문(약·중·강) 문항의 비율 (변형이 있는 유형만)
   · 고르는 순서: 기록 안 된 문항 → 같은 자리(slot) 겹치지 않게 → 빈칸은 핵심형 먼저 → 정답 번호 ①~⑤ 고르게. 같은 선택 → 늘 같은 결과 ("다시 뽑기"로 바꿈)
   · 종이·인쇄는 Banks 것을 그대로 씀 (유형 순서 = 모의고사 번호 순서, 같은 지문 두 문항은 붙지 않게)
   ========================================================= */
const MockTest = {
  FAM: { grammar: 'A', gbox: 'A', vocab: 'A', vbox: 'A', blank: 'A', irrelevant: 'A', order: 'A', insert: 'A',
         gist: 'B', topic: 'B', title: 'B', claim: 'B', implication: 'B', summary: 'B', match: 'C', mismatch: 'C' },
  VAR_TYPES: new Set(['grammar', 'gbox', 'vocab', 'vbox', 'blank', 'irrelevant']),
  DEFAULT: { gist: 1, topic: 1, title: 2, implication: 2, mismatch: 2, grammar: 2, vocab: 2, blank: 4, irrelevant: 1, order: 2, insert: 1, summary: 2 },   // 기본 틀 22문항 (처음 분석한 주성고 기출 기준)
  RATIOS: [0, 0.3, 0.5],

  examId: '',
  school: '',             // 틀·기록에 쓰는 학교·학년 (예: '주성고 고2')
  sel: new Set(),         // 범위 (교재id|번호)
  counts: null,           // 지금 화면의 틀 (저장 전)
  ratio: 0.3,
  skipUsed: true,
  seed: 1,
  fixed: null,            // 다시 인쇄 중인 기록 세트 { id, keys } — 있으면 새로 뽑지 않음
  _tok: 0,
  _last: null,            // 마지막 배정 결과

  /* ---------- 학교 틀 · 기록 (동기화) ---------- */
  tplId(school) { return 'MXT_' + school; },
  keyOf(e) { return `${schoolShort(e.school)} ${gradeLabel(e.grade)}`; },     // 학교·학년
  tplOf(school) { const r = school && Store.get('meta', this.tplId(school)); return r && r.kind === 'mxtpl' ? r : null; },
  schools() {
    const set = new Set();
    Store.where('meta', r => r.kind === 'mxtpl' || r.kind === 'mxhist').forEach(r => r.school && set.add(r.school));
    Banks.examList().forEach(e => set.add(this.keyOf(e)));
    return [...set].filter(Boolean).sort(ko);
  },
  hist(school) { return Store.where('meta', r => r.kind === 'mxhist' && r.school === school).sort((a, b) => String(b.at).localeCompare(String(a.at))); },
  total(c) { return Object.values(c || {}).reduce((n, v) => n + (+v || 0), 0); },
  loadCounts() { const t = this.tplOf(this.school); this.counts = Object.assign({}, t ? t.counts : this.DEFAULT); },

  /* =========================================================
     조합
     ========================================================= */
  // 범위 안의 문항 → 지문별로
  passages() {
    const dm = Banks.dataMats(), mi = new Map(dm.map((d, i) => [d.m.id, i]));
    const by = new Map();
    dm.forEach(({ m, its }) => its.forEach(x => {
      if (!this.sel.has(x.gk)) return;
      if (!by.has(x.gk)) by.set(x.gk, { gk: x.gk, m, num: x.num, mi: mi.get(m.id), items: [] });
      by.get(x.gk).items.push(x);
    }));
    return [...by.values()].sort((a, b) => a.mi - b.mi || Banks.numKey(a.num) - Banks.numKey(b.num));
  },
  // 이 범위로 낼 수 있는 최대: 지문마다 1 + (대의형과 일치·불일치를 둘 다 가진 지문은 1 더). 유형별 최대 = 그 유형을 가진 지문 수
  capInfo() {
    const ps = this.passages(), per = {};
    Banks.TYPES.forEach(([t]) => { per[t] = ps.filter(p => p.items.some(x => x.type === t)).length; });
    const dbl = ps.filter(p => p.items.some(x => this.FAM[x.type] === 'B') && p.items.some(x => this.FAM[x.type] === 'C')).length;
    return { n: ps.length, dbl, max: ps.length + dbl, per };
  },
  capHtml() {
    if (!this.sel.size) return '';
    const c = this.capInfo();
    return `지문 ${c.n}개 · 두 번 쓸 수 있는 지문 ${c.dbl}개 → 이 범위로 낼 수 있는 최대 <b>${c.max}문항</b>`
      + (c.dbl ? ` <span class="small soft">(두 번 쓰는 지문은 대의형 + 일치·불일치 짝일 때만이라, 어법·빈칸 같은 글자형을 넣을수록 실제로는 줄어요)</span>` : '');
  },
  warnHtml(c) {
    if (!c) return '';
    const tot = this.total(this.counts);
    const over = Banks.TYPES.filter(([t]) => (+this.counts[t] || 0) > c.per[t]).map(([, nm]) => nm);
    const out = [];
    if (tot > c.max) out.push(`최대 ${c.max}문항이라 ${tot}문항은 다 못 채워요.`);
    if (over.length) out.push(`${over.join('·')}은(는) 범위에 있는 지문보다 많아요.`);
    return out.join(' ');
  },
  // 범위·틀 숫자가 바뀌면 최대 표시만 고침 (입력 칸은 다시 그리지 않음)
  updateCap(b) {
    const c = this.sel.size ? this.capInfo() : null;
    const cap = $('[data-mxcap]', b); if (cap) cap.innerHTML = this.capHtml();
    $$('[data-mxc]', b).forEach(inp => {
      const t = inp.dataset.mxc, mx = $(`[data-mxmax="${t}"]`, b), over = !!c && (+this.counts[t] || 0) > c.per[t];
      inp.classList.toggle('mx-over', over);
      if (mx) { mx.textContent = c ? `최대 ${c.per[t]}` : ''; mx.classList.toggle('mx-over', over); }
    });
    const w = $('[data-mxwarn]', b); if (w) w.textContent = this.warnHtml(c);
  },

  build() {
    const rnd = Inserts.rng(this.seed * 13 + 5);
    const ps = this.passages();
    const used = new Set();
    if (this.skipUsed && this.school) this.hist(this.school).forEach(h => (h.keys || []).forEach(k => used.add(k)));
    ps.forEach(p => { p.types = new Set(p.items.map(x => x.type)); p.got = []; p.r = rnd(); });
    const target = {};
    Banks.TYPES.forEach(([t]) => { const n = +this.counts[t] || 0; if (n > 0) target[t] = n; });
    const fam = (t) => this.FAM[t] || 'A';
    const canAdd = (p, t) => {
      if (!p.types.has(t)) return false;
      if (!p.got.length) return true;
      if (p.got.length > 1) return false;
      const a = fam(p.got[0]), b = fam(t);
      return a !== 'A' && b !== 'A' && a !== b;          // 두 번째는 대의형 + 세부형 짝만
    };
    const assign = [];                                    // [{ p, t }]
    const put = (p, t) => { p.got.push(t); assign.push({ p, t }); };
    // 1) 틀의 칸을 아직 안 쓴 지문에 (쓸 수 있는 유형이 적은 지문부터)
    //    지문이 넉넉하면: 가진 지문이 적은 유형부터 (드문 유형이 지문을 먼저 잡게)
    //    지문이 모자라면: 유형을 틀의 비율대로 번갈아 (한 유형만 빠지거나 쏠리지 않게)
    const slots = [];
    Object.entries(target).forEach(([t, n]) => { for (let i = 0; i < n; i++) slots.push({ t, pos: (i + 0.5) / n }); });
    const avail = (t) => ps.filter(p => p.types.has(t)).length;
    if (ps.length >= slots.length) slots.sort((a, b) => avail(a.t) - avail(b.t) || Banks.tIdx(a.t) - Banks.tIdx(b.t) || a.pos - b.pos);
    else slots.sort((a, b) => a.pos - b.pos || avail(a.t) - avail(b.t) || Banks.tIdx(a.t) - Banks.tIdx(b.t));
    const left = [];
    slots.forEach(({ t }) => {
      const c = ps.filter(p => !p.got.length && p.types.has(t)).sort((a, b) => a.types.size - b.types.size || a.r - b.r);
      if (c.length) put(c[0], t); else left.push(t);
    });
    // 2) 못 채운 대의형·세부형 칸은 짝(대의 + 세부)으로 두 번째 쓰기 — 단, 안 쓴 지문이 남아 있으면 두 번 쓰지 않음
    //    (지문이 넉넉하면 틀보다 '같은 지문 두 번 안 쓰기'가 먼저, 사용자 2026-11-28 → 3)에서 안 쓴 지문의 다른 유형으로)
    const left2 = [];
    const freshLeft = () => ps.some(p => !p.got.length && p.types.size);
    left.forEach(t => {
      const c = fam(t) === 'A' || freshLeft() ? [] : ps.filter(p => p.got.length === 1 && canAdd(p, t)).sort((a, b) => a.r - b.r);
      if (c.length) put(c[0], t); else left2.push(t);
    });
    // 3) 그래도 남은 칸은 규칙 안에서 다른 유형으로: 안 쓴 지문 먼저 → 아직 시험지에 없는 유형 먼저 → 없으면 덜 채워진 유형
    const have = (t) => assign.filter(a => a.t === t).length;
    const lex = (u, v) => { for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return u[i] - v[i]; return 0; };
    for (let k = 0; k < left2.length; k++) {
      let best = null;
      ps.forEach(p => p.types.forEach(t => {
        if (!canAdd(p, t)) return;
        const inTpl = target[t] ? 0 : 1, fresh = p.got.length ? 1 : 0;
        const sc = [fresh, have(t) ? 1 : 0, have(t) / (target[t] || 1), inTpl, p.r];
        if (!best || lex(sc, best.sc) < 0) best = { p, t, sc };
      }));
      if (!best) break;
      put(best.p, best.t);
    }
    // 4) 문항 고르기: 변형 비율 → 기록 안 된 것 → slot 겹치지 않게 → 핵심 빈칸 → 정답 번호 고르게
    const varOK = assign.filter(a => this.VAR_TYPES.has(a.t) && a.p.items.some(x => x.type === a.t && x.v !== 'orig'));
    const nv = Math.min(varOK.length, Math.round(this.ratio * assign.length));
    const vset = new Set(varOK.map(a => ({ a, r: rnd() })).sort((x, y) => x.r - y.r).slice(0, nv).map(z => z.a));
    const ansCnt = [0, 0, 0, 0, 0], slotsUsed = new Set();
    let reused = 0;
    const order = assign.slice().sort((a, b) => Banks.tIdx(a.t) - Banks.tIdx(b.t) || a.p.mi - b.p.mi || Banks.numKey(a.p.num) - Banks.numKey(b.p.num));
    const picked = [];
    order.forEach(a => {
      const wantVar = vset.has(a);
      let c = a.p.items.filter(x => x.type === a.t && (wantVar ? x.v !== 'orig' : x.v === 'orig'));
      if (!c.length) c = a.p.items.filter(x => x.type === a.t);
      const fresh = c.filter(x => !used.has(x.key));
      if (fresh.length) c = fresh; else reused++;
      const slot = (x) => x.kind === 'bank' ? (x.it.slot || x.it.id) : x.key;
      const sc = (x) => [slotsUsed.has(slot(x)) ? 1 : 0, (a.t === 'blank' && x.it && x.it.level !== 'core') ? 1 : 0, ansCnt[Banks.answerOf(x) - 1] || 0, rnd()];
      const scored = c.map(x => ({ x, s: sc(x) })).sort((u, v) => lex(u.s, v.s));
      const x = scored[0].x;
      slotsUsed.add(slot(x)); ansCnt[Banks.answerOf(x) - 1]++;
      picked.push(x);
    });
    // 두 번 쓴 지문: 대의형 정답 낱말이 일치·불일치 진술문과 많이 겹치면(50% 이상) 덜 겹치는 버전 짝으로 바꿈 (힌트 막기)
    let overlapLeft = 0;
    ps.filter(p => p.got.length === 2).forEach(p => {
      const idx = picked.map((x, i) => x.gk === p.gk ? i : -1).filter(i => i >= 0);
      if (idx.length !== 2) return;
      const [bi, ci] = this.FAM[picked[idx[0]].type] === 'B' ? idx : [idx[1], idx[0]];
      const cand = (x) => { const c = p.items.filter(y => y.type === x.type && y.v === x.v); const f = c.filter(y => !used.has(y.key)); return f.length ? f : c; };
      let best = null;
      cand(picked[bi]).forEach(xb => cand(picked[ci]).forEach(xc => {
        const ov = this.overlap(xb, xc), sc = [ov >= 0.5 ? 1 : 0, (xb === picked[bi] ? 0 : 1) + (xc === picked[ci] ? 0 : 1), ov];
        if (!best || lex(sc, best.sc) < 0) best = { xb, xc, sc, ov };
      }));
      if (!best) return;
      picked[bi] = best.xb; picked[ci] = best.xc;
      if (best.ov >= 0.5) overlapLeft++;
    });
    ansCnt.fill(0); picked.forEach(x => { ansCnt[Banks.answerOf(x) - 1]++; });
    // 같은 지문 두 문항이 붙지 않게 (같은 유형 안에서 자리 바꿈)
    for (let i = 1; i < picked.length; i++) {
      if (picked[i].gk !== picked[i - 1].gk) continue;
      const j = picked.findIndex((y, k) => k > i && y.type === picked[i].type && y.gk !== picked[i - 1].gk && (k + 1 >= picked.length || picked[k + 1].gk !== picked[i].gk));
      if (j > 0) [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    const got = {};
    picked.forEach(x => { got[x.type] = (got[x.type] || 0) + 1; });
    const doubles = ps.filter(p => p.got.length > 1).map(p => `${NP.shortName(p.m)} ${p.num}번 (${p.got.map(t => Banks.tName(t)).join(' + ')})`);
    this._last = { items: picked, target, got, doubles, nPass: ps.length, short: this.total(target) - picked.length, reused, nVar: picked.filter(x => x.v !== 'orig').length, ansCnt, overlapLeft };
    return this._last;
  },
  // 대의형 정답(요약은 두 낱말)의 내용어 중 일치·불일치 진술문 하나에 들어 있는 비율의 최대값
  STOP: new Set('the a an of to in and or is are be was were that this it its for on with as by from at not no can than their they them his her he she you your we our what which who how why when do does did more most into about should may might will would has have had also only just very'.split(' ')),
  words(s) { return new Set((String(s).toLowerCase().match(/[a-z]+/g) || []).filter(w => w.length > 3 && !this.STOP.has(w))); },
  overlap(xb, xc) {
    if (xb.kind !== 'bank' || xc.kind !== 'bank') return 0;
    const a = xb.it.options && xb.it.options[xb.it.answer - 1];
    const aw = this.words(Array.isArray(a) ? a.join(' ') : a || '');
    if (!aw.size) return 0;
    let best = 0;
    (xc.it.options || []).forEach(o => { const ow = this.words(o); let n = 0; aw.forEach(w => { if (ow.has(w)) n++; }); best = Math.max(best, n / aw.size); });
    return best;
  },
  // 기록 세트 다시 인쇄: 키 순서 그대로
  fromHist(h) {
    const all = new Map();
    Banks.dataMats().forEach(d => d.its.forEach(x => all.set(x.key, x)));
    const items = (h.keys || []).map(k => all.get(k)).filter(Boolean);
    const got = {};
    items.forEach(x => { got[x.type] = (got[x.type] || 0) + 1; });
    this._last = { items, target: {}, got, doubles: [], nPass: 0, short: 0, reused: 0, missing: (h.keys || []).length - items.length, nVar: items.filter(x => x.v !== 'orig').length, fixed: true };
    return this._last;
  },

  /* =========================================================
     창
     ========================================================= */
  open() {
    const dm = Banks.dataMats();
    if (!dm.length) { toast('모의 시험에 쓸 변형문제가 없습니다. 먼저 파일을 올리세요.'); return; }
    const K = Prints.kit;
    Banks.loadSet(); K.ensureAssets(); Banks.ensureCss();
    if (this.examId && !Store.get('exams', this.examId)) this.examId = '';
    const live = new Set(); dm.forEach(d => d.its.forEach(x => live.add(x.gk)));
    [...this.sel].forEach(k => { if (!live.has(k)) this.sel.delete(k); });
    if (!this.counts) this.loadCounts();
    this.fixed = null;
    const body = `<div class="pr-wrap wx-pw">
      <aside class="panel pr-side wx-pside">
        <div class="pr-sec"><h2>시험 범위</h2>
          <div style="margin-bottom:6px" data-mxexamw>${Banks.examSelHtml(this.examId).replace('data-bkexam', 'data-mxexam')}</div>
          <div class="wx-psbtn"><button type="button" class="btn sm" data-mxa="all">전체 선택</button><button type="button" class="btn sm" data-mxa="none">선택 해제</button></div>
          <div class="wx-pslist" data-mxsel>${this.selHtml()}</div>
          <p class="pr-hint mx-cap" data-mxcap>${this.capHtml()}</p></div>
        <div class="pr-sec"><h2>학교 틀</h2>
          <label class="pr-fld"><span>학교·학년</span><select data-mxschool>${this.schoolOpts()}</select></label>
          <div data-mxtpl>${this.tplHtml()}</div></div>
        <div class="pr-sec"><h2>변형 비율</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="변형 비율">${this.RATIOS.map(r => `<label class="chk"><input type="radio" name="mx-ratio" value="${r}" ${this.ratio === r ? 'checked' : ''}>${Math.round(r * 100)}%</label>`).join('')}</div>
          <p class="pr-hint">시험 문항 중 변형 지문(약·중·강) 문항의 비율이에요. 높을수록 원문을 외운 것만으로는 풀기 어려워요.</p></div>
        <div class="pr-sec"><h2>출제 기록</h2>
          <label class="chk pr-chk"><input type="checkbox" data-mxskip ${this.skipUsed ? 'checked' : ''}>이 학교에 낸 문항은 빼고 고르기</label>
          <div data-mxhist>${this.histHtml()}</div></div>
        <div class="pr-sec"><h2>뽑기</h2>
          <div class="wx-psbtn"><button type="button" class="btn sm" data-mxa="shuffle">다시 뽑기</button><button type="button" class="btn sm primary" data-mxa="save">이 세트 기록</button></div>
          <div class="mx-rep" data-mxrep></div></div>
        <div class="pr-sec"><h2>글자</h2>
          <label class="pr-fld"><span>학원명</span><input type="text" data-mp-ac value="${esc(K.academy())}" placeholder="학원명을 입력하세요" maxlength="40" autocomplete="off"></label>
          <label class="pr-fld"><span>날짜 (선택)</span>
            <div class="pr-inline"><input type="date" data-mp-date value="${esc(Banks.pr.date)}" aria-label="날짜"><button type="button" class="btn sm" data-mxa="date-clear">지우기</button></div></label></div>
        <div class="pr-sec"><h2>학생 이름</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="학생 이름 넣는 방식">
            <label class="chk"><input type="radio" name="mp-nm-mode" value="manual" ${Banks.pick.mode === 'class' ? '' : 'checked'}>직접 입력</label>
            <label class="chk"><input type="radio" name="mp-nm-mode" value="class" ${Banks.pick.mode === 'class' ? 'checked' : ''}>반에서 선택</label>
          </div>
          <div data-mp-nmbody>${this.nmBody()}</div></div>
        <div class="pr-sec"><h2>출력</h2>
          <label class="chk pr-chk"><input type="checkbox" data-mp-duplex ${Banks.set.duplex ? 'checked' : ''}>양면 프린터 사용</label>
          <div class="pr-print" style="margin-top:10px">
            <input type="number" data-mp-copies min="1" max="500" step="1" value="${esc(Banks.pr.copies)}" placeholder="부수" aria-label="출력 부수"${Banks.pick.mode === 'class' ? ' disabled' : ''}>
            <button type="button" class="btn primary" data-mxa="print" data-mp-printbtn>${Banks.printLabel()}</button>
          </div>
          <div class="pr-note">인쇄창에서 배율은 <b>기본값(100%)</b>으로 두세요. 양면 프린터를 사용할 땐 인쇄창의 <b>양면 인쇄</b>도 켜져 있어야 해요.</div></div>
      </aside>
      <section class="wx-pview"><p class="pr-hint bk-psum" data-mxsum></p><div data-mxpv></div></section>
    </div>`;
    Modal.open({
      title: '모의 시험', size: 'xl wx-pmodal', body, autofocus: false,
      onMount: (b, md) => {
        const upd = debounce(() => this.prevBuild(b, md), 250);
        const syncIndet = () => $$('[data-indet]', b).forEach(x => { x.indeterminate = true; });
        const refreshSel = () => { const box = $('[data-mxsel]', b), top = box.scrollTop; box.innerHTML = this.selHtml(); box.scrollTop = top; syncIndet(); this.updateCap(b); this.fixed = null; upd(); };
        const refreshSchool = () => {
          $('[data-mxschool]', b).innerHTML = this.schoolOpts();
          $('[data-mxtpl]', b).innerHTML = this.tplHtml();
          $('[data-mxhist]', b).innerHTML = this.histHtml();
          this.fixed = null; upd();
        };
        const refreshNm = (listToo) => {
          if (listToo) { const l = $('[data-bp-list]', b); if (l) l.innerHTML = Banks.nmListHtml(); }
          const p = $('[data-bp-picked]', b); if (p) p.innerHTML = Banks.nmPickedHtml();
          syncIndet();
          $('[data-mp-printbtn]', b).textContent = Banks.printLabel();
          $('[data-mp-copies]', b).disabled = Banks.pick.mode === 'class';
          upd();
        };
        syncIndet();
        b.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-mxg]');
          if (chip) { const k = chip.dataset.mxg; if (this.sel.has(k)) this.sel.delete(k); else this.sel.add(k); refreshSel(); return; }
          const hb = e.target.closest('[data-mxh]');
          if (hb) { this.histAction(hb.dataset.mxh, hb.dataset.id, b, upd); return; }
          const bt = e.target.closest('[data-mxa]') || e.target.closest('[data-bka="bp-nm-clear"]');
          if (!bt) return;
          const a = bt.dataset.mxa || 'nm-clear';
          if (a === 'all') { Banks.dataMats().forEach(d => d.its.forEach(x => this.sel.add(x.gk))); refreshSel(); }
          else if (a === 'none') { this.sel.clear(); refreshSel(); }
          else if (a === 'shuffle') { this.fixed = null; this.seed = (this.seed * 7919 + 104729) % 2147483647 || 1; upd(); }
          else if (a === 'tplsave') this.saveTpl(b);
          else if (a === 'tplreset') { this.loadCounts(); $('[data-mxtpl]', b).innerHTML = this.tplHtml(); this.fixed = null; upd(); }
          else if (a === 'save') this.saveSet(b);
          else if (a === 'date-clear') { Banks.pr.date = ''; $('[data-mp-date]', b).value = ''; upd(); }
          else if (a === 'nm-clear') { Banks.pick.sel = []; refreshNm(true); }
          else if (a === 'print') this.doPrint(b);
        });
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-mxc]')) { const v = Math.max(0, Math.min(20, parseInt(t.value, 10) || 0)); this.counts[t.dataset.mxc] = v; $('[data-mxtot]', b).textContent = this.total(this.counts); this.updateCap(b); this.fixed = null; upd(); }
          else if (t.matches('[data-mp-ac]')) { K.setAcademy(t.value); upd(); }
          else if (t.matches('[data-mp-date]')) { Banks.pr.date = isYmd(t.value) ? t.value : ''; upd(); }
          else if (t.matches('[data-bp-name]')) { Banks.pr.name = t.value; upd(); }
          else if (t.matches('[data-mp-copies]')) Banks.pr.copies = t.value;
        });
        b.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-mxexam]')) {
            this.examId = t.value;
            const ex = t.value ? Store.get('exams', t.value) : null;
            if (ex) {
              this.sel = Banks.examGks(ex, Banks.dataMats());
              if (!this.sel.size) toast('이 시험 범위에 올린 변형문제가 없어요.');
              this.school = this.keyOf(ex); this.loadCounts();
              refreshSchool();
            }
            refreshSel();
          } else if (t.matches('[data-mxsm]')) {
            const d = Banks.dataMats().find(y => y.m.id === t.dataset.mxsm);
            if (d) d.its.forEach(x => { if (t.checked) this.sel.add(x.gk); else this.sel.delete(x.gk); });
            refreshSel();
          } else if (t.matches('[data-mxschool]')) { this.school = t.value; this.loadCounts(); refreshSchool(); }
          else if (t.matches('[name="mx-ratio"]')) { this.ratio = +t.value; this.fixed = null; upd(); }
          else if (t.matches('[data-mxskip]')) { this.skipUsed = t.checked; this.fixed = null; upd(); }
          else if (t.matches('[data-mp-duplex]')) { Banks.set.duplex = t.checked; Banks.saveSet(); upd(); }
          else if (t.matches('[name="mp-nm-mode"]')) {
            if (!t.checked) return;
            Banks.pick.mode = t.value === 'class' ? 'class' : 'manual';
            $('[data-mp-nmbody]', b).innerHTML = this.nmBody(); refreshNm(false);
          } else if (t.matches('[data-bp-class]')) { Banks.pick.classId = t.value; const l = $('[data-bp-list]', b); if (l) l.innerHTML = ''; refreshNm(true); }
          else if (t.matches('[data-bp-all]')) { Banks.nmToggle(K.roster(Banks.pick.classId).map(s => s.id), t.checked); refreshNm(true); }
          else if (t.matches('[data-bp-stu]')) { Banks.nmToggle([t.dataset.bpStu], t.checked); refreshNm(true); }
        });
        this.prevBuild(b, md);
      },
      onClose: () => { this._tok++; },
      buttons: [{ text: '닫기' }],
    });
  },
  nmBody() { return Banks.nmBodyHtml(); },

  selHtml() {
    return Banks.dataMats().map(({ m, its }) => {
      const nums = [...new Set(its.map(x => x.num))].sort((a, b) => Banks.numKey(a) - Banks.numKey(b));
      const on = nums.filter(n => this.sel.has(m.id + '|' + n)).length;
      return `<div class="wx-psm"><label class="chk wx-psmh"><input type="checkbox" data-mxsm="${m.id}" ${on === nums.length ? 'checked' : ''}${on && on < nums.length ? ' data-indet' : ''}>
        <span class="np-tag mock">${MAT_TYPE.mock}</span><b>${esc(NP.matName(m))}</b></label>
        <div class="np-chips">${nums.map(n => `<button type="button" class="np-c sm ${this.sel.has(m.id + '|' + n) ? 'on' : ''}" data-mxg="${esc(m.id + '|' + n)}">${esc(n)}번</button>`).join('')}</div></div>`;
    }).join('');
  },
  schoolOpts() {
    const ss = this.schools();
    if (this.school && !ss.includes(this.school)) ss.unshift(this.school);
    return `<option value="" ${this.school ? '' : 'selected'}>학교 없이 (기본 틀 · 기록 안 함)</option>${ss.map(s => `<option value="${esc(s)}" ${s === this.school ? 'selected' : ''}>${esc(s)}${this.tplOf(s) ? '' : ' (틀 없음)'}</option>`).join('')}`;
  },
  tplHtml() {
    const saved = this.tplOf(this.school);
    const c = this.sel.size ? this.capInfo() : null;
    return `<div class="mx-tpl">${Banks.TYPES.map(([t, nm]) => { const over = !!c && (+this.counts[t] || 0) > c.per[t];
        return `<label class="mx-tc"><span>${esc(nm)} <small class="mx-max${over ? ' mx-over' : ''}" data-mxmax="${t}">${c ? `최대 ${c.per[t]}` : ''}</small></span><input type="number" min="0" max="20" step="1" value="${+this.counts[t] || 0}" data-mxc="${t}"${over ? ' class="mx-over"' : ''}></label>`; }).join('')}</div>
      <div class="mx-tplb"><span class="small">합계 <b data-mxtot>${this.total(this.counts)}</b>문항</span><span style="flex:1"></span>
        <button type="button" class="btn sm" data-mxa="tplreset">되돌리기</button>
        ${this.school ? `<button type="button" class="btn sm" data-mxa="tplsave">${saved ? '이 학교·학년 틀 덮어쓰기' : '이 학교·학년 틀로 저장'}</button>` : ''}</div>
      <p class="mx-warn" data-mxwarn>${esc(this.warnHtml(c))}</p>
      <p class="pr-hint">${this.school ? (saved ? `${esc(this.school)} 틀 (저장됨)` : `${esc(this.school)}은(는) 저장된 틀이 없어 기본 틀(22문항)로 시작했어요. 숫자를 고치고 저장하면 다음부터 그 틀을 써요.`) : '기본 틀(22문항)이에요. 학교 시험이나 학교·학년을 고르면 그 틀을 쓰고 저장할 수 있어요.'} 지문이 모자라면 답이 새지 않는 쪽을 먼저 지키고, 문항 수는 다른 유형으로 채워요.</p>`;
  },
  saveTpl(b) {
    if (!this.school) return;
    const had = !!this.tplOf(this.school);
    Store.put('meta', { id: this.tplId(this.school), kind: 'mxtpl', school: this.school, counts: Object.assign({}, this.counts), updatedAt: new Date().toISOString() });
    toast(`${this.school} 틀을 ${had ? '덮어썼습니다' : '저장했습니다'}`);
    $('[data-mxschool]', b).innerHTML = this.schoolOpts();
    $('[data-mxtpl]', b).innerHTML = this.tplHtml();
  },
  histHtml() {
    if (!this.school) return '<p class="pr-hint">학교·학년을 고르면 그 출제 기록을 쓰고 남길 수 있어요.</p>';
    const hs = this.hist(this.school);
    const n = new Set([].concat(...hs.map(h => h.keys || []))).size;
    if (!hs.length) return `<p class="pr-hint">${esc(this.school)}: 아직 기록한 세트가 없어요. 마음에 드는 세트를 “이 세트 기록”으로 남기면 다음부터 그 문항은 빼고 골라요.</p>`;
    return `<p class="pr-hint">${esc(this.school)}: 기록 ${hs.length}세트 · ${n}문항</p><div class="mx-hist">${hs.map(h => `<div class="mx-hr${this.fixed && this.fixed.id === h.id ? ' on' : ''}">
        <span class="mx-hn">${esc(String(h.at || '').slice(0, 10))} · ${h.total || (h.keys || []).length}문항${h.title ? ` · ${esc(h.title)}` : ''}</span>
        <button type="button" class="btn sm" data-mxh="show" data-id="${esc(h.id)}">다시 인쇄</button><button type="button" class="btn sm ghost danger" data-mxh="del" data-id="${esc(h.id)}">삭제</button></div>`).join('')}</div>`;
  },
  async histAction(act, id, b, upd) {
    const h = Store.get('meta', id); if (!h) return;
    if (act === 'show') { this.fixed = { id: h.id, keys: h.keys || [] }; $('[data-mxhist]', b).innerHTML = this.histHtml(); upd(); return; }
    if (act === 'del') {
      if (!await confirmDlg(`${h.school} 출제 기록 (${String(h.at || '').slice(0, 10)}, ${(h.keys || []).length}문항)을 지울까요?\n지우면 그 문항들은 다시 뽑힐 수 있어요.`, '삭제', true)) return;
      Store.del('meta', h.id);
      if (this.fixed && this.fixed.id === h.id) this.fixed = null;
      $('[data-mxhist]', b).innerHTML = this.histHtml(); upd();
    }
  },
  async saveSet(b) {
    if (!this.school) { toast('기록하려면 학교 틀에서 학교·학년을 고르세요.'); return; }
    if (this.fixed) { toast('이미 기록한 세트예요.'); return; }
    const r = this._last;
    if (!r || !r.items.length) { toast('기록할 세트가 없어요.'); return; }
    const ex = this.examId ? Store.get('exams', this.examId) : null;
    const title = ex ? `${ex.year}년 ${ex.semester}학기 ${EXAM_KIND[ex.kind] || ''}`.trim() : '';
    if (!await confirmDlg(`지금 세트(${r.items.length}문항)를 ${this.school} 출제 기록으로 남길까요?\n다음부터 이 학교로 뽑을 때는 이 문항들을 빼고 골라요.`, '기록')) return;
    const rec = { id: uid('MXH'), kind: 'mxhist', school: this.school, title, at: new Date().toISOString(), keys: r.items.map(x => x.key), ratio: this.ratio, total: r.items.length };
    Store.put('meta', rec);
    this.fixed = { id: rec.id, keys: rec.keys };
    toast('출제 기록을 남겼습니다');
    $('[data-mxhist]', b).innerHTML = this.histHtml();
  },

  repHtml(r) {
    if (r.fixed) return `<p class="pr-hint">기록한 세트를 그대로 보여 주는 중이에요${r.missing ? ` (지금 없는 문항 ${r.missing}개는 빠짐 — 은행을 다시 올리면 돌아와요)` : ''}. 새로 뽑으려면 “다시 뽑기”.</p>`;
    const rows = Banks.TYPES.filter(([t]) => r.target[t] || r.got[t]).map(([t, nm]) => {
      const a = r.target[t] || 0, g = r.got[t] || 0;
      return `<tr class="${a !== g ? 'mx-adj' : ''}"><td>${esc(nm)}</td><td class="num">${a}</td><td class="num">${g}</td><td class="small">${a === g ? '' : g > a ? '늘림' : '줄임'}</td></tr>`;
    }).join('');
    const notes = [];
    notes.push(`지문 ${r.nPass}개에서 ${r.items.length}문항 · 변형 ${r.nVar}문항 · 정답 ${r.ansCnt.map((n, i) => Banks.LAB[i] + n).join(' ')}`);
    if (r.doubles.length) notes.push(`두 번 쓴 지문 ${r.doubles.length}개: ${r.doubles.map(esc).join(', ')}` + (r.overlapLeft ? ` — 그중 ${r.overlapLeft}개는 다른 버전이 없어 대의형 정답 낱말이 진술문과 겹쳐요 (확인해 주세요)` : ''));
    if (r.short > 0) notes.push(`<b>틀보다 ${r.short}문항 적어요</b> — 지문이 모자라 답이 새지 않게 채울 수 있는 만큼만 냈어요. 범위를 넓히거나 틀을 줄이세요.`);
    if (r.reused) notes.push(`기록된 문항을 다시 쓴 칸 ${r.reused}개 (새 문항이 모자람)`);
    return `<table class="tbl compact mx-rept"><thead><tr><th>유형</th><th class="num">틀</th><th class="num">나옴</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      ${notes.map(n => `<p class="pr-hint">${n}</p>`).join('')}`;
  },
  title() {
    const ex = this.examId ? Store.get('exams', this.examId) : null;
    return ex ? `${schoolShort(ex.school)} ${gradeLabel(ex.grade)} ${EXAM_KIND[ex.kind] || ''} 모의 시험`.replace(/\s+/g, ' ') : (this.school ? `${this.school} 모의 시험` : '모의 시험');
  },
  current() { return this.fixed ? this.fromHist({ keys: this.fixed.keys }) : this.build(); },

  async prevBuild(b, md) {
    const tok = ++this._tok;
    const pv = $('[data-mxpv]', b), sm = $('[data-mxsum]', b), rep = $('[data-mxrep]', b);
    if (!this.fixed && !this.sel.size) { pv.innerHTML = '<div class="wx-pv-empty">시험 범위를 고르세요. (학교 시험을 고르면 범위가 자동으로 골라져요)</div>'; sm.textContent = ''; rep.innerHTML = ''; return; }
    if (!this.fixed && !this.total(this.counts)) { pv.innerHTML = '<div class="wx-pv-empty">학교 틀의 문항 수를 넣으세요.</div>'; sm.textContent = ''; rep.innerHTML = ''; return; }
    const r = this.current();
    rep.innerHTML = this.repHtml(r);
    if (!r.items.length) { pv.innerHTML = '<div class="wx-pv-empty">고른 범위에서 낼 수 있는 문항이 없어요.</div>'; sm.textContent = ''; return; }
    if (!pv.children.length || $('.wx-pv-empty', pv)) pv.innerHTML = '<div class="wx-pv-empty">미리보기를 만드는 중…</div>';
    const pg = await Banks.paginate(r.items, this.title());
    if (tok !== this._tok || md.closed) return;
    const nm = Banks.pick.mode === 'class' ? ((Banks.pickStudents()[0] || {}).name || '') : Banks.pr.name;
    const pages = Banks.copyPages(pg, nm).filter(p => !p.blank);
    sm.textContent = `${r.items.length}문항 → 문제 ${pg.qs.length}쪽 + 해설 ${pg.ak.length}쪽`;
    const K = Prints.kit, s = 0.36;
    pv.innerHTML = `<div class="wx-pv-h">미리보기 · 한 부${nm ? ` (${esc(nm)})` : ''} · 누르면 크게 보기</div><div class="wx-pv-grid">${pages.map((p, i) => `<figure class="wx-th in-th" data-mxbig="${i}">
        <div class="wx-thb" style="width:${(K.PAGE_W * s).toFixed(1)}px;height:${(K.PAGE_H * s).toFixed(1)}px"><div style="transform:scale(${s});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div>
        <figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div>`;
    pv.onclick = (e) => {
      const f = e.target.closest('[data-mxbig]'); if (!f) return;
      const p = pages[+f.dataset.mxbig]; if (!p) return;
      const z = Math.min(1, (window.innerWidth * 0.9) / K.PAGE_W);
      Modal.open({ title: p.cap, size: 'xl', autofocus: false,
        body: `<div style="overflow:auto;max-height:calc(100vh - 160px)"><div class="wx-thb" style="width:${(K.PAGE_W * z).toFixed(1)}px;height:${(K.PAGE_H * z).toFixed(1)}px;margin:0 auto"><div style="transform:scale(${z});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div></div>`,
        buttons: [{ text: '닫기', cls: 'primary', primary: true }] });
    };
  },

  async doPrint(b) {
    const r = this._last;
    if (!r || !r.items.length) { toast('인쇄할 문항이 없습니다.'); return; }
    let names;
    if (Banks.pick.mode === 'class') {
      const list = Banks.pickStudents();
      if (!list.length) { toast('인쇄할 학생을 선택하세요.'); return; }
      names = list.map(s => s.name);
    } else {
      const inp = $('[data-mp-copies]', b), v = String(inp.value || '').trim();
      if (v === '') { toast('출력 부수를 입력하세요.'); inp.focus(); return; }
      const n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
      if (n < 1 || n > 500) { toast('출력 부수는 1에서 500 사이로 입력하세요.'); inp.focus(); return; }
      names = Array.from({ length: n }, () => Banks.pr.name);
    }
    const pg = await Banks.paginate(r.items, this.title());
    const html = names.map(nm => Banks.copyPages(pg, nm).map(p => p.html).join('')).join('');
    Prints.kit.printPaper(html, `모의시험_${todayStr()}`, Inserts.PAPER_CSS + Orders.PAPER_CSS + Banks.PAPER_CSS);
  },
};

/* 모의 시험 창 화면 스타일 (테마 변수만 사용) */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.mx-tpl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; }
.mx-tc { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 13px; }
.mx-tc input { width: 52px; text-align: right; }
.mx-tplb { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.mx-max { font-size: 11px; color: var(--ink-mute); font-weight: 400; margin-left: 2px; }
.mx-max.mx-over, .mx-warn { color: var(--danger, #c62828); }
.mx-tc input.mx-over { border-color: var(--danger, #c62828); color: var(--danger, #c62828); }
.mx-warn { font-size: 12.5px; font-weight: 600; margin: 6px 0 0; min-height: 0; }
.mx-warn:empty { display: none; }
.mx-cap { margin: 6px 0 0; }
.mx-rep { margin-top: 8px; }
.mx-rept { font-size: 12.5px; }
.mx-rept .mx-adj td { color: var(--accent-ink); font-weight: 600; }
.mx-hist { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; }
.mx-hr { display: flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 3px 6px; border: 1px solid var(--line); border-radius: 6px; }
.mx-hr.on { border-color: var(--accent); background: var(--accent-soft); }
.mx-hn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
  document.head.appendChild(st);
})();
