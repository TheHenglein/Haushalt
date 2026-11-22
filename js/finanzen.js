/* Haushalt – Modul „Finanzen“: das Haushaltsbuch
 * Übernommen aus der App „Haushaltsbuch“ (Stufe 1). Zwei getrennte Bücher: Privat und Gewerbe.
 * Änderungen laufen über Store.put / Store.del, damit mehrere Personen gleichzeitig buchen können.
 */
"use strict";

const BOOKS = { privat: "Privat", gewerbe: "Gewerbe" };
const ART_KONTO = { giro: "Girokonto", bar: "Bargeld", paypal: "PayPal", sonst: "Sonstiges" };
const ART_ICON = { giro: "🏦", bar: "💶", paypal: "🅿️", sonst: "💳" };

function defaultCategories() {
  const out = []; let n = 0;
  const add = (buch, typ, name, icon, fix, subs) => {
    const id = "k" + (++n); out.push({ id, buch, typ, name, icon, fix: !!fix, parent: null, hidden: false, upd: "" });
    (subs || []).forEach((s) => { const [sn, sfix] = Array.isArray(s) ? s : [s, fix]; out.push({ id: "k" + (++n), buch, typ, name: sn, icon, fix: !!sfix, parent: id, hidden: false, upd: "" }); });
  };
  add("privat", "aus", "Wohnen", "🏠", true, ["Miete", "Strom", "Wasser", "Heizung", "Internet & Telefon", "Rundfunkbeitrag"]);
  add("privat", "aus", "Versicherungen", "🛡️", true, ["Haftpflicht", "Hausrat", "Kfz", "Sonstige"]);
  add("privat", "aus", "Abos & Mitgliedschaften", "🔁", true, ["Handy", "Streaming", "Verein"]);
  add("privat", "aus", "Lebensmittel", "🛒", false, ["Supermarkt", "Bäcker", "Markt"]);
  add("privat", "aus", "Haushalt & Drogerie", "🧴", false, ["Drogerie", "Haushaltswaren"]);
  add("privat", "aus", "Mobilität", "🚗", false, ["Tanken", "Werkstatt", "Bus & Bahn"]);
  add("privat", "aus", "Gesundheit", "💊", false, ["Apotheke", "Arzt"]);
  add("privat", "aus", "Freizeit", "🎉", false, ["Essen gehen", "Hobby", "Urlaub"]);
  add("privat", "aus", "Kleidung", "👕", false);
  add("privat", "aus", "Geschenke", "🎁", false);
  add("privat", "aus", "Sonstiges", "📦", false);
  add("privat", "ein", "Einnahmen", "💶", false, [["Gehalt", true], "Erstattungen", "Sonstiges"]);
  add("gewerbe", "aus", "Wareneinsatz", "🧵", false, ["Material", "Verpackung"]);
  add("gewerbe", "aus", "Verkauf", "🏷️", false, ["Marktgebühren", "Plattform- & Bankgebühren", "Werbung"]);
  add("gewerbe", "aus", "Betrieb", "🔧", false, ["Werkzeug", "Fahrtkosten", "Sonstiges"]);
  add("gewerbe", "ein", "Erlöse", "💰", false, ["Verkauf Markt", "Verkauf Auftrag/online", "Sonstiges"]);
  return out;
}
// Reihenfolge der Kacheln, solange es noch keine Buchungen gibt
const FAV = {
  "privat-aus": ["Supermarkt", "Bäcker", "Drogerie", "Tanken", "Essen gehen", "Apotheke", "Kleidung"],
  "privat-ein": ["Gehalt", "Erstattungen", "Sonstiges"],
  "gewerbe-aus": ["Material", "Verpackung", "Marktgebühren", "Fahrtkosten", "Werkzeug"],
  "gewerbe-ein": ["Verkauf Markt", "Verkauf Auftrag/online"]
};

registerData(["konten", "kategorien", "buchungen"], (d, fill) => {
  d.settings.fin = Object.assign({ privat: { monatsStart: 1 }, gewerbe: { monatsStart: 1 }, gewerbeAktiv: true, onboarded: false }, d.settings.fin || {});
  if (fill) return;
  const t = todayISO();
  d.konten = [
    { id: "a1", name: "Girokonto", buch: "privat", art: "giro", start: 0, startDatum: t, archiv: false, upd: "" },
    { id: "a2", name: "Bargeld", buch: "privat", art: "bar", start: 0, startDatum: t, archiv: false, upd: "" },
    { id: "a3", name: "PayPal", buch: "privat", art: "paypal", start: 0, startDatum: t, archiv: false, upd: "" }
  ];
  d.kategorien = defaultCategories();
  d.buchungen = [];
});

/* ---------- Zustand (pro Gerät) ---------- */
let book = lsGet(LS.finBook, "privat");
let finTab = lsGet(LS.finTab, "start");
const ui = { off: { liste: 0, auswertung: 0 }, q: "", filter: "alle" };
const finSet = () => db.settings.fin;
const gewerbeAktiv = () => finSet().gewerbeAktiv !== false;
const curBook = () => (gewerbeAktiv() ? book : "privat");
const lastKonto = () => lsGet(LS.last, {});

const kontoById = (id) => db.konten.find((k) => k.id === id);
const katById = (id) => db.kategorien.find((k) => k.id === id);
const kontoBook = (id) => kontoById(id)?.buch;
const katLabel = (k) => k ? k.name : "Ohne Kategorie";
const katMain = (k) => k ? (k.parent ? katById(k.parent) : k) : null;
const katIcon = (k) => katMain(k)?.icon || "•";
const hasChildren = (id) => db.kategorien.some((k) => k.parent === id && !k.hidden);
const leafCats = (b, typ) => db.kategorien.filter((k) => k.buch === b && k.typ === typ && !k.hidden && !hasChildren(k.id) && (!k.parent || !katById(k.parent)?.hidden));
const kontenOf = (b, withArchiv = false) => db.konten.filter((k) => k.buch === b && (withArchiv || !k.archiv));

/* ---------- Abrechnungsmonat ----------
 * Beginnt am Tag `monatsStart`; benannt nach dem Monat, in dem er endet. */
function period(b, offset = 0, refISO = todayISO()) {
  const S = Math.min(28, Math.max(1, finSet()[b]?.monatsStart || 1));
  const [y, m, d] = refISO.split("-").map(Number);
  let sm = m - 1;
  if (S > 1 && d < S) sm -= 1;
  sm += offset;
  const from = isoOf(y, sm, S);
  const to = isoOf(y, sm + 1, S > 1 ? S - 1 : 0);
  const end = new Date(to + "T12:00:00Z");
  return { from, to, label: `${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`, offset,
    range: `${fDate(from).slice(0, 6)} – ${fDate(to).slice(0, 6)}` };
}
const inPeriod = (iso, p) => iso >= p.from && iso <= p.to;

/* ---------- Wie wirkt eine Buchung auf ein Buch? ----------
 * aus / ein: normale Ausgabe/Einnahme in diesem Buch
 * um: Umbuchung innerhalb des Buchs
 * entnahme / einlage: Geld zwischen den Büchern (dir = +1 rein, -1 raus aus Sicht des Buchs) */
