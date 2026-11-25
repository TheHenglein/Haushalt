/* Haushalt – Datenbasis aus zwei Dateien
 *
 * 1. Gemeinsame Datei „haushalt.json“ – im Drive der Person, die den Haushalt angelegt hat, für die anderen freigegeben.
 *    Enthält alles, was alle sehen: gemeinsame und sichtbare eigene Konten, deren Buchungen, Kategorien, Einstellungen.
 * 2. Private Datei „haushalt-privat-<id>.json“ – im eigenen Drive jeder Person, NICHT freigegeben.
 *    Enthält versteckte eigene Konten und Buchungen, die nur diese Konten betreffen.
 *    In der gemeinsamen Datei steht für ein verstecktes Konto nur ein Platzhalter (id, Buch, Inhaber) – ohne Name und Stand.
 *
 * `db` ist die Ansicht aus beiden Dateien; die App liest nur aus `db`. Geändert wird nur über Store.put / Store.del,
 * die entscheiden, in welche Datei ein Eintrag gehört.
 *
 * Mehrere Personen gleichzeitig: jeder Eintrag hat id + Zeitstempel `upd` (+ `von`); Löschungen hinterlassen einen
 * Grabstein in `tomb`. Vor dem Schreiben wird die Datei gelesen und pro Eintrag zusammengeführt.
 */
"use strict";

const SCHEMA = 2;
const SINGLES = ["haushalt", "settings"];          // einzelne Objekte, neuester gewinnt
const COLLS = ["mitglieder"];                      // Listen in der gemeinsamen Datei; Module melden ihre an
const PRIV_COLLS = ["konten", "buchungen"];        // Listen, die auch privat liegen können
const MODULE_INITS = [];
function registerData(colls, init) { colls.forEach((c) => COLLS.includes(c) || COLLS.push(c)); if (init) MODULE_INITS.push(init); }

const Data = { shared: null, mine: null };
let db = null;   // Ansicht

function emptyDB(name = "Unser Haushalt") {
  const d = { schema: SCHEMA, app: "haushalt", updated: new Date().toISOString(), saveId: uid(),
    haushalt: { name, created: new Date().toISOString(), upd: "" }, settings: { upd: "" }, tomb: {} };
  COLLS.forEach((c) => (d[c] = []));
  MODULE_INITS.forEach((fn) => fn(d));
  return d;
}
function migrate(d) {
  if (!d || typeof d !== "object" || d.app !== "haushalt") return null;
  const base = emptyDB(d.haushalt?.name);
  d.haushalt = Object.assign({}, base.haushalt, d.haushalt || {});
  d.settings = d.settings && typeof d.settings === "object" ? d.settings : base.settings;
  d.tomb = d.tomb && typeof d.tomb === "object" ? d.tomb : {};
  COLLS.forEach((c) => { if (!Array.isArray(d[c])) d[c] = base[c]; });
  MODULE_INITS.forEach((fn) => fn(d, true));
  d.schema = SCHEMA;
  return d;
}
function emptyMine(hid = "") { return { schema: SCHEMA, app: "haushalt-privat", haushaltId: hid, updated: new Date().toISOString(), tomb: {}, konten: [], buchungen: [] }; }
function migrateMine(d) {
  if (!d || typeof d !== "object" || d.app !== "haushalt-privat") return null;
  d.tomb = d.tomb && typeof d.tomb === "object" ? d.tomb : {};
  PRIV_COLLS.forEach((c) => { if (!Array.isArray(d[c])) d[c] = []; });
  return d;
}
/* Ansicht neu bilden: Platzhalter durch die eigenen vollständigen Konten ersetzen, private Buchungen dazunehmen */
function rebuild() {
  const s = Data.shared; if (!s) { db = null; return; }
  const m = Data.mine || (Data.mine = emptyMine());
  const full = new Map(m.konten.map((k) => [k.id, k]));
  const ids = new Set(s.konten.map((k) => k.id));
  const dupe = new Set(s.buchungen.map((x) => x.id));
  db = Object.assign({}, s, {
    konten: s.konten.map((k) => full.get(k.id) || k).concat(m.konten.filter((k) => !ids.has(k.id))),
    buchungen: s.buchungen.concat(m.buchungen.filter((x) => !dupe.has(x.id)))
  });
}
function setShared(d, mine = null) { Data.shared = d; Data.mine = mine || emptyMine(); rebuild(); }

