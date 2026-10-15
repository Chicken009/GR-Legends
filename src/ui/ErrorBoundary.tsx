import { Component, type ReactNode } from 'react'

/** Zeigt statt eines leeren Bildschirms die Fehlermeldung, falls beim Darstellen etwas abstürzt. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="state">
        <p style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: 0 }}>Da ist etwas schiefgelaufen.</p>
        <p className="error" style={{ margin: 0, maxWidth: 520, wordBreak: 'break-word' }}>
          {error.message}
        </p>
        <button className="btn" onClick={() => window.location.reload()}>
          Neu laden
        </button>
        <details style={{ maxWidth: 520, fontSize: 11, textAlign: 'left' }}>
          <summary>Details für die Fehlersuche</summary>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{`${error.stack ?? ''}\n\n${navigator.userAgent}`}</pre>
        </details>
      </div>
    )
  }
}
