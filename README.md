# Prostate biopsy risk

Phase 1 of a prostate biopsy risk desk. It wraps published, externally validated calculators behind one TypeScript interface so a later in-house model can be added without rewriting the app.

This is not medical advice. It does not diagnose prostate cancer and it does not recommend for or against biopsy. Results are for discussion with a clinician. The app does not create an account, and it does not store or transmit what you type.

## Run it

```bash
npm install
npm run dev
```

The dev server in this project is started on port **43123**:

```bash
npx next dev --hostname 0.0.0.0 --port 43123
```

```bash
npm test
npm run lint
```

`npm test` runs Vitest against the same functions the page calls.

## Why the math is in the browser

Each calculator is a pure function of the inputs. Running it in the browser means:

- The UI and the unit tests import one implementation.
- A PSA, a race category, or a family history never leaves the machine.
- There is no database and no session. Refreshing the page clears the form.

A server would not make the arithmetic more correct. If a Phase 2 model needed a private dataset, that dataset would stay on a server and only the fitted coefficients would ship to this interface.

## Architecture

```
src/lib/patient.ts            shared input record (null = not recorded)
src/lib/models/types.ts       RiskModel, metadata, issues, outcomes
src/lib/models/pcpt-2.ts      PCPTRC 2.0
src/lib/models/erspc-dre.ts   Rotterdam ERSPC DRE / PSA+DRE equations
src/lib/models/registry.ts    the list the page renders
src/components/risk-calculator.tsx
```

`RiskModel` is the plug:

- `metadata` — name, what the probability is a probability of, development cohort, validation cohort, limitations, citations
- `predict(inputs)` — pure. Returns outcomes (including an explicit “not estimated” when the endpoint has no published equation), the inputs actually used, the inputs ignored and why, warnings, blocking errors, and the equation text for the branch that ran

Missing optional inputs are handled the way each source handles them, not by a shared imputation.

| Field | PCPTRC 2.0 | ERSPC DRE, 2012 appendix |
| --- | --- | --- |
| Prior biopsy, DRE, or family history not recorded | Switches to the matching refit published in the official `riskcalc.R` | DRE and prior-biopsy status are required. No refit was published. |
| Prior screening unknown, no prior biopsy | Ignored | Blocks. The first-screen and repeat-screen equations differ. |
| Prior negative biopsy | Covariate | Selects the repeat-screen equation and enters it as 1 |
| Prostate volume absent | Ignored | Uses the published PSA + DRE equation from the same appendix |
| Prostate volume present | Ignored | Recoded to 25 / 40 / 60 cc |
| Percent free PSA | Optional likelihood-ratio update | Ignored |
| Age | Covariate, accepted from 55 through 90 | Not a covariate. A warning is shown outside about 55–75, and the number does not change. |
| Race | African American = 1, every other group = 0 | Ignored |
| PI-RADS | Ignored | Ignored |

Out-of-range behavior follows the source, and it distinguishes a hard stop from a warning:

- PCPTRC refuses age outside 55–90, PSA ≤ 0 or PSA > 50, and percent free PSA outside 5–75. Those are the official tool’s limits.
- PSA above 10 ng/mL and at most 50 still calculates, with a warning. Development biopsies were capped at 10; the official tool still accepts 50.
- Percent free PSA inside 5–75 but outside the regression sample 5.495801–72.955864 calculates, with a warning.
- ERSPC refuses PSA ≤ 0, a non-positive volume, a missing DRE, or a missing choice of first versus repeat screen.

## What was implemented

### PCPT Risk Calculator 2.0

Nominal logistic regression for three biopsy outcomes: no cancer, low-grade (Gleason score < 7), and high-grade (Gleason score ≥ 7, which is grade group ≥ 2). Any-cancer risk is the sum of the two cancer outcomes.

Full six-variable equation, from the official calculator source (the three-decimal slide version is the same model, rounded):

```
L = −3.00215469 + 0.25613390·log2(PSA) + 0.01643637·age + 0.12172599·AA
    − 0.45533257·prior biopsy − 0.03864628·DRE + 0.27197219·family history

H = −7.05304534 + 0.70489441·log2(PSA) + 0.04753804·age + 1.04174529·AA
    − 0.21409933·prior biopsy + 0.40068434·DRE + 0.22467348·family history

P(no)   = 1 / (1 + e^L + e^H)
P(low)  = e^L / (1 + e^L + e^H)
P(high) = e^H / (1 + e^L + e^H)
```

`log2` is the base-2 log of PSA in ng/mL. `AA` is 1 for African American and 0 otherwise. The other indicators are 1 or 0.

