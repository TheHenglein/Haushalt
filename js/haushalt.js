/* Haushalt – Bereich „Haushalt“: gemeinsame Hilfen + Liste der Module
 * Module: Essensplan (essen.js), Rezepte (rezepte.js), Einkaufsliste (einkauf.js), dazu vorbereitete Platzhalter.
 * Jedes Modul ist ein Objekt mit id, group, title, icon, hint und view(); optional top(), bottom(), click(), input(), onShow(),
 * bereich(), back()/goBack() (Unterseite mit Zurück-Pfeil), settingsPage/settingsView()/settingsClick() (zentrale Einstellungen).
 */
"use strict";

/* ---------- gemeinsame Einstellungen des Bereichs ---------- */
const DEFAULT_TAGS = ["Hauptspeise", "Vorspeise", "Nachspeise", "Deftig", "Süß", "Schnell", "Backen", "Kochen", "Auflauf", "Suppe", "Salat", "Vegetarisch"];
registerData([], (d) => {
  d.settings.haushalt = Object.assign({ mahlzeiten: ["frueh", "mittag", "abend"], tags: DEFAULT_TAGS.slice() }, d.settings.haushalt || {});
});
const hhSet = () => db.settings.haushalt;

/* ---------- Hilfen ---------- */
const normName = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
/* „200 g Mehl“ → { menge: "200 g", name: "Mehl" } – ohne Menge bleibt alles Name */
const EINHEIT = "(?:g|kg|mg|ml|l|cl|dl|el|tl|stk\\.?|stück|prise[n]?|pck\\.?|päckchen|becher|dose[n]?|bund|zehe[n]?|scheibe[n]?|tasse[n]?|glas|gläser|msp\\.?|handvoll|kopf|köpfe|beutel|flasche[n]?|packung(?:en)?)";
const RE_ZUTAT = new RegExp(`^((?:ca\\.\\s*)?[\\d½¼¾⅓⅔.,/\\-–]+\\s*${EINHEIT}?\\.?|${EINHEIT}\\.?)\\s+(.+)$`, "i");
function parseZutat(line) {
  const s = String(line || "").trim();
  const m = s.match(RE_ZUTAT);
  return m ? { menge: m[1].trim(), name: m[2].trim() } : { menge: "", name: s };
}
const wochentag = (iso) => { const d = new Date(iso + "T12:00:00Z"); return `${["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`; };
const tagLabel = (iso) => { const t = todayISO(); if (iso === t) return "Heute"; if (iso === isoAdd(t, 1)) return "Morgen"; return wochentag(iso); };
/* kurz für Kachelüberschriften: „Heute“, „Morgen“, „Dienstag, 24.11.“ */
const tagKurz = (iso) => { const t = todayISO(); if (iso === t) return "Heute"; if (iso === isoAdd(t, 1)) return "Morgen"; return wochentag(iso).split(",")[0] + ", " + fDate(iso).slice(0, 6); };
const isoAdd = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return isoOf(y, m - 1, d + n); };
const minLabel = (min) => !min ? "" : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? " " + (min % 60) + " min" : ""}`;

/* Eingabefeld mit Vorschlägen (wie die Autovervollständigung in Excel).
 * getItems(q) → [{ label, sub, value }]; onPick(item). Pfeiltasten + Enter, Maus und Finger. */
function attachSuggest(input, getItems, onPick, max = 6) {
  const box = document.createElement("div"); box.className = "sugg"; box.hidden = true;
  input.insertAdjacentElement("afterend", box);
  input.setAttribute("autocomplete", "off");
  let items = [], idx = -1, imKasten = false;
  const hl = () => $$("button", box).forEach((b, i) => { b.classList.toggle("on", i === idx); if (i === idx) b.scrollIntoView({ block: "nearest" }); });
  const draw = () => {
    const q = input.value.trim();
    items = q ? getItems(q).slice(0, max) : [];
    idx = -1;
    box.innerHTML = items.map((it, i) => `<button type="button" data-i="${i}"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</button>`).join("");
    box.hidden = !items.length; box.scrollTop = 0;
    if (items.length) platz();
  };
  // Liste nur so hoch wie Platz bis zum Bildschirmrand (Tastatur berücksichtigt); notfalls nach oben aufklappen
  const platz = () => {
    const vv = window.visualViewport, h = vv ? vv.height + vv.offsetTop : innerHeight, r = input.getBoundingClientRect();
    const unten = h - r.bottom - 12, oben = r.top - 12, hoch = unten < 150 && oben > unten;
    box.classList.toggle("up", hoch);
    box.style.maxHeight = Math.max(110, Math.min(300, hoch ? oben : unten)) + "px";
  };
  const pick = (i) => { box.hidden = true; imKasten = false; onPick(items[i]); };
  input.addEventListener("input", draw);
  input.addEventListener("focus", draw);
  input.addEventListener("keydown", (e) => {
    if (box.hidden) return;
    if (e.key === "ArrowDown") { idx = Math.min(items.length - 1, idx + 1); hl(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { idx = Math.max(-1, idx - 1); hl(); e.preventDefault(); }
    else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); e.stopImmediatePropagation(); pick(idx); }
    else if (e.key === "Escape") { box.hidden = true; e.stopPropagation(); }
  });
  // Erst beim Antippen (click) übernehmen – so lässt sich die Liste per Wischen scrollen
  box.addEventListener("pointerdown", (e) => { imKasten = true; if (e.pointerType === "mouse") e.preventDefault(); });
  box.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) pick(+b.dataset.i); });
  const aussen = (e) => { if (!box.isConnected) return document.removeEventListener("pointerdown", aussen, true); if (!box.hidden && !box.contains(e.target) && e.target !== input) { box.hidden = true; imKasten = false; } };
  document.addEventListener("pointerdown", aussen, true);
  input.addEventListener("blur", () => setTimeout(() => { if (!imKasten) box.hidden = true; }, 150));
  return { close: () => (box.hidden = true) };
}

/* ---------- Module des Bereichs ---------- */
function soonModule(id, title, icon, hint, text) {
  return {
    id, group: "Haushalt", title, icon, hint, soon: true, bereich: () => "haushalt",
    view: () => `<div class="soon"><div class="soon-ic">${icon}</div><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="hint">Dieser Bereich ist vorbereitet und kommt im nächsten Schritt. Alles, was hier entsteht, liegt in derselben Haushalt-Datei und ist für alle Mitglieder sichtbar.</div></div>`
  };
}
const HAUSHALT_MODULE = [
  Essensplan, Haushaltsplan, Rezepte, Einkauf, Todos
];
