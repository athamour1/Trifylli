import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController.ready', () => {
  it('η βάση δεν απαντά → 503, ώστε να το βλέπει κάθε έλεγχος από έξω', async () => {
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error('down')) };
    await expect(new HealthController(prisma as never).ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('η βάση απαντά → ok', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
    await expect(new HealthController(prisma as never).ready()).resolves.toEqual({ status: 'ok', database: 'up' });
  });
});
