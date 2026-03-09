/**
 * Multi-Layer Timeline Types
 * Comprehensive data structures for industrial Digital Twin visualization
 * Domain: Nestle Dubai Production Facility
 */

import type { ReactNode } from 'react';

export type TimelineZoomLevel = 'minute' | 'hour' | 'day' | 'week' | 'year';
export type TimeGranularity = 'Minute' | 'Hour' | 'Day' | 'Week' | 'Year';

// --- SENSOR LAYER ---------------------------------------------------------------
export interface SensorReading {
  timestamp: number;
  temperature: number;        // °C machine zone or ambient temp
  humidity: number;           // % RH (storage/warehouse areas)
  vibration: number;          // mm/s RMS vibration from accelerometer
  pressure: number;           // bar compressed air system pressure
  videoFrame?: {
    frameNumber: number;
    thumbnailColor: string; // hex color representing dominant color of frame
    hasMotion: boolean;     // motion detection flag
    zone: string;           // camera zone identifier
  };
  anomaly: boolean;
  alertLevel: 'none' | 'warning' | 'critical';
}

// --- ENERGY LAYER ---------------------------------------------------------------
export interface EnergyReading {
  timestamp: number;
  powerDraw: number;        // kW total line power (fillers, conveyors, chillers, compressed air)
  coolingLoad: number;      // kW chiller/product cooling load
  efficiency: number;       // % line uptime (0-100)
  costPerHour: number;      // AED/hour (Dubai electricity cost)
  predicted?: number;
  upperBound?: number;
  lowerBound?: number;
}

// --- ACTIONS LAYER --------------------------------------------------------------
export type ActionCategory =
  | 'Preventive'
  | 'Corrective'
  | 'Inspection'
  | 'Alert'
  | 'Optimization'
  | 'Compliance';

export interface ActionEvent {
  timestamp: number;
  type: 'maintenance' | 'compliance' | 'agent' | 'alert' | 'user';
  source: string; // ERP, CMMS, DCIM, AI Agent, etc.
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  isAI: boolean;  // true for AI/automated events, false for human actions
  category: ActionCategory;
}

// --- PRODUCT LAYER --------------------------------------------------------------
export interface ProductMetric {
  timestamp: number;
  output: number;   // units per minute (bottles, sachets)
  target: number;   // target units per minute
  uptime: number;   // % line uptime (0-100)
}

// --- LAYER CONFIGURATION --------------------------------------------------------
export interface LayerConfig {
  id: string;
  name: string;
  icon: ReactNode;
  color: string;
  accentColor: string;
  bgGradient: string;
  description: string;
  visible: boolean;
}

// --- LEGACY TYPES (for backward compatibility) ----------------------------------
export interface TimelineDataPoint {
  timestamp: number;
  value: number;
  metadata: Record<string, unknown>;
}

export interface TimelinePredictionPoint {
  timestamp: number;
  predictedValue: number;
  upperBound?: number;
  lowerBound?: number;
}

export interface TimelineRange {
  startTime: number;
  endTime: number;
}

export interface TimelineConfig {
  zoomLevel: TimelineZoomLevel;
  historicalRatio: number;
  height: number;
  width: number;
  animated: boolean;
  streamingInterval?: number;
}

export interface TimelineState {
  historicalData: TimelineDataPoint[];
  predictions: TimelinePredictionPoint[];
  visibleRange: TimelineRange;
  config: TimelineConfig;
  isStreaming: boolean;
  isLoading: boolean;
}

export interface TimelineMetrics {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  count: number;
}
