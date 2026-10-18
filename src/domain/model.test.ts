import { describe, expect, it } from 'vitest'
import { applySettings, carScale, driveFileId, EMPTY_SETTINGS, parseScale, parseSettings, unmatchedSettings } from '../data/settings'
import { prepare } from '../data/useRaceDays'
import { fixtureIds, readFixture } from '../test-utils'
import type { Result, Session } from '../types'
import { estimateCars, fitCars, type CarObs } from './carModel'
import { CHALLENGE_POOL, CHALLENGES_PER_SEASON, NEW_PER_SEASON, seasonChallengeIds, seasonChallenges, TIME_POOL } from './challenges'
import { constructorStandings, seasonStandings } from './season'
import { classifyIncidents, hasTankFunction, splitTime } from './laps'
import { buildSplits, fmtMark, markNext, markReached, markStep, splitKey } from './splits'
import { buildModel, PLACEMENT_RUNS, positionTrace } from './model'
import { computeRatings, RATING, winChances } from './rating'
import { buildSession } from './sessions'

function fixtureSessions(): Session[] {
  return fixtureIds().map((id, i) => {
    const { name, text } = readFixture(id)
    const time = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
    return buildSession({ id, name, track: 'Musterring 2364cm', createdTime: time, modifiedTime: time }, text)!
  })
}

function race(id: string, date: string, order: [string, string, number][]): Session {
  const results: Result[] = order.map(([driver, car, laps], i) => ({
    position: i + 1,
    gap: i === 0 ? { kind: 'leader' } : { kind: 'laps', laps: order[0][2] - laps },
    driver,
    car,
    laps,
    bestLapMs: 10_000,
    validBestLapMs: 10_000,
    pitStops: 0,
    lapTimes: Array.from({ length: laps }, (_, k) => ({ number: k + 1, ms: 10_000 + i * 200, status: 'normal' as const })),
  }))
  return { fileId: id, fileName: `Rennen_${date}.csv`, track: 'X', trackLengthCm: 2000, date, type: 'Rennen', createdTime: `${date}T00:00:00Z`, modifiedTime: '', heat: 1, results }
}

