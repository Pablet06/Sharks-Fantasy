import { supabase } from './supabase.js'
import { getRounds, getRoundMatches, type Round } from './leverade.js'
import { fetchMatchStats, SHARKS_TEAM_NAME, type RawPlayer } from './fncv.js'
import { resolvePlayer, type DbPlayer } from './match.js'
import { calcMatchPoints, EMPTY_STATS, type PlayerStats, type Position } from './points.js'
import { getTournamentId, setConfig } from './config.js'

const STAT_KEYS = Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]

export function rawToStats(raw: RawPlayer, golesContra: number): PlayerStats {
  return {
    partidos: raw.jugo ? 1 : 0,
    goles: raw.G,
    goles_penalti: raw.GP,
    penaltis_fallados: raw.PF,
    faltas_penalti: raw.P,
    tarjetas: raw.TA + raw.TR,
    expulsiones: raw.EX,
    expulsiones_graves: raw.ED + raw.EB + raw.EN + raw.EP,
    goles_contra: raw.jugo ? golesContra : 0,
  }
}

async function getDbPlayers(): Promise<(DbPlayer & { pos: Position })[]> {
  const { data, error } = await supabase
    .from('jugadores')
    .select('id, name, nick, pos, leverade_id')
  if (error || !data) throw new Error(`jugadores fetch failed: ${error?.message}`)
  return data as unknown as (DbPlayer & { pos: Position })[]
}

export async function syncJornada(
  tournamentId: string,
  round: Round,
  dbPlayers: (DbPlayer & { pos: Position })[],
): Promise<{ jornada: number; rows: number; unmatched: string[] } | null> {
  const matches = await getRoundMatches(round.id)
  const finished = matches.filter(m => m.finished)

  let sharksMatch: Awaited<ReturnType<typeof fetchMatchStats>> | null = null
  let matchDate: string | null = null
  for (const m of finished) {
    const stats = await fetchMatchStats(tournamentId, m.id)
    if (stats.local === SHARKS_TEAM_NAME || stats.visitante === SHARKS_TEAM_NAME) {
      sharksMatch = stats
      matchDate = m.date
      break
    }
  }
  // Spec A4: a found-but-empty /stats sheet (parse regression, page not yet
  // populated) must NOT write dense zero rows — incremental mode would then
  // never revisit the jornada. Treat it like "no match".
  if (!sharksMatch || sharksMatch.jugadores.length === 0) return null

  const golesContra =
    sharksMatch.sharks === 'local' ? sharksMatch.golesVisitante : sharksMatch.golesLocal

  const unmatched: string[] = []
  const byPlayerId = new Map<number, PlayerStats>()
  for (const rp of sharksMatch.jugadores) {
    const db = resolvePlayer(rp, dbPlayers)
    if (!db) { unmatched.push(`J${round.jornada}: ${rp.nombre} (${rp.leveradeId ?? 'sin id'})`); continue }
    byPlayerId.set(db.id, rawToStats(rp, golesContra))
  }

  // Dense historial: every rostered player gets a row, 0s if absent.
  const upserts = dbPlayers.map(db => {
    const stats = byPlayerId.get(db.id) ?? { ...EMPTY_STATS }
    return {
      jugador_id: db.id,
      jornada: round.jornada,
      stats,
      puntos: calcMatchPoints(db.pos, stats),
      date: matchDate ?? new Date().toISOString(),
    }
  })

  const { error } = await supabase
    .from('historial')
    .upsert(upserts, { onConflict: 'jugador_id,jornada' })
  if (error) throw new Error(`historial upsert J${round.jornada}: ${error.message}`)

  return { jornada: round.jornada, rows: upserts.length, unmatched }
}

export async function recalc(): Promise<void> {
  const { data: hist } = await supabase.from('historial').select('jugador_id, stats, puntos')
  const { data: jugadores } = await supabase.from('jugadores').select('id, numero')
  const { data: usuarios } = await supabase.from('usuarios').select('id, equipo')
  if (!hist || !jugadores || !usuarios) throw new Error('recalc: fetch failed')

  // Accumulated stats per player (goles_contra kept at 0 — per-match only).
  const acc = new Map<number, PlayerStats>()
  const puntosByPlayer = new Map<number, number>()
  for (const h of hist) {
    const cur = acc.get(h.jugador_id) ?? { ...EMPTY_STATS }
    const s = h.stats as PlayerStats
    for (const k of STAT_KEYS) cur[k] += s[k] ?? 0
    cur.goles_contra = 0
    acc.set(h.jugador_id, cur)
    puntosByPlayer.set(h.jugador_id, (puntosByPlayer.get(h.jugador_id) ?? 0) + (h.puntos ?? 0))
  }

  const failed: string[] = []
  for (const j of jugadores) {
    const { error } = await supabase.from('jugadores')
      .update({ stats: acc.get(j.id) ?? { ...EMPTY_STATS } })
      .eq('id', j.id)
    if (error) failed.push(`jugadores id=${j.id}: ${error.message}`)
  }

  const puntosByNumero = new Map<number, number>()
  for (const j of jugadores) puntosByNumero.set(j.numero, puntosByPlayer.get(j.id) ?? 0)

  for (const u of usuarios) {
    const puntos = (u.equipo as number[]).reduce((sum, n) => sum + (puntosByNumero.get(n) ?? 0), 0)
    const { error } = await supabase.from('usuarios').update({ puntos }).eq('id', u.id)
    if (error) failed.push(`usuarios id=${u.id}: ${error.message}`)
  }
  if (failed.length) throw new Error(`recalc: ${failed.length} write(s) failed:\n${failed.join('\n')}`)
  console.log(`recalc: ${jugadores.length} jugadores, ${usuarios.length} usuarios`)
}

