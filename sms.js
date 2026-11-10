/* =========================================================
   sms.js — 문자 (SMS Gateway for Android 경유, 내 폰으로 발송)
   프로그램 → GAS(CFG.GAS_SMS_URL, 로그인 키 확인) → SMS Gateway 클라우드 → 내 폰
   - 받는 사람: 재원생만 (반 선택 / 이름 검색 / 전체 목록 체크), 학생·부모님·둘 다
   - 템플릿(meta): id SX7T_…, { kind:'sx7_tpl', name, text, createdAt }
   - 발송 기록: Supabase mg77_sx7_log (mg77_sx7_add / mg77_sx7_set / mg77_sx7_list)
   ========================================================= */
const SmsPage = {
  tab: 'send',            // 'send' | 'log'
  cls: '',                // 반 필터 ('' = 전체 재원생)
  q: '',                  // 이름 검색
  sel: new Set(),         // 선택한 학생 ID
  to: 'parent',           // 'student' | 'parent' | 'both'
  text: '',
  tplId: '',
  sending: false,

  log: null,              // 불러온 기록 (최신순)
  logBusy: false,
  logTried: false,        // 자동 불러오기를 이미 시도했는지 (실패 시 무한 재시도 방지)
  logMore: false,
  open: new Set(),        // 펼친 묶음(batch_id)
  checking: false,
  _t: null,

  TOKENS: ['{이름}', '{성뺀이름}', '{반}', '{날짜}'],
  PAGE: 1000,             // 기록 한 번에 불러오는 줄 수
  GAS_CHUNK: 200,         // GAS 한 번 호출에 보내는 건수

  /* ---------- 공통 ---------- */
  digits(p) { return String(p || '').replace(/\D/g, ''); },
  okPhone(d) { return /^01[016789]\d{7,8}$/.test(d); },
  showPhone(p) { const d = this.digits(p); return fmtPhone(d.startsWith('82') ? '0' + d.slice(2) : d); },
  activeStudents() {
    return Store.all('students').filter(s => (s.status || 'active') === 'active' && (s.name || '').trim()).sort((a, b) => Students.sortFn(a, b));
  },
  activeClasses() { return Store.all('classes').filter(c => c.active !== false).sort((a, b) => ko(a.name, b.name)); },
  // 학생ID → 지금 다니는 반 목록
  classMap() {
    const t = todayStr(), m = {};
    this.activeClasses().forEach(c => Classes.rosterAt(c.id, t).forEach(s => { (m[s.id] = m[s.id] || []).push(c); }));
    return m;
  },
  givenName(n) { n = String(n || '').trim(); return n.length >= 3 ? n.slice(1) : n; },
  todayLabel() { const d = new Date(); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; },
  fill(text, s, cmap) {
    const cls = (cmap[s.id] || []).map(c => c.name).join(', ');
    return text.split('{이름}').join(s.name.trim())
      .split('{성뺀이름}').join(this.givenName(s.name))
      .split('{반}').join(cls)
      .split('{날짜}').join(this.todayLabel());
  },
  // 한글 2byte, 영문·숫자 1byte 기준 / 한 통 약 90byte
  bytes(t) { let b = 0; for (const ch of String(t || '')) b += ch.charCodeAt(0) < 128 ? 1 : 2; return b; },
  parts(t) { const b = this.bytes(t); return b <= 90 ? 1 : Math.ceil(b / 90); },
  tpls() { return Store.where('meta', m => m.kind === 'sx7_tpl').sort((a, b) => ko(a.name, b.name)); },
  fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return fmtDate(ymd(d)) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },
  stateBadge(st) {
    if (st === 'delivered') return '<span class="badge green">수신 확인</span>';
    if (st === 'sent') return '<span class="badge green">발송됨</span>';
    if (st === 'failed') return '<span class="badge red">실패</span>';
    return '<span class="badge orange">대기</span>';
  },
  isWaiting(st) { return st === 'pending' || st === 'processed'; },

  onLeave() { clearTimeout(this._t); this._t = null; },

  /* ---------- 화면 ---------- */
  render(main) {
    clearTimeout(this._t); this._t = null;
    let h = `<div class="page-head"><h1>문자</h1><span class="sub">내 폰으로 발송 (SMS Gateway)</span></div>
      <div class="tabs">${[['send', '보내기'], ['log', '발송 기록']].map(([k, t]) => `<button data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${t}</button>`).join('')}</div>`;
    if (!CFG.GAS_SMS_URL) h += `<div class="panel notice small" style="margin-bottom:14px">문자 발송 주소(GAS_SMS_URL)가 config.js에 설정되지 않았습니다.</div>`;
    h += this.tab === 'log' ? this.logHtml() : this.sendHtml();
    main.innerHTML = h;
    this.bind(main);
    if (this.tab === 'log') {
      if (!this.log && !this.logBusy && !this.logTried) this.loadLog(false);
      else this.scheduleCheck();
    }
  },

  /* ---------- 보내기 ---------- */
  sendHtml() {
    const all = this.activeStudents();
    const ids = new Set(all.map(s => s.id));
    [...this.sel].forEach(id => { if (!ids.has(id)) this.sel.delete(id); });   // 퇴원 등으로 빠진 학생 정리
    const classes = this.activeClasses();
    if (this.cls && !classes.some(c => c.id === this.cls)) this.cls = '';
    const cmap = this.classMap();
    const tpls = this.tpls();
    if (this.tplId && !tpls.some(t => t.id === this.tplId)) this.tplId = '';

    const clsOpts = `<option value="" ${this.cls ? '' : 'selected'}>전체 (${all.length}명)</option>` +
      classes.map(c => {
        const n = all.filter(s => (cmap[s.id] || []).some(x => x.id === c.id)).length;
        return `<option value="${c.id}" ${this.cls === c.id ? 'selected' : ''}>${esc(c.name)} (${n}명)</option>`;
      }).join('');
    const curCls = this.cls ? classes.find(c => c.id === this.cls) : null;

    return `<div class="grid-2 sx7-grid">
      <div class="panel">
        <h2>받는 사람 <span class="sub">재원생</span></h2>
        <div class="sx7-clsbar">${Classes.selDot(curCls)}<select data-clssel aria-label="반 선택">${clsOpts}</select></div>
        <div class="toolbar" style="margin-bottom:8px">
          <input type="search" data-q value="${esc(this.q)}" placeholder="이름 검색" style="flex:1;min-width:140px">
          <button class="btn sm" data-a="selvis">보이는 학생 모두 선택</button>
          <button class="btn sm ghost" data-a="unselvis">보이는 학생 해제</button>
        </div>
        <div class="sx7-list" id="sx7-list">${this.listHtml(all, cmap)}</div>
        <div id="sx7-selbox" class="sx7-selbox">${this.selHtml(all)}</div>
      </div>
      <div class="panel">
        <h2>내용</h2>
        <div class="sx7-row"><span class="soft small sx7-lb">받는 사람</span>
          ${[['parent', '부모님'], ['student', '학생'], ['both', '둘 다']].map(([k, t]) => `<label class="chk"><input type="radio" name="sx7-to" data-to="${k}" ${this.to === k ? 'checked' : ''}> ${t}</label>`).join('')}
        </div>
        <div class="sx7-row"><span class="soft small sx7-lb">템플릿</span>
          <select data-tpl style="flex:1;min-width:120px"><option value="">— 불러오기 —</option>${tpls.map(t => `<option value="${t.id}" ${this.tplId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          <button class="btn sm" data-a="tplsave">현재 내용 저장</button>
          <button class="btn sm danger" data-a="tpldel" ${this.tplId ? '' : 'disabled'}>삭제</button>
        </div>
        <div class="sx7-row"><span class="soft small sx7-lb">자동 넣기</span>
          ${this.TOKENS.map(t => `<button class="btn sm" data-ins="${t}">${t}</button>`).join('')}
        </div>
        <textarea data-text rows="9" placeholder="보낼 내용을 입력하세요. {이름} 등은 학생마다 바뀌어 들어갑니다.">${esc(this.text)}</textarea>
        <div class="small soft" id="sx7-cnt" style="margin-top:4px">${this.cntHtml()}</div>
        <p class="small muted" style="margin:6px 0 0">{이름} 홍길동 · {성뺀이름} 길동 · {반} 다니는 반 이름 · {날짜} ${esc(this.todayLabel())}</p>
        <div style="display:flex;justify-content:flex-end;margin-top:12px">
          <button class="btn primary" data-a="preview" ${this.sending ? 'disabled' : ''}>${this.sending ? '발송 요청 중…' : '미리보기 후 발송'}</button>
        </div>
      </div>
    </div>`;
  },

  visible(all, cmap) {
    const q = this.q.trim();
    return all.filter(s => (!this.cls || (cmap[s.id] || []).some(c => c.id === this.cls)) && (!q || s.name.includes(q)));
  },

  listHtml(all, cmap) {
    const list = this.visible(all, cmap);
    if (!list.length) return `<div class="empty">${all.length ? '해당하는 학생이 없습니다.' : '재원생이 없습니다.'}</div>`;
    const ph = (lb, v) => {
      const d = this.digits(v);
      if (!d) return `<span class="sx7-no">${{ 학: '학생', 부: '부모' }[lb] || lb} 없음</span>`;   // 번호가 없을 때만 '학생 없음' / '부모 없음'
      return `<span class="${this.okPhone(d) ? '' : 'sx7-no'}">${lb} ${esc(fmtPhone(d))}</span>`;
    };
    return list.map(s => `<label class="sx7-st">
        <input type="checkbox" data-sid="${s.id}" ${this.sel.has(s.id) ? 'checked' : ''}>
        <span class="sx7-nm"><b>${highlight(s.name, this.q.trim())}</b><span class="tag">${esc(stTag(s))}</span>
          <span class="sx7-cl">${esc((cmap[s.id] || []).map(c => c.name).join(', '))}</span></span>
        <span class="sx7-ph small">${ph('학', s.phone)}${ph('부', s.parentPhone)}</span>
      </label>`).join('');
  },

  selHtml(all) {
    const list = all.filter(s => this.sel.has(s.id));
    if (!list.length) return '<span class="muted small">선택한 학생이 없습니다.</span>';
    return `<div class="sx7-selhead"><b>선택 ${list.length}명</b><button class="btn sm ghost" data-a="unselall">모두 해제</button></div>
      <div class="sx7-tags">${list.map(s => `<span class="sx7-tagx">${esc(s.name)}<button type="button" data-unsel="${s.id}" aria-label="빼기">✕</button></span>`).join('')}</div>`;
  },

  cntHtml() {
    const t = this.text;
    if (!t.trim()) return '글자 수 0';
    const b = this.bytes(t), p = this.parts(t);
    const hasTok = this.TOKENS.some(k => t.includes(k));
    return `${[...t].length}자 · ${b}byte · 약 ${p}통${hasTok ? ' (자동 넣기 전 기준)' : ''}` +
      (p > 1 ? ' <span class="sx7-warn">· 한글 약 45자를 넘으면 여러 통으로 나뉘어 도착할 수 있습니다</span>' : '');
  },

  paintList(main) {
    const all = this.activeStudents(), cmap = this.classMap();
    const box = $('#sx7-list', main); if (box) box.innerHTML = this.listHtml(all, cmap);
    this.paintSel(main, all);
  },
  paintSel(main, all) {
    const box = $('#sx7-selbox', main); if (box) box.innerHTML = this.selHtml(all || this.activeStudents());
  },

  /* ---------- 받는 사람 목록 만들기 ---------- */
  build() {
    const cmap = this.classMap();
    const out = [], miss = [], seen = new Set();
    let dup = 0;
    this.activeStudents().filter(s => this.sel.has(s.id)).forEach(s => {
      const roles = this.to === 'student' ? [['학생', s.phone]] : this.to === 'parent' ? [['부모', s.parentPhone]] : [['학생', s.phone], ['부모', s.parentPhone]];
      const body = this.fill(this.text, s, cmap);
      roles.forEach(([role, p]) => {
        const d = this.digits(p);
        if (!d) { miss.push(`${s.name} (${role}) — 번호 없음`); return; }
        if (!this.okPhone(d)) { miss.push(`${s.name} (${role}) — 휴대폰 번호 형식 아님`); return; }
        const k = d + '\n' + body;                 // 같은 번호 + 같은 내용이면 한 번만
        if (seen.has(k)) { dup++; return; }
        seen.add(k);
        out.push({ sid: s.id, name: s.name.trim(), role, phone: d, text: body });
      });
    });
    return { out, miss, dup };
  },

  preview() {
    if (this.sending) return;
    if (!CFG.GAS_SMS_URL) { toast('문자 발송 주소(GAS_SMS_URL)가 설정되지 않았습니다'); return; }
    if (!this.sel.size) { toast('받는 사람을 선택하세요'); return; }
    if (!this.text.trim()) { toast('보낼 내용을 입력하세요'); return; }
    const { out, miss, dup } = this.build();
    const totalParts = out.reduce((n, o) => n + this.parts(o.text), 0);
    const long = out.some(o => this.parts(o.text) > 1);
    const secs = out.length * 5;
    let body = `<div class="sx7-pv">
      <p style="margin:0 0 8px"><b>${out.length}건</b> 발송 (예상 약 ${totalParts}통)${out.length > 1 ? ` · 폰에서 모두 보내기까지 약 ${secs >= 60 ? Math.round(secs / 60) + '분' : secs + '초'}` : ''}</p>`;
    if (dup) body += `<p class="small soft" style="margin:0 0 6px">같은 번호에 같은 내용 ${dup}건은 한 번만 보냅니다.</p>`;
    if (long) body += `<p class="small sx7-warn" style="margin:0 0 6px">긴 문자는 여러 통으로 나뉘어 도착할 수 있습니다.</p>`;
    if (miss.length) body += `<div class="small" style="margin:8px 0 4px"><b class="sx7-no">제외 ${miss.length}건</b></div><div class="sx7-miss small">${miss.map(esc).join('<br>')}</div>`;
    if (out.length) {
      body += `<div class="small soft" style="margin:12px 0 4px">미리보기${out.length > 3 ? ' (처음 3건)' : ''}</div>` +
        out.slice(0, 3).map(o => `<div class="sx7-sample"><div class="small soft">${esc(o.name)} (${o.role}) · ${esc(fmtPhone(o.phone))}</div><div class="pre">${esc(o.text)}</div></div>`).join('');
    }
    body += '</div>';
    Modal.open({
      title: '문자 발송 확인', size: 'lg', autofocus: false, body,
      buttons: out.length
        ? [{ text: '취소' }, { text: `${out.length}건 발송`, cls: 'primary', primary: true, onClick: () => { this.send(out); } }]
        : [{ text: '닫기', cls: 'primary', primary: true }],
    });
  },

  async callGas(payload, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(CFG.GAS_SMS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      });
      return await r.json();
    } catch (e) {
      return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'network' };
    } finally { clearTimeout(timer); }
  },
  reasonText(d) {
    const r = d && d.reason;
    if (r === 'unauthorized') return '로그인 키가 유효하지 않습니다. 다시 로그인하세요';
    if (r === 'no_gateway') return 'GAS에 Username/Password가 입력되지 않았습니다';
    if (r === 'timeout') return '응답 시간 초과';
    if (r === 'network') return '네트워크 오류';
    return (d && (d.message || r)) || '알 수 없는 오류';
  },

  async send(items) {
    if (this.sending) return;
    const key = Auth.key();
    if (!key) { toast('로그인이 필요합니다'); return; }
    this.sending = true;
    if (App.page === 'sms') App.render();
    const multi = items.length > this.GAS_CHUNK;       // 여러 번 나눠 보낼 때만 건수 진행률 표시
    const bz = Busy.open('문자 발송 요청', multi ? { total: items.length, unit: '건', text: '폰 중계로 접수시키는 중…' } : { text: `${items.length}건을 폰 중계로 접수시키는 중…` });

    const batch = uid('SX7B');
    const rows = [];
    let stopMsg = '';
    for (let i = 0; i < items.length; i += this.GAS_CHUNK) {
      const part = items.slice(i, i + this.GAS_CHUNK);
      const d = await this.callGas({ key, action: 'send', items: part.map(o => ({ phone: o.phone, text: o.text })) }, 280000);
      if (!d || !d.ok || !Array.isArray(d.results)) {
        stopMsg = this.reasonText(d);
        if (d && (d.reason === 'timeout' || d.reason === 'network')) stopMsg += ' — 일부가 이미 발송되었을 수 있으니 폰의 문자 앱에서 확인하세요';
        break;
      }
      part.forEach((o, j) => {
        const r = d.results[j] || {};
        rows.push({
          batch, sid: o.sid, name: o.name, role: o.role,
          phone: r.phone || o.phone, body: o.text, gw: r.gw || '',
          state: r.state || 'failed', err: r.err || (r.gw ? '' : '응답 없음'),
        });
      });
      bz.set(rows.length);
    }

    bz.set(rows.length, '발송 기록 저장 중…');
    let logFail = false;
    for (let i = 0; i < rows.length; i += 500) {
      try {
        const r = await Store.rpc('mg77_sx7_add', { p_key: key, p_rows: rows.slice(i, i + 500) });
        if (!r.ok || !r.json || !r.json.ok) logFail = true;
      } catch (_) { logFail = true; }
    }

    bz.close();
    this.sending = false;
    const okN = rows.filter(r => r.state !== 'failed').length;
    const failN = rows.length - okN;
    const notSent = items.length - rows.length;
    let msg = `접수 ${okN}건` + (failN ? ` / 실패 ${failN}건` : '') + (notSent ? ` / 보내지 못함 ${notSent}건` : '');
    if (stopMsg) msg += `\n\n중단: ${stopMsg}`;
    if (logFail) msg += '\n\n발송 기록 저장에 실패했습니다. (문자 발송 자체와는 별개입니다)';
    if (rows.length) msg += '\n\n접수된 문자는 폰에서 차례로 발송됩니다. 결과는 발송 기록에서 확인하세요.';
    if (rows.length) { this.tab = 'log'; this.log = null; this.logTried = false; this.open = new Set([batch]); }
    if (App.page === 'sms') App.render();
    await alertDlg('문자 발송', msg);
  },

  /* ---------- 템플릿 ---------- */
  saveTpl() {
    if (!this.text.trim()) { toast('저장할 내용을 입력하세요'); return; }
    const cur = this.tplId ? Store.get('meta', this.tplId) : null;
    Modal.open({
      title: '템플릿 저장', size: 'sm',
      body: `<div class="small soft" style="margin-bottom:6px">템플릿 이름</div><input type="text" data-tn value="${esc(cur ? cur.name : '')}" style="width:100%" maxlength="40">`,
      buttons: [{ text: '취소' }, {
        text: '저장', cls: 'primary', primary: true, onClick: async (m) => {
          const name = $('[data-tn]', m.body).value.trim();
          if (!name) { toast('이름을 입력하세요'); return false; }
          const same = this.tpls().find(t => t.name === name);
          if (same && !await confirmDlg(`"${name}" 템플릿을 지금 내용으로 바꿀까요?`, '바꾸기')) return false;
          const rec = same ? Object.assign({}, same, { text: this.text, updatedAt: new Date().toISOString() })
            : { id: uid('SX7T'), kind: 'sx7_tpl', name, text: this.text, createdAt: new Date().toISOString() };
          Store.put('meta', rec);
          this.tplId = rec.id;
          toast('템플릿을 저장했습니다');
          if (App.page === 'sms') App.render();
        },
      }],
      onMount(body) {
        const i = $('[data-tn]', body);
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('[data-primary]', body.parentElement).click(); } });
      },
    });
  },
  async delTpl() {
    const t = this.tplId ? Store.get('meta', this.tplId) : null;
    if (!t) return;
    if (!await confirmDlg(`"${t.name}" 템플릿을 삭제할까요?`, '삭제', true)) return;
    Store.del('meta', t.id);
    this.tplId = '';
    App.render();
  },
  async loadTpl(id) {
    const t = id ? Store.get('meta', id) : null;
    if (t && this.text.trim() && this.text !== t.text && !await confirmDlg('지금 입력한 내용을 템플릿 내용으로 바꿀까요?', '바꾸기')) { App.render(); return; }
    this.tplId = t ? t.id : '';
    if (t) this.text = t.text;
    App.render();
  },

  /* ---------- 발송 기록 ---------- */
  logHtml() {
    if (!this.log) return `<div class="panel"><div class="empty">${this.logBusy ? '불러오는 중…' : '기록을 불러오지 못했습니다.'}</div></div>`;
    const groups = [], gmap = {};
    this.log.forEach(r => {
      let g = gmap[r.batch_id];
      if (!g) { g = gmap[r.batch_id] = { id: r.batch_id, at: r.created_at, rows: [] }; groups.push(g); }
      g.rows.push(r);
      if (r.created_at < g.at) g.at = r.created_at;
    });
    const waitN = this.log.filter(r => this.isWaiting(r.state) && r.gw_id).length;
    let h = `<div class="toolbar">
        <button class="btn sm" data-a="reload">새로고침</button>
        <button class="btn sm" data-a="check" ${waitN && !this.checking ? '' : 'disabled'}>${this.checking ? '상태 확인 중…' : '대기 중 상태 확인' + (waitN ? ` (${waitN})` : '')}</button>
        <span class="muted small">${groups.length}번 발송 · ${this.log.length}건${waitN ? ' · 대기 중인 문자는 자동으로 상태를 확인합니다' : ''}</span></div>`;
    if (!groups.length) return h + '<div class="panel"><div class="empty">발송 기록이 없습니다.</div></div>';
    h += '<div class="panel sx7-log">' + groups.map(g => {
      const rows = g.rows.slice().sort((a, b) => a.id - b.id);
      const ok = rows.filter(r => r.state === 'sent' || r.state === 'delivered').length;
      const fail = rows.filter(r => r.state === 'failed').length;
      const wait = rows.length - ok - fail;
      const sameBody = rows.every(r => r.body === rows[0].body);
      const opened = this.open.has(g.id);
      let x = `<div class="sx7-g ${opened ? 'on' : ''}">
        <div class="sx7-gh" data-g="${esc(g.id)}">
          <span class="sx7-when small soft">${esc(this.fmtTime(g.at))}</span>
          <span class="sx7-gb">${esc(firstLine(rows[0].body).slice(0, 60))}${sameBody ? '' : ' <span class="muted small">(학생마다 다름)</span>'}</span>
          <span class="sx7-gc">${rows.length}건 ${ok ? `<span class="badge green">성공 ${ok}</span>` : ''}${wait ? `<span class="badge orange">대기 ${wait}</span>` : ''}${fail ? `<span class="badge red">실패 ${fail}</span>` : ''}</span>
          <span class="sx7-ar">${opened ? '▲' : '▼'}</span>
        </div>`;
      if (opened) {
        x += `<div class="sx7-gd">${sameBody ? `<div class="pre small sx7-body">${esc(rows[0].body)}</div>` : ''}
          <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>이름</th><th>구분</th><th>번호</th><th>상태</th>${sameBody ? '' : '<th>내용</th>'}<th>비고</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td class="nowrap">${esc(r.to_name || '')}</td><td class="nowrap">${esc(r.to_role || '')}</td><td class="nowrap">${esc(this.showPhone(r.phone))}</td>
            <td class="nowrap">${this.stateBadge(r.state)}</td>${sameBody ? '' : `<td class="pre small">${esc(r.body)}</td>`}<td class="small soft">${esc(r.err || '')}</td></tr>`).join('')}
          </tbody></table></div></div>`;
      }
      return x + '</div>';
    }).join('') + '</div>';
    if (this.logMore) h += `<div style="text-align:center;margin-top:12px"><button class="btn sm" data-a="more" ${this.logBusy ? 'disabled' : ''}>이전 기록 더 보기</button></div>`;
    return h;
  },

  async loadLog(more) {
    const key = Auth.key();
    if (!key || this.logBusy) return;
    this.logBusy = true;
    this.logTried = true;
    if (!more) this.log = null;
    if (App.page === 'sms' && this.tab === 'log') App.render();
    try {
      const before = more && this.log && this.log.length ? Math.min(...this.log.map(r => r.id)) : null;
      const r = await Store.rpc('mg77_sx7_list', { p_key: key, p_limit: this.PAGE, p_before: before });
      if (r.ok && r.json && r.json.ok) {
        const rows = r.json.rows || [];
        this.log = more && this.log ? this.log.concat(rows) : rows;
        this.logMore = rows.length >= this.PAGE;
      } else {
        toast(isUnauthorized(r) ? '로그인 키가 유효하지 않습니다. 다시 로그인하세요' : '기록을 불러오지 못했습니다');
        if (!more) this.log = null;
      }
    } catch (_) {
      toast('기록을 불러오지 못했습니다: 네트워크 오류');
    }
    this.logBusy = false;
    if (App.page === 'sms' && this.tab === 'log') App.render();
  },

  // 대기 중(pending/processed)인 최근 3일 문자의 상태를 확인해 기록에 반영
  async checkStatus(silent) {
    const key = Auth.key();
    if (!key || !this.log || this.checking) return;
    const since = Date.now() - 3 * 86400000;
    const targets = this.log.filter(r => this.isWaiting(r.state) && r.gw_id && new Date(r.created_at).getTime() >= since).slice(0, 300);
    if (!targets.length) { if (!silent) toast('확인할 대기 문자가 없습니다'); return; }
    this.checking = true;
    if (App.page === 'sms' && this.tab === 'log') App.render();
    const d = await this.callGas({ key, action: 'status', ids: targets.map(r => r.gw_id) }, 120000);
    if (d && d.ok && Array.isArray(d.results)) {
      const upd = [];
      targets.forEach((r, i) => {
        const x = d.results[i];
        if (!x || !x.state) return;
        if (x.state !== r.state || (x.err || '') !== (r.err || '')) upd.push({ id: r.id, state: x.state, err: x.err || '' });
      });
      if (upd.length) {
        try {
          const res = await Store.rpc('mg77_sx7_set', { p_key: key, p_rows: upd });
          if (res.ok && res.json && res.json.ok) {
            const m = {}; upd.forEach(u => { m[u.id] = u; });
            this.log.forEach(r => { const u = m[r.id]; if (u) { r.state = u.state; r.err = u.err; } });
          } else if (!silent) toast('상태 저장에 실패했습니다');
        } catch (_) { if (!silent) toast('상태 저장에 실패했습니다'); }
      }
      if (!silent) toast(upd.length ? `상태 ${upd.length}건이 바뀌었습니다` : '바뀐 상태가 없습니다');
    } else if (!silent) toast('상태 확인 실패: ' + this.reasonText(d));
    this.checking = false;
    if (App.page === 'sms' && this.tab === 'log') App.render();
  },

  // 기록 화면에 있는 동안 대기 문자가 있으면 20초마다 자동 확인
  scheduleCheck() {
    clearTimeout(this._t); this._t = null;
    if (!this.log || this.checking) return;
    const since = Date.now() - 3 * 86400000;
    if (!this.log.some(r => this.isWaiting(r.state) && r.gw_id && new Date(r.created_at).getTime() >= since)) return;
    this._t = setTimeout(() => {
      this._t = null;
      if (App.page !== 'sms' || this.tab !== 'log' || document.visibilityState !== 'visible') { if (App.page === 'sms' && this.tab === 'log') this.scheduleCheck(); return; }
      this.checkStatus(true);
    }, 20000);
  },

  /* ---------- 이벤트 ---------- */
  bind(main) {
    main.onclick = (e) => {
      const tb = e.target.closest('[data-tab]');
      if (tb) { this.tab = tb.dataset.tab; App.render(); return; }

      const un = e.target.closest('[data-unsel]');
      if (un) { e.preventDefault(); this.sel.delete(un.dataset.unsel); const cb = $(`[data-sid="${un.dataset.unsel}"]`, main); if (cb) cb.checked = false; this.paintSel(main); return; }

      const ins = e.target.closest('[data-ins]');
      if (ins) {
        const ta = $('[data-text]', main), tok = ins.dataset.ins;
        const s = ta.selectionStart ?? ta.value.length, en = ta.selectionEnd ?? ta.value.length;
        ta.value = ta.value.slice(0, s) + tok + ta.value.slice(en);
        ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length;
        this.text = ta.value;
        $('#sx7-cnt', main).innerHTML = this.cntHtml();
        return;
      }

      const g = e.target.closest('[data-g]');
      if (g) { const id = g.dataset.g; if (this.open.has(id)) this.open.delete(id); else this.open.add(id); App.render(); return; }

      const a = e.target.closest('[data-a]');
      if (!a || a.disabled) return;
      const k = a.dataset.a;
      if (k === 'selvis' || k === 'unselvis') {
        const vis = this.visible(this.activeStudents(), this.classMap());
        vis.forEach(s => { if (k === 'selvis') this.sel.add(s.id); else this.sel.delete(s.id); });
        $$('[data-sid]', main).forEach(cb => { cb.checked = this.sel.has(cb.dataset.sid); });
        this.paintSel(main);
      } else if (k === 'unselall') {
        this.sel.clear();
        $$('[data-sid]', main).forEach(cb => { cb.checked = false; });
        this.paintSel(main);
      } else if (k === 'preview') this.preview();
      else if (k === 'tplsave') this.saveTpl();
      else if (k === 'tpldel') this.delTpl();
      else if (k === 'reload') this.loadLog(false);
      else if (k === 'more') this.loadLog(true);
      else if (k === 'check') this.checkStatus(false);
    };
    main.onchange = (e) => {
      const t = e.target;
      if (t.matches('[data-sid]')) { if (t.checked) this.sel.add(t.dataset.sid); else this.sel.delete(t.dataset.sid); this.paintSel(main); }
      else if (t.matches('[data-clssel]')) { this.cls = t.value; this.paintList(main); }
      else if (t.matches('[data-to]')) this.to = t.dataset.to;
      else if (t.matches('[data-tpl]')) this.loadTpl(t.value);
    };
    main.oninput = (e) => {
      const t = e.target;
      if (t.matches('[data-text]')) { this.text = t.value; const c = $('#sx7-cnt', main); if (c) c.innerHTML = this.cntHtml(); }
      else if (t.matches('[data-q]')) { this.q = t.value; this.paintList(main); }
    };
  },
};

