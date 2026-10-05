import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client.js';

/**
 * Minimal data hook: GETs `url` and exposes { data, loading, error, refetch }.
 * Pass `deps` to re-run when filters change.
 */
export function useFetch(url, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(() => {
    let active = true;
    setLoading(true);
    api
      .get(url)
      .then(({ data }) => active && setData(data))
      .catch((e) => active && setError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const cleanup = refetch();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch, setData };
}
