import { useNavigate, type Location } from 'react-router-dom'
import { SEASON_POINTS, type SeasonBeat } from '../../domain/season'
import { isGuest } from '../../domain/drivers'
import { ChallengeBadge, PtsChip } from '../ChallengeItem'
import { byProgress } from '../challengeUtils'
import { AREA } from '../colors'
import { Avatar, driverPath, Sheet, useData, useMyName } from '../components'
import { Amount } from '../currency'
import { beatenText } from '../format'
import { useChallengePopup } from '../MedalPopup'

const ACCENT = AREA.season

interface OpponentRow {
  name: string
  times: number
  points: number
}

/** Geschlagene Gegner zusammengefasst: wie oft und wie viele Punkte (meiste Punkte zuerst) */
function byOpponent(beats: SeasonBeat[]): OpponentRow[] {
  const map = new Map<string, OpponentRow>()
  for (const b of beats) {
    const name = isGuest(b.opponent) ? 'Gäste' : b.opponent
    const row = map.get(name) ?? { name, times: 0, points: 0 }
    row.times++
    row.points += b.value
    map.set(name, row)
  }
  return [...map.values()].sort((a, b) => b.points - a.points || b.times - a.times || a.name.localeCompare(b.name))
}

/** Saison eines Fahrers: Challenges, gewertete Gegner (wie oft, wie viele Punkte) und was nicht zählt */
export function SeasonDriverSheet({ year, driver, bg, onClose }: { year: string; driver: string; bg: Location; onClose: () => void }) {
  const { model } = useData()
  const me = useMyName()
  const navigate = useNavigate()
  const openChallenge = useChallengePopup()
  const st = model.season(year).find((r) => r.name === driver)
  if (!st) return null
  const sp = SEASON_POINTS
  const counted = new Set(st.countedList)
  const all = st.days.flatMap((d) => d.allBeats)
  const rest = all.filter((b) => !counted.has(b))
  const challenges = model.challenges(driver, year)
  const done = challenges.filter((c) => c.done)
  const open = challenges.filter((c) => !c.done).sort(byProgress)
  const isMe = driver === me
  const opponentRow = (o: OpponentRow, muted = false) => (
    <div key={o.name} className="row" style={{ padding: '5px 0', minHeight: 40 }}>
      <Avatar name={o.name} size={28} />
      <span className="grow">
        <span className="name" style={{ fontWeight: 500, color: muted ? 'var(--muted)' : o.name === me ? 'var(--me)' : undefined }}>
          {o.name}
        </span>
      </span>
      <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', minWidth: 30, textAlign: 'right' }}>
        {o.times}×
      </span>
      <span style={{ minWidth: 72, display: 'flex', justifyContent: 'flex-end', opacity: muted ? 0.6 : 1 }}>
        <Amount kind="pts" value={Math.round(o.points * 10) / 10} size={14} plain />
      </span>
    </div>
  )
  return (
    <Sheet
      onClose={onClose}
      label={`Saison ${year} von ${driver}`}
      actions={
        <button className="btn round" onClick={() => navigate(driverPath(driver), { state: { bg } })}>
          Profil ›
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={driver} size={52} ring={isMe ? 'var(--me)' : undefined} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{isMe ? `Du · ${driver}` : driver}</h1>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Saison {year} · Platz {st.rank}
          </span>
        </span>
        <Amount kind="pts" value={st.points} size={22} />
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span className="kicker" style={{ fontSize: 11, color: ACCENT }}>
            Challenges · {done.length} von {challenges.length}
          </span>
          <Amount kind="pts" value={st.challengePoints} size={14} signed />
        </div>
        {done.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {done.map((c) => (
              <button key={c.id} type="button" onClick={() => openChallenge(c, { driver, year })} aria-label={`Challenge ${c.label} anzeigen`} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', borderRadius: '50%' }}>
                <ChallengeBadge c={c} accent={ACCENT} size={34} />
              </button>
            ))}
          </div>
        )}
        {open.length > 0 && <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Noch offen – je +{sp.perChallenge} Pkt.:</span>}
        {open.map((c) => (
          <button
            key={c.id}
            type="button"
            className="row"
            onClick={() => openChallenge(c, { driver, year })}
            style={{ border: 'none', background: 'none', textAlign: 'left', padding: '4px 0', minHeight: 40, width: '100%' }}
          >
            <ChallengeBadge c={c} accent={ACCENT} size={30} />
            <span className="grow">
              <span className="name" style={{ fontWeight: 600, fontSize: 14 }}>
                {c.label}
              </span>
              <span className="sub">{c.detail}</span>
            </span>
            <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
              {c.value}/{c.target}
            </span>
            <PtsChip done={false} />
          </button>
        ))}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span className="kicker" style={{ fontSize: 11, color: ACCENT }}>
            Geschlagene Gegner
          </span>
          <Amount kind="pts" value={st.racePoints} size={14} signed />
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>{beatenText(st.countedList.length, all.length)}</span>
        {byOpponent(st.countedList).map((o) => opponentRow(o))}
        <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          Gegen Stärkere gibt es mehr Punkte. Es zählen die {sp.countedBeats} wertvollsten, höchstens {sp.beatsPerDay} je Renntag – ein wertvollerer Sieg ersetzt später einen schwächeren.
        </span>
      </section>

      {rest.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span className="kicker" style={{ fontSize: 11 }}>Nicht gewertet · {rest.length}</span>
          </div>
          {byOpponent(rest).map((o) => opponentRow(o, true))}
          <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Weniger wertvoll als die gewerteten oder mehr als {sp.beatsPerDay} an einem Renntag.</span>
        </section>
      )}
    </Sheet>
  )
}
