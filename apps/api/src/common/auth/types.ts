import type { AuthenticatedUser } from '@trifylli/shared';

/** Ό,τι κρεμάει το JWT strategy στο `request.user`. */
export type RequestUser = AuthenticatedUser;

declare module 'express' {
  interface Request {
    user?: RequestUser;
  }
}
