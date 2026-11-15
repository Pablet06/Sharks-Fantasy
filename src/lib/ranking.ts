/**
 * Posición en la clasificación con ranking de competición: los empatados a puntos
 * comparten posición y el siguiente salta (1, 2, 2, 4). Es 1 + los usuarios con más
 * puntos, así que no depende del orden de la lista. Lo usan Clasificación y Mi equipo
 * para que ambas pantallas den la misma posición.
 */
export function posicionRanking(usuarios: { puntos: number }[], puntos: number): number {
  return 1 + usuarios.filter(u => u.puntos > puntos).length
}
