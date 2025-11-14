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
  // Use a negative lookbehind assertion to ensure we don't accidentally match existing Mailgun variables if they were used
  return template.replace(/(\{\{(\w+)\}\})(?![\s\S]*%recipient\.\w+%)/g, (_, key) => `%recipient.${key}%`)
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
  
  // --- FIX START: Restore Mailgun variables (guarantees Mailgun receives intact variables) ---
  variablePlaceholders.forEach((original, placeholder) => {
      processedBody = processedBody.replace(placeholder, original);
  });
  // --- FIX END ---
  
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
      fromName,
      batchName, // NEW: Batch name for tracking
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
      // Mailgun requires name in the 'to' field for tracking and personalization
      toList.push(`${recipient.name} <${recipient.email}>`)
      
      // Build Recipient Variables object 
      recipientVariables[recipient.email] = { 
        name: recipient.name,
        ...recipient.custom_fields 
      }
    }
    
    // 2. Convert templates to Mailgun's %recipient.variable% syntax
    const mailgunSubject = convertToMailgunVariables(subjectTemplate)
    const mailgunBody = convertToMailgunVariables(bodyTemplate)
    
    // 3. Process HTML Body 
    const processedHtmlContent = processBodyToHtml(mailgunBody)

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

    // **CRITICAL FIX START: Force RFC 2822 UTC Format**
    const scheduledDate = new Date(scheduledDeliveryTime);
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const day = days[scheduledDate.getUTCDay()];
    const date = ('0' + scheduledDate.getUTCDate()).slice(-2);
    const month = months[scheduledDate.getUTCMonth()];
    const year = scheduledDate.getUTCFullYear();
    const hour = ('0' + scheduledDate.getUTCHours()).slice(-2);
    const minute = ('0' + scheduledDate.getUTCMinutes()).slice(-2);
    const second = ('0' + scheduledDate.getUTCSeconds()).slice(-2);
    
    // Output: "Fri, 14 Oct 2011 23:10:10 +0000" (Guaranteed RFC 2822 format with UTC offset)
    const formattedScheduledTime = `${day}, ${date} ${month} ${year} ${hour}:${minute}:${second} +0000`;
    // **CRITICAL FIX END**

    const formData = new FormData()
    formData.append("from", `${fromName || "Sender"} <${fromEmail}>`)
    formData.append("to", toList.join(",")) // Mailgun resolves variables based on this list
    formData.append("subject", mailgunSubject) // Use converted subject
    formData.append("html", htmlBody) // Use converted body

    // Submit recipient variables as a form field
    formData.append("recipient-variables", JSON.stringify(recipientVariables))
    
    // Add Mailgun Scheduling (o:delivery-time)
    // Use the strictly formatted UTC time
    formData.append("o:delivery-time", formattedScheduledTime)

    // Optional tag for tracking (Using the unique batch name)
    formData.append("o:tag", batchName)

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

    // 3. Log each email in the history table (with ORIGINAL {{}} syntax for readability)
    const dbPromises = batchRecipients.map((recipient: any) => {
        // We log the *personalized* subject/body to the DB history for easier viewing
        const allFields = { name: recipient.name, ...recipient.custom_fields };
        const personalizedSubject = replaceVariables(subjectTemplate, allFields);
        const personalizedBody = replaceVariables(bodyTemplate, allFields);

        return sql`
          INSERT INTO email_history (recipient_email, recipient_name, subject, body, image_url, status, mailgun_message_id, scheduled_at, batch_name) 
          VALUES (${recipient.email}, ${recipient.name}, ${personalizedSubject}, ${personalizedBody}, ${imageUrl || null}, ${status}, ${messageId}, ${scheduledDate}, ${batchName})
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