/* ============================================================================
   Bac Simulator — script.js (point d'entrée / orchestrateur)
   ----------------------------------------------------------------------------
   Relie les modules entre eux selon le flux unidirectionnel :

     saisie → mutation de l'état → calculator.calculerTout()
            → ui.render…()      → storage.save()

   Ce fichier possède : l'ÉTAT de l'application, la NAVIGATION entre écrans,
   le THÈME, et les boutons globaux (reprendre, pré-remplir, réinitialiser).
   Tout le rendu est délégué à ui.js, tout le calcul à calculator.js.
   ============================================================================ */

import { BAC_DATA } from "./bacData.js";
import { calculerTout, normaliserNote } from "./calculator.js";
import * as ui from "./ui.js";
import * as storage from "./storage.js";

/* ----------------------------------------------------------------------------
   1. ÉTAT DE L'APPLICATION
   --------------------------------------------------------------------------- */

/** État neuf (première visite ou après réinitialisation). */
function etatInitial() {
  // Une entrée par épreuve, toutes vides au départ
  const epreuves = {};
  for (const ep of BAC_DATA.epreuvesTerminales) epreuves[ep.id] = null;

  return {
    schemaVersion: storage.SCHEMA_VERSION,
    profil: { prenom: "", nom: "", academie: "", objectif: 12 },
    specialites: { choisies: [], abandonnee: null },
    options: { premiere: [], terminale: [] },
    saisieCC: "moyenne",                        // "moyenne" | "trimestres"
    notes: { epreuves, ccPremiere: {}, ccTerminale: {} },
    ui: { theme: "auto", ecranCourant: "accueil" },
    meta: { creeLe: new Date().toISOString(), modifieLe: null },
  };
}

/* Reprise éventuelle d'une simulation sauvegardée */
const sauvegarde = storage.load();
const state = sauvegarde || etatInitial();

/* ----------------------------------------------------------------------------
   2. RECALCUL & RENDU (le cœur de la boucle)
   --------------------------------------------------------------------------- */

/** À chaque frappe : recalcule tout, met à jour résultats + bandeau, sauve. */
function recalculer() {
  const resultats = calculerTout(state, BAC_DATA);
  ui.afficherErreurs(resultats.erreurs);
  ui.renderResultats(state, resultats, BAC_DATA);
  ui.renderBandeau(state, resultats);
  storage.save(state);
}

/** Quand le PARCOURS change (spés, options, mode de saisie) :
    reconstruit les listes de notes puis recalcule. */
function reconstruireParcours() {
  ui.renderOptions(state, BAC_DATA, reconstruireParcours);
  ui.renderNotes(state, BAC_DATA, recalculer);
  recalculer();
}

/* ----------------------------------------------------------------------------
   3. NAVIGATION ENTRE ÉCRANS
   --------------------------------------------------------------------------- */
const ORDRE_ECRANS = [
  "accueil", "profil", "specialites", "options",
  "notes", "resultats", "dashboard", "export",
];
const ECRANS_AVEC_BANDEAU = new Set(["notes", "resultats", "dashboard"]);

function afficherEcran(nom) {
  document.querySelectorAll(".ecran").forEach((section) => {
    section.hidden = section.id !== `ecran-${nom}`;
  });

  const stepper = document.getElementById("stepper");
  stepper.hidden = nom === "accueil";
  stepper.querySelectorAll(".stepper__item").forEach((item) => {
    const etape = item.dataset.step;
    item.classList.toggle("is-active", etape === nom);
    item.classList.toggle(
      "is-done",
      ORDRE_ECRANS.indexOf(etape) < ORDRE_ECRANS.indexOf(nom)
    );
  });

  document.getElementById("bandeau").hidden = !ECRANS_AVEC_BANDEAU.has(nom);
  window.scrollTo({ top: 0, behavior: "instant" });

  // Mémorise l'écran courant pour le bouton « Reprendre »
  if (state.ui.ecranCourant !== nom) {
    state.ui.ecranCourant = nom;
    storage.save(state);
  }
}

