// shaibal-tiller/email-sender/email-sender-c22c2b1af63b53a59fceba3becd042d482fd2518/app/api/contacts/sync/route.ts

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    const { contacts } = await request.json()

    for (const contact of contacts) {
      const name = contact.name
      const customFields = contact.customFields || {}

      // FIX: Changed to tagged template literal syntax
      await sql`
        INSERT INTO contacts (email, name, custom_fields) 
        VALUES (${contact.email}, ${name}, ${customFields}) 
        ON CONFLICT (email) DO UPDATE SET name=${name}, custom_fields=${customFields}
      `
    }

    return Response.json({ success: true, count: contacts.length })
  } catch (error) {
    console.error("Error syncing contacts:", error)
    return Response.json({ error: "Failed to sync contacts" }, { status: 500 })
  }
}