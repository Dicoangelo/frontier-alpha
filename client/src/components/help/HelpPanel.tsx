import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  X,
  Search,
  ChevronRight,
  ChevronDown,
  Rocket,
  BarChart3,
  Sparkles,
  Shield,
  Calendar,
  Bell,
  ExternalLink,
  MessageCircle,
  BookOpen,
} from 'lucide-react';
import { helpSections, faqs, searchHelp, getTopicById, type HelpSection, type HelpTopic, type FAQ } from '@/data/helpContent';

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialTopic?: string;
}

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

export function HelpPanel({ isOpen, onClose, initialTopic }: HelpPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<HelpTopic | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Suppress unused variable warnings for items used in JSX
  void faqs; void selectedSection;

  // Initialize with initial topic if provided
  useEffect(() => {
    if (initialTopic && isOpen) {
      const result = getTopicById(initialTopic);
      if (result) {
        /* eslint-disable react-hooks/set-state-in-effect -- syncing prop to local state on open */
        setSelectedSection(result.section.id);
        setSelectedTopic(result.topic);
        setExpandedSections(new Set([result.section.id]));
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    }
  }, [initialTopic, isOpen]);

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setSearchQuery('');
        setSelectedSection(null);
        setSelectedTopic(null);
      }, 300);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedTopic) {
          setSelectedTopic(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, selectedTopic, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const selectTopic = useCallback((topic: HelpTopic) => {
    setSelectedTopic(topic);
    setSearchQuery('');
  }, []);

  const goBack = useCallback(() => {
    setSelectedTopic(null);
  }, []);

  // Search results
  const searchResults = searchQuery ? searchHelp(searchQuery) : { topics: [], faqs: [] };
  const hasSearchResults = searchResults.topics.length > 0 || searchResults.faqs.length > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — side drawer */}
      <div
        className="glass-slab-floating absolute right-0 top-0 bottom-0 w-full max-w-lg overflow-hidden animate-slide-in-right flex flex-col shadow-[0_30px_80px_-20px_rgba(123,44,255,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-label="Help panel"
      >
        {/* Sovereign top rail */}
        <div className="sovereign-bar absolute top-0 left-0 right-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-theme">
          <div className="flex items-center gap-3 min-w-0">
            {selectedTopic ? (
              <button
                onClick={goBack}
                className="p-1.5 -ml-1 text-theme-muted hover:text-theme rounded-lg animate-press"
                aria-label="Back to topics"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            ) : (
              <div
                className="p-2 rounded-lg shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
              >
                <BookOpen className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <p className={kickerClass}>HELP · Documentation</p>
              <h2 className="text-lg font-bold text-theme mt-0.5 truncate">
                {selectedTopic ? selectedTopic.title : 'Help Center'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-theme-muted hover:text-theme rounded-lg transition-colors animate-press"
            aria-label="Close help panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search (only when not viewing a topic) */}
        {!selectedTopic && (
          <div className="px-6 py-4 border-b border-theme">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
              <input
                type="text"
                placeholder="Search help topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-10 py-2.5 bg-[var(--color-bg-tertiary)] border border-theme rounded-lg text-theme placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] mono text-sm transition-[border-color,box-shadow] duration-200"
                aria-label="Search help"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-theme-muted hover:text-theme rounded animate-press"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedTopic ? (
            // Topic Detail View
            <TopicDetail topic={selectedTopic} onSelectTopic={selectTopic} />
          ) : searchQuery ? (
            // Search Results
            <SearchResults
              query={searchQuery}
              results={searchResults}
              hasResults={hasSearchResults}
              onSelectTopic={selectTopic}
            />
          ) : (
            // Section List
            <SectionList
              sections={helpSections}
              expandedSections={expandedSections}
              onToggleSection={toggleSection}
              onSelectTopic={selectTopic}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-theme p-4 bg-[var(--color-bg-tertiary)]">
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/help"
              onClick={onClose}
              className="glass-slab flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-theme-secondary hover:text-theme hover:border-[color:var(--color-border-hover)] animate-press animate-lift"
            >
              <BookOpen className="w-4 h-4" />
              Full Help Guide
            </Link>
            <a
              href="mailto:support@frontieralpha.com"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[image:var(--gradient-sovereign)] text-white font-medium animate-press animate-lift shadow-[0_4px_30px_rgba(123,44,255,0.35)] hover:brightness-110"
            >
              <MessageCircle className="w-4 h-4" />
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Section List Component
interface SectionListProps {
  sections: HelpSection[];
  expandedSections: Set<string>;
  onToggleSection: (id: string) => void;
  onSelectTopic: (topic: HelpTopic) => void;
}

function SectionList({ sections, expandedSections, onToggleSection, onSelectTopic }: SectionListProps) {
  return (
    <div className="p-4 space-y-3 animate-stagger">
      {sections.map((section) => {
        const Icon = sectionIcons[section.id] || BookOpen;
        const isExpanded = expandedSections.has(section.id);

        return (
          <div key={section.id} className="glass-slab rounded-2xl overflow-hidden animate-enter">
            <button
              onClick={() => onToggleSection(section.id)}
              className="w-full flex items-center gap-3 p-4 hover:bg-[var(--color-bg-tertiary)] text-left animate-press"
              aria-expanded={isExpanded}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}
              >
                <Icon className="w-5 h-5 text-[var(--color-accent)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-theme">{section.title}</h3>
                <p className="text-sm text-theme-secondary leading-relaxed truncate">{section.description}</p>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-theme-muted flex-shrink-0" />
              ) : (
                <ChevronRight className="w-5 h-5 text-theme-muted flex-shrink-0" />
              )}
            </button>

            {isExpanded && (
              <div className="border-t border-theme bg-[var(--color-bg-tertiary)]">
                {section.topics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => onSelectTopic(topic)}
                    className="w-full flex items-center gap-3 p-3 pl-6 hover:bg-[var(--color-bg-secondary)] text-left border-b border-theme last:border-b-0 animate-press"
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

      {/* Quick Links */}
      <div className="pt-4 mt-4 border-t border-theme">
        <h3 className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-3">Quick Links</h3>
        <div className="grid grid-cols-2 gap-2">
          <QuickLink to="/help#faq" label="FAQ" />
          <QuickLink to="/help#factors" label="Factor Guide" />
          <QuickLink to="/help#risk" label="Risk Metrics" />
          <QuickLink to="/help#optimization" label="Optimization" />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="glass-slab flex items-center justify-between px-3 py-2 rounded-lg text-sm text-theme-secondary hover:text-theme hover:border-[color:var(--color-border-hover)] animate-press animate-lift"
    >
      {label}
      <ExternalLink className="w-3.5 h-3.5 text-theme-muted" />
    </Link>
  );
}

// Search Results Component
interface SearchResultsProps {
  query: string;
  results: { topics: HelpTopic[]; faqs: FAQ[] };
  hasResults: boolean;
  onSelectTopic: (topic: HelpTopic) => void;
}

function SearchResults({ query, results, hasResults, onSelectTopic }: SearchResultsProps) {
  if (!hasResults) {
    return (
      <div className="p-8 text-center">
        <Search className="w-12 h-12 text-theme-muted mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-theme mb-2">No results found</h3>
        <p className="text-theme-secondary leading-relaxed mb-4">
          We could not find anything matching "{query}"
        </p>
        <Link
          to="/help"
          className="text-[var(--color-accent)] hover:brightness-125 font-medium animate-press"
        >
          Browse all help topics
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {results.topics.length > 0 && (
        <div>
          <h3 className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-3">
            Topics ({results.topics.length})
          </h3>
          <div className="space-y-2 animate-stagger">
            {results.topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => onSelectTopic(topic)}
                className="glass-slab w-full flex items-center gap-3 p-3 rounded-2xl hover:border-[color:var(--color-border-hover)] text-left animate-enter animate-press animate-lift"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-theme">{topic.title}</p>
                  <p className="text-sm text-theme-secondary leading-relaxed">{topic.summary}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-theme-muted flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {results.faqs.length > 0 && (
        <div>
          <h3 className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-3">
            FAQ ({results.faqs.length})
          </h3>
          <div className="space-y-2 animate-stagger">
            {results.faqs.map((faq, index) => (
              <div
                key={index}
                className="glass-slab p-4 rounded-2xl animate-enter"
              >
                <p className="font-semibold text-theme mb-2">{faq.question}</p>
                <p className="text-sm text-theme-secondary leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Topic Detail Component
interface TopicDetailProps {
  topic: HelpTopic;
  onSelectTopic: (topic: HelpTopic) => void;
}

const helpPanelMarkdownComponents = {
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-bold text-theme mt-6 mb-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-semibold text-theme mt-5 mb-2">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-theme-secondary mb-3 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-theme">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside space-y-1 mb-4 text-theme-secondary">{children}</ul>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  hr: () => <hr className="my-6 border-theme" />,
};

function TopicDetail({ topic, onSelectTopic }: TopicDetailProps) {
  return (
    <div className="p-6 animate-fade-in">
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={helpPanelMarkdownComponents}>
          {topic.content}
        </ReactMarkdown>
      </div>

      {/* Related Topics */}
      {topic.relatedTopics && topic.relatedTopics.length > 0 && (
        <div className="mt-8 pt-6 border-t border-theme">
          <h3 className="text-[10px] mono tracking-[0.3em] uppercase text-theme-muted mb-3">
            Related Topics
          </h3>
          <div className="space-y-2 animate-stagger">
            {topic.relatedTopics.map((topicId) => {
              const result = getTopicById(topicId);
              if (!result) return null;

              return (
                <button
                  key={topicId}
                  onClick={() => onSelectTopic(result.topic)}
                  className="glass-slab w-full flex items-center gap-3 p-3 rounded-2xl hover:border-[color:var(--color-border-hover)] text-left animate-enter animate-press animate-lift"
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
  );
}

// Hook for using help panel with keyboard shortcut
// eslint-disable-next-line react-refresh/only-export-components
export function useHelpPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [initialTopic, setInitialTopic] = useState<string | undefined>();

  const openHelp = useCallback((topic?: string) => {
    setInitialTopic(topic);
    setIsOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setIsOpen(false);
    setInitialTopic(undefined);
  }, []);

  // Keyboard shortcut '?' is now handled by useKeyboardShortcuts in Layout
  // which opens the keyboard shortcuts modal. Help panel toggles via 'h' key.

  const toggleHelp = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    openHelp,
    closeHelp,
    toggleHelp,
    initialTopic,
  };
}
