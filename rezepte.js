/* Haushalt – Modul „Rezepte“: alle Rezepte und Gerichte des Haushalts
 * Rezept: Titel, Tags, Portionen, Zeiten, Ofen (Temperatur, Art, Dauer), Zutaten (eine Zeile je Zutat), Zubereitung, Notiz.
 * Verknüpft mit Einkaufsliste (Zutaten übertragen) und Essensplan (Gericht eintragen / Rezept aus Gericht anlegen).
 */
"use strict";

registerData(["rezepte"]);
const OFEN_ART = ["", "Ober-/Unterhitze", "Umluft", "Grill", "Heißluft"];
const rz = { q: "", tag: null, open: null, from: null };   // Suche, Tag-Filter, geöffnetes Rezept, Rückweg (z. B. Essensplan)
const rezeptById = (id) => db.rezepte.find((r) => r.id === id);
const rezeptByTitel = (t) => db.rezepte.find((r) => normName(r.titel) === normName(t));
const rezeptLeer = (r) => !r.zutaten?.length && !String(r.zubereitung || "").trim();
const alleTags = () => [...new Set([...hhSet().tags, ...db.rezepte.flatMap((r) => r.tags || [])])];

/* Rezept nur mit Titel anlegen (aus dem Essensplan heraus) – Rest bleibt leer */
function rezeptStub(titel) {
  const vorhanden = rezeptByTitel(titel); if (vorhanden) return vorhanden;
  return Store.put("rezepte", { id: "r" + uid(), titel: titel.trim(), tags: [], portionen: "", zeitVor: null, zeitGesamt: null, ofenTemp: null, ofenArt: "", ofenDauer: null, zutaten: [], zubereitung: "", notiz: "", by: ME() });
}
function rezeptChips(r) {
  const c = [];
  if (r.portionen) c.push(`👥 ${esc(r.portionen)}${/^\d+$/.test(String(r.portionen).trim()) ? " Portionen" : ""}`);
  if (r.zeitVor) c.push(`🔪 ${minLabel(r.zeitVor)} Vorbereitung`);
  if (r.zeitGesamt) c.push(`⏱ ${minLabel(r.zeitGesamt)} gesamt`);
  if (r.ofenTemp || r.ofenArt || r.ofenDauer) c.push(`🔥 ${[r.ofenTemp ? r.ofenTemp + " °C" : "", r.ofenArt, r.ofenDauer ? minLabel(r.ofenDauer) : ""].filter(Boolean).join(" · ")}`);
  return c;
}

