import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { labApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PATHNAME = "/student/labs";

export default function StudentLabs() {
  const query = useQuery({
    queryKey: ["student-labs"],
    queryFn: () => labApi.listMine(PATHNAME),
  });

  const labs = query.data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Labs</p>
          <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Your Labs</h1>
          <p className="mt-1 text-muted-foreground">
            Work through each experiment at your own pace. Your progress is saved automatically.
          </p>
        </div>

        {query.isLoading ? (
          <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
        ) : labs.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No labs are available for you right now.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {labs.map((lab) => (
              <Card key={lab.id} className="profile-card space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">{lab.subject}</p>
                    <h2 className="mt-1 font-display text-xl font-bold">{lab.title}</h2>
                  </div>
                  <Badge className="rounded-none">{lab.kind}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {lab.experimentCount} experiment{lab.experimentCount === 1 ? "" : "s"} · {lab.totalPoints} marks
                </div>
                <Button asChild size="sm" className="w-fit">
                  <Link to={`/student/labs/${lab.id}`}>Open lab</Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
