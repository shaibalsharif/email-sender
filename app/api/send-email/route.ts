// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/send-email/route.ts

import { neon } from "@neondatabase/serverless"
import { format } from "date-fns" 

const sql = neon(process.env.DATABASE_URL!)

// Helper to replace variables in template (Required for DB logging of final content)
const replaceVariables = (template: string, values: Record<string, any>) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || `{{${key}}}`)
}

// NEW: Convert {{variable}} syntax to Mailgun's %recipient.variable% syntax
const convertToMailgunVariables = (template: string): string => {
  // CRITICAL FIX: Ensure template variables are converted correctly for Mailgun
  return template.replace(/(\{\{(\w+)\}\})/g, (_, key) => `%recipient.${key}%`)
}

// Helper function for rich-text processing (FIXED TO PROTECT MAILGUN VARIABLES)
const processBodyToHtml = (content: string): string => {
  if (!content) return ''

  let processedBody = content
  
  // --- FIX START: Temporarily replace Mailgun variables to protect them ---
  // Match both {{...}} and %recipient....% patterns
  const variablePlaceholders = new Map<string, string>();
  processedBody = processedBody.replace(/(\{\{.*?\}\}|%recipient\.\w+%)/g, (match) => {
    const placeholder = `__MGVAR_${variablePlaceholders.size}__`;
    variablePlaceholders.set(placeholder, match);
    return placeholder;
  });
  // --- FIX END ---

  // 1. Convert Bengali numbered points to H3 headings
  processedBody = processedBody.replace(
      /^([০-৯]+\।\s*.*?)$/gm,
      "<h3 style='margin: 15px 0 10px; font-size: 20px; line-height: 1.2;'>$1</h3>"
  )

  // 2. Convert text blocks immediately following H3 headings into an unordered list (ul/li)
  const listBlockRegex = /(<h3[^>]*>.*?<\/h3>\n)((?:[^\n].*\n?)+?)(?=(<h3[^>]*>.*?<\/h3>|\n{2,}|$))/g;

  processedBody = processedBody.replace(listBlockRegex, (match:any, header:any, content:any) => {
      content = content.trim();
      if (!content) return header;
      
      const listItems = content.split(/\n/);
      
      const listHtml = listItems
          .filter((item:any) => item.trim() !== '') 
          .map((item:any) => `<li>${item.trim()}</li>`)
          .join('');
          
      return `${header}<ul style="padding-left: 25px; margin: 5px 0 15px; list-style-type: disc;">${listHtml}</ul>\n`;
  });
  
  // 3. Convert **text** to <strong>text</strong> for bolding.
  processedBody = processedBody.replace(
      /\*\*(.*?)\*\*/g, 
      "<strong>$1</strong>"
  )
  
  // 4. Convert remaining newlines to <br/>
  processedBody = processedBody.replace(/\n/g, "<br/>")

  // 5. Cleanup: remove <br/> immediately preceding or following a block-level tag (h3)
  processedBody = processedBody.replace(/<br\/><h3/g, '<h3') 
  processedBody = processedBody.replace(/<\/h3><br\/>/g, '</h3>')
  
  // --- FIX START: Restore Mailgun variables (guarantees Mailgun receives intact variables) ---
  variablePlaceholders.forEach((original, placeholder) => {
      processedBody = processedBody.replace(placeholder, original);
  });
  // --- FIX END ---
  
  return processedBody;
}

