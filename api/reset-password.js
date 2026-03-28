// Simple in-memory code store (resets on cold start, fine for our use case)
const codes = {};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { email, verifyCode } = req.body || {};
  const adminEmail = process.env.ADMIN_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;

  // ── Verify code ──────────────────────────────────────────────────────────
  if (verifyCode) {
    const stored = codes[adminEmail];
    if (!stored) return res.json({ valid: false });
    const expired = Date.now() - stored.time > 15 * 60 * 1000; // 15 min expiry
    const match = stored.code === verifyCode.trim().toUpperCase();
    if (match && !expired) {
      delete codes[adminEmail]; // one-time use
      return res.json({ valid: true });
    }
    return res.json({ valid: false });
  }

  // ── Send code ─────────────────────────────────────────────────────────────
  if (!email) return res.status(400).json({ error: "Email required" });
  if (email.toLowerCase().trim() !== adminEmail?.toLowerCase().trim()) {
    return res.status(403).json({ error: "Email not recognised as admin" });
  }

  // Generate 6-char alphanumeric code
  const code = Math.random().toString(36).toUpperCase().slice(2, 8);
  codes[adminEmail] = { code, time: Date.now() };

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Teekha Bouncer <onboarding@resend.dev>",
        to: [email],
        subject: "🏏 Teekha Bouncer — Password Reset Code",
        html: `
          <div style="font-family:sans-serif;max-width:400px;margin:0 auto;background:#080C14;color:#E2EAF4;padding:32px;border-radius:12px;">
            <h2 style="color:#F5A623;letter-spacing:2px;margin:0 0 8px;">🏏 TEEKHA BOUNCER LEAGUE</h2>
            <p style="color:#94A3B8;margin:16px 0;">Your password reset code is:</p>
            <div style="background:#141E2E;border:2px solid #F5A623;border-radius:8px;padding:24px;text-align:center;margin:20px 0;">
              <span style="font-size:40px;font-weight:800;color:#F5A623;letter-spacing:10px;">${code}</span>
            </div>
            <p style="color:#94A3B8;font-size:13px;">This code expires in <strong style="color:#E2EAF4;">15 minutes</strong>. Do not share it with anyone.</p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      throw new Error(err.message || "Email send failed");
    }
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
