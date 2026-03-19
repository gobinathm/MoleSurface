import { Zap } from "lucide-react";
import StreamPage from "../components/StreamPage";
import type { Theme } from "../lib/theme";

export default function Optimize({ theme }: { theme: Theme }) {
  return (
    <StreamPage
      title="Optimize"
      description="Tune system performance settings and optimize macOS."
      command="optimize"
      icon={<Zap size={17} />}
      theme={theme}
    />
  );
}
