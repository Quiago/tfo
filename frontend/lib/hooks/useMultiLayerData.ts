import type {
    ActionEvent,
    EnergyReading,
    ProductMetric,
    SensorReading,
    TimeGranularity,
} from '@/lib/types/timeline';
import { useCallback, useEffect, useRef, useState } from 'react';

// =============================================================================
// UTILITIES
// =============================================================================

/** Deterministic PRNG (Lehmer/Park-Miller) for reproducible initial data */
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number = 2): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/** Find the index of the nearest timestamp within the first `limit` entries */
function findNearestIndex(
    timestamps: number[],
    target: number,
    limit: number,
): number {
    let bestIdx = -1;
    let bestDist = Infinity;
    const cap = Math.min(limit, timestamps.length);
    for (let i = 0; i < cap; i++) {
        const dist = Math.abs(timestamps[i] - target);
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
        }
    }
    return bestIdx;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const POINT_COUNTS: Record<TimeGranularity, number> = {
    Minute: 120,
    Hour: 96,
    Day: 90,
    Week: 52,
    Year: 60,
};

const INTERVALS_MS: Record<TimeGranularity, number> = {
    Minute: 60 * 1000,
    Hour: 3600 * 1000,
    Day: 86400 * 1000,
    Week: 7 * 86400 * 1000,
    Year: 30 * 86400 * 1000,
};

const STREAMING_INTERVAL_MS = 2000;

const CAMERA_ZONES = [
    'Line-1 Filler',
    'Line-2 Packager',
    'QC Station',
    'Warehouse Bay-A',
] as const;

/** Complete anomaly event bundle — single realTime ensures all layers sync to same grid point */
interface PersistedAnomalyBundle {
    realTime: number;    // Date.now() when triggered — anchor for ALL layers
    vibration: number;   // Peak vibration value
    actions: Omit<ActionEvent, 'timestamp'>[];  // AI alert + human review
}

// =============================================================================
// PRODUCTION TARGETS
// =============================================================================

// Realistic production targets for Nestle Dubai factory
// Line-1 baseline: 850 units/min (Nescafé bottles)
const BASE_TARGETS: Record<TimeGranularity, number> = {
    Minute: 850,              // 850 units/min
    Hour: 51000,              // 850 * 60
    Day: 1224000,             // 850 * 60 * 24
    Week: 8568000,            // 850 * 60 * 24 * 7
    Year: 312840000,          // 850 * 60 * 24 * 365
};

// (Event templates removed — using 3 fixed hardcoded events in generateActionData)

// =============================================================================
// TIMESTAMP GENERATION
// =============================================================================

/**
 * Generate timestamps with the last 20% in the future (prediction zone).
 * Historical points count backward from now; prediction points go forward.
 */
function generateTimestamps(
    granularity: TimeGranularity,
    count: number,
): number[] {
    const now = Date.now();
    const step = INTERVALS_MS[granularity];
    const historyCount = Math.floor(count * 0.8);

    return Array.from({ length: count }, (_, i) => {
        if (i < historyCount) {
            return now - (historyCount - 1 - i) * step;
        }
        return now + (i - historyCount + 1) * step;
    });
}

// =============================================================================
// VIDEO FRAME GENERATION
// =============================================================================

/**
 * Determine thumbnail color based on worst condition across sensors.
 * - Green (#22c55e): Normal operation
 * - Orange (#f97316): Anomaly detected
 * - Red (#ef4444): Critical alert
 */
function determineThumbnailColor(
    temperature: number,
    vibration: number,
    pressure: number,
): string {
    const isCritical =
        vibration > 12 || temperature > 50 || pressure < 4;
    const isAnomaly =
        vibration > 8 || temperature > 45 || pressure < 5.5;

    if (isCritical) {
        return '#ef4444'; // red
    } else if (isAnomaly) {
        return '#f97316'; // orange
    } else {
        return '#22c55e'; // green
    }
}

