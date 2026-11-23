/* =========================================================
   essays.js — 시험+교재 › 서술형 (고등 서술형 대비 문장 + 따라쓰기 노트)
   · 시험 교재(모의고사·교과서·부교재)마다 하위 항목을 만들고, 그 안에 문장(영어 + 한글 해석)을 넣는다
       모의고사: 문항 번호(18~45) → 번호 순으로 자동 정렬
       교과서·부교재: 과·강 → 하위 항목(예: 본문 1, 대화문 — 이름 직접 입력) → 같은 과·강 안에서 ↑↓로 순서
     하위 항목 안의 문장은 ↑↓로 순서를 바꾼다
   · 저장: meta 테이블 (다른 기기와 동기화 · 테이블 추가 없음)
       id 'WR_'+교재id, { kind:'wrset', matId, groups:[
         { id, num, sents:[{ id, en, ko }] }               ← 모의고사
         { id, unitId, name, sents:[{ id, en, ko }] }      ← 교과서·부교재
       ] }
   · 인쇄 (이 탭의 인쇄 창): 여러 교재에서 하위 항목을 고름 → 한 부 = 요약(영문 + 한글) → 따라쓰기 노트(한 장에 2문장)
       양면 프린터 사용: 요약이 홀수 쪽이면 빈 면, 노트가 홀수 쪽이면 빈 면 → 다음 부가 늘 새 종이에서 시작
       종이·머리글(학원명·날짜·이름)·학생 목록·인쇄 방식은 표지+양식(Prints.kit)의 것을 그대로 씀
   ========================================================= */
