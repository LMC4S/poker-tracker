import { useState, useEffect, useCallback, useRef } from "react";
import { loadSessions, saveSessions } from "./storage";
import { uid } from "./utils";
import { S } from "./styles";
import PinGate from "./components/PinGate";
import Header from "./components/Header";
import Modal from "./components/Modal";
import HomeView from "./views/HomeView";
import ActiveView from "./views/ActiveView";
import SummaryView from "./views/SummaryView";
import ShareApp from "./ShareApp";

function AppContent({ isAdmin }) {
  const [sessions, setSessions] = useState([]);
  const [view, setView] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveEnabled, setSaveEnabled] = useState(false);
  const [modal, setModal] = useState(null);
  const [summaryId, setSummaryId] = useState(null);
  // idle | error (save failing, retrying) | conflict (another device saved first)
  const [syncState, setSyncState] = useState("idle");

  const pendingSaveRef = useRef(null);
  const savingRef = useRef(false);
  // Version token of the data we last loaded/saved; echoed on save so the
  // server can reject writes based on stale data
  const versionRef = useRef(null);
  // Set when sessions state was just replaced with server data, so the save
  // effect doesn't pointlessly upload it right back
  const skipSaveRef = useRef(false);

  // Load sessions once after login (hash is in sessionStorage)
  useEffect(() => {
    loadSessions().then(r => {
      if (r !== null) {
        versionRef.current = r.version;
        // Backfill share tokens for pre-share-feature sessions (no field at all);
        // null means the admin revoked the link, so leave it off
        setSessions(r.sessions.map(sess => sess.shareToken !== undefined ? sess : { ...sess, shareToken: crypto.randomUUID() }));
        setSaveEnabled(true);
      }
      setLoaded(true);
    });
  }, []);

  // Save on change. Failed saves retry every 3s with a visible banner instead
  // of silently dropping data; version conflicts adopt the server copy.
  useEffect(() => {
    if (!saveEnabled) return;
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    clearTimeout(pendingSaveRef.current);
    const attempt = async () => {
      if (savingRef.current) { pendingSaveRef.current = setTimeout(attempt, 150); return; }
      savingRef.current = true;
      const result = await saveSessions(sessions, versionRef.current);
      savingRef.current = false;
      if (result.ok) {
        if (result.version) versionRef.current = result.version;
        pendingSaveRef.current = null;
        // Clear a failure banner, but let a conflict notice run its full course
        setSyncState(s => s === "error" ? "idle" : s);
      } else if (result.conflict) {
        versionRef.current = result.version;
        pendingSaveRef.current = null;
        setSyncState("conflict");
        setSessions(result.sessions);
      } else {
        setSyncState("error");
        pendingSaveRef.current = setTimeout(attempt, 3000);
      }
    };
    pendingSaveRef.current = setTimeout(attempt, 300);
  }, [sessions, saveEnabled]);

  // Auto-dismiss the conflict notice
  useEffect(() => {
    if (syncState !== "conflict") return;
    const t = setTimeout(() => setSyncState(s => s === "conflict" ? "idle" : s), 6000);
    return () => clearTimeout(t);
  }, [syncState]);

  // Poll every 5s to sync across admin devices — pause when tab is hidden
  // Skip poll if a save is pending or in-flight to avoid overwriting local changes
  useEffect(() => {
    if (!saveEnabled) return;
    let interval = null;
    const poll = async () => {
      if (pendingSaveRef.current || savingRef.current) return;
      const fresh = await loadSessions();
      if (fresh === null) return;
      // Re-check after the download: a local change made while the response
      // was in flight must not be overwritten by this (now stale) snapshot
      if (pendingSaveRef.current || savingRef.current) return;
      if (fresh.version !== null && fresh.version === versionRef.current) return;
      setSessions(prev => {
        if (JSON.stringify(prev) === JSON.stringify(fresh.sessions)) {
          versionRef.current = fresh.version;
          return prev;
        }
        skipSaveRef.current = true;
        versionRef.current = fresh.version;
        return fresh.sessions;
      });
    };
    const start = () => { if (!interval) interval = setInterval(poll, 5000); };
    const stop = () => { clearInterval(interval); interval = null; };
    const onVisibility = () => document.hidden ? stop() : start();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [saveEnabled]);

  const activeSession = sessions.find(s => s.id === activeId);
  const summarySession = sessions.find(s => s.id === summaryId);

  const updateSession = useCallback((id, fn) => {
    setSessions(prev => prev.map(s => s.id === id ? fn({ ...s, players: s.players.map(p => ({ ...p, buyins: [...p.buyins] })) }) : s));
  }, []);

  const startNewSession = (name) => {
    const s = { id: uid(), name: name || `Session ${sessions.length + 1}`, date: new Date().toISOString(), players: [], log: [], ended: false, shareToken: crypto.randomUUID() };
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
    setView("active");
  };

  const endSession = (id) => {
    // endDate is auto-derived from the last cash-out; only fall back to now if nobody cashed out
    updateSession(id, s => ({ ...s, ended: true, endDate: s.endDate || new Date().toISOString() }));
    setSummaryId(id);
    setView("summary");
  };

  const deleteSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) { setActiveId(null); setView("home"); }
    if (summaryId === id) { setSummaryId(null); setView("home"); }
  };

  // Revoked links 404 on /api/session (null never matches a token); replacing
  // generates a fresh token so old links and saved QR codes die immediately
  const revokeShare = (id) => updateSession(id, s => ({ ...s, shareToken: null }));
  const regenerateShare = (id) => updateSession(id, s => ({ ...s, shareToken: crypto.randomUUID() }));

  const resumeSession = (id) => {
    updateSession(id, s => ({ ...s, ended: false }));
    setActiveId(id);
    setView("active");
  };

  const openSession = (id) => {
    const s = sessions.find(x => x.id === id);
    if (s.ended) { setSummaryId(id); setView("summary"); }
    else { setActiveId(id); setView("active"); }
  };

  if (!loaded) return <div style={S.loading}><div style={S.spinner}/></div>;

  return (
    <div style={S.app}>
      {syncState !== "idle" && (
        <div style={{
          position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 300,
          background: syncState === "error" ? "#450206" : "#7a5030", color: "#fbf0df",
          padding: "8px 18px", borderRadius: 20, fontSize: 11, fontWeight: 600,
          letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(42,10,8,0.35)"
        }}>
          {syncState === "error" ? "Save failed — retrying…" : "Updated from another device — check your last entry"}
        </div>
      )}
      <Header view={view} setView={setView} activeId={activeId} isAdmin={isAdmin} />
      {view === "home"    && <HomeView sessions={sessions} isAdmin={isAdmin} onNew={() => setModal({ type: "newSession" })} onOpen={openSession} />}
      {view === "active"  && activeSession  && <ActiveView session={activeSession} isAdmin={isAdmin} updateSession={updateSession} setModal={setModal} onEnd={() => endSession(activeId)} onRevoke={revokeShare} onRegenerate={regenerateShare} />}
      {view === "summary" && summarySession && <SummaryView session={summarySession} isAdmin={isAdmin} onResume={() => resumeSession(summaryId)} onBack={() => setView("home")} onDelete={deleteSession} onRevoke={revokeShare} onRegenerate={regenerateShare} />}
      {isAdmin && modal && <Modal modal={modal} setModal={setModal} sessions={sessions} activeSession={activeSession} updateSession={updateSession} startNewSession={startNewSession} activeId={activeId} />}
    </div>
  );
}

export default function PokerTracker() {
  if (window.location.pathname === "/admin") {
    return <PinGate>{(isAdmin) => <AppContent isAdmin={isAdmin} />}</PinGate>;
  }
  return <ShareApp />;
}
