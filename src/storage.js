function getAdminSecret() {
  return localStorage.getItem("poker-admin-secret");
}

const QUEUE_KEY = "poker-op-queue";

// The op queue is persisted so an entry made with no signal survives a page
// refresh or tab kill and still syncs later.
export function loadQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY));
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error("Queue persist failed:", e);
  }
}

// Returns the session array or null on any failure.
export async function loadSessions() {
  try {
    const res = await fetch("/api/sessions", {
      headers: { "x-admin-secret": getAdminSecret() }
    });
    if (!res.ok) throw new Error(`Load failed: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Load failed:", e);
    return null;
  }
}

// Posts one op. Returns:
//   { ok, session?, deleted? } — committed; session is the server's
//                                authoritative copy (absent when deleted)
//   { drop: true }            — permanently rejected, discard the op
//   { retry: true }           — network/server trouble, try again
export async function sendOp(op) {
  try {
    const res = await fetch("/api/op", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": getAdminSecret() },
      body: JSON.stringify(op)
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: true, session: body.session || null, deleted: !!body.deleted };
    }
    // Invalid op or missing session can never succeed; everything else
    // (5xx, 401 misconfig, timeouts) is worth retrying
    if (res.status === 400 || res.status === 404) {
      console.error("Op rejected:", res.status, op);
      return { drop: true };
    }
    return { retry: true };
  } catch (e) {
    console.error("Op send failed:", e);
    return { retry: true };
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
