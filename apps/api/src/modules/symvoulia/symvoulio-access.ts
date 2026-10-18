import { Injectable } from '@nestjs/common';
import { TOPIKO_SYMVOULIA, can, drasiCan, type KladosType } from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { accessProfileOf, hasCapabilityFor } from '../../common/util/klados-scope';
import { DrasiAccessService } from '../draseis/drasi-access.service';

/** Όσα χρειάζεται ο έλεγχος από ένα συμβούλιο. */
export interface SymvoulioScope {
  type: string;
  drasiId: string | null;
  klados: { type: string } | null;
}

/** Βλέπει / θα μπορούσε να αλλάξει — η οριστικοποίηση κρίνεται χωριστά. */
export interface SymvoulioGrant {
  view: boolean;
  write: boolean;
}

/**
 * Ποιος βλέπει και ποιος γράφει ένα συμβούλιο — ο ένας κανόνας για HTTP,
 * πρακτικά (συνεργασία) και ψηφοφορίες.
 *
 * Συμβούλιο **δράσης**: ό,τι λένε οι ρόλοι της δράσης (`symvoulia`). Ο κλάδος
 * δεν μετράει, ούτε προς τα πάνω (γραμματέας του κλάδου με απλή προβολή στη
 * δράση) ούτε προς τα κάτω (εξωτερικό στέλεχος με ρόλο στη δράση).
 *
 * Συμβούλιο **κλάδου ή Τοπικού**: βλέπει όποιος έχει `calendar:read` στον
 * κλάδο του, γράφει όποιος έχει `symvoulio:klados:write` — και για του Τοπικού
 * επιπλέον `symvoulio:topiko:write`. Η πρόσβαση σε μια δράση δεν ανοίγει κανένα.
 */
@Injectable()
export class SymvoulioAccess {
  constructor(private readonly drasi: DrasiAccessService) {}

  async grant(user: RequestUser, symvoulio: SymvoulioScope): Promise<SymvoulioGrant> {
    if (symvoulio.drasiId) {
      const access = await this.drasi.accessFor(user, symvoulio.drasiId).catch(() => null);
      return { view: drasiCan(access, 'symvoulia'), write: drasiCan(access, 'symvoulia', 'edit') };
    }
    const klados = symvoulio.klados?.type as KladosType | undefined;
    const view = hasCapabilityFor(user, 'calendar:read', klados);
    const topiko = (TOPIKO_SYMVOULIA as readonly string[]).includes(symvoulio.type);
    const write =
      view &&
      hasCapabilityFor(user, 'symvoulio:klados:write', klados) &&
      (!topiko || can(accessProfileOf(user), 'symvoulio:topiko:write'));
    return { view, write };
  }
}
