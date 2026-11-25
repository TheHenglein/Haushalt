/* Haushalt – Modul „Essensplan“
 * Tage ab heute, je Tag Früh / Mittag / Abend (einzeln abschaltbar). Pro Mahlzeit können alle Mitglieder Gerichte
 * vorschlagen (Freitext oder aus den Rezepten) und abstimmen. Haben alle abgestimmt und liegt ein Vorschlag vorne,
 * steht das Gericht fest – jederzeit änderbar. Gerichte lassen sich als Rezept speichern.
 *
 * Daten (alle gemeinsam):
 *   essenPlan       id "datum_slot"        → { datum, slot, text, rezept }   – das feste Gericht
 *   essenVorschlaege                        → { datum, slot, text, rezept, by }
 *   essenStimmen    id "datum_slot_email"  → { datum, slot, wer, vorschlag }  – jede Person schreibt nur ihren eigenen Eintrag
 */
"use strict";

registerData(["essenPlan", "essenVorschlaege", "essenStimmen"]);
const SLOTS = [["frueh", "Früh", "☕"], ["mittag", "Mittag", "🥗"], ["abend", "Abend", "🍝"]];
const es = { off: 0 };   // Wochen ab heute
const slotLabel = (s) => SLOTS.find(([k]) => k === s)?.[1] || s;
const ich = () => ME() || "ich";
const planOf = (d, s) => db.essenPlan.find((p) => p.id === `${d}_${s}`);
const vorschlaegeOf = (d, s) => db.essenVorschlaege.filter((v) => v.datum === d && v.slot === s).sort((a, b) => (a.upd || "").localeCompare(b.upd || ""));
const stimmenOf = (d, s) => db.essenStimmen.filter((v) => v.datum === d && v.slot === s && db.essenVorschlaege.some((x) => x.id === v.vorschlag));
const mitgliederIds = () => db.mitglieder.length ? db.mitglieder.map((m) => m.id) : [ich()];

function essenFest(d, s, text, rezept = null) {
  Store.put("essenPlan", { id: `${d}_${s}`, datum: d, slot: s, text: text.trim(), rezept: rezept || null });
}
function essenVorschlag(d, s, text, rezept = null) {
  const v = Store.put("essenVorschlaege", { id: "v" + uid(), datum: d, slot: s, text: text.trim(), rezept: rezept || null, by: ich() });
  stimmen(d, s, v.id, true);   // eigener Vorschlag = eigene Stimme (lässt sich ändern)
  return v;
}
/* Stimme setzen/umschalten; danach prüfen, ob die Abstimmung entschieden ist */
function stimmen(d, s, vid, nurSetzen = false) {
  const id = `${d}_${s}_${ich()}`, alt = db.essenStimmen.find((x) => x.id === id);
  if (alt?.vorschlag === vid && !nurSetzen) Store.del("essenStimmen", id);
  else Store.put("essenStimmen", { id, datum: d, slot: s, wer: ich(), vorschlag: vid });
  return autoFest(d, s);
}
function autoFest(d, s) {
  if (planOf(d, s)) return null;
  const ids = mitgliederIds(), st = stimmenOf(d, s).filter((x) => ids.includes(x.wer));
  if (ids.length < 2 || st.length < ids.length) return null;
  const count = {}; st.forEach((x) => (count[x.vorschlag] = (count[x.vorschlag] || 0) + 1));
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null;   // Gleichstand → jemand legt fest
  const v = db.essenVorschlaege.find((x) => x.id === sorted[0][0]);
  if (v) essenFest(d, s, v.text, v.rezept);
  return v;
}
/* Haben alle abgestimmt, ohne dass ein Vorschlag vorne liegt? */
function gleichstand(d, s) {
  if (planOf(d, s)) return false;
  const ids = mitgliederIds(), st = stimmenOf(d, s).filter((x) => ids.includes(x.wer));
  return ids.length > 1 && st.length >= ids.length;
}
function neuAbstimmen(d, s) {
  Store.del("essenPlan", `${d}_${s}`);
  stimmenOf(d, s).forEach((x) => Store.del("essenStimmen", x.id));
}

