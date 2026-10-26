import type { PatientInputs } from "@/lib/patient";

export type OutcomeId =
  | "no_cancer"
  | "any_cancer"
  | "low_grade"
  | "clinically_significant";

export interface OutcomeEstimate {
  id: OutcomeId;
  label: string;
  detail: string;
  /** Null when this model does not publish an equation for the endpoint. */
  probability: number | null;
  unavailableReason?: string;
}

export interface ModelIssue {
  severity: "error" | "warning";
  field?: keyof PatientInputs | "form";
  message: string;
}

export interface LabeledValue {
  label: string;
  value: string;
}

export interface Citation {
  authors: string;
  title: string;
  source: string;
  year: number;
  href?: string;
}

export interface ModelMetadata {
  id: string;
  name: string;
  shortName: string;
  /** What a probability from this model is a probability of. */
  predicts: string;
  developmentCohort: string;
  validationCohort: string;
  limitations: string[];
  citations: Citation[];
}

export interface ModelResult {
  modelId: string;
  ok: boolean;
  /** False when every required input was present but at least one was outside range. */
  issues: ModelIssue[];
  outcomes: OutcomeEstimate[];
  inputsUsed: LabeledValue[];
  inputsNotUsed: LabeledValue[];
  /** Which published specification was applied, including missing-data handling. */
  variant: string;
  equationLines: string[];
  /**
   * Integer percents matching the official PCPTRC display, when this model
   * is PCPTRC and the result is valid. High-grade is the remainder.
   */
  officialIntegerPercents?: {
    noCancer: number;
    lowGrade: number;
    highGrade: number;
  };
}

/**
 * Phase 2 models implement this same interface and are added to the registry.
 * `predict` is a pure function: same inputs, same result, no clock and no I/O.
 */
export interface RiskModel {
  metadata: ModelMetadata;
  predict(inputs: PatientInputs): ModelResult;
}
