/* ============================================================================
   Bac Simulator — tests.js
   ----------------------------------------------------------------------------
   SUITE DE TESTS DU MOTEUR DE CALCUL (calculator.js + bacData.js).
   Aucune dépendance : mini-framework d'assertions maison.

   Deux façons de l'exécuter :
   1. Navigateur : ouvrir tests.html (via le serveur local) → rapport visuel.
   2. Node :  node --input-type=module -e "import('./tests.js').then(m => m.afficherConsole())"

   Ces tests protègent le moteur lors des évolutions futures (notamment les
   changements de coefficients dans bacData.js).
   ============================================================================ */

import { BAC_DATA } from "./bacData.js";
import {
  arrondiDixiemeSuperieur, parseNote, normaliserNote,
  buildGrille, validerParcours, calculerSynthese, mentionPour,
  notesMinimales, genererScenarios, indiceFaisabilite, calculerTout,
  simulerRattrapage, oralsRattrapage,
} from "./calculator.js";

/* ----------------------------------------------------------------------------
   Mini-framework d'assertions
   --------------------------------------------------------------------------- */
const resultats = [];

function test(nom, fonction) {
  try {
    fonction();
    resultats.push({ nom, ok: true });
  } catch (erreur) {
    resultats.push({ nom, ok: false, message: erreur.message });
  }
}

function egal(obtenu, attendu, precision = 0) {
  const ok = precision > 0
    ? Math.abs(obtenu - attendu) <= precision
    : obtenu === attendu;
  if (!ok) throw new Error(`attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`);
}

/* ----------------------------------------------------------------------------
   État de référence : élève « Léa », spés maths / PC / SVT (SVT abandonnée),
   sans option. Toutes les valeurs vérifiables à la main (voir commentaires).
   --------------------------------------------------------------------------- */
function etatReference() {
  return {
    profil: { objectif: 14 },
    specialites: { choisies: ["maths", "physique-chimie", "svt"], abandonnee: "svt" },
    options: { premiere: [], terminale: [] },
    notes: {
      /* Épreuves anticipées : 13×5 + 15×5 + 12×2 = 164 points (coef 12) */
      epreuves: { "fr-ecrit": 13, "fr-oral": 15, "maths-ant": 12,
                  spe1: null, spe2: null, philo: null, "grand-oral": null },
      /* CC Première : 14×3 + 13×3 + 12×3 + 14×3 + 15×1 + 12×8 = 270 (coef 21) */
      ccPremiere:  { hg: 14, lva: 13, lvb: 12, es: 14, emc: 15, "spe-abandonnee": 12 },
      /* CC Terminale (hypothèses) : 14×3+13×3+12×3+14×3+15×1+14×6 = 258 (coef 19) */
      ccTerminale: { hg: 14, lva: 13, lvb: 12, es: 14, emc: 15, eps: 14 },
    },
  };
}

/* ============================================================================
   TESTS
   ============================================================================ */

/* --- 1. Outils numériques ------------------------------------------------ */
test("Arrondi au dixième supérieur : 13,61 → 13,7", () => egal(arrondiDixiemeSuperieur(13.61), 13.7));
test("Arrondi au dixième supérieur : 13,7 reste 13,7 (pas d'erreur binaire)", () => egal(arrondiDixiemeSuperieur(13.7), 13.7));
test("Arrondi au dixième supérieur : entier inchangé", () => egal(arrondiDixiemeSuperieur(12), 12));

test("parseNote accepte la virgule française", () => egal(parseNote("13,5", BAC_DATA.regles), 13.5));
test("parseNote rejette le vide", () => egal(parseNote("", BAC_DATA.regles), null));
test("parseNote rejette hors bornes (25)", () => egal(parseNote("25", BAC_DATA.regles), null));
test("parseNote rejette le non-numérique", () => egal(parseNote("abc", BAC_DATA.regles), null));

test("Trimestres 13/14/14 → moyenne 13,67 arrondie à 13,7 (CC)", () =>
  egal(normaliserNote({ t1: 13, t2: 14, t3: 14 }, true, BAC_DATA.regles), 13.7));
