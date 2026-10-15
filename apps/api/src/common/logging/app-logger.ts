import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { requestContext } from './request-context';

/**
 * Ο logger του API. Στην παραγωγή γράφει JSON μία γραμμή ανά μήνυμα, και μέσα σε
 * αίτημα προσθέτει το `requestId` του — ώστε μια γραμμή σφάλματος να δένεται με
 * τη γραμμή του αιτήματος και με το συμβάν στο error tracking.
 */
export class AppLogger extends ConsoleLogger {
  protected override getJsonLogObject(
    message: unknown,
    options: { context: string; logLevel: LogLevel; writeStreamType?: 'stdout' | 'stderr'; errorStack?: unknown },
  ) {
    const object = super.getJsonLogObject(message, options);
    const requestId = requestContext.getStore()?.requestId;
    return requestId ? { ...object, requestId } : object;
  }
}
