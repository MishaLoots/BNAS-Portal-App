"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Navbar from "@/components/Navbar"
import type { Artist, Show, Transfer, Payout, Batch } from "@/lib/types"
import { ZAR, calcShow, escrowBalance, nettOwed } from "@/lib/calculations"

type Tab = "summary" | "shows" | "payouts" | "approvals"

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—"
  const d = new Date(s.includes("T") ? s : s + "T00:00:00")
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export default function ArtistPage() {
  const router = useRouter()
  const [tab, setTab]             = useState<Tab>("summary")
  const [artist, setArtist]       = useState<Artist | null>(null)
  const [shows, setShows]         = useState<Show[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [payouts, setPayouts]     = useState<Payout[]>([])
  const [batches, setBatches]     = useState<Batch[]>([])
  const [loading, setLoading]     = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [signingOff, setSigningOff] = useState<string | null>(null)
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null)
  const [batchEdits, setBatchEdits] = useState<Record<string, string>>({})
  const [savingEdits, setSavingEdits] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace("/login"); return }

      const { data: profile } = await supabase.from("profiles")
        .select("is_admin, artist_id").eq("id", session.user.id).single()

      if (profile?.is_admin) { router.replace("/admin"); return }
      if (!profile?.artist_id) { setLoading(false); return }

      const aid = profile.artist_id
      const [{ data: a }, { data: s }, { data: t }, { data: p }, { data: b }] = await Promise.all([
        supabase.from("artists").select("*").eq("id", aid).single(),
        supabase.from("shows").select("*").eq("artist_id", aid).order("show_date"),
        supabase.from("transfers").select("*").eq("artist_id", aid).order("transfer_date"),
        supabase.from("payouts").select("*").eq("artist_id", aid).order("payout_date"),
        supabase.from("batches").select("*").eq("artist_id", aid).order("created_at", { ascending: false }),
      ])
      setArtist(a); setShows(s || []); setTransfers(t || []); setPayouts(p || []); setBatches(b || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function signOffBatch(batchId: string) {
    setSigningOff(batchId)
    await supabase.from("batches").update({
      status: "Signed Off",
      signed_off_at: new Date().toISOString(),
    }).eq("id", batchId)
    setBatches(bs => bs.map(b => b.id === batchId
      ? { ...b, status: "Signed Off", signed_off_at: new Date().toISOString() }
      : b
    ))
    setSigningOff(null)
    setEditingBatchId(null)
  }

  function startEditBatch(b: Batch) {
    setEditingBatchId(b.id)
    setBatchEdits({
      total_sound:   String(b.total_sound),
      total_mus1:    String(b.total_mus1),
      total_mus2:    String(b.total_mus2),
      total_mus3:    String(b.total_mus3),
      total_mus4:    String(b.total_mus4),
      total_other:   String(b.total_other),
    })
  }

  async function saveBatchEdits(batchId: string) {
    setSavingEdits(true)
    const b = batches.find(x => x.id === batchId)
    if (!b) return
    const sound   = parseFloat(batchEdits.total_sound)   || 0
    const mus1    = parseFloat(batchEdits.total_mus1)    || 0
    const mus2    = parseFloat(batchEdits.total_mus2)    || 0
    const mus3    = parseFloat(batchEdits.total_mus3)    || 0
    const mus4    = parseFloat(batchEdits.total_mus4)    || 0
    const other   = parseFloat(batchEdits.total_other)   || 0
    const newNett = b.total_gross - b.total_comm - sound - mus1 - mus2 - mus3 - mus4 - other - b.total_warchest
    await supabase.from("batches").update({
      total_sound: sound, total_mus1: mus1, total_mus2: mus2,
      total_mus3: mus3, total_mus4: mus4, total_other: other, total_nett: newNett,
    }).eq("id", batchId)
    setBatches(bs => bs.map(x => x.id === batchId
      ? { ...x, total_sound: sound, total_mus1: mus1, total_mus2: mus2, total_mus3: mus3, total_mus4: mus4, total_other: other, total_nett: newNett }
      : x
    ))
    setEditingBatchId(null)
    setSavingEdits(false)
  }

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
  const pendingPayouts  = payouts.filter(p => !p.approved_by_artist)
  const pendingBatches  = batches.filter(b => b.status === "Pending Sign-Off")

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={artist.name} isAdmin={false} />

      {(pendingBatches.length > 0 || pendingPayouts.length > 0) && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 text-sm text-yellow-800 flex gap-4 flex-wrap">
          {pendingBatches.length > 0 && (
            <span>⚠ <strong>{pendingBatches.length}</strong> batch{pendingBatches.length > 1 ? "es" : ""} awaiting sign-off —{" "}
              <button onClick={() => setTab("approvals")} className="underline font-medium">sign off now</button>
            </span>
          )}
          {pendingPayouts.length > 0 && (
            <span>⚠ <strong>{pendingPayouts.length}</strong> payout{pendingPayouts.length > 1 ? "s" : ""} awaiting approval —{" "}
              <button onClick={() => setTab("payouts")} className="underline font-medium">review now</button>
            </span>
          )}
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {(["summary","shows","payouts","approvals"] as Tab[]).map(t => (
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
                    <th className="text-right">Sound</th>
                    {artist.mus1_name && <th className="text-right">{artist.mus1_name}</th>}
                    {artist.mus2_name && <th className="text-right">{artist.mus2_name}</th>}
                    {artist.mus3_name && <th className="text-right">{artist.mus3_name}</th>}
                    {artist.mus4_name && <th className="text-right">{artist.mus4_name}</th>}
                    <th className="text-right">Other</th>
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
                        <td className="text-right font-mono text-gray-600">{s.sound ? ZAR(s.sound) : "—"}</td>
                        {artist.mus1_name && <td className="text-right font-mono text-gray-600">{s.mus1 ? ZAR(s.mus1) : "—"}</td>}
                        {artist.mus2_name && <td className="text-right font-mono text-gray-600">{s.mus2 ? ZAR(s.mus2) : "—"}</td>}
                        {artist.mus3_name && <td className="text-right font-mono text-gray-600">{s.mus3 ? ZAR(s.mus3) : "—"}</td>}
                        {artist.mus4_name && <td className="text-right font-mono text-gray-600">{s.mus4 ? ZAR(s.mus4) : "—"}</td>}
                        <td className="text-right font-mono text-gray-600">{s.other_costs ? ZAR(s.other_costs) : "—"}</td>
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
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.sound, 0))}</td>
                    {artist.mus1_name && <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.mus1, 0))}</td>}
                    {artist.mus2_name && <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.mus2, 0))}</td>}
                    {artist.mus3_name && <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.mus3, 0))}</td>}
                    {artist.mus4_name && <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + (r.mus4||0), 0))}</td>}
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.other_costs, 0))}</td>
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

        {/* ── APPROVALS ── */}
        {tab === "approvals" && (
          <div className="space-y-4">
            {batches.length === 0 && (
              <div className="card text-center text-gray-400 text-sm py-8">No batches yet</div>
            )}
            {batches.map(b => (
              <div key={b.id} className="card p-0">
                <div className="px-6 py-4 border-b flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-navy">{b.batch_num}</span>
                    <span className="ml-3 text-xs text-gray-500">{fmtDate(b.created_at)}</span>
                    <span className={`ml-3 text-xs px-2 py-0.5 rounded-full ${
                      b.status === "Paid"             ? "bg-green-100 text-green-700" :
                      b.status === "Signed Off"       ? "bg-blue-100 text-blue-700" :
                      b.status === "Pending Sign-Off" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>{b.status}</span>
                  </div>
                  {b.status === "Pending Sign-Off" && editingBatchId !== b.id && (
                    <button onClick={() => startEditBatch(b)} className="btn-ghost text-xs py-1">Edit Costs</button>
                  )}
                </div>

                <div className="px-6 py-4">
                  {editingBatchId === b.id ? (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-500">Edit costs below if needed, then sign off.</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div><label>Sound</label><input type="number" value={batchEdits.total_sound} onChange={e => setBatchEdits(x => ({ ...x, total_sound: e.target.value }))} /></div>
                        {b.mus1_name && <div><label>{b.mus1_name}</label><input type="number" value={batchEdits.total_mus1} onChange={e => setBatchEdits(x => ({ ...x, total_mus1: e.target.value }))} /></div>}
                        {b.mus2_name && <div><label>{b.mus2_name}</label><input type="number" value={batchEdits.total_mus2} onChange={e => setBatchEdits(x => ({ ...x, total_mus2: e.target.value }))} /></div>}
                        {b.mus3_name && <div><label>{b.mus3_name}</label><input type="number" value={batchEdits.total_mus3} onChange={e => setBatchEdits(x => ({ ...x, total_mus3: e.target.value }))} /></div>}
                        {b.mus4_name && <div><label>{b.mus4_name}</label><input type="number" value={batchEdits.total_mus4} onChange={e => setBatchEdits(x => ({ ...x, total_mus4: e.target.value }))} /></div>}
                        <div><label>Other</label><input type="number" value={batchEdits.total_other} onChange={e => setBatchEdits(x => ({ ...x, total_other: e.target.value }))} /></div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => saveBatchEdits(b.id)} disabled={savingEdits} className="btn-ghost text-xs py-1">{savingEdits ? "Saving…" : "Save Changes"}</button>
                        <button onClick={() => { signOffBatch(b.id) }} disabled={signingOff === b.id} className="btn-primary text-xs py-1">{signingOff === b.id ? "Signing…" : "Save & Sign Off"}</button>
                        <button onClick={() => setEditingBatchId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                      <div><div className="text-xs text-gray-500">Gross</div><div className="font-mono font-medium">{ZAR(b.total_gross)}</div></div>
                      <div><div className="text-xs text-gray-500">Commission</div><div className="font-mono text-red-600">({ZAR(b.total_comm)})</div></div>
                      {b.total_sound > 0 && <div><div className="text-xs text-gray-500">Sound</div><div className="font-mono text-red-600">({ZAR(b.total_sound)})</div></div>}
                      {b.mus1_name && b.total_mus1 > 0 && <div><div className="text-xs text-gray-500">{b.mus1_name}</div><div className="font-mono text-red-600">({ZAR(b.total_mus1)})</div></div>}
                      {b.mus2_name && b.total_mus2 > 0 && <div><div className="text-xs text-gray-500">{b.mus2_name}</div><div className="font-mono text-red-600">({ZAR(b.total_mus2)})</div></div>}
                      {b.mus3_name && b.total_mus3 > 0 && <div><div className="text-xs text-gray-500">{b.mus3_name}</div><div className="font-mono text-red-600">({ZAR(b.total_mus3)})</div></div>}
                      {b.mus4_name && b.total_mus4 > 0 && <div><div className="text-xs text-gray-500">{b.mus4_name}</div><div className="font-mono text-red-600">({ZAR(b.total_mus4)})</div></div>}
                      {b.total_other > 0 && <div><div className="text-xs text-gray-500">Other</div><div className="font-mono text-red-600">({ZAR(b.total_other)})</div></div>}
                      {b.total_warchest > 0 && <div><div className="text-xs text-gray-500">Warchest</div><div className="font-mono text-red-600">({ZAR(b.total_warchest)})</div></div>}
                      <div className="border-l pl-3"><div className="text-xs text-gray-500">Nett to You</div><div className="font-mono font-bold text-green-700">{ZAR(b.total_nett)}</div></div>
                    </div>
                  )}
                </div>

                {b.status === "Pending Sign-Off" && editingBatchId !== b.id && (
                  <div className="px-6 pb-4">
                    <button onClick={() => signOffBatch(b.id)} disabled={signingOff === b.id} className="btn-primary text-xs py-1">
                      {signingOff === b.id ? "Signing…" : "Sign Off"}
                    </button>
                  </div>
                )}
                {b.status === "Signed Off" && (
                  <div className="px-6 pb-4 text-xs text-blue-600">✓ Signed off {fmtDate(b.signed_off_at)}</div>
                )}
                {b.status === "Paid" && (
                  <div className="px-6 pb-4 text-xs text-green-600">✓ Paid {fmtDate(b.paid_at)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
