/* Haushalt – App-Hülle: Menü links, Module, Einrichtung des gemeinsamen Haushalts, Einstellungen, Start */
"use strict";

/* =================================================================== Einstellungen (eigenes Modul) */
const Einstellungen = {
  id: "einstellungen", group: null, title: "Einstellungen", icon: "⚙️",
  view() {
    const item = (act, icon, t, s) => `<button class="item" data-act="${act}"><span class="ic">${icon}</span><span class="m"><span class="t">${t}</span><span class="s">${s}</span></span><span class="sub">›</span></button>`;
    const n = db.mitglieder.length;
    const drive = Sync.mode === "drive";
    const conn = drive
      ? `<p style="margin-top:0">Angemeldet als <b>${esc(Store.me?.name || Store.me?.email || "")}</b>${Store.me?.name ? `<br><span class="sub">${esc(Store.me.email)}</span>` : ""}</p>
         <p class="sub">Datei „${esc(CFG.driveFile)}“ ${Sync.ownedByMe ? "in deinem Google Drive (Ordner „" + esc(CFG.driveFolder) + "“)" : "im Google Drive einer anderen Person, für dich freigegeben"}.</p>
         <div class="btns"><button class="btn small" data-act="sync-now">Jetzt abgleichen</button><button class="btn small ghost" data-act="logout">Abmelden</button></div>`
      : `<p style="margin-top:0">Die Daten liegen nur in diesem Browser. Zum gemeinsamen Nutzen mit Google anmelden.</p>${CFG.googleClientId ? `<button class="btn small primary" data-act="signin">Mit Google anmelden</button>` : `<span class="sub">Google ist noch nicht eingerichtet (config.js).</span>`}`;
    return `<div class="h3"><span>Haushalt</span></div><div class="list">
        ${item("hh-rename", "🏠", "Name des Haushalts", esc(db.haushalt.name))}
        ${item("members", "👥", "Mitglieder &amp; Freigabe", drive ? `${n} ${n === 1 ? "Person" : "Personen"} · einladen, entfernen` : "erst mit Google anmelden")}
        ${drive ? item("hh-switch", "🔁", "Haushalt wechseln oder beitreten", "anderen Haushalt öffnen") : ""}</div>
      <div class="h3"><span>Darstellung</span></div><div class="list">
        ${item("design", "🎨", "Hell/dunkel &amp; Farbe", `${({ auto: "Automatisch", light: "Hell", dark: "Dunkel" })[themeMode()]} · ${THEMES[farben().app]?.name}`)}</div>
      <div class="h3"><span>Speicherort</span></div><div class="card">${conn}</div>
      <div class="h3"><span>Daten</span></div><div class="list">
        ${item("backup", "⬇️", "Sicherung herunterladen", "der ganze Haushalt als Datei")}
        ${item("restore", "⬆️", "Sicherung einspielen", "ersetzt die Daten für alle Mitglieder")}</div>
      <p class="sub" style="text-align:center;margin-top:20px">${APP_NAME} ${APP_VERSION} · Stand ${new Date(db.updated).toLocaleString("de-DE")}</p>`;
  }
};

/* =================================================================== Module & Menü */
const MODULES = [Finanzen, ...HAUSHALT_MODULE, Einstellungen];
let curId = lsGet(LS.module, "finanzen");
const cur = () => MODULES.find((m) => m.id === curId) || Finanzen;

