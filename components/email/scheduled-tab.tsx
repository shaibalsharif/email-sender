"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, Calendar, Play, Clock, CheckCircle2, Package, RefreshCw, Users } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface BatchGroup {
  batchName: string;
  batchIndex: number;
  count: number;
  records: any[];
  status: 'pending' | 'sent' | 'validation_failed';
  batchMode?: 'legacy' | 'standard';
}

const AUTO_SEND_COUNTDOWN = 10;

// Batch interval mapping
const BATCH_INTERVALS = {
  legacy: 7 * 60 * 1000, // 7 minutes
  standard: 10 * 60 * 1000, // 10 minutes
}

export default function ScheduledTab() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<BatchGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<BatchGroup | null>(null);
  const [confirmCountdown, setConfirmCountdown] = useState(AUTO_SEND_COUNTDOWN);
  const [lastSentTime, setLastSentTime] = useState<number | null>(null);
  const [intervalCountdown, setIntervalCountdown] = useState<string>('');
  const [currentBatchMode, setCurrentBatchMode] = useState<'legacy' | 'standard'>('standard');

  const fetchBatches = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/email-history");
      if (response.ok) {
        const data = await response.json();
        
        // Group by batchName and batchIndex
        const batchMap = new Map<string, BatchGroup>();
        
        data.forEach((record: any) => {
          const key = `${record.batch_name}-${record.batch_index}`;
          if (!batchMap.has(key)) {
            batchMap.set(key, {
              batchName: record.batch_name,
              batchIndex: record.batch_index,
              count: 0,
              records: [],
              status: record.status,
              batchMode: record.batch_mode || 'legacy'
            });
          }
          const batch = batchMap.get(key)!;
          batch.count++;
          batch.records.push(record);
        });
        
        // Convert to array and sort by batch index
        const batchArray = Array.from(batchMap.values()).sort((a, b) => a.batchIndex - b.batchIndex);
        
        setBatches(batchArray);
        
        // Find last sent time and determine current batch mode
        const sentBatches = batchArray.filter(b => b.status === 'sent');
        if (sentBatches.length > 0) {
          const lastSent = sentBatches[sentBatches.length - 1];
          const lastSentRecord = lastSent.records.find(r => r.sent_at);
          if (lastSentRecord) {
            setLastSentTime(new Date(lastSentRecord.sent_at).getTime());
          }
          setCurrentBatchMode(lastSent.batchMode || 'standard');
        } else {
          // Check if there are pending batches and use their mode
          const pendingBatches = batchArray.filter(b => b.status === 'pending');
          if (pendingBatches.length > 0) {
            setCurrentBatchMode(pendingBatches[0].batchMode || 'standard');
          } else {
            // Fall back to session storage
            const storedMode = sessionStorage.getItem('batchMode') as 'legacy' | 'standard' | null;
            setCurrentBatchMode(storedMode || 'standard');
          }
        }
      } else {
        throw new Error("Failed to fetch batches.");
      }
    } catch (error) {
      console.error("Fetch error:", error);
      toast({
        title: "Error",
        description: `Could not fetch batches: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
      setBatches([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const currentBatchInterval = BATCH_INTERVALS[currentBatchMode];

  // Interval countdown timer - updates every second
  useEffect(() => {
    if (!lastSentTime) {
      setIntervalCountdown('No batches sent yet');
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const nextAllowedTime = lastSentTime + currentBatchInterval;
      const remaining = nextAllowedTime - now;

      if (remaining <= 0) {
        setIntervalCountdown('Ready to send next batch!');
      } else {
        const minutes = Math.floor(remaining / (60 * 1000));
        const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
        setIntervalCountdown(`${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastSentTime, currentBatchInterval]);

  // Auto-send countdown for confirmation modal
  useEffect(() => {
    if (!confirmBatch || confirmCountdown === 0) return;

    const timer = setInterval(() => {
      setConfirmCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          executeBatch(confirmBatch);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [confirmBatch, confirmCountdown]);

  // Check if ready to send
  const isReadyToSend = () => {
    if (!lastSentTime) return true;
    const now = Date.now();
    return (now - lastSentTime) >= currentBatchInterval;
  };

  const executeBatch = async (batch: BatchGroup) => {
    if (isExecuting) return;
    setIsExecuting(true);
    setConfirmBatch(null);
    setConfirmCountdown(AUTO_SEND_COUNTDOWN);

    try {
      const configResponse = await fetch("/api/config");
      const config = await configResponse.json();
      
      if (batch.status === 'validation_failed') {
        toast({
          title: "Cannot Execute",
          description: `Batch ${batch.batchIndex} failed validation.`,
          variant: "destructive",
        });
        setIsExecuting(false);
        return;
      }
      
      const firstRecord = batch.records[0];
      const originalRecordIds = batch.records.map(r => r.id);
      
      const recipients = batch.records.map(r => ({ 
        email: r.recipient_email, 
        name: r.recipient_name, 
        custom_fields: r.custom_fields || {}
      }));
      
      const formData = new FormData();
      formData.append('subjectTemplate', firstRecord.subject);
      formData.append('bodyTemplate', firstRecord.body);
      formData.append('imageUrl', firstRecord.image_url || '');
      formData.append('mailgunDomain', config.mailgunDomain);
      formData.append('fromEmail', config.fromEmail);
      formData.append('fromName', config.fromName);
      formData.append('batchName', batch.batchName);
      formData.append('batchRecipients', JSON.stringify(recipients));
      formData.append('originalRecordIds', JSON.stringify(originalRecordIds));
      
      // Retrieve and attach file from session storage
      const attachmentData = sessionStorage.getItem('campaignAttachment');
      const attachmentName = sessionStorage.getItem('campaignAttachmentName');
      
      if (attachmentData && attachmentName) {
        const base64Response = await fetch(attachmentData);
        const blob = await base64Response.blob();
        const file = new File([blob], attachmentName, { type: blob.type });
        formData.append('attachment', file);
        formData.append('attachmentFileName', attachmentName);
      }

      toast({ 
        title: "Sending Batch", 
        description: `Executing Batch ${batch.batchIndex} (${batch.count} emails)...`, 
        variant: "default" 
      });

      const response = await fetch("/api/send-email", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        toast({
          title: "Batch Sent! 🎉",
          description: `Batch ${batch.batchIndex} sent successfully (${batch.count} emails).`,
          variant: "default",
        });
        setLastSentTime(Date.now());
        fetchBatches();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to send batch.");
      }
    } catch (error) {
      console.error("Execution error:", error);
      toast({
        title: "Execution Failed",
        description: `Could not send batch: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
      fetchBatches();
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSendClick = () => {
    const nextBatch = batches.find(b => b.status === 'pending');
    if (!nextBatch) {
      toast({
        title: "No Pending Batches",
        description: "All batches have been sent or there are no batches to send.",
        variant: "default",
      });
      return;
    }

    if (!isReadyToSend()) {
      const intervalMinutes = currentBatchMode === 'legacy' ? 7 : 10;
      toast({
        title: "Please Wait",
        description: `You must wait ${intervalMinutes} minutes between batch sends.`,
        variant: "destructive",
      });
      return;
    }

    setConfirmBatch(nextBatch);
    setConfirmCountdown(AUTO_SEND_COUNTDOWN);
  };

  const pendingBatches = batches.filter(b => b.status === 'pending');
  const sentBatches = batches.filter(b => b.status === 'sent');
  const failedBatches = batches.filter(b => b.status === 'validation_failed');
  const nextBatch = pendingBatches[0];

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Spinner className="w-6 h-6 mx-auto mb-2" />
        Loading batches...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Scheduled Batches ({pendingBatches.length} pending)
        </h2>
        <Button onClick={fetchBatches} disabled={isExecuting || isLoading} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>
      
      {/* PROMINENT COUNTDOWN TIMER */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-2 border-blue-300 dark:border-blue-700">
        <div className="text-center space-y-4">
          <h3 className="text-2xl font-bold flex items-center justify-center gap-3 text-blue-800 dark:text-blue-200">
            <Clock className="w-8 h-8" /> 
            {currentBatchMode === 'legacy' ? '7-Minute' : '10-Minute'} Interval Timer
          </h3>
          
          {confirmBatch ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Confirmation Active!</div>
              <div className="text-6xl font-extrabold text-red-600 animate-pulse">
                {confirmCountdown}s
              </div>
            </div>
          ) : nextBatch ? (
            <div className="space-y-3">
              {isReadyToSend() ? (
                <>
                  <div className="text-6xl font-extrabold text-green-600">
                    ✓ READY
                  </div>
                  <p className="text-lg font-semibold text-green-700 dark:text-green-300">
                    You can send Batch #{nextBatch.batchIndex} now!
                  </p>
                </>
              ) : (
                <>
                  <div className="text-7xl font-extrabold text-blue-600 tabular-nums">
                    {intervalCountdown}
                  </div>
                  <p className="text-lg font-semibold text-muted-foreground">
                    until next batch can be sent
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="text-3xl font-bold text-muted-foreground">
              {batches.length === 0 ? 'No batches prepared yet' : 'All batches completed! 🎉'}
            </div>
          )}
        </div>
      </Card>

      {/* Send Next Batch Button */}
      {nextBatch && (
        <Button 
          onClick={handleSendClick} 
          disabled={isExecuting || !isReadyToSend()}
          className="w-full h-14 text-lg"
          size="lg"
        >
          {isExecuting ? (
            <>
              <Spinner className="w-5 h-5 mr-2" />
              Sending Batch {nextBatch.batchIndex}...
            </>
          ) : isReadyToSend() ? (
            <>
              <Play className="w-5 h-5 mr-2" />
              Send Batch #{nextBatch.batchIndex} Now ({nextBatch.count} emails)
            </>
          ) : (
            <>
              <Clock className="w-5 h-5 mr-2" />
              Wait {intervalCountdown} to Send Next Batch
            </>
          )}
        </Button>
      )}

      {/* Pending Batches */}
      <Card>
        <div className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Package className="w-4 h-4" /> Pending Batches ({pendingBatches.length})
          </h3>
          <ScrollArea style={{ height: '300px' }}>
            <div className="space-y-2">
              {pendingBatches.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No pending batches.</p>
              ) : (
                pendingBatches.map((batch) => (
                  <Card key={`${batch.batchName}-${batch.batchIndex}`} className="p-3 border-orange-500 border-2">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="font-semibold">Batch #{batch.batchIndex}</div>
                        <div className="text-sm text-muted-foreground">{batch.count} emails</div>
                        <div className="flex gap-2">
                          <Badge variant="secondary" className="bg-orange-500 text-white">PENDING</Badge>
                          <Badge variant="outline">{batch.batchMode === 'legacy' ? 'Legacy' : 'Standard'}</Badge>
                        </div>
                      </div>
                      <div className="text-4xl font-bold text-orange-600">#{batch.batchIndex}</div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </Card>

      {/* Sent Batches */}
      <Card>
        <div className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" /> Sent Batches ({sentBatches.length})
          </h3>
          <ScrollArea style={{ height: '200px' }}>
            <div className="space-y-2">
              {sentBatches.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No batches sent yet.</p>
              ) : (
                sentBatches.map((batch) => {
                  const sentRecord = batch.records.find(r => r.sent_at);
                  return (
                    <Card key={`${batch.batchName}-${batch.batchIndex}`} className="p-3 border-green-500 border">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <div className="font-semibold">Batch #{batch.batchIndex}</div>
                          <div className="text-sm text-muted-foreground">
                            {batch.count} emails • Sent {sentRecord ? new Date(sentRecord.sent_at).toLocaleString() : ''}
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="secondary" className="bg-green-600 text-white">SENT</Badge>
                            <Badge variant="outline">{batch.batchMode === 'legacy' ? 'Legacy' : 'Standard'}</Badge>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </Card>

      {/* Failed Batches */}
      {failedBatches.length > 0 && (
        <Card className="border-red-500">
          <div className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-600">
              <AlertCircle className="w-4 h-4" /> Failed Validation ({failedBatches.length})
            </h3>
            <ScrollArea style={{ height: '150px' }}>
              <div className="space-y-2">
                {failedBatches.map((batch) => (
                  <Card key={`${batch.batchName}-${batch.batchIndex}`} className="p-3 bg-red-50 dark:bg-red-950/30 border-red-500">
                    <div className="space-y-1">
                      <div className="font-semibold">Batch #{batch.batchIndex}</div>
                      <div className="text-sm text-red-700">{batch.count} emails affected</div>
                      <Badge variant="destructive">VALIDATION FAILED</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        </Card>
      )}

      {/* Confirmation Modal WITH EMAIL/NAME MAPPING */}
      <Dialog open={!!confirmBatch} onOpenChange={(open) => !open && setConfirmBatch(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl text-blue-600">
              <Play className="w-6 h-6" /> Confirm Batch Send
            </DialogTitle>
            <DialogDescription>
              About to send Batch #{confirmBatch?.batchIndex} ({confirmBatch?.count} emails).
              This will auto-send in the remaining time.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-center space-y-4">
              <div className="text-6xl font-extrabold text-red-600">
                {confirmCountdown}
              </div>
              <p className="text-sm text-muted-foreground">
                Auto-send in seconds
              </p>
            </div>
            
            {/* Email/Name Mapping Display */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4" />
                <h4 className="font-semibold text-sm">Recipients in this batch:</h4>
              </div>
              <ScrollArea className="h-[200px]">
                <div className="space-y-1 text-xs">
                  {confirmBatch?.records.slice(0, 50).map((record, idx) => (
                    <div key={idx} className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded">
                      <span className="font-mono text-muted-foreground">{idx + 1}.</span>
                      <span className="font-medium">{record.recipient_name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-muted-foreground truncate">{record.recipient_email}</span>
                    </div>
                  ))}
                  {confirmBatch && confirmBatch.records.length > 50 && (
                    <div className="text-muted-foreground text-center py-2">
                      ... and {confirmBatch.records.length - 50} more recipients
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBatch(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => confirmBatch && executeBatch(confirmBatch)}
              disabled={isExecuting}
            >
              {isExecuting ? <Spinner className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}