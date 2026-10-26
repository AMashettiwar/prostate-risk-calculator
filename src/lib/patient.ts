/**
 * Shared input record. Every model reads this same object and ignores the
 * fields it does not use. Null means "not recorded", which is different from
 * a recorded negative.
 */
export type RaceCategory = "african_american" | "white" | "hispanic" | "other";

export type PiRadsScore = 1 | 2 | 3 | 4 | 5;

export type DreVolumeClassCc = 25 | 40 | 60;

export interface PatientInputs {
  /** Published calculators do not apply after a prostate cancer diagnosis. */
  priorProstateCancerDiagnosis: boolean | null;
  /**
   * PCPTRC is specified for a PSA and a DRE from the past year.
   * Null means the user has not answered.
   */
  psaAndDreWithinPastYear: boolean | null;
  ageYears: number | null;
  psaNgMl: number | null;
  race: RaceCategory | null;
  /** Father, brother, or son. Null means unknown or not recorded. */
  familyHistoryFirstDegree: boolean | null;
  /** Suspicious means a nodule or area of firmness. Null means not recorded. */
  dreSuspicious: boolean | null;
  /** One or more prior biopsies, all negative. Null means unknown. */
  priorNegativeBiopsy: boolean | null;
  /**
   * ERSPC equations differ for a first screen and a later screen.
   * Null means unknown. A prior negative biopsy implies the repeat equation.
   */
  priorScreening: boolean | null;
  prostateVolumeCc: number | null;
  /**
   * DRE size class used by the ERSPC appendix when a continuous volume is
   * not available: 25, 40, or 60 cc.
   */
  dreVolumeClassCc: DreVolumeClassCc | null;
  /** Percent free PSA, already a percent (10 means 10%, not 0.10). */
  percentFreePsa: number | null;
  piRads: PiRadsScore | null;
}

export function emptyPatient(): PatientInputs {
  return {
    priorProstateCancerDiagnosis: null,
    psaAndDreWithinPastYear: null,
    ageYears: null,
    psaNgMl: null,
    race: null,
    familyHistoryFirstDegree: null,
    dreSuspicious: null,
    priorNegativeBiopsy: null,
    priorScreening: null,
    prostateVolumeCc: null,
    dreVolumeClassCc: null,
    percentFreePsa: null,
    piRads: null,
  };
}

export function raceLabel(race: RaceCategory): string {
  switch (race) {
    case "african_american":
      return "African American";
    case "white":
      return "White";
    case "hispanic":
      return "Hispanic";
    case "other":
      return "Other";
  }
}

/** PCPTRC 2.0 has a coefficient only for African American versus everyone else. */
export function africanAmericanIndicator(race: RaceCategory): 0 | 1 {
  return race === "african_american" ? 1 : 0;
}
