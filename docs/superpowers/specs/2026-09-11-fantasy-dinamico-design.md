# Fantasy dinámico — presupuesto, draft semanal, apuestas y power-ups

**Fecha:** 2026-09-11
**Estado:** Aprobado por el usuario, pendiente de plan de implementación
**Para:** temporada 26-27 (no la 25-26 en curso — hay margen para construir con calma)

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

RLS: un usuario puede INSERT/UPDATE su propia fila de `alineaciones` mientras
`now() < jornadas.fecha_partido - interval '24 hours'`; pasado ese punto, la
fila queda de solo lectura para todos salvo admin. `jornadas` es de lectura
pública, escritura solo por el scraper (service role) / admin.

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

`usuarios.equipo` se deprecia (se puede dejar la columna sin usar o
eliminarla; a decidir en el plan de implementación).

---

## Subproyecto B — Draft, presupuesto y capitán (UI)

Nueva pantalla que sustituye a `Pool.tsx` como pestaña "Mi Equipo":

- Lista de los 17 jugadores con precio actual, filtrable por posición
  (reutiliza `.filter-chip` / `.pos-badge` ya existentes).
- Selección de 7 con contador de presupuesto gastado/restante (1000€ base
  + ajuste de apuestas de la jornada anterior).
- Marcar uno de los 7 como capitán (icono, doble puntos).
- Cuenta atrás visible hasta el deadline (24h antes del partido de los
  Sharks); tras el bloqueo, la pantalla pasa a solo lectura y muestra la
  alineación congelada.
- Si el usuario nunca completa los 7 antes del deadline, se le muestra tras
  el bloqueo que esa jornada puntuó 0 por alineación incompleta.

---

## Subproyecto C — Apuestas

Antes del deadline de cada jornada, el usuario puede apostar sobre hasta 4
tipos de apuesta (una por tipo y jornada). El importe **total** apostado esa
jornada, sumando todas las apuestas que haga, no puede superar el 20% del
presupuesto de esa jornada (p. ej. 200€ sobre 1000€):

| Tipo | Sobre qué apuestas | Cuota calculada de |
|---|---|---|
| Resultado | Gana / pierde / empata el partido de los Sharks | Récord de resultados de los Sharks esta temporada |
| Máximo goleador | Qué jugador del equipo marca más goles esa jornada | Ratio de goles/jornada histórico de cada jugador |
| Más expulsado | Qué jugador acumula más tarjetas/expulsiones esa jornada | Ratio de tarjetas+expulsiones/jornada histórico |
| Portería | El portero encaja menos de 8 goles | Media histórica de `goles_contra` del portero titular |

Cuotas automáticas, acotadas a 1.2x–2.1x (fórmula concreta a definir en el
plan: probabilidad implícita del histórico, invertida y con margen).

**Resolución** (parte de `resolver_jornada(n)`):
- Acierto: `presupuesto(jornada N+1) += importe × cuota − importe`
- Fallo: `presupuesto(jornada N+1) -= importe`
- **Sin suelo de seguridad** — el presupuesto solo tiene como límite no bajar
  de 0€. Una mala racha de apuestas es una consecuencia real, no protegida;
  las apuestas son la palanca para remontar, no una red sin riesgo.
- Apostar es independiente de completar la alineación: un usuario puede
  apostar aunque su alineación quede incompleta esa jornada (y viceversa).

---

## Subproyecto D — Power-ups

Estilo "muchos y pequeños, recargables": se gana 1 token cada 3 jornadas, o
por racha de 2 aciertos de apuesta seguidos. Efectos v1:

| Power-up | Efecto |
|---|---|
| +2 puntos | a un jugador de tu 7 esa jornada |
| Blindaje de tarjeta | anula la penalización por tarjeta/expulsión de un jugador tuyo esa jornada |
| +50€ | de presupuesto extra, solo esa jornada |
| Doble ganancia | si aciertas una apuesta esa jornada, la ganancia neta se duplica |
| Apuesta sin riesgo | si fallas una apuesta esa jornada, no se resta el importe |
| Capitán tardío | puedes cambiar el capitán hasta 1h antes del cierre aunque el resto del 7 ya esté bloqueado |

```sql
CREATE TABLE powerups_usuario (
  usuario_id  uuid REFERENCES usuarios(id),
  tipo        text,
  disponibles integer NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, tipo)
);

CREATE TABLE powerups_aplicados (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  uuid REFERENCES usuarios(id),
  jornada     integer REFERENCES jornadas(numero),
  tipo        text,
  objetivo    integer,   -- dorsal, si el power-up aplica a un jugador concreto
  aplicado_en timestamptz NOT NULL DEFAULT now()
);
```

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
| `jornadas.fecha_partido` depende de que Leverade siempre tenga la fecha del próximo partido disponible con antelación | Si falta, el admin puede rellenarla a mano (columna simple, editable desde `AdminView`) |
| Presupuesto a 0€ tras una mala racha deja al usuario sin poder fichar nada | Es la consecuencia buscada (decisión explícita del usuario, sin suelo) — vigilar en la primera temporada si resulta demasiado punitivo y hay que revisar |
| Alineación incompleta → 0 puntos puede penalizar a alguien que se olvidó una semana de forma desproporcionada | Es la consecuencia buscada (fuerza el hábito semanal); revisar tras la primera temporada si hace falta un aviso/recordatorio (fuera de alcance v1) |

---

## Próximo paso

Plan de implementación detallado de la **Fase A** (`superpowers:writing-plans`),
empezando por el esquema y `resolver_jornada()` ya que todo lo demás depende
de ello.
