"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModelResultCard } from "@/components/model-result";
import {
  blankForm,
  publishedIllustrations,
  toPatient,
  type CalculatorFormState,
  type YesNo,
  type YesNoUnknown,
} from "@/lib/form";
import { models, type ModelResult } from "@/lib/models";
import type { RaceCategory } from "@/lib/patient";

const fieldClass = "h-10 w-full bg-card text-sm";

function FieldHint({ children }: { children: string }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="font-serif text-lg font-medium tracking-tight text-foreground">{children}</h2>
  );
}

export function RiskCalculator() {
  const [form, setForm] = useState<CalculatorFormState>(blankForm);
  const [results, setResults] = useState<ModelResult[] | null>(null);
  const [parseMessages, setParseMessages] = useState<string[]>([]);
  const [activeIllustration, setActiveIllustration] = useState<string | null>(null);

  function update<K extends keyof CalculatorFormState>(key: K, value: CalculatorFormState[K]) {
    setActiveIllustration(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function calculate(next: CalculatorFormState = form) {
    const parsed = toPatient(next);
    setParseMessages(parsed.issues.map((issue) => issue.message));
    if (parsed.issues.length > 0) {
      setResults(null);
      return;
    }
    setResults(models.map((model) => model.predict(parsed.inputs)));
  }

  function loadIllustration(id: string) {
    const illustration = publishedIllustrations.find((item) => item.id === id);
    if (!illustration) return;
    setForm(illustration.form);
    setActiveIllustration(id);
    calculate(illustration.form);
  }

  const fieldErrors = new Set(
    (results ?? []).flatMap((result) =>
      result.issues.filter((issue) => issue.severity === "error" && issue.field).map((issue) => issue.field),
    ),
  );

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <form
        className="grid gap-6 rounded-xl border bg-card/80 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          calculate();
        }}
      >
        <div className="grid gap-2">
          <SectionTitle>Who this result is about</SectionTitle>
          <FieldHint>
            Nothing is saved. Closing the page clears it. This is a discussion aid, not a chart.
          </FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="prior-cancer">Previous prostate cancer diagnosis</Label>
          <YesNoSelect
            id="prior-cancer"
            invalid={fieldErrors.has("priorProstateCancerDiagnosis")}
            value={form.priorProstateCancerDiagnosis}
            onChange={(value) => update("priorProstateCancerDiagnosis", value)}
          />
          <FieldHint>Both published calculators stop if the answer is yes.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            inputMode="decimal"
            className={fieldClass}
            aria-invalid={fieldErrors.has("ageYears")}
            value={form.ageYears}
            onChange={(event) => update("ageYears", event.target.value)}
          />
          <FieldHint>PCPTRC accepts 55–90 years. ERSPC does not use age as a covariate.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="race">Race</Label>
          <Select
            value={form.race || null}
            onValueChange={(value) => update("race", (value ?? "") as "" | RaceCategory)}
          >
            <SelectTrigger id="race" className={fieldClass} aria-invalid={fieldErrors.has("race")}>
              <SelectValue placeholder="Select a group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="african_american">African American</SelectItem>
              <SelectItem value="white">White</SelectItem>
              <SelectItem value="hispanic">Hispanic</SelectItem>
              <SelectItem value="other">Another group</SelectItem>
            </SelectContent>
          </Select>
          <FieldHint>
            PCPTRC 2.0 codes African American as 1 and every other group as 0. ERSPC does not use race.
          </FieldHint>
        </div>

        <SectionTitle>Tests</SectionTitle>

        <div className="grid gap-1.5">
          <Label htmlFor="psa">PSA (ng/mL)</Label>
          <Input
            id="psa"
            inputMode="decimal"
            className={fieldClass}
            aria-invalid={fieldErrors.has("psaNgMl")}
            value={form.psaNgMl}
            onChange={(event) => update("psaNgMl", event.target.value)}
          />
          <FieldHint>
            PCPTRC was fit at PSA up to 10 and the official tool accepts up to 50. Values above 10 still calculate, with a warning.
          </FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="recent">PSA and DRE both from the past year</Label>
          <YesNoSelect
            id="recent"
            invalid={fieldErrors.has("psaAndDreWithinPastYear")}
            value={form.psaAndDreWithinPastYear}
            onChange={(value) => update("psaAndDreWithinPastYear", value)}
          />
          <FieldHint>Required by PCPTRC. The ERSPC equation does not have this switch.</FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="dre">Digital rectal examination</Label>
          <TriSelect
            id="dre"
            invalid={fieldErrors.has("dreSuspicious")}
            value={form.dreSuspicious}
            yesLabel="Suspicious (nodule or firmness)"
            noLabel="Normal"
            onChange={(value) => update("dreSuspicious", value)}
          />
          <FieldHint>
            If this is not recorded, PCPTRC switches to its published refit. ERSPC cannot run without it.
          </FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="volume">Prostate volume (cc), optional</Label>
          <Input
            id="volume"
            inputMode="decimal"
            className={fieldClass}
            aria-invalid={fieldErrors.has("prostateVolumeCc")}
            value={form.prostateVolumeCc}
            onChange={(event) => update("prostateVolumeCc", event.target.value)}
            placeholder="TRUS volume, if measured"
          />
          <FieldHint>
            ERSPC recodes volume to 25 cc (&lt;30), 40 cc (30 to &lt;50), or 60 cc (≥50). PCPTRC ignores volume.
          </FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="volume-class">Or a DRE size class, if there is no measurement</Label>
          <Select
            value={form.dreVolumeClassCc || null}
            onValueChange={(value) =>
              update("dreVolumeClassCc", (value ?? "") as CalculatorFormState["dreVolumeClassCc"])
            }
          >
            <SelectTrigger id="volume-class" className={fieldClass}>
              <SelectValue placeholder="No size class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">Small, class 25 cc</SelectItem>
              <SelectItem value="40">Medium, class 40 cc</SelectItem>
              <SelectItem value="60">Large, class 60 cc</SelectItem>
            </SelectContent>
          </Select>
          <FieldHint>Used only when the cc field is empty. A measured volume takes precedence.</FieldHint>
          {form.dreVolumeClassCc ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start px-0"
              onClick={() => update("dreVolumeClassCc", "")}
            >
              Clear size class
            </Button>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="fpsa">Percent free PSA, optional</Label>
          <Input
            id="fpsa"
            inputMode="decimal"
            className={fieldClass}
            aria-invalid={fieldErrors.has("percentFreePsa")}
            value={form.percentFreePsa}
            onChange={(event) => update("percentFreePsa", event.target.value)}
            placeholder="For example 18"
          />
          <FieldHint>
            Optional PCPTRC update. The official tool accepts 5–75. Leave blank to skip it. ERSPC ignores it.
          </FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pirads">PI-RADS, optional</Label>
          <Select
            value={form.piRads || null}
            onValueChange={(value) => update("piRads", (value ?? "") as CalculatorFormState["piRads"])}
          >
            <SelectTrigger id="pirads" className={fieldClass}>
              <SelectValue placeholder="Not entered" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="5">5</SelectItem>
            </SelectContent>
          </Select>
          <FieldHint>
            Neither Phase 1 equation publishes a PI-RADS coefficient. If you enter one, it is shown as unused.
          </FieldHint>
          {form.piRads ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start px-0"
              onClick={() => update("piRads", "")}
            >
              Clear PI-RADS
            </Button>
          ) : null}
        </div>

        <SectionTitle>History</SectionTitle>

        <div className="grid gap-1.5">
          <Label htmlFor="biopsy">Prior negative biopsy</Label>
          <TriSelect
            id="biopsy"
            invalid={fieldErrors.has("priorNegativeBiopsy")}
            value={form.priorNegativeBiopsy}
            yesLabel="Yes, at least one, all negative"
            noLabel="No prior biopsy"
            onChange={(value) => update("priorNegativeBiopsy", value)}
          />
          <FieldHint>
            Not recorded: PCPTRC uses its refit. ERSPC needs a yes or no, because the equation changes.
          </FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="screen">Previously screened (ERSPC)</Label>
          <TriSelect
            id="screen"
            invalid={fieldErrors.has("priorScreening")}
            value={form.priorScreening}
            yesLabel="Yes, a prior PSA screen"
            noLabel="No, this is a first screen"
            onChange={(value) => update("priorScreening", value)}
          />
          <FieldHint>
            Needed by ERSPC when there has been no prior biopsy. A prior negative biopsy selects the repeat-screen equation on its own.
          </FieldHint>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="family">First-degree family history of prostate cancer</Label>
          <TriSelect
            id="family"
            invalid={fieldErrors.has("familyHistoryFirstDegree")}
            value={form.familyHistoryFirstDegree}
            yesLabel="Yes (father, brother, or son)"
            noLabel="No"
            onChange={(value) => update("familyHistoryFirstDegree", value)}
          />
          <FieldHint>
            Not recorded: PCPTRC uses its refit. The ERSPC biopsy equation does not use family history.
          </FieldHint>
        </div>

        <Button type="submit" size="lg" className="h-10 w-full">
          Calculate risks
        </Button>

        <div className="grid gap-2 border-t pt-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Illustrations from Ankerst 2014
          </p>
          <div className="grid gap-2">
            {publishedIllustrations.map((illustration) => (
              <Button
                key={illustration.id}
                type="button"
                variant={activeIllustration === illustration.id ? "secondary" : "outline"}
                className="h-auto w-full justify-start px-3 py-2 text-left whitespace-normal"
                onClick={() => loadIllustration(illustration.id)}
              >
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{illustration.label}</span>
                  <span className="text-xs leading-relaxed font-normal text-muted-foreground">
                    {illustration.detail}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      </form>

      <div className="grid gap-4" aria-live="polite">
        {parseMessages.length > 0 ? (
          <div className="rounded-xl border border-destructive/40 bg-card px-4 py-3 text-sm text-destructive">
            <ul className="grid gap-1">
              {parseMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {results === null ? (
          <div className="rounded-xl border border-dashed bg-card/50 px-5 py-8">
            <h2 className="font-serif text-2xl font-medium tracking-tight">Two published models, side by side</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              PCPTRC 2.0 returns the chance of no cancer, low-grade cancer, and high-grade cancer
              (Gleason score 7 or higher) if a biopsy were done. The Rotterdam ERSPC equation
              returns the chance of any cancer. It does not return a high-grade risk, because that
              equation was not published in full.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              The same inputs can feed a later in-house model. Each model decides which fields it
              uses, what to do when an optional field is missing, and which warnings to show.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">
              These results answer different questions on different populations. A higher ERSPC
              number is not a disagreement with PCPTRC, and neither number is a biopsy recommendation.
            </p>
            <div className="grid gap-4">
              {models.map((model) => {
                const result = results.find((item) => item.modelId === model.metadata.id);
                if (!result) return null;
                return <ModelResultCard key={model.metadata.id} model={model} result={result} />;
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function YesNoSelect({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: YesNo;
  onChange: (value: YesNo) => void;
  invalid?: boolean;
}) {
  return (
    <Select value={value || null} onValueChange={(next) => onChange((next ?? "") as YesNo)}>
      <SelectTrigger id={id} className={fieldClass} aria-invalid={invalid}>
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="no">No</SelectItem>
        <SelectItem value="yes">Yes</SelectItem>
      </SelectContent>
    </Select>
  );
}

function TriSelect({
  id,
  value,
  onChange,
  yesLabel,
  noLabel,
  invalid,
}: {
  id: string;
  value: YesNoUnknown;
  onChange: (value: YesNoUnknown) => void;
  yesLabel: string;
  noLabel: string;
  invalid?: boolean;
}) {
  return (
    <Select value={value || null} onValueChange={(next) => onChange((next ?? "") as YesNoUnknown)}>
      <SelectTrigger id={id} className={fieldClass} aria-invalid={invalid}>
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="no">{noLabel}</SelectItem>
        <SelectItem value="yes">{yesLabel}</SelectItem>
        <SelectItem value="unknown">Not recorded</SelectItem>
      </SelectContent>
    </Select>
  );
}
