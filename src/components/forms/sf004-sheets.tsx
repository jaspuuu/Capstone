"use client";

import { useState } from "react";
import { Editable } from "@/components/forms/editable";
import { SfApprovers, SfFooter, SfLetterhead } from "@/components/forms/sf-chrome";

export type Sf004Activity = {
  objective: string;
  activity: string;
  description: string;
  date: string;
  budget: string;
};

type Row = Sf004Activity;

const BLANK: Row = { objective: "", activity: "", description: "", date: "", budget: "" };

/**
 * SF-004 sheets — one activity per A4 page. Pages live in client state so
 * officers can append blank pages ("Add") before printing; typed edits are
 * print-only and never persisted.
 */
export function Sf004Sheets({
  orgDisplay,
  ayStart,
  ayEnd,
  presidentName,
  secretaryName,
  adviserNames,
  deanName,
  activities,
}: {
  orgDisplay: string;
  ayStart: string;
  ayEnd: string;
  presidentName: string;
  secretaryName: string;
  adviserNames: string[];
  deanName: string;
  activities: Sf004Activity[];
}) {
  const [pages, setPages] = useState<Row[]>(
    activities.length > 0 ? activities : [BLANK]
  );

  const addPage = () => setPages((p) => [...p, { ...BLANK }]);
  const removePage = (i: number) =>
    setPages((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  return (
    <>
      <div className="no-print fixed inset-x-0 top-14 z-40 flex justify-center">
        <button
          type="button"
          onClick={addPage}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-content shadow-sm hover:border-primary hover:text-primary"
        >
          ＋ Add activity page ({pages.length})
        </button>
      </div>

      {pages.map((row, i) => (
        <div className="sf-sheet relative mb-6" key={i}>
          {pages.length > 1 && (
            <button
              type="button"
              onClick={() => removePage(i)}
              aria-label={`Remove page ${i + 1}`}
              className="no-print absolute top-2 right-2 flex size-7 items-center justify-center rounded-full border border-line-strong bg-surface text-sm text-content-secondary hover:border-danger hover:text-danger"
            >
              ×
            </button>
          )}

          {/* Letterhead — exact typography from the DOCX */}
          <SfLetterhead />

          <h1 className="mt-5 text-center text-[14pt] font-bold tracking-wide">PLAN OF ACTIVITIES</h1>

          <div className="mx-auto mt-4 w-fit text-center">
            <Editable initial={orgDisplay} minWidth="90mm" center ariaLabel="Name of Organization" />
            <p className="mt-0.5 font-bold">Name of Organization</p>
          </div>

          <p className="mt-3 text-center font-bold">
            Semester AY 20
            <Editable initial={ayStart} minWidth="8mm" center ariaLabel="AY start" /> - 20
            <Editable initial={ayEnd} minWidth="8mm" center ariaLabel="AY end" />
          </p>

          {/* One activity per page; row height matches the DOCX trHeight (3185 twips) */}
          <table className="sf-table mt-3">
            <colgroup>
              <col style={{ width: "27.4mm" }} />
              <col style={{ width: "27.7mm" }} />
              <col style={{ width: "33.7mm" }} />
              <col style={{ width: "27.6mm" }} />
              <col style={{ width: "23.7mm" }} />
              <col style={{ width: "23.0mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th>OBJECTIVE</th>
                <th>ACTIVITIES</th>
                <th>BRIEF DESCRIPTION</th>
                <th>PERSONS INVOLVED</th>
                <th>TARGET DATE</th>
                <th>BUDGET</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ height: "56mm" }}>
                <td><Editable initial={row.objective} block /></td>
                <td><Editable initial={row.activity} block /></td>
                <td><Editable initial={row.description} block /></td>
                <td><Editable initial="" block /></td>
                <td className="text-center"><Editable initial={row.date} block center /></td>
                <td className="text-right"><Editable initial={row.budget} block center /></td>
              </tr>
            </tbody>
          </table>

          {/* Signatures */}
          <div className="mt-8">
            <p className="font-bold">Prepared by:</p>
            <div className="mt-6 flex justify-between gap-8">
              <div className="text-center">
                <Editable initial={presidentName} minWidth="60mm" center ariaLabel="President signature" />
                <p className="mt-0.5">Organization President</p>
              </div>
              <div className="text-center">
                <Editable initial={secretaryName} minWidth="60mm" center ariaLabel="Secretary signature" />
                <p className="mt-0.5">Organization Secretary</p>
              </div>
            </div>

            <p className="mt-6 font-bold">Noted:</p>
            <div className="mt-6 space-y-6">
              {adviserNames.length > 0 ? (
                adviserNames.map((name, j) => (
                  <div key={j} className="w-fit">
                    <Editable initial={name} minWidth="60mm" ariaLabel="Adviser signature" />
                    <p className="mt-0.5">Organization Adviser</p>
                  </div>
                ))
              ) : (
                <div className="w-fit">
                  <Editable initial="" minWidth="60mm" ariaLabel="Adviser signature" />
                  <p className="mt-0.5">Organization Adviser(s)</p>
                </div>
              )}
              <div className="w-fit">
                <Editable initial={deanName} minWidth="60mm" ariaLabel="Dean signature" />
                <p className="mt-0.5">Dean/Assoc. Dean of College</p>
              </div>
            </div>
          </div>

          <SfApprovers />

          {/* Form footer, exactly as in the DOCX: code · revision · date */}
          <SfFooter code="LSPU-OSAS-SF-004" />
        </div>
      ))}
    </>
  );
}
