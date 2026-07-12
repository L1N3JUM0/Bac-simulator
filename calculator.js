/* ============================================================================
   Bac Simulator — calculator.js
   ----------------------------------------------------------------------------
   MOTEUR DE CALCUL PUR : aucune manipulation du DOM, aucun accès au
   localStorage. Entrées (state + BAC_DATA) → sorties (résultats).
   Cette pureté rend le moteur testable indépendamment (voir tests.html).

   Vocabulaire des statuts d'une ligne de notation :
     "acquis"  → note officielle (épreuve anticipée passée, bulletin de 1re)
     "projete" → hypothèse saisie pour la Terminale (bulletins ou épreuves)
     "avenir"  → aucune note saisie : compte dans les coefficients restants

   Forme de l'état attendu (produit par ui.js, persisté par storage.js) :
     state = {
       profil:      { objectif: 12, ... },
       specialites: { choisies: ["maths","physique-chimie","svt"], abandonnee: "svt" },
       options:     { premiere: ["latin"], terminale: ["latin","maths-expertes"] },
       notes: {
         epreuves:    { "fr-ecrit": 13, "fr-oral": 15, "maths-ant": 12,
                        "spe1": null, "spe2": null, "philo": null, "grand-oral": null },
         ccPremiere:  { hg: 14.5, es: {t1:13,t2:14,t3:14}, "spe-abandonnee": 12,
                        "opt-latin": 13, ... },
         ccTerminale: { hg: 14.5, ..., "opt-latin": null, ... },
       },
     }
   Une note vaut : un nombre, OU {t1,t2,t3} (trimestres, partiels acceptés),
   OU null/undefined (non renseignée).
   ============================================================================ */

/* ----------------------------------------------------------------------------
   1. OUTILS NUMÉRIQUES
   --------------------------------------------------------------------------- */

/** Epsilon anti-erreurs binaires (ex. 13.7×10 = 137.00000000000003). */
const EPS = 1e-9;

/**
 * Arrondit au dixième de point SUPÉRIEUR (règle officielle du contrôle
 * continu). Ex. : 13,61 → 13,7 ; 13,70 → 13,7.
 */
export function arrondiDixiemeSuperieur(valeur) {
  return Math.ceil(valeur * 10 - EPS) / 10;
}

/** Borne une note dans [noteMin, noteMax]. */
function borner(note, regles) {
  return Math.min(regles.noteMax, Math.max(regles.noteMin, note));
}

/**
 * Convertit une saisie utilisateur ("13,5", "14", "") en nombre ou null.
 * Accepte la virgule française. Rejette hors bornes et non-numérique.
 */
export function parseNote(texte, regles) {
  if (texte === null || texte === undefined) return null;
  const brut = String(texte).trim().replace(",", ".");
  if (brut === "") return null;
  const nombre = Number(brut);
  if (!Number.isFinite(nombre)) return null;
  if (nombre < regles.noteMin || nombre > regles.noteMax) return null;
  return nombre;
}

/**
 * Normalise une « note » de l'état vers un nombre ou null.
 * - nombre           → tel quel
 * - {t1,t2,t3}       → moyenne des trimestres renseignés
 * - null / undefined → null
 * `estCC` : applique l'arrondi officiel au dixième supérieur (bulletins).
 */
export function normaliserNote(note, estCC, regles) {
  if (note === null || note === undefined) return null;

  let valeur;
  if (typeof note === "number") {
    valeur = note;
  } else {
    // Mode « 3 trimestres » : moyenne des champs remplis (2/3 acceptés)
    const trimestres = [note.t1, note.t2, note.t3].filter(
      (t) => typeof t === "number" && Number.isFinite(t)
    );
    if (trimestres.length === 0) return null;
    valeur = trimestres.reduce((somme, t) => somme + t, 0) / trimestres.length;
  }

  valeur = borner(valeur, regles);
  return estCC ? arrondiDixiemeSuperieur(valeur) : valeur;
}

/* ----------------------------------------------------------------------------
   2. CONSTRUCTION DE LA GRILLE DE NOTATION
   Produit la liste exhaustive des lignes { id, label, coef, statut, note,
   categorie, annee } pour LE parcours de l'élève. Aucune matière hors
   parcours n'apparaît (exigence du cahier des charges).
   --------------------------------------------------------------------------- */

