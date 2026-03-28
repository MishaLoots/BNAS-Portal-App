"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/login"); return }
      supabase.from("profiles").select("is_admin, artist_id, agent_id").eq("id", session.user.id).single()
        .then(({ data }) => {
          if (data?.is_admin) router.replace("/admin")
          else if (data?.agent_id) router.replace("/agent")
          else router.replace("/artist")
        })
    })
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )
}
