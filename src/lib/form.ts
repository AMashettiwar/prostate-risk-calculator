import {
  emptyPatient,
  type DreVolumeClassCc,
  type PatientInputs,
  type PiRadsScore,
  type RaceCategory,
} from "@/lib/patient";

export type YesNo = "" | "yes" | "no";
export type YesNoUnknown = "" | "yes" | "no" | "unknown";

export interface CalculatorFormState {
  priorProstateCancerDiagnosis: YesNo;
  psaAndDreWithinPastYear: YesNo;
  ageYears: string;
  psaNgMl: string;
  race: "" | RaceCategory;
  familyHistoryFirstDegree: YesNoUnknown;
  dreSuspicious: YesNoUnknown;
  priorNegativeBiopsy: YesNoUnknown;
  priorScreening: YesNoUnknown;
  prostateVolumeCc: string;
  dreVolumeClassCc: "" | "25" | "40" | "60";
  percentFreePsa: string;
  piRads: "" | "1" | "2" | "3" | "4" | "5";
}

export interface ParseIssue {
  field: keyof CalculatorFormState;
  message: string;
}

export function blankForm(): CalculatorFormState {
  return {
    priorProstateCancerDiagnosis: "",
    psaAndDreWithinPastYear: "",
    ageYears: "",
    psaNgMl: "",
    race: "",
    familyHistoryFirstDegree: "",
    dreSuspicious: "",
    priorNegativeBiopsy: "",
    priorScreening: "",
    prostateVolumeCc: "",
    dreVolumeClassCc: "",
    percentFreePsa: "",
    piRads: "",
  };
}

function yesNo(value: YesNo): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function yesNoUnknown(value: YesNoUnknown): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function readNumber(
  raw: string,
  field: keyof CalculatorFormState,
  label: string,
  issues: ParseIssue[],
): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    issues.push({ field, message: `${label} has to be a number.` });
    return null;
  }
  return value;
}

export function toPatient(form: CalculatorFormState): {
  inputs: PatientInputs;
  issues: ParseIssue[];
} {
  const issues: ParseIssue[] = [];
  const inputs = emptyPatient();
  inputs.priorProstateCancerDiagnosis = yesNo(form.priorProstateCancerDiagnosis);
  inputs.psaAndDreWithinPastYear = yesNo(form.psaAndDreWithinPastYear);
  inputs.ageYears = readNumber(form.ageYears, "ageYears", "Age", issues);
  inputs.psaNgMl = readNumber(form.psaNgMl, "psaNgMl", "PSA", issues);
  inputs.race = form.race === "" ? null : form.race;
  inputs.familyHistoryFirstDegree = yesNoUnknown(form.familyHistoryFirstDegree);
  inputs.dreSuspicious = yesNoUnknown(form.dreSuspicious);
  inputs.priorNegativeBiopsy = yesNoUnknown(form.priorNegativeBiopsy);
  inputs.priorScreening = yesNoUnknown(form.priorScreening);
  inputs.prostateVolumeCc = readNumber(
    form.prostateVolumeCc,
    "prostateVolumeCc",
    "Prostate volume",
    issues,
  );
  inputs.dreVolumeClassCc =
    form.dreVolumeClassCc === ""
      ? null
      : (Number(form.dreVolumeClassCc) as DreVolumeClassCc);
  inputs.percentFreePsa = readNumber(
    form.percentFreePsa,
    "percentFreePsa",
    "Percent free PSA",
    issues,
  );
  inputs.piRads = form.piRads === "" ? null : (Number(form.piRads) as PiRadsScore);
  return { inputs, issues };
}

export interface PublishedIllustration {
  id: string;
  label: string;
  detail: string;
  form: CalculatorFormState;
}

/**
 * Three numerical illustrations from the commentary of Ankerst et al.,
 * Urology 2014. Cases A and B do not state the DRE. A normal DRE is what
 * reproduces the printed percents with the official coefficients.
 */
export const publishedIllustrations: PublishedIllustration[] = [
  {
    id: "ankerst-a",
    label: "Case A · 11% and 3%",
    detail:
      "55 years, PSA 3.8 ng/mL, prior negative biopsy, no family history, not African American. The commentary does not state the DRE. A normal DRE reproduces the printed 11% low-grade and 3% high-grade.",
    form: {
      ...blankForm(),
      priorProstateCancerDiagnosis: "no",
      psaAndDreWithinPastYear: "yes",
      ageYears: "55",
      psaNgMl: "3.8",
      race: "white",
      familyHistoryFirstDegree: "no",
      dreSuspicious: "no",
      priorNegativeBiopsy: "yes",
      priorScreening: "yes",
    },
  },
  {
    id: "ankerst-b",
    label: "Case B · 22% and 22%",
    detail:
      "73 years, PSA 3.8 ng/mL, African American, family history, no prior biopsy. A normal DRE, which the commentary does not state, reproduces 22% for both low-grade and high-grade.",
    form: {
      ...blankForm(),
      priorProstateCancerDiagnosis: "no",
      psaAndDreWithinPastYear: "yes",
      ageYears: "73",
      psaNgMl: "3.8",
      race: "african_american",
      familyHistoryFirstDegree: "yes",
      dreSuspicious: "no",
      priorNegativeBiopsy: "no",
      priorScreening: "no",
    },
  },
  {
    id: "ankerst-c",
    label: "Case C · 8% and <1%",
    detail:
      "55 years, PSA 0.4 ng/mL, White, prostate nodule, no other risk factors. The commentary reports about 8% low-grade and under 1% high-grade.",
    form: {
      ...blankForm(),
      priorProstateCancerDiagnosis: "no",
      psaAndDreWithinPastYear: "yes",
      ageYears: "55",
      psaNgMl: "0.4",
      race: "white",
      familyHistoryFirstDegree: "no",
      dreSuspicious: "yes",
      priorNegativeBiopsy: "no",
      priorScreening: "no",
    },
  },
];
