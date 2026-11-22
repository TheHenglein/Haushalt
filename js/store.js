/* Haushalt – gemeinsame Datenbasis
 *
 * Eine JSON-Datei („haushalt.json“) in Google Drive. Sie liegt im Drive der Person, die den Haushalt anlegt,
 * und wird für die anderen Mitglieder freigegeben. Weil mehrere Personen gleichzeitig schreiben können,
 * wird nicht „wer zuletzt speichert, gewinnt“ verwendet, sondern pro Eintrag zusammengeführt:
 *   - jeder Eintrag hat eine id und einen Zeitstempel `upd` (+ `von` = E-Mail der Person)
 *   - gelöschte Einträge hinterlassen einen Grabstein in `tomb` („sammlung:id“ → Zeitpunkt)
 *   - beim Speichern wird die Datei in Drive gelesen, mit dem eigenen Stand zusammengeführt und erst dann geschrieben
 */
"use strict";

const SCHEMA = 2;
const SINGLES = ["haushalt", "settings"];          // einzelne Objekte, ganz oder gar nicht (neuester gewinnt)
const COLLS = ["mitglieder"];                      // Listen von Einträgen; Module melden ihre eigenen an
const MODULE_INITS = [];                           // Module legen hier ihre Startdaten an
function registerData(colls, init) { colls.forEach((c) => COLLS.includes(c) || COLLS.push(c)); if (init) MODULE_INITS.push(init); }

let db = null;

function emptyDB(name = "Unser Haushalt") {
  const d = {
    schema: SCHEMA, app: "haushalt", updated: new Date().toISOString(), saveId: uid(),
    haushalt: { name, created: new Date().toISOString(), upd: "" },
    settings: { upd: "" },
    tomb: {}
  };
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
  MODULE_INITS.forEach((fn) => fn(d, true));   // fehlende Teile ergänzen, nichts überschreiben
  d.schema = SCHEMA;
  return d;
}

/* ---------- Änderungen immer über Store, damit Zeitstempel und Grabsteine stimmen ---------- */
const Store = {
  me: null,   // { email, name }
  now: () => new Date().toISOString(),
  stamp(rec) { rec.upd = this.now(); if (this.me?.email) rec.von = this.me.email; return rec; },
  put(coll, rec) {
    this.stamp(rec);
    const arr = db[coll], i = arr.findIndex((x) => x.id === rec.id);
    if (i >= 0) arr[i] = rec; else arr.push(rec);
    delete db.tomb[coll + ":" + rec.id];
    return rec;
  },
  del(coll, id) { db[coll] = db[coll].filter((x) => x.id !== id); db.tomb[coll + ":" + id] = this.now(); },
  touch(single) { this.stamp(db[single]); },
  commit() { Sync.changed(); },
  member(email) { return db?.mitglieder.find((m) => m.id === email); },
  memberName(email) { const m = this.member(email); return m?.name ? firstName(m.name) : firstName(email); },
  multi() { return (db?.mitglieder.length || 0) > 1; }
};

/* Zwei Stände zusammenführen. Ergebnis enthält alles, was auf einer der beiden Seiten neuer ist. */
function mergeDB(local, remote) {
  const out = clone(remote);
  out.tomb = Object.assign({}, remote.tomb || {});
  for (const [k, t] of Object.entries(local.tomb || {})) if (!out.tomb[k] || t > out.tomb[k]) out.tomb[k] = t;
  for (const c of COLLS) {
    const map = new Map();
    for (const r of remote[c] || []) map.set(r.id, r);
    for (const r of local[c] || []) { const o = map.get(r.id); if (!o || (r.upd || "") > (o.upd || "")) map.set(r.id, clone(r)); }
    out[c] = [...map.values()].filter((r) => { const t = out.tomb[c + ":" + r.id]; return !t || (r.upd || "") > t; });
    out[c].forEach((r) => delete out.tomb[c + ":" + r.id]);   // nach dem Löschen wieder hergestellt
  }
  for (const s of SINGLES) out[s] = clone(((local[s]?.upd || "") > (remote[s]?.upd || "") ? local[s] : remote[s]) || {});
  // Grabsteine nach einem Jahr vergessen
  const old = new Date(Date.now() - 365 * 864e5).toISOString();
  for (const [k, t] of Object.entries(out.tomb)) if (t < old) delete out.tomb[k];
  return out;
}
/* Inhaltlicher Fingerabdruck (ohne Speicher-Kennungen) – ändert sich nur, wenn sich Daten ändern */
function signature(d) {
  if (!d) return "";
  const o = { tomb: Object.keys(d.tomb || {}).sort().map((k) => k + d.tomb[k]) };
  SINGLES.forEach((s) => (o[s] = d[s]));
  COLLS.forEach((c) => (o[c] = (d[c] || []).map((r) => r.id + "@" + (r.upd || "")).sort()));
  return JSON.stringify(o);
}

