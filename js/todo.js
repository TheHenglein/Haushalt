/* =====================================================================
 * To-Dos – Aufgaben mit Zuständigkeit, Fälligkeit und Kategorie.
 * Anlegen wie im Haushaltsplan (Dialog), Darstellung als Liste wie die Einkaufsliste.
 * Kategorien werden in den Einstellungen für den ganzen Haushalt verwaltet.
 * ===================================================================== */
const DEFAULT_TODO_KAT = ["Haushalt", "Besorgungen", "Garten", "Auto", "Papierkram", "Reparatur", "Sonstiges"];
registerData(["todos"], (d) => {
  const h = d.settings.haushalt = d.settings.haushalt || {};
  if (!Array.isArray(h.todoKat)) h.todoKat = DEFAULT_TODO_KAT.slice();
});
const todoKat = () => hhSet().todoKat;
const td = { filter: "alle", done: false };   // Filter: "alle" | "meine" | Kategorie

/* ---------- Fälligkeit ---------- */
function faelligInfo(x) {
  if (!x.faellig) return null;
  const t = todayISO(), d = x.faellig;
  if (!x.erledigt && d < t) return { cls: "t-late", txt: `überfällig · ${tagKurz(d)}` };
  if (d === t) return { cls: "t-soon", txt: "heute" };
  if (d === isoAdd(t, 1)) return { cls: "t-soon", txt: "morgen" };
  return { cls: "", txt: `bis ${tagKurz(d)}` };
}
const naechsterSamstag = () => { const t = todayISO(), w = new Date(t + "T12:00:00Z").getUTCDay(); return isoAdd(t, (6 - w + 7) % 7 || 7); };
const naechsterMontag = () => { const t = todayISO(), w = new Date(t + "T12:00:00Z").getUTCDay(); return isoAdd(t, (8 - w) % 7 || 7); };

/* ---------- Listen ---------- */
const passtFilter = (x) => td.filter === "alle" ? true : td.filter === "meine" ? (x.personen || []).includes(ME()) : x.kategorie === td.filter;
const offeneTodos = () => db.todos.filter((x) => !x.erledigt && passtFilter(x))
  .sort((a, b) => (a.faellig || "9999").localeCompare(b.faellig || "9999") || a.pos - b.pos);
const erledigteTodos = () => db.todos.filter((x) => x.erledigt && passtFilter(x)).sort((a, b) => (b.erledigtAm || "").localeCompare(a.erledigtAm || ""));

function rowTodo(x) {
  const f = faelligInfo(x), multi = Store.multi();
  const meta = [x.kategorie ? esc(x.kategorie) : "", f ? `<span class="tdue ${f.cls}">${esc(f.txt)}</span>` : ""].filter(Boolean).join(" · ");
  return `<div class="erow ${x.erledigt ? "done" : ""}" data-tid="${x.id}">
    <button class="ebox" data-tcheck="${x.id}" aria-label="${x.erledigt ? "Wieder offen" : "Abhaken"}">${x.erledigt ? "✓" : ""}</button>
    <button class="etext" data-tedit="${x.id}"><span class="en">${esc(x.titel)}</span>${meta ? `<small>${meta}</small>` : ""}${x.notiz ? `<small class="tnote">${esc(x.notiz)}</small>` : ""}</button>
    ${multi && (x.personen || []).length ? `<span class="tavs">${avatars(x.personen)}</span>` : ""}
  </div>`;
}

function viewTodo() {
  const offen = offeneTodos(), fertig = erledigteTodos(), multi = Store.multi();
  const kats = todoKat().filter((k) => db.todos.some((x) => x.kategorie === k) || k === td.filter);
  const chip = (k, l) => `<button class="chip ${td.filter === k ? "on" : ""}" data-tfilter="${esc(k)}">${esc(l)}</button>`;
  const leer = td.filter === "alle"
    ? `<div class="empty"><b>Nichts zu tun</b>Neue Aufgaben über „Aufgabe hinzufügen“ anlegen – mit Zuständigkeit, Kategorie und Termin.</div>`
    : `<div class="empty"><b>Keine offenen Aufgaben</b>in diesem Filter.</div>`;
  return `<button class="eadd tadd" data-tnew><span class="eplus">+</span><span>Aufgabe hinzufügen</span></button>
    ${db.todos.length ? `<div class="chips tfilter">${chip("alle", "Alle")}${multi ? chip("meine", "Meine") : ""}${kats.map((k) => chip(k, k)).join("")}</div>` : ""}
    ${offen.length ? `<div class="elist">${offen.map(rowTodo).join("")}</div>` : leer}
    ${fertig.length ? `<button class="edone-h" data-ttoggle>${td.done ? "▾" : "▸"} ${fertig.length} erledigt</button>
      ${td.done ? `<div class="elist">${fertig.map(rowTodo).join("")}</div><div class="btns" style="margin-top:8px"><button class="btn small ghost" data-tclear>Erledigte löschen</button></div>` : ""}` : ""}`;
}

