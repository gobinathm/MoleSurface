import { useEffect, useRef } from "react";
import { colors, type Theme } from "../lib/theme";

interface Props {
  lines: string[];
  theme: Theme;
  minHeight?: number;
  maxHeight?: number;
}

export default function Terminal({ lines, theme, minHeight = 200, maxHeight = 480 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const c = colors[theme];

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={ref}
      style={{
        background: c.termBg,
        border: `1px solid ${c.termBorder}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, 'Courier New', monospace",
        fontSize: 12,
        lineHeight: 1.65,
        color: c.termText,
        overflowY: "auto",
        minHeight,
        maxHeight,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {lines.length === 0 ? (
        <span style={{ opacity: 0.35 }}>Ready — press Run to start.</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} style={{ minHeight: "1em" }}>
            {line || "\u00A0"}
          </div>
        ))
      )}
    </div>
  );
}
