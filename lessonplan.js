/* =========================================================
   lessonplan.js — Lesson Plan (선생님 › Lesson Plan)
   반마다 영역별(단어·문법·독해·듣기·일반) 학습 방법 · 숙제 방식 · 평가 방식을 적어 두고,
   반마다 A4 한 장 / 모든 반 요약표(가로 A4)로 PDF 저장 · 출력 (원장 보고 · 홍보용)
   기록은 meta 테이블 (서버 SQL 변경 없음):
     { id 'LP_반ID', kind:'lplan', classId, areas:{ word:{ method, hw, eval }, gram, read, listen, general }, memo(내부용 — PDF 제외), createdAt, updatedAt }
   반 정보(요일·시간)와 독해·문법 교재(시험+교재 › 일반 교재 중 그 반에 연결된 것)는 자동으로 보여 준다.
   머리말의 학원 이름·로고는 학생 › Report 설정에 저장된 것을 쓴다.
   ========================================================= */
const LP_AREAS = [['word', '단어'], ['gram', '문법'], ['read', '독해'], ['listen', '듣기'], ['general', '일반']];
const LP_FIELDS = [['method', '학습 방법', '예: 매 수업 30개 암기 → 스펠링·뜻 쓰기'], ['hw', '숙제 방식', '예: 다음 시간 범위 미리 외워 오기, 오답 노트'], ['eval', '평가 방식', '예: 매 수업 단어 테스트 (80점 미만 재시험)']];
const LP_COLORS = { word: '#A9650B', gram: '#5B3FA6', read: '#1D5E93', listen: '#1F7A52', general: '#566D80' };

