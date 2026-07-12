/* ============================================================================
   Bac Simulator — service-worker.js
   ----------------------------------------------------------------------------
   PWA / HORS LIGNE — stratégie « cache-first » :
   tous les fichiers de l'application sont pré-mis en cache à l'installation,
   puis servis depuis le cache (l'app fonctionne sans réseau après la
   première visite).

   ⚠️ Le service worker exige HTTPS (ou localhost).
   ⚠️ À chaque mise à jour de l'application : incrémenter NOM_CACHE
      (v1 → v2 …) pour invalider l'ancien cache.

   L'enregistrement est déclenché depuis script.js (décommenté à l'étape 5).
   ============================================================================ */

const NOM_CACHE = "bac-simulator-v1";

/** Fichiers pré-mis en cache. Complété aux étapes 4-5 (libs, icônes). */
const FICHIERS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./bacData.js",
  "./calculator.js",
  "./ui.js",
  "./storage.js",
  "./pdf.js",
  "./manifest.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  // Étape 4-5 : "./assets/libs/chart.umd.min.js", "./assets/libs/jspdf.umd.min.js"
];

/* Installation : pré-cache de tous les fichiers. */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(NOM_CACHE).then((cache) => cache.addAll(FICHIERS))
  );
  self.skipWaiting();
});

/* Activation : purge des anciens caches (versions précédentes). */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cles) =>
      Promise.all(
        cles.filter((cle) => cle !== NOM_CACHE).map((cle) => caches.delete(cle))
      )
    )
  );
  self.clients.claim();
});

/* Requêtes : cache d'abord, réseau en secours. */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then(
      (reponse) => reponse || fetch(event.request)
    )
  );
});
