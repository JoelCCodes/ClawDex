import { Composition } from "remotion";
import { AgentDexPromo } from "./AgentDexPromo";

// Duration math (all at 30fps):
//   Scene 1 (Hero):     135f  = 4.5s
//   Scene 2 (Benefits): 135f  = 4.5s
//   Scene 3 (Terminal): 135f  = 4.5s
//   Scene 4 (CTA):       90f  = 3.0s
//   3 transitions:     -15f × 3 = -45f
//   Total: 135+135+135+90-45 = 450f = 15s
const DURATION = 450;

export const RemotionRoot = () => {
  return (
    <Composition
      id="AgentDexPromo"
      component={AgentDexPromo}
      durationInFrames={DURATION}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
