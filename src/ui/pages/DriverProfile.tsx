import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CAREER_XP, PLACEMENT_RUNS, type Medal } from '../../domain/model'
import { AREA } from '../colors'
import { Avatar, carPath, driverPath, PeriodTabs, Segment, Sheet, Tile, useData, useMyName } from '../components'
import { CarThumb } from '../CarPhoto'
import { LineChart, type LinePoint } from '../charts/LineChart'
import { TimeTrendChart } from '../charts/TimeTrendChart'
import { ShareIcon, StatusIcons } from '../icons'
import { TipCarousel } from '../TipCarousel'
import { MedalBadge, TIERS } from '../Medal'
import { fmtDelta, fmtElo, fmtGapSec, fmtNum, fmtPct, formatDate, formatMonth, formatTime } from '../format'
import { quantile } from '../../domain/laps'

const ACCENT = AREA.drivers

export function DriverProfile({ onClose }: { onClose: () => void }) {
  const { name = '' } = useParams()
  const { model } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const [chart, setChart] = useState<'elo' | 'rank' | 'lap'>('elo')
  const [period, setPeriod] = useState('all')
  const [showOpponents, setShowOpponents] = useState(false)
  const driver = decodeURIComponent(name)
  const d = model.stats('all').drivers.get(driver)
  const history = model.rating.history.get(driver) ?? []
  if (!d || history.length === 0) {
    return (
      <Sheet onClose={onClose} label="Fahrer nicht gefunden">
        <p className="muted">„{driver}“ wurde nicht gefunden. Gäste haben kein Profil.</p>
      </Sheet>
    )
  }
  const rows = model.ranking('all')
  const row = rows.find((r) => r.name === driver)
  const statuses = model.statuses('all').get(driver)
  const medals = model.medals.get(driver) ?? []
  const current = medals.filter((m) => !m.former)
  const rival = model.rival(driver)
  const rivalElo = rival ? model.rating.drivers.get(rival.name) : null
  const placing = model.placement(driver)
  const goals = model.goals(driver)
  const tips = model.tips(driver)
  const fav = d.favoriteCar ? d.cars.get(d.favoriteCar) : null
  const isMe = driver === me
  const driverYears = [...new Set(history.map((e) => e.date.slice(0, 4)))].sort().reverse()

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `${driver} · GR Legends`, url })
      else await navigator.clipboard.writeText(url)
    } catch {
      // abgebrochen
    }
  }
  const compareWith = me && me !== driver ? me : rows.find((r) => r.name !== driver)?.name

  return (
    <Sheet
      onClose={onClose}
      label={`Profil ${driver}`}
      actions={
        <>
          {compareWith && (
            <Link className="btn round" to={`/vergleich?a=${encodeURIComponent(driver)}&b=${encodeURIComponent(compareWith)}`}>
              Vergleichen
            </Link>
          )}
          <button className="btn round" aria-label="Link teilen" onClick={share} style={{ width: 44, padding: 0 }}>
            <ShareIcon />
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar name={driver} size={64} ring={isMe ? ACCENT : '#3A404A'} style={{ background: 'var(--inner)', fontSize: 22, fontWeight: 800, boxShadow: 'var(--sh2)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>{driver}</h1>
            <StatusIcons list={statuses} size={22} animate />
          </div>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            {row ? (
              <>
                Gesamtrang <b style={{ color: ACCENT }}>#{row.rank}</b> von {rows.length}
              </>
            ) : (
              'noch ohne Rang'
            )}
            {isMe && ' · Das bist du'}
          </span>
        </div>
      </div>

      <div className="tiles">
        {placing != null ? <Tile value={`${placing}/${PLACEMENT_RUNS}`} label="Einstufung" color={ACCENT} /> : <Tile value={fmtElo(model.rating.drivers.get(driver))} label="Elo" color={ACCENT} />}
        <Tile value={d.races} label="Rennen" />
        <Tile value={d.wins} label="Siege" />
        <Tile value={fmtPct(d.beatShare)} label="Ø geschlagen" />
      </div>

      <CareerCard driver={driver} />

      {current.length > 0 && (
        <div style={{ display: 'flex', gap: 8 }}>
          {current.slice(0, 2).map((m) => (
            <MedalChip key={m.id} medal={m} />
          ))}
          <Link to={`${driverPath(driver)}/medaillen`} replace className="tile" aria-label="Alle Medaillen anzeigen" style={{ width: 56, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{medals.length > 2 ? `+${medals.length - 2}` : '›'}</span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>alle</span>
          </Link>
        </div>
      )}

      <section className="inner" style={{ padding: '14px 14px 10px', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Entwicklung</span>
          <Segment small label="Diagramm wählen" value={chart} onChange={setChart} options={[['elo', 'Elo'], ['rank', 'Rang'], ['lap', 'Rundenzeiten']]} />
        </div>
        {driverYears.length > 1 && (
          <div style={{ ['--accent' as string]: ACCENT }}>
            <PeriodTabs value={period} onChange={setPeriod} years={driverYears} />
          </div>
        )}
        <DriverChart driver={driver} kind={chart} period={period} />
      </section>

      <div className="grid-2">
        <Link className="inner" to={d.favoriteCar ? carPath(d.favoriteCar) : '#'}>
          <span className="l">Lieblingsauto</span>
          <span className="v" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.favoriteCar ?? '–'}</span>
          {fav && <span className="s">{fav.races} Rennen · Best {formatTime(fav.bestLapMs)}</span>}
        </Link>
        <Link className="inner" to={rival ? `/vergleich?a=${encodeURIComponent(driver)}&b=${encodeURIComponent(rival.name)}` : '#'}>
          <span className="l">Rivale</span>
          <span className="v">{rival?.name ?? '–'}</span>
          {rival && (
            <span className="s">
              {rival.wins} : {rival.losses}
              {rivalElo != null && placing == null && ` · ${rivalText(rivalElo - (model.rating.drivers.get(driver) ?? 0))}`}
            </span>
          )}
        </Link>
        <button className="inner" onClick={() => setShowOpponents(!showOpponents)} aria-expanded={showOpponents} style={{ border: 'none', textAlign: 'left' }}>
          <span className="l">Gegner schon besiegt ›</span>
          <span className="v">
            {d.opponentsBeaten.size} von {d.opponentsMet.size}
          </span>
          <div className="bar" style={{ ['--accent' as string]: ACCENT, width: '100%' }}>
            <div style={{ width: `${d.opponentsMet.size ? (d.opponentsBeaten.size / d.opponentsMet.size) * 100 : 0}%` }} />
          </div>
        </button>
        <div className="inner">
          <span className="l">Gefahren</span>
          <span className="v">{d.km != null ? `${fmtNum(d.km)} km` : '–'}</span>
          <span className="s">{fmtNum(d.laps, 0)} Runden</span>
        </div>
        <div className="inner">
          <span className="l">Pace</span>
          <span className="v">{fmtGapSec(d.paceGap)}</span>
          <span className="s">{d.paceGap != null && d.paceGap < 0 ? 'pro Runde schneller' : 'pro Runde langsamer'} als die typische Bestzeit</span>
        </div>
        <div className="inner">
          <span className="l">Abflüge</span>
          <span className="v">{d.crashRate != null ? `${fmtNum(d.crashRate)} / 100 Runden` : '–'}</span>
          <span className="s">{d.crashRate != null ? `${d.crashes} insgesamt · Ø ${fmtNum(d.crashes ? d.crashLossMs / d.crashes / 1000 : 0)} s Verlust` : 'zu wenige Rennen ohne Tank'}</span>
        </div>
      </div>
      <p style={{ margin: '-4px 2px 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
        <b>Ø geschlagen</b>: Anteil des Feldes, den du im Schnitt hinter dir lässt (Platz 2 von 5 = 75 %). <b>Gegner schon besiegt</b>: wie viele verschiedene Gegner du mindestens einmal geschlagen hast – antippen für die Übersicht.
      </p>

      {showOpponents && (
        <Sheet onClose={() => setShowOpponents(false)} label={`Gegner von ${driver}`}>
          <OpponentList driver={driver} />
        </Sheet>
      )}

      <CarBests driver={driver} />

      {goals.length > 0 && (
        <section className="inner" style={{ gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Nächstes Ziel</span>
          {goals.map((g) => (
            <div key={g.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{g.label}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'right' }}>{g.detail}</span>
              </div>
              <div className="bar" style={{ ['--accent' as string]: ACCENT }}>
                <div style={{ width: `${Math.round(g.progress * 100)}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      <TipCarousel tips={tips} accent={ACCENT} />

      <section className="inner" style={{ gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Letzte Rennen</span>
        {d.raceResults
          .slice(-6)
          .reverse()
          .map(({ session, result }) => (
            <button key={session.fileId} className="row" style={{ border: 'none', background: 'none', textAlign: 'left', padding: '6px 0' }} onClick={() => navigate(`/lauf/${session.fileId}`)}>
              <span className={`rank${result.position <= 3 ? ` r${result.position}` : ''}`} style={{ minWidth: 26 }}>
                P{result.position}
              </span>
              <span className="grow">
                <span className="name" style={{ fontWeight: 500 }}>
                  {formatDate(session.date)} · {session.type} {session.heat}
                </span>
                <span className="sub">
                  {result.car} · {session.results.length} Fahrer
                </span>
              </span>
              <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>
                {formatTime(result.validBestLapMs)}
              </span>
            </button>
          ))}
      </section>
    </Sheet>
  )
}

function rivalText(diff: number) {
  const r = Math.round(diff)
  if (r === 0) return 'gleiche Wertung'
  return r > 0 ? `${r} Elo vor dir` : `${-r} Elo hinter dir`
}

function MedalChip({ medal }: { medal: Medal }) {
  return (
    <div className="tile" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
      <MedalBadge medal={medal} size={34} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{medal.name}</span>
        <span style={{ fontSize: 10, color: TIERS[medal.tier].text }}>
          {TIERS[medal.tier].label} · {medal.title ? 'Titel' : `${['bahnrekord', 'fahrzeugrekord'].includes(medal.kind) ? 'seit ' : ''}${formatMonth(medal.date)}`}
        </span>
      </div>
    </div>
  )
}

function DriverChart({ driver, kind, period }: { driver: string; kind: 'elo' | 'rank' | 'lap'; period: string }) {
  const { model } = useData()
  const inP = (date: string) => period === 'all' || date.startsWith(period)
  const history = (model.rating.history.get(driver) ?? []).filter((e) => inP(e.date))
  if (history.length === 0) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Keine Läufe in diesem Zeitraum.</p>
  if (kind === 'elo') {
    const all = model.rating.history.get(driver) ?? []
    if (all.length < PLACEMENT_RUNS)
      return (
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
          Noch in der Einstufung ({all.length}/{PLACEMENT_RUNS} Läufe). Die ersten Läufe pendeln die Wertung ein – der Elo-Verlauf erscheint danach.
        </p>
      )
    const placingRun = (e: (typeof history)[number]) => all.indexOf(e) < PLACEMENT_RUNS
    const ups = [...history.keys()].filter((i) => !placingRun(history[i]) && history[i].delta > 0).sort((a, b) => history[b].delta - history[a].delta).slice(0, 2)
    const downs = [...history.keys()].filter((i) => !placingRun(history[i]) && history[i].delta < 0).sort((a, b) => history[a].delta - history[b].delta).slice(0, 2)
    const turning = new Set([...ups, ...downs, history.length - 1])
    const points: LinePoint[] = history.map((e, i) => ({
      y: e.after,
      tip: placingRun(e)
        ? { title: `Einstufungslauf ${all.indexOf(e) + 1}/${PLACEMENT_RUNS}`, text: 'Die ersten Läufe pendeln die Wertung ein.', sub: `${formatDate(e.date)} · ${e.type} · ${e.position}. von ${e.field}`, color: '#C5CCD3' }
        : turning.has(i) ? { title: `${fmtDelta(e.delta)} Elo`, text: e.reason, sub: `${formatDate(e.date)} · ${e.type} · ${e.position}. von ${e.field}`, color: e.delta >= 0 ? ACCENT : '#C5CCD3' } : undefined,
    }))
    const mid = Math.floor(history.length / 2)
    return (
      <>
        <LineChart
          points={points}
          color={ACCENT}
          label={`Elo-Verlauf von ${fmtElo(history[0]?.before)} auf ${fmtElo(history[history.length - 1]?.after)} über ${history.length} Läufe`}
          xLabels={history.length > 1 ? [{ index: 0, text: formatDate(history[0].date) }, ...(history.length > 6 ? [{ index: mid, text: formatDate(history[mid].date) }] : []), { index: history.length - 1, text: formatDate(history[history.length - 1].date) }] : []}
        />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Weiße Punkte antippen: Warum ging es hoch oder runter?</span>
      </>
    )
  }
  if (kind === 'rank') {
    const { dates, ranks } = model.rankTimeline()
    const r = ranks.get(driver) ?? []
    const pts = dates.map((dt, i) => ({ dt, y: r[i] })).filter((p): p is { dt: string; y: number } => p.y != null && inP(p.dt))
    if (pts.length < 2) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Noch zu wenige Renntage.</p>
    return (
      <LineChart
        invert
        points={pts.map((p) => ({ y: p.y }))}
        color={ACCENT}
        format={(v) => `${Math.round(v)}.`}
        label={`Rang von ${pts[0].y} auf ${pts[pts.length - 1].y}`}
        xLabels={[{ index: 0, text: formatDate(pts[0].dt) }, { index: pts.length - 1, text: formatDate(pts[pts.length - 1].dt) }]}
      />
    )
  }
  // Rundenzeiten: gleitender Median der letzten Rennen und persönliche Bestzeit
  const WINDOW = 5
  const st = model.stats('all').drivers.get(driver)
  const races = st?.raceResults ?? []
  const normal = races.map(({ result }) => result.lapTimes.filter((l) => l.status === 'normal').map((l) => l.ms))
  const rows = races.map(({ session, result }, i) => {
    const pool = normal.slice(Math.max(0, i - WINDOW + 1), i + 1).flat().sort((a, b) => a - b)
    const pb = Math.min(...races.slice(0, i + 1).map((r) => r.result.validBestLapMs ?? Infinity))
    const enough = pool.length >= 5
    return {
      session, result, pb: isFinite(pb) ? pb : null,
      median: enough ? quantile(pool, 0.5) : null,
      // eigene Spanne: schnellste 10 % bis langsamste 10 % der sauberen Runden
      fast: enough ? quantile(pool, 0.1) : null,
      slow: enough ? quantile(pool, 0.9) : null,
    }
  })
  const shown = rows.filter((r) => inP(r.session.date))
  if (shown.length < 2) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>Noch zu wenige Rennen.</p>
  const s2 = (ms: number | null) => (ms == null ? '–' : (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  return (
    <>
      <TimeTrendChart
        label={`Rundenzeiten: Median der letzten ${WINDOW} Rennen und persönliche Bestzeit`}
        series={[
          { name: 'Median', color: ACCENT, values: shown.map((r) => r.median) },
          { name: 'Bestzeit', color: '#B98CFF', values: shown.map((r) => r.pb), dashed: true, step: true },
        ]}
        band={{ lo: shown.map((r) => r.fast), hi: shown.map((r) => r.slow), color: ACCENT }}
        tips={shown.map((r) => ({
          title: `${formatDate(r.session.date)} · ${r.session.type} ${r.session.heat}`,
          text: (
            <>
              <span style={{ color: ACCENT }}>Median {s2(r.median)} s</span> · <span style={{ color: '#B98CFF' }}>Bestzeit {s2(r.pb)} s</span>
              <br />
              Spanne {s2(r.fast)}–{s2(r.slow)} s
              <br />
              In diesem Rennen: P{r.result.position}, Best {s2(r.result.validBestLapMs)} s
            </>
          ),
          sub: r.result.car,
        }))}
        xLabels={[{ index: 0, text: formatDate(shown[0].session.date) }, { index: shown.length - 1, text: formatDate(shown[shown.length - 1].session.date) }]}
      />
      <div className="legend">
        <span>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: ACCENT }} />
          Median der letzten {WINDOW} Rennen
        </span>
        <span>
          <span style={{ width: 14, height: 0, borderTop: '2px dashed #B98CFF' }} />
          persönliche Bestzeit
        </span>
        <span>
          <span style={{ width: 14, height: 10, borderRadius: 3, background: 'linear-gradient(180deg, rgba(59,188,74,0), rgba(59,188,74,.45), rgba(59,188,74,0))' }} />
          deine Spanne (80 % der Runden)
        </span>
        <span>↑ schneller</span>
      </div>
    </>
  )
}

/** Karriere-Level: Erfahrungspunkte aus allem, was man fährt – sie gehen nie verloren */
function CareerCard({ driver }: { driver: string }) {
  const { model } = useData()
  const [open, setOpen] = useState(false)
  const c = model.career(driver)
  if (!c) return null
  const progress = (c.xp - c.levelXp) / Math.max(1, c.nextXp - c.levelXp)
  return (
    <button className="inner" onClick={() => setOpen(!open)} aria-expanded={open} style={{ border: 'none', textAlign: 'left', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#0E1013', background: 'linear-gradient(145deg, #6BE07A, #3BBC4A 60%, #2A8F37)', boxShadow: 'var(--sh2)' }}
          aria-hidden="true"
        >
          {c.level}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            Level {c.level} · {c.title}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {c.xp.toLocaleString('de-DE')} XP · noch {(c.nextXp - c.xp).toLocaleString('de-DE')} bis Level {c.level + 1}
          </span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? '▴' : '▾'}</span>
      </div>
      <div className="bar" style={{ ['--accent' as string]: ACCENT, width: '100%', height: 7 }}>
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          {c.breakdown
            .filter((b) => b.count > 0)
            .map((b) => (
              <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>
                  {b.count.toLocaleString('de-DE')} {b.label}
                </span>
                <span className="num" style={{ fontWeight: 600 }}>
                  +{b.xp.toLocaleString('de-DE')} XP
                </span>
              </div>
            ))}
          <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45, marginTop: 4 }}>
            Jedes Mitfahren bringt Erfahrung: Rennen {CAREER_XP.race}, Renntag {CAREER_XP.raceDay}, Qualifying {CAREER_XP.quali}, Sieg +{CAREER_XP.win}, Podium +{CAREER_XP.podium}, je km {CAREER_XP.km}, neue Bestzeit {CAREER_XP.personalBest}. Punkte gehen nie verloren.
          </span>
        </div>
      )}
    </button>
  )
}

/** Wen man schon geschlagen hat und wen noch nicht (Rennen, direkte Duelle) */
function OpponentList({ driver }: { driver: string }) {
  const { model } = useData()
  const navigate = useNavigate()
  const d = model.stats('all').drivers.get(driver)
  if (!d) return null
  const list = [...d.h2h].map(([name, [w, l]]) => ({ name, w, l }))
  const open = list.filter((o) => o.w === 0).sort((a, b) => b.l - a.l)
  const done = list.filter((o) => o.w > 0).sort((a, b) => b.w - b.l - (a.w - a.l) || b.w - a.w)
  const row = (o: { name: string; w: number; l: number }) => (
    <button
      key={o.name}
      className="row"
      onClick={() => navigate(`/vergleich?a=${encodeURIComponent(driver)}&b=${encodeURIComponent(o.name)}`)}
      style={{ border: 'none', background: 'none', textAlign: 'left', padding: '5px 0', minHeight: 40 }}
    >
      <Avatar name={o.name} size={28} />
      <span className="grow">
        <span className="name" style={{ fontWeight: 500 }}>{o.name}</span>
      </span>
      <span className="num" style={{ fontSize: 13, fontWeight: 700, color: o.w > o.l ? '#7BDB8A' : o.w === 0 ? 'var(--muted)' : 'var(--text-2)' }}>
        {o.w} : {o.l}
      </span>
    </button>
  )
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Gegner von {driver}</h1>
      <span style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Siege : Niederlagen in gemeinsamen Rennen · antippen zum Vergleichen</span>
      {open.length > 0 && (
        <>
          <span className="kicker" style={{ fontSize: 11, marginTop: 4 }}>Noch nie geschlagen ({open.length})</span>
          {open.map(row)}
        </>
      )}
      {done.length > 0 && (
        <>
          <span className="kicker" style={{ fontSize: 11, marginTop: 8 }}>Schon geschlagen ({done.length})</span>
          {done.map(row)}
        </>
      )}
    </section>
  )
}

/** Autos, mit denen man gefahren ist – nach Bestzeit */
function CarBests({ driver }: { driver: string }) {
  const { model } = useData()
  const d = model.stats('all').drivers.get(driver)
  if (!d || d.cars.size === 0) return null
  const cars = [...d.cars].filter(([, u]) => u.bestLapMs != null).sort((a, b) => a[1].bestLapMs! - b[1].bestLapMs!)
  return (
    <section className="inner" style={{ gap: 2 }}>
      <div className="card-head" style={{ marginBottom: 4 }}>
        <span className="card-title">Autos & Bestzeiten</span>
        <span className="hint">Best · Ø saubere Runde</span>
      </div>
      {cars.map(([car, u], i) => {
        const avg = u.normal.length ? quantile([...u.normal].sort((a, b) => a - b), 0.5) : null
        return (
          <Link key={car} to={carPath(car)} className="row" style={{ padding: '5px 0' }}>
            <CarThumb car={car} size={36} />
            <span className="grow">
              <span className="name">{car}</span>
              <span className="sub">
                {u.races} Rennen{u.wins ? ` · ${u.wins} ${u.wins === 1 ? 'Sieg' : 'Siege'}` : ''}
              </span>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span className="num" style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? 'var(--best)' : undefined }}>{formatTime(u.bestLapMs)}</span>
              <span className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>{avg ? (avg / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'}</span>
            </span>
          </Link>
        )
      })}
    </section>
  )
}

/** Alle Medaillen eines Fahrers */
export function MedalsSheet({ onClose }: { onClose: () => void }) {
  const { name = '' } = useParams()
  const { model } = useData()
  const driver = decodeURIComponent(name)
  const medals = model.medals.get(driver) ?? []
  const current = medals.filter((m) => !m.former)
  const former = medals.filter((m) => m.former)
  return (
    <Sheet
      onClose={onClose}
      label={`Medaillen von ${driver}`}
      actions={
        <Link className="btn round" to={driverPath(driver)} replace>
          Zum Profil
        </Link>
      }
    >
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Alle Medaillen</h1>
      <span style={{ color: 'var(--muted)', fontSize: 14, marginTop: -8 }}>
        {driver} · {current.length} aktuell{former.length ? ` · ${former.length} ehemalig` : ''}
      </span>
      <div className="row-list" style={{ gap: 8 }}>
        {current.map((m) => (
          <MedalRow key={m.id} medal={m} />
        ))}
      </div>
      {former.length > 0 && (
        <>
          <span className="kicker" style={{ marginTop: 8 }}>
            Ehemalige Titel
          </span>
          <div className="row-list" style={{ gap: 8 }}>
            {former.map((m) => (
              <MedalRow key={m.id} medal={m} />
            ))}
          </div>
        </>
      )}
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        Je seltener, desto edler: Bronze, Silber, Gold, Platin, Diamant. Rekorde und Titel wandern – wer sie verliert, behält eine gedämpfte „Ehemals“-Version.
      </p>
    </Sheet>
  )
}

function MedalRow({ medal }: { medal: Medal }) {
  const t = TIERS[medal.tier]
  return (
    <div className="inner" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <MedalBadge medal={medal} size={46} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{medal.former ? `Ehemals: ${medal.name}` : medal.name}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{medal.description}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: medal.former ? 'var(--muted)' : t.text }}>{t.label}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{medal.former ? `${formatMonth(medal.former.from)} – ${formatMonth(medal.former.to)}` : medal.title ? 'aktueller Titel' : formatDate(medal.date)}</span>
      </div>
    </div>
  )
}
