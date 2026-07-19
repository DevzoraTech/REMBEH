import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientInitializationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientInitializationError,
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse<Response>();
    const isConnectionError = this.isConnectionError(exception);

    if (isConnectionError) {
      this.logger.error(
        'Database connection failed. Check DATABASE_URL, network access, and that PostgreSQL is reachable.',
        exception.message,
      );

      const body = new ServiceUnavailableException(
        'Database is unavailable. Verify DATABASE_URL (and SSL settings for remote RDS), then retry.',
      ).getResponse();

      response.status(HttpStatus.SERVICE_UNAVAILABLE).json(body);
      return;
    }

    this.logger.error(exception.message, exception.stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Unexpected database error.',
      error: 'Internal Server Error',
    });
  }

  private isConnectionError(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientInitializationError,
  ) {
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return true;
    }

    const code = exception.code;
    return (
      code === 'P1001' ||
      code === 'P1000' ||
      code === 'P1017' ||
      code === 'ECONNREFUSED' ||
      /ECONNREFUSED|Can't reach database server/i.test(exception.message)
    );
  }
}
