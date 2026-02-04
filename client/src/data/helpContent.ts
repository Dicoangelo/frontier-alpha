/**
 * Structured help content for Frontier Alpha
 * Organized by feature area with topics and FAQs
 */

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  content: string;
  relatedTopics?: string[];
  keywords?: string[];
}

export interface HelpSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  topics: HelpTopic[];
}

export interface FAQ {
  question: string;
  answer: string;
  category: string;
}

// Metric explanations for tooltips
export const metricExplanations: Record<string, { title: string; explanation: string; formula?: string }> = {
  sharpeRatio: {
    title: 'Sharpe Ratio',
    explanation: 'Measures risk-adjusted return. A higher Sharpe ratio indicates better returns per unit of risk taken. A ratio above 1.0 is generally considered good, above 2.0 is very good.',
    formula: '(Portfolio Return - Risk-Free Rate) / Portfolio Volatility',
  },
  volatility: {
    title: 'Volatility (Annualized)',
    explanation: 'Measures the standard deviation of returns, annualized. Higher volatility means larger price swings and more risk. Typical stock market volatility is around 15-20%.',
  },
  maxDrawdown: {
    title: 'Maximum Drawdown',
    explanation: 'The largest peak-to-trough decline in portfolio value. This shows the worst-case loss you would have experienced. Lower (closer to 0%) is better.',
  },
  beta: {
    title: 'Beta',
    explanation: 'Measures sensitivity to market movements. A beta of 1.0 means the portfolio moves with the market. Above 1.0 is more volatile than the market, below 1.0 is less volatile.',
  },
  var95: {
    title: 'Value at Risk (95%)',
    explanation: 'The maximum expected loss over a day with 95% confidence. For example, a VaR of 2% means there is a 5% chance of losing more than 2% in a single day.',
  },
  cvar95: {
    title: 'Conditional VaR (CVaR)',
    explanation: 'Also called Expected Shortfall. The average loss in the worst 5% of scenarios. It captures tail risk better than VaR alone.',
  },
  momentum: {
    title: 'Momentum Factor',
    explanation: 'Stocks that have performed well recently tend to continue performing well. Positive momentum exposure means your portfolio is tilted toward recent winners.',
  },
  value: {
    title: 'Value Factor',
    explanation: 'Stocks trading at low prices relative to fundamentals (earnings, book value). Positive value exposure means your portfolio favors cheaper stocks.',
  },
  quality: {
    title: 'Quality Factor',
    explanation: 'Companies with strong profitability, low debt, and stable earnings. Quality stocks tend to outperform during market stress.',
  },
  lowVol: {
    title: 'Low Volatility Factor',
    explanation: 'Stocks with lower historical volatility. Positive exposure provides downside protection but may underperform in strong bull markets.',
  },
  size: {
    title: 'Size Factor',
    explanation: 'Small-cap stocks have historically outperformed large-caps over long periods, though with higher volatility.',
  },
  expectedMove: {
    title: 'Expected Move',
    explanation: 'The predicted price change around an earnings announcement, derived from options pricing. Calculated from implied volatility.',
  },
  beatRate: {
    title: 'Beat Rate',
    explanation: 'The historical percentage of times this company has exceeded analyst earnings estimates.',
  },
};

// Factor categories for organized display
export const factorCategories: Record<string, { name: string; description: string; factors: string[] }> = {
  momentum: {
    name: 'Momentum',
    description: 'Price trend factors measuring recent performance',
    factors: ['momentum_12m', 'momentum_6m', 'momentum_3m'],
  },
  quality: {
    name: 'Quality',
    description: 'Fundamental strength and profitability metrics',
    factors: ['roe', 'roa', 'gross_margin', 'debt_equity', 'current_ratio'],
  },
  value: {
    name: 'Value',
    description: 'Valuation metrics comparing price to fundamentals',
    factors: ['value', 'pe_ratio', 'pb_ratio'],
  },
  volatility: {
    name: 'Volatility',
    description: 'Price variability and risk characteristics',
    factors: ['low_vol', 'volatility'],
  },
  macro: {
    name: 'Macro',
    description: 'Sensitivity to economic conditions',
    factors: ['interest_rate_sensitivity', 'inflation_beta', 'credit_spread_beta', 'vix_beta'],
  },
  sector: {
    name: 'Sector',
    description: 'Industry and sector exposures',
    factors: ['sector_tech', 'sector_healthcare', 'sector_financials', 'sector_consumer', 'sector_energy'],
  },
};