/* ---------- Ändern ---------- */
const Store = {
  me: null,   // { email, name }
  touched: new Set(),
  now: () => new Date().toISOString(),
  // Neuer Zeitstempel muss immer jünger sein als der alte – sonst ginge die Änderung beim Zusammenführen verloren
  // (z. B. wenn die Uhr eines anderen Geräts vorgeht)
  stamp(rec) { const n = this.now(); rec.upd = rec.upd && rec.upd >= n ? new Date(Date.parse(rec.upd) + 1).toISOString() : n; if (this.me?.email) rec.von = this.me.email; return rec; },
  myHidden(k) { return !!(k && k.versteckt && k.inhaber && this.me?.email && k.inhaber === this.me.email); },
  kontoAny(id) { return Data.mine?.konten.find((k) => k.id === id) || Data.shared?.konten.find((k) => k.id === id); },
  /* In welche Datei gehört ein Eintrag? */
  target(coll, rec) {
    if (!PRIV_COLLS.includes(coll)) return "shared";
    if (coll === "konten") return this.myHidden(rec) ? "mine" : "shared";
    const ids = [rec.konto, rec.ziel].filter(Boolean);
    return rec.buch === "privat" && ids.length && ids.every((id) => this.myHidden(this.kontoAny(id))) ? "mine" : "shared";
  },
  _upsert(doc, coll, rec) {
    const d = Data[doc], arr = d[coll], i = arr.findIndex((x) => x.id === rec.id);
    if (i >= 0) arr[i] = rec; else arr.push(rec);
    delete d.tomb[coll + ":" + rec.id]; this.touched.add(doc);
  },
  _remove(doc, coll, id) {
    const d = Data[doc]; if (!d || !d[coll]?.some((x) => x.id === id)) return;
    d[coll] = d[coll].filter((x) => x.id !== id); d.tomb[coll + ":" + id] = this.now(); this.touched.add(doc);
  },
  put(coll, rec) {
    this.stamp(rec);
    const t = this.target(coll, rec);
    if (t === "mine") {
      this._upsert("mine", coll, rec);
      if (coll === "konten") {   // Platzhalter in der gemeinsamen Datei – ohne Name und Stand
        const stub = { id: rec.id, buch: rec.buch, inhaber: rec.inhaber, versteckt: true };
        const old = Data.shared.konten.find((k) => k.id === rec.id);
        if (!old || ["name", "art", "start", "startDatum", "archiv"].some((f) => f in old) || old.buch !== stub.buch || old.inhaber !== stub.inhaber || !old.versteckt)
          this._upsert("shared", "konten", Object.assign(stub, { upd: rec.upd, von: rec.von }));
      } else this._remove("shared", coll, rec.id);
    } else {
      this._upsert("shared", coll, rec);
      if (PRIV_COLLS.includes(coll)) this._remove("mine", coll, rec.id);
    }
    rebuild();
    return rec;
  },
  del(coll, id) {
    let found = false;
    for (const doc of ["shared", "mine"]) if (Data[doc]?.[coll]?.some((x) => x.id === id)) { this._remove(doc, coll, id); found = true; }
    if (!found && Data.shared?.[coll]) { Data.shared.tomb[coll + ":" + id] = this.now(); this.touched.add("shared"); }
    rebuild();
  },
  /* Nach dem Verstecken/Zeigen eines Kontos: Buchungen in die richtige Datei verschieben */
  reroute(kontoId) {
    let n = 0;
    db.buchungen.filter((x) => x.konto === kontoId || x.ziel === kontoId).forEach((x) => {
      const inMine = Data.mine.buchungen.some((y) => y.id === x.id);
      if ((this.target("buchungen", x) === "mine") !== inMine) { this.put("buchungen", clone(x)); n++; }
    });
    return n;
  },
  touch(single) { this.stamp(Data.shared[single]); this.touched.add("shared"); },
  commit() { const t = [...this.touched]; this.touched.clear(); Sync.changed(t.length ? t : ["shared"]); },
  member(email) { return db?.mitglieder.find((m) => m.id === email); },
  memberName(email) { const m = this.member(email); return m?.name ? firstName(m.name) : firstName(email); },
  multi() { return (db?.mitglieder.length || 0) > 1; }
};

