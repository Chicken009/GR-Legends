import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PLACEMENT_RUNS, type RankRow } from '../../domain/model'
import { RATING } from '../../domain/rating'
import { SEASON_POINTS } from '../../domain/season'
import { AREA } from '../colors'
import { FieldSwitch } from '../FieldSwitch'
import { Avatar, DriverSettingsHint, driverPath, PageHead, PeriodTabs, Placement, Rank, SettingsProblem, useData, useMyName, ViewToggle } from '../components'
import { DataTable, type Column } from '../DataTable'
import { StatusIcons } from '../icons'
import { fmtElo, fmtGapSec, fmtNum, fmtPct, formatDate, formatTime } from '../format'
import { useStored } from '../useStored'
import { Amount } from '../currency'

export function Drivers() {
  const { model, unmatched, newcomers } = useData()
  const me = useMyName()
  const location = useLocation()
  const navigate = useNavigate()
  const [period, setPeriod] = useStored('drivers:period', 'all')
  const [view, setView] = useStored<'table' | 'cards'>('drivers:view2', 'table')
  const [minRaces, setMinRaces] = useStored('drivers:min3', true)
  const p = period === 'all' || model.years.includes(period) ? period : 'all'
  const stats = model.stats(p).drivers
  const statuses = model.statuses(p)
  const all = model.ranking(p).filter((r) => !minRaces || r.races >= 3 || r.name === me)
  const open = (name: string) => navigate(driverPath(name), { state: { bg: location } })
  const d = (r: RankRow) => stats.get(r.name)
  const seasonRows = p !== 'all' ? model.season(p) : []
  const seasonPoints = new Map(seasonRows.map((r) => [r.name, r.points]))
  // Gesamt: nach Elo. Jahr: nach Saisonwertung (Punkte)
  const seasonOrder = new Map(seasonRows.map((r, i) => [r.name, i]))
  const seasonRank = new Map(seasonRows.map((r) => [r.name, r.rank]))
  const rows = p === 'all' ? all : [...all].sort((a, b) => (seasonOrder.get(a.name) ?? 999) - (seasonOrder.get(b.name) ?? 999))
  const rankOf = (r: RankRow) => (p === 'all' ? (r.placing || r.inactive ? null : r.rank) : (seasonRank.get(r.name) ?? null))
  const medalCount = (name: string) => (model.medals.get(name) ?? []).filter((m) => !m.former).length
  const columns: Column<RankRow>[] = [
    {
      key: 'name', label: 'Fahrer', left: true, value: (r) => r.name,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 600 }}>
          {r.name}
          <StatusIcons list={statuses.get(r.name)} />
          {r.inactive && <Inactive />}
        </span>
      ),
    },
    { key: 'elo', label: 'Elo', strong: true, value: (r) => r.elo, render: (r) => { const n = model.placement(r.name); return n != null ? <Placement n={n} driver={r.name} /> : fmtElo(r.elo) } },
    { key: 'level', label: 'Level', title: 'Karriere-Level aus Erfahrungspunkten (steigt mit jedem Rennen)', value: (r) => model.career(r.name)?.xp ?? 0, render: (r) => { const c = model.career(r.name); return c ? `${c.level} · ${c.title}` : '–' } },
    ...(p !== 'all'
      ? [
          {
            key: 'season', label: `Saison ${p}`, title: 'Punkte der Saisonwertung (beste Renntage)', strong: true,
            value: (r: RankRow) => seasonPoints.get(r.name) ?? null,
            render: (r: RankRow) => (seasonPoints.has(r.name) ? `${seasonPoints.get(r.name)} P` : '–'),
          } satisfies Column<RankRow>,
        ]
      : []),
    { key: 'trend', label: 'Trend', title: 'Plätze gewonnen oder verloren im Zeitraum', value: (r) => (r.rankStart != null ? r.rankStart - r.rank : null), render: (r) => <Trend row={r} /> },
    { key: 'races', label: 'Rennen', value: (r) => d(r)?.races ?? 0 },
    { key: 'wins', label: 'Siege', value: (r) => d(r)?.wins ?? 0 },
    { key: 'winRate', label: 'Siegquote', value: (r) => (d(r)?.races ? d(r)!.wins / d(r)!.races : null), render: (r) => fmtPct(d(r)?.races ? d(r)!.wins / d(r)!.races : null) },
    { key: 'podiums', label: 'Podien', value: (r) => d(r)?.podiums ?? 0 },
    { key: 'avgPos', label: 'Ø Platz', asc: true, value: (r) => d(r)?.avgPosition ?? null, render: (r) => fmtNum(d(r)?.avgPosition) },
    {
      key: 'beat', label: 'Ø geschlagen', title: 'Anteil des Feldes, den man im Schnitt hinter sich lässt (Platz 2 von 5 = 75 %)', value: (r) => d(r)?.beatShare ?? null,
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <span className="bar" style={{ width: 48, height: 5 }}>
            <span style={{ width: `${(d(r)?.beatShare ?? 0) * 100}%`, borderRadius: 3, background: 'var(--accent)' }} />
          </span>
          <span style={{ minWidth: 36 }}>{fmtPct(d(r)?.beatShare)}</span>
        </span>
      ),
    },
    { key: 'opp', label: 'Schon besiegt', title: 'Verschiedene Gegner, die man mindestens einmal geschlagen hat / gegen die man gefahren ist', value: (r) => d(r)?.opponentsBeaten.size ?? 0, render: (r) => `${d(r)?.opponentsBeaten.size ?? 0} / ${d(r)?.opponentsMet.size ?? 0}` },
    { key: 'streak', label: 'Serie', title: 'Längste Siegesserie', value: (r) => d(r)?.maxStreak ?? 0 },
    { key: 'qualis', label: 'Qualis', value: (r) => d(r)?.qualis ?? 0 },
    { key: 'poles', label: 'Pole', title: 'Schnellster im Qualifying', value: (r) => d(r)?.poles ?? 0 },
    { key: 'best', label: 'Bestzeit', asc: true, value: (r) => d(r)?.bestLapMs ?? null, render: (r) => formatTime(d(r)?.bestLapMs) },
    { key: 'pace', label: 'Pace', title: 'Abstand der Ø sauberen Runde zur typischen Bestzeit der Strecke (schnellste 10 % aller Runden); kleiner = schneller', asc: true, value: (r) => d(r)?.paceGap ?? null, render: (r) => fmtGapSec(d(r)?.paceGap) },
    { key: 'precision', label: 'Streuung', title: 'Schwankung sauberer Runden (kleiner = präziser)', asc: true, value: (r) => d(r)?.precision ?? null, render: (r) => fmtPct(d(r)?.precision, 1) },
    { key: 'crash', label: 'Abflüge/100', title: 'Abflüge pro 100 Runden, nur Rennen ohne Tankfunktion', asc: true, value: (r) => d(r)?.crashRate ?? null, render: (r) => fmtNum(d(r)?.crashRate) },
    { key: 'loss', label: 'Ø Verlust', title: 'Ø Zeitverlust pro Abflug', asc: true, value: (r) => (d(r)?.crashes ? d(r)!.crashLossMs / d(r)!.crashes : null), render: (r) => (d(r)?.crashes ? `${fmtNum(d(r)!.crashLossMs / d(r)!.crashes / 1000)} s` : '–') },
    { key: 'days', label: 'Renntage', value: (r) => d(r)?.raceDays.size ?? 0 },
    { key: 'laps', label: 'Runden', value: (r) => d(r)?.laps ?? 0, render: (r) => fmtNum(d(r)?.laps ?? 0, 0) },
    { key: 'km', label: 'km', value: (r) => d(r)?.km ?? null, render: (r) => fmtNum(d(r)?.km) },
    { key: 'medals', label: 'Medaillen', value: (r) => medalCount(r.name) },
    { key: 'fav', label: 'Lieblingsauto', left: true, value: (r) => d(r)?.favoriteCar ?? null },
  ]

  return (
    <div className="page" style={{ ['--accent' as string]: AREA.drivers }}>
      <PageHead title="Fahrer" kicker="Rangliste" color={AREA.drivers}>
        <ViewToggle value={view} onChange={setView} />
      </PageHead>
      <FieldSwitch value="fahrer" />
      <div className="filters">
        <PeriodTabs value={p} onChange={setPeriod} years={model.years} />
        <label className="check">
          <input type="checkbox" checked={minRaces} onChange={(e) => setMinRaces(e.target.checked)} />
          ab 3 Rennen
        </label>
        {p !== 'all' && (
          <Link to={`/saison/${p}`} className="pill" style={{ marginLeft: 'auto' }}>
            Saison {p} ›
          </Link>
        )}
      </div>

      {rows.length === 0 && <p className="muted">Keine Fahrer in diesem Zeitraum.</p>}

      {view === 'table' ? (
        <DataTable
          label="Fahrer-Rangliste"
          rows={rows}
          columns={columns}
          rank={rankOf}
          picture={(r) => <Avatar name={r.name} ring={r.name === me ? 'var(--me)' : undefined} />}
          rowKey={(r) => r.name}
          onRowClick={(r) => open(r.name)}
          highlight={(r) => r.name === me}
        />
      ) : (
        <div className="card-grid">
          {rows.map((r) => {
            const d = stats.get(r.name)
            const isMe = r.name === me
            return (
              <Link key={r.name} to={driverPath(r.name)} state={{ bg: location }} className={`dcard${isMe ? ' me' : ''}`} aria-label={`Profil ${r.name}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                    {rankOf(r) != null ? <Rank rank={rankOf(r)!} size={30} /> : <span className="rank" style={{ fontSize: 30 }}>–</span>}
                    <span style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--muted)', marginTop: 4 }}>{p === 'all' ? 'RANG' : 'SAISON'}</span>
                  </div>
                  <Avatar name={r.name} size={52} style={isMe ? { background: 'rgba(0,0,0,.28)' } : undefined} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  {r.inactive && <Inactive />}
                  <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d?.favoriteCar ?? '–'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {model.placement(r.name) != null ? (
                    <Placement n={model.placement(r.name)!} driver={r.name} size={14} />
                  ) : (
                    <>
                      <Amount kind="elo" value={r.elo} size={24} plain />
                    </>
                  )}
                  <span style={{ marginLeft: 'auto' }}>
                    <StatusIcons list={statuses.get(r.name)} size={16} max={2} />
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, borderTop: `1px solid ${isMe ? 'rgba(255,255,255,.12)' : '#262B33'}`, paddingTop: 8 }}>
                  <Mini v={d?.races ?? 0} l="Rennen" />
                  <Mini v={d?.wins ?? 0} l="Siege" />
                  <Mini v={fmtPct(d?.beatShare)} l="Ø geschl." />
                </div>
                {isMe && <span className="du">DU</span>}
              </Link>
            )
          })}
        </div>
      )}
      {newcomers.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Neu dabei – noch ohne Rennen</span>
          <div className="chips">
            {newcomers.map((n) => (
              <Link key={n} to={driverPath(n)} state={{ bg: location }} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...(n === me ? { boxShadow: 'inset 0 0 0 1.5px var(--me)' } : null) }}>
                <Avatar name={n} size={20} />
                {n}
              </Link>
            ))}
          </div>
        </section>
      )}
      <SettingsProblem />
      <DriverSettingsHint rows={unmatched.drivers} />
      {view === 'table' && (
        <div className="legend" style={{ gap: 18 }}>
          <span>Pace = Abstand der Ø sauberen Runde zur typischen Bestzeit der Strecke (Grenze der schnellsten 10 % aller Runden); minus = noch schneller</span>
          <span>Streuung = Schwankung sauberer Runden (kleiner = präziser)</span>
          <span>Abflüge nur aus Rennen ohne Tankfunktion</span>
          {p !== 'all' && <span>Sortiert nach Saisonwertung {p} (Punkte, beste {SEASON_POINTS.countedDays} Renntage)</span>}
          <span>Inaktiv = seit über 12 Monaten kein Rennen – ohne Platz am Ende, bis zum nächsten Rennen</span>
          <span>Einstufung = neue Fahrer, die ersten {PLACEMENT_RUNS} Läufe pendeln die Wertung ein (wer vor dem {formatDate(RATING.v2From)} angefangen hat: {RATING.provisionalRacesLegacy})</span>
        </div>
      )}
    </div>
  )
}

/** Plätze gewonnen (grün) oder verloren im Zeitraum */
function Trend({ row }: { row: RankRow }) {
  if (row.rankStart == null) return <span style={{ color: 'var(--faint)' }}>neu</span>
  const d = row.rankStart - row.rank
  if (d === 0) return <span style={{ color: 'var(--faint)' }}>–</span>
  return <span style={{ color: d > 0 ? '#7BDB8A' : '#FF8A7A', fontWeight: 600 }}>{d > 0 ? `▲ ${d}` : `▼ ${-d}`}</span>
}

function Mini({ v, l }: { v: string | number; l: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{v}</span>
      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{l}</span>
    </div>
  )
}

/** Länger als INACTIVE_DAYS kein Rennen: ohne Platz am Ende der Rangliste */
function Inactive() {
  return (
    <span title="Seit über 12 Monaten kein Rennen – ohne Platz, bis zum nächsten Rennen" style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', letterSpacing: 0.5 }}>
      inaktiv
    </span>
  )
}
