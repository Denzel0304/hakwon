/* =========================================================
   inserts.js — 시험+교재 › 삽입 (모의고사 지문으로 만든 문장 삽입 문제)
   · 문제는 Claude로 미리 만든 파일(형식 mg77-insert-v1, .json)을 "파일 올리기"로 탑재한다
       파일의 연도·월·학년과 같은 모의고사 교재에 붙는다 (교재가 없으면 만들지 물어봄). 교재 연결은 이름·목록용일 뿐 다른 기능과 연동 없음
   · 저장: meta 테이블 (다른 기기와 동기화 · 테이블 추가 없음) — 지문 하나에 기록 하나
       id 'IN_'+교재id+'_'+번호, { kind:'inq', matId, num:'20' | '41-42', qs:[{ id:'20-1', given, body:[{ t, np? } | { m:'①' }], answer:1~5 }], updatedAt }
   · 인쇄 (이 탭의 인쇄 창): 여러 모의고사에서 지문(번호)을 골라 그 지문의 문항을 모두 인쇄한다
       순서는 늘 섞는다 — 같은 지문 문항은 붙지 않게, 되도록 같은 쪽에도 오지 않게 (모든 부가 같은 순서, "다시 섞기"로 바꿈)
       한 부 = 문제지(2단) (+빈 면) + 정답지 (+빈 면) → 정답지는 늘 새 종이에서 시작, 다음 부도 새 종이에서 시작
       종이·머리글(학원명·날짜·이름)·학생 목록·인쇄 방식은 표지+양식(Prints.kit)의 것을 그대로 씀
   ========================================================= */
