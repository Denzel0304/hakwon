/* =========================================================
   todo-ext.js — 할일 관리 (PC 날짜 요약 · 모바일 할일 탭 공용)
   테이블은 늘리지 않고 기존 todos 테이블만 사용한다.

   todo (기존 필드 + 추가 필드)
     { lessonId, classId, date, text, done, createdAt, order,       ← 기존 (수업일지 할일은 lessonId 있음)
       importance(0~3), memo, time('HH:MM'), remind(일 전),         ← 추가
       checklist:[{ t:글, d:완료 }], remindDone(상기 확인), doneAt,
       repeat:{ type, weekdays, monthMode, monthDay, monthWeek, monthWeekday,
                yearlyMonth, yearlyDay, birthday, customUnit, customInterval, endDate } }
     · repeat가 있으면 반복 원본(마스터). date = 반복 시작일. 개별 할일만 반복 가능 (수업일지 할일은 반복 없음)
   반복 예외 (같은 todos 테이블): id = TDX_원본ID_YYYYMMDD
     { rm: 원본ID, date: 그 회차 날짜, done, deleted, remindDone, ov:{ text, importance, memo, time, checklist } }
     · ov = '이 날짜만 수정'한 내용
   상기(🔔): 사본을 저장하지 않고, 원래 날짜 N일 전에 화면에서만 보여준다 (체크하면 remindDone)
     · 원본이 완료되면 자동 완료 / 날짜가 지나면 밀린 할일에 넣지 않음
   ========================================================= */

