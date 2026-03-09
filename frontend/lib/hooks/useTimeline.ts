import { useState, useCallback, useMemo } from 'react';
import type {
  TimelineDataPoint,
  TimelinePredictionPoint,
  TimelineZoomLevel,
  TimelineRange,
  TimelineMetrics,
} from '@/lib/types/timeline';

const ZOOM_MULTIPLIERS: Record<TimelineZoomLevel, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

const DEFAULT_ZOOM_WINDOWS: Record<TimelineZoomLevel, number> = {
  minute: 60 * 60 * 1000, // Show 1 hour
  hour: 24 * 60 * 60 * 1000, // Show 1 day
  day: 7 * 24 * 60 * 60 * 1000, // Show 1 week
  week: 30 * 24 * 60 * 60 * 1000, // Show 1 month
  year: 365 * 24 * 60 * 60 * 1000, // Show 1 year
};

interface UseTimelineOptions {
  historicalRatio?: number; // 0.8 = 80% historical, 20% predictions
  initialZoom?: TimelineZoomLevel;
}

export function useTimeline(
  historicalData: TimelineDataPoint[],
  predictions: TimelinePredictionPoint[],
  options: UseTimelineOptions = {}
) {
  const {
    historicalRatio = 0.8,
    initialZoom = 'day',
  } = options;

  const [zoomLevel, setZoomLevel] = useState<TimelineZoomLevel>(initialZoom);
  const [panOffset, setPanOffset] = useState(0); // Offset from the current time

  // Calculate visible range based on current time and zoom
  const visibleRange = useMemo((): TimelineRange => {
    const now = Date.now();
    const zoomWindow = DEFAULT_ZOOM_WINDOWS[zoomLevel];

    // Calculate start and end to show historicalRatio of historical + remaining for predictions
    const totalWindow = zoomWindow / historicalRatio;
    const startTime = now - totalWindow * (1 - historicalRatio) + panOffset;
    const endTime = now + totalWindow * historicalRatio + panOffset;

    return { startTime, endTime };
  }, [zoomLevel, historicalRatio, panOffset]);

  // Filter data points within visible range
  const visibleHistoricalData = useMemo(
    () =>
      historicalData.filter(
        (p) => p.timestamp >= visibleRange.startTime && p.timestamp <= visibleRange.endTime
      ),
    [historicalData, visibleRange]
  );

  const visiblePredictions = useMemo(
    () =>
      predictions.filter(
        (p) => p.timestamp >= visibleRange.startTime && p.timestamp <= visibleRange.endTime
      ),
    [predictions, visibleRange]
  );

  // Calculate metrics for visible data
  const metrics = useMemo((): TimelineMetrics => {
    const allValues = [
      ...visibleHistoricalData.map((p) => p.value),
      ...visiblePredictions.map((p) => p.predictedValue),
    ];

    if (allValues.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        stdDev: 0,
        count: 0,
      };
    }

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const mean = allValues.reduce((a, b) => a + b) / allValues.length;
    const variance =
      allValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allValues.length;
    const stdDev = Math.sqrt(variance);

    return {
      min,
      max,
      mean,
      stdDev,
      count: visibleHistoricalData.length,
    };
  }, [visibleHistoricalData, visiblePredictions]);

  // Add padding to y-axis for better visualization
  const yAxisDomain = useMemo(() => {
    const padding = (metrics.max - metrics.min) * 0.1 || 1;
    return [metrics.min - padding, metrics.max + padding];
  }, [metrics]);

  // Handlers
  const handleZoom = useCallback((level: TimelineZoomLevel) => {
    setZoomLevel(level);
    setPanOffset(0);
  }, []);

  const handlePan = useCallback((direction: 'left' | 'right', percentage: number) => {
    setPanOffset((prev) => {
      const zoomWindow = DEFAULT_ZOOM_WINDOWS[zoomLevel];
      const shift = zoomWindow * percentage;
      const newOffset = direction === 'left' ? prev - shift : prev + shift;
      return newOffset;
    });
  }, [zoomLevel]);

  const resetView = useCallback(() => {
    setPanOffset(0);
  }, []);

  return {
    zoomLevel,
    visibleRange,
    visibleHistoricalData,
    visiblePredictions,
    metrics,
    yAxisDomain,
    panOffset,
    historicalRatio,
    handlers: {
      handleZoom,
      handlePan,
      resetView,
    },
  };
}
