import 'dotenv/config'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { supabase } from './supabase.js'
import { calcMatchPoints, type PlayerStats, type Position } from './points.js'

const TARGET_URL = 'https://clupik.pro/es/team/15688441'

const normalize = (str: string): string =>
  str.replace(/\s*\(c\)$/i, '').toLowerCase()
     .normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

async function getMaxJornada(): Promise<number> {
  const { data } = await supabase
    .from('historial')
    .select('jornada')
    .order('jornada', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.jornada ?? 0
}

async function recalcUserPoints(): Promise<void> {
  const { data: jugadores } = await supabase
    .from('jugadores')
    .select('numero, historial(puntos)')

  if (!jugadores) return

  const pointsByNumero = new Map<number, number>()
  for (const j of jugadores) {
    const hist = j.historial as { puntos: number }[]
    pointsByNumero.set(j.numero, hist.reduce((s, h) => s + h.puntos, 0))
  }

  const { data: usuarios } = await supabase.from('usuarios').select('id, equipo')
  if (!usuarios) return

  for (const u of usuarios) {
    const puntos = (u.equipo as number[]).reduce((s, id) => s + (pointsByNumero.get(id) ?? 0), 0)
    await supabase.from('usuarios').update({ puntos }).eq('id', u.id)
  }
  console.log(`✅ Recalculated points for ${usuarios.length} users.`)
}

export async function syncTeamStats(): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] Starting sync...`)

  const { data: html } = await axios.get<string>(TARGET_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  const $ = cheerio.load(html)
  const table = $('table').first()
  const headers: string[] = []
  table.find('th').each((_, th) => headers.push($(th).text().trim()))

  const idx = {
    name: headers.indexOf('Nombre'), pj: headers.indexOf('PJ'),
    g: headers.indexOf('G'), gp: headers.indexOf('GP'),
    ta: headers.indexOf('TA'), tr: headers.indexOf('TR'),
    ex: headers.indexOf('EX'), pf: headers.indexOf('PF')
  }

  const parseStat = (txt: string): number =>
    (txt && txt !== '-') ? (parseInt(txt) || 0) : 0

  const webPlayers: { name: string; stats: PlayerStats }[] = []
  table.find('tbody tr').each((_, row) => {
    const cols = $(row).find('td')
    if (cols.length === 0) return
    let rawName = $(cols[idx.name]).text().trim()
    let name = rawName.replace(/^Ver\s+/i, '').replace(/Ver$/i, '').trim()
    if (name.includes('\n')) {
      name = name.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 2).pop() || name
    }
    if (!name) return
    webPlayers.push({
      name,
      stats: {
        partidos: parseStat($(cols[idx.pj]).text()),
        goles: parseStat($(cols[idx.g]).text()),
        penaltis: parseStat($(cols[idx.gp]).text()),
        tarjetas: parseStat($(cols[idx.ta]).text()) + parseStat($(cols[idx.tr]).text()),
        expulsiones: parseStat($(cols[idx.ex]).text()),
        tiros: 0,
        penaltis_fallados: idx.pf > -1 ? parseStat($(cols[idx.pf]).text()) : 0,
        paradas: 0, goles_contra: 0, penaltis_parados: 0
      }
    })
  })
  console.log(`Parsed ${webPlayers.length} players from web.`)

  const { data: dbPlayers, error } = await supabase
    .from('jugadores')
    .select('id, numero, name, nick, pos, stats, historial(stats, puntos)')

  if (error || !dbPlayers) throw new Error(`DB fetch failed: ${error?.message}`)

  const maxJornada = await getMaxJornada()
  const nextJornada = maxJornada + 1
  let updatesCount = 0

  for (const p of dbPlayers) {
    const pName = normalize(p.name as string)
    const pNick = normalize((p.nick as string) || '')
    const webP = webPlayers.find(wp => {
      const wpName = normalize(wp.name)
      return wpName === pName || (pNick && wpName === pNick) || wpName.includes(pName)
    })
    if (!webP) continue

    const historial = p.historial as { stats: PlayerStats; puntos: number }[]
    const dbTotals: PlayerStats = historial.reduce(
      (acc, h) => {
        const s = h.stats
        return {
          partidos: acc.partidos + (s.partidos || 0),
          goles: acc.goles + (s.goles || 0),
          penaltis: acc.penaltis + (s.penaltis || 0),
          tarjetas: acc.tarjetas + (s.tarjetas || 0),
          expulsiones: acc.expulsiones + (s.expulsiones || 0),
          tiros: acc.tiros + (s.tiros || 0),
          penaltis_fallados: acc.penaltis_fallados + (s.penaltis_fallados || 0),
          paradas: acc.paradas + (s.paradas || 0),
          goles_contra: acc.goles_contra + (s.goles_contra || 0),
          penaltis_parados: acc.penaltis_parados + (s.penaltis_parados || 0)
        }
      },
      { partidos: 0, goles: 0, penaltis: 0, tarjetas: 0, expulsiones: 0,
        tiros: 0, penaltis_fallados: 0, paradas: 0, goles_contra: 0, penaltis_parados: 0 }
    )

    const delta: PlayerStats = {
      partidos: webP.stats.partidos - dbTotals.partidos,
      goles: webP.stats.goles - dbTotals.goles,
      penaltis: webP.stats.penaltis - dbTotals.penaltis,
      tarjetas: webP.stats.tarjetas - dbTotals.tarjetas,
      expulsiones: webP.stats.expulsiones - dbTotals.expulsiones,
      tiros: 0,
      penaltis_fallados: webP.stats.penaltis_fallados - dbTotals.penaltis_fallados,
      paradas: 0, goles_contra: 0, penaltis_parados: 0
    }

    const hasChanges = Object.values(delta).some(v => v !== 0)
    if (!hasChanges) continue

    console.log(`  Update ${p.name as string}: +${delta.goles}g +${delta.partidos}pj`)
    const puntos = calcMatchPoints(p.pos as Position, delta)

    const { error: insertErr } = await supabase.from('historial').insert({
      jugador_id: p.id as number,
      jornada: nextJornada,
      stats: delta,
      puntos,
      date: new Date().toISOString()
    })
    if (insertErr) { console.error(`Historial error for ${p.name}:`, insertErr); continue }

    await supabase.from('jugadores').update({ stats: webP.stats }).eq('id', p.id as number)
    updatesCount++
  }

  if (updatesCount > 0) {
    console.log(`\n✅ Created J${nextJornada} for ${updatesCount} players.`)
    await recalcUserPoints()
  } else {
    console.log('\n✅ No new stats. DB is up to date.')
  }
}

syncTeamStats().catch(e => { console.error(e); process.exit(1) })
