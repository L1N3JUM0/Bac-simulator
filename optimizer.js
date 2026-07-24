/* ============================================================================
   Bac Simulator — optimizer.js                                          v1.3
   ----------------------------------------------------------------------------
   MOTEUR DE STRATÉGIE.

   calculator.js répond à « quelle note me faut-il ? » en répartissant l'effort
   de façon UNIFORME. Ce module répond à une question différente et beaucoup
   plus utile : « quel est le chemin le PLUS FACILE pour atteindre mon
   objectif ? »

   ---------------------------------------------------------------------------
   LE PROBLÈME, POSÉ PROPREMENT

   On cherche les notes nᵢ des épreuves et moyennes qu'il reste à obtenir
   (coefficients cᵢ) qui atteignent l'objectif au moindre effort :

       minimiser   Σ wᵢ · (nᵢ − bᵢ)²        ← l'effort total
       sous        Σ cᵢ · nᵢ ≥ P_requis     ← l'objectif est atteint
                   bᵢ ≤ nᵢ ≤ 20

   où :
     bᵢ = niveau de référence de l'élève dans cette matière
     wᵢ = difficulté à y progresser (curseur « point fort / neutre / fragile »)

   Le coût est QUADRATIQUE : gagner 4 points coûte quatre fois plus cher que
   d'en gagner 2, pas deux fois. C'est ce qui traduit la réalité — les premiers
   points sont toujours les plus faciles — et c'est ce qui pousse la solution à
   étaler l'effort au lieu de tout demander à une seule matière.

   ---------------------------------------------------------------------------
   LA SOLUTION EST EXACTE, PAS APPROCHÉE

   Les conditions de Karush-Kuhn-Tucker donnent directement :

       nᵢ = bᵢ + λ · cᵢ / (2 wᵢ)

   Autrement dit : la hausse demandée dans une matière est PROPORTIONNELLE à
   son coefficient et INVERSEMENT proportionnelle à sa difficulté. On ajuste λ
   (un seul nombre) jusqu'à ce que l'objectif soit atteint, en figeant au
   passage les notes qui butent sur 20. Quelques itérations suffisent, le
   résultat est déterministe, donc testable.

   ---------------------------------------------------------------------------
   CE MODULE NE TOUCHE À RIEN

   Il ne modifie ni l'état, ni la grille, ni calculator.js. Il lit, il calcule,
   il renvoie. Les calculs réglementaires restent la propriété exclusive de
   calculator.js.
   ============================================================================ */

import { arrondiDixiemeSuperieur } from "./calculator.js";

/* ----------------------------------------------------------------------------
   1. CONFIANCE → POIDS
   --------------------------------------------------------------------------- */

/**
 * Poids wᵢ associés au curseur de confiance.
 * Un point gagné dans une matière fragile coûte ≈ 3,5 fois plus cher que dans
 * une matière où l'élève est à l'aise. Ces valeurs sont un modèle assumé, pas
 * une mesure : elles servent à HIÉRARCHISER les efforts, pas à les prédire.
 */
export const POIDS_CONFIANCE = {
  fort: 0.55,
  neutre: 1,
  fragile: 1.9,
};

/** Libellés d'interface, au même endroit que les poids. */
export const LIBELLES_CONFIANCE = {
  fort: "Point fort",
  neutre: "Neutre",
  fragile: "Fragile",
};

/** Niveau de confiance déclaré pour une ligne (défaut : neutre). */
export function confiancePour(state, idLigne) {
  const valeur = state.confiance ? state.confiance[idLigne] : null;
  return POIDS_CONFIANCE[valeur] ? valeur : "neutre";
}

/* ----------------------------------------------------------------------------
   2. CONSTRUCTION DES LEVIERS
   ---------------------------------------------------------------------------
   Un « levier » est une ligne de la grille dont la note n'est PAS encore
   connue : c'est ce sur quoi l'élève peut encore agir. Une note déjà obtenue
   n'est pas un levier, c'est une donnée.
   --------------------------------------------------------------------------- */

