import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { labApi } from "@/api/services";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const PATHNAME = "/faculty/labs";

export default function FacultyLabs() {
  const query = useQuery({
    queryKey: ["faculty-labs"],
    queryFn: () => labApi.list(PATHNAME),
  });

  const labs = query.data?.items ?? [];

  return (
    <AppLayout>
      <div className="container space-y-6 px-3 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-accent">Labs</p>
            <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">Manage Labs</h1>
            <p className="mt-1 text-muted-foreground">Create DSA and DBMS labs of numbered experiments.</p>
          </div>
          <Button asChild>
            <Link to="/faculty/labs/create">New lab</Link>
          </Button>
        </div>

        {query.isLoading ? (
          <Card className="p-6 text-center text-muted-foreground">Loading…</Card>
        ) : labs.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">You haven't created any labs yet.</Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {labs.map((lab) => (
              <Card key={lab.id} className="profile-card space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-accent">{lab.subject}</p>
                    <h2 className="mt-1 font-display text-xl font-bold">{lab.title}</h2>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge className="rounded-none">{lab.kind}</Badge>
                    <Badge variant="outline" className="rounded-none">{lab.lifecycleState}</Badge>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {lab.experiments.length} experiment{lab.experiments.length === 1 ? "" : "s"}
                </div>
                <Button asChild size="sm" variant="outline" className="w-fit">
                  <Link to={`/faculty/labs/${lab.id}/edit`}>Edit</Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
