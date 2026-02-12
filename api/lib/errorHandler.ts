import type { VercelRequest, VercelResponse } from '@vercel/node';

// Standard error codes
export const ErrorCodes = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  TIMEOUT: 'TIMEOUT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Standardized error response schema.
 * All API errors follow this format:
 * { success: false, error: { code: string, message: string, details?: object } }
 */
export interface ApiError {
  code: ErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
  retryAfter?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    timestamp: string;
    requestId: string;
    latencyMs: number;
    [key: string]: unknown;
  };
}

// Custom error class
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly retryAfter?: number;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>,
    retryAfter?: number
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.retryAfter = retryAfter;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(ErrorCodes.BAD_REQUEST, message, 400, details);
  }

  static unauthorized(message: string = 'Authentication required'): AppError {
    return new AppError(ErrorCodes.UNAUTHORIZED, message, 401);
  }

  static forbidden(message: string = 'Access denied'): AppError {
    return new AppError(ErrorCodes.FORBIDDEN, message, 403);
  }

  static notFound(resource: string = 'Resource'): AppError {
    return new AppError(ErrorCodes.NOT_FOUND, `${resource} not found`, 404);
  }

  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(ErrorCodes.VALIDATION_ERROR, message, 400, details);
  }

  static rateLimited(retryAfter: number = 60): AppError {
    return new AppError(
      ErrorCodes.RATE_LIMITED,
      'Rate limit exceeded. Please try again later.',
      429,
      undefined,
      retryAfter
    );
  }

  static serverError(message: string = 'An unexpected error occurred'): AppError {
    return new AppError(ErrorCodes.INTERNAL_ERROR, message, 500);
  }

  static methodNotAllowed(message: string = 'Method not allowed'): AppError {
    return new AppError(ErrorCodes.METHOD_NOT_ALLOWED, message, 405);
  }

  static databaseError(message: string): AppError {
    return new AppError(ErrorCodes.DATABASE_ERROR, message, 500);
  }

  static externalApiError(service: string, message: string): AppError {
    return new AppError(
      ErrorCodes.EXTERNAL_API_ERROR,
      `External service error (${service}): ${message}`,
      502
    );
  }

  static timeout(operation: string): AppError {
    return new AppError(ErrorCodes.TIMEOUT, `Operation timed out: ${operation}`, 504);
  }
}

// Generate unique request ID
function generateRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Error handler middleware wrapper
export function withErrorHandler<T>(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<T>
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const start = Date.now();
    const requestId = generateRequestId();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Request-ID', requestId);

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    try {
      await handler(req, res);
    } catch (error) {
      const latencyMs = Date.now() - start;

      // Log error
      console.error(`[${requestId}] Error:`, {
        method: req.method,
        url: req.url,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Handle known errors
      if (error instanceof AppError) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            retryAfter: error.retryAfter,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            latencyMs,
          },
        };

        if (error.retryAfter) {
          res.setHeader('Retry-After', error.retryAfter.toString());
        }

        res.status(error.statusCode).json(response);
        return;
      }

      // Handle Supabase errors
      if (error && typeof error === 'object' && 'code' in error) {
        const supabaseError = error as { code: string; message?: string };

        if (supabaseError.code === 'PGRST116') {
          // Row not found
          const response: ApiResponse = {
            success: false,
            error: {
              code: ErrorCodes.NOT_FOUND,
              message: 'Resource not found',
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId,
              latencyMs,
            },
          };
          res.status(404).json(response);
          return;
        }

        if (supabaseError.code === 'PGRST301') {
          // JWT expired
          const response: ApiResponse = {
            success: false,
            error: {
              code: ErrorCodes.UNAUTHORIZED,
              message: 'Session expired. Please log in again.',
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId,
              latencyMs,
            },
          };
          res.status(401).json(response);
          return;
        }
      }

      // Handle fetch errors (external API failures)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: ErrorCodes.EXTERNAL_API_ERROR,
            message: 'Failed to connect to external service',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            latencyMs,
          },
        };
        res.status(502).json(response);
        return;
      }

      // Unknown errors — never expose technical details to client
      const response: ApiResponse = {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          latencyMs,
        },
      };

      res.status(500).json(response);
    }
  };
}

// Success response helper
export function success<T>(
  res: VercelResponse,
  data: T,
  statusCode: number = 200,
  meta?: Record<string, any>
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: (res.getHeader('X-Request-ID') as string) || generateRequestId(),
      latencyMs: 0,
      ...meta,
    },
  };

  res.status(statusCode).json(response);
}