const ICON_MENU = '<path d="M4 7h16M4 12h16M4 17h16"/>';
function renderShell() {
  $("#app").innerHTML = `<div class="shell">
    <header class="topbar"><div class="r1">
      <button class="iconbtn" data-menu aria-label="Menü öffnen">${svg(ICON_MENU)}</button>
      <div class="ttl" id="ttl"></div>
      <button class="sync" id="sync" data-act="sync" aria-label="Speicherstatus"><span class="dot"></span></button></div></header>
    <div id="banner"></div><main id="view"></main><div id="bottom"></div></div>
    <div class="drawer-bg" id="drawer" hidden><aside class="drawer" aria-label="Menü"></aside></div>`;
}
function render() {
  if (!db || !$("#view")) return;
  if (!stack.length) document.body.style.overflow = "";   // Sicherheitsnetz: Seite nie dauerhaft gesperrt
  const mod = cur();
  applyTheme(mod.bereich?.() || "app");
  $("#ttl").innerHTML = mod.top?.() || `<b>${esc(mod.title)}</b>`;
  $("#view").innerHTML = mod.view();
  $("#bottom").innerHTML = mod.bottom?.() || "";
  $(".shell").classList.toggle("has-nav", !!mod.bottom);
  if (!$("#drawer").hidden) renderDrawer();
  renderSync();
}
function goModule(id) {
  curId = id; lsSet(LS.module, id); render(); window.scrollTo(0, 0);
  cur().onShow?.();
}
function renderDrawer() {
  const groups = [...new Set(MODULES.map((m) => m.group).filter(Boolean))];
  const it = (m) => `<button class="di ${m.id === curId ? "on" : ""}" data-nav="${m.id}"><span class="e">${m.icon}</span>
    <span class="dm"><span>${esc(m.title)}${m.soon ? ' <span class="tag">bald</span>' : ""}</span>${m.hint ? `<small>${esc(m.hint)}</small>` : ""}</span></button>`;
  const n = db.mitglieder.length;
  $("#drawer .drawer").innerHTML = `<div class="dh"><img src="icons/icon.svg" alt="">
      <div><b>${esc(db.haushalt.name)}</b><small>${Sync.mode === "drive" ? `${n} ${n === 1 ? "Mitglied" : "Mitglieder"}${Store.me ? " · " + esc(firstName(Store.me.name || Store.me.email)) : ""}` : "nur auf diesem Gerät"}</small></div></div>
    <div class="dscroll">${groups.map((g) => `<div class="dg">${esc(g)}</div>${MODULES.filter((m) => m.group === g).map(it).join("")}`).join("")}
    <div class="dsep"></div>
    <button class="di" data-act="members"><span class="e">👥</span><span class="dm"><span>Mitglieder &amp; Freigabe</span></span></button>
    ${it(Einstellungen)}</div>`;
}
function openDrawer() {
  const d = $("#drawer"); renderDrawer(); d.hidden = false;
  requestAnimationFrame(() => d.classList.add("open"));
  history.pushState({ drawer: 1 }, "");   // Zurück-Taste schließt das Menü
}
function hideDrawer() { const d = $("#drawer"); if (!d || d.hidden) return; d.classList.remove("open"); setTimeout(() => (d.hidden = true), 200); }
function closeDrawer() { if (history.state?.drawer) history.back(); else hideDrawer(); }
window.addEventListener("popstate", () => hideDrawer());

function renderSync() {
  const el = $("#sync"); if (!el) return;
  const map = { saving: "saving", offline: "offline", error: "error", auth: "error", noaccess: "error" };
  el.className = "sync " + (Sync.mode === "local" ? "local" : map[Sync.status] || "");
  el.title = Sync.mode === "local" ? "Nur auf diesem Gerät" : ({ saving: "Speichert …", offline: "Offline – wird später gespeichert", error: "Speichern fehlgeschlagen", auth: "Neu anmelden", noaccess: "Kein Zugriff" }[Sync.status] || "Gespeichert");
  const b = $("#banner"); if (!b) return;
  b.innerHTML = Sync.mode !== "drive" ? ""
    : Sync.status === "auth" ? `<div class="authbar"><span>Zum Speichern bitte kurz neu anmelden.</span><button class="btn small primary" data-act="sync">Anmelden</button></div>`
    : Sync.status === "noaccess" ? `<div class="authbar"><span>Kein Zugriff mehr auf diesen Haushalt – wurde die Freigabe entfernt?</span><button class="btn small primary" data-act="hh-switch">Haushalt wählen</button></div>`
    : "";
}

/* =================================================================== Einrichtung: anmelden, anlegen, beitreten */
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");
function screen(html) { applyTheme("app"); $("#app").innerHTML = `<div class="welcome">${html}</div>`; }

