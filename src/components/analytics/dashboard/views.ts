/**
 * Analytics view identity — deliberately server-safe (no "use client"), so both
 * the server page (which picks the panel to render) and the client tab bar
 * (which rewrites the `view` query parameter) read from the same source.
 */
export const ANALYTICS_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "compliance", label: "Compliance" },
  { id: "trends", label: "Trends" },
  { id: "activities", label: "Activities" },
  { id: "alerts", label: "Alerts" },
  { id: "quality", label: "Data Quality" },
] as const;

export type AnalyticsView = (typeof ANALYTICS_VIEWS)[number]["id"];

export const isAnalyticsView = (v: string | undefined): v is AnalyticsView =>
  ANALYTICS_VIEWS.some((t) => t.id === v);