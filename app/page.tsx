"use client"

import { useState, useEffect } from "react"
import ConfigTab from "@/components/email/config-tab"
import ContactsTab from "@/components/email/contacts-tab"
import ComposeTab from "@/components/email/compose-tab"
import HistoryTab from "@/components/email/history-tab"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export default function EmailApp() {
  const [activeTab, setActiveTab] = useState<"config" | "contacts" | "compose" | "history">("config")
  const [isTestingMode, setIsTestingMode] = useState(false)
  const [config, setConfig] = useState<{
    mailgunDomain: string
    fromEmail: string
    fromName: string
    isFromEnv: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/config")
        const data = await response.json()
        if (data) {
          setConfig(data)
        }
      } catch (error) {
        console.error("Error loading config:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const isConfigValid = config?.mailgunDomain && config?.fromEmail && config?.isFromEnv

  const handleTestingModeChange = (checked: boolean) => {
    if (!checked) {
      if (!window.confirm("WARNING: Disabling Testing Mode will allow sending to ALL contacts without limits (up to Mailgun plan limits). Are you sure you want to proceed?")) {
        return
      }
    }
    setIsTestingMode(checked)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Email Campaign Manager</h1>
          <p className="text-muted-foreground">Send personalized emails with Mailgun</p>
        </div>
        
        <div className="flex items-center space-x-2 mb-6 p-4 border rounded-lg bg-yellow-50/50 dark:bg-yellow-950/30">
          <Checkbox 
            id="testing-mode" 
            checked={isTestingMode} 
            onCheckedChange={handleTestingModeChange}
          />
          <Label htmlFor="testing-mode" className="text-sm font-medium">
            Enable Testing Mode (Max 5 emails per campaign, max 10/min rate limit)
          </Label>
        </div>

        <div className="flex gap-2 mb-6 border-b border-border">
          <Button
            variant={activeTab === "config" ? "default" : "ghost"}
            onClick={() => setActiveTab("config")}
            className="rounded-b-none"
          >
            Configuration
          </Button>
          <Button
            variant={activeTab === "contacts" ? "default" : "ghost"}
            onClick={() => setActiveTab("contacts")}
            disabled={!isConfigValid}
            className="rounded-b-none"
          >
            Contacts
          </Button>
          <Button
            variant={activeTab === "compose" ? "default" : "ghost"}
            onClick={() => setActiveTab("compose")}
            disabled={!isConfigValid}
            className="rounded-b-none"
          >
            Compose
          </Button>
          <Button
            variant={activeTab === "history" ? "default" : "ghost"}
            onClick={() => setActiveTab("history")}
            disabled={!isConfigValid}
            className="rounded-b-none"
          >
            History
          </Button>
        </div>

        <Card className="p-6">
          {loading ? (
            <div className="text-center py-8">Loading configuration...</div>
          ) : (
            <>
              {activeTab === "config" && <ConfigTab onConfigSaved={setConfig} />}
              {activeTab === "contacts" && <ContactsTab />}
              {activeTab === "compose" && <ComposeTab config={config} isTestingMode={isTestingMode} />}
              {activeTab === "history" && <HistoryTab />}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}