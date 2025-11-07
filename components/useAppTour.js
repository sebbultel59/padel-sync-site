// components/useAppTour.js

import { useCallback, useEffect, useRef, useState } from 'react';

import { hasSeenOnboarding, setOnboardingSeen } from '../lib/onboarding';



export function useAppTour() {

  const [shouldStart, setShouldStart] = useState(false);

  const hasStartedRef = useRef(false);



  useEffect(() => {

    (async () => {

      const seen = await hasSeenOnboarding();

      if (!seen) setShouldStart(true);

    })();

  }, []);



  const markSeen = useCallback(() => setOnboardingSeen(), []);



  // évite double lancement

  const consumeStartFlag = useCallback(() => {

    if (hasStartedRef.current) return false;

    hasStartedRef.current = true;

    return true;

  }, []);



  return { shouldStart, consumeStartFlag, markSeen };

}

