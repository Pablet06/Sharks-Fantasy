import * as cheerio from 'cheerio'
import { getHtml } from './http.js'

export const SHARKS_TEAM_NAME = 'C.W. Sharks A'
const TOURNAMENT_HOST = 'https://waterpolo.fncv.es'

export interface RawPlayer {
  leveradeId: string | null
  nombre: string
  jugo: boolean
  G: number
  GP: number
  TA: number
  TR: number
  EX: number
  ED: number
  EB: number
  EN: number
  EP: number
  P: number
  PF: number
}

export interface MatchStats {
  local: string
  visitante: string
  golesLocal: number
  golesVisitante: number
  sharks: 'local' | 'visitante' | null
  jugadores: RawPlayer[]
}

const num = (txt: string): number => {
  const n = parseInt(txt.replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

// Stat column -> cell class on the FNCV /stats player tables.
const STAT_CLASS: Record<keyof Omit<RawPlayer, 'leveradeId' | 'nombre' | 'jugo'>, string> = {
  G: 'colstyle-goles',
  GP: 'colstyle-goles-penalti',
  TA: 'colstyle-tarjetas-amarillas',
  TR: 'colstyle-tarjetas-rojas',
  EX: 'colstyle-expulsiones-20-segundos',
  ED: 'colstyle-expulsiones-definitivas-disciplinarias',
  EB: 'colstyle-expulsiones-definitivas-brutalidad',
  EN: 'colstyle-expulsiones-definitivas-no-disciplinarias',
  EP: 'colstyle-expulsiones-penalti',
  P: 'colstyle-faltas-por-penalti',
  PF: 'colstyle-penaltis-fallados',
}

export function parseMatchStats(html: string): MatchStats {
  const $ = cheerio.load(html)

  // #match-summary holds: <team a> ... <div><div>Goles N</div>...<div>Goles M</div></div> ... <team a>
  const $summary = $('#match-summary')
  const teamNames = $summary
    .find('a[href*="/team/"]')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
  const goalNums = $summary
    .find('span')
    .filter((_, el) => $(el).prev('span').text().trim() === 'Goles')
    .map((_, el) => num($(el).text()))
    .get()

  // Fallback to the <title>: "Local — Visitante | ..." (em dash U+2014)
  const titleTeams = ($('title').first().text().split('|')[0] || '')
    .split('—')
    .map(s => s.trim())
  const local = teamNames[0] || titleTeams[0] || ''
  const visitante = teamNames[1] || titleTeams[1] || ''
  const golesLocal = goalNums[0] ?? 0
  const golesVisitante = goalNums[1] ?? 0

  // Each player table sits in a .ml-table wrapper directly preceded by an
  // <h4 class="... h5"> with the team name. Match by DOM proximity, not by a
  // page-wide h4.h5 index — an extra heading elsewhere would shift that.
  const teams: { name: string; players: RawPlayer[] }[] = []
  $('table.tabletype-public').each((_tableIdx, table) => {
    const name = $(table)
      .closest('.ml-table')
      .prevAll('h4.h5')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    const players: RawPlayer[] = []

    $(table)
      .find('tbody tr')
      .each((_, row) => {
        const $row = $(row)
        const $nameCell = $row.find('td.colstyle-jugador')
        if (!$nameCell.length) return
        const nombre = $nameCell.text().replace(/\s+/g, ' ').trim()
        if (!nombre) return

        const href = $row.find('td.colstyle-asiste a[href*="/players/"]').attr('href') ?? ''
        const leveradeId = href.match(/\/players\/(\d+)/)?.[1] ?? null
        const dorsal = $row.find('td.colstyle-dorsal').text().match(/\d+/)?.[0] ?? null

        const player = { leveradeId, nombre, jugo: dorsal !== null } as RawPlayer
        for (const [key, cls] of Object.entries(STAT_CLASS)) {
          player[key as keyof typeof STAT_CLASS] = num($row.find(`td.${cls}`).first().text())
        }
        players.push(player)
      })

    teams.push({ name, players })
  })

  const sharksTeam = teams.find(t => t.name === SHARKS_TEAM_NAME)
  const sharks: MatchStats['sharks'] =
    local === SHARKS_TEAM_NAME ? 'local' : visitante === SHARKS_TEAM_NAME ? 'visitante' : null

  return {
    local,
    visitante,
    golesLocal,
    golesVisitante,
    sharks,
    jugadores: sharksTeam?.players ?? [],
  }
}

export async function fetchMatchStats(tournamentId: string, matchId: string): Promise<MatchStats> {
  const html = await getHtml(
    `${TOURNAMENT_HOST}/es/tournament/${tournamentId}/match/${matchId}/stats`,
  )
  return parseMatchStats(html)
}