/**
 * Niveau de référence bᵢ d'une ligne encore vide.
 *
 * On cherche le meilleur signal disponible, dans cet ordre :
 *   1. la note de Première dans LA MÊME matière (hg@terminale ← hg@premiere) —
 *      c'est de loin le meilleur prédicteur dont on dispose ;
 *   2. à défaut, la moyenne générale actuelle de l'élève ;
 *   3. à défaut de tout (aucune note saisie), 10.
 */
function niveauReference(ligne, grille, moyenneActuelle) {
  const separateur = ligne.id.indexOf("@");
  if (separateur > -1) {
    const matiere = ligne.id.slice(0, separateur);
    const enPremiere = grille.find(
      (l) => l.id === `${matiere}@premiere` && l.note !== null
    );
    if (enPremiere) return enPremiere.note;
  }
  if (moyenneActuelle !== null && moyenneActuelle !== undefined) return moyenneActuelle;
  return 10;
}

/**
 * Liste des leviers exploitables.
 * @param {Array}  grille   - sortie de buildGrille()
 * @param {Object} synthese - sortie de calculerSynthese()
 * @param {Object} state    - état de l'application (pour la confiance)
 * @param {Object} [options]
 * @param {boolean} [options.epreuvesSeules=false] - ignorer le contrôle continu
 * @returns {Array} leviers triés par coefficient décroissant
 */
export function construireLeviers(grille, synthese, state, options = {}) {
  const { epreuvesSeules = false } = options;
  const moyenne = synthese.moyenneProjetee ?? synthese.moyenneActuelle ?? null;

  return grille
    .filter((ligne) => ligne.note === null && ligne.coef > 0)
    .filter((ligne) => (epreuvesSeules ? ligne.categorie === "epreuve" : true))
    .map((ligne) => {
      const confiance = confiancePour(state, ligne.id);
      return {
        id: ligne.id,
        label: ligne.label,
        coef: ligne.coef,
        categorie: ligne.categorie,
        annee: ligne.annee,
        confiance,
        poids: POIDS_CONFIANCE[confiance],
        base: Math.min(20, Math.max(0, niveauReference(ligne, grille, moyenne))),
      };
    })
    .sort((a, b) => b.coef - a.coef);
}

/* ----------------------------------------------------------------------------
   3. L'OPTIMISEUR
   --------------------------------------------------------------------------- */

const EPS = 1e-9;

/**
 * Répartit l'effort minimal permettant d'atteindre un total de points.
 *
 * @param {Array}  leviers        - sortie de construireLeviers()
 * @param {number} pointsAObtenir - points à aller chercher sur ces leviers
 * @returns {{
 *   faisable: boolean,
 *   notes: Array<{id,label,coef,base,note,delta,confiance}>,
 *   effort: number,        // Σ wᵢ (nᵢ − bᵢ)²  — comparable entre stratégies
 *   effortMoyen: number,   // hausse moyenne pondérée, en points sur 20
 *   pointsObtenus: number,
 *   manque: number         // points hors d'atteinte si infaisable
 * }}
 */
