export interface CliArgs { backfill: boolean; jornada?: number; anterior?: string }

/** Valida los flags del CLI; lanza Error con el mensaje a mostrar. */
export function parseArgs(args: string[]): CliArgs {
  const intFlag = (flag: string): number | undefined => {
    const i = args.indexOf(flag)
    if (i < 0) return undefined
    const raw = args[i + 1]
    const n = Number(raw)
    if (raw === undefined || raw.trim() === '' || !Number.isInteger(n)) {
      throw new Error(`${flag} needs an integer, got: ${raw ?? '(nothing)'}`)
    }
    return n
  }
  const jornada = intFlag('--jornada')
  const anterior = intFlag('--anterior')
  const backfill = args.includes('--backfill')
  if (anterior !== undefined && (backfill || jornada !== undefined)) {
    throw new Error('--anterior es incompatible con --backfill y --jornada')
  }
  return { backfill, jornada, anterior: anterior === undefined ? undefined : String(anterior) }
}
