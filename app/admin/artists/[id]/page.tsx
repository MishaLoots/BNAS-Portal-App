"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Navbar from "@/components/Navbar"
import type { Artist, Show, Transfer, Payout, LoanRepayment } from "@/lib/types"
import { ZAR, calcShow, escrowBalance, nettOwed } from "@/lib/calculations"

type Tab = "shows" | "escrow" | "payouts" | "loan" | "batch"

const SHOW_TYPES  = ["Rest/Club","Festival","Corporate","Private","Wed/Rec","Feature","Headline","INT Support","Other"]
const STATUSES    = ["All Paid","Fee Received","Pending","Cancelled"]
const XFER_TYPES  = ["Batch Payout","Warchest Dist.","Loan/Other","Refund","Other"]

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—"
  const d = new Date(s + "T00:00:00")
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

const BLANK_SHOW = {
  show_date: "", event: "", show_type: "Rest/Club", gross: "",
  pay_type: "Escrow", comm_pct: "0.20", sound: "0", mus1: "0", mus2: "0",
  mus3: "0", other_costs: "0", warchest_pct: "0.20",
  batch_num: "", status: "Pending", dep_pct: "0", dep_is_pre: false, notes: "",
}

export default function ArtistDetailPage() {
  const router  = useRouter()
  const { id }  = useParams<{ id: string }>()
  const [tab, setTab]           = useState<Tab>("shows")
  const [artist, setArtist]     = useState<Artist | null>(null)
  const [shows, setShows]       = useState<Show[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [payouts, setPayouts]   = useState<Payout[]>([])
  const [loans, setLoans]       = useState<LoanRepayment[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  // Add/edit show form
  const [showForm, setShowForm]     = useState(false)
  const [editingShowId, setEditingShowId] = useState<string | null>(null)
  const [newShow, setNewShow]       = useState({ ...BLANK_SHOW })

  // Add-transfer form
  const [xferForm, setXferForm] = useState(false)
  const [newXfer, setNewXfer]   = useState({ transfer_date: "", description: "", transfer_type: "Batch Payout", amount: "" })

  // Add-payout form
  const [payForm, setPayForm]   = useState(false)
  const [newPay, setNewPay]     = useState({ payout_date: "", batch_ref: "", amount: "", notes: "" })

  // Loan entry form
  const [loanForm, setLoanForm] = useState(false)
  const [newLoan, setNewLoan]   = useState({ date: "", type: "Repayment", amount: "", description: "" })

  // Batch calculator
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set())
  const [batchSaving, setBatchSaving]     = useState(false)

  async function load() {
    const [{ data: a }, { data: s }, { data: t }, { data: p }, { data: l }] = await Promise.all([
      supabase.from("artists").select("*").eq("id", id).single(),
      supabase.from("shows").select("*").eq("artist_id", id).order("show_date"),
      supabase.from("transfers").select("*").eq("artist_id", id).order("transfer_date"),
      supabase.from("payouts").select("*").eq("artist_id", id).order("payout_date"),
      supabase.from("loan_repayments").select("*").eq("artist_id", id).order("repayment_date"),
    ])
    setArtist(a); setShows(s || []); setTransfers(t || []); setPayouts(p || []); setLoans(l || [])
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/login"); return }
      supabase.from("profiles").select("is_admin").eq("id", session.user.id).single()
        .then(({ data }) => { if (!data?.is_admin) router.replace("/artist") })
    })
    load()
  }, [id])

  function startEditShow(s: Show) {
    setEditingShowId(s.id)
    setNewShow({
      show_date: s.show_date, event: s.event, show_type: s.show_type,
      gross: String(s.gross), pay_type: s.pay_type,
      comm_pct: String(s.comm_pct), sound: String(s.sound),
      mus1: String(s.mus1), mus2: String(s.mus2), mus3: String(s.mus3),
      other_costs: String(s.other_costs), warchest_pct: String(s.warchest_pct),
      batch_num: s.batch_num || "", status: s.status || "Pending",
      dep_pct: String(s.dep_pct ?? 0), dep_is_pre: s.dep_is_pre || false,
      notes: s.notes || "",
    })
    setShowForm(true)
  }

  function cancelShowForm() {
    setShowForm(false)
    setEditingShowId(null)
    setNewShow({ ...BLANK_SHOW })
  }

  async function saveShow() {
    setSaving(true)
    const payload = {
      artist_id: id,
      show_date: newShow.show_date,
      event: newShow.event,
      show_type: newShow.show_type,
      gross: parseFloat(newShow.gross) || 0,
      pay_type: newShow.pay_type,
      comm_pct: parseFloat(newShow.comm_pct) || 0,
      sound: parseFloat(newShow.sound) || 0,
      mus1: parseFloat(newShow.mus1) || 0,
      mus2: parseFloat(newShow.mus2) || 0,
      mus3: parseFloat(newShow.mus3) || 0,
      other_costs: parseFloat(newShow.other_costs) || 0,
      warchest_pct: parseFloat(newShow.warchest_pct) || 0,
      dep_pct: newShow.dep_is_pre ? null : parseFloat(newShow.dep_pct) || 0,
      dep_is_pre: newShow.dep_is_pre,
      batch_num: newShow.batch_num || null,
      status: newShow.status,
      notes: newShow.notes,
    }
    if (editingShowId) {
      await supabase.from("shows").update(payload).eq("id", editingShowId)
    } else {
      await supabase.from("shows").insert(payload)
    }
    await load()
    cancelShowForm()
    setSaving(false)
  }

  async function deleteShow(showId: string, eventName: string) {
    if (!window.confirm(`Delete show "${eventName}"? This cannot be undone.`)) return
    await supabase.from("shows").delete().eq("id", showId)
    await load()
  }

  async function addTransfer() {
    setSaving(true)
    await supabase.from("transfers").insert({
      artist_id: id, ...newXfer, amount: parseFloat(newXfer.amount) || 0,
    })
    await load(); setXferForm(false); setSaving(false)
  }

  async function addPayout() {
    setSaving(true)
    await supabase.from("payouts").insert({
      artist_id: id, ...newPay, amount: parseFloat(newPay.amount) || 0,
      approved_by_artist: false,
    })
    await load(); setPayForm(false); setSaving(false)
  }

  async function addLoanEntry() {
    setSaving(true)
    const amt = parseFloat(newLoan.amount) || 0
    if (newLoan.type === "Repayment") {
      await supabase.from("loan_repayments").insert({
        artist_id: id,
        repayment_date: newLoan.date,
        amount: amt,
        description: newLoan.description,
      })
    } else {
      // Additional loan — increase opening balance
      const newOpening = (artist?.loan_opening || 0) + amt
      await supabase.from("artists").update({ loan_opening: newOpening }).eq("id", id)
    }
    await load()
    setLoanForm(false)
    setNewLoan({ date: "", type: "Repayment", amount: "", description: "" })
    setSaving(false)
  }

  async function updateOpeningBalance(val: string) {
    const num = parseFloat(val)
    if (isNaN(num)) return
    await supabase.from("artists").update({ opening_balance: num }).eq("id", id)
    setArtist(a => a ? { ...a, opening_balance: num } : a)
  }

  // Batch calculator helpers
  function toggleBatch(showId: string) {
    setBatchSelected(prev => {
      const next = new Set(prev)
      next.has(showId) ? next.delete(showId) : next.add(showId)
      return next
    })
  }

  function toggleAllBatch(filtered: Show[]) {
    if (filtered.every(s => batchSelected.has(s.id))) {
      setBatchSelected(new Set())
    } else {
      setBatchSelected(new Set(filtered.map(s => s.id)))
    }
  }

  async function markBatchAllPaid() {
    if (batchSelected.size === 0) return
    if (!window.confirm(`Mark ${batchSelected.size} show(s) as "All Paid"?`)) return
    setBatchSaving(true)
    await supabase.from("shows")
      .update({ status: "All Paid" })
      .in("id", Array.from(batchSelected))
    setBatchSelected(new Set())
    await load()
    setBatchSaving(false)
  }

  if (loading || !artist) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  )

  const eb   = escrowBalance(artist, shows, transfers)
  const paid = payouts.reduce((s, p) => s + p.amount, 0)
  const owed = nettOwed(shows)
  const due  = owed - paid
  const loanRepaid      = loans.reduce((s, l) => s + l.amount, 0)
  const loanOutstanding = artist.loan_opening - loanRepaid

  const TABS: { key: Tab; label: string }[] = [
    { key: "shows",  label: "Show Log" },
    { key: "escrow", label: "Escrow Tracker" },
    { key: "payouts",label: "Payouts" },
    ...(artist.loan_opening > 0 ? [{ key: "loan" as Tab, label: "Loan Account" }] : []),
    { key: "batch",  label: "Batch Calc" },
  ]

  // Batch: shows excluding Cancelled
  const batchShows = shows.filter(s => s.status !== "Cancelled")
  const batchSel   = batchShows.filter(s => batchSelected.has(s.id))
  const batchTotals = batchSel.reduce(
    (acc, s) => {
      const c = calcShow(s)
      return { gross: acc.gross + s.gross, comm: acc.comm + c.comm, band: acc.band + c.totalBand, wc: acc.wc + c.warchest, nett: acc.nett + c.nett }
    },
    { gross: 0, comm: 0, band: 0, wc: 0, nett: 0 }
  )

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title={artist.name} isAdmin />
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-4">

        {/* Back */}
        <button onClick={() => router.push("/admin")} className="text-bblue text-sm hover:text-navy">
          ← All Artists
        </button>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="stat-label">Escrow Balance</div>
            <div className={`stat-value text-xl ${eb.current < 0 ? "text-red-600" : ""}`}>{ZAR(eb.current)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pending (not recv'd)</div>
            <div className="stat-value text-xl">{ZAR(eb.pending)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Balance Due Artist</div>
            <div className={`stat-value text-xl ${due < 0 ? "text-red-600" : ""}`}>{ZAR(due)}</div>
          </div>
          {artist.loan_opening > 0 && (
            <div className="stat-card border-red-200">
              <div className="stat-label">Loan Outstanding</div>
              <div className="stat-value text-xl text-red-600">{ZAR(loanOutstanding)}</div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── SHOW LOG ─────────────────────────────────────────── */}
        {tab === "shows" && (
          <div className="card p-0">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-semibold text-navy">Show Log</h2>
              <button
                onClick={() => { if (showForm && !editingShowId) cancelShowForm(); else { cancelShowForm(); setShowForm(true) } }}
                className="btn-primary"
              >
                {showForm && !editingShowId ? "Cancel" : "+ Add Show"}
              </button>
            </div>

            {showForm && (
              <div className="p-6 border-b border-gray-100 bg-blue-50">
                <h3 className="font-medium text-navy mb-4">{editingShowId ? "Edit Show" : "New Show"}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><label>Date</label><input type="date" value={newShow.show_date} onChange={e => setNewShow(s => ({ ...s, show_date: e.target.value }))} /></div>
                  <div className="col-span-2"><label>Event</label><input value={newShow.event} onChange={e => setNewShow(s => ({ ...s, event: e.target.value }))} /></div>
                  <div><label>Type</label><select value={newShow.show_type} onChange={e => setNewShow(s => ({ ...s, show_type: e.target.value }))}>{SHOW_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label>Gross (R)</label><input type="number" value={newShow.gross} onChange={e => setNewShow(s => ({ ...s, gross: e.target.value }))} /></div>
                  <div><label>Pay Type</label><select value={newShow.pay_type} onChange={e => setNewShow(s => ({ ...s, pay_type: e.target.value }))}><option>Escrow</option><option>Direct</option></select></div>
                  <div><label>Comm %</label><input type="number" step="0.01" value={newShow.comm_pct} onChange={e => setNewShow(s => ({ ...s, comm_pct: e.target.value }))} /></div>
                  <div><label>Warchest %</label><input type="number" step="0.01" value={newShow.warchest_pct} onChange={e => setNewShow(s => ({ ...s, warchest_pct: e.target.value }))} /></div>
                  <div><label>Sound (R)</label><input type="number" value={newShow.sound} onChange={e => setNewShow(s => ({ ...s, sound: e.target.value }))} /></div>
                  <div><label>Mus 1 (R)</label><input type="number" value={newShow.mus1} onChange={e => setNewShow(s => ({ ...s, mus1: e.target.value }))} /></div>
                  <div><label>Mus 2 (R)</label><input type="number" value={newShow.mus2} onChange={e => setNewShow(s => ({ ...s, mus2: e.target.value }))} /></div>
                  <div><label>Mus 3 (R)</label><input type="number" value={newShow.mus3} onChange={e => setNewShow(s => ({ ...s, mus3: e.target.value }))} /></div>
                  <div><label>Other (R)</label><input type="number" value={newShow.other_costs} onChange={e => setNewShow(s => ({ ...s, other_costs: e.target.value }))} /></div>
                  <div><label>Status</label><select value={newShow.status} onChange={e => setNewShow(s => ({ ...s, status: e.target.value }))}>{STATUSES.map(st => <option key={st}>{st}</option>)}</select></div>
                  <div><label>Batch #</label><input value={newShow.batch_num} onChange={e => setNewShow(s => ({ ...s, batch_num: e.target.value }))} /></div>
                  <div><label>Dep % (0-100)</label><input type="number" min="0" max="100" value={newShow.dep_pct} onChange={e => setNewShow(s => ({ ...s, dep_pct: e.target.value }))} /></div>
                  <div className="flex items-end gap-2">
                    <input type="checkbox" id="pre" checked={newShow.dep_is_pre} onChange={e => setNewShow(s => ({ ...s, dep_is_pre: e.target.checked }))} className="w-auto" />
                    <label htmlFor="pre" className="mb-0">Pre-period</label>
                  </div>
                  <div className="col-span-2"><label>Notes</label><input value={newShow.notes} onChange={e => setNewShow(s => ({ ...s, notes: e.target.value }))} /></div>
                  <div className="col-span-4 flex gap-2">
                    <button onClick={saveShow} disabled={saving} className="btn-primary">{saving ? "Saving…" : editingShowId ? "Save Changes" : "Save Show"}</button>
                    <button onClick={cancelShowForm} className="btn-secondary">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div className="table-wrap rounded-none rounded-b-xl">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Event</th><th>Type</th>
                    <th className="text-right">Gross</th><th>Pay</th>
                    <th className="text-right">Comm</th>
                    <th className="text-right">Sound</th>
                    <th className="text-right">Mus 1</th>
                    <th className="text-right">Mus 2</th>
                    <th className="text-right">Mus 3</th>
                    <th className="text-right">Other</th>
                    <th className="text-right">WC</th><th className="text-right">Nett</th>
                    <th>Batch</th><th>Status</th><th className="text-center">Dep%</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shows.map(s => {
                    const c = calcShow(s)
                    return (
                      <tr key={s.id} className={editingShowId === s.id ? "bg-blue-50" : ""}>
                        <td className="text-gray-500 whitespace-nowrap">{fmtDate(s.show_date)}</td>
                        <td>{s.event}</td>
                        <td className="text-gray-500">{s.show_type}</td>
                        <td className="text-right font-mono">{ZAR(s.gross)}</td>
                        <td className={`text-xs font-medium ${s.pay_type === "Escrow" ? "text-bblue" : "text-gray-500"}`}>{s.pay_type}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(c.comm)}</td>
                        <td className="text-right font-mono text-gray-600">{s.sound ? ZAR(s.sound) : "—"}</td>
                        <td className="text-right font-mono text-gray-600">{s.mus1 ? ZAR(s.mus1) : "—"}</td>
                        <td className="text-right font-mono text-gray-600">{s.mus2 ? ZAR(s.mus2) : "—"}</td>
                        <td className="text-right font-mono text-gray-600">{s.mus3 ? ZAR(s.mus3) : "—"}</td>
                        <td className="text-right font-mono text-gray-600">{s.other_costs ? ZAR(s.other_costs) : "—"}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(c.warchest)}</td>
                        <td className="text-right font-mono font-semibold">{ZAR(c.nett)}</td>
                        <td className="text-gray-500">{s.batch_num}</td>
                        <td>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            s.status === "All Paid" ? "bg-green-100 text-green-700" :
                            s.status === "Fee Received" ? "bg-blue-100 text-blue-700" :
                            s.status === "Pending" ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-500"
                          }`}>{s.status || "—"}</span>
                        </td>
                        <td className="text-center">
                          {s.dep_is_pre ? <span className="text-xs text-purple-600">Pre</span>
                            : s.dep_pct !== null ? `${s.dep_pct}%`
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap">
                          <button
                            onClick={() => startEditShow(s)}
                            className="text-xs text-bblue hover:text-navy mr-2"
                          >Edit</button>
                          <button
                            onClick={() => deleteShow(s.id, s.event)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >Del</button>
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
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.mus1, 0))}</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.mus2, 0))}</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.mus3, 0))}</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + r.other_costs, 0))}</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + calcShow(r).warchest, 0))}</td>
                    <td className="text-right font-mono">{ZAR(shows.reduce((s, r) => s + calcShow(r).nett, 0))}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── ESCROW TRACKER ───────────────────────────────────── */}
        {tab === "escrow" && (
          <div className="space-y-4">
            <div className="card max-w-lg">
              <h2 className="font-semibold text-navy mb-4">Escrow Balance Tracker</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Opening Balance</span>
                  <input
                    type="number" className="w-36 text-right"
                    defaultValue={artist.opening_balance}
                    onBlur={e => updateOpeningBalance(e.target.value)}
                  />
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">+ Deposits received (Dep %)</span>
                  <span className="font-mono">{ZAR(eb.deposits)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">− Transfers out</span>
                  <span className="font-mono text-red-600">({ZAR(eb.totalOut)})</span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-navy font-bold text-base">
                  <span>= Current Escrow Balance</span>
                  <span className={`font-mono ${eb.current < 0 ? "text-red-600" : "text-green-700"}`}>{ZAR(eb.current)}</span>
                </div>
                <div className="flex justify-between py-2 text-gray-500">
                  <span>+ Pending (not yet received)</span>
                  <span className="font-mono">{ZAR(eb.pending)}</span>
                </div>
                <div className="flex justify-between py-2 border-t font-semibold">
                  <span>= Projected Balance</span>
                  <span className="font-mono">{ZAR(eb.projected)}</span>
                </div>
                <div className="flex justify-between py-2 text-gray-400 text-xs">
                  <span>ⓘ Warchest retained in balance</span>
                  <span className="font-mono">{ZAR(eb.warchestIn)}</span>
                </div>
              </div>
            </div>

            {/* Transfer log */}
            <div className="card p-0">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h2 className="font-semibold text-navy">Escrow Transfer Log</h2>
                <button onClick={() => setXferForm(!xferForm)} className="btn-primary">
                  {xferForm ? "Cancel" : "+ Log Transfer"}
                </button>
              </div>
              {xferForm && (
                <div className="p-4 border-b bg-blue-50 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><label>Date</label><input type="date" value={newXfer.transfer_date} onChange={e => setNewXfer(x => ({ ...x, transfer_date: e.target.value }))} /></div>
                  <div className="col-span-2"><label>Description</label><input value={newXfer.description} onChange={e => setNewXfer(x => ({ ...x, description: e.target.value }))} /></div>
                  <div><label>Type</label><select value={newXfer.transfer_type} onChange={e => setNewXfer(x => ({ ...x, transfer_type: e.target.value }))}>{XFER_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label>Amount (R)</label><input type="number" value={newXfer.amount} onChange={e => setNewXfer(x => ({ ...x, amount: e.target.value }))} /></div>
                  <div><button onClick={addTransfer} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save"}</button></div>
                </div>
              )}
              <div className="table-wrap rounded-none rounded-b-xl">
                <table>
                  <thead><tr><th>Date</th><th>Description</th><th>Type</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {transfers.map(t => (
                      <tr key={t.id}>
                        <td className="text-gray-500 whitespace-nowrap">{fmtDate(t.transfer_date)}</td>
                        <td>{t.description}</td>
                        <td className="text-gray-500">{t.transfer_type}</td>
                        <td className="text-right font-mono">{ZAR(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-lblue font-semibold">
                      <td colSpan={3}>TOTAL TRANSFERS OUT</td>
                      <td className="text-right font-mono">{ZAR(eb.totalOut)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── PAYOUTS ──────────────────────────────────────────── */}
        {tab === "payouts" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="stat-card"><div className="stat-label">Nett Owed</div><div className="stat-value text-xl">{ZAR(owed)}</div></div>
              <div className="stat-card"><div className="stat-label">Total Paid</div><div className="stat-value text-xl">{ZAR(paid)}</div></div>
              <div className="stat-card"><div className="stat-label">Balance Due</div><div className={`stat-value text-xl ${due < 0 ? "text-red-600" : ""}`}>{ZAR(due)}</div></div>
            </div>

            <div className="card p-0">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h2 className="font-semibold text-navy">Payout Log</h2>
                <button onClick={() => setPayForm(!payForm)} className="btn-primary">
                  {payForm ? "Cancel" : "+ Log Payout"}
                </button>
              </div>
              {payForm && (
                <div className="p-4 border-b bg-blue-50 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><label>Date</label><input type="date" value={newPay.payout_date} onChange={e => setNewPay(p => ({ ...p, payout_date: e.target.value }))} /></div>
                  <div><label>Batch Ref</label><input value={newPay.batch_ref} onChange={e => setNewPay(p => ({ ...p, batch_ref: e.target.value }))} /></div>
                  <div><label>Amount (R)</label><input type="number" value={newPay.amount} onChange={e => setNewPay(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div><label>Notes</label><input value={newPay.notes} onChange={e => setNewPay(p => ({ ...p, notes: e.target.value }))} /></div>
                  <div><button onClick={addPayout} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save"}</button></div>
                </div>
              )}
              <div className="table-wrap rounded-none rounded-b-xl">
                <table>
                  <thead><tr><th>Date</th><th>Batch</th><th className="text-right">Amount</th><th>Notes</th><th className="text-center">Artist Approved</th></tr></thead>
                  <tbody>
                    {payouts.map(p => (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap">{fmtDate(p.payout_date)}</td>
                        <td>{p.batch_ref}</td>
                        <td className="text-right font-mono">{ZAR(p.amount)}</td>
                        <td className="text-gray-500">{p.notes}</td>
                        <td className="text-center">
                          {p.approved_by_artist
                            ? <span className="text-green-600 text-xs font-medium">✓ Approved {fmtDate(p.approved_at?.slice(0,10))}</span>
                            : <span className="text-yellow-600 text-xs">Pending approval</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-lblue font-semibold">
                      <td colSpan={2}>TOTAL PAID</td>
                      <td className="text-right font-mono">{ZAR(paid)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── LOAN ACCOUNT ─────────────────────────────────────── */}
        {tab === "loan" && artist.loan_opening > 0 && (
          <div className="card max-w-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="font-semibold text-navy">Loan Account</h2>
                <p className="text-sm text-gray-500 mt-1">Tracking loan owed to BNAS</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-gray-500">Outstanding</div>
                  <div className="text-2xl font-bold text-red-600">{ZAR(loanOutstanding)}</div>
                </div>
                <button onClick={() => setLoanForm(!loanForm)} className="btn-primary">
                  {loanForm ? "Cancel" : "+ Log Entry"}
                </button>
              </div>
            </div>

            {loanForm && (
              <div className="bg-blue-50 rounded-lg p-4 grid grid-cols-2 gap-3">
                <div>
                  <label>Date</label>
                  <input type="date" value={newLoan.date} onChange={e => setNewLoan(l => ({ ...l, date: e.target.value }))} />
                </div>
                <div>
                  <label>Type</label>
                  <select value={newLoan.type} onChange={e => setNewLoan(l => ({ ...l, type: e.target.value }))}>
                    <option value="Repayment">Repayment (reduces balance)</option>
                    <option value="Additional Loan">Additional Loan (increases balance)</option>
                  </select>
                </div>
                <div>
                  <label>Amount (R)</label>
                  <input type="number" value={newLoan.amount} onChange={e => setNewLoan(l => ({ ...l, amount: e.target.value }))} />
                </div>
                <div>
                  <label>Description</label>
                  <input value={newLoan.description} onChange={e => setNewLoan(l => ({ ...l, description: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <button onClick={addLoanEntry} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save Entry"}</button>
                </div>
              </div>
            )}

            <div className="text-sm space-y-1">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Opening Loan Balance</span>
                <span className="font-mono">{ZAR(artist.loan_opening)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Total Repaid</span>
                <span className="font-mono text-green-700">{ZAR(loanRepaid)}</span>
              </div>
              <div className="flex justify-between py-2 font-bold">
                <span>Outstanding Balance</span>
                <span className="font-mono text-red-600">{ZAR(loanOutstanding)}</span>
              </div>
            </div>
            {loans.length > 0 && (
              <table className="w-full text-sm">
                <thead><tr><th className="text-left py-1">Date</th><th className="text-left py-1">Description</th><th className="text-right py-1">Amount</th></tr></thead>
                <tbody>
                  {loans.map(l => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 text-gray-500">{fmtDate(l.repayment_date)}</td>
                      <td className="py-1">{l.description}</td>
                      <td className="py-1 text-right font-mono text-green-700">{ZAR(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── BATCH CALCULATOR ─────────────────────────────────── */}
        {tab === "batch" && (
          <div className="space-y-4">
            <div className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="font-semibold text-navy">Batch Calculator</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Select shows to calculate payout totals</p>
                </div>
                {batchSelected.size > 0 && (
                  <button
                    onClick={markBatchAllPaid}
                    disabled={batchSaving}
                    className="btn-primary"
                  >
                    {batchSaving ? "Saving…" : `Mark ${batchSelected.size} as "All Paid"`}
                  </button>
                )}
              </div>

              {/* Running totals */}
              {batchSelected.size > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 p-4 bg-navy/5 rounded-lg">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Gross</div>
                    <div className="font-mono font-semibold text-sm">{ZAR(batchTotals.gross)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Commission</div>
                    <div className="font-mono font-semibold text-sm text-red-600">({ZAR(batchTotals.comm)})</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Band Costs</div>
                    <div className="font-mono font-semibold text-sm text-red-600">({ZAR(batchTotals.band)})</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 mb-1">Warchest</div>
                    <div className="font-mono font-semibold text-sm text-red-600">({ZAR(batchTotals.wc)})</div>
                  </div>
                  <div className="text-center border-l pl-3">
                    <div className="text-xs text-gray-500 mb-1">Nett to Artist</div>
                    <div className="font-mono font-bold text-base text-green-700">{ZAR(batchTotals.nett)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="card p-0">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          className="w-auto"
                          checked={batchShows.length > 0 && batchShows.every(s => batchSelected.has(s.id))}
                          onChange={() => toggleAllBatch(batchShows)}
                        />
                      </th>
                      <th>Date</th><th>Event</th><th>Type</th>
                      <th className="text-right">Gross</th>
                      <th className="text-right">Comm</th>
                      <th className="text-right">Band</th>
                      <th className="text-right">WC</th>
                      <th className="text-right">Nett</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchShows.map(s => {
                      const c = calcShow(s)
                      const selected = batchSelected.has(s.id)
                      return (
                        <tr key={s.id} className={selected ? "bg-blue-50" : ""}>
                          <td>
                            <input
                              type="checkbox"
                              className="w-auto"
                              checked={selected}
                              onChange={() => toggleBatch(s.id)}
                            />
                          </td>
                          <td className="text-gray-500 whitespace-nowrap">{fmtDate(s.show_date)}</td>
                          <td className="font-medium">{s.event}</td>
                          <td className="text-gray-500">{s.show_type}</td>
                          <td className="text-right font-mono">{ZAR(s.gross)}</td>
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
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
