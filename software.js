/* =========================================================
   software.js — Software (선생님 › Software)
   PDF 도구 2개를 한 화면의 두 탭으로 묶음 (왼쪽부터)
     [PDF 일괄 인쇄] 여러 PDF → 제한 해제 + 주석·양식 병합 → A4 하나로 합쳐 인쇄/저장
                     (각 파일은 홀수 쪽에서 시작, 가로 페이지는 90° 돌려 세로 A4에 맞춤, 손잡이로 순서 바꾸기)
     [PDF 제한 해제] 여러 PDF의 사용 제한 해제 → 원본 옆에 '_unlocked' 로 저장
                     (Chrome·Edge: 폴더 허용 후 원본 옆 저장 / 그 밖: 다운로드, 여러 개면 ZIP 하나)
   - 모든 처리는 이 컴퓨터(브라우저) 안에서만 한다. 서버로 파일을 보내지 않고, 서버 SQL·저장 데이터도 쓰지 않음.
   - 라이브러리(pdf-lib · SortableJS · qpdf 엔진)는 이 화면을 처음 열 때만 불러온다 → 앱 시작 속도는 그대로.
   - qpdf 엔진(Web Worker 묶음)은 두 탭이 함께 쓴다. 작업은 하나의 대기열로 병렬 처리.
   - 다른 메뉴에 갔다 와도 탭 · 불러온 파일 목록 · 진행 중인 작업이 그대로 유지된다 (상태는 이 파일의 변수에 보관).
   - PC 화면 전용 (index-mobile.html 에는 넣지 않음)
   ========================================================= */
const SW_LIB = {
  pdf: 'https://unpkg.com/pdf-lib/dist/pdf-lib.min.js',
  sortable: 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
};
const SW_QPDF = 'https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/';
const SW_A4 = { w: 595.28, h: 841.89 };

/* ---------- 라이브러리 (필요할 때 한 번만 불러옴) ---------- */
const SwLib = {
  _p: {},
  load(key, globalName) {
    if (typeof window[globalName] !== 'undefined') return Promise.resolve();
    if (!this._p[key]) this._p[key] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SW_LIB[key];
      s.onload = () => { if (typeof window[globalName] !== 'undefined') res(); else { this._p[key] = null; rej(new Error('no ' + globalName)); } };
      s.onerror = () => { this._p[key] = null; s.remove(); rej(new Error('load fail')); };
      document.head.appendChild(s);
    });
    return this._p[key];
  },
};

/* ---------- qpdf 엔진 (Web Worker 풀, 두 탭 공용) ----------
   mode 'print'  : 제한 해제 + 주석/양식 입력값을 본문에 병합 (화면에 보이는 그대로)   — 일괄 인쇄 프로그램과 같은 명령
   mode 'unlock' : 암호화 여부 확인 → 제한 해제만                                     — 제한 해제 프로그램과 같은 명령 */
const SW_WORKER_SRC = `
let lastErr = '';
let ready;
console.error = (...a) => { lastErr = a.join(' '); };
console.warn = (...a) => { lastErr = a.join(' '); };
try {
  importScripts('${SW_QPDF}qpdf.js');
  ready = self.Module({ locateFile: p => '${SW_QPDF}' + p, print: () => {}, printErr: s => { lastErr = String(s); } });
} catch (e) { ready = Promise.reject(e); }
ready.then(() => postMessage({ type: 'ready' }), e => postMessage({ type: 'fatal', msg: String((e && e.message) || e) }));
self.onmessage = async (ev) => {
  const { id, buf, mode } = ev.data;
  let q;
  try { q = await ready; } catch (e) { postMessage({ type: 'result', id, code: 'error', msg: '엔진을 불러오지 못했습니다' }); return; }
  const inP = '/in_' + id + '.pdf', outP = '/out_' + id + '.pdf';
  const run = a => { lastErr = ''; try { return q.callMain(a); } catch (e) { lastErr = String((e && e.message) || e); return 2; } };
  const done = r => {
    if (r === 0 || r === 3) {
      const out = q.FS.readFile(outP);
      const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
      postMessage({ type: 'result', id, code: 'ok', buf: ab, warn: r === 3 }, [ab]);
    } else {
      postMessage({ type: 'result', id, code: /password/i.test(lastErr) ? 'password' : 'error', msg: lastErr });
    }
  };
  try {
    q.FS.writeFile(inP, new Uint8Array(buf));
    if (mode === 'unlock') {
      const enc = run(['--is-encrypted', inP]);
      if (enc !== 0) {
        const s = run(['--show-encryption', inP]);
        if (s === 0) postMessage({ type: 'result', id, code: 'notenc' });
        else postMessage({ type: 'result', id, code: /password/i.test(lastErr) ? 'password' : 'error', msg: lastErr });
        return;
      }
      done(run(['--decrypt', inP, outP]));
    } else {
      done(run(['--decrypt', '--generate-appearances', '--flatten-annotations=screen', inP, outP]));
    }
  } catch (e) {
    postMessage({ type: 'result', id, code: 'error', msg: String((e && e.message) || e) });
  } finally {
    try { q.FS.unlink(inP); } catch (e) {}
    try { q.FS.unlink(outP); } catch (e) {}
  }
};`;

