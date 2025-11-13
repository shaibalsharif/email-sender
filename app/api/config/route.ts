import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  // Always load from environment variables as per user request
  const mailgunApiKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN || "";
  const fromEmail = process.env.MAILGUN_FROM_EMAIL || "";
  const fromName = process.env.MAILGUN_FROM_NAME || "";

  if (mailgunApiKey && mailgunDomain && fromEmail) {
    return Response.json({
      mailgunDomain,
      fromEmail,
      fromName,
      isFromEnv: true,
      // API Key is intentionally NOT returned to the client
    });
  }

  // If critical ENV variables are missing, indicate a read-only configuration failure.
  return Response.json(
    {
      mailgunDomain: fromName,
      fromEmail: fromEmail,
      fromName: fromName,
      isFromEnv: false,
      error:
        "Missing MAILGUN_API_KEY, MAILGUN_DOMAIN, or MAILGUN_FROM_EMAIL environment variables.",
    },
    { status: 200 }
  );
}

// POST function has been removed to prevent saving config to the database,
// ensuring configuration is exclusively from environment variables.

export async function POST(request: Request) {
  try {
    const { mailgunDomain, fromEmail, fromName } = await request.json();

    if (!mailgunDomain || !fromEmail) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await sql`INSERT INTO mailgun_config (mailgun_domain, from_email, from_name) VALUES (${mailgunDomain}, ${fromEmail}, ${fromName}) ON CONFLICT DO NOTHING`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error saving config:", error);
    return Response.json({ error: "Failed to save config" }, { status: 500 });
  }
}
