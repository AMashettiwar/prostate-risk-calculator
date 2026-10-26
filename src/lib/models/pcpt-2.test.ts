import { describe, expect, it } from "vitest";
import { emptyPatient, type PatientInputs } from "@/lib/patient";
import {
  applyPercentFreePsaUpdate,
  pcpt20,
  pcptBaseProbabilities,
} from "@/lib/models/pcpt-2";

function patient(overrides: Partial<PatientInputs>): PatientInputs {
  return {
    ...emptyPatient(),
    priorProstateCancerDiagnosis: false,
    psaAndDreWithinPastYear: true,
    ...overrides,
  };
}

describe("PCPTRC 2.0 published illustrations", () => {
  it("reproduces Ankerst 2014 commentary case A (11% low-grade, 3% high-grade)", () => {
    // Urology 2014 commentary: PSA 3.8, age 55, prior negative biopsy, no family
    // history, Caucasian. DRE is not stated. A normal DRE is the assumption that
    // matches the printed percents. Raw probabilities are the official riskcalc.R
    // full-precision coefficients, not the three-decimal slide rounding.
    const base = pcptBaseProbabilities({
      psaNgMl: 3.8,
      ageYears: 55,
      africanAmerican: 0,
      priorNegativeBiopsy: true,
      dreSuspicious: false,
      familyHistoryFirstDegree: false,
    });
    expect(base.noCancer).toBeCloseTo(0.8587356793564125, 12);
    expect(base.lowGrade).toBeCloseTo(0.10943032000551811, 12);
    expect(base.highGrade).toBeCloseTo(0.0318340006380694, 12);

    const result = pcpt20.predict(
      patient({
        ageYears: 55,
        psaNgMl: 3.8,
        race: "white",
        priorNegativeBiopsy: true,
        dreSuspicious: false,
        familyHistoryFirstDegree: false,
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.officialIntegerPercents).toEqual({
      noCancer: 86,
      lowGrade: 11,
      highGrade: 3,
    });
  });

  it("reproduces Ankerst 2014 commentary case B (22% and 22%)", () => {
    const result = pcpt20.predict(
      patient({
        ageYears: 73,
        psaNgMl: 3.8,
        race: "african_american",
        priorNegativeBiopsy: false,
        dreSuspicious: false,
        familyHistoryFirstDegree: true,
      }),
    );
    expect(result.ok).toBe(true);
    const high = result.outcomes.find((outcome) => outcome.id === "clinically_significant");
    const low = result.outcomes.find((outcome) => outcome.id === "low_grade");
    expect(low?.probability).toBeCloseTo(0.22446749726419218, 12);
    expect(high?.probability).toBeCloseTo(0.21492631526726053, 12);
    expect(result.officialIntegerPercents).toEqual({
      noCancer: 56,
      lowGrade: 22,
      highGrade: 22,
    });
  });

  it("reproduces Ankerst 2014 commentary case C (8% low-grade and under 1% high-grade)", () => {
    const result = pcpt20.predict(
      patient({
        ageYears: 55,
        psaNgMl: 0.4,
        race: "white",
        priorNegativeBiopsy: false,
        dreSuspicious: true,
        familyHistoryFirstDegree: false,
      }),
    );
    expect(result.ok).toBe(true);
    const high = result.outcomes.find((outcome) => outcome.id === "clinically_significant");
    const low = result.outcomes.find((outcome) => outcome.id === "low_grade");
    expect(low?.probability).toBeCloseTo(0.0771074285480776, 12);
    expect(high?.probability).toBeCloseTo(0.006366197288861355, 10);
    expect((high?.probability ?? 1) < 0.01).toBe(true);
    expect(result.officialIntegerPercents).toEqual({
      noCancer: 92,
      lowGrade: 8,
      highGrade: 0,
    });
  });
});

describe("PCPTRC 2.0 missing covariates use the published refits", () => {
  it("drops DRE and uses the prior/family refit", () => {
    const base = pcptBaseProbabilities({
      psaNgMl: 3.8,
      ageYears: 55,
      africanAmerican: 0,
      priorNegativeBiopsy: true,
      dreSuspicious: null,
      familyHistoryFirstDegree: false,
    });
    expect(base.coefficientKey).toBe("101");
    expect(base.noCancer).toBeCloseTo(0.8565344594054092, 12);
    expect(base.lowGrade).toBeCloseTo(0.1080077143675481, 12);
    expect(base.highGrade).toBeCloseTo(0.03545782622704273, 12);

    const result = pcpt20.predict(
      patient({
        ageYears: 55,
        psaNgMl: 3.8,
        race: "white",
        priorNegativeBiopsy: true,
        dreSuspicious: null,
        familyHistoryFirstDegree: false,
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.variant).toMatch(/DRE not recorded/);
  });

  it("uses the core PSA/age/race refit when history is not recorded", () => {
    const base = pcptBaseProbabilities({
      psaNgMl: 1.5,
      ageYears: 62,
      africanAmerican: 0,
      priorNegativeBiopsy: null,
      dreSuspicious: null,
      familyHistoryFirstDegree: null,
    });
    expect(base.coefficientKey).toBe("000");
    expect(base.noCancer).toBeCloseTo(0.8416388811942018, 12);
    expect(base.lowGrade).toBeCloseTo(0.13528619238056128, 12);
    expect(base.highGrade).toBeCloseTo(0.023074926425236897, 12);
  });

  it("covers the remaining published refit rows", () => {
    const priorOnly = pcptBaseProbabilities({
      psaNgMl: 5,
      ageYears: 68,
      africanAmerican: 0,
      priorNegativeBiopsy: true,
      dreSuspicious: null,
      familyHistoryFirstDegree: null,
    });
    expect(priorOnly.noCancer).toBeCloseTo(0.7758797085052483, 12);
    expect(priorOnly.highGrade).toBeCloseTo(0.08209816271185003, 12);

    const dreOnly = pcptBaseProbabilities({
      psaNgMl: 2.5,
      ageYears: 60,
      africanAmerican: 1,
      priorNegativeBiopsy: null,
      dreSuspicious: true,
      familyHistoryFirstDegree: null,
    });
    expect(dreOnly.coefficientKey).toBe("010");
    expect(dreOnly.highGrade).toBeCloseTo(0.11917494518681487, 12);

    const familyOnly = pcptBaseProbabilities({
      psaNgMl: 1.2,
      ageYears: 58,
      africanAmerican: 0,
      priorNegativeBiopsy: null,
      dreSuspicious: null,
      familyHistoryFirstDegree: true,
    });
    expect(familyOnly.coefficientKey).toBe("001");
    expect(familyOnly.noCancer).toBeCloseTo(0.8360483106965748, 12);
  });
});

describe("PCPTRC 2.0 percent free PSA update", () => {
  it("matches the official likelihood-ratio normalization on the case A prior", () => {
    const base = pcptBaseProbabilities({
      psaNgMl: 3.8,
      ageYears: 55,
      africanAmerican: 0,
      priorNegativeBiopsy: true,
      dreSuspicious: false,
      familyHistoryFirstDegree: false,
    });
    const updated = applyPercentFreePsaUpdate({
      psaNgMl: 3.8,
      percentFreePsa: 10,
      noCancer: base.noCancer,
      lowGrade: base.lowGrade,
      highGrade: base.highGrade,
    });
    expect(updated.noCancer).toBeCloseTo(0.5622702587638642, 12);
    expect(updated.lowGrade).toBeCloseTo(0.31633203280480354, 12);
    expect(updated.highGrade).toBeCloseTo(0.12139770843133224, 12);
    expect(updated.noCancer + updated.lowGrade + updated.highGrade).toBeCloseTo(1, 12);

    const result = pcpt20.predict(
      patient({
        ageYears: 55,
        psaNgMl: 3.8,
        race: "white",
        priorNegativeBiopsy: true,
        dreSuspicious: false,
        familyHistoryFirstDegree: false,
        percentFreePsa: 25,
      }),
    );
    const noCancer = result.outcomes.find((outcome) => outcome.id === "no_cancer");
    expect(noCancer?.probability).toBeCloseTo(0.9006820380812517, 12);
    expect(result.variant).toMatch(/free PSA/);
  });
});

describe("PCPTRC 2.0 validation", () => {
  const ready: Partial<PatientInputs> = {
    ageYears: 60,
    psaNgMl: 4,
    race: "hispanic",
    priorNegativeBiopsy: false,
    dreSuspicious: false,
    familyHistoryFirstDegree: false,
  };

  it("refuses ages outside 55–90 and PSA outside (0, 50]", () => {
    for (const ageYears of [54, 91]) {
      const result = pcpt20.predict(patient({ ...ready, ageYears }));
      expect(result.ok).toBe(false);
      expect(result.outcomes.every((outcome) => outcome.probability === null)).toBe(true);
      expect(result.issues.some((issue) => issue.field === "ageYears" && issue.severity === "error")).toBe(
        true,
      );
    }
    for (const psaNgMl of [0, -1, 50.1]) {
      const result = pcpt20.predict(patient({ ...ready, psaNgMl }));
      expect(result.ok).toBe(false);
      expect(result.issues.some((issue) => issue.field === "psaNgMl")).toBe(true);
    }
  });

  it("warns and still calculates when PSA is above the development cap of 10", () => {
    const edge = pcpt20.predict(patient({ ...ready, psaNgMl: 10 }));
    expect(edge.ok).toBe(true);
    expect(edge.issues.some((issue) => issue.field === "psaNgMl")).toBe(false);

    const above = pcpt20.predict(patient({ ...ready, psaNgMl: 10.1 }));
    expect(above.ok).toBe(true);
    expect(
      above.issues.some((issue) => issue.field === "psaNgMl" && issue.severity === "warning"),
    ).toBe(true);
    const high = above.outcomes.find((outcome) => outcome.id === "clinically_significant");
    expect(high?.probability).not.toBeNull();
  });

  it("refuses percent free PSA outside 5–75 and warns inside the tool window but outside the fitted sample", () => {
    const low = pcpt20.predict(patient({ ...ready, percentFreePsa: 4.9 }));
    expect(low.ok).toBe(false);
    const edge = pcpt20.predict(patient({ ...ready, percentFreePsa: 5 }));
    expect(edge.ok).toBe(true);
    expect(edge.issues.some((issue) => issue.severity === "warning" && issue.field === "percentFreePsa")).toBe(
      true,
    );
    const inside = pcpt20.predict(patient({ ...ready, percentFreePsa: 18 }));
    expect(inside.ok).toBe(true);
    expect(inside.issues.some((issue) => issue.field === "percentFreePsa")).toBe(false);
  });

  it("codes Hispanic as the reference group and refuses a prior cancer diagnosis", () => {
    const hispanic = pcpt20.predict(patient(ready));
    const africanAmerican = pcpt20.predict(patient({ ...ready, race: "african_american" }));
    const hispanicHigh = hispanic.outcomes.find((outcome) => outcome.id === "clinically_significant");
    const africanAmericanHigh = africanAmerican.outcomes.find(
      (outcome) => outcome.id === "clinically_significant",
    );
    expect(hispanic.inputsUsed.some((row) => row.value.includes("indicator 0"))).toBe(true);
    expect((africanAmericanHigh?.probability ?? 0) > (hispanicHigh?.probability ?? 1)).toBe(true);

    const diagnosed = pcpt20.predict(patient({ ...ready, priorProstateCancerDiagnosis: true }));
    expect(diagnosed.ok).toBe(false);
  });

  it("does not apply PI-RADS or volume", () => {
    const result = pcpt20.predict(patient({ ...ready, piRads: 5, prostateVolumeCc: 40 }));
    expect(result.ok).toBe(true);
    expect(result.inputsNotUsed.some((row) => row.label === "PI-RADS")).toBe(true);
    expect(result.inputsNotUsed.some((row) => row.label === "Prostate volume")).toBe(true);
  });

  it("keeps the three base probabilities on a simplex", () => {
    const base = pcptBaseProbabilities({
      psaNgMl: 6.5,
      ageYears: 70,
      africanAmerican: 1,
      priorNegativeBiopsy: true,
      dreSuspicious: true,
      familyHistoryFirstDegree: true,
    });
    expect(base.noCancer + base.lowGrade + base.highGrade).toBeCloseTo(1, 12);
  });
});
