import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    const { recipient, recipientName, subject, body, imageUrl, mailgunDomain, fromEmail, fromName } =
      await request.json()

    const mailgunApiKey = process.env.MAILGUN_API_KEY

    if (!mailgunDomain || !mailgunApiKey || !fromEmail || !recipient) {
      return Response.json({ error: "Missing required configuration or recipient data." }, { status: 400 })
    }

    let processedBody = body

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
        
        // Split content by single newlines to get list items.
        const listItems = content.split(/\n/);
        
        // Wrap list items in <ul><li> tags
        const listHtml = listItems
            .filter((item:any) => item.trim() !== '') 
            .map((item:any) => `<li>${item.trim()}</li>`)
            .join('');
            
        // Use inline styles for UL/LI for better email client compatibility
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

    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div>
            ${processedBody}
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
    formData.append("to", recipient)
    formData.append("subject", subject)
    formData.append("html", htmlBody)

    const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
      },
      body: formData,
    })

    let status = "failed"
    let messageId = null

    if (mailgunResponse.ok) {
      const responseData = await mailgunResponse.json()
      status = "sent"
      messageId = responseData.id
    }

    const sentAt = status === "sent" ? new Date() : null

    await sql`
      INSERT INTO email_history (recipient_email, recipient_name, subject, body, image_url, status, mailgun_message_id, sent_at) 
      VALUES (${recipient}, ${recipientName}, ${subject}, ${body}, ${imageUrl || null}, ${status}, ${messageId}, ${sentAt})
    `

    if (!mailgunResponse.ok) {
      const error = await mailgunResponse.text()
      console.error("Mailgun error:", error)
      return Response.json({ error: "Failed to send email via Mailgun" }, { status: 500 })
    }

    return Response.json({ success: true, status, messageId })
  } catch (error) {
    console.error("Error sending email:", error)
    return Response.json({ error: "Failed to send email" }, { status: 500 })
  }
}