"use client";

import { createContext, use, useEffect, useState } from "react";
import { RESTING_STEP, STEP_MS, nextStep } from "../domain/demo";

const DemoStep = createContext(RESTING_STEP);

/**
 * One clock for every demo on the page, so they stay in step. It starts from
 * the resting step (everything shown, as the server rendered it) and never
 * starts at all for visitors who prefer reduced motion.
 */
export function DemoClock({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState(RESTING_STEP);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setStep(nextStep), STEP_MS);
    return () => clearInterval(timer);
  }, []);

  return <DemoStep value={step}>{children}</DemoStep>;
}

export function useDemoStep(): number {
  return use(DemoStep);
}
