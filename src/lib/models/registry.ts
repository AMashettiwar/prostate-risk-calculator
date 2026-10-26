import { erspcDre } from "@/lib/models/erspc-dre";
import { pcpt20 } from "@/lib/models/pcpt-2";
import type { RiskModel } from "@/lib/models/types";

/**
 * Phase 1 registry. A Phase 2 model implements RiskModel and is appended here.
 * Predict functions stay pure so the UI and the unit tests call the same code.
 */
export const models: readonly RiskModel[] = [pcpt20, erspcDre];

export function getModel(id: string): RiskModel | undefined {
  return models.find((model) => model.metadata.id === id);
}
