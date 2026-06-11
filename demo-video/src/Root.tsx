import { Composition } from 'remotion';
import { Demo } from './Demo';
import { FPS, totalFrames } from './storyboard';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="HomeCanvasDemo"
      component={Demo}
      durationInFrames={totalFrames()}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
