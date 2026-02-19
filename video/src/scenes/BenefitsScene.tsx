import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Benefit = {
  icon: string;
  title: string;
  desc: string;
  accentColor: string;
};

const BENEFITS: Benefit[] = [
  {
    icon: "🤖",
    title: "Agent-First CLI",
    desc: "--json and --yes flags on every command — perfect for automated pipelines",
    accentColor: "#14F195",
  },
  {
    icon: "🛡️",
    title: "Safety Guardrails",
    desc: "Simulate before you spend. Slippage limits and balance checks built in",
    accentColor: "#9945FF",
  },
  {
    icon: "⚡",
    title: "Jupiter-Powered",
    desc: "Best swap routes across all Solana DEXes — SOL, USDC, any SPL token",
    accentColor: "#60a5fa",
  },
];

const BenefitRow = ({
  benefit,
  index,
}: {
  benefit: Benefit;
  index: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const delay = index * 18;

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 35,
  });

  const x = interpolate(entrance, [0, 1], [-80, 0]);
  const opacity = interpolate(entrance, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 28,
        padding: "28px 36px",
        backgroundColor: "rgba(255,255,255,0.035)",
        borderRadius: 20,
        border: `1px solid rgba(255,255,255,0.08)`,
        borderLeft: `3px solid ${benefit.accentColor}`,
        transform: `translateX(${x}px)`,
        opacity,
      }}
    >
      <div style={{ fontSize: 52, lineHeight: 1, marginTop: 2 }}>
        {benefit.icon}
      </div>
      <div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: "#f0f6fc",
            marginBottom: 8,
          }}
        >
          {benefit.title}
        </div>
        <div
          style={{
            fontSize: 22,
            color: "#8b949e",
            lineHeight: 1.5,
          }}
        >
          {benefit.desc}
        </div>
      </div>
    </div>
  );
};

export const BenefitsScene = () => {
  const frame = useCurrentFrame();

  const headerOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const headerY = interpolate(frame, [0, 20], [-20, 0], {
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
        fontFamily: '"SF Pro Display", "Inter", -apple-system, sans-serif',
        padding: "0 120px",
        gap: 40,
        overflow: "hidden",
      }}
    >
      {/* Subtle grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Header */}
      <div
        style={{
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
          textAlign: "center",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: "#f0f6fc",
            letterSpacing: "-1px",
          }}
        >
          Built for{" "}
          <span style={{ color: "#14F195" }}>Agents</span>
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#8b949e",
            marginTop: 10,
          }}
        >
          Every feature designed for programmatic use
        </div>
      </div>

      {/* Benefits list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          width: "100%",
          maxWidth: 1100,
          zIndex: 1,
        }}
      >
        {BENEFITS.map((benefit, index) => (
          <BenefitRow key={benefit.title} benefit={benefit} index={index} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
