import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

/**
 * Ο HTTP πελάτης της PWA.
 *
 * Δύο πράγματα τον ξεχωρίζουν από ένα σκέτο axios instance:
 *  * στέλνει το `x-dev-email` όταν τρέχουμε χωρίς Authentik, ώστε να δοκιμάζεται
 *    ο κάθε ρόλος από τον browser·
 *  * ξεχωρίζει τα σφάλματα δικτύου από τα σφάλματα του server, γιατί στην
 *    κατασκήνωση το πρώτο είναι ο κανόνας και πρέπει να οδηγεί στην offline ουρά
 *    αντί σε μήνυμα λάθους.
 */

export { API_URL } from './runtime-config';
import { API_URL } from './runtime-config';
const DEV_EMAIL = process.env.DEV_EMAIL ?? '';

/** Σφάλμα που σημαίνει «δεν υπάρχει δίκτυο», όχι «ο server είπε όχι». */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    // Το `cause` είναι ήδη πεδίο του Error· το περνάμε από τις options αντί να
    // το ξαναδηλώσουμε ως property.
    super('Δεν υπάρχει σύνδεση.', { cause });
    this.name = 'OfflineError';
  }
}

/** Σφάλμα με μήνυμα από το API — το εμφανίζουμε αυτούσιο στον χρήστη. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
  headers: DEV_EMAIL ? { 'x-dev-email': DEV_EMAIL } : {},
});

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Τι γίνεται όταν το API απαντά 401 σε αίτημα που είχε token: επιστρέφει νέο
 * token (και το αίτημα επαναλαμβάνεται) ή `null` (η συνεδρία τελείωσε και ο
 * χειριστής έχει ήδη στείλει τον χρήστη στη σύνδεση). Το ορίζει το session
 * store — εδώ δεν ξέρουμε από OIDC.
 */
type UnauthorizedHandler = () => Promise<string | null>;
let onUnauthorized: UnauthorizedHandler | null = null;
/** Μία ανανέωση τη φορά: δέκα αιτήματα που σκάνε μαζί δεν ανοίγουν δέκα iframes. */
let recovering: Promise<string | null> | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

type RetriableConfig = AxiosRequestConfig & { _retriedAfter401?: boolean };

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Δυναμικά δεδομένα — ποτέ από το HTTP cache του browser. Χωρίς αυτό, μια
  // παλιά απάντηση (που είχε cached ο browser) εξυπηρετείται ξανά και οι λίστες
  // «κολλάνε» μετά από αλλαγές. Η offline λειτουργία καλύπτεται από τον service
  // worker και το cache του `useAsyncData`, όχι από το HTTP cache.
  config.headers['Cache-Control'] = 'no-cache';
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      // Χωρίς `response` σημαίνει ότι το αίτημα δεν έφτασε ποτέ.
      if (!error.response) throw new OfflineError(error);

      // 401 με token: ή έληξε στο ενδιάμεσο ή πέθανε η συνεδρία στο Authentik
      // (άλλαξε κωδικός, αποσύνδεση από αλλού). Ένα κόκκινο «Unauthorized» σε
      // σελίδα που δεν λειτουργεί δεν βοηθά κανέναν· ανανεώνουμε ή πάμε για
      // σύνδεση. Μόνο μία επανάληψη ανά αίτημα, μην κάνουμε βρόχο.
      const cfg = error.config as RetriableConfig | undefined;
      if (error.response.status === 401 && accessToken && onUnauthorized && cfg && !cfg._retriedAfter401) {
        recovering ??= onUnauthorized().finally(() => {
          recovering = null;
        });
        const token = await recovering;
        if (token) {
          cfg._retriedAfter401 = true;
          // Ο request interceptor ξαναβάζει το Authorization από το νέο token.
          return http.request(cfg);
        }
      }

      const data = error.response.data as { message?: unknown } | undefined;
      const raw = data?.message;
      const message =
        typeof raw === 'string'
          ? raw
          : Array.isArray(raw)
            ? raw.join(' · ')
            : isConflictPayload(raw)
              ? raw.message
              : error.response.statusText;

      throw new ApiError(message, error.response.status, error.response.data);
    }
    throw error;
  },
);

function isConflictPayload(value: unknown): value is { message: string } {
  return typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string';
}

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.get<T>(url, config);
  return response.data;
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.post<T>(url, body, config);
  return response.data;
}

export async function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.put<T>(url, body, config);
  return response.data;
}

export async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.patch<T>(url, body, config);
  return response.data;
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await http.delete<T>(url, config);
  return response.data;
}

/** Ανέβασμα αρχείου (multipart) με προαιρετικά πεδία φόρμας. */
export async function upload<T>(
  url: string,
  file: File,
  fields: Record<string, string | undefined> = {},
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') form.append(key, value);
  }
  const response = await http.post<T>(url, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return response.data;
}

/** Κατέβασμα αρχείου ως blob (για προβολή απόδειξης μέσω του backend). */
export async function getBlob(url: string): Promise<Blob> {
  const response = await http.get(url, { responseType: 'blob' });
  return response.data as Blob;
}

/**
 * Κατέβασμα αρχείου με το όνομα που δίνει ο server (`Content-Disposition`),
 * αποθηκευμένο από τον browser. Για εξαγωγές (Excel, PDF).
 */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const response = await http.get(url, { responseType: 'blob' });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  const name = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
  const objectUrl = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}
