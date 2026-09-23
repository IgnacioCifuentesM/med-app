import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../lib/api';
export function useResource(loader) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current; setState(s => ({ ...s, loading: true, error: '' }));
    try { const data = await loader(); if (request === generation.current) setState({ data, error: '', loading: false }); return data; }
    catch (error) { if (request === generation.current) setState(s => ({ ...s, error: friendlyError(error), loading: false })); return null; }
  }, [loader]);
  useEffect(() => { const counter = generation; const timer = setTimeout(() => { void reload(); }, 0); return () => { clearTimeout(timer); counter.current++; }; }, [reload]);
  return { ...state, reload };
}