export function optimiser(leviers, pointsAObtenir) {
  const vide = {
    faisable: true, notes: [], effort: 0, effortMoyen: 0,
    pointsObtenus: 0, manque: 0,
  };
  if (!leviers || leviers.length === 0) {
    return pointsAObtenir > EPS
      ? { ...vide, faisable: false, manque: pointsAObtenir }
      : vide;
  }

  /* Point de départ : le niveau de référence de chaque matière. */
  const notes = leviers.map((l) => ({ ...l, note: l.base, delta: 0 }));
  const basePoints = notes.reduce((somme, n) => somme + n.base * n.coef, 0);

  /* Déjà atteint sans effort supplémentaire : on s'arrête là. C'est un
     résultat en soi — « tu n'as pas besoin de progresser pour y arriver ». */
  let besoin = pointsAObtenir - basePoints;
  if (besoin <= EPS) {
    return { ...vide, notes, pointsObtenus: basePoints };
  }

  /* Plafond absolu : même à 20 partout, l'objectif est-il atteignable ? */
  const maximum = notes.reduce((somme, n) => somme + 20 * n.coef, 0);
  if (maximum < pointsAObtenir - 1e-6) {
    for (const n of notes) { n.note = 20; n.delta = 20 - n.base; }
    return {
      faisable: false,
      notes,
      effort: Infinity,
      effortMoyen: Infinity,
      pointsObtenus: maximum,
      manque: pointsAObtenir - maximum,
    };
  }

  /* --- Remplissage par saturation (KKT) --------------------------------- */
  const libres = new Set(notes.map((n) => n.id));

  for (let tour = 0; tour < notes.length + 2 && besoin > EPS; tour++) {
    /* λ tel que Σ cᵢ · Δᵢ = besoin, avec Δᵢ = λ cᵢ / (2 wᵢ). */
    let denominateur = 0;
    for (const n of notes) {
      if (libres.has(n.id)) denominateur += (n.coef * n.coef) / (2 * n.poids);
    }
    if (denominateur <= EPS) break;

    const lambda = besoin / denominateur;

    /* Qui dépasse 20 ? On les fige et on recommence avec le reste. */
    let saturation = false;
    for (const n of notes) {
      if (!libres.has(n.id)) continue;
      const cible = n.base + (lambda * n.coef) / (2 * n.poids);
      if (cible > 20 + EPS) {
        n.note = 20;
        n.delta = 20 - n.base;
        besoin -= n.delta * n.coef;
        libres.delete(n.id);
        saturation = true;
      }
    }
    if (saturation) continue;

    /* Personne ne sature : la solution est celle-ci. */
    for (const n of notes) {
      if (!libres.has(n.id)) continue;
      n.delta = (lambda * n.coef) / (2 * n.poids);
      n.note = n.base + n.delta;
    }
    besoin = 0;
  }

  /* --- Arrondi d'affichage --------------------------------------------- */
  /* Au dixième SUPÉRIEUR, comme partout ailleurs dans l'application : une
     note arrondie vers le bas ferait manquer l'objectif de peu, ce qui est le
     pire des conseils. */
  for (const n of notes) {
    n.note = Math.min(20, arrondiDixiemeSuperieur(n.note));
    n.delta = Math.max(0, n.note - n.base);
  }

  const pointsObtenus = notes.reduce((somme, n) => somme + n.note * n.coef, 0);
  const effort = notes.reduce((somme, n) => somme + n.poids * n.delta * n.delta, 0);
  const poidsTotal = notes.reduce((somme, n) => somme + n.poids, 0);

  return {
    faisable: pointsObtenus >= pointsAObtenir - 0.05,
    notes,
    effort,
    /* Lecture humaine de l'effort : « il faut gagner en moyenne X points ».
       C'est la moyenne quadratique pondérée des hausses demandées. */
    effortMoyen: poidsTotal > 0 ? Math.sqrt(effort / poidsTotal) : 0,
    pointsObtenus,
    manque: Math.max(0, pointsAObtenir - pointsObtenus),
  };
}

/* ----------------------------------------------------------------------------
   4. STRATÉGIES : LE MÊME OBJECTIF, TROIS CHEMINS
   ---------------------------------------------------------------------------
   Une seule solution optimale ne suffit pas : « optimal » dépend de ce qu'on
   accepte de sacrifier. On propose donc trois lectures du même problème, en
   changeant uniquement les poids — et donc en changeant ce que le mot
   « facile » veut dire.
   --------------------------------------------------------------------------- */

export const STRATEGIES = [
  {
    id: "regulier",
    label: "Effort régulier",
    description: "L'effort est réparti sur toutes les matières, en tenant compte de ton niveau déclaré.",
    poids: (levier) => levier.poids,
  },
  {
    id: "forces",
    label: "Jouer tes points forts",
    description: "On demande davantage là où tu es à l'aise, et on épargne tes matières fragiles.",
    // Poids au carré : les écarts de confiance sont amplifiés
    poids: (levier) => levier.poids * levier.poids,
  },
  {
    id: "coefficients",
    label: "Miser sur les coefficients",
    description: "On ignore les préférences et on charge les matières qui pèsent le plus lourd.",
    poids: () => 1,
  },
];

