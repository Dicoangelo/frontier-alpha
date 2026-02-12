import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
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
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
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

const sectionIcons: Record<string, typeof Rocket> = {
  'getting-started': Rocket,
  'factor-analysis': BarChart3,
  'portfolio-optimization': Sparkles,
  'risk-management': Shield,
  'earnings-oracle': Calendar,
  'alerts': Bell,
};

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
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
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

  // Group FAQs by category
  const faqsByCategory = faqs.reduce((acc, faq) => {
    if (!acc[faq.category]) {
      acc[faq.category] = [];
    }
    acc[faq.category].push(faq);
    return acc;
  }, {} as Record<string, FAQ[]>);

  // Simple markdown renderer
  const renderContent = (content: string) => {
    const lines = content.trim().split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: string[] = [];
    let listKey = 0;

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-1 mb-4 text-[var(--color-text-secondary)] ml-4">
            {currentList.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        );
        currentList = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (trimmed.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={`h2-${index}`} className="text-2xl font-bold text-[var(--color-text)] mt-8 mb-4 first:mt-0">
            {trimmed.slice(3)}
          </h2>
        );
      } else if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={`h3-${index}`} className="text-xl font-semibold text-[var(--color-text)] mt-6 mb-3">
            {trimmed.slice(4)}
          </h3>
        );
      } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        flushList();
        elements.push(
          <p key={`bold-${index}`} className="font-semibold text-[var(--color-text)] mt-5 mb-2">
            {trimmed.slice(2, -2)}
          </p>
        );
      } else if (trimmed.startsWith('- ')) {
        currentList.push(trimmed.slice(2));
      } else if (trimmed.startsWith('---')) {
        flushList();
        elements.push(<hr key={`hr-${index}`} className="my-8 border-[var(--color-border)]" />);
      } else if (trimmed) {
        flushList();
        const processed = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const sanitized = DOMPurify.sanitize(processed, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: [] });
        elements.push(
          <p
            key={`p-${index}`}
            className="text-[var(--color-text-secondary)] mb-4 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Help Center</h1>
        </div>
        <p className="text-[var(--color-text-muted)]">
          Learn how to use Frontier Alpha to analyze your portfolio and make better investment decisions
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <div className="relative max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Search help topics, metrics, or features..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 text-lg border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
          />
        </div>
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="mb-8">
          {hasSearchResults ? (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">
                Search Results for "{searchQuery}"
              </h2>

              {searchResults.topics.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                    Topics ({searchResults.topics.length})
                  </h3>
                  <div className="space-y-2">
                    {searchResults.topics.map((topic) => (
                      <button
                        key={topic.id}
                        onClick={() => selectTopic(topic)}
                        className="w-full flex items-center gap-3 p-4 bg-[var(--color-bg-tertiary)] rounded-lg hover:bg-blue-500/10 hover:border-blue-500/20 border border-transparent transition text-left"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-[var(--color-text)]">{topic.title}</p>
                          <p className="text-sm text-[var(--color-text-muted)]">{topic.summary}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[var(--color-text-muted)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.faqs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                    FAQ ({searchResults.faqs.length})
                  </h3>
                  <div className="space-y-3">
                    {searchResults.faqs.map((faq, index) => (
                      <div key={index} className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
                        <p className="font-medium text-[var(--color-text)] mb-2">{faq.question}</p>
                        <p className="text-[var(--color-text-secondary)]">{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-8 text-center">
              <HelpCircle className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">No results found</h3>
              <p className="text-[var(--color-text-muted)]">
                We could not find anything matching "{searchQuery}". Try different keywords or browse the topics below.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Topic Detail View */}
      {selectedTopic && !searchQuery && (
        <div className="mb-8">
          <button
            onClick={clearTopic}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to all topics
          </button>

          <Card className="p-8">
            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">{selectedTopic.title}</h1>
            <p className="text-[var(--color-text-muted)] mb-6">{selectedTopic.summary}</p>

            <div className="prose prose-gray max-w-none">
              {renderContent(selectedTopic.content)}
            </div>

            {/* Related Topics */}
            {selectedTopic.relatedTopics && selectedTopic.relatedTopics.length > 0 && (
              <div className="mt-8 pt-6 border-t">
                <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">Related Topics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedTopic.relatedTopics.map((topicId) => {
                    const result = getTopicById(topicId);
                    if (!result) return null;

                    return (
                      <button
                        key={topicId}
                        onClick={() => selectTopic(result.topic)}
                        className="flex items-center gap-3 p-4 bg-[var(--color-bg-tertiary)] rounded-lg hover:bg-blue-500/10 transition text-left"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-[var(--color-text)]">{result.topic.title}</p>
                          <p className="text-sm text-[var(--color-text-muted)]">{result.topic.summary}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Main Content (when not searching or viewing topic) */}
      {!searchQuery && !selectedTopic && (
        <>
          {/* Quick Start Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Topics */}
            <div className="lg:col-span-2 space-y-4" id="topics">
              <h2 className="text-xl font-bold text-[var(--color-text)] mb-4">Help Topics</h2>

              {helpSections.map((section) => {
                const Icon = sectionIcons[section.id] || BookOpen;
                const isExpanded = expandedSections.has(section.id);

                return (
                  <Card key={section.id} className="overflow-hidden">
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center gap-4 p-5 hover:bg-[var(--color-bg-tertiary)] transition text-left"
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-[var(--color-text)]">{section.title}</h3>
                        <p className="text-sm text-[var(--color-text-muted)]">{section.description}</p>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-[var(--color-text-muted)]" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-[var(--color-text-muted)]" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-[var(--color-bg-tertiary)] divide-y divide-[var(--color-border-light)]">
                        {section.topics.map((topic) => (
                          <button
                            key={topic.id}
                            onClick={() => selectTopic(topic)}
                            className="w-full flex items-center gap-3 p-4 pl-8 hover:bg-[var(--color-bg-secondary)] transition text-left"
                          >
                            <div className="flex-1">
                              <p className="font-medium text-[var(--color-text)]">{topic.title}</p>
                              <p className="text-sm text-[var(--color-text-muted)]">{topic.summary}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
                          </button>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Right Column - FAQ & Glossary */}
            <div className="space-y-6">
              {/* FAQ Section */}
              <div id="faq">
                <h2 className="text-xl font-bold text-[var(--color-text)] mb-4">FAQ</h2>
                <Card className="divide-y">
                  {Object.entries(faqsByCategory).map(([category, categoryFaqs]) => (
                    <div key={category}>
                      <button
                        onClick={() => toggleFaqCategory(category)}
                        className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-bg-tertiary)] transition"
                      >
                        <span className="font-medium text-[var(--color-text)] capitalize">{category}</span>
                        {expandedFaqCategories.has(category) ? (
                          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
                        )}
                      </button>
                      {expandedFaqCategories.has(category) && (
                        <div className="px-4 pb-4 space-y-4">
                          {categoryFaqs.map((faq, index) => (
                            <div key={index}>
                              <p className="font-medium text-[var(--color-text)] text-sm">{faq.question}</p>
                              <p className="text-sm text-[var(--color-text-muted)] mt-1">{faq.answer}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </Card>
              </div>

              {/* Metric Glossary */}
              <div id="glossary">
                <h2 className="text-xl font-bold text-[var(--color-text)] mb-4">Metric Glossary</h2>
                <Card className="p-4">
                  <div className="space-y-3">
                    {Object.entries(metricExplanations).slice(0, 6).map(([key, metric]) => (
                      <div key={key} className="pb-3 border-b border-[var(--color-border-light)] last:border-0 last:pb-0">
                        <p className="font-medium text-[var(--color-text)] text-sm">{metric.title}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">{metric.explanation}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const result = getTopicById('sharpe-volatility');
                      if (result) selectTopic(result.topic);
                    }}
                    className="w-full mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View all metrics
                  </button>
                </Card>
              </div>

              {/* Factor Categories */}
              <div id="factors">
                <h2 className="text-xl font-bold text-[var(--color-text)] mb-4">Factor Categories</h2>
                <Card className="p-4">
                  <div className="space-y-3">
                    {Object.entries(factorCategories).map(([key, category]) => (
                      <div key={key} className="pb-3 border-b border-[var(--color-border-light)] last:border-0 last:pb-0">
                        <p className="font-medium text-[var(--color-text)] text-sm">{category.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">{category.description}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const result = getTopicById('what-are-factors');
                      if (result) selectTopic(result.topic);
                    }}
                    className="w-full mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Learn about factors
                  </button>
                </Card>
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="mt-12 mb-8" id="contact">
            <Card className="p-8 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/20">
              <div className="text-center max-w-xl mx-auto">
                <MessageCircle className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Still need help?</h2>
                <p className="text-[var(--color-text-secondary)] mb-6">
                  Our support team is here to help. Reach out and we will get back to you as soon as possible.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <a
                    href="mailto:support@frontieralpha.com"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <Mail className="w-5 h-5" />
                    Email Support
                  </a>
                  <a
                    href="https://twitter.com/frontieralpha"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg hover:bg-[var(--color-bg-tertiary)] transition"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Twitter / X
                  </a>
                </div>
              </div>
            </Card>
          </div>

          {/* Keyboard Shortcuts */}
          <Card className="p-6 mb-8">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Keyboard Shortcuts</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <KeyboardShortcut keys={['?']} description="Open/close help panel" />
              <KeyboardShortcut keys={['Esc']} description="Close dialogs and panels" />
              <KeyboardShortcut keys={['/']} description="Focus search (coming soon)" />
            </div>
          </Card>
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
      className="p-6 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] hover:border-blue-500/30 hover:shadow-lg transition-all text-left group"
    >
      <div className="w-12 h-12 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6 text-blue-600" />
      </div>
      <h3 className="font-semibold text-[var(--color-text)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
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
            className="px-2 py-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm font-mono text-[var(--color-text-secondary)]"
          >
            {key}
          </kbd>
        ))}
      </div>
      <span className="text-sm text-[var(--color-text-secondary)]">{description}</span>
    </div>
  );
}

export default Help;