/** Renvoie le label d'une spécialité à partir de son id. */
function labelSpecialite(id, data) {
  const spe = data.specialites.find((s) => s.id === id);
  return spe ? spe.label : (id || "Spécialité (à choisir)");
}

/** Renvoie le label d'une option à partir de son id. */
function labelOption(id, data) {
  const opt = data.options.find((o) => o.id === id);
  return opt ? opt.label : id;
}

/**
 * Construit la grille complète de notation.
 * @returns {Array} lignes de notation
 */
export function buildGrille(state, data) {
  const { regles } = data;
  const grille = [];
  const spesConservees = state.specialites.choisies.filter(
    (id) => id !== state.specialites.abandonnee
  );

  /* --- Épreuves terminales -------------------------------------------- */
  for (const ep of data.epreuvesTerminales) {
    // Résolution des labels dynamiques spe1/spe2
    let label = ep.label;
    if (ep.id === "spe1") label = labelSpecialite(spesConservees[0], data);
    if (ep.id === "spe2") label = labelSpecialite(spesConservees[1], data);

    const note = normaliserNote(state.notes.epreuves[ep.id], false, regles);
    grille.push({
      id: ep.id,
      label,
      coef: ep.coef,
      annee: ep.annee,
      categorie: "epreuve",
      note,
      // Épreuve de 1re avec note = acquis ; de Terminale avec note = hypothèse
      statut: note === null ? "avenir" : ep.annee === "premiere" ? "acquis" : "projete",
    });
  }

  /* --- Contrôle continu (une ligne par matière ET par année) ----------- */
  for (const cc of data.controleContinu) {
    const label =
      cc.id === "spe-abandonnee"
        ? `${labelSpecialite(state.specialites.abandonnee, data)} (spé abandonnée)`
        : cc.label;

    if (cc.coefPremiere > 0) {
      const note = normaliserNote(state.notes.ccPremiere[cc.id], true, regles);
      grille.push({
        id: `${cc.id}@premiere`, label, coef: cc.coefPremiere,
        annee: "premiere", categorie: "cc", note,
        statut: note === null ? "avenir" : "acquis",
      });
    }
    if (cc.coefTerminale > 0) {
      const note = normaliserNote(state.notes.ccTerminale[cc.id], true, regles);
      grille.push({
        id: `${cc.id}@terminale`, label, coef: cc.coefTerminale,
        annee: "terminale", categorie: "cc", note,
        statut: note === null ? "avenir" : "projete",
      });
    }
  }

  /* --- Options : coef 2 par année suivie, ajouté au total --------------- */
  for (const annee of ["premiere", "terminale"]) {
    for (const idOption of state.options[annee]) {
      const cle = `opt-${idOption}`;
      const source = annee === "premiere" ? state.notes.ccPremiere : state.notes.ccTerminale;
      const note = normaliserNote(source[cle], true, regles);
      grille.push({
        id: `${cle}@${annee}`,
        label: `${labelOption(idOption, data)} (option)`,
        coef: data.optionCoefParAnnee,
        annee, categorie: "option", note,
        statut: note === null ? "avenir" : annee === "premiere" ? "acquis" : "projete",
      });
    }
  }

  return grille;
}

/* ----------------------------------------------------------------------------
   3. VALIDATION DU PARCOURS (règles réglementaires de choix)
   Renvoie une liste de messages d'erreur ; vide = parcours valide.
   --------------------------------------------------------------------------- */
