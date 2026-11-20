/* =========================================================
   tv.js — 레트로 TV (PC 전용 · index.html에서만 불러옴)
   - 자리: 오늘 / 날짜 화면 왼쪽 열(수업 → 다가오는 일정 → 시험 일정 → 일정) 아래 남는 공간
     · 수업이 있는 날만 (수업 없는 날 · 공휴일은 만들지 않음) — calendar.js DayPage 가 .tv-slot 을 넣음
     · 남는 공간에 맞춰 비율을 유지한 채 크기 조절
       몸통 너비 PLAY_MIN 이상 → 재생 / SHOW_MIN ~ PLAY_MIN → 꺼진 TV (버튼 잠김) / SHOW_MIN 미만 → 숨김
     · 화면이 좁아 한 열이 되면(1100px 이하) 숨김 (tv.css)
   - 화면: 메엉 힐링 애니메이션 8장면 (소리 없음)
     · 2분마다 다음 장면 (셔플: 8개를 섞어서 한 번씩 모두 재생 → 다 돌면 다시 섞음, 방금 장면은 바로 다음에 안 나옴)
     · 채널 다이얼: 바로 다음 장면 (지지직 화면 + 채널 표시) · 2분은 다시 셈
     · 전원 버튼: 켜기 / 끄기 (브라운관처럼 줄어들며 꺼짐). 상태는 이 PC localStorage mg77_tv 에 저장
   - 앱이 화면을 다시 그려도(App.render) TV는 한 번만 만들어 두고 새 자리로 옮겨 끼우기만 함 → 장면이 끊기지 않음
   - 꺼져 있거나 · 다른 메뉴에 있거나 · 창이 가려지면 그리기를 멈춤
   ========================================================= */

