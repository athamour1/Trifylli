/** Ορθογώνιο όπως το δίνει το `getBoundingClientRect` — στην οθόνη, με τα transforms. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Πού κάθεται το «χάπι» ενός segmented control: η θέση του ενεργού κουμπιού μέσα
 * στη ράγα, σε μέγεθος διάταξης. Τα `getBoundingClientRect` μετρούν στην οθόνη·
 * μέσα σε διάλογο που ανοίγει με scale βγαίνουν μικρότερα, και το χάπι έμενε
 * στενότερο από το κουμπί. Η κλίμακα βγαίνει από τη ράγα (οθόνη / διάταξη).
 */
export function thumbBox(
  active: ScreenRect,
  rail: ScreenRect,
  railLayout: { width: number; height: number },
  scroll: { left: number; top: number },
): { x: number; y: number; w: number; h: number } {
  const sx = railLayout.width ? rail.width / railLayout.width : 1;
  const sy = railLayout.height ? rail.height / railLayout.height : 1;
  return {
    x: (active.left - rail.left) / sx + scroll.left,
    y: (active.top - rail.top) / sy + scroll.top,
    w: active.width / sx,
    h: active.height / sy,
  };
}
