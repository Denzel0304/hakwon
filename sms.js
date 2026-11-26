/* =========================================================
   sms.js — 문자 (SMS Gateway for Android 경유, 내 폰으로 발송)
   프로그램 → GAS(CFG.GAS_SMS_URL, 로그인 키 확인) → SMS Gateway 클라우드 → 내 폰
   - 받는 사람: 재원생만 (반 선택 / 이름 검색 / 전체 목록 체크), 학생·부모님·둘 다
   - 템플릿(meta): id SX7T_…, { kind:'sx7_tpl', name, text, createdAt }
   - 발송 기록: Supabase mg77_sx7_log (mg77_sx7_add / mg77_sx7_list / mg77_sx7_del)
   - 발송 후 성공 여부는 추적하지 않음 (발송 단계에서 거절된 문자만 '실패'로 표시)
   - 신규생 탭: 아래 NewStu 참고
   ========================================================= */
const SmsPage = {
  tab: 'send',            // 'send' | 'new'(신규생) | 'log'
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
  del: new Set(),         // 삭제하려고 체크한 묶음(batch_id)
  deleting: false,

  TOKENS: ['{이름}', '{반}'],
  ACADEMY: '씬디쌤 잉글리쉬 영어학원',   // {학원} 버튼: 바꿔 넣는 자리표시가 아니라 이 글자를 그대로 넣음
  SURNAME2: ['남궁', '황보', '제갈', '선우', '독고', '사공', '서문', '동방', '어금', '망절', '장곡', '소봉', '공손'],   // 두 글자 성 (이름이 4글자 이상일 때만 적용)
  PAGE: 1000,             // 기록 한 번에 불러오는 줄 수
  GAS_CHUNK: 200,         // GAS 한 번 호출에 보내는 건수

  /* ---------- 공통 ---------- */
  digits(p) { return String(p || '').replace(/\D/g, ''); },
  okPhone(d) { return /^01[016789]\d{7,8}$/.test(d); },
  showPhone(p) { const d = this.digits(p); return fmtPhone(d.startsWith('82') ? '0' + d.slice(2) : d); },
  activeStudents() {
    return Store.all('students').filter(s => (s.status || 'active') === 'active' && (s.name || '').trim()).sort((a, b) => Students.sortFn(a, b));
  },
  activeClasses() { return Classes.sorted(Store.all('classes').filter(c => c.active !== false)); },   // 반 관리와 같은 순서 (요일 → 시간)
  // 학생ID → 지금 다니는 반 목록
  classMap() {
    const t = todayStr(), m = {};
    this.activeClasses().forEach(c => Classes.rosterAt(c.id, t).forEach(s => { (m[s.id] = m[s.id] || []).push(c); }));
    return m;
  },
  // 성 뺀 이름: 3글자 → 첫 글자 뺌 (홍길동 → 길동) · 4글자 이상 → 두 글자 성(남궁 등)이면 두 글자, 아니면 한 글자 뺌 (남궁민수 → 민수, 김고우리 → 고우리) · 2글자 이하 → 그대로
  givenName(n) {
    n = String(n || '').trim();
    if (n.length >= 4 && this.SURNAME2.includes(n.slice(0, 2))) return n.slice(2);
    return n.length >= 3 ? n.slice(1) : n;
  },
  // 이름 + 조사: 받침이 있으면 '이'를 붙여 부름 (윤성 → 윤성이를 · 윤성이에게 / 윤수 → 윤수를 · 윤수에게)
  //  - 조사 없이 {이름}만 → 윤성이 / 윤수
  //  - 부르는 말 아·야 → 윤성아 / 윤수야
  //  - 받침에 따라 모양이 바뀌는 조사는 받침 없는 형태로 맞춤 (을→를, 은→는, 과→와, 으로→로, 에요→예요, 었→였 …)
  //  - 직접 '이'를 붙여 쓴 경우({이름}이가, {이름}이랑)는 '이'가 두 번 붙지 않게 정리 · {이름}이 → 윤성이 / 윤수
  //  - 마지막 글자가 한글이 아니면 쓴 그대로
  nameWithJosa(name, rest) {
    const last = name.slice(-1), code = last.charCodeAt(0);
    if (!(code >= 0xAC00 && code <= 0xD7A3)) return name + rest;
    const batchim = (code - 0xAC00) % 28 !== 0;
    if (rest === '아' || rest === '야') return name + (batchim ? '아' : '야');
    if (rest.startsWith('이')) rest = rest.slice(1);
    const MAP = [['으로', '로'], ['에요', '예요'], ['을', '를'], ['은', '는'], ['과', '와'], ['었', '였']];
    for (const [a, b] of MAP) if (rest.startsWith(a)) { rest = b + rest.slice(a.length); break; }
    return name + (batchim ? '이' : '') + rest;
  },
  fill(text, s, cmap) {
    const cls = (cmap[s.id] || []).map(c => c.name).join(', ');
    const given = this.givenName(s.name);
    return text.replace(/\{이름\}([가-힣]*)/g, (m, rest) => this.nameWithJosa(given, rest))
      .split('{반}').join(cls);
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

  onLeave() {},

  // 보내기 · 신규생 · 발송 기록 탭을 제목줄 바로 아래에 고정, 신규생 탭은 설정 · 선택 처리 줄도 그 아래에 고정
  // (Lesson Plan stick()과 같은 방식 · 제목줄은 top:-26px로 고정됨 · 모바일은 제목줄이 없어 고정하지 않음)
  stick() {
    const main = $('#main');
    if (App.page !== 'sms' || !main) return;
    const ph = $('.page-head', main), tb = $('.sx7-tabs', main), tp = $('.nw-top', main);
    if (!ph || !tb || !ph.offsetHeight) return;
    const top = ph.offsetHeight - 26;
    tb.style.top = top + 'px';
    if (tp) tp.style.top = (top + tb.offsetHeight) + 'px';
  },

  /* ---------- 화면 ---------- */
  render(main) {
    let h = `<div class="page-head"><h1>SMS</h1>${this.tab === 'new' ? '<button type="button" class="btn sm" data-nwa="cfg" title="반마다 하지 않는 안내(교재 안내·첫 문자·첫 상담 안내·첫 상담)를 고릅니다">⚙ 설정</button>' : ''}</div>
      <div class="tabs sx7-tabs">${[['send', '보내기'], ['new', '신규생'], ['log', '발송 기록']].map(([k, t]) => `<button data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${t}</button>`).join('')}</div>`;
    if (!CFG.GAS_SMS_URL) h += `<div class="panel notice small" style="margin-bottom:14px">문자 발송 주소(GAS_SMS_URL)가 config.js에 설정되지 않았습니다.</div>`;
    if (this.tab === 'new') NewStu.sync();          // 신규생: 등록일·수강반이 바뀐 것을 할일에 먼저 반영
    h += this.tab === 'log' ? this.logHtml() : this.tab === 'new' ? NewStu.html() : this.sendHtml();
    main.innerHTML = h;
    this.stick();
    if (!this._stickOn) { this._stickOn = true; window.addEventListener('resize', debounce(() => this.stick(), 100)); }
    if (this.tab === 'new') { NewStu.bind(main); return; }
    this.bind(main);
    if (this.tab === 'log') this.paintDel(main);   // 전체 선택의 일부 선택(−) 표시
    if (this.tab === 'log' && !this.log && !this.logBusy && !this.logTried) this.loadLog(false);
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
      <div class="panel sx7-compose">
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
          ${this.TOKENS.map(t => `<button class="btn sm" data-ins="${t}">${t}</button>` + (t === '{이름}' ? `<button class="btn sm" data-ins="${esc(this.ACADEMY)}" title="${esc(this.ACADEMY)}">{학원}</button>` : '')).join('')}
        </div>
        <textarea data-text rows="9" placeholder="보낼 내용을 입력하세요. {이름} 등은 학생마다 바뀌어 들어갑니다.">${esc(this.text)}</textarea>
        <div class="small soft" id="sx7-cnt" style="margin-top:4px">${this.cntHtml()}</div>
        <p class="small muted" style="margin:6px 0 0">{이름} 성 뺀 이름 · 조사는 자동으로 맞춤 ({이름}를 → 윤성이를 / 윤수를) · {반} 다니는 반 이름</p>
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

  // opts: { stay: 발송 뒤 발송 기록 탭으로 옮기지 않음, onSent(rows): 접수 결과로 할 일 (신규생 완료 처리) }
  async send(items, opts) {
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
    if (rows.length) msg += '\n\n접수된 문자는 폰에서 차례로 발송됩니다. 보낸 내용은 발송 기록에서 확인하세요.';
    if (rows.length && opts && opts.onSent) { try { opts.onSent(rows); } catch (e) { console.warn('[mg77] 발송 후 처리 실패', e); } }
    if (rows.length && !(opts && opts.stay)) { this.tab = 'log'; this.log = null; this.logTried = false; this.open = new Set([batch]); }
    else if (rows.length) { this.log = null; this.logTried = false; }   // 발송 기록 탭을 열면 새로 불러오도록
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
    let h = `<div class="toolbar">
        <button class="btn sm" data-a="reload">새로고침</button>
        <button class="btn sm danger sx7-delbtn" data-a="del" ${this.delCnt() && !this.deleting ? '' : 'disabled'}>${this.delLabel()}</button>
        <label class="chk small"><input type="checkbox" data-gall ${groups.length && this.delCnt() === groups.length ? 'checked' : ''}>전체 선택</label>
        <span class="muted small">${groups.length}번 발송 · ${this.log.length}건</span></div>`;
    if (!groups.length) return h + '<div class="panel"><div class="empty">발송 기록이 없습니다.</div></div>';
    h += '<div class="panel sx7-log">' + groups.map(g => {
      const rows = g.rows.slice().sort((a, b) => a.id - b.id);
      const fail = rows.filter(r => r.state === 'failed').length;
      const sameBody = rows.every(r => r.body === rows[0].body);
      const opened = this.open.has(g.id);
      let x = `<div class="sx7-g ${opened ? 'on' : ''}">
        <div class="sx7-gh" data-g="${esc(g.id)}">
          <label class="sx7-gsel"><input type="checkbox" data-gsel="${esc(g.id)}" ${this.del.has(g.id) ? 'checked' : ''} aria-label="삭제 선택"></label>
          <span class="sx7-when small soft">${esc(this.fmtTime(g.at))}</span>
          <span class="sx7-gb">${esc(firstLine(rows[0].body).slice(0, 60))}${sameBody ? '' : ' <span class="muted small">(학생마다 다름)</span>'}</span>
          <span class="sx7-gc">${rows.length}건 ${fail ? `<span class="badge red">실패 ${fail}</span>` : ''}</span>
          <span class="sx7-ar">${opened ? '▲' : '▼'}</span>
        </div>`;
      if (opened) {
        x += `<div class="sx7-gd">${sameBody ? `<div class="pre small sx7-body">${esc(rows[0].body)}</div>` : ''}
          <div class="tbl-wrap"><table class="tbl compact"><thead><tr><th>이름</th><th>구분</th><th>번호</th>${sameBody ? '' : '<th>내용</th>'}<th>비고</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td class="nowrap">${esc(r.to_name || '')}</td><td class="nowrap">${esc(r.to_role || '')}</td><td class="nowrap">${esc(this.showPhone(r.phone))}</td>
            ${sameBody ? '' : `<td class="pre small">${esc(r.body)}</td>`}<td class="small soft">${r.state === 'failed' ? '<span class="badge red">실패</span> ' : ''}${esc(r.state === 'failed' ? (r.err || '') : '')}</td></tr>`).join('')}
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
    if (!more) { this.log = null; this.del.clear(); }
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

  /* ---------- 발송 기록 삭제 ---------- */
  batchIds() { return this.log ? [...new Set(this.log.map(r => r.batch_id))] : []; },
  delCnt() { const ids = new Set(this.batchIds()); return [...this.del].filter(id => ids.has(id)).length; },
  delLabel() { const n = this.delCnt(); return this.deleting ? '삭제 중…' : '삭제' + (n ? ` (${n})` : ''); },
  // 다시 그리지 않고 삭제 버튼·전체 선택 상태만 갱신
  paintDel(main) {
    const n = this.delCnt(), all = this.batchIds().length;
    const b = $('[data-a="del"]', main);
    if (b) { b.disabled = !n || this.deleting; b.textContent = this.delLabel(); }
    const ga = $('[data-gall]', main);
    if (ga) { ga.checked = !!all && n === all; ga.indeterminate = n > 0 && n < all; }
  },
  async delLog() {
    const key = Auth.key();
    if (!key) { toast('로그인이 필요합니다'); return; }
    if (this.deleting || !this.log) return;
    const exist = new Set(this.batchIds());
    const ids = [...this.del].filter(id => exist.has(id));
    if (!ids.length) return;
    const set = new Set(ids);
    const rowN = this.log.filter(r => set.has(r.batch_id)).length;
    if (!await confirmDlg(`${ids.length}번 발송(총 ${rowN}건)의 기록을 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`, '삭제', true)) return;
    this.deleting = true;
    if (App.page === 'sms' && this.tab === 'log') App.render();
    let n = 0, fail = false;
    for (let i = 0; i < ids.length; i += 500) {
      try {
        const r = await Store.rpc('mg77_sx7_del', { p_key: key, p_batches: ids.slice(i, i + 500) });
        if (r.ok && r.json && r.json.ok) n += r.json.n || 0;
        else { fail = true; if (isUnauthorized(r)) toast('로그인 키가 유효하지 않습니다. 다시 로그인하세요'); break; }
      } catch (_) { fail = true; break; }
    }
    this.deleting = false;
    if (fail) {
      if (!n) toast('기록을 삭제하지 못했습니다');
      this.loadLog(false);        // 일부만 지워졌을 수 있으니 서버 기준으로 다시 불러옴
      return;
    }
    this.log = this.log.filter(r => !set.has(r.batch_id));
    ids.forEach(id => { this.del.delete(id); this.open.delete(id); });
    toast(`발송 기록 ${n}건을 삭제했습니다`);
    if (App.page === 'sms' && this.tab === 'log') App.render();
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

      if (e.target.closest('.sx7-gsel')) return;          // 체크박스 칸은 묶음을 펼치지 않음
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
      else if (k === 'del') this.delLog();
    };
    main.onchange = (e) => {
      const t = e.target;
      if (t.matches('[data-sid]')) { if (t.checked) this.sel.add(t.dataset.sid); else this.sel.delete(t.dataset.sid); this.paintSel(main); }
      else if (t.matches('[data-clssel]')) { this.cls = t.value; this.paintList(main); }
      else if (t.matches('[data-to]')) this.to = t.dataset.to;
      else if (t.matches('[data-tpl]')) this.loadTpl(t.value);
      else if (t.matches('[data-gsel]')) { if (t.checked) this.del.add(t.dataset.gsel); else this.del.delete(t.dataset.gsel); this.paintDel(main); }
      else if (t.matches('[data-gall]')) {
        const on = t.checked;
        this.del.clear();
        if (on) this.batchIds().forEach(id => this.del.add(id));
        $$('[data-gsel]', main).forEach(cb => { cb.checked = on; });
        this.paintDel(main);
      }
    };
    main.oninput = (e) => {
      const t = e.target;
      if (t.matches('[data-text]')) { this.text = t.value; const c = $('#sx7-cnt', main); if (c) c.innerHTML = this.cntHtml(); }
      else if (t.matches('[data-q]')) { this.q = t.value; this.paintList(main); }
    };
  },
};

/* =========================================================
   신규생 탭 (SMS 페이지) — 반별로 교재 안내 · 첫 문자 · 첫 상담 안내 처리 현황을 보고 완료 체크 · 문자 발송
   - 문자는 무조건 부모님 번호로 보낸다 (교재 안내는 카톡으로 하므로 완료 체크만)
   - 학생 기록 meta NW_학생ID { kind:'nw', studentId, plan(할일 일정 등록), bookDays(교재 안내 N일 전, null = 생략),
                                made:{ book, first, cns }(할일을 만든 적 있음), dates:{ … }(만들 때·옮길 때 정한 날짜),
                                done:{ … }(완료 시각 ISO, '' = 미완료), skip:{ book, first, cns }(필요없음), first(첫 등원일),
                                cls(첫 수업 반 id — 반 제외 판단 기준), key(일정 계산값 — 바뀌면 할일을 옮김), createdAt }
   - 설정 meta NWCFG { kind:'nw_cfg', tplFirst, tplCns(보내기 탭 템플릿 id), bookDays(확인창 기본 N일),
                       off:{ book:[반ID], first:[…], cns:[…] }(⚙ 설정에서 그 단계를 하지 않는 반 → '제외') }
   - 필요없음: 선택바에서 처리 (아직 안 한 할일은 지움) · 칩을 누르면 미완료로 되돌림
   - 전체 반 보기에서는 4종이 모두 끝난(완료·필요없음·제외) 반을 숨김
   - 할일 id TDN_학생ID_book / _first / _cns (nwKey 학생ID, nwStep 단계) · 중요도 높음 · "[반 이름] 홍길동 교재 안내 문자 (12/2 등원예정)"
     · 교재 안내: 첫 수업일 N일 전 (이미 지났으면 오늘) — 수업이 이미 시작된 학생도 확인창에서 고르면 오늘로 만듦
     · 첫 문자: 첫 수업 다음날 (주말·공휴일이면 다음 평일 → 금요일 첫 수업은 월요일)
     · 첫 상담 안내: (주당 수업 요일 수 × 2)회 수업을 마친 다음날 (주말·공휴일이면 다음 평일, 공휴일은 횟수에서 뺌)
   - 완료 상태: 할일이 있으면 할일의 완료를 따르고(할일 목록에서 체크해도 반영), 없으면 기록(done)을 따른다.
     탭에서 체크하면 할일과 기록을 함께 바꾼다.
   - 등원 예정일(첫 수업일)·수강반이 바뀌어 일정이 달라지면 → 아직 안 한 할일을 모두 새 날짜로 옮김
   - 첫 등원 전에 등원 예정이 없어짐(수강반 삭제·퇴원 등) 또는 학생 완전 삭제 → 할일 모두 삭제
     (등원 예정이 없어진 경우 반을 다시 정하면 새로 만듦) · 첫 등원 뒤 퇴원·휴원 → 아직 안 한 할일만 삭제
   - 직접 지운 할일은 다시 만들지 않음
   - 첫 상담(meet): 실제 상담을 마쳤는지 완료 체크만 (할일·예정 등록·필요없음·문자 없음) · ⚙ 설정에서 반 제외 가능
   ========================================================= */
const NewStu = {
  KEYS: ['book', 'first', 'cns', 'meet'],
  LABEL: { book: '교재 안내', first: '첫 문자', cns: '첫 상담 안내', meet: '첫 상담' },
  CHECK_ONLY: ['meet'],     // 완료 체크만 하는 단계 (할일을 만들지 않음 · 예정 등록 · 필요없음 · 문자 없음)
  TODO_TXT: { book: '교재 안내 문자', first: '첫 수업 후 문자', cns: '첫 상담 안내 문자' },
  CFG_ID: 'NWCFG',
  COUNT_DAYS: 180,          // 상담 안내 날짜를 찾는 범위 (첫 수업 뒤 며칠까지)
  cls: '',                  // 반 필터 ('' = 전체)
  q: '',                    // 이름 검색
  todo: true,               // 미완료만 보기
  sel: new Set(),           // 선택한 학생 ID
  step: 'book',             // 선택바에서 고른 단계
  bdate: '',                // 선택바 날짜 ('' = 오늘)

  /* ---------- 기록 ---------- */
  mid(sid) { return 'NW_' + sid; },
  tid(sid, k) { return 'TDN_' + sid + '_' + k; },
  cfg() { return Object.assign({ tplFirst: '', tplCns: '', bookDays: 3 }, Store.get('meta', this.CFG_ID) || {}); },
  setCfg(o) { Store.put('meta', Object.assign({ id: this.CFG_ID, kind: 'nw_cfg', createdAt: new Date().toISOString() }, Store.get('meta', this.CFG_ID) || {}, o)); },
  rec(sid) {
    const m = Store.get('meta', this.mid(sid));
    const z = () => ({ book: '', first: '', cns: '', meet: '' });
    return Object.assign({ id: this.mid(sid), kind: 'nw', studentId: sid, plan: false, bookDays: null, first: '', cls: '', key: '', createdAt: new Date().toISOString() }, m || {},
      { made: Object.assign({ book: false, first: false, cns: false, meet: false }, (m && m.made) || {}), dates: Object.assign(z(), (m && m.dates) || {}),
        done: Object.assign(z(), (m && m.done) || {}), skip: Object.assign({ book: false, first: false, cns: false, meet: false }, (m && m.skip) || {}) });
  },
  // 단계 상태 { done, at(완료 시각), date(할일 날짜), skip(필요없음), ex(반 제외), todo }
  state(sid, k) {
    const m = Store.get('meta', this.mid(sid)), t = Store.get('todos', this.tid(sid, k));
    if (t && (t.done || !this.isEx(sid, k))) return { done: !!t.done, at: t.doneAt || '', date: t.date || '', skip: false, ex: false, todo: t };
    const at = (m && m.done && m.done[k]) || '';
    if (at) return { done: true, at, date: '', skip: false, ex: false, todo: t || null };
    if (m && m.skip && m.skip[k]) return { done: true, at: '', date: '', skip: true, ex: false, todo: null };
    if (this.isEx(sid, k)) return { done: true, at: '', date: '', skip: false, ex: true, todo: null };
    return { done: false, at: '', date: '', skip: false, ex: false, todo: null };
  },
  /* ---------- 반 제외 (⚙ 설정) ---------- */
  isExCls(cid, k) { const o = this.cfg().off || {}; return (o[k] || []).includes(cid); },
  // 제외 판단 기준 반: 첫 수업 반(기록) → 지금 다니는 반 → 다닐 예정인 반 (화면 그릴 때마다 groups()에서 캐시를 비움)
  baseCls(sid) {
    if (this._bc && this._bc.has(sid)) return this._bc.get(sid);
    const m = Store.get('meta', this.mid(sid));
    let c = m && m.cls ? Store.get('classes', m.cls) : null;
    if (!c) { const cur = Students.activeClassesOf(sid); c = cur.length ? Classes.sorted(cur)[0] : null; }
    if (!c) { const up = Students.upcomingClassesOf(sid); c = up.length ? up[0].c : null; }
    if (this._bc) this._bc.set(sid, c || null);
    return c || null;
  },
  isEx(sid, k) { const c = this.baseCls(sid); return !!c && this.isExCls(c.id, k); },
  cfgDlg() {
    const all = SmsPage.activeClasses(), cur = this.cfg().off || {}, sets = {};
    this.KEYS.forEach(k => { sets[k] = new Set(cur[k] || []); });
    Modal.open({
      title: '신규생 설정', size: 'md', autofocus: false,
      body: `<p class="small muted" style="margin-top:0">반마다 하는 안내만 체크하세요. 체크를 끈 단계는 그 반 학생에게 '제외'로 표시되고 할일을 만들지 않습니다. (아직 안 한 할일은 지우고, 이미 완료한 기록은 그대로 둡니다 · 두 반 이상 다니는 학생은 첫 수업 반을 따릅니다)</p>
        ${all.length ? `<div class="tbl-wrap"><table class="tbl compact nw-off"><thead><tr><th>반</th>${this.KEYS.map(k => `<th>${this.LABEL[k]}</th>`).join('')}</tr></thead><tbody>
          ${all.map(c => `<tr><td class="nowrap">${Classes.dot(c)}<b>${esc(c.name)}</b></td>${this.KEYS.map(k => `<td><input type="checkbox" name="nwo_${k}" value="${c.id}" ${sets[k].has(c.id) ? '' : 'checked'}></td>`).join('')}</tr>`).join('')}
        </tbody></table></div>` : '<div class="empty small">진행 중인 반이 없습니다.</div>'}`,
      buttons: [
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          const off = {};
          this.KEYS.forEach(k => {
            const on = new Set($$(`[name=nwo_${k}]:checked`, m.body).map(i => i.value));
            const keep = [...sets[k]].filter(id => !all.some(c => c.id === id));   // 종료된 반의 설정은 그대로
            off[k] = keep.concat(all.filter(c => !on.has(c.id)).map(c => c.id));
          });
          this.setCfg({ off, updatedAt: new Date().toISOString() });
          this.sync();
          toast('설정을 저장했습니다');
          App.render();
        } },
      ],
    });
  },
  allDone(sid) { return this.KEYS.every(k => this.state(sid, k).done); },

  /* ---------- 날짜 계산 ---------- */
  isOff(d, hol) { const w = dowOf(d); return w === 0 || w === 6 || Holidays.has(d, hol); },
  // d 다음날부터 처음 오는 평일 (주말·공휴일 건너뜀)
  nextWork(d, hol) { for (let i = 1; i <= 60; i++) { const x = addDaysStr(d, i); if (!this.isOff(x, hol)) return x; } return addDaysStr(d, 1); },
  // 학생의 일정 { c(첫 수업 반), first(첫 수업일), bookRaw(N일 전), book(지났으면 오늘), firstMsg, cns } (수강반이 없으면 null)
  calc(s, bookDays, hol, today) {
    const jd = Students.joinDateOf(s);
    if (!isYmd(jd) || typeof Makeups === 'undefined') return null;
    const fd = Students.firstDay(s.id, jd, hol);
    if (!fd) return null;
    const bookRaw = bookDays != null ? addDaysStr(fd.date, -Math.max(0, +bookDays || 0)) : '';
    const book = bookRaw && bookRaw < today ? today : bookRaw;
    // 주당 수업 요일 수 (첫 수업일부터 1주일)
    const per = new Set();
    for (let i = 0; i < 7; i++) { const d = addDaysStr(fd.date, i); if (Makeups.classesFor(s.id, d, true).length) per.add(dowOf(d)); }
    const need = Math.max(1, per.size) * 2;
    let cnt = 0, last = fd.date;
    for (let i = 0; i <= this.COUNT_DAYS && cnt < need; i++) {
      const d = addDaysStr(fd.date, i);
      if (Holidays.has(d, hol)) continue;
      if (Makeups.classesFor(s.id, d, true).length) { cnt++; last = d; }
    }
    return { c: fd.c, first: fd.date, bookRaw, book, firstMsg: this.nextWork(fd.date, hol), cns: this.nextWork(last, hol) };   // 마지막(2주치) 수업 다음날
  },
  textOf(k, c, s, first) {
    const d = k === 'book' && isYmd(first) ? parseYmd(first) : null;
    return `${c ? c.name + ' ' : ''}${s.name} ${this.TODO_TXT[k]}${d ? ` (${d.getMonth() + 1}/${d.getDate()} 등원예정)` : ''}`;
  },

  /* ---------- 할일 만들기 · 옮기기 · 정리 (Makeups.retSync에서 부름) ---------- */
  sync() {
    if (!Store.firstPullDone || !Auth.key()) return 0;
    const today = todayStr(), hol = Holidays.map(), iso = new Date().toISOString();
    let add = 0, chg = 0;
    Store.where('meta', m => m.kind === 'nw').forEach(m0 => {
      const sid = m0.studentId, s = Store.get('students', sid);
      const delAll = (undoneOnly) => this.KEYS.forEach(k => { const t = Store.get('todos', this.tid(sid, k)); if (t && !(undoneOnly && t.done)) { Store.del('todos', t.id); chg++; } });
      if (!s) { delAll(false); Store.del('meta', m0.id); return; }   // 완전 삭제 → 할일 모두 삭제
      const m = this.rec(sid), before = JSON.stringify(m);
      // 할일 목록에서 체크한 완료를 기록에도 남김 (할일을 나중에 지워도 완료가 유지되게)
      this.KEYS.forEach(k => { const t = Store.get('todos', this.tid(sid, k)); if (t && !!t.done !== !!m.done[k]) m.done[k] = t.done ? (t.doneAt || iso) : ''; });
      if (m.plan) {
        const live = (s.status || 'active') === 'active';
        const p = live ? this.calc(s, m.bookDays, hol, today) : null;
        if (!p) {
          if (!isYmd(m.first) || m.first > today) {                // 첫 등원 전에 등원 예정이 없어짐 → 할일 모두 삭제, 처음 상태로
            delAll(false);
            const z = () => ({ book: '', first: '', cns: '', meet: '' });
            Object.assign(m, { made: { book: false, first: false, cns: false, meet: false }, dates: z(), done: z(), first: '', cls: '', key: '' });
          } else delAll(true);                                    // 다니다가 퇴원·휴원 → 아직 안 한 할일만 삭제
        } else {
          const key = [p.first, p.bookRaw, p.firstMsg, p.cns].join('|');
          const changed = !!m.key && m.key !== key;              // 등원 예정일·수강반이 바뀌어 일정이 달라짐
          m.cls = p.c ? p.c.id : '';
          this.KEYS.forEach(k => {
            if (this.CHECK_ONLY.includes(k)) return;              // 첫 상담: 할일을 만들지 않음 (완료 체크만)
            const id = this.tid(sid, k), t = Store.get('todos', id);
            const want = k === 'book' ? p.book : k === 'first' ? p.firstMsg : p.cns, text = this.textOf(k, p.c, s, p.first);
            if (p.c && this.isExCls(p.c.id, k)) {                 // ⚙ 설정에서 이 반은 하지 않는 단계 → 아직 안 한 할일 삭제 (다시 켜면 새로 만듦)
              if (t && !t.done) { Store.del('todos', id); m.made[k] = false; chg++; }
              return;
            }
            if (!m.made[k]) {
              if (!want || m.done[k] || m.skip[k]) return;
              if (!t) {
                Store.put('todos', Object.assign({ id, lessonId: '', classId: '', date: want, text, done: false, createdAt: iso,
                  order: TodoX.maxOrder(want) + 1, doneAt: '', remindDone: false, nwKey: sid, nwStep: k }, TodoX.detailVals({ importance: 3 })));
                add++;
              }
              m.made[k] = true; m.dates[k] = want;
              return;
            }
            if (!t || t.done) return;                             // 직접 지운 할일 · 완료한 할일
            if (changed && want && t.date !== want && !t.nwManual) {   // 일정이 바뀜 → 새 날짜로 (직접 옮긴 할일도 함께 · 선택바에서 예정 등록한 할일은 그대로)
              Store.put('todos', Object.assign({}, t, { date: want, text, order: TodoX.maxOrder(want) + 1, remindDone: false }));
              m.dates[k] = want; chg++;
            } else if (t.text !== text) { Store.put('todos', Object.assign({}, t, { text })); chg++; }
          });
          m.first = p.first; m.key = key;
        }
      }
      if (JSON.stringify(m) !== before) Store.put('meta', m);
    });
    if (add) toast(`신규생 할일 ${add}개를 추가했습니다`);
    return add + chg;
  },

  /* ---------- 신규 등록 직후 확인창 (Students.openNew에서 부름) ---------- */
  ask(sid) {
    const s = Store.get('students', sid);
    if (!s) return;
    const today = todayStr(), hol = Holidays.map(), cfg = this.cfg(), n0 = +cfg.bookDays || 0;
    const p0 = this.calc(s, null, hol, today);
    const started = p0 && p0.first <= today;
    const bd = (v) => { const p = this.calc(s, v, hol, today); return p && p.book ? fmtDate(p.book) : '—'; };
    const row = (lb, v) => `<div class="nw-ask-r"><span class="soft">${lb}</span><b>${v}</b></div>`;
    const nIn = `첫 수업 <input type="number" data-nwn min="0" max="30" value="${n0}" style="width:64px"> 일 전`;
    let body = `<p class="confirm-msg" style="margin-top:0">${esc(s.name)} 학생의 신규생 문자 일정을 할일에 등록할까요?</p>`;
    if (!p0) body += `<div class="small soft">수강반이 없어 날짜를 아직 정할 수 없습니다. 수강반을 정하면 할일이 만들어집니다.</div>
      <div class="nw-ask-r" style="margin-top:8px"><span class="soft">교재 안내</span><span>${nIn}</span></div>`;
    else {
      body += row('첫 수업', `${fmtDate(p0.first)}${p0.c ? ' · ' + esc(p0.c.name) : ''}`);
      body += started
        ? `<div class="nw-ask-r"><span class="soft">교재 안내</span><label class="chk"><input type="checkbox" data-nwbk checked> 할일 추가 → <b>${fmtDate(today)}</b></label></div>
           <div class="small muted" style="margin:2px 0 4px">수업이 이미 시작되었습니다. 교재 안내가 필요 없으면 체크를 푸세요.</div>`
        : `<div class="nw-ask-r"><span class="soft">교재 안내</span><span>${nIn} → <b data-nwbd>${bd(n0)}</b></span></div>`;
      body += row('첫 문자', fmtDate(p0.firstMsg)) + row('첫 상담 안내', fmtDate(p0.cns));
    }
    Modal.open({
      title: '신규생 일정 등록', size: 'sm', autofocus: false, body,
      onMount: (b) => { const i = $('[data-nwn]', b), o = $('[data-nwbd]', b); if (i && o) i.addEventListener('input', () => { o.textContent = bd(Math.max(0, +i.value || 0)); }); },
      buttons: [{ text: '안 함' }, { text: '등록', cls: 'primary', primary: true, onClick: (mm) => {
        const i = $('[data-nwn]', mm.body), bk = $('[data-nwbk]', mm.body);
        const n = i ? Math.max(0, Math.min(30, Math.round(+i.value || 0))) : n0;
        const useBook = bk ? bk.checked : true;
        const m = this.rec(sid);
        m.plan = true;
        m.bookDays = useBook ? n : null;
        m.skip.book = !useBook && !m.done.book;
        Store.put('meta', m);
        if (i) this.setCfg({ bookDays: n });                    // 다음 등록 때 기본값
        this.sync();
        toast('신규생 일정을 등록했습니다');
        App.render();
      } }],
    });
  },
  // 학생·수강반·반·공휴일이 바뀌면 잠시 뒤 한 번 맞춘다 (연달아 바뀌는 동안은 기다림)
  soon() {
    clearTimeout(this._sT);
    this._sT = setTimeout(() => {
      try {
        if (!this.sync()) return;
        if (App.isEditingMain && App.isEditingMain()) App._needRender = true; else App.render();
      } catch (e) { console.warn('[mg77] 신규생 할일 처리 실패', e); }
    }, 800);
  },

  /* ---------- 완료 체크 ---------- */
  // day: 완료 날짜 (생략 · 오늘 = 지금 시각, 다른 날 = 그날 낮 12시)
  setDone(sid, k, v, day) {
    let iso = '';
    if (v) {
      if (isYmd(day) && day !== todayStr()) { const x = parseYmd(day); x.setHours(12); iso = x.toISOString(); }
      else iso = new Date().toISOString();
    }
    const t = Store.get('todos', this.tid(sid, k));
    if (t && !!t.done !== v) Store.put('todos', Object.assign({}, t, { done: v, doneAt: iso }));
    const m = this.rec(sid);
    m.done[k] = iso;
    if (!v) m.skip[k] = false;
    Store.put('meta', m);
  },
  // 예정 등록 (선택바): 할일을 그 날짜로 만들거나 옮김 · nwManual = 직접 정한 날짜 (등원일·수강반이 바뀌어도 자동으로 옮기지 않음)
  setPlan(sid, k, day) {
    const s = Store.get('students', sid);
    if (!s) return;
    const id = this.tid(sid, k), t = Store.get('todos', id), m = this.rec(sid);
    const upd = { date: day, done: false, doneAt: '', order: TodoX.maxOrder(day) + 1, remindDone: false, nwManual: true };
    if (t) Store.put('todos', Object.assign({}, t, upd));
    else Store.put('todos', Object.assign({ id, lessonId: '', classId: '', text: this.textOf(k, this.baseCls(sid), s, isYmd(m.first) ? m.first : ''),
      createdAt: new Date().toISOString(), nwKey: sid, nwStep: k }, upd, TodoX.detailVals({ importance: 3 })));
    m.made[k] = true; m.dates[k] = day; m.done[k] = ''; m.skip[k] = false;
    Store.put('meta', m);
  },
  // 필요없음: 아직 안 한 할일은 지움 (made를 풀어 두어 미완료로 되돌리면 할일을 다시 만듦)
  setNeed(sid, k) {
    const t = Store.get('todos', this.tid(sid, k));
    if (t && !t.done) Store.del('todos', t.id);
    const m = this.rec(sid);
    m.skip[k] = true; m.done[k] = ''; m.made[k] = false;
    Store.put('meta', m);
  },

  /* ---------- 화면 ---------- */
  // 반별 학생 (재원생 · 지금 다니거나 다닐 예정)
  groups() {
    const today = todayStr(), q = this.q.trim();
    this._bc = new Map();
    return SmsPage.activeClasses().filter(c => !this.cls || c.id === this.cls).map(c => {
      const seen = new Set();
      const list = Store.where('enrollments', e => e.classId === c.id && (!e.to || today < e.to))
        .map(e => Store.get('students', e.studentId)).filter(s => s && (s.status || 'active') === 'active' && (s.name || '').trim() && !seen.has(s.id) && seen.add(s.id))
        .sort((a, b) => Students.sortFn(a, b));
      return { c, all: list, fin: list.length > 0 && list.every(s => this.allDone(s.id)), list: list.filter(s => (!q || s.name.includes(q)) && (!this.todo || !this.allDone(s.id))) };
    });
  },
  chip(sid, k, today) {
    const st = this.state(sid, k);
    const md = (d) => { const x = parseYmd(d); return (x.getMonth() + 1) + '/' + x.getDate(); };
    let cls, txt;
    if (st.ex) return `<span class="nw-chip gray ex" title="⚙ 설정에서 이 반은 ${this.LABEL[k]}를 하지 않도록 했습니다">제외</span>`;
    if (st.skip) { cls = 'gray'; txt = '필요없음'; }
    else if (st.done) { cls = 'green'; txt = '✓ 완료' + (st.at ? ' ' + md(ymd(new Date(st.at))) : ''); }
    else if (st.date && st.date < today) { cls = 'red'; txt = '지남 ' + md(st.date); }
    else if (st.date === today) { cls = 'orange'; txt = '오늘'; }
    else if (st.date) { cls = 'blue'; txt = md(st.date) + ' 예정'; }
    else { cls = 'gray'; txt = '미완료'; }
    const send = (k !== 'book' && !this.CHECK_ONLY.includes(k) && !st.done) ? `<button type="button" class="btn sm nw-send" data-nwsend="${sid}|${k}" title="부모님께 ${this.LABEL[k]} 문자 보내기">보내기</button>` : '';
    return `<button type="button" class="nw-chip ${cls}" data-nwtg="${sid}|${k}" title="눌러서 ${st.done ? '미완료로' : '완료로'}">${txt}</button>${send}`;
  },
  html() {
    const cfg = this.cfg(), tpls = SmsPage.tpls(), today = todayStr();
    const tsel = (key, v) => `<select data-nwcfg="${key}" style="min-width:140px"><option value="">— 템플릿 선택 —</option>${tpls.map(t => `<option value="${t.id}" ${v === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
    const classes = SmsPage.activeClasses();
    if (this.cls && !classes.some(c => c.id === this.cls)) this.cls = '';
    const gs = this.groups();
    const alive = new Set(); gs.forEach(g => g.all.forEach(s => alive.add(s.id)));
    [...this.sel].forEach(id => { if (!alive.has(id)) this.sel.delete(id); });

    let h = `<div class="nw-top"><div class="panel nw-cfg">
        <div class="nw-cfg-r"><span class="soft small">첫 문자 템플릿</span>${tsel('tplFirst', cfg.tplFirst)}
          <span class="soft small">첫 상담 안내 템플릿</span>${tsel('tplCns', cfg.tplCns)}
          <span class="soft small">교재 안내 기본</span><span><input type="number" data-nwcfg="bookDays" min="0" max="30" value="${+cfg.bookDays || 0}" style="width:64px"> 일 전</span></div>
        <div class="small muted" style="margin-top:6px">문자는 부모님 번호로만 보냅니다. 템플릿은 보내기 탭에서 만들고 저장하세요. 교재 안내는 완료 체크만 합니다. 학생을 체크하면 여러 명을 한꺼번에 보내거나 완료 · 필요없음(안내할 필요 없는 학생)으로 처리할 수 있습니다.</div>
      </div>
      <div class="toolbar">
        <div class="sx7-clsbar" style="margin:0">${Classes.selDot(this.cls ? classes.find(c => c.id === this.cls) : null)}<select data-nwcls aria-label="반 선택"><option value="">전체 반</option>${classes.map(c => `<option value="${c.id}" ${this.cls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <input type="search" data-nwq value="${esc(this.q)}" placeholder="이름 검색" style="width:160px">
        <label class="chk small"><input type="checkbox" data-nwtodo ${this.todo ? 'checked' : ''}> 미완료만</label>
      </div>
      <div id="nw-selbar">${this.selBarHtml()}</div></div>`;
    return h + `<div id="nw-body">${this.bodyHtml(gs)}</div>`;
  },
  bodyHtml(gs) {
    const today = todayStr();
    gs = gs || this.groups();
    const hide = (g) => !this.cls && g.fin;                   // 전체 반: 4종(첫 상담 포함)이 모두 끝난 반은 숨김
    const shown = gs.filter(g => g.list.length && !hide(g));
    let h = '';
    if (!shown.length) return h + `<div class="panel"><div class="empty">${gs.some(g => g.all.length) ? (gs.every(g => !g.all.length || hide(g)) ? '모든 반의 안내가 끝났습니다.' : this.todo ? '처리할 학생이 없습니다. (모두 완료)' : '해당하는 학생이 없습니다.') : '재원생이 없습니다.'}</div></div>`;
    h += shown.map(g => {
      const n = g.all.length, cnt = (k) => g.all.filter(s => this.state(s.id, k).done).length;
      const allSel = g.list.every(s => this.sel.has(s.id));
      return `<div class="panel nw-cls">
        <div class="nw-ch">${Classes.selDot(g.c)}<b>${esc(g.c.name)}</b> <span class="small soft">${esc(Classes.timeLabel(g.c))}</span>
          <span class="nw-cnt small">${this.KEYS.map(k => `${this.LABEL[k]} <b class="${cnt(k) === n ? 'ok' : ''}">${cnt(k)}/${n}</b>`).join(' · ')}</span></div>
        <div class="tbl-wrap"><table class="tbl compact nw-tbl"><thead><tr>
          <th class="chk-th"><label class="chk-hit"><input type="checkbox" data-nwall="${g.c.id}" ${allSel ? 'checked' : ''} aria-label="반 전체 선택"></label></th>
          <th>이름</th><th>등록일</th>${this.KEYS.map(k => `<th>${this.LABEL[k]}</th>`).join('')}</tr></thead><tbody>
          ${g.list.map(s => {
            const jd = Students.joinDateOf(s);
            return `<tr><td class="chk-td"><label class="chk-hit"><input type="checkbox" data-nwsel="${s.id}" ${this.sel.has(s.id) ? 'checked' : ''}></label></td>
              <td class="nowrap"><b>${highlight(s.name, this.q.trim())}</b> <span class="tag">${esc(stTag(s))}</span>${this.parentOk(s) ? '' : ' <span class="badge red" title="부모님 번호가 없거나 휴대폰 번호가 아님">번호 없음</span>'}</td>
              <td class="nowrap small">${isYmd(jd) ? fmtDate(jd, false) : ''}${isYmd(jd) && jd > today ? ' <span class="badge orange">예정</span>' : ''}</td>
              ${this.KEYS.map(k => `<td class="nowrap">${this.chip(s.id, k, today)}</td>`).join('')}</tr>`;
          }).join('')}
        </tbody></table></div></div>`;
    }).join('');
    return h;
  },
  selBarHtml() {
    // 늘 자리를 차지하는 버튼 줄 (선택이 없으면 흐리게 · 비활성) — 학생 목록의 bulk-bar와 같은 방식
    // 단계(교재 안내 · 첫 문자 · 첫 상담 안내)를 고른 뒤 → 날짜 → 예정 등록 · 완료 처리 · 필요없음 · 문자 보내기
    const n = this.sel.size, dis = n ? '' : 'disabled', k = this.step;
    const co = this.CHECK_ONLY.includes(k), dis2 = n && !co ? '' : 'disabled';   // 첫 상담: 완료 처리만
    return `<div class="bulk-bar nw-selbar${n ? '' : ' off'}"><b>선택 ${n}명</b>
      <span class="att-seg nw-seg">${this.KEYS.map(x => `<button type="button" class="${x === k ? 'on' : ''}" data-nwstep="${x}">${this.LABEL[x]}</button>`).join('')}</span>
      <span class="soft small" style="margin-left:4px">날짜</span><input type="date" data-nwdate value="${esc(this.bdate || todayStr())}">
      <button class="btn sm" data-nwbulk="plan" ${dis2} title="${co ? this.LABEL[k] + '은 완료 처리만 합니다' : '고른 날짜를 예정일로 정하고 할일에 등록합니다'}">예정 등록</button>
      <button class="btn sm" data-nwbulk="done" ${dis} title="고른 날짜에 완료한 것으로 체크합니다">완료 처리</button>
      <button class="btn sm" data-nwbulk="need" ${dis2} title="${co ? this.LABEL[k] + '은 완료 처리만 합니다' : '안내할 필요가 없는 것으로 처리합니다 (날짜 없음)'}">필요없음</button>
      <button class="btn sm primary" data-nwbulk="send" ${n && k !== 'book' && !co && !SmsPage.sending ? '' : 'disabled'} title="${k === 'book' ? '교재 안내는 카톡으로 하므로 문자를 보내지 않습니다' : co ? this.LABEL[k] + '은 완료 처리만 합니다' : '부모님께 ' + this.LABEL[k] + ' 문자를 보냅니다 (오늘 완료)'}">문자 보내기</button>
      <span style="flex:1"></span><button class="btn sm ghost" data-nwbulk="clear" ${dis}>선택 해제</button></div>`;
  },
  parentOk(s) { return SmsPage.okPhone(SmsPage.digits(s.parentPhone)); },

  /* ---------- 문자 보내기 (미리보기 → 발송 → 자동 완료) ---------- */
  fillMap(list) {
    const cmap = SmsPage.classMap();
    list.forEach(s => { if (!cmap[s.id]) { const up = Students.upcomingClassesOf(s.id); if (up.length) cmap[s.id] = [up[0].c]; } });   // 수업 시작 전 학생은 다닐 반
    return cmap;
  },
  preview(sids, k) {
    if (SmsPage.sending) return;
    if (!CFG.GAS_SMS_URL) { toast('문자 발송 주소(GAS_SMS_URL)가 설정되지 않았습니다'); return; }
    const cfg = this.cfg(), tpl = Store.get('meta', k === 'first' ? cfg.tplFirst : cfg.tplCns);
    if (!tpl || !String(tpl.text || '').trim()) { toast(`위 설정에서 ${this.LABEL[k]} 템플릿을 고르세요`); return; }
    const list = sids.map(id => Store.get('students', id)).filter(s => s && (s.status || 'active') === 'active');
    const done = list.filter(s => this.state(s.id, k).done);
    const go = list.filter(s => !this.state(s.id, k).done);
    const cmap = this.fillMap(go), out = [], miss = [];
    go.forEach(s => {
      const d = SmsPage.digits(s.parentPhone);
      if (!d) { miss.push(`${s.name} — 부모님 번호 없음`); return; }
      if (!SmsPage.okPhone(d)) { miss.push(`${s.name} — 휴대폰 번호 형식 아님`); return; }
      out.push({ sid: s.id, name: s.name.trim(), role: '부모', phone: d, text: SmsPage.fill(tpl.text, s, cmap) });
    });
    const totalParts = out.reduce((n, o) => n + SmsPage.parts(o.text), 0);
    let body = `<div class="sx7-pv">
      <p style="margin:0 0 8px"><b>${esc(this.LABEL[k])}</b> · 템플릿 "${esc(tpl.name)}" · 부모님께 <b>${out.length}건</b> 발송 (예상 약 ${totalParts}통)</p>
      <p class="small soft" style="margin:0 0 6px">발송 접수가 되면 ${esc(this.LABEL[k])}를 자동으로 완료 처리합니다.</p>`;
    if (done.length) body += `<p class="small soft" style="margin:0 0 6px">이미 완료했거나 필요없음·제외인 ${done.length}명은 뺐습니다: ${esc(done.map(s => s.name).join(', '))}</p>`;
    if (out.some(o => SmsPage.parts(o.text) > 1)) body += `<p class="small sx7-warn" style="margin:0 0 6px">긴 문자는 여러 통으로 나뉘어 도착할 수 있습니다.</p>`;
    if (miss.length) body += `<div class="small" style="margin:8px 0 4px"><b class="sx7-no">제외 ${miss.length}건</b></div><div class="sx7-miss small">${miss.map(esc).join('<br>')}</div>`;
    if (out.length) body += `<div class="small soft" style="margin:12px 0 4px">미리보기${out.length > 3 ? ' (처음 3건)' : ''}</div>` +
      out.slice(0, 3).map(o => `<div class="sx7-sample"><div class="small soft">${esc(o.name)} (부모) · ${esc(fmtPhone(o.phone))}</div><div class="pre">${esc(o.text)}</div></div>`).join('');
    body += '</div>';
    Modal.open({
      title: `${this.LABEL[k]} 발송 확인`, size: 'lg', autofocus: false, body,
      buttons: out.length
        ? [{ text: '취소' }, { text: `${out.length}건 발송`, cls: 'primary', primary: true, onClick: () => {
          SmsPage.send(out, { stay: true, onSent: (rows) => {
            const ok = new Set(rows.filter(r => r.state !== 'failed').map(r => r.sid));
            ok.forEach(sid => { this.setDone(sid, k, true); this.sel.delete(sid); });
          } });
        } }]
        : [{ text: '닫기', cls: 'primary', primary: true }],
    });
  },

  async bulk(act) {
    const sids = [...this.sel], k = this.step;
    if (!sids.length) return;
    if (this.CHECK_ONLY.includes(k) && act !== 'done') return;   // 첫 상담: 완료 처리만
    if (act === 'send') { if (k !== 'book') this.preview(sids, k); return; }
    const day = this.bdate || todayStr();
    if ((act === 'plan' || act === 'done') && !isYmd(day)) { toast('날짜를 입력하세요'); return; }
    if (act === 'done' && day > todayStr()) { toast('완료 날짜는 오늘보다 뒤로 정할 수 없습니다'); return; }
    const todo = sids.filter(id => !this.state(id, k).done);
    if (act === 'plan') {
      if (!todo.length) { toast(`선택한 학생은 모두 ${this.LABEL[k]} 처리가 끝난 상태입니다`); return; }
      if (!await confirmDlg(`선택한 ${todo.length}명의 ${this.LABEL[k]} 예정일을 ${fmtDate(day)}로 정할까요?\n(할일 목록에도 등록합니다)`, '예정 등록')) return;
      todo.forEach(id => this.setPlan(id, k, day));
      toast(`${todo.length}명 ${this.LABEL[k]} 예정 등록`);
      this.sel.clear();   // 처리 후 체크 해제
      App.render();
      return;
    }
    if (act === 'need') {
      if (!todo.length) { toast(`선택한 학생은 모두 ${this.LABEL[k]} 처리가 끝난 상태입니다`); return; }
      if (!await confirmDlg(`선택한 ${todo.length}명의 ${this.LABEL[k]}를 필요없음으로 처리할까요?\n(아직 안 한 할일은 할일 목록에서 지웁니다)`, '필요없음 처리')) return;
      todo.forEach(id => this.setNeed(id, k));
      toast(`${todo.length}명 ${this.LABEL[k]} 필요없음`);
      this.sel.clear();
      App.render();
      return;
    }
    if (!todo.length) { toast(`선택한 학생은 모두 ${this.LABEL[k]} 완료 상태입니다`); return; }
    if (!await confirmDlg(`선택한 ${todo.length}명의 ${this.LABEL[k]}를 ${fmtDate(day)} 완료로 체크할까요?`, '완료 처리')) return;
    todo.forEach(id => this.setDone(id, k, true, day));
    toast(`${todo.length}명 ${this.LABEL[k]} 완료`);
    this.sel.clear();
    App.render();
  },

  /* ---------- 이벤트 ---------- */
  bind(main) {   // 위쪽 고정은 SmsPage.stick()에서 함
    main.onclick = (e) => {
      const tb = e.target.closest('[data-tab]');
      if (tb) { SmsPage.tab = tb.dataset.tab; App.render(); return; }
      if (e.target.closest('[data-nwa="cfg"]')) { this.cfgDlg(); return; }
      const tg = e.target.closest('[data-nwtg]');
      if (tg) {
        const [sid, k] = tg.dataset.nwtg.split('|'), v = !this.state(sid, k).done;
        this.setDone(sid, k, v);
        App.render();
        return;
      }
      const sd = e.target.closest('[data-nwsend]');
      if (sd) { const [sid, k] = sd.dataset.nwsend.split('|'); this.preview([sid], k); return; }
      const bk = e.target.closest('[data-nwbulk]');
      if (bk && !bk.disabled) {
        const act = bk.dataset.nwbulk;
        if (act === 'clear') { this.sel.clear(); App.render(); return; }
        this.bulk(act);
        return;
      }
      const sp = e.target.closest('[data-nwstep]');
      if (sp) { this.step = sp.dataset.nwstep; const b = $('#nw-selbar', main); if (b) b.innerHTML = this.selBarHtml(); }   // 선택바만 다시 그림
    };
    main.onchange = (e) => {
      const t = e.target;
      if (t.matches('[data-nwsel]')) { if (t.checked) this.sel.add(t.dataset.nwsel); else this.sel.delete(t.dataset.nwsel); App.render(); }
      else if (t.matches('[data-nwall]')) {
        const g = this.groups().find(x => x.c.id === t.dataset.nwall);
        if (g) g.list.forEach(s => { if (t.checked) this.sel.add(s.id); else this.sel.delete(s.id); });
        App.render();
      }
      else if (t.matches('[data-nwcls]')) { this.cls = t.value; App.render(); }
      else if (t.matches('[data-nwtodo]')) { this.todo = t.checked; App.render(); }
      else if (t.matches('[data-nwcfg]')) {
        const key = t.dataset.nwcfg;
        this.setCfg({ [key]: key === 'bookDays' ? Math.max(0, Math.min(30, Math.round(+t.value || 0))) : t.value });
        toast('설정을 저장했습니다');
      }
    };
    main.oninput = (e) => {
      const t = e.target;
      if (t.matches('[data-nwdate]')) { this.bdate = t.value; return; }   // 선택바 날짜 (다시 그리지 않음)
      if (t.matches('[data-nwq]')) { this.q = t.value; const b = $('#nw-body', main); if (b) b.innerHTML = this.bodyHtml(); }   // 검색칸은 다시 그리지 않음 (한글 입력 유지)
    };
  },
};

// 등원 예정(등록일·수강반)·학생·반·공휴일이 바뀌면 신규생 할일을 맞춘다 (books.js와 같은 방식)
['put', 'del'].forEach(fn => {
  const f0 = Store[fn];
  Store[fn] = function (t, ...a) {
    const r = f0.call(this, t, ...a);
    if (t === 'enrollments' || t === 'students' || t === 'classes' || t === 'events') NewStu.soon();
    return r;
  };
});

/* ---------- 문자 탭 전용 스타일 (sx7- 접두사) ---------- */
(function () {
  if (document.getElementById('mg77-sx7-style')) return;
  const st = document.createElement('style');
  st.id = 'mg77-sx7-style';
  st.textContent = `
.sx7-grid { align-items: stretch; }
.sx7-compose { display: flex; flex-direction: column; }
.sx7-compose textarea[data-text] { flex: 1 1 auto; }
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
.sx7-sample { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-top: 6px; background: var(--tint-2); }
.sx7-g { border-bottom: 1px solid var(--line); }
.sx7-g:last-child { border-bottom: 0; }
.sx7-gh { display: flex; align-items: center; gap: 12px; padding: 10px 4px; cursor: pointer; border-radius: 6px; }
.sx7-gh:hover { background: var(--accent-soft); }
.sx7-delbtn { min-width: 7.6em; text-align: center; font-variant-numeric: tabular-nums; }   /* "삭제 (999)"까지 넣어도 크기가 그대로 */
.sx7-gsel { display: flex; align-items: center; padding: 2px; margin: 0; cursor: pointer; flex: none; }
.sx7-gsel input { margin: 0; width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); }
.sx7-when { flex: none; width: 160px; }
.sx7-gb { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sx7-gc { flex: none; display: inline-flex; gap: 4px; align-items: center; font-size: 13.5px; color: var(--ink-soft); }
.sx7-ar { flex: none; font-size: 10.5px; color: var(--ink-mute); }
.sx7-gd { padding: 0 4px 14px; }
.sx7-body { background: var(--tint-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
/* 신규생 탭 (nw- 접두사) */
.nw-cfg { margin-bottom: 12px; }
.nw-cfg-r { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.nw-selbar { margin: 0; }
.nw-seg button { padding: 4px 10px; font: inherit; font-size: 13px; cursor: pointer; }
.nw-seg button.on { background: var(--accent); color: #fff; font-weight: 700; }
.nw-selbar input[type=date] { padding: 3px 6px; }
.sx7-tabs { position: sticky; top: 0; z-index: 19; background: var(--bg); padding-top: 4px; }
.nw-top { position: sticky; top: 0; z-index: 18; background: var(--bg); padding: 10px 0 12px; margin: -10px 0 12px; border-bottom: 1px solid var(--line); }
.nw-top .toolbar { margin-bottom: 10px; }
body.m-body .sx7-tabs { position: static; padding-top: 0; }
body.m-body .nw-top { position: static; border-bottom: 0; padding: 0; margin-top: 0; }   /* 모바일: 화면이 좁아 고정하지 않음 */
.nw-cls { margin-bottom: 12px; }
.nw-ch { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.nw-cnt { margin-left: auto; color: var(--ink-soft); }
.nw-cnt b.ok { color: var(--ok); }
.nw-tbl td { vertical-align: middle; }
.nw-tbl { table-layout: fixed; width: 100%; min-width: 860px; }                  /* 반마다 칸 위치를 같게 */
.nw-tbl th:nth-child(2) { width: 18%; } .nw-tbl th:nth-child(3) { width: 12%; } .nw-tbl th:nth-child(7) { width: 11%; }   /* 7번째 = 첫 상담 (칩만 있어 좁게) */
.nw-tbl td { overflow: hidden; text-overflow: ellipsis; }
.nw-chip { border: 0; border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.nw-chip.green { background: var(--ok-soft); color: var(--ok); }
.nw-chip.red { background: var(--danger-soft); color: var(--danger); }
.nw-chip.orange { background: var(--warn-soft); color: var(--warn); }
.nw-chip.blue { background: var(--surface); color: var(--accent-ink); box-shadow: inset 0 0 0 1px var(--accent); }   /* 예정: 흰 바탕 + 파란 테두리 (완료와 구분) */
.nw-chip.gray { background: #EEF2F5; color: var(--ink-soft); }
.nw-chip:hover { filter: brightness(0.95); }
.nw-chip.ex { display: inline-block; cursor: default; font-weight: 500; background: #F3F0FA; color: #7A6AA6; box-shadow: inset 0 0 0 1px #D9D1EE; }   /* 제외: 연보라 (설정으로 빠진 단계) */
.nw-chip.ex:hover { filter: none; }
.nw-off th, .nw-off td { text-align: center; }
.nw-off th:first-child, .nw-off td:first-child { text-align: left; }
.nw-off input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
.nw-send { margin-left: 6px; padding: 2px 9px; font-size: 12.5px; }
.nw-ask-r { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--line); }
.nw-ask-r > :first-child { flex: none; white-space: nowrap; }
.nw-ask-r > :last-child { text-align: right; }
.nw-ask-r input { padding: 3px 6px; }
`;
  document.head.appendChild(st);
})();
