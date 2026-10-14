# Λογότυπο Trifylli

Το σετ του λογότυπου — τριφύλλι σε πράσινο `#2e7d32`, η λέξη σε `#1b5e20`.

| Αρχείο | Πού |
| :--- | :--- |
| `favicon.svg` | Εικονίδιο καρτέλας (`apps/web/public/icons/favicon.svg`) |
| `trifylli-icon.svg` | Εικονίδιο εφαρμογής με στρογγυλεμένες γωνίες → `icon-192.png`, `icon-512.png` |
| `trifylli-icon-maskable.svg` | Χωρίς γωνίες, το σήμα μέσα στη ζώνη ασφαλείας → `icon-maskable-512.png`, `apple-icon-120x120.png` |
| `trifylli-mark.svg` | Σκέτο σήμα → `safari-pinned-tab.svg` |
| `trifylli-mark-white.svg` | Σκέτο σήμα, λευκό (σε σκούρο φόντο) |
| `trifylli-logo.svg`, `trifylli-logo-white.svg` | Σήμα + λέξη, οριζόντια |
| `trifylli-logo-stacked.svg` | Σήμα πάνω, λέξη κάτω |

Τα PNG της PWA ξαναβγαίνουν από εδώ:

```bash
cd docs/brand
rsvg-convert -w 192 -h 192 trifylli-icon.svg -o ../../apps/web/public/icons/icon-192.png
rsvg-convert -w 512 -h 512 trifylli-icon.svg -o ../../apps/web/public/icons/icon-512.png
rsvg-convert -w 512 -h 512 trifylli-icon-maskable.svg -o ../../apps/web/public/icons/icon-maskable-512.png
rsvg-convert -w 120 -h 120 trifylli-icon-maskable.svg -o ../../apps/web/public/icons/apple-icon-120x120.png
cp favicon.svg ../../apps/web/public/icons/favicon.svg
cp trifylli-mark.svg ../../apps/web/public/icons/safari-pinned-tab.svg
```

Το `apple-icon-120x120.png` και το `safari-pinned-tab.svg` τα ζητά η σελίδα μόνη της (`injectPwaMetaTags` του Quasar) — χωρίς αυτά το iPhone έπαιρνε HTML αντί για εικονίδιο.
