# Haushalt

Web-App (auf dem Handy als App installierbar) für alles, was ein Haushalt braucht – gemeinsam nutzbar für mehrere Personen.
Bereiche: **Finanzen** (Haushaltsbuch) · **Haushalt** (Haushaltsplan, Rezepte, Einkaufsliste, To-Dos – vorbereitet).

## Einrichtung (einmalig)

**Google Cloud** (dasselbe Projekt wie beim Haushaltsbuch):
1. *APIs & Dienste → Bibliothek* → **Google Picker API** aktivieren (Google Drive API ist schon aktiv).
2. *APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel*. Danach den Schlüssel einschränken:
   - Anwendungseinschränkung: **Websites** → `https://thehenglein.github.io/*`
   - API-Einschränkung: **Google Picker API**
3. Steht die App unter *OAuth-Zustimmungsbildschirm / Zielgruppe* auf „Testen“: **jede Person, die mitmacht, als Testnutzer eintragen** (Gmail-Adresse).
4. Die OAuth-Client-ID bleibt dieselbe – `https://TheHenglein.github.io` ist dort schon eingetragen.

**config.js** ausfüllen: `googleClientId` (wie beim Haushaltsbuch) und `googleApiKey` (Schritt 2).

**GitHub**: neues öffentliches Repository (z. B. „Haushalt“), alle Dateien hochladen – die Ordner `js` und `icons` per **Drag & Drop**. *Settings → Pages → Branch main / root*. Adresse: `https://TheHenglein.github.io/Haushalt/`.
Bei späteren Updates **config.js nicht überschreiben**.

## Gemeinsam nutzen

1. Person A öffnet die App → *Mit Google anmelden* → **Neuen Haushalt anlegen**. Die Datei `Haushalt/haushalt.json` liegt in A's Google Drive.
2. A: Menü → *Mitglieder & Freigabe* → **Person einladen** (oder die Datei direkt in Google Drive mit Bearbeitungsrechten freigeben).
3. Person B öffnet die App → *Mit Google anmelden* → **Einem Haushalt beitreten** → Datei `haushalt.json` auswählen. Einmalig – danach findet die App sie auf allen Geräten von B.

Zugriff entziehen: in Google Drive die Freigabe entfernen (oder in der App *Entfernen*).

## Eigene und versteckte Konten

Jedes Konto ist **gemeinsam** oder gehört **einer Person**. Eigene Konten können **nur für mich sichtbar** sein:
sie liegen dann mit ihren Buchungen in `Haushalt/haushalt-privat-<id>.json` im eigenen Drive (nicht freigeben!).
In der gemeinsamen Datei steht nur ein Platzhalter ohne Namen und Stand. Umbuchungen zwischen einem versteckten und
einem sichtbaren Konto bleiben gemeinsam (sonst stimmen die Kontostände der anderen nicht) und erscheinen dort als
„Privates Konto (Name)“. Im Privat-Buch gibt es den Filter Alle · Meine · Gemeinsam · je Person.

## Technik

- Reines HTML/CSS/JS, kein Build. `js/core.js` (Hilfen, Dialoge, Farben) · `js/store.js` (zwei Dateien: gemeinsam + privat, Drive, Zusammenführen, Picker, Freigaben) · `js/finanzen.js` (Haushaltsbuch) · `js/haushalt.js` (Haushalt-Module) · `js/app.js` (Menü, Einrichtung, Einstellungen, Start).
- Zugriff nur mit `drive.file` (App sieht nur selbst angelegte oder einmal ausgewählte Dateien).
- Mehrere Personen gleichzeitig: jeder Eintrag hat `id`, `upd` (Zeitstempel), `von`; Löschungen als Grabstein in `tomb`. Vor jedem Speichern wird die Datei gelesen und zusammengeführt; alle 30 s werden Änderungen der anderen abgeholt.
- Neues Modul: Objekt mit `id, group, title, icon, hint, view()` in `MODULES` (app.js) eintragen; eigene Daten mit `registerData(["sammlung"], init)` anmelden und nur über `Store.put / Store.del` + `Store.commit()` ändern.
