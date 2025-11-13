"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { CheckCircle2, AlertTriangle, Lock } from "lucide-react"

interface ConfigTabProps {
  onConfigSaved: (config: any) => void
}

export default function ConfigTab({ onConfigSaved }: ConfigTabProps) {
  const [mailgunDomain, setMailgunDomain] = useState("")
  const [fromEmail, setFromEmail] = useState("")
  const [fromName, setFromName] = useState("")
  const [isFromEnv, setIsFromEnv] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/config")
        const config = await response.json()
        if (config) {
          setMailgunDomain(config.mailgunDomain || "")
          setFromEmail(config.fromEmail || "")
          setFromName(config.fromName || "")
          setIsFromEnv(config.isFromEnv || false)
        }
      } catch (error) {
        console.error("Error fetching config:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const handleSave = async () => {
    if (!mailgunDomain || !fromEmail) {
      alert("Please fill in all required fields")
      return
    }

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailgunDomain, fromEmail, fromName }),
      })

      if (response.ok) {
        onConfigSaved({ mailgunDomain, fromEmail, fromName, isFromEnv })
        setShowSaved(true)
        setTimeout(() => setShowSaved(false), 3000)
      }
    } catch (error) {
      alert("Failed to save configuration")
      console.error(error)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading configuration...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Mailgun Configuration</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {isFromEnv
            ? "Configuration is loaded from environment variables (read-only)."
            : "Enter your Mailgun credentials. Settings are saved to the database."}
        </p>
      </div>

      {showSaved && (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            Configuration saved successfully!
          </AlertDescription>
        </Alert>
      )}

      {isFromEnv && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <div className="flex gap-3">
            <Lock className="w-5 h-5 flex-shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">Environment Variables Detected</p>
              <p className="text-blue-800 dark:text-blue-200 text-xs">
                Your Mailgun credentials are securely configured via environment variables. These settings are read-only
                for security.
              </p>
            </div>
          </div>
        </Card>
      )}

      {!isFromEnv && (
        <Card className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-100 mb-2">Note: API Key Not Stored</p>
              <p className="text-amber-800 dark:text-amber-200 text-xs">
                For security, we do not store your Mailgun API key. Set MAILGUN_API_KEY in your environment variables
                for production use.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Mailgun Domain <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="e.g., mg.example.com"
            value={mailgunDomain}
            onChange={(e) => setMailgunDomain(e.target.value)}
            disabled={isFromEnv}
          />
          <p className="text-xs text-muted-foreground mt-1">Get this from your Mailgun dashboard</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            From Email <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="noreply@example.com"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            disabled={isFromEnv}
          />
          <p className="text-xs text-muted-foreground mt-1">Must be verified in your Mailgun account</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">From Name</label>
          <Input
            placeholder="Your Company Name"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            disabled={isFromEnv}
          />
        </div>
      </div>

      {!isFromEnv && (
        <Button onClick={handleSave} className="w-full">
          Save Configuration to Database
        </Button>
      )}
    </div>
  )
}
