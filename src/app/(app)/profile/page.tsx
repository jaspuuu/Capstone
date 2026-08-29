import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, PenLine, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime, fullName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ChangePasswordForm } from "./change-password-form";
export const instant = false;

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const sessionUser = await requireUser();

  const [user, memberships, assignments] = await Promise.all([
    db.user.findUnique({
      where: { id: sessionUser.id },
      include: { college: true, department: true },
    }),
    db.organizationMember.findMany({
      where: { userId: sessionUser.id },
      include: {
        organization: {
          select: { name: true, acronym: true, college: { select: { code: true } } },
        },
      },
      orderBy: [{ organization: { name: "asc" } }],
    }),
    db.adviserAssignment.findMany({
      where: { adviserId: sessionUser.id },
      include: { organization: { select: { name: true, acronym: true } } },
      orderBy: [{ academicYear: "desc" }, { organization: { name: "asc" } }],
    }),
  ]);
  if (!user) return null;

  return (
    <>
      <PageHeader title="My profile" description="Your account details and affiliations." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={ShieldCheck} title="Account" />
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-content-secondary">Name</dt>
                <dd className="font-semibold text-content">{fullName(user)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-content-secondary">Email</dt>
                <dd className="text-content">{user.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-content-secondary">Role</dt>
                <dd>
                  <Badge tone={user.role === "OSAS" ? "primary" : "info"}>{ROLE_LABELS[user.role]}</Badge>
                  {user.isViewOnly && (
                    <Badge tone="warning" icon className="ml-1.5">
                      View-only
                    </Badge>
                  )}
                </dd>
              </div>
              {user.college && (
                <div className="flex justify-between gap-4">
                  <dt className="text-content-secondary">College</dt>
                  <dd className="text-content">
                    {user.college.name} ({user.college.code})
                  </dd>
                </div>
              )}
              {user.department && (
                <div className="flex justify-between gap-4">
                  <dt className="text-content-secondary">Department</dt>
                  <dd className="text-content">{user.department.name}</dd>
                </div>
              )}
              {user.studentNumber && (
                <div className="flex justify-between gap-4">
                  <dt className="text-content-secondary">Student number</dt>
                  <dd className="tabular-nums text-content">{user.studentNumber}</dd>
                </div>
              )}
              {user.positionTitle && (
                <div className="flex justify-between gap-4">
                  <dt className="text-content-secondary">Position</dt>
                  <dd className="text-content">{user.positionTitle}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-content-secondary">Last sign-in</dt>
                <dd className="text-content">{formatDateTime(user.lastLoginAt)}</dd>
              </div>
            </dl>

            {memberships.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="mb-2 text-xs font-bold tracking-wide text-content-secondary uppercase">
                  Organization memberships
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {memberships.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="text-content">
                        {m.organization.acronym ?? m.organization.name}
                        <span className="ml-1.5 text-xs text-content-muted">
                          {m.organization.college?.code}
                        </span>
                      </span>
                      <Badge tone={m.position === "PRESIDENT" ? "primary" : m.position === "SECRETARY" ? "info" : "neutral"}>
                        {m.position}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {assignments.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="mb-2 text-xs font-bold tracking-wide text-content-secondary uppercase">
                  Adviser assignments
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {assignments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <span className="text-content">{a.organization.acronym ?? a.organization.name}</span>
                      <span className="text-xs whitespace-nowrap text-content-secondary">
                        AY {a.academicYear} · {a.type === "REGULAR" ? "Regular" : "Part-time"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader icon={KeyRound} title="Change password" description="Choose a strong password you do not use elsewhere." />
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            icon={PenLine}
            title="E-signature"
            description="Draw, upload, or type your signature — it then appears above your name line on SF forms."
          />
          <CardContent>
            <Link href="/profile/signature">
              <Button variant="outline">Manage my signature</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