function relation(x, b) {
  if (x.art === "aus" || x.art === "ein") {
    if (x.buch === b) return { kind: x.art, cent: x.cent, cross: kontoBook(x.konto) !== b };
    if (kontoBook(x.konto) === b) {            // Gewerbe-Buchung über ein privates Konto
      return x.art === "aus" ? { kind: "einlage", dir: -1, cent: x.cent } : { kind: "entnahme", dir: +1, cent: x.cent };
    }
    return null;
  }
  if (x.art === "um") {
    const fb = kontoBook(x.konto), tb = kontoBook(x.ziel);
    if (fb === b && tb === b) return { kind: "um", cent: x.cent };
    if (fb === b) return { kind: b === "gewerbe" ? "entnahme" : "einlage", dir: -1, cent: x.cent };
    if (tb === b) return { kind: b === "gewerbe" ? "einlage" : "entnahme", dir: +1, cent: x.cent };
  }
  return null;
}
function balance(kontoId, upto = null) {
  const k = kontoById(kontoId); let s = k?.start || 0;
  for (const x of db.buchungen) {
    if (upto && x.datum > upto) continue;
    if (x.konto === kontoId) s += x.art === "ein" ? x.cent : -x.cent;
    if (x.art === "um" && x.ziel === kontoId) s += x.cent;
  }
  return s;
}
function summary(b, p) {
  const r = { ein: 0, aus: 0, entnahme: 0, einlage: 0, n: 0, byKat: {} };
  for (const x of db.buchungen) {
    if (!inPeriod(x.datum, p)) continue;
    const rel = relation(x, b); if (!rel) continue;
    r.n++;
    if (rel.kind === "ein" || rel.kind === "aus") {
      r[rel.kind] += rel.cent;
      const k = katById(x.kat), main = katMain(k);
      const key = rel.kind + ":" + (main?.id || "-");
      (r.byKat[key] ||= { typ: rel.kind, main, cent: 0, subs: {} }).cent += rel.cent;
      const sk = k?.id || "-"; r.byKat[key].subs[sk] = (r.byKat[key].subs[sk] || 0) + rel.cent;
    }
    if (rel.kind === "entnahme") r.entnahme += rel.cent;
    if (rel.kind === "einlage") r.einlage += rel.cent;
    // Privat: Geld aus dem Gewerbe ist Einnahme, Geld ins Gewerbe ist Ausgabe
    if (b === "privat" && (rel.kind === "entnahme" || rel.kind === "einlage")) {
      const typ = rel.kind === "entnahme" ? "ein" : "aus";
      r[typ] += rel.cent;
      const key = typ + ":__gew";
      (r.byKat[key] ||= { typ, main: { id: "__gew", icon: "⇄", name: typ === "ein" ? "Aus dem Gewerbe" : "Ins Gewerbe" }, cent: 0, subs: {} }).cent += rel.cent;
    }
  }
  r.saldo = r.ein - r.aus;
  return r;
}
/* Kacheln: meistgenutzte Kategorien der letzten 120 Tage, sonst Startreihenfolge */
function tileCats(b, typ, count = 7) {
  const leaves = leafCats(b, typ);
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const freq = {};
  db.buchungen.forEach((x) => { if (x.buch === b && x.art === typ && x.datum >= since) freq[x.kat] = (freq[x.kat] || 0) + 1; });
  const fav = FAV[b + "-" + typ] || [];
  const rank = (k) => (freq[k.id] || 0) * 1000 - (fav.includes(k.name) ? fav.indexOf(k.name) : 99);
  return leaves.slice().sort((a, c) => rank(c) - rank(a)).slice(0, count);
}

