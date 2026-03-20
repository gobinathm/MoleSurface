import { Trash2 } from "lucide-react";
import StreamPage from "../components/StreamPage";
import type { Theme } from "../lib/theme";

export default function Clean({ theme }: { theme: Theme }) {
  return (
    <StreamPage
      title="Clean"
      description="Remove caches, temp files, orphaned app data, and more."
      command="clean"
      icon={<Trash2 size={17} />}
      theme={theme}
      allowAdmin
    />
  );
}
