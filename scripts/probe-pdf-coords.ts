import { generateOfficialDocx, type FormData } from "../src/lib/docx/forms";
import { docxToPdf } from "../src/lib/documents/pdf";

const SENTINELS: Record<string, string> = {
  orgName: "SENorgName",
  date: "SENdate",
  ay: "2098-2099",
  semester: "SENsemester",
  presidentName: "SENpresident",
  secretaryName: "SENsecretary",
  deanName: "SENdean",
  adviserName: "SENadviser",
  adviserInfoName: "SENadvInfo",
  adviserInfoCollege: "SENadvCollege",
  certifiedStudentName: "SENcertStudent",
  certifiedStudentCourseYearSection: "SENcertCYS",
};

function sentinelData(): FormData {
  const s = SENTINELS;
  return {
    orgName: s.orgName,
    date: s.date,
    ay: s.ay,
    semester: s.semester,
    president: { name: s.presidentName, sig: null },
    secretary: { name: s.secretaryName, sig: null },
    advisers: [{ name: s.adviserName, sig: null }],
    dean: { name: s.deanName, sig: null },
    adviserInfo: { name: s.adviserInfoName, college: s.adviserInfoCollege },
    certifiedStudent: {
      name: s.certifiedStudentName,
      courseYearSection: s.certifiedStudentCourseYearSection,
      position: "SENcertPos",
    },
    members: [
      { name: "SENmember1", studentNo: "SENno1", courseYearSection: "SENcys1", sig: null },
    ],
  };
}

async function main() {
  const formKey = process.argv[2] ?? "SF001";
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const docx = await generateOfficialDocx({ formKey, data: sentinelData() });
  const pdf = await docxToPdf(Buffer.from(docx));
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  console.log(`${formKey}: ${doc.numPages} page(s), ${pdf.length} bytes`);
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const item of tc.items) {
      const str = "str" in item ? item.str : "";
      if (!str || !str.includes("SEN")) continue;
      const tx = pdfjs.Util.transform(viewport.transform, (item as { transform: number[] }).transform);
      const fontSize = Math.hypot((item as { transform: number[] }).transform[2], (item as { transform: number[] }).transform[3]);
      console.log(
        JSON.stringify({
          page: p,
          str,
          pageW: viewport.width,
          pageH: viewport.height,
          x: +tx[4].toFixed(2),
          yTop: +tx[5].toFixed(2),
          w: +((item as { width: number }).width * viewport.scale).toFixed(2),
          fontSize: +fontSize.toFixed(2),
        })
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