/* ---------- Ansicht ---------- */
function slotRow(d, s, icon, label) {
  const p = planOf(d, s), vs = vorschlaegeOf(d, s);
  const meinVote = db.essenStimmen.some((x) => x.id === `${d}_${s}_${ich()}` && vs.some((v) => v.id === x.vorschlag));
  let inhalt;
  if (p) inhalt = `<span class="sv fest">${esc(p.text)}${p.rezept && rezeptById(p.rezept) ? ' <span class="rlink" title="Rezept vorhanden">📖</span>' : ""}</span>`;
  else if (vs.length) inhalt = `<span class="sv offen"><span class="vt">${vs.map((v) => esc(v.text)).join(" · ")}</span>
      <span class="vote ${meinVote && !gleichstand(d, s) ? "" : "need"}">${vs.length} ${vs.length === 1 ? "Vorschlag" : "Vorschläge"}${gleichstand(d, s) ? " · Gleichstand – festlegen" : meinVote ? "" : " · abstimmen"}</span></span>`;
  else inhalt = `<span class="sv leer">+</span>`;
  return `<button class="srow" data-eslot="${d}|${s}"><span class="sl">${icon} ${label}</span>${inhalt}</button>`;
}
function viewEssen() {
  const t = todayISO(), start = isoAdd(t, es.off * 7), tage = Array.from({ length: 7 }, (_, i) => isoAdd(start, i));
  const slots = SLOTS.filter(([k]) => hhSet().mahlzeiten.includes(k));
  const titel = es.off === 0 ? "Ab heute" : es.off === 1 ? "Nächste Woche" : es.off === -1 ? "Letzte Woche" : `${fDate(start).slice(0, 6)} – ${fDate(tage[6]).slice(0, 6)}`;
  return `<div class="period"><button data-eoff="-1" aria-label="Woche zurück">‹</button>
      <div class="pl"><b>${titel}</b><span>${fDate(start).slice(0, 6)} – ${fDate(tage[6]).slice(0, 6)}</span></div>
      <button data-eoff="1" aria-label="Woche vor">›</button></div>
    ${es.off !== 0 ? `<div style="text-align:center;margin:-4px 0 10px"><button class="btn small ghost" data-eoff="0">Zu heute</button></div>` : ""}
    <div class="wgrid">${tage.map((d) => `<div class="dcard ${d === t ? "today" : ""} ${d < t ? "past" : ""}">
        <div class="dtitle"><b>${esc(tagKurz(d))}</b>${d === t || d === isoAdd(t, 1) ? `<span>${esc(wochentag(d))}</span>` : ""}</div>
        ${slots.map(([k, l, i]) => slotRow(d, k, i, l)).join("")}</div>`).join("")}</div>`;
}

