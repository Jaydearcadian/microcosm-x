"use client";

import "@/app/views-sbx.css";

import { OnboardingWizard } from "@/components/app/OnboardingWizard";

/* The wizard is the whole of this view: it is not a card inside a card, so
   nothing wraps it but the shell's .app-view. */
export function OnboardingView() {
  return (
    <div className="app-view">
      <OnboardingWizard embedded />
    </div>
  );
}
