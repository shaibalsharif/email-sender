// shaibal-tiller/email-sender/email-sender-c22c2b1af63b53a59fceba3becd042d482fd2518/app/api/contacts/route.ts

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    // FIX: Changed to tagged template literal syntax
    const contacts = await sql`SELECT email, name, custom_fields FROM contacts ORDER BY created_at DESC LIMIT 3000`
    return Response.json(contacts)
  } catch (error) {
    return Response.json([], { status: 200 })
  }
}