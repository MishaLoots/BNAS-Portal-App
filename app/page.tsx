"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/login"); return }
      supabase.table("profiles").select("is_admin").eq("id", session.user.id).single()
        .then(({ data }) => {
          router.replace(data?.is_admin ? "/admin" : "/artist")
        })
    })
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )
}
