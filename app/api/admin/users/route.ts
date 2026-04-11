import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const anonClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return false
  const { data: { user } } = await anonClient().auth.getUser(token)
  if (!user) return false
  const { data: profile } = await adminClient().from("profiles").select("is_admin").eq("id", user.id).single()
  return profile?.is_admin === true
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = adminClient()
  const { data: { users }, error } = await supabase.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: profiles } = await supabase.from("profiles").select("*")
  const { data: artists } = await supabase.from("artists").select("id, name")
  const { data: agents }  = await supabase.from("agents").select("id, name")
  const result = users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in: u.last_sign_in_at,
    profile: profiles?.find(p => p.id === u.id) || null,
    artist: artists?.find(a => a.id === profiles?.find(p => p.id === u.id)?.artist_id) || null,
    agent:  agents?.find(a => a.id === profiles?.find(p => p.id === u.id)?.agent_id) || null,
  }))
  return NextResponse.json({ users: result, artists, agents })
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { email, is_admin, artist_id, agent_id } = await req.json()
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })
  const supabase = adminClient()
  // Invite user — they set their own password via email
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Upsert profile
  await supabase.from("profiles").upsert({
    id: data.user.id,
    email,
    is_admin: is_admin || false,
    artist_id: artist_id || null,
    agent_id:  agent_id  || null,
  })
  return NextResponse.json({ success: true, user_id: data.user.id })
}
