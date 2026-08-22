import { Editable } from "@/components/forms/editable";

/**
 * Shared chrome for the official SF forms — typography lifted verbatim from
 * the original DOCX files (Calibri 11 letterhead lines, Old English Text MT
 * 14 university name, Times New Roman 12 base).
 */

export function SfLetterhead() {
  return (
    <div className="flex items-start gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/forms/letterhead.jpg" alt="LSPU seal" className="h-[22mm] w-auto" />
      <div className="flex-1 text-center leading-snug">
        <p className="text-[11pt]" style={{ fontFamily: 'Calibri, Carlito, "Segoe UI", sans-serif' }}>
          Republic of the Philippines
        </p>
        <p
          style={{
            fontFamily:
              '"Old English Text MT", "UnifrakturMaguntia", "Times New Roman", serif',
            fontSize: "14pt",
          }}
        >
          Laguna State Polytechnic University
        </p>
        <p className="text-[11pt]" style={{ fontFamily: 'Calibri, Carlito, "Segoe UI", sans-serif' }}>
          Province of Laguna
        </p>
        <p className="whitespace-nowrap text-[11pt] font-bold">
          OFFICE OF STUDENT AFFAIRS AND SERVICES
        </p>
      </div>
      <span className="w-[22mm]" aria-hidden />
    </div>
  );
}

/** Bottom-of-sheet form code, e.g. "LSPU-OSAS-SF-001 · Rev. 1 · 09 November 2020". */
export function SfFooter({ code }: { code: string }) {
  return (
    <footer className="sf-footer flex items-baseline justify-between">
      <span>{code}</span>
      <span>Rev. 1</span>
      <span>09 November 2020</span>
    </footer>
  );
}

/** Right-aligned "____________ / Date" blank used by the letter forms. */
export function SfDateBlank() {
  return (
    <div className="mt-4 w-fit ml-auto text-center">
      <Editable initial="" minWidth="30mm" center ariaLabel="Date" />
      <p className="mt-0.5">Date</p>
    </div>
  );
}

/** Centered signature block: name line over a caption. */
export function SfSig({
  name = "",
  caption,
  width = "60mm",
  center = true,
  ariaLabel,
}: {
  name?: string;
  caption: string;
  width?: string;
  center?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className={center ? "mx-auto w-fit text-center" : "w-fit"}>
      <Editable initial={name} minWidth={width} center={center} ariaLabel={ariaLabel ?? caption} />
      <p className="mt-0.5">{caption}</p>
    </div>
  );
}

/** "Recommending Approval" and "Approved/Disapproved" signatories, shared by all letters. */
export function SfApprovers() {
  return (
    <>
      <div className="mt-8 text-center">
        <p className="font-bold">Recommending Approval:</p>
        <p className="mt-8 font-bold underline">AL JOHN A. VILLAREAL</p>
        <p>Coordinator, Student Organization Unit</p>
      </div>

      <div className="mt-8 text-center">
        <p className="font-bold">Approved/Disapproved:</p>
        <p className="mt-8 font-bold underline">ALBERTO B. CASTILLO, EdD</p>
        <p>Director/Chairperson, Office of Student Affairs and Services</p>
      </div>
    </>
  );
}
