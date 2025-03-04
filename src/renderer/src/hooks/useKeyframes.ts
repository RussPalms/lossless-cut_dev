import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import sortBy from 'lodash/sortBy';
import useDebounceOld from 'react-use/lib/useDebounce'; // Want to phase out this

import { readFramesAroundTime, findNearestKeyFrameTime as ffmpegFindNearestKeyFrameTime, Frame } from '../ffmpeg';
import { FFprobeStream } from '../../../../ffprobe';

const maxKeyframes = 1000;
// const maxKeyframes = 100;

function useKeyframes({ keyframesEnabled, filePath, commandedTime, videoStream, detectedFps, ffmpegExtractWindow }: {
  keyframesEnabled: boolean,
  filePath: string | undefined,
  commandedTime: number,
  videoStream: FFprobeStream | undefined,
  detectedFps: number | undefined,
  ffmpegExtractWindow: number,
}) {
  const readingKeyframesPromise = useRef<Promise<unknown>>();
  const [neighbouringKeyFramesMap, setNeighbouringKeyFrames] = useState<Record<string, Frame>>({});
  const neighbouringKeyFrames = useMemo(() => Object.values(neighbouringKeyFramesMap), [neighbouringKeyFramesMap]);

  const findNearestKeyFrameTime = useCallback(({ time, direction }: { time: number, direction: number }) => ffmpegFindNearestKeyFrameTime({ frames: neighbouringKeyFrames, time, direction, fps: detectedFps }), [neighbouringKeyFrames, detectedFps]);

  useEffect(() => setNeighbouringKeyFrames({}), [filePath, videoStream]);

  useDebounceOld(() => {
    let aborted = false;

    (async () => {
      // See getIntervalAroundTime
      // We still want to calculate keyframes even if not shouldShowKeyframes because maybe we want to be able to step to the closest keyframe
      const shouldRun = keyframesEnabled && filePath != null && videoStream && commandedTime != null && !readingKeyframesPromise.current;
      if (!shouldRun) return;

      try {
        const promise = readFramesAroundTime({ filePath, aroundTime: commandedTime, streamIndex: videoStream.index, window: ffmpegExtractWindow });
        readingKeyframesPromise.current = promise;
        const newFrames = await promise;
        if (aborted) return;
        const newKeyFrames = newFrames.filter((frame) => frame.keyframe);
        // console.log(newFrames);
        setNeighbouringKeyFrames((existingKeyFramesMap) => {
          let existingFrames = Object.values(existingKeyFramesMap);
          if (existingFrames.length >= maxKeyframes) {
            existingFrames = sortBy(existingFrames, 'createdAt').slice(newKeyFrames.length);
          }
          const toObj = (map: Frame[]) => Object.fromEntries(map.map((frame) => [frame.time, frame]));
          return {
            ...toObj(existingFrames),
            ...toObj(newKeyFrames),
          };
        });
      } catch (err) {
        console.error('Failed to read keyframes', err);
      } finally {
        readingKeyframesPromise.current = undefined;
      }
    })();

    return () => {
      aborted = true;
    };
  }, 500, [keyframesEnabled, filePath, commandedTime, videoStream, ffmpegExtractWindow]);

  return {
    neighbouringKeyFrames, findNearestKeyFrameTime,
  };
}

export default useKeyframes;
