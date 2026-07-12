/* ============================================================================
   Bac Simulator — storage.js
   ----------------------------------------------------------------------------
   PERSISTANCE LOCALE (localStorage) : sauvegarde automatique de l'état,
   reprise de simulation, réinitialisation. Le schéma est versionné pour
   permettre des migrations futures sans perdre les données des utilisateurs.

   Rien ne quitte l'appareil : aucune donnée n'est envoyée sur Internet.
   ============================================================================ */

/** Clé unique dans le localStorage. Incrémenter la version du SCHÉMA
    (state.schemaVersion), pas cette clé, en cas d'évolution. */
const CLE = "bac-simulator.v1";

/** Version courante du schéma d'état (voir CONCEPTION.md § 3.2).
    v2 (v1.1) : ajout de `cibles` (notes cibles par épreuve), `rattrapage`
    (matières choisies pour le 2d groupe) et `historique` (suivi de la
    moyenne dans le temps). */
export const SCHEMA_VERSION = 2;

/** Migration douce d'un état v1 vers v2 : on complète, on ne jette rien. */
function migrer(state) {
  if (state.schemaVersion === 1) {
    state.cibles = {};
    state.rattrapage = [];
    state.historique = [];
    state.schemaVersion = 2;
  }
  return state;
}

/**
 * Sauvegarde l'état complet. Appelée à chaque modification (les écritures
 * localStorage sont quasi instantanées pour quelques kilo-octets).
 * @returns {boolean} true si la sauvegarde a réussi
 */
export function save(state) {
  try {
    state.meta.modifieLe = new Date().toISOString();
    localStorage.setItem(CLE, JSON.stringify(state));
    return true;
  } catch (erreur) {
    // localStorage peut être plein ou bloqué (navigation privée stricte) :
    // l'application continue de fonctionner, simplement sans persistance.
    console.warn("Sauvegarde impossible :", erreur);
    return false;
  }
}

/**
 * Recharge l'état sauvegardé.
 * @returns {object|null} l'état, ou null si absent / invalide / autre version
 */
export function load() {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;

    const state = JSON.parse(brut);

    // Garde-fou : structure minimale attendue
    if (!state || typeof state !== "object" || !state.notes || !state.specialites) {
      return null;
    }

    migrer(state);
    if (state.schemaVersion !== SCHEMA_VERSION) {
      console.warn(`Schéma ${state.schemaVersion} ≠ ${SCHEMA_VERSION} : état ignoré.`);
      return null;
    }

    return state;
  } catch {
    return null; // JSON corrompu → on repart de zéro sans planter
  }
}

/** Efface la sauvegarde (bouton « Réinitialiser », après confirmation). */
export function reset() {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à faire : au pire la clé restera */
  }
}

/** Une simulation sauvegardée existe-t-elle ? (bouton « Reprendre ») */
export function hasSave() {
  return load() !== null;
}

/** Date de dernière modification de la sauvegarde, ou null. */
export function dateSauvegarde() {
  const state = load();
  return state && state.meta && state.meta.modifieLe
    ? new Date(state.meta.modifieLe)
    : null;
}

/* ----------------------------------------------------------------------------
   PARTAGE PAR LIEN (v1.1) — aucun serveur : l'état voyage dans l'URL
   ---------------------------------------------------------------------------
   L'état (sans l'historique personnel) est sérialisé en JSON puis encodé en
   base64url dans le fragment #sim=… . Ouvrir le lien recharge exactement la
   même simulation. Le lien contient les notes et le profil saisis : à ne
   partager qu'en connaissance de cause (l'interface le rappelle).
   --------------------------------------------------------------------------- */

/** Encode l'état courant en fragment d'URL (#sim=…). */
export function versLien(state) {
  const partage = {
    ...state,
    historique: [],                       // le suivi personnel ne voyage pas
    meta: { creeLe: new Date().toISOString(), modifieLe: null },
    ui: { ...state.ui, ecranCourant: "resultats" }, // le destinataire arrive aux résultats
  };
  const octets = new TextEncoder().encode(JSON.stringify(partage));
  let binaire = "";
  for (const octet of octets) binaire += String.fromCharCode(octet);
  const base64url = btoa(binaire)
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${location.origin}${location.pathname}#sim=${base64url}`;
}

/** Décode un éventuel état présent dans l'URL. @returns {object|null} */
export function depuisLien() {
  if (typeof location === "undefined") return null; // environnement de test
  const correspondance = location.hash.match(/^#sim=([A-Za-z0-9_-]+)$/);
  if (!correspondance) return null;
  try {
    const base64 = correspondance[1].replace(/-/g, "+").replace(/_/g, "/");
    const binaire = atob(base64);
    const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
    const state = JSON.parse(new TextDecoder().decode(octets));
    if (!state || !state.notes || !state.specialites) return null;
    migrer(state);
    return state.schemaVersion === SCHEMA_VERSION ? state : null;
  } catch {
    return null; // lien corrompu ou tronqué : on l'ignore silencieusement
  }
}
