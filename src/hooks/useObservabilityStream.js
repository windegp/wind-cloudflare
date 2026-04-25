/**
 * Hook for real-time observability stream via Server-Sent Events
 */

import { useState, useEffect, useCallback } from 'react';

export function useObservabilityStream(enabled = true) {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;

    const clientId = Math.random().toString(36).substring(7);
    const eventSource = new EventSource(`/api/observability/stream?clientId=${clientId}`);

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed.data);
      } catch (err) {
        console.error('Failed to parse stream data:', err);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      setError('Connection lost');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [enabled]);

  const reconnect = useCallback(() => {
    setConnected(false);
    setError(null);
  }, []);

  return { data, connected, error, reconnect };
}
