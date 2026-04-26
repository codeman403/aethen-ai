import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HomePage from '../page';

// Mock the API calls and next/link
vi.mock('@/lib/api', () => ({
  fetchDashboardStats: vi.fn().mockResolvedValue({
    total_sessions: 100,
    failure_breakdown: { memory: 10, tool_misfire: 5, hallucination: 2, blind_spot: 1 },
    recent_sessions: 20,
    daily_counts: [1, 2, 3, 4, 5, 6, 7],
    reliability_score: 95
  }),
  pullLangfuseTraces: vi.fn()
}));

vi.mock('next/link', () => ({
  default: ({ children }: any) => <div>{children}</div>
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Activity: () => <div data-testid="icon-activity" />,
  BrainCircuit: () => <div />,
  Wrench: () => <div />,
  ScanSearch: () => <div />,
  ShieldAlert: () => <div />,
  ArrowUpRight: () => <div />,
  ArrowDownRight: () => <div />,
  RefreshCw: () => <div />,
  Zap: () => <div />,
  ChevronRight: () => <div />
}));

describe('Dashboard HomePage', () => {
  it('renders the overview heading and cards', async () => {
    render(<HomePage />);
    expect(await screen.findByText('Platform Overview')).toBeTruthy();
    expect(await screen.findByText('Total Traces')).toBeTruthy();
    expect(await screen.findByText('Memory Failures')).toBeTruthy();
  });
});