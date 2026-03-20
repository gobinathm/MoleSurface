import { Flame } from "lucide-react";
import StreamPage from "../components/StreamPage";
import type { Theme } from "../lib/theme";

export default function Purge({ theme }: { theme: Theme }) {
  return (
    <StreamPage
      title="Purge"
      description="Delete build artifacts, node_modules, .git caches, and derived data."
      command="purge"
      icon={<Flame size={17} />}
      theme={theme}
    />
  );
}
