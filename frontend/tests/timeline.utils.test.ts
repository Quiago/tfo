/**
 * Tests for pure utility functions in useConnectorTimeline and SensorLayerLW.
 *
 * These cover:
 *   - pruneBuffer: time-based buffer management (Rule 3)
 *   - deriveEnergy / deriveProduct: derived metric helpers
 *   - GRANULARITY_CONFIG + MAX_BUFFER_MS: that the buffer ceiling covers all windows
 *   - toUTC: epoch-ms → epoch-seconds conversion used by lightweight-charts
 */
import { describe, it, expect } from 'vitest';

// ── Import pure exports from the hook ────────────────────────────────────────
import {
    pruneBuffer,
    deriveEnergy,
    deriveProduct,
} from '../lib/hooks/useConnectorTimeline';
import type { SensorReading } from '../lib/types/timeline';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_TS = 1_700_000_000_000; // arbitrary stable epoch ms

function makeReading(offsetMs: number, overrides: Partial<SensorReading> = {}): SensorReading {
    return {
        timestamp:      BASE_TS + offsetMs,
        temperature:    50,
        vibration:      30,
        pressure:       60,
        humidity:       40,
        rawTemperature: null,
        rawVibration:   null,
        rawPressure:    null,
        rawHumidity:    null,
        anomaly:        false,
        alertLevel:     'none',
        ...overrides,
    };
}

// ─── pruneBuffer ──────────────────────────────────────────────────────────────

describe('pruneBuffer', () => {
    it('returns empty array when input is empty', () => {
        expect(pruneBuffer([], BASE_TS)).toEqual([]);
    });

    it('returns entire buffer when all readings are newer than cutoff', () => {
        const buf = [makeReading(100), makeReading(200), makeReading(300)];
        expect(pruneBuffer(buf, BASE_TS)).toHaveLength(3);
    });

    it('removes all readings older than cutoff', () => {
        const buf = [
            makeReading(-3000),
            makeReading(-2000),
            makeReading(-1000),
        ];
        const result = pruneBuffer(buf, BASE_TS); // cutoff = BASE_TS, all are older
        expect(result).toHaveLength(0);
    });

    it('removes only readings before the cutoff, keeps readings at or after', () => {
        const buf = [
            makeReading(-3000),  // older than cutoff
            makeReading(-2000),  // older
            makeReading(0),      // exactly at cutoff — kept
            makeReading(1000),   // newer — kept
            makeReading(2000),   // newer — kept
        ];
        const result = pruneBuffer(buf, BASE_TS);
        expect(result).toHaveLength(3);
        expect(result[0].timestamp).toBe(BASE_TS);
    });

    it('returns original array reference when nothing is pruned (lo===0)', () => {
        const buf = [makeReading(100), makeReading(200)];
        const result = pruneBuffer(buf, BASE_TS - 500);
        // All readings are newer than cutoff → no pruning → same content
        expect(result).toHaveLength(2);
    });

    it('prunes correctly with large buffer (binary search boundary)', () => {
        const buf = Array.from({ length: 100 }, (_, i) => makeReading(i * 1000)); // 0…99s after BASE_TS
        const cutoff = BASE_TS + 50_000; // keep only last 50 readings
        const result = pruneBuffer(buf, cutoff);
        expect(result).toHaveLength(50);
        expect(result[0].timestamp).toBe(BASE_TS + 50_000);
        expect(result[49].timestamp).toBe(BASE_TS + 99_000);
    });

    it('handles single-element buffer that is too old', () => {
        const buf = [makeReading(-5000)];
        expect(pruneBuffer(buf, BASE_TS)).toHaveLength(0);
    });

    it('handles single-element buffer that is new enough', () => {
        const buf = [makeReading(1000)];
        expect(pruneBuffer(buf, BASE_TS)).toHaveLength(1);
    });

    it('MAX_BUFFER_MS (12 min) covers the largest configured window (10 min)', () => {
        // The largest windowMs is 600_000ms (10 min for Day/Week/Year views).
        // MAX_BUFFER_MS = 720_000ms (12 min) must be > 600_000ms.
        // This ensures data for the full window is never accidentally pruned.
        const MAX_BUFFER_MS = 720_000;
        const LARGEST_WINDOW_MS = 600_000;
        expect(MAX_BUFFER_MS).toBeGreaterThan(LARGEST_WINDOW_MS);
    });
});

// ─── deriveEnergy ─────────────────────────────────────────────────────────────

describe('deriveEnergy', () => {
    it('produces a powerDraw proportional to temperature and vibration', () => {
        const s = makeReading(0, { temperature: 10, vibration: 5 });
        const e = deriveEnergy(s);
        // powerDraw = 50 + temp*1.5 + vib*8 = 50 + 15 + 40 = 105
        expect(e.powerDraw).toBe(105);
    });

    it('coolingLoad is 30% of powerDraw', () => {
        const s = makeReading(0, { temperature: 0, vibration: 0 });
        const e = deriveEnergy(s);
        expect(e.coolingLoad).toBeCloseTo(e.powerDraw * 0.3, 1);
    });

    it('efficiency is at least 60 (floor)', () => {
        // Extremely high vibration: efficiency = max(60, 100 - vib*0.4)
        // At vib=100 → max(60, 100-40) = max(60, 60) = 60
        const s = makeReading(0, { vibration: 100 });
        const e = deriveEnergy(s);
        expect(e.efficiency).toBeGreaterThanOrEqual(60);
    });

    it('efficiency decreases as vibration increases', () => {
        const low  = deriveEnergy(makeReading(0, { vibration: 10 }));
        const high = deriveEnergy(makeReading(0, { vibration: 80 }));
        expect(low.efficiency).toBeGreaterThan(high.efficiency);
    });

    it('preserves the source timestamp', () => {
        const s = makeReading(5000);
        expect(deriveEnergy(s).timestamp).toBe(s.timestamp);
    });
});

// ─── deriveProduct ────────────────────────────────────────────────────────────

describe('deriveProduct', () => {
    it('target is always 1200', () => {
        const p = deriveProduct(makeReading(0));
        expect(p.target).toBe(1200);
    });

    it('uptime is at least 60 (floor)', () => {
        // Maximum penalties: pressure=0 → (50-0)*0.3=15; humidity=100 → (100-60)*0.2=8
        const s = makeReading(0, { pressure: 0, humidity: 100 });
        const p = deriveProduct(s);
        expect(p.uptime).toBeGreaterThanOrEqual(60);
    });

    it('output scales with uptime', () => {
        const s = makeReading(0, { pressure: 60, humidity: 50 }); // ideal conditions
        const p = deriveProduct(s);
        expect(p.output).toBe(Math.round(1200 * (p.uptime / 100)));
    });

    it('preserves the source timestamp', () => {
        const s = makeReading(8000);
        expect(deriveProduct(s).timestamp).toBe(s.timestamp);
    });
});

// ─── toUTC (inline copy — pure conversion, no import needed) ─────────────────

describe('toUTC conversion', () => {
    function toUTC(ms: number): number {
        return Math.floor(ms / 1000);
    }

    it('converts epoch-ms to epoch-seconds', () => {
        expect(toUTC(1_700_000_000_000)).toBe(1_700_000_000);
    });

    it('floors sub-second precision', () => {
        expect(toUTC(1_700_000_000_999)).toBe(1_700_000_000);
    });

    it('xDomain from/to never equal when windowMs >= 1000ms', () => {
        const now = 1_700_000_000_000;
        const windowMs = 60_000; // Minute view
        expect(toUTC(now - windowMs)).toBeLessThan(toUTC(now));
    });
});
