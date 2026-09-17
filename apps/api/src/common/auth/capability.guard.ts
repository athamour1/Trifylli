import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountRole, KladosType, can, isSuperAdmin, type Capability } from '@trifylli/shared';
import type { Request } from 'express';
import { CAPABILITY_KEY, SUPER_ADMIN_KEY } from './decorators';
import type { RequestUser } from './types';

/**
 * Επιβάλλει ικανότητες και εμβέλεια κλάδου.
 *
 * Η εμβέλεια εντοπίζεται από την παράμετρο/query `klados` του route. Αυτό
 * καλύπτει τα endpoints που είναι ρητά «ανά κλάδο»· όσα φορτώνουν πόρο με id
 * (π.χ. μια συγκέντρωση) ελέγχουν την εμβέλεια στο service, όπου είναι γνωστός
 * ο κλάδος του πόρου — ένα guard δεν μπορεί να τον ξέρει χωρίς ερώτημα στη βάση.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const capability = this.reflector.getAllAndOverride<Capability>(CAPABILITY_KEY, targets);
    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, targets);
    if (!capability && !superAdminOnly) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser | undefined;
    if (!user) throw new ForbiddenException('Λείπει το προφίλ χρήστη.');

    const profile = { role: user.role, adminKlados: user.adminKlados };

    if (superAdminOnly && !isSuperAdmin(profile)) {
      throw new ForbiddenException('Η ενέργεια επιτρέπεται μόνο στον υπερδιαχειριστή.');
    }

    if (capability) {
      const klados = readKlados(request);
      if (!can(profile, capability, klados)) {
        throw new ForbiddenException(
          klados
            ? `Δεν έχετε δικαίωμα «${capability}» στον κλάδο ${klados}.`
            : `Δεν έχετε δικαίωμα «${capability}».`,
        );
      }
    }

    return true;
  }
}

/** Ψάχνει τον κλάδο σε route params, query και body — με αυτή τη σειρά. */
function readKlados(request: Request): KladosType | undefined {
  const sources: unknown[] = [
    (request.params as Record<string, unknown> | undefined)?.klados,
    (request.query as Record<string, unknown> | undefined)?.klados,
    (request.body as Record<string, unknown> | undefined)?.kladosType,
  ];

  for (const value of sources) {
    if (typeof value === 'string' && value in KladosType) return value as KladosType;
  }
  return undefined;
}

export { AccountRole };
