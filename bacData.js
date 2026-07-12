/* ============================================================================
   Bac Simulator — bacData.js
   ----------------------------------------------------------------------------
   ✅ SOURCE UNIQUE DE VÉRITÉ RÉGLEMENTAIRE — baccalauréat GÉNÉRAL, session 2027.

   Toutes les données officielles vivent ici : coefficients, matières,
   spécialités, options, mentions, règles d'arrondi, académies.
   Si la réglementation évolue, SEUL ce fichier doit être modifié
   (procédure : README.md § « Modifier les coefficients »).

   Références :
   - Arrêté du 16 juillet 2018 modifié (épreuves du baccalauréat général)
   - Décret n° 2025-513 et arrêté du 10 juin 2025 : épreuve anticipée de
     mathématiques (coef 2) et Grand oral ramené à coef 8, dès la session 2027
   - Arrêtés de 2021/2022 : contrôle continu intégral ; chaque enseignement
     optionnel = coef 2 par année, AJOUTÉ au total des coefficients
   - Contrôle continu : moyenne annuelle arrondie au dixième de point supérieur

   Total hors options : 100 = 40 (contrôle continu) + 60 (épreuves terminales).
   ============================================================================ */

export const BAC_DATA = {
  session: 2027,

  /* --------------------------------------------------------------------------
     ÉPREUVES TERMINALES (60 coefficients)
     `annee`  : "premiere" = épreuve anticipée déjà passée par l'utilisateur
                "terminale" = épreuve à venir (cible des scénarios)
     Les intitulés de spe1/spe2 sont résolus dynamiquement d'après les
     spécialités conservées par l'élève (label: null → complété à l'exécution).
     ------------------------------------------------------------------------ */
  epreuvesTerminales: [
    { id: "fr-ecrit",   label: "Français — écrit",          coef: 5,  annee: "premiere"  },
    { id: "fr-oral",    label: "Français — oral",           coef: 5,  annee: "premiere"  },
    { id: "maths-ant",  label: "Mathématiques anticipées",  coef: 2,  annee: "premiere"  },
    { id: "spe1",       label: null,                        coef: 16, annee: "terminale" },
    { id: "spe2",       label: null,                        coef: 16, annee: "terminale" },
    { id: "philo",      label: "Philosophie",               coef: 8,  annee: "terminale" },
    { id: "grand-oral", label: "Grand oral",                coef: 8,  annee: "terminale" },
  ],

  /* --------------------------------------------------------------------------
     CONTRÔLE CONTINU (40 coefficients) — moyennes annuelles de bulletin
     coefPremiere / coefTerminale : répartition officielle par année.
     L'enseignement scientifique intègre les mathématiques spécifiques pour
     les élèves sans spécialité maths (une seule ligne de note au bulletin).
     ------------------------------------------------------------------------ */
  controleContinu: [
    { id: "hg",             label: "Histoire-géographie",       coefPremiere: 3, coefTerminale: 3 },
    { id: "lva",            label: "Langue vivante A",          coefPremiere: 3, coefTerminale: 3 },
    { id: "lvb",            label: "Langue vivante B",          coefPremiere: 3, coefTerminale: 3 },
    { id: "es",             label: "Enseignement scientifique", coefPremiere: 3, coefTerminale: 3 },
    { id: "eps",            label: "EPS",                       coefPremiere: 0, coefTerminale: 6 },
    { id: "emc",            label: "EMC",                       coefPremiere: 1, coefTerminale: 1 },
    /* La spécialité abandonnée en fin de Première : label résolu dynamiquement */
    { id: "spe-abandonnee", label: null,                        coefPremiere: 8, coefTerminale: 0 },
  ],

  /* --------------------------------------------------------------------------
     LES 13 SPÉCIALITÉS du bac général (ordre alphabétique d'affichage)
     ------------------------------------------------------------------------ */
  specialites: [
    { id: "arts",              label: "Arts" },
    { id: "biologie-ecologie", label: "Biologie-écologie (lycées agricoles)" },
    { id: "eppcs",             label: "EPS, pratiques et culture sportives (EPPCS)" },
    { id: "hggsp",             label: "Histoire-géo, géopolitique et sciences politiques (HGGSP)" },
    { id: "hlp",               label: "Humanités, littérature et philosophie (HLP)" },
    { id: "lca",               label: "Langues et cultures de l'Antiquité (LCA)" },
    { id: "llcer",             label: "Langues, littératures et cultures étrangères (LLCER)" },
    { id: "maths",             label: "Mathématiques" },
    { id: "nsi",               label: "Numérique et sciences informatiques (NSI)" },
    { id: "physique-chimie",   label: "Physique-chimie" },
    { id: "ses",               label: "Sciences économiques et sociales (SES)" },
    { id: "si",                label: "Sciences de l'ingénieur" },
    { id: "svt",               label: "Sciences de la vie et de la Terre (SVT)" },
  ],

  /* --------------------------------------------------------------------------
     ENSEIGNEMENTS OPTIONNELS
     `annees`    : années où l'option peut être suivie
     `condition` : contrainte réglementaire, vérifiée par calculator.js
                   - "speMathsConservee"  → nécessite la spé maths en Terminale
                   - "speMathsAbandonnee" → nécessite d'avoir abandonné la spé maths
     `lca: true` : latin/grec, peuvent être suivis EN PLUS des plafonds d'options
     ------------------------------------------------------------------------ */
  options: [
    { id: "arts-plastiques",       label: "Arts plastiques",       annees: ["premiere", "terminale"] },
    { id: "cinema",                label: "Cinéma-audiovisuel",    annees: ["premiere", "terminale"] },
    { id: "danse",                 label: "Danse",                 annees: ["premiere", "terminale"] },
    { id: "dgemc",                 label: "Droit et grands enjeux du monde contemporain (DGEMC)", annees: ["terminale"] },
    { id: "eps-option",            label: "EPS (option)",          annees: ["premiere", "terminale"] },
    { id: "grec",                  label: "Grec ancien",           annees: ["premiere", "terminale"], lca: true },
    { id: "histoire-arts",         label: "Histoire des arts",     annees: ["premiere", "terminale"] },
    { id: "latin",                 label: "Latin",                 annees: ["premiere", "terminale"], lca: true },
    { id: "lvc",                   label: "Langue vivante C",      annees: ["premiere", "terminale"] },
    { id: "maths-complementaires", label: "Mathématiques complémentaires", annees: ["terminale"], condition: "speMathsAbandonnee" },
    { id: "maths-expertes",        label: "Mathématiques expertes",        annees: ["terminale"], condition: "speMathsConservee" },
    { id: "musique",               label: "Musique",               annees: ["premiere", "terminale"] },
    { id: "theatre",               label: "Théâtre",               annees: ["premiere", "terminale"] },
  ],

  /* Coefficient d'une option : 2 par année suivie, AJOUTÉ au total. */
  optionCoefParAnnee: 2,

  /* --------------------------------------------------------------------------
     MENTIONS — seuils officiels sur la moyenne finale /20.
     Parcourues de haut en bas : la première dont le seuil est atteint gagne.
     ------------------------------------------------------------------------ */
  mentions: [
    { seuil: 16, id: "tb",         label: "Très Bien",  court: "TB" },
    { seuil: 14, id: "b",          label: "Bien",       court: "B" },
    { seuil: 12, id: "ab",         label: "Assez Bien", court: "AB" },
    { seuil: 10, id: "admis",      label: "Admis",      court: "Admis" },
    { seuil: 8,  id: "rattrapage", label: "Rattrapage (2d groupe)", court: "Rattr." },
    { seuil: 0,  id: "ajourne",    label: "Ajourné",    court: "Ajourné" },
  ],
  /* À partir de 18, le jury peut décerner ses félicitations. */
  seuilFelicitations: 18,

  /* --------------------------------------------------------------------------
     INDICE DE FAISABILITÉ (estimation indicative — voir CONCEPTION.md § 4.5)
     `delta` = note uniforme requise − moyenne actuelle de l'élève.
     Parcouru de haut en bas : premier palier tel que delta ≤ deltaMax.
     ------------------------------------------------------------------------ */
  faisabilite: [
    { deltaMax: -2,       valeur: 95 },
    { deltaMax: 0,        valeur: 80 },
    { deltaMax: 1,        valeur: 60 },
    { deltaMax: 2,        valeur: 40 },
    { deltaMax: 3,        valeur: 20 },
    { deltaMax: Infinity, valeur: 8  },
  ],

  /* --------------------------------------------------------------------------
     LES 30 ACADÉMIES (ordre alphabétique)
     ------------------------------------------------------------------------ */
  academies: [
    "Aix-Marseille", "Amiens", "Besançon", "Bordeaux", "Clermont-Ferrand",
    "Corse", "Créteil", "Dijon", "Grenoble", "Guadeloupe", "Guyane",
    "La Réunion", "Lille", "Limoges", "Lyon", "Martinique", "Mayotte",
    "Montpellier", "Nancy-Metz", "Nantes", "Nice", "Normandie",
    "Orléans-Tours", "Paris", "Poitiers", "Reims", "Rennes", "Strasbourg",
    "Toulouse", "Versailles",
  ],

  /* --------------------------------------------------------------------------
     RÈGLES DIVERSES
     ------------------------------------------------------------------------ */
  regles: {
    /* Arrondi des moyennes annuelles de contrôle continu */
    arrondiCC: "dixiemeSuperieur",
    /* Somme maximale des coefficients d'options sur le cycle terminal */
    plafondCoefOptions: 14,
    /* Bornes de saisie des notes */
    noteMin: 0,
    noteMax: 20,
    /* Plancher « réaliste » utilisé par les scénarios (jamais viser 0/20) */
    plancherScenario: 5,
  },
};