// Main help sections
export const helpSections: HelpSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'rocket',
    description: 'Learn the basics of using Frontier Alpha',
    topics: [
      {
        id: 'adding-positions',
        title: 'Adding Positions',
        summary: 'How to add stocks to your portfolio',
        content: `
## Adding Positions to Your Portfolio

To start analyzing your portfolio with Frontier Alpha, you need to add your positions:

1. **Navigate to Portfolio** - Click "Portfolio" in the sidebar or bottom navigation
2. **Click "Add Position"** - Find the button in the top right corner
3. **Enter Stock Symbol** - Type the ticker symbol (e.g., AAPL, MSFT, NVDA)
4. **Enter Number of Shares** - How many shares you own
5. **Enter Cost Basis** - Your average purchase price per share (optional but recommended)
6. **Save** - Click "Add" to add the position

**Tips:**
- You can add multiple positions one at a time
- Cost basis helps calculate unrealized P&L
- Real-time quotes update automatically once positions are added
        `,
        relatedTopics: ['understanding-dashboard', 'portfolio-overview'],
        keywords: ['add', 'position', 'stock', 'shares', 'portfolio'],
      },
      {
        id: 'understanding-dashboard',
        title: 'Understanding the Dashboard',
        summary: 'Overview of key dashboard components',
        content: `
## Dashboard Overview

The dashboard provides a comprehensive view of your portfolio:

### Portfolio Overview
- **Total Value** - Current market value of all positions plus cash
- **Daily Change** - Today's gain/loss in dollars and percentage
- **Unrealized P&L** - Total profit/loss since purchase

### Equity Curve
- Visual chart showing portfolio value over time
- Helps identify trends and drawdown periods

### Position List
- All your holdings with real-time prices
- Sort by value, P&L, or weight
- Quick access to individual stock details

### Factor Exposures
- Shows which investment factors drive your returns
- Grouped by category (Momentum, Quality, Value, etc.)
- AI-powered insights explain the implications

### Risk Metrics
- Key risk indicators (Sharpe, Volatility, VaR)
- Color-coded status badges for quick assessment
        `,
        relatedTopics: ['risk-metrics', 'factor-analysis'],
        keywords: ['dashboard', 'overview', 'equity', 'positions'],
      },
      {
        id: 'navigation',
        title: 'Navigating the App',
        summary: 'How to get around Frontier Alpha',
        content: `
## Navigation Guide

### Desktop
- **Sidebar** - Fixed left navigation with all main sections
- **Header** - Quick access to alerts and settings
- **Keyboard Shortcut** - Press "?" to open help anytime

### Mobile
- **Bottom Navigation** - Main sections accessible via tab bar
- **Menu Button** - Hamburger menu (top left) for full navigation
- **Pull to Refresh** - Drag down on any page to refresh data
- **Swipe** - Swipe between sections where supported

### Quick Links
- Dashboard (/) - Main overview
- Portfolio (/portfolio) - Manage positions
- Factors (/factors) - Deep factor analysis
- Optimize (/optimize) - Portfolio optimization
- Earnings (/earnings) - Earnings calendar
- Alerts (/alerts) - Risk alerts
- Settings (/settings) - Preferences
        `,
        keywords: ['navigation', 'menu', 'sidebar', 'mobile'],
      },
    ],
  },
  {
    id: 'factor-analysis',
    title: 'Factor Analysis',
    icon: 'bar-chart',
    description: 'Understanding factor exposures and their impact',
    topics: [
      {
        id: 'what-are-factors',
        title: 'What Are Factors?',
        summary: 'Introduction to factor investing',
        content: `
## Understanding Investment Factors

Factors are characteristics that explain why stocks have different returns. Decades of academic research have identified several factors that persistently drive returns:

### Why Factors Matter
- **Explain Returns** - Most of portfolio performance can be attributed to factor exposures
- **Risk Management** - Understanding factors helps identify hidden risks
- **Smart Diversification** - Diversify across factors, not just stocks

### Key Factor Categories

**Momentum** - Stocks with recent strong performance tend to continue outperforming
- Positive exposure: Riding winners
- Negative exposure: Contrarian positioning

**Value** - Cheaper stocks (low P/E, P/B) tend to outperform expensive ones over long periods
- Positive exposure: Tilted toward undervalued companies
- Negative exposure: Growth/expensive stock bias

**Quality** - Profitable companies with strong balance sheets outperform
- High ROE, low debt, stable earnings
- Provides downside protection in bear markets

**Low Volatility** - Less volatile stocks often have better risk-adjusted returns
- Anomaly: Lower risk doesn't mean lower return

**Size** - Smaller companies have historically outperformed large caps
- Higher risk/reward trade-off
        `,
        relatedTopics: ['interpreting-exposures', 'factor-drift'],
        keywords: ['factors', 'momentum', 'value', 'quality', 'investing'],
      },
      {
        id: 'interpreting-exposures',
        title: 'Interpreting Factor Exposures',
        summary: 'How to read and act on factor data',
        content: `
## Reading Factor Exposures

### Exposure Values
- **Positive exposure** (green bar to right): Tilted toward that factor
- **Negative exposure** (red bar to left): Tilted against that factor
- **Near zero**: Neutral exposure

### Statistical Significance
- **t-Stat** - Statistical confidence in the exposure measurement
- **Confidence** - Percentage confidence that exposure is real (not noise)
- Values > 2.0 t-stat or > 95% confidence are statistically significant

### Contribution
- How much each factor contributed to recent returns
- Positive = added to returns, Negative = detracted

### What to Look For

**Concentration Risk**
- If one factor dominates (exposure > 1.0), you have concentration risk
- Example: High momentum exposure means you'll suffer when momentum reverses

**Unintended Bets**
- Check if exposures match your investment thesis
- Unintended sector bets can surprise you

**Balance**
- A well-diversified portfolio has moderate exposures across multiple factors
- Extreme exposures in any direction increase risk
        `,
        relatedTopics: ['what-are-factors', 'factor-drift'],
        keywords: ['exposure', 'interpretation', 't-stat', 'confidence'],
      },
      {
        id: 'factor-drift',
        title: 'Factor Drift',
        summary: 'When your exposures change over time',
        content: `
## Understanding Factor Drift

Factor drift occurs when your portfolio's exposures change over time without you making trades.

### Why Drift Happens
- **Price Changes** - Winners grow larger, losers shrink
- **Stocks Evolve** - Company characteristics change (value becomes growth)
- **Market Regime** - Factor correlations shift

### Monitoring Drift
Frontier Alpha monitors your exposures and alerts you when:
- An exposure exceeds your target by more than 0.3
- An exposure changes direction (positive to negative or vice versa)
- Multiple factors drift simultaneously

### Responding to Drift
1. **Intentional Tilt** - If you want the new exposure, acknowledge the alert
2. **Rebalance** - Use the Optimize page to get back to targets
3. **Partial Rebalance** - Trim positions causing the drift

### Best Practices
- Review exposures monthly even without alerts
- Set personal target ranges for key factors
- Consider tax implications before rebalancing
        `,
        relatedTopics: ['interpreting-exposures', 'optimization-basics'],
        keywords: ['drift', 'rebalance', 'monitoring', 'exposure change'],
      },
    ],
  },
  {
    id: 'portfolio-optimization',
    title: 'Portfolio Optimization',
    icon: 'sparkles',
    description: 'How the optimizer works and how to use it',
    topics: [
      {
        id: 'optimization-basics',
        title: 'Optimization Basics',
        summary: 'Introduction to portfolio optimization',
        content: `
## Portfolio Optimization 101

Portfolio optimization finds the best allocation across your holdings based on your goals.

### How It Works
1. **Estimates Returns** - Uses factor models and historical data
2. **Estimates Risk** - Calculates correlations and volatilities
3. **Finds Optimal Mix** - Balances return vs risk based on objective
4. **Applies Constraints** - Respects your position limits

### Key Inputs
- **Your Holdings** - Current positions in your portfolio
- **Objective** - What you want to achieve (see Objectives)
- **Constraints** - Position limits, sector caps, etc.

### Key Outputs
- **Optimal Weights** - Suggested allocation percentages
- **Expected Return** - Projected annual return
- **Expected Volatility** - Projected annual risk
- **Sharpe Ratio** - Risk-adjusted return metric
- **Factor Exposures** - What factors drive the optimized portfolio
        `,
        relatedTopics: ['optimization-objectives', 'constraints'],
        keywords: ['optimization', 'portfolio', 'allocation', 'weights'],
      },
      {
        id: 'optimization-objectives',
        title: 'Optimization Objectives',
        summary: 'Different optimization goals explained',
        content: `
## Choosing Your Optimization Objective

### Maximum Sharpe Ratio
**Goal:** Best risk-adjusted returns
- Balances return maximization with risk control
- Best for most investors
- May concentrate in high-conviction positions

### Minimum Volatility
**Goal:** Lowest possible risk
- Prioritizes stability over returns
- Best for conservative investors or near retirement
- May underperform in strong bull markets

### Risk Parity
**Goal:** Equal risk contribution from each position
- Each position contributes equally to portfolio risk
- Naturally diversified
- May require leverage for target returns

### Target Volatility
**Goal:** Hit a specific risk level
- You specify desired volatility (e.g., 15%)
- Optimizer finds best portfolio at that risk level
- Good for risk-budgeting approaches

### Which to Choose?
- **Growth-focused:** Maximum Sharpe
- **Conservative:** Minimum Volatility
- **Diversification-focused:** Risk Parity
- **Specific risk target:** Target Volatility
        `,
        relatedTopics: ['optimization-basics', 'constraints'],
        keywords: ['objective', 'sharpe', 'volatility', 'risk parity'],
      },
      {
        id: 'constraints',
        title: 'Constraints & Limits',
        summary: 'Setting bounds on your optimization',
        content: `
## Setting Optimization Constraints

Constraints prevent the optimizer from making unrealistic or undesirable allocations.

### Position Weight Limits
- **Max Weight:** Maximum allocation to any single position
- Recommended: 20-25% for diversified portfolios
- Lower limits (10-15%) for more diversification
- Higher limits (30%+) if you have high-conviction positions

### Why Constraints Matter
Without constraints, optimizers tend to:
- Concentrate in a few positions
- Make extreme allocations (100% in one stock)
- Be overly sensitive to input assumptions

### Best Practices
- Start with default constraints (25% max)
- Tighten constraints if you want more diversification
- Consider your actual comfort with concentration
- Remember: More constraints = more deviation from "optimal"

### What We Don't Constrain (Yet)
- Sector limits
- Factor exposure targets
- Turnover limits
These features are on our roadmap.
        `,
        relatedTopics: ['optimization-basics', 'optimization-objectives'],
        keywords: ['constraints', 'limits', 'weight', 'max position'],
      },
    ],
  },
  {
    id: 'risk-management',
    title: 'Risk Metrics',
    icon: 'shield',
    description: 'Understanding portfolio risk measurements',
    topics: [
      {
        id: 'sharpe-volatility',
        title: 'Sharpe Ratio & Volatility',
        summary: 'Core risk-adjusted return metrics',
        content: `
## Sharpe Ratio

The Sharpe Ratio measures risk-adjusted return - how much return you get per unit of risk.

**Formula:** (Portfolio Return - Risk-Free Rate) / Volatility

### Interpreting Sharpe Ratio
- **< 0:** Negative risk-adjusted returns (bad)
- **0 - 0.5:** Below average
- **0.5 - 1.0:** Acceptable
- **1.0 - 2.0:** Good
- **> 2.0:** Excellent (rare over long periods)

---

## Volatility (Standard Deviation)

Volatility measures how much returns vary from the average.

### What It Tells You
- Higher volatility = larger price swings = more risk
- Annualized volatility makes comparison easier

### Typical Ranges
- **< 10%:** Low volatility (bonds, utilities)
- **10-20%:** Moderate (diversified stock portfolio)
- **20-30%:** Elevated (growth stocks, tech)
- **> 30%:** High (speculative, crypto)
        `,
        relatedTopics: ['var-cvar', 'drawdown'],
        keywords: ['sharpe', 'volatility', 'risk', 'standard deviation'],
      },
      {
        id: 'var-cvar',
        title: 'VaR & CVaR',
        summary: 'Tail risk measurements',
        content: `
## Value at Risk (VaR)

VaR answers: "What's the worst loss I can expect with X% confidence?"

### VaR 95% Example
If your daily VaR 95% is 2%:
- On 95% of days, you'll lose less than 2%
- On 5% of days (1 in 20), you could lose MORE than 2%

### Limitations
- VaR doesn't tell you how much you lose in the worst 5%
- Two portfolios can have same VaR but very different tail risks

---

## Conditional VaR (CVaR) / Expected Shortfall

CVaR answers: "When things are bad, how bad are they?"

### What CVaR Adds
- Average loss in the worst 5% of scenarios
- Better captures tail risk than VaR alone
- Always worse (more negative) than VaR

### Example
- VaR 95% = -2% (worst expected daily loss)
- CVaR 95% = -3% (average loss on bad days)

This means when things go wrong, you'll lose about 3% on average.
        `,
        relatedTopics: ['sharpe-volatility', 'drawdown'],
        keywords: ['var', 'cvar', 'value at risk', 'tail risk', 'expected shortfall'],
      },
      {
        id: 'drawdown',
        title: 'Maximum Drawdown',
        summary: 'Worst peak-to-trough decline',
        content: `
## Maximum Drawdown

Maximum Drawdown (MDD) is the largest percentage drop from a peak to a trough.

### Why It Matters
- Shows worst historical loss you would have experienced
- Helps you understand if you can emotionally handle the strategy
- Important for setting stop-losses

### Calculating Drawdown
1. Track portfolio high-water mark (best value so far)
2. Measure current value vs high-water mark
3. Maximum drawdown = worst such measurement

### Interpreting Drawdowns
- **< 10%:** Low drawdown (conservative)
- **10-20%:** Moderate (typical balanced portfolio)
- **20-30%:** Significant (aggressive equity)
- **30-50%:** Severe (concentrated or leveraged)
- **> 50%:** Extreme (highly speculative)

### Recovery Time
Remember: A 50% loss requires a 100% gain to recover!
- -10% needs +11% to recover
- -20% needs +25% to recover
- -50% needs +100% to recover
        `,
        relatedTopics: ['sharpe-volatility', 'var-cvar'],
        keywords: ['drawdown', 'peak', 'trough', 'loss', 'recovery'],
      },
    ],
  },
  {
    id: 'earnings-oracle',
    title: 'Earnings Oracle',
    icon: 'calendar',
    description: 'Earnings forecasts and recommendations',
    topics: [
      {
        id: 'earnings-calendar',
        title: 'Earnings Calendar',
        summary: 'Tracking upcoming earnings dates',
        content: `
## Earnings Calendar

The Earnings Calendar shows when your portfolio holdings report quarterly results.

### Calendar Features
- **Upcoming Earnings** - All earnings in next 7/14/30/60/90 days
- **Today's Reports** - Highlighted for immediate attention
- **Expected Move** - How much the stock might move

### What You See
- **Symbol** - Stock ticker
- **Date** - Report date
- **Time** - Before market (BMO) or After market (AMO)
- **Expected Move** - Implied volatility suggests this price swing

### Why Track Earnings
- Earnings announcements cause the biggest single-day moves
- Knowing dates helps you prepare risk management
- Adjust position sizes before high-impact events
        `,
        relatedTopics: ['earnings-forecasts', 'earnings-actions'],
        keywords: ['earnings', 'calendar', 'report', 'quarterly'],
      },
      {
        id: 'earnings-forecasts',
        title: 'Earnings Forecasts',
        summary: 'How we predict earnings impact',
        content: `
## Earnings Impact Forecasts

Frontier Alpha provides AI-powered forecasts for how stocks might react to earnings.

### What We Analyze
1. **Historical Patterns** - How the stock reacted to past earnings
2. **Beat/Miss History** - Track record vs analyst estimates
3. **Current Sentiment** - Recent price action and positioning
4. **Implied Volatility** - Options market's expected move

### Forecast Components
- **Expected Move** - Predicted price change (%)
- **Direction** - Up, down, or neutral bias
- **Confidence** - How certain we are (higher = more confident)
- **Historical Average** - Typical move for this stock

### Understanding Recommendations
- **Hold** - No action needed, normal risk
- **Reduce** - Consider trimming before earnings
- **Hedge** - Consider protective options
- **Add** - Potential opportunity to increase position

### Limitations
- Earnings are inherently unpredictable
- Past patterns don't guarantee future results
- Use forecasts as one input, not the only input
        `,
        relatedTopics: ['earnings-calendar', 'earnings-actions'],
        keywords: ['forecast', 'prediction', 'expected move', 'recommendation'],
      },
      {
        id: 'earnings-actions',
        title: 'Actions Around Earnings',
        summary: 'What to do before and after earnings',
        content: `
## Managing Earnings Risk

### Before Earnings

**Risk Assessment**
1. Check expected move and your position size
2. Calculate potential dollar impact: Position Value x Expected Move
3. Decide if you can accept that risk

**Actions to Consider**
- **Do Nothing** - If risk is acceptable and you're long-term focused
- **Reduce Position** - Trim to lower dollar risk
- **Hedge with Options** - Buy puts or sell calls
- **Close Position** - Eliminate earnings risk entirely

### After Earnings

**Beat Scenario**
- Stock often gaps up but may fade
- Consider taking some profits on extreme moves
- Watch for "sell the news" patterns

**Miss Scenario**
- Assess if this changes the fundamental thesis
- Don't panic sell on short-term overreaction
- Consider adding if thesis intact and price overshoots

**Post-Earnings Drift**
- Stocks often continue moving in the direction of the surprise
- Beats tend to keep rising, misses keep falling
- This "drift" can last weeks

### Best Practices
- Have a plan BEFORE earnings, not during
- Size positions so any single earnings won't hurt badly
- Don't let FOMO override risk management
        `,
        relatedTopics: ['earnings-calendar', 'earnings-forecasts'],
        keywords: ['actions', 'before earnings', 'after earnings', 'hedge'],
      },
    ],
  },
  {
    id: 'alerts',
    title: 'Alerts & Monitoring',
    icon: 'bell',
    description: 'Understanding and configuring alerts',
    topics: [
      {
        id: 'alert-types',
        title: 'Types of Alerts',
        summary: 'Different alerts and what they mean',
        content: `
## Alert Types

### Drawdown Alert
**Trigger:** Portfolio declines X% from peak
- Critical: > 10% drawdown
- High: > 7% drawdown
- Medium: > 5% drawdown

**Action:** Review positions, consider reducing risk

### Concentration Alert
**Trigger:** Single position exceeds weight limit
- Warning when position > 20% of portfolio
- Critical when position > 30%

**Action:** Consider trimming the position

### Earnings Alert
**Trigger:** Portfolio position has upcoming earnings
- Alerts 7 days, 3 days, and day-of
- Severity based on expected move and position size

**Action:** Review forecast, decide on risk management

### Factor Drift Alert
**Trigger:** Factor exposure changes significantly
- When exposure moves > 0.3 from baseline
- When exposure changes sign (+ to - or vice versa)

**Action:** Review if drift is intentional, rebalance if not

### Volatility Spike Alert
**Trigger:** Market volatility (VIX) increases sharply
- Warns when VIX rises > 20% in a day
- Factors in your portfolio beta

**Action:** Review risk exposure, consider hedges

### SEC Filing Alert
**Trigger:** New SEC filing for portfolio company
- 8-K (material events)
- 10-Q/10-K (quarterly/annual reports)
- Form 4 (insider trading)

**Action:** Review filing for material information
        `,
        relatedTopics: ['configuring-alerts', 'responding-alerts'],
        keywords: ['alert', 'notification', 'drawdown', 'concentration'],
      },
      {
        id: 'configuring-alerts',
        title: 'Configuring Alerts',
        summary: 'How to customize alert settings',
        content: `
## Alert Configuration

### Notification Channels
Navigate to Settings > Notifications to configure:

**Push Notifications**
- Enable/disable browser push notifications
- Requires granting browser permission
- Works even when app is in background

**Email Alerts**
- Critical alerts sent to your email
- Configurable frequency (immediate, daily digest)

### Severity Settings
Customize which alerts you see:
- **Critical:** Always shown, can't disable
- **High:** Shown by default, can mute
- **Medium:** Shown by default, can disable
- **Low:** Hidden by default, can enable

### Custom Thresholds
Some alerts allow custom thresholds:
- Drawdown percentage trigger
- Concentration percentage limit
- Factor drift sensitivity

### Alert Fatigue Prevention
- Alerts are deduplicated (won't repeat within 24h)
- Similar alerts are grouped
- Acknowledged alerts are tracked separately
        `,
        relatedTopics: ['alert-types', 'responding-alerts'],
        keywords: ['configure', 'settings', 'notifications', 'email'],
      },
      {
        id: 'responding-alerts',
        title: 'Responding to Alerts',
        summary: 'What to do when you receive an alert',
        content: `
## Responding to Alerts

### Quick Actions
Each alert has relevant quick actions:
- **View Details** - See more context
- **Acknowledge** - Mark as seen
- **Take Action** - Go to relevant page

### Alert Workflow

**1. Assess Severity**
- Critical: Requires immediate attention
- High: Address within the day
- Medium: Review when convenient
- Low: Informational

**2. Understand Context**
- Read the full alert message
- Check related data (positions, factors, etc.)
- Review historical context if available

**3. Decide on Action**
- No action needed (acknowledge and move on)
- Minor adjustment (trim position, acknowledge)
- Major review (use Optimize page, rebalance)

**4. Document Decision**
- Acknowledge the alert
- Add note if available
- Review later to see if decision was correct

### Do NOT
- Panic and make rushed decisions
- Ignore critical alerts
- Let alerts pile up unreviewed
- Trade on every alert without thought
        `,
        relatedTopics: ['alert-types', 'configuring-alerts'],
        keywords: ['respond', 'action', 'acknowledge', 'workflow'],
      },
    ],
  },
];