describe('Wertung', () => {
  it('startet bei 500 und bleibt dreistellig', () => {
    const { model } = prepare(fixtureSessions(), EMPTY_SETTINGS)
    for (const v of model.rating.drivers.values()) {
      expect(v).toBeGreaterThan(100)
      expect(v).toBeLessThan(1000)
    }
  })

  it('belohnt Siege, ignoriert Gäste und zählt Abstände', () => {
    const sessions = [
      race('a', '2026-01-01', [['Anna', 'Auto', 10], ['Ben', 'Auto', 9], ['Gast', 'Auto', 8]]),
      race('b', '2026-01-02', [['Anna', 'Auto', 10], ['Ben', 'Auto', 10]]),
    ]
    const r = computeRatings(sessions)
    expect(r.drivers.get('Anna')!).toBeGreaterThan(RATING.start)
    expect(r.drivers.get('Ben')!).toBeLessThan(RATING.start)
    expect(r.drivers.has('Gast')).toBe(false)
    const [first] = r.history.get('Anna')!
    expect(first.reason).toContain('Sieg vor Ben')
    // Ein Runde Vorsprung bringt mehr als ein knapper Sieg
    const [, second] = r.history.get('Anna')!
    expect(first.delta).toBeGreaterThan(second.delta)
  })

  it('gibt dem Außenseiter im schwächeren Auto mehr Punkte', () => {
    // beide fahren beide Autos – wer im schnellen Auto sitzt, fährt die schnelleren Runden
    const base = Array.from({ length: 6 }, (_, i) =>
      race(`s${i}`, `2026-01-0${i + 1}`, i % 2 ? [['Ben', 'Schnell', 10], ['Anna', 'Lahm', 9]] : [['Anna', 'Schnell', 10], ['Ben', 'Lahm', 9]]),
    )
    const before = computeRatings(base)
    const after = computeRatings([...base, race('x', '2026-01-09', [['Ben', 'Lahm', 10], ['Anna', 'Schnell', 9]])])
    const upset = after.history.get('Ben')!.at(-1)!
    expect(upset.delta).toBeGreaterThan(5)
    expect(upset.upsetExpectation).toBeLessThan(0.5)
    expect(before.cars.get('X\u0000Schnell')!).toBeGreaterThan(before.cars.get('X\u0000Lahm')!)
  })

  it('trennt Auto und Fahrer nur über Fahrerwechsel, nicht über Ergebnisse', () => {
    // Anna fährt immer das eine, Ben immer das andere Auto: daraus lässt sich nichts über die Autos lernen
    const fixed = Array.from({ length: 6 }, (_, i) => race(`s${i}`, `2026-01-0${i + 1}`, [['Anna', 'A', 10], ['Ben', 'B', 9]]))
    const r = computeRatings(fixed)
    expect(r.cars.get('X\u0000A')).toBeCloseTo(r.cars.get('X\u0000B')!, 5)
    expect(r.drivers.get('Anna')!).toBeGreaterThan(r.drivers.get('Ben')!)
  })

  it('lässt alle steigen, wenn alle schneller werden (Duell gegen die Bahn)', () => {
    const lapRace = (id: string, date: string, ms: number) => {
      const s = race(id, date, [['Anna', 'Auto', 10], ['Ben', 'Auto', 10]])
      return { ...s, results: s.results.map((r) => ({ ...r, lapTimes: r.lapTimes.map((l) => ({ ...l, ms: ms + (r.position - 1) * 50 })) })) }
    }
    // erst langsam, dann deutlich schneller – Platzierungen bleiben gleich
    const sessions = [
      ...Array.from({ length: 6 }, (_, i) => lapRace(`s${i}`, `2026-01-0${i + 1}`, 12_000)),
      ...Array.from({ length: 6 }, (_, i) => lapRace(`f${i}`, `2026-02-0${i + 1}`, 10_500)),
    ]
    const r = computeRatings(sessions)
    const avg = (r.drivers.get('Anna')! + r.drivers.get('Ben')!) / 2
    const atMid = r.history.get('Anna')![5].after / 2 + r.history.get('Ben')![5].after / 2
    expect(avg).toBeGreaterThan(atMid)
    const withoutBench = computeRatings(sessions, { ...RATING, benchWeight: 0 })
    expect((withoutBench.drivers.get('Anna')! + withoutBench.drivers.get('Ben')!) / 2).toBeCloseTo(RATING.start, 0)
  })

  it('berechnet Siegchancen aus der Wertung', () => {
    const wc = winChances([{ name: 'a', strength: 600 }, { name: 'b', strength: 400 }])
    expect(wc.get('a')).toBeCloseTo(10 / 11, 5)
  })
})

describe('Boxenstopp oder Abflug', () => {
  const lap = (ms: number, i: number) => ({ number: i + 2, ms, status: 'normal' as const })
  it('ignoriert ohne Tankfunktion gezählte Boxenstopps', () => {
    const laps = [10_000, 10_100, 14_000, 10_050, 30_000, 10_000].map(lap)
    expect(classifyIncidents(laps, 1, false).map((l) => l.status)).toEqual(['normal', 'normal', 'crash', 'normal', 'crash', 'normal'])
    // Kein Ausreißer → auch kein Abflug, der Stopp wird einfach ignoriert
    const mild = [10_000, 10_100, 11_200, 10_050, 10_000].map(lap)
    expect(classifyIncidents(mild, 1, false).every((l) => l.status === 'normal')).toBe(true)
  })

  it('erkennt die Tankfunktion an der Mehrheit der Fahrer mit Boxenstopp', () => {
    const withStops = (stops: number[]) => ({ ...race('t', '2026-01-01', stops.map((_, i) => [`F${i}`, 'Auto', 10] as [string, string, number])), results: race('t', '2026-01-01', stops.map((_, i) => [`F${i}`, 'Auto', 10] as [string, string, number])).results.map((r, i) => ({ ...r, pitStops: stops[i] })) })
    expect(hasTankFunction(withStops([2, 3, 1, 2]))).toBe(true)
    expect(hasTankFunction(withStops([1, 1]))).toBe(true)
    // ein Fahrer ist nur durch die Boxengasse gefahren
    expect(hasTankFunction(withStops([0, 1, 0, 0, 0]))).toBe(false)
    expect(hasTankFunction(withStops([1, 0]))).toBe(false)
    expect(hasTankFunction(withStops([0, 0, 0]))).toBe(false)
  })

  it('erkennt mit Tankfunktion den Boxenstopp mit nicht gezählter Runde', () => {
    // 24 s ≈ eine nicht gezählte Runde + 4 s Boxenzeit; 17 s passt nicht zum Muster → Abflug
    const laps = [10_000, 10_100, 17_000, 10_050, 24_000, 10_000].map(lap)
    const out = classifyIncidents(laps, 1, true)
    expect(out[4].status).toBe('pit')
    expect(out[2].status).toBe('crash')
    expect(out[2].lossMs).toBeGreaterThan(6_000)
  })

  it('wertet eine etwas langsamere Startrunde nicht als Abflug', () => {
    const laps = [14_000, 10_000, 10_100, 10_050, 10_000].map((ms, i) => ({ number: i + 1, ms, status: 'normal' as const }))
    expect(classifyIncidents(laps, 0, false)[0].status).toBe('normal')
  })
})

