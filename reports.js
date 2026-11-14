/* =========================================================
   reports.js — 월간 리포트 (학생 › Report)
   학생마다 한 달에 리포트 하나. 단어·문법·독해·듣기·일반 5개 영역 중 입력한 영역만
   A4 비율 이미지(JPG 저장 / PNG 복사)로 만든다. 내용이 길면 여러 장으로 나눈다.
   기록은 meta 테이블에 저장 (서버 SQL 변경 없음):
   report: { id 'RP_학생ID_YYYY-MM', kind:'report', studentId, month:'YYYY-MM',
             word, gram, read, listen, general(영역별 자유 서술), createdAt, updatedAt }
   설정:   { id 'RP_CFG', kind:'rpcfg', academy(학원 이름), logo(이미지 dataURL),
             title(제목 문구), sub(학생 표시 문구), file(파일 이름), labels:{ 영역키: 제목 }, updatedAt }
   문구 안의 {년} {월} {이름} {학교} 는 자동으로 바뀐다 ({학교} = 금천고1 처럼 학교·학년)
   ========================================================= */
const RP_AREAS = [['word', '단어'], ['gram', '문법'], ['read', '독해'], ['listen', '듣기'], ['general', '일반']];
const RP_KEYS = RP_AREAS.map(a => a[0]);
const RP_CFG_ID = 'RP_CFG';
const RP_DEF = {
  academy: '',
  logo: '',
  title: '{년}년 {월}월 월간 리포트',
  sub: '{이름} 학생 · {학교}',
  file: '리포트_{년}년{월}월_{이름}',
};