function toggleTodo(id) {
  const x = clone(db.todos.find((y) => y.id === id)); if (!x) return;
  x.erledigt = !x.erledigt; x.erledigtAm = x.erledigt ? new Date().toISOString() : null;
  Store.put("todos", x); Store.commit(); render();
}

/* ---------- Anlegen / Bearbeiten (wie im Haushaltsplan) ---------- */
function todoDialog(id = null) {
  const x = id ? clone(db.todos.find((y) => y.id === id)) : null;
  const multi = Store.multi(), mitglieder = db.mitglieder;
  let wer = x ? [...(x.personen || [])] : (ME() ? [ME()] : []);
  let kat = x ? x.kategorie || "" : (todoKat().includes(td.filter) ? td.filter : "");
  const m = modal({ title: x ? "Aufgabe bearbeiten" : "Neue Aufgabe", body: `<form data-f onsubmit="return false">
      <label class="f"><span>Aufgabe</span><div class="sugwrap"><input name="titel" value="${esc(x?.titel || "")}" placeholder="z. B. Steuererklärung abgeben" maxlength="80" data-ttitel></div></label>
      ${multi ? `<div class="f"><span class="flabel">Zuständig</span><div class="chips wrap" data-twer></div></div>` : ""}
      <div class="f"><span class="flabel">Erledigen bis</span>
        <div class="row2" style="grid-template-columns:1fr auto;align-items:center"><input type="date" name="faellig" value="${esc(x?.faellig || "")}" data-tdate><button type="button" class="btn small ghost" data-tdq="">Kein Termin</button></div>
        <div class="chips wrap" style="margin-top:8px">${[["heute", "Heute"], ["morgen", "Morgen"], ["we", "Wochenende"], ["nw", "Nächste Woche"], ["2w", "In 2 Wochen"]].map(([k, l]) => `<button type="button" class="chip" data-tdq="${k}">${l}</button>`).join("")}</div></div>
      <div class="f"><span class="flabel">Kategorie</span><div class="chips wrap" data-tkat></div></div>
      <label class="f"><span>Notiz</span><input name="notiz" value="${esc(x?.notiz || "")}" placeholder="optional"></label>
    </form>`,
    foot: `${x ? `<button class="btn danger" data-tdel>Löschen</button>` : ""}<button class="btn primary" data-tsave>Speichern</button>` });
  const titel = $("[data-ttitel]", m), datum = $("[data-tdate]", m);
  const drawWer = () => { const el = $("[data-twer]", m); if (el) el.innerHTML = mitglieder.map((p) => `<button type="button" class="chip ${wer.includes(p.id) ? "on" : ""}" data-tp="${esc(p.id)}">${avatars([p.id])} ${esc(p.id === ME() ? "Ich" : firstName(p.name))}</button>`).join(""); };
  const drawKat = () => { $("[data-tkat]", m).innerHTML = todoKat().map((k) => `<button type="button" class="chip ${kat === k ? "on" : ""}" data-tk="${esc(k)}">${esc(k)}</button>`).join("") + `<button type="button" class="chip ghost" data-tknew>+ Neue Kategorie</button>`; };
  drawWer(); drawKat();
  // bekannte Titel vorschlagen (z. B. wiederkehrende Aufgaben)
  const titelListe = () => [...new Map(db.todos.map((y) => [normName(y.titel), y])).values()];
  attachSuggest(titel, (q) => titelListe().filter((y) => normName(y.titel).includes(normName(q)) && normName(y.titel) !== normName(q))
    .map((y) => ({ label: y.titel, sub: y.kategorie || "", value: y })), (it) => { titel.value = it.value.titel; if (!kat && it.value.kategorie) { kat = it.value.kategorie; drawKat(); } });
  if (!x) setTimeout(() => titel.focus(), 60);
  m.addEventListener("click", (e) => {
    const p = e.target.closest("[data-tp]"); if (p) { const v = p.dataset.tp; wer = wer.includes(v) ? wer.filter((y) => y !== v) : [...wer, v]; return drawWer(); }
    const k = e.target.closest("[data-tk]"); if (k) { kat = kat === k.dataset.tk ? "" : k.dataset.tk; return drawKat(); }
    if (e.target.closest("[data-tknew]")) return promptBox("Neue Kategorie", "", "z. B. Urlaub").then((v) => {
      if (!v) return; const vorh = todoKat().find((y) => normName(y) === normName(v));
      if (!vorh) { todoKat().push(v); Store.touch("settings"); Store.commit(); }
      kat = vorh || v; drawKat();
    });
    const q = e.target.closest("[data-tdq]"); if (q) {
      const t = todayISO();
      datum.value = ({ "": "", heute: t, morgen: isoAdd(t, 1), we: naechsterSamstag(), nw: naechsterMontag(), "2w": isoAdd(t, 14) })[q.dataset.tdq];
    }
  });
  const save = () => {
    const f = readForm($("[data-f]", m)); if (!f.titel) return toast("Bitte eine Aufgabe eingeben");
    const rec = x || { id: "t" + uid(), erledigt: false, erledigtAm: null, pos: Date.now(), by: ME() };
    Object.assign(rec, { titel: f.titel, faellig: f.faellig || "", kategorie: kat, personen: multi ? wer : [], notiz: f.notiz || "" });
    Store.put("todos", rec); Store.commit(); closeModal(m); render();
  };
  $("[data-tsave]", m).onclick = save;
  titel.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); save(); } });
  const del = $("[data-tdel]", m);
  if (del) del.onclick = () => {
    const copy = clone(x); Store.del("todos", x.id); Store.commit(); closeModal(m); render();
    toast(`${x.titel} entfernt`, { label: "Rückgängig", fn: () => { Store.put("todos", copy); Store.commit(); render(); } });
  };
}

