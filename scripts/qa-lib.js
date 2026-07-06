// Helpers compartidos para los scripts de QA contra producción.
const BASE = process.env.QA_BASE || "https://colbisnes-web-production.up.railway.app";

// Realiza el login real vía NextAuth (credentials) y devuelve el cookie jar (string) a usar
// en llamadas subsiguientes. Replica exactamente el flujo que hace el navegador:
// 1) GET /api/auth/csrf  2) POST /api/auth/callback/credentials
async function login(email, password) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfCookies = csrfRes.headers.get("set-cookie") || "";
  const { csrfToken } = await csrfRes.json();
  const csrfCookie = parseCookies(csrfCookies);

  const body = new URLSearchParams({
    email, password, csrfToken,
    callbackUrl: `${BASE}/`, json: "true",
  });

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookie,
    },
    body: body.toString(),
    redirect: "manual",
  });

  const setCookie = loginRes.headers.get("set-cookie") || "";
  const sessionCookies = parseCookies(setCookie);
  const allCookies = mergeCookies(csrfCookie, sessionCookies);

  // Verifica que el login realmente funcionó pidiendo la sesión
  const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: allCookies } });
  const session = await sessionRes.json();

  return { cookie: allCookies, session, loginStatus: loginRes.status };
}

function parseCookies(setCookieHeader) {
  // set-cookie puede venir con múltiples cookies separadas por coma en fetch nativo (se concatenan)
  // Node fetch devuelve un solo string con todas unidas por ", " en algunos casos; usamos un split robusto.
  if (!setCookieHeader) return "";
  const parts = setCookieHeader.split(/, (?=[a-zA-Z0-9_\-.]+=)/);
  return parts.map(p => p.split(";")[0]).join("; ");
}

function mergeCookies(...cookieStrings) {
  const map = new Map();
  for (const cs of cookieStrings) {
    if (!cs) continue;
    for (const pair of cs.split(";")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const k = trimmed.slice(0, idx);
      const v = trimmed.slice(idx + 1);
      map.set(k, v);
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function api(path, { method = "GET", cookie = "", body, isForm = false, headers = {} } = {}) {
  const opts = {
    method,
    headers: { ...headers, Cookie: cookie },
  };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body; // FormData
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

module.exports = { BASE, login, api };
