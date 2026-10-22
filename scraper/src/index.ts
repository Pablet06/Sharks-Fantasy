import { runSync, runBackfillAnterior } from './sync.js'
import { parseArgs } from './args.js'
import { runDiscover } from './discover.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes('--discover')) {
    await runDiscover()
    return
  }
  let parsed
  try { parsed = parseArgs(args) } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
  const { backfill, jornada, anterior } = parsed
  if (anterior !== undefined) {
    console.log(`[${new Date().toISOString()}] backfill anterior start`, { anterior })
    await runBackfillAnterior(anterior)
    console.log('backfill anterior done')
    return
  }
  console.log(`[${new Date().toISOString()}] sync start`, { backfill, jornada })
  await runSync({ backfill, jornada })
  console.log('sync done')
}

main().catch(err => { console.error(err); process.exit(1) })
