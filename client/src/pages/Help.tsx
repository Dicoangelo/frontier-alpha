import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Rocket,
  BarChart3,
  Sparkles,
  Shield,
  Calendar,
  Bell,
  BookOpen,
  MessageCircle,
  Mail,
  ExternalLink,
  HelpCircle,
  Keyboard,
} from 'lucide-react';
import {
  helpSections,
  faqs,
  searchHelp,
  getTopicById,
  metricExplanations,
  factorCategories,
  type HelpTopic,
  type FAQ,
} from '@/data/helpContent';
import { EmptyState } from '@/components/shared/EmptyState';

const sectionIcons: Record<string, typeof Rocket> = {
  'getting-started': Rocket,
  'factor-analysis': BarChart3,
  'portfolio-optimization': Sparkles,
  'risk-management': Shield,
  'earnings-oracle': Calendar,
  'alerts': Bell,
};

const kickerClass =
  'text-[10px] mono tracking-[0.3em] uppercase text-theme-muted';

export function Help() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['getting-started']));
  const [selectedTopic, setSelectedTopic] = useState<HelpTopic | null>(null);
  const [expandedFaqCategories, setExpandedFaqCategories] = useState<Set<string>>(new Set(['general']));

  // Handle hash navigation (e.g., /help#faq)
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (hash) {
      // Check if it's a topic ID
      const result = getTopicById(hash);
      if (result) {
        setSelectedTopic(result.topic);
        setExpandedSections(new Set([result.section.id]));
        return;
      }

      // Scroll to section
      const timer = setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location.hash]);

  // Search results
  const searchResults = searchQuery ? searchHelp(searchQuery) : { topics: [], faqs: [] };
  const hasSearchResults = searchResults.topics.length > 0 || searchResults.faqs.length > 0;

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const toggleFaqCategory = (category: string) => {
    setExpandedFaqCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const selectTopic = (topic: HelpTopic) => {
    setSelectedTopic(topic);
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearTopic = () => {
    setSelectedTopic(null);
    navigate('/help', { replace: true });
  };

  const openShortcutsModal = () => {
    // Trigger '?' keyboard shortcut to open the modal handled at Layout level
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true }));
  };

  // Group FAQs by category
  const faqsByCategory = faqs.reduce((acc, faq) => {
    if (!acc[faq.category]) {
      acc[faq.category] = [];
    }
    acc[faq.category].push(faq);
    return acc;
  }, {} as Record<string, FAQ[]>);

  const markdownComponents = {
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h2 className="text-2xl font-bold text-theme mt-8 mb-4 first:mt-0">{children}</h2>
    ),
    h3: ({ children }: { children?: React.ReactNode }) => (
      <h3 className="text-xl font-semibold text-theme mt-6 mb-3">{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-theme-secondary mb-4 leading-relaxed">{children}</p>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className="font-semibold text-theme">{children}</strong>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc list-inside space-y-1 mb-4 text-theme-secondary ml-4">{children}</ul>
    ),
    li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
    hr: () => <hr className="my-8 border-theme" />,
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header — family pattern */}
      <header
        className="mb-8 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <p className={kickerClass}>HELP · Documentation</p>
        <h1 className="text-3xl lg:text-4xl font-bold text-gradient-brand mt-2">
          Help Center
        </h1>
        <p className="text-theme-secondary mt-2 leading-relaxed max-w-2xl">
          Learn how to use Frontier Alpha to analyze your portfolio and make better investment decisions.
        </p>
      </header>

      {/* Search */}
      <div
        className="mb-8 animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        <div className="relative max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search help topics, metrics, or features..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-12 pr-4 py-3 bg-[var(--color-bg-tertiary)] border border-theme rounded-xl text-theme placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] mono text-sm transition-[border-color,box-shadow] duration-200"
            aria-label="Search help topics"
          />
        </div>
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="mb-8 animate-fade-in">
          {hasSearchResults ? (
            <div className="glass-slab rounded-2xl p-6">
              <p className={kickerClass}>SEARCH</p>
              <h2 className="text-lg font-bold text-theme mt-1 mb-5">
                Results for "{searchQuery}"
              </h2>

              {searchResults.topics.length > 0 && (
                <div className="mb-6">
                  <h3 className={`${kickerClass} mb-3`}>
                    Topics ({searchResults.topics.length})
                  </h3>
                  <div className="space-y-2 animate-stagger">
                    {searchResults.topics.map((topic) => (
                      <button
                        key={topic.id}
                        onClick={() => selectTopic(topic)}
                        className="glass-slab w-full flex items-center gap-3 p-4 rounded-2xl hover:border-[color:var(--color-border-hover)] text-left animate-enter animate-press animate-lift"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-theme">{topic.title}</p>
                          <p className="text-sm text-theme-secondary leading-relaxed">{topic.summary}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-theme-muted flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.faqs.length > 0 && (
                <div>
                  <h3 className={`${kickerClass} mb-3`}>
                    FAQ ({searchResults.faqs.length})
                  </h3>
                  <div className="space-y-3 animate-stagger">
                    {searchResults.faqs.map((faq, index) => (
                      <div key={index} className="glass-slab rounded-2xl p-4 animate-enter">
                        <p className="font-semibold text-theme mb-2">{faq.question}</p>
                        <p className="text-theme-secondary leading-relaxed">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<HelpCircle className="w-8 h-8" />}
              kicker="SEARCH · No Match"
              title="No results found"
              description={`We could not find anything matching "${searchQuery}". Try different keywords or browse the topics below.`}
              action={{
                label: 'Clear Search',
                onClick: () => setSearchQuery(''),
                variant: 'outline',
              }}
            />
          )}
        </div>
      )}

      {/* Topic Detail View */}
      {selectedTopic && !searchQuery && (
        <div className="mb-8 animate-fade-in">
          <button
            onClick={clearTopic}
            className="flex items-center gap-2 text-[var(--color-accent)] hover:brightness-125 mb-4 animate-press"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to all topics
          </button>

          <div className="glass-slab rounded-2xl p-8">
            <p className={kickerClass}>TOPIC</p>
            <h1 className="text-2xl font-bold text-theme mt-1 mb-2">{selectedTopic.title}</h1>
            <p className="text-theme-secondary leading-relaxed mb-6">{selectedTopic.summary}</p>

            <div className="prose prose-gray max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {selectedTopic.content}
              </ReactMarkdown>
            </div>

            {/* Related Topics */}
            {selectedTopic.relatedTopics && selectedTopic.relatedTopics.length > 0 && (
              <div className="mt-8 pt-6 border-t border-theme">
                <h3 className={`${kickerClass} mb-4`}>Related Topics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-stagger">
                  {selectedTopic.relatedTopics.map((topicId) => {
                    const result = getTopicById(topicId);
                    if (!result) return null;

                    return (
                      <button
                        key={topicId}
                        onClick={() => selectTopic(result.topic)}
                        className="glass-slab flex items-center gap-3 p-4 rounded-2xl hover:border-[color:var(--color-border-hover)] text-left animate-enter animate-press animate-lift"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-theme">{result.topic.title}</p>
                          <p className="text-sm text-theme-secondary leading-relaxed">{result.topic.summary}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-theme-muted flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content (when not searching or viewing topic) */}
      {!searchQuery && !selectedTopic && (
        <>
          {/* Quick Start Cards */}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 animate-stagger"
            style={{ animationDelay: '100ms', animationFillMode: 'both' }}
          >
            <QuickStartCard
              icon={Rocket}
              title="Getting Started"
              description="Add positions and understand the dashboard"
              onClick={() => {
                const result = getTopicById('adding-positions');
                if (result) selectTopic(result.topic);
              }}
            />
            <QuickStartCard
              icon={BarChart3}
              title="Factor Analysis"
              description="Learn about investment factors"
              onClick={() => {
                const result = getTopicById('what-are-factors');
                if (result) selectTopic(result.topic);
              }}
            />
            <QuickStartCard
              icon={Sparkles}
              title="Optimization"
              description="How to optimize your portfolio"
              onClick={() => {
                const result = getTopicById('optimization-basics');
                if (result) selectTopic(result.topic);
              }}
            />
          </div>

          {/* Help Sections */}
          <div
            className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in-up"
            style={{ animationDelay: '150ms', animationFillMode: 'both' }}
          >
            {/* Left Column - Topics */}
            <div className="lg:col-span-2 space-y-4" id="topics">
              <div className="mb-2">
                <p className={kickerClass}>BROWSE</p>
                <h2 className="text-xl font-bold text-theme mt-1">Help Topics</h2>
              </div>

              <div className="space-y-3 animate-stagger">
                {helpSections.map((section) => {
                  const Icon = sectionIcons[section.id] || BookOpen;
                  const isExpanded = expandedSections.has(section.id);

                  return (
                    <div key={section.id} className="glass-slab rounded-2xl overflow-hidden animate-enter">
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full flex items-center gap-4 p-5 hover:bg-[var(--color-bg-tertiary)] text-left animate-press"
                        aria-expanded={isExpanded}
                      >
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
                        >
                          <Icon className="w-6 h-6 text-[var(--color-accent)]" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-theme">{section.title}</h3>
                          <p className="text-sm text-theme-secondary leading-relaxed">{section.description}</p>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-theme-muted" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-theme-muted" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-theme bg-[var(--color-bg-tertiary)] divide-y divide-[var(--color-border-light)]">
                          {section.topics.map((topic) => (
                            <button
                              key={topic.id}
                              onClick={() => selectTopic(topic)}
                              className="w-full flex items-center gap-3 p-4 pl-8 hover:bg-[var(--color-bg-secondary)] text-left animate-press"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-theme">{topic.title}</p>
                                <p className="text-sm text-theme-secondary leading-relaxed">{topic.summary}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-theme-muted flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column - FAQ & Glossary */}
            <div className="space-y-6">
              {/* FAQ Section */}
              <div id="faq">
                <div className="mb-3">
                  <p className={kickerClass}>QUESTIONS</p>
                  <h2 className="text-xl font-bold text-theme mt-1">FAQ</h2>
                </div>
                <div className="glass-slab rounded-2xl divide-y divide-[var(--color-border-light)] overflow-hidden">
                  {Object.entries(faqsByCategory).map(([category, categoryFaqs]) => (
                    <div key={category}>
                      <button
                        onClick={() => toggleFaqCategory(category)}
                        className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-bg-tertiary)] animate-press"
                        aria-expanded={expandedFaqCategories.has(category)}
                      >
                        <span className="font-medium text-theme capitalize">{category}</span>
                        {expandedFaqCategories.has(category) ? (
                          <ChevronDown className="w-4 h-4 text-theme-muted" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-theme-muted" />
                        )}
                      </button>
                      {expandedFaqCategories.has(category) && (
                        <div className="px-4 pb-4 space-y-4">
                          {categoryFaqs.map((faq, index) => (
                            <div key={index}>
                              <p className="font-medium text-theme text-sm">{faq.question}</p>
                              <p className="text-sm text-theme-secondary leading-relaxed mt-1">{faq.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Metric Glossary */}
              <div id="glossary">
                <div className="mb-3">
                  <p className={kickerClass}>REFERENCE</p>
                  <h2 className="text-xl font-bold text-theme mt-1">Metric Glossary</h2>
                </div>
                <div className="glass-slab rounded-2xl p-4">
                  <div className="space-y-3">
                    {Object.entries(metricExplanations).slice(0, 6).map(([key, metric]) => (
                      <div key={key} className="pb-3 border-b border-[var(--color-border-light)] last:border-0 last:pb-0">
                        <p className="font-medium text-theme text-sm">{metric.title}</p>
                        <p className="text-xs text-theme-secondary leading-relaxed mt-1 line-clamp-2">{metric.explanation}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const result = getTopicById('sharpe-volatility');
                      if (result) selectTopic(result.topic);
                    }}
                    className="w-full mt-4 text-sm text-[var(--color-accent)] hover:brightness-125 font-medium animate-press"
                  >
                    View all metrics
                  </button>
                </div>
              </div>

              {/* Factor Categories */}
              <div id="factors">
                <div className="mb-3">
                  <p className={kickerClass}>FACTORS</p>
                  <h2 className="text-xl font-bold text-theme mt-1">Categories</h2>
                </div>
                <div className="glass-slab rounded-2xl p-4">
                  <div className="space-y-3">
                    {Object.entries(factorCategories).map(([key, category]) => (
                      <div key={key} className="pb-3 border-b border-[var(--color-border-light)] last:border-0 last:pb-0">
                        <p className="font-medium text-theme text-sm">{category.name}</p>
                        <p className="text-xs text-theme-secondary leading-relaxed mt-1">{category.description}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const result = getTopicById('what-are-factors');
                      if (result) selectTopic(result.topic);
                    }}
                    className="w-full mt-4 text-sm text-[var(--color-accent)] hover:brightness-125 font-medium animate-press"
                  >
                    Learn about factors
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div
            className="mt-12 mb-8 animate-fade-in-up"
            style={{ animationDelay: '200ms', animationFillMode: 'both' }}
            id="contact"
          >
            <div className="glass-slab-floating relative overflow-hidden rounded-2xl p-8 shadow-[0_18px_60px_-20px_rgba(123,44,255,0.45)]">
              <div className="sovereign-bar absolute top-0 left-0 right-0" />
              <div className="text-center max-w-xl mx-auto">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
                >
                  <MessageCircle className="w-6 h-6 text-[var(--color-accent)]" aria-hidden="true" />
                </div>
                <p className={kickerClass}>SUPPORT</p>
                <h2 className="text-2xl font-bold text-gradient-brand mt-1 mb-2">Still need help?</h2>
                <p className="text-theme-secondary leading-relaxed mb-6">
                  Our support team is here to help. Reach out and we will get back to you as soon as possible.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <a
                    href="mailto:support@frontieralpha.com"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[image:var(--gradient-sovereign)] text-white font-medium animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110"
                  >
                    <Mail className="w-5 h-5" aria-hidden="true" />
                    Email Support
                  </a>
                  <a
                    href="https://twitter.com/frontieralpha"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-slab inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-theme animate-press animate-lift hover:border-[color:var(--color-border-hover)]"
                  >
                    <ExternalLink className="w-5 h-5" aria-hidden="true" />
                    Twitter / X
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <section
            className="glass-slab rounded-2xl p-6 mb-8 animate-fade-in-up"
            style={{ animationDelay: '250ms', animationFillMode: 'both' }}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
              <div>
                <p className={kickerClass}>SHORTCUTS</p>
                <h2 className="text-lg font-bold text-theme mt-1">Keyboard Shortcuts</h2>
                <p className="text-sm text-theme-secondary leading-relaxed mt-1">
                  A few quick keys to move faster.
                </p>
              </div>
              <button
                onClick={openShortcutsModal}
                className="glass-slab inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-theme animate-press animate-lift hover:border-[color:var(--color-border-hover)] self-start"
              >
                <Keyboard className="w-4 h-4 text-[var(--color-accent)]" aria-hidden="true" />
                Open keyboard shortcuts
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <KeyboardShortcut keys={['?']} description="Open keyboard shortcuts" />
              <KeyboardShortcut keys={['Esc']} description="Close dialogs and panels" />
              <KeyboardShortcut keys={['/']} description="Focus search (coming soon)" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// Quick Start Card Component
function QuickStartCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Rocket;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="glass-slab rounded-2xl p-6 text-left animate-enter animate-press animate-lift hover:border-[color:var(--color-border-hover)]"
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
      >
        <Icon className="w-6 h-6 text-[var(--color-accent)]" aria-hidden="true" />
      </div>
      <h3 className="font-semibold text-theme mb-1">{title}</h3>
      <p className="text-sm text-theme-secondary leading-relaxed">{description}</p>
    </button>
  );
}

// Keyboard Shortcut Display
function KeyboardShortcut({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {keys.map((key, index) => (
          <kbd
            key={index}
            className="glass-slab rounded px-2 py-0.5 mono text-[11px] text-theme-secondary border border-theme"
          >
            {key}
          </kbd>
        ))}
      </div>
      <span className="text-sm text-theme-secondary">{description}</span>
    </div>
  );
}

export default Help;
