import type { PlayerStats } from '../types'
import { EMPTY_STATS } from './points'

const KEYS = Object.keys(EMPTY_STATS) as (keyof PlayerStats)[]

export function sumStats(entries: { stats: PlayerStats }[]): PlayerStats {
  const acc: PlayerStats = { ...EMPTY_STATS }
  for (const { stats } of entries) {
    for (const k of KEYS) acc[k] += stats[k] ?? 0
  }
  acc.goles_contra = 0
  return acc
}
