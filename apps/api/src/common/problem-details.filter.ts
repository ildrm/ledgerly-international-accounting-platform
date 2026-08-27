import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from './domain-error';

const statusByKind = {
  validation: HttpStatus.BAD_REQUEST,
  authentication: HttpStatus.UNAUTHORIZED,
  authorization: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  business_rule: HttpStatus.UNPROCESSABLE_ENTITY,
} as const;

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp();
    const reply = response.getResponse<FastifyReply>();
    const request = response.getRequest<FastifyRequest>();

    if (error instanceof DomainError) {
      const status = statusByKind[error.kind];
      reply.status(status).type('application/problem+json').send({
        type: `https://docs.ledgerly.app/problems/${error.code.toLowerCase().replaceAll('_', '-')}`,
        title: error.code,
        status,
        code: error.code,
        messageKey: `errors.${error.code}`,
        params: error.parameters,
        fieldErrors: error.fieldErrors,
        instance: request.url,
        correlationId: request.id,
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).type('application/problem+json').send({
        type: 'https://docs.ledgerly.app/problems/validation-failed',
        title: 'VALIDATION_FAILED',
        status: 400,
        code: 'VALIDATION_FAILED',
        messageKey: 'errors.VALIDATION_FAILED',
        fieldErrors: error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
        instance: request.url,
        correlationId: request.id,
      });
      return;
    }

    if (error instanceof HttpException) {
      const status = error.getStatus();
      reply.status(status).type('application/problem+json').send({
        type: 'about:blank',
        title: HttpStatus[status] ?? 'HTTP_ERROR',
        status,
        code: 'HTTP_ERROR',
        messageKey: 'errors.HTTP_ERROR',
        instance: request.url,
        correlationId: request.id,
      });
      return;
    }

    request.log.error({ err: error }, 'Unhandled request failure');
    reply.status(500).type('application/problem+json').send({
      type: 'https://docs.ledgerly.app/problems/internal-error',
      title: 'INTERNAL_ERROR',
      status: 500,
      code: 'INTERNAL_ERROR',
      messageKey: 'errors.INTERNAL_ERROR',
      instance: request.url,
      correlationId: request.id,
    });
  }
}