// Frequently Asked Questions
export const faqs: FAQ[] = [
  {
    question: 'How often is data updated?',
    answer: 'Stock quotes update in real-time during market hours via WebSocket connection. Portfolio calculations refresh every few seconds. Factor data and risk metrics are recalculated when quotes change or you modify positions.',
    category: 'general',
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes. We use industry-standard encryption (TLS) for all data transmission. Your portfolio data is stored securely in our database with row-level security. We never share your data with third parties.',
    category: 'general',
  },
  {
    question: 'Can I import my portfolio from my broker?',
    answer: 'Currently, you need to manually add positions. Broker import integration is on our roadmap. You can export your positions from most brokers as CSV and use that as a reference when adding positions.',
    category: 'general',
  },
  {
    question: 'Why do factor exposures change even though I did not trade?',
    answer: 'Factor exposures change because: 1) Stock prices move, changing position weights, 2) Underlying factor characteristics of stocks evolve, 3) Market conditions affect factor correlations. This is called "factor drift" and we alert you when significant.',
    category: 'factors',
  },
  {
    question: 'What does a negative factor exposure mean?',
    answer: 'A negative exposure means your portfolio is tilted against that factor. For example, negative momentum exposure means your holdings have underperformed recently. This is not necessarily bad - it could be intentional contrarian positioning.',
    category: 'factors',
  },
  {
    question: 'How accurate are the optimization results?',
    answer: 'Optimization results are based on historical data and factor models. They provide a reasonable framework for allocation decisions but are not predictions of future returns. Use them as one input alongside your own research and judgment.',
    category: 'optimization',
  },
  {
    question: 'Should I follow every optimization suggestion?',
    answer: 'No. The optimizer does not know your full financial situation, tax implications, or investment timeline. Use optimization results as a starting point for thinking about allocation, not as direct trading instructions.',
    category: 'optimization',
  },
  {
    question: 'How reliable are earnings forecasts?',
    answer: 'Earnings forecasts are probabilistic estimates based on historical patterns and current market conditions. They indicate likely scenarios, not certain outcomes. A stock with an "up" bias can still fall post-earnings.',
    category: 'earnings',
  },
  {
    question: 'What should I do if I get a critical alert?',
    answer: 'Critical alerts require attention but not panic. 1) Read the full message to understand the issue, 2) Review the affected positions and relevant data, 3) Decide if action is needed based on your investment thesis, 4) Take measured action if appropriate.',
    category: 'alerts',
  },
  {
    question: 'How is the Sharpe Ratio calculated?',
    answer: 'Sharpe Ratio = (Portfolio Return - Risk-Free Rate) / Portfolio Volatility. We use the 3-month Treasury yield as the risk-free rate and annualized volatility. The ratio shown is estimated from factor exposures and historical data.',
    category: 'risk',
  },
  {
    question: 'What is the difference between VaR and CVaR?',
    answer: 'VaR (Value at Risk) tells you the maximum loss at a confidence level (e.g., 95%). CVaR (Conditional VaR) tells you the average loss when VaR is breached. CVaR is more conservative and better captures tail risk.',
    category: 'risk',
  },
  {
    question: 'Can I use Frontier Alpha for paper trading?',
    answer: 'Frontier Alpha is primarily an analysis tool, not a trading platform. You can create hypothetical portfolios for analysis purposes. For actual trading, use your broker and apply insights from Frontier Alpha.',
    category: 'general',
  },
];

