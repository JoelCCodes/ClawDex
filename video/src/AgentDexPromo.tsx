import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { HeroScene } from "./scenes/HeroScene";
import { BenefitsScene } from "./scenes/BenefitsScene";
import { TerminalScene } from "./scenes/TerminalScene";
import { CTAScene } from "./scenes/CTAScene";

// Transition duration (frames)
const T = 15;

export const AgentDexPromo = () => {
  return (
    <TransitionSeries>
      {/* Scene 1: Hero — 4.5s */}
      <TransitionSeries.Sequence durationInFrames={135}>
        <HeroScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: T })}
      />

      {/* Scene 2: Benefits — 4.5s */}
      <TransitionSeries.Sequence durationInFrames={135}>
        <BenefitsScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: T })}
      />

      {/* Scene 3: Terminal demo — 4.5s */}
      <TransitionSeries.Sequence durationInFrames={135}>
        <TerminalScene />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: T })}
      />

      {/* Scene 4: CTA — 3s */}
      <TransitionSeries.Sequence durationInFrames={90}>
        <CTAScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
