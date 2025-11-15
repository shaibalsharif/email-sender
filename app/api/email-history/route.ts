import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  try {
    // Fetch all email history records, ordered by most recent first
    const history = await sql`
      SELECT 
        id,
        recipient_email,
        recipient_name,
        subject,
        body,
        image_url,
        status,
        batch_name,
        COALESCE(batch_index, 1) as batch_index,
        attachment_file_name,
        mailgun_message_id,
        scheduled_at,
        sent_at,
        created_at,
        updated_at
      FROM email_history
      ORDER BY created_at DESC
    `;

    // Return the full history array
    return new Response(JSON.stringify(history), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("Error fetching email history:", error);
    
    // If the error is due to missing columns, try a simpler query
    if (error instanceof Error && error.message.includes('column')) {
      console.warn('Some columns missing, trying basic query...');
      
      try {
        const basicHistory = await sql`
          SELECT 
            id,
            recipient_email,
            recipient_name,
            subject,
            body,
            image_url,
            status,
            batch_name,
            mailgun_message_id,
            scheduled_at,
            sent_at,
            created_at,
            updated_at
          FROM email_history
          ORDER BY created_at DESC
        `;
        
        // Add default batch_index for compatibility
        const historyWithDefaults = basicHistory.map(record => ({
          ...record,
          batch_index: 1,
          attachment_file_name: null
        }));
        
        return new Response(JSON.stringify(historyWithDefaults), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (basicError) {
        console.error("Basic query also failed:", basicError);
        return new Response(
          JSON.stringify({ 
            error: "Failed to fetch email history", 
            details: basicError instanceof Error ? basicError.message : 'Unknown error'
          }), 
          { status: 500 }
        );
      }
    }
    
    return new Response(
      JSON.stringify({ 
        error: "Failed to fetch email history", 
        details: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { status: 500 }
    );
  }
}