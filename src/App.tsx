import { useEffect, useState } from "react";
import { colors, getSystemTheme, onThemeChange, type Theme } from "./lib/theme";
import { isMoleInstalled } from "./lib/mole";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import Install from "./pages/Install";
import Dashboard from "./pages/Dashboard";
import Analyze from "./pages/Analyze";
import Clean from "./pages/Clean";
import Uninstall from "./pages/Uninstall";
import Optimize from "./pages/Optimize";
import Purge from "./pages/Purge";
import InstallerPage from "./pages/InstallerPage";
import Settings from "./pages/Settings";

export type Page =
  | "dashboard"
  | "analyze"
  | "clean"
  | "uninstall"
  | "optimize"
  | "purge"
  | "installer"
  | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [moleReady, setMoleReady] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<Theme>(getSystemTheme);
  const c = colors[theme];

  useEffect(() => {
    const cleanup = onThemeChange(setTheme);
    isMoleInstalled().then(setMoleReady);
    return cleanup;
  }, []);

  // Show nothing while checking
  if (moleReady === null) return null;

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: c.bg,
        color: c.text,
        borderRadius: 10,
        overflow: "hidden",
        // macOS-style window shadow is handled by the OS when decorations=false
      }}
    >
      <TitleBar theme={theme} />

      {!moleReady ? (
        <Install
          theme={theme}
          onInstalled={() => setMoleReady(true)}
        />
      ) : (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar page={page} setPage={setPage} theme={theme} />
          <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {page === "dashboard" && <Dashboard theme={theme} />}
            {page === "analyze" && <Analyze theme={theme} />}
            {page === "clean" && <Clean theme={theme} />}
            {page === "uninstall" && <Uninstall theme={theme} />}
            {page === "optimize" && <Optimize theme={theme} />}
            {page === "purge" && <Purge theme={theme} />}
            {page === "installer" && <InstallerPage theme={theme} />}
            {page === "settings" && <Settings theme={theme} />}
          </main>
        </div>
      )}
    </div>
  );
}
