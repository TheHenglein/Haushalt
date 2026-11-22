/* Haushalt – Modul „Haushaltsplan“
 * Aufbau wie der Essensplan: Tage ab heute. Je Tag bis zu 5 Aufgaben, mit „+“ erweiterbar auf 10.
 * Aufgaben kommen aus einer Aufgabenliste (wie die Rezept-Tags, mit Standarddauer) oder werden frei eingetippt.
 * Jede Aufgabe: eine oder mehrere Personen, Dauer, abhakbar. Je Tag: Gesamtzeit, Zeit je Person,
 * Vergleich mit der verfügbaren Zeit (Werktag / Wochenende) – damit man sieht, was an einem Tag machbar ist.
 *
 * Daten: planAufgaben → { datum, name, dauer, personen: [email], erledigt, pos }
 *        settings.haushalt.aufgaben → [{ name, dauer }],  settings.haushalt.zeit → { werktag, wochenende } (Minuten)
 */
"use strict";

/* Gruppen der Aufgabenliste (Reihenfolge in der Auswahl) und Zuordnung bekannter Aufgaben anhand des Namens */
const GRUPPEN = ["Wäsche", "Küche", "Putzen", "Müll", "Garten", "Ordnung", "Einkauf", "Sonstiges"];
const GRUPPEN_ICON = { "Wäsche": "🧺", "Küche": "🍽️", "Putzen": "🧽", "Müll": "🗑️", "Garten": "🌱", "Ordnung": "🧹", "Einkauf": "🛒", "Sonstiges": "📌" };
function gruppeRaten(name) {
  const n = String(name || "").toLowerCase();   // läuft schon beim Laden – darum ohne Hilfsfunktionen aus haushalt.js
  if (/wäsch|wasch|bügel|klamotten waschen/.test(n)) return "Wäsche";
  if (/müll|sack|tonne|altpapier|glas wegbringen|pfand/.test(n)) return "Müll";
  if (/spül|abtrock|geschirr|küche|kochen|kühlschrank|herd|backofen/.test(n)) return "Küche";
  if (/saug|wisch|putz|staub|fenster|bad|klo|toilette|reinig/.test(n)) return "Putzen";
  if (/rasen|garten|hecke|gieß|pflanze|blume|unkraut|laub/.test(n)) return "Garten";
  if (/aufräum|räumen|klamotten|sortier|ordnung/.test(n)) return "Ordnung";
  if (/einkauf|besorg|markt/.test(n)) return "Einkauf";
  return "Sonstiges";
}
const DEFAULT_AUFGABEN = [
  ["Staubsaugen", 30], ["30°C Wäsche waschen", 10], ["40°C Wäsche waschen", 10], ["60°C Wäsche waschen", 10], ["Bettwäsche waschen", 20],
  ["Müll rausbringen", 5], ["Gelber Sack", 5], ["Spülmaschine aus- und einräumen", 15], ["Boden wischen", 30], ["Rasen mähen", 45],
  ["Abspülen", 20], ["Abtrocknen", 15], ["Wäsche aufhängen", 15], ["Wäsche abnehmen", 10], ["Klamotten aufräumen", 15],
  ["Bad putzen", 30], ["Staub wischen", 20], ["Einkaufen", 45]
].map(([name, dauer]) => ({ name, dauer, gruppe: gruppeRaten(name) }));
registerData(["planAufgaben"], (d) => {
  const h = d.settings.haushalt = d.settings.haushalt || {};
  if (!Array.isArray(h.aufgaben)) h.aufgaben = DEFAULT_AUFGABEN.map((a) => Object.assign({}, a));
  h.aufgaben.forEach((a) => { if (!a.gruppe) a.gruppe = gruppeRaten(a.name); });   // ältere Listen ohne Gruppe
  h.zeit = Object.assign({ werktag: 60, wochenende: 180 }, h.zeit || {});
});
const PLAN_MIN = 5, PLAN_MAX = 10;
const ps = { off: 0 };
const aufgabenOf = (d) => db.planAufgaben.filter((x) => x.datum === d).sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0) || (a.upd || "").localeCompare(b.upd || ""));
const katalog = () => hhSet().aufgaben;
const gruppenListe = () => { const da = [...new Set(katalog().map((a) => a.gruppe || "Sonstiges"))]; return [...GRUPPEN.filter((g) => da.includes(g)), ...da.filter((g) => !GRUPPEN.includes(g)).sort((a, b) => a.localeCompare(b, "de"))]; };
const alleGruppen = () => [...new Set([...GRUPPEN, ...gruppenListe()])];
const gIcon = (g) => GRUPPEN_ICON[g] || "📌";
const katalogBy = (name) => katalog().find((a) => normName(a.name) === normName(name));
const istWochenende = (iso) => [0, 6].includes(new Date(iso + "T12:00:00Z").getUTCDay());
const verfuegbar = (iso) => hhSet().zeit[istWochenende(iso) ? "wochenende" : "werktag"] || 0;
const PCOL = ["#5B7BC9", "#D9A441", "#3FA2A2", "#C46A8A", "#7FB07A", "#9C84C9"];
const personFarbe = (email) => PCOL[Math.max(0, db.mitglieder.findIndex((m) => m.id === email)) % PCOL.length];
const initial = (email) => (Store.memberName(email) || "?").slice(0, 1).toUpperCase();
const avatars = (ps) => ps.map((p) => `<span class="pav" style="background:${personFarbe(p)}" title="${esc(Store.memberName(p))}">${esc(initial(p))}</span>`).join("");

