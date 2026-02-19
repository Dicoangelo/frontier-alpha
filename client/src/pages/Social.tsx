/**
 * Social Page
 *
 * Two-tab layout: Leaderboard (sortable table of top performers) and Feed
 * (activity cards from followed users). Includes user profile card with
 * follow/unfollow functionality.
 */

import { useState, useMemo } from 'react';
import {
  Trophy,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  UserPlus,
  UserMinus,
  ChevronUp,
  ChevronDown,
  Briefcase,
  Clock,
  Shield,
  Star,
} from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';

// ── Types ──────────────────────────────────────────────────────

type LeaderboardMetric = 'sharpe' | 'total_return' | 'risk_adjusted_return' | 'max_drawdown' | 'consistency';
type SortDirection = 'asc' | 'desc';
type SocialTab = 'leaderboard' | 'feed';
type FeedEventType = 'rebalance' | 'new_position' | 'close_position' | 'milestone';

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  risk_adjusted_return: number;
  consistency_score: number;
  is_following: boolean;
}

interface FeedItem {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  event_type: FeedEventType;
  description: string;
  detail: string;
  timestamp: string;
  symbols?: string[];
}

interface UserProfile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  follower_count: number;
  following_count: number;
  total_return: number;
  sharpe_ratio: number;
  is_following: boolean;
}

// ── Mock Data ──────────────────────────────────────────────────

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, user_id: 'u1', display_name: 'AlphaSeeker', avatar_url: null, total_return: 0.342, sharpe_ratio: 2.41, max_drawdown: 0.068, risk_adjusted_return: 0.320, consistency_score: 0.91, is_following: false },
  { rank: 2, user_id: 'u2', display_name: 'QuantMaster', avatar_url: null, total_return: 0.287, sharpe_ratio: 2.18, max_drawdown: 0.082, risk_adjusted_return: 0.265, consistency_score: 0.88, is_following: true },
  { rank: 3, user_id: 'u3', display_name: 'FactorHunter', avatar_url: null, total_return: 0.264, sharpe_ratio: 1.95, max_drawdown: 0.095, risk_adjusted_return: 0.241, consistency_score: 0.85, is_following: false },
  { rank: 4, user_id: 'u4', display_name: 'RiskParityPro', avatar_url: null, total_return: 0.231, sharpe_ratio: 1.87, max_drawdown: 0.072, risk_adjusted_return: 0.216, consistency_score: 0.89, is_following: true },
  { rank: 5, user_id: 'u5', display_name: 'MomentumRider', avatar_url: null, total_return: 0.219, sharpe_ratio: 1.73, max_drawdown: 0.112, risk_adjusted_return: 0.197, consistency_score: 0.79, is_following: false },
  { rank: 6, user_id: 'u6', display_name: 'ValueDiver', avatar_url: null, total_return: 0.198, sharpe_ratio: 1.65, max_drawdown: 0.088, risk_adjusted_return: 0.182, consistency_score: 0.83, is_following: false },
  { rank: 7, user_id: 'u7', display_name: 'DeepAlpha', avatar_url: null, total_return: 0.186, sharpe_ratio: 1.58, max_drawdown: 0.101, risk_adjusted_return: 0.169, consistency_score: 0.80, is_following: true },
  { rank: 8, user_id: 'u8', display_name: 'SharpeShooter', avatar_url: null, total_return: 0.174, sharpe_ratio: 1.51, max_drawdown: 0.079, risk_adjusted_return: 0.161, consistency_score: 0.86, is_following: false },
  { rank: 9, user_id: 'u9', display_name: 'VolTrader', avatar_url: null, total_return: 0.162, sharpe_ratio: 1.44, max_drawdown: 0.134, risk_adjusted_return: 0.143, consistency_score: 0.74, is_following: false },
  { rank: 10, user_id: 'u10', display_name: 'RegimeAlpha', avatar_url: null, total_return: 0.151, sharpe_ratio: 1.38, max_drawdown: 0.091, risk_adjusted_return: 0.139, consistency_score: 0.82, is_following: false },
];