function generateVideoFrame(
    frameNumber: number,
    temperature: number,
    vibration: number,
    pressure: number,
    zone: string,
): SensorReading['videoFrame'] {
    const thumbnailColor = determineThumbnailColor(temperature, vibration, pressure);

    return {
        frameNumber,
        thumbnailColor,
        hasMotion: vibration > 3, // motion detected when vibration above baseline
        zone,
    };
}

// =============================================================================
// VIBRATION GENERATION (realistic industrial patterns)
// =============================================================================

/**
 * Vibration model:
 * - Normal: 2-4 mm/s (healthy conveyor motors)
 * - Moderate: 4-8 mm/s (bearing wear developing)
 * - High: 8-15 mm/s (anomaly, attention needed)
 * - Critical: >15 mm/s (emergency stop)
 *
 * Patterns: gradual increase segments, random spikes, mean reversion after maintenance.
 */
function generateVibrationValue(
    rand: () => number,
    prevVibration: number,
): number {
    let vibration = prevVibration;

    // Mean reversion toward 3.0 mm/s (normal operating point)
    vibration += (3.0 - vibration) * 0.05;

    // Random walk — wider step for visible variation on chart
    vibration += (rand() - 0.48) * 1.2;

    return clamp(round(vibration, 2), 1.5, 5.5);
}

// =============================================================================
// DATA GENERATORS (Initial / Historical + Prediction)
// =============================================================================

function generateSensorData(
    timestamps: number[],
    rand: () => number,
    predictionStart: number,
    _granularity: TimeGranularity,
): SensorReading[] {
    let temp = 28;
    let vibration = 3.0;
    let frameCounter = 0;

    // Initial data: completely clean (no anomalies). Anomalies are triggered via Test button.
    // MODIFIED FOR DEMO: Inject rising vibration trend leading up to predictionStart
    return timestamps.map((ts, i) => {
        const inPrediction = i >= predictionStart;

        // Calculate hours before "now" (predictionStart)
        // Each point is approx predictionStart - i steps away
        const stepsFromNow = predictionStart - i;
        const hoursFromNow = (stepsFromNow * (INTERVALS_MS[_granularity] / 3600000));

        // Temperature: random walk
        temp = clamp(temp + (rand() - 0.48) * 1.0, 22, 42);

        // MUNICH INCIDENT: Temperature rises in the last 4 hours
        if (!inPrediction && hoursFromNow <= 4 && hoursFromNow > 0) {
            // Ramp from 28 to 42
            const tempEffect = 14 * (1 - (hoursFromNow / 4));
            temp = 28 + tempEffect + (rand() - 0.5);
        }

        if (inPrediction) {
            temp += (rand() - 0.5) * 2.0;
            temp = clamp(temp, 20, 45);
        }

        // Vibration: stable random walk
        vibration = generateVibrationValue(rand, vibration);

        // MUNICH INCIDENT: Vibration rises in the last 4 hours
        if (!inPrediction && hoursFromNow <= 4 && hoursFromNow > 0) {
            // Ramp from 3.0 to 9.0 (warning/anomaly level) just before the critical spike
            const vibEffect = 6.0 * (1 - (hoursFromNow / 4));
            vibration = 3.0 + vibEffect + (rand() - 0.5);
        }

        if (inPrediction) {
            vibration += (rand() - 0.5) * 1.5;
            vibration = clamp(vibration, 1.5, 6.0);
        }

        // Humidity
        const humidity = round(
            52 + rand() * 8 + (inPrediction ? (rand() - 0.5) * 5 : 0),
            1,
        );

        // Pressure
        const pressure = round(
            clamp(6.5 + rand() * 1.2 + (inPrediction ? (rand() - 0.5) * 0.4 : 0), 5.0, 8.0),
            2,
        );

        const zone = CAMERA_ZONES[frameCounter % CAMERA_ZONES.length];
        const videoFrame =
            rand() < 0.85
                ? generateVideoFrame(frameCounter++, temp, vibration, pressure, zone)
                : undefined;

        // Mark as anomaly if we are in the high vibration zone (DEMO)
        const isDemoAnomaly = !inPrediction && hoursFromNow <= 1 && hoursFromNow > 0 && vibration > 8;

        return {
            timestamp: ts,
            temperature: round(temp, 2),
            humidity,
            pressure,
            vibration: round(vibration, 2),
            videoFrame,
            anomaly: isDemoAnomaly,
            alertLevel: isDemoAnomaly ? 'warning' : 'none' as const,
        };
    });
}

