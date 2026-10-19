# GR Legends

Web-App zur Auswertung von Smartrace-Rennergebnissen. Die CSV-Exporte liegen in einem öffentlich
freigegebenen Google-Drive-Ordner. Die App liest sie direkt im Browser über die Google Drive API.
Es gibt kein Backend und Zuschauer brauchen keinen Login.

## Datenquelle: Drive-Ordner

```
GR Legends (Hauptordner, „Jeder mit dem Link: Betrachter“)
├── Musterring 2364cm/         ← Unterordner = Streckenname + Länge in cm
│   ├── Qualifikation_01.03.2026.csv
│   ├── Rennen_01.03.2026.csv
│   └── Rennen_01.03.2026.csv    ← gleicher Name erlaubt: Lauf 2 (Reihenfolge = Upload-Zeit)
└── Rennen_15.01.2024.csv        ← ohne Unterordner: „Unbekannte Strecke“
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
                                   (Groß-/Kleinschreibung, Leer- und Sonderzeichen egal; Ordner auch „Bilder“)
```

Vorlage: [`docs/GR-Legends-Einstellungen.xlsx`](docs/GR-Legends-Einstellungen.xlsx) hochladen und mit
**Öffnen mit → Google Tabellen** als Google-Tabelle speichern (eine reine .xlsx-Datei kann die
Sheets API nicht lesen). Tabs:

- **Fahrer**: Name in Smartrace → Anzeigename (gleicher Anzeigename = ein Fahrer), `x` in
  „Gast“ = zählt wie Gast (nicht in Wertung und Rangliste, Name erscheint als „Gast (Name)“)
- **Fahrzeuge**: Maßstab (`1:24`, leer = 1:32) und Anzeigename
- **Korrekturen**: Drive-Link der Datei, Platz, richtiger Fahrer – für falsch zugeordnete Fahrer
- Zeilen, die mit „Beispiel“ beginnen bzw. eine Notiz „Beispiel…“ haben, werden ignoriert.
- Doppelte Läufe (z. B. Original und „Kopie von …“ im Ordner) zählen einmal: Es gilt die zuletzt
  geänderte Fassung. Autonamen dürfen sich dabei unterscheiden – so lässt sich ein Auto in einer
  CSV nachträglich umbenennen.
- Namen werden ohne Rücksicht auf Groß-/Kleinschreibung und Leerzeichen verglichen. Einträge, die
  zu keinem Rennen passen, zeigt die App unter der Fahrer- bzw. Fahrzeugliste an – bei Fahrern nur
  mit Zeilennummer, damit keine Namen aus dem Sheet öffentlich erscheinen.
- Anzeigenamen dürfen eine Kette bilden: „alter Name → Fahrer 01“ und „Fahrer 01 → Anzeigename“
  ergeben für beide den Anzeigenamen.
- Neue Fahrer schon vor dem ersten Rennen: Zeile mit dem künftigen Pseudonym (z. B. „Fahrer 12“)
  und optional Anzeigename. Dann gibt es schon ein Profil mit den Saison-Challenges, und man kann
  sich bei „Wer bist du?“ auswählen. Zeilen ohne Pseudonym bekommen kein Profil (Tippfehler oder
  alte Namen sollen nicht auf der Seite erscheinen).

## Wettkämpfe

Ein Wettkampf ist ein Unterordner im Streckenordner. Darin liegen die Definition `wettkampf.json`
und die Smartrace-Exporte des Wettkampfs:

```
GR Legends
└── Musterring 2364cm/
    ├── Rennen_01.03.2026.csv        ← normaler Renntag
    └── Herbstcup 2026/              ← Wettkampf-Ordner (Name = Wettkampf)
        ├── wettkampf.json
        ├── Qualifikation_14.03.2026.csv
        └── Rennen_14.03.2026.csv
```

