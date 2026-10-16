import { useEffect, useState, type ReactNode } from 'react'
import { config } from '../config'
import { downloadDrivePhoto, drivePhotoUrl, photoKey } from '../data/drive'
import { useData } from './components'
import { NAV_ICONS, StrokeIcon } from './icons'

/** Datei-ID des Fotos zu einem Auto (Anzeigename oder einer seiner Smartrace-Namen) */
export function usePhotoId(car: string): string | undefined {
  const { photos, settings } = useData()
  const names = [car, ...Object.entries(settings.cars).filter(([, e]) => e.displayName === car).map(([orig]) => orig)]
  return names.map((n) => photos[photoKey(n)]).find(Boolean)
}

/** Fahrzeugfoto: erst das Drive-Vorschaubild, bei Fehler über die Drive API, sonst `fallback` */
export function CarPhoto({ fileId, alt, width = 1000, fallback }: { fileId: string; alt: string; width?: number; fallback: ReactNode }) {
  const [src, setSrc] = useState(() => drivePhotoUrl(fileId, width))
  const [stage, setStage] = useState<'thumb' | 'api' | 'failed'>('thumb')
  useEffect(() => {
    if (stage !== 'api' || !config.googleApiKey) return
    let url: string | null = null
    let cancelled = false
    downloadDrivePhoto(fileId, config.googleApiKey)
      .then((u) => {
        url = u
        if (cancelled) URL.revokeObjectURL(u)
        else setSrc(u)
      })
      .catch(() => !cancelled && setStage('failed'))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [stage, fileId])
  if (stage === 'failed') return <>{fallback}</>
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      onError={() => setStage(stage === 'thumb' && config.googleApiKey ? 'api' : 'failed')}
    />
  )
}

/** Kleines Bild für Listen und Auswahl: Foto oder Auto-Symbol */
export function CarThumb({ car, size = 36 }: { car: string; size?: number }) {
  const photo = usePhotoId(car)
  const icon = <StrokeIcon d={NAV_ICONS.cars} size={size * 0.55} color="#6B7480" />
  return (
    <span className="thumb" style={{ width: size, height: size }}>
      {photo ? <CarPhoto key={photo} fileId={photo} alt="" width={120} fallback={icon} /> : icon}
    </span>
  )
}