/* ---------- 문자 탭 전용 스타일 (sx7- 접두사) ---------- */
(function () {
  if (document.getElementById('mg77-sx7-style')) return;
  const st = document.createElement('style');
  st.id = 'mg77-sx7-style';
  st.textContent = `
.sx7-grid { align-items: start; }
.sx7-list { max-height: 420px; overflow-y: auto; border: 1px solid var(--line); border-radius: 8px; padding: 2px 8px; }
.sx7-st { display: flex; align-items: center; gap: 10px; padding: 7px 2px; border-bottom: 1px dashed var(--line); cursor: pointer; user-select: none; }
.sx7-st:last-child { border-bottom: 0; }
.sx7-st:hover { background: var(--accent-soft); }
.sx7-st input { width: 17px; height: 17px; accent-color: var(--accent); flex: none; }
.sx7-nm { flex: 1; min-width: 0; }
.sx7-cl { display: block; font-size: 12.5px; color: var(--ink-mute); }
.sx7-ph { display: flex; flex-direction: column; align-items: flex-end; color: var(--ink-soft); white-space: nowrap; }
.sx7-no { color: var(--danger); }
.sx7-warn { color: var(--warn); }
.sx7-selbox { margin-top: 10px; }
.sx7-clsbar { display: flex; align-items: center; margin-bottom: 10px; }
.sx7-clsbar select { min-width: 240px; }
.sx7-selhead { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.sx7-tags { display: flex; flex-wrap: wrap; gap: 5px; max-height: 110px; overflow-y: auto; }
.sx7-tagx { display: inline-flex; align-items: center; gap: 2px; background: var(--accent-soft); color: var(--accent-ink); border-radius: 12px; padding: 1px 4px 1px 10px; font-size: 13px; }
.sx7-tagx button { border: 0; background: transparent; color: var(--ink-mute); font-size: 11px; padding: 2px 5px; border-radius: 8px; }
.sx7-tagx button:hover { background: var(--danger-soft); color: var(--danger); }
.sx7-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.sx7-lb { width: 64px; flex: none; }
.sx7-miss { max-height: 120px; overflow-y: auto; background: var(--danger-soft); border-radius: 6px; padding: 6px 10px; }
.sx7-sample { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-top: 6px; background: #F9FCFE; }
.sx7-g { border-bottom: 1px solid var(--line); }
.sx7-g:last-child { border-bottom: 0; }
.sx7-gh { display: flex; align-items: center; gap: 12px; padding: 10px 4px; cursor: pointer; border-radius: 6px; }
.sx7-gh:hover { background: var(--accent-soft); }
.sx7-when { flex: none; width: 160px; }
.sx7-gb { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx7-gc { flex: none; display: inline-flex; gap: 4px; align-items: center; font-size: 13.5px; color: var(--ink-soft); }
.sx7-ar { flex: none; font-size: 10.5px; color: var(--ink-mute); }
.sx7-gd { padding: 0 4px 14px; }
.sx7-body { background: #F9FCFE; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
`;
  document.head.appendChild(st);
})();