const SwEngine = {
  SIZE: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
  pool: [],
  queue: [],
  seq: 0,
  started: false,
  state: 'wait',          // 'wait' 불러오는 중 / 'ok' 준비됨 / 'bad' 실패
  _res: null,
  ready: null,
  okCount() { return this.pool.filter(s => s.ok === true).length; },
  update() {
    const ok = this.okCount(), settled = this.pool.filter(s => s.ok !== null).length;
    if (ok > 0) { this.state = 'ok'; this._res(true); }
    else if (settled === this.pool.length) { this.state = 'bad'; this._res(false); this.failQueued(); }
    SoftwarePage.engineChanged();      // 제한 해제 탭 아래 '변환 엔진' 표시 갱신
  },
  // 쓸 수 있는 작업자가 하나도 없으면 기다리던 작업은 실패로 돌려줌 (영원히 기다리지 않게)
  failQueued() { const q = this.queue; this.queue = []; q.forEach(j => j.resolve({ code: 'error', msg: '엔진이 중단되었습니다' })); },
  pump(slot) {
    if (!slot.ok || slot.busy || !this.queue.length) return;
    const job = this.queue.shift();
    slot.busy = true;
    slot.pending = (d) => { slot.busy = false; job.resolve(d); this.pump(slot); };
    slot.w.postMessage({ id: job.id, buf: job.buf, mode: job.mode }, [job.buf]);
  },
  init() {
    if (this.started) return;
    this.started = true;
    let url;
    try { url = URL.createObjectURL(new Blob([SW_WORKER_SRC], { type: 'text/javascript' })); }
    catch (e) { this.update(); return; }
    for (let i = 0; i < this.SIZE; i++) {
      const slot = { w: null, ok: null, busy: false, pending: null };
      try { slot.w = new Worker(url); } catch (e) { slot.ok = false; this.pool.push(slot); continue; }
      slot.w.onmessage = e => {
        const d = e.data;
        if (d.type === 'ready') { slot.ok = true; this.update(); this.pump(slot); }
        else if (d.type === 'fatal') { slot.ok = false; this.update(); }
        else if (d.type === 'result' && slot.pending) { const p = slot.pending; slot.pending = null; p(d); }
      };
      slot.w.onerror = e => {
        e.preventDefault();
        if (slot.ok === null) slot.ok = false;
        if (slot.pending) { const p = slot.pending; slot.pending = null; p({ code: 'error', msg: '처리 중 오류가 발생했습니다' }); }
        this.update();
      };
      this.pool.push(slot);
    }
    this.update();
  },
  // 작업 하나를 대기열에 넣고 결과 Promise 반환 (owner: 'print' | 'unlock' — 중단할 때 자기 것만 지우기 위함)
  run(mode, buf, owner) {
    if (this.state === 'bad') return Promise.resolve({ code: 'error', msg: '엔진을 불러오지 못했습니다' });
    return new Promise(resolve => {
      this.queue.push({ id: ++this.seq, mode, buf, owner, resolve });
      this.pool.forEach(s => this.pump(s));
    });
  },
  cancel(owner) {
    const drop = this.queue.filter(j => j.owner === owner);
    this.queue = this.queue.filter(j => j.owner !== owner);
    drop.forEach(j => j.resolve({ code: 'cancel' }));
  },
};
SwEngine.ready = new Promise(r => { SwEngine._res = r; });

/* ---------- 공용 ---------- */
const SW_ICON = {
  grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  filePlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15h6"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
  printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
  doc: '<svg class="sw-doc" viewBox="0 0 30 36" aria-hidden="true"><path d="M3 3h16l8 8v22H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M19 3v8h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  lock: '<svg class="sw-lock" viewBox="0 -12 64 88" aria-hidden="true"><path class="shackle" d="M18 34V22a14 14 0 0 1 28 0v12" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><rect x="6" y="32" width="52" height="40" rx="9" fill="currentColor"/><g class="key" fill="var(--surface)"><circle cx="32" cy="49" r="5"/><rect x="29.5" y="51" width="5" height="11" rx="2"/></g></svg>',
};
function swSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
const swIsPdf = n => /\.pdf$/i.test(n);
function swProgHtml(p) {
  return `<div class="sw-prog" id="sw-prog"${p.show ? '' : ' hidden'}>
    <div class="sw-track"><div class="sw-fill" id="sw-fill" style="width:${p.pct}%"></div></div>
    <div class="sw-ptext"><span id="sw-pl">${esc(p.left)}</span><span id="sw-pr">${esc(p.right)}</span></div></div>`;
}

/* =========================================================
   [탭 1] PDF 일괄 인쇄
   ========================================================= */
