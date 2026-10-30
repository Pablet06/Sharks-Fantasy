const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Filtro de los buscadores del admin: true si `consulta` aparece en alguno de los
 * textos, sin distinguir mayúsculas ni tildes. Una consulta vacía deja pasar todo. */
export function coincide(consulta: string, ...textos: (string | number | null | undefined)[]): boolean {
  const q = norm(consulta.trim())
  return q === '' || textos.some(t => t != null && norm(String(t)).includes(q))
}
