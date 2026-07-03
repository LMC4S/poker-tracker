import { useState, useEffect } from "react";
import { loadSharedSession } from "./storage";
import { S, FB } from "./styles";
import Header from "./components/Header";
import HomeView from "./views/HomeView";
import ActiveView from "./views/ActiveView";
import SummaryView from "./views/SummaryView";

const POLL_MS = 5000;

function parseToken() {
  const m = window.location.pathname.match(/^\/s\/(.+)$/);
  return m ? decodeURIComponent(m[1].replace(/\/$/, "")) : null;
}

function Door({ message }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#fbf0df" }}>
      <div style={{ textAlign: "center", padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7a5030", letterSpacing: "4px", textTransform: "uppercase", fontFamily: FB }}>Poker Session</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: "#2a0a08", letterSpacing: "4px", textTransform: "uppercase", marginTop: 6, fontFamily: FB }}>Tracker</div>
        <div style={{ marginTop: 32, color: "#7a5030", fontSize: 13, letterSpacing: "1px", maxWidth: 320, lineHeight: 1.6 }}>{message}</div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#fbf0df" }}>
      <div style={S.spinner} />
    </div>
  );
}

export default function ShareApp() {
  const token = parseToken();
  const [session, setSession] = useState(null);
  const [seriesStats, setSeriesStats] = useState(null);
  // loading | ok | notfound | nolink
  const [status, setStatus] = useState(token ? "loading" : "nolink");
  // Default to the session the link points at; the Home tab holds the series stats
  const [view, setView] = useState("active");

  useEffect(() => {
    if (!token) return;
    let active = true;

    const run = async () => {
      const result = await loadSharedSession(token);
      if (!active) return;
      if (result === "notfound") {
        setStatus("notfound");
      } else if (result && result.session) {
        setSession(result.session);
        setSeriesStats(result.seriesStats || null);
        setStatus("ok");
      }
      // null (network error): keep showing whatever we had
    };

    run();
    const interval = setInterval(() => { if (!document.hidden) run(); }, POLL_MS);
    const onVisibility = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token]);

  if (status === "nolink") return <Door message="Use the link shared with you to view a session." />;
  if (status === "notfound") return <Door message="This link is no longer valid." />;
  if (status === "loading" && !session) return <Spinner />;

  return (
    <div style={S.app}>
      <Header view={view} setView={setView} activeId={session.id} isAdmin={false} />
      {view === "home" && (
        <HomeView sessions={[]} isAdmin={false} onNew={null} onOpen={() => {}} precomputedStats={seriesStats} seriesOnly={true} />
      )}
      {view === "active" && (
        session.ended ? (
          <SummaryView session={session} isAdmin={false} onResume={() => {}} onBack={() => setView("home")} onDelete={() => {}} />
        ) : (
          <ActiveView session={session} isAdmin={false} actions={null} setModal={() => {}} onEnd={() => {}} />
        )
      )}
    </div>
  );
}
