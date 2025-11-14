// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/contacts/route.ts

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    // FIX: Using CTE to calculate email status counts for each contact (Sent, Pending/Scheduled, Failed)
    const contactsWithStats = await sql`
      WITH EmailStats AS (
          SELECT 
              recipient_email,
              COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
              COUNT(*) FILTER (WHERE status = 'scheduled' OR status = 'pending') AS pending_count,
              COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
          FROM email_history
          GROUP BY recipient_email
      )
      SELECT 
          c.email, 
          c.name, 
          c.custom_fields, 
          COALESCE(e.sent_count, 0) AS sent_count,
          COALESCE(e.pending_count, 0) AS pending_count,
          COALESCE(e.failed_count, 0) AS failed_count
      FROM contacts c
      LEFT JOIN EmailStats e ON c.email = e.recipient_email
      ORDER BY c.created_at DESC 
      LIMIT 3000
    `
    return Response.json(contactsWithStats)
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return Response.json([], { status: 200 })
  }
}

// New DELETE endpoint for hard deletion
export async function DELETE(request: Request) {
    try {
        const { email } = await request.json();
        
        if (!email) {
            return Response.json({ error: "Missing recipient email." }, { status: 400 });
        }

        // Delete the contact from the contacts table
        const deleteContactsResult = await sql`
            DELETE FROM contacts
            WHERE email = ${email}
            RETURNING email;
        `;

        if (deleteContactsResult.length === 0) {
            return Response.json({ error: "Contact not found." }, { status: 404 });
        }

        return Response.json({ success: true, deletedEmail: email });
    } catch (error) {
        console.error("Error deleting contact:", error);
        return Response.json({ error: "Failed to delete contact." }, { status: 500 });
    }
}