/* ---------- Ansicht ---------- */
function tagesZeit(d) {
  const list = aufgabenOf(d), summe = list.reduce((s, x) => s + (x.dauer || 0), 0), offen = list.filter((x) => !x.erledigt).reduce((s, x) => s + (x.dauer || 0), 0);
  const pro = {}; list.forEach((x) => (x.personen || []).forEach((p) => (pro[p] = (pro[p] || 0) + (x.dauer || 0))));
  return { summe, offen, pro, max: verfuegbar(d) };
}
function viewPlan() {
  const t = todayISO(), start = isoAdd(t, ps.off * 7), tage = Array.from({ length: 7 }, (_, i) => isoAdd(start, i));
  const titel = ps.off === 0 ? "Ab heute" : ps.off === 1 ? "Nächste Woche" : ps.off === -1 ? "Letzte Woche" : `${fDate(start).slice(0, 6)} – ${fDate(tage[6]).slice(0, 6)}`;
  return `<div class="period"><button data-poff="-1" aria-label="Woche zurück">‹</button>
      <div class="pl"><b>${titel}</b><span>${fDate(start).slice(0, 6)} – ${fDate(tage[6]).slice(0, 6)}</span></div>
      <button data-poff="1" aria-label="Woche vor">›</button></div>
    ${ps.off !== 0 ? `<div style="text-align:center;margin:-4px 0 10px"><button class="btn small ghost" data-poff="0">Zu heute</button></div>` : ""}
    <div class="wgrid">${tage.map((d) => dayCardPlan(d, t)).join("")}</div>`;
}
function dayCardPlan(d, t) {
  const list = aufgabenOf(d), z = tagesZeit(d);
  const pct = z.max ? Math.min(100, Math.round(z.summe / z.max * 100)) : 0, ueber = z.max && z.summe > z.max;
  const rows = list.map((x) => `<div class="prow ${x.erledigt ? "done" : ""}">
      <button class="pbox" data-pcheck="${x.id}" aria-label="${x.erledigt ? "Wieder offen" : "Erledigt"}">${x.erledigt ? "✓" : ""}</button>
      <button class="ptext" data-pedit="${x.id}"><span class="pn">${esc(x.name)}</span><span class="pmeta">${avatars(x.personen || [])}<span class="pd">${minLabel(x.dauer) || ""}</span></span></button></div>`);
  const leer = Math.max(0, PLAN_MIN - list.length);
  for (let i = 0; i < leer; i++) rows.push(`<button class="prow pempty" data-padd="${d}"><span class="sv leer">+</span></button>`);
  const mehr = list.length >= PLAN_MIN && list.length < PLAN_MAX;
  const leute = Object.entries(z.pro).filter(([p]) => Store.member(p)).map(([p, m]) => `<span>${avatars([p])} ${minLabel(m)}</span>`).join("");
  return `<div class="dcard ${d === t ? "today" : ""} ${d < t ? "past" : ""}">
      <div class="dtitle"><b>${esc(tagKurz(d))}</b><span class="ptime ${ueber ? "over" : ""}" title="Geplant / verfügbar">⏱ ${z.summe ? minLabel(z.summe) : "0 min"}${z.max ? ` / ${minLabel(z.max)}` : ""}</span></div>
      ${d === t || d === isoAdd(t, 1) ? `<div class="dsub">${esc(wochentag(d))}</div>` : ""}
      ${z.max ? `<div class="pbar ${ueber ? "over" : ""}"><i style="width:${pct}%"></i></div>` : ""}
      ${rows.join("")}
      ${mehr ? `<button class="pmore" data-padd="${d}">+ weitere Aufgabe</button>` : ""}
      ${leute && Store.multi() ? `<div class="ppeople">${leute}</div>` : ""}
    </div>`;
}

