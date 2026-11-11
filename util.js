/* =========================================================
   util.js — 공용 도구 (날짜, 표시, 모달, 토스트, 텍스트 상자)
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- 날짜 ---------- */
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];          // 월~일 표시 순서
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseYmd(s) { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function addDaysStr(s, n) { return ymd(addDays(parseYmd(s), n)); }
function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function todayStr() { return ymd(new Date()); }
function dowOf(s) { return parseYmd(s).getDay(); }
function isYmd(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
function fmtDate(s, withDow = true) {
  if (!isYmd(s)) return '';
  const d = parseYmd(s);
  return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + (withDow ? ' (' + DOW[d.getDay()] + ')' : '');
}
function fmtMD(s) {
  if (!isYmd(s)) return '';
  const d = parseYmd(s);
  return (d.getMonth() + 1) + '/' + d.getDate() + '(' + DOW[d.getDay()] + ')';
}
function toMin(hhmm) { if (!hhmm) return 0; const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); }
function fromMin(m) { m = Math.max(0, Math.min(24 * 60 - 1, m)); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
function nameTime(hhmm) {                          // 20:00 → 8시, 18:30 → 6시 30분
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return m ? h12 + '시 ' + m + '분' : h12 + '시';
}
function daysLabel(days) { return DAY_ORDER.filter(d => (days || []).includes(d)).map(d => DOW[d]).join(''); }

/* ---------- 문자열 ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function highlight(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const re = new RegExp('(' + esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return safe.replace(re, '<mark>$1</mark>');
}
function stripZws(s) { return (s || '').replace(/\u200b/g, ''); }
function firstLine(s) { const l = stripZws(s).split('\n').find(x => x.trim()); return l ? l.trim() : ''; }
function uid(p) {
  const a = new Uint8Array(10);
  crypto.getRandomValues(a);
  return p + '_' + Date.now().toString(36) + Array.from(a, b => (b % 36).toString(36)).join('');
}
function compactDate(s) { return String(s).replace(/-/g, ''); }
function stableStr(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(stableStr).join(',') + ']';
  return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableStr(o[k])).join(',') + '}';
}
function fmtPhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (d.length === 10) return d.startsWith('02') ? d.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3') : d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  if (d.length === 9 && d.startsWith('02')) return d.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
  return String(v || '').trim();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function ko(a, b) { return String(a || '').localeCompare(String(b || ''), 'ko'); }

/* ---------- 학년 / 학교 ---------- */
// 학년은 숫자로 저장: 4~6 초등, 7~9 중등(중1~중3), 10~12 고등(고1~고3)
const GRADES = [4, 5, 6, 7, 8, 9, 10, 11, 12];
function gradeLabel(g) {
  g = +g; if (!g) return '';
  if (g <= 6) return '초' + g;
  if (g <= 9) return '중' + (g - 6);
  return '고' + (g - 9);
}
function gradeNum(g) { g = +g; return g <= 6 ? g : g <= 9 ? g - 6 : g - 9; }
function isHigh(g) { return +g >= 10; }
function isMiddle(g) { return +g >= 7 && +g <= 9; }
function gradeOptions(sel, emptyText) {
  let h = emptyText != null ? `<option value="">${esc(emptyText)}</option>` : '';
  GRADES.forEach(g => { h += `<option value="${g}" ${+sel === g ? 'selected' : ''}>${gradeLabel(g)}</option>`; });
  return h;
}
function schoolShort(s) { return (s || '').trim().replace(/등학교$/, '').replace(/학교$/, ''); }
function schoolGradeLabel(school, grade) {      // 금천고1 / (학교 없음) 중1
  if (!grade && !school) return '';
  if (!school) return gradeLabel(grade);
  return schoolShort(school) + (grade ? gradeNum(grade) : '');
}
function stTag(st) { return st ? schoolGradeLabel(st.school, st.grade) : ''; }

/* ---------- 토스트 ---------- */
let _toastT = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- 뒤로가기로 떠 있는 창 닫기 ----------
   모달·설정창·작은 메뉴·펼친 목록 등 화면 위에 뜬 것이 하나라도 있으면 방문 기록을 '딱 한 칸'만 더 쌓아 둔다.
   뒤로가기 → 맨 위에 뜬 것 하나만 닫음 (아직 남아 있으면 다시 한 칸을 쌓음).
   모두 닫히면 그 한 칸을 지우므로, 메인 화면에서 뒤로가기 한 번이면 바로 사이트를 나간다. (기록이 계속 쌓이지 않음)
   사용: BackGuard.add(닫는함수) — 띄울 때 / BackGuard.remove(같은 함수) — 닫힐 때 (어떤 방법으로 닫히든) */
const BackGuard = {
  list: [],       // 지금 떠 있는 것들의 닫는 함수 (띄운 순서)
  armed: false,   // 우리가 쌓아 둔 기록 한 칸이 있는지
  skip: 0,        // 우리가 지운(history.back) 것 때문에 올 popstate 수
  add(fn) {
    if (typeof fn !== 'function' || this.list.includes(fn)) return fn;
    this.list.push(fn);
    this.sync();
    return fn;
  },
  remove(fn) {
    const i = this.list.indexOf(fn);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.sync();
  },
  sync() {
    if (this.skip) return;                          // 지우는 중이면 그 결과(popstate)를 받은 뒤 다시 맞춘다
    if (this.list.length && !this.armed) {
      try { history.pushState({ mgBack: 1 }, ''); this.armed = true; } catch (_) {}
    } else if (!this.list.length && this.armed) {
      this.armed = false;
      this.skip++;
      history.back();
    }
  },
};
window.addEventListener('popstate', () => {
  if (BackGuard.skip) { BackGuard.skip--; BackGuard.sync(); return; }
  BackGuard.armed = false;                          // 쌓아 둔 한 칸이 뒤로가기로 사용됨
  const fn = BackGuard.list[BackGuard.list.length - 1];
  if (fn) {
    try { fn(); } catch (e) { console.error(e); }
    BackGuard.remove(fn);                           // 닫는 함수가 스스로 빼지 않았을 때를 대비
    BackGuard.sync();                               // 아직 떠 있는 것이 있으면 한 칸을 다시 쌓음
  }
});
// 새로고침 등으로 쌓아 둔 한 칸이 남아 있으면 지워 둔다 (뒤로가기를 한 번 더 눌러야 나가는 일이 없게)
try { if (history.state && history.state.mgBack) { BackGuard.skip++; history.back(); } } catch (_) {}

/* ---------- 모달 ---------- */
const Modal = {
  stack: [],
  /* o = { title, body(html), size:'sm'|'lg'|'xl', buttons:[{text, cls, primary, left, onClick(m)}], onMount(body, m), onClose() }
     버튼 onClick이 false를 돌려주면 모달을 닫지 않는다. */
  open(o) {
    const wrap = document.createElement('div');
    wrap.className = 'mg-modal-wrap';
    wrap.innerHTML = `
      <div class="mg-modal ${o.size || ''}" role="dialog" aria-modal="true">
        <div class="mg-modal-head"><h3>${esc(o.title || '')}</h3><button class="mg-x" type="button" aria-label="닫기">✕</button></div>
        <div class="mg-modal-body">${o.body || ''}</div>
        <div class="mg-modal-foot"></div>
      </div>`;
    const m = { el: wrap, body: $('.mg-modal-body', wrap), foot: $('.mg-modal-foot', wrap), onClose: o.onClose, closed: false };
    m.close = () => Modal.close(m);
    $('.mg-x', wrap).addEventListener('click', () => m.close());
    // 모달 바깥(어두운 영역)을 누르면 닫기 (안에서 드래그하다 밖에서 놓은 경우는 제외)
    let downOut = false;
    wrap.addEventListener('mousedown', (e) => { downOut = e.target === wrap; });
    wrap.addEventListener('click', (e) => { if (downOut && e.target === wrap) m.close(); downOut = false; });
    (o.buttons || []).forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.cls || '') + (b.left ? ' left' : '');
      btn.textContent = b.text;
      if (b.primary) btn.dataset.primary = '1';
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          const r = b.onClick ? await b.onClick(m) : undefined;
          if (r !== false && !m.closed) m.close();
        } finally { btn.disabled = false; }
      });
      m.foot.appendChild(btn);
    });
    document.body.appendChild(wrap);
    this.stack.push(m);
    m._back = BackGuard.add(() => m.close());   // 뒤로가기 → 이 모달 닫기
    if (o.onMount) o.onMount(m.body, m);
    const f = $('input:not([type=hidden]):not([type=checkbox]):not([readonly]), textarea, select', m.body);
    if (f && o.autofocus !== false) setTimeout(() => f.focus(), 30);
    return m;
  },
  close(m) {
    if (!m || m.closed) return;
    m.closed = true;
    m.el.remove();
    const i = this.stack.indexOf(m);
    if (i >= 0) this.stack.splice(i, 1);
    BackGuard.remove(m._back);
    if (m.onClose) m.onClose();
    if (typeof App !== 'undefined') App.flushRender();
  },
  top() { return this.stack[this.stack.length - 1]; },
  closeAll() { [...this.stack].reverse().forEach(m => this.close(m)); },
};

