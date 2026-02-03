import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { portfolioApi } from '@/api/portfolio';

interface CognitiveInsightProps {
  symbols: string[];
}

export function CognitiveInsight({ symbols }: CognitiveInsightProps) {
  const [insight, setInsight] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const generateInsight = async () => {
    setIsLoading(true);
    try {
      // For demo, using explain endpoint with first symbol
      const result = await portfolioApi.explain(symbols[0] || 'AAPL', 0.15, 0.20);
      setInsight(result.narrative);
    } catch (error) {
      setInsight('Unable to generate insight. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card
      title="AI-Powered Insights"
      action={
        <Button onClick={generateInsight} isLoading={isLoading} size="sm">
          <Sparkles className="w-4 h-4" />
          Generate Insight
        </Button>
      }
    >
      {insight ? (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800">
            {insight}
          </pre>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Click "Generate Insight" to get AI-powered analysis of your portfolio.</p>
        </div>
      )}
    </Card>
  );
}