const SwPrint = {
  files: [],          // { id, data:File }
  busy: false,
  prog: { show: false, pct: 0, left: '', right: '' },

  setProg(o) {
    Object.assign(this.prog, o);
    if (!SoftwarePage.showing('print')) return;
    const box = $('#sw-prog'); if (!box) return;
    box.hidden = !this.prog.show;
    $('#sw-fill').style.width = this.prog.pct + '%';
    $('#sw-pl').textContent = this.prog.left;
    $('#sw-pr').textContent = this.prog.right;
  },
  hideProg() { this.setProg({ show: false, pct: 0, left: '', right: '' }); },

  html() {
    const n = this.files.length;
    const btnLbl = this.busy ? '<span class="sw-spin"></span> 처리 중' : `${SW_ICON.printer} 일괄 인쇄/저장`;
    let h = `<div class="panel sw-panel">
      <div class="sw-desc">여러 PDF의 제한을 풀고 주석·양식 입력값을 본문에 합친 뒤, A4 하나로 묶어 인쇄하거나 PDF로 저장합니다. 각 파일은 새 앞면(홀수 쪽)에서 시작하고, 가로 페이지는 세로 A4에 맞게 돌려 넣습니다.</div>
      <div class="sw-bar">
        <div class="sw-count">${n ? `${n}개 파일<small>왼쪽 손잡이를 끌어 순서를 바꿀 수 있습니다</small>` : '불러온 파일 없음'}</div>
        <div class="sw-acts">
          <button type="button" class="btn" data-pa="load">${SW_ICON.filePlus} 불러오기</button>
          <button type="button" class="btn danger" data-pa="reset">${SW_ICON.reset} 초기화</button>
          <button type="button" class="btn primary" data-pa="print" ${this.busy || !n ? 'disabled' : ''}>${btnLbl}</button>
        </div>
      </div>
      ${swProgHtml(this.prog)}
      <input type="file" id="sw-pfile" multiple accept=".pdf" hidden>
    </div>`;
    if (n) {
      h += `<ul class="sw-list" id="sw-plist">${this.files.map(f => `
        <li class="sw-row sw-prow" data-id="${f.id}">
          <span class="sw-handle" title="끌어서 순서 바꾸기">${SW_ICON.grip}</span>
          <div class="sw-meta"><div class="sw-name" title="${esc(f.data.name)}">${esc(f.data.name)}</div><div class="sw-sub"><span>${swSize(f.data.size)}</span></div></div>
          <button type="button" class="icon-btn sw-x" data-px="${f.id}" aria-label="${esc(f.data.name)} 목록에서 제거">✕</button>
        </li>`).join('')}</ul>`;
    } else {
      h += `<div class="empty">불러오기로 PDF 파일을 고르세요. 여러 번 불러오면 목록 아래에 이어서 붙습니다.</div>`;
    }
    return h;
  },
  mount() {
    const list = $('#sw-plist');
    if (!list) return;
    const go = () => {
      if (!list.isConnected || typeof Sortable === 'undefined') return;
      new Sortable(list, {
        handle: '.sw-handle', animation: 150,
        onEnd: () => {
          const order = Array.from(list.children).map(li => li.getAttribute('data-id'));
          this.files.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        },
      });
    };
    if (typeof Sortable !== 'undefined') go();
    else SwLib.load('sortable', 'Sortable').then(go, () => {});
  },
  click(e) {
    const x = e.target.closest('[data-px]');
    if (x) { this.files = this.files.filter(f => f.id !== x.dataset.px); SoftwarePage.paint(); return; }
    const b = e.target.closest('[data-pa]');
    if (!b || b.disabled) return;
    const a = b.dataset.pa;
    if (a === 'load') $('#sw-pfile').click();
    else if (a === 'reset') this.reset();
    else if (a === 'print') this.processAndPrint();
  },
  change(e) {
    if (e.target.id !== 'sw-pfile') return;
    Array.from(e.target.files).forEach(file => {
      this.files.push({ id: Math.random().toString(36).substr(2, 9), data: file });
    });
    e.target.value = '';
    SoftwarePage.paint();
  },
  reset() {
    this.files = [];
    this.prog = { show: false, pct: 0, left: '', right: '' };
    SoftwarePage.paint();
  },

  // 파일 처리 실패 → '전체 중단' / '나머지 계속' (창을 그냥 닫거나 Esc = 전체 중단)
  askOnError(fileName, msg) {
    return new Promise(res => {
      let done = false;
      const fin = v => { if (!done) { done = true; res(v); } };
      Modal.open({
        title: '파일 처리 실패', size: 'sm', autofocus: false,
        body: `<div class="sw-err-file">${esc(fileName)}</div><p class="sw-err-msg">${esc(msg)}</p>`,
        buttons: [
          { text: '전체 중단', cls: 'danger', onClick() { fin('stop'); } },
          { text: '나머지 계속', cls: 'primary', primary: true, onClick() { fin('continue'); } },
        ],
        onClose() { fin('stop'); },
      });
    });
  },

  // 원본 페이지를 그대로(벡터) 가져와 A4에 꽉 채우고, 가로 페이지는 90° 반시계 회전
  async appendVectorPages(mergedPdf, bytes, A4_WIDTH, A4_HEIGHT) {
    const src = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
    const pages = src.getPages();
    // 보이는 영역 = CropBox ∩ MediaBox
    const boxes = pages.map(pg => {
      const m = pg.getMediaBox(), c = pg.getCropBox();
      const l = Math.max(m.x, c.x), b = Math.max(m.y, c.y);
      const r = Math.min(m.x + m.width, c.x + c.width), t = Math.min(m.y + m.height, c.y + c.height);
      return (r > l && t > b) ? { left: l, bottom: b, right: r, top: t }
        : { left: m.x, bottom: m.y, right: m.x + m.width, top: m.y + m.height };
    });
    const emb = await mergedPdf.embedPages(pages, boxes);
    pages.forEach((pg, i) => {
      // 페이지 자체 회전 정보(/Rotate) 반영
      let rot = pg.getRotation().angle % 360;
      if (rot < 0) rot += 360;
      if (rot % 90) rot = 0;
      const w = boxes[i].right - boxes[i].left, h = boxes[i].top - boxes[i].bottom;
      const vw = rot % 180 ? h : w, vh = rot % 180 ? w : h;
      // 가로 페이지이면 90° 반시계 방향으로 회전 → 세로 A4에 맞춤
      const total = ((rot - (vw > vh ? 90 : 0)) % 360 + 360) % 360;
      const o = {
        0:   { x: 0,        y: 0,         width: A4_WIDTH,  height: A4_HEIGHT, rotate: 0 },
        90:  { x: 0,        y: A4_HEIGHT, width: A4_HEIGHT, height: A4_WIDTH,  rotate: 270 },
        180: { x: A4_WIDTH, y: A4_HEIGHT, width: A4_WIDTH,  height: A4_HEIGHT, rotate: 180 },
        270: { x: A4_WIDTH, y: 0,         width: A4_HEIGHT, height: A4_WIDTH,  rotate: 90 },
      }[total];
      const newPage = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
      newPage.drawPage(emb[i], { x: o.x, y: o.y, width: o.width, height: o.height, rotate: PDFLib.degrees(o.rotate) });
    });
    return pages.length;
  },

  async processAndPrint() {
    if (this.busy) return;
    this.busy = true;
    this.setProg({ show: true, pct: 0, left: '진행 중', right: '0%' });
    SoftwarePage.refresh();

    try {
      const engineOk = await SwEngine.ready;
      if (!engineOk) throw new Error('제한 해제 엔진을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.');
      try { await SwLib.load('pdf', 'PDFLib'); }
      catch (e) { throw new Error('PDF 처리 도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.'); }

      const mergedPdf = await PDFLib.PDFDocument.create();
      const A4_WIDTH = SW_A4.w, A4_HEIGHT = SW_A4.h;
      const files = this.files.slice();
      const totalFiles = files.length;

      // 모든 파일의 제한 해제를 병렬로 먼저 시작 (결과는 순서대로 사용)
      SwEngine.cancel('print');
      const jobs = files.map(f =>
        f.data.arrayBuffer()
          .then(buf => SwEngine.run('print', buf, 'print'))
          .catch(e => ({ code: 'error', msg: '파일을 읽지 못했습니다: ' + e.message }))
      );

      let aborted = false;
      for (let fIdx = 0; fIdx < totalFiles; fIdx++) {
        const fileObj = files[fIdx];
        const percent = Math.round((fIdx / totalFiles) * 100);
        this.setProg({ pct: percent, left: `진행 중 ${fIdx + 1} / ${totalFiles}`, right: percent + '%' });

        let failMsg = null;
        let unlockedBytes = null;
        const res = await jobs[fIdx];
        if (res.code === 'ok') unlockedBytes = res.buf;
        else if (res.code === 'password') failMsg = '열기 비밀번호가 걸려 있어 열 수 없습니다.';
        else failMsg = '제한 해제에 실패했습니다.' + (res.msg ? ' (' + res.msg + ')' : '');

        if (!failMsg) {
          try {
            // 홀수 페이지에서 끝났으면 빈 페이지 삽입 → 각 파일이 항상 새 앞면(홀수 페이지)에서 시작하도록 보장
            const startCount = mergedPdf.getPageCount();
            if (startCount % 2 === 1) mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
            try {
              await this.appendVectorPages(mergedPdf, unlockedBytes, A4_WIDTH, A4_HEIGHT);
            } catch (e) {
              // 실패한 파일이 추가한 페이지(빈 페이지 포함)는 되돌림
              while (mergedPdf.getPageCount() > startCount) mergedPdf.removePage(mergedPdf.getPageCount() - 1);
              throw e;
            }
          } catch (e) {
            failMsg = 'PDF를 읽지 못했습니다. (' + e.message + ')';
          }
        }

        if (failMsg) {
          const choice = await this.askOnError(fileObj.data.name, failMsg);
          if (choice === 'stop') { aborted = true; SwEngine.cancel('print'); break; }
        }
      }

      if (aborted) { this.hideProg(); return; }
      if (mergedPdf.getPageCount() === 0) throw new Error('인쇄할 페이지가 없습니다.');

      this.setProg({ pct: 100, left: '인쇄 창을 여는 중', right: '100%' });
      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      let iframe = document.getElementById('sw-print-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'sw-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.width = '0'; iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
      }
      iframe.src = url;
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => this.hideProg(), 2000);
        }, 500);
      };
    } catch (err) {
      alertDlg('오류', err.message);
    } finally {
      this.busy = false;
      SoftwarePage.refresh();
    }
  },
};

