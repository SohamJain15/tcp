import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { DEPARTMENTS } from "@/api/types";
import { DEPARTMENT_ICONS, splitDepartmentName } from "@/lib/department-icons";

/**
 * Landing page for institute leadership: one card per canonical department.
 *
 * Deliberately carries no statistics. The department overview iterates every contest with two
 * database reads each, so painting twelve cards with live figures would run the heaviest query on the
 * platform twelve times before the page could render. The aggregation runs once, for the department
 * actually opened.
 */
export default function AdminDashboard() {
  return (
    <AppLayout>
      <div className="container space-y-6 py-8">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold">Administration</h1>
          <p className="text-sm text-muted-foreground">
            Read-only analytics for every department. Select a department to view participation,
            activity and contest engagement.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.map((department) => {
            const Icon = DEPARTMENT_ICONS[department];
            const { programme, title } = splitDepartmentName(department);

            return (
              <Link
                key={department}
                to={`/admin/departments/${encodeURIComponent(department)}`}
                className="group focus-visible:outline-none"
              >
                <Card className="card-interactive flex h-full flex-col justify-between border border-border bg-background p-5 shadow-none transition-colors group-hover:border-accent group-focus-visible:border-accent">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border text-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {programme}
                      </div>
                      <div className="mt-1 font-display text-base font-semibold leading-snug">{title}</div>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center gap-1 text-sm text-muted-foreground transition-colors group-hover:text-accent">
                    View analytics
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
