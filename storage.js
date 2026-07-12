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

/** Version courante du schéma d'état (voir CONCEPTION.md § 3.2). */
export const SCHEMA_VERSION = 1;

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

    // Migrations futures : if (state.schemaVersion === 1) { ... }
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
