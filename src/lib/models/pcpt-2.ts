import {
  africanAmericanIndicator,
  raceLabel,
  type PatientInputs,
  type RaceCategory,
} from "@/lib/patient";
import { officialThreeWayPercents } from "@/lib/round";
import type {
  ModelIssue,
  ModelResult,
  OutcomeEstimate,
  RiskModel,
} from "@/lib/models/types";

/**
 * PCPTRC 2.0 nominal logistic model.
 *
 * Coefficients are the full-precision values used by the official calculator
 * source, not the three-decimal rounding in lecture slides:
 * https://github.com/ClevelandClinicQHS/riskcalc-website/blob/main/PCPTRC/riskcalc.R
 * (header dated 17 September 2014; six-variable branch and the seven reduced
 * refits for a missing prior-biopsy, DRE, or family-history indicator).
 *
 * The three-decimal form of the same equation is also printed in Ankerst's
 * "Towards institution- and investigator-specific self-updating risk
 * calculators" notes. Odds ratios in Ankerst et al., Urology 2014;83:1362-7
 * (PMC4035700), Table 2, match these coefficients (exp(beta) rounds to the
 * published odds ratio).
 *
 * Outcomes, relative to no cancer on biopsy:
 *   L  low-grade (Gleason score < 7)
 *   H  high-grade (Gleason score >= 7; grade group >= 2)
 *   P(no) = 1 / (1 + e^L + e^H)
 *   P(low) = e^L / (1 + e^L + e^H)
 *   P(high) = e^H / (1 + e^L + e^H)
 *
 * log2(PSA) is the base-2 logarithm, so the PSA coefficient is the change in
 * log-odds for a doubling of PSA.
 */

const FULL = {
  low: [-3.00215469, 0.2561339, 0.01643637, 0.12172599, -0.45533257, -0.03864628, 0.27197219],
  high: [-7.05304534, 0.70489441, 0.04753804, 1.04174529, -0.21409933, 0.40068434, 0.22467348],
} as const;

/**
 * Keys are prior / DRE / family history, 1 = recorded, 0 = not recorded.
 * Vector order matches riskcalc.R: intercept, log2(PSA), age, African American,
 * then whichever of prior biopsy, DRE, family history were recorded, in that order.
 */
const REDUCED: Record<string, { low: number[]; high: number[] }> = {
  "111": { low: [...FULL.low], high: [...FULL.high] },
  "110": {
    low: [-2.89648245, 0.25904098, 0.01559192, 0.11996693, -0.45444, -0.03729244],
    high: [-6.96119633, 0.70674359, 0.04676393, 1.0393772, -0.21100921, 0.40319606],
  },
  "101": {
    low: [-3.01529063, 0.25578861, 0.01654912, 0.12327661, -0.45825158, 0.27183869],
    high: [-6.94522156, 0.7063726, 0.04697087, 1.02065099, -0.18320006, 0.23044734],
  },
  "100": {
    low: [-2.90917471, 0.25872451, 0.01570165, 0.12141077, -0.45729181],
    high: [-6.85264083, 0.70797314, 0.04621214, 1.01887797, -0.17972927],
  },
  "011": {
    low: [-2.90933651, 0.23803667, 0.01447269, 0.11443251, -0.06592322, 0.27128248],
    high: [-6.99449483, 0.69530025, 0.04637911, 1.03847001, 0.38651649, 0.22287791],
  },
  "010": {
    low: [-2.80429793, 0.24127801, 0.01363705, 0.11165777, -0.06487585],
    high: [-6.90681925, 0.69720305, 0.04566552, 1.03622425, 0.38925765],
  },
  "001": {
    low: [-2.92983751, 0.23714373, 0.01463232, 0.1176543, 0.27095959],
    high: [-6.90439295, 0.69799874, 0.0460813, 1.01787561, 0.22913998],
  },
  "000": {
    low: [-2.81814489, 0.2404437, 0.01370219, 0.12000825],
    high: [-6.8424997, 0.70043815, 0.0457446, 1.01699029],
  },
};