function generateEnergyData(
    timestamps: number[],
    sensors: SensorReading[],
    rand: () => number,
    predictionStart: number,
): EnergyReading[] {
    // Dubai industrial electricity rate: ~0.40 AED/kWh
    const COST_PER_KWH = 0.40;

    return timestamps.map((ts, i) => {
        const sensor = sensors[i];
        const inPrediction = i >= predictionStart;

        // Factory power consumption model:
        const baseLoad = 110 + rand() * 20;

        // Uptime-based efficiency: 85-99% normal, 78-100% in prediction
        const uptimeBase = 92 + rand() * 7;
        const uptimeVariance = inPrediction ? (rand() - 0.5) * 12 : 0;
        let efficiency = clamp(round(uptimeBase + uptimeVariance, 1), 78, 100);

        // MUNICH INCIDENT: Efficiency drops as vibration rises (correlation)
        if (sensor.vibration > 6.0) {
            efficiency -= (sensor.vibration - 6.0) * 2.5; // Drop efficiency
        }

        // Power draw scales with efficiency (uptime)
        let powerDraw = round(baseLoad * (efficiency / 100) + rand() * 5, 1);

        // MUNICH INCIDENT: Energy spike due to "malfunction" (resistance/friction)
        if (sensor.vibration > 7.0 && !inPrediction) {
            powerDraw += (sensor.vibration - 7.0) * 5.0; // Extra kW load
        }

        // Chiller load: correlated with ambient temperature
        const ambientTemp = sensor?.temperature ?? 28;
        const baseChiller = 18 + (ambientTemp - 22) * 0.8;
        const coolingLoad = round(
            clamp(baseChiller + rand() * 8, 10, 35),
            1,
        );

        // Total power (fillers + compressor + chiller)
        const totalPower = powerDraw + coolingLoad;

        // Cost per hour calculation: AED/hour
        const costPerHour = round(totalPower * COST_PER_KWH, 2);

        // Prediction zone: projected values with uncertainty bands
        const predictionOffset = i - predictionStart;
        const predicted = inPrediction
            ? round(powerDraw + predictionOffset * 0.5 + rand() * 8, 1)
            : undefined;
        const upperBound = inPrediction
            ? round(powerDraw + predictionOffset * 1.2 + 15, 1)
            : undefined;
        const lowerBound = inPrediction
            ? round(Math.max(0, powerDraw + predictionOffset * 0.2 - 10), 1)
            : undefined;

        return {
            timestamp: ts,
            powerDraw,
            coolingLoad,
            efficiency,
            costPerHour,
            predicted,
            upperBound,
            lowerBound,
        };
    });
}

function generateProductData(
    timestamps: number[],
    granularity: TimeGranularity,
    rand: () => number,
    predictionStart: number,
): ProductMetric[] {
    const target = BASE_TARGETS[granularity];

    return timestamps.map((ts, i) => {
        const inPrediction = i >= predictionStart;

        // Uptime percentage: 85-99% normal; prediction zone: wider variance 78-100%
        const uptimeBase = 92 + rand() * 7;
        const uptimeVariance = inPrediction ? (rand() - 0.5) * 14 : 0;
        let uptime = clamp(round(uptimeBase + uptimeVariance, 1), 70, 100);

        // Output: units/min based on uptime and line speed variance
        const outputVariance = 0.9 + rand() * 0.2;
        const predictionNoise = inPrediction ? (rand() - 0.5) * 0.15 : 0;

        let output = Math.round(
            target * (uptime / 100) * (outputVariance + predictionNoise),
        );

        // MUNICH INCIDENT: Output drops when vibration is high (equipment struggle)
        // We don't have direct access to sensor data here, but we can infer or use a simplified model.
        // Ideally we would pass sensor data, but to keep signature simple we'll assume a random dip logic 
        // that statistically aligns with the vibration logic (e.g. based on index/time if we knew it exactly).
        // OR better: Update the function signature to accept sensorData if we really want strict correlation.
        // For now, let's just make it dip in the last few steps before predictionStart

        // RE-CALCULATING based on assumed "high vibration" zone (last 10% of history)
        const stepsFromNow = predictionStart - i;
        if (!inPrediction && stepsFromNow <= 20 && stepsFromNow > 0) {
            // progressive drop
            output = output * 0.75; // 25% drop
            uptime = uptime * 0.8;
        }

        return {
            timestamp: ts,
            output: Math.max(0, output),
            target,
            uptime,
        };
    });
}

