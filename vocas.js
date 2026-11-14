/* =========================================================
   vocas.js — 학생 › 단어 출제 (원본: Vocas.html)
   · 탭: 단어장 | 암기장 | 단어 시험 | 학생별 출제 | 시험지 책
   · 화면(설정 상자·미리보기 틀·표)은 style.css 의 테마 변수만 써서 설정 > 테마를 따라간다.
     종이(암기장·시험지·정답지) 색과 모양은 아래 PAPER_CSS 에 고정 → 테마와 상관없이 원본과 똑같이 인쇄된다.
   · 저장은 이 기기에만:
       단어장 → IndexedDB 'mg77_voca' (로그아웃하면 app.js 가 Vocas.wipe() 로 함께 지움)
       설정·학생 목록 → localStorage mg77_voca_* (mg77_ 접두사 → 로그아웃하면 함께 지워짐)
   · 인쇄는 다른 화면(출석부·단어 기록·표지+양식)과 같은 방식: 숨은 iframe 에 종이만 넣고 그 iframe 을 인쇄
   · 엑셀 해석(SheetJS, xlsx.js)은 단어장을 등록할 때만 불러온다
   ========================================================= */
const Vocas = (() => {
  'use strict';

  /* ---------- 설정값 (원본과 같음) ---------- */
  const DEFAULT_SETTINGS = { memo: '암기장', quiz: '시험지', answer: true, duplex: true };
  const MIN_WORDS = 20;        // 암기장: Day당 최소 단어 수
  const SET_MAX = 20;          // 한 세트(한 장)의 최대 단어 수. 넘으면 세트를 늘려 고르게 나눔
  const MAX_ERR_SHOW = 300;    // 오류 창에 보여 줄 최대 줄 수
  const LS_SET = 'mg77_voca_set';
  const LS_SLOTS = 'mg77_voca_slots';
  const IDB_NAME = 'mg77_voca';
  const XLSX_SRC = 'xlsx.js?v=0.18.5';

  // 페이지 치수 (mm)
  const PAGE_CONTENT_H = 296.5 - 20; // 위아래 여백 10mm씩
  const HEAD_H = 14;
  const SEC_FIXED = 3 + 6 + 5.5;     // 섹션 위 간격 + 회차줄 + 열이름줄
  const SAFETY = 5;
  const FONT_RATIO = 0.68;           // 줄 높이 대비 글자 크기
  const FONT_MAX_PT = 13;
  const WORD_MIN_RATIO = 0.22;       // 철자 칸 최소 비율 (번호 칸 제외한 너비 기준)
  const WORD_MAX_RATIO = 0.62;       // 철자 칸 최대 비율
  const TABLE_W = 186;               // 표 전체 너비 (210 - 좌우 여백 12mm×2)
  const GAP_W = 6;                   // 좌우 표 사이 간격

  // 단어 시험지 (고정 양식)
  const TEST_PER_PAGE = 50;          // 한 장 50문항
  const TEST_ROWS = 25;              // 좌우 각 25줄
  const TEST_ROW_H = (PAGE_CONTENT_H - HEAD_H - 3 - 8 - 3 - 6.5 - 4) / TEST_ROWS;
  const TEST_FONT_PT = 12;
  const TEST_COL = { no: 8, q: 39, a: 43 };   // 한쪽 90mm = 번호 + 문제 + 답
  const TYPE_NAMES = { ek: '영→한', ke: '한→영', mix: '혼합' };
  const BOOK_WIN = 7;                // 시험지 책: 한 회차 최대 과 수

  /* ---------- 종이 전용 글꼴 · CSS (테마와 무관하게 고정) ---------- */
  const PAPER_FONT = `"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans CJK KR","Noto Sans KR",sans-serif`;
  const PAPER_CSS = `
.vc-page{width:210mm;height:296.5mm;padding:10mm 12mm;background:#fff;color:#000;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;
  font-family:${PAPER_FONT};font-size:16px;font-weight:400;line-height:normal;letter-spacing:normal;text-align:left;white-space:normal}
.vc-page *{box-sizing:border-box}
.vc-page.vc-blank{align-items:center;justify-content:center}
.vc-blank-note{color:#9aa3b5;font-size:13pt;border:1px dashed #c3c9d6;padding:6mm 10mm;border-radius:3mm}
.vc-ph{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;height:14mm;border-bottom:.6mm solid #000;padding-bottom:1.5mm}
.vc-ph .lab{font-size:20pt;font-weight:700}
.vc-ph .ttl{font-size:24pt;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;padding:0 3mm}
.vc-ph .day{font-size:22pt;font-weight:700;text-align:right;white-space:nowrap}
.vc-ph .part{font-size:14pt;font-weight:400}
.vc-sec{margin-top:3mm}
.vc-sec table{width:100%;border-collapse:collapse;table-layout:fixed}
.vc-sec td,.vc-sec th{border:.25mm solid #000;padding:0 1.2mm;white-space:nowrap;overflow:hidden;vertical-align:middle}
.vc-sec .rt th{height:6mm;font-size:11pt;font-weight:700;background:#e6e6e6;text-align:center}
.vc-sec .ch th{height:5.5mm;font-size:9.5pt;font-weight:400;background:#f3f3f3;text-align:center}
.vc-sec td.no{text-align:center}
.vc-sec .ch th.no{font-size:8.5pt;padding:0 .4mm}
.vc-sec td.gap,.vc-sec th.gap{border:none;background:none}
.vc-sec td.w{font-weight:600}
.vc-sec tr.d{height:var(--rh);font-size:var(--fs)}
.vc-sec .c{height:calc(var(--rh) - .35mm);line-height:calc(var(--rh) - .35mm);overflow:hidden;white-space:nowrap}
.vc-sec .c.two{white-space:normal;word-break:keep-all;overflow-wrap:anywhere;line-height:calc((var(--rh) - .35mm) / 2)}
.vc-tinfo{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3mm}
.vc-tinfo th,.vc-tinfo td{border:.25mm solid #000;height:8mm;padding:0 2mm;font-size:11pt;white-space:nowrap;overflow:hidden}
.vc-tinfo th{background:#eeeeee;font-weight:700;text-align:center}
.vc-tinfo td.sc{text-align:right}
.vc-tsec .ch th{height:6.5mm;font-size:10.5pt}
.vc-tsec td.q{font-weight:600}
.vc-tsec td.a{color:#000}
.vc-page.vc-key .vc-tsec td.a{font-weight:700}
.vc-sec .rt th,.vc-sec .ch th,.vc-tinfo th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
`;
  function ensureCss() {
    if (document.getElementById('vc-paper-css')) return;
    const st = document.createElement('style');
    st.id = 'vc-paper-css';
    st.textContent = PAPER_CSS;
    document.head.appendChild(st);
  }

  /* =========================================================
     상태 (화면을 다시 그려도 그대로 남도록 모두 여기에)
     ========================================================= */
  let tab = 'lib';                       // lib | memo | test | stu | book
  let settings = loadSettings();
  let slots = loadSlots();
  let books = new Map();
  let loaded = false, loadP = null, storeOk = true;
  const memo = { book: '', db: null, day: '', cur: null };
  const tf = { book: '', range: '', count: '50', type: 'ek' };
  let testDoc = null;
  let stuDocs = null;
  const bf = { book: '', type: 'ek', mode: 'split' };
  let bookDoc = null;
  const cache = { memo: '', test: '', stu: '', book: '' };       // 글자 맞춤까지 끝난 미리보기 HTML
  const stat = { lib: null, memo: null, test: null, stu: null, book: null };
  let ro = null, dropHooked = false;

  /* =========================================================
     DB 해석 (1행 헤더, 2행부터 데이터)
     ========================================================= */
  const DAY_RE = /^\s*(day|unit|chapter|lesson)\s*[-_.]?\s*(\d+)\s*$/i;
  const HANGUL = /[가-힣ㄱ-ㆎ]/;
  const LATIN = /[A-Za-z]/;
  // 영어 칸 검사용: [발음], (발음) 같은 괄호 부분을 빼고 본 단어만 남김 (화면 표시는 원래 그대로)
  function coreWord(w) {
    return w.replace(/\[[^\]]*\]|\([^)]*\)|［[^］]*］|（[^）]*）/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // 시험용: [발음]만 뺌 (괄호 ( )는 숙어 일부일 수 있어 그대로 둠)
  function stripPron(s) {
    return s.replace(/\[[^\]]*\]|［[^］]*］/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function cellStr(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  // DB 형식 검사: 문제가 하나라도 있으면 errors에 담고, 호출한 쪽에서 파일 전체를 거부
  // (Day당 최소 개수는 암기장에서만 따로 검사)
  function parseRows(rows) {
    const errors = [];
    const header = (rows[0] || []).slice(0, 3).map(cellStr);
    let prefix = null;
    const map = new Map();

    // 헤더 검사: 1행은 데이터가 아니어야 하고, 2행이 첫 데이터여야 함
    if (DAY_RE.test(header[0] || '')) {
      errors.push(`1행: 헤더가 없습니다. 1행(A1: "${header[0]}")이 데이터입니다. 1행에 헤더(예: Day | 영어 | 뜻)를 넣어 주세요.`);
    }
    const a2 = cellStr((rows[1] || [])[0]);
    if (!DAY_RE.test(a2)) {
      errors.push(`2행: 첫 데이터가 아닙니다. A2 값이 "${a2 || '(빈칸)'}"입니다. 2행부터 Day 데이터가 시작되어야 합니다.`);
    }

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const a = cellStr(row[0]), w = cellStr(row[1]), m = cellStr(row[2]);
      if (!a && !w && !m) continue;            // 완전히 빈 행은 무시
      const line = r + 1;
      const mt = a.match(DAY_RE);
      if (!mt) {
        errors.push(`${line}행 A열: "${a || '(빈칸)'}"은(는) Day 번호 형식이 아닙니다. (예: Day 01, Unit 3, Chapter 12)`);
        continue;
      }
      const pf = mt[1];
      if (prefix === null) prefix = pf;
      else if (pf.toLowerCase() !== prefix.toLowerCase()) {
        errors.push(`${line}행 A열: "${a}" - 앞 행의 "${prefix}"와 다른 이름이 섞여 있습니다.`);
      }
      if (!w) errors.push(`${line}행 B열: 영어 단어가 비어 있습니다.`);
      else if (HANGUL.test(coreWord(w)) || !LATIN.test(coreWord(w))) errors.push(`${line}행 B열: "${w}"은(는) 영어 단어가 아닙니다. 열 순서(A: Day, B: 영어, C: 뜻)를 확인하세요. (발음은 [ ] 안에 넣으면 됩니다)`);
      if (!m) errors.push(`${line}행 C열: 뜻이 비어 있습니다.`);
      else if (!HANGUL.test(coreWord(m))) errors.push(`${line}행 C열: "${m}"은(는) 한글 뜻이 아닙니다. 열 순서(A: Day, B: 영어, C: 뜻)를 확인하세요.`);
      const day = parseInt(mt[2], 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push({ w, m, line });
    }

    const days = [...map.keys()].sort((x, y) => x - y);
    const pfx = prefix || 'Day';
    if (!days.length && !errors.length) errors.push('데이터가 없습니다. 2행부터 Day 데이터를 넣어 주세요.');
    for (const d of days) {
      const list = map.get(d);
      const seen = new Map();
      for (const it of list) {
        const k = coreWord(it.w).toLowerCase();
        if (seen.has(k)) errors.push(`${it.line}행: ${pfx} ${d}에 "${it.w}" 단어가 중복됩니다. (${seen.get(k)}행과 같음)`);
        else seen.set(k, it.line);
      }
    }
    return { header, prefix: pfx, map, days, errors };
  }
  function dayLabel(d) {
    return `${memo.db ? memo.db.parsed.prefix : 'Day'} ${d}`;
  }

  /* =========================================================
     섞기
     ========================================================= */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sameOrder(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i].w !== b[i].w) return false;
    return true;
  }
  // 기준(ref)과 똑같은 순서가 나오면 다시 섞기
  function shuffleDistinct(arr, ref, makeFn) {
    const make = makeFn || (() => shuffle(arr));
    let r = make();
    const distinctCount = new Set(arr.map(x => x.w)).size;
    if (distinctCount < 2) return r;
    for (let t = 0; t < 50 && sameOrder(r, ref); t++) r = make();
    return r;
  }
  // A·B 번갈아 (A부터), 남는 쪽은 끝에
  function interleave(a, b) {
    const out = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (i < a.length) out.push(a[i]);
      if (i < b.length) out.push(b[i]);
    }
    return out;
  }

  /* =========================================================
     암기장 출제 (원래 엑셀 매크로와 같은 방식)
     1회차: A그룹 랜덤          2회차: 1회차를 다시 섞음
     3회차: (1회차 섞음)·(5회차 섞음) 번갈아
     4회차: (2회차 섞음)·(6회차 섞음) 번갈아
     5회차: B그룹 랜덤          6회차: 5회차를 다시 섞음
     시험지: 암기장 각 칸의 단어를 한 번 더 섞고 뜻은 비움
     ========================================================= */
  function buildDay(words) {
    const n = words.length;
    const na = Math.ceil(n / 2);
    const A = words.slice(0, na), B = words.slice(na);

    const s1 = shuffle(A);
    const s2 = shuffleDistinct(s1, s1);
    const s5 = shuffle(B);
    const s6 = shuffleDistinct(s5, s5);
    const s3 = interleave(shuffle(s1), shuffle(s5));
    const s4 = shuffleDistinct(s3, s3, () => interleave(shuffle(s2), shuffle(s6)));

    const memoSecs = [
      { names: ['1회차', '2회차'], cols: [s1, s2], start: 1 },
      { names: ['3회차', '4회차'], cols: [s3, s4], start: 1 },
      { names: ['5회차', '6회차'], cols: [s5, s6], start: na + 1 },
    ].filter(s => s.cols[0].length > 0);

    const quiz = memoSecs.map(s => ({
      names: s.names,
      start: s.start,
      cols: s.cols.map(c => shuffleDistinct(c, c)),
    }));
    return { n, memo: memoSecs, quiz };
  }

  /* =========================================================
     암기장 페이지 나누기와 크기 계산
     ========================================================= */
  // 세트 나누기: 엑셀 순서대로, SET_MAX 이하로 고르게 (나머지는 앞 세트부터 1개씩)
  function splitSets(words) {
    const p = Math.ceil(words.length / SET_MAX);
    const q = Math.floor(words.length / p), r = words.length % p;
    const sets = [];
    let i = 0;
    for (let k = 0; k < p; k++) {
      const len = q + (k < r ? 1 : 0);
      sets.push(words.slice(i, i + len));
      i += len;
    }
    return sets;
  }
  // Day 전체 출제: 세트마다 독립적으로 6회차 구조 적용
  function buildDayAll(words) {
    return { n: words.length, sets: splitSets(words).map(buildDay) };
  }
  // 한 장(세트)의 줄 높이: 페이지를 위아래로 꽉 채움
  function rowHeightFor(sections) {
    const rows = sections.reduce((t, s) => t + s.cols[0].length, 0);
    const avail = PAGE_CONTENT_H - HEAD_H - sections.length * SEC_FIXED - SAFETY;
    return avail / rows;
  }

  /* =========================================================
     그리기 (공통)
     ========================================================= */
  // 양면 프린터용 빈 면 (화면에서만 안내 글자가 보임)
  function blankPage() {
    return `<div class="vc-page vc-blank"><div class="vc-blank-note vc-screen-only">빈 면 (양면 인쇄용)</div></div>`;
  }
  // 양면 프린터 사용 시, 묶음이 홀수 장이면 빈 면을 더해 다음 묶음이 새 종이에서 시작하게 함
  function padDuplex(pagesHtml) {
    if (settings.duplex && pagesHtml.length % 2 === 1) pagesHtml.push(blankPage());
    return pagesHtml.join('');
  }
  // 글자 크기에 맞춰 번호·철자 칸 너비(mm) 계산
  function textWidthMM(text, fontPt, weight) {
    const cv = textWidthMM.cv || (textWidthMM.cv = document.createElement('canvas'));
    const ctx = cv.getContext('2d');
    ctx.font = `${weight} ${fontPt}pt ${PAPER_FONT}`;
    return ctx.measureText(text).width * 25.4 / 96;
  }
  // 철자·뜻 칸 너비: 그 Day의 실제 글자 길이를 재서, 글자를 줄여야 하는 칸이 가장 적어지도록 나눔
  // (발음이 철자 쪽에 있든 뜻 쪽에 있든 자동으로 균형)
  function colWidths(fontPt, items) {
    const pad = 2.4 + 0.5;                               // 좌우 안쪽 여백 + 선
    const no = Math.max(5.5, textWidthMM('000', fontPt, 400) + pad, textWidthMM('번호', 8.5, 400) + 1.3);
    const half = (TABLE_W - GAP_W) / 2;
    const avail = half - no;
    const room = 1.2;                                    // 글자 뒤에 남길 여유(mm)
    const ws = items.map(it => textWidthMM(it.w, fontPt, 600) + pad + room);
    const ms = items.map(it => textWidthMM(it.m, fontPt, 400) + pad + room);
    const lo = avail * WORD_MIN_RATIO, hi = avail * WORD_MAX_RATIO, step = 0.25;
    // 후보 너비마다 [넘치는 칸 수, 넘치는 정도 합] 계산
    const cands = [];
    for (let word = lo; word <= hi + 1e-9; word += step) {
      const mean = avail - word;
      let cnt = 0, exc = 0;
      for (const w of ws) if (w > word) { cnt++; exc += w / word - 1; }
      for (const m of ms) if (m > mean) { cnt++; exc += m / mean - 1; }
      cands.push({ word, cnt, exc });
    }
    const best = Math.min(...cands.map(c => c.cnt));
    let pool = cands.filter(c => c.cnt === best);
    const bestExc = Math.min(...pool.map(c => c.exc));
    pool = pool.filter(c => c.exc <= bestExc + 1e-6);
    // 같은 조건이면 그 범위의 가운데 → 두 칸에 여유를 고르게
    const word = (pool[0].word + pool[pool.length - 1].word) / 2;
    return { no, word, meaning: avail - word };
  }
  function sectionHTML(s, showMeaning, rowH, fontPt, cw) {
    const len = s.cols[0].length;
    const cols = `<col style="width:${cw.no.toFixed(2)}mm"><col style="width:${cw.word.toFixed(2)}mm"><col style="width:${cw.meaning.toFixed(2)}mm">`;
    const cell = t => `<div class="c">${t}</div>`;
    let h = `<div class="vc-sec"><table style="--rh:${rowH.toFixed(3)}mm;--fs:${fontPt.toFixed(2)}pt">
      <colgroup>${cols}<col style="width:${GAP_W}mm">${cols}</colgroup>
      <tr class="rt"><th colspan="3">${s.names[0]}</th><th class="gap"></th><th colspan="3">${s.names[1]}</th></tr>
      <tr class="ch"><th class="no">번호</th><th>철자</th><th>뜻</th><th class="gap"></th><th class="no">번호</th><th>철자</th><th>뜻</th></tr>`;
    for (let i = 0; i < len; i++) {
      const L = s.cols[0][i], R = s.cols[1][i];
      const no = s.start + i;
      h += `<tr class="d">
        <td class="no">${cell(no)}</td><td class="w fit">${cell(esc(L.w))}</td><td class="fit">${cell(showMeaning ? esc(L.m) : '')}</td>
        <td class="gap"></td>
        <td class="no">${cell(no)}</td><td class="w fit">${cell(esc(R.w))}</td><td class="fit">${cell(showMeaning ? esc(R.m) : '')}</td></tr>`;
    }
    return h + `</table></div>`;
  }
  function dayPagesHTML(dayNum, built) {
    // 같은 Day 안에서는 가장 많은 세트 기준으로 줄 높이와 글자 크기를 통일
    const rowH = Math.min(...built.sets.map(b => rowHeightFor(b.memo)));
    const fontPt = Math.min(FONT_MAX_PT, rowH * FONT_RATIO * 2.835);
    const cw = colWidths(fontPt, built.sets.flatMap(b => b.memo[1].cols[0]));
    const total = built.sets.length;
    let html = '';
    const page = (sections, label, showMeaning, idx) => {
      const part = total > 1 ? ` <span class="part">(${idx + 1}/${total})</span>` : '';
      // 암기장·시험지는 각각 한 장 → 양면 프린터면 빈 면을 더해 서로 다른 종이로
      html += padDuplex([`<div class="vc-page">
        <div class="vc-ph"><div class="lab">${esc(label)}</div><div class="ttl">${esc(memo.db.name)}</div><div class="day">${esc(dayLabel(dayNum))}${part}</div></div>
        ${sections.map(s => sectionHTML(s, showMeaning, rowH, fontPt, cw)).join('')}
      </div>`]);
    };
    // 세트별로 암기장 → 시험지 번갈아
    built.sets.forEach((b, idx) => {
      page(b.memo, settings.memo, true, idx);
      page(b.quiz, settings.quiz, false, idx);
    });
    return html;
  }
  // 칸을 넘치는 글자만 처리 (줄 높이는 고정, 표는 절대 밀리지 않음)
  // 1단계: 한 줄 유지하며 75%까지 축소 → 2단계: 같은 높이 안에서 두 줄로 나누고 필요한 만큼 축소
  function fitCells(root) {
    const over = el => el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5;
    root.querySelectorAll('td.fit > .c').forEach(c => {
      c.classList.remove('two');
      c.style.fontSize = '';
      if (!c.textContent || !over(c)) return;
      const base = parseFloat(getComputedStyle(c).fontSize);
      let scale = 1;
      while (over(c) && scale > 0.76) {
        scale -= 0.05;
        c.style.fontSize = (base * scale) + 'px';
      }
      if (!over(c)) return;
      c.classList.add('two');
      const lineH = parseFloat(getComputedStyle(c).lineHeight);
      scale = Math.min(0.75, (lineH / 1.12) / base);
      c.style.fontSize = (base * scale) + 'px';
      while (over(c) && scale > 0.4) {
        scale -= 0.03;
        c.style.fontSize = (base * scale) + 'px';
      }
    });
    root.querySelectorAll('.vc-ph .ttl').forEach(t => {
      t.style.fontSize = '';
      const base = parseFloat(getComputedStyle(t).fontSize);
      let scale = 1;
      while (t.scrollWidth > t.clientWidth + 0.5 && scale > 0.4) {
        scale -= 0.05;
        t.style.fontSize = (base * scale) + 'px';
      }
    });
  }
  // 화면 밖 상자에서 글자 맞춤을 끝낸 HTML (전체 Day 인쇄처럼 미리보기에 없는 종이용)
  function fitHtml(html) {
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;visibility:hidden;pointer-events:none';
    box.innerHTML = html;
    document.body.appendChild(box);
    fitCells(box);
    const out = box.innerHTML;
    box.remove();
    return out;
  }

  /* =========================================================
     설정 / 저장소 (이 기기에만)
     ========================================================= */
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SET) || 'null');
      if (s) return Object.assign({}, DEFAULT_SETTINGS, s);
    } catch (e) {}
    return Object.assign({}, DEFAULT_SETTINGS);
  }
  function saveSettings() {
    try { localStorage.setItem(LS_SET, JSON.stringify(settings)); } catch (e) {}
  }
  function loadSlots() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SLOTS) || 'null');
      if (Array.isArray(s)) return s;
    } catch (e) {}
    return [];
  }
  function saveSlots() {
    try { localStorage.setItem(LS_SLOTS, JSON.stringify(slots)); } catch (e) {}
  }

  // 단어장 저장소 (IndexedDB, 실패하면 이번 창에서만 유지)
  const store = {
    db: null,
    ok: false,
    open() {
      return new Promise(res => {
        try {
          const r = indexedDB.open(IDB_NAME, 1);
          r.onupgradeneeded = () => r.result.createObjectStore('books', { keyPath: 'name' });
          r.onsuccess = () => { this.db = r.result; this.ok = true; res(true); };
          r.onerror = () => res(false);
        } catch (e) { res(false); }
      });
    },
    tx(mode, fn) {
      return new Promise((res, rej) => {
        if (!this.ok) return res(null);
        const t = this.db.transaction('books', mode);
        const req = fn(t.objectStore('books'));
        t.oncomplete = () => res(req ? req.result : null);
        t.onerror = () => rej(t.error);
      });
    },
    all() { return this.tx('readonly', s => s.getAll()); },
    put(book) { return this.tx('readwrite', s => s.put(book)); },
    del(name) { return this.tx('readwrite', s => s.delete(name)); },
  };
  function bookFromParsed(name, fileName, sheetName, parsed) {
    const days = parsed.days.map(d => [d, parsed.map.get(d).map(it => ({ w: it.w, m: it.m }))]);
    const total = days.reduce((t, [, ws]) => t + ws.length, 0);
    return { name, fileName, sheetName, prefix: parsed.prefix, header: parsed.header, days, total, savedAt: new Date().toISOString() };
  }
  function bookMap(book) {
    if (!book._map) book._map = new Map(book.days);
    return book._map;
  }
  function bookRangeText(book) {
    const ds = book.days.map(x => x[0]);
    return ds.length ? `${book.prefix} ${ds[0]} ~ ${book.prefix} ${ds[ds.length - 1]}` : '';
  }
  function sortedBooks() { return [...books.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')); }
  function loadBooks() {
    if (loadP) return loadP;
    loadP = (async () => {
      storeOk = await store.open();
      let list = [];
      if (storeOk) { try { list = (await store.all()) || []; } catch (e) { list = []; } }
      books = new Map(list.map(b => [b.name, b]));
      loaded = true;
    })();
    return loadP;
  }

  /* =========================================================
     엑셀 라이브러리 (등록할 때만 불러옴)
     ========================================================= */
  let xlsxP = null;
  function loadXlsx() {
    if (typeof XLSX !== 'undefined') return Promise.resolve();
    if (!xlsxP) xlsxP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = XLSX_SRC;
      s.onload = () => (typeof XLSX !== 'undefined' ? res() : rej(new Error('no XLSX')));
      s.onerror = () => { xlsxP = null; s.remove(); rej(new Error('load fail')); };
      document.head.appendChild(s);
    });
    return xlsxP;
  }

  /* =========================================================
     단어장 등록 / 삭제
     ========================================================= */
  function rowsFromWorkbook(wb) {
    const name = wb.SheetNames.includes('DB') ? 'DB' : wb.SheetNames[0];
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true });
    return { sheetName: name, rows: rows.map(r => [cellStr(r[0]), cellStr(r[1]), cellStr(r[2])]) };
  }
  function readAsBuffer(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = e => res(e.target.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsArrayBuffer(file);
    });
  }
  async function registerFiles(files) {
    if (!files.length) return;
    try { await loadXlsx(); }
    catch (e) { alertDlg('단어장 등록', '엑셀 해석 라이브러리(xlsx.js)를 불러오지 못했습니다.\n파일이 함께 올라가 있는지 확인하세요.'); return; }
    await loadBooks();
    const fails = [];
    let added = 0;
    for (const file of files) {
      const name = file.name.replace(/\.[^.]+$/, '');
      try {
        const wb = XLSX.read(new Uint8Array(await readAsBuffer(file)), { type: 'array' });
        const { sheetName, rows } = rowsFromWorkbook(wb);
        const parsed = parseRows(rows);
        if (parsed.errors.length) {
          fails.push({ file: file.name, errors: parsed.errors });
          continue;
        }
        if (books.has(name) && !await confirmDlg(`“${name}” 단어장이 이미 있습니다. 덮어쓸까요?\n(이 단어장을 쓰는 학생 목록은 그대로 연결됩니다)`, '덮어쓰기')) continue;
        const book = bookFromParsed(name, file.name, sheetName, parsed);
        await store.put(book);
        books.set(name, book);
        if (memo.book === name) clearMemo();        // 내용이 바뀐 단어장으로 만든 출제는 비움
        added++;
      } catch (err) {
        fails.push({ file: file.name, errors: ['엑셀 파일을 읽지 못했습니다: ' + err.message] });
      }
    }
    if (added) { setStatus('lib', `단어장 ${added}개를 등록했습니다.`); toast(`단어장 ${added}개를 등록했습니다`); }
    rerender();
    if (fails.length) {
      const errs = fails.length === 1 ? fails[0].errors : fails.flatMap(f => f.errors.map(e => `[${f.file}] ${e}`));
      showErrorBox('단어장을 등록하지 못했습니다', fails.map(f => f.file).join(', '), '아래 내용을 엑셀에서 고친 뒤 다시 등록하세요.', errs);
    }
  }
  async function deleteBook(name) {
    if (!await confirmDlg(`“${name}” 단어장을 삭제할까요?`, '삭제', true)) return;
    try { await store.del(name); } catch (e) {}
    books.delete(name);
    if (memo.book === name) { memo.book = ''; clearMemo(); }
    if (testDoc && testDoc.book === name) resetTest();
    if (bookDoc && bookDoc.book === name) resetBook();
    toast('단어장을 삭제했습니다');
    rerender();
  }
  function showErrorBox(title, sub, help, errors) {
    const shown = errors.slice(0, MAX_ERR_SHOW);
    const head = `${sub ? sub + ' · ' : ''}오류 ${errors.length}건`;
    Modal.open({
      title, size: 'lg', autofocus: false,
      body: `<div class="vc-err"><p class="vc-err-file">${esc(head)}</p><p class="vc-err-help">${esc(help)}</p>
        <ol class="vc-err-list">${shown.map(e => `<li>${esc(e)}</li>`).join('')}${errors.length > shown.length ? `<li>…외 ${errors.length - shown.length}건 (복사하면 전체가 복사됩니다)</li>` : ''}</ol></div>`,
      buttons: [
        { text: '오류 내용 복사', async onClick() {
          const text = head + '\n' + errors.join('\n');
          try { await navigator.clipboard.writeText(text); }
          catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
          }
          toast('오류 내용을 복사했습니다');
          return false;
        } },
        { text: '닫기', cls: 'primary', primary: true },
      ],
    });
  }
  function setStatus(k, text, bad) {
    stat[k] = text ? { text, bad: !!bad } : null;
    const el = $('#main [data-vc-status]');
    if (el && tab === k) { el.textContent = text || ''; el.classList.toggle('bad', !!bad); }
  }

  /* =========================================================
     암기장
     ========================================================= */
  function selectMemoBook(name) {
    memo.book = name;
    const book = books.get(name);
    if (!book) { clearMemo(); return; }
    const map = bookMap(book);
    const days = book.days.map(x => x[0]);
    // 암기장 규칙: Day당 최소 20개 (하나라도 모자라면 단어장 전체 사용 불가)
    const errors = days.filter(d => map.get(d).length < MIN_WORDS)
      .map(d => `${book.prefix} ${d}: 단어가 ${map.get(d).length}개입니다. Day당 최소 ${MIN_WORDS}개가 필요합니다.`);
    if (errors.length) {
      memo.book = '';
      clearMemo();
      showErrorBox('이 단어장으로는 암기장을 만들 수 없습니다', book.fileName, '암기장은 Day당 최소 20개가 필요합니다. (단어 시험 출제에는 그대로 쓸 수 있습니다)', errors);
      setStatus('memo', 'Day당 단어 수가 모자라 이 단어장은 암기장에 쓸 수 없습니다.', true);
      return;
    }
    memo.db = { name: book.name, fileName: book.fileName, sheetName: book.sheetName, parsed: { header: book.header, prefix: book.prefix, map, days, errors: [] } };
    memo.day = days.length ? String(days[0]) : '';
    memo.cur = null; cache.memo = '';
    setStatus('memo', '단어장을 골랐습니다.');
  }
  function clearMemo() {
    memo.db = null; memo.day = ''; memo.cur = null; cache.memo = '';
  }
  function memoInfoHtml() {
    const db = memo.db;
    if (!db) return '';
    const p = db.parsed;
    const total = p.days.reduce((t, d) => t + p.map.get(d).length, 0);
    const hdr = p.header.map(h => h || '(빈칸)').join(' | ');
    return `<div class="vc-info">
      <div class="row"><span>파일</span><span>${esc(db.fileName)}${db.sheetName ? ' · ' + esc(db.sheetName) + ' 시트' : ''}</span></div>
      <div class="row"><span>읽은 1행(헤더)</span><span class="ok">${esc(hdr)}</span></div>
      <div class="row"><span>전체 범위</span><span>${esc(dayLabel(p.days[0]))} ~ ${esc(dayLabel(p.days[p.days.length - 1]))}</span></div>
      <div class="row"><span>Day 수 / 단어 수</span><span>${p.days.length}개 / ${total}개</span></div></div>`;
  }
  function makeCurrent() {
    if (!memo.db) return;
    const d = parseInt(memo.day, 10);
    const words = memo.db.parsed.map.get(d);
    if (!words) { setStatus('memo', '선택한 Day를 찾을 수 없습니다.', true); return; }
    memo.cur = { day: d, built: buildDayAll(words) };
    cache.memo = '';
    const sets = memo.cur.built.sets.length;
    setStatus('memo', `${dayLabel(d)} 출제 완료 (${words.length}개${sets > 1 ? `, ${sets}세트` : ''})`);
    rerender();
  }
  function resetMemo() {
    memo.cur = null; cache.memo = '';
    setStatus('memo', '초기화했습니다.');
    rerender();
  }
  function printMemoAll() {
    const p = memo.db.parsed;
    const html = fitHtml(p.days.map(d => dayPagesHTML(d, buildDayAll(p.map.get(d)))).join(''));
    printPaper(html, `${memo.db.name}_전체`);
  }

  /* =========================================================
     단어 시험: 범위 해석과 문항 뽑기
     ========================================================= */
  // "3-7, 10", "3~7", "Day 3-7" 등 → Day 번호 목록
  function parseRange(text, book) {
    const errors = [];
    const map = bookMap(book);
    const t = String(text || '').replace(/[A-Za-z가-힣]/g, ' ').trim();
    if (!t) { return { days: [], errors: ['범위를 입력하세요. (예: 3-7, 10)'] }; }
    const set = new Set();
    for (const tok of t.split(/[,，]/)) {
      if (!tok.trim()) continue;
      const m = tok.match(/^\s*(\d+)\s*(?:[-~–]\s*(\d+))?\s*$/);
      if (!m) { errors.push(`범위 "${tok.trim()}"을(를) 이해할 수 없습니다. (예: 3-7, 10)`); continue; }
      let a = parseInt(m[1], 10), b = m[2] ? parseInt(m[2], 10) : a;
      if (b < a) [a, b] = [b, a];
      for (let d = a; d <= b; d++) {
        if (map.has(d)) set.add(d);
        else errors.push(`${book.prefix} ${d}은(는) 이 단어장에 없습니다. (${bookRangeText(book)})`);
      }
    }
    const days = [...set].sort((x, y) => x - y);
    if (!days.length && !errors.length) errors.push('범위를 입력하세요. (예: 3-7, 10)');
    return { days, errors };
  }
  // 범위 표시: 연속된 Day는 묶어서 "Day 3~7, 10"
  function rangeLabel(days, prefix) {
    const parts = [];
    for (let i = 0; i < days.length; i++) {
      let j = i;
      while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
      parts.push(i === j ? `${days[i]}` : `${days[i]}~${days[j]}`);
      i = j;
    }
    return `${prefix} ${parts.join(', ')}`;
  }
  // Day별로 고르게 배분 (나머지는 무작위 Day에 1개씩, 단어가 모자란 Day는 전부 넣고 남은 수를 다시 나눔)
  function allocate(counts, n) {
    const alloc = new Map(counts.map(([d]) => [d, 0]));
    let active = counts.filter(([, c]) => c > 0).map(([d]) => d);
    const cap = new Map(counts);
    let rem = n;
    while (rem > 0 && active.length) {
      const k = active.length, q = Math.floor(rem / k), r = rem % k;
      const order = shuffle(active);
      const want = new Map(order.map((d, i) => [d, q + (i < r ? 1 : 0)]));
      const capped = active.filter(d => alloc.get(d) + want.get(d) >= cap.get(d));
      if (!capped.length) {
        for (const d of active) alloc.set(d, alloc.get(d) + want.get(d));
        rem = 0;
      } else {
        for (const d of capped) {
          rem -= cap.get(d) - alloc.get(d);
          alloc.set(d, cap.get(d));
        }
        active = active.filter(d => !capped.includes(d));
      }
    }
    return alloc;
  }
  // 시험 만들기 → { test } 또는 { errors }
  function makeTest(bookName, rangeText, countText, type) {
    const book = books.get(bookName);
    if (!book) return { errors: [bookName ? `“${bookName}” 단어장이 없습니다. 단어장 탭에서 등록하세요.` : '단어장을 고르세요.'] };
    const { days, errors } = parseRange(rangeText, book);
    const n = parseInt(countText, 10);
    if (!(n >= 1)) errors.push('문항 수를 1 이상으로 입력하세요.');
    if (errors.length) return { errors };
    const map = bookMap(book);
    const avail = days.reduce((t, d) => t + map.get(d).length, 0);
    if (n > avail) return { errors: [`문항 수(${n})가 범위 안 단어 수(${avail}개)보다 많습니다.`] };

    const alloc = allocate(days.map(d => [d, map.get(d).length]), n);
    let picked = [];
    for (const d of days) picked = picked.concat(shuffle(map.get(d)).slice(0, alloc.get(d)));
    picked = shuffle(picked);
    // 혼합: 정확히 반반 (홀수면 영→한 1개 더)
    const ekSet = new Set(type === 'mix' ? shuffle(picked.map((_, i) => i)).slice(0, Math.ceil(n / 2)) : []);
    const items = picked.map((it, i) => {
      const en = stripPron(it.w), kr = stripPron(it.m);
      const ek = type === 'ek' || (type === 'mix' && ekSet.has(i));
      return ek ? { q: en, a: kr } : { q: kr, a: en };
    });
    return { test: { book: book.name, prefix: book.prefix, days, range: rangeLabel(days, book.prefix), n, type, items } };
  }
  function todayText() {
    const d = new Date();
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  }

  /* =========================================================
     단어 시험: 그리기 (50칸 고정 양식)
     ========================================================= */
  function testPageHTML(t, name, pageIdx, pages, isKey) {
    const cols = `<col style="width:${TEST_COL.no}mm"><col style="width:${TEST_COL.q}mm"><col style="width:${TEST_COL.a}mm">`;
    const cell = s => `<div class="c">${s}</div>`;
    const base = pageIdx * TEST_PER_PAGE;
    const side = k => {
      const i = base + k;
      const it = t.items[i];
      if (!it) return `<td class="no">${cell('')}</td><td class="q fit">${cell('')}</td><td class="a fit">${cell('')}</td>`;
      return `<td class="no">${cell(i + 1)}</td><td class="q fit">${cell(esc(it.q))}</td><td class="a fit">${cell(isKey ? esc(it.a) : '')}</td>`;
    };
    let rows = '';
    for (let r = 0; r < TEST_ROWS; r++) rows += `<tr class="d">${side(r)}<td class="gap"></td>${side(r + TEST_ROWS)}</tr>`;
    const part = pages > 1 ? `<span class="part">(${pageIdx + 1}/${pages})</span>` : '';
    return `<div class="vc-page${isKey ? ' vc-key' : ''}">
      <div class="vc-ph"><div class="lab">${isKey ? '정답지' : '단어 시험'}</div><div class="ttl">${esc(t.book)}</div><div class="day">${part}</div></div>
      <table class="vc-tinfo"><colgroup><col style="width:8%"><col style="width:24%"><col style="width:8%"><col style="width:18%"><col style="width:8%"><col style="width:16%"><col style="width:8%"><col style="width:10%"></colgroup>
        <tr><th>범위</th><td>${esc(t.range)}</td><th>이름</th><td>${esc(name || '')}</td><th>날짜</th><td>${esc(todayText())}</td><th>점수</th><td class="sc">/ ${t.n}</td></tr></table>
      <div class="vc-sec vc-tsec"><table style="--rh:${TEST_ROW_H.toFixed(3)}mm;--fs:${TEST_FONT_PT}pt">
        <colgroup>${cols}<col style="width:${GAP_W}mm">${cols}</colgroup>
        <tr class="ch"><th class="no">번호</th><th>문제</th><th>답</th><th class="gap"></th><th class="no">번호</th><th>문제</th><th>답</th></tr>
        ${rows}
      </table></div>
    </div>`;
  }
  // 학생 한 명(또는 시험 하나)의 묶음: 시험지 → (정답지), 양면이면 각각 새 종이에서 시작
  function testDocHTML(t, name) {
    const pages = Math.ceil(t.n / TEST_PER_PAGE);
    const testPages = [], keyPages = [];
    for (let p = 0; p < pages; p++) {
      testPages.push(testPageHTML(t, name, p, pages, false));
      keyPages.push(testPageHTML(t, name, p, pages, true));
    }
    return padDuplex(testPages) + (settings.answer ? padDuplex(keyPages) : '');
  }
  function testHints() {
    const book = books.get(tf.book);
    const r = { range: book ? `전체: ${bookRangeText(book)}` : '', count: '' };
    if (!book) return r;
    const { days, errors } = parseRange(tf.range, book);
    if (errors.length || !days.length) return r;
    const map = bookMap(book);
    r.count = `범위 안 단어 ${days.reduce((t, d) => t + map.get(d).length, 0)}개`;
    return r;
  }
  function updateTestHints(main) {
    const h = testHints();
    const a = $('[data-vc-hint="range"]', main), b = $('[data-vc-hint="count"]', main);
    if (a) a.textContent = h.range;
    if (b) b.textContent = h.count;
  }
  function runTest() {
    const r = makeTest(tf.book, tf.range, tf.count, tf.type);
    if (r.errors) {
      resetTest();
      showErrorBox('시험을 출제하지 못했습니다', tf.book, '출제 조건을 확인하세요.', r.errors);
      setStatus('test', '출제 조건을 확인하세요.', true);
      rerender();
      return;
    }
    testDoc = r.test; cache.test = '';
    setStatus('test', `${testDoc.range} · ${testDoc.n}문항 · ${TYPE_NAMES[testDoc.type]} 출제 완료`);
    rerender();
  }
  function resetTest() { testDoc = null; cache.test = ''; }

  /* =========================================================
     학생별 출제
     ========================================================= */
  function newSlot(from) {
    return Object.assign({ on: true, name: '', book: '', range: '', n: 50, type: 'ek' }, from || {}, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
  }
  function slotsHtml() {
    const names = sortedBooks().map(b => b.name);
    if (!slots.length) return `<tr><td colspan="7" class="vc-none">학생이 없습니다. 왼쪽 <b>학생 추가</b>를 누르세요.</td></tr>`;
    const types = Object.entries(TYPE_NAMES);
    return slots.map(s => {
      const missing = s.book && !books.has(s.book) && loaded;
      const opts = (missing ? [`<option value="${esc(s.book)}" selected>${esc(s.book)} (삭제됨)</option>`] : [])
        .concat([`<option value="">단어장 선택</option>`], names.map(b => `<option value="${esc(b)}"${b === s.book ? ' selected' : ''}>${esc(b)}</option>`)).join('');
      return `<tr data-id="${esc(s.id)}">
        <td class="ck"><input type="checkbox" data-k="on" ${s.on ? 'checked' : ''} aria-label="선택"></td>
        <td class="nm"><input type="text" data-k="name" value="${esc(s.name)}" placeholder="이름" autocomplete="off"></td>
        <td class="bk"><select data-k="book" class="${missing ? 'missing' : ''}" title="${missing ? '삭제된 단어장입니다. 다시 등록하거나 다른 단어장을 고르세요.' : ''}">${opts}</select></td>
        <td class="rg"><input type="text" data-k="range" value="${esc(s.range)}" placeholder="예: 3-7" autocomplete="off"></td>
        <td class="ct"><input type="number" data-k="n" min="1" value="${esc(s.n)}"></td>
        <td class="tp"><select data-k="type">${types.map(([k, v]) => `<option value="${k}"${k === s.type ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
        <td class="ac"><button type="button" class="btn sm" data-slot="copy">복사</button><button type="button" class="btn sm danger" data-slot="del">삭제</button></td>
      </tr>`;
    }).join('');
  }
  function onSlotInput(e) {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || !e.target.dataset.k) return false;
    const s = slots.find(x => x.id === tr.dataset.id);
    if (!s) return true;
    const k = e.target.dataset.k;
    s[k] = k === 'on' ? e.target.checked : e.target.value;
    if (k === 'book') e.target.classList.toggle('missing', !!s.book && !books.has(s.book));
    saveSlots();
    return true;
  }
  async function onSlotClick(btn) {
    const tr = btn.closest('tr[data-id]');
    const i = slots.findIndex(x => x.id === tr.dataset.id);
    if (i < 0) return;
    if (btn.dataset.slot === 'del') {
      if (!await confirmDlg(`${slots[i].name || '이 학생'}을(를) 목록에서 삭제할까요?`, '삭제', true)) return;
      slots.splice(i, 1);
    } else {
      slots.splice(i + 1, 0, newSlot(Object.assign({}, slots[i], { name: '' })));
    }
    saveSlots();
    rerender();
  }
  function addSlot() {
    const last = slots[slots.length - 1];
    slots.push(newSlot(last ? { book: last.book, n: last.n, type: last.type } : null));
    saveSlots();
    rerender();
    const inputs = $$('#main [data-vc-slots] input[data-k="name"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }
  function toggleSlots() {
    const all = slots.length && slots.every(s => s.on);
    slots.forEach(s => { s.on = !all; });
    saveSlots();
    rerender();
  }
  function runStudents() {
    const chosen = slots.filter(s => s.on);
    if (!chosen.length) { setStatus('stu', '체크한 학생이 없습니다.', true); return; }
    const docs = [], errors = [];
    chosen.forEach(s => {
      const who = s.name || `${slots.indexOf(s) + 1}번째 줄`;
      const r = makeTest(s.book, s.range, s.n, s.type);
      if (r.errors) r.errors.forEach(e => errors.push(`[${who}] ${e}`));
      else docs.push({ name: s.name, test: r.test });
    });
    if (errors.length) {
      stuDocs = null; cache.stu = '';
      showErrorBox('학생별 출제를 하지 못했습니다', `체크한 학생 ${chosen.length}명`, '아래 학생의 조건을 고친 뒤 다시 출제하세요. (오류가 있으면 아무도 출제하지 않습니다)', errors);
      setStatus('stu', '학생 조건을 확인하세요.', true);
      rerender();
      return;
    }
    stuDocs = docs; cache.stu = '';
    setStatus('stu', `${docs.length}명 출제 완료`);
    rerender();
  }
  function exportSlots() {
    const blob = new Blob([JSON.stringify({ app: 'vocaMaker', slots }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `학생목록_${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importSlots(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.slots;
      if (!Array.isArray(list)) throw new Error('학생 목록 파일이 아닙니다.');
      if (slots.length && !await confirmDlg('지금 학생 목록을 가져온 목록으로 바꿀까요?', '바꾸기')) return;
      slots = list.map(s => newSlot({ on: !!s.on, name: String(s.name || ''), book: String(s.book || ''), range: String(s.range || ''), n: s.n || 50, type: TYPE_NAMES[s.type] ? s.type : 'ek' }));
      saveSlots();
      setStatus('stu', `학생 ${slots.length}명을 가져왔습니다.`);
      rerender();
    } catch (err) {
      showErrorBox('학생 목록을 가져오지 못했습니다', file.name, '내보내기로 만든 파일인지 확인하세요.', [err.message]);
    }
  }

  /* =========================================================
     시험지 책 만들기
     범위: 1-2, 1-3 … 1-7 → 2-8, 3-9 … (7과씩 밀기) → 끝에서 45-50 … 49-50
     (Day 번호가 아니라 단어장의 Day 순서 기준이므로 빠진 Day가 있어도 동작)
     ========================================================= */
  function bookWindows(ds) {
    const N = ds.length, wins = [];
    for (let e = 1; e < N; e++) wins.push(ds.slice(Math.max(0, e - (BOOK_WIN - 1)), e + 1));
    for (let s = Math.max(1, N - (BOOK_WIN - 1)); s <= N - 2; s++) wins.push(ds.slice(s, N));
    return wins;
  }
  // 회차 하나: 50문항(모자라면 범위 안 전체), 항상 랜덤
  function makeBookTest(book, days, type) {
    const map = bookMap(book);
    const avail = days.reduce((t, d) => t + map.get(d).length, 0);
    const n = Math.min(TEST_PER_PAGE, avail);
    const alloc = allocate(days.map(d => [d, map.get(d).length]), n);
    let picked = [];
    for (const d of days) picked = picked.concat(shuffle(map.get(d)).slice(0, alloc.get(d)));
    picked = shuffle(picked);
    const ekSet = new Set(type === 'mix' ? shuffle(picked.map((_, i) => i)).slice(0, Math.ceil(n / 2)) : []);
    const items = picked.map((it, i) => {
      const en = stripPron(it.w), kr = stripPron(it.m);
      const ek = type === 'ek' || (type === 'mix' && ekSet.has(i));
      return ek ? { q: en, a: kr } : { q: kr, a: en };
    });
    return { book: book.name, prefix: book.prefix, days, range: rangeLabel(days, book.prefix), n, type, items };
  }
  // 책 한 장 (단어 시험 양식과 같고, 이름·날짜 칸만 없음)
  function bookPageHTML(t, isKey) {
    const cols = `<col style="width:${TEST_COL.no}mm"><col style="width:${TEST_COL.q}mm"><col style="width:${TEST_COL.a}mm">`;
    const cell = s => `<div class="c">${s}</div>`;
    const side = i => {
      const it = t.items[i];
      if (!it) return `<td class="no">${cell('')}</td><td class="q fit">${cell('')}</td><td class="a fit">${cell('')}</td>`;
      return `<td class="no">${cell(i + 1)}</td><td class="q fit">${cell(esc(it.q))}</td><td class="a fit">${cell(isKey ? esc(it.a) : '')}</td>`;
    };
    let rows = '';
    for (let r = 0; r < TEST_ROWS; r++) rows += `<tr class="d">${side(r)}<td class="gap"></td>${side(r + TEST_ROWS)}</tr>`;
    return `<div class="vc-page${isKey ? ' vc-key' : ''}">
      <div class="vc-ph"><div class="lab">${isKey ? '정답지' : '단어 시험'}</div><div class="ttl">${esc(t.book)}</div><div class="day"></div></div>
      <table class="vc-tinfo"><colgroup><col style="width:12%"><col style="width:58%"><col style="width:12%"><col style="width:18%"></colgroup>
        <tr><th>범위</th><td>${esc(t.range)}</td><th>점수</th><td class="sc">/ ${t.n}</td></tr></table>
      <div class="vc-sec vc-tsec"><table style="--rh:${TEST_ROW_H.toFixed(3)}mm;--fs:${TEST_FONT_PT}pt">
        <colgroup>${cols}<col style="width:${GAP_W}mm">${cols}</colgroup>
        <tr class="ch"><th class="no">번호</th><th>문제</th><th>답</th><th class="gap"></th><th class="no">번호</th><th>문제</th><th>답</th></tr>
        ${rows}
      </table></div>
    </div>`;
  }
  function bookHintHtml() {
    const book = books.get(bf.book);
    if (!book) return '';
    const wins = bookWindows(book.days.map(x => x[0]));
    return `<b>${esc(bookRangeText(book))} · 총 ${wins.length}회차</b><br>` +
      wins.map((w, i) => `${i + 1}회: ${esc(w[0] === w[w.length - 1] ? `${w[0]}` : `${w[0]}-${w[w.length - 1]}`)}`).join(' · ');
  }
  function runBook() {
    const name = bf.book;
    const book = books.get(name);
    if (!book) {
      resetBook();
      showErrorBox('시험지 책을 만들지 못했습니다', name, '단어장 탭에서 단어장을 등록하세요.', [name ? `“${name}” 단어장이 없습니다.` : '단어장을 고르세요.']);
      setStatus('book', '단어장을 고르세요.', true);
      rerender();
      return;
    }
    const ds = book.days.map(x => x[0]);
    if (ds.length < 2) {
      resetBook();
      showErrorBox('시험지 책을 만들지 못했습니다', name, 'Day가 2개 이상인 단어장이 필요합니다.', [`이 단어장은 ${book.prefix}가 ${ds.length}개뿐입니다.`]);
      setStatus('book', 'Day가 2개 이상이어야 합니다.', true);
      rerender();
      return;
    }
    const type = bf.type;
    bookDoc = { book: book.name, type, tests: bookWindows(ds).map(days => makeBookTest(book, days, type)) };
    cache.book = '';
    setStatus('book', `${bookDoc.tests.length}회차 · ${TYPE_NAMES[type]} 출제 완료 (시험지 ${bookDoc.tests.length}장 + 답지 ${bookDoc.tests.length}장)`);
    rerender();
  }
  function resetBook() { bookDoc = null; cache.book = ''; }
  function bookPreviewHtml() {
    const testPages = bookDoc.tests.map(t => bookPageHTML(t, false));
    const keyPages = bookDoc.tests.map(t => bookPageHTML(t, true));
    // 통합본 + 양면이면 답지가 시험지 뒷면에 오지 않게 빈 면 추가
    const testHtml = bf.mode === 'one' ? padDuplex(testPages) : testPages.join('');
    return `<div class="vc-grp" data-grp="test">${testHtml}</div><div class="vc-grp" data-grp="key">${keyPages.join('')}</div>`;
  }
  // what: 'test' | 'key' | 'one'
  function printBook(what) {
    if (!bookDoc || !cache.book) { setStatus('book', '출제가 되지 않아 인쇄할 수 없습니다.', true); return; }
    const suffix = { test: '시험지', key: '답지', one: '통합본' }[what];
    const t = document.createElement('template');
    t.innerHTML = cache.book;
    const grp = k => { const g = t.content.querySelector(`[data-grp="${k}"]`); return g ? g.innerHTML : ''; };
    const html = what === 'test' ? grp('test') : what === 'key' ? grp('key') : grp('test') + grp('key');
    printPaper(html, `${bookDoc.book}_${TYPE_NAMES[bookDoc.type].replace('→', '')}_${suffix}`);
  }

  /* =========================================================
     인쇄: 종이만 담은 숨은 iframe (출석부·단어 기록·표지+양식과 같은 방식)
     ========================================================= */
  function printPaper(bodyHtml, title) {
    if (!bodyHtml) return;
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>${PAPER_CSS}
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .vc-screen-only { display: none !important; }
        .vc-page { break-after: page; page-break-after: always; }
        .vc-page:last-child { break-after: auto; page-break-after: auto; }
      </style></head><body>${bodyHtml}</body></html>`);
    doc.close();
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      const t0 = document.title;
      document.title = title;                 // 저장 파일 이름
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally {
        document.title = t0;
        setTimeout(() => fr.remove(), 1000);
      }
    };
    if (doc.readyState === 'complete') setTimeout(go, 60);
    else fr.contentWindow.addEventListener('load', () => setTimeout(go, 60));
    setTimeout(go, 3000);
  }
  // 미리보기(글자 맞춤 끝난 HTML)에서 종이만 꺼내 한 줄로 (묶음 상자를 풀어 페이지 나눔이 정확하게)
  function flatPages(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return [...t.content.querySelectorAll('.vc-page')].map(p => p.outerHTML).join('');
  }

  /* =========================================================
     화면
     ========================================================= */
  const TABS = [['lib', '단어장'], ['memo', '암기장'], ['test', '단어 시험'], ['stu', '학생별 출제'], ['book', '시험지 책']];
  const SUBS = {
    lib: '엑셀 단어장을 등록한 뒤 위 탭에서 암기장 · 시험지를 출제하세요.',
    memo: 'Day별 6회차 암기장과 시험지를 만듭니다.',
    test: '범위를 정해 50문항 시험지를 출제합니다.',
    stu: '학생마다 단어장과 범위를 저장해 한꺼번에 출제합니다.',
    book: '누적 범위(최대 7과)로 전체 시험지와 답지를 책으로 만듭니다.',
  };
  const EMPTY = {
    memo: '단어장과 Day를 고르고 <b>출제</b>를 누르세요.',
    test: '단어장과 범위를 정하고 <b>출제</b>를 누르세요.',
    stu: '학생을 체크하고 <b>선택한 학생 출제</b>를 누르세요.',
    book: '단어장과 유형을 고르고 <b>출제</b>를 누르세요.',
  };
  // 탭마다 미리보기 HTML (출제가 없으면 '')
  const PREVIEW = {
    memo: () => memo.cur && memo.db ? dayPagesHTML(memo.cur.day, memo.cur.built) : '',
    test: () => testDoc ? testDocHTML(testDoc, '') : '',
    stu: () => stuDocs ? stuDocs.map(d => testDocHTML(d.test, d.name)).join('') : '',
    book: () => bookDoc ? bookPreviewHtml() : '',
  };

  function rerender() { if (App.page === 'vocas') App.render(); }
  const bookOpts = (sel, emptyText) => {
    const list = sortedBooks();
    if (!list.length) return `<option value="">${esc(loaded ? '등록된 단어장 없음' : '불러오는 중…')}</option>`;
    return (emptyText ? `<option value="">${esc(emptyText)}</option>` : '') +
      list.map(b => `<option value="${esc(b.name)}"${b.name === sel ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
  };
  const radios = (name, cur) => `<div class="vc-radios">${Object.entries(TYPE_NAMES).map(([k, v]) =>
    `<label class="chk"><input type="radio" name="${name}" value="${k}"${k === cur ? ' checked' : ''}>${v}</label>`).join('')}</div>`;
  const optChk = (k, text) => `<label class="chk"><input type="checkbox" data-opt="${k}"${settings[k] ? ' checked' : ''}>${text}</label>`;
  const statusHtml = (k) => `<div class="vc-status${stat[k] && stat[k].bad ? ' bad' : ''}" data-vc-status role="status">${stat[k] ? esc(stat[k].text) : ''}</div>`;
  const dis = (on) => on ? '' : ' disabled';

  // 단어 시험·시험지 책은 단어장이 하나라도 있으면 기본으로 첫 단어장 (원본과 같음)
  function fixDefaults() {
    const first = sortedBooks()[0];
    if (!books.has(tf.book)) tf.book = first ? first.name : '';
    if (!books.has(bf.book)) bf.book = first ? first.name : '';
    if (memo.book && !books.has(memo.book)) { memo.book = ''; clearMemo(); }
  }

  /* ---------- 탭별 왼쪽 설정 상자 ---------- */
  function libHtml() {
    const list = sortedBooks();
    const rows = list.length ? list.map(b => `<tr>
        <td><b>${esc(b.name)}</b></td><td>${esc(bookRangeText(b))}</td>
        <td class="num">${b.days.length}</td><td class="num">${b.total}</td>
        <td>${esc(new Date(b.savedAt).toLocaleDateString('ko-KR'))}</td>
        <td class="num"><button type="button" class="btn sm danger" data-del="${esc(b.name)}">삭제</button></td></tr>`).join('')
      : `<tr><td colspan="6" class="vc-none">${loaded ? '등록된 단어장이 없습니다. 오른쪽 위 <b>단어장 등록</b>으로 엑셀 파일을 등록하세요.' : '불러오는 중…'}</td></tr>`;
    return `<div class="panel vc-lib">
        <div class="vc-lib-top">
          <div>
            <h2>단어장 관리<span class="sub">${list.length ? list.length + '개' : ''}</span></h2>
            <p class="vc-guide"><b>1행</b> 헤더, <b>2행부터</b> 데이터 (A: Day | B: 영어 | C: 뜻). DB 시트가 없으면 첫 번째 시트를 읽습니다.<br>
              단어장 이름은 파일 이름으로 정해지고, 같은 이름을 다시 등록하면 덮어씁니다.<br>
              등록한 단어장은 <b>이 기기(브라우저)에만</b> 저장되며, 로그아웃하면 함께 지워집니다.</p>
          </div>
          <div class="vc-drop" data-vc-drop tabindex="0" role="button"><b>단어장 등록</b><small>엑셀 파일을 누르거나 끌어다 놓으세요</small></div>
        </div>
        <input type="file" data-vc-file accept=".xlsx,.xlsm,.xls" multiple hidden>
        <div class="tbl-wrap"><table class="tbl compact vc-lib-tbl">
          <thead><tr><th>단어장 이름</th><th>범위</th><th class="num">Day 수</th><th class="num">단어 수</th><th>등록일</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        ${storeOk ? '' : '<div class="vc-warn">브라우저 저장소를 쓸 수 없어, 등록한 단어장이 창을 닫으면 사라집니다.</div>'}
        ${statusHtml('lib')}
      </div>`;
  }
  function memoSide() {
    const db = memo.db, p = db && db.parsed;
    const dayOpts = p ? p.days.map(d => {
      const n = p.map.get(d).length;
      const sets = Math.ceil(n / SET_MAX);
      return `<option value="${d}"${String(d) === String(memo.day) ? ' selected' : ''}>${esc(dayLabel(d))} (${n}개${sets > 1 ? `, ${sets}세트` : ''})</option>`;
    }).join('') : '<option>단어장을 먼저 고르세요</option>';
    const has = !!(p && p.days.length);
    return `<div class="pr-sec"><h2>단어장</h2>
        <select data-f="memoBook" aria-label="단어장 선택">${bookOpts(memo.book, '단어장 선택')}</select>
        ${memoInfoHtml()}</div>
      <div class="pr-sec"><h2>출제</h2>
        <select data-f="memoDay" aria-label="Day 선택"${dis(has)}>${dayOpts}</select>
        <div class="vc-btns three">
          <button type="button" class="btn primary" data-act="memo-make"${dis(has)}>출제</button>
          <button type="button" class="btn" data-act="memo-make"${dis(has && memo.cur)}>다시 섞기</button>
          <button type="button" class="btn" data-act="memo-reset">초기화</button>
        </div></div>
      <div class="pr-sec"><h2>인쇄</h2>
        <div class="vc-checks">${optChk('duplex', '양면 프린터 사용')}</div>
        <div class="vc-btns">
          <button type="button" class="btn primary wide" data-act="memo-print"${dis(has && memo.cur)}>현재 Day 인쇄 / PDF</button>
          <button type="button" class="btn wide" data-act="memo-print-all"${dis(has)}>전체 Day 한 번에 인쇄 / PDF</button>
        </div>
        <div class="pr-note">인쇄 창에서 <b>용지 A4</b>, <b>배율 100%(실제 크기)</b>, <b>여백 없음</b>으로 맞춰 주세요. 머리글 칸 회색이 안 나오면 <b>배경 그래픽</b>을 켜 주세요.</div></div>
      <div class="pr-sec"><h2>상단 문구</h2>
        <div class="vc-set">
          <label for="vc-set-memo">암기장 이름</label><input type="text" id="vc-set-memo" data-set="memo" value="${esc(settings.memo)}" autocomplete="off">
          <label for="vc-set-quiz">시험지 이름</label><input type="text" id="vc-set-quiz" data-set="quiz" value="${esc(settings.quiz)}" autocomplete="off">
        </div></div>
      ${statusHtml('memo')}`;
  }
  function testSide() {
    const h = testHints();
    const hasBook = books.has(tf.book);
    return `<div class="pr-sec"><h2>출제 조건</h2>
        <div class="vc-set">
          <label for="vc-tbook">단어장</label><select id="vc-tbook" data-f="tBook">${bookOpts(tf.book)}</select>
          <label for="vc-trange">범위</label><input type="text" id="vc-trange" data-f="tRange" value="${esc(tf.range)}" placeholder="예: 3-7, 10" autocomplete="off">
          <span class="vc-hint" data-vc-hint="range">${esc(h.range)}</span>
          <label for="vc-tcount">문항 수</label><input type="number" id="vc-tcount" data-f="tCount" min="1" value="${esc(tf.count)}">
          <span class="vc-hint" data-vc-hint="count">${esc(h.count)}</span>
          <label>유형</label>${radios('vc-ttype', tf.type)}
        </div>
        <div class="vc-btns">
          <button type="button" class="btn primary" data-act="test-make"${dis(hasBook)}>출제</button>
          <button type="button" class="btn" data-act="test-make"${dis(testDoc)}>다시 섞기</button>
        </div></div>
      <div class="pr-sec"><h2>인쇄</h2>
        <div class="vc-checks">${optChk('answer', '정답지 함께 출력')}${optChk('duplex', '양면 프린터 사용')}</div>
        <div class="vc-btns"><button type="button" class="btn primary wide" data-act="test-print"${dis(testDoc)}>인쇄 / PDF</button></div></div>
      ${statusHtml('test')}`;
  }
  function stuSide() {
    return `<div class="pr-sec"><h2>학생 목록</h2>
        <p class="vc-guide">체크한 학생만 출제합니다. 학생마다 다른 문제가 무작위로 나옵니다.</p>
        <div class="vc-btns">
          <button type="button" class="btn" data-act="stu-add">학생 추가</button>
          <button type="button" class="btn" data-act="stu-toggle">전체 선택/해제</button>
        </div></div>
      <div class="pr-sec"><h2>출제와 인쇄</h2>
        <div class="vc-checks">${optChk('answer', '정답지 함께 출력')}${optChk('duplex', '양면 프린터 사용')}</div>
        <div class="vc-btns">
          <button type="button" class="btn primary" data-act="stu-make">선택한 학생 출제</button>
          <button type="button" class="btn primary" data-act="stu-print"${dis(stuDocs)}>인쇄 / PDF</button>
        </div></div>
      <div class="pr-sec"><h2>학생 목록 백업</h2>
        <div class="vc-btns">
          <button type="button" class="btn" data-act="stu-export">파일로 내보내기</button>
          <button type="button" class="btn" data-act="stu-import">파일에서 가져오기</button>
        </div>
        <input type="file" data-vc-import accept=".json" hidden>
        <p class="pr-hint">학생 목록은 이 기기에만 저장됩니다. 다른 PC로 옮길 때 내보내기 · 가져오기를 쓰세요. (예전 단어 출제 프로그램에서 내보낸 파일도 가져올 수 있어요)</p></div>
      ${statusHtml('stu')}`;
  }
  function bookSide() {
    const hasBook = books.has(bf.book);
    const one = bf.mode === 'one';
    return `<div class="pr-sec"><h2>출제 조건</h2>
        <p class="vc-guide">범위는 단어장 전체 Day로 자동으로 정해집니다. <b>1-2</b>부터 7과까지 누적한 뒤 7과씩 밀고, 끝에서 다시 줄어듭니다. 회차마다 <b>50문항</b>을 랜덤으로 출제하고, 범위 안 단어가 50개보다 적으면 있는 만큼 모두 출제합니다.</p>
        <div class="vc-set">
          <label for="vc-bbook">단어장</label><select id="vc-bbook" data-f="bBook">${bookOpts(bf.book)}</select>
          <label>유형</label>${radios('vc-btype', bf.type)}
        </div>
        <div class="vc-bklist">${bookHintHtml()}</div>
        <div class="vc-btns">
          <button type="button" class="btn primary" data-act="book-make"${dis(hasBook)}>출제</button>
          <button type="button" class="btn" data-act="book-make"${dis(bookDoc)}>다시 섞기</button>
        </div></div>
      <div class="pr-sec"><h2>저장</h2>
        <div class="vc-checks">
          <label class="chk"><input type="radio" name="vc-bmode" value="split"${one ? '' : ' checked'}>시험지 + 답지 (파일 2개)</label>
          <label class="chk"><input type="radio" name="vc-bmode" value="one"${one ? ' checked' : ''}>통합본 (시험지 전체 → 답지 전체, 파일 1개)</label>
          ${optChk('duplex', '양면 프린터 사용 (통합본에서 답지를 새 종이로)')}
        </div>
        ${one ? `<div class="vc-btns"><button type="button" class="btn primary wide" data-act="book-print" data-what="one"${dis(bookDoc)}>통합본 인쇄 / PDF</button></div>`
              : `<div class="vc-btns"><button type="button" class="btn primary" data-act="book-print" data-what="test"${dis(bookDoc)}>시험지 인쇄 / PDF</button>
                 <button type="button" class="btn primary" data-act="book-print" data-what="key"${dis(bookDoc)}>답지 인쇄 / PDF</button></div>`}
      </div>
      ${statusHtml('book')}`;
  }

  /* ---------- 미리보기 ---------- */
  function paint(main) {
    const stage = $('[data-vc-stage]', main);
    if (!stage) return;
    const k = tab;
    const html = cache[k] || PREVIEW[k]();
    if (!html) { stage.innerHTML = `<div class="empty vc-empty">${EMPTY[k]}</div>`; return; }
    stage.innerHTML = `<div class="vc-scaler"><div class="vc-pages" data-vc-pages>${html}</div></div>`;
    const pages = $('[data-vc-pages]', stage);
    if (!cache[k]) { fitCells(pages); cache[k] = pages.innerHTML; }
    scale();
  }
  function scale() {
    const main = $('#main');
    const stage = main && $('[data-vc-stage]', main);
    const sc = stage && $('.vc-scaler', stage);
    const p = sc && sc.firstElementChild;
    if (!p) return;
    const cs = getComputedStyle(stage);
    const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const w = p.offsetWidth, h = p.offsetHeight;
    const s = Math.max(0.2, Math.min(1, aw / w));
    sc.style.width = (w * s) + 'px';
    sc.style.height = (h * s) + 'px';
    p.style.transform = `scale(${s})`;
  }

  /* ---------- 끌어다 놓기 (단어장 탭) ---------- */
  function hookDrop() {
    if (dropHooked) return;
    dropHooked = true;
    const here = () => App.page === 'vocas';
    const zone = () => $('#main [data-vc-drop]');
    ['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => {
      if (!here()) return;
      e.preventDefault();
      const z = zone(); if (z) z.classList.add('over');
    }));
    document.addEventListener('dragleave', e => {
      if (!here()) return;
      e.preventDefault();
      if (!e.relatedTarget) { const z = zone(); if (z) z.classList.remove('over'); }
    });
    document.addEventListener('drop', e => {
      if (!here()) return;
      e.preventDefault();
      const z = zone(); if (z) z.classList.remove('over');
      if (tab === 'lib' && e.dataTransfer && e.dataTransfer.files.length) registerFiles([...e.dataTransfer.files]);
      else if (e.dataTransfer && e.dataTransfer.files.length) toast('단어장 등록은 단어장 탭에서 할 수 있어요');
    });
  }

  /* ---------- 공통 인쇄 옵션 (정답지 · 양면) ---------- */
  function setOpt(k, on) {
    settings[k] = on;
    saveSettings();
    Object.keys(cache).forEach(c => { cache[c] = ''; });      // 빈 면·정답지가 바뀌므로 모든 미리보기 다시
    rerender();
  }

  return {
    render(main) {
      ensureCss();
      hookDrop();
      if (!loaded) loadBooks().then(() => { if (App.page === 'vocas' && !App.isEditingMain()) App.render(); });
      if (loaded) fixDefaults();
      const tabs = `<div class="tabs">${TABS.map(([k, v]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'active' : ''}">${v}</button>`).join('')}</div>`;
      let body;
      if (tab === 'lib') body = libHtml();
      else {
        const side = { memo: memoSide, test: testSide, stu: stuSide, book: bookSide }[tab]();
        const slotsPanel = tab === 'stu' ? `<div class="panel vc-slots"><div class="tbl-wrap"><table class="tbl compact vc-slot-tbl">
            <thead><tr><th></th><th>학생 이름</th><th>단어장</th><th>범위</th><th>문항 수</th><th>유형</th><th></th></tr></thead>
            <tbody data-vc-slots>${slotsHtml()}</tbody></table></div></div>` : '';
        body = `<div class="pr-wrap vc-wrap"><aside class="panel pr-side">${side}</aside>
          <section class="vc-right">${slotsPanel}<div class="vc-view"><div class="vc-stage" data-vc-stage></div></div></section></div>`;
      }
      main.innerHTML = `<div class="page-head"><h1>단어 출제</h1><span class="sub">${SUBS[tab]}</span></div>${tabs}${body}`;
      main.onclick = (e) => this.onClick(e, main);
      main.oninput = (e) => this.onInput(e, main);
      main.onchange = (e) => this.onChange(e, main);
      main.onkeydown = (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-vc-drop]')) { e.preventDefault(); $('[data-vc-file]', main).click(); }
      };
      paint(main);
      if (!ro && window.ResizeObserver) ro = new ResizeObserver(() => scale());
      const stage = $('[data-vc-stage]', main);
      if (ro) { ro.disconnect(); if (stage) ro.observe(stage); }
    },

    onLeave() { if (ro) ro.disconnect(); },

    // 로그아웃: 이 기기의 단어장 · 출제 상태를 모두 지움 (localStorage 의 mg77_voca_* 는 app.js 가 접두사로 지움)
    async wipe() {
      try { if (store.db) store.db.close(); } catch (e) {}
      store.db = null; store.ok = false;
      books = new Map(); loaded = false; loadP = null; storeOk = true;
      settings = Object.assign({}, DEFAULT_SETTINGS); slots = [];
      memo.book = ''; clearMemo();
      Object.assign(tf, { book: '', range: '', count: '50', type: 'ek' });
      Object.assign(bf, { book: '', type: 'ek', mode: 'split' });
      testDoc = null; stuDocs = null; bookDoc = null;
      Object.keys(cache).forEach(c => { cache[c] = ''; });
      Object.keys(stat).forEach(k => { stat[k] = null; });
      tab = 'lib';
      await new Promise(res => {
        try {
          const rq = indexedDB.deleteDatabase(IDB_NAME);
          rq.onsuccess = rq.onerror = rq.onblocked = () => res();
        } catch (e) { res(); }
      });
    },

    /* ---------- 이벤트 ---------- */
    onClick(e, main) {
      const tb = e.target.closest('[data-tab]');
      if (tb) { if (tab !== tb.dataset.tab) { tab = tb.dataset.tab; App.render(true); } return; }
      if (e.target.closest('[data-vc-drop]')) { $('[data-vc-file]', main).click(); return; }
      const del = e.target.closest('[data-del]');
      if (del) { deleteBook(del.dataset.del); return; }
      const sb = e.target.closest('[data-slot]');
      if (sb) { onSlotClick(sb); return; }
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const a = b.dataset.act;
      if (a === 'memo-make') makeCurrent();
      else if (a === 'memo-reset') resetMemo();
      else if (a === 'memo-print') { if (memo.cur && cache.memo) printPaper(flatPages(cache.memo), `${memo.db.name}_${dayLabel(memo.cur.day)}`); }
      else if (a === 'memo-print-all') printMemoAll();
      else if (a === 'test-make') runTest();
      else if (a === 'test-print') { if (testDoc && cache.test) printPaper(flatPages(cache.test), `단어시험_${testDoc.book}_${testDoc.range}`); }
      else if (a === 'stu-add') addSlot();
      else if (a === 'stu-toggle') toggleSlots();
      else if (a === 'stu-make') runStudents();
      else if (a === 'stu-print') { if (stuDocs && cache.stu) printPaper(flatPages(cache.stu), `학생별단어시험_${todayStr()}`); }
      else if (a === 'stu-export') exportSlots();
      else if (a === 'stu-import') $('[data-vc-import]', main).click();
      else if (a === 'book-make') runBook();
      else if (a === 'book-print') printBook(b.dataset.what);
    },

    onInput(e, main) {
      const t = e.target;
      if (onSlotInput(e)) return;
      if (t.matches('[data-f="tRange"]')) { tf.range = t.value; updateTestHints(main); }
      else if (t.matches('[data-f="tCount"]')) tf.count = t.value;
      else if (t.matches('[data-set]')) {
        settings[t.dataset.set] = t.value;
        saveSettings();
        if (memo.cur) { cache.memo = ''; paint(main); }
      }
    },

    onChange(e, main) {
      const t = e.target;
      if (t.matches('[data-vc-file]')) { const fs = [...t.files]; t.value = ''; registerFiles(fs); return; }
      if (t.matches('[data-vc-import]')) { const f = t.files[0]; t.value = ''; importSlots(f); return; }
      if (onSlotInput(e)) return;
      if (t.matches('[data-opt]')) { setOpt(t.dataset.opt, t.checked); return; }
      if (t.matches('[data-f="memoBook"]')) { selectMemoBook(t.value); rerender(); }
      else if (t.matches('[data-f="memoDay"]')) memo.day = t.value;
      else if (t.matches('[data-f="tBook"]')) { tf.book = t.value; updateTestHints(main); }
      else if (t.matches('[name="vc-ttype"]')) { if (t.checked) tf.type = t.value; }
      else if (t.matches('[data-f="bBook"]')) { bf.book = t.value; resetBook(); setStatus('book', ''); rerender(); }
      else if (t.matches('[name="vc-btype"]')) { if (t.checked) bf.type = t.value; }
      else if (t.matches('[name="vc-bmode"]')) { if (t.checked) { bf.mode = t.value; cache.book = ''; rerender(); } }
    },
  };
})();
