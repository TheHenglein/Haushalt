/* Haushalt – Bereich „Haushalt“: vorbereitete Module, die im nächsten Schritt gebaut werden.
 * Jedes Modul ist ein Objekt mit id, group, title, icon, hint und view(); optional top(), bottom(), click(), input(), onShow(), bereich().
 * Eigene Daten meldet ein Modul mit registerData(["sammlung"], init) an – dann laufen Speichern und Zusammenführen automatisch mit.
 */
"use strict";

function soonModule(id, title, icon, hint, text) {
  return {
    id, group: "Haushalt", title, icon, hint, soon: true,
    view: () => `<div class="soon"><div class="soon-ic">${icon}</div><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="hint">Dieser Bereich ist vorbereitet und kommt im nächsten Schritt. Alles, was hier entsteht, liegt in derselben Haushalt-Datei und ist für alle Mitglieder sichtbar.</div></div>`
  };
}
const HAUSHALT_MODULE = [
  soonModule("plan", "Haushaltsplan", "🧹", "Wer macht was – und wann", "Wiederkehrende Aufgaben im Haushalt planen und unter euch aufteilen."),
  soonModule("rezepte", "Rezepte", "🍲", "Eure Lieblingsgerichte", "Rezepte sammeln und daraus direkt die Einkaufsliste füllen."),
  soonModule("einkauf", "Einkaufsliste", "🛒", "Gemeinsam einkaufen", "Eine gemeinsame Liste – wer im Laden steht, sieht, was fehlt."),
  soonModule("todo", "To-Dos", "✅", "Erledigen und abhaken", "Aufgaben für euch beide, mit Termin und Zuständigkeit.")
];