/**
 * Calcule les trois stratégies et les classe de la plus facile à la plus dure.
 * Les stratégies aboutissant à des notes identiques sont fusionnées : proposer
 * deux fois le même chemin sous deux noms différents serait trompeur.
 *
 * @returns {Array} stratégies classées par effort croissant
 */
export function genererStrategies(leviers, pointsAObtenir) {
  const resultats = STRATEGIES.map((strategie) => {
    const pondere = leviers.map((l) => ({ ...l, poids: strategie.poids(l) }));
    const solution = optimiser(pondere, pointsAObtenir);
    return {
      id: strategie.id,
      label: strategie.label,
      description: strategie.description,
      ...solution,
    };
  });

  /* Fusion des chemins identiques (empreinte = notes arrondies) */
  const vues = new Map();
  for (const r of resultats) {
    const empreinte = r.notes.map((n) => `${n.id}:${n.note}`).join("|");
    if (!vues.has(empreinte)) vues.set(empreinte, r);
    else vues.get(empreinte).labelsFusionnes =
      [...(vues.get(empreinte).labelsFusionnes || []), r.label];
  }

  return [...vues.values()].sort((a, b) => {
    if (a.faisable !== b.faisable) return a.faisable ? -1 : 1;
    return a.effortMoyen - b.effortMoyen;
  });
}

/* ----------------------------------------------------------------------------
   5. RENTABILITÉ : OÙ UN POINT RAPPORTE-T-IL LE PLUS ?
   --------------------------------------------------------------------------- */

/**
 * Classe les leviers par rendement décroissant.
 *
 * Deux grandeurs, volontairement distinguées :
 *   · gainMoyenne = cᵢ / coefTotal → l'effet BRUT d'un point de plus
 *   · rendement   = gainMoyenne / wᵢ → l'effet RAPPORTÉ à ce qu'il coûte
 *
 * La première est un fait arithmétique, la seconde dépend du curseur de
 * confiance : c'est celle qui doit guider les révisions.
 */
export function classementRentabilite(leviers, coefTotal) {
  if (!coefTotal) return [];
  return leviers
    .map((levier) => ({
      id: levier.id,
      label: levier.label,
      coef: levier.coef,
      confiance: levier.confiance,
      /* +1 point dans cette matière = +coef points sur les 2 000 du bac */
      gainPoints: levier.coef,
      /* … soit +coef/coefTotal sur la moyenne finale */
      gainMoyenne: levier.coef / coefTotal,
      rendement: levier.coef / coefTotal / levier.poids,
      margeRestante: Math.max(0, 20 - levier.base),
    }))
    /* Une matière déjà au plafond ne peut plus rien rapporter. */
    .filter((l) => l.margeRestante > 0.05)
    .sort((a, b) => b.rendement - a.rendement);
}

/* ----------------------------------------------------------------------------
   6. MARGE DE SÉCURITÉ
   --------------------------------------------------------------------------- */

/**
 * Combien de points l'élève peut-il encore perdre en conservant un seuil ?
 * Répond à « je peux encore perdre 12 points et garder la mention Bien ».
 *
 * @returns {{points: number, moyenne: number}|null} null si le seuil n'est
 *          pas atteint aujourd'hui (il n'y a alors rien à protéger).
 */
export function margeSecurite(synthese, seuil) {
  const moyenne = synthese.moyenneProjetee;
  if (moyenne === null || moyenne === undefined || moyenne < seuil) return null;
  return {
    points: (moyenne - seuil) * synthese.coefTotal,
    moyenne: moyenne - seuil,
  };
}

/* ----------------------------------------------------------------------------
   7. POINTS À ALLER CHERCHER POUR UN OBJECTIF
   --------------------------------------------------------------------------- */

