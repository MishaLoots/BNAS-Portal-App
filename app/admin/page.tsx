'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import type { Agent, Artist, Show } from '@/lib/types'
import { ZAR, calcShow } from '@/lib/calculations'

type ViewMode = 'artists' | 'monthly'

interface ShowWithArtist extends Show {
  artist: Artist
}

function fmtMonth(m: string): string {
  return new Date(m + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function AdminPage() {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>('artists')
  const [artists, setArtists] = useState<Artist[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [allShows, setAllShows] = useState<ShowWithArtist[]>([])
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [monthsLoading, setMonthsLoading] = useState(false)
  const [monthsLoaded, setMonthsLoaded] = useState(false)

  function toggleMonth(m: string) {
    setCollapsedMonths(prev => {
      const n = new Set(prev)
      n.has(m) ? n.delete(m) : n.add(m)
      return n
    })
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single()

      if (!profile?.is_admin) { router.replace('/artist'); return }

      const [{ data: a }, { data: ag }] = await Promise.all([
        supabase.from('artists').select('*').order('name'),
        supabase.from('agents').select('*').order('name'),
      ])

      setArtists(a || [])
      setAgents(ag || [])
      setLoading(false)
    }
    load()
  }, [router])

  async function loadMonthly(artistList: Artist[]) {
    if (monthsLoaded) return
    setMonthsLoading(true)
    const shows: ShowWithArtist[] = []
    for (const artist of artistList) {
      const { data } = await supabase
        .from('shows')
        .select('*')
        .eq('artist_id', artist.id)
        .order('show_date')
      for (const show of (data || [])) {
        shows.push({ ...show, artist })
      }
    }
    shows.sort((a, b) => a.show_date.localeCompare(b.show_date))
    setAllShows(shows)
    // Default all months collapsed
    const months = new Set(shows.map(s => s.show_date.slice(0, 7)))
    setCollapsedMonths(months)
    setMonthsLoaded(true)
    setMonthsLoading(false)
  }

  function switchView(v: ViewMode) {
    setView(v)
    if (v === 'monthly') loadMonthly(artists)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>
  )

  // Group artists by agent
  const byAgent: Record<string, Artist[]> = {}
  for (const artist of artists) {
    const key = (artist as Artist & { agent_id?: string }).agent_id || '__none__'
    if (!byAgent[key]) byAgent[key] = []
    byAgent[key].push(artist)
  }

  // Monthly: group shows by month
  const byMonth: Record<string, ShowWithArtist[]> = {}
  for (const show of allShows) {
    const mk = show.show_date.slice(0, 7)
    if (!byMonth[mk]) byMonth[mk] = []
    byMonth[mk].push(show)
  }

  const sortedMonths = Object.keys(byMonth).sort().reverse()

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Admin" isAdmin={true} />
      <main className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto w-full space-y-4">

        {/* View toggle */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {(['artists', 'monthly'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => switchView(v)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === v ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {v === 'artists' ? 'Artists' : 'Monthly Overview'}
            </button>
          ))}
        </div>

        {/* ── ARTISTS VIEW ── */}
        {view === 'artists' && (
          <div className="card p-0">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-navy">Artists ({artists.length})</h2>
            </div>
            <div className="divide-y">
              {agents.map(agent => {
                const agentArtists = byAgent[agent.id] || []
                if (agentArtists.length === 0) return null
                const isExpanded = expandedAgent === agent.id
                return (
                  <div key={agent.id}>
                    <button
                      className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
                      onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                    >
                      <span className="font-medium text-gray-800">
                        {isExpanded ? '▼' : '▶'} {agent.name}
                      </span>
                      <span className="text-sm text-gray-500">
                        {agentArtists.length} artist{agentArtists.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t bg-gray-50">
                        {agentArtists.map(artist => (
                          <a key={artist.id} href={`/admin/artists/${artist.id}`}
                            className="block px-10 py-2.5 hover:bg-gray-100 text-sm border-b last:border-0">
                            <span className="font-medium text-gray-800">{artist.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Artists with no agent */}
              {(byAgent['__none__'] || []).length > 0 && (
                <div>
                  <button
                    className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
                    onClick={() => setExpandedAgent(expandedAgent === '__none__' ? null : '__none__')}
                  >
                    <span className="font-medium text-gray-500">
                      {expandedAgent === '__none__' ? '▼' : '▶'} No Agent
                    </span>
                    <span className="text-sm text-gray-400">
                      {(byAgent['__none__'] || []).length} artist{(byAgent['__none__'] || []).length !== 1 ? 's' : ''}
                    </span>
                  </button>
                  {expandedAgent === '__none__' && (
                    <div className="border-t bg-gray-50">
                      {(byAgent['__none__'] || []).map(artist => (
                        <a key={artist.id} href={`/admin/artists/${artist.id}`}
                          className="block px-10 py-2.5 hover:bg-gray-100 text-sm border-b last:border-0">
                          <span className="font-medium text-gray-800">{artist.name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MONTHLY OVERVIEW ── */}
        {view === 'monthly' && (
          monthsLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">Loading shows…</div>
          ) : (
            <div className="card p-0">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h2 className="font-semibold text-navy">All Shows — Monthly Overview</h2>
                <span className="text-sm text-gray-500">
                  {allShows.length} shows · {sortedMonths.length} months
                </span>
              </div>
              <div className="table-wrap rounded-none rounded-b-xl">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Artist</th>
                      <th>Event</th>
                      <th className="text-right">Gross</th>
                      <th className="text-right">Comm</th>
                      <th className="text-right">Nett</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMonths.flatMap(month => {
                      const mShows = byMonth[month]
                      const collapsed = collapsedMonths.has(month)
                      const mGross = mShows.reduce((s, sh) => s + (sh.gross || 0), 0)
                      const mComm  = mShows.reduce((s, sh) => s + calcShow(sh).comm, 0)
                      const mNett  = mShows.reduce((s, sh) => s + calcShow(sh).nett, 0)
                      return [
                        <tr key={`m-${month}`}
                          className="bg-gray-100 hover:bg-gray-200 cursor-pointer select-none"
                          onClick={() => toggleMonth(month)}>
                          <td colSpan={7}>
                            <div className="flex items-center justify-between px-1 py-0.5">
                              <span className="font-semibold text-sm">
                                {collapsed ? '▶' : '▼'} {fmtMonth(month)}{' '}
                                <span className="text-gray-500 font-normal text-xs">
                                  ({mShows.length} show{mShows.length !== 1 ? 's' : ''})
                                </span>
                              </span>
                              <span className="font-mono text-xs text-gray-600">
                                Gross {ZAR(mGross)} · Comm {ZAR(mComm)} · Nett {ZAR(mNett)}
                              </span>
                            </div>
                          </td>
                        </tr>,
                        ...(!collapsed ? mShows.map(sh => {
                          const calc = calcShow(sh)
                          return (
                            <tr key={sh.id}>
                              <td className="text-gray-500 whitespace-nowrap">{fmtDate(sh.show_date)}</td>
                              <td className="text-gray-600 text-sm">
                                <a href={`/admin/artists/${sh.artist_id}`} className="hover:underline">
                                  {sh.artist.name}
                                </a>
                              </td>
                              <td className="font-medium">{sh.event}</td>
                              <td className="text-right font-mono">{ZAR(sh.gross || 0)}</td>
                              <td className="text-right font-mono text-gray-600">{ZAR(calc.comm)}</td>
                              <td className="text-right font-mono font-semibold">{ZAR(calc.nett)}</td>
                              <td>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  sh.status === 'All Paid'     ? 'bg-green-100 text-green-700'  :
                                  sh.status === 'Fee Received' ? 'bg-blue-100 text-blue-700'   :
                                  sh.status === 'Pending'      ? 'bg-yellow-100 text-yellow-700':
                                  'bg-gray-100 text-gray-500'
                                }`}>{sh.status || '—'}</span>
                              </td>
                            </tr>
                          )
                        }) : [])
                      ]
                    })}
                  </tbody>
                  {allShows.length > 0 && (
                    <tfoot>
                      <tr className="bg-lblue font-semibold">
                        <td colSpan={3}>TOTALS ({allShows.length} shows)</td>
                        <td className="text-right font-mono">
                          {ZAR(allShows.reduce((s, sh) => s + (sh.gross || 0), 0))}
                        </td>
                        <td className="text-right font-mono">
                          {ZAR(allShows.reduce((s, sh) => s + calcShow(sh).comm, 0))}
                        </td>
                        <td className="text-right font-mono">
                          {ZAR(allShows.reduce((s, sh) => s + calcShow(sh).nett, 0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )
        )}

      </main>
    </div>
  )
}