/* ---------- Aufgabenliste nach Gruppen zum Antippen ---------- */
function aufgabeWaehlen() {
  return new Promise((res) => {
    const m = modal({ title: "Aufgabe wählen", onClose: () => res(null), body: gruppenListe().map((g) => {
      const list = katalog().filter((a) => (a.gruppe || "Sonstiges") === g).sort((a, b) => a.name.localeCompare(b.name, "de"));
      return `<div class="pick-group">${gIcon(g)} ${esc(g)}</div><div class="pick-sub">${list.map((a) => `<button data-kn="${esc(a.name)}">${esc(a.name)}${a.dauer ? `<small>${minLabel(a.dauer)}</small>` : ""}</button>`).join("")}</div>`;
    }).join("") || `<div class="empty">Die Aufgabenliste ist leer. Aufgaben ergänzt du in den Einstellungen oder beim Eintragen.</div>` });
    m.addEventListener("click", (e) => { const b = e.target.closest("[data-kn]"); if (b) { m.onClose = null; closeModal(m); res(katalogBy(b.dataset.kn)); } });
  });
}

/* ---------- Eintragen / Bearbeiten ---------- */
function planDialog(d, id = null) {
  const x = id ? clone(db.planAufgaben.find((y) => y.id === id)) : null;
  if (!x && aufgabenOf(d).length >= PLAN_MAX) return toast(`Höchstens ${PLAN_MAX} Aufgaben pro Tag`);
  const multi = Store.multi(), mitglieder = db.mitglieder;
  let wer = x ? [...(x.personen || [])] : (ME() ? [ME()] : []);
  const tage = Array.from({ length: 21 }, (_, i) => isoAdd(todayISO(), i - 7));
  if (!tage.includes(d)) tage.unshift(d);
  const m = modal({ title: x ? "Aufgabe bearbeiten" : `Aufgabe · ${tagLabel(d)}`, body: `<form data-f onsubmit="return false">
      <div class="f"><span class="flabel">Aufgabe</span><div class="combo"><div class="sugwrap"><input name="name" value="${esc(x?.name || "")}" placeholder="eintippen oder aus der Liste wählen" maxlength="60" data-pname></div>
        <button type="button" class="btn combo-btn" data-plist aria-label="Aus der Aufgabenliste wählen">☰ Liste</button></div></div>
      <div class="row2"><label class="f"><span>Dauer (min)</span><input name="dauer" inputmode="numeric" value="${x?.dauer ?? ""}" placeholder="15" data-pdauer></label>
      <label class="f"><span>Tag</span><select name="datum">${tage.map((t) => `<option value="${t}" ${t === (x?.datum || d) ? "selected" : ""}>${esc(tagLabel(t))}</option>`).join("")}</select></label></div>
      <div class="chips wrap" style="margin:-4px 0 12px">${[5, 10, 15, 20, 30, 45, 60, 90].map((n) => `<button type="button" class="chip" data-pmin="${n}">${minLabel(n)}</button>`).join("")}</div>
      ${multi ? `<div class="f"><span class="flabel">Wer?</span><div class="chips wrap" data-pwer></div></div>` : ""}
      <div data-pkatrow style="display:none"><label class="f check"><input type="checkbox" name="katalog" checked><span><b>In die Aufgabenliste übernehmen</b><small>dann wird sie beim nächsten Mal mit dieser Dauer vorgeschlagen</small></span></label>
        <label class="f"><span>Gruppe</span><select name="gruppe">${alleGruppen().map((g) => `<option ${g === "Sonstiges" ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label></div>
    </form>`,
    foot: `${x ? `<button class="btn danger" data-pdel>Löschen</button>` : ""}<button class="btn primary" data-psave>Speichern</button>` });
  const name = $("[data-pname]", m), dauer = $("[data-pdauer]", m), katrow = $("[data-pkatrow]", m);
  const drawWer = () => { const el = $("[data-pwer]", m); if (el) el.innerHTML = mitglieder.map((p) => `<button type="button" class="chip ${wer.includes(p.id) ? "on" : ""}" data-pp="${esc(p.id)}">${avatars([p.id])} ${esc(p.id === ME() ? "Ich" : firstName(p.name))}</button>`).join(""); };
  const sync = () => {
    const neu = name.value.trim() && !katalogBy(name.value);
    katrow.style.display = neu ? "" : "none";
    if (neu) $("select[name=gruppe]", m).value = gruppeRaten(name.value);
  };
  attachSuggest(name, (q) => katalog().filter((a) => normName(a.name).includes(normName(q))).sort((a, b) => normName(b.name).startsWith(normName(q)) - normName(a.name).startsWith(normName(q)))
    .map((a) => ({ label: a.name, sub: [a.gruppe, minLabel(a.dauer)].filter(Boolean).join(" · "), value: a })), (it) => { name.value = it.value.name; dauer.value = it.value.dauer || ""; sync(); dauer.focus(); });
  name.addEventListener("input", () => { const k = katalogBy(name.value); if (k && !dauer.value) dauer.value = k.dauer; sync(); });
  drawWer(); sync();
  if (!x) setTimeout(() => name.focus(), 60);
  m.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pp]"); if (p) { const v = p.dataset.pp; wer = wer.includes(v) ? wer.filter((y) => y !== v) : [...wer, v]; return drawWer(); }
    const mn = e.target.closest("[data-pmin]"); if (mn) { dauer.value = mn.dataset.pmin; return; }
    if (e.target.closest("[data-plist]")) aufgabeWaehlen().then((a) => { if (!a) return; name.value = a.name; dauer.value = a.dauer || ""; sync(); });
  });
  const save = () => {
    const f = readForm($("[data-f]", m)); if (!f.name) return toast("Bitte eine Aufgabe eingeben");
    const min = parseInt(String(f.dauer).replace(/[^\d]/g, ""), 10) || 0;
    if (f.datum !== (x?.datum || d) && aufgabenOf(f.datum).length >= PLAN_MAX) return toast(`${tagLabel(f.datum)} hat schon ${PLAN_MAX} Aufgaben`);
    if (!katalogBy(f.name) && f.katalog) { katalog().push({ name: f.name, dauer: min, gruppe: f.gruppe || gruppeRaten(f.name) }); Store.touch("settings"); }
    const rec = x || { id: "p" + uid(), erledigt: false, pos: Date.now(), by: ME() };
    Object.assign(rec, { datum: f.datum, name: f.name, dauer: min, personen: multi ? wer : [] });
    Store.put("planAufgaben", rec); Store.commit(); closeModal(m); render();
  };
  $("[data-psave]", m).onclick = save;
  name.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); save(); } });
  dauer.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  const del = $("[data-pdel]", m);
  if (del) del.onclick = () => {
    const copy = clone(x); Store.del("planAufgaben", x.id); Store.commit(); closeModal(m); render();
    toast(`${x.name} entfernt`, { label: "Rückgängig", fn: () => { Store.put("planAufgaben", copy); Store.commit(); render(); } });
  };
}

/* =================================================================== Modul */
const Haushaltsplan = {
  id: "plan", group: "Haushalt", title: "Haushaltsplan", icon: "🧹", hint: "Wer macht was – und wann",
  bereich: () => "haushalt",
  settingsPage: "plan",
  settingsHint: () => `${katalog().length} Aufgaben · ${minLabel(hhSet().zeit.werktag)} werktags`,
  view: viewPlan,
  click(e) {
    const o = e.target.closest("[data-poff]"); if (o) { ps.off = o.dataset.poff === "0" ? 0 : ps.off + (+o.dataset.poff); render(); return true; }
    const c = e.target.closest("[data-pcheck]");
    if (c) { const x = clone(db.planAufgaben.find((y) => y.id === c.dataset.pcheck)); x.erledigt = !x.erledigt; Store.put("planAufgaben", x); Store.commit(); render(); return true; }
    const ed = e.target.closest("[data-pedit]"); if (ed) { const x = db.planAufgaben.find((y) => y.id === ed.dataset.pedit); planDialog(x.datum, x.id); return true; }
    const a = e.target.closest("[data-padd]"); if (a) { planDialog(a.dataset.padd); return true; }
    return false;
  },
  /* Einstellungen › Haushaltsplan: Aufgabenliste mit Dauer, verfügbare Zeit */
  settingsView() {
    const z = hhSet().zeit;
    return `<div class="h3"><span>Verfügbare Zeit pro Tag</span></div>
      <div class="card"><div class="row2">
        <label class="f"><span>Werktag (Mo–Fr), Minuten</span><input inputmode="numeric" value="${z.werktag}" data-pzeit="werktag"></label>
        <label class="f"><span>Wochenende, Minuten</span><input inputmode="numeric" value="${z.wochenende}" data-pzeit="wochenende"></label></div>
        <p class="sub" style="margin:0">Wie viel Zeit ihr für den Haushalt habt. Plant ihr mehr ein, wird der Tag rot markiert. 0 = keine Anzeige.</p></div>
      <div class="h3"><span>Aufgaben</span></div>
      ${gruppenListe().map((g) => `<div class="pick-group">${gIcon(g)} ${esc(g)}</div><div class="list">${katalog().map((a, i) => [a, i]).filter(([a]) => (a.gruppe || "Sonstiges") === g).sort(([a], [b]) => a.name.localeCompare(b.name, "de")).map(([a, i]) => `<div class="item"><span class="m"><span class="t">${esc(a.name)}</span><span class="s">${a.dauer ? minLabel(a.dauer) : "ohne Dauer"}</span></span>
        <button class="btn small" data-kedit="${i}">Ändern</button><button class="btn small ghost" data-kdel="${i}">Entfernen</button></div>`).join("")}</div>`).join("")}
      <div class="btns" style="margin-top:12px"><button class="btn primary" data-kadd>+ Aufgabe</button></div>
      <p class="sub">Die Aufgaben werden beim Eintragen mit ihrer Dauer vorgeschlagen. Entfernen ändert nichts an schon geplanten Einträgen.</p>`;
  },
  settingsClick(e) {
    const del = e.target.closest("[data-kdel]");
    if (del) { katalog().splice(+del.dataset.kdel, 1); Store.touch("settings"); Store.commit(); render(); return true; }
    const ed = e.target.closest("[data-kedit]"), add = e.target.closest("[data-kadd]");
    if (ed || add) { katalogDialog(ed ? +ed.dataset.kedit : null); return true; }
    return false;
  }
};
function katalogDialog(i) {
  const a = i == null ? { name: "", dauer: 15, gruppe: "Sonstiges" } : katalog()[i];
  const m = modal({ title: i == null ? "Neue Aufgabe" : "Aufgabe ändern", body: `<form data-f onsubmit="return false">
      <label class="f"><span>Aufgabe</span><input name="name" value="${esc(a.name)}" placeholder="z. B. Fenster putzen"></label>
      <label class="f"><span>Dauer (min)</span><input name="dauer" inputmode="numeric" value="${a.dauer || ""}"></label>
      <label class="f"><span>Gruppe</span><select name="gruppe" data-kg>${alleGruppen().map((g) => `<option ${g === (a.gruppe || "Sonstiges") ? "selected" : ""}>${esc(g)}</option>`).join("")}<option value="__neu">+ Neue Gruppe …</option></select></label></form>`,
    foot: `<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Speichern</button>` });
  $("[data-kg]", m).addEventListener("change", async (e) => {
    if (e.target.value !== "__neu") return;
    const g = await promptBox("Neue Gruppe", "", "z. B. Auto");
    const sel = e.target;
    if (g) { const o = document.createElement("option"); o.textContent = g; sel.insertBefore(o, sel.lastElementChild); sel.value = g; } else sel.value = a.gruppe || "Sonstiges";
  });
  $("[data-ok]", m).onclick = () => {
    const f = readForm($("[data-f]", m)); if (!f.name) return toast("Bitte einen Namen eingeben");
    const dop = katalogBy(f.name); if (dop && dop !== a) return toast("Diese Aufgabe gibt es schon");
    const rec = { name: f.name, dauer: parseInt(String(f.dauer).replace(/[^\d]/g, ""), 10) || 0, gruppe: f.gruppe || "Sonstiges" };
    if (i == null) katalog().push(rec); else katalog()[i] = rec;
    Store.touch("settings"); Store.commit(); closeModal(m); render();
  };
}
/* Zeitfelder in den Einstellungen speichern, sobald man sie verlässt */
document.addEventListener("change", (e) => {
  const z = e.target.closest?.("[data-pzeit]"); if (!z) return;
  hhSet().zeit[z.dataset.pzeit] = Math.max(0, parseInt(String(z.value).replace(/[^\d]/g, ""), 10) || 0);
  Store.touch("settings"); Store.commit(); render();
});
