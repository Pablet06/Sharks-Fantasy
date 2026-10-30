# Admin: alineaciones por jornada

## [2026-10-30] Admin > Usuarios lee y edita las alineaciones reales

### 1. Qué ha cambiado y por qué así

**El bug.** En Admin > Usuarios no salían las alineaciones de Charly y Pablo en J7. La pantalla leía `usuarios.equipo`, una columna de cuando cada usuario tenía un único equipo fijo. Al pasar el juego a "una alineación por usuario y jornada" (tabla `alineaciones`, columna `jugadores`), Draft y Mi Equipo se migraron, pero esta pantalla no. Como la columna vieja sigue en la BD, nada petaba: simplemente enseñaba datos muertos. Es el bug típico tras cambiar el modelo de datos: no es un error rojo, es un dato viejo que parece válido.

**El arreglo** (solo frontend, sin migraciones):
- `useAdminData` carga también `jornadas` y `alineaciones` en el mismo `Promise.all`.
- `UsuariosAdmin` tiene un selector de jornada (por defecto la misma que ve el jugador en Mi Equipo: `jornadaEnCurso ?? ultimaJornadaResuelta`) y muestra y deja editar los 7, el capitán y los puntos de esa jornada.
- `JugadoresAdmin`, al borrar un jugador, avisa de quién lo tiene en la alineación de la jornada abierta (las ya puntuadas no se ven afectadas).
- Se quitó `equipo` del tipo `Usuario`.

**Cómo ayudó `tsc`** (el compilador de TypeScript, el que corre en `npm run build`). Al borrar `equipo` del tipo, cualquier `u.equipo` que quedase da error de compilación: es una búsqueda garantizada, mejor que un grep. Pero solo encuentra lo que usa el tipo. `createProfile` en `src/hooks/useUsuario.ts` sigue haciendo `.insert({ id, nombre, equipo, puntos: 0 })` y `tsc` no protesta, porque el cliente se crea con `createClient(url, key)` sin tipos generados de la BD: `insert` acepta cualquier objeto y `Usuario` no participa. Además no conviene tocarlo de pasada: la migración `20261023000000_lock_usuarios_self_insert.sql` (la que impide darse de alta como admin) está escrita contando con ese insert exacto. Moraleja: quitar un campo de un tipo te enseña las lecturas tipadas, no las escrituras sin tipar.

**Decisiones que tomasteis en el plan:**
- El admin no tiene tope de presupuesto y se guarda `presupuesto_usado: null`: los precios de hoy no son los de aquella jornada y nadie lee ese campo.
- Una jornada ya puntuada se puede editar, pero con `confirm()` y reproceso automático (la alternativa era bloquearla en solo lectura).
- Si un usuario no tenía alineación, el admin puede crearla. En una jornada ya puntuada eso le da puntos retroactivos, y el `confirm()` lo avisa.

### 2. Conceptos nuevos

**RLS: por qué no hizo falta migración.** RLS (Row Level Security) son reglas dentro de Postgres que deciden qué filas puede leer o escribir cada usuario, aunque llame a la API a mano. En `alineaciones` ya existían:
- `alineaciones_select`: lees una fila si ya está puntuada, si es tuya **o** si eres admin.
- `alineaciones_owner_write`: escribes la tuya hasta 24 h antes del partido.
- `alineaciones_admin_all`: el admin lee y escribe cualquiera, sin plazo.

Las políticas normales ("permisivas") se combinan con **OR**: basta con que una diga que sí. Por eso la del dueño, con su plazo, no le estorba al admin; aunque a él le diga que no, `admin_all` le dice que sí. Se comprobó en las migraciones antes de escribir código. Si `admin_all` no hubiera existido, el guardado habría fallado por RLS y habría hecho falta una migración.

**Defensa en profundidad.** La regla "1 Portero, 2 Extremos, 2 Laterales, 1 Boya, 1 Contraboya, 7 distintos" se comprueba dos veces:
- en el navegador con `validarDraft`: mensaje claro al momento, sin ir a la red;
- en la BD con el trigger `alineaciones_composicion` (un trigger es código que Postgres ejecuta solo en cada INSERT/UPDATE): la red que no se puede saltar, ni con un bug del front ni llamando a la API directamente.

