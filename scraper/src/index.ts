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
  const backfill = args.includes('--backfill')
  console.log(`[${new Date().toISOString()}] sync start`, { backfill, jornada })
  await runSync({ backfill, jornada })
  console.log('sync done')
}

main().catch(err => { console.error(err); process.exit(1) })
