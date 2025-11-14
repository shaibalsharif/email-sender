// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/mailgun/scheduled/route.ts

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunApiKey = process.env.MAILGUN_API_KEY;

    if (!mailgunDomain || !mailgunApiKey) {
      return NextResponse.json({ error: "Mailgun credentials not configured." }, { status: 500 });
    }

    const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");
    
    // Fetching scheduled messages requires querying the events API for 'scheduled' events
    // We only fetch the last 100 scheduled events (can be customized)
    const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/events?event=scheduled&limit=100`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error("Mailgun scheduled fetch error:", errorText);
      return NextResponse.json({ error: `Mailgun API failed: ${mailgunResponse.statusText}. Details: ${errorText}` }, { status: mailgunResponse.status });
    }

    const data = await mailgunResponse.json();
    const scheduledMessages = data.items || [];
    
    // Parse the event data into a useful format
    const scheduledJobs = scheduledMessages.map((item: any) => ({
      // The message-id is the unique identifier needed for cancellation
      id: item["message"]["headers"]["message-id"], 
      recipient: item.recipient,
      subject: item["message"]["headers"]["subject"],
      // Mailgun timestamp is in seconds, convert to milliseconds
      scheduled_at: item.timestamp * 1000, 
      status: item.event, 
    }));


    return NextResponse.json(scheduledJobs);
    
  } catch (error) {
    console.error("Error fetching scheduled messages:", error);
    return NextResponse.json({ error: "Internal server error during scheduled message fetch." }, { status: 500 });
  }
}