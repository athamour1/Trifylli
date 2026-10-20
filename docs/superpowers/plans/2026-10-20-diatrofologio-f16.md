# Διατροφολόγιο F16 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Στο διατροφολόγιο: λίστα αλλεργιών/διατροφής από τις δηλώσεις υγείας (μόνο για όσους πρέπει), παράλληλα πλήρη γεύματα ανά γεύμα με μερίδες και αγορές, και ετικέτες Πρωινό/Μεσημεριανό/Βραδινό.

**Architecture:** NestJS API + Prisma (Postgres) + Quasar PWA, monorepo με `packages/shared` για contracts. Τα γεύματα είναι κοινά έγγραφα Yjs (Hocuspocus) που προβάλλονται στη βάση· κάθε παράλληλο γεύμα γίνεται **δικό του κοινό έγγραφο** (`drasi:<id>:mealvariant:<variantId>`) με την ίδια δομή (`MEAL_DOC`, `readMeal`, `normalizeMeal`) — το κύριο γεύμα δεν αλλάζει. Αλλεργίες: νέο endpoint με έλεγχο στο service και καταγραφή στο audit.

**Tech Stack:** NestJS, Prisma 6, PostgreSQL 16, Yjs/Hocuspocus, Vue 3 + Quasar, vitest.

**Spec:** `docs/draseis.md` — ενότητα «F16 — Διατροφολόγιο: αλλεργίες, παράλληλα γεύματα, ετικέτες γευμάτων».

## Global Constraints

- Κείμενα UI και σχόλια στα ελληνικά, όπως ο υπόλοιπος κώδικας· λιτά.
- **Ποτέ** `prettier` ή `prisma format` (ξαναστοιχίζουν ξένο κώδικα). Schema: `npx prisma validate && npx prisma generate`.
- Migrations γράφονται με το χέρι: `apps/api/prisma/migrations/<timestamp>_<όνομα>/migration.sql`. Στο dev: `cd apps/api && npx prisma migrate deploy`.
- Μετά από αλλαγή στο `packages/shared`: `pnpm --filter @trifylli/shared build` πριν από typecheck/tests του API.
- Commits: conventional, αγγλικό subject, author μόνο ο χρήστης, **χωρίς** `Co-Authored-By`. Commit μόλις περάσει κάθε task. Όχι push.
- Έλεγχοι: `pnpm typecheck`, `pnpm test`· για UI και rebuild του dev: `docker compose --profile full up -d --build api web`.
- Αλλεργίες βλέπει όποιος έχει `diatrofologio` **edit** ή `drasiCanReadHealth(access)`· κάθε ανάγνωση → `audit.record(user, 'drasi.food.read', 'drasi', id, { count })`.
- Τα ονόματα του «για ποιους» ενός παράλληλου: μόνο στους ίδιους· οι υπόλοιποι βλέπουν μόνο πλήθος.

## Review Focus

1. **Δήλωση με «Ναι» αλλά κενό «Αναγράψτε»** → εμφανίζεται «ναι (χωρίς λεπτομέρειες)», όχι κενό κελί που κρύβει ότι υπάρχει αλλεργία. *(Task 2 test)*
2. **Συμμετέχων σε δύο παράλληλα του ίδιου γεύματος** → μετράει μία φορά εκτός κύριου· η μερίδα του κύριου δεν πάει αρνητική. *(Task 4 test)*
3. **Συμμετέχων που βγαίνει από τη δράση** ενώ είναι σε «για ποιους» → δεν μετράει στις μερίδες και δεν σπάει η σελίδα. *(Task 4 test)*
4. **Σβήσιμο παράλληλου** → φεύγουν και τα υλικά του από την Τροφοδοσία· το κοινό έγγραφο κλείνει. *(Task 4/5 tests)*
5. **Στέλεχος χωρίς δικαίωμα** που ανοίγει τη σελίδα γεύματος → βλέπει τα παράλληλα και τις μερίδες, **όχι** ονόματα. *(Task 4 test)*

---

### Task 1: Ετικέτες Πρωινό / Μεσημεριανό / Βραδινό

