import type SegmentedToggle from './components/SegmentedToggle.vue';

// Τύποι για τα καθολικά components (βλ. boot/components.ts), ώστε το vue-tsc
// να τα ξέρει μέσα στα templates.
declare module 'vue' {
  export interface GlobalComponents {
    SegmentedToggle: typeof SegmentedToggle;
  }
}
