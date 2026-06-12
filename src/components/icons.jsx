const Icon = ({ d, size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
);

export const PlusIcon = (p) => <Icon d="M12 5v14M5 12h14" {...p}/>;
export const TrashIcon = (p) => <Icon d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12zM10 11v6M14 11v6" {...p}/>;
export const ChevronIcon = ({ dir = "right", ...p }) => {
  const ds = { right: "M9 18l6-6-6-6", left: "M15 18l-6-6 6-6", down: "M6 9l6 6 6-6" };
  return <Icon d={ds[dir]} {...p}/>;
};
