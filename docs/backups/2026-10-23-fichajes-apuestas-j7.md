# Backup fichajes y apuestas — Jornada 7 (antes del partido del 2026-10-24)

Exportado de prod (`sihvxbhqcyynuulhqmii`) el 2026-10-23 ~18:04 UTC con SELECT (solo lectura).
Estado: todas las alineaciones con `puntos_jornada = NULL`; todas las apuestas con `resuelto = false`, `acierto = NULL`, `ganancia = NULL`. `presupuestos`, `powerups_usuario`, `powerups_aplicados` vacíos. `historial` vacío. `usuarios.puntos = 0` en todos.

Jornada: `numero=7, orden=1, fecha_partido=2026-10-24T15:45:00Z, finalizado=false`.

Los fichajes son los números de dorsal (`jugadores.numero`) de `alineaciones.jugadores`. `cap` = capitán, `pres` = `presupuesto_usado`.
Apuestas: `tipo / selección / importe€ @ cuota`.

| Usuario | Fichajes J7 (dorsales) | cap | pres | Apuestas J7 |
|---|---|---|---|---|
| Antonio Albacete | 1, 3, 15, 13, 6, 8, 7 | 6 | 973 | — |
| charly | 6, 1, 3, 13, 10, 18, 15 | 3 | 864 | — |
| Chetinyo | 18, 3, 2, 15, 6, 5, 13 | 6 | 971 | resultado/pierde 20€ @1.2 · goleador/6 100€ @1.46 · expulsado/11 30€ @2.1 · porteria/si 50€ @2.00 |
| COBRACAI | 1, 6, 15, 3, 5, 13, 4 | 6 | 992 | — |
| Comodín | 10, 3, 6, 13, 1, 5, 15 | 6 | 961 | resultado/pierde 150€ @1.2 · goleador/6 50€ @1.46 |
| DIDI | 1, 12, 13, 4, 3, 6, 8 | 6 | 977 | resultado/gana 100€ @2.1 · goleador/6 100€ @1.46 |
| El troco | 2, 15, 13, 3, 5, 6, 18 | 6 | 971 | — |
| El vasko | 1, 15, 6, 3, 18, 13, 4 | 6 | 895 | resultado/gana 50€ @2.1 · goleador/18 50€ @2.00 |
| Gemelo retirado | 1, 6, 4, 5, 18, 16, 15 | 6 | 927 | — |
| Hectorg_wp | **sin alineación** | — | — | — |
| Izquierdo Bueno | 1, 6, 13, 15, 3, 14, 5 | 6 | 998 | goleador/6 200€ @1.46 |
| Jusi prime | **sin alineación** | — | — | resultado/gana 100€ @2.1 · goleador/6 50€ @1.46 · expulsado/16 50€ @2.1 |
| Luca | 1, 15, 18, 6, 4, 13, 3 | 18 | 895 | expulsado/11 100€ @2.1 |
| MISTER | 1, 4, 6, 3, 5, 13, 12 | 6 | 963 | resultado/gana 20€ @2.1 · expulsado/12 20€ @2.1 |
| Pablo (admin) | 1, 12, 6, 13, 5, 4, 3 | 6 | 963 | resultado/gana 50€ @2.1 · goleador/6 150€ @1.46 |
| Raúl | 1, 6, 11, 3, 10, 18, 15 | 15 | 800 | resultado/gana 50€ @2.1 · goleador/6 50€ @1.46 · expulsado/13 100€ @2.1 |
| Rodas | 1, 15, 3, 6, 8, 11, 4 | 6 | 942 | — |
| Rubi | 1, 18, 15, 3, 8, 17, 13 | 18 | 715 | goleador/6 100€ @1.46 · expulsado/8 100€ @2.1 |
| Vaselas | 13, 4, 5, 18, 12, 14, 1 | 5 | 726 | resultado/gana 50€ @2.1 · goleador/8 50€ @2.1 · expulsado/11 100€ @2.1 |
| Vivi el Gabacho | 1, 12, 13, 6, 8, 3, 4 | 6 | 977 | goleador/6 40€ @1.46 · expulsado/13 10€ @2.1 · resultado/pierde 150€ @1.2 |
| wachoo | 1, 15, 4, 3, 5, 6, 13 | 6 | 992 | resultado/gana 50€ @2.1 · goleador/13 50€ @2.1 · expulsado/13 50€ @2.1 · porteria/si 50€ @2.00 |

Totales: 19 alineaciones, 34 apuestas.

## `usuarios.equipo` (modelo antiguo, solo referencia)

charly y Pablo: `[]`. El resto conserva el equipo aleatorio generado al registrarse; no es lo que han fichado de verdad (eso está en `alineaciones`).

## Cómo regenerarlo

```sql
select u.nombre, a.jornada, a.jugadores, a.capitan, a.presupuesto_usado from alineaciones a join usuarios u on u.id = a.usuario_id order by u.nombre;
select u.nombre, b.* from apuestas b join usuarios u on u.id = b.usuario_id order by u.nombre, b.id;
```