const TX_IMP = ['없음', '낮음', '보통', '높음'];
const TX_RTYPES = [['none', '없음'], ['daily', '매일'], ['weekly', '매주'], ['monthly', '매월'], ['yearly', '매년'], ['custom', '커스텀']];
const TX_BDAY = '🎂';
const TX_TITLE_CMP = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const TodoX = {
  LATE_DAYS: 730,           // 반복 일정의 밀린 회차는 최근 2년까지만 찾는다

  /* ---------- 분류 · 표시 도우미 ---------- */
  isMaster(t) { return !!t && !t.rm && !!(t.repeat && t.repeat.type && t.repeat.type !== 'none'); },
  exId(mid, date) { return 'TDX_' + mid + '_' + compactDate(date); },
  timeLabel(hhmm) {
    if (!hhmm) return '';
    const [h, m] = String(hhmm).split(':').map(Number);
    if (isNaN(h)) return '';
    return m ? `${h}시 ${m}분` : `${h}시`;
  },
  clProg(cl) {
    if (!Array.isArray(cl) || !cl.length) return null;
    return { done: cl.filter(x => x.d).length, total: cl.length };
  },
  mdLabel(ds) { const d = parseYmd(ds); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; },
  maxOrder(date) {
    return Math.max(-1, ...Store.where('todos', t => !t.rm && t.date === date && t.order != null).map(t => +t.order || 0));
  },

  /* ---------- 반복 날짜 계산 (똑비서 isRepeatMatch와 같은 규칙) ---------- */
  match(m, ds) {
    const r = m.repeat;
    if (!r || !r.type || r.type === 'none' || !isYmd(m.date) || !isYmd(ds)) return false;
    if (ds < m.date) return false;
    if (isYmd(r.endDate) && ds > r.endDate) return false;
    if (ds === m.date) return true;                         // 시작일 당일은 항상 표시
    const base = parseYmd(m.date), tg = parseYmd(ds);
    const diff = Math.round((tg - base) / 864e5), dow = tg.getDay();
    switch (r.type) {
      case 'daily': return true;
      case 'weekly': return (r.weekdays || []).includes(dow);
      case 'monthly': {
        if ((r.monthMode || 'day') === 'day') return tg.getDate() === (+r.monthDay || base.getDate());
        const wk = +r.monthWeek || 1, wd = r.monthWeekday == null ? 1 : +r.monthWeekday;
        if (dow !== wd) return false;
        const dom = tg.getDate();
        if (wk === 5) return dom > new Date(tg.getFullYear(), tg.getMonth() + 1, 0).getDate() - 7;   // 마지막 주
        return Math.ceil((dom + new Date(tg.getFullYear(), tg.getMonth(), 1).getDay()) / 7) === wk;
      }
      case 'yearly': return (tg.getMonth() + 1) === (+r.yearlyMonth || 1) && tg.getDate() === (+r.yearlyDay || 1);
      case 'custom': {
        const n = +r.customInterval || 2;
        switch (r.customUnit || 'day') {
          case 'day': return diff % n === 0;
          case 'week': return diff % (n * 7) === 0;
          case 'month': {
            if (tg.getDate() !== base.getDate()) return false;
            return ((tg.getFullYear() - base.getFullYear()) * 12 + tg.getMonth() - base.getMonth()) % n === 0;
          }
          case 'year':
            if (tg.getMonth() !== base.getMonth() || tg.getDate() !== base.getDate()) return false;
            return (tg.getFullYear() - base.getFullYear()) % n === 0;
          default: return false;
        }
      }
      default: return false;
    }
  },
  repLabel(r) {
    if (!r || !r.type || r.type === 'none') return '';
    const D = DOW;
    switch (r.type) {
      case 'daily': return '매일';
      case 'weekly': return '매주 ' + DAY_ORDER.filter(d => (r.weekdays || []).includes(d)).map(d => D[d]).join(',');
      case 'monthly':
        if (r.monthMode === 'week') return `매월 ${['첫째', '둘째', '셋째', '넷째', '마지막'][(+r.monthWeek || 1) - 1]} ${D[+r.monthWeekday || 0]}요일`;
        return `매월 ${r.monthDay}일`;
      case 'yearly': return `매년 ${r.yearlyMonth}/${r.yearlyDay}`;
      case 'custom': return `매 ${r.customInterval}${{ day: '일', week: '주', month: '개월', year: '년' }[r.customUnit] || '일'}마다`;
      default: return '';
    }
  },

  /* ---------- 화면에 보일 항목 만들기 ---------- */
  snapshot() {
    const direct = [], masters = [], ex = {};
    Store.all('todos').forEach(t => {
      if (t.rm) ex[t.rm + '|' + t.date] = t;
      else if (this.isMaster(t)) masters.push(t);
      else direct.push(t);
    });
    return { direct, masters, ex };
  },
  dItem(t) {
    return {
      k: 'd:' + t.id, rec: t, date: t.date, text: t.text || '', importance: +t.importance || 0, memo: t.memo || '',
      time: t.time || '', checklist: Array.isArray(t.checklist) ? t.checklist : [], remind: +t.remind || 0,
      done: !!t.done, repeat: false, rem: false, lesson: !!t.lessonId, classId: t.classId || '', order: t.order, createdAt: t.createdAt || '',
    };
  },
  oItem(m, x, date) {
    const v = Object.assign({}, m, (x && x.ov) || {});
    return {
      k: 'o:' + m.id + ':' + date, master: m, ex: x || null, date, text: v.text || '', importance: +v.importance || 0, memo: v.memo || '',
      time: v.time || '', checklist: Array.isArray(v.checklist) ? v.checklist : [], remind: +m.remind || 0,
      done: !!(x && x.done), repeat: true, rem: false, lesson: false, classId: '', order: m.order, createdAt: m.createdAt || '',
    };
  },
  rItem(b, onDate) {
    const seen = b.repeat ? !!(b.ex && b.ex.remindDone) : !!b.rec.remindDone;
    const label = [this.mdLabel(b.date), this.timeLabel(b.time)].filter(Boolean).join(' ');
    return {
      k: (b.repeat ? 'ro:' + b.master.id + ':' : 'r:' + b.rec.id + ':') + b.date, base: b, date: onDate,
      text: `🔔 ${b.text}(${label})`, importance: b.importance, memo: '', time: '', checklist: [], remind: 0,
      done: b.done || seen, baseDone: b.done, repeat: false, rem: true, lesson: b.lesson, classId: b.classId, order: -1, createdAt: b.createdAt,
    };
  },
  itemsOn(date, S) {
    S = S || this.snapshot();
    const out = [];
    S.direct.forEach(t => { if (t.date === date) out.push(this.dItem(t)); });
    S.masters.forEach(m => {
      if (!this.match(m, date)) return;
      const x = S.ex[m.id + '|' + date];
      if (x && x.deleted) return;
      out.push(this.oItem(m, x, date));
    });
    // 상기: 원래 날짜가 N일 뒤인 할일
    S.direct.forEach(t => {
      const r = +t.remind || 0;
      if (r > 0 && isYmd(t.date) && addDaysStr(t.date, -r) === date) out.push(this.rItem(this.dItem(t), date));
    });
    S.masters.forEach(m => {
      const r = +m.remind || 0;
      if (r <= 0) return;
      const od = addDaysStr(date, r);
      if (!this.match(m, od)) return;
      const x = S.ex[m.id + '|' + od];
      if (x && x.deleted) return;
      out.push(this.rItem(this.oItem(m, x, od), date));
    });
    return out;
  },
  // 밀린 할일: 오늘 전 날짜의 미완료 (반복은 안 한 회차마다 한 줄, 상기는 제외)
  lateItems(today, S) {
    S = S || this.snapshot();
    const out = [];
    S.direct.forEach(t => { if (!t.done && isYmd(t.date) && t.date < today) out.push(this.dItem(t)); });
    const limit = addDaysStr(today, -this.LATE_DAYS);
    S.masters.forEach(m => {
      let d = m.date < limit ? limit : m.date;
      const end = isYmd(m.repeat.endDate) && m.repeat.endDate < today ? m.repeat.endDate : addDaysStr(today, -1);
      for (; d <= end; d = addDaysStr(d, 1)) {
        if (!this.match(m, d)) continue;
        const x = S.ex[m.id + '|' + d];
        if (x && (x.done || x.deleted)) continue;
        out.push(this.oItem(m, x, d));
      }
    });
    return out.sort((a, b) => ko(a.date, b.date) || this.cmp(a, b));
  },
  // 달력 점: { 날짜: { todo, late } } — from부터 n일
  dotIndex(from, n, today) {
    const S = this.snapshot(), out = {};
    for (let i = 0, d = from; i < n; i++, d = addDaysStr(d, 1)) {
      const left = this.itemsOn(d, S).filter(it => !it.done);
      if (!left.length) continue;
      if (d < today) { if (left.some(it => !it.rem)) out[d] = { late: true, todo: false }; }
      else out[d] = { late: false, todo: true };
    }
    return out;
  },

  /* ---------- 정렬: 반복 → 중요도 → 시간 → 끌어서 정한 순서 ---------- */
  cmp(a, b) {
    if (a.repeat !== b.repeat) return a.repeat ? -1 : 1;
    if (a.repeat && b.repeat) {
      const ac = a.checklist.length, bc = b.checklist.length;
      if ((ac > 0) !== (bc > 0)) return ac > 0 ? -1 : 1;
      if (ac !== bc) return bc - ac;
      return TX_TITLE_CMP.compare(a.text, b.text);
    }
    if (b.importance !== a.importance) return b.importance - a.importance;
    if (!!a.time !== !!b.time) return a.time ? -1 : 1;
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
    const oa = a.order == null ? 1e9 : +a.order, ob = b.order == null ? 1e9 : +b.order;
    return oa - ob || ko(a.createdAt, b.createdAt);
  },

  // 키로 항목 다시 찾기
  resolve(k) {
    const p = String(k || '').split(':');
    if (p[0] === 'd') { const t = Store.get('todos', p[1]); return t ? this.dItem(t) : null; }
    if (p[0] === 'r') { const t = Store.get('todos', p[1]); return t ? this.rItem(this.dItem(t), addDaysStr(t.date, -(+t.remind || 0))) : null; }
    if (p[0] === 'o' || p[0] === 'ro') {
      const m = Store.get('todos', p[1]);
      if (!this.isMaster(m) || !isYmd(p[2])) return null;
      const it = this.oItem(m, Store.get('todos', this.exId(m.id, p[2])), p[2]);
      return p[0] === 'o' ? it : this.rItem(it, addDaysStr(p[2], -(+m.remind || 0)));
    }
    return null;
  },

  /* ---------- 그리기 ---------- */
  // opts: { mobile, late(밀린 목록) }
  rowHtml(it, opts) {
    const mob = !!opts.mobile;
    const base = it.rem ? it.base : it;
    const editable = true;                                   // 모바일도 PC와 같은 기능 (수업일지에서 추가한 할일 포함)
    const canDrag = !opts.late && !it.done && !it.repeat && !it.rem && !it.time && editable;
    const prog = this.clProg(it.checklist);
    const c = base.lesson ? Store.get('classes', base.classId) : null;
    const meta = [];
    if (opts.late) meta.push(`<span class="tx-date">${fmtMD(it.date)}</span>`);
    if (it.repeat && !opts.late) meta.push(`<span class="tx-rep">${esc(this.repLabel(it.master.repeat))}</span>`);
    if (c) meta.push(`<span class="tx-cls" data-tgo title="진도 탭에서 보기">${esc(c.name)}</span>`);
    return `<div class="tx-item${it.done ? ' done' : ''}${it.rem ? ' rem' : ''}" data-k="${esc(it.k)}"${canDrag ? ` data-dr="${it.importance}"` : ''}>
      <span class="tx-imp ${it.repeat ? 'rep' : 'imp-' + it.importance}"></span>
      <button type="button" class="tx-ck${it.done ? ' on' : ''}" data-tck aria-label="${it.done ? '완료 취소' : '완료'}"></button>
      <div class="tx-body">
        <div class="tx-title">${it.repeat ? '<span class="tx-star">★</span>' : ''}${it.time ? `<span class="tx-time">🕒[${esc(this.timeLabel(it.time))}]</span> ` : ''}${prog ? `<span class="tx-cl">☑ (${prog.done}/${prog.total})</span> ` : ''}${esc(it.text)}</div>
        ${it.memo ? `<div class="tx-memo">${esc(firstLine(it.memo))}</div>` : ''}
        ${meta.length ? `<div class="tx-meta">${meta.join('')}</div>` : ''}
      </div>
      ${canDrag ? '<span class="tx-drag" data-tdrag aria-label="끌어서 순서 바꾸기"><svg viewBox="0 0 24 14" width="20" height="13" fill="currentColor"><rect y="0" width="24" height="2.5" rx="1.2"/><rect y="5.5" width="24" height="2.5" rx="1.2"/><rect y="11" width="24" height="2.5" rx="1.2"/></svg></span>' : ''}
      ${editable && !it.rem ? '<button type="button" class="kebab tx-menu" data-tmenu aria-label="메뉴">⋮</button>' : ''}
    </div>`;
  },
  listHtml(date, opts = {}) {
    const items = this.itemsOn(date);
    const act = items.filter(it => !it.done).sort((a, b) => this.cmp(a, b));
    const dn = items.filter(it => it.done).sort((a, b) => this.cmp(a, b));
    if (!items.length) return { html: '<div class="empty">이 날 할일이 없습니다.</div>', left: 0 };
    return {
      left: act.length,
      html: `<div class="tx-list" data-txlist>${act.map(it => this.rowHtml(it, opts)).join('')}${dn.length ? `<div class="tx-divider">완료</div>${dn.map(it => this.rowHtml(it, opts)).join('')}` : ''}</div>`,
    };
  },
  lateHtml(today, opts = {}) {
    const list = this.lateItems(today);
    return { n: list.length, html: list.length ? `<div class="tx-list">${list.map(it => this.rowHtml(it, Object.assign({}, opts, { late: true }))).join('')}</div>` : '' };
  },

  /* ---------- 클릭 처리 (처리했으면 true) ---------- */
  handleClick(e, opts = {}) {
    const row = e.target.closest('.tx-item');
    if (!row) return false;
    if (row._swiped) { row._swiped = false; return true; }
    const k = row.dataset.k;
    if (e.target.closest('[data-tck]')) { this.toggle(k, opts); return true; }
    if (e.target.closest('[data-tgo]')) { this.goLesson(k); return true; }
    const mn = e.target.closest('[data-tmenu]');
    if (mn) { this.menu(k, mn, opts); return true; }
    if (e.target.closest('[data-tdrag]')) return true;
    this.open(k, opts);
    return true;
  },

  goLesson(k) {
    const it = this.resolve(k); if (!it) return;
    const b = it.rem ? it.base : it;
    if (!b.lesson) return;
    const l = Store.get('lessons', b.rec.lessonId);
    if (!Store.get('classes', b.classId)) return;
    if (typeof MProgress !== 'undefined') { MProgress.classId = b.classId; MProgress.q = ''; MProgress.jump = l ? l.date : ''; }
    App.go('progress', { classId: b.classId, date: l ? l.date : '' });
  },

  putEx(mid, date, patch) {
    const id = this.exId(mid, date);
    const cur = Store.get('todos', id) || { id, rm: mid, date, createdAt: new Date().toISOString() };
    Store.put('todos', Object.assign({}, cur, patch));
  },

  // 완료 체크 (수업일지 할일도 모바일에서 완료 체크는 가능)
  toggle(k) {
    const it = this.resolve(k); if (!it) return;
    if (it.rem) {
      const b = it.base;
      if (b.done) { toast('원래 할일이 이미 완료되었습니다'); return; }
      if (b.repeat) this.putEx(b.master.id, b.date, { remindDone: !it.done });
      else Store.put('todos', Object.assign({}, b.rec, { remindDone: !it.done }));
      App.render();
      return;
    }
    const prog = this.clProg(it.checklist);
    if (!it.done && prog && prog.done < prog.total) { toast('상세에서 체크리스트를 모두 완료하세요'); return; }
    this.setDone(it, !it.done);
    App.render();
  },
  setDone(it, v) {
    if (it.repeat) this.putEx(it.master.id, it.date, { done: v });
    else Store.put('todos', Object.assign({}, it.rec, { done: v, doneAt: v ? new Date().toISOString() : '' }));
  },

  open(k, opts = {}) {
    let it = this.resolve(k); if (!it) return;
    if (it.rem) it = it.base;
    this.editor(it, null, opts);
  },
  add(date, opts = {}) { this.editor(null, isYmd(date) ? date : todayStr(), opts); },

  menu(k, anchor, opts = {}) {
    const it = this.resolve(k);
    if (!it || it.rem) return;
    if (it.repeat) {
      popMenu(anchor, [{ text: '삭제', danger: true, onClick: () => this.delRepeat(it) }]);
      return;
    }
    popMenu(anchor, [
      { text: '1일 뒤', onClick: () => this.moveTo(it, addDaysStr(it.date, 1)) },
      { text: '복사', onClick: async () => { const d = await DatePicker.open(it.date, '할일 복사할 날짜'); if (d) this.copyTo(it, d); } },
      { text: '날짜 선택', onClick: async () => { const d = await DatePicker.open(it.date, '할일 날짜 변경'); if (d && d !== it.date) this.moveTo(it, d); } },
      { text: '삭제', danger: true, onClick: () => { const t = Store.get('todos', it.rec.id); if (!t) return; Store.del('todos', t.id); toast('할일을 삭제했습니다'); App.render(); } },
    ]);
  },
  moveTo(it, d) {
    const t = Store.get('todos', it.rec.id); if (!t) return;
    Store.put('todos', Object.assign({}, t, { date: d, order: this.maxOrder(d) + 1, remindDone: false }));
    toast(`${fmtMD(d)} 할일로 옮겼습니다`);
    App.render();
  },

  // 복사: 고른 날짜에 미완료 · 체크리스트 체크 해제 상태로 새 할일 (수업일지에서 추가한 할일도 일반 할일로)
  copyTo(it, d) {
    const t = Store.get('todos', it.rec.id); if (!t || !isYmd(d)) return;
    const n = Object.assign({}, t, {
      id: uid('TD'), lessonId: '', classId: '', date: d, done: false, doneAt: '', remindDone: false,
      createdAt: new Date().toISOString(), order: this.maxOrder(d) + 1,
      checklist: (Array.isArray(t.checklist) ? t.checklist : []).map(x => ({ t: x.t, d: false })),
    });
    delete n.repeat;
    Store.put('todos', n);
    toast(`${fmtMD(d)} 할일로 복사했습니다`);
    App.render();
  },

  // 반복 일정: 이 날짜만 / 이 날짜 이후 모두 / 전체
  askScope(title, noOne) {
    return new Promise(res => {
      let v = null;
      const btns = [...(noOne ? [] : [['one', '이 날짜만']]), ['after', '이 날짜 이후 모두'], ['all', '전체 반복']];
      Modal.open({
        title, size: 'sm', autofocus: false,
        body: `${noOne ? '<p class="small soft" style="margin:0 0 10px">반복 설정을 바꾸면 이 날짜만 바꿀 수는 없습니다.</p>' : ''}<div class="tx-scope">${btns.map(([k, t]) => `<button type="button" class="btn${k === 'all' ? ' danger' : ''}" data-sc="${k}">${t}</button>`).join('')}</div>`,
        buttons: [{ text: '취소' }],
        onMount: (b, m) => b.addEventListener('click', (e) => { const s = e.target.closest('[data-sc]'); if (s) { v = s.dataset.sc; m.close(); } }),
        onClose() { res(v); },
      });
    });
  },
  async delRepeat(it) {
    const sc = await this.askScope('반복 일정 삭제', false);
    if (!sc) return;
    const m = Store.get('todos', it.master.id); if (!m) return;
    if (sc === 'one') this.putEx(m.id, it.date, { deleted: true });
    else if (sc === 'after' && it.date > m.date) {
      Store.put('todos', Object.assign({}, m, { repeat: Object.assign({}, m.repeat, { endDate: addDaysStr(it.date, -1) }) }));
      Store.delWhere('todos', t => t.rm === m.id && t.date >= it.date);
    } else {
      Store.delWhere('todos', t => t.rm === m.id);
      Store.del('todos', m.id);
    }
    toast(sc === 'one' ? '이 날짜만 삭제했습니다' : sc === 'after' && it.date > m.date ? '이 날짜 이후 반복을 삭제했습니다' : '반복 일정을 삭제했습니다');
    App.render();
  },

  /* ---------- 추가 · 수정 창 ---------- */
  editor(it, date, opts = {}) {
    const isNew = !it;
    const lesson = !!(it && it.lesson);
    const occ = !!(it && it.repeat);
    const st = {
      text: it ? it.text : '',
      importance: it ? it.importance : 0,
      memo: it ? it.memo : '',
      date: it ? (occ ? it.date : it.date) : date,
      remind: it ? it.remind : 0,
      useCl: !!(it && it.checklist.length),
      checklist: JSON.parse(JSON.stringify((it && it.checklist) || [])),
      useTime: !!(it && it.time),
      time: (it && it.time) || '',
      repeat: occ ? JSON.parse(JSON.stringify(it.master.repeat)) : null,
    };
    const rep0 = JSON.stringify(st.repeat);
    const detail0 = !isNew && !!(st.importance || st.memo || st.remind || st.useCl || st.useTime || st.repeat);
    // 시간은 9시~23시만 (예전에 범위 밖 시간으로 저장한 할일은 그 시간도 목록에 넣어 그대로 유지)
    const MI = Array.from({ length: 12 }, (_, i) => i * 5);
    const [th, tm] = (st.time || '18:00').split(':').map(Number);
    const H = Array.from({ length: 15 }, (_, i) => i + 9);
    if (!H.includes(th)) { H.push(th); H.sort((a, b) => a - b); }

    const body = `<div class="tx-form">
      <div class="tx-r1"><input type="text" data-f="text" value="${esc(st.text)}" placeholder="할일을 입력하세요..." autocomplete="off" maxlength="300">
        <label class="chk tx-dtg"><input type="checkbox" data-detail ${detail0 ? 'checked' : ''}>상세</label></div>
      <div class="tx-detail" ${detail0 ? '' : 'hidden'}>
        <div class="tx-r"><span class="tx-lb">중요도</span><div class="tx-imps">${TX_IMP.map((t, i) => `<button type="button" class="tx-impb imp-${i}${st.importance === i ? ' on' : ''}" data-imp="${i}">${t}</button>`).join('')}</div></div>
        <div class="tx-r top"><span class="tx-lb">메모</span><div style="flex:1;min-width:0"><textarea data-f="memo" rows="3" placeholder="메모 (선택사항)">${esc(st.memo)}</textarea></div></div>
        <div class="tx-r"><span class="tx-lb">날짜</span>${occ ? `<span>${esc(fmtDate(it.date))} <span class="small muted">반복 회차</span></span>` : `<input type="date" data-f="date" value="${esc(st.date)}">`}</div>
        <div class="tx-r"><span class="tx-lb">상기</span><input type="number" data-f="remind" min="0" max="30" value="${st.remind}" class="tx-num"><span class="small soft">일 전</span>
          ${lesson ? '' : `<button type="button" class="btn sm tx-repb${st.repeat ? ' on' : ''}" data-rep>🔁 <span data-replb>${esc(this.repLabel(st.repeat) || '반복')}</span></button>`}</div>
        <div class="tx-r"><span class="tx-lb">추가</span><label class="chk"><input type="checkbox" data-cltg ${st.useCl ? 'checked' : ''}>체크리스트</label><label class="chk"><input type="checkbox" data-timetg ${st.useTime ? 'checked' : ''}>시간</label></div>
        <div class="tx-timebox" ${st.useTime ? '' : 'hidden'}><select data-th>${H.map(h => `<option value="${h}" ${h === th ? 'selected' : ''}>${h}</option>`).join('')}</select>시
          <select data-tm>${MI.map(x => `<option value="${x}" ${x === (tm - tm % 5) ? 'selected' : ''}>${pad(x)}</option>`).join('')}</select>분</div>
        <div class="tx-clbox" ${st.useCl ? '' : 'hidden'}><div data-cllist></div>
          <div class="tx-cladd"><input type="text" data-cladd placeholder="항목 추가" autocomplete="off"><button type="button" class="btn sm" data-claddb>＋</button></div></div>
        ${lesson ? `<p class="small muted" style="margin:8px 0 0">수업일지 할일입니다 · ${esc((Store.get('classes', it.classId) || {}).name || '')} (반복은 개별 할일에만 쓸 수 있습니다)</p>` : ''}
      </div></div>`;

    const clHtml = () => st.checklist.map((x, i) => `<div class="tx-cli"><input type="checkbox" data-cld="${i}" ${x.d ? 'checked' : ''}><input type="text" data-clt="${i}" value="${esc(x.t)}"><button type="button" class="icon-btn" data-cldel="${i}" aria-label="빼기">✕</button></div>`).join('');

    Modal.open({
      title: isNew ? '할일 추가' : (occ ? '반복 할일' : '할일 수정'), size: 'md', autofocus: isNew && !opts.mobile,
      body,
      onMount: (b) => {
        const title = $('[data-f=text]', b);
        enhanceTextarea($('[data-f=memo]', b));      // 자동 번호(1. ) · 글머리(* ) · 링크 표시 — util.js의 기존 기능 그대로
        const clList = $('[data-cllist]', b);
        const drawCl = () => { clList.innerHTML = clHtml(); };
        drawCl();
        title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('[data-primary]', b.parentElement).click(); } });
        b.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-f=text]')) st.text = t.value;
          else if (t.matches('[data-f=memo]')) st.memo = t.value;
          else if (t.matches('[data-f=remind]')) st.remind = t.value;
          else if (t.matches('[data-clt]')) st.checklist[+t.dataset.clt].t = t.value;
        });
        b.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-detail]')) $('.tx-detail', b).hidden = !t.checked;
          else if (t.matches('[data-f=date]')) st.date = t.value;
          else if (t.matches('[data-cltg]')) { st.useCl = t.checked; $('.tx-clbox', b).hidden = !t.checked; }
          else if (t.matches('[data-timetg]')) { st.useTime = t.checked; $('.tx-timebox', b).hidden = !t.checked; }
          else if (t.matches('[data-cld]')) st.checklist[+t.dataset.cld].d = t.checked;
        });
        const addCl = () => {
          const inp = $('[data-cladd]', b), v = inp.value.trim();
          if (!v) return;
          st.checklist.push({ t: v, d: false }); inp.value = ''; drawCl(); inp.focus();
        };
        $('[data-cladd]', b).addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addCl(); } });
        b.addEventListener('click', async (e) => {
          const ib = e.target.closest('[data-imp]');
          if (ib) { st.importance = +ib.dataset.imp; $$('[data-imp]', b).forEach(x => x.classList.toggle('on', x === ib)); return; }
          const dl = e.target.closest('[data-cldel]'); if (dl) { st.checklist.splice(+dl.dataset.cldel, 1); drawCl(); return; }
          if (e.target.closest('[data-claddb]')) { addCl(); return; }
          if (e.target.closest('[data-rep]')) {
            const baseDate = occ ? it.master.date : (isYmd(st.date) ? st.date : todayStr());
            const r = await this.repeatDlg(st.repeat, baseDate, title);
            if (r === undefined) return;
            st.text = title.value;
            st.repeat = r;
            $('[data-replb]', b).textContent = this.repLabel(r) || '반복';
            $('[data-rep]', b).classList.toggle('on', !!r);
          }
        });
      },
      buttons: [
        ...(!isNew ? [{ text: '삭제', cls: 'danger', left: true, onClick: async () => {
          if (occ) { await this.delRepeat(it); return; }
          const t = Store.get('todos', it.rec.id); if (!t) return;
          if (!await confirmDlg('이 할일을 삭제할까요?', '삭제', true)) return false;
          Store.del('todos', t.id); toast('할일을 삭제했습니다'); App.render();
        } }] : []),
        { text: '취소' },
        { text: '저장', cls: 'primary', primary: true, onClick: (m) => {
          st.time = `${pad(+$('[data-th]', m.body).value)}:${pad(+$('[data-tm]', m.body).value)}`;
          return this.save(it, st, rep0);
        } },
      ],
    });
  },

  async save(it, st, rep0) {
    const text = String(st.text || '').trim();
    if (!text) { toast('할일을 입력하세요'); return false; }
    const cl = st.useCl ? st.checklist.map(x => ({ t: String(x.t || '').trim(), d: !!x.d })).filter(x => x.t) : [];
    const vals = {
      text, importance: +st.importance || 0, memo: stripZws(st.memo || '').trim(),
      time: st.useTime ? st.time : '', remind: Math.max(0, Math.min(30, Math.round(+st.remind || 0))), checklist: cl,
    };
    const clDone = cl.length ? cl.every(x => x.d) : null;          // null = 체크리스트 없음
    const tpl = cl.map(x => ({ t: x.t, d: false }));               // 반복 원본에는 체크 안 한 목록만
    const rep = st.repeat && st.repeat.type !== 'none' ? st.repeat : null;
    const now = new Date().toISOString();

    // 새 할일
    if (!it) {
      if (!isYmd(st.date)) { toast('날짜를 선택하세요'); return false; }
      const rec = Object.assign({ id: uid('TD'), lessonId: '', classId: '', date: st.date, done: false, createdAt: now, order: this.maxOrder(st.date) + 1 }, vals);
      if (rep) { rec.repeat = rep; rec.checklist = tpl; }
      else if (clDone !== null) rec.done = clDone;
      Store.put('todos', rec);
      if (rep && cl.some(x => x.d)) this.putEx(rec.id, rec.date, { ov: { checklist: cl }, done: !!clDone });
      toast('할일을 추가했습니다');
      App.render();
      return;
    }

    // 한 번짜리 할일 (수업일지 할일 포함)
    if (!it.repeat) {
      const cur = Store.get('todos', it.rec.id); if (!cur) return;
      if (!isYmd(st.date)) { toast('날짜를 선택하세요'); return false; }
      const rec = Object.assign({}, cur, vals);
      if (st.date !== cur.date) { rec.date = st.date; rec.order = this.maxOrder(st.date) + 1; rec.remindDone = false; }
      if (vals.remind !== (+cur.remind || 0)) rec.remindDone = false;
      if (clDone !== null) rec.done = clDone;
      if (rep && !cur.lessonId) {                                   // 반복으로 바꿈 → 이 날짜부터 반복 시작
        rec.repeat = rep; rec.checklist = tpl; rec.done = false; rec.remindDone = false;
        Store.put('todos', rec);
        if (cl.some(x => x.d) || cur.done) this.putEx(rec.id, rec.date, { ov: cl.some(x => x.d) ? { checklist: cl } : undefined, done: clDone !== null ? clDone : !!cur.done });
      } else Store.put('todos', rec);
      toast('저장했습니다');
      App.render();
      return;
    }

    // 반복 회차
    const m = Store.get('todos', it.master.id); if (!m) return;
    const changed = JSON.stringify(st.repeat && st.repeat.type !== 'none' ? st.repeat : null) !== rep0;
    // 체크리스트의 체크 상태만 바뀐 경우 = 그 회차를 한 것 → 선택 창 없이 이 날짜에만 저장
    const clText = (a) => JSON.stringify((a || []).map(x => String(x.t || '').trim()));
    const onlyChecks = !changed && cl.length > 0 && vals.text === it.text && vals.importance === it.importance
      && vals.memo === (it.memo || '') && vals.time === (it.time || '') && vals.remind === (+it.remind || 0)
      && clText(cl) === clText(it.checklist);
    if (onlyChecks) {
      const ex0 = Store.get('todos', this.exId(m.id, it.date));
      this.putEx(m.id, it.date, { ov: Object.assign({}, (ex0 && ex0.ov) || {}, { checklist: cl }), done: !!clDone });
      toast('저장했습니다');
      App.render();
      return;
    }
    const sc = await this.askScope('반복 할일 저장', changed);
    if (!sc) return false;
    const exNow = Store.get('todos', this.exId(m.id, it.date));
    const doneNow = clDone !== null ? clDone : !!(exNow && exNow.done);
    if (sc === 'one') {
      this.putEx(m.id, it.date, { ov: Object.assign({}, vals), done: doneNow });
    } else if (sc === 'all' || it.date <= m.date) {
      if (!rep) {                                                   // 반복 해제 → 이 날짜의 한 번짜리 할일
        Store.delWhere('todos', t => t.rm === m.id);
        const n = Object.assign({}, m, vals, { date: it.date, done: doneNow, remindDone: false, order: this.maxOrder(it.date) + 1 });
        delete n.repeat;
        Store.put('todos', n);
      } else {
        Store.put('todos', Object.assign({}, m, vals, { checklist: tpl, repeat: rep }));
        // '이 날짜만' 고쳐 둔 내용은 지우고 새 내용을 따르게 함 (완료·삭제 표시는 유지)
        Store.where('todos', t => t.rm === m.id && t.ov).forEach(t => { const n = Object.assign({}, t); delete n.ov; Store.put('todos', n); });
        if (cl.some(x => x.d)) this.putEx(m.id, it.date, { ov: { checklist: cl }, done: doneNow });
        else if (clDone !== null || exNow) this.putEx(m.id, it.date, { done: doneNow });
      }
    } else {                                                        // 이 날짜 이후 모두 → 원본은 전날까지, 새 원본 시작
      Store.put('todos', Object.assign({}, m, { repeat: Object.assign({}, m.repeat, { endDate: addDaysStr(it.date, -1) }) }));
      Store.delWhere('todos', t => t.rm === m.id && t.date >= it.date);
      if (!rep) {
        Store.put('todos', Object.assign({ id: uid('TD'), lessonId: '', classId: '', date: it.date, createdAt: now, order: this.maxOrder(it.date) + 1 }, vals, { done: doneNow }));
      } else {
        const nm = Object.assign({ id: uid('TD'), lessonId: '', classId: '', date: it.date, done: false, createdAt: m.createdAt || now, order: m.order }, vals, { checklist: tpl, repeat: rep });
        Store.put('todos', nm);
        if (cl.some(x => x.d) || doneNow) this.putEx(nm.id, it.date, Object.assign({ done: doneNow }, cl.some(x => x.d) ? { ov: { checklist: cl } } : {}));
      }
    }
    toast('저장했습니다');
    App.render();
  },

  /* ---------- 반복 설정 창 ---------- */
  // 돌려주는 값: 설정 객체 / null(반복 없음) / undefined(취소)
  repeatDlg(cur, baseDate, titleInput) {
    const d = parseYmd(baseDate);
    const c = Object.assign({
      type: 'none', weekdays: [d.getDay()], monthMode: 'day', monthDay: d.getDate(), monthWeek: Math.min(5, Math.ceil(d.getDate() / 7)),
      monthWeekday: d.getDay(), yearlyMonth: d.getMonth() + 1, yearlyDay: d.getDate(), birthday: false, customUnit: 'day', customInterval: 2, endDate: '',
    }, cur ? JSON.parse(JSON.stringify(cur)) : {});
    const unitLb = { day: '일마다', week: '주마다', month: '개월마다', year: '년마다' };
    return new Promise(res => {
      let out;
      const body = `<div class="tx-repf">
        <div class="tx-seg" data-g="type">${TX_RTYPES.map(([k, t]) => `<button type="button" data-v="${k}" class="${c.type === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="tx-rw" data-w="weekly"><div class="tx-days">${DAY_ORDER.map(i => `<button type="button" data-wd="${i}" class="${c.weekdays.includes(i) ? 'on' : ''}">${DOW[i]}</button>`).join('')}</div></div>
        <div class="tx-rw" data-w="monthly">
          <div class="tx-seg sm" data-g="mmode"><button type="button" data-v="day" class="${c.monthMode === 'day' ? 'on' : ''}">N일</button><button type="button" data-v="week" class="${c.monthMode === 'week' ? 'on' : ''}">X째주 Y요일</button></div>
          <div class="tx-ro" data-mm="day">매월 <input type="number" class="tx-num" data-r="monthDay" min="1" max="31" value="${c.monthDay}"> 일</div>
          <div class="tx-ro" data-mm="week"><select data-r="monthWeek">${['첫째', '둘째', '셋째', '넷째', '마지막'].map((t, i) => `<option value="${i + 1}" ${+c.monthWeek === i + 1 ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <select data-r="monthWeekday">${DOW.map((t, i) => `<option value="${i}" ${+c.monthWeekday === i ? 'selected' : ''}>${t}요일</option>`).join('')}</select></div></div>
        <div class="tx-rw" data-w="yearly"><div class="tx-ro">매년 <select data-r="yearlyMonth">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${+c.yearlyMonth === i + 1 ? 'selected' : ''}>${i + 1}월</option>`).join('')}</select>
          <input type="number" class="tx-num" data-r="yearlyDay" min="1" max="31" value="${c.yearlyDay}"> 일</div>
          <label class="chk"><input type="checkbox" data-r="birthday" ${c.birthday ? 'checked' : ''}>생일 (제목 앞에 ${TX_BDAY})</label></div>
        <div class="tx-rw" data-w="custom">
          <div class="tx-seg sm" data-g="unit">${['day', 'week', 'month', 'year'].map(u => `<button type="button" data-v="${u}" class="${c.customUnit === u ? 'on' : ''}">${{ day: '일', week: '주', month: '개월', year: '년' }[u]}</button>`).join('')}</div>
          <div class="tx-ro">매 <input type="number" class="tx-num" data-r="customInterval" min="2" max="999" value="${c.customInterval}"> <span data-unitlb>${unitLb[c.customUnit]}</span></div></div>
        <div class="tx-rw tx-end" data-w="end"><label class="chk"><input type="checkbox" data-endtg ${isYmd(c.endDate) ? 'checked' : ''}>종료일 설정</label>
          <input type="date" data-r="endDate" value="${esc(c.endDate || '')}" ${isYmd(c.endDate) ? '' : 'hidden'}></div>
      </div>`;
      Modal.open({
        title: '반복 설정', size: 'sm', autofocus: false, body,
        onMount: (b) => {
          const show = () => {
            $$('[data-w]', b).forEach(w => { w.hidden = w.dataset.w === 'end' ? c.type === 'none' : w.dataset.w !== c.type; });
            $$('[data-mm]', b).forEach(w => { w.hidden = w.dataset.mm !== c.monthMode; });
          };
          show();
          b.addEventListener('click', (e) => {
            const sb = e.target.closest('[data-g] [data-v]');
            if (sb) {
              const g = sb.closest('[data-g]').dataset.g;
              $$('[data-v]', sb.parentElement).forEach(x => x.classList.toggle('on', x === sb));
              if (g === 'type') c.type = sb.dataset.v;
              else if (g === 'mmode') c.monthMode = sb.dataset.v;
              else if (g === 'unit') { c.customUnit = sb.dataset.v; $('[data-unitlb]', b).textContent = unitLb[c.customUnit]; }
              show(); return;
            }
            const wd = e.target.closest('[data-wd]');
            if (wd) { wd.classList.toggle('on'); c.weekdays = $$('[data-wd].on', b).map(x => +x.dataset.wd); }
          });
          b.addEventListener('change', (e) => {
            if (e.target.matches('[data-endtg]')) { const i = $('[data-r=endDate]', b); i.hidden = !e.target.checked; if (!e.target.checked) i.value = ''; }
          });
        },
        buttons: [
          { text: '취소' },
          { text: '확인', cls: 'primary', primary: true, onClick: (m) => {
            const b = m.body, g = (n) => $(`[data-r=${n}]`, b);
            if (c.type === 'none') { out = null; return; }
            if (c.type === 'weekly' && !c.weekdays.length) { toast('요일을 하나 이상 고르세요'); return false; }
            if (c.type === 'monthly') {
              if (c.monthMode === 'day') { const v = +g('monthDay').value; if (!(v >= 1 && v <= 31)) { toast('날짜를 입력하세요 (1~31)'); return false; } c.monthDay = v; }
              else { c.monthWeek = +g('monthWeek').value; c.monthWeekday = +g('monthWeekday').value; }
            }
            if (c.type === 'yearly') {
              const v = +g('yearlyDay').value; if (!(v >= 1 && v <= 31)) { toast('날짜를 입력하세요 (1~31)'); return false; }
              c.yearlyMonth = +g('yearlyMonth').value; c.yearlyDay = v; c.birthday = g('birthday').checked;
              // 생일: 제목 앞에 🎂 (해제하면 뺌)
              const tv = (titleInput.value || '').trim();
              if (c.birthday && !tv.startsWith(TX_BDAY)) titleInput.value = `${TX_BDAY} ${tv}`;
              if (!c.birthday && tv.startsWith(TX_BDAY)) titleInput.value = tv.slice(TX_BDAY.length).trimStart();
            } else c.birthday = false;
            if (c.type === 'custom') { const n = Math.round(+g('customInterval').value); if (!(n >= 2)) { toast('간격은 2 이상입니다'); return false; } c.customInterval = n; }
            c.endDate = $('[data-endtg]', b).checked && isYmd(g('endDate').value) ? g('endDate').value : '';
            if (c.endDate && c.endDate < baseDate) { toast('종료일이 시작일보다 빠릅니다'); return false; }
            // 쓰지 않는 값은 정리
            const o = { type: c.type, endDate: c.endDate };
            if (c.type === 'weekly') o.weekdays = c.weekdays.slice().sort();
            if (c.type === 'monthly') Object.assign(o, { monthMode: c.monthMode, monthDay: c.monthDay, monthWeek: c.monthWeek, monthWeekday: c.monthWeekday });
            if (c.type === 'yearly') Object.assign(o, { yearlyMonth: c.yearlyMonth, yearlyDay: c.yearlyDay, birthday: c.birthday });
            if (c.type === 'custom') Object.assign(o, { customUnit: c.customUnit, customInterval: c.customInterval });
            out = o;
          } },
        ],
        onClose() { res(out); },
      });
    });
  },

  /* ---------- 끌어서 순서 바꾸기 (마우스·터치 공용, 같은 중요도끼리) ---------- */
  mount(root, opts = {}) {
    $$('.tx-list[data-txlist]', root).forEach(list => this.mountDrag(list));
    if (opts.mobile) $$('.tx-item', root).forEach(el => this.mountSwipe(el, opts));
  },
  mountDrag(list) {
    $$('[data-tdrag]', list).forEach(h => h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const row = h.closest('.tx-item'), imp = row.dataset.dr;
      const rows = () => $$(`.tx-item[data-dr="${imp}"]`, list);
      let over = null, after = false;
      row.classList.add('dragging');
      try { h.setPointerCapture(e.pointerId); } catch (_) {}
      const clear = () => rows().forEach(r => r.classList.remove('drop-before', 'drop-after'));
      const mv = (ev) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const r = el && el.closest(`.tx-item[data-dr="${imp}"]`);
        clear(); over = null;
        if (!r || r === row || !list.contains(r)) return;
        const rc = r.getBoundingClientRect();
        after = ev.clientY > rc.top + rc.height / 2;
        r.classList.add(after ? 'drop-after' : 'drop-before');
        over = r;
      };
      const up = () => {
        h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
        row.classList.remove('dragging'); clear();
        if (!over) return;
        const keys = rows().map(r => r.dataset.k).filter(k => k !== row.dataset.k);
        let i = keys.indexOf(over.dataset.k); if (after) i++;
        keys.splice(i, 0, row.dataset.k);
        // 같은 중요도 안에서 앞자리 순서 값을 그대로 다시 나눠 준다
        const recs = keys.map(k => Store.get('todos', k.slice(2))).filter(Boolean);
        const slots = recs.map(t => (t.order == null ? null : +t.order)).filter(v => v != null).sort((a, b) => a - b);
        let base = slots.length ? slots[0] : 0;
        recs.forEach((t, k) => { const v = base + k; if (t.order !== v) Store.put('todos', Object.assign({}, t, { order: v })); });
        App.render();
      };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    }));
  },

  /* ---------- 모바일: 오른쪽으로 밀면 완료, 왼쪽으로 밀면 메뉴 ---------- */
  mountSwipe(el, opts) {
    let x0 = null, y0 = 0, horiz = null, dx = 0;
    const reset = () => { el.style.transition = 'transform .2s ease, background .2s ease'; el.style.transform = ''; el.style.background = ''; setTimeout(() => { el.style.transition = ''; }, 220); };
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || e.target.closest('[data-tdrag]')) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; horiz = null; dx = 0;
      el.style.transition = 'none';
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
      if (horiz === null) { if (Math.abs(mx) > 8 || Math.abs(my) > 8) horiz = Math.abs(mx) > Math.abs(my); return; }
      if (!horiz) return;
      dx = mx;
      el.style.transform = `translateX(${Math.max(-110, Math.min(110, dx))}px)`;
      el.style.background = dx > 20 ? `rgba(42,148,104,${Math.min(dx / 120, 0.25)})` : dx < -20 ? `rgba(210,72,79,${Math.min(-dx / 120, 0.2)})` : '';
    }, { passive: true });
    el.addEventListener('touchend', () => {
      if (x0 == null || !horiz) { x0 = null; reset(); return; }
      x0 = null;
      el._swiped = true;
      setTimeout(() => { el._swiped = false; }, 400);
      const k = el.dataset.k;
      if (dx > 60 && !el.classList.contains('done')) {
        el.style.transition = 'transform .22s ease, opacity .22s ease';
        el.style.transform = 'translateX(110%)'; el.style.opacity = '0';
        setTimeout(() => { el.style.opacity = ''; reset(); this.toggle(k); }, 220);
        return;
      }
      reset();
      if (dx < -60) this.menu(k, el, opts);
    }, { passive: true });
    el.addEventListener('touchcancel', () => { x0 = null; reset(); }, { passive: true });
  },
};
