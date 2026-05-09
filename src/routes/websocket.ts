import type { FastifyInstance } from 'fastify';
import { logger } from '../observability/logger.js';

interface RouteContext {
  server: {
    dataProvider: {
      subscribeQuotes(symbols: string[], callback: (quote: unknown) => void): Promise<() => void>;
    };
  };
}

/**
 * @fastify/websocket v8+ handler signature is `(socket, request)` where `socket`
 * is the raw WebSocket. Earlier versions wrapped it as `connection.socket`,
 * which is what this file used to assume — that mismatch crashed every
 * upgrade with `Cannot read properties of undefined (reading 'on')` on
 * Railway under v10.x.
 *
 * Defensive shim: accept either shape so a future major bump doesn't silently
 * break the handshake again.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSocket(connection: any): any {
  // v8+ passes WebSocket directly; v7 wrapped it as `{ socket }`.
  return connection?.socket ?? connection;
}

export async function websocketRoutes(fastify: FastifyInstance, opts: RouteContext) {
  const { server } = opts;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastify.get('/ws/quotes', { websocket: true }, (connection: any, _req: any) => {
    const socket = getSocket(connection);
    if (!socket || typeof socket.on !== 'function') {
      logger.error({ connectionShape: typeof connection }, 'WebSocket handler: socket missing');
      return;
    }

    const symbols = new Set<string>();
    const unsubscribers: Array<() => void> = [];

    // Send a hello frame immediately so clients know the upgrade succeeded
    // before the first quote (helps client detect "connected" reliably and
    // gives wscat operators a visible signal).
    try {
      socket.send(JSON.stringify({ type: 'hello', service: 'frontier-alpha-api', ts: Date.now() }));
    } catch (e) {
      logger.warn({ err: e }, 'WebSocket hello send failed');
    }

    socket.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString()) as { type?: string; symbols?: string[] };

        if (data.type === 'ping') {
          // Heartbeat handshake — client expects { type: 'pong' }
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          return;
        }

        if (data.type === 'subscribe') {
          for (const symbol of data.symbols || []) {
            symbols.add(symbol);
          }

          const unsubscribe = await server.dataProvider.subscribeQuotes(
            Array.from(symbols),
            (quote) => {
              try {
                socket.send(JSON.stringify({ type: 'quote', data: quote }));
              } catch {
                // Socket closed mid-send; ignore — close handler will clean up.
              }
            },
          );
          unsubscribers.push(unsubscribe);
        }
      } catch (e) {
        logger.error({ err: e }, 'WebSocket message error');
      }
    });

    socket.on('close', () => {
      for (const unsub of unsubscribers) {
        try { unsub(); } catch { /* ignore */ }
      }
      unsubscribers.length = 0;
    });

    socket.on('error', (err: unknown) => {
      logger.warn({ err }, 'WebSocket socket error');
    });
  });
}