const MOCK_FEED: FeedItem[] = [
  { id: 'f1', user_id: 'u2', display_name: 'QuantMaster', avatar_url: null, event_type: 'rebalance', description: 'Rebalanced portfolio', detail: 'Increased tech allocation from 25% to 32%, reduced energy from 15% to 8%', timestamp: '2026-02-12T14:30:00Z', symbols: ['AAPL', 'MSFT', 'NVDA'] },
  { id: 'f2', user_id: 'u4', display_name: 'RiskParityPro', avatar_url: null, event_type: 'milestone', description: 'Achieved 20% annual return', detail: 'Portfolio crossed 20% annualized return milestone with a Sharpe of 1.87', timestamp: '2026-02-12T12:15:00Z' },
  { id: 'f3', user_id: 'u7', display_name: 'DeepAlpha', avatar_url: null, event_type: 'new_position', description: 'Opened new position', detail: 'Added AMZN to portfolio — momentum signal triggered at factor score 0.82', timestamp: '2026-02-12T10:45:00Z', symbols: ['AMZN'] },
  { id: 'f4', user_id: 'u2', display_name: 'QuantMaster', avatar_url: null, event_type: 'close_position', description: 'Closed position in META', detail: 'Exited META after 45-day hold — realized +12.3% gain, Sharpe contribution +0.15', timestamp: '2026-02-11T16:00:00Z', symbols: ['META'] },
  { id: 'f5', user_id: 'u4', display_name: 'RiskParityPro', avatar_url: null, event_type: 'rebalance', description: 'Risk parity rebalance', detail: 'Equalized risk contribution across 6 sectors — max sector risk now 18%', timestamp: '2026-02-11T11:30:00Z' },
  { id: 'f6', user_id: 'u7', display_name: 'DeepAlpha', avatar_url: null, event_type: 'new_position', description: 'Opened new position', detail: 'Added TSLA on regime change signal — bull regime confidence 82%', timestamp: '2026-02-10T15:20:00Z', symbols: ['TSLA'] },
];

const MOCK_PROFILE: UserProfile = {
  user_id: 'u2',
  display_name: 'QuantMaster',
  avatar_url: null,
  bio: 'Systematic quant trader focused on multi-factor alpha. Building regime-aware portfolios with ML-driven factor timing.',
  follower_count: 142,
  following_count: 38,
  total_return: 0.287,
  sharpe_ratio: 2.18,
  is_following: true,
};

// ── Column Config ──────────────────────────────────────────────

interface ColumnDef {
  key: LeaderboardMetric | 'rank' | 'user';
  label: string;
  shortLabel: string;
  sortable: boolean;
  format?: (v: number) => string;
  defaultDir?: SortDirection;
}