/* =================================================================== Ansichten */
const FIN_TABS = [
  ["start", "Start", '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  ["liste", "Buchungen", '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>'],
  ["auswertung", "Auswertung", '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'],
  ["mehr", "Mehr", '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>']
];

/* Eine Buchung als Listenzeile, aus Sicht des Buchs b */
function rowHTML(x, b) {
  const rel = relation(x, b); if (!rel) return "";
  const k = katById(x.kat), konto = kontoById(x.konto), ziel = kontoById(x.ziel);
  let icon = katIcon(k), title = katLabel(k), sub = [], val = 0, cls = "";
  if (rel.kind === "aus") { val = -rel.cent; cls = "out"; }
  else if (rel.kind === "ein") { val = rel.cent; cls = "in"; }
  if (rel.kind === "um") { icon = "⇄"; title = "Umbuchung"; sub.push(`${konto?.name} → ${ziel?.name}`); }
  else if (rel.kind === "entnahme" || rel.kind === "einlage") {
    icon = "⇄"; title = rel.kind === "entnahme" ? "Entnahme aus Gewerbe" : "Einlage ins Gewerbe";
    if (b === "gewerbe") title = rel.kind === "entnahme" ? "Entnahme (an Privat)" : "Einlage (von Privat)";
    val = rel.dir * rel.cent; cls = val < 0 ? "out" : "in";
    if (x.art !== "um") sub.push((x.art === "aus" ? "Gewerbe-Ausgabe: " : "Gewerbe-Einnahme: ") + katLabel(k));
    else sub.push(`${konto?.name} → ${ziel?.name}`);
  }
  if (rel.kind === "aus" || rel.kind === "ein") {
    if (k?.parent) sub.push(katById(k.parent)?.name);
    if (konto) sub.push(rel.cross ? `privat ${rel.kind === "aus" ? "bezahlt" : "erhalten"} (${konto.name})` : konto.name);
  }
  if (x.notiz) sub.unshift(x.notiz);
  if (Store.multi() && x.by) sub.push(Store.memberName(x.by));
  return `<button class="item" data-act="edit" data-id="${x.id}"><span class="ic">${icon}</span>
    <span class="m"><span class="t">${esc(title)}</span><span class="s">${esc(sub.filter(Boolean).join(" · "))}</span></span>
    <span class="v ${cls}">${rel.kind === "um" ? eur(rel.cent) : eurS(val)}</span></button>`;
}
function bookingsFor(b, filterFn = () => true) {
  return db.buchungen.filter((x) => relation(x, b) && filterFn(x))
    .sort((a, c) => c.datum.localeCompare(a.datum) || (c.created || "").localeCompare(a.created || ""));
}
function grouped(list, b) {
  let html = "", day = null, chunk = [];
  const flush = () => {
    if (!chunk.length) return;
    const sum = chunk.reduce((s, x) => { const r = relation(x, b); return s + (r.kind === "aus" ? -r.cent : r.kind === "ein" ? r.cent : r.kind === "um" ? 0 : r.dir * r.cent); }, 0);
    html += `<div class="day"><span>${dayLabel(day)}</span><span>${eurS(sum)}</span></div><div class="list">${chunk.map((x) => rowHTML(x, b)).join("")}</div>`;
    chunk = [];
  };
  for (const x of list) { if (x.datum !== day) { flush(); day = x.datum; } chunk.push(x); }
  flush();
  return html;
}
function kontenHTML(b) {
  const ks = kontenOf(b);
  if (!ks.length) return `<div class="hint">Noch kein ${BOOKS[b]}-Konto angelegt. ${b === "gewerbe" ? "Bis das Geschäftskonto da ist, wähle beim Erfassen „privat bezahlt“ bzw. „privat erhalten“. Konto anlegen unter Mehr → Konten." : ""}</div>`;
  return `<div class="list">${ks.map((k) => { const s = balance(k.id); return `<button class="item" data-act="konto" data-id="${k.id}"><span class="ic">${ART_ICON[k.art] || "💳"}</span>
    <span class="m"><span class="t">${esc(k.name)}</span><span class="s">${ART_KONTO[k.art] || ""}</span></span><span class="v ${s < 0 ? "out" : ""}">${eur(s)}</span></button>`; }).join("")}</div>`;
}

/* ---------- Start ---------- */
function viewStart() {
  const b = curBook(), p = period(b), s = summary(b, p);
  const total = kontenOf(b).reduce((a, k) => a + balance(k.id), 0);
  const recent = bookingsFor(b).slice(0, 6);
  let hero;
  if (b === "privat") {
    hero = `<div class="card hero"><div class="l">Auf allen Konten</div><div class="big">${eur(total)}</div>
      <div class="l" style="margin-bottom:6px">${esc(p.label)} · ${p.range}</div>
      <div class="row"><div><small>Einnahmen</small><b>${eur(s.ein)}</b></div><div><small>Ausgaben</small><b>${eur(s.aus)}</b></div><div><small>Saldo</small><b>${eurS(s.saldo)}</b></div></div></div>`;
  } else {
    const t = todayISO(), sales = db.buchungen.filter((x) => x.buch === "gewerbe" && x.art === "ein" && x.datum === t);
    hero = `<div class="card hero"><div class="l">Gewinn ${esc(p.label)}</div><div class="big">${eurS(s.saldo)}</div>
      <div class="row"><div><small>Einnahmen</small><b>${eur(s.ein)}</b></div><div><small>Ausgaben</small><b>${eur(s.aus)}</b></div>
      <div><small>Heute verkauft</small><b>${sales.length ? eur(sales.reduce((a, x) => a + x.cent, 0)) : "–"}</b></div></div></div>`;
  }
  return `${hero}
    <div class="h3"><span>Konten</span></div>${kontenHTML(b)}
    <div class="h3"><span>Zuletzt</span>${recent.length ? `<button data-ftab="liste">Alle</button>` : ""}</div>
    ${recent.length ? grouped(recent, b) : `<div class="empty"><b>Noch keine Buchungen</b>Tippe auf <b style="display:inline">+</b>, um die erste Ausgabe einzutragen.</div>`}`;
}

/* ---------- Buchungen ---------- */
function periodNav(key) {
  const p = period(curBook(), ui.off[key]);
  return `<div class="period"><button data-act="prev" data-k="${key}" aria-label="Vorheriger Monat">‹</button>
    <div class="pl"><b>${esc(p.label)}</b><span>${p.range}</span></div>
    <button data-act="next" data-k="${key}" ${ui.off[key] >= 0 ? "disabled" : ""} aria-label="Nächster Monat">›</button></div>`;
}
function viewListe() {
  const b = curBook(), p = period(b, ui.off.liste), q = ui.q.trim().toLowerCase();
  const f = ui.filter;
  const list = bookingsFor(b, (x) => {
    if (!q && !inPeriod(x.datum, p)) return false;
    const r = relation(x, b);
    if (f === "aus" && r.kind !== "aus") return false;
    if (f === "ein" && r.kind !== "ein") return false;
    if (f === "um" && !["um", "entnahme", "einlage"].includes(r.kind)) return false;
    if (q) {
      const k = katById(x.kat);
      const hay = [x.notiz, k?.name, katMain(k)?.name, kontoById(x.konto)?.name, centIn(x.cent), x.by && Store.memberName(x.by)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return `${q ? "" : periodNav("liste")}
    <div class="toolbar"><input type="search" placeholder="Suchen (Notiz, Kategorie, Betrag)" value="${esc(ui.q)}" data-q></div>
    <div class="chips">${[["alle", "Alle"], ["aus", "Ausgaben"], ["ein", "Einnahmen"], ["um", "Umbuchungen"]].map(([k, l]) => `<button class="chip ${f === k ? "on" : ""}" data-filter="${k}">${l}</button>`).join("")}</div>
    ${list.length ? grouped(list, b) : `<div class="empty"><b>Keine Buchungen</b>${q ? "Nichts gefunden." : "In diesem Monat ist noch nichts eingetragen."}</div>`}`;
}

/* ---------- Auswertung ---------- */
// mittlere Helligkeit: gut sichtbar auf hellem und dunklem Hintergrund
const PALETTE = ["#5B7BC9", "#D49A8C", "#9C84C9", "#3FA2A2", "#D9A441", "#C46A8A", "#7FB07A", "#8E95A8", "#E07B54", "#6FB3D9"];
function donut(parts, total) {
  if (!total) return "";
  const R = 70, C = 2 * Math.PI * R; let off = 0;
  const segs = parts.map((p, i) => { const len = p.cent / total * C; const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="26" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`; off += len; return s; }).join("");
  return `<div class="donut"><svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Ausgaben nach Kategorie">${segs}
    <text class="dl" x="90" y="86" text-anchor="middle" font-size="12">Ausgaben</text><text class="dv" x="90" y="106" text-anchor="middle" font-size="17" font-weight="700">${esc(eur(total))}</text></svg></div>`;
}
function viewAuswertung() {
  const b = curBook(), p = period(b, ui.off.auswertung), s = summary(b, p), prev = summary(b, period(b, ui.off.auswertung - 1));
  const parts = Object.values(s.byKat).filter((x) => x.typ === "aus").sort((a, c) => c.cent - a.cent);
  const ins = Object.values(s.byKat).filter((x) => x.typ === "ein").sort((a, c) => c.cent - a.cent);
  const diff = prev.aus ? (s.aus - prev.aus) / prev.aus : null;
  const fix = parts.reduce((a, x) => a + Object.entries(x.subs).reduce((c, [kid, v]) => c + (katById(kid)?.fix ? v : 0), 0), 0);
  const legend = (arr, typ, total) => `<div class="list legend">${arr.map((x, i) => `<button class="item" data-act="katdetail" data-id="${x.main?.id || "-"}" data-typ="${typ}">
      ${typ === "aus" ? `<span class="sw" style="background:${PALETTE[i % PALETTE.length]}"></span>` : ""}<span class="ic">${x.main?.icon || "•"}</span>
      <span class="m"><span class="t">${esc(x.main?.name || "Ohne Kategorie")}</span><span class="bar"><i style="width:${total ? x.cent / total * 100 : 0}%"></i></span></span>
      <span class="v">${eur(x.cent)}<small>${total ? Math.round(x.cent / total * 100) : 0} %</small></span></button>`).join("")}</div>`;
  return `${periodNav("auswertung")}
    <div class="kpis"><div class="card"><div class="l">Einnahmen</div><div class="v in">${eur(s.ein)}</div></div>
      <div class="card"><div class="l">Ausgaben</div><div class="v out">${eur(s.aus)}</div></div>
      <div class="card"><div class="l">${b === "privat" ? "Saldo" : "Gewinn"}</div><div class="v">${eurS(s.saldo)}</div></div></div>
    ${diff != null ? `<div class="hint">Ausgaben ${diff > 0 ? "<b class=out>" + Math.round(diff * 100) + " % mehr</b>" : diff < 0 ? "<b class=in>" + Math.round(-diff * 100) + " % weniger</b>" : "genauso viel"} als im Vormonat (${eur(prev.aus)}).</div>` : ""}
    ${b === "gewerbe" && (s.entnahme || s.einlage) ? `<div class="card"><div class="row2"><div><div class="sub">Entnahmen (an Privat)</div><b>${eur(s.entnahme)}</b></div><div><div class="sub">Einlagen (von Privat)</div><b>${eur(s.einlage)}</b></div></div>
      <div class="sub" style="margin-top:6px">Nicht im Gewinn enthalten.</div></div>` : ""}
    <div class="h3"><span>Ausgaben nach Kategorie</span></div>
    ${parts.length ? `<div class="card">${donut(parts, s.aus)}${fix ? `<div class="sub" style="text-align:center;margin-bottom:8px">davon Fixkosten ${eur(fix)} · variabel ${eur(s.aus - fix)}</div>` : ""}${legend(parts, "aus", s.aus)}</div>` : `<div class="empty">Keine Ausgaben in diesem Monat.</div>`}
    <div class="h3"><span>Einnahmen nach Kategorie</span></div>
    ${ins.length ? `<div class="card">${legend(ins, "ein", s.ein)}</div>` : `<div class="empty">Keine Einnahmen in diesem Monat.</div>`}`;
}
function showKatDetail(mainId, typ) {
  const b = curBook(), p = period(b, ui.off.auswertung);
  const main = katById(mainId), gew = mainId === "__gew";
  const list = bookingsFor(b, (x) => { const r = relation(x, b); if (!inPeriod(x.datum, p)) return false;
    if (gew) return r.kind === (typ === "ein" ? "entnahme" : "einlage");
    const k = katById(x.kat); return r.kind === typ && (katMain(k)?.id || "-") === mainId; });
  modal({ title: `${gew ? (typ === "ein" ? "Aus dem Gewerbe" : "Ins Gewerbe") : main?.name || "Ohne Kategorie"} · ${p.label}`, body: list.length ? grouped(list, b) : `<div class="empty">Keine Buchungen.</div>` });
}

/* ---------- Mehr (Einstellungen des Haushaltsbuchs) ---------- */
function viewMehr() {
  const b = curBook(), f = farben();
  const item = (act, icon, t, s) => `<button class="item" data-act="${act}"><span class="ic">${icon}</span><span class="m"><span class="t">${t}</span><span class="s">${s}</span></span><span class="sub">›</span></button>`;
  return `<div class="h3"><span>${BOOKS[b]}</span></div><div class="list">
      ${item("konten", "🏦", "Konten", `${kontenOf(b).length} Konten · Anfangsbestand, Kassensturz`)}
      ${item("kategorien", "🗂️", "Kategorien", "umbenennen, ergänzen, ausblenden")}
      ${item("monat", "📅", "Abrechnungsmonat", `beginnt am ${finSet()[b].monatsStart}.`)}</div>
    <div class="h3"><span>Haushaltsbuch</span></div><div class="list">
      ${item("gewerbe", "💼", "Gewerbe-Buch", gewerbeAktiv() ? "eingeschaltet – getrennt von Privat" : "ausgeschaltet")}
      ${item("fin-design", "🎨", "Farben der Bücher", `Privat ${THEMES[f.privat]?.name}${gewerbeAktiv() ? ` · Gewerbe ${THEMES[f.gewerbe]?.name}` : ""}`)}
      ${item("import-v1", "📥", "Altes Haushaltsbuch übernehmen", "Sicherungsdatei der bisherigen App einlesen")}</div>
    <p class="sub" style="text-align:center;margin-top:20px">Gilt für den ganzen Haushalt – außer den Farben, die stellt jede Person für sich ein.</p>`;
}

/* =================================================================== Auswahl-Dialoge */
/* Konto auswählen. Im Gewerbe zusätzlich private Konten („privat bezahlt/erhalten“). */
function pickKonto({ title, b, art, all }) {
  return new Promise((res) => {
    const groups = [];
    if (all) { groups.push(["Privat", kontenOf("privat")]); if (gewerbeAktiv()) groups.push(["Gewerbe", kontenOf("gewerbe")]); }
    else {
      groups.push([BOOKS[b], kontenOf(b)]);
      if (b === "gewerbe") groups.push([art === "ein" ? "Privat erhalten auf" : "Privat bezahlt mit", kontenOf("privat")]);
    }
    const m = modal({ title, onClose: () => res(null), body: groups.filter((g) => g[1].length).map(([g, ks]) => `<div class="pick-group">${esc(g)}</div><div class="list">${ks.map((k) => `<button class="item" data-k="${k.id}"><span class="ic">${ART_ICON[k.art]}</span><span class="m"><span class="t">${esc(k.name)}</span></span><span class="v">${eur(balance(k.id))}</span></button>`).join("")}</div>`).join("") || `<div class="empty">Noch keine Konten.</div>` });
    m.addEventListener("click", (e) => { const b2 = e.target.closest("[data-k]"); if (b2) { m.onClose = null; closeModal(m); res(b2.dataset.k); } });
  });
}
/* Alle Kategorien zur Auswahl, gruppiert */
function pickKat(b, typ) {
  return new Promise((res) => {
    const mains = db.kategorien.filter((k) => k.buch === b && k.typ === typ && !k.parent && !k.hidden);
    const m = modal({ title: "Kategorie wählen", onClose: () => res(null), body: mains.map((mk) => {
      const subs = db.kategorien.filter((k) => k.parent === mk.id && !k.hidden);
      return `<div class="pick-group">${mk.icon} ${esc(mk.name)}</div><div class="pick-sub">${(subs.length ? subs : [mk]).map((k) => `<button data-k="${k.id}">${esc(k.name)}</button>`).join("")}</div>`;
    }).join("") });
    m.addEventListener("click", (e) => { const b2 = e.target.closest("[data-k]"); if (b2) { m.onClose = null; closeModal(m); res(b2.dataset.k); } });
  });
}

/* =================================================================== Erfassen */
function defaultKonto(b, art) {
  const l = lastKonto(), last = l[b + "-" + art] || l[b];
  if (last && kontoById(last) && !kontoById(last).archiv) return last;
  return (kontenOf(b)[0] || (b === "gewerbe" ? kontenOf("privat")[0] : null))?.id || null;
}
function openEntry(opts = {}) {
  const editing = opts.id ? db.buchungen.find((x) => x.id === opts.id) : null;
  if (opts.id && !editing) return toast("Diese Buchung gibt es nicht mehr");
  const st = editing ? { art: editing.art, b: editing.buch, amt: centIn(editing.cent), konto: editing.konto, ziel: editing.ziel || null, kat: editing.kat || null, datum: editing.datum, notiz: editing.notiz || "" }
    : { art: opts.art || "aus", b: curBook(), amt: "", konto: null, ziel: null, kat: null, datum: todayISO(), notiz: "" };
  if (!editing) st.konto = defaultKonto(st.b, st.art);
  if (st.art === "um" && !st.ziel) st.ziel = kontenOf(st.b).find((k) => k.id !== st.konto)?.id || null;
  const sales = () => db.buchungen.filter((x) => x.buch === "gewerbe" && x.art === "ein" && x.datum === todayISO());
  const m = modal({ title: editing ? "Buchung bearbeiten" : `Neue Buchung${gewerbeAktiv() ? " · " + BOOKS[st.b] : ""}`, full: true, cls: "entry", body: `<div data-body style="display:contents"></div>` });
  const cents = () => { const c = toCent(st.amt); return c && c > 0 ? c : 0; };
  const ready = () => cents() > 0 && !!st.konto && (st.art === "um" ? !!st.ziel && st.ziel !== st.konto : !!st.kat);
  const draw = () => {
    const konto = kontoById(st.konto), ziel = kontoById(st.ziel);
    const cross = konto && konto.buch !== st.b;
    const kontoLabel = konto ? (cross ? `privat ${st.art === "ein" ? "erhalten" : "bezahlt"}: ${konto.name}` : konto.name) : "Konto wählen";
    const tiles = st.art === "um" ? "" : (() => {
      const list = tileCats(st.b, st.art);
      if (st.kat && !list.some((k) => k.id === st.kat) && katById(st.kat)) list.unshift(katById(st.kat));
      return `<div class="tiles">${list.slice(0, 7).map((k) => `<button class="tile ${st.kat === k.id ? "on" : ""}" data-tile="${k.id}"><span class="e">${katIcon(k)}</span><span class="n">${esc(k.name)}</span></button>`).join("")}
        <button class="tile all" data-tile="__all"><span class="e">⋯</span><span class="n">Alle</span></button></div>`;
    })();
    $("[data-body]", m).innerHTML = `
      <div class="seg">${[["aus", "Ausgabe"], ["ein", "Einnahme"], ["um", "Umbuchung"]].map(([k, l]) => `<button data-art="${k}" class="${st.art === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="amount" data-amount><div class="a ${cents() ? "" : "zero"}">${st.amt ? esc(st.amt) : "0"} €</div></div>
      ${st.art === "um" ? `<div class="transfer">
          <button class="pickbtn" data-pick="konto"><small>Von</small>${esc(konto?.name || "Konto wählen")} <span class="sub">${konto && gewerbeAktiv() ? BOOKS[konto.buch] : ""}</span></button>
          <button class="pickbtn" data-pick="ziel"><small>Nach</small>${esc(ziel?.name || "Konto wählen")} <span class="sub">${ziel && gewerbeAktiv() ? BOOKS[ziel.buch] : ""}</span></button>
          ${konto && ziel && konto.buch !== ziel.buch ? `<div class="hint" style="margin:0">${konto.buch === "gewerbe" ? "Entnahme: Geld vom Gewerbe ins Private." : "Einlage: privates Geld ins Gewerbe."}</div>` : ""}</div>` : ""}
      <div class="meta">
        ${st.art !== "um" ? `<button class="chip" data-pick="konto">${ART_ICON[konto?.art] || "💳"} ${esc(kontoLabel)}</button>` : ""}
        <button class="chip" data-datebtn>📅 ${esc(dayLabel(st.datum))}</button><input type="date" value="${esc(st.datum)}" data-date aria-label="Datum" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px">
        <button class="chip" data-notiz>${st.notiz ? "📝 " + esc(st.notiz) : "+ Notiz"}</button>
      </div>
      ${tiles}
      ${st.b === "gewerbe" && st.art === "ein" && !editing ? `<div class="sales">Heute: ${sales().length} Verkäufe · ${eur(sales().reduce((a, x) => a + x.cent, 0))}</div>` : ""}
      <div class="keypad">${["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((k) => `<button data-key="${k}">${k}</button>`).join("")}
        <button class="go ${ready() ? "" : "wait"}" data-save aria-label="Speichern">✓ ${st.art === "um" && !editing ? "Umbuchen" : "Speichern"}</button>
        ${editing ? `<button class="btn danger" data-del style="grid-column:span 3">Löschen</button>` : ""}</div>
      ${editing && Store.multi() && editing.by ? `<p class="sub" style="text-align:center;margin:0 0 10px">Eingetragen von ${esc(Store.memberName(editing.by))}${editing.von && editing.von !== editing.by ? ` · zuletzt geändert von ${esc(Store.memberName(editing.von))}` : ""}</p>` : ""}`;
  };
  const bump = () => { const a = $("[data-amount]", m); a.classList.remove("shake"); void a.offsetWidth; a.classList.add("shake"); };
  const save = () => {
    const c = cents();
    if (!c) { bump(); return toast("Erst den Betrag tippen"); }
    if (!st.konto) return toast("Bitte ein Konto wählen");
    if (st.art !== "um" && !st.kat) return toast("Bitte eine Kategorie wählen");
    if (st.art === "um" && (!st.ziel || st.ziel === st.konto)) return toast("Bitte zwei verschiedene Konten wählen");
    const x = editing ? clone(editing) : { id: uid(), created: new Date().toISOString(), by: Store.me?.email || "" };
    Object.assign(x, { art: st.art, buch: st.art === "um" ? kontoBook(st.konto) : st.b, cent: c, konto: st.konto, datum: st.datum || todayISO(), notiz: st.notiz });
    if (st.art === "um") { x.ziel = st.ziel; delete x.kat; } else { x.kat = st.kat; delete x.ziel; }
    Store.put("buchungen", x);
    const l = lastKonto(); l[st.b + "-" + st.art] = st.konto; lsSet(LS.last, l);
    Store.commit(); render();
    const k = katById(x.kat);
    if (editing) { closeModal(m); return toast("Änderung gespeichert"); }
    toast(`${eur(c)} ${st.art === "um" ? "umgebucht" : (k ? k.name : "")} gespeichert`, { label: "Rückgängig", fn: () => { Store.del("buchungen", x.id); Store.commit(); render(); toast("Buchung entfernt"); } });
    if (st.b === "gewerbe" && st.art === "ein") { st.amt = ""; st.notiz = ""; draw(); }   // Verkaufsmodus: gleich weiter
    else closeModal(m);
  };
  draw();
  m.addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.key) {
      const k = t.dataset.key;
      if (k === "⌫") st.amt = st.amt.slice(0, -1);
      else if (k === ",") { if (!st.amt.includes(",")) st.amt = (st.amt || "0") + ","; }
      else { const [, dec] = st.amt.split(","); if (dec != null && dec.length >= 2) return; if (st.amt.replace(",", "").length >= 8) return; st.amt = st.amt === "0" ? k : st.amt + k; }
      return draw();
    }
    if (t.dataset.art) {
      st.art = t.dataset.art; st.kat = null;
      if (!editing) st.konto = defaultKonto(st.b, st.art);
      if (st.art === "um") { if (kontoBook(st.konto) !== st.b) st.konto = kontenOf(st.b)[0]?.id || kontenOf("privat")[0]?.id; st.ziel = db.konten.find((k) => !k.archiv && k.id !== st.konto && (gewerbeAktiv() || k.buch === "privat"))?.id || null; }
      return draw();
    }
    if (t.dataset.tile) {
      if (t.dataset.tile === "__all") { const k = await pickKat(st.b, st.art); if (!k) return; st.kat = k; }
      else st.kat = t.dataset.tile;
      return draw();   // Kachel wählt nur aus – gespeichert wird mit ✓
    }
    if (t.dataset.pick) {
      const id = await pickKonto({ title: t.dataset.pick === "ziel" ? "Nach Konto" : st.art === "um" ? "Von Konto" : "Konto", b: st.b, art: st.art, all: st.art === "um" });
      if (id) { st[t.dataset.pick] = id; draw(); }
      return;
    }
    if (t.hasAttribute("data-notiz")) {
      const v = await promptBox("Notiz", st.notiz, "z. B. Wocheneinkauf"); if (v != null) { st.notiz = v; draw(); }
      return;
    }
    if (t.hasAttribute("data-datebtn")) { const d = $("[data-date]", m); try { d.showPicker(); } catch { d.focus(); d.click(); } return; }
    if (t.hasAttribute("data-save")) return save();
    if (t.hasAttribute("data-del")) {
      if (!await confirmBox("Buchung löschen?", "Die Buchung wird entfernt.", "Löschen", true)) return;
      const copy = clone(editing);
      Store.del("buchungen", editing.id); Store.commit(); closeModal(m); render();
      toast("Buchung gelöscht", { label: "Rückgängig", fn: () => { Store.put("buchungen", copy); Store.commit(); render(); } });
    }
  });
  m.addEventListener("change", (e) => { if (e.target.matches("[data-date]")) { st.datum = e.target.value || todayISO(); draw(); } });
}

/* =================================================================== Konten */
function showKonto(id) {
  const k = kontoById(id); const bal = balance(id);
  const list = db.buchungen.filter((x) => x.konto === id || x.ziel === id).sort((a, c) => c.datum.localeCompare(a.datum)).slice(0, 60);
  const m = modal({ title: k.name, body: `<div class="card hero"><div class="l">Kontostand</div><div class="big">${eur(bal)}</div>
      <div class="l">Anfangsbestand ${eur(k.start)} am ${fDate(k.startDatum)}</div></div>
      <div class="btns" style="margin-bottom:8px">${k.art === "bar" ? `<button class="btn" data-kasse>Kassensturz</button>` : ""}<button class="btn" data-edit>Bearbeiten</button></div>
      ${list.length ? grouped(list, k.buch) : `<div class="empty">Noch keine Buchungen auf diesem Konto.</div>`}` });
  m.addEventListener("click", (e) => {
    if (e.target.closest("[data-edit]")) { closeModal(m); editKonto(id); }
    if (e.target.closest("[data-kasse]")) { closeModal(m); kassensturz(id); }
    const ed = e.target.closest("[data-act=edit]"); if (ed) { e.stopPropagation(); closeModal(m); openEntry({ id: ed.dataset.id }); }
  });
}
async function kassensturz(id) {
  const k = kontoById(id), bal = balance(id);
  const v = await promptBox(`Kassensturz ${k.name}`, "", `Wie viel ist gerade drin? (laut App ${centIn(bal)} €)`);
  if (v == null) return;
  const ist = toCent(v); if (ist == null) return toast("Bitte einen Betrag eingeben");
  const diff = ist - bal;
  if (!diff) return toast("Stimmt genau – nichts zu buchen");
  const typ = diff < 0 ? "aus" : "ein";
  const mains = db.kategorien.filter((c) => c.buch === k.buch && c.typ === typ && !c.hidden);
  const kat = mains.find((c) => c.name === "Sonstiges" && !hasChildren(c.id)) || mains.find((c) => c.name === "Sonstiges") || leafCats(k.buch, typ)[0];
  Store.put("buchungen", { id: uid(), created: new Date().toISOString(), by: Store.me?.email || "", art: typ, buch: k.buch, cent: Math.abs(diff), konto: id, kat: kat?.id, datum: todayISO(), notiz: "Kassensturz" });
  Store.commit(); render(); toast(`Differenz ${eurS(diff)} gebucht`);
}
function editKonto(id) {
  const isNew = !id;
  const k = isNew ? { id: "a" + uid(), name: "", buch: curBook(), art: "giro", start: 0, startDatum: todayISO(), archiv: false } : clone(kontoById(id));
  const used = !isNew && db.buchungen.some((x) => x.konto === id || x.ziel === id);
  const m = modal({ title: isNew ? `Neues Konto · ${BOOKS[k.buch]}` : k.name, body: `<form data-f>
      <label class="f"><span>Name</span><input name="name" value="${esc(k.name)}" placeholder="z. B. Gemeinschaftskonto"></label>
      <label class="f"><span>Art</span><select name="art">${Object.entries(ART_KONTO).map(([a, l]) => `<option value="${a}" ${k.art === a ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="row2"><label class="f"><span>Anfangsbestand €</span><input name="start" inputmode="decimal" value="${centIn(k.start)}"></label>
      <label class="f"><span>am</span><input name="startDatum" type="date" value="${esc(k.startDatum)}"></label></div>
      ${!isNew ? `<label class="f"><span><input type="checkbox" name="archiv" ${k.archiv ? "checked" : ""} style="width:auto;min-height:0"> Konto ausblenden (z. B. aufgelöst)</span></label>` : ""}</form>`,
    foot: `${!isNew ? `<button class="btn danger" data-del>Löschen</button>` : ""}<button class="btn primary" data-save>Speichern</button>` });
  $("[data-save]", m).onclick = () => {
    const f = readForm($("[data-f]", m));
    if (!f.name) return toast("Bitte einen Namen eingeben");
    Object.assign(k, { name: f.name, art: f.art, start: toCent(f.start) || 0, startDatum: f.startDatum || todayISO(), archiv: !!f.archiv });
    Store.put("konten", k); Store.commit(); closeModal(m); render(); toast("Konto gespeichert");
  };
  if (!isNew) $("[data-del]", m).onclick = async () => {
    if (used) return toast("Auf diesem Konto gibt es Buchungen – stattdessen ausblenden.");
    if (!await confirmBox("Konto löschen?", `„${esc(k.name)}“ wird gelöscht.`, "Löschen", true)) return;
    Store.del("konten", k.id); Store.commit(); closeModal(m); render();
  };
}
function showKonten() {
  const b = curBook();
  const m = modal({ title: `Konten · ${BOOKS[b]}`, body: `${kontenOf(b, true).length ? `<div class="list">${kontenOf(b, true).map((k) => `<button class="item" data-k="${k.id}"><span class="ic">${ART_ICON[k.art]}</span><span class="m"><span class="t">${esc(k.name)}${k.archiv ? ' <span class="tag">ausgeblendet</span>' : ""}</span><span class="s">Anfangsbestand ${eur(k.start)} am ${fDate(k.startDatum)}</span></span><span class="v">${eur(balance(k.id))}</span></button>`).join("")}</div>` : `<div class="empty">Noch keine Konten.</div>`}`,
    foot: `<button class="btn primary" data-new>+ Konto anlegen</button>` });
  m.addEventListener("click", (e) => {
    const b2 = e.target.closest("[data-k]"); if (b2) { closeModal(m); editKonto(b2.dataset.k); }
    if (e.target.closest("[data-new]")) { closeModal(m); editKonto(null); }
  });
}

/* =================================================================== Kategorien */
function showKategorien(typ = "aus") {
  const b = curBook();
  const mains = db.kategorien.filter((k) => k.buch === b && k.typ === typ && !k.parent);
  const m = modal({ title: `Kategorien · ${BOOKS[b]}`, body: `<div class="seg" style="grid-template-columns:1fr 1fr;margin-bottom:12px"><button data-typ="aus" class="${typ === "aus" ? "on" : ""}">Ausgaben</button><button data-typ="ein" class="${typ === "ein" ? "on" : ""}">Einnahmen</button></div>
    ${mains.map((mk) => `<div class="pick-group">${mk.icon} ${esc(mk.name)}${mk.hidden ? ' <span class="tag">aus</span>' : ""}</div><div class="list">
      <button class="item" data-k="${mk.id}"><span class="m"><span class="t">${esc(mk.name)}</span><span class="s">Hauptkategorie${mk.fix ? " · fix" : ""}</span></span><span class="sub">›</span></button>
      ${db.kategorien.filter((k) => k.parent === mk.id).map((k) => `<button class="item" data-k="${k.id}"><span class="m"><span class="t">${esc(k.name)}${k.hidden ? ' <span class="tag">aus</span>' : ""}</span><span class="s">${k.fix ? "fix" : "variabel"}</span></span><span class="sub">›</span></button>`).join("")}
      <button class="item" data-newsub="${mk.id}"><span class="m"><span class="t" style="color:var(--acc-ink)">+ Unterkategorie</span></span></button></div>`).join("")}`,
    foot: `<button class="btn primary" data-newmain>+ Hauptkategorie</button>` });
  m.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.typ) { closeModal(m); showKategorien(t.dataset.typ); }
    if (t.dataset.k) { closeModal(m); editKat(t.dataset.k, null, typ); }
    if (t.dataset.newsub) { closeModal(m); editKat(null, t.dataset.newsub, typ); }
    if (t.hasAttribute("data-newmain")) { closeModal(m); editKat(null, null, typ); }
  });
}
function editKat(id, parent, typ) {
  const isNew = !id;
  const k = isNew ? { id: "k" + uid(), buch: curBook(), typ, name: "", icon: parent ? katById(parent).icon : "📦", fix: parent ? katById(parent).fix : false, parent, hidden: false } : clone(katById(id));
  const used = db.buchungen.filter((x) => x.kat === k.id).length;
  const m = modal({ title: isNew ? (parent ? "Neue Unterkategorie" : "Neue Hauptkategorie") : k.name, body: `<form data-f>
      <div class="row2" style="grid-template-columns:${k.parent ? "1fr" : "1fr 90px"}"><label class="f"><span>Name</span><input name="name" value="${esc(k.name)}"></label>
      ${k.parent ? "" : `<label class="f"><span>Symbol</span><input name="icon" value="${esc(k.icon)}" maxlength="4" style="text-align:center;font-size:20px"></label>`}</div>
      <label class="f"><span>Art</span><select name="fix"><option value="0" ${!k.fix ? "selected" : ""}>variabel</option><option value="1" ${k.fix ? "selected" : ""}>fix (jeden Monat gleich)</option></select></label>
      ${!isNew ? `<label class="f"><span><input type="checkbox" name="hidden" ${k.hidden ? "checked" : ""} style="width:auto;min-height:0"> ausblenden (erscheint nicht mehr zur Auswahl)</span></label>` : ""}
      ${used ? `<p class="sub">${used} Buchungen verwenden diese Kategorie.</p>` : ""}</form>`,
    foot: `${!isNew && !used && !hasChildren(k.id) ? `<button class="btn danger" data-del>Löschen</button>` : ""}<button class="btn primary" data-save>Speichern</button>`,
    onClose: () => showKategorien(typ) });
  $("[data-save]", m).onclick = () => {
    const f = readForm($("[data-f]", m)); if (!f.name) return toast("Bitte einen Namen eingeben");
    Object.assign(k, { name: f.name, fix: f.fix === "1", hidden: !!f.hidden }); if (f.icon) k.icon = f.icon;
    Store.put("kategorien", k);
    if (!k.parent) db.kategorien.filter((c) => c.parent === k.id && c.icon !== k.icon).forEach((c) => Store.put("kategorien", Object.assign(clone(c), { icon: k.icon })));
    Store.commit(); closeModal(m); render();
  };
  const del = $("[data-del]", m);
  if (del) del.onclick = async () => { m.onClose = null; closeModal(m); if (await confirmBox("Kategorie löschen?", `„${esc(k.name)}“ wird gelöscht.`, "Löschen", true)) { Store.del("kategorien", k.id); Store.commit(); render(); } showKategorien(typ); };
}
function monatOptions(sel) {
  return Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${sel === i + 1 ? "selected" : ""}>${i + 1}.${i === 0 ? " (Kalendermonat)" : ""}</option>`).join("");
}
function editMonat() {
  const b = curBook();
  const m = modal({ title: `Abrechnungsmonat · ${BOOKS[b]}`, body: `<p style="margin-top:0">Der Monat beginnt am:</p>
      <select data-s>${monatOptions(finSet()[b].monatsStart)}</select>
      <p class="sub">Beispiel 27.: Der Monat „Dezember“ läuft vom 27. November bis 26. Dezember – praktisch, wenn das Gehalt am 27. kommt.</p>`,
    foot: `<button class="btn primary" data-save>Speichern</button>` });
  $("[data-save]", m).onclick = () => { finSet()[b].monatsStart = +$("[data-s]", m).value; Store.touch("settings"); Store.commit(); closeModal(m); render(); };
}
async function toggleGewerbe() {
  const on = gewerbeAktiv();
  const used = db.buchungen.some((x) => x.buch === "gewerbe") || kontenOf("gewerbe", true).length;
  const ok = await confirmBox(on ? "Gewerbe-Buch ausschalten?" : "Gewerbe-Buch einschalten?",
    on ? `Der Umschalter Privat | Gewerbe verschwindet.${used ? " Bereits erfasste Gewerbe-Buchungen bleiben gespeichert und sind nach dem Einschalten wieder da." : ""} Gilt für alle im Haushalt.`
       : "Für ein Kleingewerbe: Einnahmen und Ausgaben getrennt vom Privaten, mit eigenem Gewinn. Gilt für alle im Haushalt.",
    on ? "Ausschalten" : "Einschalten");
  if (!ok) return;
  finSet().gewerbeAktiv = !on; Store.touch("settings"); Store.commit(); render();
}
function editBookColors() {
  const draw = () => {
    const f = farben();
    const sw = (b) => `<div class="swatches">${Object.entries(THEMES).map(([k, t]) => `<button class="swatch ${f[b] === k ? "on" : ""}" data-farbe="${k}" data-b="${b}"><i style="background:${t.acc}"></i>${esc(t.name)}</button>`).join("")}</div>`;
    return `<div class="pick-group">Farbe Privat</div>${sw("privat")}
      ${gewerbeAktiv() ? `<div class="pick-group">Farbe Gewerbe</div>${sw("gewerbe")}
      ${f.privat === f.gewerbe ? `<div class="hint" style="margin-top:12px">Tipp: Unterschiedliche Farben zeigen auf einen Blick, in welchem Buch du gerade bist.</div>` : ""}` : ""}
      <p class="sub">Hell/dunkel und die Farbe der übrigen App: Menü → Einstellungen.</p>`;
  };
  const m = modal({ title: "Farben der Bücher", body: `<div data-d>${draw()}</div>` });
  m.addEventListener("click", (e) => {
    const t = e.target.closest("[data-farbe]"); if (!t) return;
    setFarbe(t.dataset.b, t.dataset.farbe); if (t.dataset.b !== book) { book = t.dataset.b; lsSet(LS.finBook, book); }
    render(); $("[data-d]", m).innerHTML = draw();
  });
}

/* ---------- Altes Haushaltsbuch (Schema 1) übernehmen ---------- */
async function importV1() {
  const file = await pickFile(".json,application/json"); if (!file) return;
  let old;
  try { old = JSON.parse(await file.text()); } catch { return toast("Datei konnte nicht gelesen werden"); }
  if (old?.app === "haushalt") return toast("Das ist eine Sicherung dieser App – bitte unter Einstellungen → Sicherung einspielen.");
  if (!Array.isArray(old?.buchungen) || !Array.isArray(old?.konten)) return toast("Das ist keine Haushaltsbuch-Sicherung");
  const n = db.buchungen.length;
  if (!await confirmBox("Haushaltsbuch übernehmen?", `${old.buchungen.length} Buchungen, ${old.konten.length} Konten und die Kategorien aus der Sicherung vom ${new Date(old.updated).toLocaleString("de-DE")} werden übernommen.${n ? ` <b>Die ${n} Buchungen, Konten und Kategorien hier werden dabei ersetzt.</b>` : ""} Das gilt für den ganzen Haushalt.`, "Übernehmen", !!n)) return;
  ["buchungen", "konten", "kategorien"].forEach((c) => db[c].slice().forEach((r) => Store.del(c, r.id)));
  old.konten.forEach((k) => Store.put("konten", Object.assign({ archiv: false }, k)));
  (old.kategorien || defaultCategories()).forEach((k) => Store.put("kategorien", Object.assign({}, k)));
  old.buchungen.forEach((x) => Store.put("buchungen", Object.assign({ by: Store.me?.email || "" }, x)));
  const s = old.settings || {};
  if (s.privat?.monatsStart) finSet().privat.monatsStart = s.privat.monatsStart;
  if (s.gewerbe?.monatsStart) finSet().gewerbe.monatsStart = s.gewerbe.monatsStart;
  finSet().onboarded = true;
  Store.touch("settings");
  if (s.farben?.privat) setFarbe("privat", s.farben.privat);
  if (s.farben?.gewerbe) setFarbe("gewerbe", s.farben.gewerbe);
  Store.commit(); render(); toast(`${old.buchungen.length} Buchungen übernommen`);
}

/* ---------- Erster Start im Haushalt: Anfangsbestände ---------- */
function finOnboarding() {
  if (finSet().onboarded) return;
  const ks = kontenOf("privat");
  const m = modal({ title: "Haushaltsbuch einrichten", body: `<p style="margin-top:0">Wie viel ist gerade auf den Konten? Dann stimmen die Kontostände von Anfang an.</p>
      <form data-f>${ks.map((k) => `<label class="f"><span>${ART_ICON[k.art]} ${esc(k.name)}</span><input name="${k.id}" inputmode="decimal" placeholder="0,00"></label>`).join("")}
      <label class="f"><span>Der Monat beginnt am</span><select name="ms">${monatOptions(finSet().privat.monatsStart)}</select></label></form>
      <p class="sub">Tipp: Kommt das Gehalt z. B. am 27., wähle den 27. Alles später änderbar unter Mehr. Hast du eine Sicherung der bisherigen Haushaltsbuch-App? Dann schließe dieses Fenster und wähle Mehr → Altes Haushaltsbuch übernehmen.</p>`,
    foot: `<button class="btn primary" data-ok>Los geht’s</button>`,
    onClose: () => { finSet().onboarded = true; Store.touch("settings"); Store.commit(); render(); } });
  $("[data-ok]", m).onclick = () => {
    const f = readForm($("[data-f]", m));
    ks.forEach((k) => { const c = toCent(f[k.id]) || 0; if (c !== k.start) Store.put("konten", Object.assign(clone(k), { start: c, startDatum: todayISO() })); });
    finSet().privat.monatsStart = +f.ms || 1;
    closeModal(m);
  };
}

/* =================================================================== Modul */
const Finanzen = {
  id: "finanzen", group: "Finanzen", title: "Haushaltsbuch", icon: "💶",
  hint: "Einnahmen, Ausgaben, Konten",
  bereich: () => curBook(),
  top() {
    if (!gewerbeAktiv()) return "";
    return `<div class="switch">${Object.entries(BOOKS).map(([k, l]) => `<button data-book="${k}" class="${curBook() === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  },
  view() { return ({ start: viewStart, liste: viewListe, auswertung: viewAuswertung, mehr: viewMehr }[finTab] || viewStart)(); },
  bottom() {
    return `<nav class="tabs">${FIN_TABS.map(([k, l, p]) => `<button data-ftab="${k}" class="${finTab === k ? "on" : ""}">${svg(p)}<span>${l}</span></button>`).join("")}</nav>
      <button class="fab" data-act="neu" aria-label="Buchung erfassen">+</button>`;
  },
  onShow() { finOnboarding(); },
  shortcut(neu) { openEntry({ art: neu === "ein" ? "ein" : "aus" }); },
  async click(e) {
    const bk = e.target.closest("[data-book]");
    if (bk && bk.closest(".switch")) { book = bk.dataset.book; lsSet(LS.finBook, book); ui.off = { liste: 0, auswertung: 0 }; render(); return true; }
    const tb = e.target.closest("[data-ftab]"); if (tb) { finTab = tb.dataset.ftab; lsSet(LS.finTab, finTab); render(); window.scrollTo(0, 0); return true; }
    const fl = e.target.closest("[data-filter]"); if (fl) { ui.filter = fl.dataset.filter; render(); return true; }
    const a = e.target.closest("[data-act]"); if (!a) return false;
    const id = a.dataset.id;
    switch (a.dataset.act) {
      case "neu": openEntry({}); return true;
      case "edit": closeAll(); openEntry({ id }); return true;
      case "konto": showKonto(id); return true;
      case "konten": showKonten(); return true;
      case "kategorien": showKategorien("aus"); return true;
      case "monat": editMonat(); return true;
      case "gewerbe": toggleGewerbe(); return true;
      case "fin-design": editBookColors(); return true;
      case "import-v1": importV1(); return true;
      case "katdetail": showKatDetail(id, a.dataset.typ); return true;
      case "prev": ui.off[a.dataset.k]--; render(); return true;
      case "next": ui.off[a.dataset.k] = Math.min(0, ui.off[a.dataset.k] + 1); render(); return true;
    }
    return false;
  },
  input(e) {
    if (!e.target.matches("[data-q]")) return false;
    ui.q = e.target.value; const pos = e.target.selectionStart; render();
    const el = $("[data-q]"); el.focus(); el.setSelectionRange(pos, pos);
    return true;
  }
};
