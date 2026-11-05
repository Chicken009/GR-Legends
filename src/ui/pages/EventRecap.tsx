import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UNKNOWN_TRACK } from '../../config'
import { funDistance } from '../../domain/funDistance'
import type { EventState } from '../../domain/event/engine'
import { driverInsight } from '../../domain/event/insights'
import { eventKind, eventNumbers, myRecap, recapFacts, stages, type ProgressStep } from '../../domain/event/progress'
import { closeFinishes, costliestCrash, driveTimeFun, fastestLaps, headline, mostConsistent, mostGained, mostLaps, moreNumbers, quizQuestions, raceOfDay, replayAt, rivalOf, standingsRace } from '../../domain/event/recap'
import { ME } from '../colors'
import { Avatar, useData, useMyName } from '../components'
import { fmtNum, formatDate, formatTime } from '../format'
import { Bolt, Crown, FormCurve, NAV_ICONS, PATHS, PoleFlag, Rocket, ShareIcon, Shield, StrokeIcon, Target } from '../icons'
import { useMe } from '../me'
import { CarHero, CountUp, Group, Hint, Huge, Line, StatTile, StoryPager, type CardDef } from '../story'
import { RuleChip } from '../PointsLadder'
import { finishedOf, fmtPts, placeDetail, placeMode, Podium, TeamScore, teamColor, useEventHistory, useEventState } from '../event/shared'
import { AwardCard, GapLine, HeatChips, Item, LaneRace, LapBars, OverBars, PhotoFinish, Quiz, RankCount, RankShuffle, RankSpark, Staged, StagedPodium, type AwardDef, type LaneFrame } from '../event/recapParts'

const fmtSec = (ms: number, digits = 3) => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`
const fmtCm = (cm: number) => (cm < 100 ? `${Math.max(1, Math.round(cm))} cm` : `${(cm / 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} m`)
const fmtMinutes = (min: number) => (min < 60 ? `${Math.round(min)} Min.` : `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')} h`)
const you = (n: string, me: string | null) => (n === me ? 'Du' : n)
const Name = ({ n, me }: { n: string; me: string | null }) => <b style={n === me ? { color: ME } : undefined}>{you(n, me)}</b>
const medal = (place: number) => ['var(--gold)', 'var(--silver)', 'var(--bronze)'][place - 1]

const ROCKET = 'M12 2c3 2 5 6 5 10l-2 4H9l-2-4c0-4 2-8 5-10zM9 16l-3 3M15 16l3 3M12 9.5a1.5 1.5 0 1 0 0 .01'
const SWORDS = 'M4 4l10 10M20 4L10 14M4 20l4-4M20 20l-4-4M13 17l4-4M11 17l-4-4'
const BOLT = 'M13 2L4 14h7l-1 8 9-12h-7z'
const QUESTION = 'M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.2V15M12 18.5v.01M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z'
const CRASH = 'M12 3l9 16H3zM12 10v4M12 17h.01'
const SCALE = 'M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8'
const FUEL = 'M4 21h10M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3M7 7h5'
const SPARK = 'M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z'

/** Kleiner Hinweis-Chip (Zahl zuerst) */
const Chips = ({ items }: { items: { value: string; label: string; color?: string }[] }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {items.map((c) => (
      <RuleChip key={c.label + c.value} value={c.value} label={c.label} color={c.color} />
    ))}
  </div>
)

const Part = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="card-part">
    <span className="part-label">{label}</span>
    {children}
  </div>
)

