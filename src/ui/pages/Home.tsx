import { Link, useLocation } from 'react-router-dom'
import { SEASON_MIN_RACES, type NewsItem } from '../../domain/model'
import { isGuest } from '../../domain/drivers'
import { AREA } from '../colors'
import { driverPath, MeButton, Monogram, useData, useMyName } from '../components'
import { Chevrons, Crown, RecordFlame, StatusIcons, Trophy } from '../icons'
import { MedalBadge } from '../Medal'
import { fmtElo, formatDate, formatTime, plural, shortName } from '../format'
import { isQuali } from '../../domain/rating'

export function Home() {
  const { model, days } = useData()
  const me = useMyName()
  const location = useLocation()
  const rows = model.ranking('all')
  const statuses = model.statuses('all')
  const latest = days[0]
  // Der letzte Renntag ist nur „neu“, solange er höchstens 5 Tage zurückliegt
  const fresh = latest != null && daysSince(latest.date) <= 5
  const day = fresh ? latest : undefined
  const races = day?.sessions.filter((s) => !isQuali(s)) ?? []
  const winners = new Map<string, number>()
  for (const s of races) {
    const w = s.results[0]?.driver
    if (w) winners.set(w, (winners.get(w) ?? 0) + 1)
  }
  const top = [...winners].sort((a, b) => b[1] - a[1])
  const dayBest = day?.sessions.flatMap((s) => s.results).filter((r) => r.validBestLapMs != null).sort((a, b) => a.validBestLapMs! - b.validBestLapMs!)[0]
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean)
  const myRow = me ? rows.find((r) => r.name === me) : null
  const above = myRow ? rows.find((r) => r.rank === myRow.rank - 1) : null
  const news = fresh ? model.news().slice(0, 5) : []
  const bg = { bg: location }

  return (
    <div className="page" style={{ ['--accent' as string]: AREA.drivers }}>
      <header className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="hide-desktop">
            <Monogram width={46} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="kicker" style={{ letterSpacing: 3 }}>
              GR Legends
            </span>
            <h1>Boxengasse</h1>
          </div>
        </div>
        <span className="hide-desktop">
          <MeButton />
        </span>
      </header>

      <div className="cols">
        {day && (
          <Link to={`/lauf/${races[races.length - 1]?.fileId ?? day.sessions[0].fileId}`} className="card">
            <div className="card-head">
              <span className="kicker" style={{ color: AREA.history }}>
                Letzter Renntag
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {formatDate(day.date)} · {plural(races.length, 'Rennen', 'Rennen')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="icon-box" style={{ width: 52, height: 52, borderRadius: 16 }}>
                <Trophy size={30} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>
                  {top.length ? (top[0][1] === races.length && races.length > 1 ? `${top[0][0]} gewinnt alle ${races.length}` : `${top[0][0]} gewinnt ${top[0][1]} von ${races.length}`) : `${day.sessions.length} Läufe`}
                </span>
                {dayBest && (
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Bestzeit {formatTime(dayBest.validBestLapMs)} · {isGuest(dayBest.driver) ? dayBest.driver : shortName(dayBest.driver)} · {dayBest.car}
                  </span>
                )}
              </div>
            </div>
            {top.length > 1 && (
              <div className="chips">
                {top.slice(0, 4).map(([n, c]) => (
                  <span key={n} className="pill" style={n === me ? { color: 'var(--me)' } : undefined}>
                    {shortName(n)} {c}×
                  </span>
                ))}
              </div>
            )}
          </Link>
        )}

        {!fresh && <RecordsCard lastDate={latest?.date} lastFileId={latest?.sessions.filter((s) => !isQuali(s)).slice(-1)[0]?.fileId ?? latest?.sessions[0]?.fileId} />}

        <section className="card" style={{ paddingBottom: 12 }}>
          <div className="card-head">
            <span className="kicker" style={{ color: AREA.drivers }}>
              Wertung
            </span>
            <Link to="/fahrer" style={{ fontSize: 12, color: 'var(--muted)' }}>
              Elo gesamt ›
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, alignItems: 'end' }}>
            {podium.map((r) => {
              const h = r.rank === 1 ? 80 : r.rank === 2 ? 58 : 42
              const tint = r.rank === 1 ? 'rgba(229,165,26,.18)' : r.rank === 2 ? 'rgba(185,198,210,.16)' : 'rgba(200,120,70,.18)'
              return (
                <Link key={r.name} to={driverPath(r.name)} state={bg} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {r.rank === 1 && <Crown size={22} animate />}
                  <span style={{ fontSize: 14, fontWeight: 600, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: r.name === me ? 'var(--me)' : undefined }}>{r.name}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {fmtElo(r.elo)}
                  </span>
                  <div
                    className={`rank r${r.rank}`}
                    style={{ width: '100%', height: h, borderRadius: '12px 12px 4px 4px', background: `linear-gradient(180deg, ${tint} 0%, #1F232A 70%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: r.rank === 1 ? 26 : 22, boxShadow: 'var(--sh-row)' }}
                  >
                    {r.rank}
                  </div>
                </Link>
              )
            })}
          </div>
          {myRow && myRow.rank > 3 && (
            <Link to={driverPath(myRow.name)} state={bg} className="me-row" style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, padding: '10px 12px', boxShadow: 'var(--sh-row)' }}>
              <span className="rank" style={{ fontSize: 15, color: 'var(--me)', minWidth: 20 }}>
                {myRow.rank}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Du · {myRow.name} <StatusIcons list={statuses.get(myRow.name)} size={16} />
                </span>
                {above && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{gapText(above.elo - myRow.elo, above.rank)}</span>}
              </div>
              <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>
                {fmtElo(myRow.elo)}
              </span>
            </Link>
          )}
          {!me && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
              Tipp: Oben rechts auswählen, wer du bist – dann siehst du dich überall hervorgehoben.
            </p>
          )}
        </section>
      </div>

      <SeasonCard />

      {news.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="kicker" style={{ padding: '4px 4px 0' }}>
            Neu passiert
          </span>
          <div className="cols" style={{ gap: 8 }}>
            {news.map((n, i) => (
              <Link key={i} to={driverPath(n.driver)} state={bg} className="list-item">
                <NewsIcon item={n} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: n.driver === me ? 'var(--me)' : undefined }}>{n.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{n.detail}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const CURRENT_YEAR = String(new Date().getFullYear())

/** Saisonwertung des aktuellen Jahres: wer am meisten Elo dazugewonnen hat (ab 5 Rennen) */
function SeasonCard() {
  const { model } = useData()
  const me = useMyName()
  const location = useLocation()
  const year = model.years[0]
  if (!year) return null
  const rows = model.season(year)
  if (!rows.length) return null
  const ranked = rows.filter((r) => r.races >= SEASON_MIN_RACES)
  const mine = me ? rows.find((r) => r.name === me) : undefined
  const myPos = mine ? ranked.indexOf(mine) + 1 : 0
  const running = year >= CURRENT_YEAR
  const line = (r: (typeof rows)[number], pos: number | null) => (
    <Link key={r.name} to={driverPath(r.name)} state={{ bg: location }} className={`row${r.name === me ? ' me-row' : ''}`} style={{ padding: '7px 8px' }}>
      <span className={`rank${pos != null && pos <= 3 ? ` r${pos}` : ''}`} style={{ minWidth: 20, fontSize: 15 }}>
        {pos ?? '–'}
      </span>
      <span className="grow">
        <span className="name">{r.name === me ? `Du · ${r.name}` : r.name}</span>
        <span className="sub">
          {pos == null
            ? `${r.races} Rennen · noch ${SEASON_MIN_RACES - r.races} bis zur Wertung`
            : `${r.races} Rennen · ${fmtElo(r.start)} → ${fmtElo(r.end)}`}
        </span>
      </span>
      <span className="num" style={{ fontSize: 15, fontWeight: 800, color: r.gain >= 0 ? '#7BDB8A' : 'var(--muted)' }}>
        {r.gain >= 0 ? '+' : '−'}
        {Math.abs(Math.round(r.gain))}
      </span>
    </Link>
  )
  const top = ranked.slice(0, 3)
  return (
    <section className="card" style={{ gap: 4 }}>
      <div className="card-head">
        <span className="kicker" style={{ color: AREA.drivers }}>
          Saison {year}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{running ? 'läuft · ' : ''}Elo dazugewonnen</span>
      </div>
      {top.map((r, i) => line(r, i + 1))}
      {top.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Noch niemand hat {SEASON_MIN_RACES} Rennen in dieser Saison.</p>}
      {mine && !top.includes(mine) && line(mine, myPos > 0 ? myPos : null)}
      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
        Jede Saison startet bei null: Wer im Jahr die meisten Punkte dazugewinnt, wird Saisonsieger. Gewertet wird ab {SEASON_MIN_RACES} Rennen.
      </p>
    </section>
  )
}

function daysSince(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const then = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((today - then) / 86_400_000)
}

/** Statt des letzten Renntags (wenn er länger her ist): die Bestmarken auf einen Blick */
function RecordsCard({ lastDate, lastFileId }: { lastDate?: string; lastFileId?: string }) {
  const { model } = useData()
  const me = useMyName()
  const location = useLocation()
  const all = [...model.stats('all').drivers.values()]
  const best = <T,>(list: T[], get: (x: T) => number | null) => list.filter((x) => get(x) != null).sort((a, b) => get(b)! - get(a)!)[0]
  const track = model.tracks[0]
  const rec = track ? model.trackRecords.get(track) : undefined
  const wins = best(all, (d) => (d.wins > 0 ? d.wins : null))
  const km = best(all, (d) => d.km)
  const rows = [
    { label: 'Bahnrekord', who: rec?.driver, value: rec ? formatTime(rec.ms) : '–', guest: rec?.guest, gold: true },
    { label: 'Meiste Siege', who: wins?.name, value: String(wins?.wins ?? '–') },
    { label: 'Meiste km', who: km?.name, value: km?.km != null ? `${km.km.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : '–' },
  ]
  return (
    <section className="card" style={{ gap: 4 }}>
      <div className="card-head">
        <span className="kicker" style={{ color: AREA.stats }}>
          Bestmarken
        </span>
        <Link to="/statistik" style={{ fontSize: 12, color: 'var(--muted)' }}>
          Statistiken ›
        </Link>
      </div>
      {rows.map((r) => (
        <Link key={r.label} to={r.who && !r.guest ? driverPath(r.who) : '/statistik'} state={{ bg: location }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--grid)' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', width: 90, flexShrink: 0 }}>{r.label}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: r.who === me ? 'var(--me)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.who ?? '–'}
            {r.guest ? ' (Gast)' : ''}
          </span>
          <span className="num" style={{ fontSize: 14, fontWeight: 700, color: r.gold ? '#F2C94C' : undefined }}>
            {r.value}
          </span>
        </Link>
      ))}
      {lastDate && lastFileId && (
        <Link to={`/lauf/${lastFileId}`} style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 6 }}>
          Letzter Renntag: {formatDate(lastDate)} › ansehen
        </Link>
      )}
    </section>
  )
}

function gapText(gap: number, rank: number) {
  const g = Math.max(1, Math.ceil(gap))
  return g <= 3 ? `nur ${g} ${g === 1 ? 'Punkt' : 'Punkte'} bis Platz ${rank}` : `${g} Punkte bis Platz ${rank}`
}

function NewsIcon({ item }: { item: NewsItem }) {
  if (item.kind === 'medal' && item.medal) return <MedalBadge medal={item.medal} size={40} />
  return (
    <div className="icon-box">
      {item.kind === 'climb' ? (
        <Chevrons value={Math.min(item.value ?? 1, 4)} size={24} />
      ) : (
        <RecordFlame metal={item.kind === 'record-track' ? 'gold' : item.kind === 'record-car' ? 'silver' : 'bronze'} size={26} />
      )}
    </div>
  )
}
