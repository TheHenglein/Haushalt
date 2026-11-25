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
/* Links in Notizen anklickbar machen (Text wird vorher escaped) */
const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]} ↗</a>`);
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
      ${r.notiz ? `<div class="h3"><span>Notiz</span></div><div class="card notiz">${linkify(r.notiz)}</div>` : ""}
    </div></div>
    <div class="btns" style="margin-top:18px">
      <button class="btn primary" data-redit>Bearbeiten</button>
      <button class="btn" data-rplan>📅 In den Essensplan</button>
      <button class="btn" data-rshare>↗ Teilen</button>
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


/* ============================================================ Auswahl-Liste (Pop-up) */
/* Alle Rezepte zum Auswählen – mit Suche und Tag-Filter. Liefert das gewählte Rezept oder null. */
function rezeptWaehlen() {
  return new Promise((res) => {
    const list = db.rezepte.slice().sort((a, b) => a.titel.localeCompare(b.titel, "de"));
    const m = modal({ title: `Rezepte (${list.length})`, full: true, onClose: () => res(null), body: list.length
      ? `<div class="pick-sub rwlist">${list.map((r) => `<button data-rwid="${r.id}">${esc(r.titel)}</button>`).join("")}</div>`
      : `<div class="empty">Noch keine Rezepte gespeichert.</div>` });
    m.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rwid]"); if (b) { m.onClose = null; closeModal(m); res(rezeptById(b.dataset.rwid)); }
    });
  });
}

/* ============================================================ Export / Teilen (JSON) */
/* Dasselbe Format, das der Import liest – ohne interne Felder (id, Urheber, Zeitstempel). */
const EXPORT_FELDER = ["titel", "tags", "portionen", "zeitVor", "zeitGesamt", "ofenTemp", "ofenArt", "ofenDauer", "zutaten", "zubereitung", "notiz"];
const dateiName = (t) => "Rezept_" + String(t).replace(/[^\wäöüÄÖÜß-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 50) + ".txt";
const EXPORT_KOPF = "Rezepte aus der Haushalt-App – zum Übernehmen in der App: Einstellungen › Rezepte › „Rezepte importieren“ (Datei auswählen oder diesen Text einfügen).\n\n";
function rezepteJSON(liste) {
  return EXPORT_KOPF + JSON.stringify({ format: "haushalt-rezepte", version: 1, exportiert: new Date().toISOString(), von: Store.memberName?.(ME()) || "",
    rezepte: liste.map((r) => Object.fromEntries(EXPORT_FELDER.map((k) => [k, r[k] ?? (k === "tags" || k === "zutaten" ? [] : k.startsWith("zeit") || k.startsWith("ofenT") || k === "ofenDauer" ? null : "")]))) }, null, 1);
}
/* Auf dem Handy über das Teilen-Menü (WhatsApp, Mail …), sonst als Download */
async function rezepteTeilen(liste, name) {
  if (!liste.length) return toast("Keine Rezepte ausgewählt");
  const datei = new File([rezepteJSON(liste)], name, { type: "text/plain" });
  const titel = liste.length === 1 ? `Rezept: ${liste[0].titel}` : `${liste.length} Rezepte`;
  if (!isDesktop() && navigator.canShare?.({ files: [datei] })) {
    try { await navigator.share({ files: [datei], title: titel, text: `${titel} – in der Haushalt-App unter Einstellungen › Rezepte › „Rezepte importieren“ einlesen.` }); return true; }
    catch (e) { if (e.name === "AbortError") return false; }   // abgebrochen → nichts tun; anderer Fehler → Download
  } else if (!isDesktop() && navigator.share) {
    // Browser kann keine Dateien teilen → Inhalt als Text teilen (z. B. als WhatsApp-Nachricht); Empfänger fügt ihn beim Import ein
    try { await navigator.share({ title: titel, text: rezepteJSON(liste) }); return true; }
    catch (e) { if (e.name === "AbortError") return false; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(datei); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`${name} gespeichert`); return true;
}
function rezepteExportieren() {
  const alle = db.rezepte.slice().sort((a, b) => a.titel.localeCompare(b.titel, "de"));
  if (!alle.length) return toast("Noch keine Rezepte zum Exportieren");
  const tags = [...new Set(alle.flatMap((r) => r.tags || []))].sort((a, b) => a.localeCompare(b, "de"));
  const gewaehlt = new Set(alle.map((r) => r.id));
  let tag = "";
  const m = modal({ title: "Rezepte exportieren", full: true, body: `
    <p class="sub" style="margin-top:0">Die Datei enthält Titel, Tags, Zeiten, Zutaten, Zubereitung und Notiz – sonst nichts aus deinem Haushalt. Andere lesen sie unter Einstellungen › Rezepte › „Rezepte importieren“ ein.</p>
    <div class="chips wrap" style="margin-bottom:10px"><button class="chip on" data-xt="">Alle</button>${tags.map((t) => `<button class="chip" data-xt="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <div class="btns" style="margin-bottom:8px"><button class="btn small ghost" data-xall>Alle auswählen</button><button class="btn small ghost" data-xnone>Keine</button></div>
    <div class="list" data-xl></div>`,
    foot: `<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-xgo></button>` });
  const sichtbar = () => alle.filter((r) => !tag || (r.tags || []).includes(tag));
  const draw = () => {
    $$("[data-xt]", m).forEach((c) => c.classList.toggle("on", c.dataset.xt === tag));
    $("[data-xl]", m).innerHTML = sichtbar().map((r) => `<label class="item checkrow"><input type="checkbox" data-xr="${r.id}" ${gewaehlt.has(r.id) ? "checked" : ""}>
      <span class="m"><span class="t">${esc(r.titel)}</span><span class="s">${rezeptLeer(r) ? "nur Titel" : (r.zutaten || []).length + " Zutaten"}${r.tags?.length ? " · " + esc(r.tags.join(", ")) : ""}</span></span></label>`).join("");
    const n = sichtbar().filter((r) => gewaehlt.has(r.id)).length;
    const go = $("[data-xgo]", m); go.textContent = `${n} ${n === 1 ? "Rezept" : "Rezepte"} ${isDesktop() ? "speichern" : "teilen"}`; go.disabled = !n;
  };
  m.addEventListener("click", (e) => {
    const t = e.target.closest("[data-xt]"); if (t) { tag = t.dataset.xt; sichtbar().forEach((r) => gewaehlt.add(r.id)); return draw(); }
    if (e.target.closest("[data-xall]")) { sichtbar().forEach((r) => gewaehlt.add(r.id)); return draw(); }
    if (e.target.closest("[data-xnone]")) { sichtbar().forEach((r) => gewaehlt.delete(r.id)); return draw(); }
  });
  m.addEventListener("change", (e) => { const c = e.target.closest("[data-xr]"); if (!c) return; c.checked ? gewaehlt.add(c.dataset.xr) : gewaehlt.delete(c.dataset.xr); draw(); });
  $("[data-xgo]", m).onclick = async () => {
    const liste = sichtbar().filter((r) => gewaehlt.has(r.id));
    const name = liste.length === 1 ? dateiName(liste[0].titel) : `Rezepte_${tag ? tag.replace(/[^\wäöüÄÖÜß-]+/g, "_") + "_" : ""}${todayISO()}.txt`;
    if (await rezepteTeilen(liste, name)) closeModal(m);
  };
  draw();
}

