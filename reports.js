/* =========================================================
   reports.js — 월간 리포트 · 주간 테스트 (학생 › Report)
   탭 두 개: 월간 리포트(학생마다 한 달에 하나) / 주간 테스트(학생마다 그 달의 1~5주차에 하나씩)
   두 탭 모두 단어·문법·독해·듣기·일반 5개 영역 중 입력한 영역만 A4 비율 이미지(JPG 저장 / PNG 복사)로 만든다.
   디자인은 탭마다 다르다 (월간: 네이비·골드 / 주간: 딥 틸 머리띠). 내용이 길면 여러 장으로 나눈다.
   주차: 월요일 시작, 그 주의 목요일이 이 달에 있으면 이 달의 주 (예: 2026년 11월 3주차 = 11/16~11/22)
   기록은 meta 테이블에 저장 (서버 SQL 변경 없음):
   월간:   { id 'RP_학생ID_YYYY-MM', kind:'report', studentId, month:'YYYY-MM',
             word, gram, read, listen, general(영역별 자유 서술), createdAt, updatedAt }
   주간:   { id 'RP_학생ID_YYYY-MM_W3', kind:'report', studentId, month, week:3, word … general, createdAt, updatedAt }
           (kind가 같아서 학생을 지우면 주간 기록도 함께 지워진다)
   설정:   { id 'RP_CFG', kind:'rpcfg', academy(학원 이름), logo(이미지 dataURL), sub(학생 표시 문구),
             title·file·labels(월간), wtitle·wfile·wlabels(주간), updatedAt }
   문구 안의 {년} {월} {주} {이름} {학교} 는 자동으로 바뀐다 ({학교} = 금천고1 처럼 학교·학년, {주} = 주차 숫자)
   저장된 리포트 = 보낸 리포트로 본다 (월별 요약에서 반별로 확인 · PDF 저장)
   리포트 제외 반: 설정의 excl:[반ID…] ('_none' = 반 없음). 월간·주간 공통. 학생은 앞 순서의 반 하나에만 묶이므로
   그 반이 제외면 학생도 목록·요약·통계·PDF에서 빠진다 (왼쪽 목록 맨 아래 '제외된 반'에서 다시 포함 가능)
   ========================================================= */
const RP_AREAS = [['word', '단어'], ['gram', '문법'], ['read', '독해'], ['listen', '듣기'], ['general', '일반']];
const RP_KEYS = RP_AREAS.map(a => a[0]);
const RP_CFG_ID = 'RP_CFG';
const RP_DEF = {
  academy: '',
  logo: '',
  title: '{년}년 {월}월 월간 리포트',
  sub: '{이름} · {학교}',
  file: '리포트_{년}년{월}월_{이름}',
  wtitle: '{월}월 {주}주차 주간 테스트',
  wfile: '주간테스트_{년}년{월}월{주}주차_{이름}',
};