export function validerParcours(state, data) {
  const erreurs = [];
  const { choisies, abandonnee } = state.specialites;

  if (choisies.length !== 3) erreurs.push("Choisis exactement 3 spécialités de Première.");
  if (abandonnee && !choisies.includes(abandonnee))
    erreurs.push("La spécialité abandonnée doit faire partie des 3 choisies.");

  const speMathsConservee = choisies.includes("maths") && abandonnee !== "maths";
  const speMathsAbandonnee = abandonnee === "maths";

  // Conditions réglementaires des options
  for (const annee of ["premiere", "terminale"]) {
    for (const idOption of state.options[annee]) {
      const opt = data.options.find((o) => o.id === idOption);
      if (!opt) continue;
      if (!opt.annees.includes(annee))
        erreurs.push(`L'option « ${opt.label} » n'existe pas en ${annee === "premiere" ? "Première" : "Terminale"}.`);
      if (opt.condition === "speMathsConservee" && !speMathsConservee)
        erreurs.push(`« ${opt.label} » nécessite de conserver la spécialité maths en Terminale.`);
      if (opt.condition === "speMathsAbandonnee" && !speMathsAbandonnee)
        erreurs.push(`« ${opt.label} » nécessite d'avoir abandonné la spécialité maths.`);
    }
  }

  // Plafonds : 1 option en 1re, 2 en Terminale (hors LCA), coef total ≤ 14
  const horsLCA = (annee) =>
    state.options[annee].filter((id) => {
      const opt = data.options.find((o) => o.id === id);
      return opt && !opt.lca;
    }).length;
  if (horsLCA("premiere") > 1) erreurs.push("1 option maximum en Première (hors latin/grec).");
  if (horsLCA("terminale") > 2) erreurs.push("2 options maximum en Terminale (hors latin/grec).");

  const coefOptions =
    (state.options.premiere.length + state.options.terminale.length) * data.optionCoefParAnnee;
  if (coefOptions > data.regles.plafondCoefOptions)
    erreurs.push(`Le total des coefficients d'options dépasse ${data.regles.plafondCoefOptions}.`);

  return erreurs;
}

/* ----------------------------------------------------------------------------
   4. SYNTHÈSE : moyennes, points, coefficients, mentions
   --------------------------------------------------------------------------- */

/** Mention correspondant à une moyenne (ou null si moyenne inconnue). */
export function mentionPour(moyenne, data) {
  if (moyenne === null || moyenne === undefined) return null;
  return data.mentions.find((m) => moyenne >= m.seuil - EPS) || null;
}

/**
 * Calcule toutes les grandeurs affichées en permanence.
 * @param {Array} grille - sortie de buildGrille()
 */
export function calculerSynthese(grille, data) {
  let coefTotal = 0;
  let pointsAcquis = 0,  coefAcquis = 0;
  let pointsProjetes = 0, coefProjetes = 0;
  let coefAVenir = 0;

  for (const ligne of grille) {
    coefTotal += ligne.coef;
    if (ligne.statut === "acquis")       { pointsAcquis   += ligne.note * ligne.coef; coefAcquis   += ligne.coef; }
    else if (ligne.statut === "projete") { pointsProjetes += ligne.note * ligne.coef; coefProjetes += ligne.coef; }
    else                                 { coefAVenir     += ligne.coef; }
  }

  // Moyenne « au mérite actuel » : uniquement sur ce qui est acquis
  const moyenneActuelle = coefAcquis > 0 ? pointsAcquis / coefAcquis : null;

  // Moyenne projetée : acquis + hypothèses (les coefs « à venir » sont exclus
  // du dénominateur tant qu'aucune note n'est saisie)
  const coefRenseigne = coefAcquis + coefProjetes;
  const moyenneProjetee =
    coefRenseigne > 0 ? (pointsAcquis + pointsProjetes) / coefRenseigne : null;

  // Bornes atteignables sur la note FINALE (dénominateur = coef total) :
  // plancher garanti (tout le reste à 0) et plafond (tout le reste à 20).
  // Seuls les points ACQUIS sont certains, les hypothèses ne le sont pas.
  const moyenneFinaleMin = pointsAcquis / coefTotal;
  const moyenneFinaleMax = (pointsAcquis + 20 * (coefTotal - coefAcquis)) / coefTotal;

  return {
    coefTotal,
    pointsAcquis, coefAcquis,
    pointsProjetes, coefProjetes,
    coefAVenir,
    pointsRestantsMax: 20 * (coefTotal - coefAcquis),
    moyenneActuelle,
    moyenneProjetee,
    moyenneFinaleMin,
    moyenneFinaleMax,
    mentionActuelle: mentionPour(moyenneProjetee, data),
    meilleureMentionPossible: mentionPour(moyenneFinaleMax, data),
    felicitationsPossibles: moyenneFinaleMax >= data.seuilFelicitations - EPS,
  };
}

