import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Capability } from '@trifylli/shared';
import type { RequestUser } from './types';

export const PUBLIC_KEY = 'trifylli:public';
export const CAPABILITY_KEY = 'trifylli:capability';
export const SUPER_ADMIN_KEY = 'trifylli:superAdmin';

/** Εξαιρεί ένα endpoint από την αυθεντικοποίηση (health, webhooks). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Απαιτεί μια ικανότητα. Αν το route έχει παράμετρο ή query `klados`, ο
 * `CapabilityGuard` ελέγχει **και** την εμβέλεια στον κλάδο.
 */
export const RequireCapability = (capability: Capability) => SetMetadata(CAPABILITY_KEY, capability);

/** Μόνο ο υπερδιαχειριστής — για ενέργειες επιπέδου Τοπικού. */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
  if (!request.user) throw new Error('CurrentUser χρησιμοποιήθηκε σε route χωρίς αυθεντικοποίηση.');
  return request.user;
});