function welcome() {
  screen(`<img src="icons/icon.svg" alt=""><h1>${APP_NAME}</h1>
    <p>Alles für euren Haushalt an einem Ort – gemeinsam nutzbar.</p>
    ${CFG.googleClientId ? `<button class="btn primary" data-act="signin">Mit Google anmelden</button>
      <p class="sub">Die Daten liegen als Datei in Google Drive – bei der Person, die den Haushalt anlegt. Andere werden eingeladen.</p>` : `<div class="hint">Google ist noch nicht eingerichtet (Client-ID in config.js fehlt).</div>`}
    <button class="btn" data-act="local">${CFG.googleClientId ? "Ohne Konto ausprobieren" : "Starten (nur auf diesem Gerät)"}</button>`);
}
async function signIn() {
  try {
    toast("Anmelden …");
    await Sync.getToken(true);
    await Sync.whoAmI();
    const files = await Sync.findFiles();
    if (files.length === 1) return openHousehold(files[0].id);
    chooser(files);
  } catch (e) { console.error(e); toast(e.message || "Anmeldung fehlgeschlagen"); }
}
/* Haushalt auswählen, anlegen oder beitreten */
function chooser(files = [], back = false) {
  const owner = (f) => f.ownedByMe ? "dein Haushalt" : "von " + (f.owners?.[0]?.displayName || f.owners?.[0]?.emailAddress || "jemand anderem");
  screen(`<img src="icons/icon.svg" alt=""><h1>Hallo ${esc(firstName(Store.me?.name || Store.me?.email || ""))}!</h1>
    ${files.length ? `<p>Welchen Haushalt möchtest du öffnen?</p><div class="list" style="text-align:left;margin-bottom:14px">${files.map((f) => `<button class="item" data-act="hh-open" data-id="${f.id}">
        <span class="ic">🏠</span><span class="m"><span class="t">${f.id === Sync.fileId ? "Aktueller Haushalt" : "Haushalt"}</span><span class="s">${esc(owner(f))} · zuletzt ${new Date(f.modifiedTime).toLocaleDateString("de-DE")}</span></span><span class="sub">›</span></button>`).join("")}</div>`
      : `<p>Wie möchtest du starten?</p>`}
    <button class="choice" data-act="hh-create"><b>🏠 Neuen Haushalt anlegen</b><small>Die Datei liegt dann in deinem Google Drive. Die anderen lädst du anschließend ein.</small></button>
    <button class="choice" data-act="hh-join"><b>🔑 Einem Haushalt beitreten</b><small>Jemand hat dir die Datei „${esc(CFG.driveFile)}“ freigegeben – du wählst sie einmal aus.</small></button>
    ${back ? `<button class="btn ghost" data-act="hh-back">Zurück</button>` : `<button class="btn ghost" data-act="logout-quiet">Mit anderem Google-Konto anmelden</button>`}`);
}
async function switchHousehold() {
  try {
    if (Sync.dirty) await Sync.push();
    await Sync.getToken(true);
    if (!Store.me) await Sync.whoAmI();
    chooser(await Sync.findFiles(), !!db && Sync.status !== "noaccess");
  } catch (e) { toast(e.message); }
}
function ensureMember() {
  const me = Store.me; if (!me?.email || !db) return false;
  const m = Store.member(me.email), name = me.name || firstName(me.email);
  if (m && m.name === name) return false;
  Store.put("mitglieder", { id: me.email, name, seit: m?.seit || todayISO() });
  return true;
}
async function openHousehold(id) {
  try {
    toast("Lade Haushalt …");
    const d = await Sync.open(id);
    db = d; Sync.mode = "drive"; lsSet(LS.mode, "drive"); Sync.saveCache();
    startApp();
    if (ensureMember()) Store.commit(); else Sync.setStatus("saved");
    toast(`${db.haushalt.name} geöffnet`);
  } catch (e) {
    console.error(e);
    toast(e.noaccess ? "Kein Zugriff auf diese Datei" : e.message || "Konnte den Haushalt nicht öffnen");
  }
}
async function createHousehold() {
  const name = await promptBox("Name des Haushalts", "Unser Haushalt", "z. B. Familie Müller"); if (name == null) return;
  try {
    let data = emptyDB(name || "Unser Haushalt");
    if (Sync.mode === "local" && db && db.buchungen.length) {
      if (await confirmBox("Daten übernehmen?", "Auf diesem Gerät gibt es schon ausprobierte Daten. Sollen sie in den neuen Haushalt übernommen werden?", "Übernehmen")) {
        data = db; data.haushalt.name = name || data.haushalt.name;
      }
    }
    db = data; db.haushalt.owner = Store.me?.email || ""; Store.touch("haushalt"); ensureMember();
    toast("Lege Haushalt an …");
    await Sync.createFile(db);
    Sync.mode = "drive"; lsSet(LS.mode, "drive"); Sync.saveCache(); Sync.setStatus("saved");
    startApp();
    toast("Haushalt angelegt – lade jetzt die anderen ein", { label: "Einladen", fn: showMembers });
  } catch (e) { console.error(e); toast(e.message || "Anlegen fehlgeschlagen"); }
}
async function joinHousehold() {
  try {
    const doc = await Sync.pickHousehold();
    if (doc) await openHousehold(doc.id);
  } catch (e) { console.error(e); toast(e.message || "Beitreten fehlgeschlagen"); }
}

