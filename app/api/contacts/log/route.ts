// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/contacts/log/route.ts

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
    try {
        const { recipient, recipientName, subject, body, imageUrl, status, scheduled_at, batchName } = await request.json();

        if (!recipient || !subject || !status) {
            return new Response(JSON.stringify({ error: "Missing required log data." }), { status: 400 });
        }

        const scheduledDate = scheduled_at ? new Date(scheduled_at) : null;
        
        // Log the new record with the future scheduled_at or validation_failed status
        await sql`
            INSERT INTO email_history (recipient_email, recipient_name, subject, body, image_url, status, scheduled_at, batch_name) 
            VALUES (${recipient}, ${recipientName}, ${subject}, ${body}, ${imageUrl || null}, ${status}, ${scheduledDate}, ${batchName})
        `;

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error("Error logging contact history:", error);
        return new Response(JSON.stringify({ error: `Failed to log contact: ${error instanceof Error ? error.message : 'Unknown error'}` }), { status: 500 });
    }
}