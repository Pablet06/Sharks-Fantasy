import { runSync } from './sync.js'
import { runDiscover } from './discover.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--discover')) {
    await runDiscover()
    return
  }
  const jIdx = args.indexOf('--jornada')
  const jornada = jIdx > -1 ? Number(args[jIdx + 1]) : undefined
  if (jornada !== undefined && !Number.isInteger(jornada)) {
    console.error(`--jornada needs an integer, got: ${args[jIdx + 1] ?? '(nothing)'}`)
    process.exit(1)
  }
  const backfill = args.includes('--backfill')
  console.log(`[${new Date().toISOString()}] sync start`, { backfill, jornada })
  await runSync({ backfill, jornada })
  console.log('sync done')
}

main().catch(err => { console.error(err); process.exit(1) })
