import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type { KladosType } from '@trifylli/shared';
import { IMAGE_REF_PREFIX, imageRefIds, renderMarkdown } from '../lib/markdown';
import { ApiError, getBlob, upload } from '../lib/api';

/**
 * Οι εικόνες ενός πεδίου Markdown: απόδοση και ανέβασμα.
 *
 * Οι εικόνες ανεβαίνουν στο object storage και σερβίρονται μέσω του backend με
 * auth — στο κείμενο μένει μια σταθερή αναφορά `![](trifylli:ID)`, που στην
 * απόδοση γίνεται blob URL. Κοινό για το απλό και το συνεργατικό πεδίο: το καθένα
 * λέει μόνο πώς μπαίνει κείμενο στη θέση του κέρσορα.
 */
export function useMarkdownImages(options: {
  text: () => string;
  /** Εμβέλεια των εικόνων (κλάδος ή `null` για Τοπικό). */
  klados: () => KladosType | null;
  /** Βάζει το κείμενο στη θέση του κέρσορα. */
  insert: (snippet: string) => void;
  /** Δέχεται το πεδίο αυτή τη στιγμή εικόνες (γράφεται, όχι προβολή); */
  accepts: () => boolean;
}) {
  const $q = useQuasar();

  // ── Απόδοση με εικόνες (blob URLs) ──
  const blobUrls = reactive<Record<string, string>>({});
  const failed = reactive<Record<string, boolean>>({});
  const html = computed(() => renderMarkdown(options.text(), (id) => blobUrls[id] ?? null));

  async function resolveImages(): Promise<void> {
    for (const id of imageRefIds(options.text())) {
      if (blobUrls[id] || failed[id]) continue;
      try {
        const blob = await getBlob(`/files/${id}`);
        blobUrls[id] = URL.createObjectURL(blob);
      } catch {
        failed[id] = true;
      }
    }
  }
  watch(options.text, resolveImages, { immediate: true });

  // ── Ανέβασμα (paste / drop / κουμπί) ──
  const uploading = ref(false);
  const dragActive = ref(false);

  async function uploadFiles(list: FileList | File[] | null): Promise<void> {
    const files = [...(list ?? [])];
    if (!files.length) return;
    uploading.value = true;
    try {
      for (const file of files) {
        const klados = options.klados();
        const ref = await upload<{ id: string }>('/files', file, {
          purpose: 'MARKDOWN',
          ...(klados ? { kladosType: klados } : {}),
        });
        options.insert(`\n![${altFor(file.name)}](${IMAGE_REF_PREFIX}${ref.id})\n`);
      }
    } catch (err) {
      $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία ανεβάσματος.' });
    } finally {
      uploading.value = false;
    }
  }

  function onPaste(event: ClipboardEvent): void {
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length) {
      event.preventDefault();
      void uploadFiles(files);
    }
  }

  /** Σέρνεται αρχείο (όχι κείμενο) και το πεδίο δέχεται ανέβασμα; */
  function isFileDrag(event: DragEvent): boolean {
    return options.accepts() && (event.dataTransfer?.types?.includes('Files') ?? false);
  }
  function onDragEnter(event: DragEvent): void {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragActive.value = true;
  }
  function onDragOver(event: DragEvent): void {
    // Το preventDefault στο dragover είναι απαραίτητο για να επιτραπεί το drop.
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragActive.value = true;
  }
  function onDragLeave(event: DragEvent): void {
    // Αγνόησε τα dragleave που πάνε σε παιδί του πεδίου.
    const related = event.relatedTarget as Node | null;
    if (!related || !(event.currentTarget as HTMLElement).contains(related)) {
      dragActive.value = false;
    }
  }
  function onDrop(event: DragEvent): void {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragActive.value = false;
    const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) void uploadFiles(files);
  }

  // Ένα αρχείο που πέφτει **εκτός** του πεδίου να μην ανοίγει/πλοηγεί τον browser
  // (ο πιο συχνός λόγος που το drag-drop «δεν δουλεύει»).
  function preventWindowFileNav(event: DragEvent): void {
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  }
  onMounted(() => {
    window.addEventListener('dragover', preventWindowFileNav);
    window.addEventListener('drop', preventWindowFileNav);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('dragover', preventWindowFileNav);
    window.removeEventListener('drop', preventWindowFileNav);
    for (const url of Object.values(blobUrls)) URL.revokeObjectURL(url);
  });

  return { html, uploading, dragActive, uploadFiles, onPaste, onDragEnter, onDragOver, onDragLeave, onDrop };
}

function altFor(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[[\]()]/g, '').slice(0, 60) || 'εικόνα';
}
