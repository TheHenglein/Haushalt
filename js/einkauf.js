/* Haushalt – Modul „Einkaufsliste“ (Vorbild: Google Notizen)
 * Jede Zeile: Kästchen zum Abhaken, Griff zum Sortieren (Reihenfolge wie im Supermarkt), Menge, optional Angebotspreis + Laden.
 * Artikel-Datenbank `artikel`: merkt Name, letzte Menge, Laden, Position in der Liste und wie oft pro Monat gekauft wurde
 * → Vorschläge beim Tippen, neue Einträge landen an ihrer gewohnten Stelle, später Auswertungen („wie oft Eier?“).
 */
"use strict";

registerData(["einkauf", "artikel"]);
const ek = { done: false };   // Bereich „Erledigt“ aufgeklappt?
const artikelBy = (name) => db.artikel.find((a) => a.id === normName(name));
const offeneEintraege = () => db.einkauf.filter((x) => !x.erledigt).sort((a, b) => a.pos - b.pos);
const erledigteEintraege = () => db.einkauf.filter((x) => x.erledigt).sort((a, b) => (b.erledigtAm || "").localeCompare(a.erledigtAm || ""));

/* Artikel in der Datenbank anlegen/aktualisieren */
function artikelMerken(item, extra = {}) {
  const id = normName(item.name); if (!id) return;
  const a = clone(artikelBy(item.name) || { id, name: item.name, anzahl: 0, monate: {} });
  Object.assign(a, { name: item.name }, item.menge ? { menge: item.menge } : {}, item.laden ? { laden: item.laden } : {}, extra);
  Store.put("artikel", a);
}
/* Neuer Eintrag – an der gewohnten Stelle, sonst ans Ende */
function einkaufAdd(name, menge = "", extra = {}) {
  name = String(name || "").trim(); if (!name) return null;
  const offen = offeneEintraege();
  if (offen.some((x) => normName(x.name) === normName(name))) return null;   // steht schon drauf
  const a = artikelBy(name);
  let pos = a?.rang ?? ((offen.length ? offen[offen.length - 1].pos : 0) + 1);
  while (db.einkauf.some((x) => !x.erledigt && x.pos === pos)) pos += 0.001;
  const item = Store.put("einkauf", Object.assign({ id: "e" + uid(), name, menge: menge || "", erledigt: false, pos, preis: null, laden: "", notiz: "", by: ME() }, extra));
  artikelMerken(item, a ? {} : { rang: pos });
  return item;
}
function toggleErledigt(id) {
  const x = clone(db.einkauf.find((y) => y.id === id)); if (!x) return;
  x.erledigt = !x.erledigt; x.erledigtAm = x.erledigt ? new Date().toISOString() : null;
  if (!x.erledigt) {   // zurück an die gewohnte Stelle
    const a = artikelBy(x.name); if (a?.rang != null) x.pos = a.rang;
  }
  Store.put("einkauf", x);
  // Kaufzähler pro Monat (für spätere Auswertungen)
  const a = clone(artikelBy(x.name) || { id: normName(x.name), name: x.name, anzahl: 0, monate: {} });
  const mon = todayISO().slice(0, 7), d = x.erledigt ? 1 : -1;
  a.anzahl = Math.max(0, (a.anzahl || 0) + d); a.monate = a.monate || {}; a.monate[mon] = Math.max(0, (a.monate[mon] || 0) + d);
  Store.put("artikel", a);
  Store.commit(); render();
}
const preisTag = (x) => x.preis || x.laden ? `<span class="etag">${x.preis ? "💶 " + eur(x.preis) : "🏷️"}${x.laden ? " · " + esc(x.laden) : ""}</span>` : "";
function rowEinkauf(x) {
  return `<div class="erow ${x.erledigt ? "done" : ""}" data-eid="${x.id}">
    ${x.erledigt ? "" : `<span class="grip" data-grip aria-label="Verschieben" title="Ziehen zum Sortieren">⋮⋮</span>`}
    <button class="ebox" data-echeck="${x.id}" aria-label="${x.erledigt ? "Wieder offen" : "Abhaken"}">${x.erledigt ? "✓" : ""}</button>
    <button class="etext" data-eedit="${x.id}"><span class="en">${esc(x.name)}</span>${x.menge ? ` <span class="em">${esc(x.menge)}</span>` : ""}${preisTag(x)}${x.notiz ? `<small>${esc(x.notiz)}</small>` : ""}</button>
  </div>`;
}
function viewEinkauf() {
  const offen = offeneEintraege(), fertig = erledigteEintraege();
  const summe = offen.reduce((s, x) => s + (x.preis || 0), 0);
  return `<div class="eadd"><span class="eplus">+</span><input data-enew placeholder="Eintrag hinzufügen, z. B. 10 Eier" enterkeyhint="done"></div>
    ${offen.length ? `<div class="elist" data-elist>${offen.map(rowEinkauf).join("")}</div>` : `<div class="empty"><b>Alles erledigt</b>Neue Einträge oben eingeben – bekannte Artikel werden beim Tippen vorgeschlagen.</div>`}
    ${summe ? `<p class="sub" style="text-align:right;margin:6px 4px">Angebote zusammen: <b>${eur(summe)}</b></p>` : ""}
    ${fertig.length ? `<button class="edone-h" data-etoggle>${ek.done ? "▾" : "▸"} ${fertig.length} erledigt</button>
      ${ek.done ? `<div class="elist">${fertig.map(rowEinkauf).join("")}</div><div class="btns" style="margin-top:8px"><button class="btn small ghost" data-eclear>Erledigte löschen</button></div>` : ""}` : ""}`;
}

