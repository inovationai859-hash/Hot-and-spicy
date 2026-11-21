'use client';

import React, { useEffect, useRef } from 'react';

interface InkTransitionHostProps {
  routeKey: string;
}

/**
 * Client-only singleton mount for the WebGL2 ink-bleed theme controller.
 * StrictMode-safe, performs dynamic import strictly inside useEffect, and
 * calls refresh() across route/view transitions while keeping one controller alive.
 */
export const InkTransitionHost: React.FC<InkTransitionHostProps> = ({ routeKey }) => {
  const controllerRef = useRef<typeof import('../ink/inkTransition')['inkTransition'] | null>(null);
  const initialRouteRef = useRef(routeKey);

  useEffect(() => {
    let active = true;
    let mountedCtrl: typeof import('../ink/inkTransition')['inkTransition'] | null = null;

    import('../ink/inkTransition').then(({ inkTransition }) => {
      if (!active) return;
      mountedCtrl = inkTransition;
      controllerRef.current = inkTransition;
      inkTransition.mount();
    });

    return () => {
      active = false;
      mountedCtrl?.unmount();
    };
  }, []);

  useEffect(() => {
    if (routeKey === initialRouteRef.current) return;
    initialRouteRef.current = routeKey;
    const ctrl = controllerRef.current;
    if (ctrl) {
      window.requestAnimationFrame(() => {
        ctrl.refresh();
      });
    }
  }, [routeKey]);

  return null;
};
