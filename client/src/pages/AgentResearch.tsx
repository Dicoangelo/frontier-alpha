import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Check, ChevronRight, Download, FileText, ListChecks, Play, RotateCcw, Search, Terminal, Workflow } from 'lucide-react';
import { agentApi } from '@/api/agent';
import { getErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/shared/Button';
import type { ResearchResult, ResearchSource } from '@/types/agent';
import './agent-research.css';

const presets = [
  { label: 'Compare momentum', symbols: 'AAPL, MSFT', question: 'Compare the recent price momentum of these companies. Cite the available history and explain limitations.' },
  { label: 'Review concentration', symbols: '', question: 'Review concentration in my saved portfolio. Identify the largest exposures and what additional information is needed.', portfolio: true },
  { label: 'Inspect volatility', symbols: 'NVDA', question: 'Summarize the available price history and volatility signals. Highlight missing or stale evidence.' },
];
const tabs = ['Brief', 'Evidence', 'Run receipt'] as const;
type ResultTab = typeof tabs[number];
const toolLabels: Record<string, string> = { portfolio: 'Portfolio', quotes: 'Market quotes', price_history: 'Price history', factor_exposures: 'Price factors', plan: 'Research plan', synthesis: 'Draft findings', verification: 'Support check' };
function dateLabel(value: string | null) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Date unavailable';
}
function EvidenceCard({ source, selected }: { source: ResearchSource; selected: boolean }) {
  return <details className="agent-source" open={selected || undefined} id={`evidence-${source.id}`}>
    <summary><FileText size={17} /><span><strong>{source.title}</strong><small>{source.id} · {toolLabels[source.kind] || source.kind}</small></span><ChevronRight size={16} /></summary>
    <div className="agent-source-content"><dl><div><dt>Source date</dt><dd>{dateLabel(source.asOf)}</dd></div><div><dt>Retrieved</dt><dd>{dateLabel(source.observedAt)}</dd></div></dl><pre>{source.content}</pre><p className="agent-hash">Evidence hash: {source.contentHash}</p></div>
  </details>;
}

export function AgentResearch() {
  const [params] = useSearchParams();
  return <ResearchDesk key={params.toString()} params={params} />;
}

