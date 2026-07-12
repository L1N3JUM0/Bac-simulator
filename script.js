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
import { genererPDF } from "./pdf.js";
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

/** Derniers résultats calculés (réutilisés par le tableau de bord). */
let derniersResultats = null;

/** À chaque frappe : recalcule tout, met à jour résultats + bandeau, sauve. */
function recalculer() {
  derniersResultats = calculerTout(state, BAC_DATA);
  ui.afficherErreurs(derniersResultats.erreurs);
  ui.renderResultats(state, derniersResultats, BAC_DATA);
  ui.renderBandeau(state, derniersResultats);
  // Les graphiques ne sont reconstruits que si l'écran est visible
  if (state.ui.ecranCourant === "dashboard") {
    ui.renderDashboard(state, derniersResultats, BAC_DATA);
  }
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

  // Tableau de bord : (re)construit à chaque ouverture (suit aussi le thème)
  if (nom === "dashboard" && derniersResultats) {
    ui.renderDashboard(state, derniersResultats, BAC_DATA);
  }

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
  if (state.ui.ecranCourant === "dashboard" && derniersResultats) {
    ui.renderDashboard(state, derniersResultats, BAC_DATA); // couleurs du thème
  }
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

/* « Pré-remplir les hypothèses de Terminale avec les moyennes de Première ».
   Ne touche QUE les champs encore vides : les hypothèses déjà saisies
   par l'élève sont respectées. */
document.getElementById("btn-prefill").addEventListener("click", () => {
  const estVide = (valeur) =>
    normaliserNote(valeur ?? null, true, BAC_DATA.regles) === null;

  // Tronc commun présent sur les deux années
  for (const cc of BAC_DATA.controleContinu) {
    if (cc.coefPremiere === 0 || cc.coefTerminale === 0) continue;
    if (!estVide(state.notes.ccTerminale[cc.id])) continue; // déjà saisie
    const moyenne = normaliserNote(state.notes.ccPremiere[cc.id] ?? null, true, BAC_DATA.regles);
    if (moyenne !== null) state.notes.ccTerminale[cc.id] = moyenne;
  }
  // Options suivies les deux années
  for (const idOption of state.options.terminale) {
    if (!state.options.premiere.includes(idOption)) continue;
    const cle = `opt-${idOption}`;
    if (!estVide(state.notes.ccTerminale[cle])) continue;
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
   6. EXPORT PDF
   --------------------------------------------------------------------------- */
document.getElementById("btn-pdf").addEventListener("click", () => {
  if (!derniersResultats) recalculer();
  genererPDF(state, derniersResultats, BAC_DATA);
});

/* ----------------------------------------------------------------------------
   7. PWA : service worker (hors ligne) + proposition d'installation
   --------------------------------------------------------------------------- */
if ("serviceWorker" in navigator) {
  // Chemin relatif : fonctionne aussi bien à la racine (Netlify) que dans un
  // sous-dossier (GitHub Pages /Bac-simulator/).
  navigator.serviceWorker.register("service-worker.js").catch((erreur) => {
    console.warn("Service worker non enregistré :", erreur);
  });
}

/* Android / desktop : on capture l'invite du navigateur pour proposer un
   bouton « Installer » explicite sur l'écran Réglages. */
let promptInstallation = null;
const btnInstaller = document.getElementById("btn-installer");

window.addEventListener("beforeinstallprompt", (evenement) => {
  evenement.preventDefault();
  promptInstallation = evenement;
  btnInstaller.hidden = false;
  document.getElementById("install-indispo").hidden = true;
});

btnInstaller.addEventListener("click", async () => {
  if (!promptInstallation) return;
  promptInstallation.prompt();
  await promptInstallation.userChoice;
  promptInstallation = null;
  btnInstaller.hidden = true;
});

/* iOS : pas d'invite automatique → instructions dédiées */
const estIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (estIOS) {
  document.getElementById("ios-install").hidden = false;
} else {
  document.getElementById("install-indispo").hidden = false;
}

window.addEventListener("appinstalled", () => {
  btnInstaller.hidden = true;
  document.getElementById("install-indispo").hidden = true;
});

/* ----------------------------------------------------------------------------
   8. DÉMARRAGE
   --------------------------------------------------------------------------- */
appliquerTheme(state.ui.theme);
ui.remplirAcademies(state, BAC_DATA);
ui.bindProfil(state, recalculer);
ui.initTabs();
ui.initModaleGraphiques();
ui.renderSpecialites(state, BAC_DATA, reconstruireParcours);
reconstruireParcours();          // options + notes + premier calcul
afficherEcran("accueil");        // on démarre toujours sur l'accueil
