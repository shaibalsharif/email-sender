// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/components/email/scheduled-tab.tsx

"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, Calendar, Mail, Loader2, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Spinner } from "@/components/ui/spinner"

interface ScheduledMessage {
  id: string; // Mailgun message-id
  recipient: string;
  subject: string;
  scheduled_at: number; // Unix timestamp in milliseconds
  status: string;
}

export default function ScheduledTab() {
  const { toast } = useToast();
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);

  const fetchScheduledMessages = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/mailgun/scheduled");
      if (response.ok) {
        // --- FIX: Explicitly cast the fetched data to the expected array type ---
        const data = await response.json() as ScheduledMessage[];
        
        // Remove duplicates as Mailgun event API can list the same message multiple times
        // The type of data.map is now correctly inferred
        const uniqueMessages: ScheduledMessage[] = Array.from(new Map(data.map((item) => [item.id, item])).values());
        
        setScheduledMessages(uniqueMessages);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch scheduled messages from Mailgun.");
      }
    } catch (error) {
      console.error("Fetch error:", error);
      toast({
        title: "Error",
        description: `Could not fetch scheduled messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
      setScheduledMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduledMessages();
  }, []);

  const handleCancel = async (messageId: string) => {
    if (!confirm(`Are you sure you want to permanently CANCEL the scheduled message with ID ${messageId}? This will update your local history records.`)) {
      return;
    }
    
    setIsCancelling(messageId);
    
    try {
        const response = await fetch("/api/mailgun/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId }),
        });

        if (response.ok) {
            toast({
                title: "Cancelled Successfully",
                description: `Message ${messageId} was cancelled in Mailgun and local history updated.`,
            });
            // Refresh list to remove the cancelled item
            await fetchScheduledMessages(); 
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to cancel message.");
        }
    } catch (error) {
        console.error("Cancellation error:", error);
        toast({
            title: "Cancellation Failed",
            description: `Could not cancel message: ${error instanceof Error ? error.message : 'Unknown error'}`,
            variant: "destructive",
        });
    } finally {
        setIsCancelling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <Spinner className="w-6 h-6 mx-auto mb-2" />
        Fetching live scheduled messages from Mailgun...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Live Mailgun Scheduled Messages ({scheduledMessages.length})
        </h2>
        <Button onClick={fetchScheduledMessages} disabled={isCancelling !== null || isLoading}>
          <Loader2 className={`w-4 h-4 mr-2 ${isCancelling || isLoading ? 'animate-spin' : ''}`} /> Refresh List
        </Button>
      </div>

      <ScrollArea className="h-[400px] border rounded-lg">
        <div className="p-4 space-y-3">
          {scheduledMessages.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground">
              <AlertCircle className="w-6 h-6 mx-auto mb-3" />
              No messages are currently scheduled in Mailgun.
            </Card>
          ) : (
            scheduledMessages.map((message) => (
              <Card key={message.id} className="p-4 flex justify-between items-start">
                <div className="space-y-1">
                  <div className="font-medium truncate max-w-lg">{message.subject}</div>
                  <div className="text-sm text-muted-foreground">To: {message.recipient}</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">
                    Scheduled for: {new Date(message.scheduled_at).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground break-all">
                    ID: {message.id}
                  </div>
                </div>
                <Button 
                    variant="destructive" 
                    onClick={() => handleCancel(message.id)}
                    disabled={isCancelling !== null}
                >
                    {isCancelling === message.id ? (
                        <Spinner className="w-4 h-4 mr-2" />
                    ) : (
                        <XCircle className="w-4 h-4 mr-2" />
                    )}
                    Cancel
                </Button>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}