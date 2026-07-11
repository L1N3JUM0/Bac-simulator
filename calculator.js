/* ============================================================================
   SimuBac — calculator.js
   ----------------------------------------------------------------------------
   MOTEUR DE CALCUL PUR : aucune manipulation du DOM, aucun accès au
   localStorage. Entrées (state + BAC_DATA) → sorties (résultats).
   Cette pureté rend le moteur testable indépendamment de l'interface.

   ÉTAPE 2 — fonctions prévues (voir CONCEPTION.md § 4) :
     buildGrille(state, data)        → lignes de notation {id, label, coef, statut}
     calculerSynthese(grille)        → moyenne, points acquis/projetés/restants, coef total
     mentionPour(moyenne, data)      → mention correspondant à une moyenne
     notesMinimales(objectif, ...)   → note uniforme requise par épreuve restante
     genererScenarios(...)           → équilibré / spés / grand oral / optimiste
     indiceFaisabilite(delta, data)  → estimation indicative (barème dans bacData)
     genererConseils(resultats)      → messages de l'assistant
   ============================================================================ */

// Étape 2 : implémentation du moteur.
export {};