/* ---------- Zusammenführen ---------- */
function mergeDoc(local, remote, colls, singles) {
  const out = clone(remote);
  out.tomb = Object.assign({}, remote.tomb || {});
  for (const [k, t] of Object.entries(local.tomb || {})) if (!out.tomb[k] || t > out.tomb[k]) out.tomb[k] = t;
  for (const c of colls) {
    const map = new Map();
    for (const r of remote[c] || []) map.set(r.id, r);
    for (const r of local[c] || []) { const o = map.get(r.id); if (!o || (r.upd || "") > (o.upd || "")) map.set(r.id, clone(r)); }
    out[c] = [...map.values()].filter((r) => { const t = out.tomb[c + ":" + r.id]; return !t || (r.upd || "") > t; });
    out[c].forEach((r) => delete out.tomb[c + ":" + r.id]);
  }
  for (const s of singles) out[s] = clone(((local[s]?.upd || "") > (remote[s]?.upd || "") ? local[s] : remote[s]) || {});
  const old = new Date(Date.now() - 365 * 864e5).toISOString();
  for (const [k, t] of Object.entries(out.tomb)) if (t < old) delete out.tomb[k];
  return out;
}
function sigDoc(d, colls, singles) {
  if (!d) return "";
  const o = { tomb: Object.keys(d.tomb || {}).sort().map((k) => k + d.tomb[k]) };
  singles.forEach((s) => (o[s] = d[s]));
  colls.forEach((c) => (o[c] = (d[c] || []).map((r) => r.id + "@" + (r.upd || "")).sort()));
  return JSON.stringify(o);
}
const mergeDB = (l, r) => mergeDoc(l, r, COLLS, SINGLES);
const signature = (d) => sigDoc(d, COLLS, SINGLES);