/* ---------- Liste ---------- */
function viewRezepte() {
  const q = normName(rz.q), tags = alleTags().filter((t) => db.rezepte.some((r) => r.tags?.includes(t)));
  const list = db.rezepte.filter((r) => (!rz.tag || r.tags?.includes(rz.tag)) && (!q || [r.titel, ...(r.tags || []), ...(r.zutaten || [])].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => a.titel.localeCompare(b.titel, "de"));
  return `<div class="toolbar"><input type="search" placeholder="Rezept oder Zutat suchen" value="${esc(rz.q)}" data-rq></div>
    ${tags.length ? `<div class="chips">${[`<button class="chip ${!rz.tag ? "on" : ""}" data-rtag="">Alle</button>`, ...tags.map((t) => `<button class="chip ${rz.tag === t ? "on" : ""}" data-rtag="${esc(t)}">${esc(t)}</button>`)].join("")}</div>` : ""}
    ${list.length ? `<div class="rgrid">${list.map((r) => `<button class="rcard" data-ropen="${r.id}">
        <b>${esc(r.titel)}</b>
        ${r.tags?.length ? `<span class="rtags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</span>` : ""}
        <span class="sub">${rezeptLeer(r) ? "noch nicht ausgefüllt" : [r.zeitGesamt ? "⏱ " + minLabel(r.zeitGesamt) : "", r.ofenTemp ? "🔥 " + r.ofenTemp + " °C" : "", r.zutaten?.length ? r.zutaten.length + " Zutaten" : ""].filter(Boolean).join(" · ")}</span>
      </button>`).join("")}</div>`
      : `<div class="empty"><b>${db.rezepte.length ? "Nichts gefunden" : "Noch keine Rezepte"}</b>${db.rezepte.length ? "Andere Suche oder anderer Tag?" : "Lege das erste Rezept an – oder speichere ein Gericht aus dem Essensplan als Rezept."}</div>`}`;
}

/* ---------- Ansicht eines Rezepts ---------- */
function viewRezept(r) {
  const chips = rezeptChips(r);
  const zubereitung = String(r.zubereitung || "").trim();
  return `${r.tags?.length ? `<div class="rtags" style="margin-bottom:10px">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    ${chips.length ? `<div class="rchips">${chips.map((c) => `<span>${c}</span>`).join("")}</div>` : ""}
    ${rezeptLeer(r) ? `<div class="hint">Dieses Rezept hat bisher nur einen Titel. Tippe auf <b>Bearbeiten</b>, um Zutaten und Zubereitung zu ergänzen.</div>` : ""}
    <div class="cols"><div>
      <div class="h3 first"><span>Zutaten</span>${r.zutaten?.length ? `<button data-rshop>🛒 Auf die Einkaufsliste</button>` : ""}</div>
      ${r.zutaten?.length ? `<div class="list zlist">${r.zutaten.map((z) => { const p = parseZutat(z); return `<div class="item"><span class="zm">${esc(p.menge)}</span><span class="m">${esc(p.name)}</span></div>`; }).join("")}</div>` : `<div class="empty" style="padding:16px">Keine Zutaten eingetragen.</div>`}
    </div><div>
      <div class="h3 first"><span>Zubereitung</span></div>
      ${zubereitung ? `<div class="card zubereitung">${zubereitung.split(/\n\s*\n|\n/).filter((l) => l.trim()).map((l) => `<p>${esc(l)}</p>`).join("")}</div>` : `<div class="empty" style="padding:16px">Noch keine Zubereitung.</div>`}
      ${r.notiz ? `<div class="h3"><span>Notiz</span></div><div class="card">${esc(r.notiz)}</div>` : ""}
    </div></div>
    <div class="btns" style="margin-top:18px">
      <button class="btn primary" data-redit>Bearbeiten</button>
      <button class="btn" data-rplan>📅 In den Essensplan</button>
      <button class="btn ghost" data-rdel>Löschen</button></div>`;
}

/* ---------- Bearbeiten ---------- */
function editRezept(id, preset = {}) {
  const isNew = !id;
  const r = isNew ? Object.assign({ id: "r" + uid(), titel: "", tags: [], portionen: "", zeitVor: null, zeitGesamt: null, ofenTemp: null, ofenArt: "", ofenDauer: null, zutaten: [], zubereitung: "", notiz: "", by: ME() }, preset) : clone(rezeptById(id));
  let tags = [...(r.tags || [])];
  const m = modal({ title: isNew ? "Neues Rezept" : "Rezept bearbeiten", full: true, cls: "rform", body: `<form data-f onsubmit="return false">
      <label class="f"><span>Titel</span><input name="titel" value="${esc(r.titel)}" placeholder="Spaghetti Bolognese"></label>
      <div class="f"><span class="flabel">Tags</span><div class="chips wrap" data-tags></div></div>
      <div class="row3">
        <label class="f"><span>Portionen</span><input name="portionen" inputmode="numeric" value="${esc(r.portionen)}" placeholder="4"></label>
        <label class="f"><span>Vorbereitung (min)</span><input name="zeitVor" inputmode="numeric" value="${r.zeitVor ?? ""}" placeholder="15"></label>
        <label class="f"><span>Gesamtzeit (min)</span><input name="zeitGesamt" inputmode="numeric" value="${r.zeitGesamt ?? ""}" placeholder="45"></label></div>
      <div class="row3">
        <label class="f"><span>Ofen °C</span><input name="ofenTemp" inputmode="numeric" value="${r.ofenTemp ?? ""}" placeholder="–"></label>
        <label class="f"><span>Ofen-Art</span><select name="ofenArt">${OFEN_ART.map((a) => `<option value="${esc(a)}" ${r.ofenArt === a ? "selected" : ""}>${a || "–"}</option>`).join("")}</select></label>
        <label class="f"><span>Im Ofen (min)</span><input name="ofenDauer" inputmode="numeric" value="${r.ofenDauer ?? ""}" placeholder="–"></label></div>
      <label class="f"><span>Zutaten – eine pro Zeile</span><textarea name="zutaten" rows="8" placeholder="500 g Spaghetti&#10;400 g Hackfleisch&#10;1 Zwiebel">${esc((r.zutaten || []).join("\n"))}</textarea></label>
      <label class="f"><span>Zubereitung</span><textarea name="zubereitung" rows="8" placeholder="Zwiebel würfeln und anbraten …">${esc(r.zubereitung || "")}</textarea></label>
      <label class="f"><span>Notiz / Quelle</span><input name="notiz" value="${esc(r.notiz || "")}" placeholder="von Oma, Kochbuch S. 42 …"></label></form>`,
    foot: `<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-save>Speichern</button>` });
  const drawTags = () => {
    $("[data-tags]", m).innerHTML = [...new Set([...alleTags(), ...tags])].map((t) => `<button type="button" class="chip ${tags.includes(t) ? "on" : ""}" data-t="${esc(t)}">${esc(t)}</button>`).join("") + `<button type="button" class="chip" data-tnew>+ Tag</button>`;
  };
  drawTags();
  m.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-t]");
    if (t) { const v = t.dataset.t; tags = tags.includes(v) ? tags.filter((x) => x !== v) : [...tags, v]; return drawTags(); }
    if (e.target.closest("[data-tnew]")) {
      const v = await promptBox("Neuer Tag", "", "z. B. Grillen"); if (!v) return;
      if (!hhSet().tags.some((x) => normName(x) === normName(v))) { hhSet().tags.push(v); Store.touch("settings"); }
      if (!tags.includes(v)) tags.push(v);
      return drawTags();
    }
  });
  const num = (v) => { const n = parseInt(String(v).replace(/[^\d]/g, ""), 10); return isFinite(n) && n > 0 ? n : null; };
  $("[data-save]", m).onclick = () => {
    const f = readForm($("[data-f]", m));
    if (!f.titel) return toast("Bitte einen Titel eingeben");
    const andere = rezeptByTitel(f.titel); if (andere && andere.id !== r.id) return toast("Ein Rezept mit diesem Titel gibt es schon");
    Object.assign(r, { titel: f.titel, tags, portionen: f.portionen, zeitVor: num(f.zeitVor), zeitGesamt: num(f.zeitGesamt), ofenTemp: num(f.ofenTemp), ofenArt: f.ofenArt, ofenDauer: num(f.ofenDauer),
      zutaten: String(f.zutaten || "").split("\n").map((z) => z.trim()).filter(Boolean), zubereitung: String(f.zubereitung || "").trim(), notiz: f.notiz });
    Store.put("rezepte", r); Store.commit(); closeModal(m);
    if (isNew) openRezept(r.id); else render();
    toast("Rezept gespeichert");
  };
}

