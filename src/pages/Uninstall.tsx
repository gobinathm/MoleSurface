import { PackageX } from "lucide-react";
import StreamPage from "../components/StreamPage";
import type { Theme } from "../lib/theme";

export default function Uninstall({ theme }: { theme: Theme }) {
  return (
    <StreamPage
      title="Uninstall"
      description="Remove applications and their associated files and dependencies."
      command="uninstall"
      icon={<PackageX size={17} />}
      theme={theme}
    />
  );
}
