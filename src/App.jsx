import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase";
import { loadSessions, saveSessions } from "./storage";
import { uid, exportJSON } from "./utils";
import { S } from "./styles";
import PinGate from "./components/PinGate";
import Header from "./components/Header";
import Modal from "./components/Modal";
import HomeView from "./views/HomeView";
import ActiveView from "./views/ActiveView";
import SummaryView from "./views/SummaryView";
import HistoryView from "./views/HistoryView";
import AnalyticsView from "./views/AnalyticsView";
import PlayerSearchView from "./views/PlayerSearchView";

export default function PokerTracker() {
  const [sessions, setSessions] = useState([]);
  const [view, setView] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveEnabled, setSaveEnabled] = useState(false);
  const [modal, setModal] = useState(null);
  const [summaryId, setSummaryId] = useState(null);

  const lastSaveValueRef = useRef(null);

  useEffect(() => {
    loadSessions().then(s => {
      if (s !== null) { setSessions(s); setSaveEnabled(true); }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (saveEnabled) {
      lastSaveValueRef.current = JSON.stringify(sessions);
      saveSessions(sessions);
    }
  }, [sessions, saveEnabled]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("poker-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "poker_data" }, (payload) => {
        if (!payload.new?.value) return;
        if (payload.new.value === lastSaveValueRef.current) return; // our own echo
        setSessions(JSON.parse(payload.new.value));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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

  if (!loaded) return <PinGate>{() => <div style={S.loading}><div style={S.spinner}/></div>}</PinGate>;

  return (
    <PinGate>
      {(isAdmin, isSuperAdmin) => (
        <div style={S.app}>
          <Header view={view} setView={setView} activeId={activeId} hasEnded={sessions.some(s => s.ended)} isSuperAdmin={isSuperAdmin} />
          {view === "home"      && <HomeView sessions={sessions} isAdmin={isAdmin} onNew={() => setModal({ type: "newSession" })} onOpen={openSession} onDelete={deleteSession} />}
          {view === "active"    && activeSession  && <ActiveView session={activeSession} isAdmin={isAdmin} updateSession={updateSession} setModal={setModal} onEnd={() => endSession(activeId)} />}
          {view === "summary"   && summarySession && <SummaryView session={summarySession} isAdmin={isAdmin} onResume={() => resumeSession(summaryId)} onBack={() => setView("home")} />}
          {view === "history"   && isSuperAdmin   && <HistoryView sessions={sessions} isAdmin={isAdmin} onOpen={(id) => { setSummaryId(id); setView("summary"); }} onDelete={deleteSession} />}
          {view === "players"   && isSuperAdmin   && <PlayerSearchView sessions={sessions} />}
          {view === "analytics" && <AnalyticsView sessions={sessions} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} onExport={() => exportJSON(sessions)} />}
          {isAdmin && modal && <Modal modal={modal} setModal={setModal} sessions={sessions} activeSession={activeSession} updateSession={updateSession} startNewSession={startNewSession} activeId={activeId} />}
        </div>
      )}
    </PinGate>
  );
}
