import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function verifyAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return false
  const supabase = adminClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return false
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single()
  return profile?.is_admin === true
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { is_admin, artist_id, agent_id, email, send_reset } = await req.json()
  const supabase = adminClient()

  // Update auth user email if provided
  if (email) {
    const { error } = await supabase.auth.admin.updateUserById(params.id, { email })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Send password reset email
  if (send_reset && email) {
    await supabase.auth.resetPasswordForEmail(email)
  }

  // Update profile
  await supabase.from("profiles").update({
    is_admin:  is_admin  ?? false,
    artist_id: artist_id || null,
    agent_id:  agent_id  || null,
    ...(email ? { email } : {}),
  }).eq("id", params.id)

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = adminClient()
  const { error } = await supabase.auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await supabase.from("profiles").delete().eq("id", params.id)
  return NextResponse.json({ success: true })
}
