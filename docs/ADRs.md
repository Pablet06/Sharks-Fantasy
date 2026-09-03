# Architecture Decision Records

Registro de decisiones de arquitectura tomadas en el proyecto, en orden cronológico. No es un plan a futuro — es el porqué de cómo está montado hoy.

---

## ADR-001: Firebase → Supabase

**Fecha**: 2026-05-09
**Estado**: Implementado

**Contexto**: La v1 del proyecto (`Versiones/legacy-monolith.html`) usaba Firebase Auth + Firestore desde un monolito HTML de ~2200 líneas.

**Decisión**: Migrar a Supabase (Postgres + Auth + Row Level Security), con 3 tablas (`jugadores`, `historial`, `usuarios`). Los ~15 usuarios existentes no se migraron como cuentas — se re-registran limpio en Supabase Auth.

**Por qué**: RLS de Postgres da control de acceso a nivel de fila declarativo y verificado por el servidor, en vez de reglas de seguridad de Firestore separadas del esquema. Re-registrar 15 usuarios es más simple que escribir migración de cuentas.

**Detalle completo**: `docs/superpowers/plans/2026-05-09-supabase-migration.md`

---

## ADR-002: Monolito HTML → React + TypeScript + Vite

**Fecha**: 2026-05-09
**Estado**: Implementado

**Contexto**: El monolito mezclaba estado, DOM y lógica de negocio en un único fichero sin build step ni tipos.

**Decisión**: Reescribir como SPA React 19 + TypeScript sobre Vite, con componentes por feature (`src/components/{Auth,Dashboard,Players,Profile,Ranking,Admin}`) y hooks para el acceso a datos (`useAuth`, `useJugadores`, `useUsuario`).

**Por qué**: Tipos en el cálculo de puntos y en las estadísticas de jugadores (fácil de romper con JSONB suelto); componentes testeables; sin necesidad de un framework más pesado (Next.js, Redux) para una app de este tamaño.

**Detalle completo**: `docs/superpowers/plans/2026-05-09-react-refactor.md`

---

## ADR-003: Scraper como cron de GitHub Actions, no como servidor

**Fecha**: 2026-05-09
**Estado**: Implementado

**Contexto**: El scraper original corría bajo demanda vía un servidor Express local (`scraper/legacy/server.js`).

**Decisión**: Portar el scraper a TypeScript (`scraper/src/index.ts`) y dispararlo con un cron semanal de GitHub Actions (sábados 22:00 UTC) usando la service role key de Supabase, en vez de mantener un servidor Node.js siempre encendido.

**Por qué**: El scraping solo hace falta una vez por semana (tras la jornada). Un servidor persistente sería coste y superficie de mantenimiento sin necesidad real — GitHub Actions ya da cron gratis y logs.

**Detalle completo**: `docs/superpowers/plans/2026-05-09-scraper-automation.md`

---

## ADR-004: Autorización de admin vía RLS + flag, no contraseña de cliente

**Fecha**: 2026-09-03
**Estado**: Implementado

**Contexto**: El panel de admin (edición manual de estadísticas/jornadas) comprobaba una contraseña con SHA-256 **en el cliente**, contra un hash embebido en el bundle público (`VITE_ADMIN_HASH`). Además, `jugadores`/`historial` no tenían ninguna política RLS de escritura para `anon`/`authenticated`, así que el panel nunca había podido guardar nada en producción — la contraseña protegía una función rota.

**Decisión**: Columna `usuarios.is_admin`, con políticas RLS de `INSERT`/`UPDATE` en `jugadores` y `historial` restringidas a `authenticated` con `is_admin = true`. El panel de admin ya no pide contraseña: se muestra solo si `usuario.is_admin` es `true` para la sesión activa.

**Por qué**: RLS lo aplica Postgres en el servidor, no el cliente — es imposible de saltarse llamando a la API de Supabase directamente, a diferencia de una comprobación de contraseña en JavaScript. Atar el acceso a una cuenta de Supabase Auth real (en vez de una contraseña compartida) es más simple de administrar y no añade una Edge Function nueva que mantener.

**Detalle completo**: `supabase/migrations/` (migración `admin_rls`).
