// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/email-history/route.ts

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: Request) {
  try {
    // Attempt the full query including the new column (scheduled_at)
    const history = await sql`
      SELECT id, recipient_email, recipient_name, subject, body, image_url, status, sent_at, created_at, scheduled_at 
      FROM email_history 
      ORDER BY created_at DESC 
      LIMIT 1000
    `
    return Response.json(history)
  } catch (error) {
    // If column "scheduled_at" does not exist (Error Code '42703'), fall back to legacy query
    const neonError = error as { code?: string, message: string };
    if (neonError.code === '42703' || neonError.message.includes('column "scheduled_at" does not exist')) {
        console.warn("Falling back to legacy email_history query due to missing 'scheduled_at' column. Please run the schema migration.");
        try {
             const history = await sql`
                SELECT id, recipient_email, recipient_name, subject, body, image_url, status, sent_at, created_at
                FROM email_history 
                ORDER BY created_at DESC 
                LIMIT 1000
            `
            // Map data to ensure client component doesn't break from missing field
            const legacyHistory = history.map((record: any) => ({
                ...record,
                scheduled_at: null,
            }));
            return Response.json(legacyHistory);
        } catch (fallbackError) {
             console.error("Error fetching history with fallback:", fallbackError);
             return Response.json([], { status: 200 });
        }
    }
    
    // Log other errors and return empty data
    console.error("Error fetching history:", error)
    return Response.json([], { status: 200 })
  }
}