describe('Kennzahlen', () => {
  const { model } = prepare(fixtureSessions(), EMPTY_SETTINGS)

  it('liefert Rangliste, Status und mindestens eine Medaille pro Fahrer', () => {
    const rows = model.ranking('all')
    expect(rows[0].rank).toBe(1)
    expect(rows.every((r, i) => i === 0 || r.elo <= rows[i - 1].elo)).toBe(true)
    expect(model.statuses('all').get(rows[0].name)?.[0].code).toBe('crown')
    for (const r of rows) expect(model.medals.get(r.name)?.length ?? 0, r.name).toBeGreaterThan(0)
  })

  it('zählt Abflüge nur in Rennen ohne Tankfunktion', () => {
    for (const d of model.stats('all').drivers.values()) {
      const nonTankLaps = d.raceResults.filter((x) => !x.session.tank).reduce((a, x) => a + x.result.laps, 0)
      expect(d.crashBaseLaps).toBe(nonTankLaps)
    }
  })

  it('berechnet Kilometer aus der Streckenlänge', () => {
    const d = model.stats('all').drivers.get('Anton Berger')!
    expect(d.km).toBeCloseTo((d.laps * 2364) / 100000, 5)
  })

  it('verfolgt Positionen pro Runde', () => {
    const s = model.sessions.find((x) => x.results.length >= 3 && x.type === 'Rennen')!
    const trace = positionTrace(s)
    const winner = trace.get(`${s.results[0].driver}#1`)!
    expect(winner.at(-1)).toBe(1)
  })
})

