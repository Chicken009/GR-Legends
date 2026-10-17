import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { eventSessions } from '../../data/useRaceDays'
import { isGuest } from '../../domain/drivers'
import { eventContext, typicalLapMs } from '../../domain/event/context'
import { carCap, teamsAsDefs, teamSplit, type Heat, type TeamPlan, type TeamState } from '../../domain/event/engine'
import { todayIso } from '../../domain/event/insights'
import { eventSlug, normalizeEvent, serializeEvent } from '../../domain/event/normalize'
import { newSeed } from '../../domain/event/random'
import { simulate, type Simulation } from '../../domain/event/simulate'
import { newEvent, newSection, TEMPLATES } from '../../domain/event/templates'
import { FORMAT_LABEL, type CarRule, type EventDef, type HeatOverride, type SectionDef, type SectionFormat, type Seeding } from '../../domain/event/types'
import { PageHead, Segment, useData } from '../components'
import { CarRuleEditor, Field, Group, Stepper, ToggleChip, useCarOptions } from '../event/form'
import { computeFor, EVENT_ACCENT, fmtPts, HeatCard, teamColor, teamEloText } from '../event/shared'
import { formatDate } from '../format'

const DRAFT_KEY = 'gr-legends:event-draft'

function readDraft(): EventDef | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? normalizeEvent(JSON.parse(raw), 'Entwurf') : null
  } catch {
    return null
  }
}

function readTemplateId(): string | null {
  try {
    return localStorage.getItem(`${DRAFT_KEY}:vorlage`)
  } catch {
    return null
  }
}

function writeDraft(def: EventDef | null, templateId: string | null = null) {
  try {
    if (def) localStorage.setItem(DRAFT_KEY, JSON.stringify(def))
    else localStorage.removeItem(DRAFT_KEY)
    if (def && templateId) localStorage.setItem(`${DRAFT_KEY}:vorlage`, templateId)
    else localStorage.removeItem(`${DRAFT_KEY}:vorlage`)
  } catch {
    // Speicher gesperrt – egal
  }
}

/** „14.03.26“ */

const clone = (d: EventDef): EventDef => JSON.parse(JSON.stringify(d)) as EventDef

const SEEDING_LABEL: Record<Seeding, string> = { previous: 'Ergebnis des vorigen Abschnitts', elo: 'Nach Elo', random: 'Ausgelost' }

const FORMAT_HELP: Record<SectionFormat, string> = {
  quali: 'Wertung nach der schnellsten Runde. Mit „1 gleichzeitig“ fährt jeder allein.',
  races: 'Alle fahren in ausgeglichenen Gruppen, danach neu gemischt. Die Punkte werden addiert; kleinere Läufe werden hochgerechnet und reihum verteilt.',
  ladder: 'Die Langsamsten fahren zuerst, die Besten steigen ins nächste Rennen auf – bis zum Finale.',
  ko: 'Wer weiterkommt, fährt die nächste Runde, die anderen scheiden aus. Gruppen möglichst gleich groß, in jeder scheiden gleich viele aus.',
  team: 'Teams gegeneinander. Jedes Team bekommt den Schnitt seiner Fahrer – zusammenarbeiten lohnt sich.',
  custom: 'Läufe mit festen Fahrern selbst festlegen. Punkte kleinerer Läufe werden hochgerechnet.',
  free: 'Kein Plan: Jede Datei im Ordner ist ein Lauf.',
}