/* =================================================================== Google Drive */
const DRIVE = "https://www.googleapis.com/drive/v3";
const Sync = {
  mode: lsGet(LS.mode),   // "drive" | "local" | null
  status: "idle",         // idle | saving | saved | offline | error | auth | noaccess
  fileId: null, folderId: null, version: null, dirty: false, timer: null,
  token: null, tokenExp: 0, ownedByMe: false,
  onStatus: () => {}, onRemote: () => {},

  setStatus(st) { this.status = st; this.onStatus(); },
  loadCache() {
    const d = lsGet(LS.data), m = lsGet(LS.meta) || {};
    Object.assign(this, { fileId: m.fileId || null, folderId: m.folderId || null, version: m.version || null, dirty: !!m.dirty, ownedByMe: !!m.ownedByMe });
    Store.me = m.me || null;
    return d;
  },
  saveCache() {
    lsSet(LS.data, db);
    lsSet(LS.meta, { fileId: this.fileId, folderId: this.folderId, version: this.version, dirty: this.dirty, ownedByMe: this.ownedByMe, me: Store.me });
  },
  clearCache() { [LS.data, LS.meta, LS.token].forEach(lsDel); this.fileId = this.folderId = this.version = null; this.dirty = false; },

  changed() {
    db.updated = new Date().toISOString();
    this.dirty = true; this.saveCache();
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
  /* Alle Haushalt-Dateien, auf die die App für diese Person zugreifen darf (selbst angelegt oder einmal ausgewählt) */
  async findFiles() {
    const q = `name='${CFG.driveFile}' and trashed=false`;
    const r = await this.json(this.api(`${DRIVE}/files?q=${this.q(q)}&spaces=drive&fields=files(id,name,ownedByMe,owners(displayName,emailAddress),modifiedTime)&orderBy=modifiedTime desc`));
    return r.files || [];
  },
  async fileInfo(id = this.fileId) {
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
  async createFile(data) {
    this.folderId = await this.findOrCreateFolder(CFG.driveFolder);
    const fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify({ name: CFG.driveFile, parents: [this.folderId], mimeType: "application/json", description: "Daten der Haushalt-App" })], { type: "application/json" }));
    fd.append("file", new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const r = await this.json(this.api(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,md5Checksum`, { method: "POST", body: fd }));
    this.fileId = r.id; this.version = r.md5Checksum; this.ownedByMe = true; this.dirty = false;
  },
  async checksum() { return (await this.json(this.api(`${DRIVE}/files/${this.fileId}?fields=md5Checksum`))).md5Checksum || null; },
  /* Prüfsumme zuerst lesen, dann den Inhalt – ändert sich die Datei dazwischen, wird beim nächsten Abgleich einfach noch mal zusammengeführt */
  async pull() {
    const sum = await this.checksum();
    const data = await this.json(this.api(`${DRIVE}/files/${this.fileId}?alt=media`));
    return { data, sum };
  },
  async open(fileId) {
    this.fileId = fileId;
    const info = await this.fileInfo(fileId);
    this.ownedByMe = !!info.ownedByMe; this.folderId = info.parents?.[0] || null;
    const { data, sum } = await this.pull();
    const d = migrate(data);
    if (!d) throw new Error("Diese Datei gehört nicht zur Haushalt-App.");
    this.version = sum; this.dirty = false;
    return d;
  },

  /* ---------- Speichern: erst zusammenführen, dann schreiben ---------- */
  async push() {
    if (this.mode !== "drive") return;
    if (!this.dirty) return this.setStatus("saved");
    if (!navigator.onLine) return this.setStatus("offline");
    if (this._busy) { clearTimeout(this.timer); this.timer = setTimeout(() => this.push(), 1500); return; }
    this._busy = true; this.setStatus("saving");
    try {
      const sum = await this.checksum();
      if (sum !== this.version) {          // jemand anderes hat inzwischen gespeichert
        const { data } = await this.pull();
        const remote = migrate(data);
        if (remote) { const before = signature(db); db = mergeDB(db, remote); if (signature(db) !== before) this.onRemote(); }
      }
      db.saveId = uid(); db.updated = new Date().toISOString();
      const r = await this.json(this.api(`https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=media&fields=md5Checksum`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(db, null, 1)
      }));
      this.version = r.md5Checksum; this.dirty = false; this.saveCache(); this.setStatus("saved");
    } catch (e) { this.fail(e); } finally { this._busy = false; }
  },
  /* ---------- Abholen: Änderungen der anderen übernehmen ---------- */
  async refresh(silent = true) {
    if (this.mode !== "drive" || !this.fileId || !navigator.onLine || this._busy) return;
    if (this.dirty) return this.push();
    this._busy = true;
    try {
      const sum = await this.checksum();
      if (sum !== this.version) {
        const { data, sum: s2 } = await this.pull();
        const remote = migrate(data);
        if (remote) {
          const before = signature(db), merged = mergeDB(db, remote);
          const needPush = signature(merged) !== signature(remote);   // bei uns liegt noch etwas, das in Drive fehlt
          db = merged; this.version = s2; this.saveCache();
          if (signature(db) !== before) this.onRemote(silent);
          if (needPush) { this.dirty = true; this._busy = false; return this.push(); }
        }
      }
      this.setStatus("saved");
    } catch (e) { this.fail(e); } finally { this._busy = false; }
  },
  fail(e) {
    console.warn(e);
    this.setStatus(e.auth ? "auth" : e.noaccess ? "noaccess" : navigator.onLine ? "error" : "offline");
  },

  /* ---------- Freigabe ---------- */
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
