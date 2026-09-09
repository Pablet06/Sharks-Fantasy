export interface DbPlayer {
  id: number
  name: string
  nick: string | null
  leverade_id: number | null
}

export function normalize(s: string): string {
  return s
    .replace(/\s*\(c\)\s*$/i, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accent marks
    .replace(/\s+/g, ' ')
    .trim()
}

// "PABLO FERRER BAIXAULI" -> "pablo ferrer"
function givenPlusFirstSurname(fullName: string): string {
  const parts = normalize(fullName).split(' ')
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0] ?? ''
}

export function resolvePlayer(
  raw: { leveradeId: string | null; nombre: string },
  dbPlayers: DbPlayer[],
): DbPlayer | null {
  if (raw.leveradeId) {
    const byId = dbPlayers.find(p => p.leverade_id === Number(raw.leveradeId))
    if (byId) return byId
  }
  const key = givenPlusFirstSurname(raw.nombre)
  return (
    dbPlayers.find(p => normalize(p.name) === key) ??
    dbPlayers.find(
      p =>
        p.nick &&
        `${normalize(p.nick)} ${normalize(p.name).split(' ')[1] ?? ''}`.trim() === key,
    ) ??
    dbPlayers.find(p => givenPlusFirstSurname(p.name) === key) ??
    null
  )
}
