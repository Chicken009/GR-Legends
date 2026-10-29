# GR Legends – Hinweise für Claude

Antworten und Texte in der App auf Deutsch.

## Datenschutz: alles ist öffentlich

Das Repository auf GitHub, die Seite auf GitHub Pages und der Google-Drive-Ordner mit den
Smartrace-CSVs und dem Einstellungen-Sheet sind **für jeden lesbar**. Deshalb gilt immer:

- **Keine echten Personendaten ins Repository** – weder in Code, Tests, Testdaten, Dokumentation,
  Commit-Nachrichten noch in Pull Requests. Auch keine Initialen oder Spitznamen echter Fahrer.
  Testdaten nur mit erfundenen Namen (z. B. Anton Berger, Mika, Emil, F. Lorenz, Pia S.).
- Echte Rennergebnisse für die Entwicklung liegen nur in `local-data/` (per `.gitignore`
  ausgeschlossen). Daraus nie Namen in Dateien übernehmen, die ins Repository gehen. Vor jedem Commit
  prüfen, dass keine Namen aus `local-data/` im Diff stehen.
- Was einmal gepusht ist, bleibt in der Git-Historie und kann nur mit Umschreiben der Historie plus
  GitHub-Support wieder entfernt werden – also vorher prüfen, nicht hinterher.
- Die Fahrer stehen in Smartrace und den CSVs nur als Pseudonym (z. B. „Fahrer 01“). Was angezeigt
  wird, legt jede Person selbst fest (Spalte „Anzeigename“ im Einstellungen-Sheet, auch als Kette
  „alter Name → Fahrer 01 → Anzeigename“). Die App muss mit beidem funktionieren (Pseudonym als
  Schlüssel, Anzeigename zur Anzeige).
- Namen aus dem Einstellungen-Sheet nie ungefragt in der Oberfläche zeigen (z. B. Hinweise auf
  Tippfehler nur mit Zeilennummer) – dort können Zuordnungen zu echten Namen stehen.
- Kein Tracking, keine Cookies, keine externen Dienste außer Google Drive/Sheets (Daten) und GitHub
  Pages (Hosting). Schriften und Bibliotheken lokal einbinden, nichts von fremden Servern nachladen.
  Neue externe Dienste nur nach Rückfrage – und dann den Datenschutzhinweis anpassen.
- Der Datenschutzhinweis steht in `src/ui/Privacy.tsx`. Bei Änderungen an Datenquellen, Hosting oder
  gespeicherten Daten den Hinweis mitpflegen. Die Kontaktdaten darin sind absichtlich verschleiert
  (nicht als Klartext im Code) – so lassen.
- Browserspeicher (`localStorage`) nur für Einstellungen auf dem eigenen Gerät und als Zwischenspeicher der
  öffentlichen Drive-Dateien (Rennergebnisse, Wettkämpfe) – sonst nie für Daten anderer.

## Gestaltung (einheitlich in der ganzen App)

- **Ich:** grün hinterlegte Zeile/Karte (`me-row`), grüner Ring am Avatar, „Du · Name“. In Texten und
  Listen nur den eigenen Namen bzw. „Du“ grün färben, nie ganze Zeilen.
- **Teams:** nur als farbiger Rand bzw. Strich links (`teamColor`). Den Teamnamen nicht in jeder Zeile
  wiederholen – er steht einmal in der Teamwertung. Keine Ringe in Teamfarbe: der grüne Ring gehört dir.
- **Punkte:** große Zahl mit kleinem „Pkt.“ dahinter (`Pts`, in der Saison `Amount`).
- **Karten:** Titel, rechts höchstens ein kurzer Hinweis, dann Inhalt. Mehrere Themen in einer Karte
  als Abschnitte mit kleiner Überschrift und Trennlinie (`card-part`, `part-label`). Lieber Zahl,
  Grafik oder Chip als Satz; höchstens 2–3 Zeilen Fließtext. Erklärungen erst beim Antippen oder
  eingeklappt.
- **Sprache:** kurz, Zahl zuerst („in ca. 10 Min.“, „Noch 2 Läufe, dann bist du dran“).
- **Regeln/Wertung:** Punkte je Platz als Treppe (`PointsLadder`), Gewichtungen und Bonus als
  `RuleChip`, der ausführliche Text eingeklappt.
- **Rückblicke:** immer als Story-Karten (`src/ui/story.tsx`), erreichbar über ein Banner (`RecapLink`).
- **Verläufe:** Punkteverlauf (`PointsChart`) und Rangverlauf (`BumpChart`) in Saison und Wettkampf gleich.

## Arbeitsweise

- Neue Challenges, Medaillen, Punkte- oder XP-Regeln, die bestehende Ergebnisse verändern würden,
  gelten erst ab dem nächsten Zeitraum (meist das folgende Jahr). Reine Anzeigen, Ziele und Tipps
  dürfen sofort kommen.

- Jeder Push auf `main` veröffentlicht die Seite (GitHub Action).
- Vor dem Push: `npx tsc -b --noEmit`, `npx oxlint src`, `npx vitest run`, `npm run build`.
