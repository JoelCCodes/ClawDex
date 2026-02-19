import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type TerminalLine =
  | { type: "command"; text: string; startFrame: number; charsPerFrame: number }
  | { type: "output"; text: string; startFrame: number; color?: string }
  | { type: "blank"; startFrame: number };

const TERMINAL_LINES: TerminalLine[] = [
  // Install command
  {
    type: "command",
    text: "npm install -g agentdex-trade",
    startFrame: 12,
    charsPerFrame: 0.9,
  },
  // Install output
  {
    type: "output",
    text: "added 1 package in 2s",
    startFrame: 46,
    color: "#8b949e",
  },
  {
    type: "output",
    text: "✓ agentdex-trade@0.4.0 installed",
    startFrame: 50,
    color: "#14F195",
  },
  { type: "blank", startFrame: 54 },
  // Swap command
  {
    type: "command",
    text: "agentdex swap --in SOL --out USDC --amount 0.1 --json",
    startFrame: 62,
    charsPerFrame: 1.3,
  },
  // JSON output
  { type: "output", text: "{", startFrame: 104, color: "#e6edf3" },
  {
    type: "output",
    text: '  "success": true,',
    startFrame: 108,
    color: "#a8ff3e",
  },
  {
    type: "output",
    text: '  "inputAmount": "0.1 SOL",',
    startFrame: 112,
    color: "#a8ff3e",
  },
  {
    type: "output",
    text: '  "outputAmount": "18.42 USDC",',
    startFrame: 116,
    color: "#a8ff3e",
  },
  {
    type: "output",
    text: '  "txSignature": "5KQm..."',
    startFrame: 120,
    color: "#a8ff3e",
  },
  { type: "output", text: "}", startFrame: 124, color: "#e6edf3" },
];

const getTypewriterText = (
  frame: number,
  startFrame: number,
  text: string,
  charsPerFrame: number
): string => {
  const elapsed = Math.max(0, frame - startFrame);
  const charCount = Math.min(text.length, Math.round(elapsed * charsPerFrame));
  return text.slice(0, charCount);
};

const TerminalLine = ({ line, frame }: { line: TerminalLine; frame: number }) => {
  if (line.type === "blank") {
    if (frame < line.startFrame) return null;
    return <div style={{ height: 8 }} />;
  }

  if (line.type === "command") {
    if (frame < line.startFrame) return null;
    const text = getTypewriterText(
      frame,
      line.startFrame,
      line.text,
      line.charsPerFrame
    );
    const showCursor =
      text.length < line.text.length ||
      (frame - line.startFrame < 8);
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 26,
          color: "#e6edf3",
          lineHeight: 1.6,
        }}
      >
        <span style={{ color: "#14F195", marginRight: 12 }}>$</span>
        <span>{text}</span>
        {showCursor && (
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 26,
              backgroundColor: "#14F195",
              marginLeft: 2,
              verticalAlign: "middle",
            }}
          />
        )}
      </div>
    );
  }

  // output line
  if (frame < line.startFrame) return null;
  return (
    <div
      style={{
        fontSize: 26,
        color: line.color ?? "#8b949e",
        lineHeight: 1.6,
        fontFamily: "inherit",
      }}
    >
      {line.text}
    </div>
  );
};

export const TerminalScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const windowOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });
  const windowScale = interpolate(frame, [0, 12], [0.96, 1], {
    extrapolateRight: "clamp",
  });

  // Label above terminal
  const labelOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(145deg, #0e0f14 0%, #160d2a 55%, #0e0f14 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
        padding: "0 80px",
        overflow: "hidden",
      }}
    >
      {/* Grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Label */}
      <div
        style={{
          opacity: labelOpacity,
          marginBottom: 24,
          fontSize: 28,
          fontWeight: 700,
          color: "#8b949e",
          fontFamily: '"SF Pro Display", "Inter", sans-serif',
          letterSpacing: "0.5px",
          zIndex: 1,
        }}
      >
        Install & trade in seconds
      </div>

      {/* Terminal Window */}
      <div
        style={{
          opacity: windowOpacity,
          transform: `scale(${windowScale})`,
          width: "100%",
          maxWidth: 1100,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
          zIndex: 1,
        }}
      >
        {/* Title bar */}
        <div
          style={{
            backgroundColor: "#1c1e26",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: "#ff5f57",
            }}
          />
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: "#febc2e",
            }}
          />
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: "#28c840",
            }}
          />
          <div
            style={{
              marginLeft: "auto",
              marginRight: "auto",
              fontSize: 16,
              color: "#6e7681",
            }}
          >
            zsh
          </div>
        </div>

        {/* Terminal body */}
        <div
          style={{
            backgroundColor: "#0d1117",
            padding: "28px 36px",
            minHeight: 320,
          }}
        >
          {TERMINAL_LINES.map((line, i) => (
            <TerminalLine key={i} line={line} frame={frame} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
