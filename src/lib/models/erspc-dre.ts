import type { DreVolumeClassCc, PatientInputs } from "@/lib/patient";
import type { ModelIssue, ModelResult, OutcomeEstimate, RiskModel } from "@/lib/models/types";

/**
 * Rotterdam / ERSPC DRE-based risk calculators for any cancer on biopsy.
 *
 * Source of the equations: Roobol MJ et al., World Journal of Urology
 * 2012;30:149-155, open-access appendix "Formulas used to calculate volume
 * classes and the DRE ERSPC RC risks", citing Roobol et al., Eur Urol 2012,
 * the paper that built the DRE-volume calculators.
 * https://pmc.ncbi.nlm.nih.gov/articles/PMC3321270/
 *
 * Volume classes (TRUS cc, or a DRE estimate mapped onto the same three classes):
 *   < 30 cc -> 25,  30 to < 50 cc -> 40,  >= 50 cc -> 60.
 *
 * PSA + DRE, no volume, not previously biopsied (the appendix's priorscreening = 0 model):
 *   lp = -1.743 + 0.788 * (log2(PSA) - 2) + 1.105 * DRE
 *
 * PSA + DRE, previously biopsied / screened:
 *   lp = -1.315 - 0.899 * priorBiopsy
 *        + (0.421 - 0.362 * priorBiopsy) * (log2(PSA) - 2)
 *        + 0.726 * DRE
 *
 * DRE-volume RC #3, not previously screened:
 *   lp = -1.826 + 1.024 * (log2(PSA) - 2)
 *        - 1.50 * (log2(volume class) - 5.4)
 *        + 0.992 * DRE
 *
 * DRE-volume RC #4/5, previously screened and/or biopsied:
 *   lp = -1.470 - 0.677 * priorBiopsy
 *        + (0.576 - 0.423 * priorBiopsy) * (log2(PSA) - 2)
 *        - 1.043 * (log2(volume class) - 5.5)
 *        + 0.68 * DRE
 *
 * The printed RC #3 volume term in that appendix is garbled:
 *   -1.50 * (log2(volumeclasses)/lg10(2)) - 5.4)
 * with a parenthesis that does not close, and a division by log10(2) after an
 * already base-2 log. The same appendix defines log2(x) = log(x)/log(2) and
 * prints the parallel RC #4/5 term cleanly as (log2(volume class) - 5.5).
 * Dividing log2(volume) by log10(2) again sends the linear predictor to about
 * -20 and the probability to essentially zero, which is not a usable risk.
 * This file uses (log2(volume class) - 5.4). That is a correction of a
 * typesetting error, not a new coefficient.
 *
 * High-grade / clinically significant cancer (stage > T2b and/or Gleason >= 7)
 * was an endpoint of the 2012 Eur Urol development paper, but the open appendix
 * does not print that second equation. It is not estimated here.
 *
 * Probability of any cancer = 1 / (1 + exp(-lp)). Probability of no cancer is
 * the complement. Age, race, family history, %free PSA, and PI-RADS do not
 * appear in these equations.
 */

export type ErspcVariant =
  | "dre-volume-rc3"
  | "dre-volume-rc45"
  | "psa-dre-rc3"
  | "psa-dre-rc45";

export function erspcVolumeClass(volumeCc: number): DreVolumeClassCc {
  if (volumeCc < 30) return 25;
  if (volumeCc < 50) return 40;
  return 60;
}

