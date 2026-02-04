import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Frontier Alpha API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css">
  <link rel="icon" type="image/svg+xml" href="/vite.svg">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #fafafa;
    }
    .topbar {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%) !important;
    }
    .swagger-ui .info .title {
      color: #1e293b;
      font-weight: 700;
    }
    .swagger-ui .info hgroup.main a {
      display: none;
    }
    .swagger-ui .info .description p {
      color: #475569;
    }
    .swagger-ui .opblock-tag {
      border-bottom: 1px solid #e2e8f0;
    }
    .swagger-ui .opblock.opblock-get .opblock-summary-method {
      background: #10b981;
    }
    .swagger-ui .opblock.opblock-post .opblock-summary-method {
      background: #3b82f6;
    }
    .swagger-ui .opblock.opblock-put .opblock-summary-method {
      background: #f59e0b;
    }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method {
      background: #ef4444;
    }
    .swagger-ui .btn.authorize {
      background: #0284c7;
      border-color: #0284c7;
      color: white;
    }
    .swagger-ui .btn.authorize:hover {
      background: #0369a1;
      border-color: #0369a1;
    }
    .swagger-ui .authorization__btn.locked {
      background-color: #10b981;
    }
    .swagger-ui .model-box {
      background: #f8fafc;
    }
    /* Rate limit info banner */
    .rate-limit-banner {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 16px 0;
      font-size: 14px;
      color: #92400e;
    }
    .rate-limit-banner strong {
      color: #78350f;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api/openapi',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true,
        tryItOutEnabled: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        docExpansion: "list",
        filter: true,
        showCommonExtensions: true,
        syntaxHighlight: {
          activate: true,
          theme: "monokai"
        },
        requestInterceptor: (request) => {
          // Add any request interceptors here
          return request;
        },
        responseInterceptor: (response) => {
          // Show rate limit headers in response
          if (response.headers) {
            const rateLimit = response.headers['x-ratelimit-remaining'];
            if (rateLimit !== undefined) {
              console.log('Rate limit remaining:', rateLimit);
            }
          }
          return response;
        }
      });

      window.ui = ui;
    };
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
