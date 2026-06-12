import { Composition } from 'remotion';
import { Demo } from './Demo';
import { LandingPage } from './LandingPage';
import { FPS, totalFrames } from './storyboard';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HomeCanvasDemo"
        component={Demo}
        durationInFrames={totalFrames()}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {/* Static landing-page design preview (rendered as a still for review). */}
      <Composition id="Landing" component={LandingPage} durationInFrames={1} fps={1} width={1280} height={2920} />
    </>
  );
};
