import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentResearch } from './AgentResearch';
import type { ResearchResult, ResearchStatus } from '@/types/agent';

// No provider, portfolio, or market endpoint is called by these interaction tests.
const mocks = vi.hoisted(() => ({ actor: 'actor-a' as string | undefined, status: vi.fn(), research: vi.fn() }));
vi.mock('@/api/agent', () => ({ agentApi: { status: mocks.status, research: mocks.research } }));
vi.mock('@/api/client', () => ({ getErrorMessage: (error: Error) => error.message }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { session: { user: { id: string } } | null }) => unknown) => select({ session: mocks.actor ? { user: { id: mocks.actor } } : null }),
}));

const AVAILABLE: ResearchStatus = {
  enabled: true, provider: 'openai', model: 'test-model', persistence: 'none',
  tools: [{ id: 'quotes', label: 'Market quotes', description: 'Dated market observations' }],
  limits: { maxSymbols: 4, maxQuestionLength: 1200, maxDurationMs: 90000, maxModelCalls: 3 },
};
const RESULT: ResearchResult = {
  id: 'test-run-001', status: 'completed', answer: 'Test answer supported by the supplied fixture.',
  claims: [{ text: 'A finding tied to one dated source.', sourceIds: ['S1'] }],
  sources: [{
    id: 'S1', title: 'AAPL quote evidence', kind: 'quotes', symbol: 'AAPL',
    asOf: '2026-10-04T14:00:00Z', observedAt: '2026-10-04T14:15:00Z',
    content: 'MOCK EVIDENCE ONLY: a dated observation for the interaction test.', contentHash: 'test-source-hash',
  }],
  steps: [
    { tool: 'quotes', status: 'completed', detail: 'Read one supplied quote fixture.' },
    { tool: 'verification', status: 'completed', detail: 'Checked the source reference.' },
  ],
  warnings: ['This fixture contains one observation, not a historical series.'],
  verification: { status: 'passed', policy: 'test-policy', checkedClaims: 1, method: 'separate_model_judgment' },
  receipt: {
    provider: 'openai', model: 'test-model', requestHash: 'test-request-hash', evidenceHash: 'test-evidence-hash', answerHash: 'test-answer-hash',
    generatedAt: '2026-10-04T14:16:00Z', latencyMs: 1250, modelCalls: 3,
    usage: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 }, executionAuthorized: false, persistence: 'none',
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <MemoryRouter><QueryClientProvider client={client}><AgentResearch /></QueryClientProvider></MemoryRouter>;
  const view = render(tree());
  return { ...view, refreshActor: () => view.rerender(tree()) };
}
async function ready() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Build research brief' })).toBeEnabled());
}
function setTask(question = 'Compare the available evidence for these symbols.', symbols = 'AAPL, MSFT') {
  fireEvent.change(screen.getByLabelText(/^Question/), { target: { value: question } });
  fireEvent.change(screen.getByLabelText('Ticker symbols'), { target: { value: symbols } });
}
function submitForm() {
  fireEvent.submit(screen.getByLabelText(/^Question/).closest('form')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor = 'actor-a';
  mocks.status.mockResolvedValue(AVAILABLE);
  mocks.research.mockResolvedValue(RESULT);
});
afterEach(() => vi.useRealTimers());

describe('Agent research access and validation', () => {
  it('offers guests sign-in while keeping provider reads and research disabled', () => {
    mocks.actor = undefined;
    setup();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('button', { name: 'Build research brief' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Include my saved portfolio/ })).toBeDisabled();
    setTask();
    submitForm();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.research).not.toHaveBeenCalled();
  });

  it('disables execution when the authenticated provider is unavailable', async () => {
    mocks.status.mockResolvedValue({ ...AVAILABLE, enabled: false, provider: null, model: null });
    setup();
    expect(await screen.findByText(/research provider is not configured/)).toBeInTheDocument();
    const run = screen.getByRole('button', { name: 'Build research brief' });
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(mocks.research).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'Why?', 'AAPL', /at least 10 characters/],
    ['invalid ticker', 'Compare available evidence for these companies.', 'AAP$L', /valid ticker symbols/],
    ['too many tickers', 'Compare available evidence for these companies.', 'AAPL, MSFT, NVDA, AMD, IBM', /up to 4 valid ticker symbols/],
    ['empty scope', 'Compare available evidence for these companies.', '', /Add a ticker or include your saved portfolio/],
  ])('rejects %s without a research request', async (_name, question, symbols, message) => {
    setup(); await ready(); setTask(question, symbols); submitForm();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(mocks.research).not.toHaveBeenCalled();
  });
});

