import { supabase } from './supabase.js'

export async function getConfig(key: string): Promise<string> {
  const { data } = await supabase.from('config').select('value').eq('key', key).maybeSingle()
  if (!data) throw new Error(`config key not found: ${key}`)
  return data.value as string
}

export async function setConfig(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('config').upsert({ key, value }, { onConflict: 'key' })
  if (error) throw new Error(`config write failed for ${key}: ${error.message}`)
}

export function getTournamentId(): Promise<string> {
  return getConfig('tournament_id')
}
