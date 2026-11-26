/* =========================================================
   variants.js — 변형 문제 (서술형 · 삽입 · 순서)
   예전 시험+교재 페이지의 서술형·삽입·순서 탭을 따로 뗀 페이지.
   각 탭의 화면·기능은 그대로 essays.js(Essays) · inserts.js(Inserts) · orders.js(Orders)가 그린다.
   ========================================================= */
const Variants = {
  tab: 'wr',            // 'wr' 서술형 (essays.js) / 'ins' 삽입 (inserts.js) / 'ord' 순서 (orders.js)

  /* ---------- 탭 줄 고정: 스크롤해도 제목줄 바로 아래에 탭 줄이 남게 (시험+교재와 같은 방식) ---------- */
  stickTabs(main) {
    if (App.page !== 'variants' || !main) return;
    const h = $(':scope > .page-head', main);
    if (h) main.style.setProperty('--x7tabs', Math.max(0, h.offsetHeight - 26) + 'px');
    if (!this._stickOn) { this._stickOn = true; window.addEventListener('resize', debounce(() => this.stickTabs($('#main')), 100)); }
  },

  /* ---------- 공통 머리 · 탭 ---------- */
  headHtml() {
    return `<div class="page-head"><h1>변형 문제</h1></div>`;
  },
  tabsHtml() {
    const t = (k, label, n) => `<button data-xtab="${k}" class="${this.tab === k ? 'active' : ''}">${label}<span class="cnt">${n}</span></button>`;
    return `<div class="tabs">${t('wr', '서술형', Essays.count())}${t('ins', '삽입', Inserts.count())}${t('ord', '순서', Orders.count())}</div>`;
  },
  tabClick(e) {
    const t = e.target.closest('[data-xtab]'); if (!t) return false;
    if (this.tab !== t.dataset.xtab) this.tab = t.dataset.xtab;
    App.render(); return true;
  },
  // 각 탭 화면의 클릭 처리에서 먼저 부른다. 처리했으면 true
  commonClick(e, main) {
    if (this.tabClick(e)) return true;
    return false;
  },

  render(main) {
    queueMicrotask(() => this.stickTabs(main));   // 어느 탭을 그려도 다 그린 뒤 탭 줄 고정 위치를 맞춘다
    if (this.tab === 'ins') { Inserts.render(main); return; }
    if (this.tab === 'ord') { Orders.render(main); return; }
    this.tab = 'wr';
    Essays.render(main);
  },
};

/* 변형 문제 화면 전용 스타일 */
(function () {
  const st = document.createElement('style');
  st.textContent = `
/* 변형 문제: 탭 줄을 제목줄 아래에 고정 (--x7tabs = Variants.stickTabs가 넣는 제목줄 높이) */
#main[data-page="variants"] > .tabs { position: sticky; top: var(--x7tabs, 54px); z-index: 19; background: var(--bg); margin-top: -10px; padding-top: 10px; }
`;
  document.head.appendChild(st);
})();
