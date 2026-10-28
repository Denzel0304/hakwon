/* =========================================================
   store.js — 데이터 저장소 + Supabase RPC 동기화
   - 화면은 메모리(Store.data)로 즉시 그림
   - 변경은 저장 대기(pending)에 쌓았다가 서버로 전송
   - 서버에서는 "마지막 동기화 이후 바뀐 것"만 받아옴
   - 로컬 캐시는 IndexedDB(mg77_db)에 보관
   ========================================================= */

/* ---------- IndexedDB ---------- */
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const rq = indexedDB.open(CFG.IDB_NAME, 1);
      rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(CFG.IDB_STORE)) rq.result.createObjectStore(CFG.IDB_STORE); };
      rq.onsuccess = () => { this.db = rq.result; res(this.db); };
      rq.onerror = () => rej(rq.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const rq = db.transaction(CFG.IDB_STORE, 'readonly').objectStore(CFG.IDB_STORE).get(k);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction(CFG.IDB_STORE, 'readwrite');
      tx.objectStore(CFG.IDB_STORE).put(v, k);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  destroy() {
    if (this.db) { this.db.close(); this.db = null; }
    return new Promise(res => {
      const rq = indexedDB.deleteDatabase(CFG.IDB_NAME);
      rq.onsuccess = rq.onerror = rq.onblocked = () => res();
    });
  },
};

/* ---------- 인증 ---------- */
const Auth = {
  fails: 0,
  key() { return localStorage.getItem(CFG.LS_AK); },
  setKey(k) { localStorage.setItem(CFG.LS_AK, k); },
  fail() {
    this.fails++;
    App.setSync(`⚠ 인증 오류 (${this.fails}/${CFG.AUTH_FAIL_MAX})`);
    if (this.fails >= CFG.AUTH_FAIL_MAX) App.logout(true);
  },
  ok() { this.fails = 0; },
};

function isUnauthorized(r) {
  return !r.ok && (r.status === 401 || r.status === 403 || (r.text || '').includes('unauthorized'));
}

