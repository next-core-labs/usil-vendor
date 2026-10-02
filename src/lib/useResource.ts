import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText } from '../api/client.ts';

export type Resource<T> = {
  data: T | null;
  error: string | null;
  /** True only on the very first load, so a refresh never blanks the screen. */
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
  /**
   * Apply a local edit after a successful write, instead of refetching. Takes
   * a value or an updater, so a poll that lands mid-edit cannot be overwritten.
   */
  set: (next: T | null | ((current: T | null) => T | null)) => void;
};

/**
 * One fetch, with the states a dashboard actually needs to render: first-load
 * skeleton, background refresh, and an error that does not throw away the rows
 * already on screen.
 */
export function useResource<T>(loader: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // A slow response from a previous render must not overwrite a newer one.
  const runId = useRef(0);
  const mounted = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (isFirst: boolean) => {
    const id = ++runId.current;
    if (isFirst) setLoading(true);
    else setRefreshing(true);
    try {
      const next = await loaderRef.current();
      if (!mounted.current || id !== runId.current) return;
      setData(next);
      setError(null);
    } catch (caught) {
      if (!mounted.current || id !== runId.current) return;
      setError(errorText(caught));
    } finally {
      if (mounted.current && id === runId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run(false), [run]);

  return { data, error, loading, refreshing, reload, set: setData };
}
