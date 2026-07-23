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
import { calculerTout, normaliserNote, validerEtape } from "./calculator.js";
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
    cibles: {},                                 // v1.1 : notes cibles par épreuve
    rattrapage: [],                             // v1.1 : matières du 2d groupe
    historique: [],                             // v1.1 : [{date, moyenne}]
    ui: { theme: "auto", ecranCourant: "accueil" },
    meta: { creeLe: new Date().toISOString(), modifieLe: null },
  };
}

/* v1.1 — Un lien de partage (#sim=…) est-il présent dans l'URL ?
   Si oui, et après confirmation, il remplace la simulation locale. */
let etatPartage = storage.depuisLien();
if (etatPartage) {
  const accepte = !storage.hasSave() || window.confirm(
    "Ce lien contient une simulation partagée.\n" +
    "L'ouvrir remplacera ta simulation actuelle sur cet appareil. Continuer ?"
  );
  if (!accepte) etatPartage = null;
  // Le fragment est retiré de l'URL dans tous les cas (il contient des notes)
  history.replaceState(null, "", location.pathname + location.search);
}

/* Reprise éventuelle d'une simulation sauvegardée */
const sauvegarde = etatPartage || storage.load();
const state = sauvegarde || etatInitial();
if (etatPartage) storage.save(state); // la simulation partagée devient la locale

/* ----------------------------------------------------------------------------
   2. RECALCUL & RENDU (le cœur de la boucle)
   --------------------------------------------------------------------------- */

/** Derniers résultats calculés (réutilisés par le tableau de bord). */
let derniersResultats = null;

/** À chaque frappe : recalcule tout, met à jour résultats + bandeau, sauve. */
function recalculer() {
  derniersResultats = calculerTout(state, BAC_DATA);
  /* v1.2 — ui.afficherErreurs() n'est plus appelée ici : elle répartissait les
     messages entre les deux zones en cherchant des mots dans le texte, et elle
     entrait en conflit avec le gating. majEtapes() est désormais la SEULE à
     écrire dans #err-specialites et #err-options. La fonction reste exportée
     par ui.js pour ne rien casser ailleurs. */
  ui.renderResultats(state, derniersResultats, BAC_DATA);
  ui.renderBandeau(state, derniersResultats);
  majEtapes();                     // v1.2 : (dé)verrouille les boutons « Continuer »
  // Les graphiques ne sont reconstruits que si l'écran est visible
  if (state.ui.ecranCourant === "dashboard") {
    ui.renderDashboard(state, derniersResultats, BAC_DATA);
  }
  storage.saveDifferee(state);     // v1.2 : écritures regroupées (150 ms)
}

/* ----------------------------------------------------------------------------
   2 bis. GATING DES ÉTAPES (v1.2)
   ---------------------------------------------------------------------------
   Un bouton « Continuer » qui mène à un écran incohérent est un piège. Chaque
   bouton portant data-etape est désactivé tant que son étape n'est pas valide,
   et la raison est affichée juste au-dessus — jamais un simple grisage muet.
   --------------------------------------------------------------------------- */

/** Où afficher le message de blocage de chaque étape. */
const ZONES_ERREUR = {
  specialites: "err-specialites",
  options: "err-options",
};

function majEtapes() {
  for (const bouton of document.querySelectorAll("[data-etape]")) {
    const etape = bouton.dataset.etape;
    const { valide, message } = validerEtape(etape, state, BAC_DATA);

    bouton.disabled = !valide;
    bouton.setAttribute("aria-disabled", String(!valide));

    const zone = document.getElementById(ZONES_ERREUR[etape]);
    if (!zone) continue;

    /* Sur l'écran Options, on affiche TOUTES les erreurs réglementaires
       (plafonds, conditions maths expertes/complémentaires…), pas seulement
       la première : elles sont indépendantes les unes des autres. */
    const texte = etape === "options" && derniersResultats
      ? derniersResultats.erreurs.join(" ")
      : (message || "");

    zone.textContent = valide ? "" : texte;
    zone.hidden = valide || texte === "";
  }
}

/** Quand le PARCOURS change (spés, options, mode de saisie) :
    reconstruit les listes de notes puis recalcule. */
