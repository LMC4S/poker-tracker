import { S } from "../styles";

function NavBtn({ label, active, onClick }) {
  return <button onClick={onClick} style={{ ...S.navBtn, ...(active ? S.navBtnActive : {}) }}>{label}</button>;
}

export default function Header({ view, setView, activeId, hasEnded, isSuperAdmin }) {
  return (
    <div style={S.header}>
      <div style={S.headerLeft}>
        <span style={S.title}>Home Game Tracker</span>
      </div>
      <div style={S.nav}>
        <NavBtn label="Home" active={view === "home"} onClick={() => setView("home")} />
        {activeId && <NavBtn label="Session" active={view === "active"} onClick={() => setView("active")} />}
        {isSuperAdmin && <NavBtn label="History" active={view === "history"} onClick={() => setView("history")} />}
        {isSuperAdmin && <NavBtn label="Players" active={view === "players"} onClick={() => setView("players")} />}
        {isSuperAdmin && hasEnded && <NavBtn label="Stats" active={view === "analytics"} onClick={() => setView("analytics")} />}
      </div>
    </div>
  );
}