describe('Einstellungen', () => {
  it('erkennt den Maßstab auch als Uhrzeit aus Google Sheets', () => {
    for (const v of ['1:24', '01:24:00', '1:24:00', '1/24', '24', ' 1 : 24 ']) expect(parseScale(v), v).toBe('1:24')
    for (const v of ['1:32', '01:32:00', '32']) expect(parseScale(v), v).toBe('1:32')
    for (const v of ['', 'x', '1:43', '12:24']) expect(parseScale(v), v).toBeUndefined()
  })

  it('liest Aliase, Gäste, Fahrzeuge und Korrekturen und überspringt Beispielzeilen', () => {
    const settings = parseSettings({
      fahrer: [['J. Muster', 'Jan Mustermann', '', '', 'Beispiel: …'], ['Jo', 'Mika'], ['Oma', '', 'x'], ['Gast 2', '', 'x']],
      fahrzeuge: [['Porsche', '1:24', '', '', 'Beispiel'], ['Ferrari 458 Italia', '', 'Ferrari 458']],
      korrekturen: [['https://drive.google.com/file/d/abcdefghijk12/view', '2', 'Jo', 'Anton Berger']],
    })
    expect(settings.aliases).toEqual({ jo: 'Mika' })
    expect(settings.guests).toEqual(['oma', 'gast 2'])
    expect(settings.cars).toEqual({ 'ferrari 458 italia': { name: 'Ferrari 458 Italia', displayName: 'Ferrari 458' } })
    expect(settings.corrections).toEqual([{ fileId: 'abcdefghijk12', position: 2, correctDriver: 'Anton Berger' }])
    expect(driveFileId('https://drive.google.com/open?id=abcdefghijk12')).toBe('abcdefghijk12')

    const [s] = applySettings([race('abcdefghijk12', '2026-01-01', [['Jo', 'Ferrari 458 Italia', 10], ['Jo', 'X', 9], ['Oma', 'X', 8], ['Gast 2', 'X', 7]])], settings)
    expect(s.results.map((r) => r.driver)).toEqual(['Mika', 'Anton Berger', 'Gast (Oma)', 'Gast 2'])
    expect(s.results[0].car).toBe('Ferrari 458')
  })

  it('findet Namen auch mit anderen Leerzeichen oder anderer Schreibweise', () => {
    // Smartrace mit doppeltem Leerzeichen, im Sheet abgeschrieben mit einfachem / geschütztem Leerzeichen
    const settings = parseSettings({
      fahrer: [['anna  b.', 'Anna']],
      fahrzeuge: [['Mercedes C63 AMG DTM No.\u00a06', '', 'Mercedes C63 AMG DTM'], ['Mercedes C63 AMG DTM No. 2', '1:24']],
    })
    const [s] = applySettings([race('f', '2026-01-01', [['Anna B.', 'Mercedes C63 AMG DTM  No. 6', 10], ['Ben', 'Mercedes C63 AMG DTM No. 2', 9], ['Cleo', 'Mercedes C63 AMG DTM', 8]])], settings)
    expect(s.results.map((r) => r.driver)).toEqual(['Anna', 'Ben', 'Cleo'])
    expect(s.results.map((r) => r.car)).toEqual(['Mercedes C63 AMG DTM', 'Mercedes C63 AMG DTM No. 2', 'Mercedes C63 AMG DTM'])
    expect(carScale(settings, 'Mercedes C63 AMG DTM No. 2')).toBe(24)
  })

  it('meldet Einträge im Sheet, die zu keinem Rennen passen', () => {
    const settings = parseSettings({ fahrer: [['Jo', 'Mika'], ['Joo', 'Moritz']], fahrzeuge: [['Mercedes C63 AMG DTM No 6', '', 'Mercedes C63 AMG DTM']] })
    const sessions = [race('f', '2026-01-01', [['Jo', 'Mercedes C63 AMG DTM No. 6', 10], ['Ben', 'X', 9]])]
    // Fahrer nur als Zeilennummer (Zeile 1 ist die Kopfzeile), Namen erscheinen nicht auf der Seite
    expect(unmatchedSettings(sessions, settings)).toEqual({ drivers: [3], cars: ['Mercedes C63 AMG DTM No 6'] })
  })

  it('löst Ketten auf: alter Name → Pseudonym → Anzeigename', () => {
    const settings = parseSettings({ fahrer: [['Fahrer 01', 'Anton'], ['Anton Berger', 'Fahrer 01'], ['Fahrer 02', '']] })
    expect(settings.aliases).toEqual({ 'fahrer 01': 'Anton', 'anton berger': 'Anton' })
    const [s] = applySettings([race('f', '2026-01-01', [['Fahrer 01', 'X', 10], ['Anton Berger', 'X', 9], ['Fahrer 02', 'X', 8]])], settings)
    expect(s.results.map((r) => r.driver)).toEqual(['Anton', 'Anton', 'Fahrer 02'])
    // Der alte Name kommt in keinem Rennen mehr vor, zeigt aber auf einen genutzten Namen: kein Hinweis
    const only = [race('g', '2026-01-02', [['Fahrer 01', 'X', 10], ['Fahrer 02', 'X', 9]])]
    expect(unmatchedSettings(only, settings).drivers).toEqual([])
    // Ringverweise führen nicht in eine Endlosschleife
    expect(parseSettings({ fahrer: [['A', 'B'], ['B', 'A']] }).aliases).toBeTruthy()
  })
})

describe('Einstufung und Pace', () => {
  const { model } = prepare(fixtureSessions(), EMPTY_SETTINGS)

  it('meldet die Einstufung nur für die ersten Läufe', () => {
    for (const [name, h] of model.rating.history) {
      expect(model.placement(name)).toBe(h.length < PLACEMENT_RUNS ? h.length : null)
      expect(model.placement(name, h[0].fileId)).toBe(1)
      if (h.length > PLACEMENT_RUNS) expect(model.placement(name, h[h.length - 1].fileId)).toBeNull()
    }
  })

  it('gibt die Pace als Abstand in Millisekunden an', () => {
    const paces = [...model.stats('all').drivers.values()].map((d) => d.paceGap).filter((v): v is number => v != null)
    expect(paces.length).toBeGreaterThan(0)
    for (const g of paces) expect(Math.abs(g)).toBeLessThan(10_000)
  })
})

