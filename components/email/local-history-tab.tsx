"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, Check, Clock, X, ChevronDown, ChevronUp, Mail, Package } from "lucide-react"

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
  batch_index?: number;
}

interface BatchGroup {
  batchName: string;
  batchIndex: number;
  count: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  status: 'sent' | 'pending' | 'failed' | 'validation_failed' | 'mixed';
  records: EmailRecord[];
  createdAt: string;
}

const SMALL_BATCH_LIMIT = 3;

const getStatusBorderColor = (status: BatchGroup['status']): string => {
  switch (status) {
    case 'sent': return 'border-green-400 dark:border-green-600';
    case 'pending': return 'border-orange-400 dark:border-orange-600';
    case 'failed': return 'border-red-400 dark:border-red-600';
    case 'validation_failed': return 'border-red-600 dark:border-red-800';
    case 'mixed': return 'border-yellow-400 dark:border-yellow-600';
    default: return 'border-border';
  }
}

export default function HistoryTab() {
  const [batchGroups, setBatchGroups] = useState<BatchGroup[]>([])
  const [filteredGroups, setFilteredGroups] = useState<BatchGroup[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [manuallyCollapsedIds, setManuallyCollapsedIds] = useState<Set<string>>(new Set());

  const loadHistory = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/email-history")
      if (response.ok) {
        const data: EmailRecord[] = await response.json();
        
        // Group by batch_name and batch_index
        const batchMap = new Map<string, BatchGroup>();
        
        data.forEach((record) => {
          const batchName = record.batch_name || 'No-Batch';
          const batchIndex = record.batch_index || 0;
          const key = `${batchName}-${batchIndex}`;
          
          if (!batchMap.has(key)) {
            batchMap.set(key, {
              batchName,
              batchIndex,
              count: 0,
              sentCount: 0,
              failedCount: 0,
              pendingCount: 0,
              status: 'pending',
              records: [],
              createdAt: record.created_at
            });
          }
          
          const batch = batchMap.get(key)!;
          batch.count++;
          batch.records.push(record);
          
          // Count statuses
          if (record.status === 'sent') batch.sentCount++;
          else if (record.status === 'failed') batch.failedCount++;
          else if (record.status === 'pending') batch.pendingCount++;
        });
        
        // Determine overall batch status
        const batches = Array.from(batchMap.values()).map(batch => {
          let status: BatchGroup['status'] = 'pending';
          
          if (batch.sentCount === batch.count) {
            status = 'sent';
          } else if (batch.failedCount === batch.count) {
            status = 'failed';
          } else if (batch.sentCount > 0 || batch.failedCount > 0) {
            status = 'mixed';
          } else if (batch.records.some(r => r.status === 'validation_failed')) {
            status = 'validation_failed';
          }
          
          return { ...batch, status };
        });
        
        // Sort by batch_index (ascending)
        batches.sort((a, b) => a.batchIndex - b.batchIndex);
        
        setBatchGroups(batches);
      } else {
        setBatchGroups([])
      }
    } catch (error) {
      console.error('Error loading history:', error);
      setBatchGroups([])
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    let filtered = batchGroups

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
  }, [batchGroups, statusFilter, searchTerm])

  const stats = useMemo(() => {
    const allRecords = batchGroups.flatMap(g => g.records);
    return {
      total: allRecords.length,
      sent: allRecords.filter((h) => h.status === "sent").length,
      pending: allRecords.filter((h) => h.status === "pending").length,
      failed: allRecords.filter((h) => h.status === "failed").length,
      validation_failed: allRecords.filter((h) => h.status === "validation_failed").length,
    }
  }, [batchGroups])
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent': return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Sent</Badge>;
      case 'pending': return <Badge variant="secondary" className="bg-orange-500 hover:bg-orange-600 text-white">Pending</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      case 'validation_failed': return <Badge variant="destructive" className="bg-red-700">Validation Failed</Badge>;
      case 'mixed': return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-black">Mixed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  }
  
  const isGroupExpanded = (key: string, count: number) => {
    if (count <= SMALL_BATCH_LIMIT) return true;
    return !manuallyCollapsedIds.has(key);
  }

  const handleToggleExpand = (key: string, count: number) => {
    if (count <= SMALL_BATCH_LIMIT) return;
    
    setManuallyCollapsedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const handleExport = () => {
    const allRecords = filteredGroups.flatMap(g => g.records);
    
    const csv = [
      ["Batch Name", "Batch Index", "Email", "Name", "Subject", "Status", "Sent At", "Created At"],
      ...allRecords.map((r) => [
        r.batch_name || 'No-Batch',
        r.batch_index?.toString() || '0',
        r.recipient_email,
        r.recipient_name,
        r.subject,
        r.status,
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
        <h2 className="text-xl font-semibold mb-4">Email History (By Batch)</h2>
        <div className="grid grid-cols-5 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total Emails</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
            <div className="text-xs text-muted-foreground">Sent</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-800">{stats.validation_failed}</div>
            <div className="text-xs text-muted-foreground">Validation Failed</div>
          </Card>
        </div>
      </div>

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
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="validation_failed">Validation Failed</option>
          <option value="mixed">Mixed</option>
        </select>
        <Button variant="outline" onClick={handleExport} disabled={filteredGroups.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      <ScrollArea className="h-96 border rounded-lg">
        <div className="p-4 space-y-3">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No history found matching current filters.</div>
          ) : (
            filteredGroups.map((group) => {
              const key = `${group.batchName}-${group.batchIndex}`;
              return (
                <Card 
                  key={key}
                  className={`p-0 border-2 ${getStatusBorderColor(group.status)}`}
                >
                  <div 
                    className={`p-3 ${group.count > SMALL_BATCH_LIMIT ? 'cursor-pointer hover:bg-muted/70' : 'bg-muted/30'} flex justify-between items-center`}
                    onClick={() => handleToggleExpand(key, group.count)}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-primary" />
                      <div className="space-y-1">
                        <div className="font-semibold">Batch #{group.batchIndex}</div>
                        <div className="text-xs text-muted-foreground">{group.batchName}</div>
                      </div>
                      {getStatusBadge(group.status)}
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-600" /> {group.sentCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-orange-600" /> {group.pendingCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <X className="w-3 h-3 text-red-600" /> {group.failedCount}
                      </span>
                      <span className="font-bold">Total: {group.count}</span>
                      
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(group.createdAt).toLocaleString()}
                      </div>
                      
                      {group.count > SMALL_BATCH_LIMIT && (
                        isGroupExpanded(key, group.count) ? 
                          <ChevronUp className="w-4 h-4" /> : 
                          <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                  
                  {isGroupExpanded(key, group.count) && (
                    <div className="border-t bg-background/50">
                      <ScrollArea className={group.count > 10 ? "h-40" : ""}>
                        <div className="divide-y">
                          {group.records.map((record) => (
                            <div 
                              key={record.id}
                              className="py-2 px-4 text-sm flex justify-between items-center hover:bg-secondary/50"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {record.recipient_name} &lt;{record.recipient_email}&gt;
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {record.subject}
                                </div>
                              </div>
                              <div className="ml-4">
                                {getStatusBadge(record.status)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}