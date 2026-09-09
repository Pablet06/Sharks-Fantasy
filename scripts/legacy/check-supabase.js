#!/usr/bin/env node
/**
 * Read-only sanity check against Supabase after migration.
 * Prints player count, total historial entries, users count, plus a small
 * sample of each so it's obvious the data landed correctly.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findEnvFile(startDir) {
  let dir = startDir;
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(startDir, '../.env');
}

dotenv.config({ path: findEnvFile(__dirname) });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function countTable(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count(${table}) failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  console.log('Sharks Fantasy: Supabase check');
  console.log(`  url: ${SUPABASE_URL}\n`);

  const [jugadoresCount, historialCount, usuariosCount] = await Promise.all([
    countTable('jugadores'),
    countTable('historial'),
    countTable('usuarios'),
  ]);

  console.log(`  jugadores: ${jugadoresCount}`);
  console.log(`  historial: ${historialCount}`);
  console.log(`  usuarios:  ${usuariosCount}`);

  const { data: players, error: playersErr } = await supabase
    .from('jugadores')
    .select('id, numero, name, pos, stats')
    .order('numero', { ascending: true })
    .limit(5);
  if (playersErr) throw new Error(playersErr.message);
  console.log('\n  Sample players:');
  for (const p of players ?? []) {
    const partidos = p.stats?.partidos ?? 0;
    const goles = p.stats?.goles ?? 0;
    console.log(
      `    id=${p.id}  #${p.numero}  ${p.name}  (${p.pos})  partidos=${partidos} goles=${goles}`,
    );
  }

  const { data: hist, error: histErr } = await supabase
    .from('historial')
    .select('jugador_id, jornada, puntos, date')
    .order('jornada', { ascending: true })
    .limit(5);
  if (histErr) throw new Error(histErr.message);
  console.log('\n  Sample historial:');
  for (const h of hist ?? []) {
    console.log(
      `    jugador_id=${h.jugador_id}  jornada=${h.jornada}  puntos=${h.puntos}  date=${h.date}`,
    );
  }

  console.log('');
}

main().catch((err) => {
  console.error('check-supabase failed:', err);
  process.exit(1);
});