function confirmDlg(msg, okText = '확인', danger = false) {
  return new Promise(res => {
    Modal.open({
      title: '확인', size: 'sm', autofocus: false,
      body: `<p class="confirm-msg">${esc(msg)}</p>`,
      buttons: [
        { text: '취소', onClick() { res(false); } },
        { text: okText, cls: danger ? 'danger' : 'primary', primary: true, onClick() { res(true); } },
      ],
      onClose() { res(false); },
    });
  });
}
async function confirmHard(msg) {
  if (!await confirmDlg(msg, '삭제', true)) return false;
  return confirmDlg('정말 완전히 삭제할까요?\n삭제하면 되돌릴 수 없습니다.', '완전 삭제', true);
}
function alertDlg(title, msg) {
  return new Promise(res => Modal.open({
    title, size: 'sm', autofocus: false, body: `<p class="confirm-msg">${esc(msg)}</p>`,
    buttons: [{ text: '확인', cls: 'primary', primary: true, onClick() { res(); } }], onClose() { res(); },
  }));
}

/* ---------- 작은 메뉴 (⋮) ---------- */
let _popEl = null, _popOutside = null;
function closePop() {
  if (_popEl) { _popEl.remove(); _popEl = null; }
  if (_popOutside) { document.removeEventListener('mousedown', _popOutside, true); _popOutside = null; }
  BackGuard.remove(closePop);
}
function popMenu(anchor, items) {
  closePop();
  const m = document.createElement('div');
  m.className = 'pop-menu';
  items.forEach(it => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pop-item' + (it.danger ? ' danger' : '');
    b.textContent = it.text;
    b.addEventListener('click', () => { closePop(); it.onClick(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, hgt = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
  m.style.top = (r.bottom + hgt + 8 > window.innerHeight ? r.top - hgt - 4 : r.bottom + 4) + 'px';
  _popEl = m;
  _popOutside = (e) => { if (!m.contains(e.target) && e.target !== anchor) closePop(); };
  setTimeout(() => document.addEventListener('mousedown', _popOutside, true), 0);
  BackGuard.add(closePop);   // 뒤로가기 → 메뉴 닫기
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _popEl) { e.stopPropagation(); closePop(); } }, true);
window.addEventListener('scroll', closePop, true);

/* ---------- 드롭다운 입력 (누르면 목록이 펼쳐짐) ---------- */
function schoolOptions() { return $$('#dl-schools option').map(o => o.value).filter(Boolean); }
function bindCombo(input, getOptions) {
  if (input._combo) return;
  input._combo = true;
  input.removeAttribute('list');
  const box = document.createElement('div');
  box.className = 'combo-box';
  let items = [], cur = -1;
  const hide = () => { box.remove(); cur = -1; document.removeEventListener('mousedown', outside, true); BackGuard.remove(hide); };
  const outside = (e) => { if (e.target !== input && !box.contains(e.target)) hide(); };
  const show = () => {
    if (!input.isConnected) { hide(); return; }
    const q = input.value.trim();
    const all = getOptions();
    items = q ? all.filter(o => o.includes(q)) : all;
    if (!items.length) { hide(); return; }
    box.innerHTML = items.map((o, i) => `<div class="combo-item ${i === cur ? 'on' : ''}" data-i="${i}">${esc(o)}</div>`).join('');
    const r = input.getBoundingClientRect();
    box.style.left = r.left + 'px';
    box.style.top = (r.bottom + 2) + 'px';
    box.style.minWidth = r.width + 'px';
    if (!box.isConnected) { document.body.appendChild(box); document.addEventListener('mousedown', outside, true); BackGuard.add(hide); }
  };
  let picking = false;
  const pick = (i) => {
    if (items[i] == null) return;
    input.value = items[i]; hide();
    picking = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    picking = false;
  };
  box.addEventListener('mousedown', (e) => { e.preventDefault(); const it = e.target.closest('[data-i]'); if (it) pick(+it.dataset.i); });
  input.addEventListener('focus', () => { cur = -1; show(); });
  input.addEventListener('click', () => { if (!box.isConnected) show(); });
  input.addEventListener('input', () => { if (!picking && document.activeElement === input) { cur = -1; show(); } });
  input.addEventListener('blur', () => setTimeout(hide, 100));
  input.addEventListener('keydown', (e) => {
    if (!box.isConnected) { if (e.key === 'ArrowDown') { show(); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { cur = Math.min(cur + 1, items.length - 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cur = Math.max(cur - 1, 0); show(); e.preventDefault(); }
    else if (e.key === 'Enter' && cur >= 0 && !e.isComposing) { pick(cur); e.preventDefault(); }
    else if (e.key === 'Escape') { hide(); e.stopPropagation(); e.preventDefault(); }
  });
  input.closest('.mg-modal-body')?.addEventListener('scroll', hide, { passive: true });
}

/* ---------- 학생 선택 입력 (datalist) ---------- */
function studentChoices(filter) {
  const list = Store.all('students').filter(filter || (() => true)).sort((a, b) => ko(a.name, b.name));
  const map = {}, used = {};
  list.forEach(s => {
    let label = s.name + (stTag(s) ? ' (' + stTag(s) + ')' : '');
    if (s.status === 'left') label += ' [퇴원]';
    if (used[label]) label += ' #' + s.id.slice(-4);
    used[label] = 1;
    map[label] = s.id;
  });
  return map;
}
function studentInputHtml(dlId, value) {
  return `<input type="text" class="st-input" list="${dlId}" value="${esc(value || '')}" placeholder="이름을 입력해 선택" autocomplete="off" style="width:100%"><datalist id="${dlId}"></datalist>`;
}
function bindStudentInput(root, dlId, map) {
  const dl = $('#' + dlId, root);
  dl.innerHTML = Object.keys(map).map(k => `<option value="${esc(k)}"></option>`).join('');
}
function labelOfStudent(id) {
  const s = Store.get('students', id);
  if (!s) return '';
  const map = studentChoices();
  return Object.keys(map).find(k => map[k] === id) || s.name;
}

/* =========================================================
   텍스트 상자: 자동 번호 / 글머리표 / 링크 표시 / Ctrl+Enter
   (다이어리 앱 로직 그대로 이식)
   ========================================================= */
function extractUrls(text) {
  const re = /https?:\/\/[^\s<>"']+/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const u = m[0].replace(/[),.;!?]+$/, '');
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

// 커서가 있는 줄이 화면에 보이도록 textarea 스크롤을 맞춘다.
function scrollCursorIntoView(ta) {
  const style = window.getComputedStyle(ta);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const pos = ta.selectionStart;
  const textBefore = ta.value.substring(0, pos);
  const linesBefore = textBefore.split('\n').length;
  const cursorY = paddingTop + (linesBefore - 1) * lineHeight;
  const visibleBottom = ta.scrollTop + ta.clientHeight;
  if (cursorY + lineHeight > visibleBottom) {
    ta.scrollTop = cursorY + lineHeight - ta.clientHeight + lineHeight;
  } else if (cursorY < ta.scrollTop) {
    ta.scrollTop = cursorY - paddingTop;
  }
}

function setupAutoList(ta, onInputExtra) {
  let mode = null; // null | 'bullet' | 'number'

  // ZWS: Android IME가 번호 prefix 숫자를 조합 버퍼로 잡는 것을 방지
  const ZWS = '\u200b';

  function handleSpace(preventFn) {
    const start = ta.selectionStart;
    const before = ta.value.substring(0, start);
    const lines = before.split('\n');
    const curLine = lines[lines.length - 1];

    const numMatch = curLine.match(/^(\d+)\.$/);
    if (numMatch && mode !== 'number') {
      preventFn();
      const lineStart = before.lastIndexOf('\n') + 1;
      ta.value = ta.value.substring(0, lineStart) + numMatch[1] + '. ' + ZWS + ta.value.substring(start);
      const newCursor = lineStart + numMatch[1].length + 2 + 1;
      ta.selectionStart = ta.selectionEnd = newCursor;
      mode = 'number';
      scrollCursorIntoView(ta);
      return true;
    }
    if (curLine === '*' && mode !== 'bullet') {
      preventFn();
      const lineStart = before.lastIndexOf('\n') + 1;
      ta.value = ta.value.substring(0, lineStart) + '• ' + ta.value.substring(start);
      ta.selectionStart = ta.selectionEnd = lineStart + 2;
      mode = 'bullet';
      scrollCursorIntoView(ta);
      return true;
    }
    return false;
  }

  function handleEnter(preventFn, isShift) {
    if (!mode) return false;
    // Shift+Enter → 번호 없이 일반 줄바꿈
    if (isShift) {
      preventFn();
      const start = ta.selectionStart;
      const before = ta.value.substring(0, start);
      const after = ta.value.substring(ta.selectionEnd);
      ta.value = before + '\n' + after;
      ta.selectionStart = ta.selectionEnd = start + 1;
      scrollCursorIntoView(ta);
      return true;
    }
    preventFn();
    const start = ta.selectionStart;
    const before = ta.value.substring(0, start);
    const after = ta.value.substring(ta.selectionEnd);
    const lines = before.split('\n');
    const curLine = lines[lines.length - 1];

    if (mode === 'bullet') {
      if (curLine === '• ') {
        ta.value = before.slice(0, -2) + '\n' + after;
        ta.selectionStart = ta.selectionEnd = start - 2 + 1;
        mode = null;
        return true;
      }
      const insert = '\n• ';
      ta.value = before + insert + after;
      ta.selectionStart = ta.selectionEnd = start + insert.length;

    } else if (mode === 'number') {
      const match = curLine.match(/^(\d+)\.\s/);
      // 빈 번호 줄에서 엔터 → 모드 해제 (ZWS 포함 실제 길이로 제거)
      if (match && curLine.replace(/\u200b/g, '') === match[0]) {
        const trim = before.slice(0, -curLine.length);
        ta.value = trim + '\n' + after;
        ta.selectionStart = ta.selectionEnd = trim.length + 1;
        mode = null;
        return true;
      }
      const nextNum = match ? parseInt(match[1]) + 1 : 1;
      const insert = '\n' + nextNum + '. ' + ZWS;
      // 커서 뒤 번호 줄 재정렬
      const afterLines = after.split('\n');
      let renumFrom = nextNum + 1;
      let inSameBlock = true; // 같은 그룹 내에서만 재번호
      const renumberedAfter = afterLines.map((line, idx) => {
        if (idx === 0) return line;
        const cleanLine = line.replace(/\u200b/g, '');
        const lm = cleanLine.match(/^(\d+)(\.\s)/);
        if (lm && inSameBlock) {
          return renumFrom++ + lm[2] + line.slice(lm[0].length);
        }
        // 번호 줄이 아닌 줄(빈 줄, 일반 텍스트)을 만나면 그룹 끊김 → 이후는 건드리지 않음
        if (!lm) inSameBlock = false;
        return line;
      }).join('\n');
      ta.value = before + insert + renumberedAfter;
      ta.selectionStart = ta.selectionEnd = start + insert.length;
    }
    scrollCursorIntoView(ta);
    return true;
  }

  function renumberAll() {
    const pos = ta.selectionStart;
    const lines = ta.value.split('\n');
    let inBlock = false, blockStart = 0, blockOffset = 0, changed = false;
    const result = lines.map(line => {
      const cleanLine = line.replace(/\u200b/g, '');
      const m = cleanLine.match(/^(\d+)(\.\s)([\s\S]*)$/);
      if (m) {
        if (!inBlock) {
          inBlock = true;
          blockStart = parseInt(m[1], 10);
          blockOffset = 0;
        }
        const expected = blockStart + blockOffset++;
        const oldPrefix = m[1] + m[2];
        const newPrefix = expected + m[2];
        if (oldPrefix === newPrefix) return line;
        const newLine = newPrefix + line.slice(oldPrefix.length);
        changed = true;
        return newLine;
      } else {
        inBlock = false;
        return line;
      }
    });
    if (!changed) return;
    const oldLines = lines, newLines = result;
    let oldOffset = 0, newOffset = 0;
    for (let i = 0; i < oldLines.length; i++) {
      const oldEnd = oldOffset + oldLines[i].length + (i < oldLines.length - 1 ? 1 : 0);
      const newEnd = newOffset + newLines[i].length + (i < newLines.length - 1 ? 1 : 0);
      if (pos <= oldEnd) {
        const posInLine = pos - oldOffset;
        const om = oldLines[i].match(/^(\d+\.\s)/);
        const nm = newLines[i].match(/^(\d+\.\s)/);
        const diff = nm && om ? nm[1].length - om[1].length : 0;
        const newPos = newOffset + Math.max(nm ? nm[1].length : 0, posInLine + diff);
        ta.value = newLines.join('\n');
        ta.selectionStart = ta.selectionEnd = newPos;
        return;
      }
      oldOffset = oldEnd;
      newOffset = newEnd;
    }
    ta.value = newLines.join('\n');
    ta.selectionStart = ta.selectionEnd = pos;
  }

  // PC: keydown
  ta.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey) return;          // Ctrl+Enter는 저장용
    let handled = false;
    if (e.key === ' ') {
      handled = handleSpace(() => e.preventDefault());
    } else if (e.key === 'Enter') {
      handled = handleEnter(() => e.preventDefault(), e.shiftKey);
    }
    if (handled) {
      requestAnimationFrame(() => scrollCursorIntoView(ta));
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // 모바일: beforeinput
  ta.addEventListener('beforeinput', function (e) {
    let handled = false;
    if (e.inputType === 'insertText' && e.data === ' ') {
      handled = handleSpace(() => e.preventDefault());
    } else if (e.inputType === 'insertLineBreak' ||
               (e.inputType === 'insertText' && e.data === '\n')) {
      handled = handleEnter(() => e.preventDefault(), false);
    }
    if (handled) {
      requestAnimationFrame(() => scrollCursorIntoView(ta));
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // input: 링크 갱신 + 삭제 후 재번호 + 모드 리셋
  ta.addEventListener('input', function (e) {
    if (onInputExtra) onInputExtra();
    if (ta.value === '') { mode = null; return; }
    if (mode === 'number' && !e.isComposing) renumberAll();
    scrollCursorIntoView(ta);
  });

  return () => { mode = null; };
}

const LINK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

/* 모든 여러 줄 입력칸에 적용: enhanceTextarea(ta, { onSave }) */
function enhanceTextarea(ta, opts = {}) {
  if (!ta || ta._mgEnhanced) return;
  ta._mgEnhanced = true;
  const box = document.createElement('div');
  box.className = 'ta-links';
  ta.insertAdjacentElement('afterend', box);
  const updateLinks = () => {
    const urls = extractUrls(stripZws(ta.value));
    box.innerHTML = urls.map(u => `<a class="ta-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${LINK_SVG}<span>${esc(u)}</span></a>`).join('');
  };
  setupAutoList(ta, updateLinks);
  updateLinks();
  // Ctrl/Cmd + Enter → 저장
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault();
      if (opts.onSave) { opts.onSave(); return; }
      const modal = ta.closest('.mg-modal');
      const btn = modal && modal.querySelector('[data-primary]');
      if (btn) btn.click();
    }
  });
}
function enhanceAll(root, opts) { $$('textarea', root).forEach(ta => enhanceTextarea(ta, opts)); }

/* ---------- 오래 걸리는 작업 표시 ----------
   Busy.open(제목, { total, unit }) → 화면 가운데 진행 창 (끝날 때까지 닫히지 않음)
     · total이 있으면 진행바 + "n / total unit", 없으면 움직이는 진행바
     · h.set(done, text) 진행 갱신 / h.close() 닫기
   Busy.chip(글) → 화면 구석 작은 표시 (다른 작업은 계속 가능). h.close()로 끔. 여러 개면 개수 표시 */
const Busy = {
  _css: false,
  _chips: [],
  _chipEl: null,
  _chipT: null,
  css() {
    if (this._css) return;
    this._css = true;
    const st = document.createElement('style');
    st.textContent = `
.bz-wrap { position: fixed; inset: 0; z-index: 1500; display: flex; align-items: center; justify-content: center; background: rgba(20, 40, 60, .38); padding: 16px; }
.bz-box { width: min(380px, 100%); background: var(--surface, #fff); color: var(--ink, #1E3243); border-radius: 14px; box-shadow: 0 16px 40px rgba(20, 40, 60, .25); padding: 20px 20px 16px; }
.bz-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.bz-text { font-size: 13px; color: var(--ink-soft, #4A6275); min-height: 18px; }
.bz-bar { position: relative; height: 8px; border-radius: 4px; background: var(--line, #D6E7F4); overflow: hidden; margin: 12px 0 8px; }
.bz-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: var(--accent, #2B7FC1); border-radius: 4px; transition: width .3s ease; }
.bz-bar.ind .bz-fill { width: 35%; animation: bz-move 1.2s ease-in-out infinite; }
@keyframes bz-move { 0% { left: -35%; } 100% { left: 100%; } }
.bz-foot { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-mute, #7A8E9E); }
.bz-chip { position: fixed; right: 14px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 1400; display: flex; align-items: center; gap: 8px;
  background: var(--surface, #fff); color: var(--ink, #1E3243); border: 1px solid var(--line, #D6E7F4); border-radius: 999px; padding: 7px 14px; font-size: 13px;
  box-shadow: 0 6px 18px rgba(20, 40, 60, .16); pointer-events: none; }
.bz-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line, #D6E7F4); border-top-color: var(--accent, #2B7FC1); animation: bz-rot .8s linear infinite; flex: none; }
@keyframes bz-rot { to { transform: rotate(360deg); } }
body.m-body .bz-chip { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); }`;
    document.head.appendChild(st);
  },
  fmtSec(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); },
  open(title, o = {}) {
    this.css();
    const total = +o.total || 0, unit = o.unit || '';
    const wrap = document.createElement('div');
    wrap.className = 'bz-wrap';
    wrap.innerHTML = `<div class="bz-box" role="alertdialog" aria-busy="true"><div class="bz-title">${esc(title)}</div>
      <div class="bz-text">${esc(o.text || '')}</div>
      <div class="bz-bar${total ? '' : ' ind'}"><div class="bz-fill"></div></div>
      <div class="bz-foot"><span class="bz-cnt">${total ? `0 / ${total}${esc(unit)}` : '처리 중…'}</span><span class="bz-time">0:00</span></div>
      <div class="bz-foot" style="margin-top:6px"><span>끝날 때까지 창을 닫지 마세요</span></div></div>`;
    document.body.appendChild(wrap);
    const t0 = Date.now();
    const tm = setInterval(() => { $('.bz-time', wrap).textContent = this.fmtSec(Math.floor((Date.now() - t0) / 1000)); }, 1000);
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };     // 진행 중 창 닫기·새로고침 경고
    window.addEventListener('beforeunload', warn);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    let closed = false;
    return {
      set(done, text) {
        if (closed) return;
        if (total) {
          const n = Math.max(0, Math.min(total, +done || 0));
          $('.bz-fill', wrap).style.width = (n / total * 100) + '%';
          $('.bz-cnt', wrap).textContent = `${n} / ${total}${unit}`;
        }
        if (text != null) $('.bz-text', wrap).textContent = text;
      },
      close() {
        if (closed) return;
        closed = true;
        clearInterval(tm);
        window.removeEventListener('beforeunload', warn);
        wrap.remove();
      },
    };
  },
  chip(text) {
    this.css();
    const it = { text, t0: Date.now() };
    this._chips.push(it);
    this._paintChip();
    if (!this._chipT) this._chipT = setInterval(() => this._paintChip(), 1000);
    let closed = false;
    return {
      close: () => {
        if (closed) return;
        closed = true;
        this._chips = this._chips.filter(x => x !== it);
        this._paintChip();
      },
    };
  },
  _paintChip() {
    if (!this._chips.length) {
      if (this._chipEl) { this._chipEl.remove(); this._chipEl = null; }
      clearInterval(this._chipT); this._chipT = null;
      return;
    }
    if (!this._chipEl) {
      this._chipEl = document.createElement('div');
      this._chipEl.className = 'bz-chip';
      document.body.appendChild(this._chipEl);
    }
    const first = this._chips[0];
    const more = this._chips.length > 1 ? ` 외 ${this._chips.length - 1}건` : '';
    this._chipEl.innerHTML = `<span class="bz-spin"></span><span>${esc(first.text)}${more} ${this.fmtSec(Math.floor((Date.now() - first.t0) / 1000))}</span>`;
  },
};

/* ---------- 테마 (설정 > 테마) ----------
   body 에 theme-이름 클래스를 붙이면 style.css 의 색 변수만 바뀐다. 기본(sky = 연한 하늘색)은 클래스 없음.
   선택값은 meta 테이블 id 'ui_theme' { kind:'theme', value } 로 서버에 저장 → 모바일 등 모든 기기가 동기화로 따라감 (서버 SQL 변경 없음)
   기기에는 mg77_theme 에 마지막 값을 기억해 두어, 켤 때 바로 적용 (index.html / index-mobile.html 의 시작 스크립트와 같은 키·이름) */
const Theme = {
  DEFAULT: 'sky',
  REC_ID: 'ui_theme',
  LS: 'mg77_theme',
  LIST: [
    { id: 'sky',      label: '연한 하늘색',  bg: '#F4F9FD', side: '#E4F1FB', dot: '#2B7FC1' },
    { id: 'light',    label: '라이트',     bg: '#F6F8F4', side: '#EAEEE4', dot: '#3A9E6A' },
    { id: 'rose',     label: '연한 붉은색',  bg: '#FCF4F4', side: '#F8E3E3', dot: '#C03848' },
    { id: 'lavender', label: '연한 자주색',  bg: '#F7F4FC', side: '#EBE3F8', dot: '#7040C0' },
    { id: 'cream',    label: '연한 노란색',  bg: '#FDFBF4', side: '#FAF6E4', dot: '#A87A10' },
    { id: 'apricot',  label: '연한 주황색',  bg: '#FEF7F3', side: '#FDEDE2', dot: '#D0682A' },
    { id: 'mint',     label: '연한 청록색',  bg: '#F4FBFA', side: '#E3F7F3', dot: '#13877D' },
    { id: 'mocha',    label: '연한 갈색',   bg: '#FBF8F4', side: '#F6EEE3', dot: '#8A5A34' },
    { id: 'gray',     label: '연한 회색',   bg: '#F4F5F7', side: '#E5E8EC', dot: '#4A5568' },
  ],
  valid(id) { return this.LIST.some(t => t.id === id); },
  // 지금 화면에 적용된 테마
  current() {
    const b = document.body;
    const t = b && this.LIST.find(x => b.classList.contains('theme-' + x.id));
    return t ? t.id : this.DEFAULT;
  },
  // 화면에만 적용 (+ 이 기기에 기억)
  apply(id) {
    if (!this.valid(id)) id = this.DEFAULT;
    const b = document.body;
    if (!b) return;
    this.LIST.forEach(t => b.classList.remove('theme-' + t.id));
    if (id !== this.DEFAULT) b.classList.add('theme-' + id);
    try { localStorage.setItem(this.LS, id); } catch (e) {}
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) { const c = getComputedStyle(b).getPropertyValue('--side').trim(); if (c) m.setAttribute('content', c); }
  },
  // 설정에서 고름 → 적용 + 서버 저장 (다른 기기로 전달)
  set(id) {
    if (!this.valid(id)) return;
    this.apply(id);
    const r = Store.get('meta', this.REC_ID);
    if (!r || r.value !== id) Store.put('meta', { id: this.REC_ID, kind: 'theme', value: id, updatedAt: new Date().toISOString() });
  },
  // 캐시 읽기·동기화 뒤 서버 값이 이 기기 값과 다르면 따라감
  syncFromStore() {
    const r = Store.get('meta', this.REC_ID);
    if (r && this.valid(r.value) && r.value !== this.current()) this.apply(r.value);
  },
};
