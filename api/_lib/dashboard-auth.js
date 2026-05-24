const { createHmac, randomBytes, timingSafeEqual } = require("crypto");

const COOKIE_NAME = "dashboard_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getDashboardPassword() {
  return String(process.env.DASHBOARD_PASSWORD || "");
}

function getSessionSecret() {
  return (
    String(process.env.DASHBOARD_SESSION_SECRET || "") ||
    getDashboardPassword()
  );
}

function isPasswordConfigured() {
  return getDashboardPassword().length > 0;
}

function verifyPassword(input) {
  const expected = getDashboardPassword();
  if (!expected) return false;
  const provided = Buffer.from(String(input));
  const target = Buffer.from(expected);
  if (provided.length !== target.length) {
    timingSafeEqual(target, target);
    return false;
  }
  return timingSafeEqual(provided, target);
}

function signSessionToken() {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("Dashboard auth is not configured.");
  }
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = randomBytes(16).toString("hex");
  const payload = `${exp}.${nonce}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  const secret = getSessionSecret();
  if (!secret || !token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [expStr, nonce, signature] = parts;
  const payload = `${expStr}.${nonce}`;
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  } catch (_) {
    return false;
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return true;
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function isAuthenticated(req) {
  if (!isPasswordConfigured()) return false;
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function isProduction() {
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}

function buildCookie(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];
  if (isProduction()) parts.push("Secure");
  return parts.join("; ");
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    buildCookie(COOKIE_NAME, token, Math.floor(SESSION_TTL_MS / 1000))
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", buildCookie(COOKIE_NAME, "", 0));
}

function requireDashboardAuth(req, res) {
  if (!isPasswordConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Dashboard password is not configured."
    };
  }
  if (!isAuthenticated(req)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized. Please sign in."
    };
  }
  return { ok: true };
}

function sendAuthFailure(res, result) {
  return res.status(result.status).json({ error: result.error });
}

module.exports = {
  clearSessionCookie,
  isAuthenticated,
  isPasswordConfigured,
  requireDashboardAuth,
  sendAuthFailure,
  setSessionCookie,
  signSessionToken,
  verifyPassword
};
