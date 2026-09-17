import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type { AppConfig } from '../config/configuration';
import { UserDirectoryService } from './user-directory.service';
import type { RequestUser } from './types';

/**
 * Τοπική ανάπτυξη χωρίς Authentik: κανένα token.
 *
 * Η συνεδρία δένει με **υπαρκτό λογαριασμό της βάσης** μέσω email — από το
 * `DEV_AUTH_EMAIL` ή, ανά αίτημα, από το header `x-dev-email`. Έτσι δοκιμάζεις
 * τον υπερδιαχειριστή και τον κάθε διαχειριστή κλάδου χωρίς να σηκώσεις
 * Authentik, και **χωρίς** να υπάρχει τρόπος να φτιαχτεί ρόλος από το αίτημα:
 * αν ο λογαριασμός δεν υπάρχει, η σύνδεση απορρίπτεται όπως και σε production.
 *
 * Ο πάροχος δηλώνεται μόνο εκτός production (βλ. `auth.module.ts`) και το
 * `loadConfig()` αρνείται να ξεκινήσει με bypass σε production.
 */
@Injectable()
export class DevAuthService {
  private readonly logger = new Logger(DevAuthService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly directory: UserDirectoryService,
  ) {
    this.logger.warn('DEV_AUTH_BYPASS ενεργό — η επικύρωση JWT είναι απενεργοποιημένη.');
  }

  async resolve(req: Request): Promise<RequestUser> {
    const email = (req.header('x-dev-email') ?? this.config.DEV_AUTH_EMAIL).trim();
    return this.directory.resolveFromToken({ email });
  }
}
