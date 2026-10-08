import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { drasiCan, type DrasiPerm } from '@trifylli/shared';
import type { Request } from 'express';
import { DRASI_PERM_KEY } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';

/**
 * Ελέγχει endpoints με `@RequireDrasi(...)`: φορτώνει τη δράση του `:id`, βρίσκει
 * τι επιτρέπει ο ρόλος του χρήστη σε αυτήν και κρίνει. Το αποτέλεσμα μένει στο
 * `user.drasiGrant`, ώστε τα services να μην ξαναρωτούν.
 */
@Injectable()
export class DrasiPermGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: DrasiAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<{ perm: DrasiPerm; mode: 'view' | 'edit' } | undefined>(DRASI_PERM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser | undefined;
    if (!user) throw new ForbiddenException('Λείπει το προφίλ χρήστη.');
    const id = String((request.params as Record<string, string>).id ?? '');

    const access = await this.access.accessFor(user, id);
    if (!drasiCan(access, meta.perm, meta.mode)) {
      throw new ForbiddenException(
        meta.mode === 'edit' ? 'Ο ρόλος σας στη δράση δεν επιτρέπει αυτή την αλλαγή.' : 'Δεν έχετε πρόσβαση σε αυτό το κομμάτι της δράσης.',
      );
    }
    user.drasiGrant = { drasiId: id, access };
    return true;
  }
}