/** Normal linear regression of log2(%free PSA) on log2(PSA), from riskcalc.R. */
const FREE_PSA = {
  high: { intercept: 4.8059009, log2Psa: -0.3483031, sd: 0.6452902 },
  low: { intercept: 4.9730353, log2Psa: -0.3856204, sd: 0.6010974 },
  no: { intercept: 4.9602101, log2Psa: -0.2195069, sd: 0.5154306 },
} as const;

/** Sample range stated in the riskcalc.R comment for the %free PSA regression. */
export const FREE_PSA_FITTED_RANGE = { min: 5.495801, max: 72.955864 } as const;

/** Bounds enforced by the official calculator interface (messages_en.r). */
export const PCPT_AGE_RANGE = { min: 55, max: 90 } as const;
export const PCPT_PSA_RANGE = { minExclusive: 0, max: 50 } as const;
export const PCPT_DEVELOPMENT_PSA_MAX = 10;

export interface PcptProbabilities {
  noCancer: number;
  lowGrade: number;
  highGrade: number;
  logitLow: number;
  logitHigh: number;
  coefficientKey: string;
}

function dot(coefficients: number[], row: number[]): number {
  if (coefficients.length !== row.length) {
    throw new Error("PCPT design row does not match the coefficient vector.");
  }
  return coefficients.reduce((sum, coefficient, index) => sum + coefficient * row[index], 0);
}

