/* =========================================================
   prints.js — 학생 > 표지+양식
   · 표지 탭: 표지 디자인 10종을 고르고 글자·로고를 넣어 인쇄 (원본: covers.html)
   · 시험지·노트 탭: 독해/문법 시험지, 줄/모눈 노트 인쇄 (원본: notes.html)
   화면(설정 상자·미리보기 틀·썸네일)은 style.css 의 테마 변수만 써서 설정 > 테마를 따라간다.
   종이(표지·시험지) 색과 모양은 아래 PAPER_CSS 에 고정 → 테마와 상관없이 원본과 똑같이 인쇄된다.
   저장은 이 기기에만 (localStorage, mg77_ 접두사 → 로그아웃하면 함께 지워짐)
   인쇄는 다른 화면(출석부·단어)과 같은 방식: 숨은 iframe 에 종이만 넣고 그 iframe 을 인쇄
   ========================================================= */
const Prints = (() => {
  'use strict';

  /* ---------- 종이 전용 글꼴 · CSS ---------- */
  const FONT_URL = 'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Black+Han+Sans&family=Do+Hyeon&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=IBM+Plex+Sans+KR:wght@400;500;700&family=Nanum+Myeongjo:wght@400;800&family=Nanum+Pen+Script&family=Noto+Serif+KR:wght@400;700;900&family=Playfair+Display:ital,wght@1,400;1,700&display=swap';
  const PAPER_CSS = `
/* ================= 표지 공통 ================= */
.cv-page{
  width:210mm;height:297mm;position:relative;overflow:hidden;background:#fff;color:#14171F;
  font-family:'IBM Plex Sans KR','Malgun Gothic',sans-serif;font-size:16px;line-height:normal;letter-spacing:normal;text-align:left;white-space:normal;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.cv-page *{box-sizing:border-box}
.cv-page .fit{white-space:nowrap;width:100%}
.cv-page .lg{display:block;object-fit:contain}
.cv-page .name{font-size:5mm;display:flex;align-items:flex-end;gap:3mm}
.cv-page .name .nv{display:inline-block;min-width:55mm;border-bottom:0.35mm solid currentColor;padding:0 2mm 0.8mm;font-weight:700}

/* 1. 클래식 */
.cv-t1{color:#1B2A4A}
.cv-t1 .frame{position:absolute;inset:12mm;border:0.7mm solid #1B2A4A}
.cv-t1 .frame2{position:absolute;inset:14.5mm;border:0.25mm solid #1B2A4A}
.cv-t1 .top{position:absolute;top:32mm;left:25mm;right:25mm;display:flex;flex-direction:column;align-items:center;gap:4mm;text-align:center}
.cv-t1 .lg{max-height:18mm;max-width:60mm}
.cv-t1 .academy{font-family:'Noto Serif KR',serif;font-weight:700;font-size:5.4mm;letter-spacing:0.8mm}
.cv-t1 .mid{position:absolute;top:92mm;left:25mm;right:25mm;display:flex;flex-direction:column;align-items:center;text-align:center}
.cv-t1 .school{font-size:5mm;letter-spacing:0.5mm;color:#4A5878;margin-bottom:7mm}
.cv-t1 .title{font-family:'Noto Serif KR',serif;font-weight:900;font-size:27mm;line-height:1.15}
.cv-t1 .rule{width:28mm;height:0.6mm;background:#B08D57;margin:10mm 0}
.cv-t1 .book{font-family:'Noto Serif KR',serif;font-weight:700;font-size:8mm}
.cv-t1 .exam{margin-top:9mm;padding:2mm 7mm;border:0.3mm solid #1B2A4A;border-radius:10mm;font-size:4.6mm}
.cv-t1 .eng{position:absolute;bottom:62mm;left:0;right:0;text-align:center;font-family:'Playfair Display',serif;font-style:italic;font-size:8mm;color:#B08D57}
.cv-t1 .name{position:absolute;bottom:33mm;left:0;right:0;justify-content:center}

/* 2. 블록 */
.cv-t2 .block{position:absolute;left:0;right:0;top:0;height:178mm;background:#F5C518;padding:22mm 20mm 18mm;display:flex;flex-direction:column}
.cv-t2 .school{align-self:flex-start;font-weight:700;font-size:5.6mm;border:0.6mm solid #111;padding:1.6mm 4.5mm}
.cv-t2 .ttx{margin-top:auto;padding-right:16mm}
.cv-t2 .exam{font-weight:700;font-size:6.5mm;margin-bottom:3mm}
.cv-t2 .title{font-family:'Black Han Sans',sans-serif;font-size:46mm;line-height:1;color:#111}
.cv-t2 .deco{position:absolute;right:9mm;top:20mm;writing-mode:vertical-rl;font-family:'Archivo Black',sans-serif;font-size:15mm;color:transparent;-webkit-text-stroke:0.35mm #111;letter-spacing:1mm}
.cv-t2 .bar{position:absolute;left:0;right:0;top:178mm;height:4mm;background:#111}
.cv-t2 .lower{position:absolute;top:182mm;left:20mm;right:20mm;bottom:20mm;display:flex;flex-direction:column;padding-top:16mm}
.cv-t2 .book{font-weight:700;font-size:10mm;line-height:1.35;border-left:2.2mm solid #111;padding-left:5mm}
.cv-t2 .foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm}
.cv-t2 .brand{margin-left:auto;display:flex;align-items:center;gap:3mm;font-weight:700;font-size:5.2mm}
.cv-t2 .lg{max-height:13mm;max-width:40mm}

/* 3. 노트 */
.cv-t3 .lines{position:absolute;inset:0;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 8.7mm,#C6DBEF 8.7mm,#C6DBEF 9mm);background-position:0 4mm}
.cv-t3 .mgn{position:absolute;top:0;bottom:0;left:31mm;width:0.45mm;background:#E79C9C}
.cv-t3 .holes{position:absolute;left:9mm;top:22mm;bottom:22mm;display:flex;flex-direction:column;justify-content:space-between}
.cv-t3 .holes i{display:block;width:6.5mm;height:6.5mm;border-radius:50%;background:#DDE3EA;box-shadow:inset 0.5mm 0.6mm 0.8mm rgba(0,0,0,.25)}
.cv-t3 .acad{position:absolute;top:16mm;right:18mm;display:flex;align-items:center;gap:3mm;font-family:'Gowun Dodum',sans-serif;font-size:5mm;color:#2C3E66;background:#fff;padding:1mm 2mm}
.cv-t3 .lg{max-height:11mm;max-width:36mm}
.cv-t3 .tape{position:absolute;top:58mm;left:44mm;right:20mm;background:#FFE587;padding:11mm 10mm 9mm;transform:rotate(-2deg);box-shadow:0 1.2mm 2.5mm rgba(0,0,0,.14)}
.cv-t3 .tape::before{content:"";position:absolute;top:-4mm;left:50%;width:30mm;height:9mm;margin-left:-15mm;background:rgba(255,255,255,.6);transform:rotate(3deg)}
.cv-t3 .school{font-family:'Gowun Dodum',sans-serif;font-size:5.5mm;color:#5A4A12;margin-bottom:2mm}
.cv-t3 .title{font-family:'Nanum Pen Script',cursive;font-size:36mm;line-height:1;color:#1E3A8A}
.cv-t3 .body{position:absolute;top:148mm;left:44mm;right:20mm;font-family:'Gowun Dodum',sans-serif;color:#1E2B48}
.cv-t3 .book{font-size:8mm;line-height:18mm}
.cv-t3 .exam{font-family:'Nanum Pen Script',cursive;font-size:12mm;line-height:18mm;color:#C2362B}
.cv-t3 .name{position:absolute;bottom:28mm;left:44mm;font-family:'Gowun Dodum',sans-serif;color:#1E2B48;background:#fff;padding:1mm 2mm}

/* 4. 스위스 */
.cv-t4 .grid i{position:absolute;top:0;bottom:0;width:0.2mm;background:#E5E5E5}
.cv-t4 .grid i:nth-child(1){left:70mm}
.cv-t4 .grid i:nth-child(2){left:140mm}
.cv-t4 .head{position:absolute;top:16mm;left:16mm;right:16mm;display:flex;justify-content:space-between;align-items:center;padding-bottom:4mm;border-bottom:0.5mm solid #111;min-height:12mm}
.cv-t4 .brand{display:flex;align-items:center;gap:3mm;font-weight:700;font-size:5mm}
.cv-t4 .lg{max-height:10mm;max-width:36mm}
.cv-t4 .exam{font-size:4.6mm;font-weight:500}
.cv-t4 .aa{position:absolute;top:26mm;left:12mm;font-family:'Archivo Black',sans-serif;font-size:122mm;line-height:1;color:#E4322B;letter-spacing:-4mm}
.cv-t4 .main{position:absolute;top:158mm;left:16mm;right:16mm}
.cv-t4 .title{font-weight:700;font-size:24mm;line-height:1.1;letter-spacing:-0.6mm;margin-bottom:10mm}
.cv-t4 .row{display:grid;grid-template-columns:30mm 1fr;padding:3.5mm 0;border-top:0.3mm solid #111;font-size:5.6mm}
.cv-t4 .row .k{color:#777;font-size:4.2mm;padding-top:1mm}
.cv-t4 .row .val{font-weight:700}
.cv-t4 .name{position:absolute;bottom:20mm;left:16mm}
.cv-t4 .sq{position:absolute;right:16mm;bottom:16mm;width:24mm;height:24mm;background:#E4322B}

/* 5. 아카데미 */
.cv-t5{background:#1D3A2E;color:#EFE5CD}
.cv-t5 .frame{position:absolute;inset:10mm;border:0.5mm solid #C8A55A}
.cv-t5 .frame2{position:absolute;inset:13mm;border:0.2mm solid #C8A55A}
.cv-t5 .orn{position:absolute;width:5mm;height:5mm;background:#C8A55A;transform:rotate(45deg)}
.cv-t5 .orn.tl{top:7.7mm;left:7.7mm}.cv-t5 .orn.tr{top:7.7mm;right:7.7mm}
.cv-t5 .orn.bl{bottom:7.7mm;left:7.7mm}.cv-t5 .orn.br{bottom:7.7mm;right:7.7mm}
.cv-t5 .col{position:absolute;top:34mm;left:26mm;right:26mm;display:flex;flex-direction:column;align-items:center;text-align:center}
.cv-t5 .crest{width:34mm;height:34mm;border-radius:50%;background:#EFE5CD;border:0.6mm solid #C8A55A;box-shadow:0 0 0 1.6mm #1D3A2E,0 0 0 1.9mm #C8A55A;display:flex;align-items:center;justify-content:center;overflow:hidden}
.cv-t5 .crest .lg{max-width:24mm;max-height:24mm}
.cv-t5 .ini{font-family:'Playfair Display',serif;font-style:italic;font-weight:700;font-size:18mm;color:#1D3A2E}
.cv-t5 .academy{margin-top:7mm;font-family:'Noto Serif KR',serif;font-weight:700;font-size:5mm;letter-spacing:1.2mm}
.cv-t5 .eng{margin-top:22mm;font-family:'Playfair Display',serif;font-style:italic;font-size:9mm;color:#C8A55A}
.cv-t5 .title{margin-top:3mm;font-family:'Noto Serif KR',serif;font-weight:900;font-size:24mm;line-height:1.15}
.cv-t5 .rule{display:flex;align-items:center;gap:3mm;margin:9mm 0;width:60mm}
.cv-t5 .rule::before,.cv-t5 .rule::after{content:"";flex:1;height:0.25mm;background:#C8A55A}
.cv-t5 .rule b{width:2.6mm;height:2.6mm;background:#C8A55A;transform:rotate(45deg)}
.cv-t5 .book{font-family:'Noto Serif KR',serif;font-weight:700;font-size:7.5mm}
.cv-t5 .school{margin-top:5mm;font-size:4.8mm;letter-spacing:0.5mm;color:#D9CBA6}
.cv-t5 .exam{margin-top:7mm;font-size:4.6mm;border-top:0.25mm solid #C8A55A;border-bottom:0.25mm solid #C8A55A;padding:1.6mm 6mm;color:#C8A55A}
.cv-t5 .name{position:absolute;bottom:30mm;left:0;right:0;justify-content:center}

/* 6. 사선 */
.cv-t6 .bands i{position:absolute;width:420mm;transform:rotate(-28deg);transform-origin:50% 50%}
.cv-t6 .b1{top:16mm;right:-170mm;height:52mm;background:#13294B}
.cv-t6 .b2{top:70mm;right:-160mm;height:11mm;background:#FF6B57}
.cv-t6 .b3{top:86mm;right:-150mm;height:4mm;background:#7FB7E8}
.cv-t6 .main{position:absolute;top:132mm;left:20mm;right:20mm}
.cv-t6 .school{display:inline-block;background:#FF6B57;color:#fff;font-weight:700;font-size:5.4mm;padding:1.8mm 5mm;margin-bottom:6mm}
.cv-t6 .title{font-family:'Do Hyeon',sans-serif;font-size:42mm;line-height:1.05;color:#13294B}
.cv-t6 .book{margin-top:8mm;font-weight:700;font-size:9mm;line-height:1.35;color:#13294B}
.cv-t6 .exam{margin-top:5mm;font-size:5.4mm;color:#4C5D7D}
.cv-t6 .foot{position:absolute;left:20mm;right:20mm;bottom:20mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;color:#13294B}
.cv-t6 .brand{display:flex;align-items:center;gap:3mm;font-weight:700;font-size:5.2mm}
.cv-t6 .lg{max-height:13mm;max-width:40mm}

/* 7. 인덱스 */
.cv-t7 .side{position:absolute;top:0;bottom:0;left:0;width:48mm;background:#0F6E6B;display:flex;flex-direction:column;align-items:center;padding:24mm 0 18mm}
.cv-t7 .vt{writing-mode:vertical-rl;height:200mm;white-space:nowrap;font-family:'Black Han Sans',sans-serif;font-size:30mm;color:#fff;letter-spacing:2mm;text-align:start}
.cv-t7 .sbrand{margin-top:auto;background:#fff;border-radius:3mm;padding:2.5mm;display:flex}
.cv-t7 .sbrand:empty{display:none}
.cv-t7 .lg{max-width:30mm;max-height:16mm}
.cv-t7 .tabx{position:absolute;right:0;top:46mm;display:flex;flex-direction:column;gap:3mm}
.cv-t7 .tabx i{display:block;width:7mm;height:26mm;border-radius:2mm 0 0 2mm;background:#0F6E6B}
.cv-t7 .tabx i:nth-child(2){background:#4AA3A0}
.cv-t7 .tabx i:nth-child(3){background:#A7D3D1}
.cv-t7 .main{position:absolute;top:30mm;left:64mm;right:22mm;bottom:50mm;display:flex;flex-direction:column}
.cv-t7 .academy{font-weight:700;font-size:5.2mm;color:#0F6E6B;padding-bottom:5mm;border-bottom:0.4mm solid #0F6E6B}
.cv-t7 .exam{margin-top:auto;font-size:5.4mm;color:#0F6E6B;font-weight:700}
.cv-t7 .school{margin-top:3mm;font-size:6mm;color:#444}
.cv-t7 .book{margin-top:6mm;font-weight:700;font-size:15mm;line-height:1.2;letter-spacing:-0.4mm;color:#14171F;word-break:keep-all}
.cv-t7 .name{position:absolute;bottom:24mm;left:64mm}

/* 8. 도형 */
.cv-t8 .circ i{position:absolute;border-radius:50%;mix-blend-mode:multiply}
.cv-t8 .c1{width:128mm;height:128mm;top:-26mm;left:-22mm;background:#7B5CF5}
.cv-t8 .c2{width:104mm;height:104mm;top:36mm;left:70mm;background:#FF9147}
.cv-t8 .c3{width:82mm;height:82mm;top:-6mm;left:142mm;background:#22B8A7}
.cv-t8 .main{position:absolute;top:166mm;left:20mm;right:20mm}
.cv-t8 .school{font-size:5.6mm;color:#555;margin-bottom:4mm}
.cv-t8 .title{font-weight:700;font-size:28mm;line-height:1.1;letter-spacing:-0.8mm;color:#1A1A2E}
.cv-t8 .book{margin-top:8mm;font-weight:500;font-size:8.5mm;line-height:1.35;color:#1A1A2E}
.cv-t8 .exam{display:inline-block;margin-top:6mm;font-size:4.8mm;font-weight:700;color:#7B5CF5;border:0.4mm solid #7B5CF5;border-radius:6mm;padding:1.4mm 5mm}
.cv-t8 .foot{position:absolute;left:20mm;right:20mm;bottom:20mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm}
.cv-t8 .brand{display:flex;align-items:center;gap:3mm;font-weight:700;font-size:5.2mm}
.cv-t8 .lg{max-height:13mm;max-width:40mm}

/* 9. 시험지 */
.cv-t9{font-family:'Nanum Myeongjo',serif}
.cv-t9 .hd{position:absolute;top:16mm;left:16mm;right:16mm;text-align:center}
.cv-t9 .exam{font-size:5.4mm;margin-bottom:3mm;letter-spacing:0.6mm}
.cv-t9 .title{font-weight:800;font-size:20mm;line-height:1.2;letter-spacing:2mm}
.cv-t9 .dbl{margin-top:5mm;border-top:1.4mm solid #111;padding-top:0.8mm}
.cv-t9 .dbl::after{content:"";display:block;border-top:0.3mm solid #111}
.cv-t9 .tb{margin:5mm auto 0;border-collapse:collapse;font-size:4.8mm}
.cv-t9 .tb th{border:0.3mm solid #111;padding:2mm 4mm;font-weight:800;background:#F1F1F1;white-space:nowrap}
.cv-t9 .tb td{border:0.3mm solid #111;padding:2mm 5mm;min-width:44mm;text-align:left}
.cv-t9 .tb td.nm{min-width:50mm}
.cv-t9 .cl{position:absolute;top:90mm;bottom:34mm;left:50%;width:0.3mm;background:#111}
.cv-t9 .box{position:absolute;top:150mm;left:30mm;right:30mm;display:flex;justify-content:center}
.cv-t9 .bk{background:#fff;border:0.5mm solid #111;padding:6mm 9mm;font-weight:800;font-size:8mm;line-height:1.4;text-align:center;box-shadow:1.6mm 1.6mm 0 #111}
.cv-t9 .ft{position:absolute;left:16mm;right:16mm;bottom:16mm;border-top:0.3mm solid #111;padding-top:4mm;display:flex;justify-content:center;align-items:center;gap:3mm;font-size:5mm;font-weight:800;min-height:10mm}
.cv-t9 .lg{max-height:10mm;max-width:34mm}

/* 10. 사전 */
.cv-t10{background:#F3F5F9;color:#17233D}
.cv-t10 .run{position:absolute;top:14mm;left:18mm;right:30mm;display:flex;justify-content:space-between;font-size:4.4mm;color:#5B6680;border-bottom:0.3mm solid #9AA4BA;padding-bottom:3mm;min-height:9mm}
.cv-t10 .idx{position:absolute;top:14mm;bottom:14mm;right:0;width:10mm;display:flex;flex-direction:column}
.cv-t10 .idx i{flex:1;display:flex;align-items:center;justify-content:center;font-style:normal;font-family:'Playfair Display',serif;font-size:3.6mm;color:#8B95AB;border-bottom:0.2mm solid #DCE1EA}
.cv-t10 .idx i.on{background:#17233D;color:#fff;font-size:5mm;font-weight:700}
.cv-t10 .entry{position:absolute;top:78mm;left:18mm;right:30mm}
.cv-t10 .hw{font-family:'Noto Serif KR',serif;font-weight:900;font-size:26mm;line-height:1.15}
.cv-t10 .meta{margin-top:4mm;display:flex;gap:4mm;align-items:baseline;font-size:6mm}
.cv-t10 .ph{color:#5B6680}
.cv-t10 .pos{font-family:'Playfair Display',serif;font-style:italic;font-weight:700;color:#D2483A}
.cv-t10 .defs{margin:10mm 0 0;padding-left:9mm;font-size:7.5mm;line-height:1.5}
.cv-t10 .defs li{padding-left:2mm;margin-bottom:2mm}
.cv-t10 .ex{margin-top:12mm;padding-left:5mm;border-left:0.8mm solid #D2483A;font-family:'Playfair Display',serif;font-style:italic;font-size:6.5mm;color:#5B6680}
.cv-t10 .foot{position:absolute;left:18mm;right:30mm;bottom:20mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm}
.cv-t10 .lg{max-height:13mm;max-width:40mm}
/* ================= 시험지·노트 (A4) ================= */
.pn-sheet{
  --pn-line:#c4ced8; --pn-frame:#cfd6dc; --pn-tag-bg:#e7eee5; --pn-tag-ink:#4c5f4d; --pn-ink:#3d4950; --pn-ink-soft:#7d8a92;
  width:210mm;height:297mm;background:#fff;color:var(--pn-ink);box-sizing:border-box;
  padding:13mm 15mm;display:flex;flex-direction:column;overflow:hidden;
  font-family:"Gowun Dodum","Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:16px;line-height:normal;letter-spacing:normal;text-align:left;white-space:normal;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.pn-sheet *{box-sizing:border-box}
.pn-sheet .pn-head{
  height:12mm;flex-shrink:0;display:flex;align-items:flex-end;justify-content:space-between;
  padding-bottom:2.2mm;border-bottom:0.3mm solid var(--pn-line);margin-bottom:5mm;
}
.pn-sheet .pn-academy{font-family:"Gowun Batang",serif;font-size:16pt;font-weight:700;letter-spacing:0.02em}
.pn-sheet .pn-fields{display:flex;gap:7mm;font-size:10.5pt;color:var(--pn-ink-soft)}
.pn-sheet .pn-field{display:flex;align-items:flex-end;gap:2mm}
.pn-sheet .pn-blank{display:inline-block;border-bottom:0.3mm solid var(--pn-line);height:5mm}
.pn-sheet .pn-secs{flex:1;display:flex;flex-direction:column;gap:6mm;min-height:0}
.pn-sheet .pn-sec{display:flex;flex-direction:column;min-height:0}
.pn-sheet .pn-tagrow{height:8mm;flex-shrink:0;display:flex;align-items:flex-start}
.pn-sheet .pn-tag{
  font-family:"Gowun Batang",serif;font-size:10.5pt;font-weight:700;
  background:var(--pn-tag-bg);color:var(--pn-tag-ink);
  padding:1mm 3.6mm;border-radius:10mm;line-height:1.35;
}
.pn-sheet .pn-box{flex:1;min-height:0;position:relative;overflow:hidden;border:0.3mm solid var(--pn-frame);border-radius:3mm}
.pn-sheet .ln{position:absolute;left:0;right:0;border-top:0.25mm solid var(--pn-line)}
.pn-sheet .gv{position:absolute;top:0;bottom:0;border-left:0.2mm solid var(--pn-line)}
.pn-sheet .gh{position:absolute;left:0;right:0;border-top:0.2mm solid var(--pn-line)}
`;

  const PAGE_W = 793.7, PAGE_H = 1122.5;       // A4 (CSS px)
  const MM_PER_PX = 25.4 / 96;

  /* ---------- 저장 (이 기기) ---------- */
  const K_CV_STATE = 'mg77_cover_state', K_CV_LOGO = 'mg77_cover_logo', K_CV_PRESETS = 'mg77_cover_presets', K_PN = 'mg77_notes_settings';
  function load(key, fallback) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  /* =========================================================
     표지
     ========================================================= */
  const CV_FIELDS = ['academy', 'type', 'school', 'book', 'exam', 'student'];
  const CV_LABELS = {
    academy: ['학원명', ''], type: ['교재 종류', '예: 변형문제, 워크북'], school: ['학교 · 학년', '예: ○○고 2학년'],
    book: ['교재명 · 범위', '예: 천재(이재영) Lesson 3~4'], exam: ['시험 구분', '예: 1학기 중간고사'], student: ['학생 이름', ''],
  };
  const CV_NAMES = ['클래식', '블록', '노트', '스위스', '아카데미', '사선', '인덱스', '도형', '시험지', '사전'];
  const CV_DEFAULT = {
    tpl: 0,
    fields: { academy: '○○영어학원', type: '변형문제', school: '○○고 2학년', book: '천재(이재영) Lesson 3~4', exam: '1학기 중간고사', student: '' },
    nameBlank: true,
    copies: 1,
  };

  let cv = null, logo = null, presets = [];
  function loadCv() {
    if (cv) return;
    cv = load(K_CV_STATE, null) || JSON.parse(JSON.stringify(CV_DEFAULT));
    cv.fields = Object.assign({}, CV_DEFAULT.fields, cv.fields || {});
    if (typeof cv.tpl !== 'number' || cv.tpl < 0 || cv.tpl >= CV_NAMES.length) cv.tpl = 0;
    logo = load(K_CV_LOGO, null);
    presets = load(K_CV_PRESETS, []);
    if (!Array.isArray(presets)) presets = [];
  }
  const saveCv = () => save(K_CV_STATE, cv);

  const w = (cond, html) => cond ? html : '';
  function ctx() {
    const v = {};
    CV_FIELDS.forEach(k => v[k] = esc((cv.fields[k] || '').trim()));
    return {
      v,
      logo: logo ? `<img class="lg" src="${logo}" alt="">` : '',
      showName: !!v.student || !!cv.nameBlank,
    };
  }
  function nameBlock(c) {
    return c.showName ? `<div class="name"><span class="nl">이름</span><span class="nv">${c.v.student}</span></div>` : '';
  }
  function brand(c) {
    return (c.logo || c.v.academy) ? `<div class="brand">${c.logo}${w(c.v.academy, `<span>${c.v.academy}</span>`)}</div>` : '';
  }

  const CV_TPL = [
    // 1 클래식
    c => `<div class="frame"></div><div class="frame2"></div>
      <div class="top">${c.logo}${w(c.v.academy, `<div class="academy">${c.v.academy}</div>`)}</div>
      <div class="mid">
        ${w(c.v.school, `<div class="school">${c.v.school}</div>`)}
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        <div class="rule"></div>
        ${w(c.v.book, `<div class="book fit">${c.v.book}</div>`)}
        ${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}
      </div>
      <div class="eng">English</div>
      ${nameBlock(c)}`,

    // 2 블록
    c => `<div class="block">
        ${w(c.v.school, `<div class="school">${c.v.school}</div>`)}
        <div class="ttx">
          ${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}
          ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        </div>
        <div class="deco">ENGLISH</div>
      </div>
      <div class="bar"></div>
      <div class="lower">
        ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
        <div class="foot">${nameBlock(c)}${brand(c)}</div>
      </div>`,

    // 3 노트
    c => `<div class="lines"></div><div class="mgn"></div>
      <div class="holes">${'<i></i>'.repeat(11)}</div>
      ${(c.logo || c.v.academy) ? `<div class="acad">${c.logo}${w(c.v.academy, `<span>${c.v.academy}</span>`)}</div>` : ''}
      <div class="tape">
        ${w(c.v.school, `<div class="school">${c.v.school}</div>`)}
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
      </div>
      <div class="body">
        ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
        ${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}
      </div>
      ${nameBlock(c)}`,

    // 4 스위스
    c => `<div class="grid"><i></i><i></i></div>
      <div class="head">${brand(c) || '<span></span>'}${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}</div>
      <div class="aa">Aa</div>
      <div class="main">
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        ${w(c.v.school, `<div class="row"><span class="k">학교</span><span class="val">${c.v.school}</span></div>`)}
        ${w(c.v.book, `<div class="row"><span class="k">범위</span><span class="val">${c.v.book}</span></div>`)}
      </div>
      ${nameBlock(c)}<div class="sq"></div>`,

    // 5 아카데미
    c => `<div class="frame"></div><div class="frame2"></div>
      ${['tl', 'tr', 'bl', 'br'].map(p => `<i class="orn ${p}"></i>`).join('')}
      <div class="col">
        <div class="crest">${c.logo || '<span class="ini">E</span>'}</div>
        ${w(c.v.academy, `<div class="academy">${c.v.academy}</div>`)}
        <div class="eng">English</div>
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        <div class="rule"><b></b></div>
        ${w(c.v.book, `<div class="book fit">${c.v.book}</div>`)}
        ${w(c.v.school, `<div class="school">${c.v.school}</div>`)}
        ${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}
      </div>
      ${nameBlock(c)}`,

    // 6 사선
    c => `<div class="bands"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
      <div class="main">
        ${w(c.v.school, `<div class="school">${c.v.school}</div>`)}
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
        ${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}
      </div>
      <div class="foot">${brand(c) || '<span></span>'}${nameBlock(c)}</div>`,

    // 7 인덱스
    c => `<div class="side"><div class="vt fit-v">${c.v.type}</div><div class="sbrand">${c.logo}</div></div>
      <div class="tabx"><i></i><i></i><i></i></div>
      <div class="main">
        ${w(c.v.academy, `<div class="academy">${c.v.academy}</div>`)}
        ${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}
        ${w(c.v.school, `<div class="school">${c.v.school}</div>`)}
        ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
      </div>
      ${nameBlock(c)}`,

    // 8 도형
    c => `<div class="circ"><i class="c1"></i><i class="c2"></i><i class="c3"></i></div>
      <div class="main">
        ${w(c.v.school, `<div class="school">${c.v.school}</div>`)}
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
        ${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}
      </div>
      <div class="foot">${brand(c) || '<span></span>'}${nameBlock(c)}</div>`,

    // 9 시험지
    c => `<div class="hd">
        ${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        <div class="dbl"></div>
        ${(c.v.school || c.showName) ? `<table class="tb"><tr>
          ${w(c.v.school, `<th>학교</th><td>${c.v.school}</td>`)}
          ${c.showName ? `<th>이름</th><td class="nm">${c.v.student}</td>` : ''}
        </tr></table>` : ''}
      </div>
      <div class="cl"></div>
      ${w(c.v.book, `<div class="box"><div class="bk">${c.v.book}</div></div>`)}
      <div class="ft">${c.logo}${w(c.v.academy, `<span>${c.v.academy}</span>`)}</div>`,

    // 10 사전
    c => `<div class="run"><span>${c.v.academy}</span><span>${c.v.exam}</span></div>
      <div class="idx">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => `<i class="${l === 'E' ? 'on' : ''}">${l}</i>`).join('')}</div>
      <div class="entry">
        ${w(c.v.type, `<div class="hw fit">${c.v.type}</div>`)}
        <div class="meta">${w(c.v.school, `<span class="ph">[${c.v.school}]</span>`)}<span class="pos">n.</span></div>
        ${c.v.book ? `<ol class="defs"><li>${c.v.book}</li></ol>` : ''}
        <div class="ex">Practice makes perfect.</div>
      </div>
      <div class="foot">${c.logo || '<span></span>'}${nameBlock(c)}</div>`,
  ];
  const cvPageHTML = (i, c) => `<div class="cv-page cv-t${i + 1}">${CV_TPL[i](c)}</div>`;

  // 긴 글자는 칸에 맞게 줄임 (원본과 같은 방식)
  function fitAll(root) {
    root.querySelectorAll('.fit').forEach(el => {
      el.style.fontSize = '';
      let fs = parseFloat(getComputedStyle(el).fontSize), min = fs * 0.25, n = 0;
      while (el.scrollWidth > el.clientWidth + 1 && fs > min && n < 80) { fs *= 0.95; el.style.fontSize = fs + 'px'; n++; }
    });
    root.querySelectorAll('.fit-v').forEach(el => {
      el.style.fontSize = '';
      let fs = parseFloat(getComputedStyle(el).fontSize), min = fs * 0.25, n = 0;
      while (el.scrollHeight > el.clientHeight + 1 && fs > min && n < 80) { fs *= 0.95; el.style.fontSize = fs + 'px'; n++; }
    });
  }
  function cvCopies(main) {
    const inp = $('[data-cv-copies]', main);
    let n = parseInt(inp ? inp.value : cv.copies, 10);
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 300) n = 300;
    return n;
  }

  /* =========================================================
     시험지·노트
     ========================================================= */
  // 양식 정의 (새 양식은 여기에 추가)
  const PN_TEMPLATES = {
    reading: { name: '독해 시험지', sections: [{ title: '해석 시험', ratio: 7, lined: true }, { title: '구문 시험', ratio: 3, lined: false }] },
    grammar: { name: '문법 시험지', sections: [{ title: '개념 시험', ratio: 7, lined: false }, { title: '어구 시험', ratio: 3, lined: false }] },
    lineNote: { name: '줄 노트', sections: [{ title: '', ratio: 1, lined: true }] },
    gridNote: { name: '모눈 노트', sections: [{ title: '', ratio: 1, grid: true }] },
  };

  let pn = null;
  function loadPn() {
    if (pn) return;
    // 양식·출력 모드·부수는 원본처럼 저장하지 않음 (앱을 켜 둔 동안만 기억). 학원명은 표지 탭과 함께 씀
    pn = { template: 'reading', gap: 8, gridGap: 5, duplexPrinter: true, mode: 'single', copies: '' };
    const saved = load(K_PN, null);
    if (saved) {
      if (typeof saved.gap === 'number' && saved.gap >= 6 && saved.gap <= 12) pn.gap = saved.gap;
      if (typeof saved.gridGap === 'number' && saved.gridGap >= 3 && saved.gridGap <= 10) pn.gridGap = saved.gridGap;
      if (typeof saved.duplexPrinter === 'boolean') pn.duplexPrinter = saved.duplexPrinter;
    }
  }
  const savePn = () => save(K_PN, { gap: pn.gap, gridGap: pn.gridGap, duplexPrinter: pn.duplexPrinter });
  const pnAcademy = () => cv.fields.academy || '';

  function pnSheetHTML(tpl) {
    let h = `<div class="pn-sheet"><div class="pn-head">
        <div class="pn-academy">${esc(pnAcademy())}</div>
        <div class="pn-fields">
          <span class="pn-field">날짜<span class="pn-blank" style="width:30mm"></span></span>
          <span class="pn-field">이름<span class="pn-blank" style="width:38mm"></span></span>
        </div>
      </div><div class="pn-secs">`;
    tpl.sections.forEach(sec => {
      h += `<section class="pn-sec" style="flex:${sec.ratio}">` +
        (sec.title ? `<div class="pn-tagrow"><span class="pn-tag">${esc(sec.title)}</span></div>` : '') +
        `<div class="pn-box${sec.lined ? ' lined' : ''}${sec.grid ? ' grid' : ''}"></div></section>`;
    });
    return h + '</div></div>';
  }

  // 줄·모눈 위치를 mm 단위로 계산해서 넣음 (인쇄 시 선명하게). 원본과 같은 계산. 실제 줄 간격을 돌려줌
  function fillLines(sheet) {
    let real = null;
    sheet.querySelectorAll('.pn-box.lined').forEach(box => {
      box.querySelectorAll('.ln').forEach(n => n.remove());
      const hMm = box.clientHeight * MM_PER_PX;
      // 높이는 고정, 높이를 같은 크기로 나눠 위아래 끝 간격까지 모두 동일하게 함
      const n = Math.max(1, Math.round(hMm / pn.gap));
      const gap = hMm / n;
      let out = '';
      for (let k = 1; k < n; k++) out += `<div class="ln" style="top:${(k * gap).toFixed(3)}mm"></div>`;
      box.insertAdjacentHTML('beforeend', out);
      real = gap;
    });
    sheet.querySelectorAll('.pn-box.grid').forEach(box => {
      box.querySelectorAll('.gv, .gh').forEach(n => n.remove());
      box.style.width = ''; box.style.alignSelf = ''; box.style.height = ''; box.style.flex = ''; box.style.margin = '';
      const wMm = box.clientWidth * MM_PER_PX, hMm = box.clientHeight * MM_PER_PX;
      const g = pn.gridGap;
      const nx = Math.floor(wMm / g), ny = Math.floor(hMm / g);
      // 가로: 테두리 안쪽 너비를 모눈 간격의 정수배로 맞춰 양 끝 칸도 동일한 너비가 되게 함
      const borderMm = (box.offsetWidth - box.clientWidth) * MM_PER_PX;
      box.style.width = (nx * g + borderMm).toFixed(2) + 'mm';
      box.style.alignSelf = 'center';
      // 세로: 테두리 안쪽 높이도 모눈 간격의 정수배로 맞춰 위아래 칸도 동일하게 함
      const borderYMm = (box.offsetHeight - box.clientHeight) * MM_PER_PX;
      box.style.flex = 'none';
      box.style.height = (ny * g + borderYMm).toFixed(2) + 'mm';
      box.style.margin = 'auto 0';
      let out = '';
      for (let i = 1; i < nx; i++) out += `<div class="gv" style="left:${(i * g).toFixed(2)}mm"></div>`;
      for (let j = 1; j < ny; j++) out += `<div class="gh" style="top:${(j * g).toFixed(2)}mm"></div>`;
      box.insertAdjacentHTML('beforeend', out);
    });
    return real;
  }
  function pnReadCopies(v) {
    v = String(v || '').trim();
    if (!/^\d+$/.test(v)) return null;
    const n = parseInt(v, 10);
    return n < 1 || n > 500 ? null : n;
  }

  /* =========================================================
     공통: 글꼴 · 인쇄
     ========================================================= */
  let fontsHooked = false;
  function ensureAssets() {
    if (!document.getElementById('pr-paper-css')) {
      const st = document.createElement('style');
      st.id = 'pr-paper-css';
      st.textContent = PAPER_CSS;
      document.head.appendChild(st);
    }
    if (!document.getElementById('pr-paper-font')) {
      const ln = document.createElement('link');
      ln.id = 'pr-paper-font'; ln.rel = 'stylesheet'; ln.href = FONT_URL;
      ln.onload = () => { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => Prints.refit()); };
      document.head.appendChild(ln);
    }
    // 글꼴이 늦게 도착하면 글자 줄임·줄 위치를 다시 계산
    if (!fontsHooked && document.fonts && document.fonts.addEventListener) {
      fontsHooked = true;
      document.fonts.addEventListener('loadingdone', debounce(() => Prints.refit(), 120));
    }
  }

  // 종이만 담은 숨은 iframe 을 인쇄 (출석부·단어 인쇄와 같은 방식)
  function printPaper(bodyHtml, title) {
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <link rel="stylesheet" href="${FONT_URL}">
      <style>${PAPER_CSS}
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body > * { break-after: page; page-break-after: always; }
        body > *:last-child { break-after: auto; page-break-after: auto; }
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
    const ready = () => {
      try {
        void doc.body.offsetHeight;           // 글꼴을 쓰는 글자를 먼저 배치시켜 글꼴을 불러오게 함
        (doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 60), go);
      } catch (e) { go(); }
    };
    if (doc.readyState === 'complete') ready(); else fr.contentWindow.addEventListener('load', ready);
    setTimeout(go, 8000);                     // 글꼴이 끝내 늦어도 인쇄 창은 뜨게
  }

  /* =========================================================
     화면
     ========================================================= */
  let ro = null, galleryT = null;
  const fld = (k) => {
    const [label, ph] = CV_LABELS[k];
    return `<label class="pr-fld"><span>${label}</span><input type="text" data-cv="${k}" value="${esc(cv.fields[k] || '')}"${ph ? ` placeholder="${esc(ph)}"` : ''} autocomplete="off"></label>`;
  };

  return {
    tab: 'cover',            // cover | note

    render(main) {
      ensureAssets();
      loadCv(); loadPn();
      const cover = this.tab === 'cover';
      main.innerHTML = `<div class="page-head"><h1>표지+양식</h1>
          <span class="sub">${cover ? '디자인을 고르고, 필요한 글자만 입력하세요. 비워 둔 항목은 표지에 나오지 않아요.' : '양식을 고르고 간격을 맞춘 뒤 출력하세요.'}</span></div>
        <div class="tabs"><button data-tab="cover" class="${cover ? 'active' : ''}">표지</button><button data-tab="note" class="${cover ? '' : 'active'}">시험지·노트</button></div>
        <div class="pr-wrap">
          <aside class="panel pr-side">${cover ? this.cvSideHtml() : this.pnSideHtml()}</aside>
          <section class="pr-view">
            <div class="pr-stage" data-stage><div class="pr-stage-name" data-stage-name></div><div class="pr-scaler" data-scaler></div></div>
            <div class="pr-gallery" data-gallery role="listbox" aria-label="${cover ? '표지 디자인' : '양식'}"></div>
          </section>
        </div>`;
      main.onclick = (e) => this.onClick(e, main);
      main.oninput = (e) => this.onInput(e, main);
      main.onchange = (e) => this.onChange(e, main);
      main.onkeydown = (e) => {
        if (e.key === 'Enter' && e.target.matches('[data-cv-preset-name]')) { e.preventDefault(); this.cvSavePreset(main); }
      };
      clearTimeout(galleryT);
      if (cover) { this.cvPreview(main); this.cvGallery(main); this.cvPresets(main); }
      else { this.pnPreview(main); this.pnGallery(main); this.pnSyncMode(main); }
      // 미리보기 크기를 화면에 맞춤
      if (!ro && window.ResizeObserver) ro = new ResizeObserver(() => this.scale());
      if (ro) { ro.disconnect(); ro.observe($('[data-stage]', main)); }
    },

    onLeave() {
      if (ro) ro.disconnect();
      clearTimeout(galleryT);
    },

    // 글꼴 도착 뒤 다시 맞추기 (이 화면을 보고 있을 때만)
    refit() {
      const main = $('#main');
      if (App.page !== 'prints' || !main || !$('[data-stage]', main)) return;
      if (this.tab === 'cover') { fitAll($('[data-scaler]', main)); fitAll($('[data-gallery]', main)); }
      else this.pnRefill(main, true);
      this.scale();
    },

    scale() {
      const main = $('#main');
      const stage = main && $('[data-stage]', main), sc = stage && $('[data-scaler]', stage);
      const p = sc && sc.firstElementChild;
      if (!p) return;
      const cs = getComputedStyle(stage);
      const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const s = Math.max(0.1, Math.min(1, aw / PAGE_W, ah / PAGE_H));
      sc.style.width = (PAGE_W * s) + 'px';
      sc.style.height = (PAGE_H * s) + 'px';
      p.style.transform = `scale(${s})`;
    },

    /* ---------- 이벤트 ---------- */
    onClick(e, main) {
      const tb = e.target.closest('[data-tab]');
      if (tb) { if (this.tab !== tb.dataset.tab) { this.tab = tb.dataset.tab; App.render(); } return; }
      const th = e.target.closest('.pr-thumb');
      if (th) {
        if (this.tab === 'cover') { cv.tpl = +th.dataset.i; saveCv(); }
        else pn.template = th.dataset.k;
        $$('.pr-thumb', main).forEach(t => {
          const on = t === th;
          t.classList.toggle('on', on); t.setAttribute('aria-selected', on);
        });
        if (this.tab === 'cover') this.cvPreview(main); else this.pnPreview(main);
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'logo-up') $('[data-cv-logo-file]', main).click();
      else if (a === 'logo-del') this.cvDelLogo(main);
      else if (a === 'preset-save') this.cvSavePreset(main);
      else if (a === 'preset-load') this.cvLoadPreset(+b.dataset.i);
      else if (a === 'preset-del') this.cvDelPreset(main, +b.dataset.i);
      else if (a === 'cv-print') this.cvPrint(main);
      else if (a === 'pn-print') this.pnPrint(main);
    },

    onInput(e, main) {
      const t = e.target;
      if (t.matches('[data-cv]')) {
        cv.fields[t.dataset.cv] = t.value; saveCv();
        this.cvUpdate(main, false);
      } else if (t.matches('[data-cv-copies]')) {
        cv.copies = cvCopies(main); saveCv();
        this.cvPrintLabel(main);
      } else if (t.matches('[data-pn-academy]')) {
        cv.fields.academy = t.value; saveCv();          // 표지 탭의 학원명과 같은 값
        const a = $('[data-scaler] .pn-academy', main);
        if (a) a.textContent = cv.fields.academy;
        this.pnGalleryLater(main);
      } else if (t.matches('[data-pn-gap]')) {
        pn.gap = parseFloat(t.value);
        $('[data-pn-gap-out]', main).textContent = pn.gap.toFixed(1) + 'mm';
        this.pnRefill(main); savePn();
      } else if (t.matches('[data-pn-grid]')) {
        pn.gridGap = parseFloat(t.value);
        $('[data-pn-grid-out]', main).textContent = pn.gridGap.toFixed(1) + 'mm';
        this.pnRefill(main); savePn();
      } else if (t.matches('[data-pn-copies]')) {
        pn.copies = t.value;
      }
    },

    onChange(e, main) {
      const t = e.target;
      if (t.matches('[data-cv-blank]')) {
        cv.nameBlank = t.checked; saveCv();
        this.cvUpdate(main, false);
      } else if (t.matches('[data-cv-logo-file]')) {
        this.cvUploadLogo(main, t);
      } else if (t.matches('[data-pn-duplex]')) {
        pn.duplexPrinter = t.checked; savePn(); this.pnSyncMode(main);
      } else if (t.matches('[name="pn-mode"]')) {
        if (t.checked) { pn.mode = t.value; this.pnSyncMode(main); }
      }
    },

    /* ---------- 표지: 화면 ---------- */
    cvSideHtml() {
      return `<div class="pr-sec"><h2>글자</h2>
          ${CV_FIELDS.map(fld).join('')}
          <label class="chk pr-chk"><input type="checkbox" data-cv-blank ${cv.nameBlank ? 'checked' : ''}>이름을 비워 두면 쓰는 칸으로 표시</label>
        </div>
        <div class="pr-sec"><h2>로고</h2>
          <div class="pr-logo">
            <div class="pr-logo-prev" data-cv-logo-prev>${this.cvLogoPrevHtml()}</div>
            <div class="pr-logo-btns">
              <button type="button" class="btn sm" data-act="logo-up">로고 올리기</button>
              <button type="button" class="btn sm danger" data-act="logo-del">로고 지우기</button>
              <input type="file" accept="image/*" hidden data-cv-logo-file>
            </div>
          </div>
          <p class="pr-hint">한 번 올리면 이 기기에 저장되어, 바꾸기 전까지 계속 쓰여요.</p>
        </div>
        <div class="pr-sec"><h2>저장한 조합</h2>
          <div class="pr-inline">
            <input type="text" data-cv-preset-name placeholder="예: 2학년 중간 변형문제" autocomplete="off">
            <button type="button" class="btn sm" data-act="preset-save">저장</button>
          </div>
          <ul class="pr-presets" data-cv-presets></ul>
          <p class="pr-hint">디자인과 입력한 글자를 함께 저장해요. 마지막 입력 내용은 자동으로 기억돼요.</p>
        </div>
        <div class="pr-sec"><h2>인쇄</h2>
          <div class="pr-print">
            <input type="number" data-cv-copies min="1" max="300" value="${cv.copies || 1}" aria-label="인쇄 매수">
            <button type="button" class="btn primary" data-act="cv-print" data-cv-print-btn>인쇄하기 (${Math.min(300, Math.max(1, +cv.copies || 1))}장)</button>
          </div>
          <div class="pr-note">인쇄 창에서 <b>양면 인쇄는 끄기</b>, <b>용지 A4</b>, <b>배율 100%(실제 크기)</b>로 맞춰 주세요.
            색이 안 나오면 <b>배경 그래픽</b>을 켜 주세요.</div>
        </div>`;
    },
    cvLogoPrevHtml() { return logo ? `<img src="${logo}" alt="학원 로고">` : '로고 없음'; },
    cvPrintLabel(main) {
      const b = $('[data-cv-print-btn]', main);
      if (b) b.textContent = `인쇄하기 (${cvCopies(main)}장)`;
    },
    cvPreview(main) {
      const sc = $('[data-scaler]', main);
      sc.innerHTML = cvPageHTML(cv.tpl, ctx());
      $('[data-stage-name]', main).textContent = `${cv.tpl + 1}. ${CV_NAMES[cv.tpl]}`;
      fitAll(sc);
      this.scale();
    },
    cvGallery(main) {
      const g = $('[data-gallery]', main);
      if (!g) return;
      const c = ctx();
      g.innerHTML = CV_NAMES.map((nm, i) =>
        `<button type="button" class="pr-thumb${i === cv.tpl ? ' on' : ''}" data-i="${i}" role="option" aria-selected="${i === cv.tpl}">
          <div class="tw">${cvPageHTML(i, c)}</div><span class="tl">${i + 1}. ${nm}</span></button>`).join('');
      fitAll(g);
    },
    // 글자를 고칠 때: 미리보기는 바로, 썸네일은 잠깐 뒤에
    cvUpdate(main, immediateGallery) {
      this.cvPreview(main);
      clearTimeout(galleryT);
      if (immediateGallery) this.cvGallery(main);
      else galleryT = setTimeout(() => { if (main.contains($('[data-gallery]', main))) this.cvGallery(main); }, 200);
    },
    cvPresets(main) {
      const ul = $('[data-cv-presets]', main);
      if (!ul) return;
      if (!presets.length) { ul.innerHTML = '<li class="none">아직 저장한 조합이 없어요.</li>'; return; }
      ul.innerHTML = presets.map((p, i) =>
        `<li><span class="pn" title="${esc(p.name)}">${esc(p.name)} <small>· ${esc(CV_NAMES[p.tpl] || '')}</small></span>
          <button type="button" class="btn sm" data-act="preset-load" data-i="${i}">불러오기</button>
          <button type="button" class="btn sm danger" data-act="preset-del" data-i="${i}">삭제</button></li>`).join('');
    },

    /* ---------- 표지: 로고 ---------- */
    cvUploadLogo(main, input) {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 800, r = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const data = c.toDataURL('image/png');
          logo = data;
          if (!save(K_CV_LOGO, data)) alertDlg('로고 저장', '로고가 너무 커서 이 기기에 저장하지 못했어요. 이번 사용 중에는 표시되지만, 다시 열면 사라져요. 더 작은 이미지로 올려 주세요.');
          this.cvAfterLogo();
        };
        img.onerror = () => alertDlg('로고 올리기', '이미지를 읽지 못했어요. PNG나 JPG 파일로 올려 주세요.');
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
      input.value = '';
    },
    async cvDelLogo() {
      if (!logo) return;
      if (!await confirmDlg('저장된 로고를 지울까요?', '지우기', true)) return;
      logo = null;
      try { localStorage.removeItem(K_CV_LOGO); } catch (e) {}
      this.cvAfterLogo();
    },
    // 로고가 바뀐 뒤 (다른 화면으로 옮겨 갔으면 다음에 들어올 때 반영됨)
    cvAfterLogo() {
      const main = $('#main');
      if (App.page !== 'prints' || this.tab !== 'cover' || !$('[data-cv-logo-prev]', main)) return;
      $('[data-cv-logo-prev]', main).innerHTML = this.cvLogoPrevHtml();
      this.cvUpdate(main, true);
    },

    /* ---------- 표지: 저장한 조합 ---------- */
    async cvSavePreset(main) {
      const inp = $('[data-cv-preset-name]', main);
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      const item = { name, tpl: cv.tpl, fields: Object.assign({}, cv.fields), nameBlank: !!cv.nameBlank };
      const idx = presets.findIndex(p => p.name === name);
      if (idx >= 0) {
        if (!await confirmDlg(`‘${name}’ 조합이 이미 있어요. 덮어쓸까요?`, '덮어쓰기')) return;
        presets[idx] = item;
      } else presets.unshift(item);
      save(K_CV_PRESETS, presets);
      inp.value = '';
      this.cvPresets(main);
      toast('조합을 저장했습니다');
    },
    cvLoadPreset(i) {
      const p = presets[i];
      if (!p) return;
      cv.tpl = (typeof p.tpl === 'number' && p.tpl >= 0 && p.tpl < CV_NAMES.length) ? p.tpl : 0;
      cv.fields = Object.assign({}, CV_DEFAULT.fields, p.fields);
      cv.nameBlank = !!p.nameBlank;
      saveCv();
      App.render();                                   // 입력칸까지 새 값으로 다시 그림
    },
    async cvDelPreset(main, i) {
      const p = presets[i];
      if (!p) return;
      if (!await confirmDlg(`‘${p.name}’ 조합을 삭제할까요?`, '삭제', true)) return;
      presets.splice(i, 1);
      save(K_CV_PRESETS, presets);
      this.cvPresets(main);
    },

    /* ---------- 표지: 인쇄 ---------- */
    cvPrint(main) {
      const n = cvCopies(main);
      // 실제 크기로 한 장을 그려 글자 줄임을 계산한 뒤, 그 결과를 매수만큼 복사
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden';
      document.body.appendChild(box);
      box.innerHTML = cvPageHTML(cv.tpl, ctx());
      fitAll(box);
      const one = box.innerHTML;
      box.remove();
      printPaper(one.repeat(n), `표지_${CV_NAMES[cv.tpl]}`);
    },

    /* ---------- 시험지·노트: 화면 ---------- */
    pnSideHtml() {
      return `<div class="pr-sec"><h2>글자</h2>
          <label class="pr-fld"><span>학원명</span><input type="text" data-pn-academy value="${esc(pnAcademy())}" placeholder="학원명을 입력하세요" maxlength="40" autocomplete="off"></label>
          <p class="pr-hint">표지 탭의 학원명과 같은 값이에요.</p>
        </div>
        <div class="pr-sec"><h2>간격</h2>
          <div class="pr-fld" data-pn-gap-fld><span>줄 간격</span>
            <div class="pr-range"><input type="range" data-pn-gap min="6" max="12" step="0.5" value="${pn.gap}" aria-label="줄 간격"><output data-pn-gap-out>${pn.gap.toFixed(1)}mm</output></div></div>
          <div class="pr-fld" data-pn-grid-fld><span>모눈 간격</span>
            <div class="pr-range"><input type="range" data-pn-grid min="3" max="10" step="0.5" value="${pn.gridGap}" aria-label="모눈 간격"><output data-pn-grid-out>${pn.gridGap.toFixed(1)}mm</output></div></div>
        </div>
        <div class="pr-sec"><h2>출력</h2>
          <label class="chk pr-chk"><input type="checkbox" data-pn-duplex ${pn.duplexPrinter ? 'checked' : ''}>양면 프린터 사용</label>
          <div class="pr-radio">
            <span class="pr-sub">출력 모드</span>
            <label class="chk" data-pn-r-single><input type="radio" name="pn-mode" value="single">단면 출력</label>
            <label class="chk" data-pn-r-double><input type="radio" name="pn-mode" value="double">양면 출력</label>
            <p class="pr-hint" data-pn-mode-hint></p>
          </div>
          <div class="pr-print">
            <input type="number" data-pn-copies min="1" max="500" step="1" value="${esc(pn.copies)}" placeholder="부수" aria-label="출력 부수">
            <button type="button" class="btn primary" data-act="pn-print">출력</button>
          </div>
          <div class="pr-note">인쇄창에서 배율은 <b>기본값(100%)</b>으로 두세요. 양면 프린터를 사용할 땐 인쇄창의 <b>양면 인쇄</b>도 켜져 있어야 해요.</div>
        </div>`;
    },
    pnPreview(main) {
      const tpl = PN_TEMPLATES[pn.template];
      const hasLined = tpl.sections.some(s => s.lined), hasGrid = tpl.sections.some(s => s.grid);
      $('[data-pn-gap]', main).disabled = !hasLined;
      $('[data-pn-gap-fld]', main).classList.toggle('is-off', !hasLined);
      $('[data-pn-grid]', main).disabled = !hasGrid;
      $('[data-pn-grid-fld]', main).classList.toggle('is-off', !hasGrid);
      const sc = $('[data-scaler]', main);
      sc.innerHTML = pnSheetHTML(tpl);
      $('[data-stage-name]', main).textContent = tpl.name;
      this.scale();
      this.pnRefill(main, false, true);
    },
    // 미리보기의 줄·모눈을 다시 계산 (+ 썸네일)
    pnRefill(main, galleryNow, noGallery) {
      const sheet = $('[data-scaler] > .pn-sheet', main);
      if (!sheet) return;
      const real = fillLines(sheet);
      if (real != null) $('[data-pn-gap-out]', main).textContent = real.toFixed(1) + 'mm';
      if (noGallery) return;
      if (galleryNow) $$('[data-gallery] .pn-sheet', main).forEach(fillLines);
      else this.pnGalleryLater(main);
    },
    pnGallery(main) {
      const g = $('[data-gallery]', main);
      if (!g) return;
      g.innerHTML = Object.keys(PN_TEMPLATES).map(k =>
        `<button type="button" class="pr-thumb${k === pn.template ? ' on' : ''}" data-k="${k}" role="option" aria-selected="${k === pn.template}">
          <div class="tw">${pnSheetHTML(PN_TEMPLATES[k])}</div><span class="tl">${esc(PN_TEMPLATES[k].name)}</span></button>`).join('');
      $$('.pn-sheet', g).forEach(fillLines);
    },
    pnGalleryLater(main) {
      clearTimeout(galleryT);
      galleryT = setTimeout(() => { if (main.contains($('[data-gallery]', main))) this.pnGallery(main); }, 200);
    },
    pnSyncMode(main) {
      const dbl = $('[name="pn-mode"][value="double"]', main);
      if (!dbl) return;
      dbl.disabled = !pn.duplexPrinter;
      $('[data-pn-r-double]', main).classList.toggle('is-off', !pn.duplexPrinter);
      if (!pn.duplexPrinter && pn.mode === 'double') pn.mode = 'single';
      $$('[name="pn-mode"]', main).forEach(r => { r.checked = r.value === pn.mode; });
      $('[data-pn-mode-hint]', main).textContent =
        pn.mode === 'double' ? '한 장의 앞뒤에 같은 양식이 인쇄돼요.'
        : pn.duplexPrinter ? '' : '양면 출력은 양면 프린터 사용 시에만 선택할 수 있어요.';
    },

    /* ---------- 시험지·노트: 인쇄 ---------- */
    pnPrint(main) {
      const inp = $('[data-pn-copies]', main);
      if (inp.value.trim() === '') { toast('출력 부수를 입력하세요.'); inp.focus(); return; }
      const n = pnReadCopies(inp.value);
      if (n === null) { toast('출력 부수는 1에서 500 사이로 입력하세요.'); inp.focus(); return; }
      const sheet = $('[data-scaler] > .pn-sheet', main);
      if (!sheet) return;
      fillLines(sheet);
      const master = sheet.cloneNode(true);
      master.style.transform = '';
      const one = master.outerHTML, blank = '<div class="pn-sheet"></div>';
      let h = '';
      for (let i = 0; i < n; i++) {
        h += one;
        if (pn.mode === 'double') h += one;            // 앞뒤 같은 양식
        else if (pn.duplexPrinter) h += blank;         // 양면 프린터에서 단면 출력: 뒷면은 빈 장
      }
      printPaper(h, PN_TEMPLATES[pn.template].name);
    },
  };
})();
