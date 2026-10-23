// src/hooks/useIsMobile.ts
// True on phone-sized screens. Layout is inline-styled, so components branch
// on this instead of CSS media queries.

import { useEffect, useState } from "react";

export const MOBILE_QUERY = "(max-width: 768px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
