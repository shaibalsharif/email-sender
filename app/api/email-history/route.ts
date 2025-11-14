// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/email-history/route.ts

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Helper interface for the grouped structure
interface HistoryGroup {
    batchId: string;
    batchName: string;
    scheduledAt: string;
    count: number;
    sentCount: number;
    failedCount: number;
    status: 'scheduled' | 'pending' | 'sent' | 'failed' | 'no-batch';
    records: any[];
}

export async function GET(request: Request) {
  try {
    // Attempt the full query including the new columns (scheduled_at and batch_name)
    const history = await sql`
      SELECT id, recipient_email, recipient_name, subject, body, image_url, status, sent_at, created_at, scheduled_at, mailgun_message_id, batch_name
      FROM email_history 
      ORDER BY created_at DESC 
      LIMIT 1000
    `
    
    const groupedHistory = new Map<string, HistoryGroup>();
    const now = Date.now();
    
    history.forEach((record: any) => {
        let key = record.mailgun_message_id;
        
        // Key generation for old/non-batched records
        if (!key) {
            // Assign a unique key based on created_at and ID for truly unbatched/old records
            key = 'no_batch_' + record.created_at + '_' + (record.id || Math.random());
        }

        if (!groupedHistory.has(key)) {
            let batchName = record.batch_name || 'No-Name Batch';
            
            if (key.startsWith('no_batch_')) {
                batchName = 'No Batches (Individual)';
            } else if (!record.batch_name) {
                batchName = 'Legacy Batch';
            }
            
            groupedHistory.set(key, {
                batchId: key,
                batchName: batchName,
                // Use the most relevant time for sorting/display
                scheduledAt: record.scheduled_at || record.created_at, 
                count: 0,
                sentCount: 0,
                failedCount: 0,
                status: 'no-batch', // Default status will be overwritten below
                records: [],
            });
        }

        const group = groupedHistory.get(key)!;
        group.count++;
        group.records.push(record);
        
        if (record.status === 'sent') {
            group.sentCount++;
        } else if (record.status === 'failed') {
            group.failedCount++;
        }
        
        // **REFINED STATUS LOGIC DURING ITERATION**
        const recordScheduledTime = record.scheduled_at ? new Date(record.scheduled_at).getTime() : 0;
        
        // Priority 1: Future Scheduled - If ANY record is scheduled for the future, the group is 'scheduled'.
        if (record.status === 'scheduled' && recordScheduledTime > now) {
             group.status = 'scheduled'; 
        }
    });
    
    // Final check to determine the final status if not already marked 'scheduled' (i.e., time has passed)
    const finalGroups: HistoryGroup[] = Array.from(groupedHistory.values()).map(group => {
        
        if (group.status === 'scheduled') {
            // If already determined as 'scheduled' (future), keep it.
            return group;
        }

        // If not scheduled for the future, determine executed status:
        
        if (group.failedCount > 0) {
            // If any message failed, the whole batch is marked 'failed'.
            group.status = 'failed';
        } else if (group.sentCount === group.count) {
            // If all records were marked 'sent', the batch is fully 'sent'.
            group.status = 'sent';
        } else {
            // If the group is not future-scheduled, hasn't fully sent, and hasn't explicitly failed, 
            // it means some records are stuck (e.g., status: 'scheduled' but time passed).
            // We classify this as 'pending' (overdue/stuck).
            group.status = 'pending';
        }
        
        // Handle individual pre-batch records (for backwards compatibility)
        if (group.batchName === 'No Batches (Individual)') {
            const individualRecord = group.records[0];
            if (individualRecord.status === 'sent') group.status = 'sent';
            else if (individualRecord.status === 'failed') group.status = 'failed';
            else group.status = 'pending';
        }

        return group;
    });

    // Sort by scheduledAt/created_at
    const sortedGroups = finalGroups.sort((a, b) => {
        const timeA = a.scheduledAt || a.records[0].created_at;
        const timeB = b.scheduledAt || b.records[0].created_at;
        
        // Descending order (newest first)
        if (timeA < timeB) return 1; 
        if (timeA > timeB) return -1;
        return 0; 
    });

    return Response.json(sortedGroups);
  } catch (error) {
    // Fallback logic for missing columns (scheduled_at or batch_name)
    const neonError = error as { code?: string, message: string };
    if (neonError.code === '42703' || neonError.message.includes('column "scheduled_at" does not exist') || neonError.message.includes('column "batch_name" does not exist')) {
        console.warn("Falling back to legacy email_history query due to missing column(s). Please run the schema migration.");
        
        const history = await sql`
            SELECT id, recipient_email, recipient_name, subject, body, image_url, status, sent_at, created_at, mailgun_message_id
            FROM email_history 
            ORDER BY created_at DESC 
            LIMIT 1000
        `
        const legacyGroups = history.map((record: any) => ({
             batchId: 'no_batch_' + (record.id || Math.random()),
             batchName: 'No Batches (Individual - Migrate DB)',
             scheduledAt: record.created_at, // Use created_at as the time
             count: 1,
             sentCount: record.status === 'sent' ? 1 : 0,
             failedCount: record.status === 'failed' ? 1 : 0,
             status: record.status === 'sent' ? 'sent' : record.status === 'failed' ? 'failed' : 'pending',
             records: [record]
        }));
        return Response.json(legacyGroups);
    }
    
    console.error("Error fetching history:", error)
    return Response.json([], { status: 200 })
  }
}