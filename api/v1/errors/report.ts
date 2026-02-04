import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ErrorReport {
  eventId: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
}

// In production, this would be stored in a database or sent to Sentry
const errorLog: ErrorReport[] = [];
const MAX_ERRORS = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' },
    });
  }

  try {
    const report = req.body as ErrorReport;

    // Validate required fields
    if (!report.eventId || !report.error?.message) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid error report' },
      });
    }

    // Log the error
    console.error('[Error Report]', {
      eventId: report.eventId,
      error: report.error.name + ': ' + report.error.message,
      url: report.url,
      timestamp: report.timestamp,
    });

    // Store in memory (in production, use Sentry or database)
    errorLog.push(report);
    if (errorLog.length > MAX_ERRORS) {
      errorLog.splice(0, errorLog.length - MAX_ERRORS);
    }

    // In production, send to Sentry:
    // Sentry.captureException(new Error(report.error.message), {
    //   extra: {
    //     stack: report.error.stack,
    //     componentStack: report.componentStack,
    //     url: report.url,
    //     userAgent: report.userAgent,
    //   },
    // });

    return res.status(200).json({
      success: true,
      data: { eventId: report.eventId, received: true },
    });
  } catch (error) {
    console.error('[Error Report] Failed to process:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process error report' },
    });
  }
}