const Essays = {
  matId: '',              // 지금 보고 있는 교재
  unitOf: {},             // 교재별로 보고 있던 과·강 (교재 id → 단위 id | '__gone')
  sel: new Set(),         // 인쇄 창에서 고른 하위 항목 id (앱을 켜 둔 동안 기억)
  pick: { mode: 'manual', classId: '', sel: [] },   // 학생 이름: 직접 입력 / 반에서 선택
  pr: { name: '', date: '', copies: '' },
  set: null,              // { gap(줄 간격 mm), duplex(양면 프린터) } — 이 기기에 저장
  LS: 'mg77_wr_settings',
  _tok: 0,
  _cache: null,           // 쪽 나누기 결과 { key, sum:[본문 HTML], note:[본문 HTML] }

  /* ---------- 저장 ---------- */
  rid(matId) { return 'WR_' + matId; },
  rec(matId) { const r = Store.get('meta', this.rid(matId)); return r && r.kind === 'wrset' ? r : null; },
  groupsOf(matId) { const r = this.rec(matId); return (r && Array.isArray(r.groups)) ? r.groups : []; },
  nSents(groups) { return groups.reduce((n, g) => n + (g.sents || []).length, 0); },
  count() { return Store.where('meta', r => r.kind === 'wrset' && NP.mat(r.matId)).reduce((n, r) => n + this.nSents(r.groups || []), 0); },
  // 사본을 고쳐서 저장 (하위 항목이 하나도 없으면 기록을 지움)
  edit(matId, fn) {
    const groups = JSON.parse(JSON.stringify(this.groupsOf(matId)));
    if (fn(groups) === false) return false;
    if (groups.length) Store.put('meta', { id: this.rid(matId), kind: 'wrset', matId, groups, updatedAt: new Date().toISOString() });
    else Store.del('meta', this.rid(matId));
    App.render();
    return true;
  },

  /* ---------- 하위 항목 순서 · 이름 ---------- */
  isMock(m) { return m && m.type === 'mock'; },
  // 화면·인쇄 순서: 모의고사는 번호 순, 교과서·부교재는 과·강 순서 → 그 안에서 저장된 순서 → (지운 과·강의 항목은 맨 뒤)
  ordered(m, groups) {
    if (this.isMock(m)) return groups.slice().sort((a, b) => a.num - b.num);
    const ids = (m.units || []).map(u => u.id);
    return (m.units || []).reduce((a, u) => a.concat(groups.filter(g => g.unitId === u.id)), [])
      .concat(groups.filter(g => !ids.includes(g.unitId)));
  },
  unitLabel(m, g) { return (m.units || []).some(u => u.id === g.unitId) ? NP.unitName(m, g.unitId) : '(삭제된 단위)'; },
  // 요약·노트에 쓰는 이름: 18번 / 4과 · 본문 1
  gLabel(m, g) { return this.isMock(m) ? `${g.num}번` : `${this.unitLabel(m, g)} · ${g.name}`; },

  /* =========================================================
     화면 (서술형 탭)
     ========================================================= */
  render(main) {
    const mats = NP.sortMats(NP.examMats());
    if (this.matId && !NP.mat(this.matId)) this.matId = '';
    const m = this.matId ? NP.mat(this.matId) : null;
    const opt = (x) => { const n = this.nSents(this.groupsOf(x.id)); return `<option value="${x.id}" ${m && m.id === x.id ? 'selected' : ''}>${esc(NP.matName(x))}${n ? ` (${n}문장)` : ''}</option>`; };
    let h = Exams.headHtml() + Exams.tabsHtml();
    h += `<div class="toolbar"><select data-wrmat style="min-width:280px"><option value="">교재를 고르세요</option>${['mock', 'text', 'sub'].map(t => {
      const l = mats.filter(x => x.type === t);
      return l.length ? `<optgroup label="${MAT_TYPE[t]}">${l.map(opt).join('')}</optgroup>` : '';
    }).join('')}</select>
      <span class="muted small">고등 서술형 대비 문장 · 인쇄하면 요약 + 따라쓰기 노트</span><span style="flex:1"></span>
      <button class="btn primary" data-wa="print">인쇄</button></div>`;
    if (!m) h += this.overviewHtml(mats);
    else h += this.matHtml(m);
    main.innerHTML = h;
    main.onclick = (e) => this.onClick(e, main);
    main.onchange = (e) => {
      if (e.target.matches('[data-wrmat]')) { this.matId = e.target.value; App.render(); }
    };
    main.oninput = null;
    main.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.target.matches('[data-wrnum]')) { e.preventDefault(); this.addNum(main); }
    };
  },

  // 교재를 고르기 전: 문장이 있는 교재 목록
  overviewHtml(mats) {
    if (!mats.length) return '<div class="panel"><div class="empty">등록된 시험 교재가 없습니다. “+ 교재 등록”으로 모의고사·교과서·부교재를 먼저 등록하세요.</div></div>';
    const list = mats.filter(m => this.groupsOf(m.id).length);
    if (!list.length) return '<div class="panel"><div class="empty">위에서 교재를 고른 뒤 문항(모의고사) 또는 과·강의 하위 항목(교과서·부교재)을 추가하고 문장을 넣으세요.</div></div>';
    return `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>종류</th><th>이름</th><th class="num">항목</th><th class="num">문장</th></tr></thead><tbody>${list.map(m => {
      const gs = this.groupsOf(m.id);
      return `<tr class="click" data-wrgo="${m.id}"><td class="nowrap"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span></td><td class="nowrap"><b>${esc(NP.matName(m))}</b></td>
        <td class="num">${gs.length}</td><td class="num">${this.nSents(gs)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  },

  matHtml(m) {
    const groups = this.groupsOf(m.id);
    let h = `<div class="panel"><div class="wx-bar"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span><b class="wx-mname">${esc(NP.matName(m))}</b>
      <span class="small soft">${groups.length}개 항목 · ${this.nSents(groups)}문장</span><span style="flex:1"></span>`;
    if (this.isMock(m)) {
      h += `<input type="number" data-wrnum min="${NP.MOCK_MIN}" max="${NP.MOCK_MAX}" placeholder="번호" style="width:84px"><button class="btn sm primary" data-wa="addnum" title="없는 번호는 새로 만들고, 있는 번호는 그 번호에 문장을 이어서 추가합니다">+ 문장</button></div>`;
      const gs = this.ordered(m, groups);
      h += gs.length ? gs.map((g, i) => this.grpHtml(m, g, i, gs.length)).join('')
        : `<div class="empty">문항이 없습니다. 번호(${NP.MOCK_MIN}~${NP.MOCK_MAX})를 넣고 “+ 문장”을 누르세요. 같은 번호를 다시 넣으면 그 번호에 문장이 이어서 추가됩니다.</div>`;
      return h + '</div>';
    }
    // 교과서·부교재: 과·강 고르기 → 하위 항목
    const units = m.units || [], ids = units.map(u => u.id);
    const gone = groups.filter(g => !ids.includes(g.unitId));
    let cur = this.unitOf[m.id];
    if (!(cur === '__gone' ? gone.length : ids.includes(cur))) cur = (units.find(u => groups.some(g => g.unitId === u.id)) || units[0] || {}).id || (gone.length ? '__gone' : '');
    this.unitOf[m.id] = cur;
    const unitWord = m.type === 'sub' ? '강' : '과';
    h += `</div><div class="np-chips wx-units">${units.map(u => {
      const n = this.nSents(groups.filter(g => g.unitId === u.id));
      return `<button type="button" class="np-c ${cur === u.id ? 'on' : ''}" data-wrunit="${u.id}">${esc(u.name)}${n ? `<small class="wx-cnt">${n}</small>` : ''}</button>`;
    }).join('')}${gone.length ? `<button type="button" class="np-c ${cur === '__gone' ? 'on' : ''}" data-wrunit="__gone">(삭제된 단위)<small class="wx-cnt">${this.nSents(gone)}</small></button>` : ''}</div>`;
    if (!units.length && !gone.length) return h + `<div class="empty">이 교재에 ${unitWord}가 없습니다. 시험 교재 탭에서 단위를 먼저 추가하세요.</div></div>`;
    const gs = cur === '__gone' ? gone : groups.filter(g => g.unitId === cur);
    if (cur !== '__gone') h += `<div class="wx-bar" style="margin-top:8px"><b>${esc(NP.unitName(m, cur))}</b><span class="small soft">${gs.length}개 항목</span><span style="flex:1"></span>
      <button class="btn sm primary" data-wa="gadd">+ 하위 항목</button></div>`;
    else h += '<div class="hint" style="margin-top:8px">교재에서 지운 과·강에 있던 항목입니다. 필요 없으면 삭제하세요.</div>';
    h += gs.length ? gs.map((g, i) => this.grpHtml(m, g, i, gs.length)).join('')
      : '<div class="empty">하위 항목이 없습니다. “+ 하위 항목”으로 본문 1, 본문 2 … 를 만드세요.</div>';
    return h + '</div>';
  },

  grpHtml(m, g, i, n) {
    const ss = g.sents || [], mock = this.isMock(m);
    return `<div class="wx-grp" data-g="${g.id}"><div class="wx-gh"><b class="wx-gl">${esc(mock ? g.num + '번' : g.name)}</b><span class="small soft">${ss.length}문장</span>
      ${mock ? '' : `<button type="button" class="icon-btn" data-wa="gup" title="위로" ${i ? '' : 'disabled'}>↑</button><button type="button" class="icon-btn" data-wa="gdn" title="아래로" ${i < n - 1 ? '' : 'disabled'}>↓</button>
        <button type="button" class="btn sm ghost" data-wa="gren">이름 수정</button>`}
      <span style="flex:1"></span><button type="button" class="btn sm" data-wa="sadd">+ 문장</button><button type="button" class="btn sm ghost danger" data-wa="gdel">항목 삭제</button></div>
      ${ss.length ? `<ol class="wx-sl">${ss.map((s, j) => `<li class="wx-s" data-s="${s.id}"><span class="wx-sn">${j + 1}</span>
        <div class="wx-st" data-wa="sedit" title="눌러서 수정"><div class="wx-en">${esc(s.en)}</div><div class="wx-ko">${esc(s.ko)}</div></div>
        <div class="wx-sa"><button type="button" class="icon-btn" data-wa="sup" title="위로" ${j ? '' : 'disabled'}>↑</button><button type="button" class="icon-btn" data-wa="sdn" title="아래로" ${j < ss.length - 1 ? '' : 'disabled'}>↓</button>
        <button type="button" class="icon-btn" data-wa="sdel" title="삭제">✕</button></div></li>`).join('')}</ol>`
        : '<div class="small muted" style="margin-top:6px">문장이 없습니다. “+ 문장”으로 추가하세요.</div>'}</div>`;
  },

  onClick(e, main) {
    if (Exams.commonClick(e, main)) return;
    const go = e.target.closest('tr[data-wrgo]');
    if (go) { this.matId = go.dataset.wrgo; App.render(true); return; }
    const u = e.target.closest('[data-wrunit]');
    if (u) { this.unitOf[this.matId] = u.dataset.wrunit; App.render(); return; }
    const b = e.target.closest('[data-wa]');
    if (!b || b.disabled) return;
    const a = b.dataset.wa, m = NP.mat(this.matId);
    if (a === 'print') { this.openPrint(); return; }
    if (!m) return;
    if (a === 'addnum') { this.addNum(main); return; }
    if (a === 'gadd') { this.addGroup(m); return; }
    const gEl = b.closest('[data-g]'), gid = gEl && gEl.dataset.g;
    const sEl = b.closest('[data-s]'), sid = sEl && sEl.dataset.s;
    if (!gid) return;
    if (a === 'sadd') { this.openSent(m.id, gid, null); return; }
    if (a === 'sedit') { this.openSent(m.id, gid, sid); return; }
    if (a === 'gren') { this.renameGroup(m, gid); return; }
    if (a === 'gdel') { this.delGroup(m, gid); return; }
    if (a === 'gup' || a === 'gdn') {
      this.edit(m.id, (gs) => {
        const g = gs.find(x => x.id === gid); if (!g) return false;
        const ids = (m.units || []).map(x => x.id);
        const same = gs.filter(x => ids.includes(g.unitId) ? x.unitId === g.unitId : !ids.includes(x.unitId));
        const i = same.indexOf(g), j = i + (a === 'gup' ? -1 : 1);
        if (j < 0 || j >= same.length) return false;
        const p = gs.indexOf(g), q = gs.indexOf(same[j]);
        [gs[p], gs[q]] = [gs[q], gs[p]];
      });
      return;
    }
    if (a === 'sup' || a === 'sdn' || a === 'sdel') {
      if (a === 'sdel') {
        const s = ((this.groupsOf(m.id).find(x => x.id === gid) || {}).sents || []).find(x => x.id === sid);
        if (!s) return;
        confirmDlg(`이 문장을 삭제할까요?\n\n${s.en}`, '삭제', true).then(ok => {
          if (ok) this.edit(m.id, (gs) => { const g = gs.find(x => x.id === gid); if (!g) return false; g.sents = g.sents.filter(x => x.id !== sid); });
        });
        return;
      }
      this.edit(m.id, (gs) => {
        const g = gs.find(x => x.id === gid); if (!g) return false;
        const i = g.sents.findIndex(x => x.id === sid), j = i + (a === 'sup' ? -1 : 1);
        if (i < 0 || j < 0 || j >= g.sents.length) return false;
        [g.sents[i], g.sents[j]] = [g.sents[j], g.sents[i]];
      });
    }
  },

  // 모의고사: 번호에 문장 추가 (없는 번호면 새로 만들고, 있는 번호면 그 번호의 맨 아래에 이어서)
  addNum(main) {
    const m = NP.mat(this.matId); if (!m) return;
    const inp = $('[data-wrnum]', main);
    const v = String(inp.value || '').trim(), n = +v;
    if (!/^\d+$/.test(v) || n < NP.MOCK_MIN || n > NP.MOCK_MAX) { toast(`번호는 ${NP.MOCK_MIN}~${NP.MOCK_MAX} 사이로 넣으세요`); inp.focus(); return; }
    const ex = this.groupsOf(m.id).find(g => +g.num === n);
    inp.value = '';
    if (ex) { this.openSent(m.id, ex.id, null); return; }
    this.openSent(m.id, null, null, { num: n });          // 번호는 문장을 저장할 때 만든다
  },

  // 교과서·부교재 하위 항목 추가 (기본 이름: 본문 (그 과의 마지막 번호 + 1)). 이미 있는 이름이면 그 항목에 문장을 이어서 추가
  async addGroup(m) {
    const unitId = this.unitOf[m.id];
    if (!unitId || unitId === '__gone') return;
    const same = this.groupsOf(m.id).filter(g => g.unitId === unitId);
    const max = same.reduce((x, g) => { const r = String(g.name || '').match(/(\d+)\s*$/); return r ? Math.max(x, +r[1]) : x; }, 0);
    const name = await this.nameDlg(`하위 항목 추가 — ${NP.unitName(m, unitId)}`, `본문 ${max + 1}`, null);
    if (!name) return;
    const ex = this.groupsOf(m.id).find(g => g.unitId === unitId && g.name === name);
    if (ex) { this.openSent(m.id, ex.id, null); return; }
    this.openSent(m.id, null, null, { unitId, name });    // 하위 항목은 문장을 저장할 때 만든다
  },
  async renameGroup(m, gid) {
    const gs0 = this.groupsOf(m.id), g = gs0.find(x => x.id === gid); if (!g) return;
    const name = await this.nameDlg('하위 항목 이름 수정', g.name, gs0.filter(x => x.id !== gid && x.unitId === g.unitId).map(x => x.name));
    if (!name || name === g.name) return;
    this.edit(m.id, (gs) => { const x = gs.find(y => y.id === gid); if (!x) return false; x.name = name; });
  },
  async delGroup(m, gid) {
    const g = this.groupsOf(m.id).find(x => x.id === gid); if (!g) return;
    const n = (g.sents || []).length;
    if (n && !await confirmDlg(`“${this.gLabel(m, g)}” 항목과 문장 ${n}개를 삭제할까요?`, '삭제', true)) return;
    this.sel.delete(gid);
    this.edit(m.id, (gs) => { const i = gs.findIndex(x => x.id === gid); if (i < 0) return false; gs.splice(i, 1); });
  },
  // 이름 입력 창 → 이름 (취소면 null). taken: 같은 과·강에 이미 있는 이름
  nameDlg(title, val, taken) {
    return new Promise(res => {
      let done = false;
      Modal.open({
        title, size: 'sm',
        body: `<input type="text" data-wnm value="${esc(val)}" maxlength="30" style="width:100%" autocomplete="off">
          <div class="hint" style="margin-top:6px">예: 본문 1, 대화문, Special Lesson</div>`,
        onMount: (b, md) => {
          const i = $('[data-wnm]', b);
          setTimeout(() => i.select(), 40);
          i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('[data-primary]', md.foot).click(); } });
        },
        onClose: () => { if (!done) res(null); },
        buttons: [{ text: '취소' }, { text: '확인', cls: 'primary', primary: true, onClick: (md) => {
          const v = stripZws($('[data-wnm]', md.body).value).replace(/\s+/g, ' ').trim();
          if (!v) { toast('이름을 입력하세요'); return false; }
          if ((taken || []).includes(v)) { toast('같은 이름의 항목이 이미 있습니다'); return false; }
          done = true; res(v);
        } }],
      });
    });
  },

  // 문장 추가·수정 창. 추가는 “저장 후 다음 문장”으로 이어서 넣을 수 있음
  // newG: 아직 없는 번호·하위 항목 ({ num } 또는 { unitId, name }) → 저장 버튼을 눌러 문장이 저장될 때 함께 만든다
  //       (창을 닫거나 바깥을 누르면 아무것도 저장되지 않음)
  openSent(matId, gid, sid, newG) {
    const m = NP.mat(matId);
    const g0 = newG ? Object.assign({ sents: [] }, newG) : this.groupsOf(matId).find(x => x.id === gid);
    if (!m || !g0) return;
    const s0 = sid ? (g0.sents || []).find(x => x.id === sid) : null;
    if (sid && !s0) return;
    const head = `${NP.shortName(m)} · ${this.gLabel(m, g0)}`;
    const body = `<div class="form">
        <label class="top req">영어 문장</label><textarea data-wen rows="3" placeholder="예: The more you practice, the better you become.">${esc(s0 ? s0.en : '')}</textarea>
        <label class="top req">한글 해석</label><textarea data-wko rows="3" placeholder="예: 연습을 많이 할수록 더 잘하게 된다.">${esc(s0 ? s0.ko : '')}</textarea>
      </div><div class="hint" style="margin-top:8px" data-whint>영어 칸에서 Enter → 한글 칸으로 · 두 칸을 모두 채우고 저장 버튼을 눌러야 저장됩니다</div>`;
    const norm = (v) => stripZws(v || '').replace(/\s+/g, ' ').trim();
    // 저장 → true / 실패 → false
    const save = (md) => {
      const en = norm($('[data-wen]', md.body).value), ko = norm($('[data-wko]', md.body).value);
      if (!en) { toast('영어 문장을 입력하세요'); $('[data-wen]', md.body).focus(); return false; }
      if (!ko) { toast('한글 해석을 입력하세요'); $('[data-wko]', md.body).focus(); return false; }
      let ok = true;
      this.edit(matId, (gs) => {
        let g = gid ? gs.find(x => x.id === gid) : null;
        if (!g && !gid && newG) {
          // 그사이 다른 기기에서 같은 번호·항목이 생겼으면 거기에 넣는다
          g = gs.find(x => newG.num != null ? +x.num === +newG.num : (x.unitId === newG.unitId && x.name === newG.name));
          if (!g) { g = Object.assign({ id: uid('WG') }, newG, { sents: [] }); gs.push(g); }
          gid = g.id;                                      // “저장 후 다음 문장”은 같은 항목에 이어서
        }
        if (!g) { ok = false; return false; }
        g.sents = g.sents || [];
        if (s0) { const s = g.sents.find(x => x.id === s0.id); if (!s) { ok = false; return false; } s.en = en; s.ko = ko; }
        else g.sents.push({ id: uid('WS'), en, ko });
      });
      if (!ok) { toast('이 항목이 지워져 저장하지 못했습니다'); return true; }
      return true;
    };
    let added = 0;
    const saveNext = (md) => {
      if (!save(md)) return false;
      added++;
      $('[data-wen]', md.body).value = ''; $('[data-wko]', md.body).value = '';
      $('[data-wen]', md.body).focus();
      $('.mg-modal-head h3', md.el).textContent = `문장 추가 — ${head} (${added}개 저장함)`;
      return false;
    };
    Modal.open({
      title: `${s0 ? '문장 수정' : '문장 추가'} — ${head}`, size: 'md', body,
      onMount: (b, md) => {
        b.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || e.isComposing || e.shiftKey) return;
          if (e.target.matches('[data-wen]')) { e.preventDefault(); $('[data-wko]', b).focus(); }
          else if (e.target.matches('[data-wko]')) e.preventDefault();      // 저장은 버튼으로만
        });
      },
      buttons: s0 ? [
        { text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (!await confirmDlg('이 문장을 삭제할까요?', '삭제', true)) return false;
          this.edit(matId, (gs) => { const g = gs.find(x => x.id === gid); if (!g) return false; g.sents = (g.sents || []).filter(x => x.id !== s0.id); });
        } },
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (md) => save(md) },
      ] : [
        { text: '닫기' },
        { text: '저장 후 다음 문장', onClick: (md) => saveNext(md) },
        { text: '저장', cls: 'primary', primary: true, onClick: (md) => save(md) },
      ],
    });
  },

  /* =========================================================
     인쇄 창
     ========================================================= */
  loadSet() {
    if (this.set) return;
    this.set = { gap: 10, duplex: true };
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.LS) || 'null'); } catch (e) { s = null; }
    if (s) {
      if (typeof s.gap === 'number' && s.gap >= 8 && s.gap <= 12) this.set.gap = s.gap;
      if (typeof s.duplex === 'boolean') this.set.duplex = s.duplex;
    }
  },
  saveSet() { try { localStorage.setItem(this.LS, JSON.stringify(this.set)); } catch (e) { /* 저장 못 해도 이번에는 그대로 씀 */ } },

  // 인쇄할 수 있는 교재 (문장이 있는 하위 항목이 있는 것) → [{ m, gs:[하위 항목(화면 순서)] }]
  printMats() {
    return NP.sortMats(NP.examMats()).map(m => ({ m, gs: this.ordered(m, this.groupsOf(m.id)).filter(g => (g.sents || []).length) })).filter(x => x.gs.length);
  },
  // 고른 하위 항목의 문장 (교재 순서 → 항목 순서 → 문장 순서), 번호는 처음부터 이어서
  items() {
    const out = [];
    this.printMats().forEach(({ m, gs }) => gs.forEach(g => {
      if (!this.sel.has(g.id)) return;
      g.sents.forEach(s => out.push({ key: s.id, m, g, no: out.length + 1, label: this.gLabel(m, g), en: s.en, ko: s.ko }));
    }));
    return out;
  },

  openPrint() {
    const K = Prints.kit;
    const pm = this.printMats();
    if (!pm.length) { toast('인쇄할 문장이 없습니다. 먼저 문장을 등록하세요.'); return; }
    this.loadSet();
    K.ensureAssets(); this.ensureCss();
    // 없어진 항목은 선택에서 뺀다
    const live = new Set(pm.reduce((a, x) => a.concat(x.gs.map(g => g.id)), []));
    [...this.sel].forEach(id => { if (!live.has(id)) this.sel.delete(id); });
    const body = `<div class="pr-wrap wx-pw">
      <aside class="panel pr-side wx-pside">
        <div class="pr-sec"><h2>범위</h2>
          <div class="wx-psbtn"><button type="button" class="btn sm" data-wa="wp-all">전체 선택</button><button type="button" class="btn sm" data-wa="wp-none">선택 해제</button></div>
          <div class="wx-pslist" data-wrsel>${this.selHtml()}</div>
          <p class="pr-hint" data-wrsum></p></div>
        <div class="pr-sec"><h2>글자</h2>
          <label class="pr-fld"><span>학원명</span><input type="text" data-wp-ac value="${esc(K.academy())}" placeholder="학원명을 입력하세요" maxlength="40" autocomplete="off"></label>
          <p class="pr-hint">표지+양식의 학원명과 같은 값이에요.</p>
          <label class="pr-fld"><span>날짜 (선택)</span>
            <div class="pr-inline"><input type="date" data-wp-date value="${esc(this.pr.date)}" aria-label="날짜"><button type="button" class="btn sm" data-wa="wp-date-clear">지우기</button></div></label>
          <p class="pr-hint">비워 두면 날짜 칸이 빈 줄로 나와요.</p></div>
        <div class="pr-sec"><h2>학생 이름</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="학생 이름 넣는 방식">
            <label class="chk"><input type="radio" name="wp-nm-mode" value="manual" ${this.pick.mode === 'class' ? '' : 'checked'}>직접 입력</label>
            <label class="chk"><input type="radio" name="wp-nm-mode" value="class" ${this.pick.mode === 'class' ? 'checked' : ''}>반에서 선택</label>
          </div>
          <div data-wp-nmbody>${this.nmBodyHtml()}</div></div>
        <div class="pr-sec"><h2>노트</h2>
          <div class="pr-fld"><span>줄 간격</span>
            <div class="pr-range"><input type="range" data-wp-gap min="8" max="12" step="0.5" value="${this.set.gap}" aria-label="줄 간격"><output data-wp-gapout>${this.set.gap.toFixed(1)}mm</output></div></div>
          <p class="pr-hint">한 장에 2문장. 한글 해석 아래 첫 줄에 영어 문장이 연하게, 나머지는 따라 쓰는 빈 줄이에요.</p></div>
        <div class="pr-sec"><h2>출력</h2>
          <label class="chk pr-chk"><input type="checkbox" data-wp-duplex ${this.set.duplex ? 'checked' : ''}>양면 프린터 사용</label>
          <p class="pr-hint" data-wp-dxhint>${this.dxHint()}</p>
          <div class="pr-print" style="margin-top:10px">
            <input type="number" data-wp-copies min="1" max="500" step="1" value="${esc(this.pr.copies)}" placeholder="부수" aria-label="출력 부수"${this.pick.mode === 'class' ? ' disabled' : ''}>
            <button type="button" class="btn primary" data-wa="wp-print" data-wp-printbtn>${this.printLabel()}</button>
          </div>
          <div class="pr-note">인쇄창에서 배율은 <b>기본값(100%)</b>으로 두세요. 양면 프린터를 사용할 땐 인쇄창의 <b>양면 인쇄</b>도 켜져 있어야 해요.</div></div>
      </aside>
      <section class="wx-pview" data-wrprev></section>
    </div>`;
    Modal.open({
      title: '서술형 노트 인쇄', size: 'xl wx-pmodal', body, autofocus: false,
      onMount: (b, md) => {
        this._md = md;
        const upd = debounce(() => this.prevBuild(b, md), 150);
        const syncIndet = () => $$('[data-indet]', b).forEach(x => { x.indeterminate = true; });
        const refreshSel = () => {
          const box = $('[data-wrsel]', b), top = box.scrollTop;
          box.innerHTML = this.selHtml(); box.scrollTop = top; syncIndet(); upd();
        };
        const refreshNm = (listToo) => {
          if (listToo) { const l = $('[data-wp-list]', b); if (l) { const bx = $('.pr-nm-stus', l), t = bx ? bx.scrollTop : 0; l.innerHTML = this.nmListHtml(); const nb = $('.pr-nm-stus', l); if (nb) nb.scrollTop = t; } }
          const p = $('[data-wp-picked]', b); if (p) p.innerHTML = this.nmPickedHtml();
          syncIndet();
          $('[data-wp-printbtn]', b).textContent = this.printLabel();
          $('[data-wp-copies]', b).disabled = this.pick.mode === 'class';
          upd();
        };
        syncIndet();
        b.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-wsg]');
          if (chip) { const id = chip.dataset.wsg; if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id); refreshSel(); return; }
          const bt = e.target.closest('[data-wa]'); if (!bt) return;
          const a = bt.dataset.wa;
          if (a === 'wp-all') { this.printMats().forEach(x => x.gs.forEach(g => this.sel.add(g.id))); refreshSel(); }
          else if (a === 'wp-none') { this.sel.clear(); refreshSel(); }
          else if (a === 'wp-date-clear') { this.pr.date = ''; $('[data-wp-date]', b).value = ''; upd(); }
          else if (a === 'wp-nm-clear') { this.pick.sel = []; refreshNm(true); }
          else if (a === 'wp-print') this.doPrint(b);
        });
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-wp-ac]')) { K.setAcademy(t.value); upd(); }
          else if (t.matches('[data-wp-date]')) { this.pr.date = isYmd(t.value) ? t.value : ''; upd(); }
          else if (t.matches('[data-wp-name]')) { this.pr.name = t.value; upd(); }
          else if (t.matches('[data-wp-copies]')) this.pr.copies = t.value;
          else if (t.matches('[data-wp-gap]')) {
            this.set.gap = parseFloat(t.value); this.saveSet();
            $('[data-wp-gapout]', b).textContent = this.set.gap.toFixed(1) + 'mm'; upd();
          }
        });
        b.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-wsm]')) {
            const x = this.printMats().find(y => y.m.id === t.dataset.wsm);
            if (x) x.gs.forEach(g => { if (t.checked) this.sel.add(g.id); else this.sel.delete(g.id); });
            refreshSel();
          } else if (t.matches('[data-wp-duplex]')) {
            this.set.duplex = t.checked; this.saveSet();
            $('[data-wp-dxhint]', b).textContent = this.dxHint(); upd();
          } else if (t.matches('[name="wp-nm-mode"]')) {
            if (!t.checked) return;
            this.pick.mode = t.value === 'class' ? 'class' : 'manual';
            $('[data-wp-nmbody]', b).innerHTML = this.nmBodyHtml(); refreshNm(false);
          } else if (t.matches('[data-wp-class]')) {
            this.pick.classId = t.value;
            const l = $('[data-wp-list]', b); if (l) l.innerHTML = '';
            refreshNm(true);
          } else if (t.matches('[data-wp-all]')) {
            this.nmToggle(K.roster(this.pick.classId).map(s => s.id), t.checked); refreshNm(true);
          } else if (t.matches('[data-wp-stu]')) {
            this.nmToggle([t.dataset.wpStu], t.checked); refreshNm(true);
          }
        });
        this.prevBuild(b, md);
      },
      onClose: () => { this._tok++; this._md = null; },
      buttons: [{ text: '닫기' }],
    });
  },
  dxHint() {
    return this.set.duplex ? '요약·노트가 각각 홀수 쪽이면 빈 면을 넣어, 노트와 다음 부가 늘 새 종이에서 시작해요.' : '단면 프린터용: 빈 면 없이 차례대로 인쇄해요.';
  },
  printLabel() { const n = this.pickStudents().length; return this.pick.mode === 'class' ? `인쇄 / PDF (${n}명)` : '인쇄 / PDF'; },

  // 범위 고르기: 교재별 체크 + 항목 칩 (교과서·부교재는 과·강별 줄)
  selHtml() {
    const pm = this.printMats();
    return pm.map(({ m, gs }) => {
      const on = gs.filter(g => this.sel.has(g.id)).length;
      const chip = (g) => `<button type="button" class="np-c sm ${this.sel.has(g.id) ? 'on' : ''}" data-wsg="${g.id}">${esc(this.isMock(m) ? g.num + '번' : g.name)}<small class="wx-cnt">${g.sents.length}</small></button>`;
      let rows;
      if (this.isMock(m)) rows = `<div class="np-chips">${gs.map(chip).join('')}</div>`;
      else {
        const byU = [];
        gs.forEach(g => { const l = this.unitLabel(m, g); let r = byU.find(x => x.l === l); if (!r) byU.push(r = { l, gs: [] }); r.gs.push(g); });
        rows = byU.map(r => `<div class="wx-psu"><span class="wx-psul">${esc(r.l)}</span><div class="np-chips">${r.gs.map(chip).join('')}</div></div>`).join('');
      }
      return `<div class="wx-psm"><label class="chk wx-psmh"><input type="checkbox" data-wsm="${m.id}" ${on === gs.length ? 'checked' : ''}${on && on < gs.length ? ' data-indet' : ''}>
        <span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span><b>${esc(NP.matName(m))}</b></label>${rows}</div>`;
    }).join('');
  },

  /* ---------- 학생 이름 (표지+양식과 같은 방식) ---------- */
  pickStudents() { return this.pick.sel.map(id => Store.get('students', id)).filter(Boolean); },
  nmBodyHtml() {
    const K = Prints.kit;
    if (this.pick.mode !== 'class') return `<label class="pr-fld"><span>학생 이름</span><input type="text" data-wp-name value="${esc(this.pr.name)}" placeholder="비워 두면 빈 줄로 나와요" maxlength="20" autocomplete="off"></label>`;
    const cls = K.classes();
    if (this.pick.classId && !cls.some(c => c.id === this.pick.classId)) this.pick.classId = '';
    return `<label class="pr-fld"><span>반</span>
        <select data-wp-class><option value="">반을 고르세요</option>
          ${cls.map(c => `<option value="${esc(c.id)}"${c.id === this.pick.classId ? ' selected' : ''}>${esc(c.name)} (${K.roster(c.id).length}명)</option>`).join('')}</select></label>
      <div class="pr-nm-list" data-wp-list>${this.nmListHtml()}</div>
      <div class="pr-nm-picked" data-wp-picked>${this.nmPickedHtml()}</div>
      <p class="pr-hint">다른 반을 골라도 체크한 학생은 그대로 남아요. 고른 학생마다 한 부씩, 이름만 바뀌어 인쇄돼요.</p>`;
  },
  nmListHtml() {
    if (!this.pick.classId) return '<div class="none">반을 고르면 학생 목록이 나와요.</div>';
    const ros = Prints.kit.roster(this.pick.classId);
    if (!ros.length) return '<div class="none">이 반에는 재원생이 없어요.</div>';
    const on = new Set(this.pick.sel);
    const all = ros.every(s => on.has(s.id)), some = ros.some(s => on.has(s.id));
    return `<label class="chk pr-nm-all"><input type="checkbox" data-wp-all ${all ? 'checked' : ''}${!all && some ? ' data-indet' : ''}>반 전체 선택</label>
      <div class="pr-nm-stus">${ros.map(s => `<label class="chk"><input type="checkbox" data-wp-stu="${esc(s.id)}" ${on.has(s.id) ? 'checked' : ''}>${esc(s.name)}${stTag(s) ? ` <small>${esc(stTag(s))}</small>` : ''}</label>`).join('')}</div>`;
  },
  nmPickedHtml() {
    const list = this.pickStudents();
    if (!list.length) return '<span class="none">고른 학생: 없음</span>';
    return `<div class="pr-nm-ph"><b>고른 학생 ${list.length}명</b><button type="button" class="btn sm" data-wa="wp-nm-clear">모두 해제</button></div>
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

  /* ---------- 종이 ---------- */
  // 머리글: 표지+양식 › 시험지·노트와 같은 모양 (학원명 · 날짜 · 이름)
  headHtml(nm) {
    const K = Prints.kit, dt = K.dateText(this.pr.date), n = String(nm || '').trim();
    return `<div class="pn-head"><div class="pn-academy">${esc(K.academy())}</div><div class="pn-fields">
        <span class="pn-field">날짜<span class="pn-blank${dt ? ' pn-val' : ''}" style="width:30mm">${esc(dt)}</span></span>
        <span class="pn-field">이름<span class="pn-blank${n ? ' pn-val' : ''}" style="width:38mm">${esc(n)}</span></span>
      </div></div>`;
  },
  // 글꼴이 다 온 뒤에 재야 쪽 나누기가 인쇄와 같아진다
  async fontsReady() {
    const ln = document.getElementById('pr-paper-font');
    if (ln && !ln.sheet) await new Promise(r => { ln.addEventListener('load', r, { once: true }); ln.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
    if (!document.fonts || !document.fonts.load) return;
    const fs = ['16px "Gowun Dodum"', '700 16px "Gowun Batang"', '400 16px "IBM Plex Sans KR"', '500 16px "IBM Plex Sans KR"', '700 16px "IBM Plex Sans KR"'];
    await Promise.race([Promise.all(fs.map(f => document.fonts.load(f).catch(() => null))), new Promise(r => setTimeout(r, 4000))]);
  },
  // 쪽 나누기 (화면 밖에 실제 크기로 그려서 잰다) → { sum:[요약 본문], note:[노트 본문] }
  async paginate(items) {
    const gap = this.set.gap;
    const key = items.map(it => `${it.key}:${it.en}:${it.ko}:${it.label}`).join('|') + '#' + gap;
    if (this._cache && this._cache.key === key) return this._cache;
    await this.fontsReady();
    const K = Prints.kit, MM = K.MM_PER_PX;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;z-index:-1';
    document.body.appendChild(host);
    try {
      // 1) 요약: 교재 이름 → 항목 이름 → 문장(영문 + 한글). 넘치면 다음 쪽 (교재·항목 이름은 새 쪽에서 다시)
      const sum = [];
      let body = null, curM = null, curG = null, nOnPage = 0, first = true;
      const newPage = () => {
        host.innerHTML = `<div class="pn-sheet wr-sum">${this.headHtml('')}<div class="wr-body"></div></div>`;
        body = host.querySelector('.wr-body');
        if (first) { body.insertAdjacentHTML('beforeend', `<div class="pn-tagrow"><span class="pn-tag">서술형 대비 문장 · ${items.length}문장</span></div>`); first = false; }
        curM = curG = null; nOnPage = 0;
      };
      // 마지막 블록의 아래 끝이 본문 칸을 넘는지 (scrollHeight는 칸 높이보다 작아지지 않아 쓰지 않음)
      const over = () => { const l = body.lastElementChild; return !!l && l.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom - 6; };
      const blk = (it) => `<div class="wr-blk">${it.m.id !== curM ? `<div class="wr-mt">${esc(NP.matName(it.m))}</div>` : ''}${it.g.id !== curG ? `<div class="wr-gl">${esc(it.label)}</div>` : ''}
        <div class="wr-it"><span class="wr-no">${it.no}</span><div class="wr-tx"><div class="wr-en">${esc(it.en)}</div><div class="wr-ko">${esc(it.ko)}</div></div></div></div>`;
      newPage();
      items.forEach(it => {
        body.insertAdjacentHTML('beforeend', blk(it));
        if (over() && nOnPage) { body.lastElementChild.remove(); sum.push(body.outerHTML); newPage(); body.insertAdjacentHTML('beforeend', blk(it)); }
        curM = it.m.id; curG = it.g.id; nOnPage++;
      });
      sum.push(body.outerHTML);
      // 2) 노트: 한 장에 2문장 (위·아래). 문장 수가 홀수면 마지막 장 아래는 빈 줄 노트
      const note = [];
      const half = (it) => it ? `<section class="wr-half"><div class="wr-nh"><span class="wr-no">${it.no}</span><span class="pn-tag">${esc(NP.shortName(it.m) + ' · ' + it.label)}</span></div>
          <div class="wr-ko2">${esc(it.ko)}</div><div class="pn-box wr-lines"><div class="wr-trace">${esc(it.en)}</div></div></section>`
        : '<section class="wr-half"><div class="pn-box wr-lines"></div></section>';
      for (let i = 0; i < items.length; i += 2) {
        host.innerHTML = `<div class="pn-sheet wr-note">${this.headHtml('')}<div class="wr-halves">${half(items[i])}${half(items[i + 1])}</div></div>`;
        host.querySelectorAll('.wr-lines').forEach(box => {
          const hMm = box.clientHeight * MM;
          const n = Math.max(1, Math.round(hMm / gap)), g = hMm / n;
          let out = '';
          for (let k = 1; k < n; k++) out += `<div class="ln" style="top:${(k * g).toFixed(3)}mm"></div>`;
          box.insertAdjacentHTML('afterbegin', out);   // 줄은 글자 뒤에
          // 영어 문장: 첫 줄(길면 이어지는 줄)에 연하게, 글자 아래가 줄에 닿도록
          const tr = box.querySelector('.wr-trace');
          if (tr) {
            const f = Math.min(5, g * 0.46);
            tr.style.top = (g / 2 - 1 - 0.375 * f).toFixed(2) + 'mm';
            tr.style.lineHeight = g.toFixed(3) + 'mm';
            tr.style.fontSize = f.toFixed(2) + 'mm';
          }
        });
        note.push(host.querySelector('.wr-halves').outerHTML);
      }
      this._cache = { key, sum, note };
      return this._cache;
    } finally { host.remove(); }
  },
  // 한 부 = 요약 (+빈 면) + 노트 (+빈 면) → [{ html, cap, blank }]
  copyPages(pg, nm) {
    const blank = { html: '<div class="pn-sheet"></div>', cap: '빈 면 (양면 인쇄용)', blank: true };
    const out = [];
    pg.sum.forEach((b, i) => out.push({ html: `<div class="pn-sheet wr-sum">${this.headHtml(nm)}${b}</div>`, cap: `요약 ${i + 1}/${pg.sum.length}` }));
    if (this.set.duplex && pg.sum.length % 2) out.push(blank);
    pg.note.forEach((b, i) => out.push({ html: `<div class="pn-sheet wr-note">${this.headHtml(nm)}${b}</div>`, cap: `노트 ${i + 1}/${pg.note.length}` }));
    if (this.set.duplex && pg.note.length % 2) out.push(blank);
    return out;
  },
  // 미리보기: 한 부 (반에서 선택이면 첫 학생 이름)
  async prevBuild(b, md) {
    const tok = ++this._tok;
    const pv = $('[data-wrprev]', b), sm = $('[data-wrsum]', b);
    const items = this.items();
    if (!items.length) {
      pv.innerHTML = '<div class="wx-pv-empty">왼쪽 범위에서 인쇄할 문항·본문을 고르세요.</div>';
      sm.textContent = '고른 문장: 없음';
      return;
    }
    if (!pv.children.length || $('.wx-pv-empty', pv)) pv.innerHTML = '<div class="wx-pv-empty">미리보기를 만드는 중…</div>';
    const pg = await this.paginate(items);
    if (tok !== this._tok || md.closed) return;
    const nm = this.pick.mode === 'class' ? ((this.pickStudents()[0] || {}).name || '') : this.pr.name;
    const pages = this.copyPages(pg, nm).filter(p => !p.blank);      // 빈 면은 인쇄할 때만 넣고 미리보기에는 보이지 않음
    sm.textContent = `고른 문장 ${items.length}개 → 요약 ${pg.sum.length}쪽 + 노트 ${pg.note.length}쪽`;
    const K = Prints.kit, s = 0.36;
    pv.innerHTML = `<div class="wx-pv-h">미리보기 · 한 부${nm ? ` (${esc(nm)})` : ''}</div><div class="wx-pv-grid">${pages.map(p => `<figure class="wx-th">
        <div class="wx-thb" style="width:${(K.PAGE_W * s).toFixed(1)}px;height:${(K.PAGE_H * s).toFixed(1)}px"><div style="transform:scale(${s});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div>
        <figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div>`;
  },

  async doPrint(b) {
    const items = this.items();
    if (!items.length) { toast('인쇄할 문항·본문을 고르세요.'); return; }
    let names;
    if (this.pick.mode === 'class') {
      const list = this.pickStudents();
      if (!list.length) { toast('인쇄할 학생을 선택하세요.'); return; }
      names = list.map(s => s.name);
    } else {
      const inp = $('[data-wp-copies]', b), v = String(inp.value || '').trim();
      if (v === '') { toast('출력 부수를 입력하세요.'); inp.focus(); return; }
      const n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
      if (n < 1 || n > 500) { toast('출력 부수는 1에서 500 사이로 입력하세요.'); inp.focus(); return; }
      names = Array.from({ length: n }, () => this.pr.name);
    }
    const pg = await this.paginate(items);
    const html = names.map(nm => this.copyPages(pg, nm).map(p => p.html).join('')).join('');
    Prints.kit.printPaper(html, `서술형노트_${todayStr()}`, this.PAPER_CSS);
  },

  /* ---------- 종이 CSS (표지+양식의 .pn-sheet 위에 더함 · 테마와 상관없이 고정) ---------- */
  PAPER_CSS: `
.pn-sheet .wr-body{flex:1;min-height:0;overflow:hidden}
.pn-sheet .wr-body .pn-tagrow{height:9mm}
.pn-sheet .wr-blk{padding-bottom:3.4mm}
.pn-sheet .wr-mt{font-family:"Gowun Batang",serif;font-size:13pt;font-weight:700;color:var(--pn-ink);border-bottom:0.3mm solid var(--pn-line);padding:0.5mm 0 1.5mm;margin:1mm 0 3mm}
.pn-sheet .wr-gl{display:inline-block;font-family:"Gowun Batang",serif;font-size:10pt;font-weight:700;background:var(--pn-tag-bg);color:var(--pn-tag-ink);padding:0.6mm 3.2mm;border-radius:10mm;line-height:1.35;margin:0 0 2.2mm}
.pn-sheet .wr-it{display:flex;gap:3mm;align-items:flex-start}
.pn-sheet .wr-no{flex:none;min-width:6mm;height:6mm;padding:0 1.4mm;border-radius:3mm;background:var(--pn-ink);color:#fff;font-size:9pt;font-weight:700;line-height:6mm;text-align:center}
.pn-sheet .wr-it .wr-no{margin-top:0.4mm}
.pn-sheet .wr-tx{flex:1;min-width:0}
.pn-sheet .wr-en{font-family:"IBM Plex Sans KR",sans-serif;font-size:11.5pt;font-weight:500;line-height:1.55;color:#1f272d;overflow-wrap:anywhere}
.pn-sheet .wr-ko{font-size:10.5pt;line-height:1.55;color:var(--pn-ink-soft);margin-top:0.6mm;word-break:keep-all;overflow-wrap:anywhere}
.pn-sheet .wr-halves{flex:1;min-height:0;display:flex;flex-direction:column;gap:7mm}
.pn-sheet .wr-half{flex:1 1 0;min-height:0;display:flex;flex-direction:column}
.pn-sheet .wr-nh{flex-shrink:0;display:flex;align-items:center;gap:2.5mm;margin-bottom:2.5mm}
.pn-sheet .wr-ko2{flex-shrink:0;font-size:12.5pt;font-weight:700;line-height:1.55;color:var(--pn-ink);margin:0 1mm 3mm;word-break:keep-all;overflow-wrap:anywhere}
.pn-sheet .wr-trace{position:absolute;left:4mm;right:4mm;font-family:"IBM Plex Sans KR",sans-serif;font-weight:400;color:#97a2ab;overflow-wrap:anywhere}
`,
  ensureCss() {
    if (document.getElementById('wr-paper-css')) return;
    const st = document.createElement('style');
    st.id = 'wr-paper-css';
    st.textContent = this.PAPER_CSS;
    document.head.appendChild(st);
  },
};

/* 서술형 탭·인쇄 창 화면 스타일 (테마 변수만 사용) */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.wx-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wx-mname { font-size: 16px; }
.wx-units { margin-top: 12px; }
.np-c .wx-cnt { font-size: 11px; opacity: .75; margin-left: 4px; font-weight: 600; }
.wx-grp { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-top: 10px; background: var(--surface); }
.wx-gh { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wx-gl { font-size: 15px; color: var(--accent-ink); margin-right: 2px; }
.wx-sl { list-style: none; margin: 8px 0 0; padding: 0; }
.wx-s { display: flex; gap: 10px; align-items: flex-start; padding: 7px 2px; border-top: 1px dashed var(--line); }
.wx-sn { flex: none; width: 22px; text-align: right; color: var(--ink-mute); font-size: 13px; padding-top: 3px; }
.wx-st { flex: 1; min-width: 0; cursor: pointer; border-radius: 6px; padding: 1px 6px; }
.wx-st:hover { background: var(--accent-soft); }
.wx-en { font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.wx-ko { color: var(--ink-soft); font-size: 13.5px; line-height: 1.5; margin-top: 2px; overflow-wrap: anywhere; }
.wx-sa { flex: none; display: flex; gap: 2px; }
/* 인쇄 창 */
.mg-modal.wx-pmodal { width: min(1280px, 96vw); }
.wx-pmodal .mg-modal-body { height: calc(100vh - 150px); overflow: hidden; padding: 12px 14px; }
.wx-pw { height: 100%; align-items: stretch; }
.wx-pside { overflow-y: auto; min-height: 0; }
.wx-pside input[type=checkbox], .wx-pside input[type=radio] { accent-color: var(--accent); width: 16px; height: 16px; margin: 0 4px 0 0; }
.wx-psbtn { display: flex; gap: 6px; margin-bottom: 8px; }
.wx-pslist { max-height: 320px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px; background: var(--tint-strong); }
.wx-psm { padding: 8px 0; border-top: 1px dashed var(--line); }
.wx-psm:first-child { border-top: 0; }
.wx-psmh { display: flex; align-items: center; gap: 6px; font-size: 14px; margin-bottom: 4px; }
.wx-psu { display: flex; gap: 6px; align-items: flex-start; margin: 2px 0 0 22px; }
.wx-psul { flex: none; min-width: 44px; font-size: 12.5px; color: var(--ink-soft); padding-top: 6px; }
.wx-psm > .np-chips { margin-left: 22px; }
.wx-pview { min-height: 0; overflow-y: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--tint-2); padding: 12px 14px; }
.wx-pv-h { font-size: 13px; font-weight: 700; color: var(--ink-soft); margin-bottom: 10px; }
.wx-pv-grid { display: flex; flex-wrap: wrap; gap: 16px; }
.wx-pv-empty { padding: 40px 10px; text-align: center; color: var(--ink-mute); }
.wx-th { margin: 0; }
.wx-thb { overflow: hidden; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.18); border-radius: 2px; }
.wx-th figcaption { text-align: center; font-size: 12.5px; color: var(--ink-soft); margin-top: 5px; }
@media (max-width: 1100px) {
  .wx-pmodal .mg-modal-body { height: auto; overflow-y: auto; }
  .wx-pside, .wx-pview { overflow: visible; }
}
`;
  document.head.appendChild(st);
})();
