import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("tcet-theme") as Theme | null;
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("tcet-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let scrollStopTimer: ReturnType<typeof window.setTimeout> | null = null;

    const setScrolling = () => {
      document.documentElement.classList.add("scrollbars-visible");

      if (scrollStopTimer !== null) {
        window.clearTimeout(scrollStopTimer);
      }

      scrollStopTimer = window.setTimeout(() => {
        document.documentElement.classList.remove("scrollbars-visible");
        scrollStopTimer = null;
      }, 700);
    };

    const handleScroll = () => {
      setScrolling();
    };

    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("wheel", setScrolling, { passive: true });
    window.addEventListener("touchmove", setScrolling, { passive: true });
    window.addEventListener("pointerdown", setScrolling, { passive: true });

    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("wheel", setScrolling);
      window.removeEventListener("touchmove", setScrolling);
      window.removeEventListener("pointerdown", setScrolling);
      if (scrollStopTimer !== null) {
        window.clearTimeout(scrollStopTimer);
      }
      document.documentElement.classList.remove("scrollbars-visible");
    };
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, toggle: () => setTheme(t => t === "dark" ? "light" : "dark") }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