**Files:**
- Create: `apps/api/prisma/migrations/20261020150000_meal_tags/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (enum `DrasiSnack`)
- Modify: `packages/shared/src/domain.ts` (`DrasiSnack`), `packages/shared/src/labels.ts` (`DRASI_SNACK_LABEL`)
- Modify: `apps/web/src/components/drasi/DrasiProgramma.vue` (κεφαλίδα μενού ετικέτας)
- Modify: `apps/web/src/components/drasi/DrasiDiatrofologio.vue` (εικονίδιο, κείμενο)
- Test: `apps/api/src/modules/draseis/diatrofologio.spec.ts`

**Interfaces:**
- Produces: `DrasiSnack` = `PROINO | DEKATIANO | MESIMERIANO | APOGEVMATINO | VRADINO` (με αυτή τη σειρά)· `isMeal` αμετάβλητο.

- [ ] **Step 1: Failing test** — στο `diatrofologio.spec.ts` πρόσθεσε:

```ts
it('και ό,τι έχει ετικέτα πρωινό, μεσημεριανό ή βραδινό', () => {
  expect(isMeal({ kind: 'DRASTIRIOTITA', snack: 'PROINO' })).toBe(true);
  expect(isMeal({ kind: 'GEVMA', snack: 'VRADINO' })).toBe(true);
});
```

- [ ] **Step 2:** `cd apps/api && npx vitest run src/modules/draseis/diatrofologio.spec.ts` → FAIL στο typecheck/τιμή (`'PROINO'` δεν υπάρχει στον τύπο· στο vitest περνά runtime, άρα το πραγματικό σήμα είναι το `pnpm --filter @trifylli/api typecheck` → error).

- [ ] **Step 3: Υλοποίηση**

`schema.prisma`:
```prisma
enum DrasiSnack {
  PROINO
  DEKATIANO
  MESIMERIANO
  APOGEVMATINO
  VRADINO
}
```
και το σχόλιο πάνω του: «Ετικέτα γεύματος της ημέρας σε στοιχείο του ωρολογίου — μπαίνει στο διατροφολόγιο, μαζί με τα «Γεύματα».»

`migration.sql`:
```sql
-- Ετικέτες γευμάτων: πρωινό, μεσημεριανό, βραδινό δίπλα στο δεκατιανό και το απογευματινό.
ALTER TYPE "DrasiSnack" ADD VALUE 'PROINO' BEFORE 'DEKATIANO';
ALTER TYPE "DrasiSnack" ADD VALUE 'MESIMERIANO' BEFORE 'APOGEVMATINO';
ALTER TYPE "DrasiSnack" ADD VALUE 'VRADINO';
```

`domain.ts`:
```ts
export const DrasiSnack = {
  PROINO: 'PROINO',
  DEKATIANO: 'DEKATIANO',
  MESIMERIANO: 'MESIMERIANO',
  APOGEVMATINO: 'APOGEVMATINO',
  VRADINO: 'VRADINO',
} as const;
```

`labels.ts`:
```ts
export const DRASI_SNACK_LABEL: Record<DrasiSnack, string> = {
  PROINO: 'Πρωινό',
  DEKATIANO: 'Δεκατιανό',
  MESIMERIANO: 'Μεσημεριανό',
  APOGEVMATINO: 'Απογευματινό',
  VRADINO: 'Βραδινό',
};
```

`DrasiProgramma.vue`: στο μενού της ετικέτας `Κολατσιό` → `Γεύμα της ημέρας`, `Χωρίς κολατσιό` → `Χωρίς ετικέτα`, tooltip/aria `Κολατσιό` → `Ετικέτα γεύματος`. Το `snackOptions` (`Object.keys(DrasiSnack)`) παίρνει μόνο του τις νέες τιμές.

`DrasiDiatrofologio.vue`: εικονίδιο `m.snack === 'DEKATIANO' || m.snack === 'APOGEVMATINO' ? 'bakery_dining' : 'restaurant'`· η λεζάντα: «…κάθε στοιχείο «Γεύμα», και όσα έχουν ετικέτα γεύματος (πρωινό, δεκατιανό, μεσημεριανό, απογευματινό, βραδινό).»

- [ ] **Step 4:** `cd apps/api && npx prisma validate && npx prisma generate && npx prisma migrate deploy`· `pnpm --filter @trifylli/shared build && pnpm typecheck && pnpm test` → όλα PASS.
- [ ] **Step 5: Commit** — `git add` τα παραπάνω· `git commit -m "feat(draseis): breakfast, lunch and dinner meal tags"`.

---

### Task 2: API — αλλεργίες & διατροφή για το διατροφολόγιο

**Files:**
- Modify: `packages/shared/src/contracts.ts` (νέο `DrasiFoodNeedsView`)
- Create: `apps/api/src/modules/draseis/food-needs.ts` (καθαρή συνάρτηση)
- Modify: `apps/api/src/modules/draseis/draseis-diatrofologio.service.ts`, `draseis-diatrofologio.controller.ts`
- Test: `apps/api/src/modules/draseis/food-needs.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface DrasiFoodNeedsPerson {
  participantId: string;
  firstName: string;
  lastName: string;
  kladosType: KladosType | null;
  /** Ενωμοτία/πεντάδα/… (όχι σκηνή). */
  group: string | null;
  /** Το κείμενο της δήλωσης· «ναι (χωρίς λεπτομέρειες)» αν λείπει· `null` = όχι. */
  allergies: string | null;
  diet: string | null;
}
export interface DrasiFoodNeedsView {
  /** Πόσες δηλώσεις υγείας έχουν υποβληθεί / πόσοι συμμετέχοντες. */
  submitted: number;
  expected: number;
  people: DrasiFoodNeedsPerson[];
}
```
- `foodNeedsOf(d: Record<string, unknown>): { allergies: string | null; diet: string | null }`
- `DraseisDiatrofologioService.foodNeeds(user, id): Promise<DrasiFoodNeedsView>` · `GET /draseis/:id/diatrofologio/allergies`
- `canSeeFoodNeeds(access: DrasiAccess | null): boolean` (export από `food-needs.ts`) = `drasiCan(access, 'diatrofologio', 'edit') || drasiCanReadHealth(access)`

- [ ] **Step 1: Failing test** `food-needs.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { drasiAccess } from '@trifylli/shared';
import { canSeeFoodNeeds, foodNeedsOf } from './food-needs';

