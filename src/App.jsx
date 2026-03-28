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

  const pendingSaveRef = useRef(null);

  // Load sessions once after login (hash is in sessionStorage)
  useEffect(() => {
    loadSessions().then(s => {
      if (s !== null) { setSessions(s); setSaveEnabled(true); }
      setLoaded(true);
    });
  }, []);

  // Save on change
  useEffect(() => {
    if (!saveEnabled) return;
    clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = setTimeout(() => saveSessions(sessions), 300);
  }, [sessions, saveEnabled]);

  // Poll every 5s to sync across admin devices — pause when tab is hidden
  useEffect(() => {
    if (!saveEnabled) return;
    let interval = null;
    const poll = async () => {
      const fresh = await loadSessions();
      if (fresh === null) return;
      setSessions(prev => {
        if (JSON.stringify(prev) === JSON.stringify(fresh)) return prev;
        return fresh;
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
    const s = { id: uid(), name: name || `Session ${sessions.length + 1}`, date: new Date().toISOString(), players: [], ended: false };
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
    setView("active");
  };

  const endSession = (id) => {
    updateSession(id, s => ({ ...s, ended: true, endDate: new Date().toISOString() }));
    setSummaryId(id);
    setView("summary");
  };

  const deleteSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) { setActiveId(null); setView("home"); }
    if (summaryId === id) { setSummaryId(null); setView("home"); }
  };

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
      <Header view={view} setView={setView} activeId={activeId} isAdmin={isAdmin} />
      {view === "home"    && <HomeView sessions={sessions} isAdmin={isAdmin} onNew={() => setModal({ type: "newSession" })} onOpen={openSession} />}
      {view === "active"  && activeSession  && <ActiveView session={activeSession} isAdmin={isAdmin} updateSession={updateSession} setModal={setModal} onEnd={() => endSession(activeId)} />}
      {view === "summary" && summarySession && <SummaryView session={summarySession} isAdmin={isAdmin} onResume={() => resumeSession(summaryId)} onBack={() => setView("home")} onDelete={deleteSession} />}
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
