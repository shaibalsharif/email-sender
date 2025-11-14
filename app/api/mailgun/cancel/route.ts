// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/mailgun/cancel/route.ts

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  try {
    const { messageId } = await request.json(); // Mailgun message-id: <...>
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunApiKey = process.env.MAILGUN_API_KEY;

    if (!mailgunDomain || !mailgunApiKey || !messageId) {
      return NextResponse.json({ error: "Missing required data or configuration." }, { status: 400 });
    }

    const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");
    
    // The message ID must be cleaned to be used in the URL path for DELETE
    const cleanMessageId = messageId.replace(/^<(.*)>$/, '$1');

    // Mailgun API endpoint for cancelling scheduled messages (DELETE request on the message ID)
    const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages/${cleanMessageId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!mailgunResponse.ok) {
      const errorText = await mailgunResponse.text();
      console.error("Mailgun cancel error:", errorText);
      return NextResponse.json({ error: `Mailgun cancel failed: ${mailgunResponse.statusText}. Details: ${errorText}` }, { status: mailgunResponse.status });
    }
    
    // Update local DB status to "cancelled" for all records with this mailgun_message_id
    await sql`
      UPDATE email_history
      SET status = 'cancelled', updated_at = NOW()
      WHERE mailgun_message_id = ${messageId}
    `;

    return NextResponse.json({ success: true, message: `Message ${messageId} cancelled and DB updated.` });
    
  } catch (error) {
    console.error("Error cancelling scheduled message:", error);
    return NextResponse.json({ error: "Internal server error during message cancellation." }, { status: 500 });
  }
}