/** Initial data: no actions. Actions are injected by the Test Anomaly button. */
function generateActionData(): ActionEvent[] {
    return [];
}

// =============================================================================
// STREAMING: SINGLE-POINT GENERATORS (use Math.random for live data)
// =============================================================================

function generateStreamingSensorPoint(
    timestamp: number,
    prevSensor: SensorReading | undefined,
    frameCounter: number,
): SensorReading {
    const prevTemp = prevSensor?.temperature ?? 28;
    const prevVib = prevSensor?.vibration ?? 3.0;
    const prevPressure = prevSensor?.pressure ?? 6.5;

    // Temperature: small random walk
    const temp = clamp(
        round(prevTemp + (Math.random() - 0.48) * 0.8, 2),
        22,
        42,
    );

    // Vibration: mean-reverting walk (no spikes — anomalies are pre-placed only)
    const vibration = clamp(
        round(prevVib + (3.0 - prevVib) * 0.05 + (Math.random() - 0.48) * 1.2, 2),
        1.5,
        5.5,
    );

    // Humidity
    const humidity = round(52 + Math.random() * 8, 1);

    // Pressure
    const pressure = round(
        clamp(prevPressure + (Math.random() - 0.48) * 0.2, 5.0, 8.0),
        2,
    );

    const zone = CAMERA_ZONES[frameCounter % CAMERA_ZONES.length];

    return {
        timestamp,
        temperature: temp,
        humidity,
        pressure,
        vibration,
        videoFrame:
            Math.random() < 0.85
                ? generateVideoFrame(frameCounter, temp, vibration, pressure, zone)
                : undefined,
        anomaly: false,
        alertLevel: 'none',
    };
}

function generateStreamingEnergyPoint(
    timestamp: number,
    sensor: SensorReading,
): EnergyReading {
    const COST_PER_KWH = 0.40;

    const baseLoad = 110 + Math.random() * 20;
    const uptimeBase = 92 + Math.random() * 7;
    const efficiency = clamp(round(uptimeBase, 1), 78, 100);
    const powerDraw = round(baseLoad * (efficiency / 100) + Math.random() * 5, 1);

    const ambientTemp = sensor.temperature;
    const baseChiller = 18 + (ambientTemp - 22) * 0.8;
    const coolingLoad = round(
        clamp(baseChiller + Math.random() * 8, 10, 35),
        1,
    );

    const totalPower = powerDraw + coolingLoad;
    const costPerHour = round(totalPower * COST_PER_KWH, 2);

    return {
        timestamp,
        powerDraw,
        coolingLoad,
        efficiency,
        costPerHour,
    };
}

function generateStreamingProductPoint(
    timestamp: number,
    granularity: TimeGranularity,
): ProductMetric {
    const target = BASE_TARGETS[granularity];
    const uptime = clamp(round(92 + Math.random() * 7, 1), 78, 100);
    const output = Math.round(
        target * (uptime / 100) * (0.9 + Math.random() * 0.2),
    );

    return {
        timestamp,
        output: Math.max(0, output),
        target,
        uptime,
    };
}