export function erspcLinearPredictor(args: {
  variant: ErspcVariant;
  psaNgMl: number;
  dreSuspicious: boolean;
  priorNegativeBiopsy: boolean;
  volumeClassCc?: DreVolumeClassCc;
}): number {
  const centeredLogPsa = Math.log2(args.psaNgMl) - 2;
  const dre = args.dreSuspicious ? 1 : 0;
  const prior = args.priorNegativeBiopsy ? 1 : 0;

  switch (args.variant) {
    case "psa-dre-rc3":
      return -1.743 + 0.788 * centeredLogPsa + 1.105 * dre;
    case "psa-dre-rc45":
      return (
        -1.315 -
        0.899 * prior +
        (0.421 - 0.362 * prior) * centeredLogPsa +
        0.726 * dre
      );
    case "dre-volume-rc3": {
      if (args.volumeClassCc === undefined) {
        throw new Error("DRE-volume RC #3 requires a volume class.");
      }
      return (
        -1.826 +
        1.024 * centeredLogPsa -
        1.5 * (Math.log2(args.volumeClassCc) - 5.4) +
        0.992 * dre
      );
    }
    case "dre-volume-rc45": {
      if (args.volumeClassCc === undefined) {
        throw new Error("DRE-volume RC #4/5 requires a volume class.");
      }
      return (
        -1.47 -
        0.677 * prior +
        (0.576 - 0.423 * prior) * centeredLogPsa -
        1.043 * (Math.log2(args.volumeClassCc) - 5.5) +
        0.68 * dre
      );
    }
  }
}

export function logistic(linearPredictor: number): number {
  return 1 / (1 + Math.exp(-linearPredictor));
}

/**
 * Literal reading of the broken RC #3 volume term. Exported so a test can
 * show that we do not use it. Not called by predict().
 */
export function brokenRc3LinearPredictor(args: {
  psaNgMl: number;
  dreSuspicious: boolean;
  volumeClassCc: DreVolumeClassCc;
}): number {
  const centeredLogPsa = Math.log2(args.psaNgMl) - 2;
  const dre = args.dreSuspicious ? 1 : 0;
  return (
    -1.826 +
    1.024 * centeredLogPsa -
    1.5 * (Math.log2(args.volumeClassCc) / Math.log10(2) - 5.4) +
    0.992 * dre
  );
}

function chooseVariant(args: {
  previouslyInScreeningPathway: boolean;
  hasVolume: boolean;
}): ErspcVariant {
  if (args.hasVolume) {
    return args.previouslyInScreeningPathway ? "dre-volume-rc45" : "dre-volume-rc3";
  }
  return args.previouslyInScreeningPathway ? "psa-dre-rc45" : "psa-dre-rc3";
}

function variantTitle(variant: ErspcVariant, volumeClass: DreVolumeClassCc | null): string {
  switch (variant) {
    case "dre-volume-rc3":
      return `DRE-volume ERSPC RC #3, first screen, volume class ${volumeClass} cc`;
    case "dre-volume-rc45":
      return `DRE-volume ERSPC RC #4/5, previously screened or biopsied, volume class ${volumeClass} cc`;
    case "psa-dre-rc3":
      return "PSA + DRE model for a first screen. Volume was not supplied, so the published equation that omits volume is used.";
    case "psa-dre-rc45":
      return "PSA + DRE model for someone previously screened or biopsied. Volume was not supplied, so the published equation that omits volume is used.";
  }
}

function outcomes(probabilityAnyCancer: number | null, reason?: string): OutcomeEstimate[] {
  return [
    {
      id: "clinically_significant",
      label: "Clinically significant cancer",
      detail:
        "The 2012 development paper defined high-grade as stage > T2b and/or Gleason score ≥ 7.",
      probability: null,
      unavailableReason:
        reason ??
        "The open 2012 appendix prints the any-cancer equation only. The high-grade coefficients were not published there, so this endpoint is not estimated.",
    },
    {
      id: "any_cancer",
      label: "Any cancer on biopsy",
      detail: "Biopsy-detectable prostate cancer, any grade, from the published logistic equation.",
      probability: probabilityAnyCancer,
      unavailableReason: probabilityAnyCancer === null ? "The ERSPC equation was not run." : undefined,
    },
    {
      id: "no_cancer",
      label: "No cancer on biopsy",
      detail: "Complement of the any-cancer probability.",
      probability: probabilityAnyCancer === null ? null : 1 - probabilityAnyCancer,
      unavailableReason: probabilityAnyCancer === null ? "The ERSPC equation was not run." : undefined,
    },
  ];
}

