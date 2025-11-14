// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/components/email/history-tab.tsx

"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, Check, Clock, X, ChevronDown, ChevronUp, Mail } from "lucide-react"

// Interface for the grouped history structure returned by the API
interface EmailRecord {
  id: number;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  status: string;
  sent_at?: string;
  created_at: string;
  scheduled_at?: string;
  mailgun_message_id?: string;
  batch_name?: string;
}

interface HistoryGroup {
    batchId: string;
    batchName: string;
    scheduledAt: string; // ISO string (the time used for sorting/display)
    count: number;
    sentCount: number;
    failedCount: number;
    status: 'scheduled' | 'pending' | 'sent' | 'failed' | 'no-batch';
    records: EmailRecord[];
}

// Constant for small batch size
const SMALL_BATCH_LIMIT = 3;

// Helper to determine border color based on status
const getStatusBorderColor = (status: HistoryGroup['status']): string => {
    switch (status) {
        case 'sent': return 'border-green-400 dark:border-green-600';
        case 'scheduled': return 'border-blue-400 dark:border-blue-600';
        case 'pending': return 'border-yellow-400 dark:border-yellow-600';
        case 'failed': return 'border-red-400 dark:border-red-600';
        default: return 'border-border';
    }
}


export default function HistoryTab() {
  const [groupedHistory, setGroupedHistory] = useState<HistoryGroup[]>([])
  const [filteredGroups, setFilteredGroups] = useState<HistoryGroup[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  
  // Track manually collapsed batches (small batches cannot be manually collapsed)
  const [manuallyCollapsedIds, setManuallyCollapsedIds] = useState<Set<string>>(new Set());

  const loadHistory = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/email-history")
      if (response.ok) {
        const data: HistoryGroup[] = await response.json();
        setGroupedHistory(data)
      } else {
        setGroupedHistory([])
      }
    } catch (error) {
      setGroupedHistory([])
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    loadHistory()
  }, [])

  // Filter groups based on search term and status filter
  useEffect(() => {
    let filtered = groupedHistory

    if (statusFilter !== "all") {
      filtered = filtered.filter((g) => g.status === statusFilter)
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (g) =>
          g.batchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          g.records.some(r => 
              r.recipient_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
              r.recipient_name.toLowerCase().includes(searchTerm.toLowerCase())
          )
      )
    }

    setFilteredGroups(filtered)
  }, [groupedHistory, statusFilter, searchTerm])

  const stats = useMemo(() => {
      const allRecords = groupedHistory.flatMap(g => g.records);
      return {
        total: allRecords.length,
        sent: allRecords.filter((h) => h.status === "sent").length,
        scheduled: allRecords.filter((h) => h.status === "scheduled").length,
        failed: allRecords.filter((h) => h.status === "failed").length,
        pending: allRecords.filter((h) => h.status === "pending").length,
    }
  }, [groupedHistory])
  
  const getStatusBadge = (status: HistoryGroup['status']) => {
    switch (status) {
        case 'sent': return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Sent</Badge>;
        case 'scheduled': return <Badge variant="secondary" className="bg-blue-500 hover:bg-blue-600">Scheduled</Badge>;
        case 'pending': return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-black">Pending</Badge>;
        case 'failed': return <Badge variant="destructive">Failed</Badge>;
        case 'no-batch': return <Badge variant="outline">No Batch</Badge>;
        default: return <Badge variant="outline">Unknown</Badge>;
    }
  }
  
  const isGroupExpanded = (batchId: string, count: number) => {
    // If count is small (<= 3), it's auto-expanded and cannot be manually collapsed
    if (count <= SMALL_BATCH_LIMIT) {
        return true;
    }
    // Otherwise, check if it's NOT in the manually collapsed set
    return !manuallyCollapsedIds.has(batchId);
  }

  const handleToggleExpand = (batchId: string, count: number) => {
    // Prevent toggling if the batch is small (Issue 2 requirement)
    if (count <= SMALL_BATCH_LIMIT) {
        return; 
    }
    
    setManuallyCollapsedIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(batchId)) {
            newSet.delete(batchId);
        } else {
            newSet.add(batchId);
        }
        return newSet;
    });
  };

  const handleExport = () => {
    const allRecords = filteredGroups.flatMap(g => g.records);
    
    const csv = [
      ["Batch Name", "Email", "Name", "Subject", "Status", "Scheduled At", "Sent At", "Created At"],
      ...allRecords.map((r) => [
        r.batch_name || 'No-Name Batch',
        r.recipient_email,
        r.recipient_name,
        r.subject,
        r.status,
        r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "",
        r.sent_at ? new Date(r.sent_at).toLocaleString() : "",
        new Date(r.created_at).toLocaleString(),
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `email-history-export-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading history...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Email History (Grouped)</h2>
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
            <div className="text-2xl font-bold text-blue-600">{stats.scheduled + stats.pending}</div>
            <div className="text-xs text-muted-foreground">Scheduled/Pending</div>
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
          placeholder="Search batch name or recipient..."
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
          <option value="scheduled">Scheduled</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="no-batch">No Batch</option>
        </select>
        <Button variant="outline" onClick={handleExport} disabled={filteredGroups.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Grouped History List */}
      <ScrollArea className="h-96 border rounded-lg">
        <div className="p-4 space-y-3">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No history found matching current filters.</div>
          ) : (
            filteredGroups.map((group) => (
              <Card 
                key={group.batchId} 
                className={`p-0 border-2 ${getStatusBorderColor(group.status)}`} // ADDED status border
              >
                  <div 
                    // Adjusted padding for compactness
                    className={`p-2 ${group.count > SMALL_BATCH_LIMIT ? 'cursor-pointer hover:bg-muted/70' : 'bg-muted/30'} flex justify-between items-center`}
                    onClick={() => handleToggleExpand(group.batchId, group.count)}
                  >
                      <div className="flex items-center gap-3">
                          <Mail className="w-4 h-4 text-primary" />
                          <div className="font-semibold text-sm">{group.batchName}</div>
                          {getStatusBadge(group.status)}
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                              <Check className="w-3 h-3 text-green-600" /> {group.sentCount}
                          </span>
                          <span className="flex items-center gap-1">
                              <X className="w-3 h-3 text-red-600" /> {group.failedCount}
                          </span>
                          <span className="font-bold">Total: {group.count}</span>
                          
                          <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(group.scheduledAt).toLocaleString()}
                          </div>
                          
                          {/* Chevron only shows if batch is large enough to collapse */}
                          {group.count > SMALL_BATCH_LIMIT && (isGroupExpanded(group.batchId, group.count) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                      </div>
                  </div>
                  
                  {/* Expanded Mail List */}
                  {isGroupExpanded(group.batchId, group.count) && (
                      // Removed inner padding to let ScrollArea handle it
                      <div className="border-t bg-background/50">
                          <ScrollArea className={group.count > 10 ? "h-40 border-t border-b" : ""}>
                              <div className="divide-y">
                                  {group.records.map((record) => (
                                      <div 
                                        key={record.id} 
                                        // Minimized padding and font size for compactness
                                        className="py-1.5 px-3 text-xs flex justify-between items-center hover:bg-secondary/50"
                                      >
                                          <span className="font-medium">{record.recipient_name} &lt;{record.recipient_email}&gt;</span>
                                          {getStatusBadge(record.status as any)}
                                      </div>
                                  ))}
                              </div>
                          </ScrollArea>
                      </div>
                  )}
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}