import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { SetEseoCodeDto } from './dto/eseo-code.dto';
import { IntegrationsController } from './integrations.controller';

const admin = { id: 'u-admin', topikoId: 't-1' } as RequestUser;

function setup(conflict = false) {
  const topiko = { id: 't-1', eseoCode: null as string | null };
  const audited: unknown[] = [];
  const prisma = {
    topiko: {
      update: async ({ data }: { data: { eseoCode: string | null } }) => {
        if (conflict) throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
        topiko.eseoCode = data.eseoCode;
        return topiko;
      },
    },
  };
  const audit = { record: async (...args: unknown[]) => void audited.push(args) };
  const controller = new IntegrationsController(prisma as never, {} as never, {} as never, {} as never, {} as never, audit as never);
  return { controller, topiko, audited };
}

describe('κωδικός e-SEO του Τοπικού από τη σελίδα', () => {
  it('γράφεται χωρίς κενά, και κενό = χωρίς κωδικό', async () => {
    const { controller, topiko, audited } = setup();
    await expect(controller.setTopikoCode(admin, { code: ' 35 ' })).resolves.toEqual({ topikoCode: '35' });
    expect(topiko.eseoCode).toBe('35');
    await controller.setTopikoCode(admin, { code: '' });
    expect(topiko.eseoCode).toBeNull();
    expect(audited).toHaveLength(2);
  });

  it('κωδικός άλλου Τοπικού: 409', async () => {
    const { controller } = setup(true);
    await expect(controller.setTopikoCode(admin, { code: '35' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('μόνο ψηφία, λατινικά γράμματα και παύλες', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform({ code: '35' }, { type: 'body', metatype: SetEseoCodeDto })).resolves.toMatchObject({ code: '35' });
    await expect(pipe.transform({ code: 'τριάντα' }, { type: 'body', metatype: SetEseoCodeDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});
