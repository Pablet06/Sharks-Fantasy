# Fantasy dinámico — presupuesto, draft semanal, apuestas y power-ups

**Fecha:** 2026-09-11
**Estado:** Fases A, B y C implementadas y en producción (A y B en `develop`, aún no en `main`; C en PR #6 contra `develop`, migraciones ya aplicadas a prod). Fase D diseñada, pendiente de plan de implementación.
**Para:** la temporada en curso — todas las fases, incluidos los power-ups, están activas ya esta temporada, no se aplaza nada a la siguiente.

---

## Contexto

Hoy el juego es estático: cada usuario tiene un `usuarios.equipo` (7 dorsales)
que mantiene indefinidamente. Sumas puntos de las jornadas jugadas por esos
7 jugadores y no hay ninguna decisión semanal — se elige una vez y ya. Es
aburrido durante la temporada.

Además hay un bug de fondo: `recalc_puntos()` calcula `usuarios.puntos` como
la suma de `historial.puntos` de los jugadores que tienes **ahora mismo** en
`equipo`, sobre **todas** las jornadas jugadas. Fichar hoy a un jugador te da
retroactivamente todos sus puntos de la temporada. No hay ningún registro de
qué alineación tenía cada usuario en cada jornada.

Este documento diseña un bucle semanal real: presupuesto, draft por jornada,
capitán, apuestas y power-ups — todo calculable a partir de los datos que el
scraper ya recoge (`jugadores`, `historial`, resultados de partido), sin
añadir fuentes de datos nuevas ni tocar el modelo de 17 jugadores de Los
Sharks (decisión: no se amplía a otros equipos de la liga).

## Decisiones de partida (de la sesión de brainstorming)

- **Pool de jugadores**: solo los ~17 de Los Sharks (no toda la liga).
- **Escala de usuarios**: 5-12. Sin propiedad exclusiva de jugadores —
  cualquiera puede fichar a cualquiera, la escasez viene del presupuesto.
- **Bucle semanal**: draft desde cero cada jornada (no plantilla persistente).
  Sin banquillo.
- **Apuestas**: con riesgo real sobre el presupuesto de la jornada siguiente,
  cuotas automáticas (sin admin).
- **Power-ups**: muchos y pequeños, recargables (no "chips" escasos de 1-2
  usos al año).

---

## Subproyecto A — Alineación por jornada (fundamento, va primero)

Todo lo demás depende de esto. Sustituye `usuarios.equipo`/`usuarios.puntos`
como fuente de verdad de puntuación.

### Esquema nuevo

```sql
-- Calendario de jornadas: fecha del partido de los Sharks (para el deadline)
-- y su resultado, ya conocido por el scraper vía Leverade.
CREATE TABLE jornadas (
  numero          integer PRIMARY KEY,
  fecha_partido   timestamptz,
  resultado       text CHECK (resultado IN ('gana','pierde','empata')),
  goles_favor     integer,
  goles_contra    integer,
  finalizado      boolean NOT NULL DEFAULT false
);

-- Alineación congelada de cada usuario para cada jornada.
CREATE TABLE alineaciones (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id        uuid NOT NULL REFERENCES usuarios(id),
  jornada           integer NOT NULL REFERENCES jornadas(numero),
  jugadores         integer[],   -- dorsales; NULL o <7 = incompleta
  capitan           integer,     -- dorsal, debe estar en jugadores
  presupuesto_usado numeric,     -- suma de precios en el momento del draft (auditoría)
  puntos_jornada    integer,     -- NULL hasta resolver tras el sync
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, jornada)
);

-- Presupuesto disponible de cada usuario para cada jornada.
CREATE TABLE presupuestos (
  usuario_id  uuid REFERENCES usuarios(id),
  jornada     integer REFERENCES jornadas(numero),
  presupuesto numeric NOT NULL,
  PRIMARY KEY (usuario_id, jornada)
);
```

RLS: un usuario puede INSERT/UPDATE su propia fila de `alineaciones` solo
cuando `jornadas.fecha_partido` es conocida y `now() < fecha_partido -
interval '24 hours'` (fail-closed: sin fecha conocida, no se puede escribir
— no hay excepción "vía libre" si falta la fecha). `jornadas` es de lectura
pública, escritura solo por el scraper (service role) / admin.

**Implementado en Fase A** (`supabase/migrations/20260911000000_fantasy_jornadas_alineaciones.sql`,
`.../20260911000001_fantasy_presupuestos_resolver.sql`,
`.../20260911000002_fantasy_dinamico_hardening.sql`), con dos correcciones
que salieron de la revisión final y ya están en prod: la comprobación de
"7 jugadores" usa `HAVING count(DISTINCT numero) = 7` (no `array_length`,
que dejaba pasar dorsales duplicados) y `resolver_jornada()` no hace nada
si la jornada aún no tiene `historial`. La visibilidad de `alineaciones`
(SELECT) se endurece en Fase B — ver esa sección.

### Precio de jugador

No se almacena — se calcula al vuelo desde `historial`:

```
precio(jugador, jornada) = max(50, 100 + 12 × media_puntos_ultimas_5_jornadas_jugadas)
```

El multiplicador (`12`) es una constante a calibrar durante la
implementación contra datos reales de la temporada, con el objetivo de que
el conjunto de "los 7 mejores" quede 10-30% por encima del presupuesto base
(1000€) — ni inalcanzable, ni gratis. Con los promedios reales de esta
temporada el mejor 7 rondaría ~1130€, que es el rango que se busca.

El precio es estable entre syncs (solo cambia cuando el sync semanal
actualiza `historial`), así que no hace falta congelar un snapshot: se
calcula igual en el momento del draft y en la resolución de la jornada.

### Puntuación de la jornada

Tras el sync semanal (cuando `historial` de la jornada N ya está escrito),
una función `resolver_jornada(n)` (mismo patrón que `recalc_puntos()`):

1. Para cada `alineaciones` de la jornada N:
   - Si `jugadores` tiene los 7 dorsales rellenados → `puntos_jornada` =
     suma de `calcMatchPoints` de cada uno + bonus de capitán (sus puntos de
     esa jornada se cuentan doble) + ajuste de power-ups aplicados.
   - Si `jugadores` tiene menos de 7 (no completó a tiempo) →
     `puntos_jornada = 0`. Sin puntuación parcial.
2. `usuarios.puntos` pasa a ser la suma acumulada de `alineaciones.puntos_jornada`
   de jornadas ya resueltas — ya no se recalcula sobre el equipo actual.

`resolver_jornada(n)` la dispara el scraper (service role) justo después de
escribir el `historial` de esa jornada — mismo punto del flujo donde hoy se
llama a `recalc_puntos()`. El admin puede volver a lanzarla a mano desde
`AdminView` si hace falta reprocesar una jornada.

**Implementado en Fase A con una diferencia respecto a lo descrito arriba:**
el paso 2 (`usuarios.puntos` = suma de `alineaciones.puntos_jornada`) está
**deshabilitado a propósito** (comentado en la función, no borrado) mientras
nada escriba en `alineaciones` de verdad — Fase A no trae UI de draft, así
que dejarlo activo solo puede pisar el `usuarios.puntos` real (calculado por
el `recalc()`/`equipo` de siempre) con datos de prueba. **Fase B reactiva
este bloque en el mismo commit en que quita la llamada a `recalc()`** del
scraper — ver esa sección. `usuarios.equipo` se deja como columna sin usar
(no se borra — irreversible y sin beneficio); Fase B deja de leerla/escribirla.

---

## Subproyecto B — Draft, presupuesto, capitán y corte con el modelo antiguo

Decisiones de la sesión de brainstorming del 2026-09-11 (segunda ronda):

- **El scraper también escribe el calendario futuro.** Cada sync, además de
  resolver la jornada recién jugada, mira las jornadas siguientes en el
  calendario de Leverade (ya consultado hoy) y crea/actualiza su fila en
  `jornadas` con la fecha del partido de los Sharks, sin resultado todavía
  (`resultado`/`goles_*` quedan NULL, `finalizado = false`). Sin esto no
  existe fila donde apuntar una alineación futura (FK) y nadie puede
  draftear con antelación. **Mecanismo confirmado contra la API real:**
  `GET /rounds/{id}?include=matches` devuelve cada partido con
  `meta.home_team`/`meta.away_team` (IDs de equipo), presentes aunque el
  partido no se haya jugado ni tenga fecha todavía; `GET /teams/{id}` da el
  nombre para identificar cuál es el partido de los Sharks. No hace falta
  el scraping de FNCV (que solo tiene página de stats una vez jugado).
- **Corte limpio, no convivencia.** `Pool.tsx` y `usuarios.equipo` como
  fuente de puntos desaparecen por completo. Desde la primera jornada de la
  26-27 todo el mundo draftea cada semana. Este subproyecto reactiva el
  bloque de `usuarios.puntos` en `resolver_jornada()` (comentado en Fase A)
  y quita la llamada a `recalc()` de `runSync` **en el mismo commit** — dos
  sistemas escribiendo la misma columna a la vez fue la causa del incidente
  de la Fase A (ver diario/ledger de esa sesión), no se repite.
- **Alineaciones visibles solo cuando se resuelven.** `alineaciones_select`
  se endurece: el dueño y el admin ven siempre su fila; cualquier otro
  usuario (o una llamada anónima a la API) solo ve una alineación una vez
  resuelta (`puntos_jornada IS NOT NULL`). Antes de eso, invisible de
  verdad a nivel de RLS, no solo ocultada en la interfaz — evita que se
  puedan copiar picks ajenos antes del cierre.

### Pantalla de draft (sustituye a `Pool.tsx` en la pestaña "Mi Equipo")

- **Jornada abierta** = la de menor `numero` en `jornadas` cuyo deadline
  (`fecha_partido - 24h`) no ha pasado. Si no hay ninguna fila de jornada
  todavía (el scraper no ha corrido o no hay próximo partido programado),
  pantalla de espera ("sin jornada abierta todavía").
- Lista de los 17 jugadores con precio (`calcPrecio`, ya construido en Fase
  A), filtrable por posición (reutiliza `.filter-chip` / `.pos-badge`
  existentes).
- Selección de 7 con contador de presupuesto gastado/restante
  (`presupuesto_actual`, ya construido en Fase A — en esta fase siempre
  1000€ base, sin ajuste de apuestas todavía, eso es Fase C).
- Marcar uno de los 7 como capitán (icono, doble puntos).
- Guardar hace un upsert en `alineaciones` — la RLS ya impide guardar
  pasado el deadline o con más de 7 jugadores mal formados (Fase A).
- Cuenta atrás visible hasta el deadline. Pasado el deadline: pantalla de
  solo lectura con la alineación congelada (o el aviso de que quedó
  incompleta, una vez la jornada se resuelva y se sepa si puntuó 0).

### `Ranking.tsx` — modal "ver equipo"

Pasa a mostrar la alineación **resuelta más reciente** de ese usuario
(consulta simple: última `alineaciones` de ese `usuario_id` con
`puntos_jornada IS NOT NULL`, ordenada por `jornada DESC LIMIT 1`) en vez
del `usuarios.equipo` fijo de hoy. La RLS ya garantiza que una alineación
sin resolver nunca vuelve en esa consulta para nadie que no sea el dueño.

---

## Subproyecto C — Apuestas

Decisiones de la sesión de brainstorming del 2026-09-13:

Antes del deadline de cada jornada (mismas 24h que el draft), el usuario
puede apostar sobre hasta 4 tipos (una selección por tipo y jornada). El
importe **total** apostado esa jornada, sumando todas las apuestas, no
puede superar el 20% del presupuesto de esa jornada (p. ej. 200€ sobre
1000€). **Pestaña propia "Apuestas" en la barra de navegación**, separada
del draft.

| Tipo | Sobre qué apuestas | Empate |
|---|---|---|
| Resultado | Gana / pierde / empata el partido de los Sharks | — |
| Máximo goleador | Qué jugador marca más goles del equipo esa jornada | Empate = nadie acierta, se devuelve el importe |
| Más expulsado | Qué jugador acumula más tarjetas+expulsiones esa jornada | Empate = nadie acierta, se devuelve el importe |
| Portería | Algún portero que jugó encaja menos de 8 goles | — |

### Cuotas automáticas

Sobre el histórico de **toda la temporada hasta la jornada anterior**
(no una ventana de N jornadas — más datos, más simple que calcPrecio):

- **Resultado**: `prob = veces que pasó / partidos jugados`.
- **Máximo goleador / más expulsado**: `prob(jugador) = jornadas donde fue
  el máximo esa categoría / jornadas jugadas por el equipo`.
- **Portería**: `prob = jornadas con goles_contra < 8 del portero que jugó
  / jornadas jugadas por algún portero`. Es una apuesta sobre el equipo
  (cualquier portero que juegue esa jornada), no sobre un portero elegido.
- **Sin histórico todavía** (denominador 0, inicio de temporada): `prob = 0.5`
  por defecto para los 4 tipos por igual.
- **Cuota** = `clamp(1 / prob, 1.2, 2.1)`.

**La cuota no la envía el cliente — la calcula el servidor.** Un trigger
`BEFORE INSERT` en `apuestas` la fija llamando a una función
`cuota_actual(tipo, seleccion, jornada)`; el cliente solo manda
tipo/selección/importe. Esto congela la cuota que el usuario vio al apostar
(la resolución no puede recalcularla más tarde con el resultado ya
incluido en el histórico) y, sobre todo, cierra la vía obvia para
falsificar una cuota y forzar una ganancia — la cuota nunca es un valor de
confianza del cliente, igual que ya se hace con el resto de campos
sensibles de este proyecto.

### Visibilidad

**Privadas siempre**, incluso resueltas — solo el dueño y el admin ven una
apuesta. A diferencia de `alineaciones` (públicas una vez resueltas),
apostar es una decisión personal que no hace falta enseñar a nadie.

### Resolución (parte de `resolver_jornada(n)`)

- Acierto: `ganancia = importe × cuota − importe`. Fallo: `ganancia = −importe`.
  Empate en goleador/expulsado: `ganancia = 0` (se devuelve el importe).
- `presupuesto(jornada N+1) = max(0, 1000 + suma de ganancias del usuario esa jornada)`.
  **Sin suelo de seguridad** — el presupuesto solo tiene como límite no
  bajar de 0€. Una mala racha de apuestas es una consecuencia real, no
  protegida; las apuestas son la palanca para remontar, no una red sin
  riesgo.
- Si la jornada N+1 todavía no existe en `jornadas` (fin de temporada), no
  se escribe nada — no hay a qué jornada financiar.
- Apostar es independiente de completar la alineación: un usuario puede
  apostar aunque su alineación quede incompleta esa jornada (y viceversa).

---

## Subproyecto D — Power-ups

Estilo "muchos y pequeños, recargables": se gana 1 token cada 3 jornadas
*jugadas* (no cada 3 números de jornada — cuenta jornadas resueltas en
orden, robusto ante huecos en la numeración), de tipo aleatorio entre los
6, para **todos** los usuarios a la vez. Además, cualquier usuario con una
racha de 2 jornadas seguidas con al menos un acierto de apuesta cada una
gana 1 token aleatorio extra, individual. Activo ya esta temporada (no se
aplaza a la siguiente).

**Límite:** como mucho 1 power-up aplicado por usuario y jornada, sin
importar cuántos tipos distintos tenga en inventario.

**Ventana de aplicación:** el mismo cierre de 24h que ya bloquea alineación
y apuestas — se elige el power-up (y su objetivo, si aplica) antes de esa
hora. Excepción: "Capitán tardío" (ver más abajo).

| Power-up | Efecto | Objetivo al aplicar |
|---|---|---|
| +2 puntos | Suma 2 a `alineaciones.puntos_jornada` si el jugador objetivo estaba en el 7 y el 7 puntuó esa jornada (un equipo incompleto sigue sin puntuar, el power-up no lo rescata). | Un dorsal de tu 7 |
| Blindaje de tarjeta | Anula la penalización de tarjeta/expulsión del jugador objetivo, sumando de vuelta exactamente lo que le restaron: `tarjetas*3 + expulsiones*1 + expulsiones_graves*5` (mismas constantes que `scraper/src/points.ts::calcMatchPoints`; ver nota de sincronización más abajo). | Un dorsal de tu 7 |
| +50€ | Suma 50€ a tu presupuesto de la jornada abierta. Se aplica al instante al redimirlo (no espera a `resolver_jornada`), escribiendo directamente en `presupuestos`. | Ninguno |
| Doble ganancia | Todas tus apuestas acertadas de esa jornada duplican su ganancia neta (no solo una). | Ninguno |
| Apuesta sin riesgo | Ninguna de tus apuestas falladas de esa jornada resta el importe (ganancia queda en 0 en vez de `-importe`). | Ninguno |
| Capitán tardío | Tu campo `capitan` queda editable hasta 1h antes del partido, aunque el resto del 7 ya esté bloqueado a las 24h. | Ninguno |

### Esquema

```sql
CREATE TABLE powerups_usuario (
  usuario_id  uuid REFERENCES usuarios(id),
  tipo        text CHECK (tipo IN (
    'puntos_extra','blindaje','presupuesto_extra',
    'doble_ganancia','apuesta_sin_riesgo','capitan_tardio'
  )),
  disponibles integer NOT NULL DEFAULT 0 CHECK (disponibles >= 0),
  PRIMARY KEY (usuario_id, tipo)
);

CREATE TABLE powerups_aplicados (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuarios(id),
  jornada     integer NOT NULL REFERENCES jornadas(numero),
  tipo        text NOT NULL CHECK (tipo IN (
    'puntos_extra','blindaje','presupuesto_extra',
    'doble_ganancia','apuesta_sin_riesgo','capitan_tardio'
  )),
  objetivo    integer,   -- dorsal, solo para puntos_extra/blindaje
  aplicado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, jornada)   -- como mucho 1 power-up por usuario y jornada
);
```

RLS en ambas tablas: privadas, mismo patrón que `apuestas` (dueño + admin,
nunca públicas). `powerups_aplicados` sigue el mismo criterio de
`apuestas_owner_write`/`alineaciones_owner_write` (editable solo con más de
24h para el partido), salvo la excepción de "Capitán tardío" descrita
abajo, que vive en la policy de `alineaciones`, no en esta tabla.

### Ganancia de tokens (parte de `resolver_jornada(n)`)

Bloque nuevo al FINAL de la función, después de
`UPDATE jornadas SET finalizado = true WHERE numero = p_jornada` (no antes
— si se ejecutara antes, el recuento de jornadas resueltas no incluiría
todavía la actual y la cadencia de "cada 3" iría sistemáticamente una
jornada tarde):

```sql
-- Token de cadencia: cada 3 jornadas RESUELTAS (no cada 3 números de
-- jornada), para todos los usuarios a la vez. Va DESPUÉS del UPDATE que
-- marca esta jornada como finalizado=true, para que la propia jornada
-- actual cuente en el recuento.
IF (SELECT count(*) FROM jornadas WHERE finalizado = true) % 3 = 0 THEN
  INSERT INTO powerups_usuario (usuario_id, tipo, disponibles)
  SELECT id, (ARRAY['puntos_extra','blindaje','presupuesto_extra',
                     'doble_ganancia','apuesta_sin_riesgo','capitan_tardio'])
              [1 + floor(random() * 6)::int], 1
  FROM usuarios
  ON CONFLICT (usuario_id, tipo) DO UPDATE SET disponibles = powerups_usuario.disponibles + 1;
END IF;

-- Token de racha: por usuario, 2 jornadas RESUELTAS SEGUIDAS (en el mismo
-- sentido "en orden" que la cadencia de arriba, no números de jornada
-- consecutivos) en las que tuvo al menos una apuesta con acierto=true,
-- siendo la más reciente de esas dos la jornada que se acaba de resolver
-- (p_jornada). Concretamente: sea J la jornada resuelta inmediatamente
-- ANTES de p_jornada (la de mayor numero con finalizado=true y
-- numero < p_jornada); si el usuario tiene >=1 fila de apuestas con
-- acierto=true en J Y en p_jornada, gana el token de racha. Sin jornada
-- anterior resuelta (p.ej. la primera de la temporada), no hay racha
-- posible todavía.
```

*Nota de sincronización:* las constantes `3`, `1`, `5` de "blindaje de
tarjeta" están duplicadas a mano desde `scraper/src/points.ts` porque SQL
no puede importar TypeScript — si esa fórmula cambia alguna vez, esta
migración queda desincronizada silenciosamente. Se documenta con un
comentario en el SQL apuntando a ese fichero.

### Aplicación (frontend)

Pestaña nueva "Power-ups", junto a Apuestas: muestra el inventario
(`powerups_usuario`) y permite aplicar como mucho uno a la jornada abierta,
con selector de jugador objetivo cuando el tipo lo requiere
(+2 puntos / blindaje). "Capitán tardío" se aplica igual (antes de las
24h) pero su efecto se nota después: `Draft.tsx` debe comprobar si hay un
`powerups_aplicados` de ese tipo para la jornada y, si lo hay, permitir
editar solo `capitan` (no el resto de `jugadores`) hasta 1h antes del
partido en vez de las 24h generales.

### Integración con `resolver_jornada()`

- **+2 puntos / blindaje**: se aplican como un `UPDATE alineaciones` extra
  después del bloque de puntuación normal de Fase A/B, sumando el ajuste
  correspondiente solo a la fila de la alineación completa (7 distintos)
  del usuario que tenga el power-up aplicado con ese objetivo.
- **+50€**: no se toca en `resolver_jornada` — ya se escribió en
  `presupuestos` al redimir el power-up, antes del cierre.
- **Doble ganancia / apuesta sin riesgo**: se incorporan a los `CASE` que
  ya calculan `ganancia` en los bloques de apuestas de Fase C (multiplicar
  por 2 la ganancia positiva, o forzar 0 en vez de `-importe`, según si el
  usuario tiene el power-up correspondiente aplicado esa jornada).
- **Capitán tardío**: no toca `resolver_jornada` — es una excepción de
  RLS/UI sobre `alineaciones`, no una regla de puntuación.

---

## Secuencia de entrega

Cada fase es un PR independiente, como en Federation Sync / Admin Panel:

1. **Fase A** — `jornadas` + `alineaciones` + `presupuestos`, precio
   calculado, `resolver_jornada()`, deprecar `equipo`/`recalc_puntos()`
   viejo. Sin esto no hay nada que construir encima.
2. **Fase B** — Pantalla de draft (sustituye Pool.tsx): presupuesto, 7
   jugadores, capitán, deadline 24h, bloqueo.
3. **Fase C** — Apuestas: UI + cuotas automáticas + resolución.
4. **Fase D** — Power-ups: ganancia de tokens + UI de aplicación.

## Fuera de alcance

- Banquillo / suplentes.
- Propiedad exclusiva de jugadores (no viable con 5-12 usuarios).
- Apuestas entre usuarios directamente.
- Jugadores de otros equipos de la liga.
- Presupuesto acumulable sin límite entre temporadas.

## Riesgos / ceilings conocidos

| Riesgo | Mitigación |
|---|---|
| El multiplicador de precio (`12`) no genera la escasez deseada con datos reales | Calibrar en Fase A contra el histórico real antes de desplegar; es una constante, no un valor grabado en piedra |
| `jornadas.fecha_partido` depende de que Leverade siempre tenga la fecha del próximo partido disponible con antelación | Resuelto en Fase B: el scraper escribe el calendario futuro cada sync. Si Leverade no publica la fecha a tiempo, la jornada simplemente no se abre para draftear (RLS fail-closed sin fecha) hasta que la tenga — no bloquea nada, solo retrasa esa jornada |
| Identificar el partido de los Sharks en una jornada aún no jugada (sin página de stats todavía) | Resuelto: comprobado contra la API real de Leverade — `GET /rounds/{id}?include=matches` devuelve cada partido con `meta.home_team`/`meta.away_team` (IDs de equipo) independientemente de si está jugado, y `GET /teams/{id}` da el nombre. No hace falta tocar el scraping de FNCV para esto. |
| Presupuesto a 0€ tras una mala racha deja al usuario sin poder fichar nada | Es la consecuencia buscada (decisión explícita del usuario, sin suelo) — vigilar en la primera temporada si resulta demasiado punitivo y hay que revisar |
| Alineación incompleta → 0 puntos puede penalizar a alguien que se olvidó una semana de forma desproporcionada | Es la consecuencia buscada (fuerza el hábito semanal); revisar tras la primera temporada si hace falta un aviso/recordatorio (fuera de alcance v1) |
| "Blindaje de tarjeta" (Fase D) duplica a mano en SQL las constantes de penalización de `scraper/src/points.ts::calcMatchPoints` — si esa fórmula cambia, la migración queda desincronizada en silencio | Comentario explícito en el SQL apuntando al fichero fuente; sin mecanismo automático de sincronización (no viable entre TypeScript y una migración ya aplicada) |

---

## Estado

- **Fase A**: implementada, revisada, en `develop` (PR #4). Aún no en `main`.
- **Fase B**: implementada, revisada, en `develop` (PR #5). Aún no en `main`.
- **Fase C**: implementada, revisada (incluida revisión final de rama),
  migraciones aplicadas a producción, PR #6 abierta contra `develop`.
- **Fase D**: diseño aprobado (sección de arriba), siguiente paso es el plan
  de implementación (`superpowers:writing-plans`).