/* =========================================================
   [탭 2] PDF 제한 해제
   ========================================================= */
const SW_FS_OK = 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
const SW_STATUS = {
  pending: ['대기', 'gray'], working: ['처리 중', ''], done: ['완료', 'green'], notenc: ['제한 없음', 'orange'],
  password: ['열기 비밀번호 필요', 'red'], error: ['실패', 'red'], skipped: ['건너뜀', 'gray'],
};

const SwUnlock = {
  /** @type {Array<{id:number,name:string,size:number,handle:any,file:File|null,dir:any,path:string[]|null,dirLabel:string,status:string,msg:string}>} */
  items: [],
  nextId: 1,
  running: false,
  grantedDirs: [],
  dlBucket: null,     // 다운로드 방식일 때 결과를 모았다가 한 번에 저장
  lockOpen: false,
  prog: { show: false, pct: 0, left: '', right: '' },

  unlockedName(name) {
    const m = name.match(/^(.*?)(\.pdf)$/i);
    return m ? m[1] + '_unlocked' + m[2] : name + '_unlocked.pdf';
  },
  targets() { return this.items.filter(i => ['pending', 'error', 'skipped'].includes(i.status)); },
  resetLock() { this.lockOpen = false; const l = $('.sw-lock'); if (l) l.classList.remove('open'); },
  paint() { if (SoftwarePage.showing('unlock')) SoftwarePage.paint(); },

  setProg(o) {
    Object.assign(this.prog, o);
    if (!SoftwarePage.showing('unlock')) return;
    const box = $('#sw-prog'); if (!box) return;
    box.hidden = !this.prog.show;
    $('#sw-fill').style.width = this.prog.pct + '%';
    $('#sw-pl').textContent = this.prog.left;
    $('#sw-pr').textContent = this.prog.right;
  },
  setProgress(done, total) {
    const pct = total ? Math.round(done / total * 100) : 0;
    this.setProg({ pct, left: `${done} / ${total} 처리`, right: pct + '%' });
  },

  html() {
    const n = this.items.length, waiting = this.targets().length, R = this.running;
    let h = `<div class="panel sw-panel">
      <div class="sw-drop" id="sw-drop">
        ${SW_ICON.lock.replace('class="sw-lock"', `class="sw-lock${this.lockOpen ? ' open' : ''}"`)}
        <div class="sw-drop-txt">
          <p>PDF를 여기로 끌어 놓거나</p>
          <button type="button" class="btn primary" data-ua="pick" ${R ? 'disabled' : ''}>${SW_ICON.plus} 파일 불러오기</button>
        </div>
      </div>
      <div class="sw-bar">
        <div class="sw-count">${n ? `${n}개 파일<small>처리 대기 ${waiting}개</small>` : '불러온 파일 없음'}</div>
        <div class="sw-acts">
          <button type="button" class="btn" data-ua="clear" ${R || !n ? 'disabled' : ''}>목록 비우기</button>
          <button type="button" class="btn primary" data-ua="run" ${R || !waiting ? 'disabled' : ''}>제한 해제 시작</button>
        </div>
      </div>
      ${swProgHtml(this.prog)}
      <input type="file" id="sw-ufile" accept="application/pdf,.pdf" multiple hidden>
    </div>`;
    if (n) {
      h += `<ul class="sw-list">${this.items.map(it => {
        const [lbl, cls] = SW_STATUS[it.status];
        return `<li class="sw-row s-${it.status}">
          ${SW_ICON.doc}
          <div class="sw-meta">
            <div class="sw-name" title="${esc(it.name)}">${esc(it.name)}</div>
            <div class="sw-sub"><span>${swSize(it.size)}</span>${it.dirLabel ? `<span>📁 ${esc(it.dirLabel)}</span>` : ''}${it.msg ? `<span class="sw-msg">${esc(it.msg)}</span>` : ''}</div>
          </div>
          <span class="badge ${cls}">${lbl}</span>
          <button type="button" class="icon-btn sw-x" data-ux="${it.id}" ${R ? 'disabled' : ''} aria-label="${esc(it.name)} 목록에서 제거">✕</button>
        </li>`;
      }).join('')}</ul>`;
    } else {
      h += `<div class="empty">여러 위치에서 여러 번 불러와도 목록에 계속 쌓입니다.</div>`;
    }
    const ok = SwEngine.okCount();
    const eng = SwEngine.state === 'ok' ? ['ok', `변환 엔진 준비됨, 동시에 ${ok}개씩 처리`]
      : SwEngine.state === 'bad' ? ['bad', '변환 엔진을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.']
      : ['wait', '변환 엔진 불러오는 중'];
    h += `<div class="sw-foot"><span class="sw-dot ${eng[0]}"></span><span>${eng[1]}</span></div>`;
    return h;
  },

  click(e) {
    const x = e.target.closest('[data-ux]');
    if (x) { if (x.disabled) return; this.items = this.items.filter(i => String(i.id) !== x.dataset.ux); this.paint(); return; }
    const b = e.target.closest('[data-ua]');
    if (!b || b.disabled) return;
    const a = b.dataset.ua;
    if (a === 'pick') this.pick();
    else if (a === 'clear') { this.items = []; this.resetLock(); this.prog.show = false; this.paint(); }
    else if (a === 'run') this.run();
  },
  change(e) {
    if (e.target.id !== 'sw-ufile') return;
    this.clearDone();
    this.addFiles([...e.target.files]);
    e.target.value = '';
  },

  async tryAssign(it) {
    if (!it.handle) return false;
    for (const d of this.grantedDirs) {
      try {
        const p = await d.resolve(it.handle);
        if (p) {
          it.dir = d; it.path = p;
          it.dirLabel = [d.name, ...p.slice(0, -1)].join('/');
          return true;
        }
      } catch (e) {}
    }
    return false;
  },
  async addHandles(handles) {
    let added = 0, ignored = 0;
    for (const h of handles) {
      if (!h || h.kind !== 'file' || !swIsPdf(h.name)) { ignored++; continue; }
      let dup = false;
      for (const it of this.items) {
        if (it.handle) { try { if (await it.handle.isSameEntry(h)) { dup = true; break; } } catch (e) {} }
      }
      if (dup) continue;
      let size = 0;
      try { size = (await h.getFile()).size; } catch (e) {}
      const it = { id: this.nextId++, name: h.name, size, handle: h, file: null, dir: null, path: null, dirLabel: '', status: 'pending', msg: '' };
      await this.tryAssign(it);
      this.items.push(it); added++;
    }
    this.afterAdd(added, ignored);
  },
  addFiles(files) {
    let added = 0, ignored = 0;
    for (const f of files) {
      if (!swIsPdf(f.name)) { ignored++; continue; }
      if (this.items.some(i => i.file && i.file.name === f.name && i.file.size === f.size && i.file.lastModified === f.lastModified)) continue;
      this.items.push({ id: this.nextId++, name: f.name, size: f.size, handle: null, file: f, dir: null, path: null, dirLabel: '', status: 'pending', msg: '' });
      added++;
    }
    this.afterAdd(added, ignored);
  },
  afterAdd(added, ignored) {
    if (added) this.resetLock();
    if (ignored) toast(`PDF가 아닌 항목 ${ignored}개는 제외했습니다`);
    this.prog.show = false;
    this.paint();
  },
  // 새 파일을 불러오면 이전에 완료된 항목만 목록에서 지움
  clearDone() { this.items = this.items.filter(i => i.status !== 'done'); },

  async pick() {
    if (!SW_FS_OK) { $('#sw-ufile').click(); return; }
    try {
      const hs = await window.showOpenFilePicker({
        id: 'pdfunlock-open',
        multiple: true,
        types: [{ description: 'PDF 문서', accept: { 'application/pdf': ['.pdf'] } }],
      });
      this.clearDone();
      await this.addHandles(hs);
    } catch (e) {
      if (e.name !== 'AbortError') toast('파일을 불러오지 못했습니다: ' + e.message);
    }
  },
  // 드래그 앤 드롭 (drop 이벤트 안에서 바로 불러야 함 — 핸들은 이벤트가 끝나면 못 꺼냄)
  async drop(dt) {
    if (this.running) return;
    const dtItems = [...dt.items].filter(i => i.kind === 'file');
    if (!dtItems.length) return;
    if (SW_FS_OK && typeof dtItems[0].getAsFileSystemHandle === 'function') {
      const ps = dtItems.map(i => i.getAsFileSystemHandle());
      const hs = (await Promise.all(ps)).filter(Boolean);
      this.clearDone();
      if (hs.some(h => h.kind === 'directory')) toast('폴더는 끌어 놓을 수 없습니다. PDF 파일을 선택해 주세요');
      await this.addHandles(hs.filter(h => h.kind === 'file'));
    } else {
      const files = [...dt.files];
      this.clearDone();
      this.addFiles(files);
    }
  },

  /* ---------- 폴더 허용 ---------- */
  // 결과: 고른 폴더 핸들 / 'skip' / 'cancel' (창을 그냥 닫거나 Esc = 취소)
  askFolder(it, count, warn) {
    return new Promise(res => {
      let done = false;
      const fin = v => { if (!done) { done = true; res(v); } };
      Modal.open({
        title: '저장할 폴더를 허용해 주세요', size: 'sm', autofocus: false,
        body: `<div class="sw-dlg">
          <p><b class="sw-fname">‘${esc(it.name)}’</b> 파일이 있는 폴더를 선택하면, 결과 파일이 원본 옆에 저장됩니다.</p>
          ${count > 1 ? `<p>아직 위치가 허용되지 않은 파일이 ${count}개 있습니다.</p>` : ''}
          <p>상위 폴더를 선택하면 그 아래 하위 폴더에 있는 파일까지 한 번에 허용됩니다.</p>
          <div class="sw-warn"${warn ? '' : ' hidden'}>${esc(warn || '')}</div></div>`,
        buttons: [
          { text: '취소', left: true, onClick() { fin('cancel'); } },
          { text: '이 파일 건너뛰기', onClick() { fin('skip'); } },
          { text: '폴더 선택', cls: 'primary', primary: true, async onClick(m) {
            try {
              const d = await window.showDirectoryPicker({ mode: 'readwrite', startIn: it.handle });
              fin(d);
            } catch (e) {
              if (e.name !== 'AbortError') {
                const w = $('.sw-warn', m.body);
                w.textContent = '폴더를 열지 못했습니다: ' + e.message;
                w.hidden = false;
              }
              return false;      // 창 유지
            }
          } },
        ],
        onClose() { fin('cancel'); },
      });
    });
  },
  async ensureDirs(list) {
    for (const it of list) if (!it.dir) await this.tryAssign(it);
    let warn = '';
    while (true) {
      const need = list.filter(t => !t.dir && t.handle && t.status !== 'skipped');
      if (!need.length) return true;
      const first = need[0];
      const r = await this.askFolder(first, need.length, warn);
      warn = '';
      if (r === 'cancel') return false;
      if (r === 'skip') { first.status = 'skipped'; first.msg = ''; this.paint(); continue; }
      this.grantedDirs.push(r);
      for (const t of need) await this.tryAssign(t);
      this.paint();
      if (!first.dir) warn = `선택한 ‘${r.name}’ 폴더 안에 이 파일이 없습니다. 파일이 있는 폴더나 그 상위 폴더를 선택해 주세요.`;
    }
  },

  /* ---------- 저장 ---------- */
  async saveOut(it, buf) {
    const outName = this.unlockedName(it.name);
    if (!it.dir) { this.dlBucket.push({ it, name: outName, buf }); return; }
    let d = it.dir;
    for (const seg of it.path.slice(0, -1)) d = await d.getDirectoryHandle(seg);
    const fh = await d.getFileHandle(outName, { create: true });
    const ws = await fh.createWritable();   // 같은 이름이 있으면 덮어쓰기
    await ws.write(buf);
    await ws.close();
  },
  downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  // ZIP 만들기 (무압축 저장 방식, 한글 파일명 UTF-8)
  CRC_TABLE: (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })(),
  crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = this.CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  },
  makeZip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const nameB = enc.encode(f.name);
      const data = new Uint8Array(f.buf);
      const crc = this.crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, nameB, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, nameB);
      offset += 30 + nameB.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  },
  zipName() {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return `PDF_unlocked_${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.zip`;
  },
  flushDownloads() {
    const b = this.dlBucket; this.dlBucket = null;
    if (!b || !b.length) return 0;
    if (b.length === 1) {
      this.downloadBlob(new Blob([b[0].buf], { type: 'application/pdf' }), b[0].name);
      return 1;
    }
    const used = new Set();
    for (const f of b) {   // ZIP 안에서 이름이 겹치면 (2), (3) 붙이기
      let n = f.name, k = 2;
      const m = n.match(/^(.*?)(\.pdf)$/i);
      while (used.has(n.toLowerCase())) n = m ? `${m[1]}(${k++})${m[2]}` : `${f.name}(${k++})`;
      used.add(n.toLowerCase()); f.name = n;
    }
    const zn = this.zipName();
    this.downloadBlob(this.makeZip(b), zn);
    for (const f of b) f.it.msg = `${f.name} → ${zn}에 포함`;
    return b.length;
  },

  /* ---------- 처리 ---------- */
  async run() {
    if (this.running) return;
    let list = this.targets();
    if (!list.length) return;

    this.running = true; SoftwarePage.refresh();
    const stop = () => { this.running = false; SoftwarePage.refresh(); };

    if (SW_FS_OK) {
      list.forEach(i => { if (i.status === 'skipped') i.status = 'pending'; });
      this.paint();
      const ok = await this.ensureDirs(list);
      if (!ok) { stop(); toast('취소했습니다'); return; }
      list = list.filter(i => i.status !== 'skipped');
      if (!list.length) { stop(); return; }
    }

    if (SwEngine.state !== 'ok') toast('변환 엔진을 준비하는 중입니다');
    const engineOk = await SwEngine.ready;
    const workers = SwEngine.okCount();
    if (!engineOk || !workers) { stop(); toast('변환 엔진을 불러오지 못했습니다. 새로고침해 주세요'); return; }

    this.resetLock();
    const total = list.length;
    let done = 0;
    this.prog.show = true;
    this.setProgress(0, total);
    list.forEach(i => { i.status = 'pending'; i.msg = ''; });
    this.paint();

    this.dlBucket = [];
    const queue = list.slice();
    await Promise.all(Array.from({ length: workers }, async () => {
      while (queue.length) {
        const it = queue.shift();
        it.status = 'working'; this.paint();
        let res;
        try {
          const file = it.handle ? await it.handle.getFile() : it.file;
          const buf = await file.arrayBuffer();
          res = await SwEngine.run('unlock', buf, 'unlock');
        } catch (e) {
          res = { code: 'error', msg: '파일을 읽지 못했습니다: ' + e.message };
        }

        if (res.code === 'ok') {
          try {
            await this.saveOut(it, res.buf);
            it.status = 'done';
            it.msg = this.unlockedName(it.name) + ' 저장' + (res.warn ? ' (경미한 경고 있음)' : '');
          } catch (e) {
            it.status = 'error'; it.msg = '저장 실패: ' + e.message;
          }
        } else if (res.code === 'notenc') {
          it.status = 'notenc'; it.msg = '이미 제한이 없어 저장하지 않았습니다';
        } else if (res.code === 'password') {
          it.status = 'password'; it.msg = '파일을 여는 비밀번호가 걸려 있습니다';
        } else {
          it.status = 'error'; it.msg = res.msg ? String(res.msg).replace(/^.*?:\s*/, '') : '처리하지 못했습니다';
        }
        done++;
        this.setProgress(done, total);
        this.paint();
      }
    }));

    const zipped = this.flushDownloads() > 1;
    const okN = list.filter(i => i.status === 'done').length;
    const failN = list.filter(i => ['error', 'password'].includes(i.status)).length;
    if (okN) this.lockOpen = true;
    this.prog.left = `완료 ${okN}개` + (failN ? `, 실패 ${failN}개` : '') + (total - okN - failN ? `, 제한 없음 ${total - okN - failN}개` : '');
    stop();
    toast(okN ? (zipped ? `제한 해제 완료: ${okN}개를 ZIP 하나로 저장` : `제한 해제 완료: ${okN}개 저장`) : '저장된 파일이 없습니다');
  },
};