export function EventEditor() {
  const { id } = useParams()
  const data = useData()
  const navigate = useNavigate()
  const folder = id ? data.events.find((e) => e.id === id) : undefined
  const isNew = !id
  const [def, setDef] = useState<EventDef>(() => (folder ? clone(folder.def) : (readDraft() ?? newEvent(todayIso()))))
  const [importError, setImportError] = useState<string | null>(null)
  // Probelauf gehört zu genau dieser Fassung – nach jeder Änderung verschwindet er
  const [simFor, setSimFor] = useState<{ def: EventDef; result: Simulation | 'running' } | null>(null)
  const sim = simFor?.def === def ? simFor.result : null
  const [editHeat, setEditHeat] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // Vorlage: sichtbar gewählt, Wechsel erst nach Bestätigung, danach rückgängig machbar
  const [templateId, setTemplateId] = useState<string | null>(() => (isNew ? (readTemplateId() ?? TEMPLATES[0].id) : null))
  const [confirmTpl, setConfirmTpl] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ def: EventDef; templateId: string | null } | null>(null)
  const applyTemplate = (tid: string) => {
    const t = TEMPLATES.find((x) => x.id === tid)
    if (!t) return
    const built = t.build()
    setUndo({ def, templateId })
    setDef({ ...def, sections: built.sections, teams: built.teams, overrides: {} })
    setTemplateId(tid)
    setConfirmTpl(null)
  }

  useEffect(() => {
    if (isNew) writeDraft(def, templateId)
  }, [def, isNew, templateId])

  const state = useMemo(() => computeFor(data, def, folder?.id ?? null), [data, def, folder?.id])
  const update = (patch: Partial<EventDef>) => setDef((d) => ({ ...d, ...patch }))
  const updateSection = (i: number, patch: Partial<SectionDef>) => setDef((d) => ({ ...d, sections: d.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) }))

  if (id && !folder) {
    return (
      <div className="page">
        <p className="muted">Diesen Wettkampf gibt es nicht.</p>
      </div>
    )
  }

  const track = def.track ?? folder?.tracks[0] ?? null
  const folderName = folder?.name ?? (def.name.trim() || '<Name>')
  const problems = [
    !def.name.trim() && 'Name fehlt',
    !def.drivers.length && 'keine Fahrer ausgewählt',
    !def.sections.length && 'kein Abschnitt',
    def.sections.some((s) => s.format === 'team') && !def.teams && 'Teamrennen ohne Teammodus',
  ].filter((p): p is string => Boolean(p))

  const download = () => {
    const blob = new Blob([serializeEvent({ ...def, name: def.name.trim() })], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wettkampf.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serializeEvent(def))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Zwischenablage gesperrt
    }
  }
  const importFile = async (file: File) => {
    try {
      const next = normalizeEvent(JSON.parse(await file.text()))
      setDef(next)
      setTemplateId(null)
      setUndo(null)
      setImportError(null)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    }
  }
  const runSim = () => {
    const current = def
    setSimFor({ def: current, result: 'running' })
    // Kurz warten, damit „läuft …“ angezeigt wird
    setTimeout(() => {
      const sessions = folder ? eventSessions(data.allSessions, folder.id) : []
      const ctx = eventContext(current, data.model.rating, data.allSessions, sessions, track)
      const result = simulate(current, ctx, typicalLapMs(data.allSessions, track))
      setSimFor((s) => (s?.def === current ? { def: current, result } : s))
    }, 30)
  }

  return (
    <div className="page" style={{ ['--accent' as string]: EVENT_ACCENT }}>
      <PageHead title={isNew ? 'Neuer Wettkampf' : `${def.name} bearbeiten`} kicker="Wettkampf-Editor" color={EVENT_ACCENT}>
        <Link to={folder ? `/wettkampf/${folder.id}` : '/wettkampf'} className="btn round">
          Schließen
        </Link>
      </PageHead>
      <div className="inner" role="note" style={{ padding: '10px 12px', gap: 2, boxShadow: `inset 3px 0 0 ${EVENT_ACCENT}, var(--sh2)` }}>
        <b style={{ fontSize: 13 }}>Nur für die Rennleitung</b>
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>Hier wird der Wettkampf geplant und eingerichtet. Zum Mitfahren und Zuschauen brauchst du diesen Bildschirm nicht.</span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
        Der Editor speichert nichts online. Am Ende lädst du <b>wettkampf.json</b> herunter und legst sie in den Wettkampf-Ordner in Drive. Die App rechnet daraus Ablauf und Wertung.
        {isNew && ' Dein Entwurf bleibt auf diesem Gerät erhalten.'}
      </p>

      {isNew && (
        <section className="card">
          <span className="card-title">1 · Vorlage</span>
          <div className="form-grid">
            {TEMPLATES.map((t) => {
              const selected = templateId === t.id
              const asking = confirmTpl === t.id
              return (
                <div
                  key={t.id}
                  className="inner"
                  style={{
                    padding: 0,
                    borderRadius: 14,
                    border: `${selected ? 2 : 1}px solid ${selected || asking ? EVENT_ACCENT : 'var(--line-2)'}`,
                    background: selected ? `color-mix(in srgb, ${EVENT_ACCENT} 14%, var(--inner-2))` : undefined,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    style={{ textAlign: 'left', padding: 12, border: 'none', background: 'transparent', display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 14 }}
                    onClick={() => !selected && setConfirmTpl(t.id)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 14 }}>{t.name}</b>
                      {selected && (
                        <span className="status-chip next" style={{ marginLeft: 'auto' }}>
                          ✓ gewählt
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{t.text}</span>
                  </button>
                  {asking && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 12px 12px' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Abschnitte und Teams werden durch diese Vorlage ersetzt. Name, Datum, Fahrer und Wertung bleiben.</span>
                      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="btn round primary" style={{ padding: '0 12px' }} onClick={() => applyTemplate(t.id)}>
                          Übernehmen
                        </button>
                        <button type="button" className="btn round" style={{ padding: '0 12px' }} onClick={() => setConfirmTpl(null)}>
                          Abbrechen
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {undo && (
            <div className="inner" style={{ padding: '10px 12px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} role="status">
              <span style={{ fontSize: 13, flex: 1 }}>Vorlage „{TEMPLATES.find((t) => t.id === templateId)?.name}“ übernommen – Abschnitte und Teams wurden ersetzt.</span>
              <button
                type="button"
                className="btn round"
                onClick={() => {
                  setDef(undo.def)
                  setTemplateId(undo.templateId)
                  setUndo(null)
                }}
              >
                Rückgängig
              </button>
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Eine Vorlage ersetzt nur die Abschnitte und Teams – alles lässt sich danach anpassen.</span>
        </section>
      )}

      <section className="card">
        <span className="card-title">{isNew ? '2 · ' : ''}Name und Datum</span>
        <div className="form-grid">
          <Field label="Name">
            <input className="input" value={def.name} onChange={(e) => update({ name: e.target.value })} placeholder="z. B. Herbstcup 2026" />
          </Field>
          <Field label="Strecke">
            <select className="select" value={track ?? ''} onChange={(e) => update({ track: e.target.value || undefined })}>
              <option value="">– wählen –</option>
              {[...new Set([...data.model.tracks, ...(track ? [track] : [])])].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start">
            <input className="input" type="date" value={def.start} onChange={(e) => e.target.value && update({ start: e.target.value, end: def.end && def.end > e.target.value ? def.end : undefined })} />
          </Field>
          <Field label="Ende (optional)" help={def.end ? undefined : 'Leer = nur ein Tag'}>
            <span style={{ display: 'flex', gap: 6 }}>
              <input className="input" type="date" min={def.start} value={def.end ?? ''} onChange={(e) => update({ end: e.target.value && e.target.value > def.start ? e.target.value : undefined })} />
              {def.end && (
                <button type="button" className="btn ghost" onClick={() => update({ end: undefined })} aria-label="Enddatum entfernen">
                  ✕
                </button>
              )}
            </span>
          </Field>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
          Ordner in Drive: <b style={{ color: 'var(--text-2)' }}>{track ?? '<Strecke>'} / {folderName}</b> – den Streckenordner gibt es schon (mit Länge im Namen), darin den Wettkampf-Ordner anlegen.
        </span>
      </section>

      <DriversCard def={def} update={update} />

      <section className="card">
        <span className="card-title">Sichtbarkeit</span>
        <div className="form-grid">
          <Group label="Wettkampf anzeigen">
            <Segment small label="Wettkampf anzeigen" value={def.show} onChange={(show) => update({ show })} options={[['now', 'Sofort'], ['week', '1 Woche vorher']]} />
          </Group>
          <Group label="Ablauf sichtbar">
            <Segment
              small
              label="Ablauf sichtbar"
              value={def.showPlan}
              onChange={(showPlan) => update({ showPlan })}
              options={[
                ['now', 'Sofort'],
                ['week', '1 Woche'],
                ['day', '1 Tag'],
                ['raceday', 'Renntag'],
              ]}
            />
          </Group>
        </div>
      </section>

      <section className="card">
        <span className="card-title">Bahn und Fahrzeuge</span>
        <Group label="Fahrzeuge gleichzeitig" help="Wie viele Autos in einem Lauf fahren. Pro Abschnitt änderbar (z. B. 1 für Einzel-Quali).">
          <Stepper label="Fahrzeuge gleichzeitig" value={def.maxPerHeat} min={1} max={8} onChange={(maxPerHeat) => update({ maxPerHeat })} />
        </Group>
        <CarRuleEditor rule={def.cars} onChange={(cars) => update({ cars })} drivers={def.drivers} />
        <CapNote rule={def.cars} per={def.maxPerHeat} />
      </section>

      <ScoringCard def={def} update={update} />

      <section className="card">
        <span className="card-title">Einzel oder Team</span>
        <Segment
          label="Modus"
          value={def.teams ? 'team' : 'single'}
          onChange={(m) => update({ teams: m === 'team' ? (def.teams ?? { mode: 'elo', size: 2, teams: [] }) : null })}
          options={[
            ['single', 'Einzel'],
            ['team', 'Teams'],
          ]}
        />
        {def.teams && <TeamEditor def={def} update={update} teams={state.teams} warnings={state.warnings} />}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">Abschnitte</span>
          <span className="hint">in Fahrreihenfolge</span>
        </div>
        {def.sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            sec={s}
            index={i}
            count={def.sections.length}
            def={def}
            plan={state.sections[i]?.teamPlan}
            onChange={(patch) => updateSection(i, patch)}
            onMove={(dir) =>
              setDef((d) => {
                const list = [...d.sections]
                const [x] = list.splice(i, 1)
                list.splice(i + dir, 0, x)
                return { ...d, sections: list }
              })
            }
            onRemove={() => setDef((d) => ({ ...d, sections: d.sections.filter((_, k) => k !== i) }))}
          />
        ))}
        <AddSection onAdd={(f) => setDef((d) => ({ ...d, sections: [...d.sections, newSection(f)] }))} />
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">Ablauf</span>
          <span className="hint">{state.heats.length} Läufe</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
          So sieht der Plan aus. Spätere Läufe hängen von Ergebnissen ab und füllen sich am Renntag. Einzelne Läufe lassen sich hier per Hand ändern (Besetzung, Autos).
        </span>
        {state.warnings.map((w) => (
          <span key={w} style={{ fontSize: 12, color: 'var(--crash)' }}>
            {w}
          </span>
        ))}
        {state.sections.map((sec) => (
          <div key={sec.def.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b style={{ fontSize: 13, color: 'var(--text-2)' }}>{sec.def.name || FORMAT_LABEL[sec.def.format]}</b>
            {sec.heats.map((h) => (
              <HeatCard key={h.id} heat={h} state={state} me={null}>
                {h.status !== 'done' && (
                  <button type="button" className="btn ghost" style={{ minHeight: 30, alignSelf: 'flex-start', padding: 0, fontSize: 12 }} onClick={() => setEditHeat(editHeat === h.id ? null : h.id)}>
                    {editHeat === h.id ? 'Fertig' : def.overrides[h.id] ? 'Angepasst · ändern' : 'Lauf anpassen'}
                  </button>
                )}
                {editHeat === h.id && <HeatOverrideEditor heat={h} def={def} update={update} />}
              </HeatCard>
            ))}
            {!sec.heats.length && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sec.def.format === 'free' ? 'Läufe entstehen aus den Dateien im Ordner.' : 'Keine Läufe – Fahrer auswählen.'}</span>}
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">Probelauf</span>
          <button type="button" className="btn round" onClick={runSim} disabled={sim === 'running' || !def.drivers.length}>
            {sim === 'running' ? 'Läuft …' : 'Probelauf starten'}
          </button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>Der Wettkampf wird 120-mal mit zufälligen Ergebnissen nach Elo durchgespielt: Wie lange dauert er, wie oft fährt jeder, wer ist Favorit, wie knapp wird es?</span>
        {sim && sim !== 'running' && <SimResult sim={sim} />}
      </section>

      {folder && <FilesCard def={def} update={update} state={state} folderId={folder.id} />}

      <section className="card" style={{ borderColor: EVENT_ACCENT }}>
        <span className="card-title">Speichern</span>
        {problems.length > 0 && <span style={{ fontSize: 13, color: 'var(--crash)' }}>Noch offen: {problems.join(', ')}.</span>}
        <div className="filters">
          <button type="button" className="btn primary" onClick={download} disabled={!def.name.trim()}>
            wettkampf.json herunterladen
          </button>
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'Kopiert ✓' : 'Als Text kopieren'}
          </button>
          <button type="button" className="btn ghost" onClick={() => fileInput.current?.click()}>
            Datei laden …
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
          {isNew && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                writeDraft(null)
                setDef(newEvent(todayIso()))
                setTemplateId(TEMPLATES[0].id)
                setUndo(null)
              }}
            >
              Neu beginnen
            </button>
          )}
        </div>
        {importError && <span style={{ fontSize: 12, color: 'var(--crash)' }}>{importError}</span>}
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {isNew ? (
            <>
              <li>
                In Drive im Streckenordner <b>{track ?? '<Strecke>'}</b> einen Ordner <b>{def.name.trim() || '<Name>'}</b> anlegen.
              </li>
              <li>
                <b>wettkampf.json</b> hineinlegen.
              </li>
              <li>Am Renntag die Smartrace-Exporte in diesen Ordner speichern (z. B. mit Google Drive für Desktop direkt am Smartrace-Rechner).</li>
            </>
          ) : (
            <>
              <li>
                In Drive im Ordner <b>{folder?.name}</b> die alte <b>wettkampf.json</b> ersetzen: Rechtsklick → Dateiinformationen → Versionen verwalten → Neue Version hochladen. (Oder neu hochladen – die zuletzt geänderte Datei gilt.)
              </li>
              <li>Nach einer Absage oder einem spontanen Fahrer einfach hier ändern und ersetzen – gefahrene Läufe bleiben, die folgenden werden neu geplant.</li>
            </>
          )}
        </ol>
        {isNew && def.name.trim() && data.events.some((e) => e.id === eventSlug(def.name)) && (
          <span style={{ fontSize: 12, color: 'var(--crash)' }}>Einen Wettkampf mit diesem Namen gibt es schon – Ordner mit gleichem Namen gehören zusammen.</span>
        )}
        {!isNew && folder && (
          <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => navigate(`/wettkampf/${folder.id}`)}>
            Zurück zum Wettkampf
          </button>
        )}
      </section>
    </div>
  )
}

function DriversCard({ def, update }: { def: EventDef; update: (p: Partial<EventDef>) => void }) {
  const { model, settings } = useData()
  const [extra, setExtra] = useState('')
  const { allSessions } = useData()
  // Zuletzt an der Bahn zuerst, dann Namen aus dem Einstellungen-Sheet, die noch keine Läufe haben
  const lastSeen = new Map<string, string>()
  for (const ses of allSessions) for (const r of ses.results) if (!isGuest(r.driver) && ses.date > (lastSeen.get(r.driver) ?? '')) lastSeen.set(r.driver, ses.date)
  const ranked = model.ranking('all').map((r) => r.name)
  const fromSheet = [...new Set([...Object.values(settings.aliases), ...Object.entries(settings.labels ?? {}).filter(([k]) => !settings.aliases[k]).map(([, v]) => v)])].filter((n) => !isGuest(n) && !settings.guests.includes(n.toLocaleLowerCase('de-DE')))
  const candidates = [...new Set([...ranked, ...lastSeen.keys(), ...fromSheet, ...def.drivers])].sort(
    (a, b) => (lastSeen.get(b) ?? '').localeCompare(lastSeen.get(a) ?? '') || a.localeCompare(b, 'de'),
  )
  const toggle = (n: string) => update({ drivers: def.drivers.includes(n) ? def.drivers.filter((d) => d !== n) : [...def.drivers, n] })
  const add = () => {
    const n = extra.trim().replace(/\s+/g, ' ')
    if (n && !def.drivers.includes(n)) update({ drivers: [...def.drivers, n] })
    setExtra('')
  }
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">Fahrer</span>
        <span className="hint">{def.drivers.length} dabei · zuletzt an der Bahn zuerst</span>
      </div>
      <div className="chips">
        {candidates.map((n) => (
          <ToggleChip key={n} on={def.drivers.includes(n)} onClick={() => toggle(n)} title={lastSeen.has(n) ? undefined : 'Noch ohne Läufe'}>
            {n}
            {!lastSeen.has(n) && <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>neu</span>}
          </ToggleChip>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Weiterer Name (wie in Smartrace)" aria-label="Weiterer Fahrer" />
        <button type="button" className="btn" onClick={add} disabled={!extra.trim()}>
          Hinzufügen
        </button>
      </div>
      <div className="filters">
        <button type="button" className="btn ghost" style={{ minHeight: 30, fontSize: 12 }} onClick={() => update({ drivers: ranked.slice() })}>
          Alle aus der Rangliste
        </button>
        <button type="button" className="btn ghost" style={{ minHeight: 30, fontSize: 12 }} onClick={() => update({ drivers: [] })}>
          Keine
        </button>
      </div>
      <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>Sagt jemand ab oder kommt spontan dazu: hier ändern und die Datei ersetzen. Gefahrene Läufe bleiben, alles Weitere wird neu geplant.</span>
    </section>
  )
}

function ScoringCard({ def, update }: { def: EventDef; update: (p: Partial<EventDef>) => void }) {
  const sc = def.scoring
  const set = (patch: Partial<EventDef['scoring']>) => update({ scoring: { ...sc, ...patch } })
  const bonus: [keyof EventDef['scoring'], string, string][] = [
    ['fastestLap', 'Schnellste Runde', 'Schnellste Runde aller Rennen'],
    ['pole', 'Pole', 'Schnellster im Qualifying'],
    ['driverOfDay', 'Fahrer des Tages', 'Größte Leistung über der Erwartung laut Elo – gewinnt selten der Schnellste'],
    ['personalBest', 'Persönliche Bestzeit', 'Neue Bestzeit auf der Strecke'],
    ['clean', 'Ohne Abflug', 'Je Rennen ohne Abflug'],
  ]
  return (
    <section className="card">
      <span className="card-title">Wertung</span>
      <Segment
        label="Wertungsart"
        value={sc.method}
        onChange={(method) => set({ method })}
        options={[
          ['absolute', 'Absolut'],
          ['fair', 'Fair (nach Elo)'],
        ]}
      />
      <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
        {sc.method === 'fair'
          ? 'Fair: Ein Sieg gegen einen stärkeren Gegner (Fahrer + Auto laut Elo) bringt bis zu doppelt so viele Punkte, gegen einen schwächeren entsprechend weniger. Über den Abend gleicht sich die Erwartung für alle aus – Außenseiter haben eine echte Chance.'
          : 'Absolut: Punkte nur für die Platzierung – wer vorne ist, bekommt mehr.'}
      </span>
      {sc.method === 'fair' && (
        <label className="check" style={{ alignSelf: 'flex-start', height: 'auto', minHeight: 34, whiteSpace: 'normal' }}>
          <input type="checkbox" checked={!!sc.fairWin} onChange={(e) => set({ fairWin: e.target.checked || undefined })} />
          Siegbonus fair: auch den Siegbonus nach Stärke gewichten (Sieg gegen Stärkere bis doppelt)
        </label>
      )}
      <div className="form-grid">
        <Group label="Je geschlagenem Gegner">
          <Stepper label="Punkte je geschlagenem Gegner" value={sc.perBeaten} min={0} max={10} onChange={(perBeaten) => set({ perBeaten })} />
        </Group>
        <Group label="Sieg extra">
          <Stepper label="Siegbonus" value={sc.win} min={0} max={10} onChange={(win) => set({ win })} />
        </Group>
        <Group label="Finalbonus" help="Der letzte Abschnitt zählt so viel">
          <Segment
            small
            label="Finalbonus"
            value={String(sc.finaleFactor)}
            onChange={(v) => set({ finaleFactor: Number(v) })}
            options={[
              ['1', 'Aus'],
              ['1.5', '×1,5'],
              ['2', '×2'],
              ['3', '×3'],
            ]}
          />
        </Group>
      </div>
      <span className="label" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
        Bonuspunkte (0 = aus)
      </span>
      {sc.method === 'fair' && (sc.fastestLap > 0 || sc.pole > 0) && (
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>Hinweis: Schnellste Runde und Pole gehen fast immer an die Schnellsten. Für einen möglichst ausgeglichenen Abend auf 0 stellen – „Fahrer des Tages“ belohnt dagegen gerade Außenseiter.</span>
      )}
      <div className="form-grid">
        {bonus.map(([key, label, help]) => (
          <Group key={key} label={label} help={help}>
            <Stepper label={label} value={sc[key] as number} min={0} max={10} onChange={(v) => set({ [key]: v })} />
          </Group>
        ))}
      </div>
      <label className="check" style={{ alignSelf: 'flex-start', height: 'auto', minHeight: 34, whiteSpace: 'normal' }}>
        <input type="checkbox" checked={def.countInStats} onChange={(e) => update({ countInStats: e.target.checked })} />
        Läufe zählen auch für Elo und Saison
      </label>
    </section>
  )
}

function TeamEditor({ def, update, teams, warnings }: { def: EventDef; update: (p: Partial<EventDef>) => void; teams: TeamState[]; warnings: string[] }) {
  const rule = def.teams!
  const set = (patch: Partial<NonNullable<EventDef['teams']>>) => update({ teams: { ...rule, ...patch } })
  const uneven = rule.mode !== 'manual' && def.drivers.length > 0 && def.drivers.length % rule.size !== 0
  const manualTeams = rule.teams.length ? rule.teams : teamsAsDefs(teams)
  const teamOf = (d: string) => manualTeams.findIndex((t) => t.drivers.includes(d))
  const assign = (d: string, idx: number) =>
    set({ teams: manualTeams.map((t, i) => ({ ...t, drivers: i === idx ? [...t.drivers.filter((x) => x !== d), d] : t.drivers.filter((x) => x !== d) })) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="form-grid">
        <Group label="Einteilung">
          <Segment
            small
            label="Einteilung"
            value={rule.mode}
            onChange={(mode) => set(mode === 'manual' ? { mode, teams: teamsAsDefs(teams) } : { mode })}
            options={[
              ['elo', 'Nach Elo'],
              ['random', 'Ausgelost'],
              ['manual', 'Selbst'],
            ]}
          />
        </Group>
        {rule.mode !== 'manual' && (
          <Group label="Teamgröße">
            <Stepper label="Teamgröße" value={rule.size} min={2} max={6} onChange={(size) => set({ size })} />
          </Group>
        )}
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
        {rule.mode === 'elo' && 'Ausgeglichene Teams per Schlangenverteilung (1-2-3-3-2-1) nach Elo – jedes Gerät rechnet dasselbe.'}
        {rule.mode === 'random' && 'Ausgelost mit festem Startwert – überall dieselbe Auslosung. „Neu losen“ ändert den Startwert.'}
        {rule.mode === 'manual' && 'Teams selbst einteilen. „Nach Elo“ oder „Ausgelost“ wählen und dann „Festschreiben“ übernimmt die Teams hierher.'}
        {uneven && ` ${def.drivers.length} Fahrer bei Teamgröße ${rule.size} gehen nicht auf: ${teamSplit(teams)}. Gewertet wird mit dem Schnitt der Mitglieder, das bleibt fair; in Positionsduellen fährt der Schwächste des kleineren Teams doppelt.`}
      </span>
      {rule.mode !== 'manual' && (
        <div className="filters">
          {rule.mode === 'random' && (
            <button type="button" className="btn round" onClick={() => update({ seed: newSeed() })}>
              Neu losen
            </button>
          )}
          <button type="button" className="btn round" onClick={() => set({ mode: 'manual', teams: teamsAsDefs(teams) })}>
            Festschreiben
          </button>
        </div>
      )}
      {rule.mode === 'manual' ? (
        <>
          <div className="form-grid">
            {manualTeams.map((t, i) => (
              <Field key={i} label={`Team ${i + 1}${teams[i] && teams[i].name === t.name ? ` · ${teamEloText(teams[i], teams)}` : ''}`}>
                <input className="input" style={{ borderLeft: `4px solid ${teamColor(`t${i + 1}`, t.name)}` }} value={t.name} onChange={(e) => set({ teams: manualTeams.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
              </Field>
            ))}
          </div>
          <div className="filters">
            <button type="button" className="btn round" onClick={() => set({ teams: [...manualTeams, { name: `Team ${manualTeams.length + 1}`, drivers: [] }] })}>
              + Team
            </button>
            {manualTeams.length > 1 && (
              <button type="button" className="btn round ghost" onClick={() => set({ teams: manualTeams.slice(0, -1) })}>
                Letztes Team entfernen
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {def.drivers.map((d) => (
              <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: teamOf(d) >= 0 ? teamColor(`t${teamOf(d) + 1}`, manualTeams[teamOf(d)]?.name) : 'transparent', border: teamOf(d) >= 0 ? 'none' : '1px dashed var(--faint)' }} />
                  {d}
                </span>
                <select className="select" value={teamOf(d)} onChange={(e) => assign(d, Number(e.target.value))} aria-label={`Team für ${d}`}>
                  <option value={-1}>– ohne –</option>
                  {manualTeams.map((t, i) => (
                    <option key={i} value={i}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="form-grid">
          {teams.map((t) => (
            <div key={t.id} className="inner" style={{ padding: 10, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4, borderLeft: `4px solid ${teamColor(t.id, t.name)}` }}>
              <b style={{ fontSize: 13, color: teamColor(t.id, t.name) }}>{t.name}</b>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.drivers.join(', ')}</span>
              <span className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>{teamEloText(t, teams)}</span>
            </div>
          ))}
        </div>
      )}
      {warnings
        .filter((w) => w.startsWith('Ohne Team'))
        .map((w) => (
          <span key={w} style={{ fontSize: 12, color: 'var(--crash)' }}>
            {w}
          </span>
        ))}
    </div>
  )
}

function SectionEditor({ sec, index, count, def, plan, onChange, onMove, onRemove }: { sec: SectionDef; index: number; count: number; def: EventDef; plan?: TeamPlan; onChange: (p: Partial<SectionDef>) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  const per = sec.maxPerHeat ?? def.maxPerHeat
  return (
    <div className="inner" style={{ padding: 12, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--line-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 14, color: EVENT_ACCENT }}>{index + 1}</b>
        <input className="input" value={sec.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Name des Abschnitts" placeholder={FORMAT_LABEL[sec.format]} />
        <button type="button" className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Nach oben">
          ↑
        </button>
        <button type="button" className="icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Nach unten">
          ↓
        </button>
        <button type="button" className="icon-btn" onClick={onRemove} aria-label="Abschnitt entfernen">
          ✕
        </button>
      </div>
      <div className="form-grid">
        <Field label="Format" help={FORMAT_HELP[sec.format]}>
          <select className="select" value={sec.format} onChange={(e) => onChange({ format: e.target.value as SectionFormat, ...(e.target.value === 'custom' && !sec.heats ? { heats: [] } : {}) })}>
            {(Object.keys(FORMAT_LABEL) as SectionFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        {sec.format !== 'custom' && sec.format !== 'free' && sec.format !== 'team' && (
          <Field label="Startreihenfolge / Einteilung">
            <select className="select" value={sec.seeding} onChange={(e) => onChange({ seeding: e.target.value as Seeding })}>
              {(Object.keys(SEEDING_LABEL) as Seeding[]).map((s) => (
                <option key={s} value={s}>
                  {index === 0 && s === 'previous' ? 'Nach Elo (erster Abschnitt)' : SEEDING_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Group label="Zählt" help={sec.weight === 0 ? 'Nur für Startreihenfolge und Pole' : sec.weight === 1 ? 'Normal' : `×${fmtPts(sec.weight)}`}>
          <Stepper label="Gewichtung" value={sec.weight} min={0} max={3} step={0.5} onChange={(weight) => onChange({ weight })} format={(v) => `×${fmtPts(v)}`} />
        </Group>
        <Group label="Gleichzeitig" help={sec.maxPerHeat == null ? 'Wie beim Wettkampf' : undefined}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Stepper label="Fahrzeuge gleichzeitig" value={per} min={1} max={8} onChange={(v) => onChange({ maxPerHeat: v })} />
            {sec.maxPerHeat != null && (
              <button type="button" className="btn ghost" style={{ minHeight: 30, fontSize: 12, padding: '0 6px' }} onClick={() => onChange({ maxPerHeat: undefined })}>
                zurücksetzen
              </button>
            )}
          </span>
        </Group>
        <Group label="Dauer pro Lauf" help={sec.minutes ? 'Wer nach Ablauf der Zeit vorne liegt, gewinnt' : undefined}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Segment small label="Runden oder Zeit" value={sec.minutes ? 'time' : 'laps'} onChange={(v) => onChange(v === 'time' ? { minutes: sec.minutes ?? (sec.format === 'quali' ? 2 : 5) } : { minutes: undefined })} options={[['laps', 'Runden'], ['time', 'Zeit']]} />
            {sec.minutes ? (
              <Stepper label="Minuten" value={sec.minutes} min={1} max={60} onChange={(minutes) => onChange({ minutes })} format={(v) => `${v} Min.`} />
            ) : (
              <Stepper label="Runden" value={sec.laps ?? 10} min={1} max={200} onChange={(laps) => onChange({ laps })} />
            )}
          </span>
        </Group>
        {(sec.format === 'races' || sec.format === 'team') && (
          <Group label="Durchgänge">
            <Stepper label="Durchgänge" value={sec.rounds ?? 1} min={1} max={10} onChange={(rounds) => onChange({ rounds })} />
          </Group>
        )}
        {sec.format === 'ladder' && (
          <Group label="Steigen auf" help={sec.advanceAuto ? 'je Rennen die Hälfte, Rennen möglichst gleich groß' : 'je Rennen'}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Segment small label="Aufsteiger" value={sec.advanceAuto ? 'auto' : 'fixed'} onChange={(v) => onChange({ advanceAuto: v === 'auto' || undefined })} options={[['auto', 'Automatisch'], ['fixed', 'Fest']]} />
              {!sec.advanceAuto && <Stepper label="Weiter je Lauf" value={Math.min(sec.advance ?? 2, per - 1)} min={1} max={Math.max(1, per - 1)} onChange={(advance) => onChange({ advance })} />}
            </span>
          </Group>
        )}
        {sec.format === 'ko' && (
          <Group label="Kommen weiter" help="je Lauf, in größeren Gruppen einer mehr">
            <Stepper label="Weiter je Lauf" value={Math.min(sec.advance ?? 1, per - 1)} min={1} max={Math.max(1, per - 1)} onChange={(advance) => onChange({ advance })} />
          </Group>
        )}
      </div>
      {sec.format === 'team' && plan && <TeamPlanHint plan={plan} sec={sec} onChange={onChange} />}
      {sec.format !== 'free' && (
        <label className="check" style={{ alignSelf: 'flex-start', background: 'var(--card)' }}>
          <input type="checkbox" checked={sec.cars != null} onChange={(e) => onChange({ cars: e.target.checked ? JSON.parse(JSON.stringify(def.cars)) : undefined })} />
          Eigene Fahrzeugregel
        </label>
      )}
      {sec.cars && <CarRuleEditor rule={sec.cars} onChange={(cars) => onChange({ cars })} drivers={def.drivers} />}
      {sec.cars && <CapNote rule={sec.cars} per={per} />}
      {sec.format === 'custom' && <CustomHeats sec={sec} def={def} onChange={onChange} />}
    </div>
  )
}

/** Hinweis, wenn weniger Autos ausgewählt sind, als gleichzeitig fahren sollen */
function CapNote({ rule, per }: { rule: CarRule; per: number }) {
  const cap = carCap(rule)
  if (cap == null || cap >= per) return null
  return <span style={{ fontSize: 12, color: 'var(--crash)' }}>Nur {cap} {cap === 1 ? 'Auto' : 'Autos'} ausgewählt – es fahren höchstens {cap} gleichzeitig.</span>
}

const TEAM_PLAN_TEXT: Record<TeamPlan['mode'], string> = {
  all: 'alle Teams zusammen',
  pairs: 'jedes Team einmal gegen jedes',
  groups: 'jedes Team einmal, Gruppen je Durchgang neu gemischt',
  split: 'jedes Team gegen jedes, mit wechselnder Aufstellung',
  slots: 'die Nr. 1 jedes Teams gegeneinander, dann die Nr. 2 usw.',
}

/** Wie viele Rennen ein Durchgang hat; bei Paarungen optional nur ein halber Durchgang */
function TeamPlanHint({ plan, sec, onChange }: { plan: TeamPlan; sec: SectionDef; onChange: (p: Partial<SectionDef>) => void }) {
  const rounds = sec.rounds ?? 1
  const half = plan.halfPossible && rounds === 1 && !!sec.half
  const halfCount = plan.halfCount
  const total = half ? null : plan.perRound * rounds
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Aufteilung</span>
      <Segment
        small
        label="Aufteilung"
        value={sec.teamMode ?? 'auto'}
        onChange={(v) => onChange({ teamMode: v === 'auto' ? undefined : v })}
        options={[
          ['auto', 'Auto'],
          ['teams', 'Team gegen Team'],
          ['single', 'Einer je Team'],
        ]}
      />
      <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
        1 Durchgang = {plan.perRound} Rennen ({TEAM_PLAN_TEXT[plan.mode]}){total != null && rounds > 1 ? ` · insgesamt ${total} Rennen` : ''}
        {half && ` · halber Durchgang: ${halfCount} Rennen, Gegner nach Elo ausgeglichen`}
      </span>
      {plan.mode === 'split' && (
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
          Ganze Teams passen nicht auf die Bahn: Jedes Team schickt {plan.perTeam} Fahrer pro Rennen. Wer fährt, wechselt reihum, sodass jeder gleich oft dran ist; die Aufstellungen sind versetzt, damit möglichst jeder einmal auf jeden trifft.
        </span>
      )}
      {sec.teamMode === 'single' && plan.mode === 'slots' && (
        <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>Die Stärksten jedes Teams fahren gegeneinander, dann die Zweitstärksten usw. Ist ein Team kleiner, fährt sein Schwächster doppelt.</span>
      )}
      {plan.halfPossible && rounds === 1 && (
        <label className="check" style={{ alignSelf: 'flex-start', background: 'var(--card)' }}>
          <input type="checkbox" checked={!!sec.half} onChange={(e) => onChange({ half: e.target.checked || undefined })} />
          Nur halber Durchgang
        </label>
      )}
      {(total ?? halfCount) > 20 && <span style={{ fontSize: 12, color: 'var(--crash)' }}>Das sind sehr viele Rennen – weniger Teams, größere Teams oder ein halber Durchgang verkürzen den Abschnitt.</span>}
    </div>
  )
}

function CustomHeats({ sec, def, onChange }: { sec: SectionDef; def: EventDef; onChange: (p: Partial<SectionDef>) => void }) {
  const heats = sec.heats ?? []
  const set = (list: typeof heats) => onChange({ heats: list })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {heats.map((h, k) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ fontSize: 13 }}>Lauf {k + 1}</b>
            <Segment
              small
              label="Art"
              value={h.kind}
              onChange={(kind) => set(heats.map((x, i) => (i === k ? { ...x, kind } : x)))}
              options={[
                ['race', 'Rennen'],
                ['quali', 'Quali'],
              ]}
            />
            <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => set(heats.filter((_, i) => i !== k))} aria-label={`Lauf ${k + 1} entfernen`}>
              ✕
            </button>
          </div>
          <div className="chips">
            {def.drivers.map((d) => (
              <ToggleChip key={d} on={h.drivers.includes(d)} onClick={() => set(heats.map((x, i) => (i === k ? { ...x, drivers: x.drivers.includes(d) ? x.drivers.filter((y) => y !== d) : [...x.drivers, d] } : x)))}>
                {d}
              </ToggleChip>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn round" style={{ alignSelf: 'flex-start' }} onClick={() => set([...heats, { kind: 'race', drivers: [] }])}>
        + Lauf
      </button>
    </div>
  )
}

function AddSection({ onAdd }: { onAdd: (f: SectionFormat) => void }) {
  const [format, setFormat] = useState<SectionFormat>('races')
  return (
    <div className="filters">
      <select className="select" value={format} onChange={(e) => setFormat(e.target.value as SectionFormat)} aria-label="Format des neuen Abschnitts">
        {(Object.keys(FORMAT_LABEL) as SectionFormat[]).map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABEL[f]}
          </option>
        ))}
      </select>
      <button type="button" className="btn round" onClick={() => onAdd(format)}>
        + Abschnitt
      </button>
    </div>
  )
}

function HeatOverrideEditor({ heat, def, update }: { heat: Heat; def: EventDef; update: (p: Partial<EventDef>) => void }) {
  const over: HeatOverride = def.overrides[heat.id] ?? {}
  const current = heat.entrants.map((e) => e.name).filter((n): n is string => n != null)
  const sec = def.sections.find((s) => s.id === heat.sectionId)
  const options = useCarOptions((sec?.cars ?? def.cars).scale)
  const set = (next: HeatOverride) => {
    const rest = { ...def.overrides }
    if (!next.drivers?.length && !Object.keys(next.cars ?? {}).length) delete rest[heat.id]
    else rest[heat.id] = next
    update({ overrides: rest })
  }
  const drivers = over.drivers ?? current
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Besetzung</span>
      <div className="chips">
        {[...new Set([...def.drivers, ...drivers])].map((d) => (
          <ToggleChip key={d} on={drivers.includes(d)} onClick={() => set({ ...over, drivers: drivers.includes(d) ? drivers.filter((x) => x !== d) : [...drivers, d] })}>
            {d}
          </ToggleChip>
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Autos</span>
      {drivers.map((d) => (
        <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, fontSize: 13 }}>{d}</span>
          <select className="select" value={over.cars?.[d] ?? ''} onChange={(e) => set({ ...over, cars: { ...(over.cars ?? {}), [d]: e.target.value } })} aria-label={`Auto für ${d}`}>
            <option value="">{heat.cars[d] && !over.cars?.[d] ? `wie geplant (${heat.cars[d]})` : 'wie geplant'}</option>
            {options.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ))}
      {def.overrides[heat.id] && (
        <button type="button" className="btn ghost" style={{ alignSelf: 'flex-start', minHeight: 30, fontSize: 12 }} onClick={() => set({})}>
          Änderungen an diesem Lauf zurücksetzen
        </button>
      )}
    </div>
  )
}

function ChanceBar({ name, share }: { name: string; share: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
      <span style={{ width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span className="bar" style={{ flex: 1, height: 8 }}>
        <span style={{ width: `${Math.max(2, share * 100)}%`, borderRadius: 4, background: EVENT_ACCENT }} />
      </span>
      <span className="num" style={{ width: 44, textAlign: 'right' }}>
        {Math.round(share * 100)} %
      </span>
    </div>
  )
}

function SimResult({ sim }: { sim: Simulation }) {
  const chances = [...sim.winChance].sort((a, b) => b[1] - a[1])
  const teamChances = [...sim.teamChance].sort((a, b) => b[1] - a[1])
  const per = [...sim.perDriver].sort((a, b) => b[1] - a[1])
  const minRaces = per.length ? per[per.length - 1][1] : 0
  const maxRaces = per.length ? per[0][1] : 0
  const h = Math.floor(sim.minutes / 60)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="tiles">
        <div className="tile">
          <span className="v">{sim.heats}</span>
          <span className="l">Läufe</span>
        </div>
        <div className="tile">
          <span className="v">{h ? `${h} h ${sim.minutes % 60} min` : `${sim.minutes} min`}</span>
          <span className="l">Dauer ca.</span>
        </div>
        <div className="tile">
          <span className="v">{minRaces === maxRaces ? minRaces : `${minRaces}–${maxRaces}`}</span>
          <span className="l">Läufe je Fahrer</span>
        </div>
        <div className="tile">
          <span className="v">{Math.round(sim.close * 100)} %</span>
          <span className="l">knappe Entscheidung</span>
        </div>
      </div>
      {teamChances.length > 0 && (
        <>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Siegchance je Team</span>
          {teamChances.map(([n, c]) => (
            <ChanceBar key={n} name={n} share={c} />
          ))}
        </>
      )}
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{teamChances.length ? 'Gesamtsieg einzeln (Teampunkte zählen für alle Mitglieder)' : 'Siegchance laut Probelauf'}</span>
      {chances.map(([n, c]) => (
        <ChanceBar key={n} name={n} share={c} />
      ))}
      {minRaces < maxRaces && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Manche fahren deutlich öfter als andere ({per.map(([n, c]) => `${n.split(' ')[0]} ${c}`).join(', ')}).</span>}
      {sim.reasons.length > 0 && (
        <div className="inner" style={{ gap: 4, padding: '10px 12px' }}>
          <b style={{ fontSize: 13 }}>Warum es einen klaren Favoriten gibt</b>
          {sim.reasons.map((r) => (
            <span key={r} style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
              • {r}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function FilesCard({ def, update, state, folderId }: { def: EventDef; update: (p: Partial<EventDef>) => void; state: ReturnType<typeof computeFor>; folderId: string }) {
  const data = useData()
  const sessions = eventSessions(data.allSessions, folderId).sort((a, b) => a.date.localeCompare(b.date) || a.createdTime.localeCompare(b.createdTime))
  if (!sessions.length) return null
  const heatOf = new Map(state.heats.filter((h) => h.session).map((h) => [h.session!.fileId, h]))
  const choices = state.heats.filter((h) => !state.def.sections.find((s) => s.id === h.sectionId && s.format === 'free'))
  const set = (fileId: string, target: string) => {
    const matches = { ...def.matches }
    if (target) matches[fileId] = target
    else delete matches[fileId]
    update({ matches })
  }
  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">Dateien zuordnen</span>
        <span className="hint">{sessions.length} im Ordner</span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>Die App ordnet jede Datei nach Besetzung und Reihenfolge zu. Stimmt etwas nicht, hier korrigieren – oder eine Datei ignorieren (z. B. Fehlstart).</span>
      {sessions.map((s) => {
        const h = heatOf.get(s.fileId)
        return (
          <div key={s.fileId} className="inner" style={{ padding: 10, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13 }}>
              <b>{s.type}</b> · {formatDate(s.date)} {new Date(s.createdTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · {s.results.map((r) => r.driver).join(', ')}
            </span>
            <select className="select" value={def.matches[s.fileId] ?? ''} onChange={(e) => set(s.fileId, e.target.value)} aria-label={`Zuordnung für ${s.fileName}`}>
              <option value="">Automatisch{h ? ` (${h.label})` : ' (passt zu keinem Lauf)'}</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} – {c.entrants.map((e) => e.label).join(', ')}
                </option>
              ))}
              <option value="ignore">Ignorieren</option>
            </select>
          </div>
        )
      })}
    </section>
  )
}
