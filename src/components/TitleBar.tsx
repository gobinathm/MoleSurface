import { colors, type Theme } from "../lib/theme";

interface Props {
  theme: Theme;
  title?: string;
}

export default function TitleBar({ theme, title = "MoleSurface" }: Props) {
  const c = colors[theme];

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: 76,
        paddingRight: 16,
        flexShrink: 0,
        background: "transparent",
        position: "relative",
      }}
    >
      <span
        data-tauri-drag-region
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: c.titleText,
          letterSpacing: 0.1,
          pointerEvents: "none",
        }}
      >
        {title}
      </span>
    </div>
  );
}