/** historial jornadas that are no longer on the current Leverade calendar. */
export function staleJornadas(calendarJornadas: number[], historialJornadas: number[]): number[] {
  // Empty calendar = failed enumeration, not "every jornada is stale". Never delete.
  if (calendarJornadas.length === 0) return []
  const keep = new Set(calendarJornadas)
  return [...new Set(historialJornadas)].filter(j => !keep.has(j))
}

export async function runSync(opts: { backfill?: boolean; jornada?: number }): Promise<void> {
  if (opts.backfill && opts.jornada != null) {
    // --backfill rewrites the whole season; the post-loop cleanup would then
    // delete every jornada except the one --jornada narrowed us to.
    throw new Error('runSync: --backfill y --jornada son mutuamente excluyentes')
  }
  const tournamentId = await getTournamentId()
  const dbPlayers = await getDbPlayers()
  const rounds = await getRounds(tournamentId)

  const targets = opts.jornada
    ? rounds.filter(r => r.jornada === opts.jornada)
    : rounds

  const allUnmatched: string[] = []
  const failedJornadas: string[] = []
  const syncedJornadas = new Set<number>()
  for (const round of targets) {
    try {
      if (!opts.backfill && !opts.jornada) {
        // incremental: skip jornadas already present in historial
        const { count } = await supabase
          .from('historial')
          .select('*', { count: 'exact', head: true })
          .eq('jornada', round.jornada)
        if ((count ?? 0) > 0) continue
      }
      const res = await syncJornada(tournamentId, round, dbPlayers)
      if (!res) { console.log(`J${round.jornada}: no finished Sharks match or empty stats`); continue }
      // syncJornada upserts all 17 dense rows on (jugador_id, jornada), so an
      // existing jornada is overwritten in place — no pre-delete needed, and a
      // jornada that turns out unfinished/empty keeps its prior rows untouched.
      syncedJornadas.add(res.jornada)
      console.log(`J${res.jornada}: ${res.rows} rows, ${res.unmatched.length} unmatched`)
      allUnmatched.push(...res.unmatched)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`J${round.jornada}: sync failed: ${msg}`)
      failedJornadas.push(`J${round.jornada}: ${msg}`)
    }
  }

  // Every jornada threw (network down, Cloudflare block): do NOT wipe, recalc,
  // or timestamp — that reports false success and, for --backfill, erases the
  // season. Exit non-zero so CI flags it.
  if (syncedJornadas.size === 0 && failedJornadas.length > 0) {
    console.error(`FAILED JORNADAS (all of them):\n${failedJornadas.join('\n')}`)
    process.exitCode = 1
    return
  }

  // Nothing new to write (incremental run, everything already present). The
  // check succeeded, so bump last_sync_at, but skip recalc/cleanup.
  if (syncedJornadas.size === 0) {
    console.log('sync: nothing new')
    await setConfig('last_sync_at', new Date().toISOString())
    return
  }

  if (opts.backfill) {
    // Drop rows only for jornadas no longer on the Leverade calendar
    // (renumbered/removed rounds). A calendar jornada that failed or returned
    // no rows this run keeps whatever it already had; exit-1 below flags the
    // incomplete backfill.
    const { data: histRows, error: readErr } = await supabase.from('historial').select('jornada')
    if (readErr) throw new Error(`backfill cleanup read: ${readErr.message}`)
    const stale = staleJornadas(
      rounds.map(r => r.jornada),
      (histRows ?? []).map(h => h.jornada as number),
    )
    if (stale.length) {
      const { error } = await supabase.from('historial').delete().in('jornada', stale)
      if (error) throw new Error(`backfill cleanup: ${error.message}`)
      console.log(`backfill cleanup: dropped stale jornada(s) ${stale.join(', ')}`)
    }
  }

  await recalc()
  await setConfig('last_sync_at', new Date().toISOString())
  await setConfig('unmatched_players', JSON.stringify(allUnmatched))
  if (allUnmatched.length) {
    console.warn('UNMATCHED FEDERATION PLAYERS:\n' + allUnmatched.join('\n'))
  }
  if (failedJornadas.length) {
    console.error('FAILED JORNADAS:\n' + failedJornadas.join('\n'))
    process.exitCode = 1
  }
}
