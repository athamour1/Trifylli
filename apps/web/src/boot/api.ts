import { defineBoot } from '#q-app/wrappers';
import { http } from '../lib/api';

/** Κάνει τον axios client διαθέσιμο ως `$api` στα templates. */
declare module 'vue' {
  interface ComponentCustomProperties {
    $api: typeof http;
  }
}

export default defineBoot(({ app }) => {
  app.config.globalProperties.$api = http;
});
