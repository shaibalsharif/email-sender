import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      recipient,
      recipientName,
      subject,
      body: emailBody,
      imageUrl,
      status,
      batchName,
      batchIndex,
      attachmentFileName,
      batchMode = "standard", // Default to standard if not provided
    } = body;

    if (!recipient || !subject || !emailBody) {
      return Response.json(
        { error: "Missing required fields: recipient, subject, body" },
        { status: 400 }
      );
    }

    // Insert the email record with batch_mode
    const result = await sql`
      INSERT INTO email_history (
        recipient_email,
        recipient_name,
        subject,
        body,
        image_url,
        status,
        batch_name,
        batch_index,
        attachment_file_name,
        batch_mode,
        created_at,
        updated_at
      )
      VALUES (
        ${recipient},
        ${recipientName || "Unknown"},
        ${subject},
        ${emailBody},
        ${imageUrl || null},
        ${status || "pending"},
        ${batchName || null},
        ${batchIndex || null},
        ${attachmentFileName || null},
        ${batchMode},
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    return Response.json({
      success: true,
      id: result[0].id,
      message: "Email record logged successfully",
    });
  } catch (error) {
    console.error("Error logging email record:", error);
    return Response.json(
      {
        error: "Failed to log email record",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
