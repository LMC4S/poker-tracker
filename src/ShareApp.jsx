import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { loadPublicSnapshot } from "./storage";
import { S, FB } from "./styles";
import Header from "./components/Header";
import HomeView from "./views/HomeView";
import ActiveView from "./views/ActiveView";
import SummaryView from "./views/SummaryView";

const PUBLIC_KEY = "poker-public-v1";

export default function ShareApp() {
  const [snapshot, setSnapshot] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("home");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    loadPublicSnapshot().then(s => {
      setSnapshot(s);
      setLoaded(true);
    });

    if (!supabase) return;
    const channel = supabase
      .channel("poker-public-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "poker_public" }, (payload) => {
        if (payload.new?.value) setSnapshot(JSON.parse(payload.new.value));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#fbf0df" }}>
        <div style={S.spinner} />
      </div>
    );
  }

  const hasActiveSession = snapshot && snapshot.activeSessions && snapshot.activeSessions.length > 0;

  if (!hasActiveSession) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#fbf0df" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7a5030", letterSpacing: "4px", textTransform: "uppercase", fontFamily: FB }}>Home Game</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#2a0a08", letterSpacing: "4px", textTransform: "uppercase", marginTop: 6, fontFamily: FB }}>Tracker</div>
          <div style={{ marginTop: 32, color: "#7a5030", fontSize: 13, letterSpacing: "1px" }}>No active session right now.</div>
        </div>
      </div>
    );
  }

  const allSessions = [...snapshot.activeSessions, ...snapshot.recentEnded];
  const openSession = allSessions.find(s => s.id === openId);

  const handleOpen = (id) => {
    const s = allSessions.find(x => x.id === id);
    if (!s) return;
    setOpenId(id);
    setView(s.ended ? "summary" : "active");
  };

  return (
    <div style={S.app}>
      <Header view={view} setView={setView} activeId={null} isAdmin={false} />
      {view === "home" && (
        <HomeView
          sessions={allSessions}
          isAdmin={false}
          onNew={null}
          onOpen={handleOpen}
          precomputedStats={snapshot.seriesStats}
        />
      )}
      {view === "active" && openSession && (
        <ActiveView
          session={openSession}
          isAdmin={false}
          updateSession={() => {}}
          setModal={() => {}}
          onEnd={() => {}}
        />
      )}
      {view === "summary" && openSession && (
        <SummaryView
          session={openSession}
          isAdmin={false}
          onResume={() => {}}
          onBack={() => setView("home")}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}