/* =========================================================
   화면 (App.pages.software)
   ========================================================= */
const SoftwarePage = {
  tab: 'print',       // 'print' 일괄 인쇄 / 'unlock' 제한 해제 (다른 메뉴에 갔다 와도 유지)

  tool() { return this.tab === 'unlock' ? SwUnlock : SwPrint; },
  showing(tab) { return App.page === 'software' && this.tab === tab && !!$('#sw-body'); },

  render(main) {
    // 처음 열 때 엔진 · 라이브러리 미리 불러오기 (실패해도 버튼을 누를 때 다시 시도·안내)
    SwEngine.init();
    SwLib.load('pdf', 'PDFLib').catch(() => {});
    SwLib.load('sortable', 'Sortable').catch(() => {});

    const busy = t => (t === 'print' ? SwPrint.busy : SwUnlock.running) ? '<span class="cnt">· 처리 중</span>' : '';
    const tab = (k, t) => `<button type="button" data-swtab="${k}" class="${this.tab === k ? 'active' : ''}">${t}${busy(k)}</button>`;
    main.innerHTML = `<div class="page-narrow"><div class="page-head pl-head no-bar"><h1>Software</h1>
      <div class="tabs">${tab('print', 'PDF 일괄 인쇄')}${tab('unlock', 'PDF 제한 해제')}</div></div>
      <div id="sw-body" class="sw-body"></div></div>`;
    this.paint();

    main.onclick = (e) => {
      const t = e.target.closest('[data-swtab]');
      if (t) { if (t.dataset.swtab !== this.tab) { this.tab = t.dataset.swtab; App.render(); } return; }
      this.tool().click(e);
    };
    main.onchange = (e) => this.tool().change(e);
  },
  // 탭 내용만 다시 그림 (제목·탭은 그대로)
  paint() {
    const body = $('#sw-body');
    if (App.page !== 'software' || !body) return;
    body.innerHTML = this.tool().html();
    if (this.tab === 'print') SwPrint.mount();
  },
  // 탭 이름의 '처리 중' 표시까지 바꿔야 할 때 (작업 시작·끝)
  refresh() { if (App.page === 'software' && $('#sw-body')) App.render(); },
  engineChanged() { if (this.showing('unlock')) this.paint(); },
};

