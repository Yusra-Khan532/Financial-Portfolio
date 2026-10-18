import { startPremiumReportPolling } from './premiumReportPolling';
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
let stop;
beforeEach(() => jest.useFakeTimers());
afterEach(() => { stop?.(); stop = undefined; jest.clearAllTimers(); jest.useRealTimers(); });
const callbacks = () => ({ onData: jest.fn(), onRetry: jest.fn(), onError: jest.fn() });

test('recovers a failed request, polls generation, then stops on completion', async () => {
  const events = callbacks();
  const load = jest.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ state: 'generating' }).mockResolvedValueOnce({ state: 'ready' });
  stop = startPremiumReportPolling({ load, ...events }); await flush();
  expect(events.onRetry).toHaveBeenCalledWith(2500);
  jest.advanceTimersByTime(2500); await flush();
  expect(events.onData).toHaveBeenLastCalledWith({ state: 'generating' });
  jest.advanceTimersByTime(2500); await flush();
  expect(events.onData).toHaveBeenLastCalledWith({ state: 'ready' });
  jest.advanceTimersByTime(30000); await flush();
  expect(load).toHaveBeenCalledTimes(3); expect(events.onError).not.toHaveBeenCalled();
});

test.each([401, 403, 404, 422])('stops on permanent HTTP %s errors', async (status) => {
  const events = callbacks(); const error = Object.assign(new Error('Permanent'), { status });
  const load = jest.fn().mockRejectedValue(error);
  stop = startPremiumReportPolling({ load, ...events }); await flush();
  jest.advanceTimersByTime(30000); await flush();
  expect(events.onError).toHaveBeenCalledWith(error);
  expect(events.onRetry).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(1);
});

test.each([429, 502, 503])('backs off and retries HTTP %s', async (status) => {
  const events = callbacks(); const load = jest.fn().mockRejectedValue(Object.assign(new Error('Temporary'), { status }));
  stop = startPremiumReportPolling({ load, ...events }); await flush();
  for (const delay of [2500, 5000, 10000, 15000]) { jest.advanceTimersByTime(delay); await flush(); }
  expect(events.onRetry.mock.calls.map(([delay]) => delay)).toEqual([2500,5000,10000,15000,15000]);
});

test('times out a hung fetch and retries', async () => {
  const events = callbacks();
  const load = jest.fn((signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  stop = startPremiumReportPolling({ load, ...events });
  jest.advanceTimersByTime(20000); await flush();
  expect(events.onRetry).toHaveBeenCalledWith(2500);
  jest.advanceTimersByTime(2500); await flush(); expect(load).toHaveBeenCalledTimes(2);
});

test('unmount aborts the request and prevents further polls', async () => {
  const events = callbacks(); let signal;
  const load = jest.fn((requestSignal) => { signal = requestSignal; return new Promise(() => {}); });
  stop = startPremiumReportPolling({ load, ...events }); stop();
  expect(signal.aborted).toBe(true);
  jest.advanceTimersByTime(60000); await flush();
  expect(load).toHaveBeenCalledTimes(1); expect(events.onRetry).not.toHaveBeenCalled();
});
