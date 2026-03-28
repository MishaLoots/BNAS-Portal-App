export interface Artist {
  id: string
  name: string
  email: string
  escrow_account: string
  default_comm: number
  default_warchest: number
  opening_balance: number
  loan_opening: number
  has_csr: boolean
  mus1_name: string
  mus2_name: string
  mus3_name: string
  mus4_name: string
}

export interface Show {
  id: string
  artist_id: string
  show_date: string
  event: string
  show_type: string
  gross: number
  pay_type: "Escrow" | "Direct"
  comm_pct: number
  sound: number
  mus1: number
  mus2: number
  mus3: number
  mus4: number
  other_costs: number
  responsible_agent: string | null
  secondary_agent: string | null
  warchest_pct: number
  batch_num: string | null
  status: string | null
  dep_pct: number | null
  dep_is_pre: boolean
  notes: string | null
}

export interface Transfer {
  id: string
  artist_id: string
  transfer_date: string
  description: string
  transfer_type: string
  amount: number
}

export interface Payout {
  id: string
  artist_id: string
  payout_date: string
  batch_ref: string
  amount: number
  notes: string | null
  approved_by_artist: boolean
  approved_at: string | null
}

export interface LoanRepayment {
  id: string
  artist_id: string
  repayment_date: string
  description: string
  amount: number
  notes: string | null
}

export interface Profile {
  id: string
  email: string
  artist_id: string | null
  is_admin: boolean
}