test("Trimestres partiels (2 sur 3) acceptés", () =>
  egal(normaliserNote({ t1: 12, t2: 14 }, true, BAC_DATA.regles), 13));

/* --- 2. Grille & coefficients --------------------------------------------- */
test("Coefficient total sans option = 100", () => {
  const synthese = calculerSynthese(buildGrille(etatReference(), BAC_DATA), BAC_DATA);
  egal(synthese.coefTotal, 100);
});

test("Latin en 1re + Terminale → coefficient total 104", () => {
  const etat = etatReference();
  etat.options = { premiere: ["latin"], terminale: ["latin"] };
  const synthese = calculerSynthese(buildGrille(etat, BAC_DATA), BAC_DATA);
  egal(synthese.coefTotal, 104);
});

test("La spécialité abandonnée apparaît en CC coef 8, pas en épreuve", () => {
  const grille = buildGrille(etatReference(), BAC_DATA);
  const cc = grille.find((l) => l.id === "spe-abandonnee@premiere");
  egal(cc.coef, 8);
  const labels = grille.filter((l) => l.id === "spe1" || l.id === "spe2").map((l) => l.label);
  egal(labels.some((l) => l.includes("SVT")), false);
});

test("Aucune matière hors parcours dans la grille (19 lignes attendues)", () => {
  // 7 épreuves + 12 lignes de CC : HG, LVA, LVB, ens. scientifique et EMC
  // comptent sur les 2 années (5×2 = 10), l'EPS uniquement en Terminale (1),
  // la spé abandonnée uniquement en Première (1) → 7 + 10 + 1 + 1 = 19
  egal(buildGrille(etatReference(), BAC_DATA).length, 19);
});

/* --- 3. Validation du parcours -------------------------------------------- */
test("2 spécialités seulement → erreur", () => {
  const etat = etatReference();
  etat.specialites.choisies = ["maths", "svt"];
  egal(validerParcours(etat, BAC_DATA).length > 0, true);
});

test("Maths complémentaires interdite si la spé maths est conservée", () => {
  const etat = etatReference(); // maths conservée (SVT abandonnée)
  etat.options.terminale = ["maths-complementaires"];
  egal(validerParcours(etat, BAC_DATA).length > 0, true);
});

test("Maths expertes autorisée si la spé maths est conservée", () => {
  const etat = etatReference();
  etat.options.terminale = ["maths-expertes"];
  egal(validerParcours(etat, BAC_DATA).length, 0);
});

/* --- 4. Synthèse ----------------------------------------------------------- */
test("Points acquis = 434 (164 d'épreuves + 270 de bulletins de 1re)", () => {
  const synthese = calculerSynthese(buildGrille(etatReference(), BAC_DATA), BAC_DATA);
  egal(synthese.pointsAcquis, 434, 0.001);
});

test("Moyenne actuelle = 434/33 ≈ 13,15", () => {
  const synthese = calculerSynthese(buildGrille(etatReference(), BAC_DATA), BAC_DATA);
  egal(synthese.moyenneActuelle, 13.1515, 0.001);
});

test("Moyenne projetée = (434+258)/52 ≈ 13,31", () => {
  const synthese = calculerSynthese(buildGrille(etatReference(), BAC_DATA), BAC_DATA);
  egal(synthese.moyenneProjetee, 13.3077, 0.001);
});

test("Élève parfait : moyenne finale max = 20, mention Très Bien", () => {
  const etat = etatReference();
  for (const cle of Object.keys(etat.notes.epreuves))   etat.notes.epreuves[cle] = 20;
  for (const cle of Object.keys(etat.notes.ccPremiere)) etat.notes.ccPremiere[cle] = 20;
  for (const cle of Object.keys(etat.notes.ccTerminale)) etat.notes.ccTerminale[cle] = 20;
  const synthese = calculerSynthese(buildGrille(etat, BAC_DATA), BAC_DATA);
  egal(synthese.moyenneProjetee, 20, 0.001);
  egal(mentionPour(synthese.moyenneProjetee, BAC_DATA).id, "tb");
});

