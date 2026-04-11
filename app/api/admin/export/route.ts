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

function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v)
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map(r => r.map(escape).join(",")).join("\n")
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const supabase = adminClient()

  const [{ data: artists }, { data: shows }, { data: transfers }, { data: payouts }, { data: batches }, { data: agentPayouts }] = await Promise.all([
    supabase.from("artists").select("*").order("name"),
    supabase.from("shows").select("*").order("show_date"),
    supabase.from("transfers").select("*").order("transfer_date"),
    supabase.from("payouts").select("*").order("payout_date"),
    supabase.from("batches").select("*").order("created_at"),
    supabase.from("agent_payouts").select("*").order("payout_date"),
  ])

  const artistMap = Object.fromEntries((artists || []).map(a => [a.id, a.name]))

  const showsCSV = toCSV(
    ["Artist","Date","Event","Type","Pay Type","Gross","Comm%","Commission","Sound","Mus1","Mus2","Mus3","Mus4","Other","Warchest%","Warchest","Nett","Batch","Status","Agent","Notes"],
    (shows || []).map(s => {
      const comm = s.gross * s.comm_pct
      const band = s.sound + s.mus1 + s.mus2 + s.mus3 + (s.mus4||0) + s.other_costs
      const sub  = s.gross - comm - band
      const wc   = s.pay_type === "Escrow" ? sub * s.warchest_pct : 0
      const nett = sub - wc
      return [artistMap[s.artist_id], s.show_date, s.event, s.show_type, s.pay_type,
        s.gross, s.comm_pct, comm.toFixed(2), s.sound, s.mus1, s.mus2, s.mus3, s.mus4||0,
        s.other_costs, s.warchest_pct, wc.toFixed(2), nett.toFixed(2),
        s.batch_num||"", s.status||"", s.responsible_agent||"", s.notes||""]
    })
  )

  const transfersCSV = toCSV(
    ["Artist","Date","Description","Type","Amount"],
    (transfers || []).map(t => [artistMap[t.artist_id], t.transfer_date, t.description, t.transfer_type, t.amount])
  )

  const payoutsCSV = toCSV(
    ["Artist","Date","Batch Ref","Amount","Notes","Artist Approved"],
    (payouts || []).map(p => [artistMap[p.artist_id], p.payout_date, p.batch_ref||"", p.amount, p.notes||"", p.approved_by_artist ? "Yes" : "No"])
  )

  const batchesCSV = toCSV(
    ["Artist","Batch","Created","Gross","Commission","Sound","Mus1","Mus2","Mus3","Mus4","Other","Warchest","Nett","Payout%","Payout Amt","Status","Signed Off","Paid At"],
    (batches || []).map(b => [artistMap[b.artist_id], b.batch_num, b.created_at?.slice(0,10),
      b.total_gross, b.total_comm, b.total_sound, b.total_mus1, b.total_mus2, b.total_mus3, b.total_mus4,
      b.total_other, b.total_warchest, b.total_nett, b.payout_pct||100,
      ((b.total_nett * (b.payout_pct||100) / 100)).toFixed(2),
      b.status, b.signed_off_at?.slice(0,10)||"", b.paid_at?.slice(0,10)||""])
  )

  const agentPayoutsCSV = toCSV(
    ["Agent ID","Date","Type","Amount","Description"],
    (agentPayouts || []).map(p => [p.agent_id, p.payout_date, p.payout_type||"", p.amount, p.description||""])
  )

  // Combine into one file with section headers
  const combined = [
    "BNAS PORTAL DATA EXPORT",
    `Exported: ${new Date().toISOString().slice(0,10)}`,
    "",
    "=== SHOWS ===",
    showsCSV,
    "",
    "=== ESCROW TRANSFERS ===",
    transfersCSV,
    "",
    "=== ARTIST PAYOUTS ===",
    payoutsCSV,
    "",
    "=== BATCHES ===",
    batchesCSV,
    "",
    "=== AGENT PAYOUTS ===",
    agentPayoutsCSV,
  ].join("\n")

  return new NextResponse(combined, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="BNAS-export-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  })
}
