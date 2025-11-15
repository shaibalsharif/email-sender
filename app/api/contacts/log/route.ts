import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  try {
    const { 
      recipient, 
      recipientName, 
      subject, 
      body, 
      imageUrl, 
      status, 
      batchName, 
      batchIndex,
      attachmentFileName 
    } = await request.json();

    if (!recipient || !subject || !status) {
      return new Response(
        JSON.stringify({ error: "Missing required log data (recipient, subject, status)." }), 
        { status: 400 }
      );
    }
    
    // Use batch_index 1 as default if not provided (for backward compatibility)
    const batchIndexValue = batchIndex !== undefined ? batchIndex : 1;
    const batchNameValue = batchName || `batch-${Date.now()}`;
    
    try {
      // Try to insert with all new columns
      await sql`
        INSERT INTO email_history (
          recipient_email, 
          recipient_name, 
          subject, 
          body, 
          image_url, 
          status, 
          batch_name,
          batch_index,
          attachment_file_name
        ) 
        VALUES (
          ${recipient}, 
          ${recipientName || 'Unknown'}, 
          ${subject}, 
          ${body || ''}, 
          ${imageUrl || null}, 
          ${status}, 
          ${batchNameValue},
          ${batchIndexValue},
          ${attachmentFileName || null}
        )
      `;
      
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (columnError: any) {
      // If columns don't exist, fall back to minimal insert
      if (columnError.code === '42703') {
        console.warn('Database schema missing columns. Running fallback insert. Column error:', columnError.column);
        
        // Try with just the essential columns that should exist
        try {
          await sql`
            INSERT INTO email_history (
              recipient_email, 
              recipient_name, 
              subject, 
              body, 
              image_url, 
              status, 
              batch_name
            ) 
            VALUES (
              ${recipient}, 
              ${recipientName || 'Unknown'}, 
              ${subject}, 
              ${body || ''}, 
              ${imageUrl || null}, 
              ${status}, 
              ${batchNameValue}
            )
          `;
          
          console.warn('⚠️ WARNING: Email logged without batch_index. Please run the database migration!');
          return new Response(
            JSON.stringify({ 
              success: true, 
              warning: 'Logged without batch tracking. Please update database schema.' 
            }), 
            { status: 200 }
          );
        } catch (basicError) {
          console.error('Even basic insert failed:', basicError);
          throw basicError;
        }
      } else {
        throw columnError;
      }
    }
  } catch (error) {
    console.error("Error logging contact history:", error);
    return new Response(
      JSON.stringify({ 
        error: `Failed to log contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: error instanceof Error ? error.message : undefined
      }), 
      { status: 500 }
    );
  }
}