const COLUMNS: ColumnDef[] = [
  { key: 'rank', label: 'Rank', shortLabel: '#', sortable: false },
  { key: 'user', label: 'User', shortLabel: 'User', sortable: false },
  { key: 'total_return', label: 'Return', shortLabel: 'Ret', sortable: true, format: (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`, defaultDir: 'desc' },
  { key: 'sharpe', label: 'Sharpe', shortLabel: 'SR', sortable: true, format: (v) => v.toFixed(2), defaultDir: 'desc' },
  { key: 'max_drawdown', label: 'Max DD', shortLabel: 'DD', sortable: true, format: (v) => `${(v * 100).toFixed(1)}%`, defaultDir: 'asc' },
  { key: 'risk_adjusted_return', label: 'Risk-Adj', shortLabel: 'RA', sortable: true, format: (v) => `${(v * 100).toFixed(1)}%`, defaultDir: 'desc' },
  { key: 'consistency', label: 'Consistency', shortLabel: 'Con', sortable: true, format: (v) => v.toFixed(2), defaultDir: 'desc' },
];

// ── Feed Event Config ──────────────────────────────────────────

// SOC-001: color/bgColor use CSS variables and rgba values (no hardcoded Tailwind color classes)
const FEED_EVENT_CONFIG: Record<FeedEventType, { icon: typeof TrendingUp; color: string; bgColor: string }> = {
  rebalance:     { icon: ArrowUpDown,  color: 'var(--color-accent)',   bgColor: 'rgba(123, 44, 255, 0.1)' },
  new_position:  { icon: TrendingUp,   color: 'var(--color-positive)', bgColor: 'rgba(16, 185, 129, 0.1)' },
  close_position:{ icon: TrendingDown, color: 'var(--color-negative)', bgColor: 'rgba(239, 68, 68, 0.1)'  },
  milestone:     { icon: Star,         color: 'var(--color-warning)',  bgColor: 'rgba(245, 158, 11, 0.1)' },
};

// ── Helper: get metric value from entry ────────────────────────

function getMetricValue(entry: LeaderboardEntry, metric: LeaderboardMetric): number {
  switch (metric) {
    case 'sharpe': return entry.sharpe_ratio;
    case 'total_return': return entry.total_return;
    case 'max_drawdown': return entry.max_drawdown;
    case 'risk_adjusted_return': return entry.risk_adjusted_return;
    case 'consistency': return entry.consistency_score;
  }
}

// ── User Profile Card ──────────────────────────────────────────

function UserProfileCard({ profile, onToggleFollow }: {
  profile: UserProfile;
  onToggleFollow: (userId: string) => void;
}) {
  return (
    // SOC-003: hover shadow polish
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <div className="flex flex-col sm:flex-row items-start gap-4">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-magenta to-brand-cyan flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {profile.display_name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + follow */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <div>
              <h3 className="text-lg font-bold text-[var(--color-text)]">{profile.display_name}</h3>
              <div className="flex items-center gap-3 text-sm text-[var(--color-text-muted)]">
                <span><strong>{profile.follower_count}</strong> followers</span>
                <span><strong>{profile.following_count}</strong> following</span>
              </div>
            </div>
            <Button
              variant={profile.is_following ? 'outline' : 'primary'}
              size="sm"
              leftIcon={profile.is_following
                ? <UserMinus className="w-4 h-4" aria-hidden="true" />
                : <UserPlus className="w-4 h-4" aria-hidden="true" />}
              onClick={() => onToggleFollow(profile.user_id)}
              aria-label={profile.is_following ? `Unfollow ${profile.display_name}` : `Follow ${profile.display_name}`}
            >
              {profile.is_following ? 'Unfollow' : 'Follow'}
            </Button>
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="text-sm text-[var(--color-text-muted)] mb-3">{profile.bio}</p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4 text-[var(--color-positive)]" aria-hidden="true" />
              <span className="text-[var(--color-positive)] font-bold">{(profile.total_return * 100).toFixed(1)}%</span>
              <span className="text-[var(--color-text-muted)]">return</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield className="w-4 h-4 text-[var(--color-accent)]" aria-hidden="true" />
              <span className="text-[var(--color-accent)] font-bold">{profile.sharpe_ratio.toFixed(2)}</span>
              <span className="text-[var(--color-text-muted)]">Sharpe</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Leaderboard Tab ────────────────────────────────────────────

function LeaderboardTab({ entries, onToggleFollow }: {
  entries: LeaderboardEntry[];
  onToggleFollow: (userId: string) => void;
}) {
  const [sortMetric, setSortMetric] = useState<LeaderboardMetric>('sharpe');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const sorted = useMemo(() => {
    const arr = [...entries];
    arr.sort((a, b) => {
      const va = getMetricValue(a, sortMetric);
      const vb = getMetricValue(b, sortMetric);
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    return arr.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [entries, sortMetric, sortDir]);

  function handleSort(col: ColumnDef) {
    if (!col.sortable) return;
    const metric = col.key as LeaderboardMetric;
    if (metric === sortMetric) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortMetric(metric);
      setSortDir(col.defaultDir ?? 'desc');
    }
  }

  return (
    <Card>
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {COLUMNS.map((col) => {
                const isActive = col.sortable && col.key === sortMetric;
                return (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      col.sortable ? 'cursor-pointer select-none hover:text-[var(--color-text)]' : ''
                    } ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
                    onClick={() => handleSort(col)}
                    aria-sort={isActive ? (sortDir === 'desc' ? 'descending' : 'ascending') : undefined}
                  >
                    <span className="hidden sm:inline">{col.label}</span>
                    <span className="sm:hidden">{col.shortLabel}</span>
                    {col.sortable && isActive && (
                      <span className="ml-1 inline-block">
                        {sortDir === 'desc'
                          ? <ChevronDown className="w-3 h-3 inline" />
                          : <ChevronUp className="w-3 h-3 inline" />}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <tr
                key={entry.user_id}
                className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-secondary)] transition-all duration-150"
              >
                {/* Rank */}
                <td className="px-4 py-3">
                  <span className={`font-bold font-mono ${
                    entry.rank <= 3 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]'
                  }`}>
                    {entry.rank <= 3 ? <Trophy className="w-4 h-4 inline mr-1 text-[var(--color-warning)]" aria-hidden="true" /> : null}
                    {entry.rank}
                  </span>
                </td>

                {/* User */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-magenta to-brand-cyan flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {entry.display_name.charAt(0)}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-[var(--color-text)] truncate">{entry.display_name}</span>
                      <button
                        onClick={() => onToggleFollow(entry.user_id)}
                        className={`flex-shrink-0 p-1 rounded-full transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center ${
                          entry.is_following
                            ? 'text-[var(--color-accent)] hover:text-[var(--color-negative)]'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-accent)]'
                        }`}
                        aria-label={entry.is_following ? `Unfollow ${entry.display_name}` : `Follow ${entry.display_name}`}
                      >
                        {entry.is_following
                          ? <UserMinus className="w-4 h-4" />
                          : <UserPlus className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </td>

                {/* Return */}
                <td className="px-4 py-3">
                  <span
                    className="font-mono font-bold"
                    style={{ color: entry.total_return >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}
                  >
                    {COLUMNS[2].format!(entry.total_return)}
                  </span>
                </td>

                {/* Sharpe */}
                <td className="px-4 py-3 font-mono text-[var(--color-text)]">
                  {COLUMNS[3].format!(entry.sharpe_ratio)}
                </td>

                {/* Max DD */}
                <td className="px-4 py-3">
                  <span className="font-mono" style={{ color: 'var(--color-negative)' }}>
                    {COLUMNS[4].format!(entry.max_drawdown)}
                  </span>
                </td>

                {/* Risk-Adjusted */}
                <td className="px-4 py-3 font-mono text-[var(--color-text)]">
                  {COLUMNS[5].format!(entry.risk_adjusted_return)}
                </td>

                {/* Consistency */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${entry.consistency_score * 100}%`,
                          background: 'linear-gradient(to right, var(--color-accent), #a855f7)',
                        }}
                      />
                    </div>
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">
                      {COLUMNS[6].format!(entry.consistency_score)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Feed Tab ───────────────────────────────────────────────────

function FeedTab({ items }: { items: FeedItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const config = FEED_EVENT_CONFIG[item.event_type];
        const EventIcon = config.icon;
        const relativeTime = formatRelativeTime(item.timestamp);

        return (
          // SOC-003: hover shadow on feed cards
          <Card key={item.id} className="hover:shadow-md transition-shadow duration-200">
            <div className="flex gap-3">
              {/* Event icon — SOC-001: bgColor and color applied via inline style */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: config.bgColor }}
              >
                <EventIcon className="w-5 h-5" style={{ color: config.color }} aria-hidden="true" />
              </div>

              <div className="flex-1 min-w-0">
                {/* Header: user + time */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-magenta to-brand-cyan flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {item.display_name.charAt(0)}
                    </div>
                    <span className="font-semibold text-sm text-[var(--color-text)]">{item.display_name}</span>
                    <span className="text-sm text-[var(--color-text-muted)]">{item.description}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {relativeTime}
                  </div>
                </div>

                {/* Detail */}
                <p className="text-sm text-[var(--color-text-muted)]">{item.detail}</p>

                {/* Symbols */}
                {item.symbols && item.symbols.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <Briefcase className="w-3 h-3 text-[var(--color-text-muted)]" aria-hidden="true" />
                    <div className="flex flex-wrap gap-1">
                      {item.symbols.map((sym) => (
                        <span
                          key={sym}
                          className="px-2 py-0.5 text-xs font-mono font-medium bg-[var(--color-bg-secondary)] text-[var(--color-text)] rounded-md border border-[var(--color-border)]"
                        >
                          {sym}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Relative Time Formatter ────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main Page ──────────────────────────────────────────────────

export function Social() {
  const [activeTab, setActiveTab] = useState<SocialTab>('leaderboard');
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState(MOCK_LEADERBOARD);
  const [profile, setProfile] = useState(MOCK_PROFILE);

  const followingCount = useMemo(() => leaderboard.filter((e) => e.is_following).length, [leaderboard]);

  function handleToggleFollow(userId: string) {
    setLeaderboard((prev) =>
      prev.map((e) => (e.user_id === userId ? { ...e, is_following: !e.is_following } : e))
    );

    // Update profile if currently viewing this user
    if (profile.user_id === userId) {
      setProfile((prev) => ({
        ...prev,
        is_following: !prev.is_following,
        follower_count: prev.is_following ? prev.follower_count - 1 : prev.follower_count + 1,
      }));
    }

    // Show profile card when following a new user from leaderboard
    const entry = leaderboard.find((e) => e.user_id === userId);
    if (entry && !entry.is_following) {
      setSelectedProfile({
        user_id: entry.user_id,
        display_name: entry.display_name,
        avatar_url: entry.avatar_url,
        bio: '',
        follower_count: 0,
        following_count: 0,
        total_return: entry.total_return,
        sharpe_ratio: entry.sharpe_ratio,
        is_following: true,
      });
    }
  }

  const tabs: { id: SocialTab; label: string; icon: typeof Trophy }[] = [
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'feed', label: 'Feed', icon: Users },
  ];

  return (
    <div className="space-y-6">
      {/* Header — SOC-002: staggered entry animation delay 0ms */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--color-text)]">Social</h1>
          <p className="text-[var(--color-text-muted)] mt-1">
            Top performers &amp; portfolio updates from the community
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Users className="w-4 h-4" aria-hidden="true" />
          <span>Following <strong className="text-[var(--color-text)]">{followingCount}</strong> traders</span>
        </div>
      </div>

      {/* Featured Profile Card — SOC-002: staggered delay 50ms */}
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: '50ms', animationFillMode: 'both' }}
      >
        {selectedProfile ? (
          <UserProfileCard profile={selectedProfile} onToggleFollow={handleToggleFollow} />
        ) : (
          <UserProfileCard profile={profile} onToggleFollow={handleToggleFollow} />
        )}
      </div>

      {/* Tab Selector — SOC-002: staggered delay 100ms */}
      <div
        className="animate-fade-in-up"
        style={{ animationDelay: '100ms', animationFillMode: 'both' }}
      >
        <div className="flex gap-1 p-1 bg-[var(--color-bg-secondary)] rounded-lg w-fit" role="tablist" aria-label="Social tabs">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md transition-all min-h-[44px] ${
                  isActive
                    ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                <TabIcon className="w-4 h-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content — SOC-002: staggered delay 150ms */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={activeTab}
        className="animate-fade-in-up"
        style={{ animationDelay: '150ms', animationFillMode: 'both' }}
      >
        {activeTab === 'leaderboard' ? (
          <LeaderboardTab entries={leaderboard} onToggleFollow={handleToggleFollow} />
        ) : (
          <FeedTab items={MOCK_FEED} />
        )}
      </div>
    </div>
  );
}

export default Social;
