import { defineStore } from '#q-app/wrappers';
import { createPinia } from 'pinia';

/**
 * Το Quasar δημιουργεί το Pinia instance από εδώ και το εγκαθιστά πριν τρέξουν
 * τα boot files — χωρίς αυτό, κάθε `useXStore()` έξω από component σκάει με
 * «no active pinia».
 */
export default defineStore(() => createPinia());
