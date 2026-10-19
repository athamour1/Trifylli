import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { requestContext } from './request-context';

/** Δεύτερος προορισμός για κάθε γραμμή log (π.χ. τα logs του GlitchTip) — βλ. `setLogSink`. */
export type LogSink = (entry: { level: LogLevel; message: unknown; context?: string; requestId?: string }) => void;

let sink: LogSink | null = null;

/** Ορίζει (ή, με `null`, βγάζει) τον δεύτερο προορισμό των logs. */
export function setLogSink(next: LogSink | null): void {
  sink = next;
}

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

  protected override printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    super.printMessages(messages, context, logLevel, writeStreamType, errorStack);
    if (!sink) return;
    const requestId = requestContext.getStore()?.requestId;
    for (const message of messages) sink({ level: logLevel ?? 'log', message, context, requestId });
  }
}
