# Manual del juego — Los Sharks Fantasy

Guía completa de reglas y funcionamiento, para jugadores y para administradores.
Cubre las cuatro fases del "fantasy dinámico": alineación por jornada, draft con
presupuesto y capitán, apuestas, y power-ups.

> Referencia técnica más detallada (para quien quiera el porqué de cada regla):
> `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md`.

---

## Índice

**Para jugadores**
1. [El concepto](#1-el-concepto)
2. [Cómo entrar](#2-cómo-entrar)
3. [Mi Equipo — el draft semanal](#3-mi-equipo--el-draft-semanal)
4. [Apuestas](#4-apuestas)
5. [Power-ups](#5-power-ups)
6. [Cómo se puntúa](#6-cómo-se-puntúa)
7. [Ranking](#7-ranking)
8. [Jugadores (la plantilla)](#8-jugadores-la-plantilla)
9. [Perfil](#9-perfil)
10. [Preguntas frecuentes](#10-preguntas-frecuentes)

**Para administradores**
11. [Panel de administración](#11-panel-de-administración)
12. [El ciclo semanal del admin](#12-el-ciclo-semanal-del-admin)
13. [Fin e inicio de temporada](#13-fin-e-inicio-de-temporada)
14. [Cosas que solo se pueden hacer a mano en la base de datos](#14-cosas-que-solo-se-pueden-hacer-a-mano-en-la-base-de-datos)

---

# Para jugadores

## 1. El concepto

Cada jornada de Los Sharks en la liga es un mini-juego independiente:

1. **Antes del cierre** (24 horas antes del partido): eliges tu alineación de 7
   jugadores dentro de un presupuesto, apuestas sobre lo que crees que va a
   pasar, y puedes gastar un power-up.
2. **Se juega el partido.**
3. **Se resuelve la jornada**: tu alineación puntúa según las estadísticas
   reales de tus 7 jugadores, tus apuestas se liquidan (ganas o pierdes
   presupuesto), y puede que ganes tokens de power-up nuevos.
4. **Repite** la semana siguiente con un equipo, unas apuestas y un
   presupuesto distintos.

No hay plantilla fija: se draftea de cero cada jornada, así que un mal
resultado nunca te condena para el resto de la temporada.

## 2. Cómo entrar

Regístrate o inicia sesión con tu email. Al entrar por primera vez se te crea
un usuario con 0 puntos y un presupuesto inicial de 1000€ para tu primera
jornada. La navegación tiene 6 pestañas: 🌊 Mi Equipo, 🎲 Apuestas, ⚡
Power-ups, 🏆 Ranking, 👥 Jugadores, 👤 Perfil.

## 3. Mi Equipo — el draft semanal

### Qué jornada está abierta

Solo hay **una** jornada draftable a la vez: la próxima jornada de Los Sharks
con fecha de partido conocida y a **más de 24 horas vista**. Si no hay
ninguna jornada así (por ejemplo, la fecha del próximo partido todavía no se
sabe), la pestaña dice que no hay jornada abierta — no es un fallo, es que
hay que esperar a que se sepa el calendario.

### Presupuesto

- Tu primera jornada de la temporada empieza con **1000€**.
- A partir de ahí, tu presupuesto de cada jornada depende de cómo te fue en
  la **apuestas** de la jornada anterior (ver sección 4) y de los power-ups
  que hayas usado — puede subir o bajar, sin suelo ni techo salvo el 0€ (no
  se puede quedar en negativo).

### Precio de cada jugador

El precio de un jugador **no es fijo**: se recalcula solo a partir de su
rendimiento reciente.

> `precio = máx(50€, redondeo(100 + 12 × media de puntos de fantasy en sus
> últimas 5 jornadas jugadas))`

- Sin partidos jugados todavía, un jugador cuesta 50€ (el mínimo).
- Cuanto mejor rinda un jugador últimamente, más caro se pone — el mercado
  se ajusta solo, jornada a jornada.

### Elegir tu 7

- Exactamente **7 dorsales distintos**, sin repetir.
- El coste total no puede superar tu presupuesto de esa jornada.
- Eliges un **capitán** entre tus 7 — sus puntos de esa jornada **cuentan
  doble** (para bien y para mal: si tiene una mala jornada con tarjetas o
  expulsión, esa penalización también se dobla).
- Puedes filtrar la lista por posición (Portero, Boya, Extremo, Lateral,
  Contraboya) para ayudarte a elegir.

### El cierre (24 horas)

24 horas antes del partido, tu alineación de esa jornada queda **bloqueada**:
ya no puedes cambiar jugadores, presupuesto usado ni capitán (salvo con el
power-up de "Capitán tardío", ver sección 5). Guarda con tiempo — un intento
de guardar después del cierre se rechaza.

### Si no completas tu 7

Si al cierre no tienes exactamente 7 jugadores elegidos (por ejemplo, se te
olvidó draftear esa semana), tu alineación **no puntúa nada esa jornada** (0
puntos). Es intencionado: fuerza el hábito semanal. No hay aviso previo ni
periodo de gracia todavía — si te preocupa olvidarte, hazlo en cuanto se
abra la jornada.

## 4. Apuestas

Antes del mismo cierre de 24h, puedes apostar sobre hasta 4 cosas distintas
en la misma jornada. Cada apuesta tiene su propia cuota, calculada
automáticamente por el sistema (nunca la fijas tú ni el admin).

| Tipo | Sobre qué apuestas |
|---|---|
| **Resultado** | Si Los Sharks ganan, pierden o empatan el partido |
| **Máximo goleador** | Qué jugador de Los Sharks marca más goles esa jornada |
| **Más expulsado** | Qué jugador acumula más tarjetas + expulsiones esa jornada |
| **Portería** | Si el portero que juega encaja menos de 8 goles |

### Cuotas automáticas

La cuota de cada apuesta se calcula sobre el **histórico real de la
temporada** hasta la jornada anterior (cuantas más jornadas se hayan jugado,
más fiable es):

> `cuota = acotado_entre(1.2x y 2.1x, 1 / probabilidad histórica de acertar)`

Sin histórico todavía (por ejemplo, al principio de temporada), la
probabilidad de partida es del 50% para cada opción. La cuota se ve en
pantalla **antes** de apostar, y se recalcula al momento si cambias tu
elección (por ejemplo, de "gana" a "pierde"). Una vez guardada la apuesta,
esa cuota queda fija — no cambia aunque el histórico cambie después.

### Tope del 20%

La suma de tus 4 apuestas de una misma jornada **no puede superar el 20% de
tu presupuesto** de esa jornada. Si te pasas, el sistema te dice
exactamente cuánto llevas y cuánto es el tope.

### Resolución

- **Resultado**: aciertas si tu elección coincide con el resultado real.
- **Máximo goleador / Más expulsado**: aciertas si tu jugador es, en
  solitario, el que más marcó/acumuló esa jornada. **Si hay empate entre
  varios jugadores, nadie acierta ni falla** — se te devuelve el importe
  tal cual (ni ganas ni pierdes).
- **Portería**: aciertas si algún portero que jugó esa jornada encajó menos
  de 8 goles.
- Si aciertas, ganas `importe × cuota − importe`. Si fallas, pierdes el
  importe apostado.
- El resultado neto de tus 4 apuestas (positivo o negativo) se suma a tu
  presupuesto de **la jornada siguiente**.

### Privacidad

Tus apuestas son **siempre privadas** — a diferencia de tu alineación (que
se hace pública una vez resuelta la jornada), nadie más ve lo que apostaste
ni el resultado, ni siquiera después de resolverse.

### Editar o cancelar

Mientras la jornada siga abierta (antes del cierre de 24h), puedes:
- Cambiar la selección o el importe de una apuesta ya hecha — la cuota se
  **recalcula** para la nueva selección.
- Borrar una apuesta (deja el campo vacío y guarda) sin penalización.

## 5. Power-ups

Los power-ups son efectos reutilizables que ganas jugando, no algo que se
compre. Se aplican como mucho **uno por jornada**, en la pestaña ⚡
Power-ups, dentro del mismo cierre de 24h que la alineación y las apuestas.

### Cómo se ganan

- **Cadencia**: cada 3 jornadas que se resuelven en la liga (contando en
  orden, no por el número de jornada), **todos los usuarios** reciben 1
  token de un tipo aleatorio entre los 6.
- **Racha de apuestas**: si aciertas al menos una apuesta dos jornadas
  seguidas (la que se acaba de resolver y la anterior), ganas 1 token
  aleatorio extra, solo para ti.

Tu inventario (cuántos tienes de cada tipo) se ve siempre en la pestaña de
Power-ups.

### Los 6 tipos

| Power-up | Efecto | ¿Necesita elegir un jugador? |
|---|---|---|
| **+2 puntos** | Suma 2 puntos a tu alineación de esa jornada, a través de uno de tus 7 jugadores | Sí |
| **Blindaje de tarjeta** | Anula la penalización de tarjeta/expulsión de uno de tus 7 jugadores esa jornada — si es tu capitán, la compensación también se dobla | Sí |
| **+50€** | Suma 50€ a tu presupuesto de la jornada abierta, al instante | No |
| **Doble ganancia** | Todas tus apuestas acertadas de esa jornada duplican su ganancia | No |
| **Apuesta sin riesgo** | Ninguna de tus apuestas falladas de esa jornada te resta el importe | No |
| **Capitán tardío** | Puedes cambiar SOLO el capitán (no el resto del equipo) hasta 1 hora antes del partido, aunque el resto ya esté bloqueado a las 24h | No (el objetivo se elige después, desde Mi Equipo) |

Notas importantes:
- **+2 puntos** y **Blindaje** solo hacen efecto si tu equipo esa jornada
  está completo (7 jugadores) — un equipo incompleto no se "rescata" con un
  power-up.
- **Doble ganancia** y **Apuesta sin riesgo** afectan a TODAS tus apuestas
  de esa jornada, no a una que elijas.
- **Capitán tardío**: lo aplicas como cualquier otro power-up antes de las
  24h, pero su efecto se nota después — en la pestaña "Mi Equipo", una vez
  tu alineación esté bloqueada, aparece un mini-selector para cambiar solo
  el capitán hasta 1h antes del partido.
- Si gastas un power-up y no te queda ninguno de ese tipo, el sistema lo
  rechaza — nunca se gasta "en el aire".

## 6. Cómo se puntúa

Cada jugador que jugó una jornada suma puntos de fantasy según sus
estadísticas reales del partido:

| Estadística | Puntos |
|---|---|
| Jugar el partido | +1 |
| Gol (no portero) | +5 |
| Gol de penalti (no portero) | +3 |
| Penalti fallado (no portero) | −2 |
| Falta de penalti cometida | −1 |
| Expulsión | −1 |
| Tarjeta | −3 |
| Expulsión grave | −5 |
| Portero que juega | +2 |
| Portero: goles encajados | +max(0, 10 − goles encajados) |

Tu alineación suma los puntos de tus 7 jugadores, **doblando** los del
capitán. Los power-ups de "+2 puntos" y "Blindaje" se suman encima de este
cálculo (ver sección 5). Tu puntuación total (`Ranking`) es la suma de
todas tus jornadas resueltas.

## 7. Ranking

Muestra el top 10 de usuarios por puntos totales. Al tocar un usuario ves su
**última jornada ya resuelta** (nunca su alineación de la jornada abierta —
eso se mantiene en secreto hasta que se juega). Se indica quién fue el
capitán de esa alineación.

## 8. Jugadores (la plantilla)

Lista de los ~17 jugadores de Los Sharks disponibles para draftear, con su
ficha (nombre, posición, foto, frase). El pool de jugadores es siempre el
mismo para todos — no hay propiedad exclusiva, cualquiera puede fichar a
cualquiera en cualquier jornada.

## 9. Perfil

Desde tu perfil puedes:
- Ver tu email.
- Cambiar tu nombre visible.
- Cerrar sesión.
- Borrar tu cuenta permanentemente (pide confirmación, es irreversible).

## 10. Preguntas frecuentes

**¿Puedo tener el mismo jugador que otro usuario en mi equipo?**
Sí. No hay propiedad exclusiva — la escasez viene solo del presupuesto.

**¿Qué pasa si me olvido de draftear una semana?**
Tu alineación de esa jornada queda con 0 puntos. Tu presupuesto para la
jornada siguiente sigue siendo el que te tocara (no se pierde por no
draftear, solo por apostar mal o gastar en power-ups).

**¿Puedo ver las apuestas de otro usuario?**
No, nunca — ni el admin las hace públicas.

**¿Por qué mi cuota bajó/subió respecto a la semana pasada?**
Las cuotas se recalculan cada jornada con el histórico actualizado — cuanta
más información real hay acumulada, más se aleja del 50/50 de partida.

**Empate en "Máximo goleador"/"Más expulsado", ¿pierdo el importe?**
No. Un empate no cuenta ni como acierto ni como fallo: se te devuelve el
importe apostado.

**¿Cuánto dura la ventana de "Capitán tardío"?**
Desde que la aplicas (antes de las 24h) hasta 1 hora antes del partido. Solo
afecta al campo capitán, nunca al resto de tu 7.

---

# Para administradores

## 11. Panel de administración

Accesible desde el botón "Admin" (solo visible si tu usuario tiene
`is_admin`). Tiene 5 secciones:

### Jugadores
Crear, editar en línea y borrar jugadores de la plantilla (nombre, dorsal,
posición, apodo, frase, foto, `leverade_id` para el scraper). Borrar un
jugador que esté en el equipo (legado) de algún usuario avisa antes de
confirmar, y también borra su historial.

### Historial
Edición manual del historial de una jornada concreta: 9 estadísticas por
jugador (partidos, goles, goles de penalti, penaltis fallados, faltas de
penalti, tarjetas, expulsiones, expulsiones graves, goles encajados). Los
puntos de esa fila se recalculan en vivo al editar. Permite añadir un
jugador a una jornada, borrar una fila, o borrar la jornada entera. Cada
cambio dispara `recalc_puntos()` automáticamente (recalcula
`jugadores.stats` acumulado; **no** toca `alineaciones`/`apuestas`, eso solo
lo hace `resolver_jornada`).

### Sync
Estado de la última sincronización con la federación (Leverade/FNCV),
jornadas con datos en historial, jugadores sin emparejar automáticamente.
Desde aquí también:
- **"Recalcular puntos"** — vuelve a ejecutar `recalc_puntos()` a mano.
- **"Reprocesar jornada"** — escribe un número de jornada y ejecuta
  `resolver_jornada(n)` manualmente. Es la misma función que llama el
  scraper cada semana; es **segura de re-ejecutar** (ver más abajo), por si
  hay que corregir algo después de la resolución automática.

La sincronización real con la federación (traer resultados, calendario y
estadísticas nuevas) **no tiene botón** — se hace con `npm run sync` en
local, o lanzando el workflow "Weekly Stats Sync" en GitHub Actions (ya
programado semanalmente).

### Usuarios
Renombrar, dar/quitar admin, y borrar la cuenta de cualquier usuario (vía la
función `delete-account`). También tiene un editor del campo legado
`usuarios.equipo` (7 dorsales) — **es reliquia del modelo antiguo, previo a
las alineaciones por jornada**, y ya no afecta a la puntuación de nadie;
está ahí sin usarse, no hace falta tocarlo.

### Temporada
- **Terminar temporada**: descarga todo `historial` como JSON, luego lo
  vacía y pone a cero `jugadores.stats` y `usuarios.puntos`. Pide escribir
  "CONFIRMAR". Es irreversible salvo por el JSON descargado.
  ⚠️ **Esto no toca `alineaciones`, `apuestas` ni `powerups_*`** — quedan
  con datos de la temporada anterior. Antes de cerrar una temporada de
  verdad, hay que decidir y ejecutar a mano cómo limpiar esas tablas (ver
  sección 14).
- **Empezar temporada nueva**: cambia `config.tournament_id` al de la
  federación para la temporada siguiente. Después hay que lanzar
  `npm run sync -- --backfill` para poblar el histórico inicial.

## 12. El ciclo semanal del admin

En condiciones normales, no hace falta tocar nada a mano:

1. El workflow semanal de GitHub Actions sincroniza calendario y
   resultados desde Leverade/FNCV.
2. Cuando hay estadísticas de un partido jugado, el scraper llama a
   `resolver_jornada(n)` automáticamente — puntúa alineaciones, resuelve
   apuestas, aplica power-ups, financia el presupuesto de la jornada
   siguiente y concede tokens nuevos.
3. Si algo falla o hay que corregir datos a mano (por ejemplo, editar
   `historial` de una jornada), se puede volver a lanzar
   `resolver_jornada(n)` desde el panel de Sync sin miedo:
   `resolver_jornada` está diseñada para ser **idempotente** en todo lo
   importante — puntuación de alineaciones, resolución de apuestas y los
   4 tipos de apuesta, y (desde Fase D) el resto de bloques de power-ups
   salvo un caso raro documentado abajo. Re-ejecutarla no debería duplicar
   ganancias, puntos ni tokens.

   ⚠️ **Excepción conocida**: si un usuario tenía un equipo **incompleto**
   esa jornada (menos de 7 jugadores) y un power-up de "+2 puntos" o
   "Blindaje" aplicado con el objetivo coincidiendo con ese equipo
   incompleto, una segunda ejecución de `resolver_jornada` para esa
   jornada podría sumarle el ajuste del power-up sobre un equipo que
   debería seguir en 0 puntos. Es un caso muy raro (equipo incompleto +
   power-up aplicado a un jugador de ese equipo) y queda como limitación
   conocida — revisar manualmente si se sospecha que ha pasado.

4. Si `jornadas.resultado` no está relleno todavía cuando se resuelve la
   jornada, las apuestas de tipo "resultado" simplemente no se resuelven
   esa vez — se quedan pendientes para la próxima llamada a
   `resolver_jornada`, en vez de contarse como fallo por error.

## 13. Fin e inicio de temporada

Antes de pulsar "Terminar temporada" en el panel de admin, ten en cuenta que
**solo limpia `historial` y las estadísticas/puntos derivados**. El fantasy
dinámico (Fases A-D) añadió varias tablas más con datos por temporada que
esa función todavía no toca:

- `jornadas`, `alineaciones`, `presupuestos` (Fase A/B)
- `apuestas` (Fase C)
- `powerups_usuario`, `powerups_aplicados` (Fase D)

Si quieres arrancar la temporada siguiente con el fantasy dinámico también a
cero (presupuestos, alineaciones e inventario de power-ups reiniciados),
hay que vaciar esas tablas a mano (por ejemplo, vía el SQL Editor de
Supabase) como parte del mismo proceso de fin de temporada, exportando antes
lo que se quiera conservar. Esto está documentado como deuda pendiente — no
hay todavía un botón único que lo haga todo junto.

## 14. Cosas que solo se pueden hacer a mano en la base de datos

Estas operaciones no tienen UI en el panel de admin — requieren acceso
directo a Supabase (SQL Editor o `execute_sql`/`apply_migration` vía MCP):

- Corregir manualmente `jornadas.fecha_partido` o `jornadas.resultado` si
  el scraper no los rellenó bien.
- Dar o quitar tokens de power-up a un usuario fuera del flujo normal
  (`powerups_usuario.disponibles`).
- Vaciar `alineaciones`/`apuestas`/`powerups_*` al cerrar una temporada
  (ver sección 13).
- Cualquier cambio de esquema (migraciones nuevas) — el proyecto está en el
  plan Free de Supabase, sin entornos de desarrollo separados, así que
  toda migración se aplica directamente a producción, siempre con
  confirmación explícita antes de tocar nada.
