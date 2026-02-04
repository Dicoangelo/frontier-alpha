import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Determine format from query or Accept header
  const format = req.query.format as string ||
    (req.headers.accept?.includes('yaml') ? 'yaml' : 'json');

  try {
    // Serve YAML if requested
    if (format === 'yaml') {
      const yamlPath = join(__dirname, 'openapi.yaml');
      const yamlContent = readFileSync(yamlPath, 'utf-8');
      res.setHeader('Content-Type', 'text/yaml');
      return res.status(200).send(yamlContent);
    }

    // Default: serve JSON spec
    const jsonPath = join(__dirname, 'openapi-spec.json');
    const jsonContent = readFileSync(jsonPath, 'utf-8');
    const spec = JSON.parse(jsonContent);

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(spec);
  } catch (error) {
    // Fallback: minimal inline spec
    const fallbackSpec = {
      openapi: '3.0.3',
      info: {
        title: 'Frontier Alpha API',
        version: '1.0.5',
        description: 'AI-Powered Cognitive Factor Intelligence Platform API. Visit /api/docs for interactive documentation.',
      },
      servers: [
        { url: '/api/v1', description: 'Production API (v1)' },
        { url: 'http://localhost:3000/api/v1', description: 'Local development' },
      ],
      paths: {},
      externalDocs: {
        description: 'Full API Documentation',
        url: '/api/docs',
      },
    };

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(fallbackSpec);
  }
}
