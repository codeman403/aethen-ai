import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchDashboardStats } from '../api';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('fetchDashboardStats returns data on success', async () => {
    const mockData = { total_sessions: 10 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockData, error: null })
    });

    const data = await fetchDashboardStats();
    expect(data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/stats'), undefined);
  });

  it('fetchDashboardStats throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null, error: "Database error" })
    });

    await expect(fetchDashboardStats()).rejects.toThrow("Database error");
  });
});