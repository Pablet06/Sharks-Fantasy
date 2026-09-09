import { getJson } from './http.js'

const API = 'https://api.leverade.com'

interface JsonApiDoc {
  data: {
    relationships?: Record<string, { data: { id: string }[] | { id: string } | null }>
  }
  included?: {
    type: string
    id: string
    attributes: Record<string, unknown>
  }[]
}

export interface Round {
  id: string
  jornada: number
}

export interface Match {
  id: string
  date: string | null
  finished: boolean
}

export async function getRounds(tournamentId: string): Promise<Round[]> {
  const tour = await getJson<JsonApiDoc>(`${API}/tournaments/${tournamentId}?include=groups`)
  const groups = tour.data.relationships?.groups?.data
  const groupId = Array.isArray(groups) ? groups[0]?.id : groups?.id
  if (!groupId) throw new Error(`No group for tournament ${tournamentId}`)

  const grp = await getJson<JsonApiDoc>(`${API}/groups/${groupId}?include=rounds`)
  const rounds = (grp.included ?? [])
    .filter(x => x.type === 'round')
    .map(x => ({ id: x.id, jornada: Number(x.attributes.order) }))
    .sort((a, b) => a.jornada - b.jornada)
  if (rounds.length === 0) throw new Error(`No rounds for group ${groupId}`)
  return rounds
}

export async function getRoundMatches(roundId: string): Promise<Match[]> {
  const doc = await getJson<JsonApiDoc>(`${API}/rounds/${roundId}?include=matches`)
  return (doc.included ?? [])
    .filter(x => x.type === 'match')
    .map(x => ({
      id: x.id,
      date: (x.attributes.date as string | null) ?? null,
      finished: x.attributes.finished === true,
    }))
}