/* ---------- Zutaten → Einkaufsliste ---------- */
function zutatenZurListe(r) {
  const offen = new Set(db.einkauf.filter((x) => !x.erledigt).map((x) => normName(x.name)));
  const m = modal({ title: "Auf die Einkaufsliste", body: `<p class="sub" style="margin-top:0">Was ihr schon im Haus habt, einfach abwählen.</p>
      <div class="list">${r.zutaten.map((z, i) => { const p = parseZutat(z), da = offen.has(normName(p.name)); return `<label class="item checkrow"><input type="checkbox" data-i="${i}" ${da ? "" : "checked"}>
        <span class="m"><span class="t">${esc(p.name)}</span><span class="s">${esc(p.menge)}${da ? `${p.menge ? " · " : ""}steht schon auf der Liste` : ""}</span></span></label>`; }).join("")}</div>`,
    foot: `<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Übertragen</button>` });
  $("[data-ok]", m).onclick = () => {
    const sel = $$("[data-i]", m).filter((c) => c.checked).map((c) => parseZutat(r.zutaten[+c.dataset.i]));
    sel.forEach((p) => einkaufAdd(p.name, p.menge, { notiz: r.titel }));
    Store.commit(); closeModal(m); render();
    toast(`${sel.length} ${sel.length === 1 ? "Zutat" : "Zutaten"} auf der Einkaufsliste`, { label: "Ansehen", fn: () => goModule("einkauf") });
  };
}