/* =================================================================== Mitglieder & Freigabe */
async function showMembers() {
  if (Sync.mode !== "drive") {
    const ok = await confirmBox("Gemeinsam nutzen", "Damit mehrere Personen den Haushalt nutzen können, liegen die Daten in Google Drive. Jetzt mit Google anmelden?", "Anmelden");
    if (ok) signIn();
    return;
  }
  const m = modal({ title: "Mitglieder & Freigabe", body: `<div data-mb><p class="sub">Lade …</p></div>` });
  const box = $("[data-mb]", m);
  const ROLE = { owner: "Besitzer", writer: "kann bearbeiten", commenter: "nur lesen", reader: "nur lesen" };
  const draw = async () => {
    let perms = null;
    try { perms = (await Sync.permissions()).filter((p) => p.type === "user" || p.type === "group"); } catch (e) { console.warn(e); }
    if (!m.isConnected) return;
    const meOwner = Sync.ownedByMe;
    const people = perms ? perms.map((p) => ({ pid: p.id, email: p.emailAddress, name: p.displayName || p.emailAddress, role: p.role, active: !!Store.member(p.emailAddress) }))
      : db.mitglieder.map((x) => ({ email: x.id, name: x.name, role: null, active: true }));
    const row = (p) => `<div class="item"><span class="ic">${p.role === "owner" ? "🏠" : "👤"}</span>
      <span class="m"><span class="t">${esc(p.name)}${p.email === Store.me?.email ? ' <span class="tag">du</span>' : ""}</span>
      <span class="s">${[p.role ? ROLE[p.role] : "", p.active ? "nutzt die App" : "eingeladen – noch nicht beigetreten"].filter(Boolean).join(" · ")}</span></span>
      ${meOwner && p.pid && p.role !== "owner" ? `<button class="btn small danger" data-rm="${p.pid}" data-name="${esc(p.name)}">Entfernen</button>` : ""}</div>`;
    box.innerHTML = `<div class="list">${people.map(row).join("")}</div>
      ${perms && people.some((p) => p.role === "reader" || p.role === "commenter") ? `<div class="hint" style="margin-top:12px">Wer nur lesen darf, kann in der App nichts eintragen. Freigabe in Google Drive auf „Bearbeiter“ ändern.</div>` : ""}
      ${!perms ? `<p class="sub">Die Freigaben kann nur einsehen, wem die Datei gehört.</p>` : ""}
      <div class="btns" style="margin-top:14px">${meOwner || !perms ? `<button class="btn primary" data-invite>+ Person einladen</button>` : ""}
        <a class="btn" href="https://drive.google.com/file/d/${encodeURIComponent(Sync.fileId)}/view" target="_blank" rel="noopener">In Google Drive öffnen</a></div>
      <div class="explain"><b>So funktioniert’s</b>
        <ol><li>Einladen gibt der Person Bearbeitungsrechte an der Datei „${esc(CFG.driveFile)}“ – Google schickt ihr eine E-Mail. Alternativ kannst du die Datei direkt in Google Drive freigeben.</li>
        <li>Sie öffnet die App (${esc(appUrl())}), meldet sich mit ihrem Google-Konto an und tippt auf <b>„Einem Haushalt beitreten“</b>.</li>
        <li>Einmal die Datei auswählen – fertig. Danach sieht jede Person die Einträge der anderen.</li></ol>
        Wer Zugriff auf die Datei hat, kann die App mitbenutzen. Entfernst du die Freigabe, ist der Zugriff weg.</div>`;
  };
  m.addEventListener("click", async (e) => {
    if (e.target.closest("[data-invite]")) {
      const email = await promptBox("Person einladen", "", "E-Mail-Adresse (Google-Konto)", { type: "email", maxlength: 120, hint: "Am besten die Gmail-Adresse – mit diesem Konto meldet sich die Person später an." });
      if (!email) return;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Das sieht nicht nach einer E-Mail-Adresse aus");
      try { toast("Lade ein …"); await Sync.invite(email, appUrl()); toast(`${email} eingeladen`); draw(); }
      catch (err) { console.warn(err); toast(err.noaccess ? "Einladen nicht möglich – nur wer die Datei besitzt, darf einladen" : "Einladen fehlgeschlagen – versuch es direkt in Google Drive"); }
    }
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      if (!await confirmBox("Mitglied entfernen?", `${esc(rm.dataset.name)} verliert den Zugriff auf den Haushalt. Die bisherigen Einträge bleiben erhalten.`, "Entfernen", true)) return;
      try { await Sync.removePermission(rm.dataset.rm); toast("Zugriff entfernt"); draw(); } catch { toast("Entfernen fehlgeschlagen"); }
    }
  });
  draw();
}