describe('Rekord-Tipps', () => {
  const { model } = prepare(fixtureSessions(), EMPTY_SETTINGS)

  it('zeigt den Bahnrekord nur dem Halter oder wenn er in Reichweite ist', () => {
    for (const d of model.drivers) {
      for (const t of model.tips(d)) {
        if (t.title === 'Bahnrekord') expect(t.good).toBe(true)
        if (t.title === 'Bahnrekord in Reichweite') {
          const gap = Number(t.text.match(/fehlen dir nur (\d+,\d+) s/)![1].replace(',', '.'))
          expect(gap).toBeLessThanOrEqual(0.4)
        }
      }
    }
  })
})

describe('Autowertung über die Zeit', () => {
  // Anna und Ben tauschen jedes Rennen die Autos; y = log(Rundenzeit)
  const obs = (days: number[], fasterB: (day: number) => number): CarObs[] =>
    days.flatMap((day, i) => {
      const date = new Date(Date.UTC(2025, 0, 1 + day)).toISOString().slice(0, 10)
      const [a, b] = i % 2 ? ['B', 'A'] : ['A', 'B']
      return [
        { session: `s${i}`, date, driver: 'Anna', car: `X\u0000${a}`, y: a === 'B' ? -fasterB(day) : 0, w: 1 },
        { session: `s${i}`, date, driver: 'Ben', car: `X\u0000${b}`, y: b === 'B' ? -fasterB(day) : 0, w: 1 },
      ]
    })
  const days = Array.from({ length: 40 }, (_, i) => i * 10)
  const gap = (o: CarObs[]) => {
    const f = fitCars(o, '2026-02-05', RATING.carHalfLifeDays, RATING.carPrior.pace, RATING.carTrendPrior.pace)
    return f.effect.get('X\u0000A')! - f.effect.get('X\u0000B')!
  }

  it('vergisst alte Läufe nicht', () => {
    // B war lange 2 % schneller, die letzten Läufe sind beide gleich schnell
    const g = gap(obs(days, (d) => (d < 330 ? 0.02 : 0)))
    expect(g).toBeGreaterThan(0.005)
  })

  it('übernimmt gleichbleibende neue Entwicklungen stärker als alte', () => {
    const steady = gap(obs(days, () => 0.02))
    const recent = gap(obs(days, (d) => (d >= 270 ? 0.02 : 0)))
    const old = gap(obs(days, (d) => (d < 120 ? 0.02 : 0)))
    expect(recent).toBeGreaterThan(old)
    expect(recent).toBeLessThan(steady)
  })

  it('lässt sich von einem einzelnen Ausreißer kaum bewegen', () => {
    const one = gap(obs(days, (d) => (d === 390 ? 0.05 : 0)))
    expect(Math.abs(one)).toBeLessThan(0.005)
  })
})

describe('Autowertung gewichtet konsistente Fahrer', () => {
  it('folgt eher dem, was konsistente Fahrer mit den Autos fahren', () => {
    // Beide fahren abwechselnd A und B gegen einen Dritten. Der Konstante ist mit A immer genau
    // 2 % schneller, der Wechselhafte schwankt stark und ist im Schnitt mit B 2 % schneller.
    const obs: CarObs[] = []
    const noise = [0.09, 0.08, -0.07, -0.1, 0.06, 0.1, -0.08, -0.08, 0.07, 0.09, -0.07, -0.09]
    for (let i = 0; i < 12; i++) {
      const date = `2026-01-${String(i + 1).padStart(2, '0')}`
      const car = i % 2 ? 'A' : 'B'
      obs.push({ session: `k${i}`, date, driver: 'Konstant', car: `X\u0000${car}`, y: car === 'A' ? -0.02 : 0, w: 1 })
      obs.push({ session: `k${i}`, date, driver: 'Ref', car: 'X\u0000C', y: 0, w: 1 })
      obs.push({ session: `w${i}`, date, driver: 'Wechselhaft', car: `X\u0000${car}`, y: (car === 'B' ? -0.02 : 0) + noise[i], w: 1 })
      obs.push({ session: `w${i}`, date, driver: 'Ref', car: 'X\u0000C', y: 0, w: 1 })
    }
    const opt = { asOf: '2026-02-01', halfLifeDays: RATING.carHalfLifeDays, prior: RATING.carPrior, trendPrior: RATING.carTrendPrior }
    const est = estimateCars(obs, [], new Map(), { ...opt, consistency: RATING.carConsistency })
    expect(est.total.get('X\u0000A')!).toBeLessThan(est.total.get('X\u0000B')!)
    // ohne Gewichtung nach Konsistenz zieht der Wechselhafte das Ergebnis Richtung B
    const flat = estimateCars(obs, [], new Map(), { ...opt, consistency: { ...RATING.carConsistency, rounds: 0 } })
    expect(flat.total.get('X\u0000A')! - flat.total.get('X\u0000B')!).toBeGreaterThan(est.total.get('X\u0000A')! - est.total.get('X\u0000B')!)
  })
})

