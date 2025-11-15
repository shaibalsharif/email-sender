// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/components/email/scheduled-tab.tsx

"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, Calendar, Mail, Loader2, Play, Pause, AlertTriangle, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNowStrict, isPast, differenceInSeconds } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface LocalBatch {
  batchId: string;
  batchName: string;
  scheduledAt: string;
  count: number;
  records: { id: number, recipient_email: string, subject: string, body: string, image_url: string, custom_fields: any }[];
  status: 'scheduled' | 'paused' | 'validation_failed' | 'pending';
}

// Timer constant for the confirmation modal
const OVERRIDE_SECONDS = 120;

const formatTimeRemaining = (futureDateString: string) => {
    const timeRemaining = differenceInSeconds(new Date(futureDateString), new Date());
    if (timeRemaining <= 0) {
        return "Ready!";
    }
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;
    
    return `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;
}

export default function ScheduledTab() {
  const { toast } = useToast();
  const [scheduledBatches, setScheduledBatches] = useState<LocalBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [readyBatch, setReadyBatch] = useState<LocalBatch | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(OVERRIDE_SECONDS);
  
  // State to track time remaining for the next scheduled batch
  const [nextBatchCountdown, setNextBatchCountdown] = useState<string>('');


  // --- BATCH FETCHING ---

  const fetchScheduledBatches = async () => {
    setIsLoading(true);
    try {
      // NOTE: We rely on the API to correctly filter/downgrade status to 'pending' if time is past.
      const response = await fetch("/api/email-history");
      if (response.ok) {
        const data = await response.json();
        
        // Filter for batches that are still active/schedulable/failed validation
        const activeStatuses = ['scheduled', 'paused', 'pending', 'validation_failed'];
        
        const batches: LocalBatch[] = data.filter((g: any) => 
            activeStatuses.includes(g.status)
        ).map((g: any) => ({
             ...g,
             status: g.status as LocalBatch['status'] 
        })).sort((a: LocalBatch, b: LocalBatch) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()); // Sort ASC

        setScheduledBatches(batches);
      } else {
        throw new Error("Failed to fetch local scheduled batches.");
      }
    } catch (error) {
      console.error("Fetch error:", error);
      toast({
        title: "Error",
        description: `Could not fetch scheduled batches: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
      setScheduledBatches([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduledBatches();
  }, []);

  // --- EXECUTION / TIMER LOGIC ---

  const executeBatch = async (batch: LocalBatch, isManualOverride: boolean = false) => {
    if (isExecuting) return;
    setIsExecuting(true);
    setReadyBatch(null); // Close modal and stop timer
    setTimerSeconds(OVERRIDE_SECONDS); // Reset timer

    const configResponse = await fetch("/api/config");
    const config = await configResponse.json();
    
    // Check validation failed status first
    if (batch.status === 'validation_failed') {
        toast({
            title: "Cannot Execute",
            description: `Batch '${batch.batchName}' failed validation. Please correct the template and reschedule the campaign.`,
            variant: "destructive",
        });
        setIsExecuting(false);
        return;
    }
    
    // Prepare data for immediate execution
    const firstRecord = batch.records[0];
    const originalRecordIds = batch.records.map(r => r.id);
    const recipients = batch.records.map(r => ({ 
        email: r.recipient_email, 
        name: r.recipient_name, 
        custom_fields: r.records.find((rec: any) => rec.recipient_email === r.recipient_email)?.custom_fields || {} // Use records array to find full context
    }));
    
    // Create a temporary FormData object for the API call
    const formData = new FormData();
    
    // Attach text/json data
    formData.append('subjectTemplate', firstRecord.subject);
    formData.append('bodyTemplate', firstRecord.body);
    formData.append('imageUrl', firstRecord.image_url || '');
    formData.append('mailgunDomain', config.mailgunDomain);
    formData.append('fromEmail', config.fromEmail);
    formData.append('fromName', config.fromName);
    formData.append('batchName', batch.batchName);
    
    formData.append('batchRecipients', JSON.stringify(recipients));
    formData.append('originalRecordIds', JSON.stringify(originalRecordIds));
    formData.append('scheduled_at', batch.scheduledAt); // Original scheduled time (for history update)

    // Check for file attachment information
    // NOTE: We don't have the File object in the DB. This logic assumes the *first* recipient's original data 
    // (logged during compose) contained the file details. Since we can't reliably pass a file object from DB to here,
    // we assume the attachment was a one-time upload and cannot be re-sent if needed.

    if (isManualOverride) {
         toast({ title: "Sending Batch", description: `Executing '${batch.batchName}' immediately...`, variant: "default" });
    }

    try {
        // --- NOTE: We cannot re-attach the file from the DB easily. The execution will proceed without attachment. ---
        const response = await fetch("/api/send-email", {
            method: "POST",
            body: formData, 
        });

        if (response.ok) {
            toast({
                title: "Batch Sent! 🎉",
                description: `Batch '${batch.batchName}' sent successfully (${batch.count} emails).`,
                variant: "success",
            });
            fetchScheduledBatches(); // Reload list
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
        fetchScheduledBatches(); 
    } finally {
        setIsExecuting(false);
    }
  };

  // --- PAUSE / RESUME LOGIC (Unchanged) ---
  const togglePauseResume = async (batchId: string, currentStatus: string) => {
    // FIX: Ensure 'pending' status is also considered for pausing
    const newStatus = currentStatus === 'scheduled' || currentStatus === 'pending' ? 'paused' : 'scheduled';
    
    try {
        // Use batchName (which is unique) for updating status
        const response = await fetch("/api/contacts/update-status", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId, newStatus }),
        });
        
        if (response.ok) {
            toast({
                title: `${newStatus === 'paused' ? 'Paused' : 'Resumed'}`,
                description: `Batch ${batchId.split('-')[0]} status changed to ${newStatus}.`,
            });
            fetchScheduledBatches(); // Reload the list
        } else {
            // Log full error response for debugging
            const errorData = await response.json(); 
            throw new Error(errorData.error || "Failed to update batch status.");
        }
    } catch (error) {
        toast({ title: 'Error', description: `Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`, variant: 'destructive' });
    }
  };

  // --- TIMER/POLLING EFFECTS ---

  // Effect 1: Check for ready batches every second and update countdown display
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const checkReadyBatch = () => {
        const now = new Date().getTime();
        
        // Find the next scheduled batch that is NOT paused and is the earliest one.
        const nextBatch = scheduledBatches.find(batch => 
            (batch.status === 'scheduled' || batch.status === 'pending')
        );
        
        if (nextBatch) {
            const scheduledTime = new Date(nextBatch.scheduledAt).getTime();
            const timeDifference = scheduledTime - now;

            if (timeDifference <= 0 && !readyBatch && !isExecuting) {
                // Batch is overdue/ready: Trigger modal
                setReadyBatch(nextBatch);
                setTimerSeconds(OVERRIDE_SECONDS); 
            }
            
            // Update the display countdown string
            setNextBatchCountdown(formatTimeRemaining(nextBatch.scheduledAt));
        } else {
            setNextBatchCountdown('Queue Empty');
        }
    };
    
    interval = setInterval(checkReadyBatch, 1000);
    
    // Also, fetch the schedule every 10 seconds to catch new external logging
    const fetchInterval = setInterval(fetchScheduledBatches, 10000); 

    return () => {
        clearInterval(interval);
        clearInterval(fetchInterval);
    }
  }, [scheduledBatches, isExecuting, readyBatch]); // Depend on batch list and execution status

  // Effect 2: Countdown timer for the modal
  useEffect(() => {
    if (!readyBatch || timerSeconds === 0) return;

    const timer = setInterval(() => {
        setTimerSeconds(prev => {
            if (prev <= 1) {
                clearInterval(timer);
                // Auto-send if timer hits 0
                if (readyBatch) {
                    executeBatch(readyBatch, true);
                }
                return 0;
            }
            return prev - 1;
        });
    }, 1000);

    return () => clearInterval(timer);
  }, [readyBatch, timerSeconds]);


  // --- UI RENDERING ---

  // Filter out validated_failed and paused batches for the primary list display
  const activeBatches = scheduledBatches.filter(b => b.status === 'scheduled' || b.status === 'paused' || b.status === 'pending');
  const failedBatches = scheduledBatches.filter(b => b.status === 'validation_failed');
  
  // Find the next upcoming scheduled batch
  const nextUp = scheduledBatches.find(b => b.status === 'scheduled' || b.status === 'pending');


  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Spinner className="w-6 h-6 mx-auto mb-2" />
        Fetching local scheduled batches...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Local Scheduled Batches ({activeBatches.length})
        </h2>
        <Button onClick={fetchScheduledBatches} disabled={isExecuting || isLoading}>
          <Loader2 className={`w-4 h-4 mr-2 ${isExecuting || isLoading ? 'animate-spin' : ''}`} /> Refresh List
        </Button>
      </div>
      
      {/* Next Upcoming Schedule Banner */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-950/50 border-blue-300">
        <h3 className="font-semibold text-sm mb-2 flex items-center gap-2 text-blue-800 dark:text-blue-200">
            Next Execution
        </h3>
        {readyBatch ? (
             <div className="text-lg font-bold text-red-600">
                A batch is READY! Confirmation modal is active.
            </div>
        ) : (
            <div className="text-lg font-bold">
                {nextUp ? (
                    <>
                    Batch {nextUp.batchName} will be ready in: <span className="text-blue-600">{nextBatchCountdown}</span>
                    </>
                ) : (
                    <div className="text-lg font-bold text-muted-foreground">
                        Queue Empty. Schedule a new campaign.
                    </div>
                )}
            </div>
        )}
      </Card>


      {/* Active Batches */}
      <Card>
        <ScrollArea style={{ height: '400px' }}>
          <div className="p-4 space-y-3">
            {activeBatches.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No active or paused batches found.</p>
            ) : (
              activeBatches.map((batch) => (
                <Card 
                    key={batch.batchId} 
                    className={`p-3 flex justify-between items-center ${
                        batch.status === 'paused' ? 'border-dashed border-gray-400 opacity-70' : 
                        batch.status === 'pending' ? 'border-orange-500 border-2' : 
                        'border-blue-500 border-2'
                    }`}
                >
                  <div className="space-y-1">
                    <div className="font-semibold">{batch.batchName} ({batch.count} emails)</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {batch.status === 'scheduled' || batch.status === 'pending'
                        ? new Date(batch.scheduledAt).toLocaleString()
                        : 'Paused'}
                    </div>
                    {batch.status === 'scheduled' && new Date(batch.scheduledAt).getTime() > new Date().getTime() && (
                        <Badge variant="secondary" className="bg-blue-600">Scheduled</Badge>
                    )}
                    {batch.status === 'pending' && (
                         <Badge variant="secondary" className="bg-orange-500 text-white">READY / OVERDUE</Badge>
                    )}
                    {batch.status === 'paused' && (
                        <Badge variant="secondary" className="bg-gray-500 text-white">PAUSED</Badge>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                        variant={batch.status === 'scheduled' || batch.status === 'pending' ? 'secondary' : 'default'}
                        onClick={() => togglePauseResume(batch.batchId, batch.status)}
                        disabled={isExecuting}
                    >
                        {batch.status === 'scheduled' || batch.status === 'pending' ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                        {batch.status === 'scheduled' || batch.status === 'pending' ? 'Pause' : 'Resume'}
                    </Button>
                    
                    {(batch.status === 'pending' && new Date(batch.scheduledAt).getTime() < new Date().getTime()) && (
                         <Button 
                            variant="default" 
                            onClick={() => setReadyBatch(batch)} // Manual immediate trigger
                            disabled={isExecuting}
                         >
                            Execute Now
                        </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
      
      {/* Failed Validation Batches */}
      {failedBatches.length > 0 && (
          <div className="space-y-3 pt-4">
              <h3 className="text-lg font-semibold flex items-center text-red-600">
                  <AlertTriangle className="w-5 h-5 mr-2" /> Validation Failures ({failedBatches.length})
              </h3>
              <Card>
                  <ScrollArea style={{ height: '200px' }}>
                      <div className="p-4 space-y-2">
                          {failedBatches.map(batch => (
                              <div key={batch.batchId} className="p-3 border border-red-500 bg-red-50 dark:bg-red-950/30 flex justify-between items-center">
                                  <div className="space-y-1">
                                      <div className="font-semibold">{batch.batchName}</div>
                                      <div className="text-sm text-red-700">Needs Template Correction ({batch.count} emails affected)</div>
                                  </div>
                                  <Badge variant="destructive">Validation Failed</Badge>
                              </div>
                          ))}
                      </div>
                  </ScrollArea>
              </Card>
          </div>
      )}


      {/* --- EXECUTION CONFIRMATION MODAL --- */}
      <Dialog open={!!readyBatch}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl text-blue-600">
                <AlertTriangle className="w-6 h-6" /> Batch Ready!
            </DialogTitle>
            <DialogDescription>
              The batch **{readyBatch?.batchName}** ({readyBatch?.count} emails) is due now.
              Confirm execution or it will be sent automatically in the remaining time.
            </DialogDescription>
          </DialogHeader>
          <div className="text-center space-y-4">
            <div className="text-5xl font-extrabold text-red-600">
              {timerSeconds}
            </div>
            <p className="text-sm text-muted-foreground">
              Auto-Override in Seconds
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReadyBatch(null)}>
              Keep Paused (Requires Manual Resume)
            </Button>
            <Button 
                onClick={() => executeBatch(readyBatch!, true)}
                disabled={isExecuting}
            >
                {isExecuting ? <Spinner className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                Confirm Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}