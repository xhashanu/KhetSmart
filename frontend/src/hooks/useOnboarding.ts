import { useCallback, useEffect, useState } from "react";

const LOCATION_STEP_KEY = "khetsmart_onboarding_location_done";

function readLocationDone(): boolean {
  try {
    return sessionStorage.getItem(LOCATION_STEP_KEY) === "1";
  } catch {
    return false;
  }
}

export type OnboardingPhase = "location" | "auth" | "app";

export function useOnboarding(shouldMarkLocationDone: boolean, authReady: boolean) {
  const [locationDone, setLocationDone] = useState(readLocationDone);

  const completeLocationStep = useCallback(() => {
    setLocationDone(true);
    try {
      sessionStorage.setItem(LOCATION_STEP_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (shouldMarkLocationDone && !locationDone) {
      completeLocationStep();
    }
  }, [shouldMarkLocationDone, locationDone, completeLocationStep]);

  let phase: OnboardingPhase = "app";
  if (!authReady) {
    phase = "auth";
  } else if (!locationDone) {
    phase = "location";
  }

  return {
    phase,
    locationDone,
    completeLocationStep,
  };
}
