import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api.js';

const empty = {
  notes: [],
  workouts: [],
  routines: [],
  expenses: [],
  budgets: [],
  payments: [],
  payees: [],
  trips: [],
  tripItems: [],
};

export default function useWorkspace(onSessionExpired) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const revision = useRef(0);
  const active = useRef(true);
  const expired = useRef(onSessionExpired);
  useEffect(() => {
    expired.current = onSessionExpired;
  }, [onSessionExpired]);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    apiRequest('/workspaces', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData({ ...empty, ...result });
          setLoaded(true);
        }
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setError(failure.message);
        if (failure.status === 401) expired.current?.();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      active.current = false;
      controller.abort();
    };
  }, []);

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest('/workspaces');
      if (active.current) {
        setData({ ...empty, ...result });
        setLoaded(true);
      }
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
        if (failure.status === 401) expired.current?.();
      }
    } finally {
      if (active.current) setLoading(false);
    }
  }

  async function mutate(collection, path, method, body, message) {
    if (locked.current || loading || !loaded) return null;
    locked.current = true;
    revision.current += 1;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest(`/workspaces/${collection}${path}`, {
        method,
        body,
      });
      if (!active.current) return null;
      setData((previous) => ({
        ...previous,
        [collection]:
          method === 'DELETE'
            ? previous[collection].filter((entry) => entry.id !== path.slice(1))
            : [
                result.entry,
                ...previous[collection].filter(
                  (entry) => entry.id !== result.entry.id,
                ),
              ],
      }));
      setNotice(message);
      return result?.entry || true;
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
        if (failure.status === 401) expired.current?.();
      }
      return null;
    } finally {
      locked.current = false;
      if (active.current) setSaving(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (locked.current || !loaded || document.visibilityState === 'hidden')
        return;
      const currentRevision = revision.current;
      try {
        const result = await apiRequest('/workspaces', {
          signal: controller.signal,
        });
        if (
          !controller.signal.aborted &&
          !locked.current &&
          currentRevision === revision.current
        )
          setData({ ...empty, ...result });
      } catch (failure) {
        if (!controller.signal.aborted && failure.status === 401)
          expired.current?.();
      }
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [loaded]);

  async function moneyCommand(path, body) {
    if (locked.current || loading || !loaded) return null;
    locked.current = true;
    revision.current += 1;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest(`/workspaces/money/${path}`, {
        method: 'POST',
        body,
      });
      const snapshot = await apiRequest('/workspaces');
      if (!active.current) return null;
      setData({ ...empty, ...snapshot });
      setNotice('Saved. Your money view is up to date.');
      return result.entry;
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
        if (failure.status === 401) expired.current?.();
      }
      return null;
    } finally {
      locked.current = false;
      if (active.current) setSaving(false);
    }
  }

  return {
    data,
    loading,
    loaded,
    saving,
    error,
    notice,
    reload,
    moneyCommand,
    save: (collection, values, id) =>
      mutate(
        collection,
        id ? `/${id}` : '',
        id ? 'PATCH' : 'POST',
        values,
        'Saved. Your space is up to date.',
      ),
    remove: (collection, id) =>
      mutate(collection, `/${id}`, 'DELETE', undefined, 'Entry deleted.'),
    check: (id, date, completed) =>
      mutate(
        'routines',
        `/${id}/check`,
        'POST',
        { date, completed },
        completed
          ? 'One small win. Routine complete.'
          : 'Routine marked as not done.',
      ),
  };
}
