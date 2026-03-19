Add a new page to MoleSurface that wraps a `mo` command.

Ask the user for:
1. The `mo` subcommand name (e.g. `update`)
2. The page title and description text
3. Which lucide-react icon to use
4. Whether it streams output (most pages) or parses JSON (like Dashboard/Analyze)

Then:

**For a streaming page:**
1. Create `src/pages/<Name>.tsx` using the `StreamPage` component pattern:
   ```tsx
   import { <Icon> } from "lucide-react";
   import StreamPage from "../components/StreamPage";
   import type { Theme } from "../lib/theme";

   export default function <Name>({ theme }: { theme: Theme }) {
     return <StreamPage title="..." description="..." command="<mo-subcommand>" icon={<<Icon> size={17} />} theme={theme} />;
   }
   ```
2. Add the page to the `Page` union type in `src/App.tsx`
3. Import and render it in the `App.tsx` page switch
4. Add a nav item to `src/components/Sidebar.tsx` with the correct icon

**For a JSON data page:**
Follow the pattern in `src/pages/Dashboard.tsx` — run the command, extract JSON from output, render cards.

Finally, run `/check` to confirm everything compiles.
