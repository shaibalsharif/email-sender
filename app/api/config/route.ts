import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
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
    });
  }

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mailgunDomain, fromEmail, fromName, secretCode } = body;

    const SEND_SECRET_CODE = process.env.SEND_SECRET_CODE;
    if (secretCode !== undefined) {
      if (!SEND_SECRET_CODE) {
        return Response.json({ verified: true, error: "Warning: SEND_SECRET_CODE environment variable is not set on the server." });
      }
      if (secretCode === SEND_SECRET_CODE) {
        return Response.json({ verified: true });
      } else {
        return Response.json({ verified: false, error: "Secret code is invalid." }, { status: 401 });
      }
    }

    if (!mailgunDomain || !fromEmail) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await sql`INSERT INTO mailgun_config (mailgun_domain, from_email, from_name) VALUES (${mailgunDomain}, ${fromEmail}, ${fromName}) ON CONFLICT DO NOTHING`;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error saving config/verifying secret:", error);
    return Response.json({ error: "Failed to process request" }, { status: 500 });
  }
}