function reconstruireParcours() {
  ui.renderOptions(state, BAC_DATA, reconstruireParcours);
  ui.renderNotes(state, BAC_DATA, recalculer);
  ui.majLabelsCibles(state, BAC_DATA);
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
  let sectionActive = null;
  document.querySelectorAll(".ecran").forEach((section) => {
    const active = section.id === `ecran-${nom}`;
    section.hidden = !active;
    if (active) sectionActive = section;
  });

  const stepper = document.getElementById("stepper");
  stepper.hidden = nom === "accueil";
  stepper.querySelectorAll(".stepper__item").forEach((item) => {
    const etape = item.dataset.step;
    const active = etape === nom;
    item.classList.toggle("is-active", active);
    item.classList.toggle(
      "is-done",
      ORDRE_ECRANS.indexOf(etape) < ORDRE_ECRANS.indexOf(nom)
    );
    /* v1.2 — Un lecteur d'écran ne « voit » pas une classe CSS : c'est
       aria-current qui lui annonce l'étape en cours. */
    const bouton = item.querySelector("button");
    if (bouton) {
      if (active) bouton.setAttribute("aria-current", "step");
      else bouton.removeAttribute("aria-current");
    }
  });

  document.getElementById("bandeau").hidden = !ECRANS_AVEC_BANDEAU.has(nom);
  window.scrollTo({ top: 0, behavior: "instant" });

  /* v1.2 — Le focus suit l'écran : sans cela, le changement de page était
     totalement silencieux au clavier et au lecteur d'écran, et la tabulation
     repartait du haut du document à chaque fois. */
  if (sectionActive) {
    const titre = sectionActive.querySelector("h1, h2");
    const cible = titre || sectionActive;
    if (!cible.hasAttribute("tabindex")) cible.setAttribute("tabindex", "-1");
    cible.focus({ preventScroll: true });
  }

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

/* v1.2 — Si une sauvegarde illisible a été mise de côté, on le dit : l'élève
   doit savoir que ses anciennes notes ne sont pas perdues (voir storage.js). */
if (storage.aSauvegardeDeSecours()) {
  console.info(
    "Une ancienne sauvegarde illisible a été archivée sous « bac-simulator.secours »."
  );
}

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
  storage.flush();                 // v1.2 : rien en attente avant un export
  if (!derniersResultats) recalculer();
  genererPDF(state, derniersResultats, BAC_DATA);
});

/* v1.1 — Partage par lien : l'état complet voyage dans l'URL (aucun serveur) */
document.getElementById("btn-partager").addEventListener("click", async () => {
  const lien = storage.versLien(state);
  const feedback = document.getElementById("partage-feedback");
  try {
    await navigator.clipboard.writeText(lien);
    feedback.textContent = "✓ Lien copié ! Colle-le dans un message pour partager ta simulation.";
  } catch {
    // Presse-papier indisponible (permissions) : on affiche le lien
    feedback.textContent = lien;
  }
  feedback.hidden = false;
});

/* v1.1 — Épinglage de la moyenne du jour (suivi dans le temps).
   Un point par jour maximum : ré-épingler remplace le point du jour. */
function epingler(automatique = false) {
  if (!derniersResultats) return;
  const moyenne = derniersResultats.synthese.moyenneProjetee;
  if (moyenne === null) return; // rien à épingler sans aucune note

  const aujourdHui = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
  const dernier = state.historique[state.historique.length - 1];
  if (dernier && dernier.date === aujourdHui) {
    if (automatique) return;            // l'auto n'écrase pas le point du jour
    dernier.moyenne = Math.round(moyenne * 100) / 100;
  } else {
    state.historique.push({ date: aujourdHui, moyenne: Math.round(moyenne * 100) / 100 });
    if (state.historique.length > 120) state.historique.shift(); // borne mémoire
  }
  storage.save(state);
  if (state.ui.ecranCourant === "dashboard") {
    ui.renderDashboard(state, derniersResultats, BAC_DATA);
  }
}

document.getElementById("btn-epingler").addEventListener("click", () => epingler(false));

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
ui.initMicroInteractions();       // v1.2 : onde au clic (délégation globale)
ui.initModaleGraphiques();
ui.initCibles(state, BAC_DATA, recalculer);   // v1.1 : notes cibles (une fois)
ui.renderSpecialites(state, BAC_DATA, reconstruireParcours);
reconstruireParcours();          // options + notes + premier calcul
epingler(true);                  // v1.1 : un point d'historique par jour, auto
afficherEcran(etatPartage ? "resultats" : "accueil"); // lien partagé → résultats
