# Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firebase Auth + Firestore with Supabase (PostgreSQL + Auth), migrating all existing data.

**Architecture:** Supabase project with 3 tables (jugadores, historial, usuarios). Auth handled by Supabase built-in auth. Migration script reads from Firebase SDK and writes to Supabase in a single pass. User accounts recreated manually (small user base).

**Tech Stack:** Supabase JS SDK v2, Node.js migration script, PostgreSQL with JSONB for stats.

---

## Schema Design

```sql
-- jugadores: one row per player
CREATE TABLE jugadores (
  id SERIAL PRIMARY KEY,
  numero INT UNIQUE NOT NULL,       -- original Firebase numeric ID
  name TEXT NOT NULL,
  nick TEXT,
  pos TEXT NOT NULL,                -- 'Portero' | 'Boya' | 'Extremo' | 'Lateral' | 'Contraboya'
  phrase TEXT,
  photo TEXT,                       -- URL to image
  stats JSONB DEFAULT '{}'          -- root/cumulative stats (kept for scraper source-of-truth)
);

-- historial: one row per player per jornada
CREATE TABLE historial (
  id SERIAL PRIMARY KEY,
  jugador_id INT REFERENCES jugadores(id) ON DELETE CASCADE,
  jornada INT NOT NULL,
  stats JSONB NOT NULL,             -- delta stats for this jornada
  puntos FLOAT NOT NULL DEFAULT 0,
  date TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(jugador_id, jornada)
);

-- usuarios: linked to Supabase auth.users
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  equipo INT[] NOT NULL DEFAULT '{}',   -- array of jugadores.numero IDs
  puntos FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Row Level Security (RLS)

```sql
-- jugadores: public read, no write from client
ALTER TABLE jugadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jugadores_read" ON jugadores FOR SELECT TO anon, authenticated USING (true);

-- historial: public read
ALTER TABLE historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "historial_read" ON historial FOR SELECT TO anon, authenticated USING (true);

-- usuarios: split policies (FOR ALL with USING doesn't cover INSERT WITH CHECK)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_select_own" ON usuarios FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "usuarios_insert_own" ON usuarios FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "usuarios_update_own" ON usuarios FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- No DELETE policy: auth.users ON DELETE CASCADE handles deletion top-down
CREATE POLICY "usuarios_read_ranking" ON usuarios FOR SELECT TO authenticated USING (true);
```

---

## File Structure

- Create: `scripts/migrate-firebase-to-supabase.js` — one-time migration script
- Create: `scripts/check-supabase.js` — verify migration correctness
- Create: `.env.example` — document all required env vars
- Modify: `.env` — add Supabase vars, keep Firebase vars until migration complete

---

### Task 1: Create Supabase Project + Schema

- [ ] **Step 1: Create Supabase project**
  - Go to https://supabase.com, create account/project named `sharks-fantasy`
  - Region: EU West (closest to Spain)
  - Save the Project URL and anon key + service role key

- [ ] **Step 2: Run schema SQL in Supabase SQL Editor**

```sql
CREATE TABLE jugadores (
  id SERIAL PRIMARY KEY,
  numero INT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  nick TEXT,
  pos TEXT NOT NULL,
  phrase TEXT,
  photo TEXT,
  stats JSONB DEFAULT '{}'
);

CREATE TABLE historial (
  id SERIAL PRIMARY KEY,
  jugador_id INT REFERENCES jugadores(id) ON DELETE CASCADE,
  jornada INT NOT NULL,
  stats JSONB NOT NULL,
  puntos FLOAT NOT NULL DEFAULT 0,
  date TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(jugador_id, jornada)
);

CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  equipo INT[] NOT NULL DEFAULT '{}',
  puntos FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE jugadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jugadores_read" ON jugadores FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "historial_read" ON historial FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_select_own" ON usuarios FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "usuarios_insert_own" ON usuarios FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "usuarios_update_own" ON usuarios FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- No DELETE policy: auth.users ON DELETE CASCADE handles deletion from top down only
CREATE POLICY "usuarios_read_ranking" ON usuarios FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 3: Verify schema in Supabase Table Editor**
  - Check all 3 tables appear with correct columns
  - Verify RLS is enabled on all tables

- [ ] **Step 4: Update .env with Supabase credentials**

```
# .env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...   # only for migration script + scraper

# Keep Firebase vars during migration
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

- [ ] **Step 5: Update .env.example (commit this)**

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

- [ ] **Step 6: Commit**
```bash
git add .env.example
git commit -m "feat: add Supabase env template and schema"
```

---

### Task 2: Write Migration Script

**Files:**
- Create: `scripts/migrate-firebase-to-supabase.js`

- [ ] **Step 1: Install dependencies in scripts/**

```bash
cd scripts && npm init -y
npm install firebase @supabase/supabase-js dotenv
```

- [ ] **Step 1b: Add Firebase vars to .env**

```
# Add to .env (never commit this file)
FIREBASE_API_KEY=AIzaSyCtKaONmU_RiTjjVvpN4XyJZAUY-ZgafIM
FIREBASE_AUTH_DOMAIN=sharks-fantasy.firebaseapp.com
FIREBASE_PROJECT_ID=sharks-fantasy
FIREBASE_STORAGE_BUCKET=sharks-fantasy.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=38574787028
FIREBASE_APP_ID=1:38574787028:web:3bfe1adc814f31261f2e41
```

- [ ] **Step 2: Create migration script**

```javascript
// scripts/migrate-firebase-to-supabase.js
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });  // .env is in repo root, not scripts/

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { createClient } from '@supabase/supabase-js';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const firebase = initializeApp(firebaseConfig);
const db = getFirestore(firebase);
const auth = getAuth(firebase);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role bypasses RLS for migration
);

