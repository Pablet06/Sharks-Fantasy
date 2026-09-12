import { supabase } from './supabase.js'
import { getRounds, getRoundMatches, getTeamName, type Round } from './leverade.js'
import { fetchMatchStats, SHARKS_TEAM_NAME, type RawPlayer } from './fncv.js'
import { resolvePlayer, type DbPlayer } from './match.js'
import { calcMatchPoints, EMPTY_STATS, type PlayerStats, type Position } from './points.js'
import { getTournamentId, setConfig } from './config.js'

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

export function resultadoJornada(golesFavor: number, golesContra: number): 'gana' | 'pierde' | 'empata' {
  if (golesFavor > golesContra) return 'gana'
  if (golesFavor < golesContra) return 'pierde'
  return 'empata'
}

export function ladoSharks(homeName: string, awayName: string): 'home' | 'away' | null {
  if (homeName === SHARKS_TEAM_NAME) return 'home'
  if (awayName === SHARKS_TEAM_NAME) return 'away'
  return null
}

/** Leverade dates are naive local time in the Europe/Madrid zone (no offset
 * in the API response) — tag them explicitly so Postgres's timestamptz
 * parser applies the correct DST-aware offset instead of assuming UTC. */
function conZonaMadrid(fecha: string | null): string | null {
  return fecha === null ? null : `${fecha} Europe/Madrid`
}

/**
 * Escribe fecha_partido en `jornadas` para las rondas que todavía no tienen
 * historial (jornadas futuras o sin jugar), identificando el partido de los
 * Sharks por los ids de equipo del partido — no depende de que exista
 * página de stats (que solo aparece una vez jugado el partido).
 */
export async function syncCalendar(rounds: Round[], historialJornadas: Set<number>): Promise<void> {
  const pendientes = rounds.filter(r => !historialJornadas.has(r.jornada))
  const nombreEquipo = new Map<string, string>()
  const resolverNombre = async (teamId: string): Promise<string> => {
    if (!nombreEquipo.has(teamId)) nombreEquipo.set(teamId, await getTeamName(teamId))
    return nombreEquipo.get(teamId)!
  }

  for (const round of pendientes) {
    const matches = await getRoundMatches(round.id)
    let fechaSharks: string | null = null
    for (const m of matches) {
      if (!m.homeTeamId || !m.awayTeamId) continue
      const [homeName, awayName] = await Promise.all([
        resolverNombre(m.homeTeamId),
        resolverNombre(m.awayTeamId),
      ])
      if (ladoSharks(homeName, awayName) !== null) {
        fechaSharks = m.date
        break
      }
    }
    if (fechaSharks === null) {
      console.warn(`syncCalendar: no se identificó el partido de los Sharks en la jornada ${round.jornada}`)
      continue
    }

    const { error } = await supabase
      .from('jornadas')
      .upsert({ numero: round.jornada, fecha_partido: conZonaMadrid(fechaSharks) }, { onConflict: 'numero' })
    if (error) {
      console.error(`syncCalendar J${round.jornada}: ${error.message}`)
      process.exitCode = 1
    }
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

  const golesFavor =
    sharksMatch.sharks === 'local' ? sharksMatch.golesLocal : sharksMatch.golesVisitante

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

  const { error: jError } = await supabase
    .from('jornadas')
    .upsert({
      numero: round.jornada,
      fecha_partido: conZonaMadrid(matchDate),
      resultado: resultadoJornada(golesFavor, golesContra),
      goles_favor: golesFavor,
      goles_contra: golesContra,
    }, { onConflict: 'numero' })
  if (jError) throw new Error(`jornadas upsert J${round.jornada}: ${jError.message}`)

  const { error } = await supabase
    .from('historial')
    .upsert(upserts, { onConflict: 'jugador_id,jornada' })
  if (error) throw new Error(`historial upsert J${round.jornada}: ${error.message}`)

  return { jornada: round.jornada, rows: upserts.length, unmatched }
}

export async function resolverJornadas(jornadas: Iterable<number>): Promise<void> {
  for (const jornada of jornadas) {
    const { error } = await supabase.rpc('resolver_jornada', { p_jornada: jornada })
    if (error) {
      console.error(`resolver_jornada J${jornada} failed: ${error.message}`)
      process.exitCode = 1
    }
  }
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

  const { data: histRows } = await supabase.from('historial').select('jornada')
  const historialJornadas = new Set((histRows ?? []).map(h => h.jornada as number))
  try {
    await syncCalendar(rounds, historialJornadas)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`syncCalendar failed: ${msg}`)
    process.exitCode = 1
  }

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

  await resolverJornadas(syncedJornadas)
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