The official display rounds no-cancer and low-grade to the nearest percent with round-half-to-even, then sets high-grade to the remainder so the three integers sum to 100. The page shows one decimal and that integer display.

When prior biopsy, DRE, or family history is not recorded, the matching coefficient vector from `riskcalc.R` is used. There are seven reduced refits plus the full model. They are not the full model with a covariate zeroed out.

Optional percent free PSA uses the normal-density likelihood-ratio update in that same file. Means of `log2(%free PSA)` given `log2(PSA)`:

| Outcome | Intercept | Coefficient on log2(PSA) | SD |
| --- | --- | --- | --- |
| No cancer | 4.9602101 | −0.2195069 | 0.5154306 |
| Low-grade | 4.9730353 | −0.3856204 | 0.6010974 |
| High-grade | 4.8059009 | −0.3483031 | 0.6452902 |

The official code turns each class-versus-complement odds into a probability and then sets high-grade to the remainder. This app does that too.

Sources:

- Ankerst DP, Hoefler J, Bock S, et al. Prostate Cancer Prevention Trial risk calculator 2.0 for the prediction of low- vs high-grade prostate cancer. *Urology*. 2014;83(6):1362-1367. https://pmc.ncbi.nlm.nih.gov/articles/PMC4035700/ — odds ratios in Table 2, and the three commentary examples used as reference outputs.
- Thompson IM, Ankerst DP, Chi C, et al. Assessing prostate cancer risk: results from the Prostate Cancer Prevention Trial. *J Natl Cancer Inst*. 2006;98(8):529-534. The original PCPTRC. Version 2.0 refit the expanded placebo-arm biopsy set.
- Official coefficients, missing-data refits, percent-free-PSA update, and display rounding: [`PCPTRC/riskcalc.R`](https://github.com/ClevelandClinicQHS/riskcalc-website/blob/main/PCPTRC/riskcalc.R) in `ClevelandClinicQHS/riskcalc-website`, the source of https://riskcalc.org/PCPTRC/. Age 55–90, PSA (0, 50], and percent free PSA 5–75 are the limits in `messages_en.r` from that same directory.

Worked reference values locked in `src/lib/models/pcpt-2.test.ts`:

| Illustration | Inputs | Official integer display | Raw high-grade |
| --- | --- | --- | --- |
| Commentary case A | 55 y, PSA 3.8, White, prior negative biopsy, normal DRE, no family history | 86% / 11% / 3% (no / low / high) | 0.031834 |
| Commentary case B | 73 y, PSA 3.8, African American, no prior biopsy, normal DRE, family history | 56% / 22% / 22% | 0.214926 |
| Commentary case C | 55 y, PSA 0.4, White, no prior biopsy, suspicious DRE, no family history | 92% / 8% / 0% | 0.006366 |

The commentary states 11% and 3%, 22% and 22%, and 8% and <1%. It does not state the DRE for the first two. A normal DRE is what reproduces those printed percents. Case C names a nodule.

### Rotterdam / ERSPC

Any-cancer logistic equations from the open appendix of Roobol et al., *World Journal of Urology* 2012;30:149-155 (PMC3321270), which cites the DRE-volume development paper Roobol et al., *European Urology* 2012;61:577-583.

Volume classes: &lt;30 cc → 25, 30 to &lt;50 cc → 40, ≥50 cc → 60.

First screen, with volume (RC #3):

```
lp = −1.826 + 1.024·(log2(PSA) − 2) − 1.50·(log2(volume class) − 5.4) + 0.992·DRE
```

Previously screened or biopsied, with volume (RC #4/5):

```
lp = −1.470 − 0.677·prior biopsy
     + (0.576 − 0.423·prior biopsy)·(log2(PSA) − 2)
     − 1.043·(log2(volume class) − 5.5)
     + 0.68·DRE
```

First screen, no volume:

```
lp = −1.743 + 0.788·(log2(PSA) − 2) + 1.105·DRE
```

Previously screened or biopsied, no volume:

```
lp = −1.315 − 0.899·prior biopsy
     + (0.421 − 0.362·prior biopsy)·(log2(PSA) − 2)
     + 0.726·DRE
```

`P(any cancer) = 1 / (1 + exp(−lp))`. No cancer is the complement.

The printed RC #3 volume term in the appendix is garbled (`log2(volume)/log10(2)` and a parenthesis that does not match). The same appendix defines `log2(x) = log(x)/log(2)` and prints the RC #4/5 volume term as `(log2(volume class) − 5.5)`. The literal garbled term drives the probability to about 10⁻⁹. This app uses `(log2(volume class) − 5.4)`, which is the parallel of the clean RC #4/5 term. A unit test locks both the corrected value and the fact that the garbled expression is not what the app returns.

Reference values in `src/lib/models/erspc-dre.test.ts` are direct evaluations of those formulas. One of them: PSA 4 ng/mL, volume class 40, normal DRE, first screen → linear predictor −1.7088921423310435 → probability 0.1533074652123016. There is no published numeric case in the appendix to quote beside that arithmetic.

## What was skipped

These were not approximated.

- **ERSPC clinically significant / high-grade cancer.** Roobol et al., Eur Urol 2012, define it as stage > T2b and/or Gleason score ≥ 7 and report discrimination, but the open World J Urol 2012 appendix prints only the any-cancer formulas. The page says this endpoint is not estimated.
- **Current SWOP MRI and cribriform calculators** (prostatecancer-riskcalculator.com). The site describes PI-RADS and a cribriform definition of clinically significant cancer. A public coefficient list was not found.
- **Original continuous-TRUS-volume ERSPC RC**, before the three-class DRE recode. The class-based equations are the ones with a complete open appendix.
- **ERSPC 4-year risk after a negative screen** (Roobol et al., Eur Urol 2013). Different endpoint. The abstract names the covariates; it does not give the coefficients.
- **PCPTRC PCA3 and T2:ERG updates.** The official UI collects them. They are not in the `riskcalc.R` retrieved for this phase.
- **PCPTRC detailed family history and SNP updates.** The likelihood ratios are in `riskcalc.R`, but they replace the three-way grade result with a single any-cancer risk, and they are outside the input set for this phase.
- **PBCG / Extended PBCG**, the newer calculator the PCPTRC site points to. Different model. Not part of this phase.

## How to add a model

1. Add a file under `src/lib/models/` that exports a `RiskModel`.
2. Implement `predict` as a pure function. Use `null` for an outcome you cannot estimate, with a reason. Do not invent a coefficient.
3. Declare validity ranges as errors (do not return a probability) or warnings (return a probability and say why it is outside the fitted sample).
4. Say, in `inputsNotUsed`, which shared fields you ignore.
5. Append the export to the array in `src/lib/models/registry.ts`.
6. Add a Vitest file that freezes at least one published reference output and the out-of-range behavior.

The page maps `models` and does not need a layout change.

## Phase 2 plan

Phase 2 fits an in-house model and registers it beside these two. The wrapper stays. The new work is the model, the reporting, and the comparison.

**Data.** Patient-level biopsy data with outcome and the same predictors, obtained through an approved route. NCI PLCO and PCPT are requested via the Cancer Data Access System (CDAS), with the data-use agreement and the required exclusion of re-identification. Local consecutive biopsies, if used, need an IRB determination and a frozen extract with a data dictionary. Sextant-era trial biopsies and contemporary 12-core or MRI-targeted biopsies are not the same sampling scheme; the protocol states which one is the development set.

**Reporting.** Write the model to TRIPOD+AI: intended use (chance of grade group ≥ 2 on biopsy, and any cancer if both are modeled), eligibility, predictors available at the decision point, outcome definition, sample size, missingness, and the full specification including intercepts.

**Missing data.** Multiple imputation under a missing-at-random assumption, fit without looking at a held-out external set. Do not fill missing DRE or family history with “no”, which is what a silent zero would do. Publish the imputation model. The Phase 1 calculators do not impute; PCPTRC switches equations, and ERSPC refuses.

**Internal validation.** Bootstrap the whole pipeline (imputation, fitting, and any predictor selection), not just the final regression. Report optimism-corrected discrimination and a calibration slope. A single split is not the internal check.

**Performance.** Calibration plots and calibration intercept/slope for high-grade and for any cancer. Discrimination (AUC) is reported and is not the success criterion on its own. Decision curve analysis over a pre-specified range of biopsy thresholds, compared with “biopsy no one”, “biopsy everyone”, and PSA alone.

**External validation.** A cohort that did not contribute rows to fitting, preferably a different center or a later time period. Repeat calibration, discrimination, and decision curves. Say where the model is miscalibrated instead of rescaling it quietly.

**Head-to-head.** On that external cohort, compute PCPTRC 2.0 and the ERSPC equation from this repository on the same men, and compare calibration and net benefit against the in-house model. Differences in biopsy scheme and in the high-grade definition (PCPT: Gleason score ≥ 7; ERSPC development paper: stage > T2b and/or Gleason ≥ 7) are part of the report, not a footnote.

Until that model exists, this app only runs the published equations above.
