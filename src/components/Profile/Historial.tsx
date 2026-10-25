import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Jornada, Alineacion, Apuesta } from '../../types'
import { construirHistorial, type FilaHistorial } from '../../lib/historial'

const RESULTADO = { gana: 'Victoria', pierde: 'Derrota', empata: 'Empate' } as const

const claseSigno = (n: number) => (n > 0 ? 'pts-positive' : n < 0 ? 'pts-negative' : '')

export function Historial({ usuarioId }: { usuarioId: string }) {
  const [filas, setFilas] = useState<FilaHistorial[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('jornadas').select('*'),
      supabase.from('alineaciones').select('jornada, puntos_jornada').eq('usuario_id', usuarioId),
      supabase.from('presupuestos').select('jornada, presupuesto').eq('usuario_id', usuarioId),
      supabase.from('apuestas').select('jornada, importe, resuelto, ganancia').eq('usuario_id', usuarioId),
    ]).then(([j, a, p, ap]) => {
      if (cancelled) return
      for (const r of [j, a, p, ap]) if (r.error) console.error('Historial fetch error:', r.error)
      setFilas(construirHistorial(
        (j.data ?? []) as Jornada[],
        (a.data ?? []) as Pick<Alineacion, 'jornada' | 'puntos_jornada'>[],
        ((p.data ?? []) as { jornada: number; presupuesto: number }[])
          .map(x => ({ jornada: x.jornada, presupuesto: Number(x.presupuesto) })),
        (ap.data ?? []) as Pick<Apuesta, 'jornada' | 'importe' | 'resuelto' | 'ganancia'>[],
      ))
    })
    return () => {
      cancelled = true
    }
  }, [usuarioId])

  return (
    <div className="profile-field">
      <h3>Mi historial</h3>
      {filas === null ? (
        <div className="loading-msg">Cargando...</div>
      ) : filas.length === 0 ? (
        <p className="placeholder">Todavía no hay jornadas resueltas.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Jornada</th>
              <th>Resultado</th>
              <th>Pts</th>
              <th>Total</th>
              <th>Presup.</th>
              <th>Apuestas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.numero}>
                <td data-label="Jornada">{f.orden}</td>
                <td data-label="Resultado">
                  {f.resultado ? RESULTADO[f.resultado] : '-'}
                  {f.golesFavor !== null && f.golesContra !== null && ` ${f.golesFavor}-${f.golesContra}`}
                </td>
                <td data-label="Puntos">{f.puntos}</td>
                <td data-label="Total">{f.acumulado}</td>
                <td data-label="Presupuesto">{Math.round(f.presupuesto)}€</td>
                <td data-label="Apuestas" className={f.neto === null ? '' : claseSigno(f.neto)}>
                  {f.neto === null ? '-' : `${f.neto > 0 ? '+' : ''}${f.neto}€`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
