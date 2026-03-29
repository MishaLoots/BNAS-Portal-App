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
    <header className="bg-navy text-white shadow">
      <div className="h-1 bg-bblue w-full" />
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-bold text-lg tracking-tight">BNAS</span>
          <span className="text-bblue font-light hidden sm:block">|</span>
          <span className="text-gray-300 text-sm hidden sm:block">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <span className="bg-bblue text-white text-xs px-2 py-0.5 rounded-full font-medium">Admin</span>
          )}
          <button onClick={signOut} className="text-gray-400 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
