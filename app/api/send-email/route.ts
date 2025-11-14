// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/app/api/send-email/route.ts

import { neon } from "@neondatabase/serverless"
import { format } from "date-fns" 

const sql = neon(process.env.DATABASE_URL!)

// Helper to replace variables in template (Required for DB logging of final content)
const replaceVariables = (template: string, values: Record<string, any>) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || `{{${key}}}`)
}


// Helper function for rich-text processing (kept for consistency)
const processBodyToHtml = (content: string): string => {
  if (!content) return ''

  let processedBody = content

  // 1. Convert Bengali numbered points to H3 headings
  processedBody = processedBody.replace(
      /^([০-৯]+\।\s*.*?)$/gm,
      "<h3 style='margin: 15px 0 10px; font-size: 18px; line-height: 1.2;'>$1</h3>"
  )

  // 2. Convert text blocks immediately following H3 headings into an unordered list (ul/li)
  const listBlockRegex = /(<h3[^>]*>.*?<\/h3>\n)([^]*?)(?=(<h3[^>]*>.*?<\/h3>|\n{2,}|$))/g;

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
  
  return processedBody;
}

export async function POST(request: Request) {
  try {
    const { 
      subjectTemplate, // Raw subject template (e.g., "Dear {{name}}")
      bodyTemplate,    // Raw body template
      batchRecipients, // An array of { email, name, custom_fields, scheduled_at }
      imageUrl, 
      mailgunDomain, 
      fromEmail, 
      fromName 
    } = await request.json()

    const mailgunApiKey = process.env.MAILGUN_API_KEY
    const batchSize = batchRecipients.length

    if (!mailgunDomain || !mailgunApiKey || !fromEmail || batchSize === 0) {
      return Response.json({ error: "Missing required configuration or recipients data." }, { status: 400 })
    }

    const scheduledDeliveryTime = batchRecipients[0].scheduled_at 
    
    // 1. Prepare Mailgun Recipient Variables and 'to' list
    const toList = []
    const recipientVariables: { [key: string]: Record<string, any> } = {}
    
    for (const recipient of batchRecipients) {
      // Must use recipient variable syntax in the 'to' field for Mailgun to activate it
      toList.push(`${recipient.name} <${recipient.email}>`)
      
      // Build Recipient Variables object (must contain all template variables)
      recipientVariables[recipient.email] = { 
        name: recipient.name,
        // Include custom fields so they can be resolved in the template
        ...recipient.custom_fields 
      }
    }
    
    // 2. Process HTML Body (using the RAW template, which contains {{name}})
    // The Mailgun API will replace the {{variables}} in the content below
    const processedHtmlContent = processBodyToHtml(bodyTemplate)

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
    `

    const auth = Buffer.from(`api:${mailgunApiKey}`).toString("base64")

    const formData = new FormData()
    formData.append("from", `${fromName || "Sender"} <${fromEmail}>`)
    formData.append("to", toList.join(",")) // Mailgun resolves variables in here
    formData.append("subject", subjectTemplate) // Raw template subject
    formData.append("html", htmlBody) // HTML body with {{variables}}

    // --- CRITICAL FIX: Add Mailgun Recipient Variables Header for Personalization ---
    formData.append("h:X-Mailgun-Recipient-Variables", JSON.stringify(recipientVariables))
    
    // Add Mailgun Scheduling (o:delivery-time)
    const scheduledDate = new Date(scheduledDeliveryTime)
    const formattedScheduledTime = format(scheduledDate, "eee, dd MMM yyyy HH:mm:ss xx")
    formData.append("o:delivery-time", formattedScheduledTime)

    // Optional tag for tracking
    formData.append("o:tag", "scheduled-batch")

    const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
      },
      body: formData,
    })

    let status = "failed"
    let messageId = null
    let responseData: any = {}

    if (mailgunResponse.ok) {
      responseData = await mailgunResponse.json()
      status = "scheduled" 
      messageId = responseData.id 
    } else {
      const error = await mailgunResponse.text()
      console.error("Mailgun error:", error)
      return Response.json({ error: `Mailgun failed to schedule batch of ${batchSize} emails. Check console for details.` }, { status: 500 })
    }

    // 3. Log each email in the history table (logging the fully personalized body for history viewing)
    const dbPromises = batchRecipients.map((recipient: any) => {
        // Reconstruct fields object for replaceVariables
        const allFields = { name: recipient.name, ...recipient.custom_fields };
        
        // We log the *personalized* subject/body to the DB history for easier viewing
        const personalizedSubject = replaceVariables(subjectTemplate, allFields);
        const personalizedBody = replaceVariables(bodyTemplate, allFields);

        return sql`
          INSERT INTO email_history (recipient_email, recipient_name, subject, body, image_url, status, mailgun_message_id, scheduled_at) 
          VALUES (${recipient.email}, ${recipient.name}, ${personalizedSubject}, ${personalizedBody}, ${imageUrl || null}, ${status}, ${messageId}, ${scheduledDate})
          RETURNING id
        `
    });

    await Promise.all(dbPromises)
    
    return Response.json({ 
      success: true, 
      status, 
      messageId, 
      count: batchSize,
      scheduledTime: formattedScheduledTime
    })
  } catch (error) {
    console.error("Error scheduling email batch:", error)
    return Response.json({ error: `Failed to schedule email batch: ${error instanceof Error ? error.message : 'Unknown error'}` }, { status: 500 })
  }
}