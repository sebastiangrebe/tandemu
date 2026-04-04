import {
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import type { Response } from 'express';
import type { ApiError } from '@tandemu/types';

interface ExceptionResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: ApiError;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as string | ExceptionResponse;

      if (typeof exceptionResponse === 'string') {
        errorResponse = {
          code: HttpStatus[status] ?? 'UNKNOWN_ERROR',
          message: exceptionResponse,
        };
      } else {
        const message = Array.isArray(exceptionResponse.message)
          ? exceptionResponse.message.join(', ')
          : exceptionResponse.message ?? exception.message;

        errorResponse = {
          code: exceptionResponse.error ?? HttpStatus[status] ?? 'UNKNOWN_ERROR',
          message,
          details: typeof exceptionResponse === 'object' ? (exceptionResponse as unknown as Record<string, unknown>) : undefined,
        };
      }
    } else if (exception instanceof Error) {
      errorResponse = {
        code: 'INTERNAL_SERVER_ERROR',
        message: exception.message,
      };
    } else {
      errorResponse = {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      };
    }

    response.status(status).json({
      success: false,
      error: errorResponse.message,
      ...errorResponse,
    });
  }
}
