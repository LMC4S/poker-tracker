import { S } from "../styles";
import { PlusIcon } from "../components/icons";
import SessionCard from "../components/SessionCard";

export default function HomeView({ sessions, isAdmin, onNew, onOpen, onDelete }) {
  const activeSessions = sessions.filter(s => !s.ended);
  const recentEnded = sessions.filter(s => s.ended).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
  return (
    <div style={S.content}>
      {isAdmin && <button onClick={onNew} style={S.newBtn}><PlusIcon size={20}/> New Session</button>}
      {activeSessions.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Active Sessions</h3>
          {activeSessions.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />)}
        </div>
      )}
      {recentEnded.length > 0 && (
        <div style={S.section}>
          <h3 style={S.sectionTitle}>Recent</h3>
          {recentEnded.map(s => <SessionCard key={s.id} session={s} isAdmin={isAdmin} onClick={() => onOpen(s.id)} onDelete={() => onDelete(s.id)} />)}
        </div>
      )}
      {sessions.length === 0 && (
        <div style={S.empty}>
          <span style={{ fontSize: 48, opacity: 0.3 }}>♠♥♣♦</span>
          <p style={{ color: "#7a5030", marginTop: 12 }}>No sessions yet. Start your first game!</p>
        </div>
      )}
    </div>
  );
}
