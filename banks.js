/* =========================================================
   banks.js — 변형 문제 › 변형문제 탭 (모의고사 문항 은행 + 삽입·순서)
   · 올리는 파일 (한 번에 여러 개, 형식을 보고 알아서 구분)
       mg77-school-bank-v1 : Claude로 만든 문항 은행 (어법·어휘·어법 선택·어휘 선택·빈칸·요약·무관·요지·주제·제목·주장·함축·일치·불일치, 변형 지문 약·중·강)
                             → 이 PC에만 저장 (IndexedDB 'mg77_bank', 로그아웃하면 app.js 가 Banks.wipe() 로 함께 지움)
                             → 은행 속 삽입·순서 문항은 올리지 않음 (삽입·순서는 아래 파일로 따로 올린 것을 씀)
       mg77-insert-v1 / mg77-order-v1 : 삽입·순서 문제 → inserts.js · orders.js 의 올리기 그대로, 저장도 이 PC (2026-11-28, 예전 동기화 저장분은 migrate() 가 한 번 옮김)
     모두 위에서 고른 모의고사 교재에 붙는다 (파일 속 연도·월은 확인 창에 보여 주기만 함)
   · 은행 기록: { key: 교재id|파일종류, matId, kind(파일 type), title, n, at, items:[문항 (인쇄에 쓰는 칸만)] }
     삽입·순서 기록: { key: 교재id|#insert · 교재id|#order, matId, kind:'#insert'|'#order', at, recs:[지문마다] }
       같은 교재에 같은 종류 파일을 다시 올리면 바뀜
   · 내려받기: 회차 하나 / 모든 회차를 zip 하나로 (은행 json · 삽입 json · 순서 json) → 그대로 다시 올릴 수 있음 (다른 PC로 옮길 때)
   · 인쇄 (이 탭의 인쇄 창): 범위(회차별 지문) · 유형(16개, 하나씩) · 지문(원문/변형 약·중·강) · 개수 · 배열
       배열: 유형 = 유형별로 묶기(기본) / 섞기, 번호 = 순서대로(기본) / 섞기 (섞으면 같은 지문은 붙지 않게)
       한 부 = 문제지(2단) (+빈 면) + 해설지 (+빈 면) → 해설지는 늘 새 종이에서 시작
       해설지: 문항마다 정답 + 해설 (지문 해석은 넣지 않음). 삽입·순서는 정답만
       종이·글꼴·머리글·학생 목록·인쇄 방식은 삽입·순서 탭과 같음 (Inserts·Orders 의 종이 CSS를 같이 씀)
   ========================================================= */
