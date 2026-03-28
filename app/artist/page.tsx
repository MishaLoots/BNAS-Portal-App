"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Navbar from "@/components/Navbar"
import type { Artist, Show, Transfer, Payout } from "@/lib/types"
import { ZAR, calcShow, escrowBalance, nettOwed } from "@/lib/calculations"

type Tab = "summary" | "shows" | "payouts"

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—"
  const d = new Date(s + "T00:00:00")
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export default function ArtistPage() {
  const router = useRouter()
  const [tab, setTab]             = useState<Tab>("summary")
  const [artist, setArtist]       = useState<Artist | null>(null)
  const [shows, setShows]         = useState<Show[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [payouts, setPayouts]     = useState<Payout[]>([])
  const [loading, setLoading]     = useState(true)
  const [approving, setApproving] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace("/login"); return }

      const { data: profile } = await supabase.from("profiles")
        .select("is_admin, artist_id").eq("id", session.user.id).single()

      if (profile?.is_admin) { router.replace("/admin"); return }
      if (!profile?.artist_id) { setLoading(false); return }

      const aid = profile.artist_id
      const [{ data: a }, { data: s }, { data: t }, { data: p }] = await Promise.all([
        supabase.from("artists").select("*").eq("id", aid).single(),
        supabase.from("shows").select("*").eq("artist_id", aid).order("show_date"),
        supabase.from("transfers").select("*").eq("artist_id", aid).order("transfer_date"),
        supabase.from("payouts").select("*").eq("artist_id", aid).order("payout_date"),
      ])
      setArtist(a); setShows(s || []); setTransfers(t || []); setPayouts(p || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function approvePayout(id: string) {
    setApproving(id)
    await supabase.from("payouts").update({
      approved_by_artist: true,
      approved_at: new Date().toISOString(),
    }).eq("id", id)
    setPayouts(ps => ps.map(p => p.id === id
      ? { ...p, approved_by_artist: true, approved_at: new Date().toISOString() }
      : p
    ))
    setApproving(null)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  )

  if (!artist) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card text-center">
        <p className="text-gray-500">No artist profile linked to your account.</p>
        <p className="text-xs text-gray-400 mt-2">Please contact BNAS.</p>
      </div>
    </div>
  )

  const eb   = escrowBalance(artist, shows, transfers)
  const paid = payouts.reduce((s, p) => s + p.amount, 0)
  const owed = nettOwed(shows)
  const due  = owed - paid
  const pendingPayouts = payouts.filter(p => !p.approved_by_artist)

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={artist.name} isAdmin={false} />

      {pendingPayouts.length > 0 && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 text-sm text-yellow-800">
          ⚠ You have <strong>{pendingPayouts.length}</strong> payout{pendingPayouts.length > 1 ? "s" : ""} awaiting your approval —{" "}
          <button onClick={() => setTab("payouts")} className="underline font-medium">review now</button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {(["summary","shows","payouts"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {t}{t === "payouts" && pendingPayouts.length > 0
                ? <span className="ml-1 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingPayouts.length}</span>
                : null}
            </button>
          ))}
        </div>

        {/* ── SUMMARY ──────────────────────────────────────────── */}
        {tab === "summary" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="stat-card">
                <div className="stat-label">Escrow Balance</div>
                <div className={`stat-value ${eb.current < 0 ? "text-red-600" : ""}`}>{ZAR(eb.current)}</div>
                <div className="stat-sub">in your escrow account</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Balance Due to You</div>
                <div className={`stat-value ${due < 0 ? "text-red-600" : ""}`}>{ZAR(due)}</div>
                <div className="stat-sub">nett owed − paid out</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Upcoming Fees</div>
                <div className="stat-value">{ZAR(eb.pending)}</div>
                <div className="stat-sub">confirmed, not yet received</div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold text-navy mb-3">Escrow Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-gray-500">Opening balance</span>
                  <span className="font-mono">{ZAR(artist.opening_balance)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-gray-500">+ Deposits received</span>
                  <span className="font-mono">{ZAR(eb.deposits)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-gray-500">− Transfers to running account</span>
                  <span className="font-mono text-red-600">({ZAR(eb.totalOut)})</span>
                </div>
                <div className="flex justify-between py-2 font-bold text-base">
                  <span>Current escrow balance</span>
                  <span className={`font-mono ${eb.current < 0 ? "text-red-600" : "text-green-700"}`}>{ZAR(eb.current)}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold text-navy mb-3">Payment Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-gray-500">Total nett owed (All Paid shows)</span>
                  <span className="font-mono">{ZAR(owed)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-gray-500">Total paid out to you</span>
                  <span className="font-mono">{ZAR(paid)}</span>
                </div>
                <div className="flex justify-between py-2 font-bold text-base">
                  <span>Balance due to you</span>
                  <span className={`font-mono ${due < 0 ? "text-red-600" : "text-green-700"}`}>{ZAR(due)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SHOWS ────────────────────────────────────────────── */}
        {tab === "shows" && (
          <div className="card p-0">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-navy">Your Shows — 2026</h2>
              <p className="text-xs text-gray-500 mt-0.5">Full breakdown for your records — contact BNAS to make changes</p>
            </div>
            <div className="table-wrap rounded-none rounded-b-xl">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Event</th><th>Type</th>
                    <th className="text-right">Gross</th><th>Pay</th>
                    <th className="text-right">Comm</th>
                    <th className="text-right">Band</th>
                    <th className="text-right">WC</th>
                    <th className="text-right">Nett</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shows.map(s => {
                    const c = calcShow(s)
                    return (
                      <tr key={s.id}>
                        <td className="text-gray-500 whitespace-nowrap">{fmtDate(s.show_date)}</td>
                        <td className="font-medium">{s.event}</td>
                        <td className="text-gray-500">{s.show_type}</td>
                        <td className="text-right font-mono">{ZAR(s.gross)}</td>
                        <td className={`text-xs font-medium ${s.pay_type === "Escrow" ? "text-bblue" : "text-gray-500"}`}>{s.pay_type}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(c.comm)}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(c.totalBand)}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(c.warchest)}</td>
                        <td className="text-right font-mono font-semibold">{ZAR(c.nett)}</td>
                        <td>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            s.status === "All Paid" ? "bg-green-100 text-green-700" :
                            s.status === "Fee Received" ? "bg-blue-100 text-blue-700" :
                            s.status === "Pending" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-500"
                          }`}>{s.status || "—"}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-lblue font-semibold">
                    <td colSpan={3}>TOTALS</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.gross, 0))}</td>
                    <td></td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + calcShow(r).comm, 0))}</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + calcShow(r).totalBand, 0))}</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + calcShow(r).warchest, 0))}</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + calcShow(r).nett, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── PAYOUTS ──────────────────────────────────────────── */}
        {tab === "payouts" && (
          <div className="space-y-4">
            {pendingPayouts.length > 0 && (
              <div className="card border-yellow-300 bg-yellow-50 space-y-3">
                <h3 className="font-semibold text-yellow-800">Pending Your Approval</h3>
                {pendingPayouts.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-white rounded-lg p-4 border border-yellow-200">
                    <div>
                      <div className="font-medium">{ZAR(p.amount)}</div>
                      <div className="text-sm text-gray-500">Batch {p.batch_ref} · {fmtDate(p.payout_date)}</div>
                      {p.notes && <div className="text-xs text-gray-400 mt-0.5">{p.notes}</div>}
                    </div>
                    <button
                      onClick={() => approvePayout(p.id)}
                      disabled={approving === p.id}
                      className="btn-success"
                    >
                      {approving === p.id ? "Confirming…" : "✓ Approve"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="card p-0">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-navy">Payout History</h2>
              </div>
              <div className="table-wrap rounded-none rounded-b-xl">
                <table>
                  <thead><tr><th>Date</th><th>Batch</th><th className="text-right">Amount</th><th>Notes</th><th className="text-center">Status</th></tr></thead>
                  <tbody>
                    {payouts.map(p => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap">{fmtDate(p.payout_date)}</td>
                        <td>{p.batch_ref}</td>
                        <td className="text-right font-mono font-semibold">{ZAR(p.amount)}</td>
                        <td className="text-gray-500">{p.notes}</td>
                        <td className="text-center">
                          {p.approved_by_artist
                            ? <span className="text-green-600 text-xs font-medium">✓ Approved</span>
                            : <span className="text-yellow-600 text-xs font-medium">Awaiting approval</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-lblue font-semibold">
                      <td colSpan={2}>TOTAL RECEIVED</td>
                      <td className="text-right font-mono">{ZAR(paid)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