La del cliente es para la experiencia; la de la BD es la que manda. Y se aplica también al admin, que con prisa también se equivoca.

**Upsert con `onConflict`.** "Upsert" = insertar, o actualizar si la fila ya existe. Postgres sabe qué es "ya existe" gracias a la restricción `UNIQUE (usuario_id, jornada)`: `onConflict: 'usuario_id,jornada'` le dice "si chocas en esa pareja, actualiza esa fila". Así una sola llamada sirve tanto para editar la alineación de Charly como para crear la de alguien que no tenía. Es el mismo patrón que ya usa `Draft.tsx`.

**La trampa de los puntos rancios.** `resolver_jornada` (la función SQL que puntúa una jornada), simplificando:
1. calcula `puntos_jornada` de las alineaciones cuyos 7 jugadores tienen historial en esa jornada;
2. suma los +2 y el blindaje;
3. pone 0 a las que siguen en `NULL`;
4. recalcula `usuarios.puntos` de todos.

Imagina una alineación con 34 puntos en la que el admin mete a un jugador que no jugó. El paso 1 no la toca (ya no resuelve sus 7) y el paso 3 tampoco, porque no es `NULL`: vale 34. **Se queda con los 34 viejos.** Por eso el helper vacía los puntos en la misma escritura:

```ts
const fila = {
  usuario_id: usuarioId, jornada, jugadores: elegidos, capitan, presupuesto_usado: null,
  ...(yaPuntuada ? { puntos_jornada: null } : {}),
}
```

El `...(cond ? {...} : {})` añade la clave solo si hace falta (el upsert solo sobrescribe las columnas que le mandas). Después, la UI llama a `resolver_jornada` y la fila acaba recalculada o a 0. La lección general: cuando confíes en un "recalcular", lee qué filas toca y, sobre todo, cuáles **no** toca. Los bugs viven ahí.

**Helper puro + test, en vez de testear el componente.** Una función pura devuelve siempre lo mismo para la misma entrada y no toca ni la red ni React. `filaAlineacionAdmin` concentra la única decisión peligrosa (qué fila y qué columnas se escriben), así que eso es lo que se testeó: 6 tests escritos *antes* del código (TDD: primero un test que falla y luego el código mínimo que lo pasa). Reutiliza `validarDraft` pasándole `Infinity` como presupuesto, que quita el tope sin crear una función nueva:

```ts
const v = validarDraft(elegidos, capitan, {}, Infinity, posiciones)
```

Testear `UsuariosAdmin` entero exigiría montar React y simular ("mockear") Supabase: mucho andamiaje para cubrir unos `find` y un `upsert`, en un repo que no tiene tests de componentes. Lo que toca Supabase se prueba a mano.

### 3. Cómo encaja

`alineaciones` es el centro del juego: la escriben el Draft (el usuario) y ahora el admin, y la lee `resolver_jornada` para puntuar, de donde sale el ranking (`usuarios.puntos`). Este cambio solo añade un segundo escritor con las mismas reglas, protegidas en BD por RLS y por el trigger.

**Límites, siendo honestos:** los 71 tests, el lint y el build pasan, pero **todavía no se ha probado en el navegador con sesión de admin**. El `.env` local apunta a producción: al probar el guardado, toca solo tu propia alineación, apunta antes la original y restáurala. El camino "jornada ya puntuada" pruébalo hasta el `confirm()` y cancela. La columna `usuarios.equipo` sigue en la BD (borrarla sería otra migración).

**Para practicar:** (1) Si borrases la política `alineaciones_admin_all`, ¿qué pasaría al guardar la alineación de *otro* usuario? ¿Y la tuya en una jornada aún abierta? (2) Si quitas el `puntos_jornada: null` del helper, ¿qué test falla y qué vería un jugador en el ranking? (3) ¿Por qué el selector guarda el `numero` de federación y no el `orden`, y qué test protege que se escriba en la jornada correcta?
