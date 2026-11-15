import { useState } from 'react'
import type { PuntoEvolucion } from '../../lib/precio'

interface Props {
  serie: PuntoEvolucion[]
}

type Modo = 'puntos' | 'precio'

// Lienzo SVG en unidades propias (escala con el ancho de la ficha). L = hueco del eje Y.
const W = 320
const H = 150
const L = 38
const R = 10
const T = 18
const B = 24
const MAX_ETIQUETAS = 8

/** Evolución del jugador por jornada: barras de puntos o línea de precio (€), a elegir. */
export function PlayerChart({ serie }: Props) {
  const [modo, setModo] = useState<Modo>('puntos')
  if (serie.length === 0) return null

  const n = serie.length
  const valores = serie.map(p => (modo === 'puntos' ? p.puntos : p.precio))
  const mn = Math.min(...valores, ...(modo === 'puntos' ? [0] : []))
  const mx = Math.max(...valores, ...(modo === 'puntos' ? [0] : []))
  // Margen para que las etiquetas no se corten; un mínimo si la serie es plana.
  const pad = Math.max((mx - mn) * 0.18, modo === 'precio' ? 10 : 1)
  const lo = mn - pad
  const hi = mx + pad
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B)
  const paso = (W - L - R) / n
  const x = (i: number) => L + (i + 0.5) * paso
  const ancho = Math.min(28, paso * 0.6)
  const conEtiquetas = n <= MAX_ETIQUETAS
  const cadaX = Math.ceil(n / 10)
  const fmt = (v: number) => (modo === 'puntos' ? (v > 0 ? `+${v}` : `${v}`) : `${v}€`)
  const ticks = [...new Set(modo === 'puntos' ? [mx, 0, mn] : [mx, mn])]

  return (
    <div className="player-chart">
      <div className="player-chart-head">
        <h4>Evolución</h4>
        <div className="filter-chips">
          {(['puntos', 'precio'] as const).map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              className={`filter-chip ${modo === m ? 'active-all' : ''}`}
              onClick={() => setModo(m)}
            >
              {m === 'puntos' ? 'Puntos' : 'Precio'}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${modo === 'puntos' ? 'Puntos por jornada' : 'Precio tras cada jornada'}: ${serie.map((p, i) => `J${p.orden} ${fmt(valores[i])}`).join(', ')}`}
      >
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 && modo === 'puntos' ? 0.35 : 0.12} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end">{Math.round(t)}</text>
          </g>
        ))}

        {modo === 'puntos' && serie.map((p, i) => {
          const y0 = y(0)
          const yv = y(p.puntos)
          return (
            <g key={p.jornada}>
              <title>{`Jornada ${p.orden}: ${p.jugada ? fmt(p.puntos) + ' pts' : 'no jugó'}`}</title>
              {p.jugada
                ? <rect x={x(i) - ancho / 2} y={Math.min(y0, yv)} width={ancho} height={Math.max(Math.abs(yv - y0), 1)} rx={3} fill={p.puntos >= 0 ? 'var(--success)' : 'var(--error)'} />
                : <text x={x(i)} y={y0 - 4} textAnchor="middle">–</text>}
              {conEtiquetas && p.jugada && (
                <text x={x(i)} y={p.puntos >= 0 ? yv - 4 : yv + 11} textAnchor="middle" className="player-chart-valor">{fmt(p.puntos)}</text>
              )}
            </g>
          )
        })}

        {modo === 'precio' && (
          <>
            <polyline
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinejoin="round"
              points={serie.map((p, i) => `${x(i)},${y(p.precio)}`).join(' ')}
            />
            {serie.map((p, i) => (
              <g key={p.jornada}>
                <title>{`Jornada ${p.orden}: ${p.precio}€`}</title>
                <circle cx={x(i)} cy={y(p.precio)} r={3.5} fill="var(--primary)" />
                {conEtiquetas && <text x={x(i)} y={y(p.precio) - 8} textAnchor="middle" className="player-chart-valor">{p.precio}€</text>}
              </g>
            ))}
          </>
        )}

        {serie.map((p, i) => i % cadaX === 0 && (
          <text key={p.jornada} x={x(i)} y={H - 6} textAnchor="middle">J{p.orden}</text>
        ))}
      </svg>
    </div>
  )
}
