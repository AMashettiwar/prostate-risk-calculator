import { describe, expect, it } from "vitest";
import { getModel, models } from "@/lib/models/registry";
import { emptyPatient } from "@/lib/patient";

describe("model registry", () => {
  it("registers PCPT 2.0 and the ERSPC DRE calculator under stable ids", () => {
    expect(models.map((model) => model.metadata.id)).toEqual(["pcpt-2.0", "erspc-dre-2012"]);
    expect(new Set(models.map((model) => model.metadata.id)).size).toBe(models.length);
    expect(getModel("pcpt-2.0")?.metadata.citations.length).toBeGreaterThan(0);
    expect(getModel("missing")).toBeUndefined();
  });

  it("gives every model the same patient record and a citation", () => {
    const inputs = emptyPatient();
    for (const model of models) {
      const result = model.predict(inputs);
      expect(result.modelId).toBe(model.metadata.id);
      expect(result.ok).toBe(false);
      expect(model.metadata.developmentCohort.length).toBeGreaterThan(40);
      expect(model.metadata.validationCohort.length).toBeGreaterThan(40);
      expect(model.metadata.limitations.length).toBeGreaterThan(0);
    }
  });
});