/* ---------- Dialog einer Mahlzeit: Vorschläge, Abstimmung, festes Gericht ---------- */
function slotDialog(d, s) {
  const multi = Store.multi();
  let gewaehlt = null;   // aus den Rezepten gewähltes Rezept
  const m = modal({ title: `${slotLabel(s)} · ${tagLabel(d)}`, body: `<div data-sd></div>` });
  const draw = () => {
    const p = planOf(d, s), vs = vorschlaegeOf(d, s), st = stimmenOf(d, s);
    const meine = st.find((x) => x.wer === ich());
    const rezOf = (id) => id && rezeptById(id);
    $("[data-sd]", m).innerHTML = `
      ${p ? `<div class="card festcard"><div class="sub">Steht fest</div><b>${esc(p.text)}</b>
          <div class="btns" style="margin-top:10px">
            ${rezOf(p.rezept) ? `<button class="btn small" data-sopen="${p.rezept}">📖 Rezept öffnen</button>` : `<button class="btn small" data-sstub>📖 Als Rezept speichern</button>`}
            <button class="btn small" data-sedit>Ändern</button>
            ${multi && vs.length ? `<button class="btn small ghost" data-sre>Neu abstimmen</button>` : ""}
            <button class="btn small ghost" data-sclear>Leeren</button></div></div>` : ""}
      ${vs.length && (!p || multi) ? `<div class="pick-group">${p ? "Vorschläge" : multi ? "Vorschläge – stimm ab" : "Vorschläge"}</div>
        <div class="list">${vs.map((v) => { const wer = st.filter((x) => x.vorschlag === v.id).map((x) => Store.memberName(x.wer)); const mine = meine?.vorschlag === v.id;
          return `<div class="item vitem"><span class="m"><span class="t">${esc(v.text)}${rezOf(v.rezept) ? " 📖" : ""}</span>
            <span class="s">${multi ? `von ${esc(v.by === ich() ? "dir" : Store.memberName(v.by))}${wer.length ? ` · 👍 ${esc(wer.join(", "))}` : ""}` : ""}</span></span>
            ${multi && !p ? `<button class="btn small ${mine ? "primary" : ""}" data-svote="${v.id}">${mine ? "✓ Deine Stimme" : "👍 Stimme"}</button>` : ""}
            <button class="btn small" data-sfix="${v.id}">Festlegen</button>
            ${v.by === ich() ? `<button class="x small" data-sdel="${v.id}" aria-label="Vorschlag löschen">×</button>` : ""}</div>`; }).join("")}</div>
        ${multi && !p ? `<p class="sub">${gleichstand(d, s) ? "Gleichstand – wählt einen Vorschlag mit „Festlegen“ oder ändert eure Stimme." : `${st.length} von ${mitgliederIds().length} haben abgestimmt. Haben alle abgestimmt, steht der Vorschlag mit den meisten Stimmen fest.`}</p>` : ""}` : ""}
      <div class="pick-group">${p ? "Anderes Gericht" : multi ? "Gericht vorschlagen" : "Gericht eintragen"}</div>
      <div class="sugwrap"><input data-sin placeholder="Gericht eingeben oder Rezept suchen" maxlength="80"></div>
      <label class="f check" data-stubrow style="margin-top:8px"><input type="checkbox" data-sstubchk><span><b>Als Rezept speichern</b><small>legt bei den Rezepten ein Rezept mit diesem Titel an – den Rest füllst du später aus</small></span></label>
      <div class="btns slotbtns" style="margin-top:10px"><button type="button" class="btn" data-sliste>📖 Rezepte</button><span class="sp"></span>${multi ? `<button class="btn" data-sadd="v">Vorschlagen</button>` : ""}<button class="btn primary" data-sadd="f">Fest eintragen</button></div>`;
    const inp = $("[data-sin]", m), row = $("[data-stubrow]", m);
    const sync = () => { const r = gewaehlt || rezeptByTitel(inp.value); row.style.display = inp.value.trim() && !r ? "" : "none"; };
    attachSuggest(inp, (q) => db.rezepte.filter((r) => normName(r.titel).includes(normName(q))).sort((a, b) => a.titel.localeCompare(b.titel, "de"))
      .map((r) => ({ label: r.titel, sub: (r.tags || []).join(", ") || "Rezept", value: r })), (it) => { inp.value = it.value.titel; gewaehlt = it.value.id; sync(); }, 50);
    $("[data-sliste]", m).onclick = () => rezeptWaehlen().then((r) => { if (!r) return; inp.value = r.titel; gewaehlt = r.id; sync(); });
    inp.addEventListener("input", () => { gewaehlt = null; sync(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); add(multi ? "v" : "f"); } });
    sync();
  };
  const fertig = (msg) => { Store.commit(); render(); draw(); if (msg) toast(msg); };
  const add = (mode) => {
    const inp = $("[data-sin]", m), text = inp.value.trim(); if (!text) return toast("Erst ein Gericht eingeben");
    let rid = gewaehlt || rezeptByTitel(text)?.id || null;
    if (!rid && $("[data-sstubchk]", m).checked) rid = rezeptStub(text).id;
    if (mode === "f") essenFest(d, s, text, rid); else essenVorschlag(d, s, text, rid);
    gewaehlt = null;
    fertig(mode === "f" ? `${text} steht fest` : "Vorschlag eingetragen");
  };
  m.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.sadd) return add(b.dataset.sadd);
    if (b.dataset.svote) { const v = stimmen(d, s, b.dataset.svote); return fertig(v ? `Abgestimmt: ${v.text} steht fest` : ""); }
    if (b.dataset.sfix) { const v = db.essenVorschlaege.find((x) => x.id === b.dataset.sfix); essenFest(d, s, v.text, v.rezept); return fertig(`${v.text} steht fest`); }
    if (b.dataset.sdel) { Store.del("essenVorschlaege", b.dataset.sdel); return fertig("Vorschlag gelöscht"); }
    if (b.dataset.sopen) { closeModal(m); return openRezept(b.dataset.sopen, "essen"); }
    const p = planOf(d, s);
    if (b.hasAttribute("data-sstub") && p) { const r = rezeptStub(p.text); essenFest(d, s, p.text, r.id); return fertig(`Rezept „${p.text}“ angelegt`); }
    if (b.hasAttribute("data-sedit") && p) {
      const v = await promptBox("Gericht ändern", p.text); if (!v) return;
      essenFest(d, s, v, rezeptByTitel(v)?.id || (normName(v) === normName(p.text) ? p.rezept : null)); return fertig("Geändert");
    }
    if (b.hasAttribute("data-sre")) { neuAbstimmen(d, s); return fertig("Abstimmung wieder offen"); }
    if (b.hasAttribute("data-sclear")) { Store.del("essenPlan", `${d}_${s}`); stimmenOf(d, s).forEach((x) => Store.del("essenStimmen", x.id)); vorschlaegeOf(d, s).forEach((x) => Store.del("essenVorschlaege", x.id)); return fertig("Mahlzeit geleert"); }
  });
  draw();
}

