/**
 * R's `round()` uses round-half-to-even. The official PCPTRC rounds
 * probabilities to the nearest percent with that rule, then sets the
 * high-grade percent to whatever is left so the three integers sum to 100.
 * See riskcalc.R (ClevelandClinicQHS/riskcalc-website, PCPTRC).
 */
export function roundHalfToEven(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot round a non-finite number.");
  }
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const floor = Math.floor(absolute);
  const fraction = absolute - floor;
  let rounded: number;
  if (Math.abs(fraction - 0.5) < 1e-8) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(absolute);
  }
  return sign * rounded;
}

export interface OfficialPercentDisplay {
  noCancer: number;
  lowGrade: number;
  highGrade: number;
}

export function officialThreeWayPercents(
  probabilityNoCancer: number,
  probabilityLowGrade: number,
): OfficialPercentDisplay {
  const noCancer = roundHalfToEven(probabilityNoCancer * 100);
  const lowGrade = roundHalfToEven(probabilityLowGrade * 100);
  const highGrade = 100 - noCancer - lowGrade;
  return { noCancer, lowGrade, highGrade };
}
