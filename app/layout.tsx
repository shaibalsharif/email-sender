// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/layout.tsx

import "./globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"] })

// --- NEW: Export metadata for SEO/Title/Favicon ---
export const metadata = {
  title: "Email Campaign Manager | BIP Sender",
  description: "Advanced Mailgun-based email campaign scheduler and contact manager with dynamic rate limiting.",
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
    ],
    apple: '/apple-icon.png',
  },
}
// --- END NEW METADATA ---

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}