/* =================================================================== Modul */
const Essensplan = {
  id: "essen", group: "Haushalt", title: "Essensplan", icon: "🍽️", hint: "Was gibt’s heute?",
  bereich: () => "haushalt",
  settingsPage: "essen",
  settingsHint: () => "Mahlzeiten: " + SLOTS.filter(([k]) => hhSet().mahlzeiten.includes(k)).map(([, l]) => l).join(", "),
  view: viewEssen,
  click(e) {
    const o = e.target.closest("[data-eoff]"); if (o) { es.off = o.dataset.eoff === "0" ? 0 : es.off + (+o.dataset.eoff); render(); return true; }
    const sl = e.target.closest("[data-eslot]"); if (sl) { const [d, s] = sl.dataset.eslot.split("|"); slotDialog(d, s); return true; }
    return false;
  },
  /* Einstellungen › Essensplan */
  settingsView() {
    const on = hhSet().mahlzeiten;
    return `<div class="h3"><span>Mahlzeiten im Plan</span></div>
      <div class="list">${SLOTS.map(([k, l, i]) => `<label class="item checkrow"><input type="checkbox" data-mz="${k}" ${on.includes(k) ? "checked" : ""}><span class="ic">${i}</span><span class="m"><span class="t">${l}</span></span></label>`).join("")}</div>
      <p class="sub">Gilt für den ganzen Haushalt. Ausgeblendete Mahlzeiten behalten ihre Einträge.</p>`;
  },
  settingsClick(e) {
    const c = e.target.closest("[data-mz]"); if (!c) return false;
    const k = c.dataset.mz, on = hhSet().mahlzeiten;
    const neu = on.includes(k) ? on.filter((x) => x !== k) : SLOTS.map(([x]) => x).filter((x) => on.includes(x) || x === k);
    if (!neu.length) { toast("Mindestens eine Mahlzeit bleibt"); render(); return true; }
    hhSet().mahlzeiten = neu; Store.touch("settings"); Store.commit(); render(); return true;
  }
};
