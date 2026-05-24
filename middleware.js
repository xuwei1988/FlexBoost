const COOKIE_NAME = "dashboard_session";

function getSessionSecret() {
  return (
    String(process.env.DASHBOARD_SESSION_SECRET || "") ||
    String(process.env.DASHBOARD_PASSWORD || "")
  );
}

function isPasswordConfigured() {
  return String(process.env.DASHBOARD_PASSWORD || "").length > 0;
}

function toBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifySessionToken(token) {
  const secret = getSessionSecret();
  if (!secret || !token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [expStr, nonce, signature] = parts;
  const payload = `${expStr}.${nonce}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  const expected = toBase64Url(sigBuffer);
  if (signature !== expected) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return true;
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export default async function middleware(request) {
  if (!isPasswordConfigured()) {
    return Response.redirect(new URL("/login.html", request.url), 307);
  }

  const token = readCookie(request, COOKIE_NAME);
  const authenticated = await verifySessionToken(token);
  if (!authenticated) {
    return Response.redirect(new URL("/login.html", request.url), 307);
  }
}

export const config = {
  matcher: ["/", "/index.html"]
};