- **Anlegen:** Saison → „Wettkämpfe“ → „Neuer Wettkampf“. Der Editor speichert nichts online, er
  erzeugt nur `wettkampf.json` zum Herunterladen. Ändern: im Wettkampf „Bearbeiten“, Datei
  herunterladen und in Drive ersetzen (die zuletzt geänderte JSON im Ordner gilt).
- **Inhalt:** Name, Datum (Ende optional), Fahrer (auch solche ohne Läufe), Sichtbarkeit
  (Wettkampf sofort oder 1 Woche vorher; Ablauf sofort, 1 Woche, 1 Tag vorher oder am Renntag),
  Fahrzeuge gleichzeitig (Standard 4), Fahrzeugregel (egal, fest je Fahrer, freie Wahl aus Liste,
  nach Können, zufällig mit Durchtauschen; Maßstab 1:32/1:24), Wertung (absolut oder fair nach
  Elo, Bonuspunkte, Finalbonus), Einzel oder Teams, Abschnitte. Jeder Abschnitt und jeder einzelne
  Lauf kann die Regeln überschreiben.
- **Abschnitte:** Qualifying (auch einzeln), Rennen in Gruppen, Aufstiegsleiter, K.-o.-System,
  Teamrennen, eigene Läufe, „wie gefahren“ (ohne Plan). Spätere Läufe hängen von Ergebnissen ab
  und füllen sich, sobald die CSV des vorigen Laufs im Ordner liegt.
- **Zuordnung der CSVs:** nach Besetzung (gleiche Fahrer, Reihenfolge egal), sonst nach ähnlicher
  Besetzung in Upload-Reihenfolge. Korrigieren oder ignorieren im Editor unter „Dateien zuordnen“.
- **Zufall** (Teams, Autos) kommt aus einem festen Startwert in der JSON – jedes Gerät sieht
  dieselbe Auslosung. „Festschreiben“ übernimmt Teams fest in die Datei.
- **Teams, die nicht aufgehen**, werden größer; gewertet wird mit dem Schnitt der Mitglieder. Bei
  Positionsduellen (Teams passen nicht zusammen auf die Bahn) fährt der Schwächste eines kleineren
  Teams doppelt. Alle Mitglieder bekommen die Teampunkte – zusammenarbeiten lohnt sich.
- **Teamrennen-Durchgänge:** Passen zwei Teams auf die Bahn, ist ein Durchgang „jedes Team einmal
  gegen jedes“ (4 Teams = 6 Rennen); optional nur ein halber Durchgang mit nach Elo ausgeglichenen
  Gegnern. Der Editor zeigt die Rennzahl je Durchgang. Läufe mit weniger Fahrern werden auf die
  größte Laufgröße hochgerechnet, Pausen (ungerade Teamzahl) über die Zahl der Läufe ausgeglichen.
- **Teamrennen-Aufteilung:** Automatisch (nach Spurzahl), Team gegen Team oder ein Fahrer je
  Team. Passen bei „Team gegen Team“ keine zwei ganzen Teams auf die Bahn, schickt jedes Team einen
  Teil seiner Fahrer; wer fährt, wechselt reihum (jeder gleich oft), die Aufstellungen sind versetzt.
- **Ungleich große Läufe:** Bei „Rennen in Gruppen“ und „Eigene Läufe“ werden die Punkte kleinerer
  Läufe auf die größte Laufgröße hochgerechnet (eine Nachkommastelle); den kleineren Lauf fährt bei
  „Rennen in Gruppen“ reihum, wer bisher am seltensten drin war. K.-o.: Gruppen möglichst gleich
  groß, in jeder scheiden gleich viele aus (so viele, wie die kleinste Gruppe zulässt).
- **Aufstiegsleiter automatisch** (Standard für neue Abschnitte): In jedem Rennen steigt die Hälfte
  auf; alle Rennen sind voll, fehlen Fahrer, werden die untersten Rennen kleiner.
- **Autoliste:** Bei „Freie Wahl aus Liste“, „Nach Können“ und „Zufällig“ fahren höchstens so viele
  gleichzeitig, wie Autos ausgewählt sind – sonst müssten sich zwei ein Auto teilen.
