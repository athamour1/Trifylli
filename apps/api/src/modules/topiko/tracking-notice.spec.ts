import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { TRACKING_NOTICE_VERSION } from '@trifylli/shared';
import { TopikoService } from './topiko.service';
import type { RequestUser } from '../../common/auth/types';

describe('ενημέρωση για καταγραφή συνεδριών', () => {
  const user = { id: 'u1', topikoId: 't1' } as RequestUser;

  it('η αποδοχή γράφει έκδοση και ώρα', async () => {
    const update = vi.fn().mockResolvedValue({});
    const service = new TopikoService({ user: { update } } as never);
    await expect(service.acceptTrackingNotice(user, TRACKING_NOTICE_VERSION)).resolves.toEqual({
      version: TRACKING_NOTICE_VERSION,
      accepted: true,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { trackingNoticeVersion: TRACKING_NOTICE_VERSION, trackingNoticeAcceptedAt: expect.any(Date) },
    });
  });

  it('παλιά έκδοση κειμένου (π.χ. ανοιχτή καρτέλα από πριν) απορρίπτεται', async () => {
    const update = vi.fn();
    const service = new TopikoService({ user: { update } } as never);
    await expect(service.acceptTrackingNotice(user, TRACKING_NOTICE_VERSION + 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });
});
