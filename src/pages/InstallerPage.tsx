import { Package } from "lucide-react";
import StreamPage from "../components/StreamPage";
import type { Theme } from "../lib/theme";

export default function InstallerPage({ theme }: { theme: Theme }) {
  return (
    <StreamPage
      title="Installer"
      description="Manage installer files (.pkg, .dmg) — find and remove leftover installers."
      command="installer"
      icon={<Package size={17} />}
      theme={theme}
    />
  );
}