/** Story-Karten zu einem Wettkampf; läuft er noch, heißt es „bisher“ */
/** `pick` (0–1) wählt den witzigen Vergleich für die gefahrene Strecke und mischt das Quiz */
export function eventCards(state: EventState, steps: ProgressStep[], me: string | null, done: boolean, onDone: () => void, pick = 0): CardDef[] {
  const def = state.def
  const f = recapFacts(state, steps)
  const nums = eventNumbers(state)
  const more = moreNumbers(state)
  const kind = eventKind(state)
  const place = placeMode(state)
  const bisher = done ? '' : ' · bisher'
  const n = state.standings.length

  // ---- Intro (verrät noch nichts) ----
  const track = state.heats.find((h) => h.session)?.session?.track ?? def.track
  const intro: CardDef = {
    key: 'intro',
    kicker: done ? 'Rückblick' : 'Zwischenstand',
    icon: PATHS.track,
    body: (
      <>
        <Group gap={6}>
          <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.08 }}>{def.name}</span>
          <Line>
            {formatDate(def.start)}
            {def.end && def.end !== def.start ? ` – ${formatDate(def.end)}` : ''}
            {track && track !== UNKNOWN_TRACK ? ` · ${track}` : ''}
          </Line>
        </Group>
        <Staged style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {state.standings
            .map((s) => s.name)
            .sort((a, b) => a.localeCompare(b))
            .map((d, i) => (
              <Item key={d} delay={150 + i * 70}>
                <Avatar name={d} size={n > 12 ? 32 : 40} ring={d === me ? ME : undefined} />
              </Item>
            ))}
        </Staged>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <StatTile value={nums.drivers} label="Fahrer" />
          <StatTile value={nums.heats} label="Läufe" />
          {state.teams.length ? <StatTile value={state.teams.length} label="Teams" /> : <StatTile value={nums.laps} label="Runden" />}
        </div>
        <Hint>{done ? 'Wer hat gewonnen? Das kommt am Schluss – wisch dich durch die Höhepunkte.' : 'Wisch dich durch den Stand und die Höhepunkte.'}</Hint>
      </>
    ),
  }

  // ---- Quiz ----
  const questions = quizQuestions(state, f, nums.perDriver, `${def.name}|${Math.floor(pick * 1000)}`)
  const quiz: CardDef | null =
    questions.length >= 2
      ? { key: 'quiz', kicker: 'Quiz', icon: QUESTION, body: <Quiz questions={questions} me={me} /> }
      : null

  // ---- Rennen des Tages: Wiedergabe aus den Rundenzeiten ----
  const rod = raceOfDay(state)
  let raceCard: CardDef | null = null
  if (rod) {
    const r = rod.replay
    const lanes = [...rod.heat.entrants.map((e) => e.name).filter((x): x is string => !!x && r.drivers.some((d) => d.name === x)), ...r.drivers.map((d) => d.name).filter((x) => !rod.heat.entrants.some((e) => e.name === x))]
    const frame = (p: number): LaneFrame[] => replayAt(r, p * r.durationMs).map((x) => ({ name: x.name, x: x.progress / r.laps, rank: x.rank, pos: x.rank, crash: x.crash }))
    const label = (p: number) => {
      if (p >= 1) return 'Zieleinlauf'
      const lead = Math.max(...replayAt(r, p * r.durationMs).map((x) => x.progress))
      return `Runde ${Math.min(r.laps, Math.floor(lead) + 1)} / ${r.laps}`
    }
    const winner = rod.heat.order[0]
    raceCard = {
      key: 'rennen',
      kicker: 'Rennen des Tages',
      icon: NAV_ICONS.races,
      body: (
        <>
          <Group gap={8}>
            <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{rod.heat.label}</span>
            <Chips items={[{ value: String(rod.changes), label: 'Positionswechsel' }, ...(rod.leadChanges ? [{ value: String(rod.leadChanges), label: 'Führungswechsel' }] : [])]} />
          </Group>
          <LaneRace
            names={lanes}
            frame={frame}
            duration={9000}
            me={me}
            label={label}
            crashes
            after={
              <Line>
                Sieg für <Name n={winner} me={me} />
              </Line>
            }
          />
        </>
      ),
    }
  }

  // ---- Knappste Entscheidung: Fotofinish ----
  const close = closeFinishes(state)
  let closeCard: CardDef | null = null
  if (close.length) {
    const c = close[0]
    closeCard = {
      key: 'knapp',
      kicker: 'Knappste Entscheidung',
      icon: SWORDS,
      body: (
        <>
          <PhotoFinish first={c.first} second={c.second} ms={c.ms} me={me} />
          <Staged style={{ gap: 14 }}>
            <Item delay={2900}>
              <Group>
                <Huge>{fmtSec(c.ms)}</Huge>
                <Line>
                  <Name n={c.first} me={me} /> vor <Name n={c.second} me={me} />
                </Line>
                <Chips items={[...(c.cm != null ? [{ value: `≈ ${fmtCm(c.cm)}`, label: 'auf der Strecke' }] : []), { value: c.heat.label, label: '' }]} />
              </Group>
            </Item>
            {c.gaps.length >= 3 && (
              <Item delay={3300}>
                <Part label="Abstand Runde für Runde">
                  <GapLine gaps={c.gaps} first={c.first} second={c.second} me={me} />
                </Part>
              </Item>
            )}
            {close.length > 1 && (
              <Item delay={3600}>
                <Part label="Auch knapp">
                  {close.slice(1).map((x) => (
                    <div key={x.heat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span className="num" style={{ fontWeight: 800, minWidth: 64 }}>
                        {fmtSec(x.ms)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--text-2)' }}>
                        <Name n={x.first} me={me} /> vor <Name n={x.second} me={me} />
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{x.heat.label}</span>
                    </div>
                  ))}
                </Part>
              </Item>
            )}
          </Staged>
        </>
      ),
    }
  }

  // ---- Größter Sprung / Aufholjagd ----
  let jumpCard: CardDef | null = null
  if (f.jump || f.comeback) {
    const j = f.jump
    const cb = f.comeback
    const cbRanks = cb ? steps.slice(1).map((s) => s.ranks.get(cb.name)).filter((x): x is number => x != null) : []
    let heatPlace: string | null = null
    if (j) {
      const ids = steps[j.step].heatIds
      const h = state.heats.find((x) => ids.includes(x.id) && x.order.includes(j.name))
      const p = h ? h.order.indexOf(j.name) + 1 : 0
      if (h) heatPlace = p === 1 && h.order.length > 1 ? 'Laufsieg' : `Platz ${p} im Lauf`
    }
    jumpCard = {
      key: 'sprung',
      kicker: j ? 'Größter Sprung' : 'Aufholjagd',
      icon: ROCKET,
      body: j ? (
        <>
          <Group>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Huge color="var(--gold)">+{j.from - j.to}</Huge>
              <span style={{ fontSize: 18, fontWeight: 700 }}>Plätze</span>
            </span>
            <Line>
              <Name n={j.name} me={me} /> in {j.label}
            </Line>
            {heatPlace && <Chips items={[{ value: heatPlace, label: '' }, { value: `${j.from} → ${j.to}`, label: 'in der Wertung' }]} />}
          </Group>
          <RankShuffle before={steps[j.step - 1].ranks} after={steps[j.step].ranks} focus={j.name} me={me} />
          {cb && cbRanks.length >= 3 && (
            <Part label="Aufholjagd">
              <span style={{ fontSize: 14 }}>
                <Name n={cb.name} me={me} /> · nach {cb.label} auf {cb.worst}, jetzt {cb.final}
              </span>
              <RankSpark ranks={cbRanks} of={n} color="var(--gold)" />
            </Part>
          )}
        </>
      ) : (
        <>
          <Group>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Huge color="var(--gold)">+{cb!.worst - cb!.final}</Huge>
              <span style={{ fontSize: 18, fontWeight: 700 }}>Plätze</span>
            </span>
            <Line>
              <Name n={cb!.name} me={me} /> · nach {cb!.label} auf {cb!.worst}, jetzt {cb!.final}
            </Line>
          </Group>
          {cbRanks.length >= 2 && <RankSpark ranks={cbRanks} of={n} color="var(--gold)" height={90} />}
        </>
      ),
    }
  }

  // ---- Schnellste Runde mit den nächstschnellsten ----
  let fastCard: CardDef | null = null
  if (state.fastestLap) {
    const fl = state.fastestLap
    const laps = fastestLaps(state)
    const own = laps.find((l) => l.name === fl.name)
    const top = laps.slice(0, 5)
    const myLap = me ? laps.findIndex((l) => l.name === me) : -1
    const byCar = laps[0] && laps[0].name !== fl.name
    fastCard = {
      key: 'schnellste',
      kicker: 'Schnellste Runde',
      icon: BOLT,
      body: (
        <>
          {fl.car && <CarHero car={fl.car} />}
          <Group>
            {/* feste Breite: beim Hochzählen springt nichts, und „s“ bleibt in der Zeile */}
            <span className="num" style={{ fontSize: 'clamp(40px, 13vw, 66px)', fontWeight: 800, lineHeight: 0.95, letterSpacing: -1, color: 'var(--best)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              <CountUp value={fl.ms} format={(v) => formatTime(Math.round(v))} duration={1400} />
            </span>
            <Line>
              <Name n={fl.name} me={me} />
              {fl.car ? ` im ${fl.car}` : ''}
            </Line>
            <Chips items={[...(own ? [{ value: own.heat.label, label: own.lap ? `Runde ${own.lap}` : '' }] : []), ...(byCar ? [{ value: '⚖', label: 'gemessen am Auto' }] : [])]} />
          </Group>
          {laps.length > 1 && (
            <Part label="Die schnellsten Runden">
              <Staged style={{ gap: 6 }}>
                {[...top.map((l, i) => ({ l, i })), ...(myLap >= 5 ? [{ l: laps[myLap], i: myLap }] : [])].map(({ l, i }, k) => (
                  <Item key={l.name} delay={300 + k * 140}>
                    <div className={l.name === me ? 'me-row' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 10, fontSize: 13 }}>
                      <span className="num" style={{ width: 18, fontWeight: 800, color: i < 3 ? medal(i + 1) : 'var(--muted)' }}>
                        {i + 1}
                      </span>
                      <Avatar name={l.name} size={24} ring={l.name === me ? ME : undefined} />
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Name n={l.name} me={me} />
                      </span>
                      <span className="num" style={{ fontWeight: 700 }}>
                        {formatTime(l.ms)}
                      </span>
                      <span className="num" style={{ width: 64, textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                        {i === 0 ? '' : `+${fmtSec(l.ms - laps[0].ms)}`}
                      </span>
                    </div>
                  </Item>
                ))}
              </Staged>
            </Part>
          )}
        </>
      ),
    }
  }

  // ---- Teuerster Abflug ----
  const crash = costliestCrash(state)
  const crashCard: CardDef | null = crash
    ? {
        key: 'abflug',
        kicker: 'Teuerster Abflug',
        icon: CRASH,
        body: (
          <>
            <Group>
              <Huge color="var(--crash)">
                <CountUp value={crash.lossMs / 1000} format={(v) => `${fmtNum(v, 1)} s`} />
              </Huge>
              <Line>
                <Name n={crash.name} me={me} /> · {crash.heat.label}, Runde {crash.lap}
              </Line>
              {crash.places > 0 && <Chips items={[{ value: `${crash.places} ${crash.places === 1 ? 'Platz' : 'Plätze'}`, label: 'wohl verloren', color: 'var(--crash-text)' }]} />}
            </Group>
            <Part label="Rundenzeiten in diesem Lauf">
              <LapBars laps={crash.lapTimes} focus={crash.lap} />
            </Part>
          </>
        ),
      }
    : null

  // ---- Prognose gegen Ergebnis ----
  const raced = new Map(state.standings.map((s) => [s.name, s.races]))
  const over = [...state.overperformance].filter(([x]) => (raced.get(x) ?? 0) >= 1).map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  let overCard: CardDef | null = null
  if (over.length >= 3 && over[0].value >= 0.5) {
    const shown = over.slice(0, 8)
    const mineOver = me ? over.find((o) => o.name === me) : null
    if (mineOver && !shown.includes(mineOver)) shown.push(mineOver)
    overCard = {
      key: 'prognose',
      kicker: 'Prognose gegen Ergebnis',
      icon: SCALE,
      body: (
        <>
          <Group>
            <Huge color="#4AA8F0">+{fmtNum(over[0].value, 1)}</Huge>
            <Line>
              Plätze über Erwartung: <Name n={over[0].name} me={me} />
            </Line>
          </Group>
          <OverBars rows={shown} me={me} />
          <Hint>Erwartung laut Elo: wie viele Gegner man je Rennen schlagen sollte – Summe über alle Rennen.</Hint>
        </>
      ),
    }
  }

  // ---- Das Rennen um die Spitze (Variante B: Spuren; ab elf Fahrern Rangliste) ----
  let leadCard: CardDef | null = null
  if (f.leaders.length >= 3) {
    const st = stages(state, steps)
    // Viele Läufe: Stand je Etappe, sonst nach jedem Lauf
    const path = st.length >= 3 && steps.length > 21 ? st : steps.map((s, i) => ({ ...s, short: i ? String(i) : 'Start' }))
    const m = path.length - 1
    const names = [...state.drivers.filter((d) => state.standings.some((s) => s.name === d)), ...state.standings.map((s) => s.name).filter((x) => !state.drivers.includes(x))]
    const race = standingsRace(path, names, !place)
    const byPoints = !place && Math.max(0, ...[...path[m].totals.values()]) > 0
    const frame = (p: number): LaneFrame[] => race(p).map((r) => ({ ...r, value: byPoints ? fmtPts(r.points) : undefined }))
    const label = (p: number) => {
      const c = Math.min(m, Math.floor(p * m + 0.35))
      return (
        <>
          {path[c].label} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{c ? `· ${c}/${m}` : ''}</span>
        </>
      )
    }
    leadCard = {
      key: 'spitze',
      kicker: 'Das Rennen um die Spitze',
      icon: PATHS.flag,
      body: (
        <>
          <Chips items={[f.wireToWire ? { value: '0', label: 'Führungswechsel' } : { value: String(f.leadChanges), label: 'Führungswechsel' }, { value: String(m), label: m === steps.length - 1 ? 'Läufe' : 'Etappen' }]} />
          <LaneRace
            names={names}
            frame={frame}
            duration={Math.min(12000, Math.max(6000, m * 750))}
            me={me}
            label={label}
            after={
              <Line>
                {f.wireToWire ? (
                  <>
                    Start-Ziel: <Name n={f.wireToWire} me={me} /> lag nach jedem Lauf vorn.
                  </>
                ) : f.turn ? (
                  <>
                    Seit {f.turn.label} vorn: <Name n={f.turn.name} me={me} />
                  </>
                ) : null}
              </Line>
            }
          />
        </>
      ),
    }
  }

  // ---- Siegerehrung: erst Platz 3, dann 2, dann 1 ----
  const teamsScored = state.teamStandings.some((t) => t.points !== 0)
  const winner = state.standings[0]
  const singleCard: CardDef | null =
    kind !== 'team' && winner
      ? {
          key: 'sieger',
          kicker: `${def.name}${bisher}${kind === 'mixed' ? ' · Einzel' : ''}`,
          icon: NAV_ICONS.events,
          confetti: done && kind === 'single' ? 2900 : false,
          body: (
            <>
              <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{done ? 'Die Sieger' : 'Der Stand'}</span>
              {done ? (
                <StagedPodium>
                  <Podium state={state} />
                </StagedPodium>
              ) : (
                <Podium state={state} />
              )}
              <Staged>
                <Item delay={done ? 3000 : 200}>
                  <Group gap={4}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: winner.name === me ? ME : 'var(--gold)' }}>{you(winner.name, me)}</span>
                    <Line>
                      {winner.name === me ? (done ? 'gewinnst' : 'führst') : done ? 'gewinnt' : 'führt'}
                      {place ? (placeDetail(state, winner.name) ? ` · ${placeDetail(state, winner.name)}` : '') : ` mit ${fmtPts(winner.total)} Pkt.`}
                      {!place && state.standings[1] ? ` – ${fmtPts(Math.round((winner.total - state.standings[1].total) * 10) / 10)} vor Platz 2` : ''}
                    </Line>
                  </Group>
                </Item>
              </Staged>
            </>
          ),
        }
      : null

  const teamCard: CardDef | null =
    kind !== 'single' && teamsScored
      ? (() => {
          const ts = state.teamStandings
          const step = done ? Math.min(500, 2400 / ts.length) : 80
          const last = (ts.length - 1) * step + 400
          const top = ts[0]
          return {
            key: 'teamsieger',
            kicker: `${def.name}${bisher} · Teams`,
            icon: NAV_ICONS.events,
            confetti: done ? last + 500 : false,
            body: (
              <>
                <Staged style={{ gap: 16 }}>
                  <Item delay={last + 200}>
                    <Group gap={4}>
                      <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, color: teamColor(top.id, top.name) }}>{top.name}</span>
                      <Line>{done ? 'gewinnt die Teamwertung' : 'führt die Teamwertung'}</Line>
                    </Group>
                  </Item>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {ts.map((t, i) => (
                      <Item key={t.id} delay={(ts.length - 1 - i) * step}>
                        <div className={t.drivers.includes(me ?? '\u0000') ? 'me-row' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: t.drivers.includes(me ?? '\u0000') ? undefined : 'rgba(255,255,255,0.04)', borderLeft: `4px solid ${teamColor(t.id, t.name)}` }}>
                          <span className="num" style={{ width: 20, fontSize: 18, fontWeight: 800, color: t.rank <= 3 ? medal(t.rank) : 'var(--muted)' }}>
                            {t.rank}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <b style={{ fontSize: 14 }}>{t.name}</b>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ display: 'flex' }}>
                                {t.drivers.map((d, k) => (
                                  <span key={d} style={{ marginLeft: k ? -6 : 0 }}>
                                    <Avatar name={d} size={20} ring={d === me ? ME : undefined} />
                                  </span>
                                ))}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {t.drivers.map((d, k) => (
                                  <span key={d}>
                                    {k > 0 && ', '}
                                    <span style={d === me ? { color: ME, fontWeight: 700 } : undefined}>{you(d, me)}</span>
                                  </span>
                                ))}
                              </span>
                            </span>
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <TeamScore state={state} value={t.points} size={16} />
                            {i > 0 && !place && (
                              <span className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>
                                −{fmtPts(Math.round((ts[i - 1].points - t.points) * 10) / 10)}
                              </span>
                            )}
                          </span>
                        </div>
                      </Item>
                    ))}
                  </div>
                </Staged>
              </>
            ),
          }
        })()
      : null

  // ---- Dein Wettkampf ----
  const mine = me ? state.standings.find((s) => s.name === me) : null
  let myCard: CardDef | null = null
  let rivalCard: CardDef | null = null
  if (me && mine) {
    const r = myRecap(state, steps, me)
    const ranks = r.ranks.filter((x): x is number => x != null)
    const worst = ranks.length >= 2 ? Math.max(...ranks) : mine.rank
    const chips = r.heats.map((h) => ({
      key: h.heat.id,
      label: h.heat.label,
      place: h.place,
      of: h.of,
      detail: `Platz ${h.place} von ${h.of}${!place && h.heat.kind === 'race' && h.points != null ? ` · +${fmtPts(h.points)} Pkt.` : h.heat.advancing?.includes(me) ? ' · weiter' : ''}`,
    }))
    myCard = {
      key: 'du',
      kicker: done ? 'Dein Wettkampf' : 'Dein Wettkampf bisher',
      icon: PATHS.track,
      body: (
        <>
          <Group gap={4}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <RankCount from={worst} to={mine.rank} color={ME} />
              <span style={{ fontSize: 18, color: 'var(--text-2)' }}>von {n}</span>
            </span>
          </Group>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {place ? <StatTile value={placeDetail(state, me) || `P${mine.rank}`} label="Ergebnis" /> : <StatTile value={mine.total} label="Punkte" format={(v) => fmtPts(Math.round(v * 10) / 10)} />}
            <StatTile value={mine.wins} label={mine.wins === 1 ? 'Sieg' : 'Siege'} />
            <StatTile value={mine.bestLapMs != null ? formatTime(mine.bestLapMs) : '–'} label="Beste Runde" />
          </div>
          {chips.length > 0 && (
            <Part label="Deine Läufe – antippen">
              <HeatChips heats={chips} initial={r.best?.heat.id} />
            </Part>
          )}
          {ranks.length >= 2 && (
            <Part label="Dein Platz nach jedem Lauf">
              <RankSpark ranks={ranks} of={n} />
            </Part>
          )}
          {!place && mine.bonuses.length > 0 && (
            <Part label="Deine Bonuspunkte">
              <Chips items={mine.bonuses.map((b) => ({ value: `+${fmtPts(b.points)}`, label: b.label, color: 'var(--gold)' }))} />
            </Part>
          )}
        </>
      ),
    }
    const rv = rivalOf(state, me)
    if (rv) {
      const verdict = rv.wins > rv.losses ? 'Du hast die Nase vorn' : rv.wins < rv.losses ? 'Revanche fällig!' : 'Ausgeglichen'
      rivalCard = {
        key: 'rivale',
        kicker: 'Dein Rivale',
        icon: SWORDS,
        body: (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Avatar name={me} size={64} ring={ME} />
                <b style={{ color: ME }}>Du</b>
              </span>
              <span className="num" style={{ fontSize: 'clamp(44px, 14vw, 64px)', fontWeight: 800, letterSpacing: -1 }}>
                <span style={{ color: rv.wins >= rv.losses ? ME : undefined }}>
                  <CountUp value={rv.wins} />
                </span>
                <span style={{ color: 'var(--faint)', margin: '0 6px' }}>:</span>
                <CountUp value={rv.losses} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Avatar name={rv.name} size={64} />
                <b>{rv.name}</b>
              </span>
            </div>
            <Group gap={10}>
              <span style={{ fontSize: 22, fontWeight: 800, textAlign: 'center' }}>{verdict}</span>
              <Staged style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
                {rv.races.map((w, i) => (
                  <Item key={i} delay={400 + i * 160}>
                    <span title={w ? 'Du vorn' : `${rv.name} vorn`} style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: w ? ME : '#3A404A', color: w ? '#14181D' : 'var(--text-2)' }}>
                      {w ? 'D' : rv.name.slice(0, 1).toUpperCase()}
                    </span>
                  </Item>
                ))}
              </Staged>
              <Hint>
                {rv.races.length} gemeinsame Rennen – wer vorn ins Ziel kam
              </Hint>
            </Group>
          </>
        ),
      }
    }
  }

  // ---- Ausgezeichnet: mit Punkten getrennt von Ehrentiteln ----
  const ICON: Record<string, ReactNode> = {
    fastestLap: <Bolt size={24} />,
    pole: <PoleFlag size={24} />,
    driverOfDay: <StrokeIcon d={PATHS.star} size={22} color="var(--gold)" />,
    personalBest: <Target size={24} />,
    clean: <Shield size={24} />,
  }
  const LABEL: Record<string, string> = { fastestLap: 'Schnellste Runde', pole: 'Pole', driverOfDay: 'Fahrer des Tages', personalBest: 'Neue Bestzeit', clean: 'Ohne Abflug' }
  const bonusKinds = ['fastestLap', 'pole', 'driverOfDay', 'personalBest', 'clean'] as const
  const withPoints: AwardDef[] = bonusKinds.flatMap((k) => {
    const got = state.standings.flatMap((s) => s.bonuses.filter((b) => b.kind === k).map((b) => ({ name: s.name, b })))
    if (!got.length) return []
    const names = [...new Set(got.map((g) => g.name))]
    const pts = [...new Set(got.map((g) => g.b.points))]
    const value =
      k === 'fastestLap' && state.fastestLap ? formatTime(state.fastestLap.ms) : k === 'pole' ? 'Schnellster im Qualifying' : k === 'driverOfDay' ? 'am meisten über Erwartung' : k === 'personalBest' ? (names.length === 1 ? 'auf dieser Strecke' : `${names.length} Fahrer`) : `${got.length} saubere Rennen`
    const label = k === 'fastestLap' || k === 'pole' ? (got[0].b.label.includes('Auto') ? `${LABEL[k]} (am Auto)` : LABEL[k]) : LABEL[k]
    return [{ key: k, icon: ICON[k], label, names, value, points: pts.length === 1 ? `+${fmtPts(pts[0])} Pkt.${k === 'clean' ? ' je Rennen' : ''}` : `bis +${fmtPts(Math.max(...pts))} Pkt.` }]
  })
  const has = (k: string) => withPoints.some((a) => a.key === k)
  const consistent = mostConsistent(state)
  const gained = mostGained(state)
  const lapsKing = mostLaps(nums.perDriver)
  const quali = state.sections.find((s) => s.def.format === 'quali' && s.complete)
  const honors: (AwardDef | null)[] = [
    f.mostWins && { key: 'wins', icon: <Crown size={24} label="Meiste Siege" />, label: 'Meiste Siege', names: [f.mostWins.name], value: `${f.mostWins.wins} Laufsiege` },
    !has('driverOfDay') && f.driverOfDay ? { key: 'dotd', icon: <StrokeIcon d={PATHS.star} size={22} color="#86a9c8" />, label: 'Fahrer des Tages', names: [f.driverOfDay.name], value: `+${fmtNum(f.driverOfDay.over, 1)} Plätze über Erwartung` } : null,
    !has('pole') && quali?.ranking[0] ? { key: 'pole', icon: <PoleFlag size={24} />, label: 'Pole', names: [quali.ranking[0].name], value: 'Schnellster im Qualifying' } : null,
    gained && { key: 'gain', icon: <Rocket size={24} />, label: 'Überholkönig', names: [gained.name], value: `+${gained.places} Plätze ab Runde 1` },
    consistent && { key: 'const', icon: <FormCurve size={24} />, label: 'Der Konstante', names: [consistent.name], value: `± ${fmtSec(consistent.spreadMs, 2)} je Runde` },
    lapsKing && { key: 'laps', icon: <StrokeIcon d={PATHS.road} size={22} color="#86a9c8" />, label: 'Kilometerfresser', names: [lapsKing.name], value: `${lapsKing.laps} Runden` },
    !has('clean') && f.clean.length > 0 ? { key: 'clean', icon: <Shield size={24} />, label: 'Ohne Abflug', names: f.clean, value: 'in allen Rennen' } : null,
  ]
  const noPoints = honors.filter((x): x is AwardDef => !!x)
  const awardCard: CardDef | null =
    withPoints.length || noPoints.length
      ? {
          key: 'auszeichnungen',
          kicker: 'Ausgezeichnet',
          icon: NAV_ICONS.season,
          body: (
            <>
              <Hint>Karten antippen zum Aufdecken</Hint>
              {withPoints.length > 0 && (
                <Part label="Mit Punkten · zählen in der Wertung">
                  <div className="award-grid">
                    {withPoints.map((a, i) => (
                      <AwardCard key={a.key} a={a} me={me} delay={i * 700} />
                    ))}
                  </div>
                </Part>
              )}
              {noPoints.length > 0 && (
                <Part label="Ehrentitel · ohne Punkte">
                  <div className="award-grid">
                    {noPoints.map((a, i) => (
                      <AwardCard key={a.key} a={a} me={me} delay={(withPoints.length + i) * 700} />
                    ))}
                  </div>
                </Part>
              )}
            </>
          ),
        }
      : null

  // ---- In Zahlen ----
  const distance = nums.km != null ? funDistance(nums.km, pick) : null
  const driveFun = more.driveMs != null ? driveTimeFun(more.driveMs) : null
  const tiles: { value: number; label: string; icon: string; format?: (v: number) => string; sub?: string; color?: string }[] = [
    { value: nums.heats, label: 'Läufe', icon: NAV_ICONS.races },
    { value: nums.laps, label: 'Runden', icon: PATHS.track },
    ...(nums.km != null ? [{ value: Math.round(nums.km * 10) / 10, label: 'Kilometer', icon: PATHS.road, format: (v: number) => fmtNum(v, 1), sub: distance ?? undefined }] : []),
    ...(more.driveMs != null ? [{ value: more.driveMs / 60_000, label: 'Fahrzeit', icon: PATHS.clock, format: fmtMinutes, sub: driveFun ?? undefined }] : []),
    { value: nums.crashes, label: 'Abflüge', icon: CRASH, color: 'var(--crash)' },
    ...(more.pitStops > 0 ? [{ value: more.pitStops, label: 'Boxenstopps', icon: FUEL }] : []),
    { value: nums.drivers, label: 'Fahrer', icon: NAV_ICONS.drivers },
    ...(more.cars > 0 ? [{ value: more.cars, label: more.cars === 1 ? 'Auto' : 'Autos', icon: NAV_ICONS.cars }] : []),
  ]
  const numbersCard: CardDef = {
    key: 'zahlen',
    kicker: done ? 'In Zahlen' : 'In Zahlen · bisher',
    icon: PATHS.track,
    body: (
      <Staged style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tiles.map((t, i) => (
          <Item key={t.label} delay={i * 120} style={tiles.length % 2 && i === tiles.length - 1 ? { gridColumn: 'span 2' } : undefined}>
            <StatTile value={t.value} label={t.label} icon={t.icon} format={t.format} sub={t.sub} color={t.color} style={{ height: '100%' }} />
          </Item>
        ))}
      </Staged>
    ),
  }

  // ---- Schluss: Schlagzeile und Zusammenfassung ----
  const head = headline(state, steps, f, mine ? me : null, done)
  const tips = me && mine ? driverInsight(state, me).tips.slice(0, 1) : []
  const share = async () => {
    const text = `${def.name}: ${head.title}`
    try {
      if (navigator.share) await navigator.share({ title: def.name, text, url: location.href })
      else await navigator.clipboard.writeText(`${text} – ${location.href}`)
    } catch {
      // Teilen abgebrochen
    }
  }
  const endCard: CardDef = {
    key: 'ende',
    kicker: done ? `Das war ${def.name}` : 'Fortsetzung folgt',
    icon: SPARK,
    confetti: done,
    body: (
      <>
        <Staged style={{ gap: 14 }}>
          <Item>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: mine ? ME : 'var(--muted)' }}>{mine ? (done ? 'Dein Wettkampf in Kürze' : 'Du bisher') : done ? 'Die Schlagzeile' : 'Bisher'}</span>
          </Item>
          <Item delay={150}>
            <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.12 }}>{head.title}</span>
          </Item>
          {head.chips.length > 0 && (
            <Item delay={400}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {head.chips.map((c) => (
                  <span key={c} className="rule-chip" style={{ fontWeight: 700 }}>
                    {c}
                  </span>
                ))}
              </div>
            </Item>
          )}
          {tips.length > 0 && (
            <Item delay={650}>
              <Part label="Für das nächste Mal">
                <span style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.45 }}>{tips[0]}</span>
              </Part>
            </Item>
          )}
        </Staged>
        <Group gap={12}>
          <Line>{done ? 'Danke fürs Mitfahren!' : 'Noch ist nichts entschieden.'}</Line>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn round" onClick={() => void share()} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ShareIcon /> Teilen
            </button>
            <button className="btn round" onClick={onDone} style={{ flex: 1, background: '#F2F4F5', color: '#14181D', border: 'none', fontWeight: 700 }}>
              Zum Wettkampf
            </button>
          </div>
        </Group>
      </>
    ),
  }

  // Fertig: Spannung bis zum Schluss – Höhepunkte, dann das Rennen um die Spitze, dann die Sieger.
  // Läuft noch: der Stand gleich vorn.
  const highlights = [quiz, raceCard, closeCard, jumpCard, fastCard, crashCard, overCard]
  const podium = [singleCard, teamCard]
  const personal = [myCard, rivalCard]
  const order = done ? [intro, ...highlights, leadCard, ...podium, ...personal, awardCard, numbersCard, endCard] : [intro, ...podium, ...personal, leadCard, ...highlights, awardCard, numbersCard, endCard]
  return order.filter((c): c is CardDef => !!c)
}

/** Rückblick auf einen Wettkampf im Story-Format */
export function EventRecap() {
  const { id = '' } = useParams()
  const data = useData()
  const navigate = useNavigate()
  const folder = data.events.find((e) => e.id === id)
  const state = useEventState(folder)
  const steps = useEventHistory(folder)
  const { me: picked } = useMe()
  const known = useMyName()
  const me = picked && state?.drivers.includes(picked) ? picked : known
  const back = () => navigate(`/wettkampf/${id}`, { replace: true })
  // bei jedem Öffnen ein anderer Vergleich für die gefahrene Strecke
  const [pick] = useState(Math.random)
  if (!folder || !state || !state.started) {
    return (
      <div className="page">
        <p className="muted">Für diesen Wettkampf gibt es noch keinen Rückblick.</p>
      </div>
    )
  }
  return <StoryPager cards={eventCards(state, steps, me, finishedOf(state.def, state), back, pick)} label={`Rückblick ${state.def.name}`} onDone={back} doneLabel="Zum Wettkampf" />
}
