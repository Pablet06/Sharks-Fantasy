---
status: in-progress
created: 2026-10-23
updated: 2026-10-23
---

# Verificación pre-partido

## Context
El sábado 2026-10-24 hay partido real. Antes de que se juegue hay que comprobar que el juego funciona bien de punta a punta: historial de jornadas, fichajes de los usuarios y lo que ocurre al terminar el partido (puntuación, apuestas, dinero).

## Goal
Tener confianza de que el juego está listo para el partido y de que el proceso posterior (scraper, puntos, dinero/apuestas) está bien planificado y programado. Análisis con Opus 5.5.

## Acceptance criteria
- [ ] Verificar si existe historial por jornada de cada usuario con puntos y dinero ganado (apuestas), visible para el propio usuario; si falta, documentar qué falta.
- [ ] Investigar por qué no aparecen en admin los fichajes de Charly y Pablo; confirmar si es un error de datos, RLS o UI, y dejar la causa raíz identificada.
- [ ] Revisión del código del flujo post-partido (scraper/sync, cálculo de puntos, liquidación de apuestas, dinero) con lista de riesgos y huecos.
- [ ] Hallazgos y correcciones priorizadas; ninguna se mergea/despliega antes del partido sin confirmación (PR #26 sigue retenido hasta después del 2026-10-24).

## Sessions