describe('Fahrzeuge nur im Qualifying', () => {
  it('zählt Autos, die bisher nur im Qualifying gefahren sind', () => {
    const q = { ...race('q', '2026-01-01', [['Anna', 'Mercedes C63 AMG DTM No. 2', 5], ['Ben', 'X', 5]]), type: 'Qualifikation', fileName: 'Qualifikation_01.01.2026.csv' }
    const r = race('r', '2026-01-01', [['Anna', 'X', 10], ['Ben', 'X', 9]])
    const car = buildModel([q, r]).stats('all').cars.get('Mercedes C63 AMG DTM No. 2')!
    expect(car.races).toBe(0)
    expect(car.qualis).toBe(1)
  })
})

describe('Saisonwertung mit Punkten', () => {
  // Läufe: Reihenfolge = Platzierung, Runden gleich; Rundenzeit steigt mit dem Platz (Platz 1 am schnellsten)
  const r = (id: string, date: string, order: string[], type = 'Rennen') => ({ ...race(id, date, order.map((n) => [n, 'X', 10] as [string, string, number])), type })

  it('gibt Punkte je geschlagenem Gegner, Siegbonus und Bonus für schnellste Runde und Pole', () => {
    const st = seasonStandings([r('q', '2026-01-10', ['Ben', 'Anna'], 'Qualifikation'), r('a', '2026-01-10', ['Anna', 'Ben', 'Cleo', 'Dora'])])
    const anna = st.find((x) => x.name === 'Anna')!
    const ben = st.find((x) => x.name === 'Ben')!
    // Anna: 3 geschlagen + Sieg 1 + schnellste Runde 2 = 6; Ben: 2 geschlagen + Pole 1 = 3
    expect(anna.points).toBe(6)
    expect(ben.points).toBe(3)
    expect(anna.rank).toBe(1)
  })

  it('wertet pro Renntag die besten 3 Rennen und die besten 5 Renntage, Finale im Dezember doppelt', () => {
    const sessions = [
      // Tag 1: 4 Rennen, Anna gewinnt alle (je 2 Punkte) → nur 3 zählen = 6, + schnellste Runde 2 = 8
      ...['a', 'b', 'c', 'd'].map((id) => r(id, '2026-01-10', ['Anna', 'Ben'])),
      // Tage 2–6: je ein Rennen, Ben gewinnt → je 2 + 2 = 4
      ...[2, 3, 4, 5].map((m) => r(`m${m}`, `2026-0${m}-10`, ['Ben', 'Anna'])),
      r('dez', '2026-12-10', ['Ben', 'Anna']),
    ]
    const st = seasonStandings(sessions)
    const anna = st.find((x) => x.name === 'Anna')!
    const ben = st.find((x) => x.name === 'Ben')!
    expect(anna.days[0].points).toBe(8)
    expect(ben.days.find((d) => d.finale)!.points).toBe(8)
    // Ben: 6 Renntage (Tag 1 mit 0 Punkten wird gestrichen): 4·4 + 8 = 24
    expect(ben.days.filter((d) => !d.counted)).toHaveLength(1)
    expect(ben.points).toBe(24)
    expect(ben.progress).toHaveLength(6)
  })

  it('zählt die Konstrukteurswertung über alle Rennen', () => {
    const c = constructorStandings([race('k', '2026-01-10', [['Anna', 'Rot', 10], ['Ben', 'Blau', 10], ['Cleo', 'Rot', 10]])])
    expect(c.map((x) => [x.car, x.points])).toEqual([['Rot', 3], ['Blau', 1]])
  })

  it('verfolgt Saison-Challenges', () => {
    const sessions = [r('a', '2026-01-10', ['Anna', 'Ben']), r('b', '2026-02-10', ['Ben', 'Anna']), r('c', '2026-03-10', ['Anna', 'Ben'])]
    const ch = seasonChallenges('2026', { sessions, driver: 'Anna', personalBests: [], dayBonus: 0, upsetWins: 0, carsBefore: new Set() })
    // erst ab 2027 kommt eine Zeitjagd über 10 oder 20 Runden dazu
    expect(ch).toHaveLength(CHALLENGES_PER_SEASON)
    expect(seasonChallenges('2027', { sessions, driver: 'Anna', personalBests: [], dayBonus: 0, upsetWins: 0, carsBefore: new Set() })).toHaveLength(CHALLENGES_PER_SEASON + 1)
    for (const c of ch) expect(c.value).toBeLessThanOrEqual(c.target)
    const byId = new Map([...CHALLENGE_POOL, ...TIME_POOL].map((d) => [d.id, d]))
    expect(ch.every((c) => byId.has(c.id))).toBe(true)
  })

  it('zieht jede Saison zufällig, aber fest, mit mindestens 3 neuen Challenges', () => {
    for (let y = 2021; y <= 2035; y++) {
      const ids = seasonChallengeIds(y)
      expect(new Set(ids).size).toBe(CHALLENGES_PER_SEASON)
      expect(seasonChallengeIds(y)).toEqual(ids)
      const prev = new Set(seasonChallengeIds(y - 1))
      expect(ids.filter((id) => !prev.has(id)).length).toBeGreaterThanOrEqual(NEW_PER_SEASON)
    }
  })

  it('wertet einzelne Challenges richtig aus', () => {
    // alle Challenges des Pools auf denselben Läufen prüfen, unabhängig von der Auswahl
    const sessions = [r('a', '2026-01-10', ['Anna', 'Ben', 'Cleo', 'Dora', 'Emil']), r('b', '2026-01-10', ['Anna', 'Ben']), r('c', '2026-02-10', ['Anna', 'Ben'])]
    const ctx = { sessions, driver: 'Anna', personalBests: [{ car: 'X' }], dayBonus: 1, upsetWins: 0, carsBefore: new Set<string>() }
    const val = (id: string) => {
      const d = CHALLENGE_POOL.find((c) => c.id === id)!
      const races = sessions.map((s) => ({ s, r: s.results.find((x) => x.driver === 'Anna')! }))
      return d.value(ctx, { races, qualis: [], days: 2, wins: races })
    }
    expect(val('serie')).toBe(3)
    expect(val('grossesfeld')).toBe(1)
    expect(val('tagessieger')).toBe(2)
    expect(val('gegner')).toBe(4)
    expect(val('neuesauto')).toBe(1)
  })
})

