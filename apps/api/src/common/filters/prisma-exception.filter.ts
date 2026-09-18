import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Μεταφράζει σφάλματα Prisma σε HTTP αποκρίσεις με ελληνικό μήνυμα.
 * Χωρίς αυτό, μια παραβίαση unique constraint φτάνει στο UI ως 500.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'πεδίο';
        const error = new ConflictException(`Υπάρχει ήδη εγγραφή με το ίδιο ${target}.`);
        response.status(error.getStatus()).json(error.getResponse());
        return;
      }
      case 'P2025': {
        const error = new NotFoundException('Η εγγραφή δεν βρέθηκε.');
        response.status(error.getStatus()).json(error.getResponse());
        return;
      }
      case 'P2003': {
        const error = new ConflictException('Η εγγραφή αναφέρεται σε ανύπαρκτη σχέση.');
        response.status(error.getStatus()).json(error.getResponse());
        return;
      }
      default:
        this.logger.error(`Ανεπίλυτο σφάλμα Prisma ${exception.code}: ${exception.message}`);
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Σφάλμα βάσης δεδομένων.',
          code: exception.code,
        });
    }
  }
}
