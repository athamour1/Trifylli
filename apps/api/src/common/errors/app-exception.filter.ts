import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaExceptionFilter } from '../filters/prisma-exception.filter';
import { reportError } from './error-reporting';

/**
 * Το ΜΟΝΑΔΙΚΟ global filter. Δύο global filters (ένα για την Prisma κι ένα
 * catch-all) θα άφηναν τη σειρά επιλογής στο Nest — και ένα catch-all που
 * κερδίζει «καταπίνει» τα 409/404 της Prisma. Εδώ:
 *   - σφάλματα Prisma → η μετάφρασή τους (PrismaExceptionFilter), όπως πριν·
 *   - όλα τα άλλα → η προεπιλογή του Nest·
 *   - ό,τι καταλήγει 5xx → και στο error tracking, με τον λογαριασμό.
 */
@Catch()
export class AppExceptionFilter extends BaseExceptionFilter {
  private readonly prisma = new PrismaExceptionFilter();

  override catch(exception: unknown, host: ArgumentsHost): void {
    if (isServerError(exception)) {
      const request = host.getType() === 'http' ? host.switchToHttp().getRequest<Request>() : undefined;
      reportError(exception, request?.user?.id ? { userId: request.user.id } : {});
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.prisma.catch(exception, host);
      return;
    }
    super.catch(exception, host);
  }
}

function isServerError(exception: unknown): boolean {
  if (exception instanceof HttpException) return exception.getStatus() >= 500;
  if (exception instanceof Prisma.PrismaClientKnownRequestError) return !PrismaExceptionFilter.isClientError(exception.code);
  return true;
}
