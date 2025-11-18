import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  try {
    // Fetch all email history records
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
        attachment_file_name,
        mailgun_message_id,
        scheduled_at,
        sent_at,
        created_at,
        updated_at,
        batch_mode
      FROM email_history
      ORDER BY created_at DESC
    `;

    // Group records by batch_name to identify unique batches
    const batchGroups = new Map<string, any[]>();
    
    history.forEach((record: any) => {
      const batchKey = record.batch_name || 'default';
      if (!batchGroups.has(batchKey)) {
        batchGroups.set(batchKey, []);
      }
      batchGroups.get(batchKey)!.push(record);
    });

    // For each batch group, find the earliest sent_at timestamp to determine batch order
    const batchTimestamps: Array<{ batchName: string; earliestSentAt: Date | null }> = [];
    
    batchGroups.forEach((records, batchName) => {
      // Find the earliest sent_at among all records in this batch
      const sentRecords = records.filter(r => r.sent_at && r.status === 'sent');
      const earliestSentAt = sentRecords.length > 0
        ? new Date(Math.min(...sentRecords.map(r => new Date(r.sent_at).getTime())))
        : null;
      
      batchTimestamps.push({ batchName, earliestSentAt });
    });

    // Sort batches by sent time (oldest first) to assign sequential indexes
    // Batches without sent_at go to the end
    batchTimestamps.sort((a, b) => {
      if (a.earliestSentAt === null && b.earliestSentAt === null) return 0;
      if (a.earliestSentAt === null) return 1;
      if (b.earliestSentAt === null) return -1;
      return a.earliestSentAt.getTime() - b.earliestSentAt.getTime();
    });

    // Create a mapping of batch_name to computed batch_index (1, 2, 3, ...)
    const batchIndexMap = new Map<string, number>();
    batchTimestamps.forEach((batch, index) => {
      batchIndexMap.set(batch.batchName, index + 1);
    });

    // Apply computed batch_index to all records
    const historyWithComputedIndex = history.map((record: any) => ({
      ...record,
      batch_index: batchIndexMap.get(record.batch_name || 'default') || 1
    }));

    // Return records ordered by created_at DESC (most recent first)
    return new Response(JSON.stringify(historyWithComputedIndex), {
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
        const historyWithDefaults = basicHistory.map((record: any) => ({
          ...record,
          batch_index: 1,
          attachment_file_name: null,
          batch_mode: 'standard'
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