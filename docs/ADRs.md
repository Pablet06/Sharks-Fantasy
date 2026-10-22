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

---

## ADR-005: Numeración propia del Fantasy (`jornadas.orden`)

**Fecha**: 2026-10-22
**Estado**: Implementado

**Contexto**: La federación numera las rondas con huecos y orden propio (la primera jornada de los Sharks en la 26-27 es la ronda 7; con descansos, 7 → 9). Todas las tablas del fantasy usan ese número (`jornadas.numero`) como clave.

**Decisión**: Mantener `numero` como única clave interna y añadir `jornadas.orden`, asignado por un trigger `BEFORE INSERT` como `max(orden) + 1`. La interfaz muestra `orden`; el panel de administración sigue mostrando el número de la federación. `resolver_jornada` financia la jornada siguiente buscando `orden + 1`, no `p_jornada + 1`.

**Por qué**: Renumerar la clave habría obligado a migrar `historial`, `alineaciones`, `apuestas`, `presupuestos` y `powerups_aplicados`. Un trigger cubre cualquier escritor (scraper, panel de admin) sin tocar el scraper. Con `p_jornada + 1`, un descanso hacía que el resultado de las apuestas no financiara a nadie.

**Riesgo**: `orden` sigue el orden de inserción, no estrictamente el de la fecha; si una ronda aplazada se inserta tarde, un admin puede corregir `orden` a mano.

**Detalle completo**: `supabase/migrations/20261022000000_fantasy_jornadas_orden.sql`, `.claude/plans/fantasy-ux-v2.md`.

---

## ADR-006: Precios iniciales desde la temporada anterior (`historial_anterior`)

**Fecha**: 2026-10-22
**Estado**: Implementado

**Contexto**: Sin partidos jugados todos los jugadores costaban 50€, y el historial de la 25-26 se borró en el reseteo de temporada. Cloudflare bloqueó (HTTP 429) la recarga partido a partido desde la federación.

**Decisión**: Tabla aparte `historial_anterior` (lectura pública) con 5 partidos virtuales por jugador que continúa, cada uno con su media de puntos de la 25-26 calculada a partir de los totales de temporada. `calcPrecio(historial, anterior)` = máx(50, redondeo(50 + 22 × media)) sobre una ventana mixta de los últimos 5 partidos: primero los de esta temporada, completada con los de la anterior. El multiplicador es la constante `MULTIPLICADOR_PRECIO`.

**Por qué**: Una tabla separada evita contaminar `resolver_jornada`, `cuota_actual` y `recalc_puntos`, que leen `historial` sin filtro de temporada. La ventana mixta hace que los partidos reales vayan sustituyendo a los virtuales sin cambiar la fórmula. Con multiplicador 22, el mejor 7 válido cuesta unos 1088€ frente a un presupuesto de 1000€; con 12 no limitaba a nadie.

**Riesgo**: Los porteros se calcularon suponiendo 8 goles encajados por partido. El precio se calcula solo en el cliente y no hay validación en el servidor.

**Detalle completo**: `supabase/migrations/20261022000002_historial_anterior.sql`, `src/lib/precio.ts`.

---

## ADR-007: Composición obligatoria del 7 y cuotas iniciales con prior

**Fecha**: 2026-10-22
**Estado**: Implementado

**Contexto**: Nada impedía guardar un 7 sin portero o con siete laterales, y sin histórico todas las cuotas salían a ×2.

**Decisión**: El 7 debe ser 1 Portero, 2 Extremos, 2 Laterales, 1 Boya y 1 Contraboya, validado en `validarDraft` (con contador en pantalla) y en un trigger `alineaciones_composicion` en la base de datos. Las cuotas parten de la 25-26 (tabla `cuotas_previas`; en resultado, los Sharks perdieron todos los partidos; goleador y expulsado, estimados por simulación) y `cuota_actual` mezcla ese prior, con peso de 5 partidos, con el histórico actual. Se mantiene el tope ×1,2 a ×2,1.

**Por qué**: El trigger evita saltarse la regla llamando a la API. El prior pesa como 5 partidos para que la temporada real lo desplace pronto. Con el tope ×2,1, casi todas las apuestas siguen a ×2,1; subirlo cambiaría una regla publicada.

**Detalle completo**: `supabase/migrations/20261022000001_alineaciones_composicion.sql`, `supabase/migrations/20261022000003_cuotas_previas.sql`.