/* =================================================================== Google Drive */
const DRIVE = "https://www.googleapis.com/drive/v3";
const privName = () => `haushalt-privat-${Sync.ch.shared.fileId}.json`;
const Sync = {
  mode: lsGet(LS.mode),   // "drive" | "local" | null
  status: "idle",         // idle | saving | saved | offline | error | auth | noaccess
  timer: null, token: null, tokenExp: 0, ownedByMe: false, folderId: null,
  onStatus: () => {}, onRemote: () => {},
  ch: {
    shared: { key: "shared", fileId: null, version: null, dirty: false,
      migrate, merge: mergeDB, sig: signature },
    mine: { key: "mine", fileId: null, version: null, dirty: false, searched: false,
      migrate: migrateMine, merge: (l, r) => mergeDoc(l, r, PRIV_COLLS, []), sig: (d) => sigDoc(d, PRIV_COLLS, []) }
  },
  get fileId() { return this.ch.shared.fileId; },
  get dirty() { return this.ch.shared.dirty || this.ch.mine.dirty; },

  setStatus(st) { this.status = st; this.onStatus(); },
  loadCache() {
    const s = lsGet(LS.data), p = lsGet(LS.priv), m = lsGet(LS.meta) || {};
    for (const k of ["shared", "mine"]) Object.assign(this.ch[k], { fileId: m[k]?.fileId || null, version: m[k]?.version || null, dirty: !!m[k]?.dirty });
    if (m.fileId && !m.shared) Object.assign(this.ch.shared, { fileId: m.fileId, version: m.version, dirty: !!m.dirty });   // Stand vor Version 1.1
    this.ch.mine.searched = !!m.mineSearched;
    this.ownedByMe = !!m.ownedByMe; this.folderId = m.folderId || null;
    Store.me = m.me || null;
    const shared = s ? migrate(s) : null;
    if (shared) setShared(shared, migrateMine(p));
    return !!shared;
  },
  saveCache() {
    lsSet(LS.data, Data.shared); lsSet(LS.priv, Data.mine);
    const c = (k) => ({ fileId: this.ch[k].fileId, version: this.ch[k].version, dirty: this.ch[k].dirty });
    lsSet(LS.meta, { shared: c("shared"), mine: c("mine"), mineSearched: this.ch.mine.searched, ownedByMe: this.ownedByMe, folderId: this.folderId, me: Store.me });
  },
  clearCache() {
    [LS.data, LS.priv, LS.meta, LS.token].forEach(lsDel);
    for (const k of ["shared", "mine"]) Object.assign(this.ch[k], { fileId: null, version: null, dirty: false });
    this.ch.mine.searched = false;
  },

  changed(docs = ["shared"]) {
    const now = new Date().toISOString();
    docs.forEach((k) => { this.ch[k].dirty = true; Data[k].updated = now; });
    this.saveCache();
    if (this.mode === "drive") { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 1200); this.setStatus("saving"); }
  },

  /* ---------- Anmeldung (Google Identity Services, nur Zugriff auf eigene/ausgewählte Dateien) ---------- */
  loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error("Google ist nicht erreichbar (offline?)"));
      document.head.appendChild(s);
    });
  },
  gisReady() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return (this._gis ||= this.loadScript("https://accounts.google.com/gsi/client").catch((e) => { this._gis = null; throw e; }));
  },
  async getToken(interactive) {
    if (this.token && Date.now() < this.tokenExp - 60e3) return this.token;
    const cached = lsGet(LS.token);
    if (cached && Date.now() < cached.exp - 60e3) { this.token = cached.t; this.tokenExp = cached.exp; return this.token; }
    if (!interactive) throw Object.assign(new Error("Anmeldung nötig"), { auth: true });
    await this.gisReady();
    return new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: CFG.googleClientId,
        scope: "https://www.googleapis.com/auth/drive.file",
        callback: (r) => {
          if (r.error) return rej(new Error("Anmeldung abgebrochen"));
          this.token = r.access_token; this.tokenExp = Date.now() + (r.expires_in || 3600) * 1000;
          lsSet(LS.token, { t: this.token, exp: this.tokenExp });
          res(this.token);
        },
        error_callback: (e) => rej(new Error(e?.type === "popup_closed" ? "Anmeldefenster geschlossen" : "Anmeldung fehlgeschlagen"))
      });
      tc.requestAccessToken({ prompt: Store.me ? "" : "consent", hint: Store.me?.email || undefined });
    });
  },
  async api(url, opts = {}, interactive = false) {
    const tok = await this.getToken(interactive);
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: "Bearer " + tok }, opts.headers || {}) }));
    if (r.status === 401) { this.token = null; lsDel(LS.token); throw Object.assign(new Error("Anmeldung abgelaufen"), { auth: true }); }
    if (r.status === 404 || r.status === 403) {
      let reason = ""; try { reason = (await r.clone().json()).error?.errors?.[0]?.reason || ""; } catch {}
      if (r.status === 404 || /insufficient|forbidden|notFound/i.test(reason)) throw Object.assign(new Error("Kein Zugriff auf die Datei"), { noaccess: true, status: r.status });
    }
    if (!r.ok) throw new Error("Google Drive: Fehler " + r.status);
    return r;
  },
  json: async (p) => (await p).json(),
  q: (s) => encodeURIComponent(s),

  async whoAmI(interactive) {
    const r = await this.json(this.api(`${DRIVE}/about?fields=user(displayName,emailAddress)`, {}, interactive));
    Store.me = { email: r.user?.emailAddress || "", name: r.user?.displayName || "" };
    return Store.me;
  },
  async listByName(name) {
    const q = `name='${name}' and trashed=false`;
    const r = await this.json(this.api(`${DRIVE}/files?q=${this.q(q)}&spaces=drive&fields=files(id,name,ownedByMe,owners(displayName,emailAddress),modifiedTime)&orderBy=modifiedTime desc`));
    return r.files || [];
  },
  /* Alle Haushalt-Dateien, auf die die App für diese Person zugreifen darf (selbst angelegt oder einmal ausgewählt) */
  findFiles() { return this.listByName(CFG.driveFile); },
  async fileInfo(id) {
    return this.json(this.api(`${DRIVE}/files/${id}?fields=id,name,ownedByMe,parents,md5Checksum,owners(displayName,emailAddress),capabilities(canEdit,canShare)`));
  },
  async findOrCreateFolder(name) {
    const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`;
    const r = await this.json(this.api(`${DRIVE}/files?q=${this.q(q)}&fields=files(id)&spaces=drive`));
    if (r.files?.length) return r.files[0].id;
    const c = await this.json(this.api(`${DRIVE}/files?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" })
    }));
    return c.id;
  },
  async upload(name, data, description) {
    const folder = await this.findOrCreateFolder(CFG.driveFolder);
    const fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify({ name, parents: [folder], mimeType: "application/json", description })], { type: "application/json" }));
    fd.append("file", new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const r = await this.json(this.api(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum`, { method: "POST", body: fd }));
    return { r, folder };
  },
  async createFile(data) {
    const { r, folder } = await this.upload(CFG.driveFile, data, "Daten der Haushalt-App (gemeinsam)");
    Object.assign(this.ch.shared, { fileId: r.id, version: r.md5Checksum, dirty: false });
    this.ownedByMe = true; this.folderId = folder;
    Object.assign(this.ch.mine, { fileId: null, version: null, searched: true });
    Data.mine.haushaltId = r.id;
  },
  async checksum(id) { return (await this.json(this.api(`${DRIVE}/files/${id}?fields=md5Checksum`))).md5Checksum || null; },
  async pull(id) {
    const sum = await this.checksum(id);
    const data = await this.json(this.api(`${DRIVE}/files/${id}?alt=media`));
    return { data, sum };
  },
  /* Haushalt öffnen: gemeinsame Datei + (falls vorhanden) die eigene private Datei */
  async open(fileId) {
    const info = await this.fileInfo(fileId);
    const { data, sum } = await this.pull(fileId);
    const d = migrate(data);
    if (!d) throw new Error("Diese Datei gehört nicht zur Haushalt-App.");
    Object.assign(this.ch.shared, { fileId, version: sum, dirty: false });
    this.ownedByMe = !!info.ownedByMe; this.folderId = info.parents?.[0] || null;
    Object.assign(this.ch.mine, { fileId: null, version: null, dirty: false, searched: false });
    let mine = emptyMine(fileId);
    try { const p = await this.findPrivate(); if (p) mine = p; } catch (e) { console.warn(e); }
    setShared(d, mine);
  },
  async findPrivate() {
    const ch = this.ch.mine;
    const files = (await this.listByName(privName())).filter((f) => f.ownedByMe);
    ch.searched = true;
    if (!files.length) return null;
    const { data, sum } = await this.pull(files[0].id);
    const p = migrateMine(data); if (!p) return null;
    Object.assign(ch, { fileId: files[0].id, version: sum });
    return p;
  },

  /* ---------- Speichern: erst zusammenführen, dann schreiben ---------- */
  async pushDoc(k) {
    const ch = this.ch[k];
    if (!ch.dirty) return false;
    let changed = false;
    if (!ch.fileId) {
      if (k !== "mine") return false;
      if (!ch.searched) {   // vielleicht schon auf einem anderen Gerät angelegt
        const p = await this.findPrivate();
        if (p) { Data.mine = this.ch.mine.merge(Data.mine, p); changed = true; }
      }
      if (!ch.fileId) {
        if (!Data.mine.konten.length && !Data.mine.buchungen.length && !Object.keys(Data.mine.tomb).length) { ch.dirty = false; return changed; }
        Data.mine.haushaltId = this.ch.shared.fileId;
        const { r } = await this.upload(privName(), Data.mine, "Private Daten der Haushalt-App – nicht freigeben");
        Object.assign(ch, { fileId: r.id, version: r.md5Checksum, dirty: false });
        return changed;
      }
    }
    const sum = await this.checksum(ch.fileId);
    if (sum !== ch.version) {          // inzwischen woanders gespeichert
      const { data } = await this.pull(ch.fileId);
      const remote = ch.migrate(data);
      if (remote) { const before = ch.sig(Data[k]); Data[k] = ch.merge(Data[k], remote); changed = ch.sig(Data[k]) !== before; }
    }
    Data[k].saveId = uid(); Data[k].updated = new Date().toISOString();
    const r = await this.json(this.api(`https://www.googleapis.com/upload/drive/v3/files/${ch.fileId}?uploadType=media&fields=md5Checksum`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Data[k], null, 1)
    }));
    ch.version = r.md5Checksum; ch.dirty = false;
    return changed;
  },
  async push() {
    if (this.mode !== "drive") return;
    if (!this.dirty) return this.setStatus("saved");
    if (!navigator.onLine) return this.setStatus("offline");
    if (this._busy) { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 1500); return; }
    this._busy = true; this.setStatus("saving");
    try {
      let changed = false;
      for (const k of ["shared", "mine"]) if (await this.pushDoc(k)) changed = true;
      rebuild(); this.saveCache(); this.setStatus("saved");
      if (changed) this.onRemote();
    } catch (e) { this.saveCache(); this.fail(e); } finally { this._busy = false; }
  },
  /* ---------- Abholen: Änderungen der anderen (oder eigener anderer Geräte) übernehmen ---------- */
  async refresh(silent = true) {
    if (this.mode !== "drive" || !this.fileId || !navigator.onLine || this._busy) return;
    if (this.dirty) return this.push();
    this._busy = true;
    let needPush = false, changed = false;
    try {
      for (const k of ["shared", "mine"]) {
        const ch = this.ch[k];
        if (!ch.fileId) {
          if (k === "mine" && !ch.searched) { const p = await this.findPrivate(); if (p) { Data.mine = ch.merge(Data.mine, p); changed = true; } }
          continue;
        }
        const sum = await this.checksum(ch.fileId);
        if (sum === ch.version) continue;
        const { data, sum: s2 } = await this.pull(ch.fileId);
        const remote = ch.migrate(data); if (!remote) continue;
        const before = ch.sig(Data[k]), merged = ch.merge(Data[k], remote);
        if (ch.sig(merged) !== ch.sig(remote)) { ch.dirty = true; needPush = true; }   // bei uns liegt noch etwas, das in Drive fehlt
        Data[k] = merged; ch.version = s2;
        if (ch.sig(merged) !== before) changed = true;
      }
      rebuild(); this.saveCache();
      if (changed) this.onRemote(silent);
      this.setStatus("saved");
    } catch (e) { this.fail(e); } finally { this._busy = false; }
    if (needPush) return this.push();
  },
  fail(e) {
    console.warn(e);
    this.setStatus(e.auth ? "auth" : e.noaccess ? "noaccess" : navigator.onLine ? "error" : "offline");
  },

  /* ---------- Freigabe der gemeinsamen Datei ---------- */
  async permissions() {
    const r = await this.json(this.api(`${DRIVE}/files/${this.fileId}/permissions?fields=permissions(id,type,role,emailAddress,displayName)`));
    return r.permissions || [];
  },
  async invite(email, appUrl) {
    const msg = `Ich habe dich zu unserem Haushalt eingeladen. Öffne ${appUrl} , melde dich mit diesem Google-Konto an und wähle „Einem Haushalt beitreten“.`;
    await this.api(`${DRIVE}/files/${this.fileId}/permissions?sendNotificationEmail=true&emailMessage=${this.q(msg)}&fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", role: "writer", emailAddress: email })
    });
  },
  async removePermission(pid) { await this.api(`${DRIVE}/files/${this.fileId}/permissions/${pid}`, { method: "DELETE" }); },

  /* ---------- Google Picker: freigegebene Datei einmalig auswählen ---------- */
  async pickHousehold() {
    if (!CFG.googleApiKey || !CFG.appId) throw new Error("Für „Beitreten“ fehlt der API-Schlüssel in config.js.");
    const tok = await this.getToken(true);
    if (!window.google?.picker) {
      if (!window.gapi) await this.loadScript("https://apis.google.com/js/api.js");
      await new Promise((res, rej) => gapi.load("picker", { callback: res, onerror: () => rej(new Error("Dateiauswahl konnte nicht geladen werden")) }));
    }
    return new Promise((res) => {
      const P = google.picker;
      const shared = new P.DocsView(P.ViewId.DOCS).setMimeTypes("application/json").setOwnedByMe(false).setQuery(CFG.driveFile).setMode(P.DocsViewMode.LIST);
      const all = new P.DocsView(P.ViewId.DOCS).setMimeTypes("application/json").setQuery(CFG.driveFile).setMode(P.DocsViewMode.LIST);
      const picker = new P.PickerBuilder()
        .addView(shared).addView(all)
        .setOAuthToken(tok).setDeveloperKey(CFG.googleApiKey).setAppId(CFG.appId)
        .setLocale("de").setTitle(`„${CFG.driveFile}“ auswählen`)
        .setCallback((d) => {
          if (d.action === P.Action.PICKED) res(d.docs?.[0] || null);
          else if (d.action === P.Action.CANCEL) res(null);
        }).build();
      picker.setVisible(true);
    });
  }
};