const Banks = {
  FORMAT: 'mg77-school-bank-v1',
  DB: 'mg77_bank',
  ST: 'files',
  // 유형 순서 = 모의고사 번호 순서 (20 주장 · 21 함축 · 22 요지 · 23 주제 · 24 제목 · 26 불일치(+일치) · 29 어법(+어법 선택) · 30 어휘(+어휘 선택) · 31~34 빈칸 · 35 무관 · 36~37 순서 · 38~39 삽입 · 40 요약)
  TYPES: [['claim', '주장'], ['implication', '함축'], ['gist', '요지'], ['topic', '주제'], ['title', '제목'], ['mismatch', '불일치'], ['match', '일치'],
          ['grammar', '어법'], ['gbox', '어법 선택'], ['vocab', '어휘'], ['vbox', '어휘 선택'], ['blank', '빈칸'], ['irrelevant', '무관'],
          ['order', '순서'], ['insert', '삽입'], ['summary', '요약']],
  VARS: [['orig', '원문'], ['v1', '약'], ['v2', '중'], ['v3', '강']],
  KIND_NAME: { grammar: '어법', vocab: '어휘', 'gbox+vbox': '어법·어휘 선택', 'blank+summary': '빈칸·요약', 'insert+order+irrelevant': '무관',
               irrelevant: '무관', 'gist+topic+title+claim+implication+mismatch+match': '요지·주제·제목·주장·함축·일치·불일치', variant: '변형 지문(약·중·강) 문제' },
  STEM_INS: '글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.',
  STEM_ORD: '주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.',
  KEEP: ['id', 'num', 'type', 'variant', 'variant_level', 'ver', 'slot', 'stem', 'paras', 'body', 'summary', 'underlined', 'options', 'answer', 'explain', 'level', 'form', 'kind'],
  LAB: '①②③④⑤',

  files: new Map(),       // key → 은행 기록 (이 PC)
  loaded: false,
  loadP: null,
  loadErr: false,
  db: null,
  matId: '',              // 지금 보고 있는 교재
  openNum: '',            // 화면에서 펼쳐 본 지문 번호 (하나만)
  _upMat: '',
  // 인쇄 창 — 앱을 켜 둔 동안 기억
  sel: new Set(),         // 고른 지문 (교재id|번호)
  examId: '',             // 범위를 가져온 학교 시험 (시험+교재)
  types: new Set(),       // 고른 유형
  vars: new Set(['orig']),
  cnt: { mode: 'all', n: 1 },
  arr: { type: 'group', num: 'asc' },
  seed: 1,
  pick: { mode: 'manual', classId: '', sel: [] },
  pr: { name: '', date: '', copies: '' },
  set: null,              // { duplex } — 이 기기에 저장
  LS: 'mg77_bk_settings',
  _tok: 0,
  _cache: null,

  tName(t) { const x = this.TYPES.find(y => y[0] === t); return x ? x[1] : t; },
  tIdx(t) { const i = this.TYPES.findIndex(y => y[0] === t); return i < 0 ? 99 : i; },
  vIdx(v) { const i = this.VARS.findIndex(y => y[0] === v); return i < 0 ? 9 : i; },
  vName(v) { const x = this.VARS.find(y => y[0] === v); return x ? x[1] : v; },
  kindName(k) { return this.KIND_NAME[k] || k; },
  numKey(n) { return parseInt(n, 10) || 0; },

  /* =========================================================
     저장 (이 PC · IndexedDB)
     ========================================================= */
  openDb() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const rq = indexedDB.open(this.DB, 1);
      rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(this.ST)) rq.result.createObjectStore(this.ST, { keyPath: 'key' }); };
      rq.onsuccess = () => { this.db = rq.result; res(this.db); };
      rq.onerror = () => rej(rq.error);
    });
  },
  load() {
    if (this.loaded) return Promise.resolve();
    if (!this.loadP) this.loadP = (async () => {
      try {
        const db = await this.openDb();
        const all = await new Promise((res, rej) => {
          const q = db.transaction(this.ST, 'readonly').objectStore(this.ST).getAll();
          q.onsuccess = () => res(q.result || []);
          q.onerror = () => rej(q.error);
        });
        this.files = new Map(all.map(r => [r.key, r]));
        this.loadErr = false;
      } catch (e) { this.files = new Map(); this.loadErr = true; }
      this.loaded = true;
    })();
    return this.loadP;
  },
  async dbPut(rec) {
    const db = await this.openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(this.ST, 'readwrite');
      tx.objectStore(this.ST).put(rec);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
    this.files.set(rec.key, rec);
  },
  async dbDel(key) {
    const db = await this.openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(this.ST, 'readwrite');
      tx.objectStore(this.ST).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    this.files.delete(key);
  },
  // 삽입·순서 (이 PC) — inserts.js · orders.js 가 부른다. t = 'insert' | 'order'
  localRecs(matId, t) { const f = this.files.get(matId + '|#' + t); return f ? f.recs.map(r => Object.assign({ matId, kind: t === 'insert' ? 'inq' : 'ordq' }, r)) : []; },
  async saveLocal(matId, t, recs) { await this.dbPut({ key: matId + '|#' + t, matId, kind: '#' + t, at: new Date().toISOString(), recs }); this._cache = null; },
  async delLocal(matId, t) { if (this.files.has(matId + '|#' + t)) await this.dbDel(matId + '|#' + t); this._cache = null; },
  // 예전에 동기화 저장(meta)에 올린 삽입·순서를 이 PC로 한 번 옮기고 meta 에서 지운다 (이 PC에 이미 있으면 이 PC 것을 둔다)
  async migrate() {
    if (this._migrating || !this.loaded || this.loadErr) return false;
    const old = Store.where('meta', r => (r.kind === 'inq' && Array.isArray(r.qs)) || (r.kind === 'ordq' && r.q));
    if (!old.length) return false;
    this._migrating = true;
    try {
      const groups = new Map();
      old.forEach(r => { const t = r.kind === 'inq' ? 'insert' : 'order', k = r.matId + '|' + t; if (!groups.has(k)) groups.set(k, { matId: r.matId, t, rs: [] }); groups.get(k).rs.push(r); });
      for (const { matId, t, rs } of groups.values()) {
        if (!this.files.has(matId + '|#' + t)) {
          await this.saveLocal(matId, t, rs.map(r => t === 'insert' ? { id: r.id, num: r.num, updatedAt: r.updatedAt, qs: r.qs } : { id: r.id, num: r.num, updatedAt: r.updatedAt, q: r.q }));
        }
        rs.forEach(r => Store.del('meta', r.id));       // 이 PC에 들어간 뒤에만 지움
      }
      return true;
    } catch (e) { return false; }                        // 못 옮기면 meta 는 그대로 두고 다음에 다시
    finally { this._migrating = false; }
  },

  // 로그아웃: 이 PC의 은행을 모두 지움
  async wipe() {
    try { if (this.db) this.db.close(); } catch (e) { /* 이미 닫힘 */ }
    this.db = null; this.files = new Map(); this.loaded = false; this.loadP = null; this.loadErr = false;
    this.matId = ''; this.openNum = ''; this.examId = ''; this.sel.clear(); this.types.clear(); this.vars = new Set(['orig']);
    this.cnt = { mode: 'all', n: 1 }; this.arr = { type: 'group', num: 'asc' }; this.seed = 1;
    this.pick = { mode: 'manual', classId: '', sel: [] }; this.pr = { name: '', date: '', copies: '' }; this.set = null; this._cache = null;
    await new Promise(res => {
      const rq = indexedDB.deleteDatabase(this.DB);
      rq.onsuccess = rq.onerror = rq.onblocked = () => res();
    });
  },

  /* ---------- 모은 문항 (은행 + 삽입·순서) ---------- */
  mockMats() { return Inserts.mockMats(); },
  bankFiles(matId) { return [...this.files.values()].filter(f => f.matId === matId && f.kind[0] !== '#').sort((a, b) => this.tIdx((a.items[0] || {}).type) - this.tIdx((b.items[0] || {}).type)); },
  // → [{ key, gk(교재id|번호), m, num, type, v(orig|v1~v3), lev, kind(bank|ins|ord), it | q }]
  allItems(m) {
    const out = [];
    this.bankFiles(m.id).forEach(f => f.items.forEach(it => out.push({
      key: m.id + '|' + it.id, gk: m.id + '|' + it.num, m, num: it.num, type: it.type, v: it.variant || 'orig', lev: it.variant_level || '', kind: 'bank', it })));
    Inserts.recs(m.id).forEach(r => r.qs.forEach(q => out.push({ key: m.id + '|in|' + q.id, gk: m.id + '|' + r.num, m, num: r.num, type: 'insert', v: 'orig', lev: '', kind: 'ins', q })));
    Orders.recs(m.id).forEach(r => out.push({ key: m.id + '|od|' + r.num, gk: m.id + '|' + r.num, m, num: r.num, type: 'order', v: 'orig', lev: '', kind: 'ord', q: r.q }));
    return out;
  },
  dataMats() { return this.mockMats().map(m => ({ m, its: this.allItems(m) })).filter(x => x.its.length); },
  /* ---------- 학교 시험 범위 (시험+교재 › 진행중인 시험, 고등만) ---------- */
  examList() {
    return Store.all('exams').filter(e => !e.done && +e.grade >= 10 && (e.items || []).some(it => { const m = NP.mat(it.matId); return m && m.type === 'mock'; }))
      .sort((a, b) => String(a.start || '9').localeCompare(String(b.start || '9')) || ko(schoolShort(a.school), schoolShort(b.school)));
  },
  examLabel(e) { return `${schoolShort(e.school)} ${gradeLabel(e.grade)} · ${e.year}년 ${e.semester}학기 ${EXAM_KIND[e.kind] || ''}`.trim(); },
  // 시험 범위의 모의고사 번호 중 변형문제가 있는 지문 (41-42 는 41·42 어느 쪽이 범위에 있어도 들어감, 번호를 안 적은 회차는 전체)
  examGks(e, dm) {
    const out = new Set();
    (e.items || []).forEach(it => {
      const d = dm.find(x => x.m.id === it.matId); if (!d) return;
      const ns = new Set((it.nums || []).map(Number));
      d.its.forEach(x => { if (!ns.size || String(x.num).split('-').some(n => ns.has(+n))) out.add(x.gk); });
    });
    return out;
  },
  examSelHtml(cur) {
    const ex = this.examList();
    return `<select data-bkexam style="width:100%"><option value="">학교 시험 범위로 고르기 (안 고르면 직접)</option>${ex.map(e => `<option value="${esc(e.id)}" ${e.id === cur ? 'selected' : ''}>${esc(this.examLabel(e))}</option>`).join('')}</select>`;
  },

  // 탭 옆 숫자: 문제가 올라간 모의고사 수
  count() { return this.mockMats().filter(m => this.bankFiles(m.id).length || Inserts.recs(m.id).length || Orders.recs(m.id).length).length; },
  srcLabel(x) { return `${NP.shortName(x.m)} · ${x.num}번${x.v !== 'orig' ? ` (변형-${x.lev || this.vName(x.v)})` : ''}`; },
  answerOf(x) { return x.kind === 'bank' ? x.it.answer : x.q.answer; },
  stemOf(x) { return x.kind === 'ins' ? this.STEM_INS : x.kind === 'ord' ? this.STEM_ORD : (x.it.stem || ''); },

  /* =========================================================
     화면 (변형문제 탭)
     ========================================================= */
  render(main) {
    if (!this.loaded) {
      main.innerHTML = Variants.headHtml() + Variants.tabsHtml() + '<div class="panel"><div class="empty">문제 은행을 불러오는 중…</div></div>';
      main.onclick = (e) => { Variants.commonClick(e, main); };
      main.onchange = null; main.oninput = null; main.onkeydown = null;
      this.load().then(() => this.migrate()).then(() => { if (App.page === 'variants' && Variants.tab === 'mx') App.render(); });
      return;
    }
    this.migrate().then(moved => { if (moved && App.page === 'variants' && Variants.tab === 'mx') App.render(); });
    const mats = this.mockMats();
    if (this.matId && !NP.mat(this.matId)) this.matId = '';
    const m = this.matId ? NP.mat(this.matId) : null;
    const opt = (x) => { const n = this.allItems(x).length; return `<option value="${x.id}" ${m && m.id === x.id ? 'selected' : ''}>${esc(NP.matName(x))}${n ? ` (${n}문항)` : ''}</option>`; };
    let h = Variants.headHtml() + Variants.tabsHtml();
    h += `<div class="toolbar"><select data-bkmat style="min-width:280px"><option value="">교재를 고르세요</option>${mats.length ? `<optgroup label="${MAT_TYPE.mock}">${mats.map(opt).join('')}</optgroup>` : ''}</select>
      <span class="muted small">모의고사 변형문제 · 회차를 고른 뒤 Claude로 만든 파일(은행·삽입·순서)을 올림</span><span style="flex:1"></span>
      <button class="btn" data-bka="down" title="${m ? '이 회차' : '모든 회차'}의 문제 파일(json)을 zip 하나로 내려받음">${m ? '이 회차 내려받기' : '모두 내려받기'}</button>
      <button class="btn" data-bka="up">파일 올리기</button><button class="btn" data-bka="mock">모의 시험</button><button class="btn primary" data-bka="print">인쇄</button>
      <input type="file" data-bkfile accept=".json,application/json" multiple hidden></div>`;
    if (this.loadErr) h += '<div class="panel"><div class="empty">이 PC의 문제 은행 저장소를 열지 못했습니다. 브라우저를 다시 열어 보세요. (삽입·순서는 그대로 보입니다)</div></div>';
    h += m ? this.matHtml(m) : this.overviewHtml(mats);
    main.innerHTML = h;
    main.onclick = (e) => this.onClick(e, main);
    main.onchange = (e) => {
      if (e.target.matches('[data-bkmat]')) { this.matId = e.target.value; this.openNum = ''; App.render(); return; }
      if (e.target.matches('[data-bkfile]')) { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) this.upload(fs); }
    };
    main.oninput = null;
    main.onkeydown = null;
  },

  // 교재를 고르기 전: 문제가 있는 교재 목록 (삽입·순서 탭 목록과 같은 모양)
  overviewHtml(mats) {
    if (!mats.length) return '<div class="panel"><div class="empty">등록된 모의고사 교재가 없습니다.</div></div>';
    const list = mats.map(m => ({ m, its: this.allItems(m) })).filter(x => x.its.length);
    if (!list.length) return '<div class="panel"><div class="empty">올린 변형문제가 없습니다. 위에서 모의고사를 고른 뒤 “파일 올리기”로 Claude가 만든 파일(.json)을 올리세요.</div></div>';
    return `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>종류</th><th>이름</th><th>유형</th><th class="num">문항</th></tr></thead><tbody>${list.map(({ m, its }) => {
      const ts = [...new Set(its.map(x => x.type))].sort((a, b) => this.tIdx(a) - this.tIdx(b)).map(t => this.tName(t));
      return `<tr class="click" data-bkgo="${m.id}"><td class="nowrap"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span></td><td class="nowrap"><b>${esc(NP.matName(m))}</b></td>
        <td class="small">${esc(ts.join(' · '))}</td><td class="num">${its.length}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  },

  matHtml(m) {
    const its = this.allItems(m), fs = this.bankFiles(m.id);
    let h = `<div class="panel"><div class="wx-bar"><span class="np-tag mock">${MAT_TYPE.mock}</span><b class="wx-mname">${esc(NP.matName(m))}</b>
      <span class="small soft">${its.length}문항</span><span style="flex:1"></span>
      ${its.length ? '<button type="button" class="btn sm ghost danger" data-bka="delall">이 회차 문제 모두 삭제</button>' : ''}</div>`;
    if (!its.length) return h + '<div class="empty">이 모의고사에 올린 변형문제가 없습니다. “파일 올리기”로 파일을 올리세요.</div></div>';
    // 이름표: 유형마다 출제할 수 있는 전체 문항 수 (원문 + 변형 약·중·강), 유형 순서 = 모의고사 번호 순서
    const chips = this.TYPES.map(([t, nm]) => { const n = its.filter(x => x.type === t).length; return n ? `<span class="bk-file"><b>${esc(nm)}</b> ${n}문항</span>` : ''; }).filter(Boolean);
    h += `<div class="bk-files">${chips.join('')}</div>`;
    // 유형 × 원문·변형 문항 수
    const ts = [...new Set(its.map(x => x.type))].sort((a, b) => this.tIdx(a) - this.tIdx(b));
    const vs = this.VARS.filter(([v]) => its.some(x => x.v === v));
    const c = (t, v) => its.filter(x => x.type === t && (!v || x.v === v)).length;
    const tbl = (rows) => `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>유형</th>${vs.map(([, nm]) => `<th class="num">${nm}</th>`).join('')}<th class="num">계</th></tr></thead><tbody>
      ${rows.map(t => `<tr><td class="nowrap">${esc(this.tName(t))}</td>${vs.map(([v]) => `<td class="num">${c(t, v) || ''}</td>`).join('')}<td class="num"><b>${c(t)}</b></td></tr>`).join('')}</tbody></table></div>`;
    const half = Math.ceil(ts.length / 2);
    h += `<div class="bk-sumt">${tbl(ts.slice(0, half))}${ts.length > half ? tbl(ts.slice(half)) : ''}</div>`;   // 유형 표 2단
    // 지문 번호 카드
    const nums = [...new Set(its.map(x => x.num))].sort((a, b) => this.numKey(a) - this.numKey(b));
    if (!nums.includes(this.openNum)) this.openNum = '';
    h += `<div class="in-cards">${nums.map(n => `<button type="button" class="in-card${n === this.openNum ? ' on' : ''}" data-bkopen="${esc(n)}"><b>${esc(n)}번</b><span>${its.filter(x => x.num === n).length}문항</span></button>`).join('')}</div>`;
    if (!this.openNum) return h + '<p class="small muted in-tip">번호를 누르면 그 지문의 문항이 아래에 나와요.</p></div>';
    const list = its.filter(x => x.num === this.openNum).sort((a, b) => this.tIdx(a.type) - this.tIdx(b.type) || this.vIdx(a.v) - this.vIdx(b.v) || a.key.localeCompare(b.key, undefined, { numeric: true }));
    h += `<div class="wx-grp in-grp"><div class="wx-gh"><b class="wx-gl">${esc(this.openNum)}번</b><span class="small soft">${list.length}문항</span><span style="flex:1"></span>
        <button type="button" class="btn sm ghost" data-bkopen="${esc(this.openNum)}">접기</button></div>
      <ol class="wx-sl">${list.map(x => `<li class="wx-s"><span class="wx-sn bk-sn">${esc(this.tName(x.type))}${x.v !== 'orig' ? `·${esc(x.lev || this.vName(x.v))}` : ''}</span><div class="wx-st in-st">
        <div class="wx-en">${esc(this.screenLine(x))} <span class="in-ans">정답 ${this.LAB[this.answerOf(x) - 1] || '?'}</span></div>
        ${this.screenSub(x) ? `<div class="wx-ko small">${esc(this.screenSub(x))}</div>` : ''}</div></li>`).join('')}</ol></div>`;
    return h + '</div>';
  },
  // 화면 목록 한 줄: 무엇을 묻는 문항인지
  screenLine(x) {
    if (x.kind === 'ins') return x.q.given;
    if (x.kind === 'ord') return '(A)(B)(C) 순서 — ' + x.q.intro;
    const it = x.it;
    if (it.type === 'implication' && it.underlined) return `밑줄: ${it.underlined}`;
    if (it.type === 'irrelevant' && it.body) { const k = it.body.find(b => b.m === this.LAB[it.answer - 1]); return k ? `넣은 문장: ${k.t}` : it.stem; }
    if (Array.isArray(it.options) && typeof it.options[it.answer - 1] === 'string') return it.options[it.answer - 1];
    if (Array.isArray(it.options) && Array.isArray(it.options[it.answer - 1])) return it.options[it.answer - 1].join(' – ');
    return it.stem || '';
  },
  screenSub(x) {
    if (x.kind !== 'bank') return '';
    const e = (x.it.explain || [])[0] || '';
    return e.length > 150 ? e.slice(0, 150) + '…' : e;
  },

  onClick(e, main) {
    if (Variants.commonClick(e, main)) return;
    const go = e.target.closest('tr[data-bkgo]');
    if (go) { this.matId = go.dataset.bkgo; this.openNum = ''; App.render(true); return; }
    const op = e.target.closest('[data-bkopen]');
    if (op) { const n = op.dataset.bkopen; this.openNum = this.openNum === n ? '' : n; App.render(); return; }
    const b = e.target.closest('[data-bka]');
    if (!b || b.disabled) return;
    const a = b.dataset.bka;
    if (a === 'up') {
      const m = this.matId ? NP.mat(this.matId) : null;
      if (!m || m.type !== 'mock') { toast('먼저 위에서 문제를 올릴 모의고사를 고르세요.'); $('[data-bkmat]', main).focus(); return; }
      this._upMat = m.id;
      $('[data-bkfile]', main).click(); return;
    }
    if (a === 'print') { this.openPrint(); return; }
    if (a === 'mock') { MockTest.open(); return; }
    if (a === 'delall') { this.delAll(this.matId); return; }
    if (a === 'down') { this.download(this.matId ? NP.mat(this.matId) : null); return; }
  },

  // 이 회차의 변형문제를 모두 지움: 은행(이 PC) + 삽입·순서(동기화 저장 → 다른 기기에서도 지워짐)
  async delAll(matId) {
    const m = NP.mat(matId); if (!m) return;
    const fs = this.bankFiles(matId), ni = Inserts.recs(matId), no = Orders.recs(matId);
    const n = this.allItems(m).length;
    if (!n) return;
    const parts = [];
    if (fs.length) parts.push(`은행 ${fs.reduce((k, f) => k + f.items.length, 0)}문항`);
    if (ni.length) parts.push(`삽입 ${Inserts.nQs(ni)}문항`);
    if (no.length) parts.push(`순서 ${no.length}문항`);
    if (!await confirmDlg(`“${NP.matName(m)}”의 변형문제 ${n}문항을 모두 지울까요?\n${parts.join(' · ')}\n(이 PC에서 지워집니다. 미리 “이 회차 내려받기”로 받아 두면 다시 올릴 수 있어요)`, '삭제', true)) return;
    try { for (const f of fs) await this.dbDel(f.key); await this.delLocal(matId, 'insert'); await this.delLocal(matId, 'order'); }
    catch (e) { alertDlg('지우지 못했습니다', '이 PC의 저장소에서 지우지 못했습니다. 다시 해 보세요.'); return; }
    Inserts.clearSel(matId); Orders.clearSel(matId);
    [...this.sel].forEach(k => { if (k.startsWith(matId + '|')) this.sel.delete(k); });
    this._cache = null; this.openNum = '';
    toast('이 회차의 변형문제를 지웠습니다');
    App.render();
  },

  /* ---------- 내려받기 (zip) ---------- */
  FILE_NAME: { grammar: '어법', vocab: '어휘', 'gbox+vbox': '어법어휘선택', 'blank+summary': '빈칸요약', 'insert+order+irrelevant': '무관', irrelevant: '무관',
               'gist+topic+title+claim+implication+mismatch+match': '요지주제제목주장함축일치불일치', variant: '변형지문' },
  // 회차 하나 → [{ name, text }] (올리기로 그대로 다시 올릴 수 있는 형식)
  exportOf(m) {
    const exam = { year: +m.year, month: +m.month, grade: +m.grade };
    const base = `${String(m.year).slice(-2)}년 ${m.month}월 ${gradeLabel(m.grade)}`;
    const out = [];
    this.bankFiles(m.id).forEach(f => {
      const id = String((f.items[0] || {}).id || '').split(':')[0].replace(/-v\d$/, '');
      out.push({ name: `${base}_은행_${this.FILE_NAME[f.kind] || f.kind.replace(/\W+/g, '_')}.json`,
        text: JSON.stringify({ format: this.FORMAT, exam: Object.assign({ id }, exam, { title: f.title || NP.matName(m) }), type: f.kind, items: f.items }) });
    });
    const ni = Inserts.recs(m.id), no = Orders.recs(m.id);
    if (ni.length) out.push({ name: `${base}_삽입문제.json`,
      text: JSON.stringify({ format: Inserts.FORMAT, exam: Object.assign({}, exam, { title: NP.matName(m) }), passages: ni.map(r => ({ num: r.num, qs: r.qs })) }) });
    if (no.length) out.push({ name: `${base}_순서문제.json`,
      text: JSON.stringify({ format: Orders.FORMAT, exam: Object.assign({}, exam, { title: NP.matName(m) }), passages: no.map(r => ({ num: r.num, q: Object.assign({ id: r.num }, r.q) })) }) });
    return out;
  },
  download(m) {
    const list = m ? [m] : this.dataMats().map(d => d.m);
    let files = [];
    list.forEach(x => {
      const fs = this.exportOf(x);
      const dir = `${String(x.year).slice(-2)}년 ${x.month}월 ${gradeLabel(x.grade)}/`;
      files = files.concat(m ? fs : fs.map(f => ({ name: dir + f.name, text: f.text })));     // 모두 받기는 회차마다 폴더
    });
    if (!files.length) { toast('내려받을 문제가 없습니다.'); return; }
    const blob = this.zip(files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `변형문제_${m ? `${String(m.year).slice(-2)}년 ${m.month}월 ${gradeLabel(m.grade)}` : '모든 회차'}_${todayStr()}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`${files.length}개 파일을 zip으로 내려받았습니다`);
  },
  // 압축 없는 zip (파일 이름 UTF-8) — 외부 라이브러리 없이
  zip(files) {
    const enc = new TextEncoder();
    if (!this._crcT) { this._crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; this._crcT[n] = c >>> 0; } }
    const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = this._crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    const parts = [], central = [];
    let off = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, name);
      off += 30 + name.length + data.length;
    });
    const csize = central.reduce((n, b) => n + b.byteLength, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
  },

  /* ---------- 파일 올리기 ---------- */
  // 은행 파일 검사 → 오류 문장 (문제없으면 '')
  check(d) {
    const ex = d.exam || {};
    const y = +ex.year, mo = +ex.month, g = +ex.grade;
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return '파일의 연도가 올바르지 않습니다';
    if (!Number.isInteger(mo) || mo < 1 || mo > 12) return '파일의 월이 올바르지 않습니다';
    if (!Number.isInteger(g) || g < 1 || g > 12) return '파일의 학년이 올바르지 않습니다';
    if (typeof d.type !== 'string' || !d.type) return '파일 종류(type)가 없습니다';
    if (!Array.isArray(d.items) || !d.items.length) return '파일에 문항이 없습니다';
    const ids = new Set();
    for (const it of d.items) {
      const id = String((it && it.id) || '');
      if (!id || ids.has(id)) return `문항 번호가 없거나 겹칩니다: ${id}`;
      ids.add(id);
      if (!/^\d{1,2}(-\d{1,2})?$/.test(String(it.num || ''))) return `${id}: 지문 번호가 올바르지 않습니다`;
      if (this.tIdx(it.type) === 99) return `${id}: 알 수 없는 유형 ${it.type}`;
      if (!Number.isInteger(it.answer) || it.answer < 1 || it.answer > 5) return `${id}: 정답이 1~5가 아닙니다`;
      if (!['orig', 'v1', 'v2', 'v3', undefined].includes(it.variant)) return `${id}: 변형 표시가 올바르지 않습니다`;
      if (it.type !== 'insert' && it.type !== 'order' && !Array.isArray(it.paras) && !Array.isArray(it.body)) return `${id}: 지문이 없습니다`;   // 삽입·순서는 올리지 않으므로 검사 안 함
    }
    return '';
  },
  trim(it) { const o = {}; this.KEEP.forEach(k => { if (it[k] !== undefined) o[k] = it[k]; }); return o; },

  async upload(fileList) {
    const m = NP.mat(this._upMat || this.matId);
    if (!m || m.type !== 'mock') { toast('먼저 위에서 문제를 올릴 모의고사를 고르세요.'); return; }
    const banks = [], others = [], errs = [];
    for (const f of fileList) {
      let d = null;
      try { d = JSON.parse(await f.text()); } catch (e) { d = null; }
      if (!d) { errs.push(`${f.name}: 파일을 읽지 못했습니다 (JSON 파일이 아닙니다)`); continue; }
      if (d.format === this.FORMAT) { const er = this.check(d); if (er) errs.push(`${f.name}: ${er}`); else banks.push({ f, d }); }
      else if (d.format === Inserts.FORMAT || d.format === Orders.FORMAT) others.push({ f, d });
      else errs.push(`${f.name}: 변형문제 파일이 아닙니다 (형식: ${d.format || '없음'})`);
    }
    if (errs.length) await alertDlg('올릴 수 없는 파일', errs.join('\n') + (banks.length || others.length ? '\n\n나머지 파일은 이어서 올립니다.' : ''));
    if (banks.length) await this.saveBanks(m, banks);
    // 삽입·순서는 원래 탭의 올리기를 그대로 씀 (확인 창·저장 방식 같음)
    for (const { f, d } of others) {
      if (d.format === Inserts.FORMAT) { Inserts._upMat = m.id; await Inserts.upload(f); }
      else { Orders._upMat = m.id; await Orders.upload(f); }
    }
    this._cache = null;
    this.matId = m.id;
    App.render();
  },
  async saveBanks(m, banks) {
    // 같은 종류가 여러 개면 마지막 것만
    const by = new Map();
    banks.forEach(b => by.set(b.d.type, b));
    const recs = [], lines = [], skipped = [];
    const at = new Date().toISOString();
    let warn = '';
    by.forEach(({ f, d }) => {
      const all = d.items, keep = all.filter(it => it.type !== 'insert' && it.type !== 'order');
      const nOut = all.length - keep.length;
      if (!keep.length) { skipped.push(`${f.name}: 삽입·순서만 들어 있어 올리지 않음 (삽입·순서는 삽입·순서 파일로 올림)`); return; }
      if (+m.year !== +d.exam.year || +m.grade !== +d.exam.grade) warn = '\n\n※ 파일과 고른 교재의 연도·학년이 다릅니다. 회차를 다시 확인하세요.';
      recs.push({ key: m.id + '|' + d.type, matId: m.id, kind: d.type, title: String(d.exam.title || ''), at, items: keep.map(it => this.trim(it)) });
      const old = this.files.get(m.id + '|' + d.type);
      lines.push(` · ${this.kindName(d.type)} ${keep.length}문항` + (nOut ? ` (은행 속 삽입·순서 ${nOut}문항은 빼고 올림)` : '') + (old ? ' — 있던 것을 바꿈' : ''));
    });
    if (skipped.length) await alertDlg('올리지 않은 파일', skipped.join('\n'));
    if (!recs.length) return;
    const msg = `올릴 곳: “${NP.matName(m)}”\n\n${lines.join('\n')}\n\n은행 문제는 이 PC에만 저장됩니다 (로그아웃하면 지워짐).` + warn;
    if (!await confirmDlg(msg, '올리기', !!warn)) return;
    try { for (const r of recs) await this.dbPut(r); }
    catch (e) { alertDlg('저장하지 못했습니다', '이 PC의 저장 공간에 넣지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'); return; }
    toast(`${NP.matName(m)} · 은행 ${recs.length}개 파일 ${recs.reduce((n, r) => n + r.items.length, 0)}문항을 올렸습니다`);
  },

  /* =========================================================
     인쇄 창
     ========================================================= */
  loadSet() {
    if (this.set) return;
    this.set = { duplex: true };
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.LS) || 'null'); } catch (e) { s = null; }
    if (s && typeof s.duplex === 'boolean') this.set.duplex = s.duplex;
  },
  saveSet() { try { localStorage.setItem(this.LS, JSON.stringify(this.set)); } catch (e) { /* 저장 못 해도 이번에는 그대로 씀 */ } },

  // 범위에서 고른 지문의 문항 (유형·지문 종류 거르기 전)
  inRange(dm) { const out = []; dm.forEach(({ its }) => its.forEach(x => { if (this.sel.has(x.gk)) out.push(x); })); return out; },
  // 고른 조건에 맞는 문항 (개수 줄이기 전)
  picked(dm) { return this.inRange(dm).filter(x => this.types.has(x.type) && this.vars.has(x.v)); },
  // 개수: 지문·유형마다 N개 (같은 자리 slot 은 되도록 하나씩) — 씨앗이 같으면 늘 같은 결과
  limit(list) {
    if (this.cnt.mode !== 'n') return list;
    const n = Math.max(1, parseInt(this.cnt.n, 10) || 1);
    const rnd = Inserts.rng(this.seed * 7 + 3);
    const groups = new Map();
    list.forEach(x => { const k = x.gk + '#' + x.type; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const out = [];
    groups.forEach(g => {
      const sh = g.map(x => ({ x, r: rnd() })).sort((a, b) => a.r - b.r).map(y => y.x);
      const got = [], slots = new Set();
      sh.forEach(x => { const s = x.kind === 'bank' ? (x.it.slot || x.it.id) : x.key; if (got.length < n && !slots.has(s)) { got.push(x); slots.add(s); } });
      sh.forEach(x => { if (got.length < n && !got.includes(x)) got.push(x); });
      out.push(...got);
    });
    return out;
  },
  // 배열 → 인쇄 순서
  arrange(list, dm) {
    const mi = new Map(dm.map((d, i) => [d.m.id, i]));
    const rnd = Inserts.rng(this.seed);
    const r = new Map(); list.forEach(x => r.set(x.key, rnd()));
    const byNum = (a, b) => (mi.get(a.m.id) - mi.get(b.m.id)) || (this.numKey(a.num) - this.numKey(b.num)) || String(a.num).localeCompare(String(b.num));
    const natural = (a, b) => this.vIdx(a.v) - this.vIdx(b.v) || a.key.localeCompare(b.key, undefined, { numeric: true });
    // 섞을 때: 바로 앞 문항과 같은 지문은 피한다 (남은 것이 그 지문뿐일 때만 예외)
    const spread = (arr) => {
      const pool = arr.slice(), out = [];
      let last = null;
      while (pool.length) {
        let i = pool.findIndex(x => x.gk !== last);
        if (i < 0) i = 0;
        const x = pool.splice(i, 1)[0];
        out.push(x); last = x.gk;
      }
      return out;
    };
    const rs = (a, b) => r.get(a.key) - r.get(b.key);
    if (this.arr.type === 'group') {
      const out = [];
      [...new Set(list.map(x => x.type))].sort((a, b) => this.tIdx(a) - this.tIdx(b)).forEach(t => {
        const g = list.filter(x => x.type === t);
        out.push(...(this.arr.num === 'asc' ? g.sort((a, b) => byNum(a, b) || natural(a, b)) : spread(g.sort(rs))));
      });
      return out;
    }
    if (this.arr.num === 'asc') return list.slice().sort((a, b) => byNum(a, b) || rs(a, b));
    return spread(list.slice().sort(rs));
  },
  items() {
    const dm = this.dataMats();
    return this.arrange(this.limit(this.picked(dm)), dm);
  },

  openPrint() {
    const K = Prints.kit;
    const dm = this.dataMats();
    if (!dm.length) { toast('인쇄할 변형문제가 없습니다. 먼저 파일을 올리세요.'); return; }
    this.loadSet();
    K.ensureAssets(); this.ensureCss();
    // 없어진 지문은 선택에서 뺀다
    const live = new Set(); dm.forEach(({ its }) => its.forEach(x => live.add(x.gk)));
    [...this.sel].forEach(k => { if (!live.has(k)) this.sel.delete(k); });
    // 처음 열면 보고 있던 교재의 지문을 골라 둔다
    if (!this.sel.size && this.matId) dm.filter(d => d.m.id === this.matId).forEach(({ its }) => its.forEach(x => this.sel.add(x.gk)));
    const radio = (name, val, cur, label) => `<label class="chk"><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''}>${label}</label>`;
    const body = `<div class="pr-wrap wx-pw">
      <aside class="panel pr-side wx-pside">
        <div class="pr-sec"><h2>범위</h2>
          <div style="margin-bottom:6px">${this.examSelHtml(this.examId)}</div>
          <div class="wx-psbtn"><button type="button" class="btn sm" data-bka="bp-all">전체 선택</button><button type="button" class="btn sm" data-bka="bp-none">선택 해제</button></div>
          <div class="wx-pslist" data-bksel>${this.selHtml(dm)}</div></div>
        <div class="pr-sec"><h2>유형</h2>
          <div class="wx-psbtn"><button type="button" class="btn sm" data-bka="bt-all">모두</button><button type="button" class="btn sm" data-bka="bt-none">해제</button></div>
          <div class="np-chips" data-bktypes>${this.typesHtml(dm)}</div></div>
        <div class="pr-sec"><h2>지문</h2>
          <div class="np-chips" data-bkvars>${this.varsHtml(dm)}</div>
          <p class="pr-hint">원문 = 모의고사 지문 그대로, 약·중·강 = 낱말·문장 구조를 바꾼 지문의 변형 강도 (어법·어휘·어법 선택·어휘 선택·빈칸·무관만 있어요).</p></div>
        <div class="pr-sec"><h2>개수</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="개수">
            ${radio('bk-cnt', 'all', this.cnt.mode, '전체')}
            <label class="chk"><input type="radio" name="bk-cnt" value="n" ${this.cnt.mode === 'n' ? 'checked' : ''}>지문·유형마다</label>
            <input type="number" data-bk-n min="1" max="50" step="1" value="${esc(String(this.cnt.n))}" style="width:56px" ${this.cnt.mode === 'n' ? '' : 'disabled'} aria-label="지문·유형마다 문항 수">개</div>
          <p class="pr-hint">고른 지문 하나, 유형 하나마다 몇 문항을 낼지예요 (1~50). 그 지문·유형에 있는 문항보다 크게 적으면 있는 만큼 모두 나와요. 같은 자리의 다른 버전은 되도록 겹치지 않게 골라요.</p></div>
        <div class="pr-sec"><h2>배열</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="유형 배열"><span class="small soft" style="min-width:34px">유형</span>
            ${radio('bk-at', 'group', this.arr.type, '유형별로 묶기')}${radio('bk-at', 'mix', this.arr.type, '섞기')}</div>
          <div class="pr-nm-mode" role="radiogroup" aria-label="번호 배열" style="margin-top:6px"><span class="small soft" style="min-width:34px">번호</span>
            ${radio('bk-an', 'asc', this.arr.num, '순서대로')}${radio('bk-an', 'shuffle', this.arr.num, '섞기')}</div>
          <button type="button" class="btn sm" data-bka="bp-shuffle" style="margin-top:8px">다시 섞기</button>
          <p class="pr-hint">번호를 섞으면 같은 지문의 문항은 붙지 않게 섞어요. 모든 부가 같은 순서예요.</p></div>
        <div class="pr-sec"><h2>글자</h2>
          <label class="pr-fld"><span>학원명</span><input type="text" data-bp-ac value="${esc(K.academy())}" placeholder="학원명을 입력하세요" maxlength="40" autocomplete="off"></label>
          <p class="pr-hint">표지+양식의 학원명과 같은 값이에요.</p>
          <label class="pr-fld"><span>날짜 (선택)</span>
            <div class="pr-inline"><input type="date" data-bp-date value="${esc(this.pr.date)}" aria-label="날짜"><button type="button" class="btn sm" data-bka="bp-date-clear">지우기</button></div></label>
          <p class="pr-hint">비워 두면 날짜 칸이 빈 줄로 나와요.</p></div>
        <div class="pr-sec"><h2>학생 이름</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="학생 이름 넣는 방식">
            <label class="chk"><input type="radio" name="bp-nm-mode" value="manual" ${this.pick.mode === 'class' ? '' : 'checked'}>직접 입력</label>
            <label class="chk"><input type="radio" name="bp-nm-mode" value="class" ${this.pick.mode === 'class' ? 'checked' : ''}>반에서 선택</label>
          </div>
          <div data-bp-nmbody>${this.nmBodyHtml()}</div></div>
        <div class="pr-sec"><h2>출력</h2>
          <label class="chk pr-chk"><input type="checkbox" data-bp-duplex ${this.set.duplex ? 'checked' : ''}>양면 프린터 사용</label>
          <p class="pr-hint" data-bp-dxhint>${this.dxHint()}</p>
          <div class="pr-print" style="margin-top:10px">
            <input type="number" data-bp-copies min="1" max="500" step="1" value="${esc(this.pr.copies)}" placeholder="부수" aria-label="출력 부수"${this.pick.mode === 'class' ? ' disabled' : ''}>
            <button type="button" class="btn primary" data-bka="bp-print" data-bp-printbtn>${this.printLabel()}</button>
          </div>
          <div class="pr-note">인쇄창에서 배율은 <b>기본값(100%)</b>으로 두세요. 양면 프린터를 사용할 땐 인쇄창의 <b>양면 인쇄</b>도 켜져 있어야 해요.</div></div>
      </aside>
      <section class="wx-pview" data-bkprev><p class="pr-hint bk-psum" data-bksum></p><div data-bkpv></div></section>
    </div>`;
    Modal.open({
      title: '변형문제 인쇄', size: 'xl wx-pmodal', body, autofocus: false,
      onMount: (b, md) => {
        const upd = debounce(() => this.prevBuild(b, md), 200);
        const syncIndet = () => $$('[data-indet]', b).forEach(x => { x.indeterminate = true; });
        // 범위·유형·지문이 바뀌면 왼쪽 숫자도 다시
        const refreshPick = () => {
          const d = this.dataMats();
          const box = $('[data-bksel]', b), top = box.scrollTop;
          box.innerHTML = this.selHtml(d); box.scrollTop = top;
          $('[data-bktypes]', b).innerHTML = this.typesHtml(d);
          $('[data-bkvars]', b).innerHTML = this.varsHtml(d);
          syncIndet(); upd();
        };
        const refreshNm = (listToo) => {
          if (listToo) { const l = $('[data-bp-list]', b); if (l) { const bx = $('.pr-nm-stus', l), t = bx ? bx.scrollTop : 0; l.innerHTML = this.nmListHtml(); const nb = $('.pr-nm-stus', l); if (nb) nb.scrollTop = t; } }
          const p = $('[data-bp-picked]', b); if (p) p.innerHTML = this.nmPickedHtml();
          syncIndet();
          $('[data-bp-printbtn]', b).textContent = this.printLabel();
          $('[data-bp-copies]', b).disabled = this.pick.mode === 'class';
          upd();
        };
        syncIndet();
        b.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-bsg]');
          if (chip) { const k = chip.dataset.bsg; if (this.sel.has(k)) this.sel.delete(k); else this.sel.add(k); refreshPick(); return; }
          const tc = e.target.closest('[data-bkt]');
          if (tc) { const t = tc.dataset.bkt; if (this.types.has(t)) this.types.delete(t); else this.types.add(t); refreshPick(); return; }
          const vc = e.target.closest('[data-bkv]');
          if (vc) { const v = vc.dataset.bkv; if (this.vars.has(v)) this.vars.delete(v); else this.vars.add(v); refreshPick(); return; }
          const bt = e.target.closest('[data-bka]'); if (!bt) return;
          const a = bt.dataset.bka;
          if (a === 'bp-all') { this.dataMats().forEach(d => d.its.forEach(x => this.sel.add(x.gk))); refreshPick(); }
          else if (a === 'bp-none') { this.sel.clear(); refreshPick(); }
          else if (a === 'bt-all') { const d = this.dataMats(); this.availTypes(d).forEach(t => this.types.add(t)); refreshPick(); }
          else if (a === 'bt-none') { this.types.clear(); refreshPick(); }
          else if (a === 'bp-shuffle') { this.seed = (this.seed * 7919 + 104729) % 2147483647 || 1; upd(); }
          else if (a === 'bp-date-clear') { this.pr.date = ''; $('[data-bp-date]', b).value = ''; upd(); }
          else if (a === 'bp-nm-clear') { this.pick.sel = []; refreshNm(true); }
          else if (a === 'bp-print') this.doPrint(b);
        });
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-bp-ac]')) { K.setAcademy(t.value); upd(); }
          else if (t.matches('[data-bp-date]')) { this.pr.date = isYmd(t.value) ? t.value : ''; upd(); }
          else if (t.matches('[data-bp-name]')) { this.pr.name = t.value; upd(); }
          else if (t.matches('[data-bp-copies]')) this.pr.copies = t.value;
          else if (t.matches('[data-bk-n]')) { const v = parseInt(t.value, 10); if (v >= 1 && v <= 50) { this.cnt.n = v; upd(); } }
        });
        b.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-bkexam]')) {
            this.examId = t.value;
            const ex = t.value ? Store.get('exams', t.value) : null;
            if (ex) { this.sel = this.examGks(ex, this.dataMats()); if (!this.sel.size) toast('이 시험 범위에 올린 변형문제가 없어요.'); }
            refreshPick();
          } else if (t.matches('[data-bsm]')) {
            const d = this.dataMats().find(y => y.m.id === t.dataset.bsm);
            if (d) d.its.forEach(x => { if (t.checked) this.sel.add(x.gk); else this.sel.delete(x.gk); });
            refreshPick();
          } else if (t.matches('[name="bk-cnt"]')) {
            this.cnt.mode = t.value === 'n' ? 'n' : 'all'; $('[data-bk-n]', b).disabled = this.cnt.mode !== 'n'; upd();
          } else if (t.matches('[name="bk-at"]')) { this.arr.type = t.value === 'mix' ? 'mix' : 'group'; upd(); }
          else if (t.matches('[name="bk-an"]')) { this.arr.num = t.value === 'shuffle' ? 'shuffle' : 'asc'; upd(); }
          else if (t.matches('[data-bp-duplex]')) {
            this.set.duplex = t.checked; this.saveSet();
            $('[data-bp-dxhint]', b).textContent = this.dxHint(); upd();
          } else if (t.matches('[name="bp-nm-mode"]')) {
            if (!t.checked) return;
            this.pick.mode = t.value === 'class' ? 'class' : 'manual';
            $('[data-bp-nmbody]', b).innerHTML = this.nmBodyHtml(); refreshNm(false);
          } else if (t.matches('[data-bp-class]')) {
            this.pick.classId = t.value;
            const l = $('[data-bp-list]', b); if (l) l.innerHTML = '';
            refreshNm(true);
          } else if (t.matches('[data-bp-all]')) {
            this.nmToggle(K.roster(this.pick.classId).map(s => s.id), t.checked); refreshNm(true);
          } else if (t.matches('[data-bp-stu]')) {
            this.nmToggle([t.dataset.bpStu], t.checked); refreshNm(true);
          }
        });
        this.prevBuild(b, md);
      },
      onClose: () => { this._tok++; },
      buttons: [{ text: '닫기' }],
    });
  },
  dxHint() {
    return this.set.duplex ? '문제지가 홀수 쪽이면 빈 면을 넣어 해설지가 늘 새 종이에서 시작하고, 해설지가 홀수 쪽이면 빈 면을 넣어 다음 부도 새 종이에서 시작해요.' : '단면 프린터용: 빈 면 없이 차례대로 인쇄해요. 해설지는 늘 새 쪽에서 시작해요.';
  },
  printLabel() { const n = this.pickStudents().length; return this.pick.mode === 'class' ? `인쇄 / PDF (${n}명)` : '인쇄 / PDF'; },

  // 범위: 모의고사별 체크 + 지문 칩 (칩 숫자 = 지금 고른 유형·지문 종류의 문항 수)
  selHtml(dm) {
    return dm.map(({ m, its }) => {
      const nums = [...new Set(its.map(x => x.num))].sort((a, b) => this.numKey(a) - this.numKey(b));
      const on = nums.filter(n => this.sel.has(m.id + '|' + n)).length;
      const cnt = (n) => its.filter(x => x.num === n && this.types.has(x.type) && this.vars.has(x.v)).length;
      return `<div class="wx-psm"><label class="chk wx-psmh"><input type="checkbox" data-bsm="${m.id}" ${on === nums.length ? 'checked' : ''}${on && on < nums.length ? ' data-indet' : ''}>
        <span class="np-tag mock">${MAT_TYPE.mock}</span><b>${esc(NP.matName(m))}</b></label>
        <div class="np-chips">${nums.map(n => `<button type="button" class="np-c sm ${this.sel.has(m.id + '|' + n) ? 'on' : ''}" data-bsg="${esc(m.id + '|' + n)}">${esc(n)}번<small class="wx-cnt">${cnt(n)}</small></button>`).join('')}</div></div>`;
    }).join('');
  },
  // 범위 안에 있는 유형 (범위를 안 골랐으면 전체)
  availTypes(dm) {
    const base = this.sel.size ? this.inRange(dm) : [].concat(...dm.map(d => d.its));
    return [...new Set(base.map(x => x.type))].sort((a, b) => this.tIdx(a) - this.tIdx(b));
  },
  typesHtml(dm) {
    const base = this.sel.size ? this.inRange(dm) : [].concat(...dm.map(d => d.its));
    const av = new Set(base.map(x => x.type));
    return this.TYPES.filter(([t]) => av.has(t) || this.types.has(t)).map(([t, nm]) => {
      const n = base.filter(x => x.type === t && this.vars.has(x.v)).length;
      return `<button type="button" class="np-c sm ${this.types.has(t) ? 'on' : ''}" data-bkt="${t}">${nm}<small class="wx-cnt">${n}</small></button>`;
    }).join('') || '<span class="small soft">올린 문제가 없어요.</span>';
  },
  varsHtml(dm) {
    const base = this.sel.size ? this.inRange(dm) : [].concat(...dm.map(d => d.its));
    return this.VARS.map(([v, nm]) => {
      const n = base.filter(x => x.v === v && this.types.has(x.type)).length;
      return `<button type="button" class="np-c sm ${this.vars.has(v) ? 'on' : ''}" data-bkv="${v}">${nm}<small class="wx-cnt">${n}</small></button>`;
    }).join('');
  },

  /* ---------- 학생 이름 (삽입·순서 탭과 같은 방식) ---------- */
  pickStudents() { return this.pick.sel.map(id => Store.get('students', id)).filter(Boolean); },
  nmBodyHtml() {
    const K = Prints.kit;
    if (this.pick.mode !== 'class') return `<label class="pr-fld"><span>학생 이름</span><input type="text" data-bp-name value="${esc(this.pr.name)}" placeholder="비워 두면 빈 줄로 나와요" maxlength="20" autocomplete="off"></label>`;
    const cls = K.classes();
    if (this.pick.classId && !cls.some(c => c.id === this.pick.classId)) this.pick.classId = '';
    return `<label class="pr-fld"><span>반</span>
        <select data-bp-class><option value="">반을 고르세요</option>
          ${cls.map(c => `<option value="${esc(c.id)}"${c.id === this.pick.classId ? ' selected' : ''}>${esc(c.name)} (${K.roster(c.id).length}명)</option>`).join('')}</select></label>
      <div class="pr-nm-list" data-bp-list>${this.nmListHtml()}</div>
      <div class="pr-nm-picked" data-bp-picked>${this.nmPickedHtml()}</div>
      <p class="pr-hint">다른 반을 골라도 체크한 학생은 그대로 남아요. 고른 학생마다 한 부씩, 이름만 바뀌어 인쇄돼요.</p>`;
  },
  nmListHtml() {
    if (!this.pick.classId) return '<div class="none">반을 고르면 학생 목록이 나와요.</div>';
    const ros = Prints.kit.roster(this.pick.classId);
    if (!ros.length) return '<div class="none">이 반에는 재원생이 없어요.</div>';
    const on = new Set(this.pick.sel);
    const all = ros.every(s => on.has(s.id)), some = ros.some(s => on.has(s.id));
    return `<label class="chk pr-nm-all"><input type="checkbox" data-bp-all ${all ? 'checked' : ''}${!all && some ? ' data-indet' : ''}>반 전체 선택</label>
      <div class="pr-nm-stus">${ros.map(s => `<label class="chk"><input type="checkbox" data-bp-stu="${esc(s.id)}" ${on.has(s.id) ? 'checked' : ''}>${esc(s.name)}${stTag(s) ? ` <small>${esc(stTag(s))}</small>` : ''}</label>`).join('')}</div>`;
  },
  nmPickedHtml() {
    const list = this.pickStudents();
    if (!list.length) return '<span class="none">고른 학생: 없음</span>';
    return `<div class="pr-nm-ph"><b>고른 학생 ${list.length}명</b><button type="button" class="btn sm" data-bka="bp-nm-clear">모두 해제</button></div>
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
  // 머리글: 삽입·순서 탭과 같은 모양 (학원명 · 날짜 · 이름)
  headHtml(nm) {
    const K = Prints.kit, dt = K.dateText(this.pr.date), n = String(nm || '').trim();
    return `<div class="pn-head"><div class="pn-academy">${esc(K.academy())}</div><div class="pn-fields">
        <span class="pn-field">날짜<span class="pn-blank${dt ? ' pn-val' : ''}" style="width:30mm">${esc(dt)}</span></span>
        <span class="pn-field">이름<span class="pn-blank${n ? ' pn-val' : ''}" style="width:38mm">${esc(n)}</span></span>
      </div></div>`;
  },
  // 지문 조각 → HTML ({t} 글 · {u,n} 번호 밑줄 · {u} 밑줄 · {box,pair} 네모 · {blank} 빈칸)
  seg(s) {
    if (s.t !== undefined) return esc(s.t);
    if (s.u !== undefined) return s.n ? `<span class="bk-mk">${this.LAB[s.n - 1]}</span><u>${esc(s.u)}</u>` : `<u>${esc(s.u)}</u>`;
    if (s.box) return `<span class="bk-boxw"><span class="bk-boxl">(${esc(s.box)})</span><span class="bk-box">${esc(s.pair[0])} / ${esc(s.pair[1])}</span></span>`;
    if (s.blank) return `<span class="bk-blank">${s.blank === true ? '' : `(${esc(s.blank)})`}</span>`;
    return '';
  },
  parasHtml(paras) { return paras.map(p => `<p class="in-tx">${p.map(s => this.seg(s)).join('')}</p>`).join(''); },
  // 무관: 문장마다 번호 (np = 새 문단)
  bodyHtml(body) {
    const ps = [[]];
    body.forEach((b, i) => {
      if (b.np && i && ps[ps.length - 1].length) ps.push([]);
      ps[ps.length - 1].push(b.m ? `<span class="bk-mk">${esc(b.m)}</span> ${esc(b.t)}` : esc(b.t));
    });
    return ps.map(p => `<p class="in-tx">${p.join(' ')}</p>`).join('');
  },
  optsHtml(it) {
    const o = it.options;
    if (!Array.isArray(o) || !o.length) return '';
    if (Array.isArray(o[0])) {
      const hs = o[0].map((_, i) => `(${'ABC'[i]})`);
      return `<table class="bk-ot"><thead><tr><th></th>${hs.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${o.map((row, i) => `<tr><td>${this.LAB[i]}</td>${row.map((c, j) => `<td>${esc(c)}${j < row.length - 1 ? ' <span class="bk-dots">……</span>' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    return `<div class="bk-opts">${o.map((x, i) => `<div><span class="bk-ol">${this.LAB[i]}</span>${esc(x)}</div>`).join('')}</div>`;
  },
  qHtml(x, no, showStem) {
    const head = `<div class="in-qh"><span class="in-no">${no}.</span><span class="in-src">${esc(this.srcLabel(x))}</span></div>`;
    const stem = showStem ? `<div class="bk-stem">${esc(this.stemOf(x))}</div>` : '';
    if (x.kind === 'ins') return `<div class="in-q">${head}${stem}<div class="in-given">${esc(x.q.given)}</div>${Inserts.bodyHtml(x.q)}</div>`;
    if (x.kind === 'ord') return `<div class="in-q">${head}${stem}<div class="od-given">${esc(x.q.intro)}</div>
      ${'ABC'.split('').map(c => `<p class="od-tx"><b>(${c})</b> ${esc(x.q[c])}</p>`).join('')}
      <div class="od-opts">${Orders.OPTS.map((o, i) => `<span>${this.LAB[i]} ${o.split('').map(c => `(${c})`).join(' – ')}</span>`).join('')}</div></div>`;
    const it = x.it;
    const body = Array.isArray(it.body) ? this.bodyHtml(it.body) : this.parasHtml(it.paras || []);
    const sum = Array.isArray(it.summary) ? `<div class="bk-arrow">↓</div><div class="bk-sum">${it.summary.map(s => this.seg(s)).join('')}</div>` : '';
    return `<div class="in-q">${head}${stem}${body}${sum}${this.optsHtml(it)}</div>`;
  },
  // 해설지 한 칸
  akHtml(x, no) {
    const ans = this.LAB[this.answerOf(x) - 1] || '?';
    const ex = x.kind === 'bank' ? (x.it.explain || []) : [];
    return `<div class="bk-ak"><div class="bk-akh"><b>${no}.</b><span class="bk-aka">${ans}</span><span class="bk-aks">${esc(this.srcLabel(x))} · ${esc(this.tName(x.type))}</span></div>
      ${ex.map(l => `<p class="bk-akx">${esc(l)}</p>`).join('')}</div>`;
  },
  // 2단 흘려 넣기: blocks 를 차례대로 칸에 채움 → 쪽마다 본문 HTML
  flow(host, blocks, sheetCls, dirHtml) {
    const pages = [];
    let cols = null, ci = 0, first = true;
    const newPage = () => {
      host.innerHTML = `<div class="pn-sheet ${sheetCls}">${this.headHtml('')}${first ? dirHtml : ''}<div class="in-body"><div class="in-col"></div><div class="in-col"></div></div></div>`;
      cols = [...host.querySelectorAll('.in-col')]; ci = 0; first = false;
    };
    const take = () => { const d = host.querySelector('.in-dir'); return (d ? d.outerHTML : '') + host.querySelector('.in-body').outerHTML; };
    const fits = (col) => { const l = col.lastElementChild; return !l || l.getBoundingClientRect().bottom <= col.getBoundingClientRect().bottom - 2; };
    newPage();
    let i = 0;
    while (i < blocks.length) {
      const col = cols[ci], empty = !col.children.length;
      col.insertAdjacentHTML('beforeend', blocks[i]);
      if (empty || fits(col)) { i++; continue; }
      col.lastElementChild.remove();
      if (ci === 0) { ci = 1; continue; }
      pages.push(take());
      newPage();
    }
    pages.push(take());
    return pages;
  },
  // 쪽 나누기 (화면 밖에 실제 크기로 그려서 잰다) → { qs:[문제지 본문], ak:[해설지 본문], n }
  async paginate(items, title) {
    const key = items.map(x => x.key).join('|') + '#' + this.seed + '#' + (title || '');
    if (this._cache && this._cache.key === key) return this._cache;
    await Inserts.fontsReady();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;z-index:-1';
    document.body.appendChild(host);
    try {
      const ts = [...new Set(items.map(x => x.type))];
      const one = ts.length === 1 && !title;    // 한 유형뿐이면 발문은 첫 쪽에 한 번 (삽입·순서 탭과 같음), 여러 유형이면 문항마다
      const tag = title || (one ? this.tName(ts[0]) : '변형문제');
      const dir = `<div class="in-dir"><span class="pn-tag">${esc(tag)} · ${items.length}문항</span>${one ? `<span>${esc(this.stemOf(items[0]))}</span>` : ''}</div>`;
      const qs = this.flow(host, items.map((x, i) => this.qHtml(x, i + 1, !one)), 'in-qs', dir);
      let ak;
      if (items.some(x => x.kind === 'bank')) {
        ak = this.flow(host, items.map((x, i) => this.akHtml(x, i + 1)), 'in-aks', `<div class="in-dir"><span class="pn-tag">${esc(tag)} 정답·해설 · ${items.length}문항</span></div>`);
      } else {
        // 삽입·순서만: 정답만 4줄 칸 (삽입·순서 탭 정답지와 같은 모양)
        ak = [];
        const ROW = 7, NCOL = 4, MM = Prints.kit.MM_PER_PX;
        const AKH = `<div class="in-dir"><span class="pn-tag">${esc(tag)} 정답 · ${items.length}문항</span></div>`;
        host.innerHTML = `<div class="pn-sheet in-aks">${this.headHtml('')}${AKH}<div class="in-akb"></div></div>`;
        const per = Math.max(1, Math.floor(($('.in-akb', host).clientHeight * MM) / ROW)) * NCOL;
        const rows = items.map((x, i) => `<div class="in-akr"><span class="in-akn">${i + 1}</span><span class="in-aka">${this.LAB[this.answerOf(x) - 1]}</span><span class="in-aks">${esc(`${String(x.m.year).slice(-2)}.${x.m.month} · ${x.num}번`)}</span></div>`);
        for (let i = 0; i < rows.length; i += per) {
          const chunk = rows.slice(i, i + per), rpc = Math.ceil(per / NCOL), cs = [];
          for (let c = 0; c < NCOL; c++) cs.push(`<div class="in-akc">${chunk.slice(c * rpc, (c + 1) * rpc).join('')}</div>`);
          ak.push(`${AKH}<div class="in-akb">${cs.join('')}</div>`);
        }
      }
      this._cache = { key, qs, ak, n: items.length };
      return this._cache;
    } finally { host.remove(); }
  },
  // 한 부 = 문제지 (+빈 면) + 해설지 (+빈 면) → [{ html, cap, blank }]
  copyPages(pg, nm) {
    const blank = { html: '<div class="pn-sheet"></div>', cap: '빈 면 (양면 인쇄용)', blank: true };
    const out = [];
    pg.qs.forEach((b, i) => out.push({ html: `<div class="pn-sheet in-qs">${this.headHtml(nm)}${b}</div>`, cap: `문제 ${i + 1}/${pg.qs.length}` }));
    if (this.set.duplex && pg.qs.length % 2) out.push(blank);
    pg.ak.forEach((b, i) => out.push({ html: `<div class="pn-sheet in-aks">${this.headHtml(nm)}${b}</div>`, cap: `해설 ${i + 1}/${pg.ak.length}` }));
    if (this.set.duplex && pg.ak.length % 2) out.push(blank);
    return out;
  },
  // 미리보기: 한 부 (반에서 선택이면 첫 학생 이름)
  async prevBuild(b, md) {
    const tok = ++this._tok;
    const pv = $('[data-bkpv]', b), sm = $('[data-bksum]', b);
    if (!this.sel.size) { pv.innerHTML = '<div class="wx-pv-empty">왼쪽 범위에서 인쇄할 지문을 고르세요.</div>'; sm.textContent = ''; return; }
    if (!this.types.size) { pv.innerHTML = '<div class="wx-pv-empty">왼쪽에서 유형을 고르세요.</div>'; sm.textContent = ''; return; }
    if (!this.vars.size) { pv.innerHTML = '<div class="wx-pv-empty">왼쪽에서 지문(원문·약·중·강)을 고르세요.</div>'; sm.textContent = ''; return; }
    const items = this.items();
    if (!items.length) { pv.innerHTML = '<div class="wx-pv-empty">고른 조건에 맞는 문항이 없어요.</div>'; sm.textContent = '고른 문항: 없음'; return; }
    if (!pv.children.length || $('.wx-pv-empty', pv)) pv.innerHTML = '<div class="wx-pv-empty">미리보기를 만드는 중…</div>';
    const pg = await this.paginate(items);
    if (tok !== this._tok || md.closed) return;
    const nm = this.pick.mode === 'class' ? ((this.pickStudents()[0] || {}).name || '') : this.pr.name;
    const pages = this.copyPages(pg, nm).filter(p => !p.blank);      // 빈 면은 인쇄할 때만 넣고 미리보기에는 보이지 않음
    sm.textContent = `고른 문항 ${items.length}개 → 문제 ${pg.qs.length}쪽 + 해설 ${pg.ak.length}쪽`;
    const K = Prints.kit, s = 0.36;
    pv.innerHTML = `<div class="wx-pv-h">미리보기 · 한 부${nm ? ` (${esc(nm)})` : ''} · 누르면 크게 보기</div><div class="wx-pv-grid">${pages.map((p, i) => `<figure class="wx-th in-th" data-bkbig="${i}">
        <div class="wx-thb" style="width:${(K.PAGE_W * s).toFixed(1)}px;height:${(K.PAGE_H * s).toFixed(1)}px"><div style="transform:scale(${s});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div>
        <figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div>`;
    pv.onclick = (e) => {
      const f = e.target.closest('[data-bkbig]'); if (!f) return;
      const p = pages[+f.dataset.bkbig]; if (!p) return;
      const z = Math.min(1, (window.innerWidth * 0.9) / K.PAGE_W);
      Modal.open({ title: p.cap, size: 'xl', autofocus: false,
        body: `<div style="overflow:auto;max-height:calc(100vh - 160px)"><div class="wx-thb" style="width:${(K.PAGE_W * z).toFixed(1)}px;height:${(K.PAGE_H * z).toFixed(1)}px;margin:0 auto"><div style="transform:scale(${z});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div></div>`,
        buttons: [{ text: '닫기', cls: 'primary', primary: true }] });
    };
  },

  async doPrint(b) {
    if (!this.sel.size || !this.types.size || !this.vars.size) { toast('인쇄할 지문·유형을 고르세요.'); return; }
    const items = this.items();
    if (!items.length) { toast('고른 조건에 맞는 문항이 없습니다.'); return; }
    let names;
    if (this.pick.mode === 'class') {
      const list = this.pickStudents();
      if (!list.length) { toast('인쇄할 학생을 선택하세요.'); return; }
      names = list.map(s => s.name);
    } else {
      const inp = $('[data-bp-copies]', b), v = String(inp.value || '').trim();
      if (v === '') { toast('출력 부수를 입력하세요.'); inp.focus(); return; }
      const n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
      if (n < 1 || n > 500) { toast('출력 부수는 1에서 500 사이로 입력하세요.'); inp.focus(); return; }
      names = Array.from({ length: n }, () => this.pr.name);
    }
    const pg = await this.paginate(items);
    const html = names.map(nm => this.copyPages(pg, nm).map(p => p.html).join('')).join('');
    Prints.kit.printPaper(html, `변형문제_${todayStr()}`, Inserts.PAPER_CSS + Orders.PAPER_CSS + this.PAPER_CSS);
  },

  /* ---------- 종이 CSS (삽입·순서 종이 CSS 위에 더함 · 같은 글꼴·크기) ---------- */
  PAPER_CSS: `
.pn-sheet .in-dir > span:not(.pn-tag){font-weight:400;font-size:9pt}
.pn-sheet .bk-stem{font-family:"Noto Serif KR",serif;font-size:8.6pt;font-weight:700;line-height:1.4;color:#1f272d;margin:0 0 1.4mm}
.pn-sheet .in-q .in-tx u{text-decoration:underline;text-underline-offset:0.5mm}
.pn-sheet .bk-mk{font-weight:700;margin-right:0.5mm;text-indent:0}
.pn-sheet .bk-boxw{white-space:nowrap}
.pn-sheet .bk-boxl{font-weight:700;margin-right:0.6mm}
.pn-sheet .bk-box{display:inline-block;border:0.25mm solid #39434a;padding:0 1.2mm;line-height:1.25;text-indent:0;white-space:nowrap}
.pn-sheet .bk-blank{display:inline-block;min-width:24mm;border-bottom:0.25mm solid #1f272d;text-align:center;text-indent:0;line-height:1.1;font-weight:700}
.pn-sheet .bk-arrow{text-align:center;font-size:9pt;line-height:1;margin:1.2mm 0 0.6mm;color:#1f272d}
.pn-sheet .bk-sum{border:0.3mm solid #39434a;padding:1.5mm 2.4mm;font-family:"Noto Serif KR",serif;font-size:8.8pt;line-height:1.7;color:#1f272d;text-align:justify;overflow-wrap:anywhere}
.pn-sheet .bk-opts{margin-top:1.6mm;font-family:"Noto Serif KR",serif;font-size:8.6pt;line-height:1.45;color:#1f272d}
.pn-sheet .bk-opts > div{padding-left:5mm;text-indent:-5mm;overflow-wrap:anywhere}
.pn-sheet .bk-ol{display:inline-block;width:5mm;text-indent:0}
.pn-sheet .bk-ot{margin-top:1.6mm;border-collapse:collapse;font-family:"Noto Serif KR",serif;font-size:8.6pt;color:#1f272d}
.pn-sheet .bk-ot th{font-weight:700;padding:0 2mm 0.4mm 0;text-align:left}
.pn-sheet .bk-ot td{padding:0.2mm 2mm 0.2mm 0;white-space:nowrap}
.pn-sheet .bk-dots{color:#6b747a}
.pn-sheet .bk-ak{padding-bottom:2.6mm;font-family:"Noto Serif KR",serif;color:#1f272d}
.pn-sheet .bk-akh{display:flex;align-items:baseline;gap:1.6mm;font-size:9pt;margin-bottom:0.6mm}
.pn-sheet .bk-aka{font-weight:700;font-size:11pt}
.pn-sheet .bk-aks{font-size:7pt;color:var(--pn-ink-soft)}
.pn-sheet .bk-akx{font-size:7.6pt;line-height:1.45;margin:0 0 0.4mm;padding-left:3mm;text-indent:-3mm;overflow-wrap:anywhere}
`,
  ensureCss() {
    Inserts.ensureCss(); Orders.ensureCss();
    if (document.getElementById('bk-paper-css')) return;
    const st = document.createElement('style');
    st.id = 'bk-paper-css';
    st.textContent = this.PAPER_CSS;
    document.head.appendChild(st);
  },
};

/* 변형문제 탭·인쇄 창 화면 스타일 (테마 변수만 사용 · 나머지는 삽입 탭의 in- 과 서술형 탭의 wx- 스타일을 같이 씀) */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.bk-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.bk-file { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border: 1px solid var(--line-strong); border-radius: 14px; background: var(--surface); font-size: 13px; }
.bk-sumt { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; margin-top: 10px; max-width: 1040px; }
@media (max-width: 900px) { .bk-sumt { grid-template-columns: 1fr; } }
.bk-sn { width: auto !important; min-width: 44px; font-size: 12px; white-space: nowrap; }
.bk-psum { margin: 0 0 8px; }
`;
  document.head.appendChild(st);
})();
