import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelResult, OutcomeEstimate, RiskModel } from "@/lib/models";

function formatPercent(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

function OutcomeRow({ outcome }: { outcome: OutcomeEstimate }) {
  const width =
    outcome.probability === null
      ? 0
      : Math.max(0, Math.min(100, outcome.probability * 100));
  const tone =
    outcome.id === "clinically_significant"
      ? "bg-[oklch(0.47_0.12_35)]"
      : outcome.id === "low_grade"
        ? "bg-[oklch(0.62_0.11_75)]"
        : outcome.id === "any_cancer"
          ? "bg-[oklch(0.4_0.05_210)]"
          : "bg-[oklch(0.55_0.03_150)]";

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{outcome.label}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{outcome.detail}</p>
        </div>
        <p className="font-serif text-2xl leading-none tabular-nums tracking-tight">
          {outcome.probability === null ? "—" : formatPercent(outcome.probability)}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      {outcome.probability === null && outcome.unavailableReason ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{outcome.unavailableReason}</p>
      ) : null}
    </div>
  );
}

export function ModelResultCard({
  model,
  result,
}: {
  model: RiskModel;
  result: ModelResult;
}) {
  const errors = result.issues.filter((issue) => issue.severity === "error");
  const warnings = result.issues.filter((issue) => issue.severity === "warning");

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="gap-2 border-b bg-muted/40 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{model.metadata.shortName}</Badge>
          {result.ok ? (
            <Badge variant="outline">Calculated</Badge>
          ) : (
            <Badge variant="destructive">Not calculated</Badge>
          )}
        </div>
        <CardTitle className="font-serif text-xl leading-snug font-medium tracking-tight">
          {model.metadata.name}
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">{model.metadata.predicts}</p>
      </CardHeader>
      <CardContent className="grid gap-5 py-5">
        {errors.length > 0 ? (
          <ul className="grid gap-1.5 text-sm text-destructive">
            {errors.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="grid gap-1.5 rounded-lg border border-[oklch(0.75_0.08_85)] bg-[oklch(0.96_0.03_95)] px-3 py-2 text-sm text-[oklch(0.35_0.06_70)]">
            {warnings.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        ) : null}

        <div className="grid gap-4">
          {result.outcomes.map((outcome) => (
            <OutcomeRow key={outcome.id} outcome={outcome} />
          ))}
        </div>

        {result.officialIntegerPercents ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Nearest percent, the way the official PCPTRC displays a result (high-grade is the
            remainder so the three integers sum to 100): no cancer{" "}
            {result.officialIntegerPercents.noCancer}%, low-grade{" "}
            {result.officialIntegerPercents.lowGrade}%, high-grade{" "}
            {result.officialIntegerPercents.highGrade}%.
          </p>
        ) : null}

        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Specification used
            </dt>
            <dd className="mt-1 leading-relaxed">{result.variant}</dd>
          </div>
          {result.inputsUsed.length > 0 ? (
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Inputs used
              </dt>
              <dd className="mt-1">
                <ul className="grid gap-1">
                  {result.inputsUsed.map((row) => (
                    <li key={row.label} className="flex gap-2 leading-relaxed">
                      <span className="shrink-0 text-muted-foreground">{row.label}</span>
                      <span>{row.value}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {result.inputsNotUsed.length > 0 ? (
            <div>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Entered, not used by this model
              </dt>
              <dd className="mt-1">
                <ul className="grid gap-1">
                  {result.inputsNotUsed.map((row) => (
                    <li key={row.label} className="leading-relaxed">
                      <span className="text-muted-foreground">{row.label}. </span>
                      {row.value}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Development population
            </dt>
            <dd className="mt-1 leading-relaxed">{model.metadata.developmentCohort}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Validation population
            </dt>
            <dd className="mt-1 leading-relaxed">{model.metadata.validationCohort}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Limitations
            </dt>
            <dd className="mt-1">
              <ul className="grid list-disc gap-1.5 pl-4 leading-relaxed">
                {model.metadata.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Sources
            </dt>
            <dd className="mt-1">
              <ul className="grid gap-2 leading-relaxed">
                {model.metadata.citations.map((citation) => (
                  <li key={citation.href ?? citation.title}>
                    {citation.authors} {citation.title} {citation.source}{" "}
                    {citation.href ? (
                      <a
                        className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                        href={citation.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Source
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        {result.equationLines.length > 0 ? (
          <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Equation applied</summary>
            <ul className="mt-2 grid gap-2 leading-relaxed text-muted-foreground">
              {result.equationLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