/* ---------- Rezept → Essensplan ---------- */
function rezeptInPlan(r) {
  const tage = Array.from({ length: 14 }, (_, i) => isoAdd(todayISO(), i));
  const slots = SLOTS.filter(([k]) => hhSet().mahlzeiten.includes(k));
  const m = modal({ title: "In den Essensplan", body: `<label class="f"><span>Tag</span><select data-tag>${tage.map((t) => `<option value="${t}">${esc(tagLabel(t))}</option>`).join("")}</select></label>
      <label class="f"><span>Mahlzeit</span><select data-slot>${slots.map(([k, l]) => `<option value="${k}" ${k === "abend" ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${Store.multi() ? `<p class="sub">„Vorschlagen“ stellt es zur Abstimmung, „Fest eintragen“ legt es gleich fest.</p>` : ""}`,
    foot: `${Store.multi() ? `<button class="btn" data-v>Vorschlagen</button>` : ""}<button class="btn primary" data-fest>Fest eintragen</button>` });
  const go = (fest) => {
    const d = $("[data-tag]", m).value, s = $("[data-slot]", m).value;
    if (fest) essenFest(d, s, r.titel, r.id); else essenVorschlag(d, s, r.titel, r.id);
    Store.commit(); closeModal(m); render();
    toast(`${r.titel}: ${tagLabel(d)}, ${SLOTS.find(([k]) => k === s)[1]}`, { label: "Ansehen", fn: () => goModule("essen") });
  };
  $("[data-fest]", m).onclick = () => go(true);
  const v = $("[data-v]", m); if (v) v.onclick = () => go(false);
}

function openRezept(id, from = null) {
  if (curId !== "rezepte") { curId = "rezepte"; lsSet(LS.module, curId); }
  rz.open = id; rz.from = from;
  history.pushState({ sub: 1 }, "");
  render(); window.scrollTo(0, 0);
}


/* ============================================================ Import (JSON) */
/* Format: [{titel, tags[], portionen, zeitVor, zeitGesamt, ofenTemp, ofenArt, ofenDauer, zutaten[], zubereitung, notiz}]
   oder {rezepte:[…]}. Rezepte mit vorhandenem Titel werden übersprungen. */
function rezepteImportieren() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    f.text().then((txt) => {
      let data; try { data = JSON.parse(txt); } catch { toast("Datei ist kein gültiges JSON"); return; }
      const liste = (Array.isArray(data) ? data : data.rezepte || []).filter((r) => r && String(r.titel || "").trim());
      if (!liste.length) { toast("Keine Rezepte in der Datei gefunden"); return; }
      importVorschau(liste);
    });
  };
  inp.click();
}
function importVorschau(liste) {
  const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
  const neu = [], doppelt = [], gesehen = new Set();
  liste.forEach((r) => { const k = normName(r.titel); (rezeptByTitel(r.titel) || gesehen.has(k) ? doppelt : neu).push(r); gesehen.add(k); });
  const m = modal({ title: "Rezepte importieren", full: true, body: `
    <p class="sub" style="margin-top:0">${neu.length} neue Rezepte${doppelt.length ? ` · ${doppelt.length} schon vorhanden (werden übersprungen)` : ""}. Abwählen, was nicht übernommen werden soll.</p>
    <div class="list">${neu.map((r, i) => `<label class="item checkrow"><input type="checkbox" data-imp="${i}" checked>
      <span class="m"><span class="t">${esc(r.titel)}</span><span class="s">${[(r.zutaten || []).length + " Zutaten", (r.tags || []).join(", ")].filter(Boolean).join(" · ")}</span></span></label>`).join("")}</div>
    ${doppelt.length ? `<div class="h3"><span>Übersprungen</span></div><div class="list">${doppelt.map((r) => `<div class="item"><span class="m"><span class="t">${esc(r.titel)}</span><span class="s">gibt es schon</span></span></div>`).join("")}</div>` : ""}`,
    foot: `<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-go ${neu.length ? "" : "disabled"}>Importieren</button>` });
  $("[data-go]", m).onclick = () => {
    const sel = $$("[data-imp]", m).filter((c) => c.checked).map((c) => neu[+c.dataset.imp]);
    const tags = hhSet().tags; let tagsNeu = false;
    sel.forEach((r) => {
      (r.tags || []).forEach((t) => { if (!tags.some((x) => normName(x) === normName(t))) { tags.push(t); tagsNeu = true; } });
      Store.put("rezepte", { id: "r" + uid(), titel: String(r.titel).trim(), tags: (r.tags || []).slice(), portionen: String(r.portionen || ""),
        zeitVor: num(r.zeitVor), zeitGesamt: num(r.zeitGesamt), ofenTemp: num(r.ofenTemp), ofenArt: OFEN_ART.includes(r.ofenArt) ? r.ofenArt : "", ofenDauer: num(r.ofenDauer),
        zutaten: (r.zutaten || []).map((z) => String(z).trim()).filter(Boolean), zubereitung: String(r.zubereitung || "").trim(), notiz: String(r.notiz || ""), by: ME() });
    });
    if (tagsNeu) Store.touch("settings");
    Store.commit(); closeModal(m); render();
    toast(`${sel.length} Rezepte importiert`);
  };
}

/* =================================================================== Modul */
const Rezepte = {
  id: "rezepte", group: "Haushalt", title: "Rezepte", icon: "📖", hint: "Gerichte und Rezepte sammeln",
  bereich: () => "haushalt",
  settingsPage: "rezepte",
  settingsHint: () => `${hhSet().tags.length} Tags`,
  back: () => !!rz.open,
  goBack() { const from = rz.from; rz.open = null; rz.from = null; if (from) goModule(from); else { render(); window.scrollTo(0, 0); } },
  top: () => { const r = rz.open && rezeptById(rz.open); return r ? `<b>${esc(r.titel)}</b>` : ""; },
  view() {
    const r = rz.open && rezeptById(rz.open);
    if (rz.open && !r) rz.open = null;
    return r ? viewRezept(r) : viewRezepte();
  },
  bottom: () => rz.open ? "" : `<button class="fab" data-rnew aria-label="Neues Rezept">+<span class="fab-l">Neues Rezept</span></button>`,
  click(e) {
    const o = e.target.closest("[data-ropen]"); if (o) { openRezept(o.dataset.ropen); return true; }
    const t = e.target.closest("[data-rtag]"); if (t) { rz.tag = t.dataset.rtag || null; render(); return true; }
    if (e.target.closest("[data-rnew]")) { editRezept(null); return true; }
    const r = rz.open && rezeptById(rz.open); if (!r) return false;
    if (e.target.closest("[data-redit]")) { editRezept(r.id); return true; }
    if (e.target.closest("[data-rshop]")) { zutatenZurListe(r); return true; }
    if (e.target.closest("[data-rplan]")) { rezeptInPlan(r); return true; }
    if (e.target.closest("[data-rdel]")) {
      confirmBox("Rezept löschen?", `„${esc(r.titel)}“ wird für alle im Haushalt gelöscht. Einträge im Essensplan bleiben als Text stehen.`, "Löschen", true).then((ok) => {
        if (!ok) return; const copy = clone(r);
        Store.del("rezepte", r.id); Store.commit(); this.goBack();
        toast("Rezept gelöscht", { label: "Rückgängig", fn: () => { Store.put("rezepte", copy); Store.commit(); render(); } });
      });
      return true;
    }
    return false;
  },
  input(e) {
    if (!e.target.matches("[data-rq]")) return false;
    rz.q = e.target.value; const pos = e.target.selectionStart; render();
    const el = $("[data-rq]"); el.focus(); el.setSelectionRange(pos, pos); return true;
  },
  /* Einstellungen › Rezepte: Tags verwalten */
  settingsView() {
    const used = (t) => db.rezepte.filter((r) => r.tags?.includes(t)).length;
    return `<div class="h3"><span>Tags</span></div>
      <div class="list">${hhSet().tags.map((t) => `<div class="item"><span class="m"><span class="t">${esc(t)}</span><span class="s">${used(t) ? used(t) + " Rezepte" : "noch nicht benutzt"}</span></span>
        <button class="btn small ghost" data-tdel="${esc(t)}" aria-label="${esc(t)} entfernen">Entfernen</button></div>`).join("")}</div>
      <div class="btns" style="margin-top:12px"><button class="btn primary" data-tadd>+ Tag</button></div>
      <p class="sub">Die Tags stehen beim Bearbeiten eines Rezepts zur Auswahl. Entfernen nimmt den Tag nur aus der Auswahl – Rezepte behalten ihn.</p>
      <div class="h3"><span>Importieren</span></div>
      <div class="btns"><button class="btn" data-rimport>Rezepte importieren …</button></div>
      <p class="sub">Liest eine Rezept-Datei (.json) ein und zeigt vor dem Übernehmen eine Übersicht. Rezepte, deren Titel es schon gibt, werden übersprungen.</p>`;
  },
  settingsClick(e) {   // gibt true zurück, wenn der Klick hier behandelt wurde
    if (e.target.closest("[data-rimport]")) { rezepteImportieren(); return true; }
    const d = e.target.closest("[data-tdel]");
    if (d) { hhSet().tags = hhSet().tags.filter((t) => t !== d.dataset.tdel); Store.touch("settings"); Store.commit(); render(); return true; }
    if (e.target.closest("[data-tadd]")) {
      promptBox("Neuer Tag", "", "z. B. Grillen").then((v) => {
        if (v && !hhSet().tags.some((x) => normName(x) === normName(v))) { hhSet().tags.push(v); Store.touch("settings"); Store.commit(); render(); }
      });
      return true;
    }
    return false;
  }
};
