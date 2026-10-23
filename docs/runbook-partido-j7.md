# Runbook: partido J7 (sábado 2026-10-24)

Partido: sáb 24/10 **15:45 UTC = 17:45 CEST**. Cierre de fichajes y apuestas: viernes 15:45 UTC (ya cerrado).
Scraper: sáb **22:00 UTC (00:00 CEST)**, reintento dom **22:00 UTC**. Es el código de `main`; el PR #27 no está mergeado.

## 1. Comprobar que el run ha ido bien (después de las 22:00 UTC)

GitHub > Actions > **Weekly Stats Sync** > último run. O:

```bash
gh run list --workflow scraper.yml --limit 3
```

- Verde y log con `J7: 19 rows, 0 unmatched`: bien.
- Verde y log con `nothing new` o `no finished Sharks match or empty stats`: **no ha escrito nada** (partido sin marcar como terminado o acta sin publicar). Con el código de `main` el run sale verde igualmente, así que mira siempre los datos del paso 2.
- Rojo: mira el log (`gh run view <id> --log-failed`). 429 o 520 = la web de la federación ha bloqueado o fallado.

## 2. Comprobar los datos (Supabase > SQL Editor)

```sql
select jornada, count(*) from historial group by 1;
select numero, resultado, goles_favor, goles_contra, finalizado from jornadas;
select count(*) filter (where resuelto) as resueltas, count(*) as total from apuestas where jornada = 7;
select count(*) filter (where puntos_jornada is not null) as puntuadas, count(*) as total from alineaciones where jornada = 7;
select nombre, puntos from usuarios order by puntos desc limit 5;
select key, value from config where key in ('last_sync_at', 'unmatched_players');
```

Esperado: `historial` J7 con 19 filas; J7 con resultado y `finalizado = true`; apuestas 34/34; alineaciones 19/19; puntos mayores que 0; `unmatched_players` = `[]`.
(Hectorg_wp y Jusi prime no tienen alineación: harán 0.)

## 3. Si no hay datos

En este orden:

1. **Esperar** al reintento automático del domingo 22:00 UTC (si el acta aún no estaba publicada, es lo normal).
2. **Relanzar a mano**: GitHub > Actions > Weekly Stats Sync > Run workflow (args vacío), o `gh workflow run scraper.yml`.
3. Si GitHub sigue recibiendo 429/520, **ejecutarlo desde tu PC** (necesita `.env` con `SUPABASE_URL` y la `SUPABASE_SERVICE_ROLE_KEY` real):

```bash
cd scraper && npm run sync -- --jornada 7
```

4. Si el historial de J7 ya está escrito pero las apuestas o los puntos no se resolvieron: admin > Sync > **Reprocesar jornada** con 7 (llama a `resolver_jornada`; es repetible sin duplicar nada).

## 4. Después de que salgan los resultados

- Admin > Sync > **Recalcular puntos**: actualiza las estadísticas acumuladas de los jugadores (el scraper no lo hace).
- **Presupuesto de la siguiente jornada**: las ganancias de J7 solo se pasan a la siguiente jornada cuando esa jornada exista (la federación publica la fecha cuando quiere). Con el código actual de `main`, cuando aparezca la fecha hay que ir a admin > Sync > **Reprocesar jornada** con 7 *antes* de que la gente apueste o fiche; si no, empiezan con 1000€. El PR #27 lo automatiza, pero no está mergeado.
- Los usuarios verán «No hay ninguna jornada abierta» hasta que haya fecha de la siguiente.

## 5. No hacer antes de confirmar que J7 está resuelto

- No mergear el PR #26 (fotos privadas + admin móvil) ni desplegar.
- No tocar a mano `alineaciones`, `apuestas` ni `historial` de J7.
