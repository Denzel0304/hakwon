/* =========================================================
   orders.js — 변형 문제 › 순서 (모의고사 지문으로 만든 글의 순서 배열 문제)
   · 문제는 Claude로 미리 만든 파일(형식 mg77-order-v1, .json)을 "파일 올리기"로 탑재한다
       위에서 고른 모의고사 교재에 붙는다 (파일 속 연도·월은 확인 창에 보여 주기만 함)
   · 저장: meta 테이블 — 지문 하나에 기록 하나 (지문당 1문항)
       id 'OR_'+교재id+'_'+번호, { kind:'ordq', matId, num:'20' | '41-42', q:{ intro, A, B, C, answer:1~5 }, updatedAt }
   · 선택지는 고정: ① (A)-(C)-(B) ② (B)-(A)-(C) ③ (B)-(C)-(A) ④ (C)-(A)-(B) ⑤ (C)-(B)-(A)
   · 인쇄 (이 탭의 인쇄 창): 여러 모의고사에서 지문(번호)을 골라 인쇄 — 순서는 늘 섞음 (모든 부가 같은 순서, "다시 섞기")
       한 부 = 문제지(2단) (+빈 면) + 정답지 (+빈 면) → 정답지는 늘 새 종이에서 시작
       종이·머리글·학생 목록·인쇄 방식은 표지+양식(Prints.kit)의 것을 그대로 씀
   ========================================================= */
