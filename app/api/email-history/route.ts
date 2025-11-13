import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: Request) {
  try {
    const history = await sql`
      SELECT id, recipient_email, recipient_name, subject, body, image_url, status, sent_at, created_at 
      FROM email_history 
      ORDER BY created_at DESC 
      LIMIT 1000
    `
    return Response.json(history)
  } catch (error) {
    console.error("Error fetching history:", error)
    return Response.json([], { status: 200 })
  }
}
