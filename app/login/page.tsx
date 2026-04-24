"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]               = useState("")
  const [password, setPassword]         = useState("")
  const [newPassword, setNewPassword]   = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError]               = useState("")
  const [loading, setLoading]           = useState(false)
  const [mode, setMode]                 = useState<"login" | "set-password" | "forgot">("login")
  const [resetSent, setResetSent]       = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes("access_token")) {
      const params = new URLSearchParams(hash.replace("#", ""))
      const type = params.get("type")
      if (type === "invite" || type === "recovery") {
        setMode("set-password")
      }
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) redirectByRole(session.user.id)
      })
    }
  }, [])

  async function redirectByRole(userId: string) {
    const { data: profile } = await supabase.from("profiles").select("is_admin, artist_id, agent_id").eq("id", userId).single()
    if (!profile) { router.replace("/login"); return }
    if (profile.is_admin) router.replace("/admin")
    else if (profile.artist_id) router.replace("/artist")
    else if (profile.agent_id) router.replace("/agent")
    else router.replace("/login")
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    await redirectByRole(data.user.id)
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (newPassword !== confirmPassword) { setError("Passwords don't match"); return }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return }
    setLoading(true)
    const { data, error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.user) await redirectByRole(data.user.id)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) { setError(error.message); setLoading(false); return }
    setResetSent(true)
    setLoading(false)
  }

  if (mode === "set-password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="card w-full max-w-sm p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-navy">Set Your Password</h1>
            <p className="text-sm text-gray-500 mt-1">Choose a password to activate your account</p>
          </div>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full" placeholder="Min 8 characters" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full" placeholder="Repeat password" required />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Setting password..." : "Set Password & Log In"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (mode === "forgot") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="card w-full max-w-sm p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-navy">Reset Password</h1>
            <p className="text-sm text-gray-500 mt-1">We&apos;ll send you a reset link</p>
          </div>
          {resetSent ? (
            <div className="text-center">
              <p className="text-green-700 font-medium">Check your email for the reset link.</p>
              <button onClick={() => { setMode("login"); setResetSent(false) }} className="mt-4 text-bblue text-sm">Back to login</button>
            </div>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full" placeholder="your@email.com" required />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <button type="button" onClick={() => setMode("login")} className="w-full text-sm text-gray-500 hover:text-gray-700">
                Back to login
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-navy">BNAS</h1>
          <p className="text-sm text-gray-500 mt-1">Artist Management Portal</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full" placeholder="your@email.com" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full" placeholder="••••••••" required />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Logging in..." : "Log In"}
          </button>
          <button type="button" onClick={() => setMode("forgot")} className="w-full text-sm text-gray-500 hover:text-gray-700">
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  )
}
