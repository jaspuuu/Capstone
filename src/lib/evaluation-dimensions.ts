// M&E rubric evaluation dimensions: a single source of truth shared by the
// officer-facing form (client component), the evaluation server action, and
// the analytics aggregator. Kept out of the "use server" module so the client
// bundle receives real values instead of the server-action facade.
export const EVALUATION_DIMENSIONS = [
  { key: "relevance", label: "Relevance", help: "Alignment of the activity with the organization's objectives." },
  { key: "impact", label: "Impact", help: "Observable results and benefit to participants." },
  { key: "efficiency", label: "Efficiency", help: "Use of time, budget and resources." },
  { key: "sustainability", label: "Sustainability", help: "Likelihood the gains continue after the activity." },
] as const;