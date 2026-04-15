"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Navbar from "@/components/Navbar"
import type { Agent, AgentPayout, Artist, Show } from "@/lib/types"
import { ZAR, calcAgentEarned } from "@/lib/calculations"

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—"
  const d = new Date(s + "T00:00:00")
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

type Tab = "summary" | "shows" | "payouts"

interface ShowWithArtist extends Show {
  artist: Artist
  agentEarned: number
}

export default function AgentPage() {
  const router = useRouter()
  const [tab, setTab]       = useState<Tab>("summary")
  const [agent, setAgent]   = useState<Agent | null>(null)
  const [rows, setRows]     = useState<ShowWithArtist[]>([])
  const [payouts, setPayouts] = useState<AgentPayout[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace("/login"); return }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, agent_id")
        .eq("id", session.user.id)
        .single()

      if (profile?.is_admin) { router.replace("/admin"); return }
      if (!profile?.agent_id) { router.replace("/artist"); return }

      const [{ data: agentData }, { data: artists }, { data: agentPayouts }] = await Promise.all([
        supabase.from("agents").select("*").eq("id", profile.agent_id).single(),
        supabase.from("artists").select("*"),
        supabase.from("agent_payouts").select("*").eq("agent_id", profile.agent_id).order("payout_date"),
      ])

      if (!agentData || !artists) { setLoading(false); return }
      setAgent(agentData)
      setPayouts(agentPayouts || [])

      // Load all shows for all artists, compute agent's cut per show
      const allShows: ShowWithArtist[] = []
      for (const artist of artists) {
        const { data: shows } = await supabase
          .from("shows")
          .select("*")
          .eq("artist_id", artist.id)
          .order("show_date")

        for (const show of (shows || [])) {
          const earned = calcAgentEarned(show, artist, agentData.name)
          if (earned > 0 || agentData.name.toLowerCase() === "que") {
            allShows.push({ ...show, artist, agentEarned: earned })
          }
        }
      }
      // Sort by date
      allShows.sort((a, b) => a.show_date.localeCompare(b.show_date))
      setRows(allShows)
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  )
  if (!agent) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card text-center">
        <p className="text-gray-500">No agent profile linked. Contact BNAS.</p>
      </div>
    </div>
  )

  const totalEarned = rows.reduce((s, r) => s + r.agentEarned, 0)
  const totalPaid   = payouts.reduce((s, p) => s + p.amount, 0)
  const balance     = totalEarned - totalPaid

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={`${agent.name} — Agent Portal`} isAdmin={false} />
      <main className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {(["summary", "shows", "payouts"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── SUMMARY ── */}
        {tab === "summary" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="stat-card">
                <div className="stat-label">Total Earned (YTD)</div>
                <div className="stat-value">{ZAR(totalEarned)}</div>
                <div className="stat-sub">{rows.length} shows</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Paid Out</div>
                <div className="stat-value">{ZAR(totalPaid)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Balance Owed</div>
                <div className={`stat-value ${balance < 0 ? "text-red-600" : "text-green-700"}`}>{ZAR(balance)}</div>
              </div>
            </div>

            {/* Breakdown by artist */}
            <div className="card p-0">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-navy">Earnings by Artist</h2>
              </div>
              <div className="table-wrap rounded-none rounded-b-xl">
                <table>
                  <thead>
                    <tr>
                      <th>Artist</th>
                      <th className="text-center">Shows</th>
                      <th className="text-right">Total Gross</th>
                      <th className="text-right">Total Commission</th>
                      <th className="text-right">Your Cut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(new Set(rows.map(r => r.artist_id))).map(aid => {
                      const artistRows = rows.filter(r => r.artist_id === aid)
                      const artist = artistRows[0].artist
                      return (
                        <tr key={aid}>
                          <td className="font-medium">{artist.name}</td>
                          <td className="text-center text-gray-500">{artistRows.length}</td>
                          <td className="text-right font-mono">{ZAR(artistRows.reduce((s, r) => s + r.gross, 0))}</td>
                          <td className="text-right font-mono text-gray-600">{ZAR(artistRows.reduce((s, r) => s + r.gross * r.comm_pct, 0))}</td>
                          <td className="text-right font-mono font-semibold">{ZAR(artistRows.reduce((s, r) => s + r.agentEarned, 0))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-lblue font-semibold">
                      <td>TOTALS</td>
                      <td className="text-center">{rows.length}</td>
                      <td className="text-right font-mono">{ZAR(rows.reduce((s, r) => s + r.gross, 0))}</td>
                      <td className="text-right font-mono">{ZAR(rows.reduce((s, r) => s + r.gross * r.comm_pct, 0))}</td>
                      <td className="text-right font-mono">{ZAR(totalEarned)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── SHOWS ── */}
        {tab === "shows" && (
          <div className="card p-0">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-navy">All Shows — Your Earnings</h2>
              <p className="text-xs text-gray-500 mt-0.5">Your cut = Commission × (1 − BNAS overhead) × your split %</p>
            </div>
            <div className="table-wrap rounded-none rounded-b-xl">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Artist</th>
                    <th>Event</th>
                    <th>Type</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right">Comm</th>
                    <th className="text-right">To Split</th>
                    <th className="text-right">Your Cut</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const comm    = r.gross * r.comm_pct
                    const toSplit = comm * (1 - (r.artist.bnas_overhead_pct || 0.2))
                    return (
                      <tr key={r.id}>
                        <td className="text-gray-500 whitespace-nowrap">{fmtDate(r.show_date)}</td>
                        <td className="text-gray-600 text-sm">{r.artist.name}</td>
                        <td className="font-medium">{r.event}</td>
                        <td className="text-gray-500">{r.show_type}</td>
                        <td className="text-right font-mono">{ZAR(r.gross)}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(comm)}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(toSplit)}</td>
                        <td className="text-right font-mono font-semibold">{ZAR(r.agentEarned)}</td>
                        <td>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            r.status === "All Paid" ? "bg-green-100 text-green-700" :
                            r.status === "Fee Received" ? "bg-blue-100 text-blue-700" :
                            r.status === "Pending" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-500"
                          }`}>{r.status || "—"}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-lblue font-semibold">
                    <td colSpan={4}>TOTALS</td>
                    <td className="text-right font-mono">{ZAR(rows.reduce((s, r) => s + r.gross, 0))}</td>
                    <td className="text-right font-mono">{ZAR(rows.reduce((s, r) => s + r.gross * r.comm_pct, 0))}</td>
                    <td className="text-right font-mono">{ZAR(rows.reduce((s, r) => s + r.gross * r.comm_pct * (1 - (r.artist.bnas_overhead_pct || 0.2)), 0))}</td>
                    <td className="text-right font-mono">{ZAR(totalEarned)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── PAYOUTS ── */}
        {tab === "payouts" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="stat-card"><div className="stat-label">Total Earned</div><div className="stat-value">{ZAR(totalEarned)}</div></div>
              <div className="stat-card"><div className="stat-label">Total Paid Out</div><div className="stat-value">{ZAR(totalPaid)}</div></div>
              <div className="stat-card"><div className="stat-label">Balance Owed</div><div className={`stat-value ${balance < 0 ? "text-red-600" : "text-green-700"}`}>{ZAR(balance)}</div></div>
            </div>
            <div className="card p-0">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-navy">Payout History</h2>
              </div>
              <div className="table-wrap rounded-none rounded-b-xl">
                <table>
                  <thead><tr><th>Date</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {payouts.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-gray-400 py-6">No payouts recorded yet</td></tr>
                    )}
                    {payouts.map(p => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap">{fmtDate(p.payout_date)}</td>
                        <td>{p.description}</td>
                        <td className="text-right font-mono font-semibold">{ZAR(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {payouts.length > 0 && (
                    <tfoot>
                      <tr className="bg-lblue font-semibold">
                        <td colSpan={2}>TOTAL PAID</td>
                        <td className="text-right font-mono">{ZAR(totalPaid)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
