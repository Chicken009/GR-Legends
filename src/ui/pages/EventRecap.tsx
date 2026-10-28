import { useNavigate, useParams } from 'react-router-dom'
import type { EventState } from '../../domain/event/engine'
import { driverInsight } from '../../domain/event/insights'
import { eventKind, eventNumbers, myRecap, recapFacts, stages, type ProgressStep } from '../../domain/event/progress'
import { BumpChart } from '../charts/StatsCharts'
import { ME, seriesColors } from '../colors'
import { Avatar, useData, useMyName } from '../components'
import { formatTime } from '../format'
import { NAV_ICONS, PATHS, ShareIcon } from '../icons'
import { useMe } from '../me'
import { CarHero, Group, Huge, Line, StatTile, StoryPager, type CardDef } from '../story'
import { EVENT_ACCENT, finishedOf, fmtPts, Podium, teamColor, TeamPodium, useEventHistory, useEventState } from '../event/shared'

const fmtSec = (ms: number) => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} s`
const ROCKET = 'M12 2c3 2 5 6 5 10l-2 4H9l-2-4c0-4 2-8 5-10zM9 16l-3 3M15 16l3 3M12 9.5a1.5 1.5 0 1 0 0 .01'
const SWORDS = 'M4 4l10 10M20 4L10 14M4 20l4-4M20 20l-4-4M13 17l4-4M11 17l-4-4'
const BOLT = 'M13 2L4 14h7l-1 8 9-12h-7z'

/** Platz-Kette „5 › 5 › 3“, Verbesserungen grün, Platz 1 gold */
function RankPath({ ranks }: { ranks: number[] }) {
  return (
    <span className="num" style={{ fontSize: 26, fontWeight: 800, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px' }}>
      {ranks.map((r, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <span style={{ color: 'var(--faint)', fontSize: 18 }}>›</span>}
          <span style={{ color: r === 1 ? 'var(--gold)' : r < ranks[i - 1] ? ME : undefined }}>{r}</span>
        </span>
      ))}
    </span>
  )
}

/** Story-Karten zu einem Wettkampf; läuft er noch, heißt es „bisher“ */
export function eventCards(state: EventState, steps: ProgressStep[], me: string | null, done: boolean, onDone: () => void): CardDef[] {
  const def = state.def
  const f = recapFacts(state, steps)
  const nums = eventNumbers(state)
  const cards: CardDef[] = []
  // Siegerkarte(n) je nach Art: Einzel = Fahrerpodest, Team = Teampodest mit allen Mitgliedern, gemischt = beide
  const kind = eventKind(state)
  const teamsScored = state.teamStandings.some((t) => t.points !== 0)
  if (kind !== 'single' && teamsScored) {
    const winner = state.teamStandings[0]
    cards.push({
      key: 'teamsieger',
      kicker: `${def.name}${done ? '' : ' · bisher'} · Teams`,
      icon: NAV_ICONS.events,
      confetti: done,
      body: (
        <>
          <Group gap={4}>
            <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, color: teamColor(winner.id, winner.name) }}>{winner.name}</span>
            <Line>{done ? 'gewinnt die Teamwertung' : 'führt die Teamwertung'}</Line>
          </Group>
          <TeamPodium state={state} me={me} />
        </>
      ),
    })
  }
  if (kind !== 'team') {
    cards.push({
      key: 'sieger',
      kicker: `${def.name}${done ? '' : ' · bisher'}${kind === 'mixed' ? ' · Einzel' : ''}`,
      icon: NAV_ICONS.events,
      confetti: done && kind === 'single',
      body: (
        <>
          <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{done ? 'Die Sieger' : 'Der Stand'}</span>
          <Podium state={state} />
        </>
      ),
    })
  }

  const mine = me ? state.standings.find((s) => s.name === me) : null
  if (me && mine) {
    const r = myRecap(state, steps, me)
    const ranks = r.ranks.filter((x): x is number => x != null)
    const tips = driverInsight(state, me).tips.slice(0, 2)
    cards.push({
      key: 'du',
      kicker: done ? 'Dein Wettkampf' : 'Dein Wettkampf bisher',
      icon: PATHS.track,
      body: (
        <>
          <Group>
            <Huge color={ME}>{mine.rank}.</Huge>
            <Line>
              von {state.standings.length} · {fmtPts(mine.total)} Pkt. · {mine.wins} {mine.wins === 1 ? 'Sieg' : 'Siege'}
            </Line>
          </Group>
          {ranks.length > 1 && (
            <Group>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Dein Platz nach jedem Lauf</span>
              <RankPath ranks={ranks} />
            </Group>
          )}
          {r.best && (
            <Line>
              Bester Lauf: <b>{r.best.heat.label}</b>, Platz {r.best.place} von {r.best.of}
            </Line>
          )}
          {tips.length > 0 && (
            <Group gap={4}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Für das nächste Mal</span>
              {tips.map((t) => (
                <span key={t} style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.45 }}>
                  {t}
                </span>
              ))}
            </Group>
          )}
        </>
      ),
    })
  }

  if (f.leaders.length >= 3) {
    const names = state.standings.map((s) => s.name)
    // Viele Läufe: Platz nach jeder Etappe statt nach jedem Lauf
    const st = stages(state, steps).slice(1)
    const path = st.length >= 2 && steps.length > 8 ? st : steps.slice(1).map((s, i) => ({ ...s, short: String(i + 1) }))
    cards.push({
      key: 'spitze',
      kicker: 'Das Rennen um die Spitze',
      icon: PATHS.track,
      body: (
        <>
          <Group>
            <Huge color={EVENT_ACCENT}>{f.wireToWire ? 'Start-Ziel' : `${f.leadChanges}×`}</Huge>
            <Line>
              {f.wireToWire ? (
                <>
                  <b>{f.wireToWire}</b> lag nach jedem Lauf vorn.
                </>
              ) : (
                <>
                  {f.leadChanges === 1 ? 'Führungswechsel' : 'wechselte die Führung'}
                  {f.turn && (
                    <>
                      {' '}– seit {f.turn.label} vorn: <b>{f.turn.name}</b>
                    </>
                  )}
                </>
              )}
            </Line>
          </Group>
          <BumpChart
            dates={path.map((s, i) => s.heatId ?? String(i))}
            axis={path.map((s) => s.short)}
            series={names.map((n) => ({ name: n, ranks: path.map((s) => s.ranks.get(n) ?? null) }))}
            colors={seriesColors(names, me)}
            me={me}
          />
        </>
      ),
    })
  }

  if (f.jump || f.comeback) {
    const j = f.jump
    cards.push({
      key: 'sprung',
      kicker: j ? 'Größter Sprung' : 'Aufholjagd',
      icon: ROCKET,
      body: (
        <>
          {j ? (
            <Group>
              <Huge color={ME}>+{j.from - j.to}</Huge>
              <Line>
                Plätze für <b>{j.name}</b> in {j.label} – von {j.from} auf {j.to}
              </Line>
            </Group>
          ) : (
            <Group>
              <Huge color={ME}>+{f.comeback!.worst - f.comeback!.final}</Huge>
              <Line>
                Plätze für <b>{f.comeback!.name}</b> – nach {f.comeback!.label} noch auf {f.comeback!.worst}, jetzt {f.comeback!.final}.
              </Line>
            </Group>
          )}
          {j && f.comeback && (
            <Line>
              Aufholjagd: <b>{f.comeback.name}</b> von Platz {f.comeback.worst} auf {f.comeback.final}
            </Line>
          )}
        </>
      ),
    })
  }

  if (f.closest) {
    const c = f.closest
    cards.push({
      key: 'knapp',
      kicker: 'Knappste Entscheidung',
      icon: SWORDS,
      body: (
        <>
          <Group>
            <Huge>{fmtSec(c.ms)}</Huge>
            <Line>
              <b>{c.heat.order[0]}</b> kam {fmtSec(c.ms)} vor <b>{c.heat.order[1]}</b> ins Ziel – {c.heat.label}.
            </Line>
          </Group>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name={c.heat.order[0]} size={56} ring="var(--gold)" />
              <b style={{ fontSize: 13 }}>{c.heat.order[0]}</b>
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>vor</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Avatar name={c.heat.order[1]} size={56} />
              <b style={{ fontSize: 13 }}>{c.heat.order[1]}</b>
            </span>
          </div>
        </>
      ),
    })
  }

  if (state.fastestLap) {
    const fl = state.fastestLap
    cards.push({
      key: 'schnellste',
      kicker: 'Schnellste Runde',
      icon: BOLT,
      body: (
        <>
          {fl.car && <CarHero car={fl.car} />}
          <Group>
            <Huge color="var(--best)">{formatTime(fl.ms)}</Huge>
            <Line>
              <b>{fl.name}</b>
              {fl.car ? ` im ${fl.car}` : ''}
            </Line>
          </Group>
        </>
      ),
    })
  }

  const awards = [
    f.driverOfDay && { label: 'Fahrer des Tages', names: [f.driverOfDay.name], value: `+${fmtPts(Math.round(f.driverOfDay.over * 10) / 10)} Plätze` },
    f.mostWins && { label: 'Meiste Siege', names: [f.mostWins.name], value: `${f.mostWins.wins} Siege` },
    f.personalBests.length > 0 && { label: 'Neue Bestzeit', names: f.personalBests, value: 'PB' },
    f.clean.length > 0 && { label: 'Ohne Abflug', names: f.clean, value: '✓' },
  ].filter((x): x is { label: string; names: string[]; value: string } => !!x)
  if (awards.length) {
    cards.push({
      key: 'auszeichnungen',
      kicker: 'Ausgezeichnet',
      icon: NAV_ICONS.season,
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {awards.map((a) => {
            const mine = !!me && a.names.includes(me)
            return (
              <div key={a.label} className={`row${mine ? ' me-row' : ''}`} style={{ background: mine ? undefined : 'rgba(255,255,255,0.05)' }}>
                <span style={{ display: 'flex' }}>
                  {a.names.map((n, i) => (
                    <span key={n} style={{ marginLeft: i ? -10 : 0 }}>
                      <Avatar name={n} ring={n === me ? 'var(--me)' : undefined} />
                    </span>
                  ))}
                </span>
                <span className="grow">
                  <span className="sub">{a.label}</span>
                  <span className="name" style={{ whiteSpace: 'normal' }}>
                    {a.names.map((n, i) => (
                      <span key={n}>
                        {i > 0 && ', '}
                        <span style={n === me ? { color: 'var(--me)' } : undefined}>{n === me ? 'Du' : n}</span>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="num" style={{ fontWeight: 800, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                  {a.value}
                </span>
              </div>
            )
          })}
        </div>
      ),
    })
  }

  cards.push({
    key: 'zahlen',
    kicker: done ? 'In Zahlen' : 'In Zahlen · bisher',
    icon: PATHS.track,
    body: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatTile value={nums.heats} label="Läufe" />
        <StatTile value={nums.laps} label="Runden" />
        <StatTile value={nums.crashes} label="Abflüge" />
        <StatTile value={nums.drivers} label="Fahrer" />
      </div>
    ),
  })

  const share = async () => {
    const text = `${def.name}: ${state.standings[0]?.name ?? ''} ${done ? 'gewinnt' : 'führt'}`
    try {
      if (navigator.share) await navigator.share({ title: def.name, text, url: location.href })
      else await navigator.clipboard.writeText(`${text} – ${location.href}`)
    } catch {
      // Teilen abgebrochen
    }
  }
  cards.push({
    key: 'ende',
    kicker: done ? `Das war ${def.name}` : 'Fortsetzung folgt',
    icon: PATHS.track,
    confetti: done,
    body: (
      <>
        <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>{done ? 'Danke fürs Mitfahren!' : 'Noch ist nichts entschieden.'}</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn round" onClick={() => void share()} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ShareIcon /> Teilen
          </button>
          <button className="btn round" onClick={onDone} style={{ flex: 1, background: '#F2F4F5', color: '#14181D', border: 'none', fontWeight: 700 }}>
            Zum Wettkampf
          </button>
        </div>
      </>
    ),
  })
  return cards
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
  if (!folder || !state || !state.started) {
    return (
      <div className="page">
        <p className="muted">Für diesen Wettkampf gibt es noch keinen Rückblick.</p>
      </div>
    )
  }
  return <StoryPager cards={eventCards(state, steps, me, finishedOf(state.def, state), back)} label={`Rückblick ${state.def.name}`} onDone={back} doneLabel="Zum Wettkampf" />
}
