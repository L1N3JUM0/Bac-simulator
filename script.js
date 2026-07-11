/* ============================================================================
   SimuBac — script.js (point d'entrée)
   ----------------------------------------------------------------------------
   ÉTAPE 1 : ce fichier contient uniquement ce qu'il faut pour PRÉVISUALISER
   l'interface : navigation entre écrans, bascule de thème, onglets de l'écran
   Notes. Aucune logique métier.

   À l'étape 3, ce fichier deviendra l'orchestrateur :
     import { BAC_DATA }   from "./bacData.js";
     import * as calc      from "./calculator.js";
     import * as ui        from "./ui.js";
     import * as storage   from "./storage.js";
   et branchera : état → calcul → rendu → sauvegarde.

   ⚠️ Modules ES6 : servir le dossier via un petit serveur local
   (ex. `npx serve`) ou un hébergement statique — voir README.md.
   ============================================================================ */

/* ----------------------------------------------------------------------------
   1. NAVIGATION ENTRE ÉCRANS
   Chaque écran est une <section id="ecran-XXX">. Tout élément portant
   l'attribut data-goto="XXX" déclenche l'affichage de l'écran XXX.
   --------------------------------------------------------------------------- */

/** Ordre des étapes, utilisé pour l'état du stepper. */
const ORDRE_ECRANS = [
  "accueil", "profil", "specialites", "options",
  "notes", "resultats", "dashboard", "export",
];

/** Écrans sur lesquels le bandeau de synthèse est visible. */
const ECRANS_AVEC_BANDEAU = new Set(["notes", "resultats", "dashboard"]);

/**
 * Affiche l'écran demandé, masque les autres, met à jour le stepper
 * et la visibilité du bandeau de synthèse.
 * @param {string} nom - identifiant court de l'écran (ex. "profil")
 */
function afficherEcran(nom) {
  document.querySelectorAll(".ecran").forEach((section) => {
    section.hidden = section.id !== `ecran-${nom}`;
  });

  // Stepper : masqué sur l'accueil, étape active ailleurs
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

  // Bandeau de synthèse
  document.getElementById("bandeau").hidden = !ECRANS_AVEC_BANDEAU.has(nom);

  // Retour en haut de page (comportement d'app native)
  window.scrollTo({ top: 0, behavior: "instant" });
}

/* Délégation d'événements : un seul écouteur pour tous les data-goto. */
document.addEventListener("click", (event) => {
  const cible = event.target.closest("[data-goto]");
  if (cible) {
    event.preventDefault();
    afficherEcran(cible.dataset.goto);
  }
});

/* ----------------------------------------------------------------------------
   2. THÈME (clair / sombre / auto)
   Étape 1 : simple cycle sur l'attribut data-theme de <html>.
   Étape 3 : la préférence sera persistée via storage.js.
   --------------------------------------------------------------------------- */
const CYCLE_THEMES = ["auto", "clair", "sombre"];

document.getElementById("btn-theme").addEventListener("click", () => {
  const html = document.documentElement;
  const actuel = html.dataset.theme || "auto";
  const suivant =
    CYCLE_THEMES[(CYCLE_THEMES.indexOf(actuel) + 1) % CYCLE_THEMES.length];
  html.dataset.theme = suivant;
});

/* ----------------------------------------------------------------------------
   3. ONGLETS DE L'ÉCRAN NOTES (prévisualisation)
   Étape 3 : sera déplacé/généralisé dans ui.js avec gestion aria complète
   (aria-selected, flèches clavier).
   --------------------------------------------------------------------------- */
document.querySelectorAll(".tab").forEach((onglet) => {
  onglet.addEventListener("click", () => {
    // Désactive tous les onglets et panneaux…
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove("is-active");
      t.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));

    // …puis active la paire cliquée.
    onglet.classList.add("is-active");
    onglet.setAttribute("aria-selected", "true");
    document.getElementById(onglet.getAttribute("aria-controls")).hidden = false;
  });
});

/* ----------------------------------------------------------------------------
   4. SERVICE WORKER (PWA) — enregistré à l'étape 5.
   Le code est prêt mais volontairement désactivé pour ne pas mettre en cache
   une version incomplète de l'application pendant le développement.
   --------------------------------------------------------------------------- */
// if ("serviceWorker" in navigator) {
//   navigator.serviceWorker.register("service-worker.js");
// }

/* ----------------------------------------------------------------------------
   5. DÉMARRAGE
   --------------------------------------------------------------------------- */
afficherEcran("accueil");