/* ----------------------------------------------------------------------------
   5. OBJECTIF : note uniforme requise sur les épreuves de Terminale
   ---------------------------------------------------------------------------
   Principe (CONCEPTION.md § 4.3) : les inconnues du calcul sont les 4 épreuves
   de Terminale (spé 1, spé 2, philo, Grand oral). Toute AUTRE ligne sans note
   (ex. bulletin de Terminale non estimé) est provisoirement supposée égale à
   la moyenne actuelle de l'élève — ces lignes sont listées dans
   `lignesSupposees` pour que l'interface puisse le signaler clairement.
   --------------------------------------------------------------------------- */
export function notesMinimales(objectif, grille, data) {
  const epreuvesCibles = grille.filter(
    (l) => l.categorie === "epreuve" && l.annee === "terminale"
  );
  const coefCibles = epreuvesCibles.reduce((somme, l) => somme + l.coef, 0);

  let pointsFixes = 0;
  let coefTotal = 0;
  const lignesSupposees = [];
  const hypotheseDefaut = defautHypothese(grille);

  for (const ligne of grille) {
    coefTotal += ligne.coef;
    if (epreuvesCibles.includes(ligne)) continue; // inconnues du problème
    if (ligne.note !== null) {
      pointsFixes += ligne.note * ligne.coef;
    } else {
      // Ligne non renseignée hors épreuves cibles : hypothèse par défaut
      pointsFixes += hypotheseDefaut * ligne.coef;
      lignesSupposees.push({ id: ligne.id, label: ligne.label, annee: ligne.annee });
    }
  }

  const pointsNecessaires = objectif * coefTotal - pointsFixes;
  const noteUniforme = pointsNecessaires / coefCibles;

  return {
    objectif,
    noteUniforme,                                   // peut être < 0 ou > 20
    accessible: noteUniforme <= 20 + EPS,           // false = impossible
    dejaGaranti: noteUniforme <= 0 + EPS,           // true  = objectif assuré
    pointsNecessaires: Math.max(0, pointsNecessaires),
    coefCibles,
    epreuvesCibles: epreuvesCibles.map((l) => ({ id: l.id, label: l.label, coef: l.coef })),
    lignesSupposees,
    hypotheseDefaut,
  };
}

/** Hypothèse par défaut pour une ligne non renseignée : moyenne actuelle,
    à défaut 10/20 (aucune donnée disponible). */
function defautHypothese(grille) {
  let points = 0, coefs = 0;
  for (const l of grille) {
    if (l.statut === "acquis") { points += l.note * l.coef; coefs += l.coef; }
  }
  return coefs > 0 ? points / coefs : 10;
}

/* ----------------------------------------------------------------------------
   6. SCÉNARIOS
   ---------------------------------------------------------------------------
   Chaque scénario part de la note uniforme et applique des écarts (deltas)
   par épreuve, puis la fonction `resoudre` redistribue itérativement pour
   que la somme de points soit EXACTEMENT atteinte malgré les bornes
   [plancher, 20] (si une note sature, l'excédent se reporte sur les autres).
   --------------------------------------------------------------------------- */

/**
 * Résout un scénario : trouve des notes n_i ∈ [plancher, 20] telles que
 * Σ n_i·c_i = pointsNecessaires, les plus proches possibles de u + delta_i.
 * @returns {Array|null} [{id, label, coef, note}] ou null si infaisable
 */