const Orders = {
  FORMAT: 'mg77-order-v1',
  OPTS: ['ACB', 'BAC', 'BCA', 'CAB', 'CBA'],
  matId: '',
  openNum: '',
  sel: new Set(),         // 인쇄 창에서 고른 지문 (교재id|번호)
  seed: 1,
  pick: { mode: 'manual', classId: '', sel: [] },
  pr: { name: '', date: '', copies: '' },
  set: null,              // { duplex } — 이 기기에 저장
  LS: 'mg77_od_settings',
  _tok: 0,
  _cache: null,

  /* ---------- 저장 ---------- */
  rid(matId, num) { return 'OR_' + matId + '_' + num; },
  numKey(n) { return parseInt(n, 10) || 0; },
  recs(matId) { return Store.where('meta', r => r.kind === 'ordq' && r.matId === matId && r.q).sort((a, b) => this.numKey(a.num) - this.numKey(b.num)); },
  mockMats() { return NP.sortMats(NP.examMats().filter(m => m.type === 'mock')); },
  count() { return this.mockMats().filter(m => this.recs(m.id).length).length; },
  srcLabel(m, num) { return `${NP.shortName(m)} · ${num}번`; },
  optText(i) { return '①②③④⑤'[i] + ' ' + this.OPTS[i].split('').map(x => `(${x})`).join(' – '); },

  /* =========================================================
     화면 (순서 탭)
     ========================================================= */
  render(main) {
    const mats = this.mockMats();
    if (this.matId && !NP.mat(this.matId)) this.matId = '';
    const m = this.matId ? NP.mat(this.matId) : null;
    const opt = (x) => { const n = this.recs(x.id).length; return `<option value="${x.id}" ${m && m.id === x.id ? 'selected' : ''}>${esc(NP.matName(x))}${n ? ` (${n}문항)` : ''}</option>`; };
    let h = Variants.headHtml() + Variants.tabsHtml();
    h += `<div class="toolbar"><select data-odmat style="min-width:280px"><option value="">교재를 고르세요</option>${mats.length ? `<optgroup label="${MAT_TYPE.mock}">${mats.map(opt).join('')}</optgroup>` : ''}</select>
      <span class="muted small">모의고사 글의 순서 문제 · 회차를 고른 뒤 Claude로 만든 파일을 올림</span><span style="flex:1"></span>
      <button class="btn" data-oa="up">파일 올리기</button><button class="btn primary" data-oa="print">인쇄</button>
      <input type="file" data-odfile accept=".json,application/json" hidden></div>`;
    h += m ? this.matHtml(m) : this.overviewHtml(mats);
    main.innerHTML = h;
    main.onclick = (e) => this.onClick(e, main);
    main.onchange = (e) => {
      if (e.target.matches('[data-odmat]')) { this.matId = e.target.value; this.openNum = ''; App.render(); return; }
      if (e.target.matches('[data-odfile]')) { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) this.upload(f); }
    };
    main.oninput = null;
    main.onkeydown = null;
  },

  // 교재를 고르기 전: 순서 문제가 있는 교재 목록 (서술형·삽입 탭 목록과 같은 모양)
  overviewHtml(mats) {
    if (!mats.length) return '<div class="panel"><div class="empty">등록된 모의고사 교재가 없습니다.</div></div>';
    const list = mats.filter(m => this.recs(m.id).length);
    if (!list.length) return '<div class="panel"><div class="empty">올린 순서 문제가 없습니다. 위에서 모의고사를 고른 뒤 “파일 올리기”로 Claude가 만든 순서 문제 파일(.json)을 올리세요.</div></div>';
    return `<div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>종류</th><th>이름</th><th class="num">항목</th><th class="num">문항</th><th>최근 변경</th></tr></thead><tbody>${list.map(m => {
      const rs = this.recs(m.id), up = rs.map(r => r.updatedAt || '').sort().pop() || '';
      return `<tr class="click" data-odgo="${m.id}"><td class="nowrap"><span class="np-tag ${m.type}">${MAT_TYPE[m.type]}</span></td><td class="nowrap"><b>${esc(NP.matName(m))}</b></td>
        <td class="num">${rs.length}</td><td class="num">${rs.length}</td><td class="nowrap">${esc(up.slice(0, 10))}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  },

  matHtml(m) {
    const rs = this.recs(m.id);
    let h = `<div class="panel"><div class="wx-bar"><span class="np-tag mock">${MAT_TYPE.mock}</span><b class="wx-mname">${esc(NP.matName(m))}</b>
      <span class="small soft">${rs.length}개 항목 · ${rs.length}문항</span><span style="flex:1"></span>
      ${rs.length ? '<button type="button" class="btn sm ghost danger" data-oa="delset">문제 모두 삭제</button>' : ''}</div>`;
    if (!rs.length) return h + '<div class="empty">이 모의고사에 올린 순서 문제가 없습니다. “파일 올리기”로 파일을 올리세요.</div></div>';
    if (!rs.some(r => r.num === this.openNum)) this.openNum = '';
    h += `<div class="od-cards">${rs.map(r => `<button type="button" class="od-card${r.num === this.openNum ? ' on' : ''}" data-odopen="${esc(r.num)}"><b>${esc(r.num)}번</b><span>정답 ${'①②③④⑤'[r.q.answer - 1]}</span></button>`).join('')}</div>`;
    const r = rs.find(x => x.num === this.openNum);
    if (!r) return h + '<p class="small muted od-tip">번호를 누르면 그 지문의 문제가 아래에 나와요.</p></div>';
    const q = r.q;
    h += `<div class="wx-grp od-grp"><div class="wx-gh"><b class="wx-gl">${esc(r.num)}번</b><span class="od-ans">정답 ${esc(this.optText(q.answer - 1))}</span><span style="flex:1"></span>
        <button type="button" class="btn sm ghost" data-odopen="${esc(r.num)}">접기</button></div>
      <div class="od-scr"><div class="od-sgiven">${esc(q.intro)}</div>${'ABC'.split('').map(x => `<p class="od-sp"><b>(${x})</b> ${esc(q[x])}</p>`).join('')}</div></div>`;
    return h + '</div>';
  },

  onClick(e, main) {
    if (Variants.commonClick(e, main)) return;
    const go = e.target.closest('tr[data-odgo]');
    if (go) { this.matId = go.dataset.odgo; this.openNum = ''; App.render(true); return; }
    const op = e.target.closest('[data-odopen]');
    if (op) { const n = op.dataset.odopen; this.openNum = this.openNum === n ? '' : n; App.render(); return; }
    const b = e.target.closest('[data-oa]');
    if (!b || b.disabled) return;
    const a = b.dataset.oa;
    if (a === 'up') {
      const m = this.matId ? NP.mat(this.matId) : null;
      if (!m || m.type !== 'mock') { toast('먼저 위에서 문제를 올릴 모의고사를 고르세요.'); $('[data-odmat]', main).focus(); return; }
      this._upMat = m.id;
      $('[data-odfile]', main).click(); return;
    }
    if (a === 'print') { this.openPrint(); return; }
    if (a === 'delset') { this.delSet(this.matId); return; }
  },

  async delSet(matId) {
    const m = NP.mat(matId), rs = this.recs(matId);
    if (!m || !rs.length) return;
    if (!await confirmDlg(`“${NP.matName(m)}”의 순서 문제 ${rs.length}문항을 모두 삭제할까요?`, '삭제', true)) return;
    rs.forEach(r => Store.del('meta', r.id));
    this.clearSel(matId);
    toast('순서 문제를 삭제했습니다');
    App.render();
  },
  clearSel(matId) {
    [...this.sel].forEach(k => { if (k.startsWith(matId + '|')) this.sel.delete(k); });
  },

  /* ---------- 파일 올리기 ---------- */
  check(d) {
    if (!d || d.format !== this.FORMAT) return `순서 문제 파일이 아닙니다 (형식: ${this.FORMAT})`;
    const ex = d.exam || {};
    const y = +ex.year, mo = +ex.month, g = +ex.grade;
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return '파일의 연도가 올바르지 않습니다';
    if (!Number.isInteger(mo) || mo < 1 || mo > 12) return '파일의 월이 올바르지 않습니다';
    if (!Number.isInteger(g) || g < 1 || g > 12) return '파일의 학년이 올바르지 않습니다';
    if (!Array.isArray(d.passages) || !d.passages.length) return '파일에 지문이 없습니다';
    const nums = new Set();
    for (const p of d.passages) {
      const num = String((p && p.num) || '').trim();
      if (!/^\d{1,2}(-\d{1,2})?$/.test(num)) return `지문 번호가 올바르지 않습니다: ${num || '(비어 있음)'}`;
      if (nums.has(num)) return `지문 번호가 겹칩니다: ${num}`;
      nums.add(num);
      const q = p.q;
      if (!q || typeof q !== 'object') return `${num}번 지문에 문제가 없습니다`;
      for (const k of ['intro', 'A', 'B', 'C']) if (typeof q[k] !== 'string' || !q[k].trim()) return `${num}번: ${k === 'intro' ? '주어진 글' : '(' + k + ')'}이 없습니다`;
      if (!Number.isInteger(q.answer) || q.answer < 1 || q.answer > 5) return `${num}번: 정답이 1~5가 아닙니다`;
    }
    return '';
  },
  async upload(file) {
    let d = null;
    try { d = JSON.parse(await file.text()); } catch (e) { d = null; }
    const err = d ? this.check(d) : '파일을 읽지 못했습니다 (JSON 파일이 아닙니다)';
    if (err) { alertDlg('올릴 수 없는 파일', err); return; }
    const m = NP.mat(this._upMat || this.matId);
    if (!m || m.type !== 'mock') { toast('먼저 위에서 문제를 올릴 모의고사를 고르세요.'); return; }
    const y = +d.exam.year, mo = +d.exam.month, g = +d.exam.grade;
    const fileName = String(d.exam.title || '').trim() || `${y}년 ${mo}월 ${gradeLabel(g)} 모의고사`;
    const old = this.recs(m.id);
    const warn = (+m.year !== y || +m.grade !== g) ? `\n\n※ 파일과 고른 교재의 연도·학년이 다릅니다. 회차를 다시 확인하세요.` : '';
    const msg = `파일: ${fileName}\n올릴 곳: “${NP.matName(m)}”\n\n순서 문제 ${d.passages.length}문항을 이 모의고사에 올릴까요?`
      + (old.length ? `\n이미 있는 ${old.length}문항은 지워지고 새 파일로 바뀝니다.` : '') + warn;
    if (!await confirmDlg(msg, old.length ? '바꾸기' : '올리기', !!old.length || !!warn)) return;
    old.forEach(r => Store.del('meta', r.id));
    const at = new Date().toISOString();
    d.passages.forEach(p => {
      const num = String(p.num).trim(), q = p.q;
      Store.put('meta', { id: this.rid(m.id, num), kind: 'ordq', matId: m.id, num, updatedAt: at,
        q: { intro: q.intro.trim(), A: q.A.trim(), B: q.B.trim(), C: q.C.trim(), answer: q.answer } });
    });
    this.clearSel(m.id);
    this.matId = m.id;
    toast(`${NP.matName(m)} · 순서 문제 ${d.passages.length}문항을 올렸습니다`);
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

  printMats() { return this.mockMats().map(m => ({ m, rs: this.recs(m.id) })).filter(x => x.rs.length); },
  // 고른 지문 → [{ key, m, num, q }]
  items() {
    const out = [];
    this.printMats().forEach(({ m, rs }) => rs.forEach(r => {
      const key = m.id + '|' + r.num;
      if (this.sel.has(key)) out.push({ key, m, num: r.num, q: r.q });
    }));
    return out;
  },

  openPrint() {
    const K = Prints.kit;
    const pm = this.printMats();
    if (!pm.length) { toast('인쇄할 순서 문제가 없습니다. 먼저 파일을 올리세요.'); return; }
    this.loadSet();
    K.ensureAssets(); this.ensureCss();
    const live = new Set();
    pm.forEach(({ m, rs }) => rs.forEach(r => live.add(m.id + '|' + r.num)));
    [...this.sel].forEach(k => { if (!live.has(k)) this.sel.delete(k); });
    const body = `<div class="pr-wrap wx-pw">
      <aside class="panel pr-side wx-pside">
        <div class="pr-sec"><h2>범위</h2>
          <div class="wx-psbtn"><button type="button" class="btn sm" data-oa="op-all">전체 선택</button><button type="button" class="btn sm" data-oa="op-none">선택 해제</button></div>
          <div class="wx-pslist" data-odsel>${this.selHtml()}</div>
          <p class="pr-hint" data-odsum></p></div>
        <div class="pr-sec"><h2>순서</h2>
          <button type="button" class="btn sm" data-oa="op-shuffle">다시 섞기</button>
          <p class="pr-hint">문제 순서를 섞어요. 모든 부가 같은 순서예요.</p></div>
        <div class="pr-sec"><h2>글자</h2>
          <label class="pr-fld"><span>학원명</span><input type="text" data-op-ac value="${esc(K.academy())}" placeholder="학원명을 입력하세요" maxlength="40" autocomplete="off"></label>
          <p class="pr-hint">표지+양식의 학원명과 같은 값이에요.</p>
          <label class="pr-fld"><span>날짜 (선택)</span>
            <div class="pr-inline"><input type="date" data-op-date value="${esc(this.pr.date)}" aria-label="날짜"><button type="button" class="btn sm" data-oa="op-date-clear">지우기</button></div></label>
          <p class="pr-hint">비워 두면 날짜 칸이 빈 줄로 나와요.</p></div>
        <div class="pr-sec"><h2>학생 이름</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="학생 이름 넣는 방식">
            <label class="chk"><input type="radio" name="op-nm-mode" value="manual" ${this.pick.mode === 'class' ? '' : 'checked'}>직접 입력</label>
            <label class="chk"><input type="radio" name="op-nm-mode" value="class" ${this.pick.mode === 'class' ? 'checked' : ''}>반에서 선택</label>
          </div>
          <div data-op-nmbody>${this.nmBodyHtml()}</div></div>
        <div class="pr-sec"><h2>출력</h2>
          <label class="chk pr-chk"><input type="checkbox" data-op-duplex ${this.set.duplex ? 'checked' : ''}>양면 프린터 사용</label>
          <p class="pr-hint" data-op-dxhint>${this.dxHint()}</p>
          <div class="pr-print" style="margin-top:10px">
            <input type="number" data-op-copies min="1" max="500" step="1" value="${esc(this.pr.copies)}" placeholder="부수" aria-label="출력 부수"${this.pick.mode === 'class' ? ' disabled' : ''}>
            <button type="button" class="btn primary" data-oa="op-print" data-op-printbtn>${this.printLabel()}</button>
          </div>
          <div class="pr-note">인쇄창에서 배율은 <b>기본값(100%)</b>으로 두세요. 양면 프린터를 사용할 땐 인쇄창의 <b>양면 인쇄</b>도 켜져 있어야 해요.</div></div>
      </aside>
      <section class="wx-pview" data-odprev></section>
    </div>`;
    Modal.open({
      title: '순서 문제 인쇄', size: 'xl wx-pmodal', body, autofocus: false,
      onMount: (b, md) => {
        const upd = debounce(() => this.prevBuild(b, md), 150);
        const syncIndet = () => $$('[data-oddet]', b).forEach(x => { x.indeterminate = true; });
        const refreshSel = () => {
          const box = $('[data-odsel]', b), top = box.scrollTop;
          box.innerHTML = this.selHtml(); box.scrollTop = top;
          syncIndet(); upd();
        };
        const refreshNm = (listToo) => {
          if (listToo) { const l = $('[data-op-list]', b); if (l) { const bx = $('.pr-nm-stus', l), t = bx ? bx.scrollTop : 0; l.innerHTML = this.nmListHtml(); const nb = $('.pr-nm-stus', l); if (nb) nb.scrollTop = t; } }
          const p = $('[data-op-picked]', b); if (p) p.innerHTML = this.nmPickedHtml();
          syncIndet();
          $('[data-op-printbtn]', b).textContent = this.printLabel();
          $('[data-op-copies]', b).disabled = this.pick.mode === 'class';
          upd();
        };
        syncIndet();
        b.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-osg]');
          if (chip) { const k = chip.dataset.osg; if (this.sel.has(k)) this.sel.delete(k); else this.sel.add(k); refreshSel(); return; }
          const bt = e.target.closest('[data-oa]'); if (!bt) return;
          const a = bt.dataset.oa;
          if (a === 'op-all') { this.printMats().forEach(x => x.rs.forEach(r => this.sel.add(x.m.id + '|' + r.num))); refreshSel(); }
          else if (a === 'op-none') { this.sel.clear(); refreshSel(); }
          else if (a === 'op-shuffle') { this.seed = (this.seed * 7919 + 104729) % 2147483647 || 1; upd(); }
          else if (a === 'op-date-clear') { this.pr.date = ''; $('[data-op-date]', b).value = ''; upd(); }
          else if (a === 'op-nm-clear') { this.pick.sel = []; refreshNm(true); }
          else if (a === 'op-print') this.doPrint(b);
        });
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-op-ac]')) { K.setAcademy(t.value); upd(); }
          else if (t.matches('[data-op-date]')) { this.pr.date = isYmd(t.value) ? t.value : ''; upd(); }
          else if (t.matches('[data-op-name]')) { this.pr.name = t.value; upd(); }
          else if (t.matches('[data-op-copies]')) this.pr.copies = t.value;
        });
        b.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-osm]')) {
            const x = this.printMats().find(y => y.m.id === t.dataset.osm);
            if (x) x.rs.forEach(r => { const k = x.m.id + '|' + r.num; if (t.checked) this.sel.add(k); else this.sel.delete(k); });
            refreshSel();
          } else if (t.matches('[data-op-duplex]')) {
            this.set.duplex = t.checked; this.saveSet();
            $('[data-op-dxhint]', b).textContent = this.dxHint(); upd();
          } else if (t.matches('[name="op-nm-mode"]')) {
            if (!t.checked) return;
            this.pick.mode = t.value === 'class' ? 'class' : 'manual';
            $('[data-op-nmbody]', b).innerHTML = this.nmBodyHtml(); refreshNm(false);
          } else if (t.matches('[data-op-class]')) {
            this.pick.classId = t.value;
            const l = $('[data-op-list]', b); if (l) l.innerHTML = '';
            refreshNm(true);
          } else if (t.matches('[data-op-allstu]')) {
            this.nmToggle(K.roster(this.pick.classId).map(s => s.id), t.checked); refreshNm(true);
          } else if (t.matches('[data-op-stu]')) {
            this.nmToggle([t.dataset.opStu], t.checked); refreshNm(true);
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
      return `<div class="wx-psm"><label class="chk wx-psmh"><input type="checkbox" data-osm="${m.id}" ${on === rs.length ? 'checked' : ''}${on && on < rs.length ? ' data-oddet' : ''}>
        <span class="np-tag mock">${MAT_TYPE.mock}</span><b>${esc(NP.matName(m))}</b></label>
        <div class="np-chips">${rs.map(r => `<button type="button" class="np-c sm ${this.sel.has(m.id + '|' + r.num) ? 'on' : ''}" data-osg="${esc(m.id + '|' + r.num)}">${esc(r.num)}번</button>`).join('')}</div></div>`;
    }).join('');
  },
  /* ---------- 학생 이름 (표지+양식과 같은 방식) ---------- */
  pickStudents() { return this.pick.sel.map(id => Store.get('students', id)).filter(Boolean); },
  nmBodyHtml() {
    const K = Prints.kit;
    if (this.pick.mode !== 'class') return `<label class="pr-fld"><span>학생 이름</span><input type="text" data-op-name value="${esc(this.pr.name)}" placeholder="비워 두면 빈 줄로 나와요" maxlength="20" autocomplete="off"></label>`;
    const cls = K.classes();
    if (this.pick.classId && !cls.some(c => c.id === this.pick.classId)) this.pick.classId = '';
    return `<label class="pr-fld"><span>반</span>
        <select data-op-class><option value="">반을 고르세요</option>
          ${cls.map(c => `<option value="${esc(c.id)}"${c.id === this.pick.classId ? ' selected' : ''}>${esc(c.name)} (${K.roster(c.id).length}명)</option>`).join('')}</select></label>
      <div class="pr-nm-list" data-op-list>${this.nmListHtml()}</div>
      <div class="pr-nm-picked" data-op-picked>${this.nmPickedHtml()}</div>
      <p class="pr-hint">다른 반을 골라도 체크한 학생은 그대로 남아요. 고른 학생마다 한 부씩, 이름만 바뀌어 인쇄돼요.</p>`;
  },
  nmListHtml() {
    if (!this.pick.classId) return '<div class="none">반을 고르면 학생 목록이 나와요.</div>';
    const ros = Prints.kit.roster(this.pick.classId);
    if (!ros.length) return '<div class="none">이 반에는 재원생이 없어요.</div>';
    const on = new Set(this.pick.sel);
    const all = ros.every(s => on.has(s.id)), some = ros.some(s => on.has(s.id));
    return `<label class="chk pr-nm-all"><input type="checkbox" data-op-allstu ${all ? 'checked' : ''}${!all && some ? ' data-oddet' : ''}>반 전체 선택</label>
      <div class="pr-nm-stus">${ros.map(s => `<label class="chk"><input type="checkbox" data-op-stu="${esc(s.id)}" ${on.has(s.id) ? 'checked' : ''}>${esc(s.name)}${stTag(s) ? ` <small>${esc(stTag(s))}</small>` : ''}</label>`).join('')}</div>`;
  },
  nmPickedHtml() {
    const list = this.pickStudents();
    if (!list.length) return '<span class="none">고른 학생: 없음</span>';
    return `<div class="pr-nm-ph"><b>고른 학생 ${list.length}명</b><button type="button" class="btn sm" data-oa="op-nm-clear">모두 해제</button></div>
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
  headHtml(nm) {
    const K = Prints.kit, dt = K.dateText(this.pr.date), n = String(nm || '').trim();
    return `<div class="pn-head"><div class="pn-academy">${esc(K.academy())}</div><div class="pn-fields">
        <span class="pn-field">날짜<span class="pn-blank${dt ? ' pn-val' : ''}" style="width:30mm">${esc(dt)}</span></span>
        <span class="pn-field">이름<span class="pn-blank${n ? ' pn-val' : ''}" style="width:38mm">${esc(n)}</span></span>
      </div></div>`;
  },
  qHtml(it, no) {
    const q = it.q;
    return `<div class="od-q"><div class="od-qh"><span class="od-no">${no}.</span><span class="od-src">${esc(this.srcLabel(it.m, it.num))}</span></div>
      <div class="od-given">${esc(q.intro)}</div>
      ${'ABC'.split('').map(x => `<p class="od-tx"><b>(${x})</b> ${esc(q[x])}</p>`).join('')}
      <div class="od-opts">${this.OPTS.map((o, i) => `<span>${'①②③④⑤'[i]} ${o.split('').map(x => `(${x})`).join(' – ')}</span>`).join('')}</div></div>`;
  },
  async fontsReady() {
    const ln = document.getElementById('pr-paper-font');
    if (ln && !ln.sheet) await new Promise(r => { ln.addEventListener('load', r, { once: true }); ln.addEventListener('error', r, { once: true }); setTimeout(r, 4000); });
    if (!document.fonts || !document.fonts.load) return;
    const fs = ['16px "Gowun Dodum"', '700 16px "Gowun Batang"', '400 16px "Noto Serif KR"', '700 16px "Noto Serif KR"'];
    await Promise.race([Promise.all(fs.map(f => document.fonts.load(f).catch(() => null))), new Promise(r => setTimeout(r, 4000))]);
  },
  rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  },
  // 쪽 나누기 + 섞기 (화면 밖에 실제 크기로 그려서 잰다) → { qs:[문제지 본문], ak:[정답지 본문], n }
  //  섞은 순서대로 놓되, 지금 단에 안 들어가면 뒤에 있는 문항 중 들어가는 것을 먼저 놓아 빈자리를 줄인다
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
      const pool = items.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const DIR = `<div class="od-dir"><span class="pn-tag">글의 순서 · ${items.length}문항</span><span>주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.</span></div>`;
      const order = [], qs = [];
      let cols = null, ci = 0, first = true;
      const newPage = () => {
        host.innerHTML = `<div class="pn-sheet od-qs">${this.headHtml('')}${first ? DIR : ''}<div class="od-body"><div class="od-col"></div><div class="od-col"></div></div></div>`;
        cols = [...host.querySelectorAll('.od-col')]; ci = 0; first = false;
      };
      const fits = (col) => { const l = col.lastElementChild; return !l || l.getBoundingClientRect().bottom <= col.getBoundingClientRect().bottom - 2; };
      const take = () => (host.querySelector('.od-dir') ? host.querySelector('.od-dir').outerHTML : '') + host.querySelector('.od-body').outerHTML;
      newPage();
      while (pool.length) {
        const col = cols[ci], empty = !col.children.length;
        let placed = -1;
        for (let i = 0; i < pool.length; i++) {
          col.insertAdjacentHTML('beforeend', this.qHtml(pool[i], order.length + 1));
          if (empty || fits(col)) { placed = i; break; }
          col.lastElementChild.remove();
        }
        if (placed >= 0) { order.push(pool.splice(placed, 1)[0]); continue; }
        if (ci === 0) { ci = 1; continue; }
        qs.push(take());
        newPage();
      }
      qs.push(take());
      // 정답지: 4줄 칸, 줄 높이 7mm
      const ak = [];
      const ROW = 7, NCOL = 4;
      const AKH = `<div class="od-dir"><span class="pn-tag">글의 순서 정답 · ${order.length}문항</span></div>`;
      host.innerHTML = `<div class="pn-sheet od-aks">${this.headHtml('')}${AKH}<div class="od-akb"></div></div>`;
      const per = Math.max(1, Math.floor(($('.od-akb', host).clientHeight * MM) / ROW)) * NCOL;
      const rows = order.map((it, i) => `<div class="od-akr"><span class="od-akn">${i + 1}</span><span class="od-aka">${'①②③④⑤'[it.q.answer - 1]}</span><span class="od-aks">${esc(`${String(it.m.year).slice(-2)}.${it.m.month} · ${it.num}번`)}</span></div>`);
      for (let i = 0; i < rows.length; i += per) {
        const chunk = rows.slice(i, i + per), rpc = Math.ceil(per / NCOL), cs = [];
        for (let c = 0; c < NCOL; c++) cs.push(`<div class="od-akc">${chunk.slice(c * rpc, (c + 1) * rpc).join('')}</div>`);
        ak.push(`${AKH}<div class="od-akb">${cs.join('')}</div>`);
      }
      this._cache = { key, qs, ak, n: order.length };
      return this._cache;
    } finally { host.remove(); }
  },
  // 한 부 = 문제지 (+빈 면) + 정답지 (+빈 면)
  copyPages(pg, nm) {
    const blank = { html: '<div class="pn-sheet"></div>', cap: '빈 면 (양면 인쇄용)', blank: true };
    const out = [];
    pg.qs.forEach((b, i) => out.push({ html: `<div class="pn-sheet od-qs">${this.headHtml(nm)}${b}</div>`, cap: `문제 ${i + 1}/${pg.qs.length}` }));
    if (this.set.duplex && pg.qs.length % 2) out.push(blank);
    pg.ak.forEach((b, i) => out.push({ html: `<div class="pn-sheet od-aks">${this.headHtml(nm)}${b}</div>`, cap: `정답 ${i + 1}/${pg.ak.length}` }));
    if (this.set.duplex && pg.ak.length % 2) out.push(blank);
    return out;
  },
  async prevBuild(b, md) {
    const tok = ++this._tok;
    const pv = $('[data-odprev]', b), sm = $('[data-odsum]', b);
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
    const pages = this.copyPages(pg, nm).filter(p => !p.blank);
    sm.textContent = `고른 문항 ${items.length}개 → 문제 ${pg.qs.length}쪽 + 정답 ${pg.ak.length}쪽`;
    const K = Prints.kit, s = 0.36;
    pv.innerHTML = `<div class="wx-pv-h">미리보기 · 한 부${nm ? ` (${esc(nm)})` : ''} · 누르면 크게 보기</div><div class="wx-pv-grid">${pages.map((p, i) => `<figure class="wx-th od-th" data-odbig="${i}">
        <div class="wx-thb" style="width:${(K.PAGE_W * s).toFixed(1)}px;height:${(K.PAGE_H * s).toFixed(1)}px"><div style="transform:scale(${s});transform-origin:0 0;width:${K.PAGE_W}px;height:${K.PAGE_H}px">${p.html}</div></div>
        <figcaption>${esc(p.cap)}</figcaption></figure>`).join('')}</div>`;
    pv.onclick = (e) => {
      const f = e.target.closest('[data-odbig]'); if (!f) return;
      const p = pages[+f.dataset.odbig]; if (!p) return;
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
      const inp = $('[data-op-copies]', b), v = String(inp.value || '').trim();
      if (v === '') { toast('출력 부수를 입력하세요.'); inp.focus(); return; }
      const n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
      if (n < 1 || n > 500) { toast('출력 부수는 1에서 500 사이로 입력하세요.'); inp.focus(); return; }
      names = Array.from({ length: n }, () => this.pr.name);
    }
    const pg = await this.paginate(items);
    const html = names.map(nm => this.copyPages(pg, nm).map(p => p.html).join('')).join('');
    Prints.kit.printPaper(html, `순서문제_${todayStr()}`, this.PAPER_CSS);
  },

  /* ---------- 종이 CSS (표지+양식의 .pn-sheet 위에 더함 · 삽입 탭과 같은 글꼴·크기) ---------- */
  PAPER_CSS: `
.pn-sheet .od-dir{flex-shrink:0;display:flex;align-items:center;gap:3mm;margin:0 0 4mm;font-size:10pt;font-weight:700;color:var(--pn-ink)}
.pn-sheet .od-body{flex:1;min-height:0;display:flex}
.pn-sheet .od-col{flex:1 1 0;min-width:0;min-height:0;overflow:hidden;padding-right:4mm}
.pn-sheet .od-col + .od-col{padding:0 0 0 4mm;border-left:0.3mm solid var(--pn-line)}
.pn-sheet .od-q{padding-bottom:5mm}
.pn-sheet .od-qh{display:flex;align-items:center;gap:2mm;margin-bottom:1.4mm}
.pn-sheet .od-no{font-family:"Noto Serif KR",serif;font-size:11pt;font-weight:700;color:#1f272d}
.pn-sheet .od-src{font-family:"Gowun Batang",serif;font-size:7.5pt;font-weight:700;background:var(--pn-tag-bg);color:var(--pn-tag-ink);padding:0.3mm 2.2mm;border-radius:10mm;line-height:1.4}
.pn-sheet .od-given{border:0.3mm solid #39434a;padding:1.5mm 2.4mm;margin:0 0 1.8mm;font-family:"Noto Serif KR",serif;font-size:8.8pt;line-height:1.48;color:#1f272d;text-align:justify;overflow-wrap:anywhere}
.pn-sheet .od-tx{font-family:"Noto Serif KR",serif;font-size:8.8pt;line-height:1.5;color:#1f272d;text-align:justify;margin:0;overflow-wrap:anywhere}
.pn-sheet .od-tx + .od-tx{margin-top:1.2mm}
.pn-sheet .od-opts{display:grid;grid-template-columns:repeat(3,auto);justify-content:space-between;gap:0.6mm 3mm;margin-top:1.8mm;font-family:"Noto Serif KR",serif;font-size:8.6pt;color:#1f272d;white-space:nowrap}
.pn-sheet .od-akb{flex:1;min-height:0;display:flex;gap:5mm}
.pn-sheet .od-akc{flex:1 1 0;min-width:0}
.pn-sheet .od-akr{display:flex;align-items:center;gap:2mm;height:7mm;border-bottom:0.2mm solid var(--pn-line);font-size:10pt;color:#1f272d}
.pn-sheet .od-akn{flex:none;width:8mm;text-align:right;font-weight:700}
.pn-sheet .od-aka{flex:none;width:7mm;text-align:center;font-weight:700;font-size:12pt}
.pn-sheet .od-aks{flex:1;min-width:0;font-size:7.5pt;color:var(--pn-ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`,
  ensureCss() {
    if (document.getElementById('od-paper-css')) return;
    const st = document.createElement('style');
    st.id = 'od-paper-css';
    st.textContent = this.PAPER_CSS;
    document.head.appendChild(st);
  },
};

/* 순서 탭 화면 스타일 (테마 변수만 사용 · 나머지는 서술형 탭의 wx- 스타일을 같이 씀) */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.od-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; margin-top: 10px; }
.od-card { display: flex; align-items: baseline; justify-content: center; gap: 5px; padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); cursor: pointer; font-size: 13.5px; white-space: nowrap; }
.od-card span { font-size: 12px; color: var(--ink-mute); }
.od-card:hover { border-color: var(--accent); }
.od-card.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-ink); }
.od-card.on span { color: var(--accent-ink); }
.od-tip { margin: 8px 2px 0; }
.od-ans { display: inline-block; margin-left: 8px; font-size: 12.5px; font-weight: 700; color: var(--accent-ink); background: var(--accent-soft); border-radius: 10px; padding: 0 8px; }
.od-scr { padding: 8px 4px 4px; line-height: 1.6; }
.od-sgiven { border: 1px solid var(--line-strong); border-radius: 6px; padding: 6px 10px; margin-bottom: 8px; }
.od-sp { margin: 0 0 6px; }
.od-th { cursor: zoom-in; }
`;
  document.head.appendChild(st);
})();
