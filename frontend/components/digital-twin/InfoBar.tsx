'use client';

interface InfoBarProps {
  activePresetName: string | null;
  cameraPosition: [number, number, number] | null;
  meshCount: number;
}

export function InfoBar({ activePresetName, cameraPosition, meshCount }: InfoBarProps) {
  const formatCoord = (v: number) => v.toFixed(1);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/80 to-transparent px-6 py-4 flex items-end justify-between">
      <div>
        {activePresetName ? (
          <div className="text-lg font-semibold text-white">{activePresetName}</div>
        ) : (
          <div className="text-lg font-semibold text-zinc-400">FREE CAMERA</div>
        )}
        {cameraPosition && (
          <div className="text-xs font-mono text-zinc-500">
            CAM [{formatCoord(cameraPosition[0])}, {formatCoord(cameraPosition[1])}, {formatCoord(cameraPosition[2])}]
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="text-xs font-mono text-zinc-600">MESHES: {meshCount}</div>
      </div>
    </div>
  );
}
