import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/** Below the `lg` breakpoint, where the desktop split-pane and multi-column layouts stop fitting. */
const NARROW_BREAKPOINT = 1024;

const NARROW_QUERY = `(max-width: ${NARROW_BREAKPOINT - 1}px)`;
/**
 * A coarse pointer means a finger, not a mouse — real phones and tablets. Requiring it is what
 * stops a desktop user who merely shrinks their browser window from being treated as mobile and
 * ejected from a test they are legitimately sitting.
 */
const HANDHELD_QUERY = `${NARROW_QUERY} and (pointer: coarse)`;

function matches(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(query).matches;
}

function useMediaQuery(query: string): boolean {
  // Read synchronously on the first render. `useIsMobile` above resolves in an effect, so its
  // first paint always claims "desktop" — harmless for layout, but it would flash a blocked
  // page before the gate applied.
  const [isMatch, setIsMatch] = React.useState(() => matches(query));

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsMatch(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMatch;
}

/**
 * A real touch device on a small screen. Use for access decisions — blocking contests and class
 * tests, which are full-screen proctored exams that cannot run properly on a phone.
 */
export function useIsHandheld(): boolean {
  return useMediaQuery(HANDHELD_QUERY);
}

/** Narrow viewport regardless of input type. Use for layout only, never for access decisions. */
export function useIsNarrow(): boolean {
  return useMediaQuery(NARROW_QUERY);
}
