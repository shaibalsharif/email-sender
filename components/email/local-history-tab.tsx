"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Download, Check, Clock, X, ChevronDown, ChevronUp, Mail, Package, RefreshCw, Play, Eye, User } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Spinner } from "@/components/ui/spinner"
import { useSecretVerification } from "@/components/security/use-secret-verification"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

interface EmailRecord {
  id: number;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  image_url?: string;
  custom_fields?: Record<string, any>;
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
const RETRY_COUNTDOWN = 10;
const SMALL_PENDING_THRESHOLD = 20;

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
  const { toast } = useToast();
  const [batchGroups, setBatchGroups] = useState<BatchGroup[]>([])
  const [filteredGroups, setFilteredGroups] = useState<BatchGroup[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [manuallyCollapsedIds, setManuallyCollapsedIds] = useState<Set<string>>(new Set());
  const [retryBatch, setRetryBatch] = useState<BatchGroup | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(RETRY_COUNTDOWN);
  const [isRetrying, setIsRetrying] = useState(false);
  const [previewEmail, setPreviewEmail] = useState<EmailRecord | null>(null);
  const { requireVerification, VerificationDialog } = useSecretVerification()

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

  // Auto-retry countdown
  useEffect(() => {
    if (!retryBatch || retryCountdown === 0) return;

    const timer = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          executeRetry(retryBatch);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [retryBatch, retryCountdown]);

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

  const canRetry = (batch: BatchGroup): boolean => {
    // Failed batches can always be retried
    if (batch.status === 'failed') return true;

    // Small pending batches (< 20 emails) can be retried
    if (batch.status === 'pending' && batch.count < SMALL_PENDING_THRESHOLD) return true;

    return false;
  };

  const handleRetryClick = (batch: BatchGroup) => {
    setRetryBatch(batch);
    setRetryCountdown(RETRY_COUNTDOWN);
  };



  const executeRetry = async (batch: BatchGroup) => {
    if (isRetrying) return
    const ok = await requireVerification({ actionLabel: `retry batch #${batch.batchIndex}` })
    if (!ok) {
      setRetryBatch(null)
      setRetryCountdown(RETRY_COUNTDOWN)
      return
    }
    setIsRetrying(true)
    setRetryBatch(null)
    setRetryCountdown(RETRY_COUNTDOWN)

    try {
      const configResponse = await fetch("/api/config")
      const config = await configResponse.json()

      const firstRecord = batch.records[0]
      const originalRecordIds = batch.records.map((r) => r.id)

      const recipients = batch.records.map((r) => ({
        email: r.recipient_email,
        name: r.recipient_name,
        custom_fields: r.custom_fields || {},
      }))

      const formData = new FormData()
      formData.append("subjectTemplate", firstRecord.subject)
      formData.append("bodyTemplate", firstRecord.body)
      formData.append("imageUrl", firstRecord.image_url || "")
      formData.append("mailgunDomain", config.mailgunDomain)
      formData.append("fromEmail", config.fromEmail)
      formData.append("fromName", config.fromName)
      formData.append("batchName", batch.batchName)
      formData.append("batchRecipients", JSON.stringify(recipients))
      formData.append("originalRecordIds", JSON.stringify(originalRecordIds))

      // Retrieve and attach file from session storage
      const attachmentData = sessionStorage.getItem("campaignAttachment")
      const attachmentName = sessionStorage.getItem("campaignAttachmentName")

      if (attachmentData && attachmentName) {
        const base64Response = await fetch(attachmentData)
        const blob = await base64Response.blob()
        const file = new File([blob], attachmentName, { type: blob.type })
        formData.append("attachment", file)
        formData.append("attachmentFileName", attachmentName)
      }


      toast({
        title: "Retrying Batch",
        description: `Sending Batch ${batch.batchIndex} (${batch.count} emails)...`,
        variant: "default",
      })

      const response = await fetch("/api/send-email", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        toast({
          title: "Batch Sent! 🎉",
          description: `Batch ${batch.batchIndex} sent successfully (${batch.count} emails).`,
          variant: "default",
        })

        // Update state locally instead of reloading
        const now = new Date().toISOString()
        setBatchGroups((prevGroups) =>
          prevGroups.map((group) => {
            if (group.batchName === batch.batchName && group.batchIndex === batch.batchIndex) {
              const updatedRecords = group.records.map((record) => ({
                ...record,
                status: "sent",
                sent_at: now,
              }))


              return {
                ...group,
                status: "sent" as const,
                records: updatedRecords,
                sentCount: group.count,
                failedCount: 0,
                pendingCount: 0,
              }
            }
            return group
          }),
        )
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to send batch.")
      }
    } catch (error) {
      console.error("Retry error:", error)
      toast({
        title: "Retry Failed",
        description: `Could not send batch: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      })

      // Update state to mark as failed
      setBatchGroups((prevGroups) =>
        prevGroups.map((group) => {
          if (group.batchName === batch.batchName && group.batchIndex === batch.batchIndex) {
            const updatedRecords = group.records.map((record) => ({
              ...record,
              status: "failed",
            }))


            return {
              ...group,
              status: "failed" as const,
              records: updatedRecords,
              sentCount: 0,
              failedCount: group.count,
              pendingCount: 0,
            }
          }
          return group
        }),
      )
    } finally {
      setIsRetrying(false)
    }
  }

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

  // Process email body for preview
  const processEmailBodyForPreview = (content: string): string => {
    if (!content) return ''
    let rawContent = content;

    // Protect variables from processing
    const variablePlaceholders = new Map<string, string>();
    rawContent = rawContent.replace(/(\{\{.*?\}\})/g, (match) => {
      const placeholder = `__VAR_${variablePlaceholders.size}__`;
      variablePlaceholders.set(placeholder, match);
      return placeholder;
    });

    rawContent = rawContent.replace(/^([০-৯]+\।\s*.*?)$/gm, "<h3 style='margin: 15px 0 10px; font-size: 18px; line-height: 1.2;'>$1</h3>")
    const listBlockRegex = /(<h3[^>]*>.*?<\/h3>\n)((?:[^\n].*\n?)+?)(?=(<h3[^>]*>.*?<\/h3>|\n{2,}|$))/g;
    rawContent = rawContent.replace(listBlockRegex, (match, header, content) => {
      content = content.trim();
      if (!content) return header;
      const listItems = content.split(/\n/);
      const listHtml = listItems.filter((item: any) => item.trim() !== '').map((item: any) => `<li>${item.trim()}</li>`).join('');
      return `${header}<ul style="padding-left: 20px; margin: 5px 0 15px; list-style-type: disc;">${listHtml}</ul>\n`;
    });
    rawContent = rawContent.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    rawContent = rawContent.replace(/\n/g, "<br/>")
    rawContent = rawContent.replace(/<br\/><h3/g, '<h3')
    rawContent = rawContent.replace(/<\/h3><br\/>/g, '</h3>')

    // Restore variables
    variablePlaceholders.forEach((original, placeholder) => {
      rawContent = rawContent.replace(placeholder, original);
    });

    return rawContent;
  }

  // Personalize content for specific recipient
  const personalizeContent = (template: string, record: EmailRecord): string => {
    const allFields: Record<string, any> = {
      name: record.recipient_name,
      email: record.recipient_email,
      ...(record.custom_fields || {})
    };

    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      return allFields[key] ?? `{{${key}}}`;
    });
  };


  if (isLoading) {
    return <div className="text-center py-8">Loading history...</div>
  }

  return (
    <div className="space-y-6 bg-black">
      <div className="sticky z-10 top-[5vh] bg-black pb-2">
        <div >
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
          <Button variant="outline" onClick={loadHistory} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>


      <ScrollArea className="h-full border rounded-lg">
        <div className="p-4 space-y-3">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No history found matching current filters.</div>
          ) : (
            filteredGroups.map((group) => {
              const key = `${group.batchName}-${group.batchIndex}`;
              const showRetry = canRetry(group);

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
                      {showRetry && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetryClick(group);
                          }}
                          disabled={isRetrying}
                          className="ml-2"
                        >
                          {isRetrying ? (
                            <Spinner className="w-3 h-3 mr-1" />
                          ) : (
                            <RefreshCw className="w-3 h-3 mr-1" />
                          )}
                          Retry
                        </Button>
                      )}
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
                              <div className="ml-4 flex items-center gap-2">
                                {getStatusBadge(record.status)}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewEmail(record);
                                  }}
                                  className="h-7 px-2"
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Preview
                                </Button>
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

      {/* Retry Confirmation Modal */}
      <Dialog open={!!retryBatch} onOpenChange={(open) => !open && setRetryBatch(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl text-blue-600">
              <RefreshCw className="w-6 h-6" /> Confirm Batch Retry
            </DialogTitle>
            <DialogDescription>
              About to retry Batch #{retryBatch?.batchIndex} ({retryBatch?.count} emails).
              {retryBatch?.status === 'failed' && ' This batch previously failed.'}
              {retryBatch?.status === 'pending' && ' This is a small pending batch.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-center space-y-4">
              <div className="text-6xl font-extrabold text-red-600">
                {retryCountdown}
              </div>
              <p className="text-sm text-muted-foreground">
                Auto-send in seconds
              </p>
            </div>

            <Card className="p-4 bg-muted/30">
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-semibold">{retryBatch?.status.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipients:</span>
                  <span className="font-semibold">{retryBatch?.count} emails</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Batch:</span>
                  <span className="font-semibold">#{retryBatch?.batchIndex}</span>
                </div>
              </div>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRetryBatch(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => retryBatch && executeRetry(retryBatch)}
              disabled={isRetrying}
            >
              {isRetrying ? <Spinner className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview Modal */}
      <Dialog open={!!previewEmail} onOpenChange={(open) => !open && setPreviewEmail(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[90vw] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" /> Email Preview
            </DialogTitle>
            <DialogDescription>
              Preview of the email as sent/scheduled for the recipient
            </DialogDescription>
          </DialogHeader>

          <Separator className="mx-6" />

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {previewEmail && (
              <>
                {/* Recipient Info Card */}
                <Card className="p-4 space-y-3 bg-muted/50">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">
                      {previewEmail.recipient_name} &lt;{previewEmail.recipient_email}&gt;
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-3 border-t text-xs">
                    <div>
                      <div className="text-muted-foreground">Status:</div>
                      <div className="font-semibold mt-1">
                        {getStatusBadge(previewEmail.status)}
                      </div>
                    </div>
                    {previewEmail.sent_at && (
                      <div>
                        <div className="text-muted-foreground">Sent At:</div>
                        <div className="font-semibold mt-1">
                          {new Date(previewEmail.sent_at).toLocaleString()}
                        </div>
                      </div>
                    )}
                    {previewEmail.batch_name && (
                      <div>
                        <div className="text-muted-foreground">Batch:</div>
                        <div className="font-semibold mt-1">
                          {previewEmail.batch_name} #{previewEmail.batch_index}
                        </div>
                      </div>
                    )}
                    {previewEmail.mailgun_message_id && (
                      <div className="col-span-2">
                        <div className="text-muted-foreground">Message ID:</div>
                        <div className="font-mono text-xs mt-1 truncate">
                          {previewEmail.mailgun_message_id}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-muted-foreground">Created At:</div>
                      <div className="font-semibold mt-1">
                        {new Date(previewEmail.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="text-xs text-muted-foreground">Subject:</div>
                    <div className="font-semibold mt-1">
                      {personalizeContent(previewEmail.subject, previewEmail)}
                    </div>
                  </div>
                </Card>

                {/* Email Body Preview */}
                <Card className="p-4 space-y-3 bg-white dark:bg-slate-950 border">
                  <div className="text-xs text-muted-foreground mb-2">Email Body (Personalized):</div>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{
                      __html: processEmailBodyForPreview(personalizeContent(previewEmail.body, previewEmail)),
                    }}
                  />
                  {previewEmail.image_url && (
                    <div className="pt-3 border-t">
                      <img
                        src={previewEmail.image_url}
                        alt="Email image"
                        className="w-full h-auto max-h-[400px] object-contain"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setPreviewEmail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {VerificationDialog}
    </div>
  )
}