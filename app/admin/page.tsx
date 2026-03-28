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
}

export default function AdminPage() {
  const router = useRouter()
  const [rows, setRows]         = useState<ArtistRow[]>([])
  const [agentRows, setAgentRows] = useState<AgentRow[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
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
        supabase.from("agent_payouts").select("*"),
      ])

      setRows(artistRows)

      if (agents) {
        const computed: AgentRow[] = agents.map((agent: Agent) => {
          const earned = artistRows.reduce((sum, { artist, shows }) => {
            return sum + shows.reduce((s2, show) => s2 + calcAgentEarned(show, artist, agent.name), 0)
          }, 0)
          const paid = (agentPayouts || [])
            .filter((p: AgentPayout) => p.agent_id === agent.id)
            .reduce((sum: number, p: AgentPayout) => sum + p.amount, 0)
          return { agent, earned, paid }
        })
        setAgentRows(computed)
      }

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  )

  const totals = rows.reduce((acc, { artist, shows, transfers, payouts }) => {
    const eb    = escrowBalance(artist, shows, transfers)
    const paid  = payouts.reduce((s, p) => s + p.amount, 0)
    const owed  = nettOwed(shows)
    return {
      current:   acc.current   + eb.current,
      pending:   acc.pending   + eb.pending,
      projected: acc.projected + eb.projected,
      confirmed: acc.confirmed + totalConfirmed(shows),
      nettOwed:  acc.nettOwed  + owed,
      nettPaid:  acc.nettPaid  + paid,
      due:       acc.due       + (owed - paid),
    }
  }, { current: 0, pending: 0, projected: 0, confirmed: 0, nettOwed: 0, nettPaid: 0, due: 0 })

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Admin Dashboard" isAdmin />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">

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
            <div className="stat-label">Confirmed Fees (All)</div>
            <div className="stat-value">{ZAR(totals.confirmed)}</div>
          </div>
        </div>

        {/* Agent Balances */}
        {agentRows.length > 0 && (
          <div className="card p-0">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-navy">Agent / Management Balances</h2>
            </div>
            <div className="table-wrap rounded-none rounded-b-xl">
              <table>
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th className="text-right">Total Earned</th>
                    <th className="text-right">Total Paid Out</th>
                    <th className="text-right">Balance Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {agentRows.map(({ agent, earned, paid }) => {
                    const balance = earned - paid
                    return (
                      <tr key={agent.id}>
                        <td className="font-medium">{agent.name}</td>
                        <td className="text-right font-mono">{ZAR(earned)}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(paid)}</td>
                        <td className={`text-right font-mono font-semibold ${balance < 0 ? "text-red-600" : "text-green-700"}`}>{ZAR(balance)}</td>
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
                  </tr>
                </tfoot>
              </table>
            </div>
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
      </main>
    </div>
  )
}
