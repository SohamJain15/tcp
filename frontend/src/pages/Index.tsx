import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Code2, Trophy, BookOpen, Sparkles, LogIn } from "lucide-react";
import { userApi } from "@/api/services";
import { getHomePathForRole } from "@/lib/role-routing";
import { getMockSsoLoginUrl } from "@/lib/sso";

export default function Index() {
  const userQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => userApi.me("/", { suppressAuthRedirect: true }),
    retry: false,
    staleTime: 30_000,
  });

  if (userQuery.data?.user.role) {
    return <Navigate to={getHomePathForRole(userQuery.data.user.role)} replace />;
  }

  return (
    <AppLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero text-primary-foreground dark:bg-card dark:text-foreground">
        <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />
        <div className="container relative py-20 md:py-28 text-center">
          <p className="font-deva text-accent text-lg md:text-xl">॥ शास्त्रं कोडः तीर्थं चेतः ॥</p>
          <h1 className="font-display text-4xl md:text-6xl font-bold mt-4 max-w-3xl mx-auto leading-tight">
            The TCET <span className="text-accent">Coding Platform</span>
          </h1>
          <p className="mt-5 text-lg md:text-xl text-primary-foreground/80 dark:text-muted-foreground max-w-2xl mx-auto">
            Where TCET students sharpen their craft and faculty cultivate the next generation of engineers.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <a href={getMockSsoLoginUrl()}>
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold w-64">
                <LogIn className="h-5 w-5 mr-2" /> Sign in with CoE SSO
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-accent text-sm font-semibold uppercase tracking-widest">Built for TCET</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold mt-2">Everything a coder needs, in one place.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Code2, title: "Curated Problems", desc: "From classic DS to advanced graph theory, hand-picked by TCET faculty." },
            { icon: Trophy, title: "Live Leaderboards", desc: "Compete with peers and climb the ranks across semester contests." },
            { icon: BookOpen, title: "Faculty Tools", desc: "Create, manage, and review problems with detailed submission analytics." },
          ].map(f => (
            <Card key={f.title} className="p-6 shadow-card hover:shadow-elevated transition-all hover:-translate-y-1">
              <div className="h-12 w-12 rounded-lg bg-gradient-accent flex items-center justify-center mb-4">
                <f.icon className="h-6 w-6 text-accent-foreground" />
              </div>
              <h3 className="font-display text-xl font-bold">{f.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="container pb-20">
        <Card className="p-10 shadow-elevated bg-gradient-hero text-primary-foreground dark:bg-card dark:text-foreground text-center">
          <Sparkles className="h-8 w-8 text-accent mx-auto" />
          <h2 className="font-display text-3xl md:text-4xl font-bold mt-3">Begin your journey today.</h2>
          <p className="text-primary-foreground/80 dark:text-muted-foreground mt-2 max-w-xl mx-auto">Join hundreds of TCET students already building their problem-solving muscle.</p>
          <a href={getMockSsoLoginUrl()}>
            <Button size="lg" className="mt-6 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold">
              Continue to Platform
            </Button>
          </a>
        </Card>
      </section>
    </AppLayout>
  );
}