/* ---------- Bearbeiten (Menge, Angebot, Laden) ---------- */
function editEinkauf(id) {
  const x = clone(db.einkauf.find((y) => y.id === id)); if (!x) return;
  const m = modal({ title: "Eintrag", body: `<form data-f onsubmit="return false">
      <div class="row2" style="grid-template-columns:1fr 110px"><label class="f"><span>Artikel</span><input name="name" value="${esc(x.name)}"></label>
      <label class="f"><span>Menge</span><input name="menge" value="${esc(x.menge)}" placeholder="2 Stk"></label></div>
      <div class="pick-group" style="margin-top:4px">Angebot</div>
      <div class="row2"><label class="f"><span>Preis €</span><input name="preis" inputmode="decimal" value="${centIn(x.preis)}" placeholder="1,99"></label>
      <label class="f"><span>Laden</span><input name="laden" value="${esc(x.laden)}" placeholder="z. B. Aldi" data-laden></label></div>
      <label class="f"><span>Notiz</span><input name="notiz" value="${esc(x.notiz)}" placeholder="z. B. die große Packung"></label></form>`,
    foot: `<button class="btn danger" data-del>Löschen</button><button class="btn primary" data-save>Speichern</button>` });
  const laeden = [...new Set([...db.einkauf, ...db.artikel].map((y) => y.laden).filter(Boolean))];
  const li = $("[data-laden]", m);
  attachSuggest(li, (q) => laeden.filter((l) => normName(l).startsWith(normName(q)) && normName(l) !== normName(q)).map((l) => ({ label: l, value: l })), (it) => (li.value = it.value));
  $("[data-save]", m).onclick = () => {
    const f = readForm($("[data-f]", m)); if (!f.name) return toast("Bitte einen Artikel eingeben");
    Object.assign(x, { name: f.name, menge: f.menge, preis: toCent(f.preis), laden: f.laden, notiz: f.notiz });
    Store.put("einkauf", x); artikelMerken(x); Store.commit(); closeModal(m); render();
  };
  $("[data-del]", m).onclick = () => {
    const copy = clone(x); Store.del("einkauf", x.id); Store.commit(); closeModal(m); render();
    toast(`${x.name} entfernt`, { label: "Rückgängig", fn: () => { Store.put("einkauf", copy); Store.commit(); render(); } });
  };
}

