import { describe, expect, it } from 'vitest';
import { cabs, capacitor, contactImpedance, currentNoiseImpedance, gapElectrodeImpedance, inputImpedance } from '../src/physics/electrode';

describe('amplifier input current noise', () => {
  it('sees both the source and input resistance, as Kirchhoff current balance requires', () => {
    const z = currentNoiseImpedance({ re: 1e9, im: 0 }, { re: 1e9, im: 0 });
    expect(z).toEqual({ re: 5e8, im: 0 });
  });

  it('is bounded by input loading for a gapped contact', () => {
    const dry = { RpA: 1.3e6, CpA: 12e-9, RsA: 200 };
    const zin = inputImpedance(1e9, 20e-12, 10);
    const small = gapElectrodeImpedance(dry, 0.1, { contactFraction: 0, gapM: 0.06e-3, epsr: 1 }, 10);
    const large = gapElectrodeImpedance(dry, 0.1, { contactFraction: 0, gapM: 0.5e-3, epsr: 1 }, 10);
    expect(cabs(small)).toBeGreaterThan(10 * cabs(zin));
    expect(cabs(currentNoiseImpedance(small, zin))).toBeLessThan(cabs(zin));
    expect(cabs(currentNoiseImpedance(large, zin))).toBeLessThan(cabs(zin));
    const wet = contactImpedance({ RpA: 7.5e3, CpA: 25e-9, RsA: 200 }, 1, 10);
    expect(cabs(currentNoiseImpedance(wet, zin)) / cabs(wet)).toBeCloseTo(1, 4);
  });

  it('adds capacitances in parallel rather than retaining the unloaded gap impedance', () => {
    const got = currentNoiseImpedance(capacitor(2e-12, 10), capacitor(20e-12, 10));
    expect(got.re).toBe(0);
    expect(got.im / capacitor(22e-12, 10).im).toBeCloseTo(1, 12);
  });
});
