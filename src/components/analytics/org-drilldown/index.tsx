import { DrillOverview, type DrillOverviewProps } from "./overview-section";
import { DrillRequirements, type DrillRequirementsProps } from "./requirements-section";
import { DrillActivities, type DrillActivitiesProps } from "./activities-section";

export type OrgDrilldownProps = {
  overview: DrillOverviewProps;
  requirements: DrillRequirementsProps;
  activities: DrillActivitiesProps;
};

/** Organization drill-down page, composed from focused section components. */
export function OrgDrilldown(p: OrgDrilldownProps) {
  return (
    <>
      <DrillOverview {...p.overview} />
      <DrillRequirements {...p.requirements} />
      <DrillActivities {...p.activities} />
    </>
  );
}