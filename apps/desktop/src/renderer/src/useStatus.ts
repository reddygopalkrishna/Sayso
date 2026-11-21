import { useEffect, useState } from 'react';
import type { AppStatus } from '../../shared/status.ts';

export function useStatus(): AppStatus | null {
  const [status, setStatus] = useState<AppStatus | null>(null);
  useEffect(() => {
    let pushed = false;
    const unsubscribe = window.sayso.onStatus((s) => {
      pushed = true;
      setStatus(s);
    });
    void window.sayso.getStatus().then((s) => {
      // A pushed update is newer than the initial fetch.
      if (!pushed) setStatus(s);
    });
    return unsubscribe;
  }, []);
  return status;
}