function ignored(inputs: PatientInputs, volumeNote: string | null): ModelResult["inputsNotUsed"] {
  const rows: ModelResult["inputsNotUsed"] = [];
  if (inputs.ageYears !== null) {
    rows.push({
      label: "Age",
      value: "Not a covariate in the published DRE-volume or PSA + DRE equations.",
    });
  }
  if (inputs.race !== null) {
    rows.push({
      label: "Race",
      value: "Not a covariate in these ERSPC equations.",
    });
  }
  if (inputs.familyHistoryFirstDegree !== null) {
    rows.push({
      label: "Family history",
      value: "Not a covariate in these biopsy equations. A separate 4-year future-risk model uses it, and that model's coefficients are not published in full here.",
    });
  }
  if (inputs.percentFreePsa !== null) {
    rows.push({
      label: "Percent free PSA",
      value: "Not in the 2012 DRE-volume appendix.",
    });
  }
  if (inputs.piRads !== null) {
    rows.push({
      label: "PI-RADS",
      value:
        "The current SWOP MRI calculator does not publish its coefficients. PI-RADS was not used.",
    });
  }
  if (volumeNote) {
    rows.push({ label: "Volume entry", value: volumeNote });
  }
  if (inputs.psaAndDreWithinPastYear !== null) {
    rows.push({
      label: "PSA and DRE within the past year",
      value: "Not an input to this equation. The underlying screens used the PSA and DRE from that visit.",
    });
  }
  return rows;
}

