import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

interface AppLayoutProps {
  children: React.ReactNode;
  hideNavbar?: boolean;
  hideFooter?: boolean;
}

export function AppLayout({
  children,
  hideNavbar = false,
  hideFooter = false,
}: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {!hideNavbar && <Navbar />}
      <main className="flex-1 animate-fade-in">{children}</main>
      {!hideFooter && <Footer />}
    </div>
  );
}
