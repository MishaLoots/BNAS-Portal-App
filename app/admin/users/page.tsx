"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import Navbar from "@/components/Navbar"

interface UserRow {
  id: string
  email: string
  created_at: string
  last_sign_in: string | null
  profile: { is_admin: boolean; artist_id: string | null; agent_id: string | null } | null
  artist: { id: string; name: string } | null
  agent:  { id: string; name: string } | null
}

interface Option { id: string; name: string }

interface ArtistSplits {
  id: string; name: string
  bnas_overhead_pct: number
  misha_split_pct: number; gareth_split_pct: number
  jako_split_pct: number;  que_split_pct: number
  unalloc_split_pct: number
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers]         = useState<UserRow[]>([])
  const [artists, setArtists]     = useState<Option[]>([])
  const [agents, setAgents]       = useState<Option[]>([])
  const [artistSplits, setArtistSplits] = useState<ArtistSplits[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [token, setToken]         = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm]   = useState<{ email: string; is_admin: boolean; artist_id: string; agent_id: string }>({ email: "", is_admin: false, artist_id: "", agent_id: "" })
  const [resetMsg, setResetMsg]   = useState("")

  // Splits editing
  const [editingSplitId, setEditingSplitId] = useState<string | null>(null)
  const [splitEdits, setSplitEdits] = useState<Omit<ArtistSplits, "id" | "name">>({ bnas_overhead_pct: 0.2, misha_split_pct: 0, gareth_split_pct: 0, jako_split_pct: 0, que_split_pct: 0, unalloc_split_pct: 0 })
  const [splitSaving, setSplitSaving] = useState(false)

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState({ email: "", is_admin: false, artist_id: "", agent_id: "" })
  const [inviteMsg, setInviteMsg] = useState("")

  async function load() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace("/login"); return }
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single()
    if (!profile?.is_admin) { router.replace("/admin"); return }
    setToken(session.access_token)

    const [res, { data: splits }] = await Promise.all([
      fetch("/api/admin/users", { headers: { Authorization: `Bearer ${session.access_token}` } }),
      supabase.from("artists").select("id,name,bnas_overhead_pct,misha_split_pct,gareth_split_pct,jako_split_pct,que_split_pct,unalloc_split_pct").order("name"),
    ])
    const json = await res.json()
    setUsers(json.users || [])
    setArtists(json.artists || [])
    setAgents(json.agents || [])
    setArtistSplits(splits || [])
    setLoading(false)
  }

  function startEditSplit(a: ArtistSplits) {
    setEditingSplitId(a.id)
    setSplitEdits({ bnas_overhead_pct: a.bnas_overhead_pct, misha_split_pct: a.misha_split_pct, gareth_split_pct: a.gareth_split_pct, jako_split_pct: a.jako_split_pct, que_split_pct: a.que_split_pct, unalloc_split_pct: a.unalloc_split_pct })
  }

  async function saveSplitEdit() {
    if (!editingSplitId) return
    setSplitSaving(true)
    await supabase.from("artists").update(splitEdits).eq("id", editingSplitId)
    setEditingSplitId(null)
    await load()
    setSplitSaving(false)
  }

  function pctInput(field: keyof typeof splitEdits) {
    return (
      <input
        type="number" step="0.01" min="0" max="1" className="w-16 text-right text-xs"
        value={splitEdits[field]}
        onChange={e => setSplitEdits(x => ({ ...x, [field]: parseFloat(e.target.value) || 0 }))}
      />
    )
  }

  function splitTotal(a: ArtistSplits) {
    return ((a.misha_split_pct + a.gareth_split_pct + a.jako_split_pct + a.que_split_pct + a.unalloc_split_pct) * 100).toFixed(0)
  }
  function editTotal() {
    return ((splitEdits.misha_split_pct + splitEdits.gareth_split_pct + splitEdits.jako_split_pct + splitEdits.que_split_pct + splitEdits.unalloc_split_pct) * 100).toFixed(0)
  }

  useEffect(() => { load() }, [])

  function fmtDate(s: string | null) {
    if (!s) return "Never"
    return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  }

  function startEdit(u: UserRow) {
    setEditingId(u.id)
    setResetMsg("")
    setEditForm({
      email:     u.email || "",
      is_admin:  u.profile?.is_admin  || false,
      artist_id: u.profile?.artist_id || "",
      agent_id:  u.profile?.agent_id  || "",
    })
  }

  async function saveEdit() {
    if (!editingId || !token) return
    setSaving(true)
    await fetch(`/api/admin/users/${editingId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, artist_id: editForm.artist_id || null, agent_id: editForm.agent_id || null }),
    })
    setEditingId(null)
    await load()
    setSaving(false)
  }

  async function sendReset(userId: string, email: string) {
    if (!token) return
    setResetMsg("")
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, send_reset: true }),
    })
    setResetMsg(`Password reset sent to ${email}`)
  }

  async function deleteUser(userId: string, email: string) {
    if (!token) return
    if (!window.confirm(`Remove access for ${email}? This cannot be undone.`)) return
    await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    await load()
  }

  async function sendInvite() {
    if (!token || !invite.email) return
    setSaving(true)
    setInviteMsg("")
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...invite, artist_id: invite.artist_id || null, agent_id: invite.agent_id || null }),
    })
    const json = await res.json()
    if (json.error) {
      setInviteMsg(`Error: ${json.error}`)
    } else {
      setInviteMsg(`Invite sent to ${invite.email}`)
      setInvite({ email: "", is_admin: false, artist_id: "", agent_id: "" })
      await load()
    }
    setSaving(false)
  }

  async function exportData() {
    if (!token) return
    const res = await fetch("/api/admin/export", {
      headers: { Authorization: `Bearer ${token}` }
    })
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `BNAS-export-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="User Management" isAdmin />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">

        <div className="flex items-center justify-between">
          <button onClick={() => router.push("/admin")} className="text-bblue text-sm hover:text-navy">← Dashboard</button>
          <div className="flex gap-2">
            <button onClick={exportData} className="btn-secondary text-sm">⬇ Export All Data</button>
            <button onClick={() => setShowInvite(!showInvite)} className="btn-primary text-sm">
              {showInvite ? "Cancel" : "+ Invite User"}
            </button>
          </div>
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="card bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-navy mb-4">Invite New User</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="col-span-2">
                <label>Email Address</label>
                <input type="email" placeholder="user@email.com" value={invite.email}
                  onChange={e => setInvite(x => ({ ...x, email: e.target.value }))} />
              </div>
              <div>
                <label>Link to Artist</label>
                <select value={invite.artist_id} onChange={e => setInvite(x => ({ ...x, artist_id: e.target.value, agent_id: "" }))}>
                  <option value="">— None —</option>
                  {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label>Link to Agent</label>
                <select value={invite.agent_id} onChange={e => setInvite(x => ({ ...x, agent_id: e.target.value, artist_id: "" }))}>
                  <option value="">— None —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="adminCheck" className="w-auto" checked={invite.is_admin}
                  onChange={e => setInvite(x => ({ ...x, is_admin: e.target.checked }))} />
                <label htmlFor="adminCheck" className="mb-0">Admin access</label>
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <button onClick={sendInvite} disabled={saving || !invite.email} className="btn-primary">
                  {saving ? "Sending…" : "Send Invite"}
                </button>
                {inviteMsg && <span className={`text-sm ${inviteMsg.startsWith("Error") ? "text-red-600" : "text-green-700"}`}>{inviteMsg}</span>}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">User will receive an email to set their password and log in.</p>
          </div>
        )}

        {/* Users table */}
        <div className="card p-0">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-navy">All Users ({users.length})</h2>
          </div>
          <div className="table-wrap rounded-none rounded-b-xl">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Linked To</th>
                  <th>Joined</th>
                  <th>Last Sign In</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => editingId === u.id ? (
                  <tr key={u.id} className="bg-blue-50">
                    <td>
                      <input className="w-48 text-sm" type="email" value={editForm.email}
                        onChange={e => setEditForm(x => ({ ...x, email: e.target.value }))} />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" className="w-auto" checked={editForm.is_admin}
                          onChange={e => setEditForm(x => ({ ...x, is_admin: e.target.checked }))} />
                        <span className="text-xs">Admin</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1 items-center">
                          <span className="text-xs text-gray-500 w-10">Artist</span>
                          <select className="text-sm" value={editForm.artist_id}
                            onChange={e => setEditForm(x => ({ ...x, artist_id: e.target.value, agent_id: "" }))}>
                            <option value="">— None —</option>
                            {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className="text-xs text-gray-500 w-10">Agent</span>
                          <select className="text-sm" value={editForm.agent_id}
                            onChange={e => setEditForm(x => ({ ...x, agent_id: e.target.value, artist_id: "" }))}>
                            <option value="">— None —</option>
                            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                        <p className="text-xs text-gray-400">Select one only — artist or agent</p>
                      </div>
                    </td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td>{fmtDate(u.last_sign_in)}</td>
                    <td className="whitespace-nowrap space-x-2">
                      <button onClick={saveEdit} disabled={saving} className="text-xs text-green-700 font-medium">Save</button>
                      <button onClick={() => sendReset(u.id, editForm.email)} className="text-xs text-bblue hover:underline">Send Reset</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-500">Cancel</button>
                      {resetMsg && <span className="text-xs text-green-600 block mt-1">{resetMsg}</span>}
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id}>
                    <td className="font-medium">{u.email}</td>
                    <td>
                      {u.profile?.is_admin
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Admin</span>
                        : u.profile?.artist_id
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Artist</span>
                        : u.profile?.agent_id
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Agent</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">No role</span>}
                    </td>
                    <td className="text-gray-600">
                      {u.artist?.name || u.agent?.name || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="text-gray-500">{fmtDate(u.created_at)}</td>
                    <td className="text-gray-500">{fmtDate(u.last_sign_in)}</td>
                    <td className="whitespace-nowrap space-x-2">
                      <button onClick={() => startEdit(u)} className="text-xs text-bblue hover:text-navy">Edit</button>
                      <button onClick={() => deleteUser(u.id, u.email || "")} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Commission Splits */}
        <div className="card p-0">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-navy">Commission Splits by Artist</h2>
            <p className="text-xs text-gray-500 mt-1">BNAS% is overhead taken first. Remaining splits must total 100%.</p>
          </div>
          <div className="table-wrap rounded-none rounded-b-xl">
            <table>
              <thead>
                <tr>
                  <th>Artist</th>
                  <th className="text-right">BNAS%</th>
                  <th className="text-right">Misha%</th>
                  <th className="text-right">Gareth%</th>
                  <th className="text-right">Jako%</th>
                  <th className="text-right">Que%</th>
                  <th className="text-right">Unalloc%</th>
                  <th className="text-right">Total%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {artistSplits.map(a => editingSplitId === a.id ? (
                  <tr key={a.id} className="bg-blue-50">
                    <td className="font-medium">{a.name}</td>
                    <td className="text-right">{pctInput("bnas_overhead_pct")}</td>
                    <td className="text-right">{pctInput("misha_split_pct")}</td>
                    <td className="text-right">{pctInput("gareth_split_pct")}</td>
                    <td className="text-right">{pctInput("jako_split_pct")}</td>
                    <td className="text-right">{pctInput("que_split_pct")}</td>
                    <td className="text-right">{pctInput("unalloc_split_pct")}</td>
                    <td className={`text-right text-xs font-semibold ${editTotal() === "100" ? "text-green-700" : "text-red-600"}`}>
                      {editTotal()}%
                    </td>
                    <td className="whitespace-nowrap space-x-2">
                      <button onClick={saveSplitEdit} disabled={splitSaving} className="text-xs text-green-700 font-medium">Save</button>
                      <button onClick={() => setEditingSplitId(null)} className="text-xs text-gray-500">Cancel</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id}>
                    <td className="font-medium">{a.name}</td>
                    <td className="text-right text-gray-600">{(a.bnas_overhead_pct * 100).toFixed(0)}%</td>
                    <td className="text-right text-gray-600">{(a.misha_split_pct * 100).toFixed(0)}%</td>
                    <td className="text-right text-gray-600">{(a.gareth_split_pct * 100).toFixed(0)}%</td>
                    <td className="text-right text-gray-600">{(a.jako_split_pct * 100).toFixed(0)}%</td>
                    <td className="text-right text-gray-600">{(a.que_split_pct * 100).toFixed(0)}%</td>
                    <td className="text-right text-gray-600">{(a.unalloc_split_pct * 100).toFixed(0)}%</td>
                    <td className={`text-right text-xs font-semibold ${splitTotal(a) === "100" ? "text-green-700" : "text-red-600"}`}>
                      {splitTotal(a)}%
                    </td>
                    <td>
                      <button onClick={() => startEditSplit(a)} className="text-xs text-bblue hover:text-navy">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}
