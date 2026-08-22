import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getAccessibleOrganizations } from "@/lib/forms-access";

/** Shown when a form route is opened without ?org= — pick which org to print for. */
export async function FormOrgPicker({ basePath }: { basePath: string }) {
  const user = await requireUser();
  const orgs = await getAccessibleOrganizations(user);

  return (
    <>
      <div className="sf-sheet-flow mx-auto mb-6 mt-24 w-[210mm] px-2">
        <h1 className="font-display text-xl font-bold text-content">Choose an organization</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Select the organization to fill this form for.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link
                href={`${basePath}?org=${o.id}`}
                className="block rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm font-semibold text-content hover:border-primary hover:text-primary"
              >
                {o.acronym ? `${o.name} (${o.acronym})` : o.name}
                <span className="mt-0.5 block text-xs font-normal text-content-secondary">
                  {o.college.name}
                </span>
              </Link>
            </li>
          ))}
          {orgs.length === 0 && (
            <li className="col-span-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-content-secondary">
              No organizations you have access to.
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