async function migrate() {
  console.log('Starting migration...');
  await signInWithEmailAndPassword(auth, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

  // 1. Migrate jugadores
  console.log('\n[1/2] Migrating jugadores...');
  const jugadoresSnap = await getDocs(collection(db, 'jugadores'));
  
  for (const docSnap of jugadoresSnap.docs) {
    const p = docSnap.data();
    
    // Insert player
    const { data: jugador, error: jError } = await supabase
      .from('jugadores')
      .upsert({
        numero: p.id,
        name: p.name,
        nick: p.nick || null,
        pos: p.pos,
        phrase: p.phrase || null,
        photo: p.photo || null,
        stats: p.stats || {}
      }, { onConflict: 'numero' })
      .select('id')
      .single();
    
    if (jError) { console.error(`Error inserting ${p.name}:`, jError); continue; }
    
    // Insert historial entries
    if (p.historial && p.historial.length > 0) {
      const histEntries = p.historial.map(h => ({
        jugador_id: jugador.id,
        jornada: h.jornada,
        stats: h.stats || {},
        puntos: h.puntos || 0,
        date: h.date || new Date().toISOString()
      }));
      
      const { error: hError } = await supabase
        .from('historial')
        .upsert(histEntries, { onConflict: 'jugador_id,jornada' });
      
      if (hError) console.error(`Error inserting historial for ${p.name}:`, hError);
      else console.log(`  ✅ ${p.name}: ${histEntries.length} jornadas`);
    } else {
      console.log(`  ✅ ${p.name}: 0 jornadas`);
    }
  }

  // 2. Migrate usuarios (data only, no auth - users must re-register)
  console.log('\n[2/2] Exporting usuario data (manual auth recreation needed)...');
  const usuariosSnap = await getDocs(collection(db, 'usuarios'));
  
  console.log('\nUsers to recreate manually in Supabase Auth:');
  usuariosSnap.forEach(docSnap => {
    const u = docSnap.data();
    console.log(`  - Email: ${u.email}, Nombre: ${u.nombre}, Equipo IDs: [${u.equipo?.join(', ')}]`);
  });

  console.log('\n✅ Migration complete. Create auth users manually in Supabase dashboard, then run check-supabase.js');
}

migrate().catch(console.error);
```

- [ ] **Step 3: Run migration**

```bash
cd scripts && node migrate-firebase-to-supabase.js
```

Expected output: list of players with jornada counts, then list of users to recreate.

- [ ] **Step 4: Manually create user accounts in Supabase**
  - Go to Supabase Dashboard → Authentication → Users → Add User
  - Create each user with their email (set a temporary password, they can reset)
  - Copy each user's UUID

- [ ] **Step 5: Insert usuario rows with new UUIDs**

After creating each auth user, run for each user:
```sql
INSERT INTO usuarios (id, nombre, equipo, puntos)
VALUES ('<uuid-from-auth>', 'Coach Name', '{1,2,3,4,5,6,7}', 0);
```

Then recalculate points:
```sql
-- Run after all users inserted (points recalculated by scraper/app logic)
```

- [ ] **Step 6: Commit**
```bash
git add scripts/
git commit -m "feat: add Firebase-to-Supabase migration script"
```

---

### Task 3: Verify Migration

**Files:**
- Create: `scripts/check-supabase.js`

- [ ] **Step 1: Create verification script**

```javascript
// scripts/check-supabase.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: jugadores, error: jErr } = await supabase
    .from('jugadores')
    .select('*, historial(count)');
  
  if (jErr) { console.error('Error:', jErr); return; }
  
  console.log(`\n✅ Jugadores: ${jugadores.length}`);
  jugadores.forEach(j => {
    console.log(`  ${j.name} (${j.pos}) — historial: ${j.historial[0]?.count || 0} entries`);
  });

  const { count: totalHist } = await supabase
    .from('historial')
    .select('*', { count: 'exact', head: true });
  console.log(`\n✅ Total historial entries: ${totalHist}`);

  const { data: usuarios } = await supabase.from('usuarios').select('*');
  console.log(`\n✅ Usuarios: ${usuarios?.length || 0}`);
}

check().catch(console.error);
```

- [ ] **Step 2: Run check**

```bash
cd scripts && node check-supabase.js
```

Expected: all players listed with correct historial counts, users count matches Firebase.

- [ ] **Step 3: Cross-verify points calculation**
  
  Manually verify 1-2 players: sum their historial puntos in Supabase and compare to Firebase `puntos` field. They should match.

- [ ] **Step 4: Commit**
```bash
git add scripts/check-supabase.js
git commit -m "feat: add Supabase verification script"
```
