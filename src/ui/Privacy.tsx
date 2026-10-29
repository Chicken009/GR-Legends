import { useState, type ReactNode } from 'react'
import { Sheet } from './components'

/**
 * Kontakt des Verantwortlichen – absichtlich nicht als Klartext im Code, damit ihn Suchmaschinen,
 * die GitHub-Suche und einfache Adress-Sammler nicht finden. Entschlüsselt wird erst beim Anzeigen.
 */
const NAME = [121, 112, 133, 127, 90, 43, 119, 119, 116, 95]
const MAIL = [120, 122, 110, 57, 119, 116, 108, 120, 114, 75, 60, 60, 67, 131, 108, 120, 123]
const decode = (xs: number[]) => String.fromCharCode(...[...xs].reverse().map((c) => c - 11))

const STAND = 'Oktober 2026'

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h2>
      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </section>
  )
}

/** Kontakt erst auf Tippen anzeigen (nicht im ersten Seitenaufbau) */
function Contact() {
  const [shown, setShown] = useState(false)
  if (!shown)
    return (
      <button className="btn round" onClick={() => setShown(true)} style={{ alignSelf: 'flex-start' }}>
        Kontakt anzeigen
      </button>
    )
  const mail = decode(MAIL)
  return (
    <span>
      {decode(NAME)}
      <br />
      E-Mail: <a href={`mailto:${mail}`} style={{ color: 'var(--text)', textDecoration: 'underline' }}>{mail}</a>
    </span>
  )
}

export function PrivacySheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Datenschutz">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Datenschutz</h1>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Stand: {STAND}</span>
        </div>

        <Part title="Worum es geht">
          <p style={{ margin: 0 }}>
            GR Legends ist eine private, nicht kommerzielle Auswertung von Slotcar-Rennen in einem Freundeskreis. Es gibt keine Werbung, keine Anmeldung und keine Einnahmen.
          </p>
        </Part>

        <Part title="Verantwortlich">
          <Contact />
          <p style={{ margin: 0 }}>Für alle Fragen zu deinen Daten, für Änderungen deines Anzeigenamens oder wenn du nicht mehr angezeigt werden möchtest.</p>
        </Part>

        <Part title="Welche Daten angezeigt werden">
          <p style={{ margin: 0 }}>
            Ergebnisse aus der Zeitmessung (Smartrace): Kürzel bzw. der Anzeigename, den jede Person selbst festlegt, Platzierungen, Runden- und Bestzeiten, gefahrene Autos und Abflüge. Daraus berechnet die App
            Ranglisten (Elo), Saisonpunkte, Medaillen, Challenges, Statistiken und Jahresrückblicke. Fahrzeugfotos zeigen nur Autos, keine Personen.
          </p>
          <p style={{ margin: 0 }}>
            Rechtsgrundlage ist die Einwilligung der Fahrerinnen und Fahrer (Art. 6 Abs. 1 lit. a DSGVO), bei Minderjährigen die der Erziehungsberechtigten. Die Einwilligung kann jederzeit ohne Angabe von
            Gründen widerrufen werden – dann wird der Name durch ein neutrales Kürzel ersetzt oder ausgeblendet.
          </p>
        </Part>

        <Part title="Öffentlich im Internet">
          <p style={{ margin: 0 }}>
            Die Seite ist ohne Anmeldung für jeden mit dem Link erreichbar. Suchmaschinen werden gebeten, sie nicht aufzunehmen (noindex) – das ist eine Bitte, kein Schutz. Bitte teile Links und Bilder aus
            der App nur im Freundeskreis.
          </p>
        </Part>

        <Part title="Hosting bei GitHub">
          <p style={{ margin: 0 }}>
            Die Seite liegt bei GitHub Pages (GitHub, Inc., USA). Beim Aufruf verarbeitet GitHub technisch notwendige Daten wie IP-Adresse, Zeitpunkt und Browser, um die Seite auszuliefern und vor Missbrauch
            zu schützen. Die Übermittlung in die USA stützt sich auf das EU-US Data Privacy Framework. Der Programmcode der App ist öffentlich, enthält aber keine Rennergebnisse und keine Namen.
          </p>
        </Part>

        <Part title="Daten aus Google Drive">
          <p style={{ margin: 0 }}>
            Die Rennergebnisse und Einstellungen liegen in einem freigegebenen Google-Drive-Ordner. Beim Öffnen lädt dein Browser sie direkt bei Google (Google Ireland Ltd. bzw. Google LLC, USA). Dabei
            erhält Google deine IP-Adresse und Browserdaten. Auch hier gilt das EU-US Data Privacy Framework.
          </p>
        </Part>

        <Part title="Keine Cookies, kein Tracking">
          <p style={{ margin: 0 }}>
            Die App setzt keine Cookies und nutzt keine Analyse- oder Werbedienste. Schriften und Programmteile werden von der Seite selbst geladen, nicht von fremden Servern.
          </p>
          <p style={{ margin: 0 }}>
            Im Speicher deines Browsers merkt sich die App Einstellungen auf deinem Gerät, z. B. wer du bist („Das bin ich“), gewählte Ansichten und schon gesehene Medaillen. Außerdem legt sie die
            öffentlichen Rennergebnisse aus dem Google-Drive-Ordner dort ab, damit sie nicht bei jedem Besuch neu geladen werden; Dateien, die aus dem Ordner verschwinden, werden auch dort gelöscht. Diese
            Angaben verlassen dein Gerät nicht und lassen sich über die Browsereinstellungen jederzeit löschen.
          </p>
        </Part>

        <Part title="Speicherdauer">
          <p style={{ margin: 0 }}>Die Ergebnisse bleiben gespeichert, solange die Auswertung betrieben wird oder bis zum Widerruf der Einwilligung.</p>
        </Part>

        <Part title="Deine Rechte">
          <p style={{ margin: 0 }}>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung, auf Widerspruch und auf Widerruf deiner Einwilligung. Melde dich dafür einfach über den Kontakt oben. Du
            kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der deines Bundeslandes.
          </p>
        </Part>
      </div>
    </Sheet>
  )
}

/** Kleiner Link ganz unten auf den Seiten */
export function PrivacyFooter() {
  const [open, setOpen] = useState(false)
  return (
    <footer style={{ display: 'flex', justifyContent: 'center', padding: '8px 16px 20px' }}>
      <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--faint)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 8 }}>
        Datenschutz
      </button>
      {open && <PrivacySheet onClose={() => setOpen(false)} />}
    </footer>
  )
}
