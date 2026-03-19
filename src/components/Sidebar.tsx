import {
  LayoutDashboard,
  PieChart,
  Trash2,
  PackageX,
  Zap,
  Flame,
  Package,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { colors, type Theme } from "../lib/theme";
import type { Page } from "../App";

interface NavItem {
  id: Page;
  label: string;
  Icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "analyze", label: "Disk Analyze", Icon: PieChart },
  { id: "clean", label: "Clean", Icon: Trash2 },
  { id: "uninstall", label: "Uninstall", Icon: PackageX },
  { id: "optimize", label: "Optimize", Icon: Zap },
  { id: "purge", label: "Purge", Icon: Flame },
  { id: "installer", label: "Installer", Icon: Package },
];

interface Props {
  page: Page;
  setPage: (p: Page) => void;
  theme: Theme;
}

export default function Sidebar({ page, setPage, theme }: Props) {
  const c = colors[theme];

  const navBtn = (item: NavItem) => {
    const active = page === item.id;
    return (
      <button
        key={item.id}
        onClick={() => setPage(item.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "6px 10px",
          borderRadius: 6,
          border: "none",
          background: active ? c.activeItem : "transparent",
          color: active ? c.text : c.textMuted,
          fontSize: 13,
          fontWeight: active ? 500 : 400,
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.12s, color 0.12s",
        }}
      >
        <item.Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
        {item.label}
      </button>
    );
  };

  return (
    <nav
      style={{
        width: 200,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        padding: "6px 8px 8px",
        borderRight: `1px solid ${c.sidebarBorder}`,
        background: c.sidebar,
        overflowY: "auto",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(navBtn)}
      </div>

      <div style={{ borderTop: `1px solid ${c.sidebarBorder}`, paddingTop: 8, marginTop: 8 }}>
        {navBtn({ id: "settings", label: "Settings", Icon: Settings2 })}
      </div>
    </nav>
  );
}