function resoudre(pointsNecessaires, epreuves, deltas, regles) {
  const plancher = regles.plancherScenario;
  const cible = epreuves.map((ep) => ({
    ...ep,
    note: 0, // rempli ci-dessous
    pref: deltas[ep.id] || 0,
  }));

  // Point de départ : note uniforme + delta, bornée
  const coefTotal = cible.reduce((s, e) => s + e.coef, 0);
  const uniforme = pointsNecessaires / coefTotal;
  for (const e of cible) e.note = Math.min(20, Math.max(plancher, uniforme + e.pref));

  // Redistribution itérative de l'écart résiduel sur les notes non saturées
  for (let iteration = 0; iteration < 50; iteration++) {
    const somme = cible.reduce((s, e) => s + e.note * e.coef, 0);
    const residu = pointsNecessaires - somme;
    if (Math.abs(residu) < 0.005) break;

    // Notes encore ajustables dans la direction du résidu
    const libres = cible.filter((e) =>
      residu > 0 ? e.note < 20 - EPS : e.note > plancher + EPS
    );
    if (libres.length === 0) return null; // saturation totale : infaisable

    const coefLibres = libres.reduce((s, e) => s + e.coef, 0);
    const ajustement = residu / coefLibres;
    for (const e of libres) {
      e.note = Math.min(20, Math.max(plancher, e.note + ajustement));
    }
  }

  // Vérification finale de faisabilité
  const total = cible.reduce((s, e) => s + e.note * e.coef, 0);
  if (total < pointsNecessaires - 0.05) return null;

  return cible.map(({ id, label, coef, note }) => ({
    id, label, coef,
    note: Math.round(note * 10) / 10, // affichage au dixième
  }));
}

/** Qualifie l'effort d'un scénario par rapport au niveau actuel de l'élève. */
function qualifier(notes, moyenneActuelle) {
  if (!notes) return "impossible";
  if (moyenneActuelle === null) return "indetermine";
  const ecartMax = Math.max(...notes.map((n) => n.note - moyenneActuelle));
  if (ecartMax <= 0.5) return "realiste";
  if (ecartMax <= 2)   return "ambitieux";
  return "exigeant";
}

/**
 * Génère les 4 scénarios pour atteindre l'objectif.
 * @param {object} minimales - sortie de notesMinimales()
 * @param {object} synthese  - sortie de calculerSynthese()
 */
export function genererScenarios(minimales, synthese, data) {
  if (!minimales.accessible) return [];

  const { pointsNecessaires, epreuvesCibles } = minimales;
  const idsSpes = epreuvesCibles.filter((e) => e.id === "spe1" || e.id === "spe2").map((e) => e.id);
  const m = synthese.moyenneActuelle;

  /* Écarts (deltas) par scénario — voir CONCEPTION.md § 4.4 */
  const definitions = [
    { id: "equilibre",  nom: "Équilibré",
      description: "La même note partout — le chemin le plus régulier.",
      deltas: {} },
    { id: "spes",       nom: "Spécialités d'abord",
      description: "+2 points sur les spécialités, la philo et le Grand oral respirent.",
      deltas: Object.fromEntries(idsSpes.map((id) => [id, +2])) },
    { id: "grand-oral", nom: "Grand oral d'abord",
      description: "Le Grand oral se prépare bien : +3 points dessus, le reste s'allège.",
      deltas: { "grand-oral": +3 } },
    { id: "optimiste",  nom: "Optimiste",
      description: "Tu dépasses ton niveau actuel dans les épreuves à fort coefficient.",
      deltas: { ...Object.fromEntries(idsSpes.map((id) => [id, +1.5])), "grand-oral": +1 } },
  ];

  return definitions.map((def) => {
    const notes = resoudre(pointsNecessaires, epreuvesCibles, def.deltas, data.regles);
    return {
      id: def.id,
      nom: def.nom,
      description: def.description,
      notes,                                  // null si infaisable sous contraintes
      qualification: qualifier(notes, m),     // realiste | ambitieux | exigeant | impossible
    };
  });
}

/* ----------------------------------------------------------------------------
   7. INDICE DE FAISABILITÉ (estimation indicative, barème dans bacData.js)
   --------------------------------------------------------------------------- */
export function indiceFaisabilite(minimales, synthese, data) {
  if (!minimales.accessible) return 0;
  if (minimales.dejaGaranti) return 100;
  if (synthese.moyenneActuelle === null) return null; // pas assez de données

  const delta = minimales.noteUniforme - synthese.moyenneActuelle;
  const palier = data.faisabilite.find((p) => delta <= p.deltaMax);
  return palier ? palier.valeur : 0;
}