describe('Agent research request lifecycle', () => {
  it('normalizes the scope and prevents duplicate submissions while a request is in flight', async () => {
    const request = deferred<ResearchResult>(); mocks.research.mockReturnValue(request.promise);
    setup(); await ready(); setTask('  Compare the available evidence for these symbols.  ', 'aapl, AAPL msft');
    submitForm(); submitForm();
    expect(mocks.research).toHaveBeenCalledOnce();
    expect(mocks.research).toHaveBeenCalledWith({ question: 'Compare the available evidence for these symbols.', symbols: ['AAPL', 'MSFT'], includePortfolio: false });
    expect(screen.getByRole('button', { name: 'Research running' })).toBeDisabled();
    expect(screen.getByLabelText(/^Question/)).toBeDisabled();
    await act(async () => request.resolve(RESULT));
    expect(await screen.findByText(RESULT.answer)).toBeInTheDocument();
  });

  it('surfaces a failure without automatically repeating a potentially processed request', async () => {
    mocks.research.mockRejectedValue(new Error('The connection ended.'));
    const view = setup(); await ready(); setTask(); submitForm();
    expect(await screen.findByRole('alert')).toHaveTextContent('No request was automatically repeated');
    expect(screen.getByRole('alert')).toHaveTextContent('provider may still have processed the run');
    expect(screen.getByRole('button', { name: 'Build research brief' })).toBeEnabled();
    vi.useFakeTimers();
    view.refreshActor();
    act(() => vi.advanceTimersByTime(120000));
    expect(mocks.research).toHaveBeenCalledOnce();
  });

  it('opens a cited source and exposes the receipt and tool activity in their tabs', async () => {
    setup(); await ready(); setTask(); submitForm();
    expect(await screen.findByText(RESULT.answer)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Research results' })).toHaveFocus();
    expect(screen.getByText(RESULT.warnings[0])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'S1' }));
    expect(screen.getByRole('tab', { name: /Evidence/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('AAPL quote evidence').closest('details')).toHaveAttribute('open');
    expect(screen.getByText(RESULT.sources[0].content)).toBeVisible();
    expect(screen.getByText(/Evidence hash: test-source-hash/)).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Run receipt' }));
    expect(screen.getByText('test-run-001')).toBeInTheDocument();
    expect(screen.getByText('openai / test-model')).toBeInTheDocument();
    expect(screen.getByText('1,200 tokens')).toBeInTheDocument();
    expect(screen.getByText('Read one supplied quote fixture.')).toBeInTheDocument();
    expect(screen.getByText('No account or order changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download research receipt' })).toBeEnabled();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Run receipt' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Brief' })).toHaveFocus();
    expect(screen.getByText(RESULT.answer)).toBeInTheDocument();
  });

  it('hides prior evidence and disables its download after the account changes', async () => {
    const view = setup(); await ready(); setTask(); submitForm();
    expect(await screen.findByText(RESULT.answer)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'S1' }));
    expect(screen.getByText(RESULT.sources[0].content)).toBeVisible();
    mocks.actor = 'actor-b'; view.refreshActor();
    expect(screen.queryByText(RESULT.sources[0].content)).not.toBeInTheDocument();
    expect(screen.queryByText(RESULT.answer)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download research receipt' })).toBeDisabled();
    expect(mocks.research).toHaveBeenCalledOnce();
  });

  it('discards an earlier account’s late response after an account switch', async () => {
    const request = deferred<ResearchResult>(); mocks.research.mockReturnValue(request.promise);
    const view = setup(); await ready(); setTask(); submitForm();
    mocks.actor = 'actor-b'; view.refreshActor();
    await act(async () => request.resolve(RESULT));
    await ready();
    expect(screen.queryByText(RESULT.answer)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download research receipt' })).toBeDisabled();
    expect(mocks.research).toHaveBeenCalledOnce();
  });
});