/* 이 화면에서는 파일을 끌어 놓아도 브라우저가 PDF를 열며 앱을 떠나지 않게 막고,
   제한 해제 탭의 끌어 놓기 칸에 놓은 것만 받는다 (다른 화면에는 영향 없음) */
(() => {
  const here = () => App.page === 'software' && document.body.classList.contains('app-on') && !!$('#sw-body');
  const zone = () => (SoftwarePage.tab === 'unlock' ? $('#sw-drop') : null);
  ['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => {
    if (!here()) return;
    e.preventDefault();
    const z = zone();
    const inZone = !!(z && z.contains(e.target)) && !SwUnlock.running;
    if (z) z.classList.toggle('over', inZone);
    if (e.dataTransfer) e.dataTransfer.dropEffect = inZone ? 'copy' : 'none';
  }));
  document.addEventListener('dragleave', e => {
    if (!here()) return;
    const z = zone();
    if (z && (!e.relatedTarget || !z.contains(e.relatedTarget))) z.classList.remove('over');
  });
  document.addEventListener('drop', e => {
    if (!here()) return;
    e.preventDefault();
    const z = zone();
    if (z) z.classList.remove('over');
    if (z && z.contains(e.target) && e.dataTransfer) SwUnlock.drop(e.dataTransfer);
  });
})();

