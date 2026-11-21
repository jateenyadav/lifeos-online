import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiRequest } from '../api.js';

/** Shared plumbing for the Money space: one call() that adds /money, and a refresh counter. */
export const MoneyContext = createContext(null);

export function useMoneyClient(onSessionExpired) {
  const expired = useRef(onSessionExpired);
  useEffect(() => {
    expired.current = onSessionExpired;
  }, [onSessionExpired]);
  const [version, setVersion] = useState(0);
  const call = useCallback(async (path, options = {}) => {
    try {
      return await apiRequest(`/money${path}`, options);
    } catch (failure) {
      if (failure.status === 401) expired.current?.();
      throw failure;
    }
  }, []);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  return { call, version, refresh };
}

export const useMoney = () => useContext(MoneyContext);

/** Loads a GET path and reloads it whenever the path or the shared version changes. */
export function useLoad(path) {
  const { call, version } = useMoney();
  const [again, setAgain] = useState(0);
  const key = path ? `${path}|${version}|${again}` : null;
  const [state, setState] = useState({ data: null, error: '', key: null });
  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    call(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: '', key });
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            error: failure.message,
            key,
          }));
      });
    return () => controller.abort();
  }, [key, path, call]);
  return {
    data: state.data,
    error: state.error,
    loading: Boolean(key) && state.key !== key,
    reload: () => setAgain((value) => value + 1),
  };
}

/** Runs one change at a time and reports errors in plain words. */
export function useAction() {
  const { call, refresh } = useMoney();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const run = useCallback(
    async (path, options, { keep = false } = {}) => {
      if (locked.current) return null;
      locked.current = true;
      setBusy(true);
      setError('');
      try {
        const result = await call(path, options);
        if (!keep) refresh();
        return result ?? true;
      } catch (failure) {
        setError(failure.message);
        return null;
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [call, refresh],
  );
  return { run, busy, error, setError };
}

/** Builds a query string, skipping empty values. */
export function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== '' && value != null && value !== false)
      search.set(key, value === true ? '1' : value);
  const text = search.toString();
  return text ? `?${text}` : '';
}
