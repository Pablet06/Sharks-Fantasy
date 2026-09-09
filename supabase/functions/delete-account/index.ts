import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveTarget } from './resolve-target.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')

    // Service role client — can delete auth users
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify the token and get the user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Optional JSON body — { target_user_id?: string }. Absent → caller deletes self.
    const body = await req.json().catch(() => null) as { target_user_id?: string } | null

    let callerIsAdmin = false
    {
      const { data } = await supabase.from('usuarios').select('is_admin').eq('id', user.id).single()
      callerIsAdmin = !!data?.is_admin
    }

    const resolved = resolveTarget(user.id, callerIsAdmin, body)
    if ('error' in resolved) {
      return new Response(JSON.stringify({ error: resolved.error }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const targetId = resolved.id

    // Delete the usuarios row first (FK safe)
    const { error: dbError } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', targetId)

    if (dbError) {
      console.error('DB delete error:', dbError)
      return new Response(JSON.stringify({ error: 'Failed to delete user data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Delete the auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(targetId)
    if (deleteError) {
      console.error('Auth delete error:', deleteError)
      return new Response(JSON.stringify({ error: 'Failed to delete auth user' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
