"""
FRONTIER ALPHA - Python ML Engine
FastAPI server for heavy ML computations
"""
from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
from typing import List, Dict

app = FastAPI(title="Frontier Alpha ML Engine")

class OptimizeRequest(BaseModel):
    symbols: List[str]
    returns: List[List[float]]
    objective: str = "max_sharpe"
    risk_free_rate: float = 0.05

@app.get("/health")
async def health():
    return {"status": "ok", "engine": "python-ml"}

@app.post("/optimize")
async def optimize(request: OptimizeRequest):
    """Run portfolio optimization with PyPortfolioOpt"""
    from pypfopt import expected_returns, risk_models, EfficientFrontier
    import pandas as pd
    
    # Convert to DataFrame
    df = pd.DataFrame(request.returns, index=request.symbols).T
    
    # Calculate expected returns and covariance
    mu = expected_returns.mean_historical_return(df)
    S = risk_models.CovarianceShrinkage(df).ledoit_wolf()
    
    # Optimize
    ef = EfficientFrontier(mu, S)
    
    if request.objective == "max_sharpe":
        weights = ef.max_sharpe(risk_free_rate=request.risk_free_rate)
    elif request.objective == "min_volatility":
        weights = ef.min_volatility()
    else:
        weights = ef.max_sharpe()
    
    cleaned = ef.clean_weights()
    perf = ef.portfolio_performance(risk_free_rate=request.risk_free_rate)
    
    return {
        "weights": cleaned,
        "expected_return": perf[0],
        "volatility": perf[1],
        "sharpe_ratio": perf[2]
    }

@app.post("/sentiment")
async def analyze_sentiment(texts: List[str]):
    """Analyze sentiment using FinBERT"""
    # Stub - in production use transformers
    return [{"label": "neutral", "confidence": 0.5} for _ in texts]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