const LessonPlan = {
  cid: '',            // 고른 반
  showEnded: false,
  pdfShape: 'page',   // 'page' 반마다 A4 한 장 / 'table' 모든 반 요약표
  pdfScope: 'cur',    // 'cur' 지금 반 / 'act' 진행 중인 반 전체 / 'pick' 직접 고르기

  /* ---------- 데이터 ---------- */
  pid(cid) { return 'LP_' + cid; },
  plan(cid) { return Store.get('meta', this.pid(cid)); },
  val(p, area, f) { return stripZws(((p && p.areas && p.areas[area]) || {})[f] || '').trim(); },
  areaHas(p, area) { return LP_FIELDS.some(([f]) => this.val(p, area, f)); },
  hasAny(p) { return !!p && LP_AREAS.some(([a]) => this.areaHas(p, a)); },
  classes(withEnded) {
    const all = Classes.sorted(Store.all('classes'));
    return withEnded ? all.filter(c => c.active !== false).concat(all.filter(c => c.active === false)) : all.filter(c => c.active !== false);
  },
  // 그 반에 연결된 일반 교재 중 독해·문법 { read:[이름], gram:[이름] }
  books(cid) {
    const out = { read: [], gram: [] };
    NP.genMats().filter(m => (m.classIds || []).includes(cid) && (m.cat === 'read' || m.cat === 'gram'))
      .sort((a, b) => ko(a.name, b.name)).forEach(m => out[m.cat].push(m.name));
    return out;
  },
  save(cid, area, f, v) {
    const cur = this.plan(cid) || { id: this.pid(cid), kind: 'lplan', classId: cid, areas: {}, memo: '', createdAt: new Date().toISOString() };
    const rec = JSON.parse(JSON.stringify(cur));
    if (area === 'memo') rec.memo = v;
    else { rec.areas = rec.areas || {}; rec.areas[area] = Object.assign({}, rec.areas[area] || {}, { [f]: v }); }
    if (JSON.stringify(rec) === JSON.stringify(cur) && Store.get('meta', rec.id)) return;
    rec.updatedAt = new Date().toISOString();
    Store.put('meta', rec);
  },

  /* ---------- 화면 ---------- */
  render(main) {
    const list = this.classes(this.showEnded);
    const ended = Store.all('classes').filter(c => c.active === false).length;
    if (!list.some(c => c.id === this.cid)) this.cid = list.length ? list[0].id : '';
    const c = Store.get('classes', this.cid);
    let h = `<div class="page-head"><h1>Lesson Plan</h1><span class="sub">반별 영역 학습 방법 · 숙제 · 평가 — 원장 보고 · 홍보용 PDF</span><span class="grow" style="flex:1"></span>
      <button class="btn" data-lpa="pdf" ${Store.all('classes').length ? '' : 'disabled'}>PDF 저장</button></div>`;
    if (!list.length) {
      main.innerHTML = h + `<div class="panel"><div class="empty">${ended ? '진행 중인 반이 없습니다.' : '만들어진 반이 없습니다. 반 메뉴에서 먼저 반을 만드세요.'}</div></div>`
        + (ended ? `<label class="chk small" style="margin-top:10px"><input type="checkbox" data-lpended>종료된 반 보기 (${ended})</label>` : '');
      this.bind(main);
      return;
    }
    h += `<div class="lp-wrap"><aside class="lp-side"><div class="lp-list">${list.map(x => {
      const has = this.hasAny(this.plan(x.id));
      return `<button type="button" class="lp-cls${x.id === this.cid ? ' on' : ''}${x.active === false ? ' end' : ''}" data-lpc="${x.id}">${Classes.dot(x)}<span class="nm">${esc(x.name)}</span>${has ? '<i class="lp-has" title="작성함"></i>' : ''}</button>`;
    }).join('')}</div>${ended ? `<label class="chk small lp-ended"><input type="checkbox" data-lpended ${this.showEnded ? 'checked' : ''}>종료된 반 보기 (${ended})</label>` : ''}</aside>`;
    h += `<section class="lp-body">${this.editorHtml(c)}</section></div>`;
    main.innerHTML = h;
    enhanceAll(main);
    this.bind(main);
  },
  editorHtml(c) {
    const p = this.plan(c.id), bk = this.books(c.id);
    const chips = (arr) => arr.length ? arr.map(n => `<span class="lp-bk">${esc(n)}</span>`).join('') : '<span class="muted small">연결된 교재 없음</span>';
    let h = `<div class="panel lp-info"><div class="lp-ttl">${Classes.dot(c)}<b>${esc(c.name)}</b>${c.active === false ? ' <span class="badge gray">종료</span>' : ''}
        <span class="soft">${esc(Classes.timeLabel(c))}</span><span style="flex:1"></span>
        <button type="button" class="btn sm ghost" data-lpa="copy" title="다른 반에 적어 둔 내용을 이 반으로 가져옵니다">다른 반 내용 복사</button></div>
      <div class="lp-books"><div><span class="bk-cat read">독해</span>${chips(bk.read)}</div><div><span class="bk-cat gram">문법</span>${chips(bk.gram)}</div></div>
      <div class="small muted">교재는 시험+교재 › 일반 교재에서 이 반에 연결한 독해·문법 교재가 자동으로 나옵니다.</div></div>`;
    h += '<div class="lp-areas">';
    LP_AREAS.forEach(([a, lb]) => {
      h += `<div class="panel lp-area" style="--lpc:${LP_COLORS[a]}"><div class="lp-ah"><b>${lb}</b>${this.areaHas(p, a) ? '' : '<span class="small muted">비어 있으면 PDF에 나오지 않습니다</span>'}</div>
        ${LP_FIELDS.map(([f, fl, ph]) => `<label class="lp-f"><span>${fl}</span><textarea rows="2" data-lpf="${a}|${f}" placeholder="${esc(ph)}">${esc(((p && p.areas && p.areas[a]) || {})[f] || '')}</textarea></label>`).join('')}</div>`;
    });
    h += `</div><div class="panel lp-memo"><div class="lp-ah"><b>반 전체 메모</b><span class="small muted">내부용 · PDF에 나오지 않습니다</span></div>
      <textarea rows="3" data-lpf="memo|" placeholder="예: 다음 학기부터 독해 교재 변경 검토">${esc((p && p.memo) || '')}</textarea></div>`;
    return h;
  },
  bind(main) {
    main.onclick = (e) => {
      const cb = e.target.closest('[data-lpc]');
      if (cb) { if (cb.dataset.lpc !== this.cid) { this.cid = cb.dataset.lpc; App.render(); } return; }
      const a = e.target.closest('[data-lpa]');
      if (!a) return;
      if (a.dataset.lpa === 'pdf') this.pdfDlg();
      else if (a.dataset.lpa === 'copy') this.copyDlg();
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-lpended]')) { this.showEnded = e.target.checked; App.render(); return; }
      const t = e.target.closest('[data-lpf]');
      if (!t || !this.cid) return;
      const [a, f] = t.dataset.lpf.split('|');
      this.save(this.cid, a, f, stripZws(t.value));
      // 화면 전체를 다시 그리지 않고 표시만 맞춘다 (입력 흐름 유지)
      const p = this.plan(this.cid);
      const btn = $(`[data-lpc="${this.cid}"]`, main);
      if (btn) { const has = this.hasAny(p), dot = $('.lp-has', btn); if (has && !dot) btn.insertAdjacentHTML('beforeend', '<i class="lp-has" title="작성함"></i>'); if (!has && dot) dot.remove(); }
      if (a !== 'memo') {
        const card = t.closest('.lp-area'), hint = $('.lp-ah .muted', card), has = this.areaHas(p, a);
        if (has && hint) hint.remove();
        if (!has && !hint) $('.lp-ah', card).insertAdjacentHTML('beforeend', '<span class="small muted">비어 있으면 PDF에 나오지 않습니다</span>');
      }
    };
  },

  // 다른 반 내용을 지금 반으로 (지금 반에 적은 내용이 있으면 확인 후 덮어씀 · 메모는 가져오지 않음)
  copyDlg() {
    const cid = this.cid;
    const src = this.classes(true).filter(c => c.id !== cid && this.hasAny(this.plan(c.id)));
    if (!src.length) { toast('내용을 적어 둔 다른 반이 없습니다'); return; }
    Modal.open({
      title: '다른 반 내용 복사', size: 'sm', autofocus: false,
      body: `<p class="small soft" style="margin:0 0 8px">고른 반의 영역별 내용(학습 방법·숙제·평가)을 이 반으로 가져옵니다. 반 전체 메모는 가져오지 않습니다.</p>
        <div class="pick-list lp-pick">${src.map((c, i) => `<label><input type="radio" name="lpsrc" value="${c.id}" ${i ? '' : 'checked'}>${Classes.dot(c)}${esc(c.name)} <span class="muted small">${esc(Classes.timeLabel(c))}</span></label>`).join('')}</div>`,
      buttons: [
        { text: '취소' },
        { text: '가져오기', cls: 'primary', primary: true, onClick: async (m) => {
          const sid = ($('[name=lpsrc]:checked', m.body) || {}).value, sp = sid && this.plan(sid);
          if (!sp) return false;
          const cur = this.plan(cid);
          if (this.hasAny(cur) && !await confirmDlg('이 반에 적어 둔 영역별 내용을 고른 반 내용으로 바꿀까요?\n(반 전체 메모는 그대로)', '바꾸기')) return false;
          const rec = Object.assign({}, cur || { id: this.pid(cid), kind: 'lplan', classId: cid, memo: '', createdAt: new Date().toISOString() },
            { areas: JSON.parse(JSON.stringify(sp.areas || {})), updatedAt: new Date().toISOString() });
          Store.put('meta', rec);
          toast('내용을 가져왔습니다');
          App.render();
        } },
      ],
    });
  },

  /* ---------- PDF ---------- */
  pdfDlg() {
    const all = this.classes(true);
    const body = `<div class="form">
      <label>모양</label><div class="row">${[['page', '반마다 A4 한 장'], ['table', '모든 반 요약표 (가로)']].map(([k, t]) => `<label class="chk"><input type="radio" name="lpshape" value="${k}" ${this.pdfShape === k ? 'checked' : ''}>${t}</label>`).join('')}</div>
      <label>범위</label><div class="row">${[['cur', '지금 반'], ['act', '진행 중인 반 전체'], ['pick', '직접 고르기']].map(([k, t]) => `<label class="chk"><input type="radio" name="lpscope" value="${k}" ${this.pdfScope === k ? 'checked' : ''}>${t}</label>`).join('')}</div>
      <label class="top" data-lppick>반</label><div data-lppick><div class="pick-list lp-pick">${all.map(c => `<label><input type="checkbox" name="lpc" value="${c.id}" ${c.id === this.cid ? 'checked' : ''}>${Classes.dot(c)}${esc(c.name)}${c.active === false ? ' <span class="badge gray">종료</span>' : ''}${this.hasAny(this.plan(c.id)) ? '' : ' <span class="muted small">(내용 없음)</span>'}</label>`).join('')}</div></div>
    </div><p class="small muted" style="margin:10px 0 0">인쇄 창에서 대상을 “PDF로 저장”으로 고르면 파일로, 프린터를 고르면 바로 출력됩니다. 내용을 적지 않은 반·영역은 빠집니다.</p>`;
    Modal.open({
      title: 'Lesson Plan PDF 저장', size: 'md', autofocus: false, body,
      onMount: (b) => {
        const sync = () => { const pk = ($('[name=lpscope]:checked', b) || {}).value === 'pick'; $$('[data-lppick]', b).forEach(x => { x.style.display = pk ? '' : 'none'; }); };
        sync();
        b.addEventListener('change', (e) => { if (e.target.name === 'lpscope') sync(); });
      },
      buttons: [
        { text: '취소' },
        { text: 'PDF 저장', cls: 'primary', primary: true, onClick: (m) => {
          const b = m.body;
          this.pdfShape = $('[name=lpshape]:checked', b).value;
          this.pdfScope = $('[name=lpscope]:checked', b).value;
          let ids;
          if (this.pdfScope === 'cur') ids = this.cid ? [this.cid] : [];
          else if (this.pdfScope === 'act') ids = this.classes(false).map(c => c.id);
          else ids = $$('[name=lpc]:checked', b).map(i => i.value);
          const cls = all.filter(c => ids.includes(c.id) && this.hasAny(this.plan(c.id)));
          if (!cls.length) { toast(ids.length ? '고른 반에 적어 둔 내용이 없습니다' : '반을 고르세요'); return false; }
          this.pdf(cls, this.pdfShape);
        } },
      ],
    });
  },

  pdf(cls, shape) {
    const today = todayStr();
    const cfg = typeof Reports !== 'undefined' && Reports.cfg ? Reports.cfg() : { academy: '', logo: '' };
    const academy = String(cfg.academy || '').trim(), logo = cfg.logo || '';
    const br = (s) => esc(s).replace(/\n/g, '<br>');
    const brand = academy || logo ? `<div class="brand">${logo ? `<img src="${esc(logo)}" alt="">` : ''}${academy ? `<span>${esc(academy)}</span>` : ''}</div>` : '<div class="brand"></div>';
    const bookChips = (c) => {
      const bk = this.books(c.id);
      const one = (k, lb) => bk[k].length ? `<span class="bk ${k}"><b>${lb}</b>${bk[k].map(esc).join(' · ')}</span>` : '';
      return one('read', '독해') + one('gram', '문법');
    };
    const fname = 'LessonPlan_' + (cls.length === 1 ? cls[0].name.replace(/[\\/:*?"<>|]/g, '').trim() + '_' : '') + today;
    let body = '', page = 'A4 portrait', margin = '0';
    if (shape === 'table') {
      page = 'A4 landscape'; margin = '9mm';
      const areas = LP_AREAS.filter(([a]) => cls.some(c => this.areaHas(this.plan(c.id), a)));
      const cell = (p, a) => LP_FIELDS.filter(([f]) => this.val(p, a, f)).map(([f, fl]) => `<div class="ln"><i>${fl.replace(' 방식', '').replace(' 방법', '')}</i>${br(this.val(p, a, f))}</div>`).join('') || '<span class="none">-</span>';
      body = `<div class="thead">${brand}<div class="ttl"><h1>Lesson Plan<small>반별 수업 운영 요약</small></h1><div class="dt">${today}</div></div></div>
        <table><thead><tr><th class="c0">반</th>${areas.map(([a, lb]) => `<th style="--ac:${LP_COLORS[a]}"><span>${lb}</span></th>`).join('')}</tr></thead><tbody>${cls.map(c => {
          const p = this.plan(c.id);
          return `<tr><td class="c0"><div class="cn"><span class="dot" style="background:${Classes.colorOf(c)}"></span>${esc(c.name)}</div><div class="tm">${esc(Classes.timeLabel(c))}</div><div class="bks">${bookChips(c)}</div></td>${areas.map(([a]) => `<td>${cell(p, a)}</td>`).join('')}</tr>`;
        }).join('')}</tbody></table>`;
    } else {
      body = cls.map(c => {
        const p = this.plan(c.id);
        const secs = LP_AREAS.filter(([a]) => this.areaHas(p, a)).map(([a, lb]) => `<section style="--ac:${LP_COLORS[a]}"><h3><span>${lb}</span></h3><div class="rows">${LP_FIELDS.filter(([f]) => this.val(p, a, f)).map(([f, fl]) => `<div class="row"><div class="k">${fl}</div><div class="v">${br(this.val(p, a, f))}</div></div>`).join('')}</div></section>`).join('');
        const bks = bookChips(c);
        return `<div class="pg"><header>${brand}<div class="tag">LESSON PLAN</div></header>
          <div class="hero"><div class="cn"><span class="dot" style="background:${Classes.colorOf(c)}"></span>${esc(c.name)}</div><div class="tm">${esc(Classes.timeLabel(c))}</div>${bks ? `<div class="bks">${bks}</div>` : ''}</div>
          <div class="secs">${secs}</div><footer>${academy ? esc(academy) + ' · ' : ''}${today}</footer></div>`;
      }).join('');
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fname)}</title><style>
      @page { size: ${page}; margin: ${margin}; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #1E2A36; font-family: 'Pretendard', 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif; font-size: 9.5pt; line-height: 1.55; }
      .dot { display: inline-block; width: 8pt; height: 8pt; border-radius: 50%; margin-right: 5pt; vertical-align: 0.5pt; }
      .brand { display: flex; align-items: center; gap: 6pt; min-height: 10mm; }
      .brand img { max-height: 11mm; max-width: 40mm; object-fit: contain; }
      .brand span { font-size: 11pt; font-weight: 800; color: #1D3557; letter-spacing: .3pt; }
      .bk { display: inline-block; font-size: 8pt; border-radius: 3pt; padding: 0.4mm 2mm; margin: 0 1.5mm 1mm 0; background: #F1F5F9; color: #334155; }
      .bk b { margin-right: 3pt; } .bk.read b { color: #1D5E93; } .bk.gram b { color: #5B3FA6; }
      /* 반마다 한 장 */
      .pg { width: 210mm; min-height: 297mm; padding: 14mm 15mm 16mm; position: relative; break-after: page; page-break-after: always; }
      .pg:last-child { break-after: auto; page-break-after: auto; }
      .pg header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 4mm; border-bottom: 1.2pt solid #1D3557; }
      .pg .tag { font-size: 9pt; font-weight: 800; letter-spacing: 2.5pt; color: #1D3557; }
      .hero { margin: 7mm 0 6mm; padding: 6mm 7mm; border-radius: 3mm; background: linear-gradient(135deg, #EEF5FC, #F7FAFD); border: 0.6pt solid #D6E4F1; }
      .hero .cn { font-size: 20pt; font-weight: 800; color: #12304D; line-height: 1.2; }
      .hero .tm { margin-top: 1.5mm; font-size: 10.5pt; color: #4A6075; font-weight: 600; }
      .hero .bks { margin-top: 3mm; } .hero .bk { background: #fff; border: 0.5pt solid #D6E4F1; font-size: 8.5pt; }
      .secs { display: flex; flex-direction: column; gap: 4.5mm; }
      section { break-inside: avoid; page-break-inside: avoid; border: 0.6pt solid #DCE3EA; border-radius: 2.5mm; overflow: hidden; }
      section h3 { margin: 0; padding: 2.2mm 4mm; font-size: 11pt; color: #fff; background: var(--ac); }
      section .rows { padding: 1mm 4mm 1.5mm; }
      section .row { display: flex; gap: 4mm; padding: 2mm 0; border-bottom: 0.5pt dashed #E2E8F0; }
      section .row:last-child { border-bottom: 0; }
      section .k { flex: none; width: 19mm; font-weight: 700; color: var(--ac); font-size: 9pt; padding-top: 0.3mm; }
      section .v { flex: 1; white-space: normal; word-break: keep-all; overflow-wrap: anywhere; }
      .pg footer { position: absolute; left: 15mm; right: 15mm; bottom: 8mm; text-align: right; font-size: 7.5pt; color: #94A3B8; }
      /* 요약표 */
      .thead { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 3mm; margin-bottom: 4mm; border-bottom: 1.2pt solid #1D3557; }
      .thead .ttl { text-align: right; } .thead h1 { margin: 0; font-size: 16pt; color: #12304D; letter-spacing: .5pt; }
      .thead h1 small { font-size: 8.5pt; color: #64748B; font-weight: 600; margin-left: 6pt; letter-spacing: 0; }
      .thead .dt { font-size: 8pt; color: #94A3B8; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.3pt; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 0.5pt solid #CBD5E1; padding: 1.8mm 2mm; vertical-align: top; text-align: left; }
      th { background: #F1F5F9; font-size: 9pt; }
      th span { color: var(--ac); }
      th.c0, td.c0 { width: 38mm; }
      td.c0 .cn { font-weight: 800; font-size: 9.5pt; color: #12304D; } td.c0 .tm { color: #4A6075; font-size: 8pt; margin: 0.5mm 0 1mm; }
      td.c0 .bk { font-size: 7.3pt; }
      td .ln { margin-bottom: 1.2mm; word-break: keep-all; overflow-wrap: anywhere; } td .ln:last-child { margin-bottom: 0; }
      td .ln i { font-style: normal; font-weight: 700; color: #475569; background: #EEF2F6; border-radius: 2pt; padding: 0 2pt; margin-right: 3pt; font-size: 7.3pt; }
      td .none { color: #CBD5E1; }
    </style></head><body>${body}</body></html>`;
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open(); doc.write(html); doc.close();
    const t0 = document.title;
    setTimeout(() => {
      document.title = fname;                 // 저장 파일 이름
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally {
        document.title = t0;
        setTimeout(() => fr.remove(), 1000);
      }
    }, 400);
  },
};

/* Lesson Plan 화면 전용 스타일 */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.lp-wrap { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; }
.lp-side { position: sticky; top: 0; }
.lp-list { display: flex; flex-direction: column; gap: 2px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 6px; }
.lp-cls { display: flex; align-items: center; width: 100%; text-align: left; border: 0; background: transparent; padding: 9px 10px; border-radius: 8px; font-size: 14.5px; color: var(--ink); cursor: pointer; }
.lp-cls:hover { background: var(--accent-soft); }
.lp-cls.on { background: var(--accent); color: #fff; font-weight: 700; }
.lp-cls.end { opacity: .6; }
.lp-cls .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-has { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); margin-left: 6px; }
.lp-cls.on .lp-has { background: #fff; }
.lp-ended { display: flex; margin: 10px 4px 0; }
.lp-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.lp-body > .panel, .lp-areas > .panel { margin: 0; }
.lp-info .lp-ttl { display: flex; align-items: center; gap: 8px; font-size: 18px; margin-bottom: 10px; }
.lp-info .lp-ttl .soft { font-size: 14px; }
.lp-books { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
.lp-books > div { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.lp-bk { font-size: 13px; background: var(--tint-strong); border: 1px solid var(--line); border-radius: 6px; padding: 1px 8px; }
.lp-areas { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.lp-area { border-top: 3px solid var(--lpc); padding: 14px 16px; }
.lp-area:last-child:nth-child(odd) { grid-column: 1 / -1; }
.lp-ah { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.lp-ah b { font-size: 16px; color: var(--lpc, var(--ink)); }
.lp-f { display: block; margin-bottom: 8px; }
.lp-f:last-child { margin-bottom: 0; }
.lp-f > span { display: block; font-size: 12.5px; font-weight: 700; color: var(--ink-soft); margin-bottom: 3px; }
.lp-f textarea { min-height: 58px; font-size: 14px; }
.lp-memo textarea { font-size: 14px; }
.lp-pick { max-height: 280px; }
@media (max-width: 1100px) { .lp-areas { grid-template-columns: 1fr; } .lp-area:last-child:nth-child(odd) { grid-column: auto; } }
`;
  document.head.appendChild(st);
})();
