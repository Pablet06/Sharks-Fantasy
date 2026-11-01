# Mejoras para la próxima jornada

Regla de repetidos, clasificación completa, entrenador easter egg y formación en "Mi equipo", antes de la Jornada 2 de Fantasy (jornada 10 de la federación, partido el 2026-11-07 a las 17:00 UTC; fichajes cierran el 2026-11-06 a las 18:00 Madrid). Tarea: `docs/tasks/next-jornada-improvements.md`. PRs: #43 (a `develop`) y #44 (release a `main`).

## 2026-11-01

### What was done
- Regla de repetidos: no se puede repetir el capitán de la alineación anterior y máximo 4 de 7 jugadores repetidos. "Anterior" = última alineación del usuario por `jornadas.orden`. Admin exento; sin alineación anterior no hay restricción. UI en `Draft.tsx` (contador `Repetidos n/4`, capitán anterior deshabilitado, resto de la alineación anterior bloqueado al llegar a 4, capitán tardío) y trigger `alineaciones_repeticion` (migración `20261101000000_alineaciones_no_repetir.sql`), probado en producción dentro de un bloque DO con rollback y luego aplicado con `apply_migration`. No revalida filas existentes.
- Clasificación completa en lugar del top 10 (`Ranking.tsx`).
- Entrenador José Santapau: constante de frontend en `Players.tsx` (∞ puntos, "Leyenda", "Entrenador"), foto `entrenador-santapau.webp` en el bucket privado `jugadores` servida con `signedPhotoUrl`. Nada en el repo público.
- "Mi equipo" en formación de waterpolo (Contraboya / 2 Laterales / 5 m / Extremo + Boya + Extremo / 2 m / Portero / portería), con precio o puntos (x2 capitán) bajo cada jugador. Retoques: nombre y precio fuera del círculo, etiquetas 5 m y 2 m sobre sus líneas, aviso "Cierra el…" arriba (`draft-cierre`).
- Manuales (`MANUAL_DEL_JUEGO.md`, `MANUAL_USUARIOS.md`) actualizados; el entrenador no aparece a propósito.
- Mergeado a `develop` (#43, `0f2c161`) y a `main` (#44, `6bc8e29`). El run de deploy 41353327504 estaba en curso; resultado final sin comprobar.
- 89 tests, lint y build en verde; probado en el navegador (móvil y escritorio) con la alineación guardada real del usuario.

### Decisions made
- El manual decía "cualquiera puede fichar a cualquiera", así que la regla es un cambio de reglas del juego, no un arreglo. La regla estricta (ningún jugador de la jornada anterior) se descartó: pool de 19 (2 Portero, 4 Lateral, 7 Extremo, 3 Boya, 3 Contraboya), portero y laterales alternarían sin elección. Elegido: capitán distinto + máximo 4 repetidos.
- Entrenador como constante: sin fila en BD no hay que excluirlo en Draft, apuestas, scraper ni cuotas. Foto privada, coherente con `fotos_privadas` (repo público).
- Limitación asumida (`ponytail:` en la migración): borrar la alineación intermedia por API o dos escrituras simultáneas en jornadas vecinas pueden saltarse el trigger; mejora = trigger AFTER DELETE + `pg_advisory_xact_lock` por usuario.
- Lint: se quitó una guarda redundante en `toggleJugador` porque llamar a una función importada ahí disparaba `react-hooks/purity` sobre un `Date.now()` ajeno; `validarDraft` y el trigger siguen siendo las barreras reales.
- No lanzar el `mentor` automáticamente (feedback del usuario).

### What's left
- Comprobar en producción, tras el deploy, que 5 repetidos o el capitán anterior se rechazan en la UI y que formación, ranking y entrenador se ven bien.
- Decidir si se anota la spec `docs/superpowers/specs/2026-09-11-fantasy-dinamico-design.md` (líneas 31-33).
- Commitear los docs de la sesión (PR de docs a `develop` + release a `main`).
- Tras el partido del 2026-11-07: revisar puntuación, resolver y stats del scraper (`scraper-servidor-casa`).
- Opcional: redimensionar la foto del entrenador (235 KB).
