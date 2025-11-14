// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/mailgun/events/route.ts

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunApiKey = process.env.MAILGUN_API_KEY;

    if (!mailgunDomain || !mailgunApiKey) {
      return NextResponse.json({ error: "Mailgun credentials not configured." }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const cursorUrl = searchParams.get('cursor'); // Paginated URL provided by Mailgun
    
    const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");
    
    let url: string;
    
    if (cursorUrl) {
      // Use the full URL provided by Mailgun's 'next' link
      url = cursorUrl;
    } else {
      // First fetch: Set limit to 300
      url = `https://api.mailgun.net/v3/${mailgunDomain}/events?limit=300`;
    }

    const mailgunResponse = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
      // Mailgun API requires no-cache for proper pagination links
      cache: 'no-store', 
    });

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error("Mailgun event fetch error:", errorText);
      return NextResponse.json({ error: `Mailgun API failed: ${mailgunResponse.statusText}. Details: ${errorText}` }, { status: mailgunResponse.status });
    }

    const data = await mailgunResponse.json();
    const eventItems = data.items || [];
    
    // Extract the pagination cursor URLs
    const nextCursor = data.paging?.next;
    const previousCursor = data.paging?.previous;

    // Map events to a simplified structure for the client
    const events = eventItems.map((item: any) => ({
      id: item.id || `${item.timestamp}-${item.recipient}`,
      event: item.event,
      recipient: item.recipient,
      subject: item.message?.headers?.subject || 'N/A',
      timestamp: item.timestamp * 1000, // Convert Mailgun seconds to milliseconds
      tags: item.tags || [],
    }));

    return NextResponse.json({
      events,
      nextCursor,
      previousCursor,
    });
    
  } catch (error) {
    console.error("Error fetching Mailgun events:", error);
    return NextResponse.json({ error: "Internal server error during Mailgun event fetch." }, { status: 500 });
  }
}