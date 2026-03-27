import { S } from "../styles";

export default function StatBox({ label, value, color }) {
  return (
    <div style={S.statBox}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, ...(color ? { color } : {}) }}>{value}</div>
    </div>
  );
}
