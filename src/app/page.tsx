import { RiskCalculator } from "@/components/risk-calculator";
import { models } from "@/lib/models";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <header className="grid gap-4">
        <p className="text-xs font-medium tracking-[0.16em] text-[oklch(0.4_0.05_210)] uppercase">
          Phase 1 · published calculators
        </p>
        <div className="grid gap-3">
          <h1 className="max-w-3xl font-serif text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">
            Prostate biopsy risk, from the equations that were actually published
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            A browser-side desk for the PCPT Risk Calculator 2.0 and the Rotterdam ERSPC
            DRE calculator. Computation stays on this device. A later in-house model registers
            through the same interface.
          </p>
        </div>
        <div className="rounded-xl border border-[oklch(0.72_0.08_70)] bg-[oklch(0.96_0.03_90)] px-4 py-3 text-sm leading-relaxed text-[oklch(0.32_0.04_50)]">
          <p className="font-medium">Not medical advice.</p>
          <p className="mt-1">
            This does not diagnose prostate cancer and does not recommend for or against a biopsy.
            It restates published equations so the result can be discussed with a clinician. No
            account is created, and nothing typed here is stored or sent to a server.
          </p>
        </div>
      </header>

      <RiskCalculator />

      <section className="grid gap-3 border-t pt-6 text-sm leading-relaxed text-muted-foreground">
        <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
          What was left out, on purpose
        </h2>
        <p>
          The ERSPC high-grade equation (stage greater than T2b and/or Gleason score 7 or higher)
          is described in Roobol et al., European Urology 2012, but the open appendix prints only
          the any-cancer formulas. The current SWOP site also offers MRI and cribriform versions
          without a public coefficient list. Those endpoints are not approximated. PCA3, T2:ERG,
          SNP panels, and the detailed family-history update on the official PCPTRC site are not
          in this phase: the first two are not in the retrieved calculator source, and the last two
          collapse the grade-specific result into a single cancer risk.
        </p>
        <p>
          Models on this page: {models.map((model) => model.metadata.shortName).join(" and ")}.
          Adding another model is a new file that implements the same <span className="text-foreground">RiskModel</span> interface
          and one line in the registry. The README describes that step and the Phase 2 validation plan.
        </p>
      </section>
    </main>
  );
}