/** Generate a sensor point with a critical vibration spike (camera-visible anomaly). */
function generateAnomalySensorPoint(
    timestamp: number,
    prevSensor: SensorReading | undefined,
    frameCounter: number,
): SensorReading {
    const prevTemp = prevSensor?.temperature ?? 28;
    const prevPressure = prevSensor?.pressure ?? 6.5;

    const temp = clamp(round(prevTemp + (Math.random() - 0.48) * 0.8, 2), 22, 42);
    const humidity = round(52 + Math.random() * 8, 1);
    const pressure = round(clamp(prevPressure + (Math.random() - 0.48) * 0.2, 5.0, 8.0), 2);
    const vibration = round(12.5 + Math.random() * 3, 2); // Critical spike

    const zone = CAMERA_ZONES[frameCounter % CAMERA_ZONES.length];

    return {
        timestamp,
        temperature: temp,
        humidity,
        pressure,
        vibration,
        // Always include video frame — camera detects this anomaly
        videoFrame: generateVideoFrame(frameCounter, temp, vibration, pressure, zone),
        anomaly: true,
        alertLevel: 'critical',
    };
}

// =============================================================================
// HOOK
// =============================================================================

export function useMultiLayerData(granularity: TimeGranularity) {
    const pointCount = POINT_COUNTS[granularity];
    // Este es el índice donde termina la historia y empieza la predicción (el "NOW")
    const predictionStart = Math.floor(pointCount * 0.8);
    const frameCounterRef = useRef(0);

    // Persistent anomaly bundles — survives granularity changes
    // MUST be declared before buildInitialData which reads them
    const persistedAnomaliesRef = useRef<PersistedAnomalyBundle[]>([]);

    // --- Build initial data set ---
    const buildInitialData = useCallback(() => {
        const rand = seededRandom(42);
        const ts = generateTimestamps(granularity, pointCount);
        const sensors = generateSensorData(ts, rand, predictionStart, granularity);
        const products = generateProductData(ts, granularity, rand, predictionStart);
        const energy = generateEnergyData(ts, sensors, rand, predictionStart);

        frameCounterRef.current = sensors.reduce(
            (max, s) =>
                s.videoFrame ? Math.max(max, s.videoFrame.frameNumber + 1) : max,
            0,
        );

        // Inject persisted anomaly bundles — ONE anchor index per bundle
        // ensures sensor dot, camera bar, and actions ALL sync to same grid timestamp
        const actionEvents: ActionEvent[] = [];
        for (const bundle of persistedAnomaliesRef.current) {
            const idx = findNearestIndex(ts, bundle.realTime, predictionStart);
            if (idx >= 0) {
                const anchorTimestamp = ts[idx];

                // Sensor: inject anomaly reading
                const s = sensors[idx];
                sensors[idx] = {
                    ...s,
                    vibration: bundle.vibration,
                    anomaly: true,
                    alertLevel: 'critical',
                    videoFrame: generateVideoFrame(
                        s.videoFrame?.frameNumber ?? frameCounterRef.current++,
                        s.temperature,
                        bundle.vibration,
                        s.pressure,
                        CAMERA_ZONES[0],
                    ),
                };

                // Actions: ALL actions in the bundle share the same anchor timestamp
                for (const event of bundle.actions) {
                    actionEvents.push({ ...event, timestamp: anchorTimestamp } as ActionEvent);
                }
            }
        }

        return {
            timestamps: ts,
            sensorData: sensors,
            energyData: energy,
            actionData: actionEvents,
            productData: products,
        };
    }, [granularity, pointCount, predictionStart]);

    const [initialData] = useState(() => buildInitialData());
    const [timestamps, setTimestamps] = useState<number[]>(initialData.timestamps);
    const [sensorData, setSensorData] = useState<SensorReading[]>(initialData.sensorData);
    const [energyData, setEnergyData] = useState<EnergyReading[]>(initialData.energyData);
    const [actionData, setActionData] = useState<ActionEvent[]>(initialData.actionData);
    const [productData, setProductData] = useState<ProductMetric[]>(initialData.productData);
    const [isStreaming, setIsStreaming] = useState(true);

    // REFS NECESARIAS PARA EL STREAMING CORRECTO
    const sensorDataRef = useRef<SensorReading[]>(initialData.sensorData);
    const timestampsRef = useRef<number[]>(initialData.timestamps); // <--- NUEVO: Para saber el tiempo real
    const streamingEnabledRef = useRef(true);

    // Triggers
    const pendingAnomalyRef = useRef(false);
    const pendingHumanReviewRef = useRef(false);
    const anomalyTimestampRef = useRef(0); // Stores the anomaly tick's liveTimestamp for human review reuse

    const triggerAnomaly = useCallback(() => {
        pendingAnomalyRef.current = true;
    }, []);

    // 1. Re-inicializar cuando cambia la granularidad
    useEffect(() => {
        streamingEnabledRef.current = false;
        pendingAnomalyRef.current = false;
        pendingHumanReviewRef.current = false;

        const fresh = buildInitialData();
        setTimestamps(fresh.timestamps);
        setSensorData(fresh.sensorData);
        setEnergyData(fresh.energyData);
        setActionData(fresh.actionData);
        setProductData(fresh.productData);

        // Actualizamos las referencias inmediatamente
        sensorDataRef.current = fresh.sensorData;
        timestampsRef.current = fresh.timestamps;

        requestAnimationFrame(() => {
            streamingEnabledRef.current = true;
        });
    }, [buildInitialData]);

    // 2. Mantener Refs sincronizadas con el estado
    useEffect(() => {
        sensorDataRef.current = sensorData;
        timestampsRef.current = timestamps;
    }, [sensorData, timestamps]);

    // 3. LÓGICA DE STREAMING CORREGIDA (Aquí es donde ocurre la magia)
    useEffect(() => {
        setIsStreaming(true);

        const interval = setInterval(() => {
            if (!streamingEnabledRef.current) return;

            // --- A. Verificar Triggers ---
            const isAnomalyTick = pendingAnomalyRef.current;
            if (isAnomalyTick) {
                pendingAnomalyRef.current = false;
                pendingHumanReviewRef.current = true;
            }
            const isHumanReviewTick = !isAnomalyTick && pendingHumanReviewRef.current;
            if (isHumanReviewTick) {
                pendingHumanReviewRef.current = false;
            }

            // --- B. Calcular Tiempos (La clave del arreglo) ---
            const prevTimestamps = timestampsRef.current;
            const prevSensors = sensorDataRef.current;

            // EL TRUCO: El timestamp que "ahora" es predicción inmediata, se convierte en "presente"
            const liveTimestamp = prevTimestamps[predictionStart];

            // Calculamos el nuevo timestamp para el final del array (horizonte futuro)
            const step = INTERVALS_MS[granularity];
            const horizonTimestamp = prevTimestamps[prevTimestamps.length - 1] + step;

            // --- C. Generar Puntos ---

            // 1. Punto LIVE (El que insertamos en el medio)
            const lastHistorySensor = prevSensors[predictionStart - 1]; // Usamos el dato anterior al corte para continuidad
            const newLiveSensor = isAnomalyTick
                ? generateAnomalySensorPoint(liveTimestamp, lastHistorySensor, frameCounterRef.current)
                : generateStreamingSensorPoint(liveTimestamp, lastHistorySensor, frameCounterRef.current);
            frameCounterRef.current += 1;

            const newLiveEnergy = generateStreamingEnergyPoint(liveTimestamp, newLiveSensor);
            const newLiveProduct = generateStreamingProductPoint(liveTimestamp, granularity);

            // 2. Punto HORIZONTE (El futuro lejano ficticio para rellenar)
            const lastFutureSensor = prevSensors[prevSensors.length - 1];
            const newHorizonSensor = generateStreamingSensorPoint(horizonTimestamp, lastFutureSensor, frameCounterRef.current);
            newHorizonSensor.anomaly = false; // El futuro lejano siempre se ve limpio
            newHorizonSensor.alertLevel = 'none';

            const newHorizonEnergy = generateStreamingEnergyPoint(horizonTimestamp, newHorizonSensor);
            const newHorizonProduct = generateStreamingProductPoint(horizonTimestamp, granularity);

            // --- D. Acciones (Events) + Persist for cross-granularity ---
            const newActions: ActionEvent[] = [];
            if (isAnomalyTick) {
                const realNow = Date.now();
                // Store anomaly tick's liveTimestamp so human review uses the SAME one
                anomalyTimestampRef.current = liveTimestamp;
                // Create bundle — all actions will share the anomaly's timestamp
                persistedAnomaliesRef.current.push({
                    realTime: realNow,
                    vibration: newLiveSensor.vibration,
                    actions: [
                        {
                            type: 'alert',
                            source: 'AI Agent',
                            title: 'AI: Critical vibration anomaly',
                            description: 'Accelerometer RMS exceeded 12 mm/s. Pattern consistent with inner race bearing defect.',
                            severity: 'critical',
                            isAI: true,
                            category: 'Alert',
                        },
                    ],
                });
                newActions.push({
                    timestamp: liveTimestamp,
                    type: 'alert',
                    source: 'AI Agent',
                    title: 'AI: Critical vibration anomaly',
                    description: 'Accelerometer RMS exceeded 12 mm/s. Pattern consistent with inner race bearing defect.',
                    severity: 'critical',
                    isAI: true,
                    category: 'Alert',
                });
            }
            if (isHumanReviewTick) {
                // Append human review to the last bundle — shares same anchor timestamp
                const lastBundle = persistedAnomaliesRef.current[persistedAnomaliesRef.current.length - 1];
                // Use the ANOMALY tick's timestamp, not this tick's — keeps all dots aligned
                const anchorTs = anomalyTimestampRef.current;
                const humanAction: Omit<ActionEvent, 'timestamp'> = {
                    type: 'user',
                    source: 'Shift Lead',
                    title: 'Review Order: Line-1 inspection',
                    description: 'Manual inspection ordered following AI alert.',
                    severity: 'warning',
                    isAI: false,
                    category: 'Inspection',
                };
                if (lastBundle) {
                    lastBundle.actions.push(humanAction);
                }
                newActions.push({ ...humanAction, timestamp: anchorTs });
            }

            // --- E. Actualizar Arrays (Técnica de "Splicing") ---
            // Cortamos el array en dos, metemos el dato LIVE en medio, y añadimos HORIZONTE al final
            const updateArray = <T>(prev: T[], liveItem: T, horizonItem: T) => [
                ...prev.slice(1, predictionStart), // Historia desplazada
                liveItem,                          // NUESTRO PRESENTE
                ...prev.slice(predictionStart + 1), // Futuro desplazado
                horizonItem                        // Nuevo horizonte
            ];

            setTimestamps(prev => [
                ...prev.slice(1, predictionStart),
                liveTimestamp,
                ...prev.slice(predictionStart + 1),
                horizonTimestamp
            ]);

            setSensorData(prev => updateArray(prev, newLiveSensor, newHorizonSensor));
            setEnergyData(prev => updateArray(prev, newLiveEnergy, newHorizonEnergy));
            setProductData(prev => updateArray(prev, newLiveProduct, newHorizonProduct));

            // Actualizar Acciones
            const windowStart = prevTimestamps[1];
            setActionData((prevActions) => {
                const filtered = prevActions.filter((a) => a.timestamp >= windowStart);
                return [...filtered, ...newActions];
            });

        }, STREAMING_INTERVAL_MS);

        return () => {
            clearInterval(interval);
            setIsStreaming(false);
        };
    }, [granularity, pointCount, predictionStart]);

    const forecastBoundaryTimestamp = timestamps[predictionStart] ?? Date.now();

    return {
        timestamps,
        sensorData,
        energyData,
        actionData,
        productData,
        pointCount,
        predictionStart,
        forecastBoundaryTimestamp,
        isStreaming,
        triggerAnomaly,
    };
}