// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/components/email/mailgun-history-tab.tsx

"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, History, Mail, Loader2, ArrowLeft, ArrowRight, Clock, Check, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"

interface MailgunEvent {
  id: string; // Mailgun event ID
  event: string;
  recipient: string;
  subject: string;
  timestamp: number; // Unix timestamp in milliseconds
  tags: string[];
}

interface PaginationData {
    events: MailgunEvent[];
    nextCursor: string | null;
    previousCursor: string | null;
}

type EventFilter = 'all' | 'error' | 'success' | 'scheduled';

// Helper to style event badges
const getEventBadge = (event: string) => {
    switch (event) {
        case 'delivered': return <Badge className="bg-green-600 hover:bg-green-700">Delivered</Badge>;
        case 'opened': return <Badge className="bg-blue-500 hover:bg-blue-600">Opened</Badge>;
        case 'clicked': return <Badge className="bg-indigo-500 hover:bg-indigo-600">Clicked</Badge>;
        case 'failed':
        case 'bounced':
        case 'rejected': return <Badge variant="destructive">{event}</Badge>;
        case 'scheduled': return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">{event}</Badge>;
        default: return <Badge variant="outline">{event}</Badge>;
    }
}

export default function MailgunHistoryTab() {
  const { toast } = useToast();
  const [paginationData, setPaginationData] = useState<PaginationData>({ events: [], nextCursor: null, previousCursor: null });
  const [isLoading, setIsLoading] = useState(false);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<EventFilter>('all'); 
  
  // Total events on the current page (dynamically tracked by the API)
  const pageSize = paginationData.events.length;
  // NOTE: Item tracking is based on the assumption that Mailgun events are always ordered latest to oldest.
  const isFirstPage = paginationData.previousCursor === null && currentCursor === null;
  const isLastPage = paginationData.nextCursor === null && pageSize > 0;


  const fetchEvents = async (cursor: string | null) => {
    setIsLoading(true);
    setCurrentCursor(cursor);
    
    try {
        const url = cursor 
            ? `/api/mailgun/events?cursor=${encodeURIComponent(cursor)}` 
            : "/api/mailgun/events";

        const response = await fetch(url);
        
        if (response.ok) {
            const data: PaginationData = await response.json();
            setPaginationData(data);
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to fetch events from Mailgun.");
        }
    } catch (error) {
        console.error("Fetch error:", error);
        toast({
            title: "Mailgun API Error",
            description: `Could not fetch events: ${error instanceof Error ? error.message : 'Unknown error'}`,
            variant: "destructive",
        });
        setPaginationData({ events: [], nextCursor: null, previousCursor: null });
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial load: Fetch the latest events (no cursor)
    fetchEvents(null);
  }, []);
  
  // Logic to filter events based on user selection
  const filteredEvents = useMemo(() => {
    if (eventFilter === 'all') {
      return paginationData.events;
    }
    
    const errorEvents = ['failed', 'bounced', 'rejected'];
    const successEvents = ['delivered', 'opened', 'clicked'];
    
    return paginationData.events.filter(event => {
      switch (eventFilter) {
        case 'error':
          return errorEvents.includes(event.event);
        case 'success':
          return successEvents.includes(event.event);
        case 'scheduled':
          return event.event === 'scheduled';
        default:
          return true;
      }
    });
  }, [paginationData.events, eventFilter]);


  const handleNextPage = () => {
    if (paginationData.nextCursor) {
        fetchEvents(paginationData.nextCursor);
    }
  };
  
  const handlePreviousPage = () => {
    if (paginationData.previousCursor) {
        fetchEvents(paginationData.previousCursor);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <History className="w-5 h-5" /> Mailgun Event History (Live Log)
        </h2>
        <Button onClick={() => fetchEvents(null)} disabled={isLoading}>
          <Loader2 className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Fetch Latest
        </Button>
      </div>
      
      {/* Filters and Pagination Controls */}
      <div className="flex flex-wrap gap-3 items-center">
          <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as EventFilter)}
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm"
              disabled={isLoading}
          >
              <option value="all">All Events</option>
              <option value="success">Success (Delivered/Opened/Clicked)</option>
              <option value="error">Error (Failed/Bounced/Rejected)</option>
              <option value="scheduled">Scheduled</option>
          </select>
          
          <div className="flex items-center gap-2 bg-muted p-2 rounded-lg text-sm ml-auto">
              {/* Pagination Tracking Display */}
              <span className="text-muted-foreground">
                  {/* Total item tracking is simplified as Mailgun API doesn't expose total count */}
                  Events: {filteredEvents.length > 0 ? `1 - ${pageSize}` : '0'} / {pageSize} (of current page)
              </span>
              
              <Button 
                  variant="secondary" 
                  onClick={handlePreviousPage} 
                  // Disable if loading OR if there's no previous cursor URL
                  disabled={isLoading || !paginationData.previousCursor}
                  size="sm"
              >
                  <ArrowLeft className="w-4 h-4" />
              </Button>
              
              <Button 
                  variant="secondary" 
                  onClick={handleNextPage} 
                  // Disable if loading OR if there's no next cursor URL
                  disabled={isLoading || !paginationData.nextCursor}
                  size="sm"
              >
                  <ArrowRight className="w-4 h-4" />
              </Button>
          </div>
      </div>

      {/* Event List Section */}
      <ScrollArea className="border rounded-lg" style={{ height: '60vh' }}> {/* Height increased to 60vh */}
        <div className="p-4">
            {isLoading && (
                <div className="p-6 text-center text-primary">
                    <Spinner className="w-6 h-6 mx-auto mb-2" />
                    Loading events from Mailgun...
                </div>
            )}
            
            {!isLoading && filteredEvents.length === 0 ? (
                <Card className="p-6 text-center text-muted-foreground">
                    <AlertCircle className="w-6 h-6 mx-auto mb-3" />
                    No events found matching the current filter.
                </Card>
            ) : (
                // Responsive grid layout for up to 3 columns
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"> 
                    {filteredEvents.map((event) => (
                        <Card key={event.id} className="p-4 flex flex-col justify-between">
                            <div className="space-y-1">
                                <div className="font-semibold text-sm truncate max-w-full">{event.subject}</div>
                                <div className="text-xs text-muted-foreground">To: {event.recipient}</div>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <div className="flex flex-col gap-1">
                                    {getEventBadge(event.event)}
                                    <div className="text-xs text-muted-foreground">
                                        <Clock className="w-3 h-3 inline mr-1 align-sub" /> {new Date(event.timestamp).toLocaleString()}
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground break-all text-right">
                                    ID: {event.id.slice(0, 8)}...
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
      </ScrollArea>
    </div>
  );
}