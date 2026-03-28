"use client"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function Navbar({ title, isAdmin }: { title: string; isAdmin: boolean }) {
  const router = useRouter()
  async function signOut() {
    await supabase.auth.signOut()
    router.replace("/login")
  }
  return (
    <header className="bg-navy text-white px-6 py-3 flex items-center justify-between shadow">
      <div className="flex items-center gap-4">
        <span className="font-bold text-lg tracking-tight">BNAS</span>
        <span className="text-lblue text-sm hidden sm:block">|</span>
        <span className="text-lblue text-sm hidden sm:block">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        {isAdmin && (
          <span className="bg-bblue text-white text-xs px-2 py-0.5 rounded-full">Admin</span>
        )}
        <button onClick={signOut} className="text-lblue hover:text-white text-sm transition-colors">
          Sign out
        </button>
      </div>
    </header>
  )
}