describe('αλλεργίες & διατροφή από τη δήλωση υγείας', () => {
  it('«Ναι» με λεπτομέρειες: το κείμενο· «Όχι» ή αναπάντητο: τίποτα', () => {
    expect(foodNeedsOf({ allergies: true, allergiesDetails: ' φιστίκια ', diet: false })).toEqual({ allergies: 'φιστίκια', diet: null });
    expect(foodNeedsOf({})).toEqual({ allergies: null, diet: null });
  });

  it('«Ναι» χωρίς λεπτομέρειες δεν κρύβεται', () => {
    expect(foodNeedsOf({ allergies: true, allergiesDetails: '  ', diet: true })).toEqual({
      allergies: 'ναι (χωρίς λεπτομέρειες)',
      diet: 'ναι (χωρίς λεπτομέρειες)',
    });
  });

  it('τη βλέπουν όσοι γράφουν στο διατροφολόγιο ή βλέπουν το φαρμακείο — όχι κάθε στέλεχος', () => {
    expect(canSeeFoodNeeds(drasiAccess({ full: false, staff: true, roles: [] }))).toBe(false);
    expect(canSeeFoodNeeds(drasiAccess({ full: false, staff: true, roles: ['MAGEIRISSA'] }))).toBe(true);
    expect(canSeeFoodNeeds(drasiAccess({ full: false, staff: true, roles: ['FARMAKEIO'] }))).toBe(true);
    expect(canSeeFoodNeeds(drasiAccess({ full: true, staff: false, roles: [] }))).toBe(true);
    expect(canSeeFoodNeeds(null)).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/modules/draseis/food-needs.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Υλοποίηση** `food-needs.ts`:

```ts
import { drasiCan, drasiCanReadHealth, type DrasiAccess } from '@trifylli/shared';

const NO_DETAILS = 'ναι (χωρίς λεπτομέρειες)';

/** Ό,τι αφορά την κουζίνα από μία δήλωση υγείας: αλλεργίες και ειδική διατροφή. */
export function foodNeedsOf(d: Record<string, unknown>): { allergies: string | null; diet: string | null } {
  const pick = (key: 'allergies' | 'diet'): string | null => {
    if (d[key] !== true) return null;
    const details = typeof d[`${key}Details`] === 'string' ? (d[`${key}Details`] as string).trim() : '';
    return details || NO_DETAILS;
  };
  return { allergies: pick('allergies'), diet: pick('diet') };
}

/**
 * Ποιος βλέπει τις αλλεργίες στο διατροφολόγιο: όποιος γράφει σε αυτό ή βλέπει
 * το φαρμακείο. Το διατροφολόγιο το βλέπει κάθε στέλεχος — οι αλλεργίες όχι.
 */
export function canSeeFoodNeeds(access: DrasiAccess | null | undefined): boolean {
  return drasiCan(access, 'diatrofologio', 'edit') || drasiCanReadHealth(access);
}
```

Στο `draseis-diatrofologio.service.ts` (constructor + `AuditService` από `../../common/audit/audit.service`):

```ts
/** Αλλεργίες & διατροφή από τις υποβληθείσες δηλώσεις υγείας (F16). Καταγράφεται. */
async foodNeeds(user: RequestUser, id: string): Promise<DrasiFoodNeedsView> {
  const access = user.drasiGrant?.drasiId === id ? user.drasiGrant.access : await this.access.accessFor(user, id);
  if (!canSeeFoodNeeds(access)) {
    throw new ForbiddenException('Τις αλλεργίες τις βλέπουν όσοι γράφουν στο διατροφολόγιο και το φαρμακείο της δράσης.');
  }
  const [expected, forms] = await Promise.all([
    this.prisma.drasiParticipant.count({ where: { drasiId: id } }),
    this.prisma.drasiForm.findMany({
      where: { drasiId: id, type: DrasiFormType.YGEIA, status: DrasiFormStatus.SUBMITTED, data: { not: Prisma.DbNull } },
      select: {
        participantId: true,
        data: true,
        participant: {
          select: {
            user: { select: { firstName: true, lastName: true, memberships: { where: { leftAt: null }, select: { klados: { select: { type: true } } } } } },
            groups: { select: { group: { select: { kind: true, name: true } } } },
          },
        },
      },
      orderBy: { participant: { user: { lastName: 'asc' } } },
    }),
  ]);
  await this.audit.record(user, 'drasi.food.read', 'drasi', id, { count: forms.length });
  const people = forms.flatMap((f) => {
    const needs = foodNeedsOf((f.data as Record<string, unknown> | null) ?? {});
    if (!needs.allergies && !needs.diet) return [];
    const u = f.participant.user;
    return [{
      participantId: f.participantId,
      firstName: u.firstName,
      lastName: u.lastName,
      kladosType: (u.memberships[0]?.klados.type as KladosType | undefined) ?? null,
      group: f.participant.groups.find((g) => g.group.kind !== 'SKINI')?.group.name ?? null,
      ...needs,
    }];
  });
  return { submitted: forms.length, expected, people };
}
```

Controller — **πριν** από το `@Get(':itemId')` (αλλιώς το `allergies` πιάνεται ως itemId):

```ts
@Get('allergies')
@RequireDrasi('diatrofologio')
@ApiOperation({ summary: 'Αλλεργίες & διατροφή από τις δηλώσεις υγείας — για την κουζίνα (καταγράφεται)' })
foodNeeds(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
  return this.diatrofologio.foodNeeds(user, id);
}
```

- [ ] **Step 4:** shared build, `npx vitest run src/modules/draseis/food-needs.spec.ts` → PASS· `pnpm --filter @trifylli/api typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(draseis): allergies and diets for the kitchen from health forms`.

---

### Task 3: PWA — κάρτα «Αλλεργίες & διατροφή»

**Files:**
- Create: `apps/web/src/components/drasi/FoodNeedsCard.vue`
- Modify: `apps/web/src/components/drasi/DrasiDiatrofologio.vue` (prop `access`, η κάρτα στην κορυφή)
- Modify: `apps/web/src/pages/DrasiPage.vue` (`<DrasiDiatrofologio :drasi-id="id" :access="data.access" />`)
- Modify: `packages/shared/src/drasi-access.ts` — μεταφορά του `canSeeFoodNeeds` εδώ (export), ώστε να το χρησιμοποιούν API **και** PWA· το `food-needs.ts` του API το κάνει re-export/import.

**Interfaces:**
- Consumes: `GET /draseis/:id/diatrofologio/allergies` → `DrasiFoodNeedsView`; `canSeeFoodNeeds` από shared.

- [ ] **Step 1:** Μετακίνησε το `canSeeFoodNeeds` στο `packages/shared/src/drasi-access.ts` (ίδιος κώδικας, δίπλα στο `drasiCanReadHealth`)· στο API `food-needs.ts`: `export { canSeeFoodNeeds } from '@trifylli/shared';`. Τρέξε `food-needs.spec.ts` → PASS.

- [ ] **Step 2:** `FoodNeedsCard.vue`:

```vue
<template>
  <!-- Αλλεργίες & διατροφή από τις δηλώσεις υγείας (F16): κλειστή εξ ορισμού,
       φορτώνει μόλις ανοίξει — κάθε άνοιγμα καταγράφεται στο API. -->
  <q-card flat bordered class="q-mb-md">
    <q-expansion-item v-model="open" icon="no_food" :label="label" header-class="text-weight-medium">
      <q-card-section class="q-pt-none">
        <q-inner-loading :showing="loading" />
        <div v-if="error" class="text-negative text-body2">{{ error }}</div>
        <template v-else-if="data">
          <div class="text-caption text-grey-7 q-mb-sm">
            Από τις δηλώσεις υγείας: {{ data.submitted }} από {{ data.expected }}.
            <span v-if="data.submitted < data.expected">Η λίστα μπορεί να μην είναι πλήρης.</span>
          </div>
          <div v-if="!data.people.length" class="text-grey-6">Καμία αλλεργία ή ειδική διατροφή στις δηλώσεις.</div>
          <q-list v-else dense separator>
            <q-item v-for="p in data.people" :key="p.participantId">
              <q-item-section>
                <q-item-label>{{ p.lastName }} {{ p.firstName }}</q-item-label>
                <q-item-label caption>{{ [p.kladosType ? KLADOS_LABEL[p.kladosType] : null, p.group].filter(Boolean).join(' · ') }}</q-item-label>
                <q-item-label v-if="p.allergies"><b>Αλλεργίες:</b> {{ p.allergies }}</q-item-label>
                <q-item-label v-if="p.diet"><b>Διατροφή:</b> {{ p.diet }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </template>
      </q-card-section>
    </q-expansion-item>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { KLADOS_LABEL, type DrasiFoodNeedsView } from '@trifylli/shared';
import { ApiError, get } from '../../lib/api';

const props = defineProps<{ drasiId: string }>();
const open = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const data = ref<DrasiFoodNeedsView | null>(null);
const label = computed(() => (data.value ? `Αλλεργίες & διατροφή · ${data.value.people.length} άτομα` : 'Αλλεργίες & διατροφή'));

watch(open, async (isOpen) => {
  if (!isOpen || data.value) return;
  loading.value = true;
  try {
    data.value = await get<DrasiFoodNeedsView>(`/draseis/${props.drasiId}/diatrofologio/allergies`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Δεν φορτώθηκαν.';
  } finally {
    loading.value = false;
  }
});
</script>
```

- [ ] **Step 3:** `DrasiDiatrofologio.vue`: `defineProps<{ drasiId: string; access: DrasiAccess }>()`, στην κορυφή του `<template v-if="view">`: `<FoodNeedsCard v-if="canSeeFoodNeeds(access)" :drasi-id="drasiId" />`. `DrasiPage.vue`: πέρασε `:access="data.access"`.
- [ ] **Step 4:** `pnpm typecheck && pnpm test` → PASS· rebuild web· στον browser (δράση «Εκπαίδευση Ενω/Υπο»): η κάρτα ανοίγει και δείχνει «N από 23».
- [ ] **Step 5: Commit** `feat(web): allergies and diets card in the diatrofologio`.

---

### Task 4: API — παράλληλα γεύματα (βάση, έγγραφο, REST, μερίδες)

**Files:**
- Create: `apps/api/prisma/migrations/20261020160000_meal_variants/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (`DrasiMealVariant`, `DrasiMealVariantIngredient`, σχέση στο `DrasiScheduleItem`)
- Modify: `packages/shared/src/collab.ts` (`collabDocument.drasiMealVariant`)
- Modify: `packages/shared/src/contracts.ts` (`DrasiMealVariantView`, `DrasiMealView.variants`, `DrasiMealView.portions`)
- Create: `apps/api/src/modules/draseis/meal-portions.ts`
- Modify: `apps/api/src/modules/draseis/drasi-collab.ts` (νέο `mealVariantType()`)
- Modify: `apps/api/src/modules/draseis/draseis-diatrofologio.service.ts`, `draseis-diatrofologio.controller.ts`, `dto/drasi-diatrofologio.dto.ts`
- Modify: `apps/api/src/modules/draseis/draseis-plan.service.ts` (σβήσιμο στοιχείου → και τα έγγραφα των παράλληλων)
- Test: `apps/api/src/modules/draseis/meal-portions.spec.ts`, `apps/api/src/modules/draseis/meal-variants.spec.ts`

**Interfaces:**
- Produces:
```ts
// shared
drasiMealVariant: (drasiId: string, variantId: string) => `drasi:${drasiId}:mealvariant:${variantId}`
export interface DrasiMealVariantView {
  id: string;
  label: string;
  order: number;
  /** Για ποιους — `null` όταν ο χρήστης δεν βλέπει αλλεργίες (βλέπει μόνο `count`). */
  participantIds: string[] | null;
  count: number;
  menu: string | null;
  recipe: string | null;
  ingredients: DrasiMealIngredient[];
}
// DrasiMealView += variants: DrasiMealVariantView[]; portions: { main: number; total: number };
// API
mealPortions(participantIds: readonly string[], variants: readonly { participantIds: readonly string[] }[]):
  { main: number; perVariant: number[] }
// REST (diatrofologio edit):
POST   /draseis/:id/diatrofologio/:itemId/variants          { label }                       → DrasiMealVariantView
PATCH  /draseis/:id/diatrofologio/:itemId/variants/:vid     { label?, participantIds?, order? }
DELETE /draseis/:id/diatrofologio/:itemId/variants/:vid
```

- [ ] **Step 1: Failing tests** `meal-portions.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mealPortions } from './meal-portions';

describe('μερίδες κύριου και παράλληλων', () => {
  const all = ['a', 'b', 'c', 'd', 'e'];
  it('κύριο = όλοι μείον όσοι έχουν παράλληλο', () => {
    expect(mealPortions(all, [{ participantIds: ['a', 'b'] }, { participantIds: ['c'] }])).toEqual({ main: 2, perVariant: [2, 1] });
  });
  it('ίδιος σε δύο παράλληλα: μετράει σε καθένα, μία φορά έξω από το κύριο', () => {
    expect(mealPortions(all, [{ participantIds: ['a'] }, { participantIds: ['a', 'b'] }])).toEqual({ main: 3, perVariant: [1, 2] });
  });
  it('όποιος δεν είναι πια στη δράση δεν μετράει', () => {
    expect(mealPortions(['a', 'b'], [{ participantIds: ['a', 'gone'] }])).toEqual({ main: 1, perVariant: [1] });
  });
});
```

`meal-variants.spec.ts` (DraseisDiatrofologioService με in-memory prisma, όπως το `guest-contact.spec.ts`): (α) `meal()` για χρήστη χωρίς `canSeeFoodNeeds` → `variants[0].participantIds === null`, `count === 2`· για μαγείρισσα → τα ids· (β) `removeVariant` καλεί `collab.remove(collabDocument.drasiMealVariant(id, vid))` και σβήνει τη γραμμή.

- [ ] **Step 2:** τρέξε τα δύο specs → FAIL.

- [ ] **Step 3: Βάση**

```prisma
/// Παράλληλο γεύμα (F16): πλήρες γεύμα για ιδιαιτερότητες — μενού, συνταγή,
/// ποσολόγιο στο δικό του κοινό έγγραφο (`drasi:<id>:mealvariant:<id>`).
model DrasiMealVariant {
  id             String   @id @default(uuid()) @db.Uuid
  itemId         String   @db.Uuid
  order          Int      @default(0)
  label          String
  /// Για ποιους: ids συμμετεχόντων (DrasiParticipant) — όσοι φύγουν αγνοούνται.
  participantIds String[] @db.Uuid
  menu           String?
  recipe         String?
  updatedAt      DateTime @updatedAt

  item        DrasiScheduleItem             @relation(fields: [itemId], references: [id], onDelete: Cascade)
  ingredients DrasiMealVariantIngredient[]

  @@index([itemId, order])
  @@map("drasi_meal_variant")
}

/// Υλικό παράλληλου γεύματος — ίδια πεδία με το `DrasiMealIngredient`, δικός του
/// πίνακας: η προβολή του κύριου γεύματος ξαναγράφει όλα τα δικά της υλικά.
model DrasiMealVariantIngredient {
  id         String    @id @default(uuid()) @db.Uuid
  variantId  String    @db.Uuid
  order      Int
  label      String
  qty        String    @default("")
  bought     Boolean   @default(false)
  boughtById String?   @db.Uuid
  boughtAt   DateTime?

  variant DrasiMealVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@index([variantId, order])
  @@map("drasi_meal_variant_ingredient")
}
```
Στο `DrasiScheduleItem`: `mealVariants DrasiMealVariant[]`.

`migration.sql`:
```sql
-- Παράλληλα γεύματα (F16).
CREATE TABLE "drasi_meal_variant" (
  "id" UUID NOT NULL, "itemId" UUID NOT NULL, "order" INTEGER NOT NULL DEFAULT 0, "label" TEXT NOT NULL,
  "participantIds" UUID[], "menu" TEXT, "recipe" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "drasi_meal_variant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drasi_meal_variant_itemId_order_idx" ON "drasi_meal_variant"("itemId", "order");
ALTER TABLE "drasi_meal_variant" ADD CONSTRAINT "drasi_meal_variant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "drasi_schedule_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "drasi_meal_variant_ingredient" (
  "id" UUID NOT NULL, "variantId" UUID NOT NULL, "order" INTEGER NOT NULL, "label" TEXT NOT NULL,
  "qty" TEXT NOT NULL DEFAULT '', "bought" BOOLEAN NOT NULL DEFAULT false, "boughtById" UUID, "boughtAt" TIMESTAMP(3),
  CONSTRAINT "drasi_meal_variant_ingredient_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drasi_meal_variant_ingredient_variantId_order_idx" ON "drasi_meal_variant_ingredient"("variantId", "order");
ALTER TABLE "drasi_meal_variant_ingredient" ADD CONSTRAINT "drasi_meal_variant_ingredient_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "drasi_meal_variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```
(Επιβεβαίωσε το όνομα πίνακα του `DrasiScheduleItem` με `grep -n '@@map("drasi_schedule' apps/api/prisma/schema.prisma`.)

- [ ] **Step 4: `meal-portions.ts`**

```ts
/** Μερίδες: κάθε παράλληλο όσοι είναι ακόμα στη δράση· το κύριο οι υπόλοιποι. */
export function mealPortions(
  participantIds: readonly string[],
  variants: readonly { participantIds: readonly string[] }[],
): { main: number; perVariant: number[] } {
  const present = new Set(participantIds);
  const elsewhere = new Set<string>();
  const perVariant = variants.map((v) => {
    const ids = [...new Set(v.participantIds)].filter((pid) => present.has(pid));
    ids.forEach((pid) => elsewhere.add(pid));
    return ids.length;
  });
  return { main: present.size - elsewhere.size, perVariant };
}
```

- [ ] **Step 5: Κοινό έγγραφο** — στο `drasi-collab.ts`, νέο `mealVariantType()` (και `this.mealVariantType()` στη λίστα του `types()`), αντίγραφο του `mealType()` με:
  - `kind: 'drasi:mealvariant'`, `arity: 2` (ids `[drasiId, variantId]`)
  - `load`: `prisma.drasiMealVariant.findFirst({ where: { id: variantId, item: { drasiId } }, select: { recipe, menu, ingredients: { orderBy: { order: 'asc' }, select: {...} } } })`
  - `access`: η γραμμή να υπάρχει → `this.scope(user, drasiId, { view: 'diatrofologio', edit: 'diatrofologio' })`
  - `project`: `normalizeMeal(readMeal(doc))` → `tx.drasiMealVariant.update({ where: { id: variantId }, data: { recipe, menu } })` (αν `count` = 0, return), `tx.drasiMealVariantIngredient.deleteMany({ where: { variantId } })`, `createMany({ data: ingredients.map((y) => ({ ...y, variantId })) })`
  - `snapshot`/`present`/`restore`/`approval(MEAL_DOC.recipe)` ίδια με το γεύμα· `about` με `link: \`diatrofologio/${itemId}/${variantId}\``.

- [ ] **Step 6: Service + REST** — στο `draseis-diatrofologio.service.ts`:
  - `meal()` προσθέτει `variants` (ταξινομημένα `order, label`) και `portions: { main, total }` με `mealPortions(participantIdsOfDrasi, variants)`· τα `participantIds` μόνο όταν `canSeeFoodNeeds(access)`, αλλιώς `null`.
  - `addVariant(user, id, itemId, label)`: `mealItem()` (ελέγχει ότι είναι γεύμα), `access.load(user, id, 'write')`, `create({ itemId, label: label.trim(), order: max+1, participantIds: [] })`.
  - `updateVariant(user, id, itemId, vid, dto)`: τα `participantIds` φιλτράρονται σε συμμετέχοντες της δράσης (`drasiParticipant.findMany({ where: { drasiId: id, id: { in } } })`).
  - `removeVariant(user, id, itemId, vid)`: `deleteMany({ where: { id: vid, itemId } })` (0 → 404), μετά `await this.collab.remove(collabDocument.drasiMealVariant(id, vid))` (inject `CollabService`).
  - DTOs: `CreateMealVariantDto { @IsString() @Matches(/\S/) @MaxLength(80) label }`, `UpdateMealVariantDto { label?; @IsArray() @ArrayMaxSize(300) @IsUUID(undefined,{each:true}) participantIds?; @IsInt() @Min(0) order? }`.
  - Controller: τα τρία endpoints με `@RequireDrasi('diatrofologio', 'edit')`.
  - `draseis-plan.service.ts` (σβήσιμο στοιχείου, γραμμή ~265): πριν σβηστεί, `const variants = await this.prisma.drasiMealVariant.findMany({ where: { itemId }, select: { id: true } })` και στο `Promise.all` πρόσθεσε `...variants.map((v) => this.collab.remove(collabDocument.drasiMealVariant(id, v.id)))`.

- [ ] **Step 7:** `npx prisma validate && npx prisma generate && npx prisma migrate deploy`· shared build· `npx vitest run src/modules/draseis/meal-portions.spec.ts src/modules/draseis/meal-variants.spec.ts` → PASS· `pnpm typecheck && pnpm test` → PASS.
- [ ] **Step 8: Commit** `feat(draseis): parallel meals with their own recipe, quantities and portions`.

---

### Task 5: Τροφοδοσία — τα υλικά των παράλληλων

**Files:**
- Modify: `packages/shared/src/contracts.ts` (`DrasiTrofodosiaDay.meals[]` += `variantId: string | null`, `variantLabel: string | null`)
- Modify: `apps/api/src/modules/draseis/draseis-trofodosia.service.ts`, `draseis-trofodosia.controller.ts`
- Modify: `apps/api/src/modules/draseis/drasi-docs.ts` — τίποτα· το `tickMealIngredient` δουλεύει σε κάθε έγγραφο με `MEAL_DOC`.
- Modify: `apps/web/src/components/drasi/DrasiTrofodosia.vue`
- Test: `apps/api/src/modules/draseis/trofodosia-variants.spec.ts`, `apps/web/test/trofodosia.spec.ts` (αν ελέγχει σχήμα)

**Interfaces:**
- `PUT /draseis/:id/trofodosia/meals/:itemId/variants/:variantId/ingredients/:ingredientId/bought` `{ bought }` → ίδιο σχήμα με το υπάρχον.

- [ ] **Step 1: Failing test** — `view()` με ένα γεύμα που έχει παράλληλο «Χωρίς γλουτένη» με υλικό «ζυμαρικά χ.γ.»: η ημέρα έχει δύο γραμμές γεύματος, η δεύτερη με `variantId` και `variantLabel: 'Χωρίς γλουτένη'` και το υλικό· παράλληλο χωρίς υλικά δεν εμφανίζεται.
- [ ] **Step 2:** τρέξε → FAIL.
- [ ] **Step 3:** στο `view()`: φόρτωσε `drasiMealVariant.findMany({ where: { itemId: { in: mealIds } }, include: { ingredients: { orderBy: { order: 'asc' } } }, orderBy: [{ order: 'asc' }, { label: 'asc' }] })`· μετά από κάθε γεύμα, μία γραμμή ανά παράλληλο με υλικά (`title` = του γεύματος, `variantId`, `variantLabel`). Οι αγοραστές (`buyerIds`) μαζεύονται και από τα υλικά των παράλληλων. Το κύριο: `variantId: null, variantLabel: null`. Νέα μέθοδος `setVariantIngredientBought(user, id, itemId, variantId, ingredientId, bought)` = το υπάρχον `setIngredientBought` με `collabDocument.drasiMealVariant(id, variantId)` και έλεγχο `drasiMealVariant.count({ where: { id: variantId, itemId, item: { drasiId: id } } })`.
- [ ] **Step 4:** `DrasiTrofodosia.vue`: δίπλα στον τίτλο `<q-badge v-if="m.variantLabel" outline :label="m.variantLabel" />`· το τικ καλεί το variant endpoint όταν `m.variantId`. `:key` γραμμής γεύματος = `` `${m.itemId}:${m.variantId ?? ''}` ``.
- [ ] **Step 5:** tests + typecheck → PASS.
- [ ] **Step 6: Commit** `feat(draseis): parallel meal ingredients in the food supply list`.

---

### Task 6: PWA — καρτέλες παράλληλων στη σελίδα του γεύματος

**Files:**
- Modify: `apps/web/src/router/routes.ts` — `path: 'draseis/:id/diatrofologio/:itemId/:variantId?'`
- Modify: `apps/web/src/pages/DrasiPage.vue` — `childKey` = `` `${itemId}:${variantId ?? ''}` ``
- Modify: `apps/web/src/components/drasi/DrasiGevma.vue`
- Create: `apps/web/src/components/drasi/MealVariantPeople.vue` (επιλογή «για ποιους»)

**Interfaces:**
- Consumes: `DrasiMealView.variants/portions`, τα REST του Task 4, `collabDocument.drasiMealVariant`.

- [ ] **Step 1:** Στο `DrasiGevma.vue`:
  - `const variantId = route.params.variantId ? String(route.params.variantId) : null;`
  - `const docName = variantId ? collabDocument.drasiMealVariant(drasiId, variantId) : collabDocument.drasiMeal(drasiId, itemId);`
  - Το fallback `view` (πριν έρθει το έγγραφο) διαβάζει `menu/ingredients` από το παράλληλο όταν υπάρχει `variantId`· η `MarkdownField` fallback από `variant.recipe`.
  - Πάνω από το `tf-split`: `SegmentedToggle` με επιλογές `[{ label: 'Κύριο · N', value: '' }, ...variants.map((v) => ({ label: `${v.label} · ${v.count}`, value: v.id }))]`, και `v-model` που κάνει `router.replace({ name: 'drasi-gevma', params: { id, itemId, variantId: value || undefined } })`.
  - Αν `editable`: κουμπί «+ Παράλληλο» → `$q.dialog({ prompt })` → `POST …/variants` → `router.replace` στο νέο.
  - Σε παράλληλο και `editable`: μενού ⋮ με «Μετονομασία» (`PATCH { label }`) και «Διαγραφή» (επιβεβαίωση, `DELETE`, επιστροφή στο κύριο).
  - Κάτω από τον τίτλο: `Μερίδες: κύριο ${portions.main} · ${variants.map(v => `${v.label} ${v.count}`).join(' · ')}`.
  - Αν το `variantId` της διαδρομής δεν υπάρχει στα `variants` (σβήστηκε): `router.replace` στο κύριο.
- [ ] **Step 2:** `MealVariantPeople.vue` — μόνο όταν `variant.participantIds !== null`: `q-select multiple use-chips` με επιλογές τους συμμετέχοντες της δράσης (από το `GET /draseis/:id` που ήδη φορτώνει η σελίδα, `participants[].id` + όνομα), με πρώτους όσους είναι στη λίστα αλλεργιών (`GET …/allergies` μόνο αν `canSeeFoodNeeds`), και `PATCH { participantIds }` σε κάθε αλλαγή.
- [ ] **Step 3:** `pnpm typecheck && pnpm test` → PASS· rebuild· browser: πρόσθεσε «Χωρίς γλουτένη» σε ένα γεύμα, γράψε μενού και ένα υλικό, διάλεξε 2 άτομα → «Μερίδες: κύριο 21 · Χωρίς γλουτένη 2»· άνοιξε την Τροφοδοσία → το υλικό με την ετικέτα, τικ λειτουργεί· σβήσε το παράλληλο → φεύγει και από την Τροφοδοσία.
- [ ] **Step 4: Commit** `feat(web): parallel meal tabs on the meal page`.

---

### Task 7: Κλείσιμο

- [ ] Στο `docs/draseis.md` F16: «**Κατάσταση (ημερομηνία):** υλοποιήθηκε» + ό,τι διαφοροποιήθηκε στην πορεία.
- [ ] `pnpm typecheck && pnpm test` τελικό.
- [ ] Commit `docs(draseis): f16 done`.
