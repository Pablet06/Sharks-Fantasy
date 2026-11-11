import { createClient } from '@supabase/supabase-js'
import { parseAuthRedirect } from './auth'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check .env file.')
}

// Read the URL before createClient: the client clears the recovery hash while processing it
// and emits PASSWORD_RECOVERY in a setTimeout, possibly before React subscribes.
export const authRedirect = parseAuthRedirect(window.location.href)

// supabase-js does not clear error hashes; drop it so a reload doesn't repeat the notice.
if (authRedirect.linkError) window.history.replaceState(null, '', window.location.pathname)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
