import { S } from "../styles";

function NavBtn({ label, active, onClick }) {
  return <button onClick={onClick} style={{ ...S.navBtn, ...(active ? S.navBtnActive : {}) }}>{label}</button>;
}

export default function Header({ view, setView, activeId, isAdmin, showNav = true }) {
  return (
    <div style={S.header}>
      <div style={S.headerLeft}>
        <span style={S.title}>Poker Session Tracker</span>
      </div>
      {showNav && (
        <div style={S.nav}>
          <NavBtn label="Home" active={view === "home"} onClick={() => setView("home")} />
          {activeId && <NavBtn label="Session" active={view === "active"} onClick={() => setView("active")} />}
        </div>
      )}
    </div>
  );
}