function ResearchDesk({ params }: { params: URLSearchParams }) {
  const session = useAuthStore(state => state.session);
  const actor = session?.user?.id;
  const [question, setQuestion] = useState(() => (params.get('question') || '').slice(0, 1200));
  const [symbols, setSymbols] = useState(() => (params.get('symbols') ?? (params.has('question') ? '' : 'AAPL, MSFT')).slice(0, 80));
  const [includePortfolio, setIncludePortfolio] = useState(false);
  const [run, setRun] = useState<{ owner: string; result: ResearchResult; question: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const requestActor = useRef<string | undefined>(actor);
  useEffect(() => { requestActor.current = actor; }, [actor]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ResultTab>('Brief');
  const [selectedSource, setSelectedSource] = useState('');
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);
  const status = useQuery({ queryKey: ['agent-status', actor], queryFn: agentApi.status, enabled: Boolean(actor), retry: false, staleTime: 60_000 });
  const result = run && run.owner === actor ? run.result : null;
  const maxSymbols = status.data?.limits.maxSymbols || 4;
  const maxQuestion = status.data?.limits.maxQuestionLength || 1200;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !actor) return;
    const parsed = [...new Set(symbols.split(/[\s,]+/).filter(Boolean).map(s => s.toUpperCase()))];
    if (question.trim().length < 10) { setError('Enter a research question with at least 10 characters.'); return; }
    if (parsed.length > maxSymbols || parsed.some(s => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(s))) { setError(`Enter up to ${maxSymbols} valid ticker symbols, separated by commas.`); return; }
    if (!parsed.length && !includePortfolio) { setError('Add a ticker or include your saved portfolio.'); return; }
    pending.current = true; setBusy(true); setError(''); setRun(null);
    try {
      const response = await agentApi.research({ question: question.trim(), symbols: parsed, includePortfolio });
      if (requestActor.current !== actor) return;
      setRun({ owner: actor, result: response, question: question.trim() }); setActiveTab('Brief');
      resultsRef.current?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 767px)').matches) resultsRef.current?.scrollIntoView?.({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (cause) {
      if (requestActor.current === actor) setError(`${getErrorMessage(cause)} No request was automatically repeated. If the connection ended, the provider may still have processed the run.`);
    } finally { pending.current = false; setBusy(false); }
  }
  function exportRun() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `frontier-research-${result.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openSource(id: string) { setSelectedSource(id); setActiveTab('Evidence'); resultsRef.current?.focus({ preventScroll: true }); }

  return <div className="agent-desk" data-testid="visual-agent-ready">
    <header className="agent-page-heading"><div><p className="agent-kicker">Research / Agent desk</p><h1>Agent research</h1><p>Build an evidence-backed brief. Inspect the sources and the work behind it.</p></div><Button variant="secondary" onClick={() => setIntegrationOpen(value => !value)} aria-expanded={integrationOpen}><Terminal size={16} />CLI &amp; MCP</Button></header>
    <div className="agent-operating-strip"><span><Workflow size={15} />Research only</span><span>{status.data?.model || 'Authenticated research'}</span><span>Up to {maxSymbols} symbols</span><span>Sources → findings → support check</span></div>
    {integrationOpen && <section className="agent-integration" aria-label="CLI and MCP integration"><div><h2>One research interface</h2><p>The command line and MCP server use the same authenticated research endpoint. Use a Frontier API key with read permission; provider keys stay on the server.</p><Link to="/settings">Manage API keys <ArrowUpRight size={14} /></Link></div><div><code>node scripts/frontier-agent.mjs research --symbols AAPL,MSFT --question "Compare price momentum"</code><code>node scripts/frontier-agent.mjs mcp</code><p>Set FRONTIER_API_KEY and FRONTIER_API_URL in your local environment. Runs are synchronous and are not saved by the service.</p></div></section>}
    {!actor && <div className="agent-signin"><div><strong>Research connected to your workspace</strong><p>Sign in to run a brief using current market evidence and, if selected, your saved portfolio.</p></div><Link to="/login">Sign in <ArrowUpRight size={15} /></Link></div>}
    {actor && status.isError && <div className="agent-error" role="alert">Unable to load the research service. <button type="button" onClick={() => void status.refetch()}>Check again</button></div>}
    {actor && status.data && !status.data.enabled && <div className="agent-error" role="status">The research provider is not configured. Your existing portfolio and market tools remain available.</div>}
    <div className="agent-workspace">
      <aside className="agent-task-panel" aria-label="Research task"><div className="agent-panel-heading"><h2>Research task</h2><Search size={17} /></div>
        <form onSubmit={submit} noValidate><fieldset disabled={busy}><legend className="sr-only">Configure a research run</legend>
          <label htmlFor="agent-question">Question <span>{question.length}/{maxQuestion}</span></label><textarea id="agent-question" value={question} maxLength={maxQuestion} rows={6} onChange={event => setQuestion(event.target.value)} placeholder="What would you like to investigate?" aria-describedby="agent-scope" />
          <label htmlFor="agent-symbols">Ticker symbols</label><input id="agent-symbols" value={symbols} maxLength={80} onChange={event => setSymbols(event.target.value.toUpperCase())} placeholder="AAPL, MSFT" autoCapitalize="characters" spellCheck={false} /><p className="agent-field-note">Separate up to {maxSymbols} symbols with commas.</p>
          <label className="agent-check"><input type="checkbox" checked={includePortfolio} onChange={event => setIncludePortfolio(event.target.checked)} disabled={!actor} /><span>Include my saved portfolio<small>Send a scoped holdings snapshot to the research provider.</small></span></label>
          <p id="agent-scope" className="agent-field-note">The agent can inspect data and produce research. It cannot place orders or change your portfolio.</p>
        </fieldset>
        {error && <p className="agent-error" role="alert">{error}</p>}
        <Button type="submit" className="agent-run-button" disabled={!actor || !status.data?.enabled || status.isFetching} isLoading={busy}><Play size={15} />{busy ? 'Research running' : 'Build research brief'}</Button>
        </form>
        <div className="agent-presets"><h3>Start with a question</h3>{presets.map(preset => <button type="button" key={preset.label} disabled={busy} onClick={() => { setQuestion(preset.question); setSymbols(preset.symbols); setIncludePortfolio(Boolean(preset.portfolio && actor)); setError(''); }}><span>{preset.label}</span><ArrowUpRight size={15} /></button>)}</div>
        <div className="agent-tool-list"><h3>Available research tools</h3>{(status.data?.tools || [{ id: 'portfolio', label: 'Portfolio', description: 'Your selected holdings snapshot' }, { id: 'quotes', label: 'Market quotes', description: 'Dated market observations' }, { id: 'price_history', label: 'Price history', description: 'Historical daily closes' }, { id: 'factor_exposures', label: 'Price factors', description: 'Signals derived from available history' }]).map(tool => <div key={tool.id}><span className="agent-tool-dot" /><span>{tool.label}<small>{tool.description}</small></span></div>)}</div>
      </aside>
      <section className="agent-results" ref={resultsRef} tabIndex={-1} aria-label="Research results" aria-busy={busy}>
        <div className="agent-result-toolbar"><div role="tablist" aria-label="Research result views">{tabs.map((tab, index) => <button type="button" key={tab} role="tab" id={`agent-tab-${index}`} aria-selected={activeTab === tab} aria-controls="agent-result-panel" tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; setActiveTab(tabs[next]); document.getElementById(`agent-tab-${next}`)?.focus(); }}>{tab}{tab === 'Evidence' && result && <span>{result.sources.length}</span>}</button>)}</div><button type="button" className="workspace-icon-button" onClick={exportRun} disabled={!result || busy} aria-label="Download research receipt" title="Download receipt"><Download size={17} /></button></div>
        <div id="agent-result-panel" role="tabpanel" aria-labelledby={`agent-tab-${tabs.indexOf(activeTab)}`} className="agent-result-body">
          {busy ? <div className="agent-empty" role="status"><Workflow size={30} /><h2>Research is running</h2><p>The agent is selecting tools, collecting evidence, and checking its findings. Keep this view open; runs are not stored for later recovery.</p><div className="agent-busy-line" /></div> : !result ? <div className="agent-empty"><ListChecks size={32} /><h2>From question to research brief</h2><p>Choose a question and scope. Each run returns dated evidence, supported findings, and a receipt of the tools used.</p><ol><li><span>01</span><div><strong>Gather evidence</strong><p>Read selected market data and authorized holdings.</p></div></li><li><span>02</span><div><strong>Review the findings</strong><p>Follow each source reference and see missing data.</p></div></li><li><span>03</span><div><strong>Inspect the receipt</strong><p>Check model, timing, usage, and support review.</p></div></li></ol></div> : <>
            <div className="agent-run-summary"><span className={`agent-outcome ${result.status}`}><Check size={14} />{result.status === 'completed' ? 'Research complete' : result.status === 'partial' ? 'Partial coverage' : 'Answer withheld'}</span><small>{dateLabel(result.receipt.generatedAt)}</small></div>
            {activeTab === 'Brief' && <><h2 className="agent-brief-question">{run?.question}</h2>{result.claims.length === 0 && <p className="agent-answer">{result.answer}</p>}{result.claims.length > 0 && <div className="agent-findings"><h3>Supported findings</h3>{result.claims.map((claim, index) => <article key={index}><span className="agent-finding-index">{String(index + 1).padStart(2, '0')}</span><div><p>{claim.text}</p><div className="agent-citations">{claim.sourceIds.map(id => <button type="button" key={id} onClick={() => openSource(id)}><FileText size={12} />{id}</button>)}</div></div></article>)}</div>}<div className="agent-check-note"><ListChecks size={17} /><div><strong>{result.verification.status === 'passed' ? 'Separate support check passed' : 'Support check withheld the answer'}</strong><p>Model review against the selected evidence. It is not independent human verification.</p></div></div></>}
            {activeTab === 'Evidence' && <><h2>Evidence used in this run</h2><p className="agent-field-note">Source dates and retrieval times are distinct. Missing or stale information limits the brief.</p><div className="agent-sources">{result.sources.map(source => <EvidenceCard key={source.id} source={source} selected={selectedSource === source.id} />)}{result.sources.length === 0 && <p>No usable sources were returned.</p>}</div></>}
            {activeTab === 'Run receipt' && <><h2>Run receipt</h2><dl className="agent-receipt"><div><dt>Run ID</dt><dd>{result.id}</dd></div><div><dt>Model</dt><dd>{result.receipt.provider} / {result.receipt.model}</dd></div><div><dt>Elapsed</dt><dd>{(result.receipt.latencyMs / 1000).toFixed(1)} seconds</dd></div><div><dt>Model calls</dt><dd>{result.receipt.modelCalls}</dd></div><div><dt>Reported usage</dt><dd>{result.receipt.usage ? `${result.receipt.usage.totalTokens.toLocaleString()} tokens` : 'Unavailable'}</dd></div><div><dt>Support review</dt><dd>{result.verification.checkedClaims} claims · {result.verification.status}</dd></div><div><dt>Execution</dt><dd>No account or order changes</dd></div><div><dt>Storage</dt><dd>This view only · download to retain</dd></div></dl><h3>Tool activity</h3><ol className="agent-step-list">{result.steps.map((step, index) => <li key={index}><span>{index + 1}</span><div><strong>{toolLabels[step.tool] || step.tool}</strong><p>{step.detail}</p></div><small>{step.status}</small></li>)}</ol><details className="agent-hashes"><summary>Evidence and policy fingerprints</summary><p>Policy: {result.verification.policy}</p><p>Request: {result.receipt.requestHash}</p><p>Evidence: {result.receipt.evidenceHash}</p><p>Answer: {result.receipt.answerHash}</p></details></>}
            {result.warnings.length > 0 && <aside className="agent-warnings"><h3>Coverage and limitations</h3><ul>{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></aside>}
            <div className="agent-result-footer"><span>{result.sources.length} sources · {result.claims.length} findings</span><button type="button" onClick={() => { setRun(null); setError(''); document.getElementById('agent-question')?.focus(); }}><RotateCcw size={14} />New brief</button></div>
          </>}
        </div>
      </section>
    </div>
  </div>;
}