// ============================================================================
// Standardized Error Response Helpers
//
// These functions send a standardized error response directly via res.json().
// Use them in Vercel endpoint handlers for consistent error formatting:
//
//   badRequest(res, 'Missing symbol');
//   unauthorized(res);
//   notFound(res, 'Portfolio');
//   validationError(res, 'Invalid input', { symbol: 'Symbol is required' });
//   internalError(res);
//   methodNotAllowed(res);
//
// All responses follow the schema:
//   { success: false, error: { code: string, message: string, details?: object } }
// ============================================================================

function sendErrorResponse(
  res: VercelResponse,
  statusCode: number,
  code: ErrorCode | string,
  message: string,
  details?: Record<string, unknown>,
): void {
  const body: ApiResponse = {
    success: false,
    error: { code, message, ...(details && { details }) },
  };
  res.status(statusCode).json(body);
}

/** 400 — generic bad request */
export function badRequest(
  res: VercelResponse,
  message: string = 'Bad request',
  details?: Record<string, unknown>,
): void {
  sendErrorResponse(res, 400, ErrorCodes.BAD_REQUEST, message, details);
}

/** 401 — authentication required */
export function unauthorized(
  res: VercelResponse,
  message: string = 'Authentication required',
): void {
  sendErrorResponse(res, 401, ErrorCodes.UNAUTHORIZED, message);
}

/** 403 — access denied */
export function forbidden(
  res: VercelResponse,
  message: string = 'Access denied',
): void {
  sendErrorResponse(res, 403, ErrorCodes.FORBIDDEN, message);
}

/** 404 — resource not found */
export function notFound(
  res: VercelResponse,
  resource: string = 'Resource',
): void {
  sendErrorResponse(res, 404, ErrorCodes.NOT_FOUND, `${resource} not found`);
}

/** 400 — validation error with optional field-level details */
export function validationError(
  res: VercelResponse,
  message: string = 'Validation failed',
  details?: Record<string, unknown>,
): void {
  sendErrorResponse(res, 400, ErrorCodes.VALIDATION_ERROR, message, details);
}

/** 405 — method not allowed */
export function methodNotAllowed(
  res: VercelResponse,
  message: string = 'Method not allowed',
): void {
  sendErrorResponse(res, 405, ErrorCodes.METHOD_NOT_ALLOWED, message);
}

/** 500 — internal server error (never expose technical details to client) */
export function internalError(
  res: VercelResponse,
  message: string = 'An unexpected error occurred',
): void {
  sendErrorResponse(res, 500, ErrorCodes.INTERNAL_ERROR, message);
}

// Validation helpers
export function validateRequired(
  value: any,
  fieldName: string
): asserts value {
  if (value === undefined || value === null || value === '') {
    throw AppError.validation(`${fieldName} is required`);
  }
}

export function validateString(
  value: any,
  fieldName: string,
  minLength?: number,
  maxLength?: number
): asserts value is string {
  validateRequired(value, fieldName);

  if (typeof value !== 'string') {
    throw AppError.validation(`${fieldName} must be a string`);
  }

  if (minLength !== undefined && value.length < minLength) {
    throw AppError.validation(`${fieldName} must be at least ${minLength} characters`);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw AppError.validation(`${fieldName} must be at most ${maxLength} characters`);
  }
}

export function validateNumber(
  value: any,
  fieldName: string,
  min?: number,
  max?: number
): asserts value is number {
  validateRequired(value, fieldName);

  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (typeof num !== 'number' || isNaN(num)) {
    throw AppError.validation(`${fieldName} must be a number`);
  }

  if (min !== undefined && num < min) {
    throw AppError.validation(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw AppError.validation(`${fieldName} must be at most ${max}`);
  }
}

export function validateEmail(value: any, fieldName: string = 'email'): asserts value is string {
  validateString(value, fieldName);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw AppError.validation(`${fieldName} must be a valid email address`);
  }
}

export function validateSymbol(value: any, fieldName: string = 'symbol'): asserts value is string {
  validateString(value, fieldName, 1, 10);

  const symbolRegex = /^[A-Z0-9.]+$/;
  if (!symbolRegex.test(value.toUpperCase())) {
    throw AppError.validation(`${fieldName} must be a valid stock symbol`);
  }
}
