import { WorkflowSteps } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  OFFICIAL_APP_STAGES,
  ORG_APPLICATION_WORKFLOW,
  RECOGNITION_WORKFLOW,
  RENEWAL_WORKFLOW,
  currentAction,
  officialNextStage,
  officialStageFor,
  officialStageIndex,
  officialStageFacts,
} from "@/lib/workflow";
import type { ProcessKey, WorkflowDef } from "@/lib/workflow";

/**
 * Official application process tracker (client-defined workflow): the linear
 * APPLICATION → REQUIREMENTS → SUBMISSION → INTERVIEW → FOLLOW-UP → DECISION
 * → END strip plus a Current Stage / Current Action / Next Stage block. The
 * granular status chain still drives enforcement; this is the President and
 * admin-facing view of where an application sits in the official process.
 */
const DEFS: Partial<Record<ProcessKey, WorkflowDef>> = {
  ORG_APPLICATION: ORG_APPLICATION_WORKFLOW,
  RECOGNITION: RECOGNITION_WORKFLOW,
  RENEWAL: RENEWAL_WORKFLOW,
};

export function WorkflowTracker({
  process,
  status,
  className,
}: {
  process: ProcessKey;
  status: string;
  className?: string;
}) {
  const def = DEFS[process];
  const gate = def ? currentAction(def, status) : null;
  const stageFor = officialStageFor(process, status);
  const index = officialStageIndex(process, status);
  const facts = officialStageFacts(process, status);
  const next = officialNextStage(process, status);
  const currentStage = OFFICIAL_APP_STAGES[index]?.label ?? stageFor;

  return (
    <div className={cn("space-y-4", className)}>
      <WorkflowSteps steps={[...OFFICIAL_APP_STAGES]} currentIndex={index} />

      <div
        className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3"
        aria-label="Official process — current stage, current action, next stage"
      >
        <div className="bg-surface px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-content-muted">
            Current stage
          </p>
          <p className="mt-1 text-sm font-bold text-content">{currentStage}</p>
          <p className="mt-0.5 text-xs text-content-secondary">{facts.action}</p>
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-content-muted">
            Current action
          </p>
          <p className="mt-1 text-sm font-semibold text-content">{gate?.action ?? facts.action}</p>
          <p className="mt-0.5 text-xs text-content-secondary">
            {gate?.roleLabel ? `By ${gate.roleLabel}` : `By ${facts.heldBy}`}
          </p>
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-content-muted">
            Next stage
          </p>
          <p className="mt-1 text-sm font-bold text-content">{next ?? "—"}</p>
          <p className="mt-0.5 text-xs text-content-secondary">
            {index < 0
              ? "This status sits off the official strip."
              : next
                ? "After this stage completes"
                : "The process has concluded."}
          </p>
        </div>
      </div>
    </div>
  );
}