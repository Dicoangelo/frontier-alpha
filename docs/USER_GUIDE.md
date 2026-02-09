# Frontier Alpha User Guide

A complete guide to using the Frontier Alpha Cognitive Factor Intelligence Platform.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Portfolio Management](#portfolio-management)
4. [Understanding Factor Analysis](#understanding-factor-analysis)
5. [CVRF Intelligence](#cvrf-intelligence)
6. [Earnings Calendar](#earnings-calendar)
7. [Backtesting](#backtesting)
8. [AI Explanations](#ai-explanations)
9. [Risk Alerts](#risk-alerts)
10. [Settings](#settings)
11. [PWA Installation](#pwa-installation)

---

## Getting Started

### Creating an Account

1. Navigate to the Frontier Alpha landing page.
2. Click "Get Started" or "Sign Up."
3. Enter your email and create a password. Supabase Auth handles account creation.
4. Verify your email address via the confirmation link sent to your inbox.
5. Log in and you will be directed to the dashboard.

### Connecting Your Portfolio

After logging in for the first time, your portfolio will be empty. You can populate it in two ways:

**Manual entry:**
- Navigate to the Portfolio page.
- Click "Add Position."
- Enter the ticker symbol (e.g., `AAPL`), number of shares, and average cost basis.
- Repeat for each holding.

**Demo portfolio:**
- On the empty portfolio screen, click "Try Demo Portfolio" to load a sample portfolio with popular holdings. This lets you explore the platform's features without entering real data.

---

## Dashboard Overview

The dashboard is your central hub. It provides a consolidated view of your portfolio's health, recent activity, and actionable insights.

### Key Sections

**Portfolio Summary** -- Displays total portfolio value, daily change (dollar and percent), and overall allocation breakdown. A ring chart shows sector or position concentration at a glance.

**Factor Exposure Overview** -- A snapshot of your portfolio's dominant factor tilts (momentum, value, quality, volatility, size). Color-coded bars indicate whether exposure levels are within normal ranges.

**Risk Alerts** -- Active alerts appear at the top of the dashboard. These include concentration warnings, drawdown breaches, volatility spikes, and earnings-related risk flags. Click an alert to view details and recommended actions.

**Earnings Calendar Widget** -- Shows upcoming earnings dates for your holdings within the next 14 days. Includes expected move and recommendation (hold, reduce, hedge, add).

**CVRF Status** -- If a CVRF episode is active, the dashboard shows the current episode number, number of recorded decisions, and current belief regime.

---

## Portfolio Management

### Viewing Positions

The Portfolio page shows all your holdings in a sortable table:

- **Symbol** -- Ticker and company name.
- **Shares** -- Number of shares held.
- **Avg Cost** -- Your cost basis per share.
- **Current Price** -- Real-time market price.
- **Market Value** -- Current total value of the position.
- **P&L** -- Unrealized profit/loss in dollars and percent.
- **Weight** -- Position size as a percentage of total portfolio.

### Editing Positions

Click on any position row to edit the number of shares or average cost. Use the delete button to remove a position entirely.

### Portfolio Optimization

The Optimize page lets you run Monte Carlo portfolio optimization:

1. Select which positions (or additional symbols) to include.
2. Choose an optimization objective:
   - **Max Sharpe** -- Maximizes risk-adjusted returns.
   - **Min Variance** -- Minimizes portfolio volatility.
   - **Risk Parity** -- Equalizes risk contribution across positions.
3. Set the risk-free rate (defaults to current Treasury rate).
4. Click "Run Optimization" to generate recommended weights.

Results include an efficient frontier chart, recommended allocation, expected return, volatility, and Sharpe ratio.

---

## Understanding Factor Analysis

Factor analysis decomposes your portfolio's returns into systematic risk factors. Frontier Alpha calculates 80+ factor exposures grouped into categories:

### Factor Categories

| Category | Examples | What It Tells You |
|----------|----------|-------------------|
| **Style** | Momentum, Value, Growth, Size | Where your portfolio sits on fundamental dimensions |
| **Quality** | ROE, Earnings Stability, Low Debt | How financially robust your holdings are |
| **Volatility** | Beta, Historical Vol, Idiosyncratic Risk | How much your portfolio swings with the market |
| **Sentiment** | News Score, Social Momentum | How market participants feel about your holdings |
| **Macro** | Interest Rate Sensitivity, Inflation Beta | How macroeconomic shifts affect your portfolio |
| **Sector** | Tech, Healthcare, Financial, Energy | Sector concentration and rotation patterns |

### Reading Factor Exposures

Each factor exposure includes:

- **Exposure** -- The loading coefficient. Positive means tilted toward that factor; negative means tilted away. Values above 0.5 or below -0.5 are significant.
- **t-Statistic** -- Statistical significance. Values above 2.0 indicate the exposure is reliably different from zero.
- **Confidence** -- A 0-1 score combining statistical significance and data quality.
- **Contribution** -- How much this factor contributes to overall portfolio return.

### Practical Interpretation

If your portfolio shows high momentum exposure (e.g., 0.65) with strong confidence (0.85), it means your holdings have been trending upward and will likely continue if the momentum factor stays positive. However, momentum factors can reverse sharply, so monitor for regime changes.

---

## CVRF Intelligence

CVRF (Conceptual Verbal Reinforcement Framework) is Frontier Alpha's proprietary belief evolution system. It learns from your trading history to refine investment beliefs over time.

### How CVRF Works

1. **Episodes** -- Your trading activity is organized into time-bounded episodes (typically 21 trading days each).
2. **Decisions** -- Every buy, sell, hold, or rebalance decision is recorded with the reasoning and factor context.
3. **Comparison** -- When an episode closes, CVRF compares it to the previous episode's performance.
4. **Reinforcement** -- The system identifies what worked and what did not, extracting insights that update the belief state.
5. **Meta-Prompt** -- A synthesized directive is generated that guides future optimization decisions.

### What Episodes Mean

An episode is a window of trading activity. When you see episode metrics:

- **Portfolio Return** -- The total return during that episode.
- **Sharpe Ratio** -- Risk-adjusted return during the episode.
- **Max Drawdown** -- The worst peak-to-trough decline within the episode.
- **Decisions Count** -- How many trading actions were recorded.

### What Beliefs Mean

Beliefs represent the system's learned preferences:

- **Current Regime** -- The market regime CVRF has identified (e.g., `risk_on`, `risk_off`, `neutral`).
- **Risk Tolerance** -- A 0-1 value reflecting how aggressive the belief state suggests being.
- **Factor Weights** -- How much CVRF believes each factor matters right now.
- **Factor Confidences** -- How sure CVRF is about each factor's importance.

### Using the Meta-Prompt

The meta-prompt (accessible from the CVRF page) is a natural-language summary of what CVRF has learned. It includes:

- **Optimization Direction** -- What to do next (e.g., "increase quality, reduce momentum").
- **Key Learnings** -- Specific insights from the latest cycle.
- **Factor Adjustments** -- Numerical changes to apply to factor weights.
- **Risk Guidance** -- Overall risk posture recommendation.

---

## Earnings Calendar

The Earnings page helps you prepare for earnings announcements affecting your portfolio.

### Calendar View

Earnings events are displayed in a timeline sorted by date. Each entry shows:

- **Symbol** -- The reporting company.
- **Report Date** -- When earnings will be announced.
- **Report Time** -- Pre-market, post-market, or during market hours.
- **Fiscal Quarter** -- Which quarter is being reported.
- **Estimated EPS** -- Wall Street consensus estimate.
- **Expected Move** -- The implied price move based on options pricing and historical patterns.
- **Recommendation** -- One of: hold, reduce, hedge, or add.

### Expected Move

The expected move is expressed as a percentage (e.g., 7.2% for NVDA). This represents the market's estimate of how much the stock will move after the report, regardless of direction. It is calculated from historical volatility and options pricing.

### Recommendations

| Recommendation | When It Triggers | What To Do |
|---------------|------------------|------------|
| **Hold** | Moderate expected move, stable history | Keep your current position |
| **Reduce** | High expected move, uncertain outlook | Trim position size by 20-30% |
| **Hedge** | Very high expected move (>8%) | Buy protective puts or collar |
| **Add** | Low expected move, strong beat rate | Maintain or increase position |

### Earnings History

Click on any symbol to view its historical earnings reactions -- the last 8 quarters of actual vs. estimated EPS, post-earnings price moves, and summary statistics including beat rate and average move magnitude.

---

## Backtesting

The Backtest page lets you test investment strategies against historical data.

### Running a Backtest

1. Select symbols to include in the universe.
2. Set the date range (start and end dates).
3. Choose a strategy: Max Sharpe, Min Variance, or Risk Parity.
4. Set the initial capital amount.
5. Configure episode length (trading days per CVRF cycle) and rebalance frequency.
6. Toggle CVRF integration on or off to compare results.
7. Click "Run Backtest."

### Interpreting Results

- **Total Return** -- Cumulative return over the period.
- **Annualized Return** -- Total return converted to a yearly rate.
- **Sharpe Ratio** -- Risk-adjusted return measure. Above 1.0 is good; above 2.0 is excellent.
- **Max Drawdown** -- The worst peak-to-trough decline. Lower is better.
- **Equity Curve** -- A time-series chart showing portfolio value over time.
- **Episode Breakdown** -- Performance metrics for each CVRF episode window.
- **Factor Attribution** -- Which factors drove returns in each period.

---

## AI Explanations

The Explainer provides plain-language explanations for portfolio events. Access it from the Portfolio or Dashboard pages.

### Explanation Types

| Type | What It Explains |
|------|-----------------|
| **Portfolio Move** | Why a specific position was adjusted |
| **Rebalance** | The rationale behind a portfolio rebalance |
| **Earnings** | Pre-earnings positioning guidance |
| **Risk Alert** | Why a risk alert was triggered and what to do |
| **Factor Shift** | Changes in factor regime or exposure |

Explanations draw from multiple data sources (factor engine, sentiment analysis, market data) and include a confidence score and source attribution.

---

## Risk Alerts

Risk alerts notify you when your portfolio crosses predefined thresholds.

### Alert Types

| Alert | Description |
|-------|-------------|
| **Drawdown** | Portfolio has declined beyond your tolerance |
| **Volatility** | 21-day annualized volatility exceeds threshold |
| **Concentration** | A single position exceeds maximum weight limit |
| **Correlation** | Holdings have become too correlated, reducing diversification |
| **Factor Drift** | Portfolio factor exposure has shifted significantly |
| **Earnings Risk** | An upcoming earnings event poses above-average risk |
| **Stop Loss** | A position has hit its stop-loss level |
| **Take Profit** | A position has reached its take-profit target |

### Managing Alerts

- Alerts appear on the Dashboard and the dedicated Alerts page.
- Click an alert to read the full explanation and recommended action.
- Click "Acknowledge" to dismiss an alert after reviewing it.
- Configure alert thresholds in Settings.

---

## Settings

Access Settings from the navigation menu to configure:

- **Display Name** -- Your name shown in the interface.
- **Risk Tolerance** -- Conservative, Moderate, or Aggressive. Affects optimization constraints and alert thresholds.
- **Notifications** -- Toggle browser push notifications on or off.
- **Email Alerts** -- Toggle email notifications for critical alerts.
- **Max Position Size** -- Maximum percentage a single holding can represent (1-100%).
- **Stop Loss** -- Default stop-loss threshold percentage.
- **Take Profit** -- Default take-profit threshold percentage.

---

## PWA Installation

Frontier Alpha is a Progressive Web App (PWA) that can be installed on your device for a native-like experience with offline support.

### Desktop (Chrome / Edge)

1. Visit the Frontier Alpha application in your browser.
2. Look for the install icon in the address bar (a plus icon inside a circle, or a download arrow).
3. Click it and select "Install."
4. The app will open in its own window and appear in your applications list.

### macOS (Safari)

1. Open Frontier Alpha in Safari.
2. Click "File" in the menu bar, then "Add to Dock."
3. The app will appear as a standalone icon in your Dock.

### iOS (Safari)

1. Open Frontier Alpha in Safari.
2. Tap the Share button (square with an arrow pointing up).
3. Scroll down and tap "Add to Home Screen."
4. Name it and tap "Add."

### Android (Chrome)

1. Open Frontier Alpha in Chrome.
2. Tap the three-dot menu in the upper right.
3. Tap "Add to Home screen" or "Install app."
4. Confirm the installation.

### Benefits of Installing

- Loads faster with cached assets.
- Works in its own window without browser UI.
- Receives push notifications for risk alerts and earnings events.
- Limited offline access to cached portfolio data.