describe('Fahrstil (Netzdiagramm)', () => {
  it('liefert sechs Achsen mit Werten zwischen 0 und 1', () => {
    const { model } = prepare(fixtureSessions(), EMPTY_SETTINGS)
    const name = model.ranking('all')[0].name
    const axes = model.driverRadar(name)
    expect(axes.map((a) => a.key)).toEqual(['tempo', 'konstanz', 'start', 'ausdauer', 'sauber', 'zweikampf'])
    for (const a of axes) {
      expect(a.score).toBeGreaterThan(0)
      expect(a.score).toBeLessThanOrEqual(1)
    }
  })
})

describe('Zeitjagd-Challenge', () => {
  const ctx = (splits: NonNullable<Parameters<(typeof TIME_POOL)[0]['value']>[0]['splits']>) => ({ sessions: [], driver: 'Mika', personalBests: [], dayBonus: 0, upsetWins: 0, carsBefore: new Set<string>(), splits })
  const facts = { races: [], qualis: [], days: 0, wins: [] }
  const zehn = TIME_POOL.find((c) => c.id === 'zeit10')!
  it('ist mit neuer Bestmarke sofort geschafft', () => {
    expect(zehn.value(ctx([{ n: 10, pbBefore: 123_000, mark: 125_000, times: [{ ms: 122_500, prevBest: 123_000 }] }]), facts)).toBe(3)
  })
  it('zählt sonst Rennen unter der schon geknackten Marke', () => {
    const c = ctx([{ n: 10, pbBefore: 123_000, mark: 125_000, times: [{ ms: 124_000, prevBest: 123_000 }, { ms: 126_000, prevBest: 123_000 }, { ms: 124_900, prevBest: 123_000 }] }])
    expect(zehn.value(c, facts)).toBe(2)
    expect(typeof zehn.detail === 'function' && zehn.detail(c)).toContain('2:05')
  })
})

