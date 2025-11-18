"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  History,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Clock,
  Search,
  Download,
  Filter,
  CheckCircle,
  CalendarSearch,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

interface MailgunEvent {
  id: string;
  event: string;
  recipient: string;
  // subject: string;
  timestamp: number;
  tags: string[];
}

interface PaginationData {
  events: MailgunEvent[];
  nextCursor: string | null;
  previousCursor: string | null;
}

interface FilterState {
  search: string;
  fromDate: string;
  toDate: string;
  tag: string;
  event: string; // Server-side event filter
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const getEventBadge = (event: string) => {
  switch (event) {
    case "delivered":
      return <Badge className="bg-green-600 text-white">Delivered</Badge>;
    case "opened":
      return <Badge className="bg-blue-600 text-white">Opened</Badge>;
    case "clicked":
      return <Badge className="bg-indigo-600 text-white">Clicked</Badge>;
    case "failed":
      return <Badge className="bg-red-600 text-white">Failed</Badge>;
    case "bounced":
      return <Badge className="bg-orange-600 text-white">Bounced</Badge>;
    case "rejected":
      return <Badge className="bg-red-700 text-white">Rejected</Badge>;
    default:
      return <Badge variant="outline">{event}</Badge>;
  }
};

export default function MailgunHistoryTab() {
  const { toast } = useToast();

  const [paginationData, setPaginationData] = useState<PaginationData>({
    events: [],
    nextCursor: null,
    previousCursor: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(1);

  // All filters go to API (server-side)
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    fromDate: "",
    toDate: "",
    tag: "all",
    event: "all", // Changed from client-side to server-side
  });

  const [jumpDate, setJumpDate] = useState("");

  const [cache, setCache] = useState<Record<string, PaginationData>>({});
  const [prefetchedCursors, setPrefetchedCursors] = useState<
    Record<string, boolean>
  >({});

  const debouncedFilters = useDebounce(filters, 500);

  // Build query params passed to /api/mailgun/events
  const makeParams = (cursor: string | null, f: FilterState) => {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", encodeURIComponent(cursor));
    if (f.search) params.set("search", f.search);
    if (f.tag && f.tag !== "all") params.set("tag", f.tag);
    if (f.fromDate)
      params.set("from", String(new Date(f.fromDate).getTime()));
    if (f.toDate) params.set("to", String(new Date(f.toDate).getTime()));
    if (f.event && f.event !== "all") params.set("event", f.event);
    return params.toString();
  };

  const fetchPage = async (
    cursor: string | null,
    opts?: { resetPage?: boolean; filtersOverride?: FilterState }
  ) => {
    const usedFilters = opts?.filtersOverride ?? debouncedFilters;

    const key = makeParams(cursor, usedFilters);

    if (cache[key]) {
      setPaginationData(cache[key]);
      if (opts?.resetPage) setPageIndex(1);

      if (cache[key].nextCursor) {
        prefetchNext(cache[key].nextCursor, usedFilters);
      }
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/mailgun/events?${key}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch Mailgun events.");
      }

      const data: PaginationData = await res.json();
      setPaginationData(data);
      setCache((prev) => ({ ...prev, [key]: data }));
      if (opts?.resetPage) setPageIndex(1);

      if (data.nextCursor) {
        prefetchNext(data.nextCursor, usedFilters);
      }
    } catch (e: any) {
      toast({
        title: "Mailgun API Error",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
      setPaginationData({ events: [], nextCursor: null, previousCursor: null });
    } finally {
      setIsLoading(false);
    }
  };

  const prefetchNext = async (cursor: string, f: FilterState) => {
    const key = makeParams(cursor, f);
    if (cache[key]) {
      setPrefetchedCursors((prev) => ({ ...prev, [cursor]: true }));
      return;
    }
    try {
      const res = await fetch(`/api/mailgun/events?${key}`);
      if (!res.ok) return;
      const data: PaginationData = await res.json();
      setCache((prev) => ({ ...prev, [key]: data }));
      setPrefetchedCursors((prev) => ({ ...prev, [cursor]: true }));
    } catch {
      // ignore prefetch errors
    }
  };

  // Initial load + whenever debounced filters change
  useEffect(() => {
    fetchPage(null, { resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilters]);

  // Jump to date: just update server-side filters (begin/end = that date)
  const handleJumpToDate = () => {
    if (!jumpDate) return;
    setFilters((prev) => ({
      ...prev,
      fromDate: jumpDate,
      toDate: jumpDate,
    }));
    setPageIndex(1);
  };

  const isFirstPage = !paginationData.previousCursor;
  const isLastPage = !paginationData.nextCursor;

  const handleNext = () => {
    if (!paginationData.nextCursor) return;
    setPageIndex((p) => p + 1);
    fetchPage(paginationData.nextCursor);
  };

  const handlePrevious = () => {
    if (!paginationData.previousCursor) return;
    setPageIndex((p) => Math.max(1, p - 1));
    fetchPage(paginationData.previousCursor);
  };

  // Tags from current (server-filtered) page
  const tagList = useMemo(() => {
    const set = new Set<string>();
    paginationData.events.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return [...set];
  }, [paginationData.events]);

  // Charts use the server-filtered events of current page
  const deliveredVsFailedData = useMemo(() => {
    let delivered = 0;
    let failed = 0;
    paginationData.events.forEach((e) => {
      if (e.event === "delivered") delivered++;
      if (["failed", "bounced", "rejected"].includes(e.event)) failed++;
    });
    return [
      { type: "Delivered", count: delivered },
      { type: "Failed/Bounced/Rejected", count: failed },
    ];
  }, [paginationData.events]);

  const openRateOverTimeData = useMemo(() => {
    const buckets: Record<string, { delivered: number; opened: number }> = {};
    paginationData.events.forEach((e) => {
      const day = new Date(e.timestamp).toISOString().slice(0, 10);
      if (!buckets[day]) buckets[day] = { delivered: 0, opened: 0 };
      if (e.event === "delivered") buckets[day].delivered++;
      if (e.event === "opened") buckets[day].opened++;
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({
        date,
        delivered: v.delivered,
        opened: v.opened,
        openRate: v.delivered ? (v.opened / v.delivered) * 100 : 0,
      }));
  }, [paginationData.events]);

  // Export only current page events
  const exportCurrentPage = () => {
    const rows = [
      ["id", "event", "recipient", /* "subject", */ "timestamp", "tags"],
      ...paginationData.events.map((e) => [
        e.id,
        e.event,
        e.recipient,
        // e.subject,
        new Date(e.timestamp).toISOString(),
        e.tags.join(";"),
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mailgun-page-${pageIndex}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export all filtered events
  const exportAllFiltered = async () => {
    try {
      setIsLoading(true);
      toast({
        title: "Exporting...",
        description: "Fetching all events. This may take a moment.",
      });

      const params = makeParams(null, debouncedFilters);
      const res = await fetch(`/api/mailgun/events?export=1&${params}`);
      
      if (!res.ok) {
        throw new Error("Failed to export events");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mailgun-events-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: "Your CSV file has been downloaded.",
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Could not export events",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const pageSize = paginationData.events.length;
  const absoluteOffset = (pageIndex - 1) * 300;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <History className="w-5 h-5" /> Mailgun Event History
        </h2>
        <Button
          onClick={() => fetchPage(null, { resetPage: true })}
          disabled={isLoading}
        >
          <Loader2
            className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="flex items-center gap-2 bg-muted px-3 py-2 rounded-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            className="bg-transparent outline-none text-sm w-56"
            placeholder="Search by email or subject…"
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
          />
        </div>

        {/* Date range */}
        <input
          type="date"
          className="px-3 py-2 rounded-lg border text-sm"
          value={filters.fromDate}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, fromDate: e.target.value }))
          }
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          className="px-3 py-2 rounded-lg border text-sm"
          value={filters.toDate}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, toDate: e.target.value }))
          }
        />

        {/* Tag filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            className="px-3 py-2 border rounded-lg bg-background text-sm"
            value={filters.tag}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, tag: e.target.value }))
            }
          >
            <option value="all">All Tags</option>
            {tagList.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Event filter (now server-side) */}
        <select
          className="px-3 py-2 border rounded-lg bg-background text-sm"
          value={filters.event}
          onChange={(e) =>
            setFilters((prev) => ({ ...prev, event: e.target.value }))
          }
        >
          <option value="all">All Events</option>
          <option value="delivered">Delivered</option>
          <option value="opened">Opened</option>
          <option value="clicked">Clicked</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Jump to date */}
        <div className="flex items-center gap-2">
          <CalendarSearch className="w-4 h-4 text-muted-foreground" />
          <input
            type="date"
            className="px-3 py-2 border rounded-lg text-sm"
            value={jumpDate}
            onChange={(e) => setJumpDate(e.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={handleJumpToDate}>
            Jump
          </Button>
        </div>

        {/* Page info & nav */}
        <div className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg text-xs ml-auto">
          <span>
            Page {pageIndex}
            {isFirstPage && " (first)"}
            {isLastPage && !isFirstPage && " (last)"}
            {" • "}Events: {pageSize}
          </span>

          {paginationData.nextCursor && (
            <Badge
              className={`${
                prefetchedCursors[paginationData.nextCursor]
                  ? "bg-green-600"
                  : "bg-amber-600"
              } text-white`}
            >
              Next:{" "}
              {prefetchedCursors[paginationData.nextCursor]
                ? "ready"
                : "loading"}
            </Badge>
          )}

          <Button
            variant="secondary"
            size="sm"
            disabled={isFirstPage || isLoading}
            onClick={handlePrevious}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={isLastPage || isLoading}
            onClick={handleNext}
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Export buttons */}
        <Button
          variant="secondary"
          size="sm"
          onClick={exportCurrentPage}
          className="flex items-center gap-1"
        >
          <Download className="w-4 h-4" /> Export Page
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            window.open(
              `/api/mailgun/events?export=1&${makeParams(
                null,
                debouncedFilters
              )}`,
              "_blank"
            )
          }
          className="flex items-center gap-1"
        >
          <Download className="w-4 h-4" /> Export All
        </Button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 bg-card">
          <h3 className="text-sm font-semibold mb-2">
            Delivered vs Failed (this page)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deliveredVsFailedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="type" stroke="#888" />
                <YAxis allowDecimals={false} stroke="#888" />
                <Tooltip contentStyle={{ backgroundColor: '#1f1f1f', border: '1px solid #333' }} />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 bg-card">
          <h3 className="text-sm font-semibold mb-2">
            Open Rate Over Time (this page)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={openRateOverTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#888" />
                <YAxis yAxisId="left" stroke="#888" />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#888" />
                <Tooltip contentStyle={{ backgroundColor: '#1f1f1f', border: '1px solid #333' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="opened" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="openRate" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Event list */}
      <ScrollArea className="border rounded-lg" style={{ height: "60vh" }}>
        <div className="p-4">
          {isLoading && (
            <div className="p-6 text-center text-primary">
              <Spinner className="w-6 h-6 mx-auto mb-2" />
              Loading events...
            </div>
          )}

          {!isLoading && paginationData.events.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground">
              <AlertCircle className="w-6 h-6 mx-auto mb-3" />
              No events match your filters.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {paginationData.events.map((event, idx) => (
                <Card key={event.id} className="p-4 space-y-2 relative hover:shadow-lg transition-shadow">
                  {/* Absolute index badge */}
                  <Badge className="absolute top-2 right-2 bg-slate-700 text-white text-xs">
                    #{absoluteOffset + idx + 1}
                  </Badge>

                  {/* <div className="font-semibold text-sm truncate pr-16">
                    {event.subject}
                  </div> */}

                  <div className="text-xs text-muted-foreground truncate">
                    To: {event.recipient}
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <div className="flex flex-col gap-1">
                      {getEventBadge(event.event)}
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(event.timestamp).toLocaleString()}
                      </div>
                    </div>
                    {event.tags.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {event.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs mr-1">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
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