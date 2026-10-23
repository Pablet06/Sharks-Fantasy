import { supabase } from './supabase'
import type { Jugador } from '../types'

export const DEFAULT_PHOTO = '/Sharks-Fantasy/jugadores/predeterminado.png'
const BUCKET = 'jugadores'
const TTL_SECONDS = 6 * 60 * 60

/** Devuelve los jugadores con `photo` convertido de ruta de Storage a URL firmada. */
export async function withSignedPhotos<T extends Jugador>(jugadores: T[]): Promise<T[]> {
  const paths = jugadores.map(j => j.photo).filter((p): p is string => !!p)
  if (paths.length === 0) return jugadores
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, TTL_SECONDS)
  if (error || !data) return jugadores.map(j => ({ ...j, photo: null }))
  const urls = new Map(data.map(d => [d.path, d.signedUrl]))
  return jugadores.map(j => ({ ...j, photo: (j.photo && urls.get(j.photo)) || null }))
}

export async function uploadPhoto(numero: number, file: File): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${numero}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) throw error
  return path
}
