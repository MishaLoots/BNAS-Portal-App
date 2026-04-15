"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { calcAgentEarned } from "@/lib/calculations"
import type { Show, Artist, Agent, AgentPayout } from "@/lib/types"
import Navbar from "@/components/Navbar"

function ZAR(n: number) {
  return "R " + (n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—"
  const d = new Date(s.includes("T") ? s : s + "T00:00:00")
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

interface ShowRow { show: Show; artist: Artist; earned: number }

export default function AgentPayoutsPage() {
  const router = useRouter()
  const [agents, setAgents]       = useState<Agent[]>([])
  const [artists, setArtists]     = useState<Artist[]>([])
  const [allShows, setAllShows]   = useState<Show[]>([])
  const [payouts, setPayouts]     = useState<AgentPayout[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

  const [selectedAgent, setSelectedAgent] = useState("")
  const [dateFrom, setDateFrom]           = useState("")
  const [dateTo, setDateTo]               = useState("")
  const [search, setSearch]               = useState("")
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [batchRef, setBatchRef]           = useState("")
  const [payoutDate, setPayoutDate]       = useState("")
  const [notes, setNotes]                 = useState("")

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace("/login"); return }
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single()
    if (!profile?.is_admin) { router.replace("/admin"); return }

    const [{ data: ag }, { data: ar }, { data: sh }, { data: py }] = await Promise.all([
      supabase.from("agents").select("*").order("name"),
      supabase.from("artists").select("*"),
      supabase.from("shows").select("*").order("show_date", { ascending: false }),
      supabase.from("agent_payouts").select("*").order("payout_date", { ascending: false }),
    ])
    setAgents(ag || [])
    setArtists(ar || [])
    setAllShows(sh || [])
    setPayouts(py || [])
    setLoading(false)
  }

  const agent = agents.find(a => a.id === selectedAgent)

  // Shows for this agent — exclude already-batched (agent_batch_ref set)
  const agentShows: ShowRow[] = !agent ? [] : allShows
    .filter(s => {
      const ra = (s.responsible_agent || "").toLowerCase()
      const sa = (s.secondary_agent  || "").toLowerCase()
      const nm = agent.name.toLowerCase()
      return (ra === nm || sa === nm) && s.status !== "Cancelled"
    })
    .map(s => {
      const ar = artists.find(a => a.id === s.artist_id)
      if (!ar) return null
      return { show: s, artist: ar, earned: calcAgentEarned(s, ar, agent.name) }
    })
    .filter(Boolean) as ShowRow[]

  const unbatched = agentShows.filter(r => !r.show.agent_batch_ref)
  const batched   = agentShows.filter(r =>  r.show.agent_batch_ref)

  const filtered = unbatched.filter(r => {
    if (search   && !r.show.event?.toLowerCase().includes(search.toLowerCase()) && !r.artist.name?.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom && r.show.show_date < dateFrom) return false
    if (dateTo   && r.show.show_date > dateTo)   return false
    return true
  })

  const selRows  = filtered.filter(r => selected.has(r.show.id))
  const totalEarned = selRows.reduce((s, r) => s + r.earned, 0)
  const totalGross  = selRows.reduce((s, r) => s + r.show.gross, 0)

  function toggleAll() {
    if (filtered.every(r => selected.has(r.show.id))) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(r => n.delete(r.show.id)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(r => n.add(r.show.id)); return n })
    }
  }
  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function logPayout() {
    if (!agent || selRows.length === 0 || !batchRef.trim() || !payoutDate) return
    setSaving(true)

    // Insert agent payout record
    await supabase.from("agent_payouts").insert({
      agent_id: agent.id,
      payout_date: payoutDate,
      amount: totalEarned,
      description: notes || `Batch ${batchRef}`,
      payout_type: "Batch",
    })

    // Mark shows with agent_batch_ref
    const ids = selRows.map(r => r.show.id)
    await supabase.from("shows").update({ agent_batch_ref: batchRef }).in("id", ids)

    setBatchRef(""); setPayoutDate(""); setNotes(""); setSelected(new Set())
    await load()
    setSaving(false)
  }

  // Payout history for selected agent
  const agentPayouts = payouts.filter(p => p.agent_id === selectedAgent)

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar title="Agent Payouts" isAdmin={true} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/admin")} className="text-sm text-bblue hover:text-navy">← Dashboard</button>
          <h1 className="text-2xl font-bold text-navy">Agent Batch Payouts</h1>
        </div>

        {/* Agent selector + filters */}
        <div className="card p-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Agent</label>
              <select className="h-9 px-2 border rounded text-sm min-w-[160px]" value={selectedAgent} onChange={e => { setSelectedAgent(e.target.value); setSelected(new Set()) }}>
                <option value="">— Select agent —</option>
                {agents.filter(a => !["bnas overhead","bnas pool","007"].includes(a.name.toLowerCase())).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Search</label>
              <input className="h-9 px-2 border rounded text-sm w-36" placeholder="Event / artist…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" className="h-9 px-2 border rounded text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" className="h-9 px-2 border rounded text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            {(search||dateFrom||dateTo) && (
              <button className="text-xs text-gray-400 hover:text-gray-600 mt-4" onClick={() => { setSearch(""); setDateFrom(""); setDateTo("") }}>Clear</button>
            )}
          </div>
        </div>

        {agent && (
          <>
            {/* Summary */}
            {selected.size > 0 && (
              <div className="card p-5 bg-navy/5 border-navy/20">
                <div className="flex flex-wrap gap-6 items-end justify-between">
                  <div className="flex gap-6">
                    <div>
                      <p className="text-xs text-gray-500">Selected Shows</p>
                      <p className="text-xl font-bold text-navy">{selRows.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Gross</p>
                      <p className="text-xl font-bold text-navy">{ZAR(totalGross)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Earned by {agent.name}</p>
                      <p className="text-xl font-bold text-green-700">{ZAR(totalEarned)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Batch Ref</label>
                      <input className="h-9 px-2 border rounded text-sm w-28" placeholder="e.g. AB001" value={batchRef} onChange={e => setBatchRef(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Payout Date</label>
                      <input type="date" className="h-9 px-2 border rounded text-sm" value={payoutDate} onChange={e => setPayoutDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Notes</label>
                      <input className="h-9 px-2 border rounded text-sm w-40" placeholder="Optional…" value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                    <button
                      onClick={logPayout}
                      disabled={saving || !batchRef.trim() || !payoutDate}
                      className="btn-primary h-9"
                    >
                      {saving ? "Saving…" : `Log Payout — ${ZAR(totalEarned)}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Unbatched shows */}
            <div className="card p-0">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-navy">Unbatched Shows — {agent.name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{filtered.length} shows · select to include in payout</p>
                </div>
              </div>
              <div className="table-wrap rounded-none rounded-b-xl">
                <table>
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input type="checkbox" className="w-auto"
                          checked={filtered.length > 0 && filtered.every(r => selected.has(r.show.id))}
                          onChange={toggleAll} />
                      </th>
                      <th>Date</th><th>Artist</th><th>Event</th><th>Role</th>
                      <th className="text-right">Gross</th>
                      <th className="text-right">Earned</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-gray-400 py-8">No unbatched shows</td></tr>
                    )}
                    {filtered.map(({ show: s, artist: a, earned }) => (
                      <tr key={s.id} className={selected.has(s.id) ? "bg-blue-50" : ""}>
                        <td><input type="checkbox" className="w-auto" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>
                        <td className="whitespace-nowrap text-gray-500">{fmtDate(s.show_date)}</td>
                        <td className="font-medium">{a.name}</td>
                        <td>{s.event}</td>
                        <td className="text-xs text-gray-500">
                          {(s.responsible_agent||"").toLowerCase() === agent.name.toLowerCase() ? "Main" : "Secondary"}
                        </td>
                        <td className="text-right font-mono">{ZAR(s.gross)}</td>
                        <td className="text-right font-mono font-semibold text-green-700">{ZAR(earned)}</td>
                        <td>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            s.status === "All Paid" ? "bg-green-100 text-green-700" :
                            s.status === "Fee Received" ? "bg-blue-100 text-blue-700" :
                            s.status === "Pending" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-500"}`}>{s.status || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {selRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-lblue font-semibold">
                        <td colSpan={5}>SELECTED ({selRows.length})</td>
                        <td className="text-right font-mono">{ZAR(totalGross)}</td>
                        <td className="text-right font-mono text-green-700">{ZAR(totalEarned)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Previously batched */}
            {batched.length > 0 && (
              <div className="card p-0">
                <div className="px-6 py-4 border-b">
                  <h2 className="font-semibold text-navy">Previously Batched</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Read-only — already included in a payout</p>
                </div>
                <div className="table-wrap rounded-none rounded-b-xl">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th><th>Artist</th><th>Event</th><th>Batch Ref</th>
                        <th className="text-right">Gross</th>
                        <th className="text-right">Earned</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batched.map(({ show: s, artist: a, earned }) => (
                        <tr key={s.id} className="opacity-60">
                          <td className="whitespace-nowrap text-gray-500">{fmtDate(s.show_date)}</td>
                          <td className="font-medium">{a.name}</td>
                          <td>{s.event}</td>
                          <td className="text-xs font-mono text-gray-500">{s.agent_batch_ref}</td>
                          <td className="text-right font-mono">{ZAR(s.gross)}</td>
                          <td className="text-right font-mono text-green-700">{ZAR(earned)}</td>
                          <td>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              s.status === "All Paid" ? "bg-green-100 text-green-700" :
                              s.status === "Fee Received" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-500"}`}>{s.status || "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payout history */}
            {agentPayouts.length > 0 && (
              <div className="card p-0">
                <div className="px-6 py-4 border-b">
                  <h2 className="font-semibold text-navy">Payout History — {agent.name}</h2>
                </div>
                <div className="table-wrap rounded-none rounded-b-xl">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th><th>Ref</th><th>Notes</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentPayouts.map(p => (
                        <tr key={p.id}>
                          <td className="whitespace-nowrap">{fmtDate(p.payout_date)}</td>
                          <td className="font-mono text-xs">{p.payout_type}</td>
                          <td className="text-gray-500">{p.description}</td>
                          <td className="text-right font-mono font-semibold">{ZAR(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-lblue font-semibold">
                        <td colSpan={3}>TOTAL PAID</td>
                        <td className="text-right font-mono">{ZAR(agentPayouts.reduce((s, p) => s + p.amount, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

      </main>
    </div>
  )
}
