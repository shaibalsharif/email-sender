// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/contacts/update-status/route.ts

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
    try {
        const { batchId, newStatus } = await request.json(); // batchId is the unique batch_name
        
        // Check for valid status values
        if (!batchId || !newStatus || !['scheduled', 'paused', 'validation_failed'].includes(newStatus)) {
            return NextResponse.json({ error: "Missing or invalid status update data." }, { status: 400 });
        }
        
        // Update all records belonging to the given batch ID
        const result = await sql`
            UPDATE email_history
            SET 
                status = ${newStatus}, 
                updated_at = NOW()
            WHERE batch_name = ${batchId}
            RETURNING id
        `;

        if (result.length === 0) {
            return NextResponse.json({ error: "Batch not found or already executed/invalid." }, { status: 404 });
        }

        return NextResponse.json({ success: true, updatedCount: result.length });
    } catch (error) {
        console.error("Error updating batch status:", error);
        return NextResponse.json({ error: `Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 });
    }
}