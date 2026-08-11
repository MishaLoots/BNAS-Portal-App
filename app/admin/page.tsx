"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Navbar from "@/components/Navbar"
import type { Artist, Show, Transfer, Payout, Agent, AgentPayout } from "@/lib/types"
import { ZAR, escrowBalance, nettOwed, totalConfirmed, calcAgentEarned } from "@/lib/calculations"

interface ArtistRow {
  artist: Artist
  shows: Show[]
  transfers: Transfer[]
  payouts: Payout[]
}

interface AgentRow {
  agent: Agent
  earned: number
  paid: number
  payouts: AgentPayout[]
  showEarnings: { show: Show; artistName: string; earned: number }[]
}

const PAYOUT_TYPES = ["Payout", "Advance", "Expense Reimbursement", "Other"]

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—"
  return new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

function statusColor(status: string | null): string {
  switch (status) {
    case "All Paid":      return "bg-green-100 text-green-700"
    case "Fee Received":  return "bg-blue-100 text-blue-700"
    case "Pending":       return "bg-yellow-100 text-yellow-700"
    case "Cancelled":     return "bg-red-100 text-red-500"
    default:              return "bg-gray-100 text-gray-500"
  }
}

export default function AdminPage() {
  const router = useRouter()
  const [rows, setRows]           = useState<ArtistRow[]>([])
  const [agentRows, setAgentRows] = useState<AgentRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<"dashboard" | "monthly">("dashboard")
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [agentView, setAgentView]         = useState<"payouts" | "shows">("payouts")
  const [editingPayout, setEditingPayout] = useState<AgentPayout | null>(null)
  const [payoutForm, setPayoutForm] = useState<{ agent_id: string; payout_date: string; amount: string; payout_type: string; description: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace("/login"); return }

    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single()
    if (!profile?.is_admin) { router.replace("/artist"); return }

    const { data: artists } = await supabase.from("artists").select("*").order("name")
    if (!artists) { setLoading(false); return }

    const [artistRows, { data: agents }, { data: agentPayouts }] = await Promise.all([
      Promise.all(artists.map(async (artist: Artist) => {
        const [{ data: shows }, { data: transfers }, { data: payouts }] = await Promise.all([
          supabase.from("shows").select("*").eq("artist_id", artist.id).order("show_date"),
          supabase.from("transfers").select("*").eq("artist_id", artist.id).order("transfer_date"),
          supabase.from("payouts").select("*").eq("artist_id", artist.id).order("payout_date"),
        ])
        return { artist, shows: shows || [], transfers: transfers || [], payouts: payouts || [] }
      })),
      supabase.from("agents").select("*").order("name"),
      supabase.from("agent_payouts").select("*").order("payout_date", { ascending: false }),
    ])

    setRows(artistRows)

    // Expand the current month by default
    const now = new Date()
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    setExpandedMonths(new Set([currentKey]))

    if (agents) {
      const computed: AgentRow[] = agents.map((agent: Agent) => {
        const myPayouts = (agentPayouts || []).filter((p: AgentPayout) => p.agent_id === agent.id)
        const showEarnings = artistRows.flatMap(({ artist, shows }) =>
          shows
            .map(show => ({ show, artistName: artist.name, earned: calcAgentEarned(show, artist, agent.name) }))
            .filter(x => x.earned > 0)
        )
        const earned = showEarnings.reduce((sum, x) => sum + x.earned, 0)
        const paid = myPayouts.reduce((sum: number, p: AgentPayout) => sum + p.amount, 0)
        return { agent, earned, paid, payouts: myPayouts, showEarnings }
      })
      setAgentRows(computed)
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [router])

  function toggleMonth(key: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function saveAgentPayout() {
    if (!payoutForm) return
    setSaving(true)
    const data = { agent_id: payoutForm.agent_id, payout_date: payoutForm.payout_date, amount: parseFloat(payoutForm.amount) || 0, payout_type: payoutForm.payout_type, description: payoutForm.description || null }
    if (editingPayout) {
      await supabase.from("agent_payouts").update(data).eq("id", editingPayout.id)
    } else {
      await supabase.from("agent_payouts").insert(data)
    }
    setPayoutForm(null); setEditingPayout(null)
    await load(); setSaving(false)
  }

  async function deleteAgentPayout(id: string) {
    if (!window.confirm("Delete this payout entry?")) return
    await supabase.from("agent_payouts").delete().eq("id", id)
    await load()
  }

  function startEditPayout(p: AgentPayout) {
    setEditingPayout(p)
    setExpandedAgent(p.agent_id)
    setPayoutForm({ agent_id: p.agent_id, payout_date: p.payout_date, amount: String(p.amount), payout_type: p.payout_type || "Payout", description: p.description || "" })
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  )

  const totals = rows.reduce((acc, { artist, shows, transfers, payouts }) => {
    const eb    = escrowBalance(artist, shows, transfers)
    const paid  = payouts.reduce((s, p) => s + p.amount, 0)
    const owed  = nettOwed(shows)
    return {
      current:       acc.current       + eb.current,
      pending:       acc.pending       + eb.pending,
      projected:     acc.projected     + eb.projected,
      confirmed2026: acc.confirmed2026 + totalConfirmed(shows.filter(s => s.show_date.startsWith("2026"))),
      confirmed2027: acc.confirmed2027 + totalConfirmed(shows.filter(s => !s.show_date.startsWith("2026"))),
      nettOwed:      acc.nettOwed      + owed,
      nettPaid:      acc.nettPaid      + paid,
      due:           acc.due           + (owed - paid),
    }
  }, { current: 0, pending: 0, projected: 0, confirmed2026: 0, confirmed2027: 0, nettOwed: 0, nettPaid: 0, due: 0 })

  // Build monthly overview: all shows across all artists, grouped by month
  const allShows: { show: Show; artistName: string }[] = rows.flatMap(({ artist, shows }) =>
    shows.map(show => ({ show, artistName: artist.name }))
  ).sort((a, b) => a.show.show_date.localeCompare(b.show.show_date))

  const monthGroups: { key: string; label: string; items: { show: Show; artistName: string }[]; totalGross: number; totalComm: number }[] = []
  for (const item of allShows) {
    const key = item.show.show_date.slice(0, 7)
    const last = monthGroups[monthGroups.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
      last.totalGross += item.show.gross
      last.totalComm  += item.show.gross * item.show.comm_pct
    } else {
      monthGroups.push({ key, label: monthLabel(item.show.show_date), items: [item], totalGross: item.show.gross, totalComm: item.show.gross * item.show.comm_pct })
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Admin Dashboard" isAdmin />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Tab switcher + actions */}
        <div className="flex items-center justify-between">
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-sm shadow-sm">
            <button
              onClick={() => setTab("dashboard")}
              className={`px-4 py-2 font-medium transition-colors ${tab === "dashboard" ? "bg-navy text-white" : "text-gray-500 hover:text-navy"}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setTab("monthly")}
              className={`px-4 py-2 font-medium transition-colors ${tab === "monthly" ? "bg-navy text-white" : "text-gray-500 hover:text-navy"}`}
            >
              Monthly Overview
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push("/admin/users")} className="btn-secondary text-sm">⚙ Manage Users</button>
            <button onClick={() => router.push("/admin/agent-payouts")} className="btn-secondary text-sm">💳 Agent Payouts</button>
          </div>
        </div>

        {/* ── DASHBOARD TAB ── */}
        {tab === "dashboard" && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="stat-card">
                <div className="stat-label">Total in Escrow</div>
                <div className={`stat-value ${totals.current < 0 ? "text-red-600" : ""}`}>{ZAR(totals.current)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Projected Escrow</div>
                <div className="stat-value">{ZAR(totals.projected)}</div>
                <div className="stat-sub">+ R{totals.pending.toLocaleString()} pending</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Balance Due Artists</div>
                <div className={`stat-value ${totals.due < 0 ? "text-red-600" : ""}`}>{ZAR(totals.due)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Confirmed Fees</div>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-gray-400 font-medium">2026</span>
                    <span className="stat-value text-lg leading-none">{ZAR(totals.confirmed2026)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-gray-400 font-medium">2027</span>
                    <span className="stat-value text-lg leading-none">{ZAR(totals.confirmed2027)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Balances + Payout Log */}
            {agentRows.length > 0 && (
              <div className="card p-0">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-navy">Agent / Management Balances</h2>
                </div>
                <div className="table-wrap rounded-none">
                  <table>
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th className="text-right">Total Earned</th>
                        <th className="text-right">Total Paid Out</th>
                        <th className="text-right">Balance Owed</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentRows.map(({ agent, earned, paid }) => {
                        const balance = earned - paid
                        const isExpanded = expandedAgent === agent.id
                        return (
                          <tr key={agent.id}>
                            <td className="font-medium">{agent.name}</td>
                            <td className="text-right font-mono">{ZAR(earned)}</td>
                            <td className="text-right font-mono text-gray-600">{ZAR(paid)}</td>
                            <td className={`text-right font-mono font-semibold ${balance < 0 ? "text-red-600" : "text-green-700"}`}>{ZAR(balance)}</td>
                            <td>
                              <button
                                onClick={() => {
                                  setExpandedAgent(isExpanded ? null : agent.id)
                                  setPayoutForm(isExpanded ? null : null)
                                  setEditingPayout(null)
                                }}
                                className="text-xs text-bblue hover:text-navy font-medium"
                              >
                                {isExpanded ? "Close" : "Manage ↓"}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-lblue font-semibold">
                        <td>TOTALS</td>
                        <td className="text-right font-mono">{ZAR(agentRows.reduce((s, r) => s + r.earned, 0))}</td>
                        <td className="text-right font-mono">{ZAR(agentRows.reduce((s, r) => s + r.paid, 0))}</td>
                        <td className="text-right font-mono">{ZAR(agentRows.reduce((s, r) => s + r.earned - r.paid, 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Expanded payout log */}
                {expandedAgent && (() => {
                  const row = agentRows.find(r => r.agent.id === expandedAgent)
                  if (!row) return null
                  return (
                    <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-xl">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-navy text-sm">{row.agent.name}</h3>
                        <div className="flex items-center gap-2">
                          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden text-xs">
                            <button onClick={() => setAgentView("payouts")} className={`px-3 py-1 ${agentView === "payouts" ? "bg-navy text-white" : "text-gray-500"}`}>Payout Log</button>
                            <button onClick={() => setAgentView("shows")} className={`px-3 py-1 ${agentView === "shows" ? "bg-navy text-white" : "text-gray-500"}`}>Shows ({row.showEarnings.length})</button>
                          </div>
                          {agentView === "payouts" && !payoutForm && (
                            <button onClick={() => setPayoutForm({ agent_id: row.agent.id, payout_date: "", amount: "", payout_type: "Payout", description: "" })} className="btn-primary text-xs py-1">+ Log Payment</button>
                          )}
                        </div>
                      </div>

                      {agentView === "payouts" && (
                        <>
                          {payoutForm && payoutForm.agent_id === row.agent.id && (
                            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <div><label>Date</label><input type="date" value={payoutForm.payout_date} onChange={e => setPayoutForm(f => f ? { ...f, payout_date: e.target.value } : f)} /></div>
                              <div><label>Type</label><select value={payoutForm.payout_type} onChange={e => setPayoutForm(f => f ? { ...f, payout_type: e.target.value } : f)}>{PAYOUT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                              <div><label>Amount</label><input type="number" placeholder="0" value={payoutForm.amount} onChange={e => setPayoutForm(f => f ? { ...f, amount: e.target.value } : f)} /></div>
                              <div className="sm:col-span-2"><label>Description</label><input placeholder="Optional note" value={payoutForm.description} onChange={e => setPayoutForm(f => f ? { ...f, description: e.target.value } : f)} /></div>
                              <div className="sm:col-span-5 flex gap-2">
                                <button onClick={saveAgentPayout} disabled={saving} className="btn-primary text-xs py-1">{saving ? "Saving…" : editingPayout ? "Update" : "Save"}</button>
                                <button onClick={() => { setPayoutForm(null); setEditingPayout(null) }} className="btn-ghost text-xs py-1">Cancel</button>
                              </div>
                            </div>
                          )}
                          {row.payouts.length === 0 ? (
                            <p className="text-sm text-gray-400">No payments logged yet</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                                <th className="pb-1 font-medium">Date</th><th className="pb-1 font-medium">Type</th>
                                <th className="pb-1 font-medium text-right">Amount</th><th className="pb-1 font-medium">Description</th><th></th>
                              </tr></thead>
                              <tbody>
                                {row.payouts.map(p => (
                                  <tr key={p.id} className="border-b border-gray-100">
                                    <td className="py-1.5 text-gray-600">{fmtDate(p.payout_date)}</td>
                                    <td className="py-1.5 text-gray-600">{p.payout_type || "Payout"}</td>
                                    <td className="py-1.5 text-right font-mono font-semibold">{ZAR(p.amount)}</td>
                                    <td className="py-1.5 text-gray-500">{p.description || "—"}</td>
                                    <td className="py-1.5 text-right">
                                      <button onClick={() => startEditPayout(p)} className="text-xs text-bblue hover:underline mr-2">Edit</button>
                                      <button onClick={() => deleteAgentPayout(p.id)} className="text-xs text-red-500 hover:underline">Del</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </>
                      )}

                      {agentView === "shows" && (
                        row.showEarnings.length === 0 ? (
                          <p className="text-sm text-gray-400">No show earnings for this agent</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                              <th className="pb-1 font-medium">Date</th><th className="pb-1 font-medium">Artist</th>
                              <th className="pb-1 font-medium">Event</th><th className="pb-1 font-medium text-right">Gross</th>
                              <th className="pb-1 font-medium text-right">Earned</th>
                            </tr></thead>
                            <tbody>
                              {row.showEarnings.map(x => (
                                <tr key={x.show.id} className="border-b border-gray-100">
                                  <td className="py-1.5 text-gray-500 whitespace-nowrap">{fmtDate(x.show.show_date)}</td>
                                  <td className="py-1.5 text-gray-600">{x.artistName}</td>
                                  <td className="py-1.5">{x.show.event}</td>
                                  <td className="py-1.5 text-right font-mono">{ZAR(x.show.gross)}</td>
                                  <td className="py-1.5 text-right font-mono font-semibold text-green-700">{ZAR(x.earned)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-gray-200 font-semibold text-xs">
                                <td colSpan={4} className="pt-1">TOTAL</td>
                                <td className="pt-1 text-right font-mono text-green-700">{ZAR(row.showEarnings.reduce((s, x) => s + x.earned, 0))}</td>
                              </tr>
                            </tfoot>
                          </table>
                        )
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Artists Table */}
            <div className="card p-0">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-navy">Artists</h2>
              </div>
              <div className="table-wrap rounded-none rounded-b-xl">
                <table>
                  <thead>
                    <tr>
                      <th>Artist</th>
                      <th>Escrow Account</th>
                      <th className="text-center">Shows</th>
                      <th className="text-right">Current Balance</th>
                      <th className="text-right">Pending</th>
                      <th className="text-right">Projected</th>
                      <th className="text-right">Nett Owed</th>
                      <th className="text-right">Nett Paid</th>
                      <th className="text-right">Balance Due</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ artist, shows, transfers, payouts }) => {
                      const eb   = escrowBalance(artist, shows, transfers)
                      const paid = payouts.reduce((s, p) => s + p.amount, 0)
                      const owed = nettOwed(shows)
                      const due  = owed - paid
                      return (
                        <tr key={artist.id}>
                          <td className="font-medium">{artist.name}</td>
                          <td className="text-gray-500">{artist.escrow_account}</td>
                          <td className="text-center text-gray-500">{shows.length}</td>
                          <td className={`text-right font-mono ${eb.current < 0 ? "text-red-600" : ""}`}>{ZAR(eb.current)}</td>
                          <td className="text-right font-mono text-gray-500">{ZAR(eb.pending)}</td>
                          <td className="text-right font-mono">{ZAR(eb.projected)}</td>
                          <td className="text-right font-mono">{ZAR(owed)}</td>
                          <td className="text-right font-mono">{ZAR(paid)}</td>
                          <td className={`text-right font-mono font-semibold ${due < 0 ? "text-red-600" : ""}`}>{ZAR(due)}</td>
                          <td>
                            <button
                              onClick={() => router.push(`/admin/artists/${artist.id}`)}
                              className="text-bblue hover:text-navy text-xs font-medium"
                            >
                              Open →
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-lblue font-semibold">
                      <td colSpan={2}>TOTALS</td>
                      <td className="text-center">{rows.reduce((s, r) => s + r.shows.length, 0)}</td>
                      <td className={`text-right font-mono ${totals.current < 0 ? "text-red-600" : ""}`}>{ZAR(totals.current)}</td>
                      <td className="text-right font-mono">{ZAR(totals.pending)}</td>
                      <td className="text-right font-mono">{ZAR(totals.projected)}</td>
                      <td className="text-right font-mono">{ZAR(totals.nettOwed)}</td>
                      <td className="text-right font-mono">{ZAR(totals.nettPaid)}</td>
                      <td className={`text-right font-mono ${totals.due < 0 ? "text-red-600" : ""}`}>{ZAR(totals.due)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── MONTHLY OVERVIEW TAB ── */}
        {tab === "monthly" && (
          <div className="space-y-2">
            {monthGroups.length === 0 && (
              <p className="text-gray-400 text-sm">No shows found.</p>
            )}
            {monthGroups.map(({ key, label, items, totalGross, totalComm }) => {
              const isOpen = expandedMonths.has(key)
              return (
                <div key={key} className="card p-0">
                  <button
                    onClick={() => toggleMonth(key)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`text-xs text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                      <span className="font-semibold text-navy text-sm">{label}</span>
                      <span className="text-xs text-gray-400">{items.length} show{items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-xs text-gray-400">comm <span className="font-mono font-semibold text-bblue">{ZAR(totalComm)}</span></span>
                      <span className="font-mono font-semibold text-gray-700">{ZAR(totalGross)}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100">
                      <div className="table-wrap rounded-none rounded-b-xl">
                        <table className="text-xs">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Artist</th>
                              <th>Event</th>
                              <th>Type</th>
                              <th className="text-right">Gross</th>
                              <th className="text-right">Commission</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map(({ show: sh, artistName }) => {
                              const isDirect = sh.pay_type === "Direct"
                              const comm = sh.gross * sh.comm_pct
                              return (
                                <tr key={sh.id} className={isDirect ? "opacity-50" : ""}>
                                  <td className="whitespace-nowrap text-gray-500 py-1.5">{fmtDate(sh.show_date)}</td>
                                  <td className="text-gray-600 py-1.5">{artistName}</td>
                                  <td className="font-medium py-1.5">{sh.event}</td>
                                  <td className="text-gray-500 py-1.5">{sh.show_type || "—"}</td>
                                  <td className="text-right font-mono py-1.5">{ZAR(sh.gross)}</td>
                                  <td className="text-right font-mono text-bblue py-1.5">{ZAR(comm)}</td>
                                  <td className="py-1.5">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {isDirect && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">Direct</span>
                                      )}
                                      <span className={`px-1.5 py-0.5 rounded-full ${statusColor(sh.status)}`}>
                                        {sh.status || "—"}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-lblue font-semibold">
                              <td colSpan={4} className="py-1.5">Total</td>
                              <td className="text-right font-mono py-1.5">{ZAR(totalGross)}</td>
                              <td className="text-right font-mono text-bblue py-1.5">{ZAR(totalComm)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </main>
    </div>
  )
}
