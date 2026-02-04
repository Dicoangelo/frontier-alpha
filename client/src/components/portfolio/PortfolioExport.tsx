import { useState } from 'react';
import { Download, Share2, Copy, Check, FileJson, FileText, X } from 'lucide-react';
import { Button } from '@/components/shared/Button';

interface Position {
  symbol: string;
  shares: number;
  weight: number;
  costBasis: number;
  currentPrice: number;
  unrealizedPnL: number;
}

interface Portfolio {
  id: string;
  name: string;
  positions: Position[];
  cash: number;
  totalValue: number;
  currency: string;
}

interface PortfolioExportProps {
  portfolio: Portfolio;
}

export function PortfolioExport({ portfolio }: PortfolioExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const exportAsCSV = () => {
    const headers = ['Symbol', 'Shares', 'Weight %', 'Cost Basis', 'Current Price', 'Unrealized P&L'];
    const rows = portfolio.positions.map((p) => [
      p.symbol,
      p.shares.toString(),
      (p.weight * 100).toFixed(2),
      p.costBasis.toFixed(2),
      p.currentPrice.toFixed(2),
      p.unrealizedPnL.toFixed(2),
    ]);

    // Add summary row
    rows.push([]);
    rows.push(['Cash', '', '', '', '', portfolio.cash.toFixed(2)]);
    rows.push(['Total Value', '', '', '', '', portfolio.totalValue.toFixed(2)]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    downloadFile(csvContent, `${portfolio.name || 'portfolio'}-${formatDate()}.csv`, 'text/csv');
    setIsOpen(false);
  };

  const exportAsJSON = () => {
    const exportData = {
      name: portfolio.name,
      exportDate: new Date().toISOString(),
      currency: portfolio.currency,
      totalValue: portfolio.totalValue,
      cash: portfolio.cash,
      positions: portfolio.positions.map((p) => ({
        symbol: p.symbol,
        shares: p.shares,
        weight: p.weight,
        costBasis: p.costBasis,
        currentPrice: p.currentPrice,
        unrealizedPnL: p.unrealizedPnL,
        marketValue: p.shares * p.currentPrice,
      })),
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    downloadFile(jsonContent, `${portfolio.name || 'portfolio'}-${formatDate()}.json`, 'application/json');
    setIsOpen(false);
  };

  const copyShareLink = async () => {
    // Generate a shareable link (in production, this would create a server-side share link)
    const shareData = btoa(
      JSON.stringify({
        positions: portfolio.positions.map((p) => ({
          symbol: p.symbol,
          weight: p.weight,
        })),
      })
    );

    const shareUrl = `${window.location.origin}/shared?data=${shareData}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const shareViaWebShare = async () => {
    if (!navigator.share) {
      copyShareLink();
      return;
    }

    try {
      await navigator.share({
        title: `${portfolio.name || 'My Portfolio'} - Frontier Alpha`,
        text: `Check out my portfolio allocation on Frontier Alpha`,
        url: window.location.href,
      });
    } catch (err) {
      // User cancelled or error
      console.log('Share cancelled');
    }
  };

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setIsOpen(!isOpen)}>
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="font-medium text-gray-900">Export Portfolio</h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-2">
              <button
                onClick={exportAsCSV}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <FileText className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-gray-700">Download CSV</p>
                  <p className="text-xs text-gray-500">Spreadsheet format</p>
                </div>
              </button>

              <button
                onClick={exportAsJSON}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <FileJson className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-700">Download JSON</p>
                  <p className="text-xs text-gray-500">Developer format</p>
                </div>
              </button>

              <div className="my-2 border-t border-gray-100" />

              <button
                onClick={shareViaWebShare}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <Share2 className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium text-gray-700">Share Portfolio</p>
                  <p className="text-xs text-gray-500">Send allocation to others</p>
                </div>
              </button>

              <button
                onClick={copyShareLink}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                {copied ? (
                  <Check className="h-5 w-5 text-green-600" />
                ) : (
                  <Copy className="h-5 w-5 text-gray-400" />
                )}
                <div>
                  <p className="font-medium text-gray-700">{copied ? 'Copied!' : 'Copy Link'}</p>
                  <p className="text-xs text-gray-500">Share link to clipboard</p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Helper functions
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
