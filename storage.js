/* ============================================================================
   SimuBac — storage.js
   ----------------------------------------------------------------------------
   PERSISTANCE LOCALE (localStorage) : sauvegarde automatique de l'état,
   reprise de simulation, réinitialisation, versionnage du schéma pour
   permettre des migrations futures sans perdre les données des utilisateurs.

   Clé utilisée : "simubac.v1"
   Schéma de l'état : voir CONCEPTION.md § 3.2.

   ÉTAPE 3 — fonctions prévues :
     save(state)      → sérialise et enregistre (avec date de modification)
     load()           → relit, valide le schemaVersion, migre si besoin
     reset()          → efface après confirmation (déclenchée par ui.js)
     hasSave()        → true si une simulation existe (bouton « Reprendre »)
   ============================================================================ */

// Étape 3 : implémentation de la persistance.
export {};
