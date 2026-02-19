import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const HeroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo springs in
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 180 },
    durationInFrames: 45,
  });
  const logoY = interpolate(logoSpring, [0, 1], [60, 0]);
  const logoOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Tagline fades in after logo settles
  const taglineOpacity = interpolate(frame, [35, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [35, 60], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Badge slides up last
  const badgeOpacity = interpolate(frame, [60, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const badgeY = interpolate(frame, [60, 85], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle pulsing glow on the orb
  const glowIntensity = interpolate(
    Math.sin((frame / fps) * Math.PI * 2),
    [-1, 1],
    [0.06, 0.12]
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
        overflow: "hidden",
      }}
    >
      {/* Background radial glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(20,241,149,${glowIntensity}) 0%, rgba(153,69,255,0.04) 50%, transparent 70%)`,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Subtle grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `translateY(${logoY}px) scale(${logoSpring})`,
          opacity: logoOpacity,
          fontSize: 112,
          fontWeight: 800,
          letterSpacing: "-4px",
          color: "#f0f6fc",
          lineHeight: 1,
          zIndex: 1,
        }}
      >
        Agent
        <span style={{ color: "#14F195" }}>Dex</span>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          marginTop: 28,
          fontSize: 34,
          fontWeight: 400,
          color: "#8b949e",
          letterSpacing: "0.5px",
          zIndex: 1,
        }}
      >
        Solana DEX Trading for AI Agents
      </div>

      {/* Pill badges */}
      <div
        style={{
          opacity: badgeOpacity,
          transform: `translateY(${badgeY}px)`,
          marginTop: 48,
          display: "flex",
          gap: 16,
          zIndex: 1,
        }}
      >
        {["⚡ Agent-First", "🛡️ Safe by Default", "📦 JSON Output"].map(
          (label) => (
            <div
              key={label}
              style={{
                backgroundColor: "rgba(20,241,149,0.08)",
                border: "1px solid rgba(20,241,149,0.25)",
                borderRadius: 100,
                padding: "10px 24px",
                fontSize: 20,
                color: "#14F195",
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          )
        )}
      </div>
    </AbsoluteFill>
  );
};