const Reports = {
  month: '',
  sid: '',
  _t: null,            // 자동 저장 타이머

  /* ---------- 데이터 ---------- */
  rid(sid, month) { return 'RP_' + sid + '_' + month; },
  rec(sid, month) { return Store.get('meta', this.rid(sid, month)); },
  hasText(r) { return !!r && RP_KEYS.some(k => String(r[k] || '').trim()); },
  cfg() {
    const r = Store.get('meta', RP_CFG_ID) || {};
    const labels = {};
    RP_AREAS.forEach(([k, t]) => { labels[k] = String((r.labels || {})[k] || '').trim() || t; });
    return {
      academy: r.academy || RP_DEF.academy,
      logo: r.logo || '',
      title: String(r.title || '').trim() || RP_DEF.title,
      sub: r.sub != null ? r.sub : RP_DEF.sub,
      file: String(r.file || '').trim() || RP_DEF.file,
      labels,
    };
  },
  // 문구의 {년} {월} {이름} {학교} 채우기 (빈 값 때문에 앞뒤에 남는 · - | , 는 지움)
  fill(tpl, s, month) {
    const [Y, M] = month.split('-').map(Number);
    return String(tpl || '')
      .replace(/\{년\}/g, Y).replace(/\{월\}/g, M)
      .replace(/\{이름\}/g, s ? s.name : '').replace(/\{학교\}/g, stTag(s))
      .replace(/^[\s·|,\-]+|[\s·|,\-]+$/g, '').replace(/\s{2,}/g, ' ');
  },
  fileBase(s, month) {
    return (this.fill(this.cfg().file, s, month).replace(/[\\/:*?"<>|]/g, '_').trim()) || ('리포트_' + month + '_' + (s ? s.name : ''));
  },

  // 재원생만, 반별로 묶음 (반 없는 학생은 맨 아래 '반 없음')
  groups() {
    const list = Store.where('students', s => s.status === 'active' && (s.name || '').trim());
    return Books.groupByClass(list);
  },

  /* ---------- 저장 ---------- */
  save(sid, month, vals) {
    if (!sid || !Store.get('students', sid)) return;
    const id = this.rid(sid, month);
    const r = Store.get('meta', id);
    if (!RP_KEYS.some(k => vals[k].trim())) { if (r) Store.del('meta', id); return; }   // 다 비우면 기록을 지운다
    if (r && RP_KEYS.every(k => (r[k] || '') === vals[k])) return;
    const now = new Date().toISOString();
    Store.put('meta', Object.assign({}, r || { id, kind: 'report', studentId: sid, month, createdAt: now }, vals, { updatedAt: now }));
  },
  // 화면의 입력칸 내용을 바로 저장
  flushSave() {
    clearTimeout(this._t); this._t = null;
    const box = $('#main [data-rp-ed]');
    if (!box) return;
    const vals = {};
    RP_KEYS.forEach(k => { const ta = $(`textarea[data-k="${k}"]`, box); vals[k] = ta ? stripZws(ta.value) : ''; });
    this.save(box.dataset.sid, box.dataset.month, vals);
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

    let h = `<div class="rp-page"><div class="page-head"><h1>Report</h1>
      <button class="btn sm" data-m="-1">‹</button><input type="month" data-month value="${this.month}"><button class="btn sm" data-m="1">›</button>
      <button class="btn sm" data-m="0">이번 달</button><span class="grow"></span>
      <button class="btn sm" data-rp="cfg">⚙ 설정</button></div>`;
    if (!cfg.academy.trim()) h += `<div class="toolbar small soft"><span class="muted">⚙ 설정에서 학원 이름·로고·제목 문구를 넣으면 리포트 이미지 맨 위에 표시됩니다.</span></div>`;

    // 왼쪽: 학생 목록
    let n = 0, d = 0;
    let lh = '';
    groups.forEach(g => {
      lh += `<div class="rp-grp">${g.c ? Classes.dot(g.c) + esc(g.c.name) : '반 없음'}</div>`;
      g.list.forEach(s => {
        const done = this.hasText(this.rec(s.id, this.month));
        n++; if (done) d++;
        lh += `<button type="button" class="rp-st ${done ? 'done' : ''} ${s.id === this.sid ? 'on' : ''}" data-sid="${s.id}" title="${done ? '작성함' : '아직 작성 안 함'}">
          <b>${esc(s.name)}</b><span class="tag">${esc(stTag(s))}</span><span class="mk"></span></button>`;
      });
    });
    h += `<div class="rp-grid"><div class="panel rp-list"><div class="rp-cnt muted small" data-rp-cnt>작성 ${d} / ${n}명</div>${lh || '<div class="empty">재원생이 없습니다.</div>'}</div>`;

    // 오른쪽: 입력
    const s = this.sid ? Store.get('students', this.sid) : null;
    if (!s) h += `<div class="panel"><div class="empty">왼쪽에서 학생을 고르세요.</div></div>`;
    else {
      const r = this.rec(s.id, this.month) || {};
      h += `<div class="panel rp-ed" data-rp-ed data-sid="${s.id}" data-month="${this.month}">
        <h2>${esc(s.name)}<span class="sub">${esc(stTag(s))} · ${Y}년 ${M}월</span></h2>
        <div class="muted small" style="margin:-6px 0 12px">입력한 영역만 리포트에 실립니다. 입력하면 바로 저장됩니다.</div>
        ${RP_AREAS.map(([k]) => `<div class="rp-area"><label>${esc(cfg.labels[k])}</label><textarea data-k="${k}" rows="4">${esc(r[k] || '')}</textarea></div>`).join('')}
        <div class="rp-acts"><button class="btn" data-rp="pv">미리보기</button>
          <button class="btn primary" data-rp="jpg">JPG 저장</button>
          <button class="btn" data-rp="copy" title="카톡 대화창에 Ctrl+V로 붙여넣기 (1장씩)">이미지 복사</button></div></div>`;
    }
    h += '</div></div>';
    main.innerHTML = h;
    enhanceAll(main);
    this.bind(main);
  },

  bind(main) {
    main.onclick = (e) => {
      const m = e.target.closest('[data-m]');
      if (m) {
        this.flushSave();
        if (m.dataset.m === '0') this.month = todayStr().slice(0, 7);
        else { const [y, mo] = this.month.split('-').map(Number); const dt = new Date(y, mo - 1 + +m.dataset.m, 1); this.month = dt.getFullYear() + '-' + pad(dt.getMonth() + 1); }
        App.render(); return;
      }
      const st = e.target.closest('.rp-st[data-sid]');
      if (st) { this.flushSave(); this.sid = st.dataset.sid; App.render(); return; }
      const b = e.target.closest('[data-rp]');
      if (!b) return;
      const a = b.dataset.rp;
      if (a === 'cfg') { this.flushSave(); this.openCfg(); return; }
      this.flushSave();
      if (a === 'pv') this.preview(this.sid, this.month);
      else if (a === 'jpg') this.saveJpg(this.sid, this.month);
      else if (a === 'copy') this.copyOne(this.sid, this.month);
    };
    main.oninput = (e) => {
      if (!e.target.matches('textarea[data-k]')) return;
      clearTimeout(this._t);
      this._t = setTimeout(() => this.flushSave(), 600);
    };
    main.onchange = (e) => {
      if (e.target.matches('[data-month]') && /^\d{4}-\d{2}$/.test(e.target.value)) { this.flushSave(); this.month = e.target.value; App.render(); return; }
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
        <label>학원 이름</label><input type="text" name="academy" value="${esc(c.academy)}" placeholder="예: OO영어학원">
        <label class="top">로고</label><div class="row"><div class="rp-logo-pv" data-logo-pv></div>
          <label class="btn sm">이미지 선택<input type="file" accept="image/*" data-logo-file hidden></label>
          <button type="button" class="btn sm danger" data-logo-del>로고 삭제</button></div>
        <label>제목 문구</label><input type="text" name="title" value="${esc(c.title)}" placeholder="${esc(RP_DEF.title)}">
        <label>학생 표시</label><input type="text" name="sub" value="${esc(c.sub)}" placeholder="${esc(RP_DEF.sub)}">
        <label>파일 이름</label><input type="text" name="file" value="${esc(c.file)}" placeholder="${esc(RP_DEF.file)}">
        <div class="full hint">{년} {월} {이름} {학교} 를 넣으면 자동으로 바뀝니다. ({학교} = 금천고1 처럼 학교·학년) · 학생 표시를 비우면 넣지 않습니다. · 파일이 여러 장이면 이름 뒤에 _1, _2 가 붙습니다.</div>
        <label class="top">영역 제목</label><div class="rp-lbls">${RP_AREAS.map(([k, t]) => `<input type="text" name="lb_${k}" value="${esc(c.labels[k])}" placeholder="${t}">`).join('')}</div>
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
          RP_AREAS.forEach(([k, t]) => { $(`[name=lb_${k}]`, m.body).value = t; });
          return false;
        } },
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const g = (n) => $(`[name=${n}]`, m.body).value.trim();
          const labels = {};
          RP_AREAS.forEach(([k]) => { labels[k] = g('lb_' + k); });
          const old = Store.get('meta', RP_CFG_ID) || { id: RP_CFG_ID, kind: 'rpcfg' };
          Store.put('meta', Object.assign({}, old, { academy: g('academy'), logo, title: g('title'), sub: g('sub'), file: g('file'), labels, updatedAt: new Date().toISOString() }));
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
     ========================================================= */
  W: 1240, H: 1754, MX: 100, TOP: 96, BOTTOM: 1754 - 130,
  FF: "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  C: { ink: '#1E3243', soft: '#566D80', mute: '#8DA2B3', accent: '#2B7FC1', line: '#D6E7F4', band: '#F1F7FC' },

  font(cx, w, px) { cx.font = `${w} ${px}px ${this.FF}`; },
  async ready() {
    try { await Promise.all(['400', '700', '800'].map(w => document.fonts.load(`${w} 28px Pretendard`, '가A'))); } catch (_) {}
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

  // 리포트 이미지들 (canvas 배열). 입력한 영역이 없으면 빈 배열
  async build(sid, month) {
    const s = Store.get('students', sid);
    const r = this.rec(sid, month);
    if (!s || !this.hasText(r)) return [];
    await this.ready();
    const cfg = this.cfg();
    const logo = await this.loadImg(cfg.logo);
    const { W, H, MX, TOP, BOTTOM, C } = this;
    const title = this.fill(cfg.title, s, month);
    const sub = this.fill(cfg.sub, s, month);
    const academy = cfg.academy.trim();

    const mc = document.createElement('canvas').getContext('2d');
    // 크기
    const BODY = 28, BODY_LH = 48, HEAD = 33, HEAD_H = 64, GAP = 40;
    const bodyX = MX + 24, bodyW = W - MX - bodyX;

    // 첫 장 머리 높이 계산
    const LOGO_H = 104, LOGO_W = 380;
    let lw = 0, lh = 0;
    if (logo) { const k = Math.min(LOGO_H / logo.height, LOGO_W / logo.width); lw = logo.width * k; lh = logo.height * k; }
    this.font(mc, 800, 54);
    const titleLines = this.wrap(mc, title, W - MX * 2);
    this.font(mc, 400, 30);
    const subLines = sub ? this.wrap(mc, sub, W - MX * 2) : [];
    const topH = (logo || academy) ? Math.max(lh, 48) + 30 : 0;      // 로고·학원 이름 줄 + 아래 선
    const firstY = TOP + topH + 36 + titleLines.length * 70 + (subLines.length ? 10 + subLines.length * 44 : 0) + 56;
    const contY = TOP + 64;                                            // 둘째 장부터 (작은 머리)

    // 그릴 줄 목록 → 쪽 나누기
    const pages = [[]];
    let y = firstY;
    const newPage = () => { pages.push([]); y = contY; };
    this.font(mc, 400, BODY);
    RP_KEYS.forEach(k => {
      const txt = String(r[k] || '').replace(/​/g, '').replace(/^\s*\n|\s+$/g, '');
      if (!txt.trim()) return;
      const lines = this.wrap(mc, txt, bodyW);
      if (y > (pages.length === 1 ? firstY : contY) && y + HEAD_H + BODY_LH > BOTTOM) newPage();   // 제목만 덩그러니 남지 않게
      pages[pages.length - 1].push({ t: 'head', y, text: cfg.labels[k] });
      y += HEAD_H;
      lines.forEach(ln => {
        if (y + BODY_LH > BOTTOM) {
          newPage();
          pages[pages.length - 1].push({ t: 'head', y, text: cfg.labels[k] + ' (이어서)', cont: true });
          y += HEAD_H;
        }
        pages[pages.length - 1].push({ t: 'line', y, text: ln });
        y += BODY_LH;
      });
      y += GAP;
    });

    const total = pages.length;
    return pages.map((items, pi) => {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);
      cx.textBaseline = 'alphabetic';
      if (pi === 0) {
        let yy = TOP;
        if (logo || academy) {
          const rowH = Math.max(lh, 48);
          if (logo) cx.drawImage(logo, MX, yy + (rowH - lh) / 2, lw, lh);
          if (academy) {
            this.font(cx, 700, 36); cx.fillStyle = C.ink; cx.textBaseline = 'middle';
            cx.fillText(academy, MX + (logo ? lw + 26 : 0), yy + rowH / 2, W - MX * 2 - (logo ? lw + 26 : 0));
            cx.textBaseline = 'alphabetic';
          }
          yy += rowH + 26;
          cx.fillStyle = C.accent; cx.fillRect(MX, yy, W - MX * 2, 4);
          yy += 4;
        }
        yy += 36;
        this.font(cx, 800, 54); cx.fillStyle = C.ink; cx.textAlign = 'center';
        titleLines.forEach(t => { yy += 70; cx.fillText(t, W / 2, yy - 14); });
        if (subLines.length) {
          yy += 10;
          this.font(cx, 400, 30); cx.fillStyle = C.soft;
          subLines.forEach(t => { yy += 44; cx.fillText(t, W / 2, yy - 10); });
        }
        cx.textAlign = 'left';
      } else {
        // 둘째 장부터: 작은 머리 (학원 이름 · 제목 · 학생)
        this.font(cx, 700, 24); cx.fillStyle = C.soft;
        cx.fillText([academy, title].filter(Boolean).join('  ·  '), MX, TOP + 10, W - MX * 2 - 260);
        cx.textAlign = 'right'; this.font(cx, 400, 24); cx.fillStyle = C.mute;
        cx.fillText(s.name, W - MX, TOP + 10);
        cx.textAlign = 'left';
        cx.fillStyle = C.line; cx.fillRect(MX, TOP + 28, W - MX * 2, 2);
      }
      items.forEach(it => {
        if (it.t === 'head') {
          cx.fillStyle = C.band; cx.fillRect(MX, it.y, W - MX * 2, 50);
          cx.fillStyle = C.accent; cx.fillRect(MX, it.y, 8, 50);
          this.font(cx, 700, it.cont ? 28 : HEAD); cx.fillStyle = it.cont ? C.soft : C.ink;
          cx.textBaseline = 'middle'; cx.fillText(it.text, MX + 26, it.y + 26); cx.textBaseline = 'alphabetic';
        } else {
          this.font(cx, 400, BODY); cx.fillStyle = C.ink;
          cx.fillText(it.text, bodyX, it.y + 34);
        }
      });
      if (total > 1) {
        this.font(cx, 400, 24); cx.fillStyle = C.mute; cx.textAlign = 'center';
        cx.fillText(`${pi + 1} / ${total}`, W / 2, H - 60);
        cx.textAlign = 'left';
      }
      return cv;
    });
  },

  /* ---------- 저장 · 복사 · 미리보기 ---------- */
  async getPages(sid, month) {
    const cvs = await this.build(sid, month);
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
  async saveJpg(sid, month) {
    const cvs = await this.getPages(sid, month);
    if (cvs.length) await this.downloadAll(cvs, this.fileBase(Store.get('students', sid), month));
  },
  async copyOne(sid, month) {
    const cvs = await this.getPages(sid, month);
    if (!cvs.length) return;
    if (cvs.length === 1) { await this.copy(cvs[0]); return; }
    toast(`${cvs.length}장입니다. 미리보기에서 한 장씩 복사하세요`);
    this.preview(sid, month, cvs);
  },
  async preview(sid, month, given) {
    const cvs = given || await this.getPages(sid, month);
    if (!cvs.length) return;
    const s = Store.get('students', sid);
    const base = this.fileBase(s, month);
    Modal.open({
      title: `${s.name} 리포트 미리보기 (${cvs.length}장)`, size: 'xl', autofocus: false,
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
.rp-pv { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 18px; }
.rp-pv-item img { display: block; width: 100%; border: 1px solid var(--line-strong); border-radius: 6px; box-shadow: 0 2px 8px rgba(30, 70, 105, .10); }
.rp-pv-bar { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.rp-pv-bar .grow { flex: 1; }
`;
  document.head.appendChild(st);
})();