/* --- 5. Mentions ------------------------------------------------------------ */
test("Mentions : 13,99 → AB ; 14 → B ; 9 → rattrapage ; 7 → ajourné", () => {
  egal(mentionPour(13.99, BAC_DATA).id, "ab");
  egal(mentionPour(14, BAC_DATA).id, "b");
  egal(mentionPour(9, BAC_DATA).id, "rattrapage");
  egal(mentionPour(7, BAC_DATA).id, "ajourne");
});

/* --- 6. Objectif & note uniforme -------------------------------------------- */
test("Objectif 14 → note uniforme (1400−692)/48 = 14,75", () => {
  const min = notesMinimales(14, buildGrille(etatReference(), BAC_DATA), BAC_DATA);
  egal(min.noteUniforme, 14.75, 0.001);
  egal(min.accessible, true);
  egal(min.lignesSupposees.length, 0); // tout est renseigné : aucune hypothèse auto
});

test("Objectif 20 → mathématiquement inaccessible pour l'élève de référence", () => {
  const min = notesMinimales(20, buildGrille(etatReference(), BAC_DATA), BAC_DATA);
  egal(min.accessible, false);
});

test("Épreuves cibles = spé 1 + spé 2 + philo + Grand oral (coef 48)", () => {
  const min = notesMinimales(14, buildGrille(etatReference(), BAC_DATA), BAC_DATA);
  egal(min.coefCibles, 48);
  egal(min.epreuvesCibles.length, 4);
});

/* --- 7. Scénarios ------------------------------------------------------------ */
test("Scénario équilibré : 14,8 partout, somme de points exacte", () => {
  const grille = buildGrille(etatReference(), BAC_DATA);
  const min = notesMinimales(14, grille, BAC_DATA);
  const synthese = calculerSynthese(grille, BAC_DATA);
  const scenarios = genererScenarios(min, synthese, BAC_DATA);
  const equilibre = scenarios.find((s) => s.id === "equilibre");
  egal(equilibre.notes.every((n) => n.note === 14.8), true);
  // Vérification de la somme (aux arrondis d'affichage près)
  const somme = equilibre.notes.reduce((s, n) => s + n.note * n.coef, 0);
  egal(somme >= min.pointsNecessaires - 0.05, true);
});

test("Scénario « spécialités d'abord » : spés au-dessus de la philo", () => {
  const grille = buildGrille(etatReference(), BAC_DATA);
  const min = notesMinimales(14, grille, BAC_DATA);
  const scenarios = genererScenarios(min, calculerSynthese(grille, BAC_DATA), BAC_DATA);
  const spes = scenarios.find((s) => s.id === "spes");
  const noteSpe = spes.notes.find((n) => n.id === "spe1").note;
  const notePhilo = spes.notes.find((n) => n.id === "philo").note;
  egal(noteSpe > notePhilo, true);
});

test("Les notes de scénario restent bornées à 20", () => {
  const etat = etatReference();
  etat.profil.objectif = 16; // objectif exigeant → risque de saturation
  const { scenarios } = calculerTout(etat, BAC_DATA);
  for (const scenario of scenarios) {
    if (!scenario.notes) continue;
    egal(scenario.notes.every((n) => n.note <= 20), true);
  }
});

/* --- 8. Faisabilité ----------------------------------------------------------- */
test("Faisabilité objectif 14 : écart 1,6 → palier 40 %", () => {
  const grille = buildGrille(etatReference(), BAC_DATA);
  const min = notesMinimales(14, grille, BAC_DATA);
  const synthese = calculerSynthese(grille, BAC_DATA);
  egal(indiceFaisabilite(min, synthese, BAC_DATA), 40);
});

test("Faisabilité : objectif inaccessible → 0 %", () => {
  const grille = buildGrille(etatReference(), BAC_DATA);
  const min = notesMinimales(20, grille, BAC_DATA);
  egal(indiceFaisabilite(min, calculerSynthese(grille, BAC_DATA), BAC_DATA), 0);
});

