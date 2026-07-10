import type { Show, Transfer, Artist, Agent } from "./types"

export const ZAR = (n: number) =>
  "R\u00a0" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function calcShow(s: Show) {
  const comm      = s.gross * s.comm_pct
  const totalBand = s.sound + s.mus1 + s.mus2 + s.mus3 + (s.mus4 || 0) + s.other_costs
  const subtotal  = s.gross - comm - totalBand
  const warchest  = s.pay_type === "Escrow" ? subtotal * s.warchest_pct : 0
  const advance   = s.advance || 0
  const nett      = subtotal - warchest - advance
  return { comm, totalBand, subtotal, warchest, advance, nett }
}

/** Amount that counts as received into escrow from this show */
export function depAmount(s: Show): number {
  if (s.pay_type !== "Escrow") return 0
  if (s.dep_is_pre) return 0
  if (s.dep_pct === null || s.dep_pct === undefined) return 0
  return s.gross * s.dep_pct / 100
}

/** Amount still pending from this show */
export function pendingAmount(s: Show): number {
  if (s.pay_type !== "Escrow") return 0
  if (s.dep_is_pre) return 0
  if (s.dep_pct === null || s.dep_pct === undefined) return 0
  if (s.status === "All Paid" || s.status === "Fee Received" || s.status === "Cancelled") return 0
  return s.gross * (1 - s.dep_pct / 100)
}

export function escrowBalance(artist: Artist, shows: Show[], transfers: Transfer[]) {
  const deposits   = shows.reduce((sum, s) => sum + depAmount(s), 0)
  const pending    = shows.reduce((sum, s) => sum + pendingAmount(s), 0)
  const totalOut   = transfers.reduce((sum, t) => sum + t.amount, 0)
  const current    = artist.opening_balance + deposits - totalOut
  const projected  = current + pending
  const warchestIn = shows
    .filter(s => s.pay_type === "Escrow" && !s.dep_is_pre && (s.dep_pct ?? 0) > 0)
    .reduce((sum, s) => sum + calcShow(s).warchest * (s.dep_pct! / 100), 0)
  return { deposits, pending, totalOut, current, projected, warchestIn }
}

export function ytdStats(shows: Show[]) {
  const paid = shows.filter(s => s.pay_type === "Escrow" && s.dep_pct === 100)
  const gross     = paid.reduce((sum, s) => sum + s.gross, 0)
  const comm      = paid.reduce((sum, s) => sum + calcShow(s).comm, 0)
  const warchest  = paid.reduce((sum, s) => sum + calcShow(s).warchest, 0)
  const nett      = paid.reduce((sum, s) => sum + calcShow(s).nett, 0)
  return { gross, comm, warchest, nett }
}

export function totalConfirmed(shows: Show[]) {
  return shows.filter(s => s.gross > 0).reduce((sum, s) => sum + s.gross, 0)
}

export function nettOwed(shows: Show[]) {
  return shows
    .filter(s => s.pay_type === "Escrow" && s.status === "All Paid")
    .reduce((sum, s) => sum + calcShow(s).nett, 0)
}

/** Agent's split % for a given artist based on their name, with date-aware prev split support */
export function agentSplitPct(agentName: string, artist: Artist, showDate?: string): number {
  const usePrev = !!(showDate && artist.split_effective_date && showDate < artist.split_effective_date)
  switch (agentName.toLowerCase()) {
    case "gareth":    return artist.gareth_split_pct    || 0
    case "misha":     return artist.misha_split_pct     || 0
    case "jako":      return usePrev ? (artist.jako_split_pct_prev ?? artist.jako_split_pct) || 0 : artist.jako_split_pct || 0
    case "que":       return artist.que_split_pct       || 0
    case "bnas pool": return usePrev ? (artist.unalloc_split_pct_prev ?? artist.unalloc_split_pct) || 0 : artist.unalloc_split_pct || 0
    default:          return 0
  }
}

/** Amount agent earns from a single show */
export function calcAgentEarned(s: Show, artist: Artist, agentName: string): number {
  const name = agentName.toLowerCase()
  // 007 test agent — earns full BNAS commission on shows they're responsible for
  if (name === "007") {
    const isAgent = (s.responsible_agent || "").toLowerCase() === "007" || (s.secondary_agent || "").toLowerCase() === "007"
    return isAgent ? s.gross * s.comm_pct : 0
  }
  const remainingComm = s.gross * s.comm_pct
  // BNAS Overhead — % of remaining commission
  if (name === "bnas overhead") {
    return remainingComm * (artist.bnas_overhead_pct || 0.2)
  }
  const toSplit = remainingComm * (1 - (artist.bnas_overhead_pct || 0.2))
  return toSplit * agentSplitPct(agentName, artist, s.show_date)
}

/** Total warchest retained in escrow: opening warchest + warchest from All Paid shows, minus any Warchest Dist. transfers */
export function warchestPot(shows: Show[], transfers: Transfer[] = [], openingWarchest = 0): number {
  const earned = shows
    .filter(s => s.pay_type === "Escrow" && s.status === "All Paid")
    .reduce((sum, s) => sum + calcShow(s).warchest, 0)
  const distributed = transfers
    .filter(t => t.transfer_type === "Warchest Dist.")
    .reduce((sum, t) => sum + t.amount, 0)
  return openingWarchest + earned - distributed
}
