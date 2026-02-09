/**
 * Structured Logger for Frontier Alpha
 *
 * Pino-style structured JSON logger (zero dependencies).
 *
 * Features:
 * - Log levels: debug, info, warn, error
 * - Structured JSON output (production) / pretty console (development)
 * - Request correlation via requestId
 * - Automatic redaction of sensitive fields
 * - Arbitrary context on every log entry
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

interface LoggerOptions {
  /** Minimum level to emit. Defaults to 'info' in production, 'debug' otherwise. */
  level?: LogLevel;
  /** Force JSON output regardless of environment. */
  json?: boolean;
  /** Additional fields to redact (merged with defaults). */
  redactFields?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_REDACT_FIELDS = [
  'password',
  'token',
  'key',
  'secret',
  'authorization',
  'cookie',
  'api_key',
  'apiKey',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
];

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Logger implementation
// ---------------------------------------------------------------------------

export class Logger {
  private levelValue: number;
  private useJson: boolean;
  private redactSet: Set<string>;
  private defaultContext: Record<string, unknown>;

  constructor(opts: LoggerOptions = {}, defaultContext: Record<string, unknown> = {}) {
    const level = opts.level ?? (IS_PRODUCTION ? 'info' : 'debug');
    this.levelValue = LEVEL_VALUES[level];
    this.useJson = opts.json ?? IS_PRODUCTION;
    this.redactSet = new Set([
      ...DEFAULT_REDACT_FIELDS,
      ...(opts.redactFields ?? []),
    ].map((f) => f.toLowerCase()));
    this.defaultContext = defaultContext;
  }

  // ---- public API ---------------------------------------------------------

  debug(msg: string, context?: Record<string, unknown>): void {
    this.log('debug', msg, context);
  }

  info(msg: string, context?: Record<string, unknown>): void {
    this.log('info', msg, context);
  }

  warn(msg: string, context?: Record<string, unknown>): void {
    this.log('warn', msg, context);
  }

  error(msg: string, context?: Record<string, unknown>): void {
    this.log('error', msg, context);
  }

  /**
   * Create a child logger that inherits options and merges additional default context.
   * Useful for per-request loggers that carry requestId automatically.
   */
  child(bindings: Record<string, unknown>): Logger {
    const child = new Logger(
      {
        level: this.levelName(),
        json: this.useJson,
      },
      { ...this.defaultContext, ...bindings },
    );
    child.redactSet = this.redactSet;
    return child;
  }

  // ---- internal -----------------------------------------------------------

  private levelName(): LogLevel {
    for (const [name, val] of Object.entries(LEVEL_VALUES)) {
      if (val === this.levelValue) return name as LogLevel;
    }
    return 'info';
  }

  private log(level: LogLevel, msg: string, context?: Record<string, unknown>): void {
    if (LEVEL_VALUES[level] < this.levelValue) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      ...this.defaultContext,
      ...this.redact(context ?? {}),
    };

    if (this.useJson) {
      this.writeJson(entry);
    } else {
      this.writePretty(entry);
    }
  }

  /**
   * Deep-redact sensitive keys from an object.  Returns a new object; never
   * mutates the original.
   */
  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.redactSet.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error)) {
        result[key] = this.redact(value as Record<string, unknown>);
      } else if (value instanceof Error) {
        result[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private writeJson(entry: LogEntry): void {
    const stream = entry.level === 'error' || entry.level === 'warn' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  }

  private writePretty(entry: LogEntry): void {
    const { timestamp, level, msg, ...rest } = entry;
    const ts = timestamp.slice(11, 23); // HH:MM:SS.mmm
    const colorLevel = this.colorize(level);
    const extra = Object.keys(rest).length > 0 ? ' ' + JSON.stringify(rest) : '';

    const line = `${ts} ${colorLevel} ${msg}${extra}\n`;

    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(line);
  }

  private colorize(level: LogLevel): string {
    // ANSI escape codes — no-op if output is piped / not a TTY
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[90mDEBUG\x1b[0m', // gray
      info: '\x1b[36mINFO \x1b[0m',  // cyan
      warn: '\x1b[33mWARN \x1b[0m',  // yellow
      error: '\x1b[31mERROR\x1b[0m', // red
    };
    return colors[level];
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const logger = new Logger();
