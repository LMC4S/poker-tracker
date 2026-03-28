import { supabase } from "./lib/supabase";
import { STORAGE_KEY } from "./utils";

const PUBLIC_KEY = "poker-public-v1";

function getAdminHash() {
  return sessionStorage.getItem("poker-admin-secret");
}

export async function loadSessions() {
  try {
    const hash = getAdminHash();
    if (hash) {
      const res = await fetch("/api/sessions", {
        headers: { "x-admin-secret": hash }
      });
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      return await res.json();
    }
    // Fallback for local dev without API
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Load failed:", e);
    return null;
  }
}

export async function saveSessions(sessions) {
  try {
    const hash = getAdminHash();
    if (hash) {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-secret": hash },
        body: JSON.stringify(sessions)
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  } catch (e) {
    console.error("Save failed:", e);
  }
}

export async function loadPublicSnapshot() {
  try {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("poker_public")
      .select("value")
      .eq("key", PUBLIC_KEY)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data ? JSON.parse(data.value) : null;
  } catch (e) {
    console.error("Public snapshot load failed:", e);
    return null;
  }
}
