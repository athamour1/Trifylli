<template>
  <!-- Γενέθλια κοντά σε μια συγκέντρωση ή κατά τη δράση. Χωρίς κανένα, τίποτα. -->
  <div v-if="birthdays.length" class="tf-birthdays q-mb-md" role="note">
    <q-icon name="cake" size="22px" class="tf-birthdays__icon" />
    <div>
      <div class="text-weight-medium">{{ title }}</div>
      <div class="tf-birthdays__list">
        <span v-for="b in birthdays" :key="`${b.userId}:${b.day}`" class="tf-birthdays__item">
          {{ b.firstName }} {{ b.lastName }}
          <span class="text-soft">· κλείνει {{ b.age }} · {{ formatDay(b.day) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BirthdayView } from '@trifylli/shared';

defineProps<{ birthdays: BirthdayView[]; title: string }>();

/** «Τρ 22/10» — η μέρα είναι `YYYY-MM-DD`, χωρίς ώρα· τη διαβάζουμε σε UTC. */
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('el-GR', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  });
}
</script>

<style scoped lang="scss">
.tf-birthdays {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--tint-soft);
}

.tf-birthdays__icon {
  color: var(--klados-ink);
  margin-top: 1px;
}

.tf-birthdays__list {
  display: flex;
  flex-wrap: wrap;
  column-gap: 16px;
  row-gap: 2px;
}

.text-soft {
  color: var(--text-soft);
}
</style>
