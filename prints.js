/* =========================================================
   prints.js — 학생 > 표지+양식
   · 내신 표지 탭: 표지 디자인 5종을 고르고 글자·로고를 넣어 인쇄 (원본: covers.html)
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
.cv-page .se{display:flex;align-items:center;flex-wrap:wrap;gap:2mm 5mm}
.cv-page .se > *{margin:0 !important}
/* 뒷표지: 디자인만 남기고 하단 가운데에 로고 + 학원명(앞표지 학원명의 약 2배) */
.cv-page .bk{position:absolute;left:20mm;right:20mm;bottom:24mm;display:flex;align-items:center;justify-content:center;gap:4mm;font-weight:700;font-size:19.8mm;line-height:1.2}
.cv-page .bk .bt{width:auto;max-width:100%;min-width:0;overflow:hidden}
.cv-page .bk .lg{flex:none;max-height:22mm;max-width:50mm}
.cv-t2 .bk{color:#111}
.cv-t5 .bk{bottom:32mm;left:26mm;right:26mm;font-family:'Noto Serif KR',serif;font-size:19mm;letter-spacing:2.4mm}
.cv-t6 .bk{color:#13294B}
.cv-t7 .bk{left:64mm;right:22mm;color:#0F6E6B}
.cv-t8 .bk{color:#1A1A2E}
.cv-page .name{font-size:5mm;display:flex;align-items:flex-end;gap:3mm;margin-left:auto}      /* 이름은 항상 오른쪽 */
.cv-page .name .nv{display:inline-block;min-width:30mm;border-bottom:0.35mm solid currentColor;padding:0 1.5mm 0.8mm;font-weight:700;text-align:center;white-space:nowrap}   /* 밑줄: 5자 정도, 이름은 가운데 */

/* 1. 클래식 */

/* 2. 블록 */
.cv-t2 .block{position:absolute;left:0;right:0;top:0;height:205mm;background:#F5C518;padding:22mm 20mm 18mm;display:flex;flex-direction:column}
.cv-t2 .se{align-self:flex-start}
.cv-t2 .school{font-weight:700;font-size:10.5mm;border:0.6mm solid #111;padding:1.6mm 4.5mm}
.cv-t2 .ttx{margin-top:auto;padding-right:16mm}
.cv-t2 .exam{font-weight:700;font-size:12.3mm;margin-bottom:3mm}
.cv-t2 .title{font-family:'Black Han Sans',sans-serif;font-size:34.5mm;line-height:1;color:#111}
.cv-t2 .deco{position:absolute;right:9mm;top:20mm;height:177mm;white-space:nowrap;overflow:hidden;writing-mode:vertical-rl;font-family:'Archivo Black',sans-serif;font-size:15mm;color:transparent;-webkit-text-stroke:0.35mm #111;letter-spacing:1mm}
.cv-t2 .bar{position:absolute;left:0;right:0;top:205mm;height:4mm;background:#111}
.cv-t2 .lower{position:absolute;top:209mm;left:20mm;right:20mm;bottom:20mm;display:flex;flex-direction:column;padding-top:16mm}
.cv-t2 .book{font-weight:700;font-size:10mm;line-height:1.35;border-left:2.2mm solid #111;padding-left:5mm;margin-bottom:6mm}
.cv-t2 .foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm}
.cv-t2 .brand{display:flex;align-items:center;gap:3mm;font-weight:700;font-size:9.9mm}
.cv-t2 .lg{max-height:13mm;max-width:40mm}


/* 4. 스위스 */

/* 5. 아카데미 */
.cv-t5{background:#1D3A2E;color:#EFE5CD}
.cv-t5 .frame{position:absolute;inset:10mm;border:0.5mm solid #C8A55A}
.cv-t5 .frame2{position:absolute;inset:13mm;border:0.2mm solid #C8A55A}
.cv-t5 .orn{position:absolute;width:5mm;height:5mm;background:#C8A55A;transform:rotate(45deg)}
.cv-t5 .orn.tl{top:7.7mm;left:7.7mm}.cv-t5 .orn.tr{top:7.7mm;right:7.7mm}
.cv-t5 .orn.bl{bottom:7.7mm;left:7.7mm}.cv-t5 .orn.br{bottom:7.7mm;right:7.7mm}
.cv-t5 .col{position:absolute;top:56mm;left:26mm;right:26mm;display:flex;flex-direction:column;align-items:center;text-align:center}
.cv-t5 .lgw{margin-bottom:6mm}
.cv-t5 .lgw .lg{max-width:40mm;max-height:24mm}
.cv-t5 .academy{font-family:'Noto Serif KR',serif;font-weight:700;font-size:9.5mm;letter-spacing:1.2mm}
.cv-t5 .title{font-family:'Noto Serif KR',serif;font-weight:900;font-size:18mm;line-height:1.15}
.cv-t5 .rule{display:flex;align-items:center;gap:3mm;margin:9mm 0;width:60mm}
.cv-t5 .rule::before,.cv-t5 .rule::after{content:"";flex:1;height:0.25mm;background:#C8A55A}
.cv-t5 .rule b{width:2.6mm;height:2.6mm;background:#C8A55A;transform:rotate(45deg)}
.cv-t5 .book{margin-top:7mm;font-family:'Noto Serif KR',serif;font-weight:700;font-size:7.5mm}
.cv-t5 .se{margin-top:24mm;justify-content:center}
.cv-t5 .school{font-size:6.7mm;letter-spacing:0.5mm;color:#D9CBA6}
.cv-t5 .exam{margin-top:6mm;font-size:6.4mm;border-top:0.25mm solid #C8A55A;border-bottom:0.25mm solid #C8A55A;padding:1.6mm 6mm;color:#C8A55A}
.cv-t5 .name{position:absolute;bottom:30mm;right:26mm}

/* 6. 사선 */
.cv-t6 .bands i{position:absolute;width:420mm;transform:rotate(-28deg);transform-origin:50% 50%}
.cv-t6 .b1{top:16mm;right:-170mm;height:52mm;background:#13294B}
.cv-t6 .b2{top:70mm;right:-160mm;height:11mm;background:#FF6B57}
.cv-t6 .b3{top:86mm;right:-150mm;height:4mm;background:#7FB7E8}
.cv-t6 .main{position:absolute;top:128mm;left:20mm;right:20mm}
.cv-t6 .se{margin-bottom:3mm}
.cv-t6 .school{display:inline-block;background:#FF6B57;color:#fff;font-weight:700;font-size:10.3mm;padding:1.8mm 5mm;margin-bottom:5mm}
.cv-t6 .title{margin-top:7mm;font-family:'Do Hyeon',sans-serif;font-size:31.5mm;line-height:1.05;color:#13294B}
.cv-t6 .book{margin-top:14mm;font-weight:700;font-size:9mm;line-height:1.35;color:#13294B}
.cv-t6 .exam{font-weight:700;font-size:10.3mm;color:#4C5D7D}
.cv-t6 .foot{position:absolute;left:20mm;right:20mm;bottom:20mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;color:#13294B}
.cv-t6 .brand{display:flex;align-items:center;gap:3mm;font-weight:700;font-size:9.9mm}
.cv-t6 .lg{max-height:13mm;max-width:40mm}

/* 7. 인덱스 */
.cv-t7 .side{position:absolute;top:0;bottom:0;left:0;width:48mm;background:#0F6E6B;display:flex;flex-direction:column;align-items:center;padding:24mm 0 18mm}
.cv-t7 .vt{writing-mode:vertical-rl;white-space:nowrap;max-height:220mm;height:220mm;overflow:hidden;font-family:'Archivo Black',sans-serif;font-size:15mm;color:transparent;-webkit-text-stroke:0.35mm #fff;letter-spacing:2mm}
.cv-t7 .sbrand{margin-top:auto;background:#fff;border-radius:3mm;padding:2.5mm;display:flex}
.cv-t7 .sbrand:empty{display:none}
.cv-t7 .lg{max-width:30mm;max-height:16mm}
.cv-t7 .tabx{position:absolute;right:0;top:46mm;display:flex;flex-direction:column;gap:3mm}
.cv-t7 .tabx i{display:block;width:7mm;height:26mm;border-radius:2mm 0 0 2mm;background:#0F6E6B}
.cv-t7 .tabx i:nth-child(2){background:#4AA3A0}
.cv-t7 .tabx i:nth-child(3){background:#A7D3D1}
.cv-t7 .main{position:absolute;top:30mm;left:64mm;right:22mm;bottom:50mm;display:flex;flex-direction:column}
.cv-t7 .academy{font-weight:700;font-size:9.9mm;color:#0F6E6B;padding-bottom:5mm;border-bottom:0.4mm solid #0F6E6B}
.cv-t7 .grp{margin-top:auto}
.cv-t7 .se{margin-bottom:14mm}
.cv-t7 .exam{margin-top:3mm;font-size:8.4mm;color:#0F6E6B;font-weight:700}
.cv-t7 .school{font-weight:700;font-size:8.4mm;color:#444}
.cv-t7 .book{margin-top:3mm;font-weight:700;font-size:9mm;line-height:1.35;color:#14171F;word-break:keep-all}
.cv-t7 .title{margin-top:8mm;font-family:'Black Han Sans',sans-serif;font-size:24mm;line-height:1.05;color:#0F6E6B;white-space:nowrap}
.cv-t7 .name{position:absolute;bottom:24mm;right:22mm}

/* 8. 도형 */
.cv-t8 .circ i{position:absolute;border-radius:50%;mix-blend-mode:multiply}
.cv-t8 .c1{width:128mm;height:128mm;top:-26mm;left:-22mm;background:#7B5CF5}
.cv-t8 .c2{width:104mm;height:104mm;top:36mm;left:70mm;background:#FF9147}
.cv-t8 .c3{width:82mm;height:82mm;top:-6mm;left:142mm;background:#22B8A7}
.cv-t8 .main{position:absolute;top:158mm;left:20mm;right:20mm}
.cv-t8 .se{margin-bottom:0}
.cv-t8 .school{font-weight:700;font-size:10.5mm;color:#555;margin-bottom:4mm}
.cv-t8 .title{margin-top:6mm;font-weight:700;font-size:21mm;line-height:1.1;letter-spacing:-0.8mm;color:#1A1A2E}
.cv-t8 .book{margin-top:14mm;font-weight:500;font-size:8.5mm;line-height:1.35;color:#1A1A2E}
.cv-t8 .exam{display:inline-block;font-size:8.7mm;font-weight:700;color:#7B5CF5;border:0.4mm solid #7B5CF5;border-radius:6mm;padding:1.4mm 5mm}
.cv-t8 .foot{position:absolute;left:20mm;right:20mm;bottom:20mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm}
.cv-t8 .brand{display:flex;align-items:center;gap:3mm;font-weight:700;font-size:9.9mm}
.cv-t8 .lg{max-height:13mm;max-width:40mm}

/* 9. 시험지 */

/* 10. 사전 */
/* ================= 일반 표지 (cv-t11 ~ cv-t15) ================= */
.cv-page .ttl{font-family:'Black Han Sans',sans-serif;line-height:1.08}
.cv-t11 .sub,.cv-t12 .sub,.cv-t13 .sub,.cv-t15 .sub{text-align:center}
.cv-t11 .kind,.cv-t12 .kind,.cv-t13 .kind,.cv-t15 .kind{display:table !important;margin-left:auto;margin-right:auto}
.cv-page .gfoot{position:absolute;left:22mm;right:22mm;bottom:22mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm}
.cv-page .gfoot .brand{display:flex;align-items:center;gap:3mm;font-weight:700;font-size:9.9mm;white-space:nowrap;min-width:0}
.cv-page .gfoot .brand{flex:0 1 auto}
.cv-page .gfoot .brand .bt{width:auto;min-width:0;overflow:hidden}
.cv-page .gfoot .lg{flex:none}
.cv-page .gfoot .name{flex:none}
.cv-page .gfoot .lg{max-height:13mm;max-width:40mm}

/* 1. 웨이브 */
.cv-t11 .sky{position:absolute;left:0;right:0;top:0;height:205mm;background:linear-gradient(160deg,#4338CA 0%,#6D5DF6 48%,#22B8CF 100%)}
.cv-t11 .bub i{position:absolute;border-radius:50%;background:rgba(255,255,255,.13)}
.cv-t11 .bub .a{width:92mm;height:92mm;top:-30mm;right:-26mm}
.cv-t11 .bub .b{width:44mm;height:44mm;top:130mm;left:-14mm}
.cv-t11 .bub .c{width:20mm;height:20mm;top:38mm;left:120mm;background:rgba(255,255,255,.2)}
.cv-t11 .wave{position:absolute;left:0;top:176mm;width:210mm;height:44mm;display:block}
.cv-t11 .main{position:absolute;top:66mm;left:22mm;right:22mm;color:#fff}
.cv-t11 .title{font-size:30mm}
.cv-t11 .sub{margin-top:6mm;font-size:11mm;font-weight:700}
.cv-t11 .kind{display:inline-block;margin-top:8mm;font-size:8mm;font-weight:700;color:#4338CA;background:#fff;border-radius:10mm;padding:2mm 7mm}
.cv-t11 .gfoot{color:#2A2F6B}
.cv-t11 .bk{color:#4338CA}

/* 2. 레트로 */
.cv-t12{background:#F4ECDD}
.cv-t12 .sun{position:absolute;top:96mm;left:118mm;width:84mm;height:84mm;border-radius:50%;background:#F29E38}
.cv-t12 .stripes{position:absolute;left:0;right:0;top:150mm}
.cv-t12 .stripes i{display:block;height:10mm;margin-bottom:3.5mm}
.cv-t12 .stripes i:nth-child(1){background:#E85D2A}
.cv-t12 .stripes i:nth-child(2){background:#F29E38}
.cv-t12 .stripes i:nth-child(3){background:#F6C344}
.cv-t12 .stripes i:nth-child(4){background:#3A7D7C}
.cv-t12 .stripes i:nth-child(5){background:#234E52}
.cv-t12 .main{position:absolute;top:36mm;left:22mm;right:22mm;color:#234E52}
.cv-t12 .title{font-size:28mm}
.cv-t12 .sub{margin-top:6mm;font-size:11mm;font-weight:700;color:#E85D2A}
.cv-t12 .kind{display:inline-block;margin-top:8mm;font-size:8mm;font-weight:700;color:#F4ECDD;background:#234E52;padding:2mm 7mm}
.cv-t12 .gfoot{color:#234E52}
.cv-t12 .bk{color:#234E52}

/* 3. 바우하우스 */
.cv-t13{background:#F3EDE2}
.cv-t13 .tiles{position:absolute;top:0;left:0;width:210mm;height:140mm;display:grid;grid-template-columns:repeat(3,70mm);grid-template-rows:repeat(2,70mm)}
.cv-t13 .tiles i{position:relative;overflow:hidden;display:block}
.cv-t13 .tiles b{position:absolute;display:block}
.cv-t13 .k1{background:#2B4C9B}.cv-t13 .k1 b{left:0;top:0;width:70mm;height:70mm;border-radius:0 0 100% 0;background:#E9B23F}
.cv-t13 .k2{background:#E9B23F}.cv-t13 .k2 b{left:10mm;top:10mm;width:50mm;height:50mm;border-radius:50%;background:#D9472B}
.cv-t13 .k3{background:#1C1C1C}.cv-t13 .k3 b{inset:0;background:#F3EDE2;clip-path:polygon(0 100%,100% 100%,100% 0)}
.cv-t13 .k4{background:#D9472B}.cv-t13 .k4 b{left:0;bottom:-35mm;width:70mm;height:70mm;border-radius:50%;background:#F3EDE2}
.cv-t13 .k5{background:#F3EDE2}.cv-t13 .k5 b{right:0;bottom:0;width:70mm;height:70mm;border-radius:100% 0 0 0;background:#2B4C9B}
.cv-t13 .k6{background:#E9B23F}.cv-t13 .k6 b{left:12mm;top:0;bottom:0;width:46mm;background:repeating-linear-gradient(90deg,#1C1C1C 0 6mm,transparent 6mm 14mm)}
.cv-t13 .main{position:absolute;top:162mm;left:22mm;right:22mm;color:#1C1C1C}
.cv-t13 .title{font-size:27mm}
.cv-t13 .sub{margin-top:5mm;font-size:11mm;font-weight:700;color:#2B4C9B}
.cv-t13 .kind{display:inline-block;margin-top:8mm;font-size:8mm;font-weight:700;color:#fff;background:#D9472B;padding:2mm 7mm}
.cv-t13 .gfoot{color:#1C1C1C}
.cv-t13 .bk{color:#1C1C1C}

/* 4. 아치 */
.cv-t14{background:#F6D8C4}
.cv-t14 .floor{position:absolute;left:0;right:0;bottom:0;height:56mm;background:#E9BFA5}
.cv-t14 .arch2{position:absolute;left:21mm;right:21mm;top:38mm;bottom:56mm;border:0.6mm solid #2E5E4E;border-bottom:0;border-radius:84mm 84mm 0 0}
.cv-t14 .arch{position:absolute;left:28mm;right:28mm;top:46mm;bottom:56mm;background:#2E5E4E;border-radius:77mm 77mm 0 0}
.cv-t14 .sun{position:absolute;top:18mm;right:20mm;width:30mm;height:30mm;border-radius:50%;background:#E9A23B}
.cv-t14 .spk i{position:absolute;width:7mm;height:7mm;background:#F6D8C4;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)}
.cv-t14 .spk .a{top:76mm;left:58mm}.cv-t14 .spk .b{top:92mm;right:56mm;width:5mm;height:5mm}.cv-t14 .spk .c{top:206mm;left:46mm;width:5mm;height:5mm}
.cv-t14 .main{position:absolute;top:116mm;left:38mm;right:38mm;text-align:center;color:#FFF4E6}
.cv-t14 .title{font-size:24mm}
.cv-t14 .sub{margin-top:6mm;font-size:10mm;font-weight:700;color:#F6D8C4}
.cv-t14 .kind{display:inline-block;margin-top:8mm;font-size:7.5mm;font-weight:700;color:#2E5E4E;background:#E9A23B;border-radius:10mm;padding:2mm 7mm}
.cv-t14 .gfoot{bottom:20mm;color:#2E5E4E}
.cv-t14 .bk{bottom:18mm;color:#2E5E4E}

/* 5. 도트 */
.cv-t15{background:#111A3A}
.cv-t15 .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.16) 0.9mm,transparent 1.05mm);background-size:7mm 7mm}
.cv-t15 .blk{position:absolute;top:30mm;left:-20mm;width:170mm;height:64mm;background:#3BE8B0;transform:skewY(-7deg)}
.cv-t15 .blk2{position:absolute;top:100mm;left:-20mm;width:110mm;height:9mm;background:#FF4FA3;transform:skewY(-7deg)}
.cv-t15 .ring{position:absolute;right:-34mm;top:-26mm;width:96mm;height:96mm;border-radius:50%;border:7mm solid #FF4FA3;opacity:.9}
.cv-t15 .main{position:absolute;top:132mm;left:22mm;right:22mm;color:#fff}
.cv-t15 .title{font-size:28mm}
.cv-t15 .sub{margin-top:6mm;font-size:11mm;font-weight:700;color:#3BE8B0}
.cv-t15 .kind{display:inline-block;margin-top:8mm;font-size:8mm;font-weight:700;color:#FF4FA3;border:0.6mm solid #FF4FA3;border-radius:10mm;padding:1.6mm 7mm}
.cv-t15 .gfoot{color:#fff}
.cv-t15 .bk{color:#fff}

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
.pn-sheet .pn-blank.pn-val{color:var(--pn-ink);font-weight:700;text-align:center;line-height:5mm;white-space:nowrap;overflow:hidden}
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
/* 서술형 노트 (시험+교재 › 서술형 인쇄의 노트 칸과 같은 크기·간격) */
.pn-sheet .pn-secs.pn-essay{gap:7mm}
.pn-sheet .pn-esh{flex-shrink:0;display:flex;align-items:flex-end;gap:2.5mm;margin-bottom:2.5mm}
.pn-sheet .pn-eno{flex:none;width:6mm;height:6mm;border-radius:3mm;border:0.3mm solid var(--pn-ink-soft)}
.pn-sheet .pn-eko{flex-shrink:0;display:flex;align-items:flex-end;gap:2mm;margin:0 1mm 3mm;font-size:10.5pt;color:var(--pn-ink-soft)}
.pn-sheet .pn-eko .pn-blank{flex:1;height:7mm}
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
    // 일반 표지
    title: ['제목', '예: 능률 VOCA, Solving Guide'], sub: ['부제', '예: 중등 고난도, 주장 요지'], kind: ['구분', '예: 단어 시험지, 실전편'],
  };
  // 남긴 표지: 원래 번호 2·5·6·7·8 (1 클래식·3 노트·4 스위스·9 시험지·10 사전은 삭제) → 화면에는 1~5 로 다시 번호
  const CV_KEEP = [2, 5, 6, 7, 8];                    // 원래 번호 (CSS 클래스 cv-t번호 와 저장값 tk 에 씀)
  const CV_NAMES = ['블록', '아카데미', '사선', '인덱스', '도형'];
  // 저장값 → 지금 목록의 순번. tk(원래 번호)가 있으면 그걸로, 없으면 예전 순번(tpl)으로 판단. 지운 표지면 첫 번째로
  // (내신 표지의 예전 순번은 10개 시절 기준 → +1 이 원래 번호. 일반 표지는 처음부터 tk 로 저장)
  function cvTplIdx(o, keep = CV_KEEP) {
    const tk = (o && typeof o.tk === 'number') ? o.tk
      : (o && typeof o.tpl === 'number') ? (keep === CV_KEEP ? o.tpl + 1 : keep[o.tpl]) : 0;
    const i = keep.indexOf(tk);
    return i < 0 ? 0 : i;
  }
  const CV_DEFAULT = {
    tpl: 0, tk: 2,
    fields: { academy: '○○영어학원', type: '변형문제', school: '○○고 2학년', book: '천재(이재영) Lesson 3~4', exam: '1학기 중간고사', student: '' },
    nameBlank: true,
    copies: 1,
    duplexPrinter: true,      // 양면 프린터 사용: 표지 뒤마다 빈 장을 넣어 앞면만 인쇄되게 (시험지·노트 설정과 따로 저장)
  };

  // 일반 표지: 입력 글자만 다르고 로직·인쇄는 내신 표지와 같음 (디자인·저장값·저장한 조합은 따로, 학원명·로고는 함께)
  const GN_FIELDS = ['academy', 'title', 'sub', 'kind', 'student'];
  const GN_KEEP = [11, 12, 13, 14, 15];               // CSS 클래스 cv-t11 ~ cv-t15
  const GN_NAMES = ['웨이브', '레트로', '바우하우스', '아치', '도트'];
  const GN_DEFAULT = {
    tpl: 0, tk: 11,
    fields: { academy: '○○영어학원', title: 'Solving Guide', sub: '주장 요지', kind: '실전편', student: '' },
    nameBlank: true,
    copies: 1,
    duplexPrinter: true,
  };

  // 표지 종류별 설정 (KD = 지금 보고 있는 종류). tpl·back 은 아래에서 디자인을 만든 뒤 채움
  const KINDS = {
    cover: { names: CV_NAMES, keep: CV_KEEP, fields: CV_FIELDS, order: ['school', 'exam', 'book', 'type', 'academy'],
      def: CV_DEFAULT, stateKey: K_CV_STATE, presetKey: K_CV_PRESETS, file: '내신표지' },
    general: { names: GN_NAMES, keep: GN_KEEP, fields: GN_FIELDS, order: ['title', 'sub', 'kind', 'academy'],
      def: GN_DEFAULT, stateKey: 'mg77_gcover_state', presetKey: 'mg77_gcover_presets', file: '일반표지' },
  };
  let KD = KINDS.cover;
  const isCvTab = (t) => t === 'cover' || t === 'general';

  let cv = null, logo = null, presets = [];
  const store = {};                                    // 종류별 { st: 저장값, pr: 저장한 조합 }
  function loadKind(k) {
    const K = KINDS[k];
    const st = load(K.stateKey, null) || JSON.parse(JSON.stringify(K.def));
    st.fields = Object.assign({}, K.def.fields, st.fields || {});
    st.tpl = cvTplIdx(st, K.keep); st.tk = K.keep[st.tpl];
    if (typeof st.duplexPrinter !== 'boolean') st.duplexPrinter = true;
    let pr = load(K.presetKey, []);
    if (!Array.isArray(pr)) pr = [];
    pr.forEach(p => { if (p) { p.tpl = cvTplIdx(p, K.keep); p.tk = K.keep[p.tpl]; } });
    store[k] = { st, pr };
  }
  function loadCv() {
    if (cv) return;
    loadKind('cover'); loadKind('general');
    store.general.st.fields.academy = store.cover.st.fields.academy;   // 학원명은 내신 표지 값을 함께 씀
    logo = load(K_CV_LOGO, null);
    useKind('cover');
  }
  // 보고 있는 표지 종류로 바꿈 (cv·presets 가 그 종류의 값을 가리키게)
  function useKind(k) {
    if (!KINDS[k]) return;
    KD = KINDS[k]; cv = store[k].st; presets = store[k].pr;
  }
  const saveCv = () => save(KD.stateKey, cv);
  const savePresets = () => save(KD.presetKey, presets);
  // 학원명: 내신 표지·일반 표지·시험지·노트가 함께 씀
  function setAcademy(v) {
    ['cover', 'general'].forEach(k => { store[k].st.fields.academy = v; save(KINDS[k].stateKey, store[k].st); });
  }

  const w = (cond, html) => cond ? html : '';
  // studentName: 반에서 고른 학생 이름으로 바꿔 그릴 때 (undefined 면 입력칸 값 그대로)
  function ctx(studentName) {
    const v = {};
    KD.fields.forEach(k => v[k] = esc((cv.fields[k] || '').trim()));
    if (studentName !== undefined) v.student = esc(String(studentName || '').trim());
    return {
      v,
      logo: logo ? `<img class="lg" src="${logo}" alt="">` : '',
      showName: studentName !== undefined ? true : (!!v.student || !!cv.nameBlank),
    };
  }
  function nameBlock(c) {
    return c.showName ? `<div class="name"><span class="nl">이름</span><span class="nv">${c.v.student}</span></div>` : '';
  }
  function brand(c) {
    return (c.logo || c.v.academy) ? `<div class="brand">${c.logo}${w(c.v.academy, `<span>${c.v.academy}</span>`)}</div>` : '';
  }

  const CV_TPL = [
    // 1 블록 (원래 2)
    c => `<div class="block">
        ${(c.v.school || c.v.exam) ? `<div class="se">${w(c.v.school, `<div class="school">${c.v.school}</div>`)}${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}</div>` : ''}
        <div class="ttx">
          ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
          ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        </div>
        <div class="deco fit-v">CINDY ENGLISH</div>
      </div>
      <div class="bar"></div>
      <div class="lower">
        <div class="foot">${brand(c) || '<span></span>'}${nameBlock(c)}</div>
      </div>`,

    // 2 아카데미 (원래 5)
    c => `<div class="frame"></div><div class="frame2"></div>
      ${['tl', 'tr', 'bl', 'br'].map(p => `<i class="orn ${p}"></i>`).join('')}
      <div class="col">
        ${c.logo ? `<div class="lgw">${c.logo}</div>` : ''}
        ${w(c.v.academy, `<div class="academy">${c.v.academy}</div>`)}
        ${(c.v.school || c.v.exam) ? `<div class="se">${w(c.v.school, `<div class="school">${c.v.school}</div>`)}${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}</div>` : ''}
        ${w(c.v.book, `<div class="book fit">${c.v.book}</div>`)}
        <div class="rule"><b></b></div>
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
      </div>
      ${nameBlock(c)}`,

    // 3 사선 (원래 6)
    c => `<div class="bands"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
      <div class="main">
        ${(c.v.school || c.v.exam) ? `<div class="se">${w(c.v.school, `<div class="school">${c.v.school}</div>`)}${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}</div>` : ''}
        ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
      </div>
      <div class="foot">${brand(c) || '<span></span>'}${nameBlock(c)}</div>`,

    // 4 인덱스 (원래 7)
    c => `<div class="side"><div class="vt fit-v">CINDY ENGLISH</div><div class="sbrand">${c.logo}</div></div>
      <div class="tabx"><i></i><i></i><i></i></div>
      <div class="main">
        ${w(c.v.academy, `<div class="academy">${c.v.academy}</div>`)}
        <div class="grp">
          ${(c.v.school || c.v.exam) ? `<div class="se">${w(c.v.school, `<div class="school">${c.v.school}</div>`)}${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}</div>` : ''}
          ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
          ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
        </div>
      </div>
      ${nameBlock(c)}`,

    // 5 도형 (원래 8)
    c => `<div class="circ"><i class="c1"></i><i class="c2"></i><i class="c3"></i></div>
      <div class="main">
        ${(c.v.school || c.v.exam) ? `<div class="se">${w(c.v.school, `<div class="school">${c.v.school}</div>`)}${w(c.v.exam, `<div class="exam">${c.v.exam}</div>`)}</div>` : ''}
        ${w(c.v.book, `<div class="book">${c.v.book}</div>`)}
        ${w(c.v.type, `<div class="title fit">${c.v.type}</div>`)}
      </div>
      <div class="foot">${brand(c) || '<span></span>'}${nameBlock(c)}</div>`,

  ];
  const cvPageHTML = (i, c) => `<div class="cv-page cv-t${KD.keep[i]}">${KD.tpl[i](c)}</div>`;

  // 뒷표지: 앞표지(CV_TPL)와 같은 순서·같은 디자인에서 글자를 모두 빼고, 하단 가운데에 로고 + 학원명만
  const backAc = (c) => (c.logo || c.v.academy) ? `<div class="bk">${c.logo}${w(c.v.academy, `<span class="bt fit">${c.v.academy}</span>`)}</div>` : '';
  const CV_BACK = [
    // 1 블록
    c => `<div class="block"><div class="deco fit-v">CINDY ENGLISH</div></div><div class="bar"></div>${backAc(c)}`,
    // 2 아카데미
    c => `<div class="frame"></div><div class="frame2"></div>
      ${['tl', 'tr', 'bl', 'br'].map(p => `<i class="orn ${p}"></i>`).join('')}${backAc(c)}`,
    // 3 사선
    c => `<div class="bands"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>${backAc(c)}`,
    // 4 인덱스
    c => `<div class="side"><div class="vt fit-v">CINDY ENGLISH</div></div><div class="tabx"><i></i><i></i><i></i></div>${backAc(c)}`,
    // 5 도형
    c => `<div class="circ"><i class="c1"></i><i class="c2"></i><i class="c3"></i></div>${backAc(c)}`,
  ];
  const cvBackHTML = (i, c) => `<div class="cv-page cv-t${KD.keep[i]} cv-back">${KD.back[i](c)}</div>`;

  /* ---------- 일반 표지 디자인 (앞·뒤) ---------- */
  // 제목 → 부제 → 구분 순서로 읽힘. 아래는 학원명(로고)과 이름
  const gnText = (c) => `${w(c.v.title, `<div class="title ttl fit">${c.v.title}</div>`)}
        ${w(c.v.sub, `<div class="sub">${c.v.sub}</div>`)}
        ${w(c.v.kind, `<div class="kind">${c.v.kind}</div>`)}`;
  // 학원명은 한 줄로. 길어서 이름 칸과 부딪히면 글자를 자동으로 줄임
  const gnBrand = (c) => (c.logo || c.v.academy) ? `<div class="brand">${c.logo}${w(c.v.academy, `<span class="bt fit">${c.v.academy}</span>`)}</div>` : '';
  const gnFoot = (c) => `<div class="gfoot">${gnBrand(c) || '<span></span>'}${nameBlock(c)}</div>`;
  const WAVE = `<svg class="wave" viewBox="0 0 210 44" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 14 C 38 0, 78 30, 118 16 S 186 2, 210 12 L210 44 L0 44Z" fill="rgba(255,255,255,.35)"/>
      <path d="M0 24 C 44 8, 86 38, 128 24 S 190 12, 210 22 L210 44 L0 44Z" fill="#fff"/></svg>`;
  const GN_DECO = [
    // 1 웨이브
    () => `<div class="sky"></div><div class="bub"><i class="a"></i><i class="b"></i><i class="c"></i></div>${WAVE}`,
    // 2 레트로
    () => `<div class="sun"></div><div class="stripes"><i></i><i></i><i></i><i></i><i></i></div>`,
    // 3 바우하우스
    () => `<div class="tiles">${[1, 2, 3, 4, 5, 6].map(n => `<i class="k${n}"><b></b></i>`).join('')}</div>`,
    // 4 아치
    () => `<div class="floor"></div><div class="arch2"></div><div class="arch"></div><div class="sun"></div>
      <div class="spk"><i class="a"></i><i class="b"></i><i class="c"></i></div>`,
    // 5 도트
    () => `<div class="dots"></div><div class="blk"></div><div class="blk2"></div><div class="ring"></div>`,
  ];
  const GN_TPL = GN_DECO.map(d => c => `${d()}<div class="main">${gnText(c)}</div>${gnFoot(c)}`);
  const GN_BACK = GN_DECO.map(d => c => `${d()}${backAc(c)}`);
  KINDS.cover.tpl = CV_TPL; KINDS.cover.back = CV_BACK;
  KINDS.general.tpl = GN_TPL; KINDS.general.back = GN_BACK;

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
     학생 이름: 직접 입력 / 반에서 선택 (표지·시험지·노트 탭이 함께 씀)
     · 반에서 선택: 여러 반을 오가며 체크한 학생이 누적됨. 학생 수만큼 한 장씩, 이름만 바꿔 인쇄
     · 앱을 켜 둔 동안만 기억 (저장하지 않음)
     ========================================================= */
  const pick = { mode: 'manual', classId: '', sel: [] };     // sel: 고른 순서대로 학생 id
  const isActiveStu = (s) => s && s.status !== 'pause' && s.status !== 'left';
  function pkClasses() {
    return Classes.sorted(Store.all('classes').filter(c => c.active !== false));
  }
  // 오늘 기준 그 반의 재원생
  function pkRoster(classId) {
    return classId ? Classes.rosterAt(classId, todayStr()).filter(isActiveStu) : [];
  }
  // 고른 학생 중 지금도 있는 학생만 (지워진 학생은 빼고)
  function pkStudents() {
    return pick.sel.map(id => Store.get('students', id)).filter(Boolean);
  }
  const pkOn = () => pick.mode === 'class';
  // 미리보기 제목 뒤에 붙는 글자: " · 홍길동 외 3명"
  function pkSuffix() {
    const list = pkOn() ? pkStudents() : [];
    return list.length ? ` · ${list[0].name}${list.length > 1 ? ` 외 ${list.length - 1}명` : ''}` : '';
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
    // 서술형 노트: 시험+교재 › 서술형 인쇄의 따라쓰기 노트와 같은 모양 (위·아래 두 칸, 번호·해석을 손으로 쓰는 칸 + 줄)
    essayNote: { name: '서술형 노트', essay: true, sections: [{ title: '', ratio: 1, lined: true, essay: true }, { title: '', ratio: 1, lined: true, essay: true }] },
  };

  let pn = null;
  function loadPn() {
    if (pn) return;
    // 양식·출력 모드·부수는 원본처럼 저장하지 않음 (앱을 켜 둔 동안만 기억). 학원명은 표지 탭과 함께 씀
    pn = { template: 'reading', gap: 8, gridGap: 5, duplexPrinter: true, mode: 'single', copies: '', name: '', date: '' };
    const saved = load(K_PN, null);
    if (saved) {
      if (typeof saved.gap === 'number' && saved.gap >= 6 && saved.gap <= 12) pn.gap = saved.gap;
      if (typeof saved.gridGap === 'number' && saved.gridGap >= 3 && saved.gridGap <= 10) pn.gridGap = saved.gridGap;
      if (typeof saved.duplexPrinter === 'boolean') pn.duplexPrinter = saved.duplexPrinter;
    }
  }
  const savePn = () => save(K_PN, { gap: pn.gap, gridGap: pn.gridGap, duplexPrinter: pn.duplexPrinter });
  const pnAcademy = () => (store.cover ? store.cover.st.fields.academy : '') || '';

  // 2026-11-16 → 2026. 11. 16.
  const pnDateText = (d) => isYmd(d) ? `${d.slice(0, 4)}. ${+d.slice(5, 7)}. ${+d.slice(8, 10)}.` : '';
  // 미리보기·썸네일에 넣을 이름 (반에서 선택이면 첫 학생)
  function pnShownName() {
    if (pkOn()) { const s = pkStudents()[0]; return s ? s.name : ''; }
    return (pn.name || '').trim();
  }
  function pnSheetHTML(tpl, nameText = pnShownName()) {
    const dt = pnDateText(pn.date), nm = String(nameText || '').trim();
    let h = `<div class="pn-sheet"><div class="pn-head">
        <div class="pn-academy">${esc(pnAcademy())}</div>
        <div class="pn-fields">
          <span class="pn-field">날짜<span class="pn-blank${dt ? ' pn-val' : ''}" data-pn-dt style="width:30mm">${esc(dt)}</span></span>
          <span class="pn-field">이름<span class="pn-blank${nm ? ' pn-val' : ''}" data-pn-nm style="width:38mm">${esc(nm)}</span></span>
        </div>
      </div><div class="pn-secs${tpl.essay ? ' pn-essay' : ''}">`;
    tpl.sections.forEach(sec => {
      h += `<section class="pn-sec" style="flex:${sec.ratio}">` +
        (sec.title ? `<div class="pn-tagrow"><span class="pn-tag">${esc(sec.title)}</span></div>` : '') +
        (sec.essay ? '<div class="pn-esh"><span class="pn-eno"></span><span class="pn-tag">번호</span><span class="pn-blank" style="width:52mm"></span></div><div class="pn-eko"><span class="pn-ekl">해석</span><span class="pn-blank"></span></div>' : '') +
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
  // extraCss: 다른 화면(서술형 노트)이 쓰는 종이 CSS를 더할 때만
  function printPaper(bodyHtml, title, extraCss = '') {
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(fr);
    const doc = fr.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <link rel="stylesheet" href="${FONT_URL}">
      <style>${PAPER_CSS}${extraCss}
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
  let ro = null, roGal = null, galleryT = null, fitResizeOn = false;
  const fld = (k) => {
    const [label, ph] = CV_LABELS[k];
    return `<label class="pr-fld"><span>${label}</span><input type="text" data-cv="${k}" value="${esc(cv.fields[k] || '')}"${ph ? ` placeholder="${esc(ph)}"` : ''} autocomplete="off"></label>`;
  };

  return {
    tab: 'cover',            // cover(내신 표지) | general(일반 표지) | note(시험지·노트)

    // 다른 화면(시험+교재 › 서술형 인쇄)이 같은 종이·머리글·학생 목록·인쇄 방식을 쓰도록 꺼내 둔 것
    kit: {
      ensureAssets: () => ensureAssets(),
      printPaper: (html, title, css) => printPaper(html, title, css),
      academy: () => { loadCv(); return pnAcademy(); },
      setAcademy: (v) => { loadCv(); setAcademy(v); },
      dateText: (d) => pnDateText(d),
      classes: () => pkClasses(),
      roster: (classId) => pkRoster(classId),
      MM_PER_PX, PAGE_W, PAGE_H,
    },

    render(main) {
      ensureAssets();
      loadCv(); loadPn();
      const cover = isCvTab(this.tab);
      if (cover) useKind(this.tab);
      main.innerHTML = `<div class="page-head"><h1>표지+양식</h1></div>
        <div class="tabs">${[['cover', '내신 표지'], ['general', '일반 표지'], ['note', '시험지·노트']].map(([k, nm]) =>
          `<button data-tab="${k}" class="${this.tab === k ? 'active' : ''}">${nm}</button>`).join('')}</div>
        <div class="pr-wrap">
          <aside class="panel pr-side">${cover ? this.cvSideHtml() : this.pnSideHtml()}</aside>
          <section class="pr-view">
            <div class="pr-stage" data-stage><div class="pr-stage-name" data-stage-name></div><div class="pr-scaler" data-scaler></div></div>
            <div class="pr-gallery" data-gallery role="listbox" aria-label="${cover ? '표지 디자인' : '양식'}"></div>
          </section>
        </div>`;
      const nmAll = $('[data-nm-all]', main);
      if (nmAll) nmAll.indeterminate = nmAll.hasAttribute('data-indet');
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
      // 미리보기 틀 아래 끝을 왼쪽 사이드바 맨 아래 구분선(동기화 표시 위 선)에 맞춤
      if (!roGal && window.ResizeObserver) roGal = new ResizeObserver(() => this.fitView());
      if (roGal) { roGal.disconnect(); roGal.observe($('[data-gallery]', main)); }
      if (!fitResizeOn) { fitResizeOn = true; window.addEventListener('resize', debounce(() => this.fitView(), 100)); }
      this.fitView();
    },

    // 미리보기(큰 그림 + 아래 썸네일 줄) 전체 높이를 화면 아래 끝선에 맞춤. 왼쪽 설정이 길어져도 미리보기는 그대로
    fitView() {
      const main = $('#main');
      if (App.page !== 'prints' || !main) return;
      const wrap = $('.pr-wrap', main), view = $('.pr-view', main);
      const stage = view && $('[data-stage]', view), gal = view && $('[data-gallery]', view);
      if (!stage || !gal) return;
      // 화면이 좁아 설정·미리보기가 위아래로 쌓이면 원래 높이(CSS) 그대로
      if (getComputedStyle(wrap).gridTemplateColumns.trim().split(/\s+/).length < 2) { stage.style.height = ''; stage.style.minHeight = ''; return; }
      let bottom = window.innerHeight;
      const bar = $('#sync-bar');
      if (bar) { const r = bar.getBoundingClientRect(); if (r.height && r.top > 0 && r.top < bottom) bottom = r.top; }
      const top = view.getBoundingClientRect().top + main.scrollTop;      // 맨 위로 올렸을 때의 위치
      const vb = parseFloat(getComputedStyle(view).borderTopWidth) + parseFloat(getComputedStyle(view).borderBottomWidth);
      const h = Math.max(300, Math.floor(bottom - top - gal.offsetHeight - vb));
      stage.style.minHeight = '0';
      stage.style.height = h + 'px';
    },

    onLeave() {
      if (ro) ro.disconnect();
      if (roGal) roGal.disconnect();
      clearTimeout(galleryT);
    },

    // 글꼴 도착 뒤 다시 맞추기 (이 화면을 보고 있을 때만)
    refit() {
      const main = $('#main');
      if (App.page !== 'prints' || !main || !$('[data-stage]', main)) return;
      if (isCvTab(this.tab)) { fitAll($('[data-scaler]', main)); fitAll($('[data-gallery]', main)); }
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
        if (isCvTab(this.tab)) { cv.tpl = +th.dataset.i; cv.tk = KD.keep[cv.tpl]; saveCv(); }
        else pn.template = th.dataset.k;
        $$('.pr-thumb', main).forEach(t => {
          const on = t === th;
          t.classList.toggle('on', on); t.setAttribute('aria-selected', on);
        });
        if (isCvTab(this.tab)) this.cvPreview(main); else this.pnPreview(main);
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
      else if (a === 'nm-clear') { pick.sel = []; this.nmRefresh(main, true); }
      else if (a === 'pn-date-clear') {
        pn.date = '';
        const d = $('[data-pn-date]', main); if (d) d.value = '';
        this.pnNameUpdate(main);
      }
    },

    onInput(e, main) {
      const t = e.target;
      if (t.matches('[data-cv]')) {
        if (t.dataset.cv === 'academy') { cv.fields.academy = t.value; setAcademy(t.value); }   // 학원명은 모든 탭이 함께 씀
        else { cv.fields[t.dataset.cv] = t.value; saveCv(); }
        this.cvUpdate(main, false);
      } else if (t.matches('[data-cv-copies]')) {
        cv.copies = cvCopies(main); saveCv();
        this.cvPrintLabel(main);
      } else if (t.matches('[data-pn-academy]')) {
        setAcademy(t.value);                            // 내신·일반 표지 탭의 학원명과 같은 값
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
      } else if (t.matches('[data-pn-name]')) {
        pn.name = t.value;
        this.pnNameUpdate(main);
      } else if (t.matches('[data-pn-date]')) {
        pn.date = isYmd(t.value) ? t.value : '';
        this.pnNameUpdate(main);
      }
    },

    onChange(e, main) {
      const t = e.target;
      if (t.matches('[data-cv-duplex]')) {
        cv.duplexPrinter = t.checked; saveCv();
        const h = $('[data-cv-duplex-hint]', main); if (h) h.textContent = this.cvDuplexHint();
      } else if (t.matches('[data-cv-blank]')) {
        cv.nameBlank = t.checked; saveCv();
        this.cvUpdate(main, false);
      } else if (t.matches('[data-cv-logo-file]')) {
        this.cvUploadLogo(main, t);
      } else if (t.matches('[data-pn-duplex]')) {
        pn.duplexPrinter = t.checked; savePn(); this.pnSyncMode(main);
      } else if (t.matches('[name="pn-mode"]')) {
        if (t.checked) { pn.mode = t.value; this.pnSyncMode(main); }
      } else if (t.matches('[name="pr-nm-mode"]')) {
        if (t.checked) this.nmSetMode(main, t.value);
      } else if (t.matches('[data-nm-class]')) {
        pick.classId = t.value;
        const l = $('[data-nm-list]', main); if (l) l.innerHTML = '';     // 새 반은 목록 맨 위부터
        this.nmRefresh(main, true);
      } else if (t.matches('[data-nm-all]')) {
        this.nmToggle(main, pkRoster(pick.classId).map(s => s.id), t.checked);
        this.nmRefresh(main, true);
      } else if (t.matches('[data-nm-stu]')) {
        this.nmToggle(main, [t.dataset.nmStu], t.checked);
        this.nmRefresh(main, true);
      }
    },

    /* ---------- 학생 이름 (표지·시험지·노트 공통) ---------- */
    // 틀: 방식 고르기 + 내용 칸(data-nm-body)
    nmSecHtml() {
      return `<div class="pr-sec" data-nm-sec><h2>학생 이름</h2>
          <div class="pr-nm-mode" role="radiogroup" aria-label="학생 이름 넣는 방식">
            <label class="chk"><input type="radio" name="pr-nm-mode" value="manual" ${pkOn() ? '' : 'checked'}>직접 입력</label>
            <label class="chk"><input type="radio" name="pr-nm-mode" value="class" ${pkOn() ? 'checked' : ''}>반에서 선택</label>
          </div>
          <div data-nm-body>${this.nmBodyHtml()}</div>
        </div>`;
    },
    nmBodyHtml() {
      const cover = isCvTab(this.tab);
      if (!pkOn()) {
        return cover
          ? `${fld('student')}
            <label class="chk pr-chk"><input type="checkbox" data-cv-blank ${cv.nameBlank ? 'checked' : ''}>이름을 비워 두면 쓰는 칸으로 표시</label>`
          : `<label class="pr-fld"><span>학생 이름</span><input type="text" data-pn-name value="${esc(pn.name)}" placeholder="비워 두면 빈 줄로 나와요" maxlength="20" autocomplete="off"></label>`;
      }
      const cls = pkClasses();
      if (pick.classId && !cls.some(c => c.id === pick.classId)) pick.classId = '';
      return `<label class="pr-fld"><span>반</span>
          <select data-nm-class>
            <option value="">반을 고르세요</option>
            ${cls.map(c => `<option value="${esc(c.id)}"${c.id === pick.classId ? ' selected' : ''}>${esc(c.name)} (${pkRoster(c.id).length}명)</option>`).join('')}
          </select></label>
        <div class="pr-nm-list" data-nm-list>${this.nmListHtml()}</div>
        <div class="pr-nm-picked" data-nm-picked>${this.nmPickedHtml()}</div>
        <p class="pr-hint">다른 반을 골라도 체크한 학생은 그대로 남아요. 고른 학생 수만큼 한 장씩, 이름만 바뀌어 인쇄돼요.</p>`;
    },
    nmListHtml() {
      if (!pick.classId) return '<div class="none">반을 고르면 학생 목록이 나와요.</div>';
      const ros = pkRoster(pick.classId);
      if (!ros.length) return '<div class="none">이 반에는 재원생이 없어요.</div>';
      const on = new Set(pick.sel);
      const all = ros.every(s => on.has(s.id)), some = ros.some(s => on.has(s.id));
      return `<label class="chk pr-nm-all"><input type="checkbox" data-nm-all ${all ? 'checked' : ''}${!all && some ? ' data-indet' : ''}>반 전체 선택</label>
        <div class="pr-nm-stus">${ros.map(s =>
          `<label class="chk"><input type="checkbox" data-nm-stu="${esc(s.id)}" ${on.has(s.id) ? 'checked' : ''}>${esc(s.name)}${stTag(s) ? ` <small>${esc(stTag(s))}</small>` : ''}</label>`).join('')}</div>`;
    },
    nmPickedHtml() {
      const list = pkStudents();
      if (!list.length) return '<span class="none">고른 학생: 없음</span>';
      return `<div class="pr-nm-ph"><b>고른 학생 ${list.length}명</b><button type="button" class="btn sm" data-act="nm-clear">모두 해제</button></div>
        <div class="pr-nm-names">${list.map(s => esc(s.name)).join(', ')}</div>`;
    },
    // 학생 목록·고른 학생·인쇄 버튼·미리보기를 다시 맞춤
    nmRefresh(main, listToo) {
      if (listToo) {
        const l = $('[data-nm-list]', main);
        if (l) {
          const box = $('.pr-nm-stus', l), top = box ? box.scrollTop : 0;    // 체크할 때 목록이 위로 튀지 않게
          l.innerHTML = this.nmListHtml();
          const nb = $('.pr-nm-stus', l); if (nb) nb.scrollTop = top;
        }
      }
      const all = $('[data-nm-all]', main);
      if (all) all.indeterminate = all.hasAttribute('data-indet');
      const p = $('[data-nm-picked]', main);
      if (p) p.innerHTML = this.nmPickedHtml();
      if (isCvTab(this.tab)) { this.cvPrintLabel(main); this.cvUpdate(main, false); }
      else { this.pnPrintLabel(main); this.pnNameUpdate(main); }
    },
    // 직접 입력 ↔ 반에서 선택
    nmSetMode(main, mode) {
      pick.mode = mode === 'class' ? 'class' : 'manual';
      const b = $('[data-nm-body]', main);
      if (b) b.innerHTML = this.nmBodyHtml();
      this.nmRefresh(main, false);
    },
    nmToggle(main, ids, on) {
      const cur = new Set(pick.sel);
      ids.forEach(id => {
        if (on && !cur.has(id)) { pick.sel.push(id); cur.add(id); }
        else if (!on && cur.has(id)) cur.delete(id);
      });
      if (!on) pick.sel = pick.sel.filter(id => cur.has(id));
    },
    // 반에서 선택 모드에서 인쇄할 학생 (없으면 안내)
    nmPrintList() {
      const list = pkStudents();
      if (!list.length) toast('인쇄할 학생을 선택하세요.');
      return list;
    },

    /* ---------- 표지: 화면 ---------- */
    cvSideHtml() {
      return `<div class="pr-sec"><h2>글자</h2>
          ${KD.order.map(fld).join('')}
        </div>
        ${this.nmSecHtml()}
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
          <label class="chk pr-chk"><input type="checkbox" data-cv-duplex ${cv.duplexPrinter ? 'checked' : ''}>양면 프린터 사용</label>
          <p class="pr-hint" data-cv-duplex-hint>${this.cvDuplexHint()}</p>
          <div class="pr-print" style="margin-top:10px">
            <input type="number" data-cv-copies min="1" max="300" value="${cv.copies || 1}" aria-label="인쇄 매수"${pkOn() ? ' disabled' : ''}>
            <button type="button" class="btn primary" data-act="cv-print" data-cv-print-btn>${pkOn() ? `인쇄 / PDF (${pkStudents().length}명)` : `인쇄 / PDF (${Math.min(300, Math.max(1, +cv.copies || 1))}장)`}</button>
          </div>
          <p class="pr-hint">앞표지를 모두 인쇄한 뒤, 뒷표지(디자인 + 학원명)가 같은 수만큼 이어서 나와요.</p>
          <div class="pr-note">인쇄 창에서 <b>용지 A4</b>, <b>배율 100%(실제 크기)</b>로 맞춰 주세요. 양면 프린터를 사용할 땐 인쇄 창의 <b>양면 인쇄</b>도 켜져 있어야 해요.
            색이 안 나오면 <b>배경 그래픽</b>을 켜 주세요.</div>
        </div>`;
    },
    cvDuplexHint() {
      return cv.duplexPrinter ? '표지 뒤마다 빈 장을 넣어, 표지는 항상 앞면에만 인쇄돼요.' : '단면 프린터용: 빈 장 없이 표지만 인쇄해요.';
    },
    cvLogoPrevHtml() { return logo ? `<img src="${logo}" alt="학원 로고">` : '로고 없음'; },
    cvPrintLabel(main) {
      const b = $('[data-cv-print-btn]', main);
      if (b) b.textContent = pkOn() ? `인쇄 / PDF (${pkStudents().length}명)` : `인쇄 / PDF (${cvCopies(main)}장)`;
      const inp = $('[data-cv-copies]', main);
      if (inp) inp.disabled = pkOn();
    },
    // 반에서 선택이면 첫 학생 이름으로 보여 줌
    cvCtx() {
      if (!pkOn()) return ctx();
      const s = pkStudents()[0];
      return ctx(s ? s.name : '');
    },
    cvPreview(main) {
      const sc = $('[data-scaler]', main);
      sc.innerHTML = cvPageHTML(cv.tpl, this.cvCtx());
      $('[data-stage-name]', main).textContent = `${cv.tpl + 1}. ${KD.names[cv.tpl]}` + pkSuffix();
      fitAll(sc);
      this.scale();
    },
    cvGallery(main) {
      const g = $('[data-gallery]', main);
      if (!g) return;
      const c = this.cvCtx();
      g.innerHTML = KD.names.map((nm, i) =>
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
        `<li><span class="pn" title="${esc(p.name)}">${esc(p.name)} <small>· ${esc(KD.names[p.tpl] || '')}</small></span>
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
      if (App.page !== 'prints' || !isCvTab(this.tab) || !$('[data-cv-logo-prev]', main)) return;
      $('[data-cv-logo-prev]', main).innerHTML = this.cvLogoPrevHtml();
      this.cvUpdate(main, true);
    },

    /* ---------- 표지: 저장한 조합 ---------- */
    async cvSavePreset(main) {
      const inp = $('[data-cv-preset-name]', main);
      const name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      const item = { name, tpl: cv.tpl, tk: KD.keep[cv.tpl], fields: Object.assign({}, cv.fields), nameBlank: !!cv.nameBlank };
      const idx = presets.findIndex(p => p.name === name);
      if (idx >= 0) {
        if (!await confirmDlg(`‘${name}’ 조합이 이미 있어요. 덮어쓸까요?`, '덮어쓰기')) return;
        presets[idx] = item;
      } else presets.unshift(item);
      savePresets();
      inp.value = '';
      this.cvPresets(main);
      toast('조합을 저장했습니다');
    },
    cvLoadPreset(i) {
      const p = presets[i];
      if (!p) return;
      cv.tpl = cvTplIdx(p, KD.keep); cv.tk = KD.keep[cv.tpl];
      cv.fields = Object.assign({}, KD.def.fields, p.fields);
      setAcademy(cv.fields.academy || '');            // 학원명은 모든 탭이 함께 씀
      cv.nameBlank = !!p.nameBlank;
      saveCv();
      App.render();                                   // 입력칸까지 새 값으로 다시 그림
    },
    async cvDelPreset(main, i) {
      const p = presets[i];
      if (!p) return;
      if (!await confirmDlg(`‘${p.name}’ 조합을 삭제할까요?`, '삭제', true)) return;
      presets.splice(i, 1);
      savePresets();
      this.cvPresets(main);
    },

    /* ---------- 표지: 인쇄 ---------- */
    cvPrint(main) {
      // 실제 크기로 그려 글자 줄임을 계산한 뒤 인쇄
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden';
      document.body.appendChild(box);
      const render = (c) => { box.innerHTML = cvPageHTML(cv.tpl, c); fitAll(box); return box.innerHTML; };
      let pages;                                      // 앞표지들
      if (pkOn()) {
        // 반에서 선택: 학생마다 한 장, 이름만 바꿔서
        const list = this.nmPrintList();
        if (!list.length) { box.remove(); return; }
        pages = list.map(s => render(ctx(s.name)));
      } else {
        // 직접 입력: 한 장을 매수만큼 복사
        const one = render(ctx());
        pages = Array(cvCopies(main)).fill(one);
      }
      // 뒷표지: 앞표지를 모두 찍은 뒤, 같은 수만큼 이어서 (이름이 없어 모두 같음)
      box.innerHTML = cvBackHTML(cv.tpl, ctx()); fitAll(box);
      const back = box.innerHTML;
      pages = pages.concat(Array(pages.length).fill(back));
      box.remove();
      // 표지는 항상 단면: 양면 프린터면 표지마다 뒤에 빈 장을 넣어 뒷면이 비게 함
      const blank = '<div class="cv-page"></div>';
      printPaper(pages.map(pg => cv.duplexPrinter ? pg + blank : pg).join(''), `${KD.file}_${KD.names[cv.tpl]}`);
    },

    /* ---------- 시험지·노트: 화면 ---------- */
    pnSideHtml() {
      return `<div class="pr-sec"><h2>글자</h2>
          <label class="pr-fld"><span>학원명</span><input type="text" data-pn-academy value="${esc(pnAcademy())}" placeholder="학원명을 입력하세요" maxlength="40" autocomplete="off"></label>
          <p class="pr-hint">내신 표지 탭의 학원명과 같은 값이에요.</p>
          <label class="pr-fld"><span>날짜 (선택)</span>
            <div class="pr-inline"><input type="date" data-pn-date value="${esc(pn.date)}" aria-label="날짜"><button type="button" class="btn sm" data-act="pn-date-clear">지우기</button></div></label>
          <p class="pr-hint">비워 두면 날짜 칸이 빈 줄로 나와요.</p>
        </div>
        ${this.nmSecHtml()}
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
            <input type="number" data-pn-copies min="1" max="500" step="1" value="${esc(pn.copies)}" placeholder="부수" aria-label="출력 부수"${pkOn() ? ' disabled' : ''}>
            <button type="button" class="btn primary" data-act="pn-print" data-pn-print-btn>${pkOn() ? `인쇄 / PDF (${pkStudents().length}명)` : '인쇄 / PDF'}</button>
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
      $('[data-stage-name]', main).textContent = tpl.name + pkSuffix();
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
    pnPrintLabel(main) {
      const b = $('[data-pn-print-btn]', main);
      if (b) b.textContent = pkOn() ? `인쇄 / PDF (${pkStudents().length}명)` : '인쇄 / PDF';
      const inp = $('[data-pn-copies]', main);
      if (inp) inp.disabled = pkOn();
    },
    // 날짜·이름 칸만 바꿈 (줄 위치는 그대로) + 썸네일은 잠깐 뒤에
    pnNameUpdate(main) {
      const set = (el, txt) => { if (!el) return; el.textContent = txt; el.classList.toggle('pn-val', !!txt); };
      set($('[data-scaler] [data-pn-dt]', main), pnDateText(pn.date));
      set($('[data-scaler] [data-pn-nm]', main), pnShownName());
      $('[data-stage-name]', main).textContent = PN_TEMPLATES[pn.template].name + pkSuffix();
      this.pnGalleryLater(main);
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
      // 반에서 선택: 학생마다 한 장씩(이름만 바꿈) / 직접 입력: 부수만큼
      let names = null, n;
      if (pkOn()) {
        const list = this.nmPrintList();
        if (!list.length) return;
        names = list.map(s => s.name);
        n = names.length;
      } else {
        const inp = $('[data-pn-copies]', main);
        if (inp.value.trim() === '') { toast('출력 부수를 입력하세요.'); inp.focus(); return; }
        n = pnReadCopies(inp.value);
        if (n === null) { toast('출력 부수는 1에서 500 사이로 입력하세요.'); inp.focus(); return; }
      }
      const sheet = $('[data-scaler] > .pn-sheet', main);
      if (!sheet) return;
      fillLines(sheet);
      const master = sheet.cloneNode(true);
      master.style.transform = '';
      const blank = '<div class="pn-sheet"></div>';
      const sheetFor = (name) => {
        const nm = master.querySelector('[data-pn-nm]');
        if (nm) { nm.textContent = name; nm.classList.toggle('pn-val', !!name); }
        return master.outerHTML;
      };
      const fixed = names ? '' : master.outerHTML;
      let h = '';
      for (let i = 0; i < n; i++) {
        const one = names ? sheetFor(names[i]) : fixed;
        h += one;
        if (pn.mode === 'double') h += one;            // 앞뒤 같은 양식
        else if (pn.duplexPrinter) h += blank;         // 양면 프린터에서 단면 출력: 뒷면은 빈 장
      }
      printPaper(h, PN_TEMPLATES[pn.template].name);
    },
  };
})();