/* ---------- 스타일 (앱 색 변수만 사용 → 설정의 테마를 그대로 따라감) ---------- */
(() => {
  const st = document.createElement('style');
  st.textContent = `
.sw-body { padding-top: 16px; }
.sw-panel { padding: 18px 20px 16px; }
.sw-desc { font-size: 13.5px; color: var(--ink-soft); margin: 0 0 14px; }
.sw-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.sw-count { font-weight: 700; font-size: 15px; }
.sw-count small { font-weight: 500; color: var(--ink-mute); font-size: 13px; margin-left: 8px; }
.sw-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.sw-acts .btn, .sw-drop .btn { display: inline-flex; align-items: center; gap: 6px; }
.sw-acts .btn svg, .sw-drop .btn svg { width: 16px; height: 16px; flex: none; }

.sw-prog { margin-top: 14px; }
.sw-prog[hidden] { display: none; }
.sw-track { height: 8px; background: var(--accent-soft); border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.sw-fill { height: 100%; width: 0; background: var(--accent); border-radius: 999px; transition: width .25s ease; }
.sw-ptext { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-soft); margin-top: 5px; }

.sw-drop {
  display: flex; align-items: center; justify-content: center; gap: 22px;
  border: 2px dashed var(--line-strong); border-radius: 12px; background: var(--tint);
  padding: 26px 20px; margin-bottom: 16px; transition: border-color .2s, background .2s;
}
.sw-drop.over { border-color: var(--accent); background: var(--accent-soft); }
.sw-drop-txt { text-align: center; }
.sw-drop-txt p { margin: 0 0 10px; color: var(--ink-soft); }
.sw-lock { width: 46px; height: 64px; flex: none; color: var(--accent); }
.sw-lock .shackle { transition: transform .5s cubic-bezier(.3,1.6,.5,1); }
.sw-lock.open .shackle { transform: translateY(-9px); }
.sw-lock .key { transition: opacity .3s; }
.sw-lock.open .key { opacity: 0; }

.sw-list { list-style: none; margin: 14px 0 0; padding: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.sw-row { display: grid; grid-template-columns: 28px 1fr auto auto; gap: 12px; align-items: center; padding: 10px 14px; border-top: 1px solid var(--line); background: var(--surface); }
.sw-row:first-child { border-top: none; }
.sw-prow { grid-template-columns: 22px 1fr auto; }
.sw-row:hover { background: var(--tint); }
.sw-handle { display: flex; align-items: center; justify-content: center; color: var(--ink-mute); cursor: grab; height: 28px; }
.sw-handle:hover { color: var(--accent); }
.sw-handle svg { width: 16px; height: 16px; }
.sortable-ghost { opacity: .4; background: var(--accent-soft) !important; }
.sw-doc { width: 24px; height: 29px; color: var(--ink-mute); }
.s-done .sw-doc { color: var(--ok); }
.s-working .sw-doc { color: var(--accent); }
.sw-meta { min-width: 0; }
.sw-name { font-weight: 600; font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sw-sub { font-size: 12.5px; color: var(--ink-mute); display: flex; flex-wrap: wrap; gap: 2px 14px; }
.sw-sub .sw-msg { color: var(--danger); }
.s-done .sw-sub .sw-msg { color: var(--ok); }
.s-notenc .sw-sub .sw-msg { color: var(--ink-soft); }
.sw-x { font-size: 14px; padding: 4px 8px; }
.sw-x:disabled { visibility: hidden; }

.sw-foot { margin-top: 16px; font-size: 13px; color: var(--ink-soft); display: flex; align-items: center; gap: 8px; }
.sw-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-mute); flex: none; }
.sw-dot.ok { background: var(--ok); } .sw-dot.bad { background: var(--danger); } .sw-dot.wait { background: var(--warn); }

.sw-spin { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff; border-radius: 50%; display: inline-block; animation: sw-spin 1s linear infinite; }
@keyframes sw-spin { to { transform: rotate(360deg); } }

.sw-err-file { font-weight: 700; word-break: break-all; margin: 2px 0 6px; }
.sw-err-msg { font-size: 13.5px; color: var(--ink-soft); word-break: break-all; margin: 0 0 4px; }
.sw-dlg p { margin: 0 0 8px; font-size: 14px; color: var(--ink-soft); }
.sw-dlg .sw-fname { color: var(--ink); word-break: break-all; }
.sw-warn { background: var(--danger-soft); color: var(--danger); padding: 8px 12px; border-radius: 8px; font-size: 13.5px; margin-top: 6px; }
.sw-warn[hidden] { display: none; }
`;
  document.head.appendChild(st);
})();
