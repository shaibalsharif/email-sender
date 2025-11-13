"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download } from "lucide-react"

interface EmailRecord {
  id: number
  recipient_email: string
  recipient_name: string
  subject: string
  status: string
  sent_at?: string
  created_at: string
}

export default function HistoryTab() {
  const [history, setHistory] = useState<EmailRecord[]>([])
  const [filteredHistory, setFilteredHistory] = useState<EmailRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch("/api/email-history")
        if (response.ok) {
          const data = await response.json()
          setHistory(data)
        } else {
          setHistory([])
        }
      } catch (error) {
        setHistory([])
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [])

  useEffect(() => {
    let filtered = history

    if (statusFilter !== "all") {
      filtered = filtered.filter((h) => h.status === statusFilter)
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (h) =>
          h.recipient_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          h.recipient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          h.subject.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    setFilteredHistory(filtered)
  }, [history, statusFilter, searchTerm])

  const stats = {
    total: history.length,
    sent: history.filter((h) => h.status === "sent").length,
    failed: history.filter((h) => h.status === "failed").length,
    pending: history.filter((h) => h.status === "pending").length,
  }

  const handleExport = () => {
    const csv = [
      ["Email", "Name", "Subject", "Status", "Sent At", "Created At"],
      ...filteredHistory.map((h) => [
        h.recipient_email,
        h.recipient_name,
        h.subject,
        h.status,
        h.sent_at || "",
        h.created_at,
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `email-history-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading history...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Email History</h2>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Emails</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
            <div className="text-xs text-muted-foreground">Sent</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Search by email, name, or subject..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 min-w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-input bg-background"
        >
          <option value="all">All Status</option>
          <option value="sent">Sent</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <Button variant="outline" onClick={handleExport} disabled={filteredHistory.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* History List */}
      <ScrollArea className="h-96 border rounded-lg">
        <div className="p-4 space-y-2">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No email history</div>
          ) : (
            filteredHistory.map((record) => (
              <div key={record.id} className="p-3 bg-muted rounded hover:bg-muted/80 border">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <div className="font-medium">{record.recipient_email}</div>
                    <div className="text-sm text-muted-foreground">{record.recipient_name}</div>
                  </div>
                  <Badge
                    variant={
                      record.status === "sent" ? "default" : record.status === "pending" ? "secondary" : "destructive"
                    }
                  >
                    {record.status}
                  </Badge>
                </div>
                <div className="text-sm mb-1">{record.subject}</div>
                <div className="text-xs text-muted-foreground">{new Date(record.created_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
