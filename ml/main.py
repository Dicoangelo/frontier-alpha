"""
FRONTIER ALPHA - Python ML Engine
FastAPI server for heavy ML computations.
Hosts: Railway (port from $PORT env var, falls back to 8000).
"""
import os
import asyncio
import json
import re
from typing import List, Dict, Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Frontier Alpha ML Engine", version="1.1.0")

# ── /optimize ──────────────────────────────────────────────────────────────


class OptimizeRequest(BaseModel):
    symbols: List[str]
    returns: List[List[float]]
    objective: str = "max_sharpe"
    risk_free_rate: float = 0.05


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engine": "python-ml",
        "version": app.version,
        "endpoints": ["optimize", "sentiment"],
    }


@app.post("/optimize")
async def optimize(request: OptimizeRequest):
    """Run portfolio optimization with PyPortfolioOpt."""
    from pypfopt import expected_returns, risk_models, EfficientFrontier
    import pandas as pd

    df = pd.DataFrame(request.returns, index=request.symbols).T

    mu = expected_returns.mean_historical_return(df)
    S = risk_models.CovarianceShrinkage(df).ledoit_wolf()

    ef = EfficientFrontier(mu, S)

    if request.objective == "max_sharpe":
        ef.max_sharpe(risk_free_rate=request.risk_free_rate)
    elif request.objective == "min_volatility":
        ef.min_volatility()
    else:
        ef.max_sharpe()

    cleaned = ef.clean_weights()
    perf = ef.portfolio_performance(risk_free_rate=request.risk_free_rate)

    return {
        "weights": cleaned,
        "expected_return": perf[0],
        "volatility": perf[1],
        "sharpe_ratio": perf[2],
    }


# ── /sentiment ─────────────────────────────────────────────────────────────


class SentimentItem(BaseModel):
    label: str  # 'bullish' | 'neutral' | 'bearish'
    score: float  # -1.0 to 1.0
    confidence: float  # 0.0 to 1.0


SENTIMENT_PROMPT = (
    "You are a financial sentiment classifier. For each text, decide whether it expresses a "
    "bullish, neutral, or bearish stance toward the referenced asset/market. Respond with ONLY "
    "a JSON array, one object per input, in the same order. Each object: "
    '{"label": "bullish"|"neutral"|"bearish", "score": -1..1, "confidence": 0..1}. '
    "No prose, no markdown."
)


def _heuristic_sentiment(text: str) -> SentimentItem:
    """Fast keyword fallback when no LLM key is available."""
    t = text.lower()
    bullish = sum(1 for w in ("beat", "upgrade", "buy", "bullish", "surge", "rally", "outperform", "positive") if w in t)
    bearish = sum(1 for w in ("miss", "downgrade", "sell", "bearish", "plunge", "crash", "underperform", "negative") if w in t)
    if bullish > bearish:
        return SentimentItem(label="bullish", score=min(1.0, bullish / 3), confidence=0.55)
    if bearish > bullish:
        return SentimentItem(label="bearish", score=max(-1.0, -bearish / 3), confidence=0.55)
    return SentimentItem(label="neutral", score=0.0, confidence=0.5)


def _resolve_llm() -> Optional[Dict[str, str]]:
    if os.getenv("DEEPSEEK_API_KEY"):
        return {
            "key": os.environ["DEEPSEEK_API_KEY"],
            "base": "https://api.deepseek.com/v1",
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        }
    if os.getenv("OPENAI_API_KEY"):
        return {
            "key": os.environ["OPENAI_API_KEY"],
            "base": "https://api.openai.com/v1",
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        }
    return None


@app.post("/sentiment")
async def analyze_sentiment(texts: List[str]):
    """Classify financial sentiment via DeepSeek/OpenAI; fallback to keyword heuristic."""
    if not texts:
        return []

    provider = _resolve_llm()
    if provider is None:
        return [_heuristic_sentiment(t).model_dump() for t in texts]

    user_payload = json.dumps([{"i": i, "text": t} for i, t in enumerate(texts)])

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{provider['base']}/chat/completions",
                headers={"Authorization": f"Bearer {provider['key']}", "Content-Type": "application/json"},
                json={
                    "model": provider["model"],
                    "messages": [
                        {"role": "system", "content": SENTIMENT_PROMPT},
                        {"role": "user", "content": user_payload},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 600,
                },
            )

        if resp.status_code != 200:
            return [_heuristic_sentiment(t).model_dump() for t in texts]

        content = resp.json()["choices"][0]["message"]["content"].strip()
        # Strip optional markdown fences the model may add despite instructions
        content = re.sub(r"^```(?:json)?\s*|```$", "", content, flags=re.MULTILINE).strip()
        parsed = json.loads(content)

        if not isinstance(parsed, list) or len(parsed) != len(texts):
            return [_heuristic_sentiment(t).model_dump() for t in texts]

        out = []
        for item in parsed:
            label = str(item.get("label", "neutral")).lower()
            if label not in {"bullish", "neutral", "bearish"}:
                label = "neutral"
            score = max(-1.0, min(1.0, float(item.get("score", 0))))
            confidence = max(0.0, min(1.0, float(item.get("confidence", 0.7))))
            out.append({"label": label, "score": score, "confidence": confidence})
        return out

    except Exception:
        return [_heuristic_sentiment(t).model_dump() for t in texts]


# ── entrypoint (Railway sets PORT) ─────────────────────────────────────────


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
