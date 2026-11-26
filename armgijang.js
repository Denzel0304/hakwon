/* =========================================================
   armgijang.js — 학생 › 암기장 출제
   · 문법 / 독해 (고정) › Chapter › Unit(선택) › 문항(문제 · 답1 필수 · 답2~ 선택)
     Unit이 하나라도 있는 Chapter는 문항을 반드시 Unit 안에 둔다.
   · 저장: meta 테이블 (다른 기기와 동기화 · 테이블 추가 없음) — Chapter 하나에 기록 하나
       id 'ARMG1738_…', { kind:'armg1738_ch', cat:'g'(문법)|'r'(독해), name, ord,
                          units:[{ id, name }], items:[{ id, q, a:[답…], u:unitId|'' }], updatedAt }
       순서: Chapter = ord, Unit = units 배열 순서, 문항 = items 배열 순서
   · 이 기기 설정: localStorage mg77_armg1738_* (mg77_ 접두사 → 로그아웃하면 함께 지워짐)
   · 인쇄 (이 화면의 인쇄 창): 고른 Chapter·Unit의 문항으로 단어시험처럼 A4 세로 시험지를 만든다
       순서대로 = 늘 전체 / 랜덤 = 문항 수 지정, 모든 부가 같은 시험지 ("다시 섞기"로 바꿈)
       1단(쪽당 25문항) / 2단(쪽당 50문항), 긴 글은 글자를 줄여 칸에 맞춤
       인쇄 종류: 문제지+답지 / 문제지만 / 답지만, 답지 양식 (가) 시험지 양식 / (나) 목록형
       한 부 = 문제지 (+빈 면) + 답지 (+빈 면) → 양면 프린터에서도 문제지·답지, 학생끼리 한 장에 붙지 않음
       종이·머리글(학원명·날짜·이름)·학생 목록·인쇄 방식은 표지+양식(Prints.kit)의 것을 그대로 쓰고, 제목·점수 칸을 더함
       로고는 학생 › Report › 설정의 로고 (Reports.cfg().logo)
   ========================================================= */
