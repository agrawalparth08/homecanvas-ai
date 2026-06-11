import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { C } from './theme';
import { LEAD_IN_FRAMES, NARRATION, SCENES, sceneFrames } from './storyboard';
import { Caption } from './components/Caption';
import { SceneFrame } from './components/SceneFrame';
import { TitleScene } from './scenes/TitleScene';
import { ProblemScene } from './scenes/ProblemScene';
import { TraceScene } from './scenes/TraceScene';
import { Canvas3DScene } from './scenes/Canvas3DScene';
import { EditScene } from './scenes/EditScene';
import { AIScene } from './scenes/AIScene';
import { PhotoScene } from './scenes/PhotoScene';
import { AudienceScene } from './scenes/AudienceScene';
import { PrivacyScene } from './scenes/PrivacyScene';
import { OutroScene } from './scenes/OutroScene';

const SCENE_COMPONENTS: Record<string, React.FC> = {
  title: TitleScene,
  problem: ProblemScene,
  trace: TraceScene,
  canvas3d: Canvas3DScene,
  edit: EditScene,
  ai: AIScene,
  photo: PhotoScene,
  audience: AudienceScene,
  privacy: PrivacyScene,
  outro: OutroScene,
};

/** Scenes that don't need an on-screen caption (the visual IS the text). */
const NO_CAPTION = new Set(['title', 'outro']);

export const Demo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {SCENES.map((spec) => {
        const frames = sceneFrames(spec);
        const Scene = SCENE_COMPONENTS[spec.id]!;
        const seq = (
          <Sequence key={spec.id} from={from} durationInFrames={frames} name={spec.id}>
            <SceneFrame frames={frames}>
              <Scene />
            </SceneFrame>
            <Sequence from={LEAD_IN_FRAMES} name={`${spec.id}-audio`}>
              <Audio src={staticFile(`narration/${spec.id}.wav`)} />
            </Sequence>
            {!NO_CAPTION.has(spec.id) && <Caption text={NARRATION[spec.id]!} />}
          </Sequence>
        );
        from += frames;
        return seq;
      })}
    </AbsoluteFill>
  );
};
