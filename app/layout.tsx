import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "BNAS Portal",
  description: "BNAS Artist Management Portal",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