// Quick tips for tooltips throughout the app
export const quickTips: Record<string, string> = {
  positionWeight: 'Position weight shows what percentage of your portfolio this holding represents.',
  unrealizedPnL: 'Profit or loss you would realize if you sold at current price.',
  costBasis: 'Your average purchase price per share. Used to calculate P&L.',
  factorExposure: 'How much your portfolio is tilted toward this factor. Positive = tilted toward, Negative = tilted against.',
  tStat: 'Statistical significance of the exposure. Higher absolute values mean more confidence.',
  contribution: 'How much this factor contributed to recent portfolio returns.',
  expectedMove: 'How much the stock is expected to move around earnings, based on options pricing.',
  daysUntil: 'Trading days until the earnings announcement.',
  alertSeverity: 'Critical = immediate attention, High = same day, Medium = when convenient, Low = informational.',
  optimalWeight: 'The suggested allocation from the optimizer. Compare to current weight to see recommended change.',
};

// Search helper - returns matching topics and FAQs
export function searchHelp(query: string): { topics: HelpTopic[]; faqs: FAQ[] } {
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) {
    return { topics: [], faqs: [] };
  }

  const matchingTopics: HelpTopic[] = [];
  const matchingFaqs: FAQ[] = [];

  // Search topics
  for (const section of helpSections) {
    for (const topic of section.topics) {
      const searchText = `${topic.title} ${topic.summary} ${topic.content} ${(topic.keywords || []).join(' ')}`.toLowerCase();
      if (searchText.includes(normalizedQuery)) {
        matchingTopics.push(topic);
      }
    }
  }

  // Search FAQs
  for (const faq of faqs) {
    const searchText = `${faq.question} ${faq.answer}`.toLowerCase();
    if (searchText.includes(normalizedQuery)) {
      matchingFaqs.push(faq);
    }
  }

  return { topics: matchingTopics, faqs: matchingFaqs };
}

// Get topic by ID
export function getTopicById(topicId: string): { section: HelpSection; topic: HelpTopic } | null {
  for (const section of helpSections) {
    const topic = section.topics.find(t => t.id === topicId);
    if (topic) {
      return { section, topic };
    }
  }
  return null;
}