/* --- 9. Point d'entrée global --------------------------------------------------- */
test("calculerTout : structure complète, sans erreur de parcours", () => {
  const tout = calculerTout(etatReference(), BAC_DATA);
  egal(tout.erreurs.length, 0);
  egal(Array.isArray(tout.grille), true);
  egal(tout.scenarios.length, 4);
  egal(tout.conseils.length > 0, true);
});

/* --- 10. Rattrapage (2d groupe) — v1.1 ------------------------------------ */

/** Élève « à 9 partout » : moyenne 9, il manque 100 points (coef 100). */
function etatNeuf() {
  const etat = etatReference();
  for (const cle of Object.keys(etat.notes.epreuves))    etat.notes.epreuves[cle] = 9;
  for (const cle of Object.keys(etat.notes.ccPremiere))  etat.notes.ccPremiere[cle] = 9;
  for (const cle of Object.keys(etat.notes.ccTerminale)) etat.notes.ccTerminale[cle] = 9;
  return etat;
}

test("Rattrapage : élève à 9/20 → concerné, 100 points manquants", () => {
  const r = simulerRattrapage(buildGrille(etatNeuf(), BAC_DATA), BAC_DATA);
  egal(r.concerne, true);
  egal(r.pointsManquants, 100, 0.001);
  egal(r.matieres.length, 4); // français écrit, philo, spé 1, spé 2
});

test("Rattrapage : une spé seule (coef 16) exige 9 + 100/16 = 15,25 à l'oral", () => {
  const r = simulerRattrapage(buildGrille(etatNeuf(), BAC_DATA), BAC_DATA);
  const spe = r.matieres.find((m) => m.id === "spe1");
  egal(spe.oralSeul, 15.25, 0.001);
  egal(spe.oralSeulFaisable, true);
});

test("Rattrapage : le français seul (coef 5) est infaisable (9 + 20 = 29)", () => {
  const r = simulerRattrapage(buildGrille(etatNeuf(), BAC_DATA), BAC_DATA);
  const fr = r.matieres.find((m) => m.id === "fr-ecrit");
  egal(fr.oralSeulFaisable, false);
});

test("Rattrapage : paire spé 1 + spé 2 → 12,2 à chaque oral (arrondi sup.)", () => {
  const r = simulerRattrapage(buildGrille(etatNeuf(), BAC_DATA), BAC_DATA);
  const paire = r.matieres.filter((m) => m.id === "spe1" || m.id === "spe2");
  const resultat = oralsRattrapage(paire, r.pointsManquants);
  egal(resultat.faisable, true);
  // 9 + 100/32 = 12,125 → arrondi prudent au dixième supérieur : 12,2
  egal(resultat.oraux[0].oral, 12.2, 0.001);
  egal(resultat.oraux[1].oral, 12.2, 0.001);
});

test("Rattrapage : saturation à 20 → l'effort bascule sur l'autre matière", () => {
  const paire = [
    { id: "philo", label: "Philosophie", coef: 8,  note: 18 },
    { id: "spe1",  label: "Maths",       coef: 16, note: 9 },
  ];
  const resultat = oralsRattrapage(paire, 100); // hausse égale : +100/24 ≈ 4,2 → philo > 20
  egal(resultat.faisable, true);
  egal(resultat.oraux[0].oral, 20, 0.001);            // philo plafonnée
  egal(resultat.oraux[1].oral, 14.3, 0.001);          // 9 + (100−16)/16 = 14,25 → 14,3
});

test("Rattrapage : élève à 13 → non concerné", () => {
  const r = simulerRattrapage(buildGrille(etatReference(), BAC_DATA), BAC_DATA);
  egal(r.concerne, false);
});

/* ============================================================================
   SORTIES
   ============================================================================ */

/** Résultats bruts (pour tests.html). */
export function obtenirResultats() {
  return resultats;
}

/** Affichage console (pour Node). Renvoie le nombre d'échecs. */
export function afficherConsole() {
  let echecs = 0;
  for (const r of resultats) {
    if (r.ok) {
      console.log(`  ✓ ${r.nom}`);
    } else {
      echecs++;
      console.error(`  ✗ ${r.nom} — ${r.message}`);
    }
  }
  console.log(`\n${resultats.length - echecs}/${resultats.length} tests réussis`);
  return echecs;
}
