import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Deterministic, CPU-friendly render (no WebGL needed anywhere in the comp).
Config.setConcurrency(8);
