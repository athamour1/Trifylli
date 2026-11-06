/** Εικόνα ως data URL (`?inline` του Vite) — π.χ. το λογότυπο στα φύλλα εκτύπωσης. */
declare module '*.png?inline' {
  const src: string;
  export default src;
}
