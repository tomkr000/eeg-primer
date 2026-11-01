/**
 * Electrode–skin interface as a lumped circuit (Neuman's model in Webster, Medical Instrumentation):
 *   electrode double layer (R_d ∥ C_d) → gel / sweat resistance R_s → epidermis (R_e ∥ C_e) → tissue R_u.
 * For an electrode separated from the skin by hair or air, a coupling capacitor C_gap = ε0 εr A / d
 * sits in series. Per-unit-area constants scale with contact area A: resistances ∝ 1/A, capacitances ∝ A.
 * The amplifier input (R_in ∥ C_in) forms a voltage divider with the electrode impedance.
 */

export interface Complex { re: number; im: number }
const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const mul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
export const cabs = (a: Complex) => Math.hypot(a.re, a.im);
const parallel = (a: Complex, b: Complex): Complex => div(mul(a, b), add(a, b));

/** Impedance of R ∥ C at frequency f (Hz); C = 0 → pure R. */
export function parallelRC(R: number, C: number, f: number): Complex {
  if (C <= 0) return { re: R, im: 0 };
  const w = 2 * Math.PI * f;
  // Z = R / (1 + jωRC)
  return div({ re: R, im: 0 }, { re: 1, im: w * R * C });
}

export function capacitor(C: number, f: number): Complex {
  return { re: 0, im: -1 / (2 * Math.PI * f * C) };
}

/** Per-unit-area constants of the electrode–skin interface, referred to 1 cm² of contact. */
export interface InterfaceParams {
  /** parallel resistance × area, Ω·cm² (dominated by the epidermis / stratum corneum) */
  RpA: number;
  /** parallel capacitance per area, F/cm² */
  CpA: number;
  /** series (gel, sweat, deep tissue) resistance × area, Ω·cm² */
  RsA: number;
}

/** Electrode impedance (Ω) for a contact area `areaCm2` at frequency f: R_s + (R_p ∥ C_p), scaled by area. */
export function contactImpedance(p: InterfaceParams, areaCm2: number, f: number): Complex {
  const A = Math.max(areaCm2, 1e-6);
  return add(parallelRC(p.RpA / A, p.CpA * A, f), { re: p.RsA / A, im: 0 });
}

export const EPS0 = 8.8541878128e-12; // F/m, vacuum permittivity

/** Capacitance (F) of a parallel-plate gap: area in cm², gap in metres, relative permittivity epsr. */
export function gapCapacitance(areaCm2: number, gapM: number, epsr: number): number {
  return (EPS0 * epsr * areaCm2 * 1e-4) / Math.max(gapM, 1e-9);
}

export interface GapModel {
  /** fraction of the electrode area in direct dry contact (pins through hair); the rest couples capacitively */
  contactFraction: number;
  gapM: number;
  epsr: number;
}

/**
 * Impedance of an electrode that touches the skin over a fraction of its area and couples through a
 * hair/air gap over the rest: the two paths are in parallel.
 */
export function gapElectrodeImpedance(dry: InterfaceParams, areaCm2: number, g: GapModel, f: number): Complex {
  const aContact = areaCm2 * g.contactFraction;
  const aGap = areaCm2 * (1 - g.contactFraction);
  const paths: Complex[] = [];
  if (aContact > 1e-9) paths.push(contactImpedance(dry, aContact, f));
  if (aGap > 1e-9) paths.push(add(capacitor(gapCapacitance(aGap, g.gapM, g.epsr), f), contactImpedance(dry, aGap, f)));
  return paths.reduce((acc, z) => parallel(acc, z));
}

/** Amplifier input impedance R_in ∥ C_in. */
export function inputImpedance(Rin: number, Cin: number, f: number): Complex {
  return parallelRC(Rin, Cin, f);
}

/** Fraction of the scalp potential that reaches the amplifier: |Z_in / (Z_in + Z_e)|. */
export function transferFraction(Ze: Complex, Zin: Complex): number {
  return cabs(div(Zin, add(Zin, Ze)));
}

/**
 * Common-mode → differential conversion by electrode-impedance imbalance ("potential divider effect",
 * Metting van Rijn et al. 1990): V_dm ≈ V_cm · |ΔZ_e / Z_in| for |Z_e| ≪ |Z_in|.
 */
export function cmToDm(Vcm: number, dZe: Complex, Zin: Complex): number {
  return Vcm * cabs(div(dZe, Zin));
}

export const BOLTZMANN = 1.380649e-23; // J/K

/** Thermal (Johnson–Nyquist) noise, V rms, from the resistive part of Z over bandwidth df at temperature T. */
export function thermalNoise(Rohm: number, dfHz: number, T = 310): number {
  return Math.sqrt(4 * BOLTZMANN * T * Math.max(Rohm, 0) * dfHz);
}
