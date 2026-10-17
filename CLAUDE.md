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
- Die Fahrer stehen in Smartrace und den CSVs nur als Initialen. Was angezeigt wird, legt jede Person
  selbst fest (Spalte „Anzeigename“ im Einstellungen-Sheet). Die App muss mit beidem funktionieren
  (Initialen als Schlüssel, Anzeigename zur Anzeige).
- Kein Tracking, keine Cookies, keine externen Dienste außer Google Drive/Sheets (Daten) und GitHub
  Pages (Hosting). Schriften und Bibliotheken lokal einbinden, nichts von fremden Servern nachladen.
  Neue externe Dienste nur nach Rückfrage – und dann den Datenschutzhinweis anpassen.
- Der Datenschutzhinweis steht in `src/ui/Privacy.tsx`. Bei Änderungen an Datenquellen, Hosting oder
  gespeicherten Daten den Hinweis mitpflegen. Die Kontaktdaten darin sind absichtlich verschleiert
  (nicht als Klartext im Code) – so lassen.
- Browserspeicher (`localStorage`) nur für Einstellungen auf dem eigenen Gerät, nie für Daten anderer.

## Arbeitsweise

- Jeder Push auf `main` veröffentlicht die Seite (GitHub Action).
- Vor dem Push: `npx tsc -b --noEmit`, `npx oxlint src`, `npx vitest run`, `npm run build`.
