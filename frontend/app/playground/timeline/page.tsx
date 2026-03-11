'use client';

import dynamic from 'next/dynamic';

const MultiLayerTimeline = dynamic(
  () =>
    import('@/components/timeline/Timeline').then((m) => m.MultiLayerTimeline),
  { ssr: false }
);

export default function TimelinePlayground() {
  return (
    <div className="h-screen bg-[#171921] overflow-hidden">
      <MultiLayerTimeline />
    </div>
  );
}
