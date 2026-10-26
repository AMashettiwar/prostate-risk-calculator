import { describe, expect, it } from "vitest";
import { emptyPatient, type PatientInputs } from "@/lib/patient";
import {
  brokenRc3LinearPredictor,
  erspcDre,
  erspcLinearPredictor,
  erspcVolumeClass,
  logistic,
} from "@/lib/models/erspc-dre";

function patient(overrides: Partial<PatientInputs>): PatientInputs {
  return {
    ...emptyPatient(),
    priorProstateCancerDiagnosis: false,
    ...overrides,
  };
}

describe("ERSPC volume classes and published linear predictors", () => {
  it("recodes TRUS volume at the published boundaries", () => {
    expect(erspcVolumeClass(29.999)).toBe(25);
    expect(erspcVolumeClass(30)).toBe(40);
    expect(erspcVolumeClass(49.999)).toBe(40);
    expect(erspcVolumeClass(50)).toBe(60);
  });

  it("reproduces a hand evaluation of DRE-volume RC #3 at PSA 4, class 40, normal DRE", () => {
    // log2(4) - 2 = 0, so the PSA term drops out.
    // log2(40) - 5.4 = -0.078071905112637
    // lp = -1.826 - 1.50 * that value = -1.7088921423310435
    const lp = erspcLinearPredictor({
      variant: "dre-volume-rc3",
      psaNgMl: 4,
      dreSuspicious: false,
      priorNegativeBiopsy: false,
      volumeClassCc: 40,
    });
    expect(lp).toBeCloseTo(-1.7088921423310435, 12);
    expect(logistic(lp)).toBeCloseTo(0.1533074652123016, 12);

    const result = erspcDre.predict(
      patient({
        psaNgMl: 4,
        dreSuspicious: false,
        priorNegativeBiopsy: false,
        priorScreening: false,
        prostateVolumeCc: 40,
      }),
    );
    const anyCancer = result.outcomes.find((outcome) => outcome.id === "any_cancer");
    const significant = result.outcomes.find((outcome) => outcome.id === "clinically_significant");
    expect(result.ok).toBe(true);
    expect(anyCancer?.probability).toBeCloseTo(0.1533074652123016, 12);
    expect(significant?.probability).toBeNull();
    expect(result.variant).toMatch(/RC #3/);
  });

  it("reproduces further appendix evaluations, including the PSA + DRE fallback", () => {
    expect(
      logistic(
        erspcLinearPredictor({
          variant: "dre-volume-rc3",
          psaNgMl: 6,
          dreSuspicious: true,
          priorNegativeBiopsy: false,
          volumeClassCc: 25,
        }),
      ),
    ).toBeCloseTo(0.7107886342859058, 12);

    expect(
      logistic(
        erspcLinearPredictor({
          variant: "dre-volume-rc3",
          psaNgMl: 3,
          dreSuspicious: false,
          priorNegativeBiopsy: false,
          volumeClassCc: 60,
        }),
      ),
    ).toBeCloseTo(0.0469164463077428, 12);

    expect(
      logistic(
        erspcLinearPredictor({
          variant: "dre-volume-rc45",
          psaNgMl: 5,
          dreSuspicious: false,
          priorNegativeBiopsy: true,
          volumeClassCc: 40,
        }),
      ),
    ).toBeCloseTo(0.12875453390312966, 12);

    expect(
      logistic(
        erspcLinearPredictor({
          variant: "psa-dre-rc3",
          psaNgMl: 4,
          dreSuspicious: false,
          priorNegativeBiopsy: false,
        }),
      ),
    ).toBeCloseTo(0.14893227954233965, 12);

    expect(
      logistic(
        erspcLinearPredictor({
          variant: "psa-dre-rc45",
          psaNgMl: 3,
          dreSuspicious: false,
          priorNegativeBiopsy: true,
        }),
      ),
    ).toBeCloseTo(0.09634717123759634, 12);

    const fallback = erspcDre.predict(
      patient({
        psaNgMl: 4,
        dreSuspicious: false,
        priorNegativeBiopsy: false,
        priorScreening: false,
      }),
    );
    expect(fallback.variant).toMatch(/PSA \+ DRE/);
    expect(fallback.outcomes.find((outcome) => outcome.id === "any_cancer")?.probability).toBeCloseTo(
      0.14893227954233965,
      12,
    );
  });

  it("does not use the literal broken RC #3 volume term", () => {
    const broken = brokenRc3LinearPredictor({
      psaNgMl: 4,
      dreSuspicious: false,
      volumeClassCc: 40,
    });
    expect(logistic(broken)).toBeLessThan(1e-6);
    const used = erspcLinearPredictor({
      variant: "dre-volume-rc3",
      psaNgMl: 4,
      dreSuspicious: false,
      priorNegativeBiopsy: false,
      volumeClassCc: 40,
    });
    expect(logistic(used)).toBeGreaterThan(0.1);
  });
});

describe("ERSPC routing and validation", () => {
  it("treats a prior negative biopsy as the repeat-screen equation even if screening is marked no", () => {
    const result = erspcDre.predict(
      patient({
        psaNgMl: 5,
        dreSuspicious: true,
        priorNegativeBiopsy: true,
        priorScreening: false,
        dreVolumeClassCc: 40,
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.variant).toMatch(/RC #4\/5/);
    expect(result.outcomes.find((outcome) => outcome.id === "any_cancer")?.probability).toBeCloseTo(
      logistic(
        erspcLinearPredictor({
          variant: "dre-volume-rc45",
          psaNgMl: 5,
          dreSuspicious: true,
          priorNegativeBiopsy: true,
          volumeClassCc: 40,
        }),
      ),
      12,
    );
  });

  it("uses RC #4/5 with prior biopsy coded 0 on a repeat screen", () => {
    const result = erspcDre.predict(
      patient({
        psaNgMl: 5,
        dreSuspicious: true,
        priorNegativeBiopsy: false,
        priorScreening: true,
        dreVolumeClassCc: 40,
      }),
    );
    expect(result.variant).toMatch(/RC #4\/5/);
    expect(result.outcomes.find((outcome) => outcome.id === "any_cancer")?.probability).toBeCloseTo(
      0.3967942606392783,
      12,
    );
  });

  it("requires DRE, prior-biopsy status, and screening status when there is no prior biopsy", () => {
    const missingDre = erspcDre.predict(
      patient({
        psaNgMl: 4,
        dreSuspicious: null,
        priorNegativeBiopsy: false,
        priorScreening: false,
      }),
    );
    expect(missingDre.ok).toBe(false);
    expect(missingDre.issues.some((issue) => issue.field === "dreSuspicious")).toBe(true);

    const missingScreen = erspcDre.predict(
      patient({
        psaNgMl: 4,
        dreSuspicious: false,
        priorNegativeBiopsy: false,
        priorScreening: null,
      }),
    );
    expect(missingScreen.ok).toBe(false);
    expect(missingScreen.issues.some((issue) => issue.field === "priorScreening")).toBe(true);
  });

  it("rejects a non-positive PSA or volume and warns when age is outside the Rotterdam span", () => {
    const psa = erspcDre.predict(
      patient({
        psaNgMl: 0,
        dreSuspicious: false,
        priorNegativeBiopsy: false,
        priorScreening: false,
      }),
    );
    expect(psa.ok).toBe(false);

    const volume = erspcDre.predict(
      patient({
        psaNgMl: 4,
        dreSuspicious: false,
        priorNegativeBiopsy: false,
        priorScreening: false,
        prostateVolumeCc: -5,
      }),
    );
    expect(volume.ok).toBe(false);

    const young = erspcDre.predict(
      patient({
        ageYears: 45,
        psaNgMl: 4,
        dreSuspicious: false,
        priorNegativeBiopsy: false,
        priorScreening: false,
        prostateVolumeCc: 40,
      }),
    );
    expect(young.ok).toBe(true);
    expect(young.issues.some((issue) => issue.field === "ageYears" && issue.severity === "warning")).toBe(
      true,
    );
    const older = erspcDre.predict(
      patient({
        ageYears: 66,
        psaNgMl: 4,
        dreSuspicious: false,
        priorNegativeBiopsy: false,
        priorScreening: false,
        prostateVolumeCc: 40,
      }),
    );
    expect(older.outcomes.find((outcome) => outcome.id === "any_cancer")?.probability).toBeCloseTo(
      young.outcomes.find((outcome) => outcome.id === "any_cancer")?.probability ?? -1,
      12,
    );
  });

  it("ignores race, family history, percent free PSA, and PI-RADS", () => {
    const result = erspcDre.predict(
      patient({
        psaNgMl: 4,
        dreSuspicious: true,
        priorNegativeBiopsy: false,
        priorScreening: false,
        race: "african_american",
        familyHistoryFirstDegree: true,
        percentFreePsa: 12,
        piRads: 4,
        ageYears: 66,
      }),
    );
    expect(result.ok).toBe(true);
    for (const label of ["Race", "Family history", "Percent free PSA", "PI-RADS"]) {
      expect(result.inputsNotUsed.some((row) => row.label === label)).toBe(true);
    }
  });

  it("warns for a volume outside the span of the published tables and still recodes it", () => {
    const result = erspcDre.predict(
      patient({
        psaNgMl: 4,
        dreSuspicious: false,
        priorNegativeBiopsy: false,
        priorScreening: false,
        prostateVolumeCc: 300,
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.issues.some((issue) => issue.field === "prostateVolumeCc")).toBe(true);
    expect(result.inputsUsed.some((row) => row.value.includes("class 60"))).toBe(true);
  });
});