/* Délégation : tout élément portant data-goto navigue. */
document.addEventListener("click", (event) => {
  const cible = event.target.closest("[data-goto]");
  if (cible) {
    event.preventDefault();
    afficherEcran(cible.dataset.goto);
  }
});

/* ----------------------------------------------------------------------------
   4. THÈME (clair / sombre / auto) — persisté
   --------------------------------------------------------------------------- */
const CYCLE_THEMES = ["auto", "clair", "sombre"];

function appliquerTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

document.getElementById("btn-theme").addEventListener("click", () => {
  const suivant =
    CYCLE_THEMES[(CYCLE_THEMES.indexOf(state.ui.theme) + 1) % CYCLE_THEMES.length];
  state.ui.theme = suivant;
  appliquerTheme(suivant);
  storage.save(state);
});

/* ----------------------------------------------------------------------------
   5. BOUTONS GLOBAUX
   --------------------------------------------------------------------------- */

/* « Reprendre » : visible seulement si une sauvegarde existe */
const btnReprendre = document.getElementById("btn-reprendre");
if (sauvegarde) {
  btnReprendre.hidden = false;
  const date = storage.dateSauvegarde();
  if (date) {
    document.getElementById("reprendre-date").textContent =
      `(${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}, ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})`;
  }
  btnReprendre.addEventListener("click", () => {
    afficherEcran(state.ui.ecranCourant === "accueil" ? "profil" : state.ui.ecranCourant);
  });
}

/* « Pré-remplir les hypothèses de Terminale avec les moyennes de Première » */
document.getElementById("btn-prefill").addEventListener("click", () => {
  // Tronc commun présent sur les deux années
  for (const cc of BAC_DATA.controleContinu) {
    if (cc.coefPremiere === 0 || cc.coefTerminale === 0) continue;
    const moyenne = normaliserNote(state.notes.ccPremiere[cc.id] ?? null, true, BAC_DATA.regles);
    if (moyenne !== null) state.notes.ccTerminale[cc.id] = moyenne;
  }
  // Options suivies les deux années
  for (const idOption of state.options.terminale) {
    if (!state.options.premiere.includes(idOption)) continue;
    const cle = `opt-${idOption}`;
    const moyenne = normaliserNote(state.notes.ccPremiere[cle] ?? null, true, BAC_DATA.regles);
    if (moyenne !== null) state.notes.ccTerminale[cle] = moyenne;
  }
  ui.renderNotes(state, BAC_DATA, recalculer); // réaffiche les champs remplis
  recalculer();
});

/* « Réinitialiser » : confirmation puis remise à zéro complète */
document.getElementById("btn-reset").addEventListener("click", () => {
  const confirme = window.confirm(
    "Réinitialiser la simulation ?\nToutes les notes saisies seront définitivement effacées de cet appareil."
  );
  if (confirme) {
    storage.reset();
    window.location.reload();
  }
});

/* « Moyenne annuelle ↔ 3 trimestres » (bulletins) */
const switchTrimestres = document.getElementById("mode-trimestres");
switchTrimestres.checked = state.saisieCC === "trimestres";
switchTrimestres.addEventListener("change", () => {
  state.saisieCC = switchTrimestres.checked ? "trimestres" : "moyenne";
  ui.renderNotes(state, BAC_DATA, recalculer);
  recalculer();
});

/* ----------------------------------------------------------------------------
   6. SERVICE WORKER (PWA) — activé à l'étape 5
   --------------------------------------------------------------------------- */
// if ("serviceWorker" in navigator) {
//   navigator.serviceWorker.register("service-worker.js");
// }

/* ----------------------------------------------------------------------------
   7. DÉMARRAGE
   --------------------------------------------------------------------------- */
appliquerTheme(state.ui.theme);
ui.remplirAcademies(state, BAC_DATA);
ui.bindProfil(state, recalculer);
ui.initTabs();
ui.renderSpecialites(state, BAC_DATA, reconstruireParcours);
reconstruireParcours();          // options + notes + premier calcul
afficherEcran("accueil");        // on démarre toujours sur l'accueil
