import { supabase } from "./lib/supabase";
import { STORAGE_KEY } from "./utils";

export async function loadSessions() {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("poker_data")
        .select("value")
        .eq("key", STORAGE_KEY)
        .single();
      if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows found
      return data ? JSON.parse(data.value) : [];
    } else {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }
  } catch (e) {
    console.error("Load failed:", e);
    return null; // null = load error, distinct from [] = genuinely empty
  }
}

export async function saveSessions(sessions) {
  try {
    if (supabase) {
      const { error } = await supabase
        .from("poker_data")
        .upsert({ key: STORAGE_KEY, value: JSON.stringify(sessions), updated_at: new Date().toISOString() });
      if (error) throw error;
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  } catch (e) {
    console.error("Save failed:", e);
  }
}