/* ---------- 저장소 ---------- */
const Store = {
  data: {},          // { 테이블: { id: 레코드 } }
  pending: {},       // { 테이블: { id: { d, x, v } } }  x=삭제, v=변경 번호
  seq: 0,
  since: null,       // 서버 기준 마지막 동기화 시각
  changed: null,     // 서버 마지막 변경 시각 (변경 확인용)
  lastSyncAt: 0,
  pulling: false,
  flushing: false,
  firstPullDone: false,
  _persistT: null,
  _flushT: null,

  reset() {
    this.data = {};
    CFG.TABLES.forEach(t => { this.data[t] = {}; });
    this.pending = {};
    this.seq = 0;
    this.since = null;
    this.changed = null;
    this.lastSyncAt = 0;
    this.firstPullDone = false;
  },

  /* ── 조회 ── */
  get(t, id) { return (this.data[t] && this.data[t][id]) || null; },
  all(t) { return Object.values(this.data[t] || {}); },
  where(t, fn) { return this.all(t).filter(fn); },

  /* ── 변경 ── */
  put(t, rec) {
    if (!rec || !rec.id) throw new Error('id 없음');
    const r = JSON.parse(JSON.stringify(rec));
    this.data[t][r.id] = r;
    const d = Object.assign({}, r); delete d.id;
    (this.pending[t] = this.pending[t] || {})[r.id] = { d, x: false, v: ++this.seq };
    this._touched();
    return r;
  },
  del(t, id) {
    const old = this.data[t][id];
    if (!old) return;
    delete this.data[t][id];
    const d = Object.assign({}, old); delete d.id;
    (this.pending[t] = this.pending[t] || {})[id] = { d, x: true, v: ++this.seq };
    this._touched();
  },
  delWhere(t, fn) { this.where(t, fn).forEach(r => this.del(t, r.id)); },
  pendingCount() { return Object.values(this.pending).reduce((n, o) => n + Object.keys(o).length, 0); },

  _touched() {
    this.schedulePersist();
    clearTimeout(this._flushT);
    this._flushT = setTimeout(() => this.syncNow(), 1500);
    App.updateSyncBar();
  },

  /* ── 로컬 캐시 ── */
  schedulePersist() {
    clearTimeout(this._persistT);
    this._persistT = setTimeout(() => this.persist(), 400);
  },
  async persist() {
    if (!Auth.key()) return;
    try {
      await IDB.set('cache', { since: this.since, changed: this.changed, data: this.data });
      await IDB.set('pending', { pending: this.pending, seq: this.seq });
    } catch (e) { console.warn('[mg77] 캐시 저장 실패', e); }
  },
  async loadCache() {
    this.reset();
    try {
      const c = await IDB.get('cache');
      if (c && c.data) {
        CFG.TABLES.forEach(t => { this.data[t] = c.data[t] || {}; });
        this.since = c.since || null;
        this.changed = c.changed || null;
      }
      const p = await IDB.get('pending');
      if (p && p.pending) { this.pending = p.pending; this.seq = p.seq || 0; }
    } catch (e) { console.warn('[mg77] 캐시 읽기 실패', e); }
  },

  /* ── 서버 통신 ── */
  async rpc(fn, args) {
    const r = await fetch(`${CFG.SB_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'apikey': CFG.SB_ANON,
        'Authorization': 'Bearer ' + CFG.SB_ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: r.ok, status: r.status, text, json };
  },

  // 저장 대기 중인 변경을 서버로 보낸다.
  async flush() {
    const key = Auth.key();
    if (!key || this.flushing) return true;
    if (this.pendingCount() === 0) return true;
    this.flushing = true;
    App.setSync('↑ 저장 중...');
    let ok = true;
    try {
      for (const t of Object.keys(this.pending)) {
        const ids = Object.keys(this.pending[t]);
        for (let i = 0; i < ids.length; i += 200) {
          const sent = ids.slice(i, i + 200).filter(id => this.pending[t][id]).map(id => Object.assign({ id }, this.pending[t][id]));
          if (!sent.length) continue;
          const rows = sent.map(s => ({ id: s.id, d: s.d, x: s.x }));
          let r;
          try { r = await this.rpc('mg77_save', { p_key: key, p_table: t, p_rows: rows }); }
          catch (e) { ok = false; break; }
          if (!r.ok) { if (isUnauthorized(r)) Auth.fail(); ok = false; break; }
          Auth.ok();
          const res = r.json || {};
          if (!res.ok) toast('일부 데이터를 저장하지 못했습니다 (' + (res.reason || '알 수 없음') + ')');
          else if (res.bad > 0) toast(res.bad + '건의 데이터가 형식 오류로 저장되지 않았습니다');
          // 보내는 동안 같은 항목을 다시 고쳤다면 대기 목록에 남겨 둔다
          sent.forEach(s => { const p = this.pending[t][s.id]; if (p && p.v === s.v) delete this.pending[t][s.id]; });
        }
        if (this.pending[t] && Object.keys(this.pending[t]).length === 0) delete this.pending[t];
        if (!ok) break;
      }
    } finally {
      this.flushing = false;
      this.schedulePersist();
    }
    if (!ok) App.setSync(`⚠ 저장 대기 ${this.pendingCount()}개`);
    else App.updateSyncBar();
    return ok;
  },

  // 서버의 변경분을 받아온다. full=true면 전체를 다시 받는다.
  async pull(full = false) {
    const key = Auth.key();
    if (!key || this.pulling) return false;
    this.pulling = true;
    App.setSync('↓ 불러오는 중...');
    try {
      const whole = full || !this.since;
      // 경계 누락 방지를 위해 10초 겹쳐서 조회 (같은 내용은 무시)
      const since = whole ? null : new Date(new Date(this.since).getTime() - 10000).toISOString();
      const r = await this.rpc('mg77_pull', { p_key: key, p_since: since });
      if (!r.ok) {
        if (isUnauthorized(r)) Auth.fail();
        else App.setSync('⚠ 불러오기 실패');
        return false;
      }
      Auth.ok();
      const res = r.json || {};
      const tables = res.tables || {};
      let changed = 0;
      if (whole) {
        const next = {};
        CFG.TABLES.forEach(t => {
          next[t] = {};
          (tables[t] || []).forEach(row => { if (!row.x) next[t][row.id] = Object.assign({ id: row.id }, row.d); });
        });
        // 아직 보내지 못한 로컬 변경은 그 위에 덮는다
        Object.keys(this.pending).forEach(t => {
          if (!next[t]) return;
          Object.keys(this.pending[t]).forEach(id => {
            const p = this.pending[t][id];
            if (p.x) delete next[t][id];
            else next[t][id] = Object.assign({ id }, p.d);
          });
        });
        this.data = next;
        changed = 1;
      } else {
        CFG.TABLES.forEach(t => {
          (tables[t] || []).forEach(row => {
            if (this.pending[t] && this.pending[t][row.id]) return;
            const cur = this.data[t][row.id];
            if (row.x) {
              if (cur) { delete this.data[t][row.id]; changed++; }
              return;
            }
            const nr = Object.assign({ id: row.id }, row.d);
            if (!cur || stableStr(cur) !== stableStr(nr)) { this.data[t][row.id] = nr; changed++; }
          });
        });
      }
      this.since = res.now || this.since;
      this.changed = res.c || this.changed;
      this.lastSyncAt = Date.now();
      this.schedulePersist();
      App.updateSyncBar();
      if (changed) App.onRemoteChange();
      if (!this.firstPullDone) { this.firstPullDone = true; App.afterFirstPull(); }
      return true;
    } catch (e) {
      App.setSync('⚠ 네트워크 오류');
      return false;
    } finally {
      this.pulling = false;
    }
  },

  async syncNow(full = false) {
    clearTimeout(this._flushT);
    await this.flush();
    await this.pull(full);
  },

  // 서버의 마지막 변경 시각만 확인하고, 바뀌었으면 받아온다.
  async checkRemote() {
    const key = Auth.key();
    if (!key || this.pulling || this.flushing) return;
    try {
      if (this.pendingCount()) { await this.syncNow(); return; }
      const r = await this.rpc('mg77_stamp', { p_key: key });
      if (!r.ok) { if (isUnauthorized(r)) Auth.fail(); return; }
      Auth.ok();
      const c = r.json && r.json.c;
      if (c && c !== this.changed) await this.pull();
    } catch (_) {}
  },
};
Store.reset();