/* ---------- Sortieren per Griff (Maus und Finger) ---------- */
function startDrag(e, grip) {
  const row = grip.closest(".erow"), list = row.parentElement;
  e.preventDefault(); grip.setPointerCapture?.(e.pointerId);
  row.classList.add("drag");
  const move = (ev) => {
    const others = [...list.children].filter((r) => r !== row);
    const after = others.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
    if (after) { if (row.nextElementSibling !== after) list.insertBefore(row, after); } else if (list.lastElementChild !== row) list.appendChild(row);
  };
  const up = () => {
    grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
    row.classList.remove("drag");
    const ids = [...list.children].map((r) => r.dataset.eid), i = ids.indexOf(row.dataset.eid);
    const posOf = (id) => db.einkauf.find((x) => x.id === id)?.pos;
    const prev = i > 0 ? posOf(ids[i - 1]) : null, next = i < ids.length - 1 ? posOf(ids[i + 1]) : null;
    const x = clone(db.einkauf.find((y) => y.id === row.dataset.eid));
    const neu = prev == null ? (next ?? 1) - 1 : next == null ? prev + 1 : (prev + next) / 2;
    if (x && neu !== x.pos) {
      x.pos = neu; Store.put("einkauf", x);
      artikelMerken(x, { rang: neu });   // nächstes Mal wieder hier einsortieren
      Store.commit();
    }
    render();
  };
  grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
}
document.addEventListener("pointerdown", (e) => { const g = e.target.closest("[data-grip]"); if (g && curId === "einkauf") startDrag(e, g); });

/* =================================================================== Modul */
const Einkauf = {
  id: "einkauf", group: "Haushalt", title: "Einkaufsliste", icon: "🛒", hint: "Gemeinsam einkaufen",
  bereich: () => "haushalt",
  view: viewEinkauf,
  /* Eingabefeld mit Vorschlägen aus der Artikel-Datenbank verbinden (nach jedem Zeichnen) */
  afterRender() {
    const inp = $("[data-enew]"); if (!inp || inp._wired) return; inp._wired = true;
    const add = (name, menge) => {
      const it = einkaufAdd(name, menge);
      if (!it) { toast(`${name} steht schon auf der Liste`); return; }
      Store.commit(); render(); const n = $("[data-enew]"); n?.focus();
    };
    attachSuggest(inp, (q) => {
      const nq = normName(q), offen = new Set(offeneEintraege().map((x) => normName(x.name)));
      return db.artikel.filter((a) => a.id.includes(nq) && !offen.has(a.id))
        .sort((a, b) => (b.id.startsWith(nq) - a.id.startsWith(nq)) || (b.anzahl || 0) - (a.anzahl || 0))
        .map((a) => ({ label: a.name, sub: [a.menge, a.anzahl ? `${a.anzahl}× gekauft` : ""].filter(Boolean).join(" · "), value: a }));
    }, (it) => add(it.value.name, it.value.menge || ""));
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.defaultPrevented) return;
      e.preventDefault(); const p = parseZutat(inp.value); if (p.name) add(p.name, p.menge);
    });
  },
  click(e) {
    const c = e.target.closest("[data-echeck]"); if (c) { toggleErledigt(c.dataset.echeck); return true; }
    const ed = e.target.closest("[data-eedit]"); if (ed) { editEinkauf(ed.dataset.eedit); return true; }
    if (e.target.closest("[data-etoggle]")) { ek.done = !ek.done; render(); return true; }
    if (e.target.closest("[data-eclear]")) {
      const weg = erledigteEintraege().map(clone);
      weg.forEach((x) => Store.del("einkauf", x.id)); Store.commit(); render();
      toast(`${weg.length} erledigte gelöscht`, { label: "Rückgängig", fn: () => { weg.forEach((x) => Store.put("einkauf", x)); Store.commit(); render(); } });
      return true;
    }
    return false;
  }
};
