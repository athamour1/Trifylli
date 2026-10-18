import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { drasiAccess, type DrasiRoleKind } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { DraseisPlanService } from './draseis-plan.service';
import { UpdateScheduleItemDto } from './dto/drasi-plan.dto';

const DRASI = 'd-1';

function as(userId: string, roles: DrasiRoleKind[]): RequestUser {
  return {
    id: userId,
    topikoId: 't-1',
    drasiGrant: { drasiId: DRASI, access: drasiAccess({ full: false, staff: true, roles }) },
  } as unknown as RequestUser;
}

function setup() {
  const item = { id: 'i-1', drasiId: DRASI, title: 'Κυνήγι θησαυρού', status: 'TODO', assignees: [{ userId: 'u-maria' }] };
  const prisma = {
    drasiScheduleItem: { findFirst: async () => item },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        drasiScheduleAssignee: { deleteMany: async () => undefined, createMany: async () => undefined },
        drasiScheduleItem: { update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(item, data) },
      }),
  };
  const access = { load: async () => ({ id: DRASI, title: 'Κατασκήνωση' }) };
  const collab = { revoke: () => undefined };
  const service = new DraseisPlanService(prisma as never, access as never, collab as never, {} as never);
  // Οι ώρες της ημέρας δεν αφορούν εδώ.
  Object.assign(service, { itemWithTimes: async () => ({ id: item.id, status: item.status }) });
  return { service, item };
}

describe('προγραμματικά: η κατάσταση (To Do / In Progress / Done)', () => {
  it('ο ρόλος Πρόγραμμα και ο Αρχηγός μετακινούν την κάρτα', async () => {
    for (const role of ['PROGRAMMA', 'ARXIGOS'] as const) {
      const { service, item } = setup();
      await service.updateScheduleItem(as('u-x', [role]), DRASI, 'i-1', { status: 'IN_PROGRESS' } as UpdateScheduleItemDto);
      expect(item.status).toBe('IN_PROGRESS');
    }
  });

  it('ο υπεύθυνος του στοιχείου γράφει το προγραμματικό του, αλλά δεν αλλάζει την κατάσταση', async () => {
    const { service, item } = setup();
    await expect(
      service.updateScheduleItem(as('u-maria', []), DRASI, 'i-1', { status: 'DONE' } as UpdateScheduleItemDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(item.status).toBe('TODO');
  });

  it('μόνο οι τρεις καταστάσεις', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform({ status: 'DONE' }, { type: 'body', metatype: UpdateScheduleItemDto })).resolves.toMatchObject({ status: 'DONE' });
    await expect(pipe.transform({ status: 'MAYBE' }, { type: 'body', metatype: UpdateScheduleItemDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});
