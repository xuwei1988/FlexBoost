const {
  isPasswordConfigured,
  setSessionCookie,
  signSessionToken,
  verifyPassword
} = require("./_lib/dashboard-auth");

function parseJsonBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!isPasswordConfigured()) {
    return res.status(503).json({
      error: "Dashboard password is not configured.",
      detail: "Set DASHBOARD_PASSWORD in Vercel project settings."
    });
  }

  try {
    const body = parseJsonBody(req);
    const password = String(body.password || "");
    if (!verifyPassword(password)) {
      return res.status(401).json({ error: "Invalid password." });
    }

    const token = signSessionToken();
    setSessionCookie(res, token);
    return res.status(200).json({ ok: true, authenticated: true });
  } catch (error) {
    return res.status(500).json({
      error: "Login failed.",
      detail: String(error)
    });
  }
};
