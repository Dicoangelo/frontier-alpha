import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
        setSelectedSection(result.section.id);
        setSelectedTopic(result.topic);
        setExpandedSections(new Set([result.section.id]));
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-[var(--color-bg)] shadow-2xl animate-slide-in-right flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Help panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            {selectedTopic ? (
              <button
                onClick={goBack}
                className="p-1 -ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] rounded"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            ) : (
              <BookOpen className="w-6 h-6 text-blue-600" />
            )}
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {selectedTopic ? selectedTopic.title : 'Help Center'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] rounded-lg"
            aria-label="Close help panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search (only when not viewing a topic) */}
        {!selectedTopic && (
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Search help topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                aria-label="Search help"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
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
        <div className="border-t p-4 bg-[var(--color-bg-tertiary)]">
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/help"
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition"
            >
              <BookOpen className="w-4 h-4" />
              Full Help Guide
            </Link>
            <a
              href="mailto:support@frontieralpha.com"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
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
    <div className="p-4 space-y-2">
      {sections.map((section) => {
        const Icon = sectionIcons[section.id] || BookOpen;
        const isExpanded = expandedSections.has(section.id);

        return (
          <div key={section.id} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => onToggleSection(section.id)}
              className="w-full flex items-center gap-3 p-4 bg-[var(--color-bg)] hover:bg-[var(--color-bg-tertiary)] transition text-left"
              aria-expanded={isExpanded}
            >
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-[var(--color-text)]">{section.title}</h3>
                <p className="text-sm text-[var(--color-text-muted)] truncate">{section.description}</p>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0" />
              ) : (
                <ChevronRight className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0" />
              )}
            </button>

            {isExpanded && (
              <div className="border-t bg-[var(--color-bg-tertiary)]">
                {section.topics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => onSelectTopic(topic)}
                    className="w-full flex items-center gap-3 p-3 pl-6 hover:bg-[var(--color-bg-secondary)] transition text-left border-b last:border-b-0"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-[var(--color-text)]">{topic.title}</p>
                      <p className="text-sm text-[var(--color-text-muted)]">{topic.summary}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Quick Links */}
      <div className="pt-4 mt-4 border-t">
        <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Quick Links</h3>
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
      className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg)] border rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:border-[var(--color-border)] transition"
    >
      {label}
      <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
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
        <Search className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-4" />
        <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">No results found</h3>
        <p className="text-[var(--color-text-muted)] mb-4">
          We could not find anything matching "{query}"
        </p>
        <Link
          to="/help"
          className="text-blue-600 hover:text-blue-700 font-medium"
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
          <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Topics ({results.topics.length})
          </h3>
          <div className="space-y-2">
            {results.topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => onSelectTopic(topic)}
                className="w-full flex items-center gap-3 p-3 bg-[var(--color-bg)] border rounded-lg hover:bg-[var(--color-bg-tertiary)] hover:border-blue-300 transition text-left"
              >
                <div className="flex-1">
                  <p className="font-medium text-[var(--color-text)]">{topic.title}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">{topic.summary}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {results.faqs.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            FAQ ({results.faqs.length})
          </h3>
          <div className="space-y-2">
            {results.faqs.map((faq, index) => (
              <div
                key={index}
                className="p-4 bg-[var(--color-bg)] border rounded-lg"
              >
                <p className="font-medium text-[var(--color-text)] mb-2">{faq.question}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{faq.answer}</p>
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

function TopicDetail({ topic, onSelectTopic }: TopicDetailProps) {
  // Simple markdown-like rendering
  const renderContent = (content: string) => {
    const lines = content.trim().split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: string[] = [];
    let listKey = 0;

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-1 mb-4 text-[var(--color-text-secondary)]">
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
          <h2 key={`h2-${index}`} className="text-xl font-bold text-[var(--color-text)] mt-6 mb-3 first:mt-0">
            {trimmed.slice(3)}
          </h2>
        );
      } else if (trimmed.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={`h3-${index}`} className="text-lg font-semibold text-[var(--color-text)] mt-5 mb-2">
            {trimmed.slice(4)}
          </h3>
        );
      } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        flushList();
        elements.push(
          <p key={`bold-${index}`} className="font-semibold text-[var(--color-text)] mt-4 mb-2">
            {trimmed.slice(2, -2)}
          </p>
        );
      } else if (trimmed.startsWith('- ')) {
        currentList.push(trimmed.slice(2));
      } else if (trimmed.startsWith('---')) {
        flushList();
        elements.push(<hr key={`hr-${index}`} className="my-6 border-[var(--color-border)]" />);
      } else if (trimmed) {
        flushList();
        // Handle inline bold
        const processed = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        elements.push(
          <p
            key={`p-${index}`}
            className="text-[var(--color-text-secondary)] mb-3 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: processed }}
          />
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className="p-6">
      <div className="prose prose-sm max-w-none">
        {renderContent(topic.content)}
      </div>

      {/* Related Topics */}
      {topic.relatedTopics && topic.relatedTopics.length > 0 && (
        <div className="mt-8 pt-6 border-t">
          <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Related Topics
          </h3>
          <div className="space-y-2">
            {topic.relatedTopics.map((topicId) => {
              const result = getTopicById(topicId);
              if (!result) return null;

              return (
                <button
                  key={topicId}
                  onClick={() => onSelectTopic(result.topic)}
                  className="w-full flex items-center gap-3 p-3 bg-[var(--color-bg-tertiary)] rounded-lg hover:bg-[var(--color-bg-secondary)] transition text-left"
                >
                  <div className="flex-1">
                    <p className="font-medium text-[var(--color-text)]">{result.topic.title}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">{result.topic.summary}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
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

  // Keyboard shortcut: ? to open help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not in an input field
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    openHelp,
    closeHelp,
    initialTopic,
  };
}