/* =================================================================== Modul */
const Todos = {
  id: "todo", group: "Haushalt", title: "To-Dos", icon: "✅", hint: "Erledigen und abhaken",
  bereich: () => "haushalt",
  view: viewTodo,
  click(e) {
    if (e.target.closest("[data-tnew]")) { todoDialog(); return true; }
    const c = e.target.closest("[data-tcheck]"); if (c) { toggleTodo(c.dataset.tcheck); return true; }
    const ed = e.target.closest("[data-tedit]"); if (ed) { todoDialog(ed.dataset.tedit); return true; }
    const fl = e.target.closest("[data-tfilter]"); if (fl) { td.filter = fl.dataset.tfilter; render(); return true; }
    if (e.target.closest("[data-ttoggle]")) { td.done = !td.done; render(); return true; }
    if (e.target.closest("[data-tclear]")) {
      const weg = erledigteTodos().map(clone);
      weg.forEach((x) => Store.del("todos", x.id)); Store.commit(); render();
      toast(`${weg.length} erledigte gelöscht`, { label: "Rückgängig", fn: () => { weg.forEach((x) => Store.put("todos", x)); Store.commit(); render(); } });
      return true;
    }
    return false;
  },

  /* ---------- Einstellungen: Kategorien für den ganzen Haushalt ---------- */
  settingsPage: "todo",
  settingsHint: () => `${todoKat().length} Kategorien`,
  settingsView() {
    const used = (k) => db.todos.filter((x) => x.kategorie === k).length;
    return `<div class="h3"><span>Kategorien</span></div>
      <div class="list">${todoKat().map((k, i) => `<div class="item"><span class="m"><span class="t">${esc(k)}</span><span class="s">${used(k) ? used(k) + " Aufgaben" : "noch nicht benutzt"}</span></span>
        <button class="btn small ghost" data-tkren="${i}">Umbenennen</button><button class="btn small ghost" data-tkdel="${i}" aria-label="${esc(k)} entfernen">Entfernen</button></div>`).join("")}</div>
      <div class="btns" style="margin-top:12px"><button class="btn primary" data-tkadd>+ Kategorie</button></div>
      <p class="sub">Die Kategorien gelten für alle im Haushalt und dienen in der To-Do-Liste als Filter. Entfernen nimmt die Kategorie nur aus der Auswahl – Aufgaben behalten sie.</p>`;
  },
  settingsClick(e) {
    const d = e.target.closest("[data-tkdel]");
    if (d) { todoKat().splice(+d.dataset.tkdel, 1); Store.touch("settings"); Store.commit(); render(); return true; }
    const r = e.target.closest("[data-tkren]");
    if (r) {
      const alt = todoKat()[+r.dataset.tkren];
      promptBox("Kategorie umbenennen", alt).then((v) => {
        if (!v || v === alt) return;
        if (todoKat().some((y) => normName(y) === normName(v) && y !== alt)) return toast(`„${v}“ gibt es schon`);
        todoKat()[+r.dataset.tkren] = v; Store.touch("settings");
        db.todos.filter((x) => x.kategorie === alt).forEach((x) => Store.put("todos", Object.assign(clone(x), { kategorie: v })));
        if (td.filter === alt) td.filter = v;
        Store.commit(); render();
      });
      return true;
    }
    if (e.target.closest("[data-tkadd]")) {
      promptBox("Neue Kategorie", "", "z. B. Urlaub").then((v) => {
        if (v && !todoKat().some((y) => normName(y) === normName(v))) { todoKat().push(v); Store.touch("settings"); Store.commit(); render(); }
      });
      return true;
    }
    return false;
  }
};
