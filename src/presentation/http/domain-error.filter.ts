import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { ConflictError, DomainError, NotFoundError, ValidationError } from '../../domain/shared/domain-error';

const STATUS: [new (...args: never[]) => DomainError, HttpStatus][] = [
  [ValidationError, HttpStatus.BAD_REQUEST],
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
];

/** Turns domain errors into HTTP responses shaped like Nest's own errors. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const statusCode = STATUS.find(([type]) => error instanceof type)?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message: error.message, error: HttpStatus[statusCode] });
  }
}
