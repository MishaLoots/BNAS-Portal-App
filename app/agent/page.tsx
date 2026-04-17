"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { calcAgentEarned } from "@/lib/calculations"
import type { Show, Artist } from "@/lib/types"
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

export default function AgentPage() {
  const router = useRouter()
  const [agentName, setAgentName] = useState("")
  const [showRows, setShowRows]   = useState<ShowRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [dateFrom, setDateFrom]   = useState("")
  const [dateTo, setDateTo]       = useState("")
  const [statusF, setStatusF]     = useState("")
  const [artistF, setArtistF]     = useState("")

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace("/login"); return }
    const { data: profile } = await supabase.from("profiles").select("agent_id, is_admin").eq("id", session.user.id).single()
    if (!profile?.agent_id) { router.replace("/login"); return }
    const { data: agent } = await supabase.from("agents").select("name").eq("id", profile.agent_id).single()
    if (!agent) { router.replace("/login"); return }
    setAgentName(agent.name)
    const { data: artists } = await supabase.from("artists").select("*")
    const { data: shows } = await supabase.from("shows").select("*")
      .or(`responsible_agent.eq.${agent.name},secondary_agent.eq.${agent.name}`)
      .order("show_date", { ascending: false })
    if (!shows || !artists) { setLoading(false); return }
    const rows: ShowRow[] = shows.map(show => {
      const artist = artists.find(a => a.id === show.artist_id) as Artist
      if (!artist) return null
      return { show, artist, earned: calcAgentEarned(show, artist, agent.name) }
    }).filter(Boolean) as ShowRow[]
    setShowRows(rows)
    setLoading(false)
  }

  const filtered = showRows.filter(r => {
    if (search   && !r.show.event?.toLowerCase().includes(search.toLowerCase()) && !r.artist.name?.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom && r.show.show_date < dateFrom) return false
    if (dateTo   && r.show.show_date > dateTo)   return false
    if (statusF  && r.show.status !== statusF)    return false
    if (artistF  && r.artist.id !== artistF)      return false
    return true
  })

  const totalEarned = filtered.reduce((s, r) => s + r.earned, 0)
  const totalGross  = filtered.reduce((s, r) => s + r.show.gross, 0)
  const uniqueArtists = Array.from(new Map(showRows.map(r => [r.artist.id, r.artist])).values())
  const hasFilter = search || dateFrom || dateTo || statusF || artistF
  function clearFilters() { setSearch(""); setDateFrom(""); setDateTo(""); setStatusF(""); setArtistF("") }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar title="Agent Portal" isAdmin={false} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">{agentName}</h1>
          <p className="text-sm text-gray-500">Agent Portal</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Shows {hasFilter ? "(filtered)" : "(all)"}</p>
            <p className="text-2xl font-bold text-navy mt-1">{filtered.length}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Earned {hasFilter ? "(filtered)" : "(all)"}</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{ZAR(totalEarned)}</p>
            <p className="text-xs text-gray-400 mt-0.5">on {ZAR(totalGross)} gross</p>
          </div>
        </div>
        <div className="card p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-navy">Show Log</h2>
          </div>
          <div className="px-6 py-3 border-b flex flex-wrap gap-3 items-end bg-gray-50">
            <input className="text-sm h-8 px-2 border rounded w-40" placeholder="Search event / artist…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="text-sm h-8 px-2 border rounded" value={artistF} onChange={e => setArtistF(e.target.value)}>
              <option value="">All artists</option>
              {uniqueArtists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input type="date" className="text-sm h-8 px-2 border rounded" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" className="text-sm h-8 px-2 border rounded" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            <select className="text-sm h-8 px-2 border rounded" value={statusF} onChange={e => setStatusF(e.target.value)}>
              <option value="">All statuses</option>
              <option>Pending</option><option>Fee Received</option><option>All Paid</option><option>Cancelled</option>
            </select>
            {hasFilter && <button className="text-xs text-gray-400 hover:text-gray-600" onClick={clearFilters}>Clear</button>}
            <span className="ml-auto text-xs text-gray-500">{filtered.length} show{filtered.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="table-wrap rounded-none rounded-b-xl">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Artist</th><th>Event</th><th>Role</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Earned</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-gray-400 py-8">No shows match your filters</td></tr>
                )}
                {filtered.map(({ show: s, artist: a, earned }) => (
                  <tr key={s.id}>
                    <td className="text-gray-500 whitespace-nowrap">{fmtDate(s.show_date)}</td>
                    <td className="font-medium">{a.name}</td>
                    <td>{s.event}</td>
                    <td className="text-xs text-gray-500">
                      {(s.responsible_agent || "").toLowerCase() === agentName.toLowerCase() ? "Main" : "Secondary"}
                    </td>
                    <td className="text-right font-mono">{ZAR(s.gross)}</td>
                    <td className="text-right font-mono font-semibold text-green-700">{ZAR(earned)}</td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        s.status === "All Paid"     ? "bg-green-100 text-green-700" :
                        s.status === "Fee Received" ? "bg-blue-100 text-blue-700" :
                        s.status === "Pending"      ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-500"}`}>{s.status || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-lblue font-semibold">
                    <td colSpan={3}>TOTALS ({filtered.length})</td>
                    <td></td>
                    <td className="text-right font-mono">{ZAR(totalGross)}</td>
                    <td className="text-right font-mono text-green-700">{ZAR(totalEarned)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
