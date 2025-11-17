import crypto from "crypto";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { code?: string };
    const submitted = body.code ?? "";
    const expected = process.env.SEND_SECRET_CODE ?? "";

    if (!expected) {
      console.error("SEND_SECRET_CODE is not configured in the environment.");
      return NextResponse.json(
        { ok: false, error: "Verification not configured on server." },
        { status: 500 }
      );
    }

    if (!submitted) {
      return NextResponse.json(
        { ok: false, error: "Missing code." },
        { status: 400 }
      );
    }
    // Constant‑time comparison to avoid timing attacks
    const submittedBuf = Buffer.from(submitted);
    const expectedBuf = Buffer.from(expected);

    const valid =
      submittedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(submittedBuf, expectedBuf);

    if (!valid) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("verify-secret route error", error);
    return NextResponse.json(
      { ok: false, error: "Invalid payload." },
      { status: 400 }
    );
  }
}
