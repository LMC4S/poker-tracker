import { useState, useEffect, useRef } from "react";
import { loadSessions, sendOp, loadQueue, saveQueue } from "./storage";
import { applyOpToList } from "./ops";
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
  const [modal, setModal] = useState(null);
  const [summaryId, setSummaryId] = useState(null);
  // hidden | saving | offline — reflects the state of the op queue
  const [syncState, setSyncState] = useState("hidden");
  const [pendingCount, setPendingCount] = useState(0);

  // Every mutation is an op: applied locally at once, queued in localStorage,
  // and sent to /api/op strictly in order with one in flight. The queue
  // survives refresh and tab kill, and the server's op ledger makes retries
  // idempotent — so an entry made on bad wifi can be delayed but never lost.
  const queueRef = useRef(loadQueue());
  const sendingRef = useRef(false);
  const retryRef = useRef(null);
  const backoffRef = useRef(1000);
  // When the queue first became non-empty; drives the Saving…/Offline banner
  const stuckSinceRef = useRef(null);

  const setQueue = (queue) => {
    queueRef.current = queue;
    saveQueue(queue);
    setPendingCount(queue.length);
  };

  const pump = async () => {
    if (sendingRef.current) return;
    const op = queueRef.current[0];
    if (!op) return;
    sendingRef.current = true;
    const result = await sendOp(op);
    sendingRef.current = false;
    if (result.retry) {
      clearTimeout(retryRef.current);
      retryRef.current = setTimeout(pump, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, 5000);
      return;
    }
    // Committed (ok) or permanently rejected (drop) — either way it's done
    setQueue(queueRef.current.slice(1));
    backoffRef.current = 1000;
    if (result.ok) {
      if (result.deleted) {
        setSessions(prev => prev.filter(s => s.id !== op.sessionId));
      } else if (result.session && !queueRef.current.some(q => q.sessionId === op.sessionId)) {
        // Adopt the server's authoritative copy once none of our queued ops
        // are still ahead of it (reconciles server-side dedupe etc.)
        setSessions(prev => prev.map(s => s.id === result.session.id ? result.session : s));
      }
    }
    if (queueRef.current.length) pump();
  };

  const dispatch = (type, sessionId, payload = {}) => {
    const op = { opId: crypto.randomUUID(), sessionId, type, payload: { ...payload, at: new Date().toISOString() } };
    setSessions(prev => applyOpToList(prev, op));
    setQueue([...queueRef.current, op]);
    pump();
  };

  // Merge a freshly polled server list into local state. A session with
  // queued ops keeps its local copy (the server hasn't seen those ops yet);
  // otherwise the side with a different updatedAt — the server's — wins.
  // Local sessions the server no longer has were deleted elsewhere.
  const reconcile = (local, server) => {
    const pending = new Set(queueRef.current.map(o => o.sessionId));
    const byId = new Map(server.map(s => [s.id, s]));
    const out = [];
    for (const s of local) {
      if (pending.has(s.id)) {
        out.push(s);
        byId.delete(s.id);
      } else if (byId.has(s.id)) {
        const remote = byId.get(s.id);
        out.push(remote.updatedAt !== s.updatedAt ? remote : s);
        byId.delete(s.id);
      }
    }
    for (const r of byId.values()) out.push(r);
    out.sort((a, b) => new Date(b.date) - new Date(a.date));
    // Preserve the old array identity when nothing changed so React skips
    // re-rendering and effects don't churn
    return out.length === local.length && out.every((s, i) => s === local[i]) ? local : out;
  };

  // Load once after login, then resume whatever queue a previous visit left
  // behind. Replaying the queue over the fetched list shows offline-made
  // entries immediately; if one of them actually committed before the reload
  // it can render twice for the moment it takes the ledger to dedupe it.
  useEffect(() => {
    loadSessions().then(list => {
      if (list !== null) {
        setSessions(queueRef.current.reduce((s, op) => applyOpToList(s, op), list));
      }
      setPendingCount(queueRef.current.length);
      setLoaded(true);
      pump();
    });
    return () => clearTimeout(retryRef.current);
  }, []);

  // Poll every 5s to sync across admin devices — pause when tab is hidden,
  // and stand down entirely while our own ops are still being sent
  useEffect(() => {
    if (!loaded) return;
    let interval = null;
    const poll = async () => {
      if (sendingRef.current || queueRef.current.length) return;
      const fresh = await loadSessions();
      if (fresh === null) return;
      setSessions(prev => reconcile(prev, fresh));
    };
    const start = () => { if (!interval) interval = setInterval(poll, 5000); };
    const stop = () => { clearInterval(interval); interval = null; };
    // Poll immediately on wake so a tab resumed after hours catches up before
    // the user reads stale numbers
    const onVisibility = () => { if (document.hidden) stop(); else { poll(); start(); } };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [loaded]);

  // Banner: quiet while ops commit promptly, "Saving…" when the queue has
  // been stuck a few seconds, "Offline" when the browser says so or the
  // stall drags on
  useEffect(() => {
    const t = setInterval(() => {
      if (queueRef.current.length === 0) {
        stuckSinceRef.current = null;
        setSyncState("hidden");
        return;
      }
      if (!stuckSinceRef.current) stuckSinceRef.current = Date.now();
      const stuck = Date.now() - stuckSinceRef.current;
      setSyncState(navigator.onLine === false || stuck > 12000 ? "offline" : stuck > 3000 ? "saving" : "hidden");
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Retry as soon as connectivity returns instead of waiting out a backoff
  useEffect(() => {
    const onOnline = () => { clearTimeout(retryRef.current); backoffRef.current = 1000; pump(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const activeSession = sessions.find(s => s.id === activeId);
  const summarySession = sessions.find(s => s.id === summaryId);

  const actions = {
    createSession: (name) => {
      const id = uid();
      dispatch("createSession", id, {
        name: name || `Session ${sessions.length + 1}`,
        date: new Date().toISOString(),
        shareToken: crypto.randomUUID(),
      });
      setActiveId(id);
      setView("active");
    },
    addPlayer: (name, buyin) => dispatch("addPlayer", activeId, { playerId: uid(), name, buyin }),
    rebuy: (playerId, amount) => dispatch("rebuy", activeId, { playerId, amount }),
    cashout: (playerId, amount) => dispatch("cashout", activeId, { playerId, amount }),
    editCashout: (sessionId, playerId, amount) => dispatch("editCashout", sessionId, { playerId, amount }),
    undoCashout: (sessionId, playerId) => dispatch("undoCashout", sessionId, { playerId }),
    removePlayer: (sessionId, playerId) => dispatch("removePlayer", sessionId, { playerId }),
    renamePlayer: (sessionId, playerId, name) => dispatch("renamePlayer", sessionId, { playerId, name }),
    endSession: (id) => {
      dispatch("endSession", id);
      setSummaryId(id);
      setView("summary");
    },
    resumeSession: (id) => {
      dispatch("reopenSession", id);
      setActiveId(id);
      setView("active");
    },
    deleteSession: (id) => {
      dispatch("deleteSession", id);
      if (activeId === id) { setActiveId(null); setView("home"); }
      if (summaryId === id) { setSummaryId(null); setView("home"); }
    },
    // Revoked links 404 on /api/session (null never matches a token); replacing
    // generates a fresh token so old links and saved QR codes die immediately
    revokeShare: (id) => dispatch("revokeShare", id),
    regenerateShare: (id) => dispatch("regenerateShare", id, { shareToken: crypto.randomUUID() }),
  };

  const openSession = (id) => {
    const s = sessions.find(x => x.id === id);
    if (s.ended) { setSummaryId(id); setView("summary"); }
    else { setActiveId(id); setView("active"); }
  };

  if (!loaded) return <div style={S.loading}><div style={S.spinner}/></div>;

  return (
    <div style={S.app}>
      {syncState !== "hidden" && (
        <div style={{
          position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 300,
          background: syncState === "offline" ? "#450206" : "#7a5030", color: "#fbf0df",
          padding: "8px 18px", borderRadius: 20, fontSize: 11, fontWeight: 600,
          letterSpacing: "1px", textTransform: "uppercase", whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(42,10,8,0.35)"
        }}>
          {syncState === "offline"
            ? `Offline — ${pendingCount} ${pendingCount === 1 ? "entry" : "entries"} will sync`
            : "Saving…"}
        </div>
      )}
      <Header view={view} setView={setView} activeId={activeId} isAdmin={isAdmin} />
      {view === "home"    && <HomeView sessions={sessions} isAdmin={isAdmin} onNew={() => setModal({ type: "newSession" })} onOpen={openSession} />}
      {view === "active"  && activeSession  && <ActiveView session={activeSession} isAdmin={isAdmin} actions={actions} setModal={setModal} onEnd={() => actions.endSession(activeId)} onRevoke={actions.revokeShare} onRegenerate={actions.regenerateShare} />}
      {view === "summary" && summarySession && <SummaryView session={summarySession} isAdmin={isAdmin} onResume={() => actions.resumeSession(summaryId)} onBack={() => setView("home")} onDelete={actions.deleteSession} onRevoke={actions.revokeShare} onRegenerate={actions.regenerateShare} onRename={(playerId, name) => actions.renamePlayer(summaryId, playerId, name)} onEditCashout={(playerId, amount) => actions.editCashout(summaryId, playerId, amount)} />}
      {isAdmin && modal && <Modal modal={modal} setModal={setModal} sessions={sessions} activeSession={activeSession} actions={actions} />}
    </div>
  );
}

export default function PokerTracker() {
  if (window.location.pathname === "/admin") {
    return <PinGate>{(isAdmin) => <AppContent isAdmin={isAdmin} />}</PinGate>;
  }
  return <ShareApp />;
}
