/**
 * Global constants and configuration values
 * Centralized single source of truth for magic numbers and strings
 */

// Timeline Configuration
export const TIMELINE_CONFIG = {
  // Zoom window sizes (in milliseconds)
  ZOOM_WINDOWS: {
    minute: 60 * 60 * 1000, // 1 hour
    hour: 24 * 60 * 60 * 1000, // 1 day
    day: 7 * 24 * 60 * 60 * 1000, // 1 week
    week: 30 * 24 * 60 * 60 * 1000, // 1 month
    year: 365 * 24 * 60 * 60 * 1000, // 1 year
  },

  // Display ratios
  HISTORICAL_RATIO: 0.8, // 80% historical, 20% predictions
  PREDICTION_RATIO: 0.2,

  // Default dimensions
  DEFAULT_HEIGHT: 400,
  DEFAULT_WIDTH: 100,

  // Colors
  COLORS: {
    historical: '#0f172a', // Dark slate
    predicted: '#3b82f6', // Blue
    confidenceInterval: '#93c5fd', // Light blue
    grid: '#e5e7eb', // Light gray
    text: '#666666', // Medium gray
  },

  // Animation
  ANIMATE: true,
  ANIMATION_DURATION: 300,
};

// Mock Data Configuration
export const MOCK_DATA_CONFIG = {
  // Time series generation
  HISTORICAL_DAYS: 90,
  PREDICTION_DAYS: 30,
  BASE_VALUE: 100,
  VOLATILITY: 3, // Percentage
  TREND: 0.1, // Percentage per day
  DATA_POINTS_PER_DAY: 96, // 15-minute intervals

  // Streaming
  STREAMING_INTERVAL: 15000, // 15 seconds
  STREAMING_BATCH_SIZE: 1,
};

// UI Configuration
export const UI_CONFIG = {
  // Breakpoints (matches Tailwind)
  BREAKPOINTS: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  },

  // Spacing
  PADDING: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },

  // Border radius
  RADIUS: {
    xs: 2,
    sm: 4,
    md: 8,
    lg: 12,
    full: 9999,
  },

  // Z-index
  Z_INDEX: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    modal: 40,
    tooltip: 50,
  },
};

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  TIMEOUT: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000'),
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

// Feature Flags
export const FEATURE_FLAGS = {
  MOCK_DATA_MODE: process.env.NEXT_PUBLIC_MOCK_DATA_MODE !== 'false',
  ENABLE_3D: process.env.NEXT_PUBLIC_ENABLE_3D_CANVAS !== 'false',
  ENABLE_STREAMING: process.env.NEXT_PUBLIC_ENABLE_REAL_TIME_STREAMING !== 'false',
  ENABLE_ANIMATIONS: process.env.NEXT_PUBLIC_CHART_ANIMATION_ENABLED !== 'false',
};

// Messages
export const MESSAGES = {
  LOADING: 'Loading data...',
  ERROR: 'An error occurred',
  NO_DATA: 'No data available',
  SUCCESS: 'Operation successful',
};
