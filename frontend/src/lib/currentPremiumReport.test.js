import { rememberPremiumReport, currentPremiumReport, snapshotPDFRequest } from './currentPremiumReport';
const report = (id) => ({ id, state:'ready', snapshotReceipt:'signed-receipt', snapshotExpiresAt:new Date(Date.now()+60000).toISOString(), rating:{final:50} });
afterEach(() => sessionStorage.clear());

test('retains only the current report, ready without a server-memory lookup', () => {
  rememberPremiumReport(report('first'));
  expect(currentPremiumReport('first').rating.final).toBe(50);
  rememberPremiumReport(report('second'));
  expect(currentPremiumReport('first')).toBeNull();
  expect(currentPremiumReport('second').id).toBe('second');
  expect(sessionStorage.length).toBe(1);
});

test('expired report is not restored', () => {
  rememberPremiumReport({...report('expired'),snapshotExpiresAt:'2000-01-01T00:00:00Z'});
  expect(currentPremiumReport('expired')).toBeNull();
  expect(sessionStorage.getItem('premium_current_report')).toBeNull();
});

test('download sends the exact signed snapshot and separates the receipt', () => {
  const current=report('pdf'); const request=snapshotPDFRequest(current);
  expect(request.receipt).toBe('signed-receipt');
  expect(request.report.snapshotReceipt).toBeUndefined();
  expect(request.report.rating).toEqual(current.rating);
  expect(current.snapshotReceipt).toBe('signed-receipt');
});


test('restores the current snapshot after a page reload without a job-status request', () => {
  rememberPremiumReport(report('reload'));
  jest.isolateModules(() => {
    const fresh = require('./currentPremiumReport');
    expect(fresh.currentPremiumReport('reload').rating.final).toBe(50);
  });
});
