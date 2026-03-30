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
  bnas_overhead_pct: number
  gareth_split_pct: number
  misha_split_pct: number
  jako_split_pct: number
  que_split_pct: number
  unalloc_split_pct: number
}

export interface Agent {
  id: string
  name: string
  email: string
}

export interface AgentPayout {
  id: string
  agent_id: string
  payout_date: string
  amount: number
  description: string | null
  payout_type: string | null
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
  type?: string
}

export interface Batch {
  id: string
  artist_id: string
  batch_num: string
  total_gross: number
  total_comm: number
  total_sound: number
  total_mus1: number
  total_mus2: number
  total_mus3: number
  total_mus4: number
  total_other: number
  total_warchest: number
  total_nett: number
  mus1_name: string | null
  mus2_name: string | null
  mus3_name: string | null
  mus4_name: string | null
  status: string
  approved_by: string | null
  created_at: string
  signed_off_at: string | null
  paid_at: string | null
}

export interface Profile {
  id: string
  email: string
  artist_id: string | null
  agent_id: string | null
  is_admin: boolean
}
