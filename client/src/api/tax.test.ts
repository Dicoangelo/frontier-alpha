import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  api: { get: vi.fn() },
}));

import { api } from './client';
import { taxApi } from './tax';

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

describe('taxApi', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('getReport unwraps the envelope and passes the year param', async () => {
    const report = { taxYear: 2026, summary: { eventCount: 2 } };
    mockGet.mockResolvedValue({ data: report });

    const result = await taxApi.getReport(2026);

    expect(mockGet).toHaveBeenCalledWith('/tax/report', { params: { year: 2026 } });
    expect(result).toBe(report);
  });

  it('getReport omits params when no year is given', async () => {
    mockGet.mockResolvedValue({ data: {} });
    await taxApi.getReport();
    expect(mockGet).toHaveBeenCalledWith('/tax/report', { params: undefined });
  });

  it('getHarvest joins symbols into a comma-separated param', async () => {
    mockGet.mockResolvedValue({ data: { opportunities: [] } });
    await taxApi.getHarvest(['INTC', 'BA']);
    expect(mockGet).toHaveBeenCalledWith('/tax/harvest', { params: { symbols: 'INTC,BA' } });
  });

  it('getHarvest sends no params for an empty symbol list', async () => {
    mockGet.mockResolvedValue({ data: { opportunities: [] } });
    await taxApi.getHarvest([]);
    expect(mockGet).toHaveBeenCalledWith('/tax/harvest', { params: undefined });
  });

  it('getWashSales hits the wash-sales endpoint', async () => {
    mockGet.mockResolvedValue({ data: { violations: [] } });
    const result = await taxApi.getWashSales();
    expect(mockGet).toHaveBeenCalledWith('/tax/wash-sales');
    expect(result).toEqual({ violations: [] });
  });

  it('downloadReportCsv requests the csv format as a blob and triggers a download', async () => {
    const blob = new Blob(['Term,Symbol\n'], { type: 'text/csv' });
    mockGet.mockResolvedValue(blob);

    const createUrl = vi.fn(() => 'blob:mock');
    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    await taxApi.downloadReportCsv(2026);

    expect(mockGet).toHaveBeenCalledWith('/tax/report', {
      params: { year: 2026, format: 'csv' },
      responseType: 'blob',
    });
    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock');

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