- **Autobilder:** Ablauf, Leinwand, „Dein Wettkampf“, Wettkampfliste und Regeln zeigen die Autos
  mit Foto (aus dem Ordner „Fotos“).
- **Fair:** Ein geschlagener Gegner bringt `2 × (1 − eigene Siegchance)` × Punkte je Gegner; die
  Siegchance kommt aus Fahrer- plus Auto-Elo zu Beginn des Wettkampfs. Die erwarteten Punkte sind
  so für beide Seiten eines Duells gleich.
- **Bonus:** schnellste Runde, Pole, Fahrer des Tages (größte Leistung über der Erwartung), neue
  persönliche Bestzeit, Rennen ohne Abflug – jeweils einstellbar, 0 = aus.
- **Ansicht:** Stand, Ablauf, Regeln, „Dein Wettkampf“ (nächster Lauf, Auto, was zum Aufsteigen
  oder Überholen fehlt, Tipps aus den Runden), Spannungsmeldungen, Siegerehrung.
- **Leinwand** (`#/wettkampf/<id>/leinwand`): für Tablet oder Fernseher an der Bahn, aktualisiert
  sich alle 30 Sekunden. Tipp: Smartrace-Exporte mit Google Drive für Desktop direkt in den
  Wettkampf-Ordner speichern.
- **Probelauf** im Editor: spielt den Wettkampf 120-mal mit zufälligen Ergebnissen nach Elo durch
  (Läufe, Dauer, Läufe je Fahrer, Siegchancen, wie knapp).
- Ohne `wettkampf.json` wird der Ordner „wie gefahren“ gewertet. Mit „zählt nicht für Elo und
  Saison“ bleiben die Läufe aus allen anderen Wertungen heraus.
- Beispiele für die lokale Entwicklung: `test/events/` (bzw. `local-data/<Strecke>/<Wettkampf>/`).

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

## Datenschutz und Sicherheit

- **Keine echten Daten im Repo:** Testdaten und Vorlage sind anonymisiert; die echten Ergebnisse
  kommen ausschließlich aus dem Drive-Ordner.
- **Suchmaschinen:** Die Seite bittet, nicht aufgenommen zu werden (`noindex`) – sie ist nur über den
  Link erreichbar. Wer den Link oder die Ordner-ID kennt, kann die Ergebnisse aber sehen.
- **Drive-Ordner:** Alles darin ist für jeden mit Link bzw. Ordner-ID lesbar, auch die
  Einstellungen-Tabelle samt Notizen. Nichts Privates hineinlegen; Bearbeiten nur für einzelne
  Personen freigeben, nie „Jeder mit dem Link: Bearbeiter“.
- **API-Key:** steht zwangsläufig im ausgelieferten JavaScript. Deshalb auf die eigene Domain und
  auf Drive- und Sheets-API beschränken und **kein Rechnungskonto** im Google-Cloud-Projekt
  hinterlegen – dann kann Missbrauch nichts kosten.
- **Was der Browser abruft:** nur die eigene Seite (auch die Schrift ist selbst ausgeliefert) und
  die Google-APIs für Drive/Sheets. Keine Cookies, kein Tracking. Gespeichert wird nur lokal auf dem
  Gerät: „Das bin ich“, Ansichts-Einstellungen, gesehene Medaillen und ein Cache der CSV-Dateien.
- **Content-Security-Policy** (Produktions-Build, `vite.config.ts`): Skripte nur von der eigenen
  Seite, Verbindungen nur zu den Google-APIs, Bilder nur von Drive.