const Reports = {
  month: '',
  sid: '',
  tab: 'month',        // month(월간 리포트) | week(주간 테스트)
  week: 0,             // 주간 탭에서 고른 주차 (0 = 아직 안 고름 → 오늘이 든 주 / 1주)
  view: 'edit',        // edit(입력) | sum(월별 요약)
  xOpen: false,        // 왼쪽 목록의 '제외된 반' 펼침
  _t: null,            // 자동 저장 타이머

  /* ---------- 주차 ---------- */
  // 그 달의 주 목록 [{ n, from, to }] — 월요일 시작, 목요일이 이 달에 있는 주
  weeksOf(month) {
    const [Y, M] = month.split('-').map(Number);
    let d = new Date(Y, M - 1, 1);
    while (d.getDay() !== 4) d = addDays(d, 1);
    let mon = addDays(d, -3);
    const out = [];
    while (addDays(mon, 3).getMonth() === M - 1) {
      out.push({ n: out.length + 1, from: ymd(mon), to: ymd(addDays(mon, 6)) });
      mon = addDays(mon, 7);
    }
    return out;
  },
  wkOf(month, n) { return this.weeksOf(month).find(w => w.n === +n) || null; },
  // 주간 탭 기본 주차: 오늘이 이 달의 어느 주에 들면 그 주, 아니면 1주
  defWeek(month) {
    const t = todayStr();
    const w = this.weeksOf(month).find(x => x.from <= t && t <= x.to);
    return w ? w.n : 1;
  },
  curWeek() {
    const ws = this.weeksOf(this.month);
    if (!ws.some(w => w.n === this.week)) this.week = this.defWeek(this.month);
    return this.week;
  },
  // 11/16~22 · 11/30~12/6
  wkRange(w) {
    const a = parseYmd(w.from), b = parseYmd(w.to);
    return `${a.getMonth() + 1}/${a.getDate()}~${a.getMonth() === b.getMonth() ? '' : (b.getMonth() + 1) + '/'}${b.getDate()}`;
  },

  /* ---------- 데이터 ---------- */
  rid(sid, month, week) { return 'RP_' + sid + '_' + month + (week ? '_W' + week : ''); },
  rec(sid, month, week) { return Store.get('meta', this.rid(sid, month, week)); },
  hasText(r) { return !!r && RP_KEYS.some(k => String(r[k] || '').trim()); },
  // 지금 탭의 주차 (월간이면 0)
  tabWeek() { return this.tab === 'week' ? this.curWeek() : 0; },
  cfg() {
    const r = Store.get('meta', RP_CFG_ID) || {};
    const labels = {}, wlabels = {};
    RP_AREAS.forEach(([k, t]) => {
      labels[k] = String((r.labels || {})[k] || '').trim() || t;
      wlabels[k] = String((r.wlabels || {})[k] || '').trim() || t;
    });
    return {
      academy: r.academy || RP_DEF.academy,
      logo: r.logo || '',
      title: String(r.title || '').trim() || RP_DEF.title,
      // 예전 기본 문구('{이름} 학생 · {학교}')로 저장돼 있으면 새 기본 문구로 ('학생' 글자 빼기)
      sub: r.sub != null && r.sub !== '{이름} 학생 · {학교}' ? r.sub : RP_DEF.sub,
      file: String(r.file || '').trim() || RP_DEF.file,
      labels,
      wtitle: String(r.wtitle || '').trim() || RP_DEF.wtitle,
      wfile: String(r.wfile || '').trim() || RP_DEF.wfile,
      wlabels,
      excl: Array.isArray(r.excl) ? r.excl : [],
    };
  },
  // 문구의 {년} {월} {주} {이름} {학교} 채우기 (빈 값 때문에 앞뒤에 남는 · - | , 는 지움)
  fill(tpl, s, month, week) {
    const [Y, M] = month.split('-').map(Number);
    return String(tpl || '')
      .replace(/\{년\}/g, Y).replace(/\{월\}/g, M).replace(/\{주\}/g, week || '')
      .replace(/\{이름\}/g, s ? s.name : '').replace(/\{학교\}/g, stTag(s))
      .replace(/^[\s·|,\-]+|[\s·|,\-]+$/g, '').replace(/\s{2,}/g, ' ');
  },
  fileBase(s, month, week) {
    const c = this.cfg();
    return (this.fill(week ? c.wfile : c.file, s, month, week).replace(/[\\/:*?"<>|]/g, '_').trim())
      || ((week ? '주간테스트_' : '리포트_') + month + (week ? '_' + week + '주' : '') + '_' + (s ? s.name : ''));
  },

  // 재원생만, 반별로 묶음 (반 없는 학생은 맨 아래 '반 없음')
  allGroups() {
    const list = Store.where('students', s => s.status === 'active' && (s.name || '').trim());
    return Books.groupByClass(list);
  },
  // 리포트 대상 반만 (제외한 반은 목록·요약·통계·PDF에서 빠짐)
  gKey(g) { return g.c ? g.c.id : '_none'; },
  groups() { const ex = new Set(this.cfg().excl); return this.allGroups().filter(g => !ex.has(this.gKey(g))); },
  exGroups() { const ex = new Set(this.cfg().excl); return this.allGroups().filter(g => ex.has(this.gKey(g))); },
  setExcl(key, on) {
    const old = Store.get('meta', RP_CFG_ID) || { id: RP_CFG_ID, kind: 'rpcfg' };
    const ex = new Set(Array.isArray(old.excl) ? old.excl : []);
    if (on) ex.add(key); else ex.delete(key);
    Store.put('meta', Object.assign({}, old, { excl: [...ex], updatedAt: new Date().toISOString() }));
  },

  // 설정 창의 반 목록: 운영 중인 반(반 순서) + 반 없음 (종료된 반은 보이지 않음)
  cfgClasses(excl) {
    const out = Classes.sorted(Store.all('classes')).filter(c => c.active !== false).map(c => ({ k: c.id, c }));
    out.push({ k: '_none', c: null });
    return out;
  },

  /* ---------- 저장 ---------- */
  save(sid, month, week, vals) {
    if (!sid || !Store.get('students', sid)) return;
    const id = this.rid(sid, month, week);
    const r = Store.get('meta', id);
    if (!RP_KEYS.some(k => vals[k].trim())) { if (r) Store.del('meta', id); return; }   // 다 비우면 기록을 지운다
    if (r && RP_KEYS.every(k => (r[k] || '') === vals[k])) return;
    const now = new Date().toISOString();
    const base = { id, kind: 'report', studentId: sid, month, createdAt: now };
    if (week) base.week = +week;
    Store.put('meta', Object.assign({}, r || base, vals, { updatedAt: now }));
  },
  // 화면의 입력칸 내용을 바로 저장
  flushSave() {
    clearTimeout(this._t); this._t = null;
    const box = $('#main [data-rp-ed]');
    if (!box) return;
    const vals = {};
    RP_KEYS.forEach(k => { const ta = $(`textarea[data-k="${k}"]`, box); vals[k] = ta ? stripZws(ta.value) : ''; });
    this.save(box.dataset.sid, box.dataset.month, +box.dataset.week || 0, vals);
    const it = $(`#main .rp-st[data-sid="${box.dataset.sid}"]`);
    if (it) it.classList.toggle('done', RP_KEYS.some(k => vals[k].trim()));
    this.updCount();
  },
  updCount() {
    const el = $('#main [data-rp-cnt]');
    if (!el) return;
    const all = $$('#main .rp-st'), done = all.filter(b => b.classList.contains('done'));
    el.textContent = `작성 ${done.length} / ${all.length}명`;
  },
  onLeave() { this.flushSave(); },

  /* ---------- 화면 ---------- */
  render(main) {
    if (!this.month) this.month = App.selDate.slice(0, 7);
    const [Y, M] = this.month.split('-').map(Number);
    const cfg = this.cfg();
    const groups = this.groups();
    const ids = new Set(groups.flatMap(g => g.list.map(s => s.id)));
    if (this.sid && !ids.has(this.sid)) this.sid = '';
    const wk = this.tabWeek();
    const isSum = this.view === 'sum';

    let h = `<div class="rp-page"><div class="page-head"><h1>Report</h1>
      ${NavBar.month(this.month)}
      <button class="btn sm rp-sumbtn${isSum ? ' on' : ''}" data-rp="sum" title="이 달 반별 리포트 작성(발송) 현황">월별 요약</button>
      <button class="btn sm rp-pdfbtn" data-rp="pdf" title="이 달 반별 리포트 현황을 A4로 인쇄 · PDF 저장">PDF 저장</button>
      <span class="grow"></span>
      <button class="btn sm" data-rp="cfg">⚙ 설정</button></div>`;
    if (!cfg.academy.trim()) h += `<div class="toolbar small soft"><span class="muted">⚙ 설정에서 학원 이름·로고·제목 문구를 넣으면 리포트 이미지 맨 위에 표시됩니다.</span></div>`;

    if (isSum) {
      h += this.sumHtml(groups) + '</div>';
      main.innerHTML = h;
      this.bind(main);
      return;
    }

    // 탭 (월간 리포트 | 주간 테스트) + 주간이면 주차 고르기
    h += `<div class="tabs rp-tabs"><button type="button" data-rptab="month" class="${this.tab === 'month' ? 'active' : ''}">월간 리포트</button><button type="button" data-rptab="week" class="${this.tab === 'week' ? 'active' : ''}">주간 테스트</button></div>`;
    if (this.tab === 'week') {
      h += `<div class="rp-weeks">${this.weeksOf(this.month).map(w => `<button type="button" data-wk="${w.n}" class="${w.n === wk ? 'on' : ''}"><b>${w.n}주차</b><small>${this.wkRange(w)}</small></button>`).join('')}</div>`;
    }

    // 왼쪽: 학생 목록
    let n = 0, d = 0;
    let lh = '';
    groups.forEach(g => {
      lh += `<div class="rp-grp">${g.c ? Classes.dot(g.c) + esc(g.c.name) : '반 없음'}<button type="button" class="rp-xbtn" data-rpx="${this.gKey(g)}" title="이 반을 리포트에서 제외 (월간·주간 공통)">제외</button></div>`;
      g.list.forEach(s => {
        const done = this.hasText(this.rec(s.id, this.month, wk));
        n++; if (done) d++;
        lh += `<button type="button" class="rp-st ${done ? 'done' : ''} ${s.id === this.sid ? 'on' : ''}" data-sid="${s.id}" title="${done ? '작성함' : '아직 작성 안 함'}">
          <b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span><span class="mk"></span></button>`;
      });
    });
    // 맨 아래: 제외된 반 (접힘 · 펼치면 '포함'으로 되돌림)
    const exg = this.exGroups();
    if (exg.length) {
      lh += `<div class="rp-xsec"><button type="button" class="rp-xhead" data-rpxo>제외된 반 (${exg.length}개) <span>${this.xOpen ? '▾' : '▸'}</span></button>`;
      if (this.xOpen) lh += exg.map(g => `<div class="rp-xrow">${g.c ? Classes.dot(g.c) + esc(g.c.name) : '반 없음'}<span class="muted small">${g.list.length}명</span><button type="button" class="rp-xbtn in" data-rpi="${this.gKey(g)}" title="다시 리포트 대상으로">포함</button></div>`).join('');
      lh += '</div>';
    }
    h += `<div class="rp-grid"><div class="panel rp-list"><div class="rp-cnt muted small" data-rp-cnt>작성 ${d} / ${n}명</div>${lh || '<div class="empty">재원생이 없습니다.</div>'}</div>`;

    // 오른쪽: 입력
    const s = this.sid ? Store.get('students', this.sid) : null;
    if (!s) h += `<div class="panel"><div class="empty">왼쪽에서 학생을 고르세요.</div></div>`;
    else {
      const r = this.rec(s.id, this.month, wk) || {};
      const labels = wk ? cfg.wlabels : cfg.labels;
      const w = wk ? this.wkOf(this.month, wk) : null;
      const when = wk ? `${M}월 ${wk}주차 (${this.wkRange(w)})` : `${Y}년 ${M}월`;
      h += `<div class="panel rp-ed ${wk ? 'is-week' : 'is-month'}" data-rp-ed data-sid="${s.id}" data-month="${this.month}" data-week="${wk || ''}">
        <h2><span class="rp-kind">${wk ? '주간 테스트' : '월간 리포트'}</span>${esc(s.name)}<span class="sub">${esc(stTag(s))} · ${when}</span></h2>
        <div class="muted small" style="margin:-6px 0 12px">입력한 영역만 ${wk ? '주간 테스트' : '리포트'}에 실립니다. 입력하면 바로 저장됩니다.</div>
        ${RP_AREAS.map(([k]) => `<div class="rp-area"><label>${esc(labels[k])}</label><textarea data-k="${k}" rows="4">${esc(r[k] || '')}</textarea></div>`).join('')}
        <div class="rp-acts"><button class="btn" data-rp="pv">미리보기</button><button class="btn rp-reset" data-rp="reset" title="이 학생의 이 칸들을 모두 비웁니다">초기화</button>
          <button class="btn primary" data-rp="jpg">JPG 저장</button>
          <button class="btn" data-rp="copy" title="카톡 대화창에 Ctrl+V로 붙여넣기 (1장씩)">이미지 복사</button></div></div>`;
    }
    h += '</div></div>';
    main.innerHTML = h;
    enhanceAll(main);
    this.bind(main);
  },

  /* ---------- 월별 요약 (반별 · 월간 + 1~5주차) ---------- */
  sumData(groups) {
    const weeks = this.weeksOf(this.month);
    const tot = { m: 0, w: weeks.map(() => 0), n: 0 };
    const rows = groups.map(g => {
      const cnt = { m: 0, w: weeks.map(() => 0) };
      const list = g.list.map(s => {
        const m = this.hasText(this.rec(s.id, this.month, 0));
        const w = weeks.map(x => this.hasText(this.rec(s.id, this.month, x.n)));
        if (m) cnt.m++;
        w.forEach((v, i) => { if (v) cnt.w[i]++; });
        return { s, m, w };
      });
      tot.m += cnt.m; cnt.w.forEach((v, i) => { tot.w[i] += v; }); tot.n += list.length;
      return { c: g.c, list, cnt };
    });
    return { weeks, rows, tot };
  },
  sumHtml(groups) {
    const [Y, M] = this.month.split('-').map(Number);
    const { weeks, rows, tot } = this.sumData(groups);
    if (!tot.n) return '<div class="panel"><div class="empty">재원생이 없습니다.</div></div>';
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
    const chip = (t, a, b, key) => `<div class="rp-chip" ${key}><span class="t">${t}</span><b>${a}<small> / ${b}</small></b><span class="bar"><i style="width:${pct(a, b)}%"></i></span></div>`;
    let h = `<div class="rp-sum-top">${chip('월간 리포트', tot.m, tot.n, 'data-sgo="m"')}${weeks.map((w, i) => chip(`${w.n}주차 <small>${this.wkRange(w)}</small>`, tot.w[i], tot.n, `data-sgo="${w.n}"`)).join('')}</div>`;
    h += `<div class="toolbar small soft"><span>저장된 리포트를 보낸 것으로 봅니다. ● 작성(발송) · ○ 미작성 — 칸을 누르면 그 학생의 입력 화면으로 갑니다.</span></div>`;
    rows.forEach(g => {
      if (!g.list.length) return;
      h += `<div class="panel rp-sum-sec"><div class="ab-sec-head"><h2>${g.c ? Classes.dot(g.c) + esc(g.c.name) : '반 없음'}<span class="sub">${g.list.length}명</span></h2></div>
        <div class="tbl-wrap"><table class="tbl compact rp-sum"><thead><tr><th class="nm">이름</th><th class="mc">월간 리포트</th>${weeks.map(w => `<th class="wc">${w.n}주차<small>${this.wkRange(w)}</small></th>`).join('')}</tr></thead><tbody>`;
      g.list.forEach(o => {
        const cell = (on, wkn, cls) => `<td class="${cls} ${on ? 'yes' : 'no'}" data-sc="${o.s.id}" data-sw="${wkn}" title="${on ? '작성(발송)' : '미작성'}"><span class="rp-dot"></span></td>`;
        h += `<tr><td class="nm"><b>${esc(o.s.name)}</b> <span class="tag">${esc(stTag(o.s))}</span></td>${cell(o.m, 0, 'mc')}${o.w.map((v, i) => cell(v, weeks[i].n, 'wc')).join('')}</tr>`;
      });
      h += `</tbody><tfoot><tr><td class="nm">작성</td><td class="mc">${g.cnt.m} / ${g.list.length}</td>${g.cnt.w.map(v => `<td class="wc">${v} / ${g.list.length}</td>`).join('')}</tr></tfoot></table></div></div>`;
    });
    return h;
  },
  // 월별 요약 PDF (A4 세로)
  pdf() {
    this.flushSave();
    const [Y, M] = this.month.split('-').map(Number);
    const { weeks, rows, tot } = this.sumData(this.groups());
    if (!tot.n) { toast('재원생이 없습니다'); return; }
    const cols = `<colgroup><col class="c-nm"><col class="c-m">${weeks.map(() => '<col>').join('')}</colgroup>`;
    const head = `<tr><th class="nm">이름</th><th>월간 리포트</th>${weeks.map(w => `<th>${w.n}주차<small>${this.wkRange(w)}</small></th>`).join('')}</tr>`;
    let body = '';
    rows.forEach(g => {
      if (!g.list.length) return;
      const ttl = `<tr><th class="ttl" colspan="${weeks.length + 2}">${g.c ? `<span class="dot" style="background:${Classes.colorOf(g.c)}"></span>${esc(g.c.name)}` : '반 없음'}<span class="sub">${g.list.length}명</span></th></tr>`;
      const trs = g.list.map(o => `<tr><td class="nm"><b>${esc(o.s.name)}</b> <span class="tag">${esc(stTag(o.s))}</span></td><td class="${o.m ? 'y' : 'n'}">${o.m ? '●' : '○'}</td>${o.w.map(v => `<td class="${v ? 'y' : 'n'}">${v ? '●' : '○'}</td>`).join('')}</tr>`).join('');
      const ft = `<tr class="ft"><td class="nm">작성</td><td>${g.cnt.m} / ${g.list.length}</td>${g.cnt.w.map(v => `<td>${v} / ${g.list.length}</td>`).join('')}</tr>`;
      body += `<table>${cols}<thead>${ttl}${head}</thead><tbody>${trs}${ft}</tbody></table>`;
    });
    const summary = `<div class="tot"><span>월간 리포트 <b>${tot.m}</b> / ${tot.n}</span>${weeks.map((w, i) => `<span>${w.n}주차 <b>${tot.w[i]}</b> / ${tot.n}</span>`).join('')}</div>`;
    const title = `Report현황_${this.month}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #111; font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', sans-serif; font-size: 9pt; }
      h1 { font-size: 14pt; margin: 0 0 2mm; display: flex; justify-content: space-between; align-items: baseline; }
      h1 small { font-size: 8pt; font-weight: normal; color: #666; }
      .tot { display: flex; flex-wrap: wrap; gap: 2mm 5mm; margin: 0 0 4mm; padding: 2mm 3mm; border: 0.5pt solid #c5ccd4; border-radius: 1.5mm; background: #f6f8fa; font-size: 8.5pt; color: #333; }
      .tot b { color: #111; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4mm; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: 0.5pt solid #9aa3ad; height: 6mm; padding: 0 1mm; text-align: center; white-space: nowrap; overflow: hidden; font-size: 8.5pt; }
      th { background: #eef2f7; height: 8mm; font-weight: bold; line-height: 1.15; }
      th small { display: block; font-size: 6.5pt; font-weight: normal; color: #666; }
      th.ttl { text-align: left; padding-left: 2mm; height: 7mm; background: #dfe7f1; font-size: 10pt; }
      th.ttl .dot { display: inline-block; width: 7pt; height: 7pt; border-radius: 50%; margin-right: 4pt; vertical-align: -0.5pt; }
      th.ttl .sub { font-weight: normal; color: #555; font-size: 8pt; margin-left: 6pt; }
      col.c-nm { width: 46mm; } col.c-m { width: 24mm; }
      th.nm, td.nm { text-align: left; padding-left: 2mm; text-overflow: ellipsis; }
      td.nm .tag { color: #777; font-size: 7pt; }
      td.y { color: #1f7a52; font-size: 10pt; } td.n { color: #b9c0c8; font-size: 10pt; }
      tr.ft td { background: #f6f8fa; font-weight: bold; color: #333; }
    </style></head><body><h1>${Y}년 ${M}월 Report 현황<small>출력일 ${todayStr()} · ● 작성(발송) ○ 미작성</small></h1>${summary}${body}</body></html>`;
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

  bind(main) {
    main.onclick = (e) => {
      if (e.target.closest('[data-mpick]')) { NavBar.pickMonth(this.month).then(v => { if (v && v !== this.month) { this.flushSave(); this.month = v; App.render(); } }); return; }
      const m = e.target.closest('[data-m]');
      if (m) {
        this.flushSave();
        if (m.dataset.m === '0') this.month = todayStr().slice(0, 7);
        else { const [y, mo] = this.month.split('-').map(Number); const dt = new Date(y, mo - 1 + +m.dataset.m, 1); this.month = dt.getFullYear() + '-' + pad(dt.getMonth() + 1); }
        App.render(); return;
      }
      const tb = e.target.closest('[data-rptab]');
      if (tb) { if (tb.dataset.rptab !== this.tab) { this.flushSave(); this.tab = tb.dataset.rptab; App.render(); } return; }
      const wb = e.target.closest('[data-wk]');
      if (wb) { if (+wb.dataset.wk !== this.week) { this.flushSave(); this.week = +wb.dataset.wk; App.render(); } return; }
      // 요약: 칸 → 그 학생 입력 화면 / 위쪽 현황 → 그 탭(주차)
      const sc = e.target.closest('[data-sc]');
      if (sc) {
        const w = +sc.dataset.sw;
        this.sid = sc.dataset.sc; this.tab = w ? 'week' : 'month'; if (w) this.week = w; this.view = 'edit';
        App.render(); return;
      }
      const sg = e.target.closest('[data-sgo]');
      if (sg) {
        const w = sg.dataset.sgo === 'm' ? 0 : +sg.dataset.sgo;
        this.tab = w ? 'week' : 'month'; if (w) this.week = w; this.view = 'edit';
        App.render(); return;
      }
      if (e.target.closest('[data-rpxo]')) { this.xOpen = !this.xOpen; App.render(); return; }
      const xb = e.target.closest('[data-rpx]');
      if (xb) { this.flushSave(); this.setExcl(xb.dataset.rpx, true); toast('리포트에서 제외했습니다 (목록 맨 아래에서 다시 포함 가능)'); App.render(); return; }
      const ib = e.target.closest('[data-rpi]');
      if (ib) { this.setExcl(ib.dataset.rpi, false); App.render(); return; }
      const st = e.target.closest('.rp-st[data-sid]');
      if (st) { this.flushSave(); this.sid = st.dataset.sid; App.render(); return; }
      const b = e.target.closest('[data-rp]');
      if (!b) return;
      const a = b.dataset.rp;
      if (a === 'cfg') { this.flushSave(); this.openCfg(); return; }
      if (a === 'sum') { this.flushSave(); this.view = this.view === 'sum' ? 'edit' : 'sum'; App.render(); return; }
      if (a === 'pdf') { this.pdf(); return; }
      if (a === 'reset') {          // 이 학생의 지금 탭(월간 / 그 주차) 입력칸을 모두 비움 → 기록 삭제
        const s = Store.get('students', this.sid);
        confirmDlg(`${s ? s.name : ''} 학생의 ${this.tab === 'week' ? this.curWeek() + '주차 주간 테스트' : '월간 리포트'} 내용을 모두 지울까요?`, '초기화', true).then(ok => {
          if (!ok) return;
          $$('#main [data-rp-ed] textarea[data-k]').forEach(ta => { ta.value = ''; });
          this.flushSave();
          toast('초기화했습니다');
        });
        return;
      }
      this.flushSave();
      const wk = this.tabWeek();
      if (a === 'pv') this.preview(this.sid, this.month, wk);
      else if (a === 'jpg') this.saveJpg(this.sid, this.month, wk);
      else if (a === 'copy') this.copyOne(this.sid, this.month, wk);
    };
    main.oninput = (e) => {
      if (!e.target.matches('textarea[data-k]')) return;
      clearTimeout(this._t);
      this._t = setTimeout(() => this.flushSave(), 600);
    };
    main.onchange = (e) => {
      if (e.target.matches('textarea[data-k]')) this.flushSave();
    };
  },

  /* ---------- 설정 ---------- */
  openCfg() {
    const c = this.cfg();
    let logo = c.logo;
    const showLogo = (b) => {
      $('[data-logo-pv]', b).innerHTML = logo ? `<img src="${logo}" alt="로고">` : '<span class="muted small">없음</span>';
      $('[data-logo-del]', b).style.display = logo ? '' : 'none';
    };
    Modal.open({
      title: 'Report 설정', size: 'lg', autofocus: false,
      body: `<div class="form rp-cfg">
        <div class="full rp-cfg-h">공통</div>
        <label>학원 이름</label><input type="text" name="academy" value="${esc(c.academy)}" placeholder="예: OO영어학원">
        <label class="top">로고</label><div class="row"><div class="rp-logo-pv" data-logo-pv></div>
          <label class="btn sm">이미지 선택<input type="file" accept="image/*" data-logo-file hidden></label>
          <button type="button" class="btn sm danger" data-logo-del>로고 삭제</button></div>
        <label>학생 표시</label><input type="text" name="sub" value="${esc(c.sub)}" placeholder="${esc(RP_DEF.sub)}">
        <label class="top">리포트 대상 반</label><div class="rp-cls">${this.cfgClasses(c.excl).map(o => `<label class="chk"><input type="checkbox" data-xc="${o.k}" ${c.excl.includes(o.k) ? '' : 'checked'}>${o.c ? Classes.dot(o.c) + esc(o.c.name) : '반 없음'}</label>`).join('')}</div>
        <div class="full hint" style="margin-top:-4px">체크를 끈 반은 월간 리포트·주간 테스트 모두에서 빠집니다 (학생 목록·월별 요약·통계·PDF). 여러 반에 다니는 학생은 앞 순서의 반으로 봅니다.</div>
        <div class="full rp-cfg-h">월간 리포트</div>
        <label>제목 문구</label><input type="text" name="title" value="${esc(c.title)}" placeholder="${esc(RP_DEF.title)}">
        <label>파일 이름</label><input type="text" name="file" value="${esc(c.file)}" placeholder="${esc(RP_DEF.file)}">
        <label class="top">영역 제목</label><div class="rp-lbls">${RP_AREAS.map(([k, t]) => `<input type="text" name="lb_${k}" value="${esc(c.labels[k])}" placeholder="${t}">`).join('')}</div>
        <div class="full rp-cfg-h">주간 테스트</div>
        <label>제목 문구</label><input type="text" name="wtitle" value="${esc(c.wtitle)}" placeholder="${esc(RP_DEF.wtitle)}">
        <label>파일 이름</label><input type="text" name="wfile" value="${esc(c.wfile)}" placeholder="${esc(RP_DEF.wfile)}">
        <label class="top">영역 제목</label><div class="rp-lbls">${RP_AREAS.map(([k, t]) => `<input type="text" name="wl_${k}" value="${esc(c.wlabels[k])}" placeholder="${t}">`).join('')}</div>
        <div class="full hint">{년} {월} {주} {이름} {학교} 를 넣으면 자동으로 바뀝니다. ({학교} = 금천고1 처럼 학교·학년, {주} = 주차 숫자) · 학생 표시를 비우면 넣지 않습니다. · 파일이 여러 장이면 이름 뒤에 _1, _2 가 붙습니다.</div>
      </div>`,
      onMount: (b) => {
        showLogo(b);
        $('[data-logo-file]', b).addEventListener('change', async (e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          if (!f) return;
          try { logo = await this.shrinkLogo(f); showLogo(b); }
          catch (_) { toast('이미지를 읽지 못했습니다'); }
        });
        $('[data-logo-del]', b).addEventListener('click', () => { logo = ''; showLogo(b); });
      },
      buttons: [
        { text: '기본 문구로', left: true, onClick: (m) => {
          $('[name=title]', m.body).value = RP_DEF.title;
          $('[name=sub]', m.body).value = RP_DEF.sub;
          $('[name=file]', m.body).value = RP_DEF.file;
          $('[name=wtitle]', m.body).value = RP_DEF.wtitle;
          $('[name=wfile]', m.body).value = RP_DEF.wfile;
          RP_AREAS.forEach(([k, t]) => { $(`[name=lb_${k}]`, m.body).value = t; $(`[name=wl_${k}]`, m.body).value = t; });
          return false;
        } },
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const g = (n) => $(`[name=${n}]`, m.body).value.trim();
          const labels = {}, wlabels = {};
          RP_AREAS.forEach(([k]) => { labels[k] = g('lb_' + k); wlabels[k] = g('wl_' + k); });
          const old = Store.get('meta', RP_CFG_ID) || { id: RP_CFG_ID, kind: 'rpcfg' };
          const excl = $$('[data-xc]', m.body).filter(i => !i.checked).map(i => i.dataset.xc);
          Store.put('meta', Object.assign({}, old, { academy: g('academy'), logo, title: g('title'), sub: g('sub'), file: g('file'), labels,
            wtitle: g('wtitle'), wfile: g('wfile'), wlabels, excl, updatedAt: new Date().toISOString() }));
          toast('설정을 저장했습니다'); App.render();
        } },
      ],
    });
  },
  // 로고: 최대 가로 480 · 세로 240으로 줄여 저장 (동기화가 무거워지지 않게)
  shrinkLogo(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = rej;
      fr.onload = () => {
        const im = new Image();
        im.onerror = rej;
        im.onload = () => {
          const k = Math.min(1, 480 / im.width, 240 / im.height);
          const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const cx = cv.getContext('2d');
          cx.drawImage(im, 0, 0, w, h);
          let url = cv.toDataURL('image/png');
          if (url.length > 200000) {             // 사진처럼 큰 이미지는 JPG로 (흰 바탕)
            const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
            const x2 = c2.getContext('2d'); x2.fillStyle = '#fff'; x2.fillRect(0, 0, w, h); x2.drawImage(im, 0, 0, w, h);
            url = c2.toDataURL('image/jpeg', 0.88);
          }
          res(url);
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  },

  /* =========================================================
     이미지 만들기 (A4 비율 1240 × 1754)
     월간 리포트: 흰 바탕 + 네이비·골드 (단정하고 격식 있는 보고서)
     주간 테스트: 딥 틸 머리띠 + 학생 카드 + 알약 모양 영역 제목 (산뜻한 성적표)
     ========================================================= */
  W: 1240, H: 1754, MX: 100, TOP: 96,
  FF: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",

  font(cx, w, px) { cx.font = `${w} ${px}px ${this.FF}`; },
  ls(cx, v) { try { cx.letterSpacing = v; } catch (_) {} },        // 자간 (지원 안 하는 브라우저는 그냥 넘어감)
  rr(cx, x, y, w, h, r) {
    cx.beginPath();
    if (cx.roundRect) cx.roundRect(x, y, w, h, r);
    else { cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  },
  async ready() {
    try { await Promise.all(['400', '600', '700', '800'].map(w => document.fonts.load(`${w} 28px Pretendard`, '가A'))); } catch (_) {}
  },
  loadImg(src) {
    return new Promise(res => { if (!src) { res(null); return; } const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  },
  // 글자 폭에 맞춰 줄 나누기 (띄어쓰기 단위, 한 단어가 너무 길면 글자 단위)
  wrap(cx, text, maxW) {
    const out = [];
    const fits = (t) => cx.measureText(t).width <= maxW;
    String(text).split('\n').forEach(par => {
      par = par.replace(/\s+$/, '');
      if (!par) { out.push(''); return; }
      let line = '';
      (par.match(/\s+|\S+\s*/g) || []).forEach(tok => {
        if (fits((line + tok).trimEnd())) { line += tok; return; }
        if (line.trim()) out.push(line.trimEnd());
        line = '';
        let ch = Array.from(tok);
        while (!fits(ch.join('').trimEnd())) {
          let i = 1;
          while (i < ch.length && fits(ch.slice(0, i + 1).join(''))) i++;
          out.push(ch.slice(0, i).join(''));
          ch = ch.slice(i);
        }
        line = ch.join('');
      });
      if (line.trim()) out.push(line.trimEnd());
    });
    return out;
  },
  // 2026. 11. 16 (월)
  dTxt(s, withY) { const d = parseYmd(s); return (withY ? d.getFullYear() + '. ' : '') + (d.getMonth() + 1) + '. ' + d.getDate() + ' (' + DOW[d.getDay()] + ')'; },

  /* ---------- 디자인: 월간 리포트 (네이비 · 골드) ---------- */
  TM: {
    C: { navy: '#16263D', gold: '#B08A4E', ink: '#27303C', soft: '#5E6A78', mute: '#98A1AC', line: '#E3DED4', cream: '#F7F4EE' },
    BODY: 28, BODY_LH: 50, HEAD_H: 74, GAP: 42, bodyDX: 64, BOTTOM: 1754 - 150, contY: 96 + 76,
    // 첫 장 머리 → 내용이 시작하는 y
    page1(R, cx, x) {
      const { W, MX, TOP } = R, C = this.C;
      cx.fillStyle = C.navy; cx.fillRect(0, 0, W, 14);
      cx.fillStyle = C.gold; cx.fillRect(0, 14, W, 4);
      let y = TOP;
      const rowH = Math.max(x.lh, 64);
      if (x.logo) cx.drawImage(x.logo, MX, y + (rowH - x.lh) / 2, x.lw, x.lh);
      if (x.academy) {
        R.font(cx, 700, 34); cx.fillStyle = C.navy; cx.textBaseline = 'middle';
        cx.fillText(x.academy, MX + (x.logo ? x.lw + 24 : 0), y + rowH / 2, W - MX * 2 - (x.logo ? x.lw + 24 : 0) - 300);
      }
      cx.textAlign = 'right'; cx.textBaseline = 'middle';
      R.font(cx, 700, 20); R.ls(cx, '6px'); cx.fillStyle = C.gold;
      cx.fillText('MONTHLY REPORT', W - MX + 6, y + rowH / 2 - 17);
      R.ls(cx, '0px'); R.font(cx, 800, 30); cx.fillStyle = C.navy;
      cx.fillText(`${x.Y}. ${pad(x.M)}`, W - MX, y + rowH / 2 + 19);
      cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
      y += rowH + 28;
      cx.fillStyle = C.navy; cx.fillRect(MX, y, W - MX * 2, 3);
      cx.fillStyle = C.gold; cx.fillRect(MX, y + 8, W - MX * 2, 1.5);
      y += 10 + 46;
      R.font(cx, 800, 56); cx.fillStyle = C.navy; R.ls(cx, '-1px');
      x.titleLines.forEach(t => { y += 72; cx.fillText(t, MX, y - 16); });
      R.ls(cx, '0px');
      y += 28;
      // 학생 · 기간 상자
      const bh = 104;
      cx.fillStyle = C.cream; R.rr(cx, MX, y, W - MX * 2, bh, 10); cx.fill();
      cx.fillStyle = C.gold; cx.fillRect(MX, y, 6, bh);
      const lab = (t, xx, al) => { cx.textAlign = al; R.font(cx, 700, 17); R.ls(cx, '4px'); cx.fillStyle = C.gold; cx.fillText(t, xx, y + 38); R.ls(cx, '0px'); };
      if (x.sub) {
        lab('STUDENT', MX + 38, 'left');
        R.font(cx, 700, 30); cx.fillStyle = C.ink; cx.fillText(x.sub, MX + 38, y + 80, W - MX * 2 - 420);
      }
      lab('PERIOD', W - MX - 30 + 4, 'right');
      R.font(cx, 600, 26); cx.fillStyle = C.soft; cx.fillText(x.period, W - MX - 30, y + 80);
      cx.textAlign = 'left';
      return y + bh + 64;
    },
    pageN(R, cx, x) {
      const { W, MX, TOP } = R, C = this.C;
      cx.fillStyle = C.navy; cx.fillRect(0, 0, W, 14);
      cx.fillStyle = C.gold; cx.fillRect(0, 14, W, 4);
      R.font(cx, 700, 22); cx.fillStyle = C.soft;
      cx.fillText([x.academy, x.title].filter(Boolean).join('   ·   '), MX, TOP + 8, W - MX * 2 - 280);
      cx.textAlign = 'right'; R.font(cx, 700, 24); cx.fillStyle = C.navy;
      cx.fillText(x.s.name, W - MX, TOP + 8);
      cx.textAlign = 'left';
      cx.fillStyle = C.navy; cx.fillRect(MX, TOP + 26, W - MX * 2, 2);
    },
    head(R, cx, it) {
      const { W, MX } = R, C = this.C;
      const base = it.y + 46;
      if (!it.cont) { R.font(cx, 800, 30); cx.fillStyle = C.gold; cx.fillText(pad(it.num), MX, base); }
      R.font(cx, 800, it.cont ? 28 : 34); cx.fillStyle = it.cont ? C.soft : C.navy;
      const tx = MX + this.bodyDX;
      cx.fillText(it.text, tx, base);
      const tw = cx.measureText(it.text).width;
      cx.fillStyle = C.line; cx.fillRect(tx + tw + 24, base - 12, Math.max(0, W - MX - (tx + tw + 24)), 2);
    },
    line(R, cx, it) {
      R.font(cx, 400, this.BODY); cx.fillStyle = this.C.ink;
      cx.fillText(it.text, R.MX + this.bodyDX, it.y + 35);
    },
    footer(R, cx, x, pi, total) {
      const { W, H, MX } = R, C = this.C;
      cx.fillStyle = C.line; cx.fillRect(MX, H - 112, W - MX * 2, 1.5);
      R.font(cx, 600, 21); cx.fillStyle = C.mute;
      if (x.academy) cx.fillText(x.academy, MX, H - 72);
      cx.textAlign = 'right';
      cx.fillText(total > 1 ? `${pi + 1} / ${total}` : `${x.Y}. ${pad(x.M)}`, W - MX, H - 72);
      cx.textAlign = 'left';
    },
  },

  /* ---------- 디자인: 주간 테스트 (딥 틸 머리띠) ---------- */
  TW: {
    C: { teal: '#0F5C61', tealD: '#0A4347', mint: '#E7F2F0', mint2: '#C9E2DE', ink: '#1E2C31', soft: '#5A6B70', mute: '#95A4A8', amber: '#E3A93C' },
    BODY: 28, BODY_LH: 50, HEAD_H: 78, GAP: 40, bodyDX: 46, BOTTOM: 1754 - 112, contY: 92 + 60,
    page1(R, cx, x) {
      const { W, MX } = R, C = this.C;
      const rowH = x.logo ? x.lh + 24 : (x.academy ? 52 : 40);
      const BH = 78 + rowH + 58 + x.titleLines.length * 70 + 16 + 40 + 96;
      // 머리띠 (위가 조금 더 진한 그라데이션)
      const g = cx.createLinearGradient(0, 0, W, BH);
      g.addColorStop(0, C.tealD); g.addColorStop(1, C.teal);
      cx.fillStyle = g; cx.fillRect(0, 0, W, BH);
      // 큰 주차 숫자 (장식)
      cx.save(); cx.globalAlpha = 0.10; R.font(cx, 800, 330); cx.fillStyle = '#fff'; cx.textAlign = 'right';
      cx.fillText(String(x.wk.n), W - MX + 10, BH - 52); cx.restore();
      let y = 78;
      let ax = MX;
      if (x.logo) {
        cx.fillStyle = '#fff'; R.rr(cx, MX, y, x.lw + 32, x.lh + 24, 12); cx.fill();
        cx.drawImage(x.logo, MX + 16, y + 12, x.lw, x.lh);
        ax = MX + x.lw + 32 + 22;
      }
      cx.textBaseline = 'middle';
      if (x.academy) { R.font(cx, 700, 32); cx.fillStyle = '#fff'; cx.fillText(x.academy, ax, y + rowH / 2, W - ax - MX - 280); }
      cx.textAlign = 'right'; R.font(cx, 700, 20); R.ls(cx, '6px'); cx.fillStyle = 'rgba(255,255,255,.78)';
      cx.fillText('WEEKLY TEST', W - MX + 6, y + rowH / 2); R.ls(cx, '0px');
      cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
      y += rowH + 58;
      R.font(cx, 800, 56); cx.fillStyle = '#fff'; R.ls(cx, '-1px');
      x.titleLines.forEach(t => { y += 70; cx.fillText(t, MX, y - 14); });
      R.ls(cx, '0px');
      y += 16;
      R.font(cx, 600, 28); cx.fillStyle = C.mint2; cx.fillText(x.period, MX, y + 30);
      // 학생 카드 (머리띠에 걸치게)
      const cy = BH - 46, ch = 108;
      cx.save(); cx.shadowColor = 'rgba(10,67,71,.20)'; cx.shadowBlur = 28; cx.shadowOffsetY = 8;
      cx.fillStyle = '#fff'; R.rr(cx, MX, cy, W - MX * 2, ch, 16); cx.fill(); cx.restore();
      const lab = (t, xx, al) => { cx.textAlign = al; R.font(cx, 700, 17); R.ls(cx, '4px'); cx.fillStyle = C.teal; cx.fillText(t, xx, cy + 40); R.ls(cx, '0px'); };
      if (x.sub) { lab('STUDENT', MX + 38, 'left'); R.font(cx, 800, 30); cx.fillStyle = C.ink; cx.fillText(x.sub, MX + 38, cy + 82, W - MX * 2 - 360); }
      lab('TEST WEEK', W - MX - 34 + 4, 'right');
      R.font(cx, 800, 30); cx.fillStyle = C.teal; cx.fillText(`${x.M}월 ${x.wk.n}주차`, W - MX - 34, cy + 82);
      cx.textAlign = 'left';
      return cy + ch + 58;
    },
    pageN(R, cx, x) {
      const { W, MX } = R, C = this.C;
      cx.fillStyle = C.teal; cx.fillRect(0, 0, W, 92);
      cx.fillStyle = C.amber; cx.fillRect(MX, 92, 72, 5);
      R.font(cx, 700, 22); cx.fillStyle = 'rgba(255,255,255,.9)'; cx.textBaseline = 'middle';
      cx.fillText([x.academy, x.title].filter(Boolean).join('   ·   '), MX, 46, W - MX * 2 - 280);
      cx.textAlign = 'right'; R.font(cx, 700, 24); cx.fillStyle = '#fff';
      cx.fillText(x.s.name, W - MX, 46);
      cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    },
    head(R, cx, it) {
      const { W, MX } = R, C = this.C;
      const ph = 52, py = it.y + 8;
      R.font(cx, 700, it.cont ? 26 : 29);
      const tw = cx.measureText(it.text).width;
      cx.fillStyle = it.cont ? C.mint : C.teal; R.rr(cx, MX, py, tw + 52, ph, ph / 2); cx.fill();
      cx.fillStyle = it.cont ? C.teal : '#fff'; cx.textBaseline = 'middle';
      cx.fillText(it.text, MX + 26, py + ph / 2 + 1); cx.textBaseline = 'alphabetic';
      cx.fillStyle = C.mint2; cx.fillRect(MX + tw + 52 + 18, py + ph / 2 - 1, Math.max(0, W - MX - (MX + tw + 52 + 18)), 2);
    },
    line(R, cx, it) {
      const C = this.C;
      cx.fillStyle = C.mint2; cx.fillRect(R.MX + 22, it.y, 4, this.BODY_LH);      // 왼쪽 세로줄 (한 영역이 한 덩어리로 보이게)
      R.font(cx, 400, this.BODY); cx.fillStyle = C.ink;
      cx.fillText(it.text, R.MX + this.bodyDX, it.y + 35);
    },
    footer(R, cx, x, pi, total) {
      const { W, H, MX } = R, C = this.C;
      cx.fillStyle = C.teal; cx.fillRect(0, H - 12, W, 12);
      R.font(cx, 600, 21); cx.fillStyle = C.mute;
      if (x.academy) cx.fillText(x.academy, MX, H - 46);
      cx.textAlign = 'right';
      cx.fillText(total > 1 ? `${pi + 1} / ${total}` : `${x.M}월 ${x.wk.n}주차`, W - MX, H - 46);
      cx.textAlign = 'left';
    },
  },

  // 리포트 이미지들 (canvas 배열). 입력한 영역이 없으면 빈 배열. week가 있으면 주간 테스트
  async build(sid, month, week) {
    const s = Store.get('students', sid);
    const r = this.rec(sid, month, week);
    const wk = week ? this.wkOf(month, week) : null;
    if (!s || !this.hasText(r) || (week && !wk)) return [];
    await this.ready();
    const cfg = this.cfg();
    const T = week ? this.TW : this.TM;
    const logo = await this.loadImg(cfg.logo);
    const { W, H } = this;
    const [Y, M] = month.split('-').map(Number);
    const LOGO_H = week ? 84 : 96, LOGO_W = 360;
    let lw = 0, lh = 0;
    if (logo) { const k = Math.min(LOGO_H / logo.height, LOGO_W / logo.width); lw = logo.width * k; lh = logo.height * k; }
    const x = {
      s, Y, M, wk, logo, lw, lh,
      academy: cfg.academy.trim(),
      title: this.fill(week ? cfg.wtitle : cfg.title, s, month, week),
      sub: this.fill(cfg.sub, s, month, week),
      period: week ? `${this.dTxt(wk.from, true)}  –  ${this.dTxt(wk.to)}` : `${Y}. ${M}. 1  –  ${M}. ${new Date(Y, M, 0).getDate()}`,
    };
    const labels = week ? cfg.wlabels : cfg.labels;
    const mc = document.createElement('canvas').getContext('2d');
    this.font(mc, 800, 56);
    x.titleLines = this.wrap(mc, x.title, W - this.MX * 2 - (week ? 220 : 0));

    // 첫 장 머리 높이: 빈 캔버스에 한 번 그려서 잰다
    const scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H;
    const firstY = T.page1(this, scratch.getContext('2d'), x);
    const contY = T.contY;
    const bodyW = W - this.MX - (this.MX + T.bodyDX);

    // 그릴 줄 목록 → 쪽 나누기
    const pages = [[]];
    let y = firstY, num = 0;
    const newPage = () => { pages.push([]); y = contY; };
    this.font(mc, 400, T.BODY);
    RP_KEYS.forEach(k => {
      const txt = String(r[k] || '').replace(/​/g, '').replace(/^\s*\n|\s+$/g, '');
      if (!txt.trim()) return;
      num++;
      const lines = this.wrap(mc, txt, bodyW);
      if (y > (pages.length === 1 ? firstY : contY) && y + T.HEAD_H + T.BODY_LH > T.BOTTOM) newPage();   // 제목만 덩그러니 남지 않게
      pages[pages.length - 1].push({ t: 'head', y, text: labels[k], num });
      y += T.HEAD_H;
      lines.forEach(ln => {
        if (y + T.BODY_LH > T.BOTTOM) {
          newPage();
          pages[pages.length - 1].push({ t: 'head', y, text: labels[k] + ' (이어서)', num, cont: true });
          y += T.HEAD_H;
        }
        pages[pages.length - 1].push({ t: 'line', y, text: ln });
        y += T.BODY_LH;
      });
      y += T.GAP;
    });

    const total = pages.length;
    return pages.map((items, pi) => {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);
      cx.textBaseline = 'alphabetic';
      if (pi === 0) T.page1(this, cx, x); else T.pageN(this, cx, x);
      items.forEach(it => { if (it.t === 'head') T.head(this, cx, it); else T.line(this, cx, it); });
      T.footer(this, cx, x, pi, total);
      return cv;
    });
  },

  /* ---------- 저장 · 복사 · 미리보기 ---------- */
  async getPages(sid, month, week) {
    const cvs = await this.build(sid, month, week);
    if (!cvs.length) toast('입력한 내용이 없습니다');
    return cvs;
  },
  blob(cv, type, q) { return new Promise(res => cv.toBlob(res, type, q)); },
  async download(cv, name) {
    const b = await this.blob(cv, 'image/jpeg', 0.92);
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url; a.download = name + '.jpg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
  async downloadAll(cvs, base) {
    for (let i = 0; i < cvs.length; i++) {
      await this.download(cvs[i], cvs.length > 1 ? `${base}_${i + 1}` : base);
      if (i < cvs.length - 1) await new Promise(r => setTimeout(r, 400));
    }
    toast(cvs.length > 1 ? `JPG ${cvs.length}장을 저장했습니다` : 'JPG를 저장했습니다');
  },
  async copy(cv) {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('no');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.blob(cv, 'image/png') })]);
      toast('이미지를 복사했습니다. 카톡 대화창에 Ctrl+V로 붙여넣으세요');
    } catch (_) { toast('이 브라우저에서는 이미지 복사가 안 됩니다. JPG 저장을 쓰세요'); }
  },
  async saveJpg(sid, month, week) {
    const cvs = await this.getPages(sid, month, week);
    if (cvs.length) await this.downloadAll(cvs, this.fileBase(Store.get('students', sid), month, week));
  },
  async copyOne(sid, month, week) {
    const cvs = await this.getPages(sid, month, week);
    if (!cvs.length) return;
    if (cvs.length === 1) { await this.copy(cvs[0]); return; }
    toast(`${cvs.length}장입니다. 미리보기에서 한 장씩 복사하세요`);
    this.preview(sid, month, week, cvs);
  },
  async preview(sid, month, week, given) {
    const cvs = given || await this.getPages(sid, month, week);
    if (!cvs.length) return;
    const s = Store.get('students', sid);
    const base = this.fileBase(s, month, week);
    Modal.open({
      title: `${s.name} ${week ? '주간 테스트' : '리포트'} 미리보기 (${cvs.length}장)`, size: 'xl', autofocus: false,
      body: `<div class="rp-pv">${cvs.map((cv, i) => `<div class="rp-pv-item">
        <img src="${cv.toDataURL('image/jpeg', 0.85)}" alt="${i + 1}쪽">
        <div class="rp-pv-bar"><span class="muted small">${i + 1} / ${cvs.length}</span><span class="grow"></span>
          <button type="button" class="btn sm" data-pc="${i}">복사</button><button type="button" class="btn sm" data-pj="${i}">JPG 저장</button></div></div>`).join('')}</div>`,
      onMount: (b) => {
        b.addEventListener('click', (e) => {
          const c = e.target.closest('[data-pc]');
          if (c) { this.copy(cvs[+c.dataset.pc]); return; }
          const j = e.target.closest('[data-pj]');
          if (j) { const i = +j.dataset.pj; this.download(cvs[i], cvs.length > 1 ? `${base}_${i + 1}` : base).then(() => toast('JPG를 저장했습니다')); }
        });
      },
      buttons: [
        { text: '닫기' },
        { text: cvs.length > 1 ? `JPG ${cvs.length}장 모두 저장` : 'JPG 저장', cls: 'primary', primary: true, onClick: async () => { await this.downloadAll(cvs, base); return false; } },
      ],
    });
  },
};

/* Report 화면 스타일 */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.rp-page { max-width: 1180px; }
.rp-grid { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 14px; align-items: start; }
.rp-grid > .panel + .panel { margin-top: 0; }
.rp-list { padding: 10px 8px 14px; position: sticky; top: 0; max-height: calc(100vh - 150px); overflow-y: auto; }
.rp-cnt { padding: 2px 8px 4px; }
.rp-grp { display: flex; align-items: center; font-size: 13px; font-weight: 700; color: var(--ink-soft); padding: 12px 8px 4px; }
.rp-st { display: flex; align-items: center; gap: 2px; width: 100%; text-align: left; border: 0; background: none; padding: 6px 8px; border-radius: 7px; cursor: pointer; }
.rp-st:hover { background: var(--accent-soft); }
.rp-st.on { background: var(--accent); color: #fff; }
.rp-st.on .tag { color: var(--on-accent-mute); }
.rp-st .mk { margin-left: auto; flex: none; width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--line-strong); }
.rp-st.done .mk { background: var(--ok); border-color: var(--ok); }
.rp-st.on .mk { border-color: #fff; }
.rp-area { margin-bottom: 12px; }
.rp-area > label { display: block; font-weight: 700; font-size: 14.5px; color: var(--ink); margin-bottom: 4px; }
.rp-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.rp-logo-pv { min-width: 60px; min-height: 36px; display: flex; align-items: center; }
.rp-logo-pv img { max-height: 60px; max-width: 220px; border: 1px solid var(--line); border-radius: 6px; padding: 3px; background: #fff; }
.rp-lbls { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.rp-lbls input { width: 100%; }
.rp-cfg input[type=text] { width: 100%; }
.rp-cfg-h { font-weight: 800; font-size: 14px; color: var(--accent-ink); padding: 10px 0 4px; border-bottom: 1px solid var(--line); margin-bottom: 2px; }
.rp-cfg-h:first-child { padding-top: 0; }
.rp-cls { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.rp-cls .chk { display: inline-flex; align-items: center; }
.rp-grp .rp-xbtn { margin-left: auto; }
.rp-xbtn { border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-soft); font-size: 11.5px; font-weight: 600; padding: 0 7px; line-height: 19px; border-radius: 6px; cursor: pointer; }
.rp-xbtn:hover { border-color: var(--danger); color: var(--danger); }
.rp-xbtn.in:hover { border-color: var(--ok); color: var(--ok); }
.rp-xsec { margin-top: 14px; border-top: 1px dashed var(--line-strong); padding-top: 6px; }
.rp-xhead { width: 100%; display: flex; justify-content: space-between; border: 0; background: none; padding: 6px 8px; font-size: 13px; font-weight: 700; color: var(--ink-mute); cursor: pointer; border-radius: 7px; }
.rp-xhead:hover { background: var(--tint); color: var(--ink-soft); }
.rp-xrow { display: flex; align-items: center; gap: 6px; padding: 5px 8px; font-size: 13px; color: var(--ink-mute); }
.rp-xrow .rp-xbtn { margin-left: auto; }
.rp-pv { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 18px; }
.rp-pv-item img { display: block; width: 100%; border: 1px solid var(--line-strong); border-radius: 6px; box-shadow: 0 2px 8px rgba(30, 70, 105, .10); }
.rp-pv-bar { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.rp-pv-bar .grow { flex: 1; }
/* 상단 버튼: 월별 요약(켜면 진하게) · PDF 저장 (출석부와 같은 모양) */
.rp-sumbtn { min-width: 84px; }
.rp-sumbtn.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.rp-reset { background: var(--danger-soft); border-color: #F0C6C8; color: var(--danger); }
.rp-reset:hover { background: #F9DADB; border-color: var(--danger); color: var(--danger); }
.rp-pdfbtn { background: var(--accent-soft); border-color: var(--accent-line-2); color: var(--accent-ink); font-weight: 700; }
/* 탭 · 주차 */
.rp-tabs { margin-bottom: 12px; }
.rp-weeks { display: flex; gap: 6px; flex-wrap: wrap; margin: -2px 0 14px; }
.rp-weeks button { display: inline-flex; flex-direction: column; align-items: center; min-width: 92px; padding: 6px 12px 5px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); color: var(--ink); cursor: pointer; line-height: 1.25; }
.rp-weeks button b { font-size: 14px; }
.rp-weeks button small { font-size: 11.5px; color: var(--ink-mute); font-variant-numeric: tabular-nums; }
.rp-weeks button:hover { border-color: var(--accent); }
.rp-weeks button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.rp-weeks button.on small { color: var(--on-accent-mute); }
.rp-ed h2 .rp-kind { display: inline-block; font-size: 12px; font-weight: 700; padding: 1px 8px; border-radius: 10px; margin-right: 8px; vertical-align: 2px; background: #EAE6DD; color: #6E5530; }
.rp-ed.is-week h2 .rp-kind { background: #DCEFEC; color: #0F5C61; }
/* 월별 요약 */
.rp-sum-top { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; }
.rp-chip { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px 12px; cursor: pointer; }
.rp-chip:hover { border-color: var(--accent); }
.rp-chip .t { display: block; font-size: 13px; font-weight: 700; color: var(--ink-soft); }
.rp-chip .t small { font-weight: 500; color: var(--ink-mute); margin-left: 3px; }
.rp-chip > b { display: block; font-size: 24px; font-weight: 800; color: var(--ink); line-height: 1.3; font-variant-numeric: tabular-nums; }
.rp-chip > b small { font-size: 14px; font-weight: 600; color: var(--ink-mute); }
.rp-chip .bar { display: block; height: 5px; border-radius: 3px; background: var(--tint-strong); margin-top: 6px; overflow: hidden; }
.rp-chip .bar i { display: block; height: 100%; background: var(--ok); border-radius: 3px; }
.rp-sum-sec .ab-sec-head { display: flex; align-items: center; }
.rp-sum-sec .ab-sec-head h2 { margin-bottom: 8px; }
.tbl.rp-sum th, .tbl.rp-sum td { text-align: center; }
.tbl.rp-sum th.nm, .tbl.rp-sum td.nm { text-align: left; width: 220px; }
.tbl.rp-sum th small { display: block; font-size: 11px; font-weight: 500; color: var(--ink-mute); }
.tbl.rp-sum th.mc { width: 110px; }
.tbl.rp-sum td[data-sc] { cursor: pointer; }
.tbl.rp-sum td[data-sc]:hover { background: var(--accent-soft); }
.rp-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--line-strong); vertical-align: middle; }
.tbl.rp-sum td.yes .rp-dot { background: var(--ok); border-color: var(--ok); }
.tbl.rp-sum tfoot td { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); background: var(--tint); }
`;
  document.head.appendChild(st);
})();
