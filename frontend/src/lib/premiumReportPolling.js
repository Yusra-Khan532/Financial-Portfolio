// Retry temporary status failures without restarting the server-side calculation.
export function startPremiumReportPolling({ load, onData, onRetry, onError, intervalMs = 2500, timeoutMs = 20000 }) {
  let stopped = false;
  let timer;
  let request;
  let failures = 0;
  const poll = async () => {
    request = new AbortController();
    const timeout = setTimeout(() => request.abort(), timeoutMs);
    try {
      const data = await load(request.signal);
      if (stopped) return;
      failures = 0;
      onData(data);
      if (data.state === "generating") timer = setTimeout(poll, intervalMs);
    } catch (error) {
      if (stopped) return;
      const transient = !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
      if (transient) {
        const delay = Math.min(intervalMs * 2 ** failures++, 15000);
        onRetry(delay);
        timer = setTimeout(poll, delay);
      } else {
        onError(error);
      }
    } finally {
      clearTimeout(timeout);
    }
  };
  poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    request?.abort();
  };
}
