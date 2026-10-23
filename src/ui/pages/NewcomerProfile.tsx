import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CAREER_XP, careerTitle, KM_STEPS, levelXp, nextCareerTitle, OPP_STEPS, PLACEMENT_RUNS, RACE_STEPS, type Medal } from '../../domain/model'
import { CHALLENGE_XP } from '../../domain/challenges'
import { driverInsight, eventVisible, lastDay, planVisible, todayIso } from '../../domain/event/insights'
import { AREA } from '../colors'
import { ChallengeItem } from '../ChallengeItem'
import { Avatar, Sheet, useData, useMyName } from '../components'
import { Amount, XP_COLOR, XP_GRADIENT } from '../currency'
import { computeFor, EVENT_ACCENT } from '../event/shared'
import { formatDate } from '../format'
import { ShareIcon } from '../icons'
import { MedalBadge } from '../Medal'
import { useMe } from '../me'
import { NextHeatCard } from './Home'

const ACCENT = AREA.drivers

/** Medaillen, die man mit den ersten Rennen holen kann (ausgegraut, bis sie geschafft sind) */
const FIRST_MEDALS: Medal[] = [
  { id: 'debuet', kind: 'debuet', name: 'Debüt', description: 'Erster Lauf bei GR Legends', tier: 'bronze', icon: 'star', date: '' },
  { id: 'siege-1', kind: 'siege', name: 'Erster Sieg', description: 'Ein Rennen gewinnen', tier: 'bronze', icon: 'trophy', date: '' },
  { id: `gegner-${OPP_STEPS[0]}`, kind: 'gegner', name: `${OPP_STEPS[0]} Gegner geschlagen`, description: `${OPP_STEPS[0]} verschiedene Fahrer hinter sich lassen`, tier: 'bronze', icon: 'people', date: '' },
  { id: `km-${KM_STEPS[0]}`, kind: 'km', name: `${KM_STEPS[0]} km gefahren`, description: `${KM_STEPS[0]} km in Rennen`, tier: 'bronze', icon: 'track', date: '' },
  { id: `rennen-${RACE_STEPS[0]}`, kind: 'rennen', name: `${RACE_STEPS[0]} Rennen`, description: `${RACE_STEPS[0]} Rennen fahren`, tier: 'bronze', icon: 'flag', date: '' },
]