const Inserts = {
  FORMAT: 'mg77-insert-v1',
  matId: '',              // 지금 보고 있는 교재
  openNum: '',            // 화면에서 펼쳐 본 지문 번호 (하나만)
  sel: new Set(),         // 인쇄 창에서 고른 지문 (교재id|번호) — 앱을 켜 둔 동안 기억
  seed: 1,                // 섞기 순서 (다시 섞기로 바꿈)
  pick: { mode: 'manual', classId: '', sel: [] },   // 학생 이름: 직접 입력 / 반에서 선택
  pr: { name: '', date: '', copies: '' },
  set: null,              // { duplex(양면 프린터) } — 이 기기에 저장
  LS: 'mg77_in_settings',
  _tok: 0,
  _cache: null,           // 쪽 나누기 결과 { key, qs:[본문 HTML], ak:[본문 HTML], n }

  /* ---------- 저장 ---------- */
  rid(matId, num) { return 'IN_' + matId + '_' + num; },
  numKey(n) { return parseInt(n, 10) || 0; },
  recs(matId) { return Store.where('meta', r => r.kind === 'inq' && r.matId === matId && Array.isArray(r.qs)).sort((a, b) => this.numKey(a.num) - this.numKey(b.num)); },
  nQs(recs) { return recs.reduce((n, r) => n + r.qs.length, 0); },
  mockMats() { return NP.sortMats(NP.examMats().filter(m => m.type === 'mock')); },
  // 탭 옆 숫자: 삽입 문제가 올라간 모의고사 수
  count() { return this.mockMats().filter(m => this.recs(m.id).length).length; },
  srcLabel(m, num) { return `${NP.shortName(m)} · ${num}번`; },

  /* =========================================================
     화면 (삽입 탭)
     ========================================================= */
  render(main) {
    const mats = this.mockMats();
    if (this.matId && !NP.mat(this.matId)) this.matId = '';
    const m = this.matId ? NP.mat(this.matId) : null;
    const opt = (x) => { const n = this.nQs(this.recs(x.id)); return `<option value="${x.id}" ${m && m.id === x.id ? 'selected' : ''}>${esc(NP.matName(x))}${n ? ` (${n}문항)` : ''}</option>`; };
    let h = Exams.headHtml() + Exams.tabsHtml();
    h += `<div class="toolbar"><select data-inmat style="min-width:280px"><option value="">모의고사를 고르세요</option>${mats.map(opt).join('')}</select>
      <span class="muted small">문장 삽입 문제 · Claude로 만든 파일을 올려 탑재</span><span style="flex:1"></span>
      <button class="btn" data-ia="up">파일 올리기</button><button class="btn primary" data-ia="print">인쇄</button>
      <input type="file" data-infile accept=".json,application/json" hidden></div>`;
    h += m ? this.matHtml(m) : this.overviewHtml(mats);
    main.innerHTML = h;
    main.onclick = (e) => this.onClick(e, main);
    main.onchange = (e) => {
      if (e.target.matches('[data-inmat]')) { this.matId = e.target.value; this.openNum = ''; App.render(); return; }
      if (e.target.matches('[data-infile]')) { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) this.upload(f); }
    };
    main.oninput = null;
    main.onkeydown = null;
  },

  // 교재를 고르기 전: 삽입 문제가 있는 모의고사 목록
  overviewHtml(mats) {
    const list = mats.filter(m => this.recs(m.id).length);
    if (!list.length) return '<div class="panel"><div class="empty">올린 삽입 문제가 없습니다. “파일 올리기”로 Claude가 만든 삽입 문제 파일(.json)을 올리세요.<br>파일의 연도·월·학년과 같은 모의고사 교재에 자동으로 붙습니다.</div></div>';
    return `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>이름</th><th class="num">지문</th><th class="num">문항</th><th>올린 날</th></tr></thead><tbody>${list.map(m => {
      const rs = this.recs(m.id), up = rs.map(r => r.updatedAt || '').sort().pop() || '';
      return `<tr class="click" data-ingo="${m.id}"><td class="nowrap"><span class="np-tag mock">${MAT_TYPE.mock}</span> <b>${esc(NP.matName(m))}</b></td>
        <td class="num">${rs.length}</td><td class="num">${this.nQs(rs)}</td><td class="nowrap">${up ? esc(up.slice(0, 10)) : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  },

  matHtml(m) {
    const rs = this.recs(m.id);
    let h = `<div class="panel"><div class="wx-bar"><span class="np-tag mock">${MAT_TYPE.mock}</span><b class="wx-mname">${esc(NP.matName(m))}</b>
      <span class="small soft">${rs.length}개 지문 · ${this.nQs(rs)}문항</span><span style="flex:1"></span>
      ${rs.length ? '<button type="button" class="btn sm ghost danger" data-ia="delset">문제 모두 삭제</button>' : ''}</div>`;
    if (!rs.length) return h + '<div class="empty">이 모의고사에 올린 삽입 문제가 없습니다. “파일 올리기”로 파일을 올리세요.</div></div>';
    if (!rs.some(r => r.num === this.openNum)) this.openNum = '';
    h += `<div class="in-cards">${rs.map(r => `<button type="button" class="in-card${r.num === this.openNum ? ' on' : ''}" data-inopen="${esc(r.num)}"><b>${esc(r.num)}번</b><span>${r.qs.length}문항</span></button>`).join('')}</div>`;
    const r = rs.find(x => x.num === this.openNum);
    if (!r) return h + '<p class="small muted in-tip">번호를 누르면 그 지문의 문항이 아래에 나와요.</p></div>';
    h += `<div class="wx-grp in-grp"><div class="wx-gh"><b class="wx-gl">${esc(r.num)}번</b><span class="small soft">${r.qs.length}문항</span><span style="flex:1"></span>
        <button type="button" class="btn sm ghost" data-inopen="${esc(r.num)}">접기</button></div>
      <ol class="wx-sl">${r.qs.map(q => `<li class="wx-s"><span class="wx-sn">${esc(q.id)}</span><div class="wx-st in-st">
        <div class="wx-en">${esc(q.given)} <span class="in-ans">정답 ${'①②③④⑤'[q.answer - 1]}</span></div>
        <div class="wx-ko in-body">${this.screenBody(q)}</div></div></li>`).join('')}</ol></div>`;
    return h + '</div>';
  },
  screenBody(q) { return q.body.map(it => it.m ? `<b class="in-smk">(${it.m})</b>` : esc(it.t)).join(' '); },

  onClick(e, main) {
    if (Exams.commonClick(e, main)) return;
    const go = e.target.closest('tr[data-ingo]');
    if (go) { this.matId = go.dataset.ingo; this.openNum = ''; App.render(true); return; }
    const op = e.target.closest('[data-inopen]');
    if (op) { const n = op.dataset.inopen; this.openNum = this.openNum === n ? '' : n; App.render(); return; }
    const b = e.target.closest('[data-ia]');
    if (!b || b.disabled) return;
    const a = b.dataset.ia;
    if (a === 'up') { $('[data-infile]', main).click(); return; }
    if (a === 'print') { this.openPrint(); return; }
    if (a === 'delset') { this.delSet(this.matId); return; }
  },

  async delSet(matId) {
    const m = NP.mat(matId), rs = this.recs(matId);
    if (!m || !rs.length) return;
    if (!await confirmDlg(`“${NP.matName(m)}”의 삽입 문제 ${this.nQs(rs)}문항을 모두 삭제할까요?`, '삭제', true)) return;
    rs.forEach(r => Store.del('meta', r.id));
    this.clearSel(matId);
    toast('삽입 문제를 삭제했습니다');
    App.render();
  },
  clearSel(matId) {
    [...this.sel].forEach(k => { if (k.startsWith(matId + '|')) this.sel.delete(k); });
  },

  /* ---------- 파일 올리기 ---------- */
  // 파일 검사 → 오류 문장 (문제없으면 '')
  check(d) {
    if (!d || d.format !== this.FORMAT) return `삽입 문제 파일이 아닙니다 (형식: ${this.FORMAT})`;
    const ex = d.exam || {};
    const y = +ex.year, mo = +ex.month, g = +ex.grade;
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return '파일의 연도가 올바르지 않습니다';
    if (!Number.isInteger(mo) || mo < 1 || mo > 12) return '파일의 월이 올바르지 않습니다';
    if (!Number.isInteger(g) || g < 1 || g > 12) return '파일의 학년이 올바르지 않습니다';
    if (!Array.isArray(d.passages) || !d.passages.length) return '파일에 지문이 없습니다';
    const nums = new Set(), ids = new Set();
    for (const p of d.passages) {
      const num = String((p && p.num) || '').trim();
      if (!/^\d{1,2}(-\d{1,2})?$/.test(num)) return `지문 번호가 올바르지 않습니다: ${num || '(비어 있음)'}`;
      if (nums.has(num)) return `지문 번호가 겹칩니다: ${num}`;
      nums.add(num);
      if (!Array.isArray(p.qs) || !p.qs.length) return `${num}번 지문에 문항이 없습니다`;
      for (const q of p.qs) {
        const id = String((q && q.id) || '');
        if (!id || ids.has(id)) return `${num}번 지문의 문항 번호가 없거나 겹칩니다: ${id}`;
        ids.add(id);
        if (typeof q.given !== 'string' || !q.given.trim()) return `${id}: 주어진 문장이 없습니다`;
        if (!Number.isInteger(q.answer) || q.answer < 1 || q.answer > 5) return `${id}: 정답이 1~5가 아닙니다`;
        if (!Array.isArray(q.body)) return `${id}: 본문이 없습니다`;
        const mk = q.body.filter(it => it && it.m).map(it => it.m).join('');
        if (mk !== '①②③④⑤') return `${id}: 위치 표시(①~⑤)가 올바르지 않습니다`;
        if (q.body.some(it => !it || (!it.m && typeof it.t !== 'string'))) return `${id}: 본문 문장 형식이 올바르지 않습니다`;
      }
    }
    return '';
  },
  async upload(file) {
    let d = null;
    try { d = JSON.parse(await file.text()); } catch (e) { d = null; }
    const err = d ? this.check(d) : '파일을 읽지 못했습니다 (JSON 파일이 아닙니다)';
    if (err) { alertDlg('올릴 수 없는 파일', err); return; }
    const y = +d.exam.year, mo = +d.exam.month, g = +d.exam.grade;
    const label = `${String(y).slice(-2)}년 ${mo}월 ${gradeLabel(g)} 모의고사`;
    let m = NP.mats().find(x => x.type === 'mock' && +x.year === y && +x.month === mo && +x.grade === g);
    if (!m) {
      if (!await confirmDlg(`“${label}” 교재가 없습니다.\n시험 교재에 이 모의고사를 만들고 문제를 올릴까요?`, '만들고 올리기')) return;
      m = Store.put('meta', { id: uid('MT'), kind: 'mat', createdAt: new Date().toISOString(), type: 'mock', year: y, month: mo, grade: g });
    }
    const old = this.recs(m.id);
    const nNew = d.passages.reduce((n, p) => n + p.qs.length, 0);
    if (old.length && !await confirmDlg(`“${NP.matName(m)}”에 이미 삽입 문제 ${this.nQs(old)}문항이 있습니다.\n지우고 새 파일의 ${nNew}문항으로 바꿀까요?`, '바꾸기', true)) return;
    old.forEach(r => Store.del('meta', r.id));
    const at = new Date().toISOString();
    d.passages.forEach(p => {
      const num = String(p.num).trim();
      Store.put('meta', { id: this.rid(m.id, num), kind: 'inq', matId: m.id, num, updatedAt: at,
        qs: p.qs.map(q => ({ id: String(q.id), given: q.given.trim(), answer: q.answer,
          body: q.body.map(it => it.m ? { m: it.m } : (it.np ? { t: it.t, np: true } : { t: it.t })) })) });
    });
    this.clearSel(m.id);
    this.matId = m.id;
    toast(`${NP.matName(m)} · ${d.passages.length}개 지문 ${nNew}문항을 올렸습니다`);
    App.render();
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

  // 인쇄할 수 있는 모의고사 → [{ m, rs:[지문 기록] }]
  printMats() { return this.mockMats().map(m => ({ m, rs: this.recs(m.id) })).filter(x => x.rs.length); },
  // 고른 지문의 문항 → [{ key, gk(지문 키), m, num, q }]
  items() {
    const out = [];
    this.printMats().forEach(({ m, rs }) => rs.forEach(r => {
      const gk = m.id + '|' + r.num;
      if (!this.sel.has(gk)) return;
      r.qs.forEach(q => out.push({ key: m.id + '|' + q.id, gk, m, num: r.num, q }));
    }));
    return out;
  },

  openPrint() {
    const K = Prints.kit;
    const pm = this.printMats();
    if (!pm.length) { toast('인쇄할 삽입 문제가 없습니다. 먼저 파일을 올리세요.'); return; }
    this.loadSet();
    K.ensureAssets(); this.ensureCss();
    // 없어진 지문은 선택에서 뺀다
    const liveG = new Set();
    pm.forEach(({ m, rs }) => rs.forEach(r => liveG.add(m.id + '|' + r.num)));
    [...this.sel].forEach(k => { if (!liveG.has(k)) this.sel.delete(k); });
    const body = `<div class="pr-wrap wx-pw">
      <aside class="panel pr-side wx-pside">
        <div class="pr-sec"><h2>범위</h2>
          <div class="wx-psbtn"><button type="button" class="btn sm" data-ia="ip-all">전체 선택</button><button type="button" class="btn sm" data-ia="ip-none">선택 해제</button></div>
          <div class="wx-pslist" data-insel>${this.selHtml()}</div>
          <p class="pr-hint" data-insum></p></div>
        <div class="pr-sec"><h2>순서</h2>
          <button type="button" class="btn sm" data-ia="ip-shuffle">다시 섞기</button>
          <p class="pr-hint">같은 지문의 문항은 붙지 않게, 되도록 같은 쪽에도 오지 않게 섞어요. 모든 부가 같은 순서예요.</p></div>
        <div class="pr-sec"><h2>글자</h2>
          <label class="pr-fld"><span>학원명</span><input type="text" data-ip-ac value="${esc(K.academy())}" placeholder="학원명을 입력하세요" maxlength="40" autocomplete="off"></label>
          <p class="pr-hint">표지+양식의 학원명과 같은 값이에요.</p>
          <label class="pr-fld"><span>날짜 (선택)</span>
            <div class="pr-inline"><input type="date" data-ip-date value="${esc(this.pr.date)}" aria-label="날짜"><button type="button" class="btn sm" data-ia="ip-date-clear">지우기</button></div></label>
          <p class="pr-hint">비워 두면 날짜 칸이 빈 줄로 나와요.</p></div>
        <div class="pr-sec"><h2>학생 이름</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="학생 이름 넣는 방식">
            <label class="chk"><input type="radio" name="ip-nm-mode" value="manual" ${this.pick.mode === 'class' ? '' : 'checked'}>직접 입력</label>
            <label class="chk"><input type="radio" name="ip-nm-mode" value="class" ${this.pick.mode === 'class' ? 'checked' : ''}>반에서 선택</label>
          </div>
          <div data-ip-nmbody>${this.nmBodyHtml()}</div></div>
        <div class="pr-sec"><h2>출력</h2>
          <label class="chk pr-chk"><input type="checkbox" data-ip-duplex ${this.set.duplex ? 'checked' : ''}>양면 프린터 사용</label>
          <p class="pr-hint" data-ip-dxhint>${this.dxHint()}</p>
          <div class="pr-print" style="margin-top:10px">
            <input type="number" data-ip-copies min="1" max="500" step="1" value="${esc(this.pr.copies)}" placeholder="부수" aria-label="출력 부수"${this.pick.mode === 'class' ? ' disabled' : ''}>
            <button type="button" class="btn primary" data-ia="ip-print" data-ip-printbtn>${this.printLabel()}</button>
          </div>
          <div class="pr-note">인쇄창에서 배율은 <b>기본값(100%)</b>으로 두세요. 양면 프린터를 사용할 땐 인쇄창의 <b>양면 인쇄</b>도 켜져 있어야 해요.</div></div>
      </aside>
      <section class="wx-pview" data-inprev></section>
    </div>`;
    Modal.open({
      title: '삽입 문제 인쇄', size: 'xl wx-pmodal', body, autofocus: false,
      onMount: (b, md) => {
        const upd = debounce(() => this.prevBuild(b, md), 150);
        const syncIndet = () => $$('[data-indet]', b).forEach(x => { x.indeterminate = true; });
        const refreshSel = () => {
          const box = $('[data-insel]', b), top = box.scrollTop;
          box.innerHTML = this.selHtml(); box.scrollTop = top;
          syncIndet(); upd();
        };
        const refreshNm = (listToo) => {
          if (listToo) { const l = $('[data-ip-list]', b); if (l) { const bx = $('.pr-nm-stus', l), t = bx ? bx.scrollTop : 0; l.innerHTML = this.nmListHtml(); const nb = $('.pr-nm-stus', l); if (nb) nb.scrollTop = t; } }
          const p = $('[data-ip-picked]', b); if (p) p.innerHTML = this.nmPickedHtml();
          syncIndet();
          $('[data-ip-printbtn]', b).textContent = this.printLabel();
          $('[data-ip-copies]', b).disabled = this.pick.mode === 'class';
          upd();
        };
        syncIndet();
        b.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-isg]');
          if (chip) { const k = chip.dataset.isg; if (this.sel.has(k)) this.sel.delete(k); else this.sel.add(k); refreshSel(); return; }
          const bt = e.target.closest('[data-ia]'); if (!bt) return;
          const a = bt.dataset.ia;
          if (a === 'ip-all') { this.printMats().forEach(x => x.rs.forEach(r => this.sel.add(x.m.id + '|' + r.num))); refreshSel(); }
          else if (a === 'ip-none') { this.sel.clear(); refreshSel(); }
          else if (a === 'ip-shuffle') { this.seed = (this.seed * 7919 + 104729) % 2147483647 || 1; upd(); }
          else if (a === 'ip-date-clear') { this.pr.date = ''; $('[data-ip-date]', b).value = ''; upd(); }
          else if (a === 'ip-nm-clear') { this.pick.sel = []; refreshNm(true); }
          else if (a === 'ip-print') this.doPrint(b);
        });
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-ip-ac]')) { K.setAcademy(t.value); upd(); }
          else if (t.matches('[data-ip-date]')) { this.pr.date = isYmd(t.value) ? t.value : ''; upd(); }
          else if (t.matches('[data-ip-name]')) { this.pr.name = t.value; upd(); }
          else if (t.matches('[data-ip-copies]')) this.pr.copies = t.value;
        });
        b.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-ism]')) {
            const x = this.printMats().find(y => y.m.id === t.dataset.ism);
            if (x) x.rs.forEach(r => { const k = x.m.id + '|' + r.num; if (t.checked) this.sel.add(k); else this.sel.delete(k); });
            refreshSel();
          } else if (t.matches('[data-ip-duplex]')) {
            this.set.duplex = t.checked; this.saveSet();
            $('[data-ip-dxhint]', b).textContent = this.dxHint(); upd();
          } else if (t.matches('[name="ip-nm-mode"]')) {
            if (!t.checked) return;
            this.pick.mode = t.value === 'class' ? 'class' : 'manual';
            $('[data-ip-nmbody]', b).innerHTML = this.nmBodyHtml(); refreshNm(false);
          } else if (t.matches('[data-ip-class]')) {
            this.pick.classId = t.value;
            const l = $('[data-ip-list]', b); if (l) l.innerHTML = '';
            refreshNm(true);
          } else if (t.matches('[data-ip-all]')) {
            this.nmToggle(K.roster(this.pick.classId).map(s => s.id), t.checked); refreshNm(true);
          } else if (t.matches('[data-ip-stu]')) {
            this.nmToggle([t.dataset.ipStu], t.checked); refreshNm(true);
          }
        });
        this.prevBuild(b, md);
      },
      onClose: () => { this._tok++; },
      buttons: [{ text: '닫기' }],
    });
  },
  dxHint() {
    return this.set.duplex ? '문제지가 홀수 쪽이면 빈 면을 넣어 정답지가 늘 새 종이에서 시작하고, 정답지가 홀수 쪽이면 빈 면을 넣어 다음 부도 새 종이에서 시작해요.' : '단면 프린터용: 빈 면 없이 차례대로 인쇄해요. 정답지는 늘 새 쪽에서 시작해요.';
  },
  printLabel() { const n = this.pickStudents().length; return this.pick.mode === 'class' ? `인쇄 / PDF (${n}명)` : '인쇄 / PDF'; },

  // 범위 고르기: 모의고사별 체크 + 지문 칩
  selHtml() {
    return this.printMats().map(({ m, rs }) => {
      const on = rs.filter(r => this.sel.has(m.id + '|' + r.num)).length;
      return `<div class="wx-psm"><label class="chk wx-psmh"><input type="checkbox" data-ism="${m.id}" ${on === rs.length ? 'checked' : ''}${on && on < rs.length ? ' data-indet' : ''}>
        <span class="np-tag mock">${MAT_TYPE.mock}</span><b>${esc(NP.matName(m))}</b></label>
        <div class="np-chips">${rs.map(r => `<button type="button" class="np-c sm ${this.sel.has(m.id + '|' + r.num) ? 'on' : ''}" data-isg="${esc(m.id + '|' + r.num)}">${esc(r.num)}번<small class="wx-cnt">${r.qs.length}</small></button>`).join('')}</div></div>`;
    }).join('');
  },
  /* ---------- 학생 이름 (표지+양식과 같은 방식) ---------- */
  pickStudents() { return this.pick.sel.map(id => Store.get('students', id)).filter(Boolean); },
  nmBodyHtml() {
    const K = Prints.kit;
    if (this.pick.mode !== 'class') return `<label class="pr-fld"><span>학생 이름</span><input type="text" data-ip-name value="${esc(this.pr.name)}" placeholder="비워 두면 빈 줄로 나와요" maxlength="20" autocomplete="off"></label>`;
    const cls = K.classes();
    if (this.pick.classId && !cls.some(c => c.id === this.pick.classId)) this.pick.classId = '';
    return `<label class="pr-fld"><span>반</span>
        <select data-ip-class><option value="">반을 고르세요</option>
          ${cls.map(c => `<option value="${esc(c.id)}"${c.id === this.pick.classId ? ' selected' : ''}>${esc(c.name)} (${K.roster(c.id).length}명)</option>`).join('')}</select></label>
      <div class="pr-nm-list" data-ip-list>${this.nmListHtml()}</div>
      <div class="pr-nm-picked" data-ip-picked>${this.nmPickedHtml()}</div>
      <p class="pr-hint">다른 반을 골라도 체크한 학생은 그대로 남아요. 고른 학생마다 한 부씩, 이름만 바뀌어 인쇄돼요.</p>`;
  },
  nmListHtml() {
    if (!this.pick.classId) return '<div class="none">반을 고르면 학생 목록이 나와요.</div>';
    const ros = Prints.kit.roster(this.pick.classId);
    if (!ros.length) return '<div class="none">이 반에는 재원생이 없어요.</div>';
    const on = new Set(this.pick.sel);
    const all = ros.every(s => on.has(s.id)), some = ros.some(s => on.has(s.id));
    return `<label class="chk pr-nm-all"><input type="checkbox" data-ip-all ${all ? 'checked' : ''}${!all && some ? ' data-indet' : ''}>반 전체 선택</label>
      <div class="pr-nm-stus">${ros.map(s => `<label class="chk"><input type="checkbox" data-ip-stu="${esc(s.id)}" ${on.has(s.id) ? 'checked' : ''}>${esc(s.name)}${stTag(s) ? ` <small>${esc(stTag(s))}</small>` : ''}</label>`).join('')}</div>`;
  },
  nmPickedHtml() {
    const list = this.pickStudents();
    if (!list.length) return '<span class="none">고른 학생: 없음</span>';
    return `<div class="pr-nm-ph"><b>고른 학생 ${list.length}명</b><button type="button" class="btn sm" data-ia="ip-nm-clear">모두 해제</button></div>
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
  // 문제 본문: 문단 나누기 + ( ① ) 표시. 새 문단 첫 문장 앞의 표시는 새 문단 맨 앞에 둔다
  bodyHtml(q) {
    const ps = [[]], b = q.body;
    b.forEach((it, i) => {
      if (it.m) {
        const nx = b[i + 1];
        if (nx && !nx.m && nx.np && ps[ps.length - 1].length) ps.push([]);
        ps[ps.length - 1].push(`<span class="in-mk">(&nbsp;${it.m}&nbsp;)</span>`);
      } else {
        const prev = b[i - 1];
        if (it.np && !(prev && prev.m) && ps[ps.length - 1].length) ps.push([]);
        ps[ps.length - 1].push(esc(it.t));
      }
    });
    return ps.map(p => `<p class="in-tx">${p.join(' ')}</p>`).join('');
  },
  qHtml(it, no) {
    return `<div class="in-q"><div class="in-qh"><span class="in-no">${no}.</span><span class="in-src">${esc(this.srcLabel(it.m, it.num))}</span></div>
      <div class="in-given">${esc(it.q.given)}</div>${this.bodyHtml(it.q)}</div>`;
  },
  // 글꼴이 다 온 뒤에 재야 쪽 나누기가 인쇄와 같아진다
  async fontsReady() {
    const ln = document.getElementById('pr-paper-font');
    if (ln && !ln.sheet) await new Promise(r => { ln.addEventListener('load', r, { once: true }); ln.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
    if (!document.fonts || !document.fonts.load) return;
    const fs = ['16px "Gowun Dodum"', '700 16px "Gowun Batang"', '400 16px "Noto Serif KR"', '700 16px "Noto Serif KR"'];
    await Promise.race([Promise.all(fs.map(f => document.fonts.load(f).catch(() => null))), new Promise(r => setTimeout(r, 4000))]);
  },
  // 정해진 씨앗으로 늘 같은 순서가 나오는 난수
  rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  // 쪽 나누기 + 섞기 (화면 밖에 실제 크기로 그려서 잰다) → { qs:[문제지 본문], ak:[정답지 본문], n }
  //  섞는 규칙: 바로 앞 문항과 같은 지문은 피하고, 이 쪽에 이미 있는 지문도 피한다 (남은 지문이 그것뿐일 때만 예외)
  //            남은 문항이 많은 지문부터 → 끝에 한 지문만 몰려 남지 않게
  async paginate(items) {
    const key = items.map(it => it.key).join('|') + '#' + this.seed;
    if (this._cache && this._cache.key === key) return this._cache;
    await this.fontsReady();
    const K = Prints.kit, MM = K.MM_PER_PX;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;z-index:-1';
    document.body.appendChild(host);
    try {
      const rnd = this.rng(this.seed);
      const pools = new Map(), tie = new Map();
      items.forEach(it => { if (!pools.has(it.gk)) { pools.set(it.gk, []); tie.set(it.gk, rnd()); } pools.get(it.gk).push(it); });
      pools.forEach(list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } });
      let left = items.length;
      const order = [], qs = [];
      let cols = null, ci = 0, onPage = new Set(), last = null, first = true;
      const newPage = () => {
        host.innerHTML = `<div class="pn-sheet in-qs">${this.headHtml('')}${first ? `<div class="in-dir"><span class="pn-tag">문장 삽입 · ${items.length}문항</span><span>글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.</span></div>` : ''}<div class="in-body"><div class="in-col"></div><div class="in-col"></div></div></div>`;
        cols = [...host.querySelectorAll('.in-col')]; ci = 0; onPage = new Set(); first = false;
      };
      const fits = (col) => { const l = col.lastElementChild; return !l || l.getBoundingClientRect().bottom <= col.getBoundingClientRect().bottom - 2; };
      const tier = (gk) => gk === last ? 2 : onPage.has(gk) ? 1 : 0;
      newPage();
      while (left > 0) {
        const cands = [...pools.keys()].filter(gk => pools.get(gk).length);
        const minT = Math.min(...cands.map(tier));
        cands.forEach(gk => tie.set(gk, rnd()));           // 남은 수가 같으면 매번 새로 무작위 → 지문 순서가 되풀이되지 않게
        const best = cands.filter(gk => tier(gk) === minT).sort((a, b) => pools.get(b).length - pools.get(a).length || tie.get(a) - tie.get(b));
        const col = cols[ci], empty = !col.children.length;
        let placed = null;
        for (const gk of best) {
          const it = pools.get(gk)[0];
          col.insertAdjacentHTML('beforeend', this.qHtml(it, order.length + 1));
          if (empty || fits(col)) { placed = gk; break; }
          col.lastElementChild.remove();
        }
        if (placed) {
          const it = pools.get(placed).shift();
          order.push(it); onPage.add(placed); last = placed; left--;
          continue;
        }
        if (ci === 0) { ci = 1; continue; }
        qs.push(host.querySelector('.in-dir') ? host.querySelector('.in-dir').outerHTML + host.querySelector('.in-body').outerHTML : host.querySelector('.in-body').outerHTML);
        newPage();
      }
      qs.push((host.querySelector('.in-dir') ? host.querySelector('.in-dir').outerHTML : '') + host.querySelector('.in-body').outerHTML);
      // 정답지: 4줄 칸, 줄 높이 7mm
      const ak = [];
      const ROW = 7, NCOL = 4;
      host.innerHTML = `<div class="pn-sheet in-aks">${this.headHtml('')}<div class="in-dir"><span class="pn-tag">문장 삽입 정답 · ${order.length}문항</span></div><div class="in-akb"></div></div>`;
      const per = Math.max(1, Math.floor(($('.in-akb', host).clientHeight * MM) / ROW)) * NCOL;
      const rows = order.map((it, i) => `<div class="in-akr"><span class="in-akn">${i + 1}</span><span class="in-aka">${'①②③④⑤'[it.q.answer - 1]}</span><span class="in-aks">${esc(`${String(it.m.year).slice(-2)}.${it.m.month} · ${it.num}번`)}</span></div>`);
      for (let i = 0; i < rows.length; i += per) {
        const chunk = rows.slice(i, i + per), rpc = Math.ceil(per / NCOL), cs = [];
        for (let c = 0; c < NCOL; c++) cs.push(`<div class="in-akc">${chunk.slice(c * rpc, (c + 1) * rpc).join('')}</div>`);
        ak.push(`<div class="in-dir"><span class="pn-tag">문장 삽입 정답 · ${order.length}문항</span></div><div class="in-akb">${cs.join('')}</div>`);
      }
      this._cache = { key, qs, ak, n: order.length };
      return this._cache;
    } finally { host.remove(); }
  },
  // 한 부 = 문제지 (+빈 면) + 정답지 (+빈 면) → [{ html, cap, blank }]
  //  정답지는 양면 인쇄에서도 문제지 뒷면에 붙지 않게 늘 새 종이에서 시작
  copyPages(pg, nm) {
    const blank = { html: '<div class="pn-sheet"></div>', cap: '빈 면 (양면 인쇄용)', blank: true };
    const out = [];
    pg.qs.forEach((b, i) => out.push({ html: `<div class="pn-sheet in-qs">${this.headHtml(nm)}${b}</div>`, cap: `문제 ${i + 1}/${pg.qs.length}` }));
    if (this.set.duplex && pg.qs.length % 2) out.push(blank);
    pg.ak.forEach((b, i) => out.push({ html: `<div class="pn-sheet in-aks">${this.headHtml(nm)}${b}</div>`, cap: `정답 ${i + 1}/${pg.ak.length}` }));
    if (this.set.duplex && pg.ak.length % 2) out.push(blank);
    return out;
  },
  // 미리보기: 한 부 (반에서 선택이면 첫 학생 이름)
  async prevBuild(b, md) {
    const tok = ++this._tok;
    const pv = $('[data-inprev]', b), sm = $('[data-insum]', b);
    const items = this.items();
    if (!items.length) {
      pv.innerHTML = '<div class="wx-pv-empty">왼쪽 범위에서 인쇄할 지문을 고르세요.</div>';
      sm.textContent = '고른 문항: 없음';
      return;
    }
    if (!pv.children.length || $('.wx-pv-empty', pv)) pv.innerHTML = '<div class="wx-pv-empty">미리보기를 만드는 중…</div>';
    const pg = await this.paginate(items);
    if (tok !== this._tok || md.closed) return;
    const nm = this.pick.mode === 'class' ? ((this.pickStudents()[0] || {}).name || '') : this.pr.name;
    const pages = this.copyPages(pg, nm).filter(p => !p.blank);      // 빈 면은 인쇄할 때만 넣고 미리보기에는 보이지 않음
    sm.textContent = `고른 문항 ${items.length}개 → 문제 ${pg.qs.length}쪽 + 정답 ${pg.ak.length}쪽`;
    const K = Prints.kit, s = 0.36;
    pv.innerHTML = `<div class="wx-pv-h">미리보기 · 한 부${nm ? ` (${esc(nm)})` : ''} · 누르면 크게 보기</div><div class="wx-pv-grid">${pages.map((p, i) => `<figure class="wx-th in-th" data-inbig="${i}">
        <div class="wx-thb" style="width:${(K.PAGE_W * s).toFixed(1)}px;height:${(K.PAGE_H * s).toFixed(1)}px"><div style="transform:scale(${s});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div>
        <figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div>`;
    pv.onclick = (e) => {
      const f = e.target.closest('[data-inbig]'); if (!f) return;
      const p = pages[+f.dataset.inbig]; if (!p) return;
      const z = Math.min(1, (window.innerWidth * 0.9) / K.PAGE_W);
      Modal.open({ title: p.cap, size: 'xl', autofocus: false,
        body: `<div style="overflow:auto;max-height:calc(100vh - 160px)"><div class="wx-thb" style="width:${(K.PAGE_W * z).toFixed(1)}px;height:${(K.PAGE_H * z).toFixed(1)}px;margin:0 auto"><div style="transform:scale(${z});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div></div>`,
        buttons: [{ text: '닫기', cls: 'primary', primary: true }] });
    };
  },

  async doPrint(b) {
    const items = this.items();
    if (!items.length) { toast('인쇄할 지문을 고르세요.'); return; }
    let names;
    if (this.pick.mode === 'class') {
      const list = this.pickStudents();
      if (!list.length) { toast('인쇄할 학생을 선택하세요.'); return; }
      names = list.map(s => s.name);
    } else {
      const inp = $('[data-ip-copies]', b), v = String(inp.value || '').trim();
      if (v === '') { toast('출력 부수를 입력하세요.'); inp.focus(); return; }
      const n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
      if (n < 1 || n > 500) { toast('출력 부수는 1에서 500 사이로 입력하세요.'); inp.focus(); return; }
      names = Array.from({ length: n }, () => this.pr.name);
    }
    const pg = await this.paginate(items);
    const html = names.map(nm => this.copyPages(pg, nm).map(p => p.html).join('')).join('');
    Prints.kit.printPaper(html, `삽입문제_${todayStr()}`, this.PAPER_CSS);
  },

  /* ---------- 종이 CSS (표지+양식의 .pn-sheet 위에 더함 · 테마와 상관없이 고정) ---------- */
  PAPER_CSS: `
.pn-sheet .in-dir{flex-shrink:0;display:flex;align-items:center;gap:3mm;margin:0 0 4mm;font-size:10pt;font-weight:700;color:var(--pn-ink)}
.pn-sheet .in-body{flex:1;min-height:0;display:flex}
.pn-sheet .in-col{flex:1 1 0;min-width:0;min-height:0;overflow:hidden;padding-right:4mm}
.pn-sheet .in-col + .in-col{padding:0 0 0 4mm;border-left:0.3mm solid var(--pn-line)}
.pn-sheet .in-q{padding-bottom:5mm}
.pn-sheet .in-qh{display:flex;align-items:center;gap:2mm;margin-bottom:1.4mm}
.pn-sheet .in-no{font-family:"Noto Serif KR",serif;font-size:11pt;font-weight:700;color:#1f272d}
.pn-sheet .in-src{font-family:"Gowun Batang",serif;font-size:7.5pt;font-weight:700;background:var(--pn-tag-bg);color:var(--pn-tag-ink);padding:0.3mm 2.2mm;border-radius:10mm;line-height:1.4}
.pn-sheet .in-given{border:0.3mm solid #39434a;padding:1.5mm 2.4mm;margin:0 0 1.8mm;font-family:"Noto Serif KR",serif;font-size:8.8pt;line-height:1.48;color:#1f272d;text-align:justify;overflow-wrap:anywhere}
.pn-sheet .in-tx{font-family:"Noto Serif KR",serif;font-size:8.8pt;line-height:1.5;color:#1f272d;text-align:justify;text-indent:3mm;margin:0;overflow-wrap:anywhere}
.pn-sheet .in-tx + .in-tx{margin-top:0.8mm}
.pn-sheet .in-mk{white-space:nowrap;font-weight:700}
.pn-sheet .in-akb{flex:1;min-height:0;display:flex;gap:5mm}
.pn-sheet .in-akc{flex:1 1 0;min-width:0}
.pn-sheet .in-akr{display:flex;align-items:center;gap:2mm;height:7mm;border-bottom:0.2mm solid var(--pn-line);font-size:10pt;color:#1f272d}
.pn-sheet .in-akn{flex:none;width:8mm;text-align:right;font-weight:700}
.pn-sheet .in-aka{flex:none;width:7mm;text-align:center;font-weight:700;font-size:12pt}
.pn-sheet .in-aks{flex:1;min-width:0;font-size:7.5pt;color:var(--pn-ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`,
  ensureCss() {
    if (document.getElementById('in-paper-css')) return;
    const st = document.createElement('style');
    st.id = 'in-paper-css';
    st.textContent = this.PAPER_CSS;
    document.head.appendChild(st);
  },
};

/* 삽입 탭·인쇄 창 화면 스타일 (테마 변수만 사용 · 나머지는 서술형 탭의 wx- 스타일을 같이 씀) */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.in-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; margin-top: 10px; }
.in-card { display: flex; align-items: baseline; justify-content: center; gap: 5px; padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); cursor: pointer; font-size: 13.5px; white-space: nowrap; }
.in-card span { font-size: 12px; color: var(--ink-mute); }
.in-card:hover { border-color: var(--accent); }
.in-card.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-ink); }
.in-card.on span { color: var(--accent-ink); }
.in-tip { margin: 8px 2px 0; }
.in-st { cursor: default; }
.in-st:hover { background: none; }
.in-ans { display: inline-block; margin-left: 6px; font-size: 12.5px; font-weight: 700; color: var(--accent-ink); background: var(--accent-soft); border-radius: 10px; padding: 0 8px; }
.in-body { margin-top: 4px; }
.in-smk { color: var(--accent-ink); }
.in-grp .wx-sn { width: auto; min-width: 22px; }
.in-th { cursor: zoom-in; }
`;
  document.head.appendChild(st);
})();
