import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { refreshAuthSession } from '../auth/authSession';

export function useSessionRefresh({
  auto = false,
  enabled = true,
  minValidityMs = 60 * 1000,
} = {}) {
  const { isAuthenticated } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshSession = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled || !isAuthenticated) {
        return null;
      }

      setIsRefreshing(true);
      try {
        return await refreshAuthSession({ force, minValidityMs });
      } finally {
        setIsRefreshing(false);
      }
    },
    [enabled, isAuthenticated, minValidityMs]
  );

  useEffect(() => {
    if (!auto || !enabled || !isAuthenticated) {
      return;
    }

    refreshSession();
  }, [auto, enabled, isAuthenticated, refreshSession]);

  return {
    isRefreshing,
    refreshSession,
  };
}