const Armg1738 = {
  KIND: 'armg1738_ch',
  CATS: [['g', '문법'], ['r', '독해']],
  LS_SET: 'mg77_armg1738_set',     // 인쇄 설정
  LS_UI: 'mg77_armg1738_ui',       // 마지막으로 본 구분·Chapter·Unit
  ROWS: 25,                        // 시험지 한 단의 줄 수
  ROW_H: 9.2,                      // 시험지 줄 높이 (mm)
  LIST_ROWS: 40,                   // 답지 (나) 목록형 한 쪽 줄 수
  LIST_ROW_H: 5.9,
  INNER_W: 180,                    // 종이 안쪽 너비 (210 - 15×2)

  cat: 'g',
  ui: null,                        // { cat, ch:{g,r}, un:{chId:unitId} }
  set: null,                       // { duplex, cols, out, keyForm, order, brand }
  draft: { q: '', a: [''] },       // 입력 중인 새 문항
  sel: { g: new Set(), r: new Set() },   // 인쇄 범위: 'chId' (Unit 없는 Chapter) | 'chId|unitId'
  prCat: 'g',
  seed: 1,
  pick: { mode: 'manual', classId: '', sel: [] },
  pr: { name: '', date: '', copies: '', count: '', title: '', titleManual: false },
  _tok: 0,
  _cache: null,

  /* =========================================================
     저장
     ========================================================= */
  catName(c) { return (this.CATS.find(x => x[0] === c) || ['', ''])[1]; },
  chapters(cat) {
    return Store.where('meta', r => r.kind === this.KIND && r.cat === cat)
      .map(r => this.norm(r))
      .sort((a, b) => (a.ord - b.ord) || ko(a.name, b.name));
  },
  chapter(id) { const r = id ? Store.get('meta', id) : null; return r && r.kind === this.KIND ? this.norm(r) : null; },
  // 읽을 때 형식을 맞춤 (복사본을 돌려줌 → 고친 뒤 save 로 저장)
  norm(r) {
    const c = JSON.parse(JSON.stringify(r));
    c.name = String(c.name || '');
    c.ord = Number.isFinite(+c.ord) ? +c.ord : 0;
    c.units = Array.isArray(c.units) ? c.units.filter(u => u && u.id) : [];
    c.items = Array.isArray(c.items) ? c.items.filter(it => it && it.id).map(it => ({ id: it.id, q: String(it.q || ''), a: (Array.isArray(it.a) ? it.a : [it.a]).map(x => String(x || '')).filter(x => x.trim()), u: it.u || '' })) : [];
    return c;
  },
  save(c) {
    c.updatedAt = new Date().toISOString();
    Store.put('meta', c);
  },
  // 문항이 속한 Unit (Unit이 있는 Chapter에서 Unit을 잃은 문항은 첫 Unit으로 봄)
  uOf(ch, it) {
    if (!ch.units.length) return '';
    return ch.units.some(u => u.id === it.u) ? it.u : ch.units[0].id;
  },
  scopeItems(ch, unitId) { return ch.items.filter(it => this.uOf(ch, it) === (unitId || '')); },
  catCount(cat) { return this.chapters(cat).reduce((n, c) => n + c.items.length, 0); },
  normQ(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); },
  locName(ch, unitId) {
    const u = unitId ? ch.units.find(x => x.id === unitId) : null;
    return u ? `${ch.name} › ${u.name}` : ch.name;
  },
  // 같은 구분 안에서 같은 문제 찾기 → [{ ch, it }]
  findDup(cat, q, exceptId) {
    const k = this.normQ(q), out = [];
    if (!k) return out;
    this.chapters(cat).forEach(ch => ch.items.forEach(it => { if (it.id !== exceptId && this.normQ(it.q) === k) out.push({ ch, it }); }));
    return out;
  },
  // 여러 줄 등록용: 문제 → [{ ch, it }] (한 번만 만들어 씀)
  dupIndex(cat) {
    const m = new Map();
    this.chapters(cat).forEach(ch => ch.items.forEach(it => { const k = this.normQ(it.q); if (!m.has(k)) m.set(k, []); m.get(k).push({ ch, it }); }));
    return m;
  },

  /* ---------- 이 기기 설정 ---------- */
  loadUi() {
    if (this.ui) return;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.LS_UI) || 'null'); } catch (e) { s = null; }
    this.ui = { cat: 'g', ch: { g: '', r: '' }, un: {} };
    if (s && typeof s === 'object') {
      if (s.cat === 'g' || s.cat === 'r') this.ui.cat = s.cat;
      if (s.ch && typeof s.ch === 'object') { this.ui.ch.g = String(s.ch.g || ''); this.ui.ch.r = String(s.ch.r || ''); }
      if (s.un && typeof s.un === 'object') Object.keys(s.un).forEach(k => { this.ui.un[k] = String(s.un[k] || ''); });
    }
    this.cat = this.ui.cat;
  },
  saveUi() {
    this.ui.cat = this.cat;
    try { localStorage.setItem(this.LS_UI, JSON.stringify(this.ui)); } catch (e) { /* 저장 못 해도 이번에는 그대로 씀 */ }
  },
  loadSet() {
    if (this.set) return;
    this.set = { duplex: true, cols: 1, out: 'both', keyForm: 'a', order: 'seq', brand: 'text' };
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.LS_SET) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') return;
    if (typeof s.duplex === 'boolean') this.set.duplex = s.duplex;
    if (s.cols === 1 || s.cols === 2) this.set.cols = s.cols;
    if (['both', 'test', 'key'].includes(s.out)) this.set.out = s.out;
    if (s.keyForm === 'a' || s.keyForm === 'b') this.set.keyForm = s.keyForm;
    if (s.order === 'seq' || s.order === 'rand') this.set.order = s.order;
    if (s.brand === 'text' || s.brand === 'logo') this.set.brand = s.brand;
  },
  saveSet() { try { localStorage.setItem(this.LS_SET, JSON.stringify(this.set)); } catch (e) { /* 저장 못 해도 이번에는 그대로 씀 */ } },

  // 지금 보고 있는 Chapter · Unit
  current() {
    const chs = this.chapters(this.cat);
    let ch = chs.find(c => c.id === this.ui.ch[this.cat]) || chs[0] || null;
    this.ui.ch[this.cat] = ch ? ch.id : '';
    let un = null;
    if (ch && ch.units.length) {
      un = ch.units.find(u => u.id === this.ui.un[ch.id]) || ch.units[0];
      this.ui.un[ch.id] = un.id;
    }
    return { chs, ch, un };
  },

  /* =========================================================
     화면
     ========================================================= */
  render(main) {
    this.loadUi(); this.loadSet(); this.ensureCss();
    const { chs, ch, un } = this.current();
    const tabs = `<div class="tabs">${this.CATS.map(([k, v]) => `<button type="button" data-armg-tab="${k}" class="${this.cat === k ? 'active' : ''}">${v}<span class="cnt">${this.catCount(k) || ''}</span></button>`).join('')}</div>`;
    const dis = (c) => c ? '' : ' disabled';
    const chOpts = chs.length ? chs.map(c => `<option value="${esc(c.id)}"${ch && c.id === ch.id ? ' selected' : ''}>${esc(c.name)} (${c.items.length})</option>`).join('') : '<option value="">Chapter 없음</option>';
    const unOpts = ch && ch.units.length ? ch.units.map(u => `<option value="${esc(u.id)}"${un && u.id === un.id ? ' selected' : ''}>${esc(u.name)} (${this.scopeItems(ch, u.id).length})</option>`).join('') : '<option value="">Unit 없음 (선택 사항)</option>';
    let h = `<div class="page-head"><h1>암기장 출제</h1></div>${tabs}
      <div class="panel armg1738-loc">
        <div class="armg1738-row"><span class="armg1738-lab">Chapter</span>
          <select data-armg-ch${dis(chs.length)}>${chOpts}</select>
          <button type="button" class="btn sm" data-aa="ch-add">+ 추가</button>
          <button type="button" class="btn sm" data-aa="ch-ren"${dis(ch)}>이름 변경</button>
          <button type="button" class="btn sm" data-aa="ch-ord"${dis(chs.length > 1)}>순서</button>
          <button type="button" class="btn sm ghost danger" data-aa="ch-del"${dis(ch)}>삭제</button>
          <span style="flex:1"></span>
          <button type="button" class="btn primary" data-aa="print">인쇄</button></div>
        <div class="armg1738-row"><span class="armg1738-lab">Unit</span>
          <select data-armg-un${dis(ch && ch.units.length)}>${unOpts}</select>
          <button type="button" class="btn sm" data-aa="un-add"${dis(ch)}>+ 추가</button>
          <button type="button" class="btn sm" data-aa="un-ren"${dis(un)}>이름 변경</button>
          <button type="button" class="btn sm" data-aa="un-ord"${dis(ch && ch.units.length > 1)}>순서</button>
          <button type="button" class="btn sm ghost danger" data-aa="un-del"${dis(un)}>삭제</button></div>
      </div>`;
    h += ch ? this.itemsHtml(ch, un) : `<div class="panel"><div class="empty">${this.catName(this.cat)}에 Chapter가 없습니다. 위의 “+ 추가”로 Chapter를 만드세요. (예: to부정사)</div></div>`;
    main.innerHTML = h;
    main.onclick = (e) => this.onClick(e, main);
    main.onchange = (e) => this.onChange(e, main);
    main.oninput = (e) => this.onInput(e);
    main.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.target.matches('[data-armg-q], [data-armg-a]')) { e.preventDefault(); this.addItem(main); }
    };
    const tb = $('[data-armg-items]', main);
    if (tb) this.sortable(tb, 'tr[data-it]', (els) => this.reorderItems(els.map(el => el.dataset.it)));
    this.saveUi();
  },

  itemsHtml(ch, un) {
    const list = this.scopeItems(ch, un ? un.id : '');
    const where = this.locName(ch, un ? un.id : '');
    const ans = this.draft.a.map((v, i) => `<div class="armg1738-ain"><input type="text" data-armg-a="${i}" value="${esc(v)}" placeholder="${i ? `답 ${i + 1} (선택)` : '답 (필수)'}" autocomplete="off">${i ? `<button type="button" class="btn sm ghost" data-aa="ans-del" data-i="${i}" title="이 답 칸 빼기">✕</button>` : ''}</div>`).join('');
    return `<div class="panel">
      <div class="armg1738-ph"><b>${esc(where)}</b><span class="small soft">${list.length}문항</span><span style="flex:1"></span>
        <button type="button" class="btn sm" data-aa="bulk">여러 줄 한 번에 등록</button></div>
      <div class="armg1738-add">
        <input type="text" data-armg-q value="${esc(this.draft.q)}" placeholder="문제 (예: keep +)" autocomplete="off">
        <div class="armg1738-as">${ans}</div>
        <button type="button" class="btn sm" data-aa="ans-more" title="답 칸 더하기">+ 답</button>
        <button type="button" class="btn primary" data-aa="add">추가</button>
      </div>
      <p class="small muted armg1738-tip">Enter로도 추가돼요. 답이 여러 개면 “+ 답”으로 칸을 더하세요 (첫 번째 답만 필수).</p>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl compact armg1738-items"><thead><tr><th></th><th class="num">번호</th><th>문제</th><th>답</th><th></th></tr></thead>
        <tbody data-armg-items>${list.map((it, i) => `<tr data-it="${esc(it.id)}">
          <td class="armg1738-hd" data-armg-handle title="끌어서 순서 바꾸기">⠿</td><td class="num">${i + 1}</td>
          <td class="armg1738-q">${esc(it.q)}</td>
          <td>${it.a.map(x => `<span class="armg1738-ans">${esc(x)}</span>`).join('')}</td>
          <td class="armg1738-act"><button type="button" class="btn sm ghost" data-ia="up"${i ? '' : ' disabled'} title="위로">▲</button><button type="button" class="btn sm ghost" data-ia="down"${i < list.length - 1 ? '' : ' disabled'} title="아래로">▼</button><button type="button" class="btn sm ghost" data-ia="edit">수정</button><button type="button" class="btn sm ghost danger" data-ia="del">삭제</button></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">문항이 없습니다. 위에서 문제와 답을 입력하세요.</div>'}
    </div>`;
  },

  onClick(e, main) {
    const tb = e.target.closest('[data-armg-tab]');
    if (tb) { this.cat = tb.dataset.armgTab; this.saveUi(); App.render(true); return; }
    const row = e.target.closest('tr[data-it]');
    const ib = e.target.closest('[data-ia]');
    if (row && ib && !ib.disabled) { this.itemAct(ib.dataset.ia, row.dataset.it); return; }
    const b = e.target.closest('[data-aa]');
    if (!b || b.disabled) return;
    const a = b.dataset.aa;
    if (a === 'print') this.openPrint();
    else if (a === 'ch-add') this.chAdd();
    else if (a === 'ch-ren') this.chRename();
    else if (a === 'ch-ord') this.chOrder();
    else if (a === 'ch-del') this.chDel();
    else if (a === 'un-add') this.unAdd();
    else if (a === 'un-ren') this.unRename();
    else if (a === 'un-ord') this.unOrder();
    else if (a === 'un-del') this.unDel();
    else if (a === 'bulk') this.openBulk();
    else if (a === 'add') this.addItem(main);
    else if (a === 'ans-more') {
      this.draft.a.push('');
      App.render();
      const ins = $$('#main [data-armg-a]'); if (ins.length) ins[ins.length - 1].focus();
    } else if (a === 'ans-del') {
      const i = +b.dataset.i;
      if (i > 0) this.draft.a.splice(i, 1);
      App.render();
    }
  },
  onChange(e) {
    const t = e.target;
    if (t.matches('[data-armg-ch]')) { this.ui.ch[this.cat] = t.value; this.saveUi(); App.render(); }
    else if (t.matches('[data-armg-un]')) { const { ch } = this.current(); if (ch) this.ui.un[ch.id] = t.value; this.saveUi(); App.render(); }
  },
  onInput(e) {
    const t = e.target;
    if (t.matches('[data-armg-q]')) this.draft.q = t.value;
    else if (t.matches('[data-armg-a]')) { const i = +t.dataset.armgA; if (i >= 0 && i < this.draft.a.length) this.draft.a[i] = t.value; }
  },

  /* ---------- 문항 ---------- */
  dupText(list) {
    return list.slice(0, 5).map(d => `· ${this.locName(d.ch, this.uOf(d.ch, d.it))} : ${d.it.q} → ${d.it.a.join(' / ')}`).join('\n') + (list.length > 5 ? `\n… 외 ${list.length - 5}개` : '');
  },
  async addItem(main) {
    const { ch, un } = this.current();
    if (!ch) { toast('먼저 Chapter를 만드세요.'); return; }
    const qi = $('[data-armg-q]', main);
    if (qi) { this.draft.q = qi.value; $$('[data-armg-a]', main).forEach(x => { const i = +x.dataset.armgA; if (i >= 0 && i < this.draft.a.length) this.draft.a[i] = x.value; }); }
    const q = this.draft.q.trim(), as = this.draft.a.map(x => x.trim()).filter(Boolean);
    if (!q) { toast('문제를 입력하세요.'); const f = $('[data-armg-q]', main); if (f) f.focus(); return; }
    if (!as.length) { toast('답을 입력하세요.'); const f = $('[data-armg-a="0"]', main); if (f) f.focus(); return; }
    const dup = this.findDup(this.cat, q);
    if (dup.length && !await confirmDlg(`같은 문제가 이미 있습니다.\n${this.dupText(dup)}\n\n그래도 추가할까요?`, '추가')) return;
    const c = this.chapter(ch.id);
    if (!c) return;
    c.items.push({ id: uid('i'), q, a: as, u: un ? un.id : '' });
    this.save(c);
    this.draft = { q: '', a: [''] };
    App.render();
    const f = $('#main [data-armg-q]'); if (f) f.focus();
  },
  itemAct(act, id) {
    const { ch, un } = this.current();
    if (!ch) return;
    const list = this.scopeItems(ch, un ? un.id : '');
    const i = list.findIndex(it => it.id === id);
    if (i < 0) return;
    if (act === 'up' || act === 'down') {
      const j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      const ids = list.map(it => it.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      this.reorderItems(ids);
    } else if (act === 'edit') this.editItem(ch.id, id);
    else if (act === 'del') this.delItem(ch.id, id);
  },
  // 지금 보고 있는 범위(Chapter 또는 Unit) 안의 순서만 바꿈 (다른 Unit 문항 자리는 그대로)
  reorderItems(ids) {
    const { ch, un } = this.current();
    if (!ch) return;
    const c = this.chapter(ch.id);
    const scope = un ? un.id : '';
    const pos = [];
    c.items.forEach((it, k) => { if (this.uOf(c, it) === scope) pos.push(k); });
    const byId = new Map(c.items.map(it => [it.id, it]));
    const next = ids.map(x => byId.get(x)).filter(it => it && this.uOf(c, it) === scope);
    if (next.length !== pos.length) { App.render(); return; }
    if (next.every((it, k) => c.items[pos[k]].id === it.id)) { App.render(); return; }
    const items = c.items.slice();
    pos.forEach((p, k) => { items[p] = next[k]; });
    c.items = items;
    this.save(c);
    App.render();
  },
  async delItem(chId, id) {
    const c = this.chapter(chId);
    const it = c && c.items.find(x => x.id === id);
    if (!it) return;
    if (!await confirmDlg(`이 문항을 삭제할까요?\n${it.q} → ${it.a.join(' / ')}`, '삭제', true)) return;
    const c2 = this.chapter(chId);
    if (!c2) return;
    c2.items = c2.items.filter(x => x.id !== id);
    this.save(c2);
    App.render();
  },
  editItem(chId, id) {
    const c0 = this.chapter(chId);
    const it = c0 && c0.items.find(x => x.id === id);
    if (!it) return;
    const cat = c0.cat;
    const st = { a: it.a.slice(), ch: chId, u: this.uOf(c0, it) };
    if (!st.a.length) st.a = [''];
    const ansHtml = () => st.a.map((v, i) => `<div class="armg1738-ain"><input type="text" data-ea="${i}" value="${esc(v)}" placeholder="${i ? `답 ${i + 1} (선택)` : '답 (필수)'}" autocomplete="off">${i ? `<button type="button" class="btn sm ghost" data-eadel="${i}" title="이 답 칸 빼기">✕</button>` : ''}</div>`).join('');
    const unHtml = () => {
      const c = this.chapter(st.ch);
      if (!c || !c.units.length) { st.u = ''; return '<option value="">Unit 없음</option>'; }
      if (!c.units.some(u => u.id === st.u)) st.u = c.units[0].id;
      return c.units.map(u => `<option value="${esc(u.id)}"${u.id === st.u ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
    };
    const body = `<label class="pr-fld"><span>문제</span><input type="text" data-eq value="${esc(it.q)}" autocomplete="off"></label>
      <div class="pr-fld"><span>답</span><div class="armg1738-as armg1738-eas" data-eas>${ansHtml()}</div>
        <button type="button" class="btn sm" data-eamore style="margin-top:6px">+ 답</button></div>
      <div class="armg1738-mv"><label class="pr-fld"><span>Chapter</span><select data-ech>${this.chapters(cat).map(c => `<option value="${esc(c.id)}"${c.id === st.ch ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="pr-fld"><span>Unit</span><select data-eun>${unHtml()}</select></label></div>
      <p class="pr-hint">Chapter·Unit을 바꾸면 그곳의 맨 뒤로 옮겨져요.</p>`;
    Modal.open({
      title: '문항 수정', size: 'sm', body,
      onMount: (b) => {
        const syncA = () => { $$('[data-ea]', b).forEach(x => { st.a[+x.dataset.ea] = x.value; }); };
        b.addEventListener('click', (e) => {
          if (e.target.closest('[data-eamore]')) { syncA(); st.a.push(''); $('[data-eas]', b).innerHTML = ansHtml(); const l = $$('[data-ea]', b); l[l.length - 1].focus(); return; }
          const d = e.target.closest('[data-eadel]');
          if (d) { syncA(); st.a.splice(+d.dataset.eadel, 1); $('[data-eas]', b).innerHTML = ansHtml(); }
        });
        b.addEventListener('change', (e) => {
          if (e.target.matches('[data-ech]')) { st.ch = e.target.value; $('[data-eun]', b).innerHTML = unHtml(); }
          else if (e.target.matches('[data-eun]')) st.u = e.target.value;
        });
        b.addEventListener('input', (e) => { if (e.target.matches('[data-ea]')) st.a[+e.target.dataset.ea] = e.target.value; });
        b.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.isComposing && e.target.matches('input[type=text]')) { e.preventDefault(); const p = $('.mg-modal-foot [data-primary]', b.parentNode); if (p) p.click(); }
        });
      },
      buttons: [
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: async (m) => {
          const q = $('[data-eq]', m.body).value.trim();
          const as = st.a.map(x => String(x || '').trim()).filter(Boolean);
          if (!q) { toast('문제를 입력하세요.'); return false; }
          if (!as.length) { toast('답을 입력하세요.'); return false; }
          if (this.normQ(q) !== this.normQ(it.q)) {
            const dup = this.findDup(cat, q, id);
            if (dup.length && !await confirmDlg(`같은 문제가 이미 있습니다.\n${this.dupText(dup)}\n\n그래도 저장할까요?`, '저장')) return false;
          }
          const src = this.chapter(chId);
          const cur = src && src.items.find(x => x.id === id);
          if (!cur) { toast('이 문항이 이미 삭제되었습니다.'); return true; }
          const moved = st.ch !== chId || st.u !== this.uOf(src, cur);
          const rec = { id, q, a: as, u: st.u };
          if (st.ch === chId) {
            if (moved) { src.items = src.items.filter(x => x.id !== id); src.items.push(rec); }
            else src.items = src.items.map(x => x.id === id ? rec : x);
            this.save(src);
          } else {
            const dst = this.chapter(st.ch);
            if (!dst) { toast('옮길 Chapter가 없습니다.'); return false; }
            src.items = src.items.filter(x => x.id !== id);
            dst.items.push(rec);
            this.save(src); this.save(dst);
          }
          if (moved) toast(`${this.locName(this.chapter(st.ch), st.u)}(으)로 옮겼습니다`);
          App.render();
          return true;
        } },
      ],
    });
  },

  /* ---------- Chapter · Unit ---------- */
  // 이름 입력 창 → 이름 또는 null
  askName(title, label, value, check) {
    return new Promise(res => {
      let out = null;
      Modal.open({
        title, size: 'sm',
        body: `<label class="pr-fld"><span>${esc(label)}</span><input type="text" data-armg-nm value="${esc(value || '')}" maxlength="60" autocomplete="off"></label><p class="armg1738-err" data-armg-err></p>`,
        onMount: (b) => {
          const inp = $('[data-armg-nm]', b);
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const p = $('.mg-modal-foot [data-primary]', b.parentNode); if (p) p.click(); } });
          setTimeout(() => { inp.focus(); inp.select(); }, 40);
        },
        buttons: [
          { text: '취소' },
          { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
            const v = $('[data-armg-nm]', m.body).value.trim().replace(/\s+/g, ' ');
            const err = !v ? '이름을 입력하세요.' : check(v);
            if (err) { $('[data-armg-err]', m.body).textContent = err; return false; }
            out = v; return true;
          } },
        ],
        onClose: () => res(out),
      });
    });
  },
  // 순서 바꾸기 창 → id 배열 또는 null
  orderDlg(title, list) {
    return new Promise(res => {
      let out = null;
      const li = (x) => `<li data-oid="${esc(x.id)}"><span class="armg1738-hd" data-armg-handle title="끌어서 순서 바꾸기">⠿</span><span class="armg1738-on">${esc(x.name)}</span><small class="muted">${esc(x.sub || '')}</small><span style="flex:1"></span>
        <button type="button" class="btn sm ghost" data-om="-1" title="위로">▲</button><button type="button" class="btn sm ghost" data-om="1" title="아래로">▼</button></li>`;
      Modal.open({
        title, size: 'sm', autofocus: false,
        body: `<p class="pr-hint" style="margin:0 0 8px">▲▼ 또는 ⠿를 끌어서 순서를 바꾸고 저장하세요.</p><ul class="armg1738-ord" data-armg-ord>${list.map(li).join('')}</ul>`,
        onMount: (b) => {
          const ul = $('[data-armg-ord]', b);
          this.sortable(ul, 'li[data-oid]', () => {});
          ul.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-om]'); if (!btn) return;
            const it = btn.closest('li');
            if (btn.dataset.om === '-1') { if (it.previousElementSibling) it.previousElementSibling.before(it); }
            else if (it.nextElementSibling) it.nextElementSibling.after(it);
          });
        },
        buttons: [
          { text: '취소' },
          { text: '저장', cls: 'primary', primary: true, onClick: (m) => { out = $$('li[data-oid]', m.body).map(x => x.dataset.oid); return true; } },
        ],
        onClose: () => res(out),
      });
    });
  },
  async chAdd() {
    const cat = this.cat;
    const name = await this.askName(`${this.catName(cat)} · Chapter 추가`, 'Chapter 이름 (예: to부정사)', '',
      v => this.chapters(cat).some(c => c.name === v) ? '같은 이름의 Chapter가 이미 있습니다.' : '');
    if (!name) return;
    const chs = this.chapters(cat);
    const id = uid('ARMG1738');
    this.save({ id, kind: this.KIND, cat, name, ord: chs.reduce((m, c) => Math.max(m, c.ord), 0) + 1, units: [], items: [] });
    this.ui.ch[cat] = id;
    this.saveUi();
    App.render();
  },
  async chRename() {
    const { ch } = this.current();
    if (!ch) return;
    const name = await this.askName('Chapter 이름 변경', 'Chapter 이름', ch.name,
      v => this.chapters(ch.cat).some(c => c.id !== ch.id && c.name === v) ? '같은 이름의 Chapter가 이미 있습니다.' : '');
    if (!name || name === ch.name) return;
    const c = this.chapter(ch.id); if (!c) return;
    c.name = name; this.save(c);
    App.render();
  },
  async chOrder() {
    const chs = this.chapters(this.cat);
    if (chs.length < 2) return;
    const ids = await this.orderDlg(`${this.catName(this.cat)} · Chapter 순서`, chs.map(c => ({ id: c.id, name: c.name, sub: `${c.items.length}문항` })));
    if (!ids) return;
    ids.forEach((id, i) => {
      const c = this.chapter(id);
      if (c && c.ord !== i + 1) { c.ord = i + 1; this.save(c); }
    });
    App.render();
  },
  async chDel() {
    const { ch } = this.current();
    if (!ch) return;
    if (!await confirmDlg(`“${ch.name}” Chapter를 삭제할까요?\n` + (ch.units.length ? `Unit ${ch.units.length}개와 ` : '') + `문항 ${ch.items.length}개가 함께 삭제됩니다.`, '삭제', true)) return;
    Store.del('meta', ch.id);
    delete this.ui.un[ch.id];
    this.sel[ch.cat].forEach(k => { if (k === ch.id || k.startsWith(ch.id + '|')) this.sel[ch.cat].delete(k); });
    this.saveUi();
    App.render();
  },
  async unAdd() {
    const { ch } = this.current();
    if (!ch) return;
    const name = await this.askName(`${ch.name} · Unit 추가`, 'Unit 이름 (예: 명사적 용법)', '',
      v => ch.units.some(u => u.name === v) ? '같은 이름의 Unit이 이미 있습니다.' : '');
    if (!name) return;
    const c = this.chapter(ch.id); if (!c) return;
    const id = uid('u');
    // 첫 Unit: Unit이 생기면 문항은 Unit 안에만 둠 → 지금 문항을 새 Unit으로 옮김
    if (!c.units.length && c.items.length) {
      if (!await confirmDlg(`“${c.name}”에 있는 문항 ${c.items.length}개를 새 Unit “${name}”(으)로 옮깁니다.\n(Unit이 있는 Chapter는 문항을 Unit 안에만 둡니다)`, '옮기고 추가')) return;
      c.items.forEach(it => { it.u = id; });
    }
    const c2 = c;
    c2.units.push({ id, name });
    this.save(c2);
    this.ui.un[c2.id] = id;
    // 인쇄 범위: Chapter 전체를 골라 두었으면 새 Unit도 고른 것으로
    if (this.sel[c2.cat].has(c2.id)) { this.sel[c2.cat].delete(c2.id); this.sel[c2.cat].add(c2.id + '|' + id); }
    this.saveUi();
    App.render();
  },
  async unRename() {
    const { ch, un } = this.current();
    if (!ch || !un) return;
    const name = await this.askName('Unit 이름 변경', 'Unit 이름', un.name,
      v => ch.units.some(u => u.id !== un.id && u.name === v) ? '같은 이름의 Unit이 이미 있습니다.' : '');
    if (!name || name === un.name) return;
    const c = this.chapter(ch.id); if (!c) return;
    c.units = c.units.map(u => u.id === un.id ? { id: u.id, name } : u);
    this.save(c);
    App.render();
  },
  async unOrder() {
    const { ch } = this.current();
    if (!ch || ch.units.length < 2) return;
    const ids = await this.orderDlg(`${ch.name} · Unit 순서`, ch.units.map(u => ({ id: u.id, name: u.name, sub: `${this.scopeItems(ch, u.id).length}문항` })));
    if (!ids) return;
    const c = this.chapter(ch.id); if (!c) return;
    const byId = new Map(c.units.map(u => [u.id, u]));
    const next = ids.map(x => byId.get(x)).filter(Boolean);
    if (next.length !== c.units.length || next.every((u, i) => u.id === c.units[i].id)) return;
    // 첫 Unit이 바뀌면 Unit을 잃은 문항의 자리가 바뀌지 않게 먼저 지금 Unit을 적어 둠
    c.items.forEach(it => { it.u = this.uOf(c, it); });
    c.units = next;
    this.save(c);
    App.render();
  },
  async unDel() {
    const { ch, un } = this.current();
    if (!ch || !un) return;
    const n = this.scopeItems(ch, un.id).length;
    if (!await confirmDlg(`“${un.name}” Unit을 삭제할까요?` + (n ? `\n문항 ${n}개가 함께 삭제됩니다.` : ''), '삭제', true)) return;
    const c = this.chapter(ch.id); if (!c) return;
    c.items = c.items.filter(it => this.uOf(c, it) !== un.id).map(it => Object.assign(it, { u: this.uOf(c, it) }));
    c.units = c.units.filter(u => u.id !== un.id);
    if (!c.units.length) c.items.forEach(it => { it.u = ''; });
    this.save(c);
    delete this.ui.un[c.id];
    this.sel[c.cat].delete(c.id + '|' + un.id);
    this.saveUi();
    App.render();
  },

  /* ---------- 여러 줄 한 번에 등록 ---------- */
  // 한 줄 = 문제 [탭 또는 |] 답1 [탭 또는 |] 답2 …
  parseBulk(text, cat) {
    const ok = [], bad = [];
    const seen = new Map(), idx = this.dupIndex(cat);
    String(text || '').split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      const cells = line.split(/\t|\|/).map(x => x.trim().replace(/\s+/g, ' '));
      const q = cells[0] || '', as = cells.slice(1).filter(Boolean);
      if (!q) { bad.push({ no: i + 1, line, why: '문제가 없습니다' }); return; }
      if (!as.length) { bad.push({ no: i + 1, line, why: '답이 없습니다 (문제와 답 사이에 탭 또는 | 를 넣으세요)' }); return; }
      const k = this.normQ(q);
      const dupDb = idx.get(k) || [];
      const dupIn = seen.has(k) ? seen.get(k) : 0;
      if (!seen.has(k)) seen.set(k, i + 1);
      ok.push({ no: i + 1, q, a: as, dupDb, dupIn });
    });
    return { ok, bad };
  },
  openBulk() {
    const { ch, un } = this.current();
    if (!ch) { toast('먼저 Chapter를 만드세요.'); return; }
    const cat = this.cat, chId = ch.id, unId = un ? un.id : '';
    let res = { ok: [], bad: [] };
    const body = `<p class="small soft" style="margin:0 0 8px">등록할 곳: <b>${esc(this.catName(cat))} › ${esc(this.locName(ch, unId))}</b></p>
      <textarea data-bk rows="12" placeholder="한 줄에 한 문항씩&#10;문제 [탭 또는 |] 답 [탭 또는 |] 추가 답…&#10;&#10;keep + | 동명사&#10;be used to -ing | ~하는 데 익숙하다 | ~에 익숙하다" spellcheck="false"></textarea>
      <div class="armg1738-bkr" data-bkr></div>`;
    const sumHtml = () => {
      if (!res.ok.length && !res.bad.length) return '<p class="pr-hint">엑셀·메모장에서 복사해 붙여 넣어도 돼요 (칸 사이 탭 인식).</p>';
      const dups = res.ok.filter(x => x.dupDb.length || x.dupIn);
      let h = `<p class="armg1738-bks"><b>${res.ok.length}</b>문항 등록 가능` + (dups.length ? ` · <span class="armg1738-w">중복 ${dups.length}</span>` : '') + (res.bad.length ? ` · <span class="armg1738-e">오류 ${res.bad.length}줄</span>` : '') + '</p>';
      if (res.bad.length) h += `<div class="armg1738-bkl e">${res.bad.slice(0, 50).map(x => `<div><b>${x.no}번째 줄</b> ${esc(x.why)}: <span class="muted">${esc(x.line)}</span></div>`).join('')}</div><p class="pr-hint">오류가 있는 줄을 고쳐야 등록할 수 있어요.</p>`;
      if (dups.length) h += `<div class="armg1738-bkl w">${dups.slice(0, 50).map(x => `<div><b>${x.no}번째 줄</b> ${esc(x.q)} — ${x.dupIn ? `${x.dupIn}번째 줄과 같은 문제` : `이미 있음: ${esc(this.locName(x.dupDb[0].ch, this.uOf(x.dupDb[0].ch, x.dupDb[0].it)))}`}</div>`).join('')}</div>`;
      return h;
    };
    const commit = (skipDup) => {
      if (res.bad.length) { toast('오류가 있는 줄을 먼저 고치세요.'); return false; }
      const c = this.chapter(chId);
      if (!c) { toast('Chapter가 삭제되었습니다.'); return true; }
      if (unId && !c.units.some(u => u.id === unId)) { toast('Unit이 삭제되었습니다.'); return true; }
      const list = res.ok.filter(x => !(skipDup && (x.dupDb.length || x.dupIn)));
      if (!list.length) { toast('등록할 문항이 없습니다.'); return false; }
      list.forEach(x => c.items.push({ id: uid('i'), q: x.q, a: x.a, u: unId }));
      this.save(c);
      toast(`${list.length}문항을 등록했습니다`);
      App.render();
      return true;
    };
    let md = null;
    const paintBtns = () => {
      const dups = res.ok.some(x => x.dupDb.length || x.dupIn), blocked = !!res.bad.length || !res.ok.length;
      const [bSkip, bAll] = [$('[data-bk-skip]', md.foot), $('[data-bk-all]', md.foot)];
      bSkip.hidden = !dups; bSkip.disabled = blocked;
      bAll.textContent = dups ? '중복 포함해서 등록' : '등록'; bAll.disabled = blocked;
    };
    md = Modal.open({
      title: '여러 줄 한 번에 등록', size: 'lg', body,
      onMount: (b, m) => {
        md = m;
        const ta = $('[data-bk]', b), out = $('[data-bkr]', b);
        const upd = debounce(() => { res = this.parseBulk(ta.value, cat); out.innerHTML = sumHtml(); paintBtns(); }, 120);
        ta.addEventListener('input', upd);
        out.innerHTML = sumHtml();
      },
      buttons: [
        { text: '취소' },
        { text: '중복 빼고 등록', onClick: () => commit(true) },
        { text: '등록', cls: 'primary', primary: true, onClick: () => commit(false) },
      ],
    });
    const fb = $$('.btn', md.foot);
    fb[1].dataset.bkSkip = ''; fb[2].dataset.bkAll = '';
    paintBtns();
  },

  /* ---------- 끌어서 순서 바꾸기 (손잡이 ⠿ 를 잡을 때만) ---------- */
  sortable(list, itemSel, onDone) {
    let dragEl = null;
    list.addEventListener('mousedown', e => {
      const h = e.target.closest('[data-armg-handle]');
      const item = h && h.closest(itemSel);
      if (item) item.draggable = true;
    });
    list.addEventListener('mouseup', () => { $$(`${itemSel}[draggable="true"]`, list).forEach(el => { if (el !== dragEl) el.draggable = false; }); });
    list.addEventListener('dragstart', e => {
      const item = e.target.closest && e.target.closest(itemSel);
      if (!item || !item.draggable) return;
      dragEl = item;
      item.classList.add('armg1738-drag');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', ''); } catch (err) { /* 무시 */ }
    });
    list.addEventListener('dragover', e => {
      if (!dragEl) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const over = e.target.closest(itemSel);
      if (!over || over === dragEl || over.parentNode !== dragEl.parentNode) return;
      const r = over.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) { if (over.nextElementSibling !== dragEl) over.after(dragEl); }
      else if (over.previousElementSibling !== dragEl) over.before(dragEl);
    });
    list.addEventListener('drop', e => { if (dragEl) e.preventDefault(); });
    list.addEventListener('dragend', () => {
      if (!dragEl) return;
      dragEl.classList.remove('armg1738-drag');
      dragEl.draggable = false;
      dragEl = null;
      onDone($$(itemSel, list));
    });
  },

  /* =========================================================
     인쇄 창
     ========================================================= */
  // 인쇄 범위로 고를 수 있는 열쇠 (Unit 없는 Chapter = chId, Unit = chId|unitId)
  selKeys(ch) { return ch.units.length ? ch.units.map(u => ch.id + '|' + u.id) : [ch.id]; },
  cleanSel(cat) {
    const live = new Set();
    this.chapters(cat).forEach(ch => this.selKeys(ch).forEach(k => live.add(k)));
    [...this.sel[cat]].forEach(k => { if (!live.has(k)) this.sel[cat].delete(k); });
  },
  // 고른 범위의 문항 (Chapter 순 → Unit 순 → 문항 순)
  scopeAll(cat) {
    const out = [], s = this.sel[cat];
    this.chapters(cat).forEach(ch => {
      if (ch.units.length) ch.units.forEach(u => { if (s.has(ch.id + '|' + u.id)) this.scopeItems(ch, u.id).forEach(it => out.push(it)); });
      else if (s.has(ch.id)) ch.items.forEach(it => out.push(it));
    });
    return out;
  },
  // 랜덤 문항 수 → { n } 또는 { err }
  countOf(total) {
    if (this.set.order !== 'rand') return { n: total };
    const v = String(this.pr.count || '').trim();
    if (v === '') return { n: total };
    const n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
    if (n < 1 || n > total) return { err: `문항 수는 1에서 ${total} 사이로 입력하세요.` };
    return { n };
  },
  // 출제할 문항 → { items } 또는 { err }
  testItems() {
    const all = this.scopeAll(this.prCat);
    if (!all.length) return { err: '' };
    const c = this.countOf(all.length);
    if (c.err) return { err: c.err };
    if (this.set.order !== 'rand') return { items: all };
    const rnd = this.rng(this.seed), a = all.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return { items: a.slice(0, c.n) };
  },
  rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  // 고른 범위로 만든 제목: to부정사 - 명사적 용법, 부사적 용법 / 동명사
  autoTitle() {
    const s = this.sel[this.prCat], parts = [];
    this.chapters(this.prCat).forEach(ch => {
      if (!ch.units.length) { if (s.has(ch.id)) parts.push(ch.name); return; }
      const on = ch.units.filter(u => s.has(ch.id + '|' + u.id));
      if (!on.length) return;
      parts.push(on.length === ch.units.length ? ch.name : `${ch.name} - ${on.map(u => u.name).join(', ')}`);
    });
    if (!parts.length) return '';
    return parts.length > 3 ? `${parts[0]} 외 ${parts.length - 1}개` : parts.join(' / ');
  },
  titleText() { return String(this.pr.titleManual ? this.pr.title : this.autoTitle()).trim(); },
  logo() { const c = typeof Reports !== 'undefined' && Reports.cfg ? Reports.cfg() : null; return (c && c.logo) || ''; },

  openPrint() {
    const K = Prints.kit;
    this.loadSet();
    this.prCat = this.cat;
    if (!this.catCount('g') && !this.catCount('r')) { toast('인쇄할 문항이 없습니다. 먼저 문항을 입력하세요.'); return; }
    K.ensureAssets(); this.ensureCss();
    this.CATS.forEach(([c]) => this.cleanSel(c));
    // 처음 열 때: 지금 보고 있는 Chapter(Unit이 있으면 그 Unit)를 골라 둠
    if (!this.sel[this.prCat].size) {
      const { ch, un } = this.current();
      if (ch) (un ? [ch.id + '|' + un.id] : this.selKeys(ch)).forEach(k => this.sel[this.prCat].add(k));
    }
    this.pr.titleManual = false; this.pr.title = '';
    const rad = (name, val, cur, label) => `<label class="chk"><input type="radio" name="${name}" value="${val}" ${String(cur) === String(val) ? 'checked' : ''}>${label}</label>`;
    const hasLogo = !!this.logo();
    const body = `<div class="pr-wrap wx-pw armg1738-pw">
      <aside class="panel pr-side wx-pside">
        <div class="pr-sec"><h2>범위</h2>
          <div class="armg1738-radios" data-armg-cats>${this.CATS.map(([k, v]) => rad('armg-cat', k, this.prCat, `${v} <small class="muted">${this.catCount(k)}</small>`)).join('')}</div>
          <div class="wx-psbtn"><button type="button" class="btn sm" data-pa="all">전체 선택</button><button type="button" class="btn sm" data-pa="none">선택 해제</button></div>
          <div class="wx-pslist" data-armg-sel>${this.selHtml()}</div>
          <p class="pr-hint" data-armg-sum></p></div>
        <div class="pr-sec"><h2>출제 방식</h2>
          <div class="armg1738-radios">${rad('armg-ord', 'seq', this.set.order, '순서대로')}${rad('armg-ord', 'rand', this.set.order, '랜덤')}</div>
          <div class="pr-inline armg1738-cntrow" style="margin-top:8px">
            <input type="number" data-armg-cnt min="1" step="1" value="${esc(this.pr.count)}" placeholder="전체" aria-label="문항 수">
            <span class="small soft">문항</span>
            <button type="button" class="btn sm" data-pa="shuffle">다시 섞기</button></div>
          <p class="pr-hint" data-armg-ordhint></p></div>
        <div class="pr-sec"><h2>양식</h2>
          <div class="armg1738-radios">${rad('armg-cols', 1, this.set.cols, '1단 (쪽당 25문항)')}${rad('armg-cols', 2, this.set.cols, '2단 (쪽당 50문항)')}</div>
          <label class="pr-fld" style="margin-top:10px"><span>제목</span>
            <div class="pr-inline"><input type="text" data-armg-title value="${esc(this.titleText())}" maxlength="60" placeholder="시험 제목" autocomplete="off"><button type="button" class="btn sm" data-pa="title-auto" title="고른 범위로 다시 만들기">자동</button></div></label>
          <p class="pr-hint" data-armg-thint></p></div>
        <div class="pr-sec"><h2>글자</h2>
          <div class="armg1738-radios">${rad('armg-brand', 'text', this.set.brand, '학원명 글씨')}${rad('armg-brand', 'logo', this.set.brand, '로고')}</div>
          <label class="pr-fld" style="margin-top:8px" data-armg-acwrap><span>학원명</span><input type="text" data-armg-ac value="${esc(K.academy())}" placeholder="학원명을 입력하세요" maxlength="40" autocomplete="off"></label>
          <p class="pr-hint" data-armg-bhint>${hasLogo ? '로고는 학생 › Report › 설정의 로고를 써요.' : '로고가 없어요. 학생 › Report › 설정에서 로고를 올리면 쓸 수 있어요. (없으면 학원명 글씨로 나와요)'}</p>
          <label class="pr-fld"><span>날짜 (선택)</span>
            <div class="pr-inline"><input type="date" data-armg-date value="${esc(this.pr.date)}" aria-label="날짜"><button type="button" class="btn sm" data-pa="date-clear">지우기</button></div></label>
          <p class="pr-hint">비워 두면 날짜 칸이 빈 줄로 나와요.</p></div>
        <div class="pr-sec"><h2>학생 이름</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="학생 이름 넣는 방식">
            <label class="chk"><input type="radio" name="armg-nm-mode" value="manual" ${this.pick.mode === 'class' ? '' : 'checked'}>직접 입력</label>
            <label class="chk"><input type="radio" name="armg-nm-mode" value="class" ${this.pick.mode === 'class' ? 'checked' : ''}>반에서 선택</label>
          </div>
          <div data-armg-nmbody>${this.nmBodyHtml()}</div></div>
        <div class="pr-sec"><h2>출력</h2>
          <div class="armg1738-radios col">${rad('armg-out', 'both', this.set.out, '문제지 + 답지')}${rad('armg-out', 'test', this.set.out, '문제지만')}${rad('armg-out', 'key', this.set.out, '답지만 (암기용)')}</div>
          <div class="pr-fld" style="margin-top:10px" data-armg-kfwrap><span>답지 양식</span>
            <div class="armg1738-radios col">${rad('armg-kf', 'a', this.set.keyForm, '(가) 시험지 양식에 답 채움')}${rad('armg-kf', 'b', this.set.keyForm, '(나) 문제·답 목록형 (쪽당 40문항)')}</div></div>
          <label class="chk pr-chk"><input type="checkbox" data-armg-duplex ${this.set.duplex ? 'checked' : ''}>양면 프린터 사용</label>
          <p class="pr-hint" data-armg-dxhint>${this.dxHint()}</p>
          <div class="pr-print" style="margin-top:10px">
            <input type="number" data-armg-copies min="1" max="500" step="1" value="${esc(this.pr.copies)}" placeholder="부수" aria-label="출력 부수"${this.pick.mode === 'class' ? ' disabled' : ''}>
            <button type="button" class="btn primary" data-pa="print" data-armg-printbtn>${this.printLabel()}</button>
          </div>
          <div class="pr-note">인쇄창에서 배율은 <b>기본값(100%)</b>으로 두세요. 양면 프린터를 사용할 땐 인쇄창의 <b>양면 인쇄</b>도 켜져 있어야 해요.</div></div>
      </aside>
      <section class="wx-pview" data-armg-prev></section>
    </div>`;
    Modal.open({
      title: '암기장 시험지 인쇄', size: 'xl wx-pmodal', body, autofocus: false,
      onMount: (b, md) => {
        const upd = debounce(() => this.prevBuild(b, md), 150);
        const syncIndet = () => $$('[data-indet]', b).forEach(x => { x.indeterminate = true; });
        const syncTitle = () => { const t = $('[data-armg-title]', b); if (!this.pr.titleManual && t) t.value = this.autoTitle(); $('[data-armg-thint]', b).textContent = this.pr.titleManual ? '직접 고친 제목이에요. “자동”을 누르면 고른 범위로 다시 만들어요.' : '고른 범위로 자동으로 만들어요. 고쳐 쓸 수 있어요.'; };
        const syncOpts = () => {
          const rand = this.set.order === 'rand';
          const total = this.scopeAll(this.prCat).length;
          const cnt = $('[data-armg-cnt]', b);
          cnt.disabled = !rand; cnt.max = String(Math.max(1, total)); cnt.placeholder = rand ? `전체 ${total}` : '전체';
          $('[data-pa="shuffle"]', b).disabled = !rand;
          $('[data-armg-ordhint]', b).textContent = rand ? `범위 문항 ${total}개 중 몇 개를 낼지 정해요 (비우면 전체). 모든 부가 같은 시험지예요.` : '순서대로는 늘 범위의 모든 문항을 Chapter → Unit → 문항 순으로 내요.';
          $('[data-armg-kfwrap]', b).classList.toggle('is-off', this.set.out === 'test');
          $$('[name="armg-kf"]', b).forEach(x => { x.disabled = this.set.out === 'test'; });
          $('[data-armg-acwrap]', b).classList.toggle('is-off', this.set.brand === 'logo' && !!this.logo());
        };
        const refreshSel = () => {
          const box = $('[data-armg-sel]', b), top = box.scrollTop;
          box.innerHTML = this.selHtml(); box.scrollTop = top;
          syncIndet(); syncTitle(); syncOpts(); upd();
        };
        const refreshNm = (listToo) => {
          if (listToo) { const l = $('[data-armg-list]', b); if (l) { const bx = $('.pr-nm-stus', l), t = bx ? bx.scrollTop : 0; l.innerHTML = this.nmListHtml(); const nb = $('.pr-nm-stus', l); if (nb) nb.scrollTop = t; } }
          const p = $('[data-armg-picked]', b); if (p) p.innerHTML = this.nmPickedHtml();
          syncIndet();
          $('[data-armg-printbtn]', b).textContent = this.printLabel();
          $('[data-armg-copies]', b).disabled = this.pick.mode === 'class';
          upd();
        };
        syncIndet(); syncTitle(); syncOpts();
        b.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-asu]');
          if (chip) { const k = chip.dataset.asu, s = this.sel[this.prCat]; if (s.has(k)) s.delete(k); else s.add(k); refreshSel(); return; }
          const bt = e.target.closest('[data-pa]'); if (!bt || bt.disabled) return;
          const a = bt.dataset.pa;
          if (a === 'all') { this.chapters(this.prCat).forEach(ch => this.selKeys(ch).forEach(k => this.sel[this.prCat].add(k))); refreshSel(); }
          else if (a === 'none') { this.sel[this.prCat].clear(); refreshSel(); }
          else if (a === 'shuffle') { this.seed = (this.seed * 7919 + 104729) % 2147483647 || 1; upd(); }
          else if (a === 'title-auto') { this.pr.titleManual = false; this.pr.title = ''; syncTitle(); upd(); }
          else if (a === 'date-clear') { this.pr.date = ''; $('[data-armg-date]', b).value = ''; upd(); }
          else if (a === 'nm-clear') { this.pick.sel = []; refreshNm(true); }
          else if (a === 'print') this.doPrint(b);
        });
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-armg-ac]')) { K.setAcademy(t.value); upd(); }
          else if (t.matches('[data-armg-date]')) { this.pr.date = isYmd(t.value) ? t.value : ''; upd(); }
          else if (t.matches('[data-armg-name]')) { this.pr.name = t.value; upd(); }
          else if (t.matches('[data-armg-copies]')) this.pr.copies = t.value;
          else if (t.matches('[data-armg-cnt]')) { this.pr.count = t.value; upd(); }
          else if (t.matches('[data-armg-title]')) { this.pr.title = t.value; this.pr.titleManual = true; $('[data-armg-thint]', b).textContent = '직접 고친 제목이에요. “자동”을 누르면 고른 범위로 다시 만들어요.'; upd(); }
        });
        b.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-asc]')) {
            const ch = this.chapter(t.dataset.asc);
            if (ch) this.selKeys(ch).forEach(k => { if (t.checked) this.sel[this.prCat].add(k); else this.sel[this.prCat].delete(k); });
            refreshSel();
          } else if (t.matches('[name="armg-cat"]')) {
            if (!t.checked) return;
            this.prCat = t.value === 'r' ? 'r' : 'g';
            this.pr.count = ''; $('[data-armg-cnt]', b).value = '';
            refreshSel();
          } else if (t.matches('[name="armg-ord"]')) {
            if (!t.checked) return;
            this.set.order = t.value === 'rand' ? 'rand' : 'seq'; this.saveSet(); syncOpts(); upd();
          } else if (t.matches('[name="armg-cols"]')) {
            if (!t.checked) return;
            this.set.cols = t.value === '2' ? 2 : 1; this.saveSet(); upd();
          } else if (t.matches('[name="armg-brand"]')) {
            if (!t.checked) return;
            this.set.brand = t.value === 'logo' ? 'logo' : 'text'; this.saveSet(); syncOpts(); upd();
          } else if (t.matches('[name="armg-out"]')) {
            if (!t.checked) return;
            this.set.out = ['both', 'test', 'key'].includes(t.value) ? t.value : 'both'; this.saveSet(); syncOpts(); upd();
          } else if (t.matches('[name="armg-kf"]')) {
            if (!t.checked) return;
            this.set.keyForm = t.value === 'b' ? 'b' : 'a'; this.saveSet(); upd();
          } else if (t.matches('[data-armg-duplex]')) {
            this.set.duplex = t.checked; this.saveSet();
            $('[data-armg-dxhint]', b).textContent = this.dxHint(); upd();
          } else if (t.matches('[name="armg-nm-mode"]')) {
            if (!t.checked) return;
            this.pick.mode = t.value === 'class' ? 'class' : 'manual';
            $('[data-armg-nmbody]', b).innerHTML = this.nmBodyHtml(); refreshNm(false);
          } else if (t.matches('[data-armg-class]')) {
            this.pick.classId = t.value;
            const l = $('[data-armg-list]', b); if (l) l.innerHTML = '';
            refreshNm(true);
          } else if (t.matches('[data-armg-all]')) {
            this.nmToggle(K.roster(this.pick.classId).map(s => s.id), t.checked); refreshNm(true);
          } else if (t.matches('[data-armg-stu]')) {
            this.nmToggle([t.dataset.armgStu], t.checked); refreshNm(true);
          }
        });
        this.prevBuild(b, md);
      },
      onClose: () => { this._tok++; },
      buttons: [{ text: '닫기' }],
    });
  },
  dxHint() {
    return this.set.duplex ? '홀수 쪽으로 끝나는 문제지·답지 뒤에 빈 면을 넣어, 문제지와 답지, 학생과 학생이 한 장에 붙지 않아요.' : '단면 프린터용: 빈 면 없이 차례대로 인쇄해요. 답지는 늘 새 쪽에서 시작해요.';
  },
  printLabel() { const n = this.pickStudents().length; return this.pick.mode === 'class' ? `인쇄 / PDF (${n}명)` : '인쇄 / PDF'; },

  // 범위 고르기: Chapter 체크 + Unit 칩
  selHtml() {
    const chs = this.chapters(this.prCat), s = this.sel[this.prCat];
    if (!chs.length) return `<div class="none small muted" style="padding:10px 0">${this.catName(this.prCat)}에 Chapter가 없어요.</div>`;
    return chs.map(ch => {
      const keys = this.selKeys(ch), on = keys.filter(k => s.has(k)).length;
      const head = `<label class="chk wx-psmh"><input type="checkbox" data-asc="${esc(ch.id)}" ${on === keys.length ? 'checked' : ''}${on && on < keys.length ? ' data-indet' : ''}>
        <b>${esc(ch.name)}</b><small class="armg1738-cnt">${ch.items.length}문항</small></label>`;
      if (!ch.units.length) return `<div class="wx-psm">${head}</div>`;
      return `<div class="wx-psm">${head}<div class="np-chips">${ch.units.map(u => {
        const k = ch.id + '|' + u.id;
        return `<button type="button" class="np-c sm ${s.has(k) ? 'on' : ''}" data-asu="${esc(k)}">${esc(u.name)}<small class="wx-cnt">${this.scopeItems(ch, u.id).length}</small></button>`;
      }).join('')}</div></div>`;
    }).join('');
  },

  /* ---------- 학생 이름 (표지+양식 · 삽입 · 순서와 같은 방식) ---------- */
  pickStudents() { return this.pick.sel.map(id => Store.get('students', id)).filter(Boolean); },
  nmBodyHtml() {
    const K = Prints.kit;
    if (this.pick.mode !== 'class') return `<label class="pr-fld"><span>학생 이름</span><input type="text" data-armg-name value="${esc(this.pr.name)}" placeholder="비워 두면 빈 줄로 나와요" maxlength="20" autocomplete="off"></label>`;
    const cls = K.classes();
    if (this.pick.classId && !cls.some(c => c.id === this.pick.classId)) this.pick.classId = '';
    return `<label class="pr-fld"><span>반</span>
        <select data-armg-class><option value="">반을 고르세요</option>
          ${cls.map(c => `<option value="${esc(c.id)}"${c.id === this.pick.classId ? ' selected' : ''}>${esc(c.name)} (${K.roster(c.id).length}명)</option>`).join('')}</select></label>
      <div class="pr-nm-list" data-armg-list>${this.nmListHtml()}</div>
      <div class="pr-nm-picked" data-armg-picked>${this.nmPickedHtml()}</div>
      <p class="pr-hint">다른 반을 골라도 체크한 학생은 그대로 남아요. 고른 학생마다 한 부씩, 이름만 바뀌어 인쇄돼요.</p>`;
  },
  nmListHtml() {
    if (!this.pick.classId) return '<div class="none">반을 고르면 학생 목록이 나와요.</div>';
    const ros = Prints.kit.roster(this.pick.classId);
    if (!ros.length) return '<div class="none">이 반에는 재원생이 없어요.</div>';
    const on = new Set(this.pick.sel);
    const all = ros.every(s => on.has(s.id)), some = ros.some(s => on.has(s.id));
    return `<label class="chk pr-nm-all"><input type="checkbox" data-armg-all ${all ? 'checked' : ''}${!all && some ? ' data-indet' : ''}>반 전체 선택</label>
      <div class="pr-nm-stus">${ros.map(s => `<label class="chk"><input type="checkbox" data-armg-stu="${esc(s.id)}" ${on.has(s.id) ? 'checked' : ''}>${esc(s.name)}${stTag(s) ? ` <small>${esc(stTag(s))}</small>` : ''}</label>`).join('')}</div>`;
  },
  nmPickedHtml() {
    const list = this.pickStudents();
    if (!list.length) return '<span class="none">고른 학생: 없음</span>';
    return `<div class="pr-nm-ph"><b>고른 학생 ${list.length}명</b><button type="button" class="btn sm" data-pa="nm-clear">모두 해제</button></div>
      <div class="pr-nm-names">${list.map(s => esc(s.name)).join(', ')}</div>`;
  },
  nmToggle(ids, on) {
    const cur = new Set(this.pick.sel);
    ids.forEach(id => {
      if (on && !cur.has(id)) { this.pick.sel.push(id); cur.add(id); }
      else if (!on && cur.has(id)) cur.delete(id);
    });
    if (!on) this.pick.sel = this.pick.sel.filter(id => cur.has(id));
  },

  /* =========================================================
     종이
     ========================================================= */
  // 머리글: 표지+양식 › 시험지·노트와 같은 모양 (학원명/로고 · 날짜 · 이름) + 점수, 그 아래 제목 줄
  headHtml(nm, o) {
    const K = Prints.kit, dt = K.dateText(this.pr.date), n = String(nm || '').trim();
    const useLogo = this.set.brand === 'logo' && !!this.logo();
    const brand = useLogo ? '<div class="pn-academy armg1738-brand"><div class="armg1738-logo"></div></div>' : `<div class="pn-academy armg1738-brand">${esc(K.academy())}</div>`;
    return `<div class="pn-head armg1738-head">${brand}<div class="pn-fields">
        <span class="pn-field">날짜<span class="pn-blank${dt ? ' pn-val' : ''}" style="width:26mm">${esc(dt)}</span></span>
        <span class="pn-field">이름<span class="pn-blank${n ? ' pn-val' : ''}" style="width:30mm">${esc(n)}</span></span>
        <span class="pn-field">점수<span class="pn-blank armg1738-score" style="width:22mm">/ ${o.total}</span></span>
      </div></div>
      <div class="armg1738-tt"><span class="pn-tag">${esc(o.tag)}</span><b class="armg1738-ttl" style="font-size:${o.tfs}pt">${esc(o.title)}</b><span class="armg1738-pg">${o.pages > 1 ? `${o.page} / ${o.pages}` : ''}</span></div>`;
  },
  cellHtml(cls, text) { return `<td class="${cls}"><div class="c">${text ? esc(text) : ''}</div></td>`; },
  // 시험지 · 답지(가) 한 쪽 표
  gridHtml(items, base, w, key) {
    const cols = this.set.cols, per = this.ROWS * cols;
    const colg = `<col style="width:${w.no}mm"><col style="width:${w.q.toFixed(2)}mm"><col style="width:${w.a.toFixed(2)}mm">`;
    const side = (k, mid) => {
      const i = base + k, it = items[i];
      const nc = 'no' + (mid ? ' mid' : '');
      if (!it || k >= per) return `<td class="${nc}"><div class="c"></div></td>${this.cellHtml('q', '')}${this.cellHtml('a', '')}`;
      return `<td class="${nc}"><div class="c">${i + 1}</div></td>${this.cellHtml('q', it.q)}${this.cellHtml('a' + (key ? ' k' : ''), key ? it.a.join(' / ') : '')}`;
    };
    let rows = '';
    for (let r = 0; r < this.ROWS; r++) rows += `<tr class="d">${side(r)}${cols === 2 ? side(r + this.ROWS, true) : ''}</tr>`;
    const th = `<th class="no">번호</th><th>문제</th><th>답</th>`;
    return `<div class="armg1738-body"><table class="armg1738-tbl" style="--rh:${this.ROW_H}mm">
      <colgroup>${colg}${cols === 2 ? colg : ''}</colgroup>
      <tr class="h">${th}${cols === 2 ? th.replace('class="no"', 'class="no mid"') : ''}</tr>${rows}</table></div>`;
  },
  // 답지(나) 목록형 한 쪽
  listHtml(items, base, w) {
    let rows = '';
    for (let r = 0; r < this.LIST_ROWS; r++) {
      const i = base + r, it = items[i];
      rows += it ? `<tr class="d"><td class="no"><div class="c">${i + 1}</div></td>${this.cellHtml('q', it.q)}${this.cellHtml('a k', it.a.join(' / '))}</tr>`
        : '<tr class="d e"><td class="no"><div class="c"></div></td><td class="q"><div class="c"></div></td><td class="a"><div class="c"></div></td></tr>';
    }
    return `<div class="armg1738-body"><table class="armg1738-list" style="--rh:${this.LIST_ROW_H}mm">
      <colgroup><col style="width:${w.no}mm"><col style="width:${w.q.toFixed(2)}mm"><col style="width:${w.a.toFixed(2)}mm"></colgroup>${rows}</table></div>`;
  },
  // 글꼴이 다 온 뒤에 재야 글자 맞춤이 인쇄와 같아진다
  async fontsReady() {
    const ln = document.getElementById('pr-paper-font');
    if (ln && !ln.sheet) await new Promise(r => { ln.addEventListener('load', r, { once: true }); ln.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
    if (!document.fonts || !document.fonts.load) return;
    const fs = ['16px "Gowun Dodum"', '700 16px "Gowun Batang"'];
    await Promise.race([Promise.all(fs.map(f => document.fonts.load(f).catch(() => null))), new Promise(r => setTimeout(r, 4000))]);
  },
  // 칸 너비: 가장 긴 문제 글자에 맞추되, 문제 칸은 (번호 뺀 너비의) 35~60%
  widths(host, items, avail, noW, fontPt) {
    const MM = Prints.kit.MM_PER_PX;
    const m = document.createElement('span');
    m.style.cssText = `position:absolute;white-space:nowrap;font-family:"Gowun Dodum","Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:${fontPt}pt`;
    host.appendChild(m);
    let mx = 0;
    items.forEach(it => { m.textContent = it.q; mx = Math.max(mx, m.getBoundingClientRect().width * MM); });
    m.remove();
    const room = avail - noW;
    const q = Math.min(room * 0.6, Math.max(room * 0.35, mx + 4.5));
    return { no: noW, q, a: room - q };
  },
  // 긴 글: 글자를 줄여 한 줄에 맞추고, 그래도 넘치면 두 줄로 (줄 수는 그대로)
  fitCells(root, base) {
    $$('td.q .c, td.a .c', root).forEach(c => {
      if (!c.textContent) return;
      let fs = base;
      c.style.fontSize = fs + 'pt';
      while (c.scrollWidth > c.clientWidth + 0.5 && fs > 7.5) { fs -= 0.5; c.style.fontSize = fs + 'pt'; }
      if (c.scrollWidth <= c.clientWidth + 0.5) return;
      c.classList.add('two');
      fs = Math.min(base, 9.5);
      c.style.fontSize = fs + 'pt';
      while (c.scrollHeight > c.clientHeight + 0.5 && fs > 6) { fs -= 0.5; c.style.fontSize = fs + 'pt'; }
      if (c.scrollHeight <= c.clientHeight + 0.5) return;
      // 아주 긴 글(답이 여러 개 등): 세 줄로 — 답이 잘리지 않게
      c.classList.remove('two'); c.classList.add('three');
      fs = Math.min(base, 7);
      c.style.fontSize = fs + 'pt';
      while (c.scrollHeight > c.clientHeight + 0.5 && fs > 4.5) { fs -= 0.5; c.style.fontSize = fs + 'pt'; }
    });
  },
  // 쪽 만들기 (화면 밖에 실제 크기로 그려서 글자를 맞춘다) → { test:[본문], key:[본문], n, tfs }
  async paginate(items, title) {
    const cols = this.set.cols, kf = this.set.keyForm;
    const key = JSON.stringify([cols, kf, title, items.map(it => [it.id, it.q, it.a])]);
    if (this._cache && this._cache.key === key) return this._cache;
    await this.fontsReady();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;z-index:-1';
    document.body.appendChild(host);
    try {
      const n = items.length, per = this.ROWS * cols;
      const nT = Math.max(1, Math.ceil(n / per));
      const side = cols === 2 ? this.INNER_W / 2 : this.INNER_W;
      const base = cols === 2 ? 11 : 12.5;
      const w = this.widths(host, items, side, cols === 2 ? 8 : 11, base);
      const o = { tag: '문제지', title, tfs: 15, page: 1, pages: 1, total: n };
      // 제목 글자 크기
      host.innerHTML = `<div class="pn-sheet armg1738-sheet">${this.headHtml('', o)}</div>`;
      const tt = $('.armg1738-ttl', host);
      let tfs = 15;
      while (tt.scrollWidth > tt.clientWidth + 0.5 && tfs > 9) { tfs -= 0.5; tt.style.fontSize = tfs + 'pt'; }
      o.tfs = tfs;
      const make = (html, fs) => {
        host.innerHTML = `<div class="pn-sheet armg1738-sheet">${this.headHtml('', o)}${html}</div>`;
        this.fitCells($('.armg1738-body', host), fs);
        return $('.armg1738-body', host).outerHTML;
      };
      const test = [], keyP = [];
      for (let p = 0; p < nT; p++) test.push(make(this.gridHtml(items, p * per, w, false), base));
      if (kf === 'a') {
        for (let p = 0; p < nT; p++) keyP.push(make(this.gridHtml(items, p * per, w, true), base));
      } else {
        const wl = this.widths(host, items, this.INNER_W, 11, 10.5);
        wl.q = Math.min(wl.q, (this.INNER_W - 11) * 0.55); wl.a = this.INNER_W - 11 - wl.q;
        const nK = Math.max(1, Math.ceil(n / this.LIST_ROWS));
        for (let p = 0; p < nK; p++) keyP.push(make(this.listHtml(items, p * this.LIST_ROWS, wl), 10.5));
      }
      this._cache = { key, test, key2: keyP, n, tfs };
      return this._cache;
    } finally { host.remove(); }
  },
  // 한 부 → [{ html, cap, blank }]
  //  문제지 (+빈 면) + 답지 (+빈 면): 양면 프린터에서 문제지와 답지, 다음 부가 한 장에 붙지 않게
  copyPages(pg, nm, title) {
    const blank = { html: '<div class="pn-sheet"></div>', cap: '빈 면 (양면 인쇄용)', blank: true };
    const out = [], out2 = this.set.out;
    const add = (list, tag, cls) => {
      list.forEach((b, i) => out.push({ html: `<div class="pn-sheet armg1738-sheet ${cls}">${this.headHtml(nm, { tag, title, tfs: pg.tfs, page: i + 1, pages: list.length, total: pg.n })}${b}</div>`, cap: `${tag} ${i + 1}/${list.length}` }));
      if (this.set.duplex && list.length % 2) out.push(blank);
    };
    if (out2 !== 'key') add(pg.test, '문제지', 'armg1738-test');
    if (out2 !== 'test') add(pg.key2, '답지', 'armg1738-key');
    return out;
  },
  logoCss() {
    const lg = this.set.brand === 'logo' ? this.logo() : '';
    return lg ? `.pn-sheet .armg1738-logo{background-image:url("${String(lg).replace(/["\\\n\r]/g, '')}")}` : '';
  },
  // 미리보기: 한 부 (반에서 선택이면 첫 학생 이름)
  async prevBuild(b, md) {
    const tok = ++this._tok;
    const pv = $('[data-armg-prev]', b), sm = $('[data-armg-sum]', b);
    const all = this.scopeAll(this.prCat);
    sm.textContent = all.length ? `고른 문항 ${all.length}개` : '고른 문항: 없음';
    const r = this.testItems();
    if (!r.items) {
      pv.innerHTML = `<div class="wx-pv-empty">${r.err ? esc(r.err) : '왼쪽 범위에서 출제할 Chapter·Unit을 고르세요.'}</div>`;
      return;
    }
    if (!pv.children.length || $('.wx-pv-empty', pv)) pv.innerHTML = '<div class="wx-pv-empty">미리보기를 만드는 중…</div>';
    let lst = document.getElementById('armg1738-logo-css');
    if (!lst) { lst = document.createElement('style'); lst.id = 'armg1738-logo-css'; document.head.appendChild(lst); }
    lst.textContent = this.logoCss();
    const title = this.titleText();
    const pg = await this.paginate(r.items, title);
    if (tok !== this._tok || md.closed) return;
    const nm = this.pick.mode === 'class' ? ((this.pickStudents()[0] || {}).name || '') : this.pr.name;
    const pages = this.copyPages(pg, nm, title).filter(p => !p.blank);      // 빈 면은 인쇄할 때만 넣고 미리보기에는 보이지 않음
    const parts = [];
    if (this.set.out !== 'key') parts.push(`문제지 ${pg.test.length}쪽`);
    if (this.set.out !== 'test') parts.push(`답지 ${pg.key2.length}쪽`);
    sm.textContent = `고른 문항 ${all.length}개 → ${pg.n}문항 출제 · ${parts.join(' + ')}`;
    const K = Prints.kit, s = 0.36;
    pv.innerHTML = `<div class="wx-pv-h">미리보기 · 한 부${nm ? ` (${esc(nm)})` : ''} · 누르면 크게 보기</div><div class="wx-pv-grid">${pages.map((p, i) => `<figure class="wx-th armg1738-th" data-armg-big="${i}">
        <div class="wx-thb" style="width:${(K.PAGE_W * s).toFixed(1)}px;height:${(K.PAGE_H * s).toFixed(1)}px"><div style="transform:scale(${s});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div>
        <figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div>`;
    pv.onclick = (e) => {
      const f = e.target.closest('[data-armg-big]'); if (!f) return;
      const p = pages[+f.dataset.armgBig]; if (!p) return;
      const z = Math.min(1, (window.innerWidth * 0.9) / K.PAGE_W);
      Modal.open({ title: p.cap, size: 'xl', autofocus: false,
        body: `<div style="overflow:auto;max-height:calc(100vh - 160px)"><div class="wx-thb" style="width:${(K.PAGE_W * z).toFixed(1)}px;height:${(K.PAGE_H * z).toFixed(1)}px;margin:0 auto"><div style="transform:scale(${z});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div></div>`,
        buttons: [{ text: '닫기', cls: 'primary', primary: true }] });
    };
  },
  // 인쇄할 쪽들 (한 부씩 이어 붙임) → html 또는 null
  async printHtml(b) {
    const r = this.testItems();
    if (!r.items) { toast(r.err || '출제할 Chapter·Unit을 고르세요.'); return null; }
    let names;
    if (this.pick.mode === 'class') {
      const list = this.pickStudents();
      if (!list.length) { toast('인쇄할 학생을 선택하세요.'); return null; }
      names = list.map(s => s.name);
    } else {
      const inp = $('[data-armg-copies]', b), v = String(inp.value || '').trim();
      if (v === '') { toast('출력 부수를 입력하세요.'); inp.focus(); return null; }
      const n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
      if (n < 1 || n > 500) { toast('출력 부수는 1에서 500 사이로 입력하세요.'); inp.focus(); return null; }
      names = Array.from({ length: n }, () => this.pr.name);
    }
    const title = this.titleText();
    const pg = await this.paginate(r.items, title);
    return names.map(nm => this.copyPages(pg, nm, title).map(p => p.html).join('')).join('');
  },
  async doPrint(b) {
    const html = await this.printHtml(b);
    if (!html) return;
    const t = this.titleText().replace(/[\\/:*?"<>|]/g, ' ').trim();
    Prints.kit.printPaper(html, `암기장_${t || this.catName(this.prCat)}_${todayStr()}`, this.PAPER_CSS + this.logoCss());
  },

  /* ---------- 종이 CSS (표지+양식의 .pn-sheet 위에 더함 · 테마와 상관없이 고정) ---------- */
  PAPER_CSS: `
.pn-sheet .armg1738-brand{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:4mm}
.pn-sheet .armg1738-logo{height:9.5mm;width:62mm;background-repeat:no-repeat;background-position:left bottom;background-size:contain;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pn-sheet .armg1738-head .pn-fields{flex:none;gap:5mm}
.pn-sheet .armg1738-score{text-align:right;color:var(--pn-ink);font-weight:700;line-height:5mm;padding-right:1mm;white-space:nowrap}
.pn-sheet .armg1738-tt{height:9mm;flex-shrink:0;display:flex;align-items:center;gap:3mm;margin:0 0 3mm}
.pn-sheet .armg1738-tt .pn-tag{flex:none}
.pn-sheet .armg1738-ttl{flex:1;min-width:0;white-space:nowrap;overflow:hidden;font-family:"Gowun Batang",serif;font-weight:700;color:#1f272d;text-align:center}
.pn-sheet .armg1738-pg{flex:none;min-width:14mm;text-align:right;font-size:10pt;color:var(--pn-ink-soft)}
.pn-sheet .armg1738-body{flex:1;min-height:0}
.pn-sheet .armg1738-tbl,.pn-sheet .armg1738-list{width:100%;border-collapse:collapse;table-layout:fixed;color:#1f272d}
.pn-sheet .armg1738-tbl{border:0.4mm solid #39434a}
.pn-sheet .armg1738-tbl th{height:7mm;font-size:9.5pt;font-weight:700;background:#eef2f4;color:#3d4950;text-align:center;border:0.2mm solid #9aa6af;border-bottom:0.35mm solid #39434a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pn-sheet .armg1738-tbl td{height:var(--rh);border:0.2mm solid #b6c0c8;padding:0 1.6mm;vertical-align:middle;overflow:hidden}
.pn-sheet .armg1738-tbl .mid{border-left:0.45mm solid #39434a}
.pn-sheet .armg1738-tbl td.no,.pn-sheet .armg1738-list td.no{text-align:center;color:#5f6c74;padding:0 0.5mm}
.pn-sheet .armg1738-tbl td.no .c,.pn-sheet .armg1738-list td.no .c{font-size:9.5pt}
.pn-sheet .armg1738-tbl td.no{background:#f6f8f9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pn-sheet .armg1738-body .c{height:calc(var(--rh) - 0.4mm);line-height:calc(var(--rh) - 0.4mm);white-space:nowrap;overflow:hidden}
.pn-sheet .armg1738-body .c.two{white-space:normal;word-break:keep-all;overflow-wrap:anywhere;line-height:calc((var(--rh) - 0.4mm) / 2)}
.pn-sheet .armg1738-body .c.three{white-space:normal;word-break:keep-all;overflow-wrap:anywhere;line-height:calc((var(--rh) - 0.4mm) / 3)}
.pn-sheet .armg1738-body td.k .c{font-weight:700;color:#17437a}
.pn-sheet .armg1738-list{border-top:0.4mm solid #39434a;border-bottom:0.4mm solid #39434a}
.pn-sheet .armg1738-list td{height:var(--rh);border-bottom:0.2mm solid #c9d1d7;padding:0 1.6mm;vertical-align:middle;overflow:hidden}
.pn-sheet .armg1738-list td.q{border-right:0.2mm dashed #c9d1d7}
.pn-sheet .armg1738-list tr.e td{border-bottom-color:transparent}
`,
  ensureCss() {
    if (!document.getElementById('armg1738-paper-css')) {
      const st = document.createElement('style');
      st.id = 'armg1738-paper-css';
      st.textContent = this.PAPER_CSS;
      document.head.appendChild(st);
    }
    if (document.getElementById('armg1738-css')) return;
    const st = document.createElement('style');
    st.id = 'armg1738-css';
    st.textContent = `
.armg1738-loc { padding: 12px 16px; }
.armg1738-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.armg1738-row + .armg1738-row { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
.armg1738-lab { flex: none; width: 64px; font-size: 13.5px; font-weight: 700; color: var(--ink-soft); }
.armg1738-row select { min-width: 240px; max-width: 100%; }
.armg1738-ph { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.armg1738-ph b { font-size: 16px; }
.armg1738-add { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
.armg1738-add > input[type=text] { flex: 1 1 220px; min-width: 160px; }
.armg1738-as { flex: 1 1 260px; min-width: 180px; display: flex; flex-direction: column; gap: 4px; }
.armg1738-ain { display: flex; gap: 4px; align-items: center; }
.armg1738-ain input[type=text] { flex: 1; min-width: 0; }
.armg1738-tip { margin: 6px 2px 12px; }
.armg1738-items td { vertical-align: middle; }
.armg1738-items .armg1738-q { font-weight: 600; overflow-wrap: anywhere; }
.armg1738-hd { width: 22px; cursor: grab; color: var(--ink-mute); text-align: center; user-select: none; }
.armg1738-ans { display: inline-block; margin: 1px 6px 1px 0; padding: 0 8px; border-radius: 10px; background: var(--accent-soft); color: var(--accent-ink); font-size: 13.5px; }
.armg1738-act { white-space: nowrap; text-align: right; width: 1%; }
.armg1738-act .btn { padding: 3px 7px; }
.armg1738-drag { opacity: .45; }
.armg1738-err { color: var(--danger); font-size: 13px; min-height: 18px; margin: 0; }
.armg1738-ord { list-style: none; margin: 0; padding: 0; max-height: 55vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; }
.armg1738-ord li { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-top: 1px solid var(--line); background: var(--surface); }
.armg1738-ord li:first-child { border-top: 0; }
.armg1738-on { font-weight: 600; }
.armg1738-mv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.armg1738-eas { flex: none; }
.armg1738-bkr { margin-top: 8px; }
.armg1738-bks { margin: 0 0 6px; font-size: 14px; }
.armg1738-w { color: var(--warn); font-weight: 700; }
.armg1738-e { color: var(--danger); font-weight: 700; }
.armg1738-bkl { max-height: 160px; overflow-y: auto; font-size: 13px; line-height: 1.6; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--tint); margin-bottom: 6px; }
.armg1738-bkl.e { border-color: #EBB9BC; }
.armg1738-bkl.w { border-color: #EBC78E; }
.armg1738-radios { display: flex; gap: 14px; flex-wrap: wrap; }
.armg1738-radios.col { flex-direction: column; gap: 6px; }
.armg1738-radios label.chk { font-size: 14px; }
.armg1738-pw .wx-psmh .armg1738-cnt { color: var(--ink-mute); font-size: 12px; margin-left: 2px; }
.armg1738-pw .is-off { opacity: .45; }
.armg1738-cntrow { align-items: center; }
.armg1738-cntrow input[type=number] { flex: none; width: 100px; }
.armg1738-cntrow input[type=number]:disabled { opacity: .45; cursor: not-allowed; }
.armg1738-th { cursor: zoom-in; }
`;
    document.head.appendChild(st);
  },
};
