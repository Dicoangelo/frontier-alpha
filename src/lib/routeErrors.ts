/**
 * Route error helpers — surface real error messages instead of swallowing
 * them behind generic "An unexpected error occurred" copy.
 *
 * Pattern that triggered this: v1.3.9 `/optimize` route returned generic
 * "Portfolio optimization failed" no matter what actually broke. The real
 * error was 5 levels deep. Debugging took an hour. Same pattern across
 * 19+ other route catch blocks. This helper makes "real message + fallback"
 * a one-line replacement for the verbose duplicate.
 *
 * Usage:
 *   } catch (error) {
 *     return reply.status(500).send(internalError(error, 'Risk calculation'));
 *   }
 *
 * Returns the standard `{ success: false, error: { code, message } }` shape.
 */

interface RouteErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * Build a 500 INTERNAL_ERROR body that surfaces the real `error.message`
 * when available, with a domain-specific fallback prefix.
 *
 * @param error  - The caught error (typed as `unknown` per try/catch)
 * @param domain - Short label for what was being attempted (e.g.,
 *                 "Risk calculation", "Trade explanation"). Used as the
 *                 fallback message AND prefix on the real message so the
 *                 client knows which surface failed.
 */
export function internalError(error: unknown, domain: string): RouteErrorBody {
  const realMessage =
    error instanceof Error && error.message ? error.message : null;

  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: realMessage ? `${domain} failed: ${realMessage}` : `${domain} failed`,
    },
  };
}
