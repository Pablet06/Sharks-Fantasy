#!/usr/bin/env node
/**
 * One-shot migration: Firebase Firestore -> Supabase PostgreSQL.
 *
 * Reads jugadores + usuarios from the Firestore REST API (no SDK, public reads),
 * upserts jugadores + historial into Supabase, and prints the user list so the
 * humans can recreate auth accounts manually in Supabase.
 *
 * Run:
 *   npm install
 *   node migrate-firebase-to-supabase.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));

// .env lives at the repo root. In a worktree that's two directories above the
// .worktrees/<name>/ folder; in a normal checkout it's one above scripts/.
// Walk up until we find a .env, falling back to the immediate parent.
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

const FIREBASE_BASE =
  'https://firestore.googleapis.com/v1/projects/sharks-fantasy/databases/(default)/documents';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCtKaONmU_RiTjjVvpN4XyJZAUY-ZgafIM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Firestore-typed value parsing
// ---------------------------------------------------------------------------
function parseFirestoreValue(value) {
  if (value === null || value === undefined) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue; // ISO string
  if ('arrayValue' in value) {
    const values = value.arrayValue?.values ?? [];
    return values.map(parseFirestoreValue);
  }
  if ('mapValue' in value) {
    return parseFirestoreFields(value.mapValue?.fields ?? {});
  }
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  return null;
}

function parseFirestoreFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = parseFirestoreValue(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Firestore REST fetch with pagination
// ---------------------------------------------------------------------------
async function fetchFirestoreCollection(collection) {
  const docs = [];
  let pageToken;
  do {
    const url = new URL(`${FIREBASE_BASE}/${collection}`);
    url.searchParams.set('key', FIREBASE_API_KEY);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Firestore GET ${collection} failed: ${resp.status} ${body}`);
    }
    const json = await resp.json();
    for (const doc of json.documents ?? []) {
      const idFromName = doc.name.split('/').pop();
      docs.push({
        _docId: idFromName,
        ...parseFirestoreFields(doc.fields ?? {}),
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return docs;
}

// ---------------------------------------------------------------------------
// Stats normalisation — keep only the documented JSONB keys
// ---------------------------------------------------------------------------
const STATS_KEYS = [
  'partidos',
  'goles',
  'penaltis',
  'tarjetas',
  'expulsiones',
  'tiros',
  'penaltis_fallados',
  'paradas',
  'goles_contra',
  'penaltis_parados',
];

function normaliseStats(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') {
    for (const k of STATS_KEYS) out[k] = 0;
    return out;
  }
  for (const k of STATS_KEYS) {
    out[k] = typeof raw[k] === 'number' ? raw[k] : Number(raw[k] ?? 0) || 0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Migration steps
// ---------------------------------------------------------------------------
async function migrateJugadores(rawJugadores) {
  // Sort by numero so output is deterministic.
  const players = rawJugadores
    .map((j) => ({
      numero: typeof j.id === 'number' ? j.id : Number(j.id),
      name: j.name ?? null,
      nick: j.nick ?? null,
      pos: j.pos ?? null,
      phrase: j.phrase ?? null,
      photo: j.photo ?? null,
      stats: normaliseStats(j.stats),
      _historial: Array.isArray(j.historial) ? j.historial : [],
    }))
    .filter((p) => Number.isFinite(p.numero))
    .sort((a, b) => a.numero - b.numero);

  console.log(`\n[jugadores] Upserting ${players.length} players...`);

  // Upsert and request the resulting rows so we can map numero -> SERIAL id.
  const rowsToInsert = players.map(({ _historial, ...row }) => row);
  const { data: inserted, error } = await supabase
    .from('jugadores')
    .upsert(rowsToInsert, { onConflict: 'numero' })
    .select('id, numero, name');

  if (error) {
    throw new Error(`Supabase upsert jugadores failed: ${error.message}`);
  }

  const numeroToId = new Map(inserted.map((r) => [r.numero, r.id]));
  for (const p of players) p._supabaseId = numeroToId.get(p.numero);

  const missing = players.filter((p) => !p._supabaseId);
  if (missing.length) {
    console.warn(`  WARNING: no Supabase id for players: ${missing.map((p) => p.numero).join(', ')} — their historial will be skipped`);
  }

  for (const p of players) {
    console.log(`  #${String(p.numero).padStart(2, ' ')}  ${p.name} (${p.pos})`);
  }

  return players;
}

async function migrateHistorial(players) {
  const rows = [];
  for (const p of players) {
    if (!p._supabaseId) continue;
    for (const entry of p._historial) {
      if (!entry || typeof entry !== 'object') continue;
      const jornada = Number(entry.jornada);
      if (!Number.isFinite(jornada)) continue;
      const puntos =
        typeof entry.puntos === 'number' ? entry.puntos : Number(entry.puntos ?? 0) || 0;
      // date may be a Firestore timestamp (already ISO) or a stringValue ISO.
      let date = entry.date ?? null;
      if (date && typeof date !== 'string') date = String(date);
      rows.push({
        jugador_id: p._supabaseId,
        jornada,
        stats: normaliseStats(entry.stats),
        puntos,
        date,
      });
    }
  }

  console.log(`\n[historial] Upserting ${rows.length} entries...`);
  if (rows.length === 0) return 0;

  // Chunk to keep the request size sane.
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('historial')
      .upsert(slice, { onConflict: 'jugador_id,jornada' });
    if (error) {
      throw new Error(`Supabase upsert historial failed (chunk ${i}): ${error.message}`);
    }
    written += slice.length;
  }
  return written;
}

function reportUsuarios(rawUsuarios) {
  console.log(`\n[usuarios] ${rawUsuarios.length} users — manual auth recreation required:\n`);
  console.log('  email                                     | nombre              | equipo');
  console.log('  ' + '-'.repeat(82));
  const sorted = [...rawUsuarios].sort((a, b) =>
    String(a.email ?? '').localeCompare(String(b.email ?? '')),
  );
  for (const u of sorted) {
    const email = String(u.email ?? '(no email)').padEnd(40, ' ').slice(0, 40);
    const nombre = String(u.nombre ?? '').trim().padEnd(18, ' ').slice(0, 18);
    const equipo = Array.isArray(u.equipo) ? `[${u.equipo.join(', ')}]` : '[]';
    console.log(`  ${email} | ${nombre} | ${equipo}`);
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('Sharks Fantasy: Firestore -> Supabase migration');
  console.log(`  supabase: ${SUPABASE_URL}`);

  console.log('\nFetching Firestore collections...');
  const [rawJugadores, rawUsuarios] = await Promise.all([
    fetchFirestoreCollection('jugadores'),
    fetchFirestoreCollection('usuarios'),
  ]);
  console.log(`  jugadores: ${rawJugadores.length}`);
  console.log(`  usuarios:  ${rawUsuarios.length}`);

  const players = await migrateJugadores(rawJugadores);
  const historialCount = await migrateHistorial(players);
  const users = reportUsuarios(rawUsuarios);

  console.log('\n=================  SUMMARY  =================');
  console.log(`  Jugadores migrated: ${players.length}`);
  console.log(`  Historial entries:  ${historialCount}`);
  console.log(`  Usuarios listed:    ${users.length}  (manual recreation in Supabase auth)`);
  console.log('=============================================\n');
}

main().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
