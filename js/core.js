/* Haushalt – Grundbausteine: Hilfen, Meldungen, Dialoge, Farben
 * Alle Skripte teilen sich einen globalen Bereich (klassische <script>-Dateien, kein Build-Schritt).
 */
"use strict";

const CFG = Object.assign({ googleClientId: "", googleApiKey: "", driveFolder: "Haushalt", driveFile: "haushalt.json" }, window.APP_CONFIG || {});
// Projektnummer = App-ID für den Google Picker; steckt vorne in der Client-ID („123456-abc.apps.googleusercontent.com“)
CFG.appId = (CFG.googleClientId.match(/^(\d+)-/) || [])[1] || "";
const APP_NAME = "Haushalt";
const APP_VERSION = "1.5";

// eigene Namen (hh_), damit sich die Apps auf TheHenglein.github.io nicht in die Quere kommen (Haushaltsbuch: hb_, Deko-App: mk_)
const LS = {
  data: "hh_data", priv: "hh_priv", meta: "hh_meta", finScope: "hh_fin_scope", ownHint: "hh_own_hint", mode: "hh_mode", token: "hh_token", theme: "hh_theme", farben: "hh_farben",
  last: "hh_last", module: "hh_module", finTab: "hh_fin_tab", finBook: "hh_fin_book"
};

