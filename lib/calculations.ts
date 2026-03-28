import type { Show, Transfer, Artist } from "./types"

export const ZAR = (n: number) =>
  "R\u00a0" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function calcShow(s: Show) {
  const comm      = s.gross * s.comm_pct
  const totalBand = s.sound + s.mus1 + s.mus2 + s.mus3 + s.other_costs
  const subtotal  = s.gross - comm - totalBand
  const warchest  = s.pay_type === "Escrow" ? subtotal * s.warchest_pct : 0
  const nett      = subtotal - warchest
  return { comm, totalBand, subtotal, warchest, nett }
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
