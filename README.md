# GR Legends

Web-App zur Auswertung von Smartrace-Rennergebnissen. Die CSV-Exporte liegen in einem öffentlich
freigegebenen Google-Drive-Ordner. Die App liest sie direkt im Browser über die Google Drive API.
Es gibt kein Backend und Zuschauer brauchen keinen Login.

## Datenquelle: Drive-Ordner

```
GR Legends (Hauptordner, „Jeder mit dem Link: Betrachter“)
├── Gintoft Ring 2364cm/         ← Unterordner = Streckenname + Länge in cm
│   ├── Qualifikation_07.02.2026.csv
│   ├── Rennen_07.02.2026.csv
│   └── Rennen_07.02.2026.csv    ← gleicher Name erlaubt: Lauf 2 (Reihenfolge = Upload-Zeit)
└── Rennen_05.02.2022.csv        ← ohne Unterordner: „Unbekannte Strecke“
```

- Ordnername: `<Strecke> <Länge>cm` – die Länge ist optional und wird für Geschwindigkeiten genutzt
- Dateiname: `<Typ>_<TT.MM.JJJJ>.csv`, z. B. `Rennen_…` oder `Qualifikation_…`
- Alle Dateien eines Tages und einer Strecke bilden einen Renntag. Die Läufe werden pro Typ
  nach Upload-Zeit durchnummeriert.
- Inhalt: unveränderter Smartrace-Export (`;`-getrennt, eine Spalte pro Runde).

## Einstellungen und Fotos (optional)

```
GR Legends (Hauptordner)
├── GR-Legends-Einstellungen    ← Google-Tabelle, Name enthält „Einstellungen“
└── Fotos/                      ← Fahrzeugfotos, Dateiname = Fahrzeugname, z. B. „Ferrari 458.jpg“
```

Vorlage: [`docs/GR-Legends-Einstellungen.xlsx`](docs/GR-Legends-Einstellungen.xlsx) hochladen und mit
**Öffnen mit → Google Tabellen** als Google-Tabelle speichern (eine reine .xlsx-Datei kann die
Sheets API nicht lesen). Tabs:

- **Fahrer**: Name in Smartrace → Anzeigename (gleicher Anzeigename = ein Fahrer), `x` in
  „Gast“ = zählt wie Gast (nicht in Wertung und Rangliste, Name erscheint als „Gast (Name)“)
- **Fahrzeuge**: Maßstab (`1:24`, leer = 1:32) und Anzeigename
- **Korrekturen**: Drive-Link der Datei, Platz, richtiger Fahrer – für falsch zugeordnete Fahrer
- Zeilen, die mit „Beispiel“ beginnen bzw. eine Notiz „Beispiel…“ haben, werden ignoriert.

## Einrichtung

### 1. Google-API-Key

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen.
2. Unter **APIs & Dienste → Bibliothek** die **Google Drive API** und die **Google Sheets API**
   aktivieren.
3. Unter **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel** einen Key
   erstellen und **einschränken**:
   - Anwendungseinschränkung: **Websites**, z. B. `https://<user>.github.io/*` und
     `http://localhost:5173/*`
   - API-Einschränkung: nur **Google Drive API** und **Google Sheets API**

Der Key und die Ordner-ID stehen zwangsläufig im ausgelieferten JavaScript. Mit den
Einschränkungen oben erlaubt der Key nur das Lesen öffentlicher Dateien von deiner Domain aus.
Lege nichts Privates in den Ordner.

### 2. Lokal entwickeln

```bash
npm install
cp .env.example .env.local   # Key und Ordner-ID eintragen (optional)
npm run dev
```

Ohne `.env.local` zeigt `npm run dev` lokale Daten: alle CSVs aus `local-data/<Streckenordner>/`
(gitignored, z. B. ein Download des Drive-Ordners) oder, falls leer, die Beispiele aus
`test/fixtures/`.

### 3. Deploy auf GitHub Pages

Eine eigene Anmeldung bei GitHub Pages ist nicht nötig – es ist Teil des GitHub-Kontos.

1. Repo → **Settings → Pages → Source: GitHub Actions**
   (kostenlos nur für öffentliche Repos; private Repos brauchen GitHub Pro/Team)
2. Repo → **Settings → Secrets and variables → Actions**
   - Secret `VITE_GOOGLE_API_KEY`
   - Variable `VITE_DRIVE_FOLDER_ID`
3. Push bzw. Merge auf `main` baut und veröffentlicht die App (`.github/workflows/deploy.yml`)
   unter `https://<user>.github.io/<repo>/`.

Die Seite bittet Suchmaschinen, sie nicht aufzunehmen (`<meta name="robots" content="noindex">` in
`index.html`) – sie ist nur über den Link erreichbar. Testdaten und Vorlage im Repo enthalten keine
echten Namen; die echten Daten kommen ausschließlich aus dem Drive-Ordner.

## Entwicklung

| Befehl              | Zweck                        |
| ------------------- | ---------------------------- |
| `npm run dev`       | Dev-Server                   |
| `npm test`          | Unit-Tests (Vitest)          |
| `npm run lint`      | Lint (oxlint)                |
| `npm run build`     | Typecheck + Produktions-Build |

### Aufbau

```
src/
├── data/      Drive- und Sheets-API, CSV-Parser, Einstellungen, Laden + Cache
├── domain/    Läufe, Rundenklassifizierung, Wertung (Elo), Kennzahlen, Medaillen
└── ui/        Seiten, Diagramme (eigenes SVG), Symbole, Medaillen
test/fixtures/ echte Smartrace-Exporte als Testdaten
docs/          Einstellungen-Vorlage, Logo (Monogramm, App-Icon, Schriftzug, Plakette)
```

**Rundenklassifizierung** (`src/domain/laps.ts`):

- *Ungültig* (z. B. Auto per Hand eingesetzt, von der Smartrace-Mindestrundenzeit nicht erfasst):
  Die Runde ist mehr als 20 % schneller als die typische Bestzeit des **Autos** und zugleich als
  die typische Bestzeit des **Fahrers**, jeweils auf derselben Strecke über alle Läufe („typisch“
  = 10. Perzentil). Bei Gästen zählt nur das Auto. Ungültige Runden zählen nicht für Bestzeiten.
- *Zwischenfall*: Die Runde dauert mehr als das 1,3-Fache der sauberen Referenzrunde des Fahrers
  im Lauf (Startrunde: 1,6-fach). Die in Smartrace gezählten Boxenstopps bekommen die passenden
  Zwischenfälle, der Rest sind *Abflüge*. Mit Tankfunktion kostet ein Stopp etwa 4 s plus ggf.
  nicht gezählte Runden (leerer Tank); ohne Tankfunktion sind die kleinsten Verluste die Stopps.
- Abflugquoten zählen nur Rennen **ohne** Tankfunktion, weil dort Stopp und Abflug eindeutig sind.

**Wertung** (`src/domain/rating.ts`): Elo aus direkten Duellen jedes Laufs, Start 500, halbe
Elo-Skala (200 Punkte = Siegchance 10 : 1), damit die Zahlen dreistellig und nah beieinander
bleiben. Das Duell-Ergebnis hängt vom Abstand ab (Runden bzw. Zeit). Die Erwartung kommt aus
Fahrer- **plus** Autowertung (pro Strecke) – wer im schwächeren Auto gewinnt, bekommt mehr Punkte
(Underdog-Bonus). Qualifyings zählen halb, Gäste gar nicht, die ersten 5 Läufe doppelt so stark.