/* ----------------------------------------------------------------------------
   8. ASSISTANT : conseils déterministes
   Renvoie une liste de { niveau: "ok"|"info"|"alerte", texte }.
   --------------------------------------------------------------------------- */
export function genererConseils(grille, synthese, minimales, data) {
  const conseils = [];
  const fmt = (x) => x.toFixed(1).replace(".", ",");

  /* Mentions : laquelle est déjà en poche, laquelle demande un exploit ? */
  for (const mention of data.mentions) {
    if (mention.id === "rattrapage" || mention.id === "ajourne") continue;
    const min = notesMinimales(mention.seuil, grille, data);
    if (min.dejaGaranti) {
      conseils.push({ niveau: "ok", texte: `La mention ${mention.label} est déjà assurée par tes notes actuelles.` });
      break; // on ne cite que la meilleure mention garantie
    }
    if (synthese.moyenneActuelle !== null && min.accessible &&
        min.noteUniforme <= synthese.moyenneActuelle - 1) {
      conseils.push({ niveau: "ok", texte: `La mention ${mention.label} semble facilement atteignable (${fmt(min.noteUniforme)}/20 de moyenne suffisent en Terminale).` });
      break;
    }
  }

  const tb = notesMinimales(16, grille, data);
  if (tb.accessible && !tb.dejaGaranti && tb.noteUniforme > 16) {
    conseils.push({ niveau: "info", texte: `La mention Très Bien nécessitera une excellente performance : ${fmt(tb.noteUniforme)}/20 de moyenne sur les épreuves de Terminale.` });
  }

  /* Poids des spécialités dans la note finale */
  const coefSpes = grille
    .filter((l) => l.id === "spe1" || l.id === "spe2")
    .reduce((s, l) => s + l.coef, 0);
  conseils.push({
    niveau: "info",
    texte: `Tes spécialités représentent ${Math.round((coefSpes / synthese.coefTotal) * 100)} % de ta note finale.`,
  });

  /* Levier Grand oral */
  const go = grille.find((l) => l.id === "grand-oral");
  if (go && go.note === null) {
    const gain = (20 - (synthese.moyenneActuelle ?? 10)) * go.coef / synthese.coefTotal;
    conseils.push({ niveau: "info", texte: `Le Grand oral peut te faire gagner jusqu'à ${fmt(gain)} point(s) de moyenne finale par rapport à ton niveau actuel.` });
  }

  /* Alertes */
  if (synthese.moyenneProjetee !== null && synthese.moyenneProjetee < 10) {
    conseils.push({ niveau: "alerte", texte: `Ta moyenne projetée est sous 10/20 : entre 8 et 10, ce sont les oraux de rattrapage (2d groupe).` });
  }
  for (const l of grille) {
    if (l.categorie === "option" && l.note !== null &&
        synthese.moyenneActuelle !== null && l.note < synthese.moyenneActuelle - 2) {
      conseils.push({ niveau: "alerte", texte: `Attention : l'option ${l.label} (${fmt(l.note)}/20) tire ta moyenne vers le bas — les options comptent entièrement.` });
    }
  }
  if (minimales && !minimales.accessible) {
    conseils.push({ niveau: "alerte", texte: `Ton objectif de ${minimales.objectif}/20 n'est mathématiquement plus atteignable. La meilleure moyenne possible est ${fmt(synthese.moyenneFinaleMax)}/20.` });
  }

  return conseils;
}

/* ----------------------------------------------------------------------------
   9. POINT D'ENTRÉE UNIQUE : tout calculer d'un coup
   ui.js appelle cette fonction à chaque modification de l'état.
   --------------------------------------------------------------------------- */
export function calculerTout(state, data) {
  const erreurs = validerParcours(state, data);
  const grille = buildGrille(state, data);
  const synthese = calculerSynthese(grille, data);
  const objectif = Number(state.profil.objectif) || 10;
  const minimales = notesMinimales(objectif, grille, data);
  const scenarios = genererScenarios(minimales, synthese, data);
  const faisabilite = indiceFaisabilite(minimales, synthese, data);
  const conseils = genererConseils(grille, synthese, minimales, data);

  return { erreurs, grille, synthese, minimales, scenarios, faisabilite, conseils };
}
