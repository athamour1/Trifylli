<template>
  <span hidden />
</template>

<script setup lang="ts">
import { collabDocument } from '@trifylli/shared';
import { useCollabDoc, useCollabMe } from '../composables/useCollabDoc';
import { emitTopiko } from '../lib/topiko-live';

/**
 * Το δωμάτιο του Τοπικού, ανοιχτό όσο ζει η εφαρμογή — πάνω στη σύνδεση που
 * υπάρχει ήδη. Ό,τι φτάνει πάει στις σελίδες (`useTopikoReload`).
 */
const props = defineProps<{ topikoId: string }>();

const room = useCollabDoc(collabDocument.topiko(props.topikoId), useCollabMe(), { persist: false });
room.onChange(emitTopiko);
</script>
