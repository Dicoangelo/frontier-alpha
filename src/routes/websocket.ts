import type { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger.js';

interface RouteContext {
  server: {
    dataProvider: {
      subscribeQuotes(symbols: string[], callback: (quote: unknown) => void): Promise<() => void>;
    };
  };
}

export async function websocketRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.get('/ws/quotes', { websocket: true }, (connection: any, _req: any) => {
    const symbols = new Set<string>();

    connection.socket.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'subscribe') {
          for (const symbol of data.symbols || []) {
            symbols.add(symbol);
          }

          // Start streaming quotes
          const unsubscribe = await server.dataProvider.subscribeQuotes(
            Array.from(symbols),
            (quote) => {
              connection.socket.send(JSON.stringify({
                type: 'quote',
                data: quote,
              }));
            }
          );

          connection.socket.on('close', () => {
            unsubscribe();
          });
        }
      } catch (e) {
        logger.error({ err: e }, 'WebSocket message error');
      }
    });
  });
}