/* =================================================================== Hilfen */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = (o) => JSON.parse(JSON.stringify(o));
const fEUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const eur = (cent) => fEUR.format((cent || 0) / 100);
const eurS = (cent) => (cent > 0 ? "+" : cent < 0 ? "−" : "") + fEUR.format(Math.abs(cent || 0) / 100);
/* "12,5" / "1.234,56" / "12.50" → Cent */
const toCent = (v) => {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Math.round(v * 100);
  let s = String(v).replace(/[€\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s); return isFinite(n) ? Math.round(n * 100) : null;
};
const centIn = (c) => c == null ? "" : (c / 100).toFixed(2).replace(".", ",");
const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fDate = (iso) => iso ? iso.split("-").reverse().join(".") : "–";
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const isoOf = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); // m 0-basiert, rollt über
const dayLabel = (iso) => {
  const t = todayISO(); if (iso === t) return "Heute";
  const y = new Date(Date.parse(t) - 864e5).toISOString().slice(0, 10); if (iso === y) return "Gestern";
  const d = new Date(iso + "T12:00:00Z"); return `${WD[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
};
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const deskMQ = window.matchMedia ? matchMedia("(min-width: 1024px)") : null;
const isDesktop = () => !!deskMQ?.matches;   // Laptop/PC: Seitenleiste, Reiter oben, Dialoge mittig
const firstName = (s) => String(s || "").trim().split(/[\s@]/)[0];

let toastTimer;
function toast(msg, action, ms = 3200) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ""}`;
  if (action) $("button", t).onclick = () => { t.classList.remove("on"); action.fn(); };
  t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), action ? 5000 : ms);
}
function download(name, blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function pickFile(accept) {
  return new Promise((res) => {
    const i = document.createElement("input"); i.type = "file"; i.accept = accept;
    i.onchange = () => res(i.files[0] || null); i.click();
  });
}

/* =================================================================== Dialoge (gestapelt) */
const stack = [];
function modal({ title, body, foot = "", full = false, cls = "", onClose }) {
  const bg = document.createElement("div"); bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal ${full ? "full" : ""} ${cls}" role="dialog" aria-modal="true">
    <div class="modal-h"><h2>${esc(title)}</h2><button class="x" data-close aria-label="Schließen">×</button></div>
    <div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ""}</div>`;
  $("#modals").appendChild(bg); stack.push(bg); bg.onClose = onClose;
  bg.addEventListener("click", (e) => { if (e.target === bg || e.target.closest("[data-close]")) closeModal(bg); });
  document.body.style.overflow = "hidden";
  return bg;
}
function closeModal(bg = stack[stack.length - 1]) {
  if (!bg) return;
  const i = stack.indexOf(bg); if (i >= 0) stack.splice(i, 1);
  bg.remove(); const cb = bg.onClose; bg.onClose = null; cb && cb();
  if (!stack.length) document.body.style.overflow = "";
}
function closeAll() { while (stack.length) closeModal(); }
function confirmBox(title, text, okLabel = "OK", danger = false) {
  return new Promise((res) => {
    const m = modal({ title, body: `<p style="margin-top:0">${text}</p>`, foot: `<button class="btn" data-close>Abbrechen</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(okLabel)}</button>`, onClose: () => res(false) });
    $("[data-ok]", m).onclick = () => { m.onClose = null; closeModal(m); res(true); };
  });
}
function promptBox(title, value = "", placeholder = "", { type = "text", maxlength = 80, hint = "" } = {}) {
  return new Promise((res) => {
    const m = modal({ title, onClose: () => res(null), body: `<input data-in type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="${maxlength}">${hint ? `<p class="sub">${hint}</p>` : ""}`,
      foot: `<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-ok>Übernehmen</button>` });
    const inp = $("[data-in]", m); setTimeout(() => inp.focus(), 50);
    const ok = () => { m.onClose = null; closeModal(m); res(inp.value.trim()); };
    $("[data-ok]", m).onclick = ok; inp.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
  });
}
function readForm(form) { const o = {}; new FormData(form).forEach((v, k) => (o[k] = typeof v === "string" ? v.trim() : v)); return o; }

/* =================================================================== Farben & dunkler Modus (pro Person, nur auf dem Gerät) */
const THEMES = {
  lila: { name: "Lila-Grau", acc: "#4A4E69", light: { soft: "#E9EAED", ink: "#4A4E69" }, dark: { soft: "#2E303E", ink: "#9698A8" } },
  blau: { name: "Blau", acc: "#1F5FA8", light: { soft: "#E4ECF5", ink: "#1F5FA8" }, dark: { soft: "#1E3656", ink: "#7DA2CD" } },
  nachtblau: { name: "Nachtblau", acc: "#22407A", light: { soft: "#E4E8EF", ink: "#22407A" }, dark: { soft: "#1F2A45", ink: "#8898B7" } },
  ozean: { name: "Ozean", acc: "#155E75", light: { soft: "#E3ECEE", ink: "#155E75" }, dark: { soft: "#1A3643", ink: "#77A2AF" } },
  dunkellila: { name: "Dunkles Lila", acc: "#4B2A7B", light: { soft: "#E9E5EF", ink: "#4B2A7B" }, dark: { soft: "#2E2245", ink: "#9E8CB8" } },
  aubergine: { name: "Aubergine", acc: "#6A2C5E", light: { soft: "#EDE6EC", ink: "#6A2C5E" }, dark: { soft: "#3A233A", ink: "#AF8DA8" } },
  petrol: { name: "Petrol", acc: "#2F6B6F", light: { soft: "#E6EDEE", ink: "#2F6B6F" }, dark: { soft: "#243B40", ink: "#86A9AB" } },
  tanne: { name: "Tannengrün", acc: "#2E6B4A", light: { soft: "#E6EDE9", ink: "#2E6B4A" }, dark: { soft: "#233B32", ink: "#86A996" } },
  anthrazit: { name: "Anthrazit", acc: "#3A3F47", light: { soft: "#E7E8E9", ink: "#3A3F47" }, dark: { soft: "#282A31", ink: "#95979C" } },
};
const DEFAULT_FARBE = { app: "blau", privat: "dunkellila", gewerbe: "petrol", haushalt: "tanne" };
const farben = () => Object.assign({}, DEFAULT_FARBE, lsGet(LS.farben, {}));
const setFarbe = (bereich, key) => { const f = farben(); f[bereich] = key; lsSet(LS.farben, f); };
const darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
const themeMode = () => lsGet(LS.theme, "auto");
/* bereich: "app" | "privat" | "gewerbe" | "haushalt" */
function applyTheme(bereich = "app") {
  const mode = themeMode();
  const dark = mode === "dark" || (mode === "auto" && !!darkMQ?.matches);
  const root = document.documentElement; root.dataset.theme = dark ? "dark" : "light";
  const t = THEMES[farben()[bereich]] || THEMES.blau, v = dark ? t.dark : t.light;
  root.style.setProperty("--acc", t.acc); root.style.setProperty("--acc-soft", v.soft); root.style.setProperty("--acc-ink", v.ink);
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = t.acc;
}
