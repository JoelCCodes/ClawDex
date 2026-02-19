import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const CTAScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const titleY = interpolate(titleSpring, [0, 1], [30, 0]);

  const cmdOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cmdScale = interpolate(frame, [20, 40], [0.95, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const subtextOpacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow pulse on the command box
  const glowPulse = interpolate(
    Math.sin((frame / fps) * Math.PI * 1.5),
    [-1, 1],
    [0.15, 0.35]
  );

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(145deg, #0e0f14 0%, #160d2a 55%, #0e0f14 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"SF Pro Display", "Inter", -apple-system, sans-serif',
        gap: 0,
        overflow: "hidden",
      }}
    >
      {/* Grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Bottom radial glow */}
      <div
        style={{
          position: "absolute",
          width: 1000,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(ellipse, rgba(20,241,149,${glowPulse * 0.5}) 0%, rgba(153,69,255,${glowPulse * 0.3}) 40%, transparent 70%)`,
          bottom: -200,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      />

      {/* Title */}
      <div
        style={{
          transform: `translateY(${titleY}px)`,
          opacity: titleSpring,
          textAlign: "center",
          zIndex: 1,
          marginBottom: 48,
        }}
      >
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            color: "#f0f6fc",
            letterSpacing: "-2px",
            lineHeight: 1.1,
          }}
        >
          Get started in{" "}
          <span style={{ color: "#14F195" }}>seconds</span>
        </div>
      </div>

      {/* Install command */}
      <div
        style={{
          opacity: cmdOpacity,
          transform: `scale(${cmdScale})`,
          display: "flex",
          alignItems: "center",
          gap: 16,
          backgroundColor: "#0d1117",
          border: `1px solid rgba(20,241,149,${glowPulse})`,
          borderRadius: 16,
          padding: "22px 40px",
          boxShadow: `0 0 40px rgba(20,241,149,${glowPulse * 0.3})`,
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: '"SF Mono", "Fira Code", monospace',
            fontSize: 36,
            color: "#8b949e",
            userSelect: "none",
          }}
        >
          $
        </span>
        <span
          style={{
            fontFamily: '"SF Mono", "Fira Code", monospace',
            fontSize: 36,
            color: "#e6edf3",
            fontWeight: 500,
            letterSpacing: "0.5px",
          }}
        >
          npm install -g{" "}
          <span style={{ color: "#14F195" }}>agentdex-trade</span>
        </span>
      </div>

      {/* Sub-text links */}
      <div
        style={{
          opacity: subtextOpacity,
          marginTop: 36,
          display: "flex",
          gap: 40,
          zIndex: 1,
        }}
      >
        {[
          { label: "npm", value: "agentdex-trade" },
          { label: "GitHub", value: "JoelCCodes/AgentDex" },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              fontSize: 22,
              color: "#8b949e",
            }}
          >
            <span style={{ color: "#6e7681" }}>{label} / </span>
            <span style={{ color: "#60a5fa" }}>{value}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