export const erspcDre: RiskModel = {
  metadata: {
    id: "erspc-dre-2012",
    name: "Rotterdam ERSPC DRE risk calculator",
    shortName: "ERSPC DRE",
    predicts:
      "Chance that a prostate biopsy finds any prostate cancer. Clinically significant cancer is not estimated, because that equation was not published in full.",
    developmentCohort:
      "ERSPC Rotterdam. The DRE-volume calculator was developed on 3,624 men never previously biopsied (RC #3; 885 cancers) and 2,896 men at repeat screening (RC #4/5; 547 cancers). Biopsies in the development era were mainly sextant. Volume was TRUS volume recoded to 25, 40, or 60 cc so a DRE size estimate could stand in for it.",
    validationCohort:
      "A 322-man ERSPC Rotterdam validation cohort screened in 2010–2011 (Roobol et al., Eur Urol 2012), then six Prostate Biopsy Collaborative Group cohorts in Roobol et al., World J Urol 2012 (Göteborg rounds 1 and 2–6, Rotterdam rounds 1 and 2–3, Tyrol, and Cleveland Clinic). Calibration was poor in the Cleveland Clinic clinical cohort, which used more biopsy cores.",
    limitations: [
      "The number is the chance of any cancer on biopsy in a European screening population, not the chance of grade group 2 or higher disease.",
      "Development biopsies were mostly six-core. Centers that take 10 or more cores find more cancer than these equations expect. The Cleveland Clinic validation showed systematic underprediction.",
      "Prostate volume is collapsed to three classes. A 31 cc gland and a 49 cc gland get the same class.",
      "Age, race, and family history are not in the equation. Two men with the same PSA, DRE, volume class, and biopsy history get the same result at any age.",
      "The RC #3 volume term is reconstructed from a broken equation in the open appendix. See the equation block. Do not treat this as the SWOP website's current MRI or cribriform calculator.",
      "No threshold printed here is a recommendation to biopsy.",
    ],
    citations: [
      {
        authors: "Roobol MJ, van Vugt HA, Loeb S, et al.",
        title:
          "Prediction of prostate cancer risk: the role of prostate volume and digital rectal examination in the ERSPC risk calculators.",
        source: "Eur Urol. 2012;61(3):577-583.",
        year: 2012,
        href: "https://pubmed.ncbi.nlm.nih.gov/22104592/",
      },
      {
        authors: "Roobol MJ, Schröder FH, Hugosson J, et al.",
        title:
          "Importance of prostate volume in the European Randomised Study of Screening for Prostate Cancer (ERSPC) risk calculators: results from the prostate biopsy collaborative group.",
        source: "World J Urol. 2012;30(2):149-155. Appendix with formulas.",
        year: 2012,
        href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3321270/",
      },
    ],
  },
  predict(inputs: PatientInputs): ModelResult {
    const issues: ModelIssue[] = [];

    if (inputs.priorProstateCancerDiagnosis === true) {
      issues.push({
        severity: "error",
        field: "priorProstateCancerDiagnosis",
        message:
          "These ERSPC equations estimate the chance of cancer on biopsy in men not already diagnosed with prostate cancer.",
      });
    } else if (inputs.priorProstateCancerDiagnosis === null) {
      issues.push({
        severity: "error",
        field: "priorProstateCancerDiagnosis",
        message: "Confirm that there is no previous prostate cancer diagnosis.",
      });
    }

    if (inputs.psaNgMl === null || !Number.isFinite(inputs.psaNgMl)) {
      issues.push({
        severity: "error",
        field: "psaNgMl",
        message: "Enter PSA in ng/mL.",
      });
    } else if (inputs.psaNgMl <= 0) {
      issues.push({
        severity: "error",
        field: "psaNgMl",
        message: "PSA has to be greater than 0. The equation takes a logarithm.",
      });
    }

    if (inputs.dreSuspicious === null) {
      issues.push({
        severity: "error",
        field: "dreSuspicious",
        message:
          "DRE is required. The published ERSPC equations have no refit for a missing rectal exam.",
      });
    }

    if (inputs.priorNegativeBiopsy === null) {
      issues.push({
        severity: "error",
        field: "priorNegativeBiopsy",
        message:
          "Prior negative biopsy is required. It chooses RC #3 versus RC #4/5 and, on a repeat screen, enters the equation.",
      });
    } else if (inputs.priorNegativeBiopsy === false && inputs.priorScreening === null) {
      issues.push({
        severity: "error",
        field: "priorScreening",
        message:
          "Say whether this is a first screen or a later screen. The published equations differ, and a missing screening history is not imputed.",
      });
    }

    let volumeClass: DreVolumeClassCc | null = null;
    let volumeSource: "measured" | "class" | "absent" = "absent";
    let volumeNote: string | null = null;

    if (inputs.prostateVolumeCc !== null) {
      if (!Number.isFinite(inputs.prostateVolumeCc) || inputs.prostateVolumeCc <= 0) {
        issues.push({
          severity: "error",
          field: "prostateVolumeCc",
          message: "Prostate volume, if entered, has to be a positive number of cc.",
        });
      } else {
        volumeClass = erspcVolumeClass(inputs.prostateVolumeCc);
        volumeSource = "measured";
        if (inputs.prostateVolumeCc < 10 || inputs.prostateVolumeCc > 250) {
          issues.push({
            severity: "warning",
            field: "prostateVolumeCc",
            message:
              "This volume is outside the span of most glands in the published validation tables (about 10–250 cc). It is still recoded to a volume class.",
          });
        }
        if (inputs.dreVolumeClassCc !== null) {
          volumeNote =
            "A DRE volume class was also selected. The measured volume was classified and the class control was not used.";
        }
      }
    } else if (inputs.dreVolumeClassCc !== null) {
      volumeClass = inputs.dreVolumeClassCc;
      volumeSource = "class";
    }

    if (
      inputs.ageYears !== null &&
      Number.isFinite(inputs.ageYears) &&
      (inputs.ageYears < 55 || inputs.ageYears > 75)
    ) {
      issues.push({
        severity: "warning",
        field: "ageYears",
        message:
          "Age is not in this equation, so the number does not change with age. The Rotterdam development cohorts were men about 55–75 years old.",
      });
    }

    if (issues.some((issue) => issue.severity === "error")) {
      return {
        modelId: erspcDre.metadata.id,
        ok: false,
        issues,
        outcomes: outcomes(null, "The ERSPC equation was not run."),
        inputsUsed: [],
        inputsNotUsed: ignored(inputs, volumeNote),
        variant: "Not calculated",
        equationLines: [],
      };
    }

    const previouslyInScreeningPathway =
      inputs.priorNegativeBiopsy === true || inputs.priorScreening === true;
    const variant = chooseVariant({
      previouslyInScreeningPathway,
      hasVolume: volumeClass !== null,
    });
    const linearPredictor = erspcLinearPredictor({
      variant,
      psaNgMl: inputs.psaNgMl as number,
      dreSuspicious: inputs.dreSuspicious as boolean,
      priorNegativeBiopsy: inputs.priorNegativeBiopsy === true,
      volumeClassCc: volumeClass ?? undefined,
    });
    const anyCancer = logistic(linearPredictor);

    const inputsUsed: ModelResult["inputsUsed"] = [
      { label: "PSA", value: `${inputs.psaNgMl} ng/mL` },
      {
        label: "DRE suspicious",
        value: inputs.dreSuspicious ? "Yes (coded 1)" : "No (coded 0)",
      },
      {
        label: "Prior negative biopsy",
        value: inputs.priorNegativeBiopsy ? "Yes (coded 1)" : "No (coded 0)",
      },
      {
        label: "Previously screened",
        value:
          inputs.priorNegativeBiopsy === true
            ? inputs.priorScreening === null
              ? "Not asked separately. A prior negative biopsy selects the repeat-screen equation."
              : inputs.priorScreening
                ? "Yes. The repeat-screen equation is used."
                : "Marked no, but a prior negative biopsy still selects the repeat-screen equation."
            : inputs.priorScreening
              ? "Yes. The repeat-screen equation is used with prior biopsy coded 0."
              : "No. The first-screen equation is used.",
      },
      { label: "Previous prostate cancer diagnosis", value: "No" },
    ];

    if (volumeSource === "measured") {
      inputsUsed.push({
        label: "Prostate volume",
        value: `${inputs.prostateVolumeCc} cc, recoded to class ${volumeClass} cc`,
      });
    } else if (volumeSource === "class") {
      inputsUsed.push({
        label: "Prostate volume class",
        value: `${volumeClass} cc (DRE size class, not a measured volume)`,
      });
    } else {
      inputsUsed.push({
        label: "Prostate volume",
        value: "Not supplied. The PSA + DRE equation from the same appendix is used.",
      });
    }

    const equationLines = [
      variantTitle(variant, volumeClass),
      "log2 is the base-2 logarithm. DRE and prior biopsy are 1 or 0.",
      "P(any cancer) = 1 / (1 + exp(−linear predictor)). P(no cancer) = 1 − that.",
    ];
    if (variant === "dre-volume-rc3") {
      equationLines.push(
        "lp = −1.826 + 1.024·(log2(PSA) − 2) − 1.50·(log2(volume class) − 5.4) + 0.992·DRE",
        "The volume term is (log2(class) − 5.4). The appendix's RC #3 line is missing a parenthesis and divides by log10(2) after log2; that literal line is not used. RC #4/5 in the same appendix is the pattern followed here.",
      );
    } else if (variant === "dre-volume-rc45") {
      equationLines.push(
        "lp = −1.470 − 0.677·prior biopsy + (0.576 − 0.423·prior biopsy)·(log2(PSA) − 2) − 1.043·(log2(volume class) − 5.5) + 0.68·DRE",
      );
    } else if (variant === "psa-dre-rc3") {
      equationLines.push(
        "lp = −1.743 + 0.788·(log2(PSA) − 2) + 1.105·DRE",
      );
    } else {
      equationLines.push(
        "lp = −1.315 − 0.899·prior biopsy + (0.421 − 0.362·prior biopsy)·(log2(PSA) − 2) + 0.726·DRE",
      );
    }
    equationLines.push(
      `Linear predictor for this entry: ${linearPredictor.toFixed(6)}.`,
      "Clinically significant cancer is not calculated. Those coefficients are not in the open appendix.",
    );

    return {
      modelId: erspcDre.metadata.id,
      ok: true,
      issues,
      outcomes: outcomes(anyCancer),
      inputsUsed,
      inputsNotUsed: ignored(inputs, volumeNote),
      variant: variantTitle(variant, volumeClass),
      equationLines,
    };
  },
};
