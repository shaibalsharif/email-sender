import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    // mailgunApiKey is no longer expected in the request body
    const { recipient, recipientName, subject, body, imageUrl, mailgunDomain, fromEmail, fromName } =
      await request.json()

    // Retrieve the secret API Key from environment variables
    const mailgunApiKey = process.env.MAILGUN_API_KEY

    if (!mailgunDomain || !mailgunApiKey || !fromEmail || !recipient) {
      return Response.json({ error: "Missing required configuration or recipient data." }, { status: 400 })
    }

    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          ${
            imageUrl
              ? `<img src="${imageUrl}" alt="Email image" style="max-width: 100%; height: auto; margin-bottom: 20px; border-radius: 8px;" />`
              : ""
          }
          <div style="white-space: pre-wrap;">
            ${body
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
              .replace(/\*(.*?)\*/g, "<em>$1</em>")
              .replace(/\[(.+?)\]$$(.+?)$$/g, '<a href="$2" style="color: #0066cc;">$1</a>')
              .replace(/^### (.*?)$/gm, "<h3 style='margin: 15px 0 10px; font-size: 18px;'>$1</h3>")
              .replace(/^## (.*?)$/gm, "<h2 style='margin: 20px 0 10px; font-size: 22px;'>$1</h2>")
              .replace(/^# (.*?)$/gm, "<h1 style='margin: 20px 0 10px; font-size: 26px;'>$1</h1>")
              .replace(/\n/g, "<br/>")}
          </div>
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

    // Using tagged template literal syntax for secure query
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