"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Navbar from "@/components/Navbar"
import type { Artist, Show, Transfer, Payout, LoanRepayment, Batch } from "@/lib/types"
import { ZAR, calcShow, escrowBalance, nettOwed, warchestPot } from "@/lib/calculations"

type Tab = "shows" | "escrow" | "payouts" | "loan" | "batch"

const SHOW_TYPES  = ["Rest/Club","Festival","Corporate","Private","Wed/Rec","Feature","Headline","INT Support","School","Other"]
const STATUSES    = ["All Paid","Fee Received","Pending","Cancelled"]
const XFER_TYPES  = ["Batch Payout","Warchest Dist.","Loan/Other","Refund","Other"]
const AGENTS      = ["","Misha","Gareth","Jako","Que","007"]

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—"
  const d = new Date(s.includes("T") ? s : s + "T00:00:00")
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

const BLANK_SHOW = {
  show_date: "", event: "", show_type: "Rest/Club", gross: "",
  pay_type: "Escrow", comm_pct: "0.20", sound: "0", mus1: "0", mus2: "0",
  mus3: "0", mus4: "0", other_costs: "0", warchest_pct: "0.20",
  batch_num: "", status: "Pending", dep_pct: "0", dep_is_pre: false, notes: "",
  responsible_agent: "", secondary_agent: "", invoiced_client: "",
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
  const [newLoan, setNewLoan]   = useState({ date: "", type: "Repayment", amount: "", description: "", notes: "" })

  // Batch calculator
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set())
  const [batchSaving, setBatchSaving]     = useState(false)
  const [batchNumInput, setBatchNumInput] = useState("")
  const [batchPayoutPct, setBatchPayoutPct]   = useState("100")
  const [batchPayoutMode, setBatchPayoutMode] = useState<"pct" | "rand">("pct")
  const [batchPayoutRand, setBatchPayoutRand] = useState("")
  const [batches, setBatches]             = useState<Batch[]>([])

  // Batch edit/delete
  const [editingBatchHistId, setEditingBatchHistId] = useState<string | null>(null)
  const [batchHistEdits, setBatchHistEdits]         = useState<{ batch_num: string; status: string }>({ batch_num: "", status: "" })

  // Payout edit
  const [editingPayoutId, setEditingPayoutId] = useState<string | null>(null)
  const [payoutEdits, setPayoutEdits]         = useState<{ payout_date: string; batch_ref: string; amount: string; notes: string }>({ payout_date: "", batch_ref: "", amount: "", notes: "" })

  // Transfer edit
  const [editingXferId, setEditingXferId] = useState<string | null>(null)
  const [xferEdits, setXferEdits]         = useState<{ transfer_date: string; description: string; transfer_type: string; amount: string }>({ transfer_date: "", description: "", transfer_type: "", amount: "" })

  // Loan edit
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null)
  const [loanEdits, setLoanEdits]         = useState<{ repayment_date: string; description: string; amount: string; notes: string }>({ repayment_date: "", description: "", amount: "", notes: "" })

  // Show log filters
  const [filterEvent, setFilterEvent]   = useState("")
  const [filterAgent, setFilterAgent]   = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterFrom, setFilterFrom]     = useState("")
  const [batchSearch, setBatchSearch]   = useState("")
  const [batchFrom, setBatchFrom]       = useState("")
  const [batchTo, setBatchTo]           = useState("")
  const [batchPayType, setBatchPayType] = useState("")
  const [filterTo, setFilterTo]         = useState("")

  async function load() {
    const [{ data: a }, { data: s }, { data: t }, { data: p }, { data: l }, { data: b }] = await Promise.all([
      supabase.from("artists").select("*").eq("id", id).single(),
      supabase.from("shows").select("*").eq("artist_id", id).order("show_date"),
      supabase.from("transfers").select("*").eq("artist_id", id).order("transfer_date"),
      supabase.from("payouts").select("*").eq("artist_id", id).order("payout_date"),
      supabase.from("loan_repayments").select("*").eq("artist_id", id).order("repayment_date"),
      supabase.from("batches").select("*").eq("artist_id", id).order("created_at", { ascending: false }),
    ])
    setArtist(a); setShows(s || []); setTransfers(t || []); setPayouts(p || []); setLoans(l || []); setBatches(b || [])
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
      mus4: String(s.mus4 || 0), other_costs: String(s.other_costs), warchest_pct: String(s.warchest_pct),
      batch_num: s.batch_num || "", status: s.status || "Pending",
      dep_pct: String(s.dep_pct ?? 0), dep_is_pre: s.dep_is_pre || false,
      notes: s.notes || "",
      responsible_agent: s.responsible_agent || "", secondary_agent: s.secondary_agent || "", invoiced_client: s.invoiced_client || "",
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
      mus4: parseFloat(newShow.mus4) || 0,
      other_costs: parseFloat(newShow.other_costs) || 0,
      warchest_pct: parseFloat(newShow.warchest_pct) || 0,
      dep_pct: newShow.dep_is_pre ? null : parseFloat(newShow.dep_pct) || 0,
      dep_is_pre: newShow.dep_is_pre,
      batch_num: newShow.batch_num || null,
      status: newShow.status,
      notes: newShow.notes,
      invoiced_client: newShow.invoiced_client || null,
      responsible_agent: newShow.responsible_agent || null,
      secondary_agent: newShow.secondary_agent || null,
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
        artist_id: id, repayment_date: newLoan.date, amount: amt,
        description: newLoan.description, notes: newLoan.notes || null, type: "Repayment",
      })
    } else {
      // Additional loan — increase opening balance AND log it
      const newOpening = (artist?.loan_opening || 0) + amt
      await supabase.from("artists").update({ loan_opening: newOpening }).eq("id", id)
      await supabase.from("loan_repayments").insert({
        artist_id: id, repayment_date: newLoan.date, amount: amt,
        description: newLoan.description, notes: newLoan.notes || null, type: "Additional Loan",
      })
    }
    await load()
    setLoanForm(false)
    setNewLoan({ date: "", type: "Repayment", amount: "", description: "", notes: "" })
    setSaving(false)
  }

  // Payout edit/delete
  function startEditPayout(p: Payout) {
    setEditingPayoutId(p.id)
    setPayoutEdits({ payout_date: p.payout_date, batch_ref: p.batch_ref || "", amount: String(p.amount), notes: p.notes || "" })
  }
  async function savePayoutEdit() {
    if (!editingPayoutId) return
    setSaving(true)
    await supabase.from("payouts").update({ payout_date: payoutEdits.payout_date, batch_ref: payoutEdits.batch_ref, amount: parseFloat(payoutEdits.amount) || 0, notes: payoutEdits.notes }).eq("id", editingPayoutId)
    setEditingPayoutId(null)
    await load(); setSaving(false)
  }
  async function deletePayout(payId: string) {
    if (!window.confirm("Delete this payout record?")) return
    await supabase.from("payouts").delete().eq("id", payId)
    await load()
  }

  // Transfer edit/delete
  function startEditXfer(t: Transfer) {
    setEditingXferId(t.id)
    setXferEdits({ transfer_date: t.transfer_date, description: t.description, transfer_type: t.transfer_type, amount: String(t.amount) })
  }
  async function saveXferEdit() {
    if (!editingXferId) return
    setSaving(true)
    await supabase.from("transfers").update({ transfer_date: xferEdits.transfer_date, description: xferEdits.description, transfer_type: xferEdits.transfer_type, amount: parseFloat(xferEdits.amount) || 0 }).eq("id", editingXferId)
    setEditingXferId(null)
    await load(); setSaving(false)
  }
  async function deleteTransfer(xferId: string) {
    if (!window.confirm("Delete this transfer record?")) return
    await supabase.from("transfers").delete().eq("id", xferId)
    await load()
  }

  // Loan edit/delete
  function startEditLoan(l: LoanRepayment) {
    setEditingLoanId(l.id)
    setLoanEdits({ repayment_date: l.repayment_date, description: l.description, amount: String(l.amount), notes: l.notes || "" })
  }
  async function saveLoanEdit() {
    if (!editingLoanId) return
    setSaving(true)
    await supabase.from("loan_repayments").update({ repayment_date: loanEdits.repayment_date, description: loanEdits.description, amount: parseFloat(loanEdits.amount) || 0, notes: loanEdits.notes }).eq("id", editingLoanId)
    setEditingLoanId(null)
    await load(); setSaving(false)
  }
  async function deleteLoan(loanId: string) {
    if (!window.confirm("Delete this loan entry?")) return
    await supabase.from("loan_repayments").delete().eq("id", loanId)
    await load()
  }

  // Batch edit/delete
  function startEditBatchHist(b: Batch) {
    setEditingBatchHistId(b.id)
    setBatchHistEdits({ batch_num: b.batch_num, status: b.status })
  }
  async function saveBatchHistEdit() {
    if (!editingBatchHistId) return
    setSaving(true)
    const batch = batches.find(b => b.id === editingBatchHistId)
    if (batch && batchHistEdits.batch_num !== batch.batch_num) {
      // rename batch_num on shows too
      await supabase.from("shows").update({ batch_num: batchHistEdits.batch_num }).eq("artist_id", id).eq("batch_num", batch.batch_num)
    }
    await supabase.from("batches").update({ batch_num: batchHistEdits.batch_num, status: batchHistEdits.status }).eq("id", editingBatchHistId)
    setEditingBatchHistId(null)
    await load(); setSaving(false)
  }
  async function deleteBatch(batchId: string) {
    const batch = batches.find(b => b.id === batchId)
    if (!batch) return
    const isPaid = batch.status === "Paid" || batch.status === "Partially Paid"
    const msg = isPaid
      ? `Delete batch ${batch.batch_num}? This will also delete linked payout records and revert show statuses.`
      : `Delete batch ${batch.batch_num}? Show batch assignments will be cleared.`
    if (!window.confirm(msg)) return
    if (isPaid) {
      await supabase.from("payouts").delete().eq("artist_id", id).eq("batch_ref", batch.batch_num)
      await supabase.from("shows").update({ status: "Fee Received" }).eq("artist_id", id).eq("batch_num", batch.batch_num)
    }
    // Clear batch_num on shows
    await supabase.from("shows").update({ batch_num: null }).eq("artist_id", id).eq("batch_num", batch.batch_num)
    await supabase.from("batches").delete().eq("id", batchId)
    await load()
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

  async function assignBatch() {
    if (batchSelected.size === 0 || !batchNumInput.trim()) return
    if (!window.confirm(`Assign batch "${batchNumInput}" to ${batchSelected.size} show(s) and send for artist sign-off?`)) return
    setBatchSaving(true)
    const selectedShows = batchShows.filter(s => batchSelected.has(s.id))
    const totals = selectedShows.reduce((acc, sh) => {
      const c = calcShow(sh)
      return {
        gross:    acc.gross    + sh.gross,
        comm:     acc.comm     + c.comm,
        sound:    acc.sound    + sh.sound,
        mus1:     acc.mus1     + sh.mus1,
        mus2:     acc.mus2     + sh.mus2,
        mus3:     acc.mus3     + sh.mus3,
        mus4:     acc.mus4     + (sh.mus4 || 0),
        other:    acc.other    + sh.other_costs,
        warchest: acc.warchest + c.warchest,
        nett:     acc.nett     + c.nett,
      }
    }, { gross: 0, comm: 0, sound: 0, mus1: 0, mus2: 0, mus3: 0, mus4: 0, other: 0, warchest: 0, nett: 0 })

    await supabase.from("shows")
      .update({ batch_num: batchNumInput.trim() })
      .in("id", Array.from(batchSelected))
    // Compute effective payout pct
    let effectivePct = 100
    if (batchPayoutMode === "pct") {
      effectivePct = parseFloat(batchPayoutPct) || 100
    } else {
      const rVal = parseFloat(batchPayoutRand) || 0
      effectivePct = totals.nett > 0 ? Math.round((rVal / totals.nett) * 10000) / 100 : 100
    }
    effectivePct = Math.min(100, Math.max(1, effectivePct))

    await supabase.from("batches").insert({
      artist_id:     id,
      batch_num:     batchNumInput.trim(),
      total_gross:   totals.gross,
      total_comm:    totals.comm,
      total_sound:   totals.sound,
      total_mus1:    totals.mus1,
      total_mus2:    totals.mus2,
      total_mus3:    totals.mus3,
      total_mus4:    totals.mus4,
      total_other:   totals.other,
      total_warchest: totals.warchest,
      total_nett:    totals.nett,
      mus1_name:     artist?.mus1_name || null,
      mus2_name:     artist?.mus2_name || null,
      mus3_name:     artist?.mus3_name || null,
      mus4_name:     artist?.mus4_name || null,
      payout_pct:    effectivePct,
      status:        "Pending Sign-Off",
    })
    setBatchSelected(new Set())
    setBatchNumInput("")
    setBatchPayoutPct("100")
    setBatchPayoutRand("")
    setBatchPayoutMode("pct")
    await load()
    setBatchSaving(false)
  }

  async function approveOnBehalf(batchId: string) {
    if (!window.confirm("Approve this batch on behalf of the artist?")) return
    await supabase.from("batches").update({
      status: "Signed Off",
      signed_off_at: new Date().toISOString(),
      approved_by: "admin",
    }).eq("id", batchId)
    await load()
  }

  async function markBatchPaid(batchId: string) {
    const batch = batches.find(b => b.id === batchId)
    if (!batch) return
    const payoutPct = batch.payout_pct || 100
    const isPartial = payoutPct < 100
    if (!window.confirm(`Mark this batch as ${isPartial ? `Partially Paid (${payoutPct}%)` : "Paid"}? This will log the payout and create the escrow transfer.`)) return
    const payoutAmt = Math.round(batch.total_nett * payoutPct / 100 * 100) / 100
    const today = new Date().toISOString().slice(0, 10)
    const note  = `${batch.batch_num}${isPartial ? ` (${payoutPct}%)` : ""}`
    const newStatus = isPartial ? "Partially Paid" : "Paid"

    await supabase.from("batches").update({ status: newStatus, paid_at: new Date().toISOString() }).eq("id", batchId)
    // Only set shows "All Paid" when fully paid
    if (!isPartial) {
      await supabase.from("shows").update({ status: "All Paid" }).eq("artist_id", id).eq("batch_num", batch.batch_num)
    }
    await supabase.from("payouts").insert({
      artist_id: id, payout_date: today, batch_ref: batch.batch_num,
      amount: payoutAmt, notes: `Batch ${note} advance`,
      approved_by_artist: true, approved_at: batch.signed_off_at || new Date().toISOString(),
    })
    await supabase.from("transfers").insert({
      artist_id: id, transfer_date: today,
      description: `Batch ${note} artist payout (excl. warchest)`,
      transfer_type: "Batch Payout", amount: payoutAmt,
    })
    await load()
  }

  async function payBatchBalance(batchId: string) {
    const batch = batches.find(b => b.id === batchId)
    if (!batch) return
    // Calculate already paid for this batch
    const alreadyPaid = payouts.filter(p => p.batch_ref === batch.batch_num).reduce((s, p) => s + p.amount, 0)
    const remaining = Math.round((batch.total_nett - alreadyPaid) * 100) / 100
    if (remaining <= 0) { alert("Nothing remaining to pay on this batch."); return }
    if (!window.confirm(`Pay remaining balance of ${ZAR(remaining)} for ${batch.batch_num}?`)) return
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from("batches").update({ status: "Paid" }).eq("id", batchId)
    await supabase.from("shows").update({ status: "All Paid" }).eq("artist_id", id).eq("batch_num", batch.batch_num)
    await supabase.from("payouts").insert({
      artist_id: id, payout_date: today, batch_ref: batch.batch_num,
      amount: remaining, notes: `Batch ${batch.batch_num} balance paid`,
      approved_by_artist: true, approved_at: new Date().toISOString(),
    })
    await supabase.from("transfers").insert({
      artist_id: id, transfer_date: today,
      description: `Batch ${batch.batch_num} balance payout (excl. warchest)`,
      transfer_type: "Batch Payout", amount: remaining,
    })
    await load()
  }

  if (loading || !artist) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  )

  const eb   = escrowBalance(artist, shows, transfers)
  const paid = payouts.reduce((s, p) => s + p.amount, 0)
  const owed = nettOwed(shows)
  const due  = owed - paid
  const wcPot = warchestPot(shows)

  // Filtered shows for show log
  const filteredShows = shows.filter(s => {
    if (filterEvent  && !s.event.toLowerCase().includes(filterEvent.toLowerCase())) return false
    if (filterAgent  && s.responsible_agent !== filterAgent && s.secondary_agent !== filterAgent) return false
    if (filterStatus && s.status !== filterStatus) return false
    if (filterFrom   && s.show_date < filterFrom) return false
    if (filterTo     && s.show_date > filterTo) return false
    return true
  })
  const loanRepaid      = loans.filter(l => !l.type || l.type === "Repayment").reduce((s, l) => s + l.amount, 0)
  const loanOutstanding = artist.loan_opening - loanRepaid

  const TABS: { key: Tab; label: string }[] = [
    { key: "shows",  label: "Show Log" },
    { key: "escrow", label: "Escrow Tracker" },
    { key: "payouts",label: "Payouts" },
    ...(artist.loan_opening > 0 ? [{ key: "loan" as Tab, label: "Loan Account" }] : []),
    { key: "batch",  label: "Batch Calc" },
  ]

  // Batch: shows excluding Cancelled and already-batched
  const batchShows = shows.filter(s => s.status !== "Cancelled" && !s.batch_num)
  const filteredBatchShows = batchShows.filter(s => {
    if (batchSearch && !s.event?.toLowerCase().includes(batchSearch.toLowerCase())) return false
    if (batchFrom && s.show_date < batchFrom) return false
    if (batchTo   && s.show_date > batchTo)   return false
    if (batchPayType && s.pay_type !== batchPayType) return false
    return true
  })
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

            {/* Filter bar */}
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-2 items-end">
              <div><label className="text-xs text-gray-500 block mb-1">Search event</label><input className="w-36 text-sm py-1" placeholder="Event name…" value={filterEvent} onChange={e => setFilterEvent(e.target.value)} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">Agent</label><select className="text-sm py-1" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>{["", ...AGENTS.filter(a => a)].map(a => <option key={a} value={a}>{a || "All agents"}</option>)}</select></div>
              <div><label className="text-xs text-gray-500 block mb-1">Status</label><select className="text-sm py-1" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">All</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label className="text-xs text-gray-500 block mb-1">From</label><input type="date" className="text-sm py-1" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
              <div><label className="text-xs text-gray-500 block mb-1">To</label><input type="date" className="text-sm py-1" value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
              {(filterEvent || filterAgent || filterStatus || filterFrom || filterTo) && (
                <button onClick={() => { setFilterEvent(""); setFilterAgent(""); setFilterStatus(""); setFilterFrom(""); setFilterTo("") }} className="text-xs text-bblue hover:underline self-end pb-1">Clear</button>
              )}
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
                  {artist.mus1_name && <div><label>{artist.mus1_name} (R)</label><input type="number" value={newShow.mus1} onChange={e => setNewShow(s => ({ ...s, mus1: e.target.value }))} /></div>}
                  {artist.mus2_name && <div><label>{artist.mus2_name} (R)</label><input type="number" value={newShow.mus2} onChange={e => setNewShow(s => ({ ...s, mus2: e.target.value }))} /></div>}
                  {artist.mus3_name && <div><label>{artist.mus3_name} (R)</label><input type="number" value={newShow.mus3} onChange={e => setNewShow(s => ({ ...s, mus3: e.target.value }))} /></div>}
                  {artist.mus4_name && <div><label>{artist.mus4_name} (R)</label><input type="number" value={newShow.mus4} onChange={e => setNewShow(s => ({ ...s, mus4: e.target.value }))} /></div>}
                  <div><label>Other (R)</label><input type="number" value={newShow.other_costs} onChange={e => setNewShow(s => ({ ...s, other_costs: e.target.value }))} /></div>
                  <div><label>Status</label><select value={newShow.status} onChange={e => setNewShow(s => ({ ...s, status: e.target.value }))}>{STATUSES.map(st => <option key={st}>{st}</option>)}</select></div>
                  <div><label>Batch #</label><input value={newShow.batch_num} onChange={e => setNewShow(s => ({ ...s, batch_num: e.target.value }))} /></div>
                  <div><label>Dep % (0-100)</label><input type="number" min="0" max="100" value={newShow.dep_pct} onChange={e => setNewShow(s => ({ ...s, dep_pct: e.target.value }))} /></div>
                  <div className="flex items-end gap-2">
                    <input type="checkbox" id="pre" checked={newShow.dep_is_pre} onChange={e => setNewShow(s => ({ ...s, dep_is_pre: e.target.checked }))} className="w-auto" />
                    <label htmlFor="pre" className="mb-0">Pre-period</label>
                  </div>
                  <div><label>Responsible Agent</label><select value={newShow.responsible_agent} onChange={e => setNewShow(s => ({ ...s, responsible_agent: e.target.value }))}>{AGENTS.map(a => <option key={a} value={a}>{a || "—"}</option>)}</select></div>
                  <div><label>Secondary Agent</label><select value={newShow.secondary_agent} onChange={e => setNewShow(s => ({ ...s, secondary_agent: e.target.value }))}>{AGENTS.map(a => <option key={a} value={a}>{a || "—"}</option>)}</select></div>
                  <div><label>Invoiced Client</label><input value={newShow.invoiced_client} onChange={e => setNewShow(s => ({ ...s, invoiced_client: e.target.value }))} placeholder="Who is paying?" /></div>
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
                    {artist.mus1_name && <th className="text-right">{artist.mus1_name}</th>}
                    {artist.mus2_name && <th className="text-right">{artist.mus2_name}</th>}
                    {artist.mus3_name && <th className="text-right">{artist.mus3_name}</th>}
                    {artist.mus4_name && <th className="text-right">{artist.mus4_name}</th>}
                    <th className="text-right">Other</th>
                    <th className="text-right">WC</th><th className="text-right">Nett</th>
                    <th>Agent</th><th>Batch</th><th>Status</th><th className="text-center">Dep%</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShows.map(s => {
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
                        {artist.mus1_name && <td className="text-right font-mono text-gray-600">{s.mus1 ? ZAR(s.mus1) : "—"}</td>}
                        {artist.mus2_name && <td className="text-right font-mono text-gray-600">{s.mus2 ? ZAR(s.mus2) : "—"}</td>}
                        {artist.mus3_name && <td className="text-right font-mono text-gray-600">{s.mus3 ? ZAR(s.mus3) : "—"}</td>}
                        {artist.mus4_name && <td className="text-right font-mono text-gray-600">{s.mus4 ? ZAR(s.mus4) : "—"}</td>}
                        <td className="text-right font-mono text-gray-600">{s.other_costs ? ZAR(s.other_costs) : "—"}</td>
                        <td className="text-right font-mono text-gray-600">{ZAR(c.warchest)}</td>
                        <td className="text-right font-mono font-semibold">{ZAR(c.nett)}</td>
                        <td className="text-gray-500 text-xs">{s.responsible_agent}{s.secondary_agent ? ` / ${s.secondary_agent}` : ""}</td>
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
                    <td colSpan={3}>TOTALS ({filteredShows.length})</td>
                    <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + r.gross, 0))}</td>
                    <td></td>
                    <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + calcShow(r).comm, 0))}</td>
                    <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + r.sound, 0))}</td>
                    {artist.mus1_name && <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + r.mus1, 0))}</td>}
                    {artist.mus2_name && <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + r.mus2, 0))}</td>}
                    {artist.mus3_name && <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + r.mus3, 0))}</td>}
                    {artist.mus4_name && <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + (r.mus4||0), 0))}</td>}
                    <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + r.other_costs, 0))}</td>
                    <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + calcShow(r).warchest, 0))}</td>
                    <td className="text-right font-mono">{ZAR(filteredShows.reduce((s, r) => s + calcShow(r).nett, 0))}</td>
                    <td colSpan={5}></td>
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
                  <span>ⓘ Warchest retained in balance (partial deps)</span>
                  <span className="font-mono">{ZAR(eb.warchestIn)}</span>
                </div>
                {wcPot > 0 && (
                  <div className="flex justify-between py-2 border-t text-sm font-medium text-purple-700">
                    <span>Warchest Pot (All Paid shows)</span>
                    <span className="font-mono">{ZAR(wcPot)}</span>
                  </div>
                )}
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
                  <thead><tr><th>Date</th><th>Description</th><th>Type</th><th className="text-right">Amount</th><th></th></tr></thead>
                  <tbody>
                    {transfers.map(t => editingXferId === t.id ? (
                      <tr key={t.id} className="bg-blue-50">
                        <td><input type="date" className="w-32" value={xferEdits.transfer_date} onChange={e => setXferEdits(x => ({ ...x, transfer_date: e.target.value }))} /></td>
                        <td><input value={xferEdits.description} onChange={e => setXferEdits(x => ({ ...x, description: e.target.value }))} /></td>
                        <td><select value={xferEdits.transfer_type} onChange={e => setXferEdits(x => ({ ...x, transfer_type: e.target.value }))}>{XFER_TYPES.map(ty => <option key={ty}>{ty}</option>)}</select></td>
                        <td><input type="number" className="w-28 text-right" value={xferEdits.amount} onChange={e => setXferEdits(x => ({ ...x, amount: e.target.value }))} /></td>
                        <td className="whitespace-nowrap">
                          <button onClick={saveXferEdit} disabled={saving} className="text-xs text-green-700 font-medium mr-2">Save</button>
                          <button onClick={() => setEditingXferId(null)} className="text-xs text-gray-500">Cancel</button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={t.id}>
                        <td className="text-gray-500 whitespace-nowrap">{fmtDate(t.transfer_date)}</td>
                        <td>{t.description}</td>
                        <td className="text-gray-500">{t.transfer_type}</td>
                        <td className="text-right font-mono">{ZAR(t.amount)}</td>
                        <td className="whitespace-nowrap">
                          <button onClick={() => startEditXfer(t)} className="text-xs text-bblue hover:text-navy mr-2">Edit</button>
                          <button onClick={() => deleteTransfer(t.id)} className="text-xs text-red-500 hover:text-red-700">Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-lblue font-semibold">
                      <td colSpan={3}>TOTAL TRANSFERS OUT</td>
                      <td className="text-right font-mono">{ZAR(eb.totalOut)}</td>
                      <td></td>
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

            {/* Approved batches ready to pay */}
            {batches.filter(b => b.status === "Signed Off").length > 0 && (
              <div className="card p-0 border-green-200">
                <div className="px-6 py-3 bg-green-50 border-b border-green-200 rounded-t-xl">
                  <h3 className="font-semibold text-green-800">Ready to Pay</h3>
                </div>
                {batches.filter(b => b.status === "Signed Off").map(b => (
                  <div key={b.id} className="px-6 py-4 border-b last:border-0">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="font-semibold text-navy">{b.batch_num}</span>
                        <span className="ml-2 text-xs text-gray-500">
                          {b.approved_by === "admin" ? "Admin approved" : "Artist signed off"} · {fmtDate(b.signed_off_at)}
                        </span>
                      </div>
                      <button onClick={() => markBatchPaid(b.id)} className="btn-success text-xs py-1">
                        Mark All Paid
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-sm bg-gray-50 rounded-lg p-3">
                      <div><div className="text-xs text-gray-500">Gross</div><div className="font-mono">{ZAR(b.total_gross)}</div></div>
                      <div><div className="text-xs text-gray-500">Commission</div><div className="font-mono text-red-600">({ZAR(b.total_comm)})</div></div>
                      {b.total_sound > 0 && <div><div className="text-xs text-gray-500">Sound</div><div className="font-mono text-red-600">({ZAR(b.total_sound)})</div></div>}
                      {(b.mus1_name && b.total_mus1 > 0) && <div><div className="text-xs text-gray-500">{b.mus1_name}</div><div className="font-mono text-red-600">({ZAR(b.total_mus1)})</div></div>}
                      {(b.mus2_name && b.total_mus2 > 0) && <div><div className="text-xs text-gray-500">{b.mus2_name}</div><div className="font-mono text-red-600">({ZAR(b.total_mus2)})</div></div>}
                      {(b.mus3_name && b.total_mus3 > 0) && <div><div className="text-xs text-gray-500">{b.mus3_name}</div><div className="font-mono text-red-600">({ZAR(b.total_mus3)})</div></div>}
                      {(b.mus4_name && b.total_mus4 > 0) && <div><div className="text-xs text-gray-500">{b.mus4_name}</div><div className="font-mono text-red-600">({ZAR(b.total_mus4)})</div></div>}
                      {b.total_other > 0 && <div><div className="text-xs text-gray-500">Other</div><div className="font-mono text-red-600">({ZAR(b.total_other)})</div></div>}
                      {b.total_warchest > 0 && <div><div className="text-xs text-gray-500">Warchest</div><div className="font-mono text-red-600">({ZAR(b.total_warchest)})</div></div>}
                      <div className="border-l pl-3">
                        <div className="text-xs text-gray-500">Nett to Artist {(b.payout_pct || 100) < 100 ? `(${b.payout_pct}%)` : ""}</div>
                        <div className="font-mono font-bold text-green-700">{ZAR(b.total_nett * (b.payout_pct || 100) / 100)}</div>
                        {(b.payout_pct || 100) < 100 && <div className="text-xs text-gray-400">Full nett: {ZAR(b.total_nett)}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                  <thead><tr><th>Date</th><th>Batch</th><th className="text-right">Amount</th><th>Notes</th><th className="text-center">Artist Approved</th><th></th></tr></thead>
                  <tbody>
                    {payouts.map(p => editingPayoutId === p.id ? (
                      <tr key={p.id} className="bg-blue-50">
                        <td><input type="date" className="w-32" value={payoutEdits.payout_date} onChange={e => setPayoutEdits(x => ({ ...x, payout_date: e.target.value }))} /></td>
                        <td><input className="w-20" value={payoutEdits.batch_ref} onChange={e => setPayoutEdits(x => ({ ...x, batch_ref: e.target.value }))} /></td>
                        <td><input type="number" className="w-28 text-right" value={payoutEdits.amount} onChange={e => setPayoutEdits(x => ({ ...x, amount: e.target.value }))} /></td>
                        <td><input value={payoutEdits.notes} onChange={e => setPayoutEdits(x => ({ ...x, notes: e.target.value }))} /></td>
                        <td></td>
                        <td className="whitespace-nowrap">
                          <button onClick={savePayoutEdit} disabled={saving} className="text-xs text-green-700 font-medium mr-2">Save</button>
                          <button onClick={() => setEditingPayoutId(null)} className="text-xs text-gray-500">Cancel</button>
                        </td>
                      </tr>
                    ) : (
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
                        <td className="whitespace-nowrap">
                          <button onClick={() => startEditPayout(p)} className="text-xs text-bblue hover:text-navy mr-2">Edit</button>
                          <button onClick={() => deletePayout(p.id)} className="text-xs text-red-500 hover:text-red-700">Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-lblue font-semibold">
                      <td colSpan={2}>TOTAL PAID</td>
                      <td className="text-right font-mono">{ZAR(paid)}</td>
                      <td colSpan={3}></td>
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
                  <label>Notes</label>
                  <input placeholder="Optional notes" value={newLoan.notes} onChange={e => setNewLoan(l => ({ ...l, notes: e.target.value }))} />
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
                <thead><tr><th className="text-left py-1">Date</th><th className="text-left py-1">Type</th><th className="text-left py-1">Description</th><th className="text-left py-1">Notes</th><th className="text-right py-1">Amount</th><th></th></tr></thead>
                <tbody>
                  {loans.map(l => editingLoanId === l.id ? (
                    <tr key={l.id} className="border-t bg-blue-50">
                      <td className="py-1"><input type="date" className="w-32 text-sm" value={loanEdits.repayment_date} onChange={e => setLoanEdits(x => ({ ...x, repayment_date: e.target.value }))} /></td>
                      <td className="py-1 text-xs text-gray-500">{l.type || "Repayment"}</td>
                      <td className="py-1"><input className="text-sm" value={loanEdits.description} onChange={e => setLoanEdits(x => ({ ...x, description: e.target.value }))} /></td>
                      <td className="py-1"><input className="text-sm" value={loanEdits.notes} onChange={e => setLoanEdits(x => ({ ...x, notes: e.target.value }))} /></td>
                      <td className="py-1"><input type="number" className="w-24 text-right text-sm" value={loanEdits.amount} onChange={e => setLoanEdits(x => ({ ...x, amount: e.target.value }))} /></td>
                      <td className="py-1 whitespace-nowrap">
                        <button onClick={saveLoanEdit} disabled={saving} className="text-xs text-green-700 font-medium mr-2">Save</button>
                        <button onClick={() => setEditingLoanId(null)} className="text-xs text-gray-500">Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 text-gray-500 whitespace-nowrap">{fmtDate(l.repayment_date)}</td>
                      <td className="py-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${l.type === "Additional Loan" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {l.type || "Repayment"}
                        </span>
                      </td>
                      <td className="py-1">{l.description}</td>
                      <td className="py-1 text-gray-400 text-xs">{l.notes || "—"}</td>
                      <td className={`py-1 text-right font-mono ${l.type === "Additional Loan" ? "text-red-600" : "text-green-700"}`}>{ZAR(l.amount)}</td>
                      <td className="py-1 whitespace-nowrap">
                        <button onClick={() => startEditLoan(l)} className="text-xs text-bblue hover:text-navy mr-2">Edit</button>
                        <button onClick={() => deleteLoan(l.id)} className="text-xs text-red-500 hover:text-red-700">Del</button>
                      </td>
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
                  <p className="text-sm text-gray-500 mt-0.5">Select shows, assign a batch number, and send for artist sign-off</p>
                </div>
                {batchSelected.size > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      className="w-32"
                      placeholder="Batch # e.g. B004"
                      value={batchNumInput}
                      onChange={e => setBatchNumInput(e.target.value)}
                    />
                    <div className="flex items-center gap-1">
                      <div className="flex rounded border border-gray-300 overflow-hidden text-xs">
                        <button onClick={() => setBatchPayoutMode("pct")} className={`px-2 py-1 ${batchPayoutMode === "pct" ? "bg-navy text-white" : "bg-white text-gray-500"}`}>%</button>
                        <button onClick={() => setBatchPayoutMode("rand")} className={`px-2 py-1 ${batchPayoutMode === "rand" ? "bg-navy text-white" : "bg-white text-gray-500"}`}>R</button>
                      </div>
                      {batchPayoutMode === "pct" ? (
                        <input type="number" min="1" max="100" className="w-20 text-right"
                          placeholder="100" value={batchPayoutPct}
                          onChange={e => setBatchPayoutPct(e.target.value)} />
                      ) : (
                        <input type="number" min="0" className="w-28 text-right"
                          placeholder="R amount" value={batchPayoutRand}
                          onChange={e => setBatchPayoutRand(e.target.value)} />
                      )}
                      <span className="text-sm text-gray-500">{batchPayoutMode === "pct" ? "% payout" : "advance"}</span>
                    </div>
                    {batchTotals.nett > 0 && (
                      <span className="text-sm font-mono text-green-700">
                        = {ZAR(batchPayoutMode === "pct"
                          ? batchTotals.nett * (parseFloat(batchPayoutPct) || 100) / 100
                          : Math.min(parseFloat(batchPayoutRand) || 0, batchTotals.nett))}
                      </span>
                    )}
                    <button
                      onClick={assignBatch}
                      disabled={batchSaving || !batchNumInput.trim()}
                      className="btn-primary"
                    >
                      {batchSaving ? "Saving…" : `Assign Batch (${batchSelected.size})`}
                    </button>
                  </div>
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
                    <div className="text-xs text-purple-600 mt-1">Warchest stays in escrow</div>
                  </div>
                </div>
              )}
            </div>

            <div className="card p-0">
              <div className="px-4 py-3 border-b flex flex-wrap gap-3 items-end bg-gray-50">
                <input className="text-sm h-8 px-2 border rounded w-40" placeholder="Search event…" value={batchSearch} onChange={e => setBatchSearch(e.target.value)} />
                <input type="date" className="text-sm h-8 px-2 border rounded" value={batchFrom} onChange={e => setBatchFrom(e.target.value)} />
                <span className="text-xs text-gray-400">to</span>
                <input type="date" className="text-sm h-8 px-2 border rounded" value={batchTo} onChange={e => setBatchTo(e.target.value)} />
                <select className="text-sm h-8 px-2 border rounded" value={batchPayType} onChange={e => setBatchPayType(e.target.value)}>
                  <option value="">All pay types</option>
                  <option>Escrow</option><option>Direct</option>
                </select>
                {(batchSearch||batchFrom||batchTo||batchPayType) && <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => { setBatchSearch(""); setBatchFrom(""); setBatchTo(""); setBatchPayType("") }}>Clear</button>}
                <span className="ml-auto text-xs text-gray-500">{filteredBatchShows.length} of {batchShows.length} shows</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          className="w-auto"
                          checked={filteredBatchShows.length > 0 && filteredBatchShows.every(s => batchSelected.has(s.id))}
                          onChange={() => toggleAllBatch(filteredBatchShows)}
                        />
                      </th>
                      <th>Date</th><th>Event</th><th>Type</th><th>Pay</th>
                      <th className="text-right">Gross</th>
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
                    {filteredBatchShows.map(s => {
                      const c = calcShow(s)
                      const selected = batchSelected.has(s.id)
                      const isEscrow = s.pay_type === "Escrow"
                      return (
                        <tr key={s.id} className={selected ? "bg-blue-50" : !isEscrow ? "opacity-60" : ""}>
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
                          <td className={`text-xs font-medium ${isEscrow ? "text-bblue" : "text-gray-400"}`}>{s.pay_type}</td>
                          <td className="text-right font-mono">{ZAR(s.gross)}</td>
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
                </table>
              </div>
            </div>

            {/* Existing batches */}
            {batches.length > 0 && (
              <div className="card p-0">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-navy">Batch History</h3>
                </div>
                <div className="table-wrap rounded-none rounded-b-xl">
                  <table>
                    <thead>
                      <tr>
                        <th>Batch #</th>
                        <th>Created</th>
                        <th className="text-right">Gross</th>
                        <th className="text-right">Nett</th>
                        <th className="text-right">Payout %</th>
                        <th className="text-right">Payout Amt</th>
                        <th>Status</th>
                        <th>Signed Off</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map(b => editingBatchHistId === b.id ? (
                        <tr key={b.id} className="bg-blue-50">
                          <td><input className="w-24 font-medium" value={batchHistEdits.batch_num} onChange={e => setBatchHistEdits(x => ({ ...x, batch_num: e.target.value }))} /></td>
                          <td className="text-gray-500">{fmtDate(b.created_at)}</td>
                          <td className="text-right font-mono">{ZAR(b.total_gross)}</td>
                          <td className="text-right font-mono font-semibold">{ZAR(b.total_nett)}</td>
                          <td className="text-right">{b.payout_pct || 100}%</td>
                          <td className="text-right font-mono">{ZAR(b.total_nett * (b.payout_pct || 100) / 100)}</td>
                          <td>
                            <select className="text-xs" value={batchHistEdits.status} onChange={e => setBatchHistEdits(x => ({ ...x, status: e.target.value }))}>
                              <option>Pending Sign-Off</option>
                              <option>Signed Off</option>
                              <option>Partially Paid</option>
                              <option>Paid</option>
                            </select>
                          </td>
                          <td className="text-gray-500 text-xs">{b.signed_off_at ? fmtDate(b.signed_off_at) : "—"}</td>
                          <td className="whitespace-nowrap space-x-2">
                            <button onClick={saveBatchHistEdit} disabled={saving} className="text-xs text-green-700 font-medium">Save</button>
                            <button onClick={() => setEditingBatchHistId(null)} className="text-xs text-gray-500">Cancel</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={b.id}>
                          <td className="font-medium">{b.batch_num}</td>
                          <td className="text-gray-500">{fmtDate(b.created_at)}</td>
                          <td className="text-right font-mono">{ZAR(b.total_gross)}</td>
                          <td className="text-right font-mono font-semibold">{ZAR(b.total_nett)}</td>
                          <td className="text-right text-gray-500">{b.payout_pct || 100}%</td>
                          <td className="text-right font-mono font-semibold text-green-700">{ZAR(b.total_nett * (b.payout_pct || 100) / 100)}</td>
                          <td>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              b.status === "Paid"             ? "bg-green-100 text-green-700" :
                              b.status === "Partially Paid"   ? "bg-orange-100 text-orange-700" :
                              b.status === "Signed Off"       ? "bg-blue-100 text-blue-700" :
                              b.status === "Pending Sign-Off" ? "bg-yellow-100 text-yellow-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>{b.status}</span>
                          </td>
                          <td className="text-gray-500 text-xs">{b.signed_off_at ? fmtDate(b.signed_off_at) : "—"}</td>
                          <td className="whitespace-nowrap space-x-2">
                            {b.status === "Pending Sign-Off" && (
                              <button onClick={() => approveOnBehalf(b.id)} className="text-xs text-bblue font-medium hover:underline">Approve on Behalf</button>
                            )}
                            {b.status === "Signed Off" && (
                              <button onClick={() => markBatchPaid(b.id)} className="text-xs text-green-700 font-medium hover:underline">Mark Paid</button>
                            )}
                            {b.status === "Partially Paid" && (
                              <button onClick={() => payBatchBalance(b.id)} className="text-xs text-blue-600 font-medium hover:underline">Pay Balance</button>
                            )}
                            <button onClick={() => startEditBatchHist(b)} className="text-xs text-gray-500 hover:text-navy">Edit</button>
                            <button onClick={() => deleteBatch(b.id)} className="text-xs text-red-500 hover:text-red-700">Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
