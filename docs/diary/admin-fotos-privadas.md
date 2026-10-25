## 2026-10-23

### What was done
- Bucket privado `jugadores` + RLS aplicado en prod; fotos antiguas de la BD a NULL.
- `src/lib/photos.ts`, `useJugadores` con URLs firmadas, subida de fotos en `JugadoresAdmin`.
- Admin en tarjetas para móvil (Jugadores, Historial, Usuarios).
- 4 PNG quitados de `public/jugadores`. Revisión independiente hecha (corrigió una regresión en `historial_anterior`).
- PR #26 abierto a develop, sin mergear.

### Decisions made
- Sin reescribir historial de git (las fotos siguen en él).
- No mergear a main hasta después del partido del sáb 2026-10-24, porque `deploy.yml` despliega al pushear a main.
- mentor omitido a petición del usuario.

### What's left
- Tras el partido: mergear PR #26, verificar fotos, probar admin móvil con sesión admin, subir las 4 fotos.
- Riesgos: no subir fotos hasta el deploy (imágenes rotas con el frontend viejo); URLs firmadas 6 h; huérfanos en el bucket.
