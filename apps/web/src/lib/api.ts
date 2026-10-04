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
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      // Χωρίς `response` σημαίνει ότι το αίτημα δεν έφτασε ποτέ.
      if (!error.response) throw new OfflineError(error);

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
