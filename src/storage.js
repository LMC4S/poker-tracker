function getAdminSecret() {
  return localStorage.getItem("poker-admin-secret");
}

// Returns { sessions, version } or null on any failure. The version is an
// opaque token echoed back on save so the server can detect stale writes.
export async function loadSessions() {
  try {
    const res = await fetch("/api/sessions", {
      headers: { "x-admin-secret": getAdminSecret() }
    });
    if (!res.ok) throw new Error(`Load failed: ${res.status}`);
    const sessions = await res.json();
    return { sessions, version: res.headers.get("x-data-version") || null };
  } catch (e) {
    console.error("Load failed:", e);
    return null;
  }
}

// Returns { ok, version } on success, { conflict, sessions, version } when
// another device saved first, or { ok: false } on network/server failure.
export async function saveSessions(sessions, baseVersion) {
  try {
    const headers = { "Content-Type": "application/json", "x-admin-secret": getAdminSecret() };
    if (baseVersion) headers["x-base-version"] = baseVersion;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers,
      body: JSON.stringify(sessions)
    });
    if (res.status === 409) {
      const body = await res.json();
      return { conflict: true, sessions: body.sessions || [], version: body.version || null };
    }
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    const body = await res.json().catch(() => ({}));
    return { ok: true, version: body.version || null };
  } catch (e) {
    console.error("Save failed:", e);
    return { ok: false };
  }
}

// Public read of a single shared session by its token. Returns the session
// object, the string "notfound" for an invalid/expired link, or null on error.
export async function loadSharedSession(token) {
  try {
    const res = await fetch(`/api/session?token=${encodeURIComponent(token)}`);
    if (res.status === 404) return "notfound";
    if (!res.ok) throw new Error(`Load failed: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Shared session load failed:", e);
    return null;
  }
}
