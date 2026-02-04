import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const specPath = join(__dirname, 'openapi.json');
    const specContent = readFileSync(specPath, 'utf-8');
    const spec = JSON.parse(specContent);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(spec);
  } catch (error) {
    // Fallback: return inline spec if file read fails
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      openapi: '3.0.3',
      info: {
        title: 'Frontier Alpha API',
        version: '1.0.4',
        description: 'AI-Powered Cognitive Factor Intelligence Platform API',
      },
      paths: {},
      error: 'Full spec not available',
    });
  }
}