/* =================================================================== Darstellung, Sicherung */
function editDesign() {
  const draw = () => {
    const f = farben(), mode = themeMode();
    return `<div class="pick-group">Hell oder dunkel</div>
      <div class="seg">${[["auto", "Automatisch"], ["light", "Hell"], ["dark", "Dunkel"]].map(([k, l]) => `<button data-mode="${k}" class="${mode === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <p class="sub">Automatisch folgt der Einstellung des Handys.</p>
      <div class="pick-group">Farbe der App</div>
      <div class="swatches">${Object.entries(THEMES).map(([k, t]) => `<button class="swatch ${f.app === k ? "on" : ""}" data-farbe="${k}"><i style="background:${t.acc}"></i>${esc(t.name)}</button>`).join("")}</div>
      <p class="sub">Das Haushaltsbuch hat eigene Farben für Privat und Gewerbe (Haushaltsbuch → Mehr). Die Darstellung gilt nur für dich.</p>`;
  };
  const m = modal({ title: "Darstellung", body: `<div data-d>${draw()}</div>` });
  m.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.mode) lsSet(LS.theme, t.dataset.mode);
    else if (t.dataset.farbe) setFarbe("app", t.dataset.farbe);
    else return;
    render(); $("[data-d]", m).innerHTML = draw();
  });
}
async function restoreBackup() {
  const file = await pickFile(".json,application/json"); if (!file) return;
  let d;
  try { d = JSON.parse(await file.text()); } catch { return toast("Datei konnte nicht gelesen werden"); }
  if (d?.app !== "haushalt") return toast(Array.isArray(d?.buchungen) ? "Das ist eine Sicherung des alten Haushaltsbuchs – bitte unter Haushaltsbuch → Mehr übernehmen." : "Das ist keine Haushalt-Sicherung");
  d = migrate(d);
  if (!await confirmBox("Sicherung einspielen?", `Alle Daten des Haushalts werden für <b>alle Mitglieder</b> durch die Sicherung vom ${new Date(d.updated).toLocaleString("de-DE")} ersetzt.`, "Einspielen", true)) return;
  const keepName = db.haushalt.name;
  COLLS.forEach((c) => {
    db[c].slice().forEach((r) => Store.del(c, r.id));
    d[c].forEach((r) => Store.put(c, Object.assign({}, r)));
  });
  db.settings = d.settings; Store.touch("settings");
  db.haushalt = Object.assign(d.haushalt, { name: d.haushalt.name || keepName }); Store.touch("haushalt");
  ensureMember();
  Store.commit(); render(); toast("Sicherung eingespielt");
}

/* =================================================================== Start */
function startApp() {
  renderShell(); render();
  const neu = new URLSearchParams(location.search).get("neu");
  if (neu) { history.replaceState(null, "", location.pathname); curId = "finanzen"; lsSet(LS.module, curId); render(); Finanzen.shortcut(neu); }
  else cur().onShow?.();
}
Sync.onStatus = renderSync;
Sync.onRemote = (silent) => { render(); if (!stack.length || !silent) toast("Neue Änderungen aus dem Haushalt geladen"); };

/* =================================================================== Ereignisse */
document.addEventListener("click", async (e) => {
  if (e.target.closest(".modal-bg") && !e.target.closest("[data-act=edit]")) return;   // Dialoge regeln ihre Klicks selbst
  if (e.target.closest("[data-menu]")) return openDrawer();
  const dr = e.target.closest("#drawer");
  if (dr) {
    const nav = e.target.closest("[data-nav]");
    if (nav) { closeDrawer(); return goModule(nav.dataset.nav); }
    if (!e.target.closest(".drawer")) return closeDrawer();
    if (e.target.closest("[data-act=members]")) { closeDrawer(); return showMembers(); }
    return;
  }
  if ($(".shell") && db && cur().click && await cur().click(e)) return;
  const a = e.target.closest("[data-act]"); if (!a) return;
  switch (a.dataset.act) {
    case "signin": return signIn();
    case "local": Sync.mode = "local"; lsSet(LS.mode, "local"); db = db || emptyDB(); Sync.saveCache(); return startApp();
    case "hh-open": return openHousehold(a.dataset.id);
    case "hh-create": return createHousehold();
    case "hh-join": return joinHousehold();
    case "hh-switch": return switchHousehold();
    case "hh-back": return startApp();
    case "hh-rename": {
      const v = await promptBox("Name des Haushalts", db.haushalt.name); if (!v) return;
      db.haushalt.name = v; Store.touch("haushalt"); Store.commit(); return render();
    }
    case "members": return showMembers();
    case "design": return editDesign();
    case "backup": return download(`Haushalt_Sicherung_${todayISO()}.json`, new Blob([JSON.stringify(db, null, 1)], { type: "application/json" }));
    case "restore": return restoreBackup();
    case "sync": case "sync-now":
      if (Sync.mode !== "drive") return goModule("einstellungen");
      if (Sync.status === "noaccess") return switchHousehold();
      if (Sync.status === "auth") { try { await Sync.getToken(true); } catch (err) { return toast(err.message); } }
      await (Sync.dirty ? Sync.push() : Sync.refresh(false));
      if (Sync.status === "saved") toast("Alles aktuell");
      return;
    case "logout": case "logout-quiet":
      if (a.dataset.act === "logout" && !await confirmBox("Abmelden?", "Die App wird auf diesem Gerät von Google getrennt. Die Daten in Google Drive bleiben erhalten." + (Sync.dirty ? " <b>Achtung: Es gibt noch nicht gespeicherte Änderungen.</b>" : ""), "Abmelden")) return;
      if (Sync.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(Sync.token, () => {});
      Sync.clearCache(); lsDel(LS.mode); location.reload();
  }
});
document.addEventListener("input", (e) => { if ($(".shell") && db) cur().input?.(e); });
window.addEventListener("online", () => { if (Sync.mode === "drive") Sync.dirty ? Sync.push() : Sync.refresh(); });
window.addEventListener("offline", () => Sync.mode === "drive" && Sync.setStatus("offline"));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && db) { Sync.refresh(); render(); } });
darkMQ?.addEventListener?.("change", () => db && $(".shell") ? render() : applyTheme());
// Änderungen der anderen regelmäßig abholen, solange die App offen ist (nur eine kurze Prüfsummen-Abfrage)
setInterval(() => { if (document.visibilityState === "visible" && Sync.mode === "drive" && !Sync.dirty) Sync.refresh(); }, 30000);

(async function init() {
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  const cached = Sync.loadCache();
  db = cached ? migrate(cached) : null;
  if (!Sync.mode || (Sync.mode === "drive" && (!Sync.fileId || !db))) return welcome();
  if (!db) db = emptyDB();
  startApp();
  if (Sync.mode === "drive") {
    if (!navigator.onLine) return Sync.setStatus("offline");
    await Sync.refresh();
  }
})();
