import { supabase } from './supabase.js'
import { getRounds, getRoundMatches } from './leverade.js'
import { fetchMatchStats, SHARKS_TEAM_NAME } from './fncv.js'
import { resolvePlayer, type DbPlayer } from './match.js'
import { getTournamentId } from './config.js'

export async function runDiscover(): Promise<void> {
  const tournamentId = await getTournamentId()
  const { data } = await supabase.from('jugadores').select('id, name, nick, leverade_id')
  const dbPlayers = (data ?? []) as DbPlayer[]

  const seen = new Map<string, string>() // leveradeId -> nombre
  const rounds = await getRounds(tournamentId)
  for (const round of rounds) {
    const matches = await getRoundMatches(round.id)
    for (const m of matches.filter(x => x.finished)) {
      const stats = await fetchMatchStats(tournamentId, m.id)
      if (stats.local !== SHARKS_TEAM_NAME && stats.visitante !== SHARKS_TEAM_NAME) continue
      for (const p of stats.jugadores) {
        if (p.leveradeId && !seen.has(p.leveradeId)) seen.set(p.leveradeId, p.nombre)
      }
    }
  }

  console.log(`\n${seen.size} distinct federation players:\n`)
  const sql: string[] = []
  for (const [leveradeId, nombre] of seen) {
    const db = resolvePlayer({ leveradeId, nombre }, dbPlayers)
    const already = dbPlayers.find(d => d.leverade_id === Number(leveradeId))
    const tag = already ? `already -> id ${already.id}` : db ? `name-match -> id ${db.id}` : 'UNMATCHED'
    console.log(`  ${leveradeId.padEnd(12)} ${nombre.padEnd(34)} ${tag}`)
    if (!already && db) sql.push(`UPDATE jugadores SET leverade_id = ${leveradeId} WHERE id = ${db.id};`)
  }
  console.log('\n-- SQL for name-matched players (review before running):\n' + sql.join('\n'))
  console.log('\n-- UNMATCHED players need a manual decision (new signing? nickname mismatch?).')
}
