function getAdminHash() {
  return localStorage.getItem("poker-admin-secret");
}

export async function loadSessions() {
  try {
    const res = await fetch("/api/sessions", {
      headers: { "x-admin-secret": getAdminHash() }
    });
    if (!res.ok) throw new Error(`Load failed: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Load failed:", e);
    return null;
  }
}

export async function saveSessions(sessions) {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": getAdminHash() },
      body: JSON.stringify(sessions)
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  } catch (e) {
    console.error("Save failed:", e);
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