function normalDensity(x: number, mean: number, sd: number): number {
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

export function pcptCoefficientKey(inputs: {
  priorNegativeBiopsy: boolean | null;
  dreSuspicious: boolean | null;
  familyHistoryFirstDegree: boolean | null;
}): string {
  const prior = inputs.priorNegativeBiopsy === null ? "0" : "1";
  const dre = inputs.dreSuspicious === null ? "0" : "1";
  const family = inputs.familyHistoryFirstDegree === null ? "0" : "1";
  return `${prior}${dre}${family}`;
}

/**
 * Base PCPTRC 2.0 probabilities before the optional %free PSA update.
 * PSA must be positive. Indicators that are null are omitted and the matching
 * refit from riskcalc.R is used.
 */
export function pcptBaseProbabilities(args: {
  psaNgMl: number;
  ageYears: number;
  africanAmerican: 0 | 1;
  priorNegativeBiopsy: boolean | null;
  dreSuspicious: boolean | null;
  familyHistoryFirstDegree: boolean | null;
}): PcptProbabilities {
  const key = pcptCoefficientKey(args);
  const coefficients = REDUCED[key];
  const row = [1, Math.log2(args.psaNgMl), args.ageYears, args.africanAmerican];
  if (args.priorNegativeBiopsy !== null) row.push(args.priorNegativeBiopsy ? 1 : 0);
  if (args.dreSuspicious !== null) row.push(args.dreSuspicious ? 1 : 0);
  if (args.familyHistoryFirstDegree !== null) {
    row.push(args.familyHistoryFirstDegree ? 1 : 0);
  }
  const logitLow = dot(coefficients.low, row);
  const logitHigh = dot(coefficients.high, row);
  const expLow = Math.exp(logitLow);
  const expHigh = Math.exp(logitHigh);
  const denominator = 1 + expLow + expHigh;
  const noCancer = 1 / denominator;
  const lowGrade = expLow / denominator;
  const highGrade = expHigh / denominator;
  return {
    noCancer,
    lowGrade,
    highGrade,
    logitLow,
    logitHigh,
    coefficientKey: key,
  };
}

/**
 * Likelihood-ratio update from riskcalc.R (11 March 2014 block).
 * The official code converts each class-versus-complement odds separately,
 * then sets high-grade to the remainder. This function does the same thing.
 */
export function applyPercentFreePsaUpdate(args: {
  psaNgMl: number;
  percentFreePsa: number;
  noCancer: number;
  lowGrade: number;
  highGrade: number;
}): { noCancer: number; lowGrade: number; highGrade: number } {
  const log2Psa = Math.log2(args.psaNgMl);
  const log2Free = Math.log2(args.percentFreePsa);
  const densityHigh = normalDensity(
    log2Free,
    FREE_PSA.high.intercept + FREE_PSA.high.log2Psa * log2Psa,
    FREE_PSA.high.sd,
  );
  const densityLow = normalDensity(
    log2Free,
    FREE_PSA.low.intercept + FREE_PSA.low.log2Psa * log2Psa,
    FREE_PSA.low.sd,
  );
  const densityNo = normalDensity(
    log2Free,
    FREE_PSA.no.intercept + FREE_PSA.no.log2Psa * log2Psa,
    FREE_PSA.no.sd,
  );
  // riskcalc.R also computes an odds for high-grade, then discards it and sets
  // high-grade to the remainder of the low-grade and no-cancer probabilities.
  const oddsLow =
    (args.lowGrade * densityLow) /
    (args.noCancer * densityNo + args.highGrade * densityHigh);
  const oddsNo =
    (args.noCancer * densityNo) /
    (args.lowGrade * densityLow + args.highGrade * densityHigh);
  const lowGrade = oddsLow / (oddsLow + 1);
  const noCancer = oddsNo / (oddsNo + 1);
  return {
    noCancer,
    lowGrade,
    highGrade: 1 - lowGrade - noCancer,
  };
}

function yesNoUnknown(value: boolean | null): string {
  if (value === null) return "Not recorded";
  return value ? "Yes" : "No";
}

function raceCoding(race: RaceCategory): string {
  if (race === "african_american") return "African American (indicator 1)";
  return `${raceLabel(race)} (indicator 0; not African American)`;
}

function variantLabel(key: string, freePsa: boolean): string {
  const missing: string[] = [];
  if (key[0] === "0") missing.push("prior biopsy");
  if (key[1] === "0") missing.push("DRE");
  if (key[2] === "0") missing.push("family history");
  const base =
    missing.length === 0
      ? "Full six-variable PCPTRC 2.0"
      : `Reduced PCPTRC 2.0 refit with ${missing.join(", ")} not recorded`;
  return freePsa ? `${base}, then the %free PSA likelihood-ratio update` : base;
}

function blocked(
  issues: ModelIssue[],
  inputsUsed: ModelResult["inputsUsed"],
  inputsNotUsed: ModelResult["inputsNotUsed"],
): ModelResult {
  return {
    modelId: pcpt20.metadata.id,
    ok: false,
    issues,
    outcomes: unavailableOutcomes(),
    inputsUsed,
    inputsNotUsed,
    variant: "Not calculated",
    equationLines: [],
  };
}

function unavailableOutcomes(): OutcomeEstimate[] {
  return [
    {
      id: "clinically_significant",
      label: "High-grade cancer (Gleason score ≥ 7)",
      detail: "Grade group 2 or higher. The 2014 paper calls this high-grade disease.",
      probability: null,
      unavailableReason: "PCPTRC 2.0 was not run.",
    },
    {
      id: "low_grade",
      label: "Low-grade cancer (Gleason score < 7)",
      detail: "Grade group 1.",
      probability: null,
      unavailableReason: "PCPTRC 2.0 was not run.",
    },
    {
      id: "any_cancer",
      label: "Any cancer on biopsy",
      detail: "Low-grade plus high-grade.",
      probability: null,
      unavailableReason: "PCPTRC 2.0 was not run.",
    },
    {
      id: "no_cancer",
      label: "No cancer on biopsy",
      detail: "Benign biopsy.",
      probability: null,
      unavailableReason: "PCPTRC 2.0 was not run.",
    },
  ];
}

function collectIgnored(inputs: PatientInputs): ModelResult["inputsNotUsed"] {
  const ignored: ModelResult["inputsNotUsed"] = [];
  if (inputs.prostateVolumeCc !== null || inputs.dreVolumeClassCc !== null) {
    ignored.push({
      label: "Prostate volume",
      value: "Not a covariate in PCPTRC 2.0. It was not used.",
    });
  }
  if (inputs.priorScreening !== null) {
    ignored.push({
      label: "Prior screening round",
      value: "PCPTRC 2.0 uses prior negative biopsy, not a separate screening-round indicator.",
    });
  }
  if (inputs.piRads !== null) {
    ignored.push({
      label: "PI-RADS",
      value:
        "PCPTRC 2.0 has no published PI-RADS coefficient. The score was not used.",
    });
  }
  return ignored;
}

export const pcpt20: RiskModel = {
  metadata: {
    id: "pcpt-2.0",
    name: "PCPT Risk Calculator 2.0",
    shortName: "PCPTRC 2.0",
    predicts:
      "Chance that a prostate biopsy finds no cancer, low-grade cancer (Gleason score < 7), or high-grade cancer (Gleason score ≥ 7).",
    developmentCohort:
      "6,664 placebo-arm biopsies from 5,826 men in the Prostate Cancer Prevention Trial. PSA and DRE were within one year of biopsy and PSA was at most 10 ng/mL. About 80% of biopsies were six-core. Most men were White. The %free PSA update was fit on 537 SABOR participants, not on the PCPT sera.",
    validationCohort:
      "External validation without %free PSA on ten Prostate Biopsy Collaborative Group cohorts. External validation with %free PSA on an Early Detection Research Network biopsy set (Beth Israel Deaconess, University of Michigan, and UT Health San Antonio).",
    limitations: [
      "This is a chance of what a biopsy would show, not a lifetime risk, a stage, or a survival estimate.",
      "No risk threshold in the source paper is a recommendation to biopsy or not to biopsy.",
      "Most development biopsies took six cores. A biopsy with more cores can find more cancer than this model expects.",
      "The African American coefficient is the only race term. White, Hispanic, and other races share the reference category.",
      "Men entered the PCPT at age 55 or older with PSA at most 3 ng/mL and a normal DRE. Applying the result outside screened men of that kind is an extrapolation, even when the official tool still returns a number.",
      "The %free PSA update merges a higher-risk SABOR cohort with the PCPT prior. The authors asked for further external validation of that update.",
      "The official tool notes that a newer PBCG calculator has since been offered as a replacement. This page implements PCPTRC 2.0, not PBCG.",
    ],
    citations: [
      {
        authors: "Ankerst DP, Hoefler J, Bock S, et al.",
        title:
          "Prostate Cancer Prevention Trial risk calculator 2.0 for the prediction of low- vs high-grade prostate cancer.",
        source: "Urology. 2014;83(6):1362-1367.",
        year: 2014,
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4035700/",
      },
      {
        authors: "Thompson IM, Ankerst DP, Chi C, et al.",
        title: "Assessing prostate cancer risk: results from the Prostate Cancer Prevention Trial.",
        source: "J Natl Cancer Inst. 2006;98(8):529-534.",
        year: 2006,
        href: "https://doi.org/10.1093/jnci/djj131",
      },
      {
        authors: "UT Health San Antonio / Cleveland Clinic QHS",
        title: "Official PCPTRC source (riskcalc.R), including full-precision coefficients and missing-covariate refits.",
        source: "github.com/ClevelandClinicQHS/riskcalc-website, path PCPTRC/riskcalc.R",
        year: 2014,
        href: "https://github.com/ClevelandClinicQHS/riskcalc-website/blob/main/PCPTRC/riskcalc.R",
      },
    ],
  },
  predict(inputs: PatientInputs): ModelResult {
    const issues: ModelIssue[] = [];
    const inputsUsed: ModelResult["inputsUsed"] = [];
    const inputsNotUsed = collectIgnored(inputs);

    if (inputs.priorProstateCancerDiagnosis === true) {
      issues.push({
        severity: "error",
        field: "priorProstateCancerDiagnosis",
        message:
          "PCPTRC is only for someone who has not already been diagnosed with prostate cancer.",
      });
    } else if (inputs.priorProstateCancerDiagnosis === null) {
      issues.push({
        severity: "error",
        field: "priorProstateCancerDiagnosis",
        message: "Confirm that there is no previous prostate cancer diagnosis.",
      });
    }

    if (inputs.psaAndDreWithinPastYear === false) {
      issues.push({
        severity: "error",
        field: "psaAndDreWithinPastYear",
        message:
          "The published calculator applies when both the PSA and the DRE are less than one year old.",
      });
    } else if (inputs.psaAndDreWithinPastYear === null) {
      issues.push({
        severity: "error",
        field: "psaAndDreWithinPastYear",
        message: "Confirm that the PSA and the DRE are both from the past year.",
      });
    }

    if (inputs.ageYears === null || !Number.isFinite(inputs.ageYears)) {
      issues.push({
        severity: "error",
        field: "ageYears",
        message: "Enter age in years.",
      });
    } else if (
      inputs.ageYears < PCPT_AGE_RANGE.min ||
      inputs.ageYears > PCPT_AGE_RANGE.max
    ) {
      issues.push({
        severity: "error",
        field: "ageYears",
        message:
          "The official PCPTRC accepts ages from 55 through 90 years and does not return a risk outside that range.",
      });
    }

    if (inputs.psaNgMl === null || !Number.isFinite(inputs.psaNgMl)) {
      issues.push({
        severity: "error",
        field: "psaNgMl",
        message: "Enter PSA in ng/mL.",
      });
    } else if (inputs.psaNgMl <= PCPT_PSA_RANGE.minExclusive || inputs.psaNgMl > PCPT_PSA_RANGE.max) {
      issues.push({
        severity: "error",
        field: "psaNgMl",
        message:
          "The official PCPTRC accepts PSA greater than 0 and at most 50 ng/mL. Zero is not a valid PSA.",
      });
    } else if (inputs.psaNgMl > PCPT_DEVELOPMENT_PSA_MAX) {
      issues.push({
        severity: "warning",
        field: "psaNgMl",
        message:
          "The PCPTRC 2.0 development biopsies were limited to PSA at most 10 ng/mL. The official tool still accepts values up to 50, so this result is outside the fitted sample.",
      });
    }

    if (inputs.race === null) {
      issues.push({
        severity: "error",
        field: "race",
        message: "Race is required. The equation only separates African American from all other groups.",
      });
    }

    if (inputs.percentFreePsa !== null) {
      if (
        !Number.isFinite(inputs.percentFreePsa) ||
        inputs.percentFreePsa < 5 ||
        inputs.percentFreePsa > 75
      ) {
        issues.push({
          severity: "error",
          field: "percentFreePsa",
          message:
            "The official PCPTRC accepts percent free PSA from 5 through 75. Leave it blank to use the base model.",
        });
      } else if (
        inputs.percentFreePsa < FREE_PSA_FITTED_RANGE.min ||
        inputs.percentFreePsa > FREE_PSA_FITTED_RANGE.max
      ) {
        issues.push({
          severity: "warning",
          field: "percentFreePsa",
          message: `The %free PSA regression in the official source was fit from ${FREE_PSA_FITTED_RANGE.min} to ${FREE_PSA_FITTED_RANGE.max}. This value is inside the tool's 5–75 window and outside that fitted sample.`,
        });
      }
    }

    if (issues.some((issue) => issue.severity === "error")) {
      return blocked(issues, inputsUsed, inputsNotUsed);
    }

    const ageYears = inputs.ageYears as number;
    const psaNgMl = inputs.psaNgMl as number;
    const race = inputs.race as RaceCategory;
    const base = pcptBaseProbabilities({
      psaNgMl,
      ageYears,
      africanAmerican: africanAmericanIndicator(race),
      priorNegativeBiopsy: inputs.priorNegativeBiopsy,
      dreSuspicious: inputs.dreSuspicious,
      familyHistoryFirstDegree: inputs.familyHistoryFirstDegree,
    });

    let noCancer = base.noCancer;
    let lowGrade = base.lowGrade;
    let highGrade = base.highGrade;
    const useFree = inputs.percentFreePsa !== null;
    if (useFree) {
      const updated = applyPercentFreePsaUpdate({
        psaNgMl,
        percentFreePsa: inputs.percentFreePsa as number,
        noCancer,
        lowGrade,
        highGrade,
      });
      noCancer = updated.noCancer;
      lowGrade = updated.lowGrade;
      highGrade = updated.highGrade;
    }

    inputsUsed.push(
      { label: "Age", value: `${ageYears} years` },
      { label: "PSA", value: `${psaNgMl} ng/mL` },
      { label: "Race coding", value: raceCoding(race) },
      { label: "Prior negative biopsy", value: yesNoUnknown(inputs.priorNegativeBiopsy) },
      { label: "DRE suspicious", value: yesNoUnknown(inputs.dreSuspicious) },
      {
        label: "First-degree family history",
        value: yesNoUnknown(inputs.familyHistoryFirstDegree),
      },
      {
        label: "PSA and DRE within the past year",
        value: "Yes",
      },
      {
        label: "Previous prostate cancer diagnosis",
        value: "No",
      },
    );
    if (useFree) {
      inputsUsed.push({
        label: "Percent free PSA",
        value: `${inputs.percentFreePsa}%`,
      });
    }

    const equationLines = [
      "Base model, log-odds versus no cancer. log2 is the base-2 log of PSA in ng/mL.",
      "Indicators are 1 or 0. AA is 1 only for African American.",
    ];
    if (base.coefficientKey === "111") {
      equationLines.push(
        "L = −3.00215469 + 0.25613390·log2(PSA) + 0.01643637·age + 0.12172599·AA − 0.45533257·prior biopsy − 0.03864628·DRE + 0.27197219·family history",
        "H = −7.05304534 + 0.70489441·log2(PSA) + 0.04753804·age + 1.04174529·AA − 0.21409933·prior biopsy + 0.40068434·DRE + 0.22467348·family history",
      );
    } else {
      const coefficients = REDUCED[base.coefficientKey];
      equationLines.push(
        `Recorded-covariate code ${base.coefficientKey} (prior, DRE, family history). Low-grade coefficients: ${coefficients.low.join(", ")}.`,
        `High-grade coefficients: ${coefficients.high.join(", ")}.`,
        "Vector order: intercept, log2(PSA), age, African American, then prior biopsy, DRE, and family history only if that item was recorded.",
      );
    }
    equationLines.push(
      "P(no cancer) = 1 / (1 + exp(L) + exp(H))",
      "P(low-grade) = exp(L) / (1 + exp(L) + exp(H))",
      "P(high-grade) = exp(H) / (1 + exp(L) + exp(H))",
    );
    if (useFree) {
      equationLines.push(
        "Percent free PSA update, as in riskcalc.R: normal densities of log2(%free PSA) given log2(PSA), separately for no cancer, low-grade, and high-grade, applied as class-versus-complement odds. High-grade is then the remainder so the three probabilities sum to 1.",
        `No-cancer mean = 4.9602101 − 0.2195069·log2(PSA), sd 0.5154306.`,
        `Low-grade mean = 4.9730353 − 0.3856204·log2(PSA), sd 0.6010974.`,
        `High-grade mean = 4.8059009 − 0.3483031·log2(PSA), sd 0.6452902.`,
      );
    }

    const official = officialThreeWayPercents(noCancer, lowGrade);

    const outcomes: OutcomeEstimate[] = [
      {
        id: "clinically_significant",
        label: "High-grade cancer (Gleason score ≥ 7)",
        detail:
          "Grade group 2 or higher. In the 2014 paper this endpoint is called high-grade (Gleason grade ≥ 7).",
        probability: highGrade,
      },
      {
        id: "low_grade",
        label: "Low-grade cancer (Gleason score < 7)",
        detail: "Grade group 1.",
        probability: lowGrade,
      },
      {
        id: "any_cancer",
        label: "Any cancer on biopsy",
        detail: "Low-grade plus high-grade. The official display does not lead with this sum.",
        probability: lowGrade + highGrade,
      },
      {
        id: "no_cancer",
        label: "No cancer on biopsy",
        detail: "Benign biopsy.",
        probability: noCancer,
      },
    ];

    return {
      modelId: pcpt20.metadata.id,
      ok: true,
      issues,
      outcomes,
      inputsUsed,
      inputsNotUsed,
      variant: variantLabel(base.coefficientKey, useFree),
      equationLines,
      officialIntegerPercents:
        official.highGrade >= 0
          ? official
          : undefined,
    };
  },
};