// This API endpoint now handles the IMMEDIATE execution of a pre-calculated batch.
export async function POST(request: Request) {
  try {
    // --- STEP 1: Parse FormData from the request body ---
    const data = await request.formData();
    
    // Extract text fields (must be parsed from strings)
    const subjectTemplate = data.get('subjectTemplate') as string;
    const bodyTemplate = data.get('bodyTemplate') as string;
    const imageUrl = data.get('imageUrl') as string;
    const mailgunDomain = data.get('mailgunDomain') as string;
    const fromEmail = data.get('fromEmail') as string;
    const fromName = data.get('fromName') as string;
    const batchName = data.get('batchName') as string;
    const attachmentFile = data.get('attachment') as File | null;
    const attachmentFileName = data.get('attachmentFileName') as string | undefined;

    // Parse the JSON string back into an object
    const batchRecipients = JSON.parse(data.get('batchRecipients') as string);
    const scheduledAt = data.get('scheduled_at') as string; // Original scheduled time (for history update)
    const originalRecordIds = JSON.parse(data.get('originalRecordIds') as string); // IDs to update
    
    const mailgunApiKey = process.env.MAILGUN_API_KEY
    const batchSize = batchRecipients.length

    if (!mailgunDomain || !mailgunApiKey || !fromEmail || batchSize === 0) {
      return Response.json({ error: "Missing required configuration or recipients data." }, { status: 400 })
    }

    // 1. Prepare Mailgun Recipient Variables and 'to' list
    const toList = [];
    const recipientVariables: { [key: string]: Record<string, any> } = {};
    
    for (const recipient of batchRecipients) {
      toList.push(`${recipient.name} <${recipient.email}>`);
      recipientVariables[recipient.email] = { name: recipient.name, ...recipient.custom_fields };
    }
    
    // 2. Convert templates to Mailgun's %recipient.variable% syntax
    const mailgunSubject = convertToMailgunVariables(subjectTemplate);
    const mailgunBody = convertToMailgunVariables(bodyTemplate);
    
    // 3. Process HTML Body 
    const processedHtmlContent = processBodyToHtml(mailgunBody);

    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div>
            ${processedHtmlContent}
          </div>
          ${
            imageUrl
              ? `<img src="${imageUrl}" alt="Email image" width="100%" style="display: block; width: 100%; max-width: 600px; height: auto; margin-top: 20px; border-radius: 8px;" />`
              : ""
          }
        </body>
      </html>
    `;

    const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64");
    const mailgunFormData = new FormData();
    
    // Populate required fields
    mailgunFormData.append("from", `${fromName || "Sender"} <${fromEmail}>`);
    mailgunFormData.append("to", toList.join(",")); 
    mailgunFormData.append("subject", mailgunSubject); 
    mailgunFormData.append("html", htmlBody); 
    mailgunFormData.append("recipient-variables", JSON.stringify(recipientVariables));
    
    // Add Attachment if present
    if (attachmentFile) {
        mailgunFormData.append('attachment', attachmentFile, attachmentFileName || attachmentFile.name);
    }
    
    // No o:delivery-time here! This is an immediate send.
    mailgunFormData.append("o:tag", batchName);

    // --- STEP 3: Send to Mailgun ---
    const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
      },
      body: mailgunFormData, 
    });

    let status = "failed";
    let messageId = null;
    let responseData: any = {};
    const sentAt = new Date();

    if (mailgunResponse.ok) {
      responseData = await mailgunResponse.json();
      status = "sent"; 
      messageId = responseData.id;
    } else {
      const error = await mailgunResponse.text();
      console.error("Mailgun error:", error);
    }

    // 4. Update the existing records in the database
    // We update all individual records that were part of this execution batch
    const dbUpdatePromises = originalRecordIds.map((id: number) => sql`
        UPDATE email_history
        SET 
            status = ${status}, 
            mailgun_message_id = ${messageId},
            sent_at = ${sentAt},
            updated_at = NOW()
        WHERE id = ${id}
    `);

    await Promise.all(dbUpdatePromises);
    
    if (!mailgunResponse.ok) {
        return Response.json({ error: `Failed to send batch via Mailgun. Status updated to 'failed' locally.` }, { status: 500 });
    }

    return Response.json({ 
      success: true, 
      status, 
      messageId, 
      count: batchSize,
      sentTime: sentAt.toISOString()
    });
  } catch (error) {
    console.error("Error executing email batch:", error);
    return Response.json({ error: `Failed to execute email batch: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 });
  }
}