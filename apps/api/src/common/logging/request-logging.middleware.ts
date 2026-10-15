import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { loggablePath, requestContext, resolveRequestId } from './request-context';

/**
 * Κάθε αίτημα παίρνει request id (του proxy, αν είναι λογικό, αλλιώς δικό μας):
 * επιστρέφεται στο `X-Request-Id` της απάντησης και ζει στο context για όλα τα
 * logs του αιτήματος. Στο τέλος μία γραμμή: μέθοδος, διαδρομή, status, χρόνος,
 * λογαριασμός. Όχι email, όχι IP, όχι query string — όσο λιγότερα προσωπικά
 * δεδομένα στα logs, τόσο λιγότερα για να κρυφτούν.
 */
export function requestLogging(apiPrefix: string, logger = new Logger('HTTP')) {
  // Ο healthcheck του Docker χτυπά κάθε 30″ — χωρίς γραμμή.
  const quiet = new Set([`/${apiPrefix}/health`, `/${apiPrefix}/health/ready`]);

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();

    res.on('finish', () => {
      const path = loggablePath(req.originalUrl);
      if (quiet.has(path)) return;
      const entry = {
        method: req.method,
        path,
        status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
        ...(req.user?.id ? { userId: req.user.id } : {}),
      };
      requestContext.run({ requestId }, () => (res.statusCode >= 500 ? logger.warn(entry) : logger.log(entry)));
    });

    requestContext.run({ requestId }, next);
  };
}