/**
 * Traduit un objectif de moyenne en points à obtenir sur les leviers.
 *
 * Attention à la sémantique de calculerSynthese() : `pointsProjetes` ne
 * contient QUE les lignes de Terminale renseignées. Les points déjà acquis
 * (Première et épreuves anticipées) sont dans `pointsAcquis`. Les deux doivent
 * être additionnés pour obtenir « ce qui est déjà dans la besace ».
 *
 * Cas particulier : avec l'option epreuvesSeules, certaines lignes ne sont ni
 * renseignées ni des leviers (le contrôle continu de Terminale, par exemple).
 * On ne peut pas les compter pour zéro — on leur applique la même hypothèse
 * que le reste du moteur : la moyenne actuelle de l'élève.
 */
export function pointsRequis(objectif, synthese, leviers) {
  const coefLeviers = leviers.reduce((somme, l) => somme + l.coef, 0);
  const pointsFixes = synthese.pointsAcquis + synthese.pointsProjetes;
  const coefRenseigne = synthese.coefAcquis + synthese.coefProjetes;

  /* Lignes laissées de côté : ni connues, ni actionnables ici. */
  const coefIgnore = Math.max(0, synthese.coefTotal - coefRenseigne - coefLeviers);
  const hypothese = synthese.moyenneProjetee ?? 10;
  const pointsSupposes = coefIgnore * hypothese;

  return {
    total: objectif * synthese.coefTotal,
    surLeviers: objectif * synthese.coefTotal - pointsFixes - pointsSupposes,
    coefLeviers,
    coefFixes: coefRenseigne,
    pointsFixes,
    coefIgnore,
    pointsSupposes,
  };
}

/**
 * Analyse complète d'un objectif : le chemin le plus facile, les trois
 * stratégies, la rentabilité et la marge. C'est le point d'entrée utilisé par
 * l'interface.
 */
export function analyserObjectif(objectif, grille, synthese, state, options = {}) {
  const leviers = construireLeviers(grille, synthese, state, options);
  const requis = pointsRequis(objectif, synthese, leviers);
  const strategies = genererStrategies(leviers, requis.surLeviers);
  return {
    objectif,
    leviers,
    requis,
    strategies,
    meilleure: strategies[0] || null,
    rentabilite: classementRentabilite(leviers, synthese.coefTotal),
    marge: margeSecurite(synthese, objectif),
    /* Aucun effort nécessaire : l'objectif est déjà tenu par les hypothèses. */
    dejaAtteint: requis.surLeviers <= leviers.reduce((s, l) => s + l.base * l.coef, 0) + EPS,
  };
}

/* ----------------------------------------------------------------------------
   8. QUALIFICATION DE L'EFFORT (sans probabilité inventée)
   ---------------------------------------------------------------------------
   On ne prétend PAS calculer une probabilité de réussite : rien ne permettrait
   de la calibrer. On qualifie l'effort demandé, qui est une grandeur réelle.
   --------------------------------------------------------------------------- */

export function qualifierEffort(effortMoyen, faisable) {
  if (!faisable) {
    return { niveau: "impossible", label: "Hors d'atteinte",
             detail: "Même avec 20 partout, l'objectif ne peut plus être atteint." };
  }
  if (effortMoyen <= 0.01) {
    return { niveau: "acquis", label: "Déjà tenu",
             detail: "Tes hypothèses actuelles suffisent : rien à gagner de plus." };
  }
  if (effortMoyen <= 0.75) {
    return { niveau: "accessible", label: "À portée",
             detail: "Moins d'un point à gagner en moyenne par matière." };
  }
  if (effortMoyen <= 1.75) {
    return { niveau: "exigeant", label: "Exigeant",
             detail: "Il faut progresser d'un à deux points sur plusieurs matières." };
  }
  if (effortMoyen <= 3.25) {
    return { niveau: "ambitieux", label: "Très exigeant",
             detail: "La progression demandée est importante et régulière." };
  }
  return { niveau: "extreme", label: "Extrême",
           detail: "L'écart avec ton niveau actuel est considérable." };
}
