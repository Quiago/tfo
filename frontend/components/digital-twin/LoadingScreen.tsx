'use client';

import { useEffect, useRef } from 'react';
import { useProgress } from '@react-three/drei';

interface LoadingScreenProps {
  onLoaded?: () => void;
}

export function LoadingScreen({ onLoaded }: LoadingScreenProps) {
  const { progress } = useProgress();
  const hasCalledRef = useRef(false);
  const isLoaded = progress >= 100;

  useEffect(() => {
    if (isLoaded && !hasCalledRef.current) {
      hasCalledRef.current = true;
      onLoaded?.();
    }
  }, [isLoaded, onLoaded]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 transition-opacity duration-700 ${
        isLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-4">
        <span className="text-orange-500 text-2xl font-bold tracking-widest">
          TRIPOLAR
        </span>
        <div className="w-64 h-0.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-xs text-zinc-500">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}