/* ============================================================ Import (JSON) */
/* Format: [{titel, tags[], portionen, zeitVor, zeitGesamt, ofenTemp, ofenArt, ofenDauer, zutaten[], zubereitung, notiz}]
   oder {rezepte:[…]}. Rezepte mit vorhandenem Titel werden übersprungen. */
/* Text → Rezeptliste. Verträgt Text vor/nach dem Datenblock (z. B. Kopfzeile, WhatsApp-Zusätze). */
function rezepteAusText(txt) {
  const t = String(txt || ""), a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  let data; try { data = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  return (Array.isArray(data) ? data : data.rezepte || (data.titel ? [data] : [])).filter((r) => r && String(r.titel || "").trim());
}
function rezepteImportieren() {
  const m = modal({ title: "Rezepte importieren", body: `
    <p class="sub" style="margin-top:0">Eine Rezept-Datei (.txt) auswählen – oder den Text aus einer Nachricht hier einfügen.</p>
    <div class="btns"><button class="btn primary" data-ifile>📄 Datei auswählen …</button></div>
    <label class="f" style="margin-top:14px"><span>Oder Text einfügen</span><textarea data-itext rows="6" placeholder="Hier den kompletten Text einfügen (lange tippen → Einfügen)"></textarea></label>`,
    foot: `<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-igo disabled>Weiter</button>` });
  const ta = $("[data-itext]", m), go = $("[data-igo]", m);
  const weiter = (txt) => {
    const liste = rezepteAusText(txt);
    if (!liste) return toast("Darin sind keine Rezepte aus der Haushalt-App");
    if (!liste.length) return toast("Keine Rezepte gefunden");
    closeModal(m); importVorschau(liste);
  };
  ta.addEventListener("input", () => (go.disabled = !ta.value.trim()));
  go.onclick = () => weiter(ta.value);
  $("[data-ifile]", m).onclick = () => {
    const inp = document.createElement("input"); inp.type = "file";
    inp.onchange = () => { const f = inp.files[0]; if (f) f.text().then(weiter); };
    inp.click();
  };
}
function importVorschau(liste) {
  const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
  const leer = (r) => !(r.zutaten || []).length && !String(r.zubereitung || "").trim();
  // neu = gibt es noch nicht · ergaenzen = vorhandenes Rezept ist noch leer, die Datei bringt Inhalt · doppelt = übersprungen
  const neu = [], ergaenzen = [], doppelt = [], gesehen = new Set();
  liste.forEach((r) => {
    const k = normName(r.titel), vorh = rezeptByTitel(r.titel);
    if (gesehen.has(k)) doppelt.push(r);
    else if (!vorh) neu.push(r);
    else if (leer(vorh) && !leer(r)) ergaenzen.push(r);
    else doppelt.push(r);
    gesehen.add(k);
  });
  const zeile = (r, i, art) => `<label class="item checkrow"><input type="checkbox" data-imp="${art}:${i}" checked>
      <span class="m"><span class="t">${esc(r.titel)}</span><span class="s">${[(r.zutaten || []).length + " Zutaten", (r.tags || []).join(", ")].filter(Boolean).join(" · ")}</span></span></label>`;
  const anzahl = neu.length + ergaenzen.length;
  const m = modal({ title: "Rezepte importieren", full: true, body: `
    <p class="sub" style="margin-top:0">${[neu.length ? `${neu.length} neu` : "", ergaenzen.length ? `${ergaenzen.length} ergänzen vorhandene leere Rezepte` : "", doppelt.length ? `${doppelt.length} schon vorhanden (werden übersprungen)` : ""].filter(Boolean).join(" · ") || "Nichts Neues in der Datei"}. Abwählen, was nicht übernommen werden soll.</p>
    ${neu.length ? `<div class="h3"><span>Neu</span></div><div class="list">${neu.map((r, i) => zeile(r, i, "n")).join("")}</div>` : ""}
    ${ergaenzen.length ? `<div class="h3"><span>Ergänzen</span></div><p class="sub">Diese Rezepte gibt es schon, aber ohne Zutaten und Zubereitung. Leere Felder werden aus der Datei gefüllt, Vorhandenes bleibt.</p>
      <div class="list">${ergaenzen.map((r, i) => zeile(r, i, "e")).join("")}</div>` : ""}
    ${doppelt.length ? `<div class="h3"><span>Übersprungen</span></div><div class="list">${doppelt.map((r) => `<div class="item"><span class="m"><span class="t">${esc(r.titel)}</span><span class="s">gibt es schon</span></span></div>`).join("")}</div>` : ""}`,
    foot: `<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-go ${anzahl ? "" : "disabled"}>Importieren</button>` });
  $("[data-go]", m).onclick = () => {
    const sel = $$("[data-imp]", m).filter((c) => c.checked).map((c) => c.dataset.imp.split(":"));
    const tags = hhSet().tags; let tagsNeu = false, nNeu = 0, nErg = 0;
    const felder = (r) => ({ portionen: String(r.portionen || ""), zeitVor: num(r.zeitVor), zeitGesamt: num(r.zeitGesamt), ofenTemp: num(r.ofenTemp),
      ofenArt: OFEN_ART.includes(r.ofenArt) ? r.ofenArt : "", ofenDauer: num(r.ofenDauer),
      zutaten: (r.zutaten || []).map((z) => String(z).trim()).filter(Boolean), zubereitung: String(r.zubereitung || "").trim(), notiz: String(r.notiz || "") });
    sel.forEach(([art, i]) => {
      const r = (art === "n" ? neu : ergaenzen)[+i];
      (r.tags || []).forEach((t) => { if (!tags.some((x) => normName(x) === normName(t))) { tags.push(t); tagsNeu = true; } });
      if (art === "n") { Store.put("rezepte", Object.assign({ id: "r" + uid(), titel: String(r.titel).trim(), tags: (r.tags || []).slice(), by: ME() }, felder(r))); nNeu++; return; }
      const x = clone(rezeptByTitel(r.titel)), f = felder(r);
      for (const k of Object.keys(f)) { if (k === "notiz") continue; const leerFeld = x[k] == null || x[k] === "" || (Array.isArray(x[k]) && !x[k].length); if (leerFeld) x[k] = f[k]; }
      const neuZeilen = f.notiz.split("\n").filter((z) => z.trim() && !(x.notiz || "").includes(z.trim()));   // nur, was noch nicht drinsteht
      if (neuZeilen.length) x.notiz = [x.notiz, ...neuZeilen].filter(Boolean).join("\n");
      x.tags = [...new Set([...(x.tags || []), ...(r.tags || [])])];
      Store.put("rezepte", x); nErg++;
    });
    if (tagsNeu) Store.touch("settings");
    Store.commit(); closeModal(m); render();
    toast([nNeu ? `${nNeu} Rezepte importiert` : "", nErg ? `${nErg} ergänzt` : ""].filter(Boolean).join(" · ") || "Nichts übernommen");
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
    if (e.target.closest("[data-rshare]")) { rezepteTeilen([r], dateiName(r.titel)); return true; }
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
      <div class="h3"><span>Austauschen</span></div>
      <div class="btns"><button class="btn" data-rexport>Rezepte exportieren …</button><button class="btn" data-rimport>Rezepte importieren …</button></div>
      <p class="sub">Exportieren erstellt eine Rezept-Datei (.txt) – auf dem Handy direkt zum Teilen, z. B. per WhatsApp oder Mail. Einzelne Rezepte teilst du auch über „Teilen“ im Rezept.<br>
        Importieren liest so eine Datei – oder ihren eingefügten Text – ein und zeigt vorher eine Übersicht. Rezepte, deren Titel es schon gibt, werden übersprungen – außer sie sind noch leer, dann werden sie ergänzt.</p>`;
  },
  settingsClick(e) {   // gibt true zurück, wenn der Klick hier behandelt wurde
    if (e.target.closest("[data-rimport]")) { rezepteImportieren(); return true; }
    if (e.target.closest("[data-rexport]")) { rezepteExportieren(); return true; }
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
