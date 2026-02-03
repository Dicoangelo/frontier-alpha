# 🤠 Frontier Alpha

> **Cognitive Factor Intelligence Platform**  
> AI-powered portfolio optimization with explainable recommendations

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is Frontier Alpha?

Frontier Alpha brings **institutional-grade quantitative analysis** to retail investors with one critical innovation: **it explains itself**.

Unlike black-box quant tools or simplistic robo-advisors, Frontier Alpha:
- Analyzes **80+ research-backed factors** (not just Fama-French 5)
- Integrates **real-time sentiment** from news and social media
- Provides **plain-language explanations** for every recommendation
- Forecasts **earnings impact** with factor-adjusted expected moves

## Features

| Feature | Description |
|---------|-------------|
| **Factor Engine** | Calculate 80+ factor exposures including momentum, value, quality, volatility |
| **Portfolio Optimizer** | Monte Carlo simulation with Sharpe maximization, risk parity, min variance |
| **Cognitive Explainer** | AI that explains *why* it's making recommendations |
| **Earnings Oracle** | Factor-adjusted pre-announcement positioning |
| **Real-time Data** | WebSocket streaming from Polygon.io with <20ms latency |

## Quick Start

```bash
# Install dependencies
npm install

# Set environment variables
export POLYGON_API_KEY=your_polygon_key
export ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key

# Start development server
npm run dev
```

Visit `http://localhost:3000/health` to verify the server is running.

## API Examples

### Optimize a Portfolio

```bash
curl -X POST http://localhost:3000/api/v1/portfolio/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL", "NVDA", "MSFT", "GOOGL", "AMZN"],
    "config": {
      "objective": "max_sharpe",
      "riskFreeRate": 0.05
    }
  }'
```

### Get Factor Exposures

```bash
curl http://localhost:3000/api/v1/portfolio/factors/AAPL,NVDA,MSFT
```

### Earnings Impact Forecast

```bash
curl http://localhost:3000/api/v1/earnings/forecast/NVDA
```

## Architecture

```
frontier-alpha/
├── src/
│   ├── types/          # TypeScript type definitions
│   ├── factors/        # Factor Engine (80+ factors)
│   ├── optimizer/      # Portfolio Optimizer (Monte Carlo)
│   ├── core/           # Cognitive Explainer, Earnings Oracle
│   ├── data/           # Market Data Provider
│   ├── api/            # API routes
│   └── index.ts        # Main entry point
├── ml/                 # Python ML engine (optional)
├── docs/               # Documentation
│   └── PROTOCOL.md     # Full discovery & innovation protocol
└── tests/              # Test suite
```

## Tech Stack

**Backend (TypeScript)**
- Node.js 20 + Fastify
- Socket.io for WebSocket
- PostgreSQL + TimescaleDB

**ML Engine (Python)**
- PyPortfolioOpt for optimization
- scikit-learn for factor models
- FinBERT for sentiment analysis

**Data Sources**
- Polygon.io (real-time quotes)
- Alpha Vantage (fundamentals)
- Ken French Library (factor returns)

## Documentation

See [docs/PROTOCOL.md](docs/PROTOCOL.md) for the complete Discovery & Innovation Protocol including:
- Research foundation
- Architecture diagrams
- API specifications
- Backtest results
- Success metrics

## License

MIT License - see LICENSE file for details.

---

*Built with 🤠 frontier energy by Metaventions AI*
