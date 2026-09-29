import MarkdownIt from 'markdown-it';

/**
 * Απόδοση Markdown για τις σημειώσεις σχεδιασμού.
 *
 * `html: false` είναι το σημαντικό: ό,τι raw HTML βρεθεί στο κείμενο βγαίνει
 * escaped αντί να εκτελεστεί. Τις σημειώσεις τις γράφουν στελέχη αλλά τις
 * διαβάζουν και άλλοι, και το κείμενο συχνά έρχεται με αντιγραφή-επικόλληση
 * από αλλού — δεν υπάρχει λόγος να εμπιστευτούμε την προέλευσή του.
 *
 * `breaks: true` επειδή οι σημειώσεις γράφονται σαν σημειώσεις: μια αλλαγή
 * γραμμής σημαίνει αλλαγή γραμμής, όχι συνέχεια της παραγράφου.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

/** Το πρόθεμα των εικόνων που ζουν στο object storage (σερβίρονται μέσω backend). */
export const IMAGE_REF_PREFIX = 'trifylli:';

// Οι σύνδεσμοι ανοίγουν σε νέα καρτέλα: η PWA κρατά κατάσταση σχεδιασμού που
// δεν θέλουμε να χάνεται επειδή κάποιος πάτησε μια παραπομπή.
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]!.attrSet('target', '_blank');
  tokens[idx]!.attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// 1×1 διάφανο pixel — placeholder όσο η εικόνα κατεβαίνει (ή αν αποτύχει).
const PENDING_SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Εικόνες με πρόθεμα `trifylli:` ζουν στο object storage και σερβίρονται μέσω
 * του backend με auth — δεν μπορούν να μπουν κατευθείαν ως `src`. Ο `resolver`
 * (που δίνει το MarkdownField) επιστρέφει ένα έτοιμο blob URL όταν η εικόνα έχει
 * κατέβει· αλλιώς δείχνουμε placeholder.
 */
const defaultImage =
  md.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!;
  const srcIndex = token.attrIndex('src');
  const src = srcIndex >= 0 ? String(token.attrs?.[srcIndex]?.[1] ?? '') : '';

  if (src.startsWith(IMAGE_REF_PREFIX)) {
    const id = src.slice(IMAGE_REF_PREFIX.length);
    const resolver = (env as MarkdownEnv | undefined)?.resolveImage;
    const resolved = resolver?.(id) ?? null;
    token.attrs![srcIndex]![1] = resolved ?? PENDING_SRC;
    if (!resolved) token.attrSet('class', 'md-img-pending');
    token.attrSet('loading', 'lazy');
  }
  return defaultImage(tokens, idx, options, env, self);
};

interface MarkdownEnv {
  resolveImage?: ((id: string) => string | null) | undefined;
}

export function renderMarkdown(source: string, resolveImage?: (id: string) => string | null): string {
  return md.render(source, { resolveImage } satisfies MarkdownEnv);
}

/** Όλα τα file ids εικόνων `trifylli:ID` μέσα στο κείμενο. */
export function imageRefIds(source: string): string[] {
  const ids = new Set<string>();
  const re = /!\[[^\]]*\]\(trifylli:([0-9a-fA-F-]{36})\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) ids.add(match[1]!);
  return [...ids];
}
