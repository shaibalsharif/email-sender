import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunApiKey = process.env.MAILGUN_API_KEY;

    if (!mailgunDomain || !mailgunApiKey) {
      return NextResponse.json(
        { error: "Mailgun credentials not configured." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);

    const cursorParam = searchParams.get("cursor");

    // Filters
    const search = searchParams.get("search") || "";
    const fromMs = searchParams.get("from");
    const toMs = searchParams.get("to");
    const tag = searchParams.get("tag");
    const eventParam = searchParams.get("event");

    const isExport = searchParams.get("export") === "1";

    const buildBaseUrl = () => {
      const params = new URLSearchParams();
      params.set("limit", "300");

      if (fromMs) {
        params.set("begin", String(Math.floor(Number(fromMs) / 1000)));
      }
      if (toMs) {
        params.set("end", String(Math.floor(Number(toMs) / 1000)));
      }

      if (search) {
        if (search.includes("@")) {
          params.set("recipient", search);
        } else {
          params.set("subject", search);
        }
      }

      if (tag && tag !== "all") {
        params.set("tags", tag);
      }

      if (eventParam && eventParam !== "all") {
        params.set("event", eventParam);
      }

      return `https://api.mailgun.net/v3/${mailgunDomain}/events?${params}`;
    };

    const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");

    // STREAMING EXPORT WITH RATE LIMITING AND PARALLEL PROCESSING
    if (isExport) {
      const encoder = new TextEncoder();
      
      // Write CSV header
      const csvHeader = "id,event,recipient,subject,timestamp,tags\n";
      
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(csvHeader));
          
          let nextUrl: string | null = buildBaseUrl();
          let pageCount = 0;
          let totalEvents = 0;
          const maxPages = 167; // Safety limit: 167 pages * 300 events = ~50,000 events
          
          // Rate limiting: delay between requests
          const delayBetweenRequests = 200; // 200ms = ~5 requests/second (300/min)
          
          while (nextUrl && pageCount < maxPages) {
            try {
              // Add delay to respect rate limits (except first request)
              if (pageCount > 0) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
              }
              
              const res = await fetch(nextUrl, {
                headers: { Authorization: `Basic ${auth}` },
                cache: "no-store",
              });

              if (!res.ok) {
                // Handle rate limiting
                if (res.status === 429) {
                  console.warn('Rate limited, waiting 5 seconds...');
                  await new Promise(resolve => setTimeout(resolve, 5000));
                  continue; // Retry the same URL
                }
                
                const text = await res.text();
                console.error("Mailgun API failed:", text);
                break;
              }

              const data = await res.json();
              const items = data.items || [];

              // Stream CSV rows as we fetch them
              for (const item of items) {
                const event = {
                  id: item.id || `${item.timestamp}-${item.recipient}`,
                  event: item.event,
                  recipient: item.recipient,
                  subject: item.message?.headers?.subject || "N/A",
                  timestamp: item.timestamp * 1000,
                  tags: item.tags || [],
                };
                
                const csvRow = [
                  `"${event.id}"`,
                  `"${event.event}"`,
                  `"${event.recipient}"`,
                  `"${(event.subject || "").replace(/"/g, "'")}"`,
                  `"${new Date(event.timestamp).toISOString()}"`,
                  `"${event.tags.join(";")}"`,
                ].join(",") + "\n";
                
                controller.enqueue(encoder.encode(csvRow));
                totalEvents++;
              }

              nextUrl = data.paging?.next || null;
              pageCount++;
              
              // Log progress every 10 pages
              if (pageCount % 10 === 0) {
                console.log(`Exported ${totalEvents} events (${pageCount} pages)`);
              }
              
            } catch (error) {
              console.error("Error fetching page:", error);
              break;
            }
          }
          
          console.log(`Export complete: ${totalEvents} events in ${pageCount} pages`);
          controller.close();
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=mailgun-events-${new Date().toISOString().slice(0, 10)}.csv`,
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // NORMAL PAGE REQUEST (ONE PAGE, SERVER-SIDE FILTERED)
    let url: string;
    if (cursorParam) {
      url = decodeURIComponent(cursorParam);
    } else {
      url = buildBaseUrl();
    }

    const mg = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    if (!mg.ok) {
      const err = await mg.text();
      return NextResponse.json(
        { error: "Mailgun API failed", details: err },
        { status: mg.status }
      );
    }

    const data = await mg.json();
    const items = data.items || [];

    const events = items.map((item: any) => ({
      id: item.id || `${item.timestamp}-${item.recipient}`,
      event: item.event,
      recipient: item.recipient,
      subject: item.message?.headers?.subject || "N/A",
      timestamp: item.timestamp * 1000,
      tags: item.tags || [],
    }));

    return NextResponse.json({
      events,
      nextCursor: data.paging?.next || null,
      previousCursor: data.paging?.previous || null,
    });
  } catch (error) {
    console.error("Mailgun API error:", error);
    return NextResponse.json(
      { error: "Server error fetching Mailgun logs." },
      { status: 500 }
    );
  }
}