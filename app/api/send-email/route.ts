import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

const replaceVariables = (template: string, values: Record<string, any>) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || `{{${key}}}`)
}

const convertToMailgunVariables = (template: string): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => `%recipient.${key}%`)
}

const processBodyToHtml = (content: string): string => {
  if (!content) return ''

  let processedBody = content
  
  // Protect Mailgun variables from HTML processing
  const variablePlaceholders = new Map<string, string>();
  processedBody = processedBody.replace(/(%recipient\.\w+%)/g, (match) => {
    const placeholder = `__MGVAR_${variablePlaceholders.size}__`;
    variablePlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Convert Bengali numbered points to H3 headings
  processedBody = processedBody.replace(
    /^([০-৯]+\।\s*.*?)$/gm,
    "<h3 style='margin: 15px 0 10px; font-size: 20px; line-height: 1.2;'>$1</h3>"
  )

  // Convert text blocks following H3 to lists
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
  
  // Convert **text** to bold
  processedBody = processedBody.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  
  // Convert newlines to <br/>
  processedBody = processedBody.replace(/\n/g, "<br/>")

  // Cleanup
  processedBody = processedBody.replace(/<br\/><h3/g, '<h3') 
  processedBody = processedBody.replace(/<\/h3><br\/>/g, '</h3>')
  
  // Restore Mailgun variables
  variablePlaceholders.forEach((original, placeholder) => {
    processedBody = processedBody.replace(placeholder, original);
  });
  
  return processedBody;
}

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    
    // These should be TEMPLATES with {{variable}} syntax
    const subjectTemplate = data.get('subjectTemplate') as string;
    const bodyTemplate = data.get('bodyTemplate') as string;
    const imageUrl = data.get('imageUrl') as string;
    const mailgunDomain = data.get('mailgunDomain') as string;
    const fromEmail = data.get('fromEmail') as string;
    const fromName = data.get('fromName') as string;
    const batchName = data.get('batchName') as string;
    const attachmentFile = data.get('attachment') as File | null;
    const attachmentFileName = data.get('attachmentFileName') as string | null;

    const batchRecipients = JSON.parse(data.get('batchRecipients') as string);
    const originalRecordIds = JSON.parse(data.get('originalRecordIds') as string);
    
    const mailgunApiKey = process.env.MAILGUN_API_KEY
    const batchSize = batchRecipients.length

    if (!mailgunDomain || !mailgunApiKey || !fromEmail || batchSize === 0) {
      return Response.json({ error: "Missing required configuration or recipients data." }, { status: 400 })
    }

    console.log(`\n=== BATCH SEND DEBUG ===`);
    console.log(`Batch: ${batchName}`);
    console.log(`Recipients: ${batchSize}`);
    console.log(`Subject template: ${subjectTemplate}`);
    console.log(`Body template (first 100 chars): ${bodyTemplate.substring(0, 100)}...`);
    console.log(`Sample recipients:`, batchRecipients.slice(0, 3));

    // CRITICAL: Prepare Mailgun Recipient Variables
    // Each recipient gets their OWN personalization data
    const toList = [];
    const recipientVariables: { [key: string]: Record<string, any> } = {};
    
    for (const recipient of batchRecipients) {
      toList.push(`${recipient.name} <${recipient.email}>`);
      // CRITICAL: Store each recipient's data separately
      recipientVariables[recipient.email] = { 
        name: recipient.name, 
        email: recipient.email,
        ...recipient.custom_fields 
      };
    }
    
    console.log(`Sample recipient variables:`, JSON.stringify(recipientVariables[batchRecipients[0].email]));
    
    // CRITICAL: Convert {{variable}} to %recipient.variable%
    const mailgunSubject = convertToMailgunVariables(subjectTemplate);
    const mailgunBody = convertToMailgunVariables(bodyTemplate);
    
    console.log(`Mailgun subject: ${mailgunSubject}`);
    console.log(`Mailgun body (first 100 chars): ${mailgunBody.substring(0, 100)}...`);
    
    // Process HTML Body with Mailgun variables preserved
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
    
    mailgunFormData.append("from", `${fromName || "Sender"} <${fromEmail}>`);
    mailgunFormData.append("to", toList.join(",")); 
    mailgunFormData.append("subject", mailgunSubject); 
    mailgunFormData.append("html", htmlBody); 
    // CRITICAL: This is how Mailgun personalizes for each recipient
    mailgunFormData.append("recipient-variables", JSON.stringify(recipientVariables));
    
    console.log(`Recipient variables JSON length: ${JSON.stringify(recipientVariables).length} chars`);
    
    // Attach file if present
    if (attachmentFile) {
      console.log(`Attaching file: ${attachmentFile.name}, size: ${attachmentFile.size} bytes`);
      mailgunFormData.append('attachment', attachmentFile, attachmentFileName || attachmentFile.name);
    }
    
    mailgunFormData.append("o:tag", batchName);

    // Send to Mailgun
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
      console.log(`✅ Batch sent successfully. Message ID: ${messageId}`);
    } else {
      const error = await mailgunResponse.text();
      console.error("❌ Mailgun error:", error);
    }

    // Update database records
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
      sentTime: sentAt.toISOString(),
      attachmentIncluded: !!attachmentFile
    });
  } catch (error) {
    console.error("Error executing email batch:", error);
    return Response.json({ error: `Failed to execute email batch: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 });
  }
}