- **GitHub:** Der Deploy-Workflow läuft nur bei Pushes auf `main` oder per Hand, nie für Pull
  Requests aus Forks – Secrets sind dort nicht erreichbar.

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
│   └── event/ Wettkämpfe: Format, Ablaufplanung, Wertung, Probelauf
└── ui/        Seiten, Diagramme (eigenes SVG), Symbole, Medaillen
test/fixtures/ Smartrace-Exporte als Testdaten (Namen anonymisiert)
test/events/   Beispiel-Wettkämpfe (erfundene Ergebnisse)
docs/          Einstellungen-Vorlage, Logo (Monogramm, App-Icon, Schriftzug)
```

**Rundenklassifizierung** (`src/domain/laps.ts`):

- *Ungültig* (z. B. Auto per Hand eingesetzt, von der Smartrace-Mindestrundenzeit nicht erfasst):
  Die Runde ist mehr als 20 % schneller als die typische Bestzeit des **Autos** und zugleich als
  die typische Bestzeit des **Fahrers**, jeweils auf derselben Strecke über alle Läufe („typisch“
  = 10. Perzentil). Bei Gästen zählt nur das Auto. Ungültige Runden zählen nicht für Bestzeiten.
- *Zwischenfall*: Die Runde dauert mehr als das 1,3-Fache der sauberen Referenzrunde des Fahrers
  im Lauf (Startrunde: 1,6-fach). Die in Smartrace gezählten Boxenstopps bekommen die passenden
  Zwischenfälle, der Rest sind *Abflüge*. Mit Tankfunktion kostet ein Stopp etwa 4 s plus ggf.
  nicht gezählte Runden (leerer Tank).
- *Tankfunktion* gilt für alle und das ganze Rennen: Ein Lauf zählt als Tankrennen, wenn mehr als
  die Hälfte der Fahrer Boxenstopps hat. Sonst werden gezählte Stopps ignoriert (auch in der
  Historie nicht als Box angezeigt); langsame Runden sind wie üblich *Abflüge*.
- Abflugquoten zählen nur Rennen **ohne** Tankfunktion, weil dort Stopp und Abflug eindeutig sind.

**10/20 Runden** (`src/domain/splits.ts`): Gesamtzeit der ersten 10 bzw. 20 Runden eines Rennens,
nur wenn so viele Runden gefahren wurden und keine ungültige Runde darin liegt. Bestmarken, Rekorde
und Zeitmarken zählen je Strecke und ohne Tankfunktion. *Zeitmarken* sind runde Grenzen (Schritt
≈ 3,5 % der typischen Zeit, z. B. 5 s bei 10 Runden à 13 s): „10 Runden unter 2:00“. Daraus kommen
Ziele, Tipps, Neuigkeiten und die Rückblick-Karte. Ab 2027 (`SPLIT_REWARDS_FROM`) kommen Medaillen
(Rekord, erreichte Marke – Stufe nach Abstand zum Rekord) und eine zusätzliche Saison-Challenge
(neue Bestmarke oder 3-mal unter der schon erreichten Marke) dazu – so ändern sich bestehende
Ergebnisse nicht nachträglich.

**Wertung** (`src/domain/rating.ts`): Elo aus direkten Duellen jedes Laufs, Start 500, halbe
Elo-Skala (200 Punkte = Siegchance 10 : 1), damit die Zahlen dreistellig und nah beieinander
bleiben. Das Duell-Ergebnis hängt vom Abstand ab (Runden bzw. Zeit). Die Erwartung kommt aus
Fahrer- **plus** Autowertung (pro Strecke) – wer im schwächeren Auto gewinnt, bekommt mehr Punkte
(Underdog-Bonus). Qualifyings zählen halb, Gäste gar nicht, die ersten 5 Läufe doppelt so stark.
Diese 5 Läufe sind die **Einstufung**: Neue Fahrer sehen statt Elo-Zahl und Veränderung nur
„Einstufung n/5“, damit niemand mit einem Minus unter dem Startwert einsteigt.

**Autowertung**: Sie kommt aus den Runden, nicht aus den Ergebnissen. Modell je Strecke:
Rundenzeit = Lauf + Fahrer + Auto. Der Lauf fängt Bahnzustand und Tagesform ab, der Fahrer sein
Können – übrig bleibt, was das Auto ausmacht, gelernt aus Fahrern, die verschiedene Autos gefahren
sind. Zwei Teile:
- **Tempo**: Ø saubere Runde gegenüber dem Ø Auto.
- **Abflüge** pro 100 Runden (Rennen ohne Tank), eingerechnet mit dem typischen Zeitverlust eines
  Abflugs. Abflüge sind pro Auto kaum verlässlich messbar (viel Zufall) und werden deshalb stark zum
  Schnitt gezogen.

Konsistente Fahrer zählen mehr: Jeder Fahrer wird nach seiner eigenen Rest-Streuung im Modell
gewichtet (1 / Streuung, relativ zum Schnitt, zwischen 0,25 und 3; bei wenigen Läufen zum Schnitt
geglättet). Wer gleichmäßig fährt, bei dem sind Abweichungen eher echte Autounterschiede – egal,
wie schnell er ist.

1 % schnellere Runden ≈ 8 Elo-Punkte (abgeleitet aus Tempo und Wertung der Fahrer). Vor jedem
Renntag wird nur aus früheren Läufen geschätzt. Über die Zeit: Der Grundwert kommt aus allen Läufen
(alte zählen voll), dazu ein Trend aus den neueren Läufen (Halbwertszeit 120 Tage). Der Trend setzt
sich erst durch, wenn er über mehrere Rennen gleich bleibt (halbe Wirkung nach ca. 4 Läufen) –
so zeigen sich mechanische Änderungen, einzelne Ausreißer aber kaum. Underdog-Bonus ab 6 Punkten unter
dem Schnitt (≈ 0,75 % langsamer).

**Duell gegen die Bahn**: Zusätzlich fährt jeder in jedem Lauf gegen einen festen Maßstab (Startwert
500): gewonnen, wenn die eigene typische saubere Runde schneller ist als die typische Runde des Autos
auf der Strecke über alle Läufe. Gewicht 0,3 eines Laufs, nur als Bonus (nie Abzug). Werden alle
schneller, steigen alle – die Wertung spiegelt so auch echte Verbesserung wider.

**Saisonwertung** (Seite „Saison“): Punkte statt Elo.
- pro Rennen 1 Punkt je geschlagenem Gegner, Sieg +1 – ein Sieg gegen 5 zählt mehr als gegen 1
- pro Renntag zählen die besten 3 Rennen (Abende mit 9 Rennen bringen nicht dreimal so viel)
- Bonus pro Renntag: schnellste Runde +2, Pole (Schnellster im Qualifying) +1
- der letzte Renntag im Dezember ist das Saisonfinale und zählt doppelt
- Streichresultate: Es zählen die besten 5 Renntage – wer mal nicht kann, verliert nichts

Dazu: Konstrukteurswertung (Autos sammeln die Rennpunkte ihrer Fahrer), Saison-Awards für
abgeschlossene Jahre (Saisonsieger, Rookie, Aufsteiger, Jahresschnellster, Saubermann, Außenseiter),
Saison-Challenges (je +20 Karriere-XP; jede Saison 7 zufällig aus einem Pool von 20, für alle gleich, mindestens 3 neue gegenüber dem Vorjahr) und ein Jahresrückblick („Wrapped“) pro Fahrer.

**Pace**: Abstand der durchschnittlichen sauberen Runde (Median pro Lauf) zur typischen Bestzeit
der Strecke (Grenze der schnellsten 10 % aller Runden), in Sekunden (z. B. „+0,62 s“). Kleiner ist
schneller, ein Minus heißt: im Schnitt sogar schneller als diese Grenze.
Abgeschlossene Jahre ergeben die Medaille „Saisonsieger“.

**Karriere-Level**: Erfahrungspunkte, die nie verloren gehen – Rennen 10, Renntag 15, Qualifying 4,
Sieg +10, Podium +5, je km 5, neue persönliche Bestzeit 10. Level n ab 25·n·(n−1) XP; Titel Rookie,
Hobbyfahrer, Stammfahrer, Routinier, Profi, Legende.