/* ---------- 장면 엔진 (meong 20차 이식 · 소리 제거 · TV 화면 크기 기준) ---------- */
const TvEng = (function () {
  'use strict';
  const SCENES = ['spring_tree', 'shooting_stars', 'snowfall', 'fireflies', 'sakura', 'fireworks', 'rain', 'mooncloud'];
  const PI2 = Math.PI * 2;
  let ctx = null, dpr = 1;
  let W = 0, H = 0;
  let kv = 1;   // 움직임 · 거리 배율 (원본 폰 화면 390×700 기준)
  let kz = 1;   // 달 · 나무줄기 같은 큰 물체 배율
  let ks = 1;   // 작은 입자 크기 배율
  let cf = 1;   // 입자 개수 배율 (화면 넓이 비례)
  let particles = [], extras = [], t = 0;
  let sprites = {};

  /* ── 셔플 큐 (원본과 같음) ── */
  let cur = Math.floor(Math.random() * SCENES.length);
  function makeShuffleQueue(excludeIdx) {
    const arr = SCENES.map((_, i) => i).filter(i => i !== excludeIdx);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  let shuffleQueue = makeShuffleQueue(cur);
  function nextShuffleIdx() {
    if (shuffleQueue.length === 0) shuffleQueue = makeShuffleQueue(cur);
    return shuffleQueue.shift();
  }

  const cnt = (n) => Math.max(1, Math.round(n * cf));

  // 초승달 그림 (매 프레임 새로 만들지 않고 한 번 만들어 둠)
  function moonSprite(key, mr, g, stops, cut) {
    const id = key + '_' + Math.round(mr * 10);
    if (sprites[id]) return sprites[id];
    const S = Math.ceil(mr * 2 + 4);
    const oc = document.createElement('canvas');
    oc.width = oc.height = Math.ceil(S * dpr);
    const c = oc.getContext('2d');
    c.scale(dpr, dpr);
    const cc = S / 2;
    c.beginPath(); c.arc(cc, cc, mr, 0, PI2);
    const mg = c.createRadialGradient(cc + g[0] * mr, cc + g[1] * mr, 0, cc, cc, mr);
    stops.forEach(s => mg.addColorStop(s[0], s[1]));
    c.fillStyle = mg; c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(cc + cut[0] * mr, cc + cut[1] * mr, cut[2] * mr, 0, PI2);
    c.fillStyle = 'rgba(0,0,0,1)'; c.fill();
    return (sprites[id] = { cv: oc, S });
  }
  function drawSprite(sp, x, y) { ctx.drawImage(sp.cv, x - sp.S / 2, y - sp.S / 2, sp.S, sp.S); }

  /* ════════ 1. 봄 나무 (+ 낙엽) ════════ */
  let leaves = [], pile = [], leafFrame = 0;
  const LEAF_COLORS = ['#78c878', '#96dc96', '#a4e0a4', '#b5d99c', '#88d288', '#6ab86a', '#bceabc', '#c6eec6'];
  function initSpringTree() { leaves = []; pile = []; leafFrame = 0; }

  function drawSpringBG() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#bde8a8'); sky.addColorStop(0.5, '#d8f0c8'); sky.addColorStop(1, '#e8f5d8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    const gr = ctx.createLinearGradient(0, H * 0.78, 0, H);
    gr.addColorStop(0, 'rgba(130,185,95,0.7)'); gr.addColorStop(1, 'rgba(100,155,65,0.9)');
    ctx.fillStyle = gr; ctx.fillRect(0, H * 0.80, W, H * 0.20);

    // 원본은 세로 화면(390×540 좌표)에 맞춰 늘렸음 → TV(가로 화면)에서는 비율을 지켜 가운데에 그림
    const s = H / 540, ox = W / 2 - 195 * s;
    const X = (x) => ox + x * s, Y = (y) => y * s;

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#d4c4a8';
    ctx.beginPath(); ctx.ellipse(X(195), Y(494), 82 * s, 13 * s, 0, 0, PI2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#c8a97a'; ctx.lineWidth = 26 * s;
    ctx.beginPath(); ctx.moveTo(X(174), Y(496));
    ctx.bezierCurveTo(X(175), Y(430), X(179), Y(368), X(181), Y(328)); ctx.stroke();
    ctx.strokeStyle = '#b8956a'; ctx.lineWidth = 19 * s;
    ctx.beginPath(); ctx.moveTo(X(216), Y(496));
    ctx.bezierCurveTo(X(215), Y(430), X(211), Y(368), X(209), Y(328)); ctx.stroke();

    ctx.strokeStyle = '#c8a97a';
    [
      { w: 12, pts: [181, 328, 158, 286, 122, 242, 84, 198] },
      { w: 11, pts: [196, 302, 220, 260, 258, 226, 296, 194] },
      { w: 10, pts: [183, 344, 150, 328, 115, 306, 82, 268] },
      { w: 10, pts: [207, 340, 242, 324, 278, 304, 308, 268] },
      { w: 9, pts: [190, 275, 192, 234, 191, 192, 192, 152] },
    ].forEach(b => {
      ctx.lineWidth = b.w * s;
      ctx.beginPath(); ctx.moveTo(X(b.pts[0]), Y(b.pts[1]));
      ctx.bezierCurveTo(X(b.pts[2]), Y(b.pts[3]), X(b.pts[4]), Y(b.pts[5]), X(b.pts[6]), Y(b.pts[7]));
      ctx.stroke();
    });
    ctx.lineWidth = 6 * s;
    ctx.beginPath(); ctx.moveTo(X(192), Y(165)); ctx.lineTo(X(118), Y(125)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(192), Y(165)); ctx.lineTo(X(264), Y(125)); ctx.stroke();

    [
      { cx: 195, cy: 255, rx: 155, ry: 138, op: 0.17, c: '#5fa85f' },
      { cx: 148, cy: 232, rx: 135, ry: 120, op: 0.19, c: '#6ab86a' },
      { cx: 244, cy: 228, rx: 132, ry: 118, op: 0.19, c: '#6ab86a' },
      { cx: 195, cy: 218, rx: 145, ry: 128, op: 0.23, c: '#78c878' },
      { cx: 162, cy: 200, rx: 118, ry: 106, op: 0.27, c: '#88d288' },
      { cx: 230, cy: 196, rx: 115, ry: 103, op: 0.27, c: '#88d288' },
      { cx: 195, cy: 178, rx: 128, ry: 114, op: 0.30, c: '#96dc96' },
      { cx: 172, cy: 164, rx: 100, ry: 90, op: 0.28, c: '#a4e0a4' },
      { cx: 220, cy: 161, rx: 97, ry: 87, op: 0.28, c: '#a4e0a4' },
      { cx: 195, cy: 142, rx: 102, ry: 92, op: 0.32, c: '#b0e6b0' },
      { cx: 176, cy: 128, rx: 78, ry: 70, op: 0.28, c: '#bceabc' },
      { cx: 215, cy: 125, rx: 75, ry: 67, op: 0.28, c: '#bceabc' },
      { cx: 195, cy: 110, rx: 65, ry: 58, op: 0.30, c: '#c6eec6' },
    ].forEach(b => {
      ctx.globalAlpha = b.op; ctx.fillStyle = b.c;
      ctx.beginPath(); ctx.ellipse(X(b.cx), Y(b.cy), b.rx * s, b.ry * s, 0, 0, PI2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawLeaf(x, y, size, angle, alpha, color) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.42, size * 0.22, 0, 0, PI2);
    ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-size * 0.38, 0); ctx.lineTo(size * 0.38, 0);
    ctx.strokeStyle = 'rgba(60,120,60,0.35)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
  }
  function loopLeaves() {
    leafFrame++;
    if (leafFrame % 90 === 0 && leaves.length < 18) {
      leaves.push({
        x: W * 0.10 + Math.random() * W * 0.80,
        y: H * 0.05 + Math.random() * H * 0.42,
        vx: (Math.random() - 0.5) * 0.5 * kv,
        vy: (0.35 + Math.random() * 0.45) * kv,
        angle: Math.random() * PI2,
        va: (Math.random() - 0.5) * 0.04,
        swing: Math.random() * PI2,
        swingSpeed: 0.018 + Math.random() * 0.018,
        swingAmp: (0.6 + Math.random() * 0.9) * kv,
        size: (7 + Math.random() * 7) * ks,
        alpha: 0.55 + Math.random() * 0.3,
        color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      });
    }
    const floor = H - 14 * kv;
    pile.forEach(p => drawLeaf(p.x, p.y, p.size, p.angle, p.alpha * 0.65, p.color));
    leaves = leaves.filter(l => {
      l.swing += l.swingSpeed;
      l.x += l.vx + Math.sin(l.swing) * l.swingAmp * 0.3;
      l.y += l.vy;
      l.angle += l.va;
      if (l.y >= floor) {
        l.y = floor;
        if (pile.length < 40) pile.push({ x: l.x, y: l.y, size: l.size, angle: l.angle, alpha: l.alpha, color: l.color });
        return false;
      }
      drawLeaf(l.x, l.y, l.size, l.angle, l.alpha, l.color);
      return true;
    });
  }

  /* ════════ 2. 별똥별 ════════ */
  function initShootingStars() {
    for (let i = 0; i < cnt(130); i++) particles.push({
      x: Math.random() * W, y: Math.random() * H * 0.88,
      r: (0.5 + Math.random() * 1.3) * ks, a: 0.55 + Math.random() * 0.45,
      twk: Math.random() * PI2, twkS: 0.005 + Math.random() * 0.015,
    });
    spawnShooter();
  }
  function spawnShooter() {
    const speed = (0.6 + Math.random() * 1.0) * kv;
    let sx, sy, angle;
    const edge = Math.floor(Math.random() * 3);
    if (edge === 0) { sx = Math.random() * W; sy = -10; angle = (25 + Math.random() * 130) * Math.PI / 180; }
    else if (edge === 1) { sx = -10; sy = Math.random() * H * 0.4; angle = (10 + Math.random() * 65) * Math.PI / 180; }
    else { sx = W + 10; sy = Math.random() * H * 0.4; angle = (105 + Math.random() * 65) * Math.PI / 180; }
    extras.push({ type: 'shooter', x: sx, y: sy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, trail: [], life: 0, maxLife: 200 + Math.random() * 150 });
  }
  function drawNightBG() {
    const skyG = ctx.createLinearGradient(0, 0, 0, H);
    skyG.addColorStop(0, '#0c0a2e'); skyG.addColorStop(0.45, '#17144d'); skyG.addColorStop(1, '#221f72');
    ctx.fillStyle = skyG; ctx.fillRect(0, 0, W, H);

    ctx.save(); ctx.globalAlpha = 0.06;
    const mw = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, W * 0.7);
    mw.addColorStop(0, '#c8b8ee'); mw.addColorStop(1, 'transparent');
    ctx.fillStyle = mw;
    ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.32, W * 0.72, H * 0.22, -0.28, 0, PI2); ctx.fill();
    ctx.restore();

    const mx = W * 0.82, my = H * 0.13, mr = 26 * kz;
    ctx.save();
    const moonGlow = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4);
    moonGlow.addColorStop(0, 'rgba(255,248,210,0.20)');
    moonGlow.addColorStop(0.4, 'rgba(255,242,190,0.08)');
    moonGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = moonGlow; ctx.beginPath(); ctx.arc(mx, my, mr * 4, 0, PI2); ctx.fill();
    ctx.restore();
    // 달 — 그림자 원을 왼쪽으로 (거울 대칭)
    drawSprite(moonSprite('night', mr, [-0.1, -0.1], [[0, '#fffef0'], [0.7, '#fff8d8'], [1, '#ffe8a8']], [-0.62, -0.08, 0.92]), mx, my);

    ctx.fillStyle = 'rgba(5,4,20,0.96)';
    ctx.beginPath(); ctx.moveTo(0, H);
    ctx.bezierCurveTo(W * 0.1, H * 0.84, W * 0.22, H * 0.80, W * 0.32, H * 0.86);
    ctx.bezierCurveTo(W * 0.42, H * 0.92, W * 0.52, H * 0.78, W * 0.64, H * 0.84);
    ctx.bezierCurveTo(W * 0.76, H * 0.90, W * 0.88, H * 0.82, W, H * 0.87);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function loopShootingStars() {
    particles.forEach(p => {
      p.twk += p.twkS;
      const alpha = p.a * (0.65 + 0.35 * Math.sin(p.twk));
      ctx.fillStyle = `rgba(255,253,220,${alpha})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, PI2); ctx.fill();
    });
    extras = extras.filter(s => {
      if (s.type !== 'shooter') return true;
      s.life++;
      s.x += s.vx; s.y += s.vy;
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 55) s.trail.shift();
      const prog = s.life / s.maxLife;
      const baseA = prog < 0.15 ? prog / 0.15 : prog > 0.80 ? (1 - prog) / 0.20 : 1;
      ctx.save();
      for (let i = 1; i < s.trail.length; i++) {
        const ta = i / s.trail.length;
        ctx.globalAlpha = baseA * ta;
        ctx.strokeStyle = 'rgba(255,250,195,1)';
        ctx.lineWidth = 2.2 * ta * ks; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y); ctx.lineTo(s.trail[i].x, s.trail[i].y); ctx.stroke();
      }
      ctx.restore();
      ctx.save(); ctx.globalAlpha = baseA * 0.92;
      const gr = 8 * ks;
      const gw = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, gr);
      gw.addColorStop(0, 'rgba(255,255,215,1)'); gw.addColorStop(1, 'rgba(255,255,200,0)');
      ctx.fillStyle = gw; ctx.beginPath(); ctx.arc(s.x, s.y, gr, 0, PI2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,235,1)'; ctx.beginPath(); ctx.arc(s.x, s.y, 1.8 * ks, 0, PI2); ctx.fill();
      ctx.restore();
      if (s.x < -80 || s.x > W + 80 || s.y > H + 80 || s.y < -80) return false;
      return s.life < s.maxLife;
    });
    if (Math.random() < 0.006) spawnShooter();
  }

  /* ════════ 3. 눈 내리는 밤 ════════ */
  function initSnowfall() { for (let i = 0; i < cnt(60); i++) particles.push(makeSnow(true)); }
  function makeSnow(scatter) {
    return {
      x: Math.random() * W, y: scatter ? Math.random() * H : -8,
      r: (1.4 + Math.random() * 3.8) * ks,
      vx: (Math.random() - 0.5) * 0.28 * kv, vy: (0.18 + Math.random() * 0.38) * kv,
      a: 0.45 + Math.random() * 0.55,
      swg: Math.random() * PI2, swgS: 0.003 + Math.random() * 0.008,
      rot: Math.random() * PI2,
    };
  }
  function drawSnowflake(x, y, r, alpha, rot) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(215,232,255,0.90)';
    ctx.translate(x, y); ctx.rotate(rot);
    const pts = 8;
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const ang = (i / pts) * PI2;
      const wobble = 1 + (Math.sin(ang * 2.3 + rot * 1.7) * 0.06 + Math.cos(ang * 1.7 + rot) * 0.05);
      const px = Math.cos(ang) * r * wobble, py = Math.sin(ang) * r * (1 / wobble);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawSoftSnowTree(px, py, treeH) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2e1e0e'; ctx.lineWidth = treeH * 0.035;
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.bezierCurveTo(px - 4 * kz, py - treeH * 0.32, px + 5 * kz, py - treeH * 0.58, px - 2 * kz, py - treeH * 0.70);
    ctx.stroke();
    const bx0 = px - 2 * kz;
    [
      { bx: bx0, by: py - treeH * 0.70, ex: px - treeH * 0.26, ey: py - treeH * 0.54, w: treeH * 0.018 },
      { bx: bx0, by: py - treeH * 0.70, ex: px + treeH * 0.22, ey: py - treeH * 0.50, w: treeH * 0.016 },
      { bx: bx0, by: py - treeH * 0.70, ex: px - treeH * 0.12, ey: py - treeH * 0.82, w: treeH * 0.014 },
    ].forEach(b => {
      ctx.strokeStyle = 'rgba(36,22,10,0.75)'; ctx.lineWidth = b.w;
      ctx.beginPath(); ctx.moveTo(b.bx, b.by);
      ctx.quadraticCurveTo((b.bx + b.ex) / 2 + (b.ey < b.by ? -15 : 10) * kz, (b.by + b.ey) / 2 - 12 * kz, b.ex, b.ey);
      ctx.stroke();
    });
    [
      { x: px + treeH * 0.02, y: py - treeH * 0.55, rx: treeH * 0.28, ry: treeH * 0.22 },
      { x: px - treeH * 0.14, y: py - treeH * 0.62, rx: treeH * 0.22, ry: treeH * 0.18 },
      { x: px + treeH * 0.12, y: py - treeH * 0.65, rx: treeH * 0.20, ry: treeH * 0.17 },
      { x: px - treeH * 0.04, y: py - treeH * 0.76, rx: treeH * 0.18, ry: treeH * 0.15 },
      { x: px + treeH * 0.00, y: py - treeH * 0.88, rx: treeH * 0.12, ry: treeH * 0.10 },
    ].forEach(c => {
      [{ op: 0.18, c: '#1a3520' }, { op: 0.22, c: '#1e3e26' }, { op: 0.26, c: '#224830' }, { op: 0.24, c: '#285038' }, { op: 0.20, c: '#305840' }]
        .forEach((l, i) => {
          ctx.save(); ctx.globalAlpha = l.op; ctx.fillStyle = l.c;
          ctx.beginPath();
          ctx.ellipse(c.x + (i - 2) * 2 * kz, c.y - (i * 3 * kz), c.rx * (1 - i * 0.06), c.ry * (1 - i * 0.06), 0, 0, PI2);
          ctx.fill(); ctx.restore();
        });
    });
    ctx.restore();
  }
  function drawSnowBG() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#141e2e'); sky.addColorStop(0.55, '#1e2c48'); sky.addColorStop(1, '#2a3a5e');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    const mx = W * 0.75, my = H * 0.17, mr = 26 * kz;
    ctx.save();
    const moonGlow = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4.5);
    moonGlow.addColorStop(0, 'rgba(210,228,255,0.18)'); moonGlow.addColorStop(0.5, 'rgba(200,218,255,0.07)'); moonGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = moonGlow; ctx.beginPath(); ctx.arc(mx, my, mr * 4.5, 0, PI2); ctx.fill();
    const moonBody = ctx.createRadialGradient(mx - mr * 0.2, my - mr * 0.2, 0, mx, my, mr);
    moonBody.addColorStop(0, '#f2f8ff'); moonBody.addColorStop(0.6, '#ddeaff'); moonBody.addColorStop(1, '#c2d4f0');
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, PI2); ctx.fillStyle = moonBody; ctx.fill();
    ctx.globalAlpha = 0.06; ctx.fillStyle = '#8899bb';
    ctx.beginPath(); ctx.arc(mx + mr * 0.25, my - mr * 0.2, mr * 0.18, 0, PI2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx - mr * 0.28, my + mr * 0.28, mr * 0.12, 0, PI2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(200,220,255,0.20)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, PI2); ctx.stroke();
    ctx.restore();

    const gd = ctx.createLinearGradient(0, H * 0.82, 0, H);
    gd.addColorStop(0, '#d8e4ee'); gd.addColorStop(1, '#e8f0f8');
    ctx.fillStyle = gd;
    ctx.beginPath(); ctx.moveTo(0, H * 0.84);
    ctx.bezierCurveTo(W * 0.2, H * 0.81, W * 0.4, H * 0.83, W * 0.6, H * 0.82);
    ctx.bezierCurveTo(W * 0.8, H * 0.81, W * 0.9, H * 0.84, W, H * 0.83);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

    drawSoftSnowTree(W * 0.50, H * 0.83, H * 0.62);
  }
  function loopSnowfall() {
    particles.forEach(p => {
      p.swg += p.swgS;
      p.x += p.vx + Math.sin(p.swg) * 0.4 * kv;
      p.y += p.vy; p.rot += 0.006;
      if (p.y > H + 10) Object.assign(p, makeSnow(false));
      drawSnowflake(p.x, p.y, p.r, p.a, p.rot);
    });
  }

  /* ════════ 4. 반딧불이 ════════ */
  let fireflyStars = null;
  function initFireflies() {
    fireflyStars = null;
    for (let i = 0; i < cnt(52); i++) particles.push(makeFirefly());
  }
  function makeFirefly() {
    return {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.06 * kv, vy: (Math.random() - 0.5) * 0.05 * kv,
      blinkPhase: Math.random() * PI2, blinkS: 0.010 + Math.random() * 0.018,
      r: (1.8 + Math.random() * 2.2) * ks,
      wander: Math.random() * PI2, wanderS: 0.003 + Math.random() * 0.004,
    };
  }
  function drawFireflyBG() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a1d12'); sky.addColorStop(0.5, '#0f2a18'); sky.addColorStop(1, '#13321c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (!fireflyStars) {
      fireflyStars = [];
      for (let i = 0; i < cnt(60); i++) fireflyStars.push({
        x: Math.random() * W, y: Math.random() * H * 0.80,
        r: (0.5 + Math.random() * 0.8) * ks, a: 0.35 + Math.random() * 0.4, twkOff: Math.random() * PI2,
      });
    }
    ctx.save();
    fireflyStars.forEach(st => {
      ctx.globalAlpha = st.a * (0.6 + 0.4 * Math.sin(t * 1.2 + st.twkOff));
      ctx.fillStyle = '#d8f0d0';
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, PI2); ctx.fill();
    });
    ctx.restore();
    const gr = ctx.createLinearGradient(0, H * 0.72, 0, H);
    gr.addColorStop(0, '#071a0c'); gr.addColorStop(1, '#030e06');
    ctx.fillStyle = gr; ctx.fillRect(0, H * 0.74, W, H * 0.26);
    ctx.save();
    ctx.fillStyle = '#040f07';
    for (let i = 0; i < 60; i++) {
      const gx = ((i * 73.1) % 1) * W;
      const gh = H * 0.05 + ((i * 53.7) % 1) * H * 0.10;
      ctx.beginPath();
      ctx.moveTo(gx - 4 * ks, H * 0.76);
      ctx.quadraticCurveTo(gx + ((i % 3) - 1) * 8 * ks, H * 0.76 - gh * 0.5, gx + ((i % 5) - 2) * 3 * ks, H * 0.76 - gh);
      ctx.quadraticCurveTo(gx + ((i % 3) - 1) * 5 * ks, H * 0.76 - gh * 0.5, gx + 4 * ks, H * 0.76);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function loopFireflies() {
    particles.forEach(p => {
      p.wander += p.wanderS;
      p.vx += Math.cos(p.wander) * 0.002 * kv;
      p.vy += Math.sin(p.wander) * 0.002 * kv;
      p.vx *= 0.97; p.vy *= 0.97;
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      p.blinkPhase += p.blinkS;
      const blink = Math.max(0, Math.sin(p.blinkPhase));
      const glow = Math.max(blink * blink, 0.12);   // 꺼진 순간에도 희미하게 보이게
      if (glow > 0.05) {
        ctx.save();
        const glowR = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 9);
        glowR.addColorStop(0, `rgba(190,255,120,${glow * 0.45})`); glowR.addColorStop(1, 'rgba(180,255,120,0)');
        ctx.fillStyle = glowR; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 9, 0, PI2); ctx.fill();
        const coreG = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
        coreG.addColorStop(0, `rgba(245,255,200,${Math.min(1, glow * 1.2)})`);
        coreG.addColorStop(0.4, `rgba(175,250,90,${glow * 0.9})`);
        coreG.addColorStop(1, 'rgba(100,200,60,0)');
        ctx.fillStyle = coreG; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.2, 0, PI2); ctx.fill();
        ctx.restore();
      }
    });
  }

  /* ════════ 5. 벚꽃 비 ════════ */
  function initSakura() { for (let i = 0; i < cnt(55); i++) particles.push(makeSakuraPetal(true)); }
  function makeSakuraPetal(scatter) {
    return {
      x: Math.random() * W * 1.2 - W * 0.1, y: scatter ? Math.random() * H : -20 * ks,
      vx: (-0.10 - Math.random() * 0.18) * kv, vy: (0.13 + Math.random() * 0.22) * kv,
      rot: Math.random() * PI2, rotV: (Math.random() - 0.5) * 0.014,
      swg: Math.random() * PI2, swgS: 0.008 + Math.random() * 0.012,
      size: (5 + Math.random() * 7) * ks, a: 0.8 + Math.random() * 0.2,
      hue: 340 + Math.random() * 28, flip: Math.random() * PI2, flipS: 0.013 + Math.random() * 0.016,
    };
  }
  function drawSakuraBG() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2a1a2e'); sky.addColorStop(0.45, '#3d1f3a'); sky.addColorStop(1, '#1a0e1e');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const mx = W * 0.78, my = H * 0.20, mr = 32 * kz;
    ctx.save();
    const moonGlow = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 5);
    moonGlow.addColorStop(0, 'rgba(255,230,240,0.18)'); moonGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = moonGlow; ctx.beginPath(); ctx.arc(mx, my, mr * 5, 0, PI2); ctx.fill();
    const moonBody = ctx.createRadialGradient(mx - mr * 0.15, my - mr * 0.15, 0, mx, my, mr);
    moonBody.addColorStop(0, '#fff8f0'); moonBody.addColorStop(1, '#f0d8e8');
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, PI2); ctx.fillStyle = moonBody; ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(80,40,55,0.90)'; ctx.lineWidth = 18 * kz; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W * 0.18, H); ctx.bezierCurveTo(W * 0.19, H * 0.65, W * 0.14, H * 0.45, W * 0.22, H * 0.28); ctx.stroke();
    ctx.lineWidth = 11 * kz;
    ctx.beginPath(); ctx.moveTo(W * 0.22, H * 0.50); ctx.bezierCurveTo(W * 0.32, H * 0.38, W * 0.48, H * 0.32, W * 0.60, H * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.22, H * 0.38); ctx.bezierCurveTo(W * 0.08, H * 0.28, W * 0.02, H * 0.18, W * 0.12, H * 0.10); ctx.stroke();
    ctx.restore();
    [{ x: W * 0.20, y: H * 0.25, r: W * 0.24 }, { x: W * 0.58, y: H * 0.26, r: W * 0.20 }, { x: W * 0.10, y: H * 0.15, r: W * 0.16 }, { x: W * 0.38, y: H * 0.22, r: W * 0.18 }]
      .forEach(b => {
        ctx.save(); ctx.globalAlpha = 0.14;
        const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        bg.addColorStop(0, 'rgba(255,180,210,1)'); bg.addColorStop(1, 'rgba(220,120,170,0)');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, PI2); ctx.fill();
        ctx.restore();
      });
  }
  function drawSakuraPetalShape(x, y, size, rot, a, hue, flip) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.scale(1, 0.35 + Math.abs(Math.cos(flip)) * 0.65);
    ctx.globalAlpha = a;
    const pg = ctx.createLinearGradient(0, -size, 0, size);
    pg.addColorStop(0, `hsla(${hue},85%,82%,0.95)`); pg.addColorStop(0.5, `hsla(${hue},80%,88%,0.85)`); pg.addColorStop(1, `hsla(${hue},75%,78%,0.70)`);
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(0, -size);
    ctx.bezierCurveTo(size * 0.55, -size * 0.8, size * 0.6, -size * 0.1, 0, size * 0.3);
    ctx.bezierCurveTo(-size * 0.6, -size * 0.1, -size * 0.55, -size * 0.8, 0, -size);
    ctx.fill();
    ctx.globalAlpha = a * 0.18; ctx.strokeStyle = `hsl(${hue},60%,65%)`; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(0, -size * 0.9); ctx.lineTo(0, size * 0.2); ctx.stroke();
    ctx.restore();
  }
  function loopSakura() {
    particles.forEach(p => {
      p.swg += p.swgS; p.flip += p.flipS;
      p.x += p.vx + Math.sin(p.swg) * 0.35 * kv;
      p.y += p.vy + Math.cos(p.swg * 0.7) * 0.15 * kv;
      p.rot += p.rotV;
      if (p.y > H + 20 * ks || p.x < -50 * ks) Object.assign(p, makeSakuraPetal(false));
      drawSakuraPetalShape(p.x, p.y, p.size, p.rot, p.a, p.hue, p.flip);
    });
  }

  /* ════════ 6. 불꽃놀이 (효과음 제거) ════════ */
  let fwShells = [], fwParticles = [], fwStars = [], fwLater = [], fwNextShell = 0, fwFrame = 0;
  const FW_PALETTES = [[0, 20, 40, 60], [200, 220, 240, 260], [120, 140, 160, 180], [300, 320, 340, 360], [30, 50, 60, 80], [180, 200, 270, 290], [0, 60, 120, 180, 240, 300]];
  const FW_SHAPES = ['circle', 'star', 'heart', 'chrysanthemum', 'willow', 'ring'];
  function initFireworks() {
    fwShells = []; fwParticles = []; fwStars = []; fwLater = []; fwNextShell = 0; fwFrame = 0;
    for (let i = 0; i < cnt(120); i++) fwStars.push({
      x: Math.random() * W, y: Math.random() * H * 0.72,
      r: (0.35 + Math.random() * 0.7) * ks, a: 0.12 + Math.random() * 0.40, twk: Math.random() * PI2,
    });
  }
  function spawnShell() {
    const targetX = W * 0.12 + Math.random() * W * 0.76;
    const targetY = H * 0.10 + Math.random() * H * 0.35;
    const launchX = W * 0.20 + Math.random() * W * 0.60;
    const launchY = H * 0.94;
    const dx = targetX - launchX, dy = targetY - launchY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spd = (3.5 + Math.random() * 1.5) * kv;
    fwShells.push({
      x: launchX, y: launchY, vx: (dx / dist) * spd, vy: (dy / dist) * spd,
      gravity: 0.008 * kv, trail: [], life: 0, maxLife: Math.round(dist / spd) + 20, tx: targetX, ty: targetY,
    });
  }
  function explodeShell(x, y) {
    const palette = FW_PALETTES[Math.floor(Math.random() * FW_PALETTES.length)];
    const shape = FW_SHAPES[Math.floor(Math.random() * FW_SHAPES.length)];
    const count = Math.round((80 + Math.floor(Math.random() * 80)) * Math.max(cf, 0.75));
    const speed = (1.2 + Math.random() * 1.8) * kv;
    const isGlitter = Math.random() < 0.4;
    const trailLen = shape === 'willow' ? 28 : 12;
    for (let i = 0; i < count; i++) {
      let angle, vMult = 1;
      if (shape === 'circle' || shape === 'chrysanthemum') angle = (i / count) * PI2;
      else if (shape === 'star') {
        const sector = Math.floor(i / (count / 5));
        const within = (i % (count / 5)) / (count / 5);
        angle = sector * (PI2 / 5) - Math.PI / 2 + (within - 0.5) * 0.55;
        vMult = within < 0.15 || within > 0.85 ? 0.55 : 1.0;
      } else if (shape === 'heart') { const u = (i / count) * PI2; angle = u; vMult = (1 - Math.abs(Math.sin(u)) * 0.38); }
      else if (shape === 'willow') { angle = (i / count) * PI2; vMult = 0.6 + Math.random() * 0.5; }
      else if (shape === 'ring') { angle = (i / count) * PI2; vMult = 0.85 + Math.random() * 0.15; }
      else angle = Math.random() * PI2;
      const hue = palette[Math.floor(Math.random() * palette.length)] + (Math.random() - 0.5) * 18;
      const spd = speed * vMult * (0.82 + Math.random() * 0.36);
      fwParticles.push({
        x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        hue, sat: 88 + Math.random() * 12, lit: 68 + Math.random() * 18,
        life: 0, maxLife: (shape === 'willow' ? 140 : 95) + Math.random() * 55,
        size: (1.4 + Math.random() * 1.8) * ks,
        gravity: (shape === 'willow' ? 0.032 : 0.018 + Math.random() * 0.010) * kv,
        isGlitter: isGlitter && Math.random() < 0.5, trail: [], trailLen,
      });
    }
    // 2차 터짐 (작은 별) — 원본 setTimeout(180~380ms) 대신 프레임 수로 (장면이 바뀌면 함께 사라짐)
    if (Math.random() < 0.35) fwLater.push({ at: fwFrame + Math.round((180 + Math.random() * 200) / 16.7), x, y, palette });
  }
  function secondBurst(b) {
    const n = Math.round((18 + Math.floor(Math.random() * 16)) * Math.max(cf, 0.5));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * PI2, spd2 = (0.5 + Math.random() * 0.8) * kv;
      fwParticles.push({
        x: b.x + (Math.random() - 0.5) * 30 * kv, y: b.y + (Math.random() - 0.5) * 30 * kv,
        vx: Math.cos(ang) * spd2, vy: Math.sin(ang) * spd2,
        hue: b.palette[Math.floor(Math.random() * b.palette.length)] + 40, sat: 90, lit: 80,
        life: 0, maxLife: 55 + Math.random() * 35, size: (0.9 + Math.random() * 1.2) * ks,
        gravity: 0.022 * kv, isGlitter: true, trail: [], trailLen: 8,
      });
    }
  }
  function drawFireworksBG() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#08061c'); sky.addColorStop(0.55, '#0e0b2c'); sky.addColorStop(1, '#151137');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.save();
    fwStars.forEach(s => {
      ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t * 1.2 + s.twk));
      ctx.fillStyle = '#f0f4ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, PI2); ctx.fill();
    });
    ctx.restore();
    ctx.fillStyle = 'rgba(2,1,12,0.97)';
    ctx.beginPath(); ctx.moveTo(0, H);
    ctx.bezierCurveTo(W * 0.10, H * 0.87, W * 0.22, H * 0.83, W * 0.35, H * 0.89);
    ctx.bezierCurveTo(W * 0.48, H * 0.95, W * 0.60, H * 0.80, W * 0.72, H * 0.86);
    ctx.bezierCurveTo(W * 0.83, H * 0.92, W * 0.92, H * 0.84, W, H * 0.88);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function loopFireworks() {
    fwFrame++;
    fwNextShell--;
    if (fwNextShell <= 0) {
      spawnShell();
      if (Math.random() < 0.25) spawnShell();
      fwNextShell = 70 + Math.random() * 80;
    }
    fwLater = fwLater.filter(b => { if (fwFrame >= b.at) { secondBurst(b); return false; } return true; });

    fwShells = fwShells.filter(s => {
      s.life++;
      s.vy += s.gravity;
      s.x += s.vx; s.y += s.vy;
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 18) s.trail.shift();
      for (let i = 1; i < s.trail.length; i++) {
        const ta = i / s.trail.length;
        ctx.save(); ctx.globalAlpha = ta * 0.55;
        ctx.strokeStyle = 'rgba(255,240,160,1)'; ctx.lineWidth = 1.2 * ta * ks; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y); ctx.lineTo(s.trail[i].x, s.trail[i].y);
        ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.globalAlpha = 0.9;
      const hr = 5 * ks;
      const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, hr);
      hg.addColorStop(0, 'rgba(255,248,200,1)'); hg.addColorStop(1, 'rgba(255,220,100,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(s.x, s.y, hr, 0, PI2); ctx.fill();
      ctx.restore();
      if (s.life >= s.maxLife || s.y <= s.ty) { explodeShell(s.x, s.y); return false; }
      return true;
    });

    fwParticles = fwParticles.filter(p => {
      p.life++;
      p.vx *= 0.975; p.vy *= 0.975;
      p.vy += p.gravity;
      p.x += p.vx; p.y += p.vy;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > p.trailLen) p.trail.shift();
      const r = p.life / p.maxLife;
      if (r >= 1) return false;
      const fadeIn = r < 0.05 ? r / 0.05 : 1;
      const fadeOut = r > 0.55 ? (1 - r) / 0.45 : 1;
      const alpha = fadeIn * fadeOut;
      if (p.trail.length > 2) {
        for (let i = 1; i < p.trail.length; i++) {
          const ta = i / p.trail.length;
          ctx.save(); ctx.globalAlpha = alpha * ta * 0.85;
          ctx.strokeStyle = `hsla(${p.hue},${p.sat}%,${p.lit}%,1)`;
          ctx.lineWidth = p.size * ta * 0.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y); ctx.lineTo(p.trail[i].x, p.trail[i].y);
          ctx.stroke(); ctx.restore();
        }
      }
      if (p.isGlitter) {
        const flicker = 0.5 + 0.5 * Math.sin(p.life * 0.8);
        ctx.save(); ctx.globalAlpha = Math.min(1, alpha * (0.35 + flicker * 0.65));
        ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.lit + 10}%,1)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.9, 0, PI2); ctx.fill();
        ctx.restore();
      } else {
        ctx.save(); ctx.globalAlpha = alpha;
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 1.4);
        pg.addColorStop(0, `hsla(${p.hue + 20},${p.sat}%,${p.lit + 14}%,1)`);
        pg.addColorStop(0.5, `hsla(${p.hue},${p.sat}%,${p.lit}%,0.7)`);
        pg.addColorStop(1, `hsla(${p.hue - 10},${p.sat}%,${p.lit - 12}%,0)`);
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 1.4, 0, PI2); ctx.fill();
        ctx.restore();
      }
      return true;
    });
  }

  /* ════════ 7. 빗소리 (소리 없이 비 + 수면 파문) ════════ */
  let rainStars = [];
  let rainWind = 0, rainWindTarget = (Math.random() - 0.5) * 0.4;
  function initRain() {
    for (let i = 0; i < cnt(140); i++) particles.push(makeRaindrop(true));
    rainStars = [];
    for (let i = 0; i < cnt(28); i++) rainStars.push({
      x: Math.random() * W, y: Math.random() * H * 0.45,
      r: (0.4 + Math.random() * 0.5) * ks, a: 0.20 + Math.random() * 0.25, twk: Math.random() * PI2,
    });
  }
  function makeRaindrop(scatter) {
    return {
      x: Math.random() * W, y: scatter ? Math.random() * H : -10,
      vy: (1.0 + Math.random() * 0.7) * kv, vx: (rainWind + (Math.random() - 0.5) * 0.08) * kv,
      swg: Math.random() * PI2, swgS: 0.006 + Math.random() * 0.006,
      len: (8 + Math.random() * 8) * ks, a: 0.45 + Math.random() * 0.30,
    };
  }
  function drawRainBG() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d1222'); sky.addColorStop(0.5, '#131b33'); sky.addColorStop(1, '#17213c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const mx = W * 0.28, my = H * 0.24, mr = 38 * kz;
    ctx.save();
    const moonAura = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 5.5);
    moonAura.addColorStop(0, 'rgba(220,235,255,0.13)'); moonAura.addColorStop(0.3, 'rgba(200,220,255,0.06)');
    moonAura.addColorStop(0.7, 'rgba(170,200,240,0.02)'); moonAura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = moonAura; ctx.beginPath(); ctx.arc(mx, my, mr * 5.5, 0, PI2); ctx.fill();
    ctx.restore();
    const moonG = ctx.createRadialGradient(mx - mr * 0.15, my - mr * 0.2, 0, mx, my, mr);
    moonG.addColorStop(0, '#fffef8'); moonG.addColorStop(0.5, '#fff8e8'); moonG.addColorStop(0.85, '#ffefc0'); moonG.addColorStop(1, '#ffe090');
    ctx.save();
    ctx.fillStyle = moonG; ctx.beginPath(); ctx.arc(mx, my, mr, 0, PI2); ctx.fill();
    ctx.globalAlpha = 0.07; ctx.fillStyle = '#c8b878';
    [[-10, -8, 8], [12, 10, 5], [-4, 14, 4], [6, -14, 3]].forEach(([cx, cy, cr]) => {
      ctx.beginPath(); ctx.arc(mx + cx * kz, my + cy * kz, cr * kz, 0, PI2); ctx.fill();
    });
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.08;
    const rb = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.2);
    rb.addColorStop(0, 'rgba(255,248,220,0.9)'); rb.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = rb; ctx.beginPath(); ctx.arc(mx, my, mr * 2.2, 0, PI2); ctx.fill();
    ctx.restore();
    ctx.save();
    rainStars.forEach(s => {
      ctx.globalAlpha = s.a * (0.5 + 0.5 * Math.sin(t * 0.8 + s.twk));
      ctx.fillStyle = '#ddeeff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, PI2); ctx.fill();
    });
    ctx.restore();
    const wg = ctx.createLinearGradient(0, H * 0.74, 0, H);
    wg.addColorStop(0, 'rgba(20,32,56,0.97)'); wg.addColorStop(1, 'rgba(10,18,34,1)');
    ctx.fillStyle = wg; ctx.fillRect(0, H * 0.76, W, H * 0.24);
    ctx.save(); ctx.globalAlpha = 0.04;
    const hg = ctx.createLinearGradient(0, H * 0.74, 0, H * 0.80);
    hg.addColorStop(0, 'rgba(200,220,255,0.8)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, H * 0.74, W, H * 0.06);
    ctx.restore();
  }
  function loopRain() {
    if (Math.random() < 0.004) rainWindTarget = (Math.random() - 0.5) * 0.5;
    rainWind += (rainWindTarget - rainWind) * 0.002;
    ctx.save();
    particles.forEach(p => {
      p.vx += (rainWind * kv - p.vx) * 0.01;
      p.swg += p.swgS;
      p.x += p.vx + Math.sin(p.swg) * 0.12 * kv;
      p.y += p.vy;
      if (p.y > H * 0.76) {
        if (Math.random() < 0.6) {
          const big = Math.random() < 0.2;
          extras.push({
            type: 'ripple', x: p.x + (Math.random() - 0.5) * 6 * kv, y: H * 0.76 + Math.random() * H * 0.20, r: 0,
            maxR: (big ? 22 + Math.random() * 16 : 6 + Math.random() * 9) * Math.max(kv, ks * 0.6),
            life: 0, maxLife: big ? 200 + Math.random() * 100 : 130 + Math.random() * 70,
            a: big ? 0.40 : 0.50, lw: big ? 1.1 : 0.9,
          });
        }
        Object.assign(p, makeRaindrop(false));
      }
      ctx.globalAlpha = p.a;
      ctx.strokeStyle = 'rgba(175,220,255,1)';
      ctx.lineWidth = 1.0;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 3, p.y - p.len); ctx.stroke();
    });
    ctx.restore();
    extras = extras.filter(e => {
      if (e.type !== 'ripple') return true;
      e.life++;
      const prog = e.life / e.maxLife;
      e.r = e.maxR * Math.sqrt(prog);
      const a = e.a * (1 - prog) * (1 - prog);
      if (a < 0.004) return false;
      ctx.save(); ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(140,200,250,1)'; ctx.lineWidth = e.lw || 0.9;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r, e.r * 0.25, 0, 0, PI2); ctx.stroke();
      ctx.restore();
      return e.life < e.maxLife;
    });
  }

  /* ════════ 8. 달빛 구름 ════════ */
  let clouds = [], moonStars = [];
  function initMoonCloud() {
    clouds = []; moonStars = [];
    for (let i = 0; i < 5; i++) clouds.push(makeCloud(true));
    for (let i = 0; i < cnt(80); i++) moonStars.push({
      x: Math.random() * W, y: Math.random() * H * 0.75,
      r: (0.4 + Math.random() * 0.6) * ks, a: 0.40 + Math.random() * 0.45, twk: Math.random() * PI2,
    });
  }
  function makeCloud(scatter) {
    const kc = Math.max(kv, kz * 0.6);
    const scale = 0.6 + Math.random() * 1.6;
    const baseR = (28 + Math.random() * 22) * kc;
    const numPuffs = 7 + Math.floor(Math.random() * 6);
    const puffs = [];
    for (let i = 0; i < numPuffs; i++) {
      const angle = (i / numPuffs) * Math.PI * 1.8 - Math.PI * 0.9;
      const dist = (baseR * 0.5 + Math.random() * baseR * 0.8) * scale;
      puffs.push({
        ox: Math.cos(angle) * dist * (1.8 + Math.random() * 0.6),
        oy: Math.sin(angle) * dist * 0.55 - Math.abs(Math.cos(angle)) * dist * 0.3,
        r: (baseR * (0.55 + Math.random() * 0.7)) * scale,
      });
    }
    puffs.push({ ox: 0, oy: baseR * 0.25 * scale, r: baseR * 1.1 * scale });
    puffs.push({ ox: -baseR * 0.7 * scale, oy: baseR * 0.35 * scale, r: baseR * 0.85 * scale });
    puffs.push({ ox: baseR * 0.7 * scale, oy: baseR * 0.35 * scale, r: baseR * 0.85 * scale });
    puffs.sort((a, b) => b.r - a.r);   // 큰 것부터 (원본은 매 프레임 정렬)
    return {
      x: scatter ? Math.random() * W * 1.8 - W * 0.4 : -(260 * kc + baseR * scale * 2),
      y: H * (0.04 + Math.random() * 0.38),
      spd: (0.06 + Math.random() * 0.14) * kv,
      a: 0.50 + Math.random() * 0.30, scale, puffs, kc,
    };
  }
  function drawMoonCloudBG() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0c1120'); sky.addColorStop(0.5, '#111a30'); sky.addColorStop(1, '#16203c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.save();
    moonStars.forEach(s => {
      ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t * 1.1 + s.twk)); ctx.fillStyle = '#ddeeff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, PI2); ctx.fill();
    });
    ctx.restore();
    const mx = W * 0.28, my = H * 0.26, mr = 36 * kz;
    ctx.save();
    const ma = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 5);
    ma.addColorStop(0, 'rgba(230,240,255,0.12)'); ma.addColorStop(0.4, 'rgba(200,220,255,0.05)'); ma.addColorStop(1, 'transparent');
    ctx.fillStyle = ma; ctx.beginPath(); ctx.arc(mx, my, mr * 5, 0, PI2); ctx.fill(); ctx.restore();
    drawSprite(moonSprite('cloud', mr, [0.1, -0.15], [[0, '#fffef5'], [0.65, '#fff8e0'], [1, '#ffe8b0']], [0.58, -0.08, 0.90]), mx, my);
    ctx.fillStyle = 'rgba(4,5,12,0.97)';
    ctx.beginPath(); ctx.moveTo(0, H);
    ctx.bezierCurveTo(W * 0.12, H * 0.88, W * 0.25, H * 0.84, W * 0.40, H * 0.90);
    ctx.bezierCurveTo(W * 0.55, H * 0.96, W * 0.68, H * 0.82, W * 0.80, H * 0.88);
    ctx.bezierCurveTo(W * 0.90, H * 0.93, W * 0.96, H * 0.86, W, H * 0.90);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  function loopMoonCloud() {
    clouds.forEach(c => {
      c.x += c.spd;
      if (c.x > W + (320 + c.scale * 100) * c.kc) Object.assign(c, makeCloud(false));
      ctx.save();
      c.puffs.forEach(p => {
        const px = c.x + p.ox, py = c.y + p.oy;
        const cg = ctx.createRadialGradient(px, py - p.r * 0.18, p.r * 0.05, px, py, p.r);
        cg.addColorStop(0, `rgba(225,232,250,${c.a * 0.95})`);
        cg.addColorStop(0.4, `rgba(205,218,242,${c.a * 0.75})`);
        cg.addColorStop(0.75, `rgba(180,200,232,${c.a * 0.45})`);
        cg.addColorStop(1, 'rgba(150,175,220,0)');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(px, py, p.r, 0, PI2); ctx.fill();
      });
      ctx.restore();
    });
  }

  /* ── 장면 시작 · 한 프레임 ── */
  function initScene() {
    particles = []; extras = []; t = 0;
    if (!ctx || !W || !H) return;
    const id = SCENES[cur];
    if (id === 'spring_tree') initSpringTree();
    else if (id === 'shooting_stars') initShootingStars();
    else if (id === 'snowfall') initSnowfall();
    else if (id === 'fireflies') initFireflies();
    else if (id === 'sakura') initSakura();
    else if (id === 'fireworks') initFireworks();
    else if (id === 'rain') initRain();
    else if (id === 'mooncloud') initMoonCloud();
  }
  function frame() {
    if (!ctx || !W || !H) return;
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    const id = SCENES[cur];
    if (id === 'spring_tree') { drawSpringBG(); loopLeaves(); }
    else if (id === 'shooting_stars') { drawNightBG(); loopShootingStars(); }
    else if (id === 'snowfall') { drawSnowBG(); loopSnowfall(); }
    else if (id === 'fireflies') { drawFireflyBG(); loopFireflies(); }
    else if (id === 'sakura') { drawSakuraBG(); loopSakura(); }
    else if (id === 'fireworks') { drawFireworksBG(); loopFireworks(); }
    else if (id === 'rain') { drawRainBG(); loopRain(); }
    else if (id === 'mooncloud') { drawMoonCloudBG(); loopMoonCloud(); }
  }

  return {
    count: SCENES.length,
    get idx() { return cur; },
    get id() { return SCENES[cur]; },
    attach(c) { ctx = c; },
    // 화면 크기가 바뀌면 같은 장면을 새 크기로 다시 시작 (원본 resize 와 같음)
    resize(w, h, ratio) {
      W = w; H = h; dpr = ratio || 1;
      kv = Math.max(0.2, Math.min(W / 390, H / 700));
      kz = Math.min(1.2, Math.max(0.3, (W / 390 + H / 700) / 2));
      ks = Math.min(1.2, Math.max(0.85, Math.sqrt(kz)));
      cf = Math.min(1, Math.max(0.45, (W * H) / (390 * 700) * 1.5));
      sprites = {};
      initScene();
    },
    next() { cur = nextShuffleIdx(); initScene(); return cur; },
    frame,
  };
})();

/* ---------- TV 본체 ---------- */
const TvBox = {
  LS: 'mg77_tv',
  RATIO: 0.66,       // TV 전체 높이 / 너비 (tv.css: 너비 100em · 높이 66em)
  MAX_W: 560,        // 너무 커지지 않게
  PLAY_MIN: 230,     // 이 너비 이상이면 재생
  SHOW_MIN: 140,     // 이 너비 미만이면 숨김 (사이는 꺼진 TV)
  AUTO_MS: 120000,   // 2분마다 다음 장면
  STEP_MS: 1000 / 60,
  el: null, slot: null, ro: null,
  power: true,
  fit: 'hide',       // play | small | hide
  _raf: 0, _last: 0, _acc: 0, _sceneMs: 0,
  _noiseUntil: 0, _osdT: null, _fading: false, _fadeT: null,
  _cw: 0, _ch: 0, _dpr: 1,

  load() {
    try { const s = JSON.parse(localStorage.getItem(this.LS) || 'null'); if (s && s.power === false) this.power = false; } catch (e) {}
  },
  save() { try { localStorage.setItem(this.LS, JSON.stringify({ power: this.power })); } catch (e) {} },

  _init() {
    this.load();
    const el = document.createElement('div');
    el.className = 'tv';
    el.innerHTML = `
      <div class="tv-body">
        <div class="tv-bezel"><div class="tv-scr">
          <div class="tv-pic"><canvas class="tv-cv"></canvas><canvas class="tv-noise" width="96" height="72"></canvas><div class="tv-fade"></div></div>
          <div class="tv-osd"></div>
        </div></div>
        <div class="tv-panel">
          <div class="tv-grille" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="tv-ctl"><button type="button" class="tv-dial" data-tv="ch" title="채널 (다음 장면)" aria-label="채널"><i class="tv-notch"></i></button><span class="tv-lbl">CH</span></div>
          <div class="tv-ctl"><button type="button" class="tv-pwr" data-tv="pwr" title="전원" aria-label="전원"><i class="tv-led"></i></button><span class="tv-lbl">POWER</span></div>
        </div>
      </div>
`;
    this.el = el;
    this.scr = el.querySelector('.tv-scr');
    this.cv = el.querySelector('.tv-cv');
    this.noise = el.querySelector('.tv-noise');
    this.nctx = this.noise.getContext('2d');
    this.fadeEl = el.querySelector('.tv-fade');
    this.osd = el.querySelector('.tv-osd');
    this.dial = el.querySelector('.tv-dial');
    TvEng.attach(this.cv.getContext('2d'));
    this._tickB = (ts) => this._tick(ts);
    this._setDial();

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tv]');
      if (!b) return;
      e.stopPropagation();
      if (b.disabled || this.fit !== 'play') return;
      if (b.dataset.tv === 'pwr') this.toggle();
      else if (b.dataset.tv === 'ch') this.channel();
    });
    document.addEventListener('visibilitychange', () => this._sync());
  },

  /* ---------- 화면에 붙이기 (DayPage에서 호출) ---------- */
  mount(main) {
    try {
      if (this.ro) { this.ro.disconnect(); this.ro = null; }
      const slot = main && main.querySelector('.tv-slot');
      if (!slot) { this.slot = null; this._stop(); if (this.el) this.el.remove(); return; }
      if (!this.el) this._init();
      this.slot = slot;
      slot.appendChild(this.el);
      if (window.ResizeObserver) { this.ro = new ResizeObserver(() => this._layout()); this.ro.observe(slot); }
      this._layout();
    } catch (e) { try { if (this.el) this.el.remove(); } catch (_) {} }
  },

  // 남는 공간에 맞춰 크기 · 상태 정하기
  _layout() {
    const slot = this.slot, el = this.el;
    if (!slot || !el || !slot.isConnected) { this._sync(); return; }
    const B = Math.floor(Math.min(slot.clientWidth, slot.clientHeight / this.RATIO, this.MAX_W));
    this.fit = B >= this.PLAY_MIN ? 'play' : B >= this.SHOW_MIN ? 'small' : 'hide';
    el.hidden = this.fit === 'hide';
    if (this.fit !== 'hide') el.style.fontSize = (B / 100) + 'px';
    el.classList.toggle('tight', this.fit === 'small');
    el.title = this.fit === 'small' ? '공간이 좁아 TV를 꺼 두었어요' : '';
    el.querySelectorAll('[data-tv]').forEach(b => { b.disabled = this.fit !== 'play'; });
    if (this.fit === 'play') this._sizeCanvas();
    this._sync();
  },
  _sizeCanvas() {
    const r = this.scr.getBoundingClientRect(), w = r.width, h = r.height;
    const dpr = Math.min(3, Math.max(2, window.devicePixelRatio || 1));   // 고화질: 최소 2배로 그려서 축소 표시
    if (!w || !h || (w === this._cw && h === this._ch && dpr === this._dpr)) return;
    this._cw = w; this._ch = h; this._dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    const c2 = this.cv.getContext('2d');
    c2.setTransform(this.cv.width / w, 0, 0, this.cv.height / h, 0, 0);
    c2.imageSmoothingQuality = 'high';   // 원본의 ctx.scale 누적 문제 없이
    TvEng.resize(w, h, dpr);
    if (!this._raf) TvEng.frame();                                  // 멈춰 있어도 새 크기로 한 장 그려 둠
  },

  // 켜짐 표시 + 그리기 시작/멈춤
  _sync() {
    if (!this.el) return;
    const on = this.fit === 'play' && this.power;
    this.el.classList.toggle('on', on);
    if (on && this.el.isConnected && !document.hidden) this._start(); else this._stop();
  },
  _start() {
    if (this._raf) return;
    this._last = 0; this._acc = 0;
    this._raf = requestAnimationFrame(this._tickB);
  },
  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  },
  _tick(ts) {
    this._raf = 0;
    if (!this.el || !this.el.isConnected || this.fit !== 'play' || !this.power || document.hidden) return;   // 다른 메뉴로 가면 저절로 멈춤
    this._raf = requestAnimationFrame(this._tickB);
    const dt = this._last ? Math.min(ts - this._last, 100) : this.STEP_MS;
    this._last = ts;
    // 모니터 주사율(60·120·144Hz)과 상관없이 1초에 60번만 움직임 → 원본과 같은 속도
    this._acc += dt;
    let steps = 0;
    while (this._acc >= this.STEP_MS && steps < 3) { TvEng.frame(); this._acc -= this.STEP_MS; steps++; }
    if (steps === 3) this._acc = 0;
    this._sceneMs += dt;
    if (this._sceneMs >= this.AUTO_MS && !this._fading) this._autoNext();
    this._drawNoise(ts);
  },

  // 2분마다: 원본처럼 검게 사라졌다가 다음 장면
  _autoNext() {
    this._fading = true;
    this._sceneMs = 0;
    this.fadeEl.style.opacity = '1';
    this._fadeT = setTimeout(() => {
      TvEng.next(); this._setDial();
      this.fadeEl.style.opacity = '0';
      this._fading = false;
    }, 320);
  },
  // 채널 다이얼: 지지직 → 바로 다음 장면, 2분은 다시 셈
  channel() {
    if (!this.power || this.fit !== 'play') return;
    this._sceneMs = 0;
    clearTimeout(this._fadeT);           // 자동 전환 도중에 눌러도 두 번 넘어가지 않게
    this._fading = false;
    this.fadeEl.style.opacity = '0';
    TvEng.next();
    this._setDial();
    this._noiseUntil = performance.now() + 380;
    this._showOsd();
  },
  _setDial() {
    if (this.cv) this.cv.dataset.sc = TvEng.id;
    if (this.dial) this.dial.style.transform = `rotate(${TvEng.idx * (360 / TvEng.count)}deg)`;
  },
  _showOsd() {
    this.osd.textContent = 'CH ' + String(TvEng.idx + 1).padStart(2, '0');
    this.osd.classList.add('show');
    clearTimeout(this._osdT);
    this._osdT = setTimeout(() => this.osd.classList.remove('show'), 1800);
  },
  _drawNoise(ts) {
    const on = ts < this._noiseUntil || performance.now() < this._noiseUntil;
    this.el.classList.toggle('noisy', on);
    if (!on) return;
    const c = this.nctx, w = this.noise.width, h = this.noise.height;
    const img = c.createImageData(w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255 | 0; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    c.putImageData(img, 0, 0);
  },

  // 전원: 끌 때는 브라운관처럼 줄어들며 꺼지고, 켤 때는 가운데서 펼쳐짐
  toggle() {
    const el = this.el;
    el.classList.remove('anim-on', 'anim-off');
    if (this.power) {
      this._stop();                      // 마지막 장면을 멈춘 채로 접힘
      el.classList.add('anim-off');
      this.power = false; this.save();
      setTimeout(() => { el.classList.remove('anim-off'); this._sync(); }, 520);
      this.osd.classList.remove('show');
    } else {
      this.power = true; this.save();
      this._sceneMs = 0;
      void el.offsetWidth;
      el.classList.add('anim-on');
      this._sync();
      setTimeout(() => el.classList.remove('anim-on'), 600);
      this._showOsd();
    }
  },
};
