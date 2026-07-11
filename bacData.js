/* ============================================================================
   SimuBac — bacData.js
   ----------------------------------------------------------------------------
   ✅ SOURCE UNIQUE DE VÉRITÉ RÉGLEMENTAIRE.
   Toutes les données officielles du baccalauréat général (session 2027) sont
   centralisées ici : coefficients, matières, spécialités, options, mentions,
   règles d'arrondi, académies. Si la réglementation évolue, SEUL ce fichier
   doit être modifié (procédure détaillée dans le README).

   Références :
   - Arrêté du 16 juillet 2018 modifié (épreuves du bac général)
   - Décret n° 2025-513 et arrêté du 10 juin 2025 (épreuve anticipée de
     mathématiques, coef 2 ; Grand oral ramené à coef 8 — session 2027)
   - Contrôle continu : moyennes annuelles arrondies au dixième supérieur

   ÉTAPE 2 : ce fichier sera rempli avec la structure validée dans
   CONCEPTION.md (§ 3.1). Pour l'instant : export vide typé.
   ============================================================================ */

export const BAC_DATA = {
  session: 2027,
  epreuvesTerminales: [],   // Étape 2 — français ×2, maths anticipées, spés, philo, Grand oral
  controleContinu: [],      // Étape 2 — HG, LVA, LVB, ens. scientifique, EPS, EMC, spé abandonnée
  specialites: [],          // Étape 2 — les 13 spécialités
  options: [],              // Étape 2 — options + règles de compatibilité
  optionCoefParAnnee: 2,    // Coefficient ajouté au total, par option et par an
  mentions: [],             // Étape 2 — seuils 8/10/12/14/16 (+18 félicitations)
  academies: [],            // Étape 2 — liste officielle, ordre alphabétique
  regles: {
    arrondiCC: "dixiemeSuperieur",
    plafondCoefOptions: 14,
  },
};