describe('Gesamtzeit der ersten Runden', () => {
  const res = (laps: number[], invalidAt = -1) => ({
    position: 1, gap: { kind: 'leader' as const }, driver: 'Mika', car: 'Auto', laps: laps.length, bestLapMs: null, validBestLapMs: null, pitStops: 0,
    lapTimes: laps.map((ms, i) => ({ number: i + 1, ms, status: i === invalidAt ? ('invalid' as const) : ('normal' as const) })),
  })
  it('summiert die ersten n Runden, nur wenn sie gefahren wurden', () => {
    expect(splitTime(res(Array(12).fill(10_000)), 10)).toBe(100_000)
    expect(splitTime(res(Array(12).fill(10_000)), 20)).toBeNull()
    expect(splitTime(res(Array(25).fill(10_000)), 20)).toBe(200_000)
  })
  it('lässt Zeiten mit ungültiger Runde weg', () => {
    expect(splitTime(res(Array(12).fill(10_000), 3), 10)).toBeNull()
    expect(splitTime(res(Array(12).fill(10_000), 11), 10)).toBe(100_000)
  })
})

describe('Zeitmarken über 10/20 Runden', () => {
  it('wählt eine runde Schrittweite und rechnet Marken', () => {
    expect(markStep(130_000)).toBe(5_000)
    expect(markStep(260_000)).toBe(10_000)
    expect(markReached(123_400, 5_000)).toBe(125_000)
    expect(markNext(123_400, 5_000)).toBe(120_000)
    expect(fmtMark(120_000)).toBe('2:00')
  })
  it('sammelt Bestmarken ohne Tankrennen, mit vorheriger Bestmarke', () => {
    const a = race('a', '2026-01-10', [['Mika', 'Auto', 12], ['Emil', 'Auto', 12]])
    const b = race('b', '2026-02-10', [['Emil', 'Auto', 12], ['Mika', 'Auto', 12]])
    const tank = { ...race('c', '2026-03-10', [['Mika', 'Auto', 12]]), tank: true }
    const sp = buildSplits([a, b, tank])
    expect(sp.entries.filter((e) => e.n === 10)).toHaveLength(4)
    const emilB = sp.entries.find((e) => e.fileId === 'b' && e.driver === 'Emil')!
    expect(emilB.prevBest).toBe(102_000)
    expect(emilB.ms).toBe(100_000)
    expect(sp.records.get(splitKey('X', 10))?.driver).toBe('Mika')
    expect(sp.best('Emil', 'X', 10, '2026-02-01')).toBe(102_000)
  })
  it('meldet neue Bestmarken des letzten Renntags, gibt Ziel und Medaille', () => {
    const a = race('a', '2027-01-10', [['Mika', 'Auto', 12], ['Emil', 'Auto', 12]])
    const b = race('b', '2027-02-10', [['Emil', 'Auto', 12], ['Mika', 'Auto', 12]])
    const model = buildModel([a, b])
    expect(model.news().some((n) => n.kind === 'split' && n.driver === 'Emil')).toBe(true)
    expect(model.goals('Emil').some((g) => g.label.includes('10 Runden unter'))).toBe(true)
    expect(model.medals.get('Mika')?.some((m) => m.kind === 'rekord-10')).toBe(true)
    expect(model.medals.get('Emil')?.some((m) => m.kind === 'zeitmarke')).toBe(true)
    // vor dem Start der neuen Belohnungen: Ziel ja, Medaille nein
    const old = buildModel([race('a', '2026-01-10', [['Mika', 'Auto', 12], ['Emil', 'Auto', 12]]), race('b', '2026-02-10', [['Emil', 'Auto', 12], ['Mika', 'Auto', 12]])])
    expect(old.goals('Emil').some((g) => g.label.includes('10 Runden unter'))).toBe(true)
    expect([...old.medals.values()].flat().some((m) => m.kind === 'zeitmarke' || m.kind.startsWith('rekord-'))).toBe(false)
  })
})