/** Profil für Fahrer, die schon im Einstellungen-Sheet stehen, aber noch kein Rennen gefahren sind */
export function NewcomerProfile({ driver, onClose }: { driver: string; onClose: () => void }) {
  const { model } = useData()
  const me = useMyName()
  const { openPicker } = useMe()
  const isMe = driver === me
  const year = model.years[0] as string | undefined
  const list = year ? model.challenges(driver, year) : []
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `${driver} · GR Legends`, url })
      else await navigator.clipboard.writeText(url)
    } catch {
      // abgebrochen
    }
  }
  return (
    <Sheet
      onClose={onClose}
      label={`Profil ${driver}`}
      actions={
        <button className="btn round" aria-label="Link teilen" onClick={share} style={{ width: 44, padding: 0 }}>
          <ShareIcon />
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar name={driver} size={64} ring={isMe ? ACCENT : '#3A404A'} style={{ background: 'var(--inner)', fontSize: 22, fontWeight: 800, boxShadow: 'var(--sh2)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, textShadow: '0 3px 12px rgba(0,0,0,.6)' }}>{driver}</h1>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            Noch kein Rennen gefahren
            {isMe && ' · Das bist du'}
          </span>
          {isMe && (
            <button className="btn ghost" onClick={openPicker} style={{ alignSelf: 'flex-start', minHeight: 30, padding: '0 10px', fontSize: 12, marginTop: 2 }}>
              Anderen Fahrer wählen
            </button>
          )}
        </div>
      </div>
      <p className="inner" style={{ margin: 0, padding: '12px 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
        Willkommen bei GR Legends! Nach dem ersten Rennen erscheinen hier Elo, Statistiken und Rückblicke. Die ersten {PLACEMENT_RUNS} Läufe sind die Einstufung.
      </p>

      <NextHeatCard driver={driver} />
      <EventEntry driver={driver} />
      <RookieCard />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Die ersten Medaillen</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
          {FIRST_MEDALS.map((m) => (
            <div key={m.id} className="inner" style={{ alignItems: 'center', textAlign: 'center', gap: 6, padding: '12px 8px' }} title={m.description}>
              {/* ausgegraut: noch nicht geschafft */}
              <span style={{ filter: 'grayscale(1)', opacity: 0.45 }}>
                <MedalBadge medal={m} size={44} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{m.name}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.3 }}>{m.description}</span>
            </div>
          ))}
        </div>
      </section>

      {year && list.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link to={`/saison/${year}`} state={{ tab: 'challenges', driver }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Saisonchallenges {year}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>alle ›</span>
          </Link>
          {list.map((c) => (
            <ChallengeItem key={c.id} c={c} accent={AREA.season} year={year} driver={driver} />
          ))}
        </section>
      )}
    </Sheet>
  )
}

/**
 * Angemeldet bei einem kommenden Wettkampf, dessen Laufplan noch nicht zu sehen ist: Name, Datum
 * und Team. Mit sichtbarem Plan zeigt `NextHeatCard` den ersten eigenen Lauf.
 */
function EventEntry({ driver }: { driver: string }) {
  const data = useData()
  const today = todayIso()
  const found = useMemo(() => {
    const folder = data.events
      .filter((e) => eventVisible(e.def, today) && lastDay(e.def) >= today && e.def.drivers.includes(driver))
      .sort((a, b) => a.def.start.localeCompare(b.def.start))[0]
    if (!folder) return null
    const state = computeFor(data, folder.def, folder.id)
    // Ist der Plan sichtbar und hat der Fahrer schon einen Lauf, übernimmt das „Dein nächster Lauf“
    if (planVisible(folder.def, today) && driverInsight(state, driver).nextHeat) return null
    return { folder, team: state.teams.find((t) => t.drivers.includes(driver)) }
  }, [data, driver, today])
  if (!found) return null
  const { folder, team } = found
  return (
    <Link to={`/wettkampf/${folder.id}`} className="card me-row" style={{ gap: 6 }}>
      <span className="kicker" style={{ color: EVENT_ACCENT }}>
        Dein erster Wettkampf
      </span>
      <span style={{ fontSize: 20, fontWeight: 800 }}>{folder.def.name}</span>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        {folder.def.start > today ? `am ${formatDate(folder.def.start)}` : 'läuft gerade'}
        {team ? ` · Team ${team.name}` : ''}
        {team && team.drivers.length > 1 ? ` mit ${team.drivers.filter((d) => d !== driver).join(', ')}` : ''}
      </span>
    </Link>
  )
}

/** Karriere-Level von Anfang an: Level 1, 0 XP und wofür es Erfahrungspunkte gibt */
function RookieCard() {
  const next = levelXp(2)
  const title = nextCareerTitle(1)
  const rules: [string, number][] = [
    ['Rennen', CAREER_XP.race],
    ['Renntag', CAREER_XP.raceDay],
    ['Qualifying', CAREER_XP.quali],
    ['Sieg', CAREER_XP.win],
    ['Podium', CAREER_XP.podium],
    ['je km', CAREER_XP.km],
    ['neue Bestzeit', CAREER_XP.personalBest],
  ]
  return (
    <section className="inner" style={{ gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#1A1205', background: XP_GRADIENT, boxShadow: 'var(--sh2)' }}
          aria-hidden="true"
        >
          1
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Level 1 · {careerTitle(1)}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            <Amount kind="xp" value={0} size={12} /> · {next} XP bis Level 2{title ? ` · „${title[1]}“ ab Level ${title[0]}` : ''}
          </span>
        </span>
      </div>
      <div className="bar" style={{ ['--accent' as string]: XP_COLOR, width: '100%', height: 7 }}>
        <div style={{ width: '0%' }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Jedes Mitfahren bringt Erfahrung – sie geht nie verloren:</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '4px 12px' }}>
        {rules.map(([label, xp]) => (
          <span key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--text-2)' }}>{label}</span>
            <Amount kind="xp" value={xp} signed size={13} />
          </span>
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Dazu {CHALLENGE_XP} XP für jede geschaffte Saison-Challenge.</span>
    </section>
  )
}
