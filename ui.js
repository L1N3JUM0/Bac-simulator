/* ============================================================================
   Bac Simulator — ui.js
   ----------------------------------------------------------------------------
   COUCHE DE RENDU : construit le DOM dynamique (spécialités, options, lignes
   de notes adaptées au parcours) et affiche les résultats.

   Règle d'or : ui.js LIT l'état et les résultats produits par calculator.js,
   il ne calcule jamais lui-même (à part du formatage d'affichage).

   Les graphiques Chart.js arrivent à l'étape 4.
   ============================================================================ */

import {
  parseNote, normaliserNote, notesMinimales,
  calculerTout, simulerRattrapage, oralsRattrapage,
} from "./calculator.js";

/* ----------------------------------------------------------------------------
   1. PETITS OUTILS
   --------------------------------------------------------------------------- */

/** Raccourci querySelector. */
const $ = (selecteur) => document.querySelector(selecteur);

/** Formate un nombre à la française (virgule), avec `dec` décimales. */
function fmt(valeur, dec = 1) {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) return "—";
  return valeur.toFixed(dec).replace(".", ",");
}

/** Valeur d'un champ de note pour l'affichage (nombre → "13,5"). */
function versChamp(valeur) {
  return typeof valeur === "number" ? String(valeur).replace(".", ",") : "";
}

/** Libellé court de l'objectif pour le bandeau. */
function libelleObjectif(objectif) {
  return { 10: "Admis", 12: "AB", 14: "B", 16: "TB", 20: "20/20" }[objectif] || `${objectif}/20`;
}

/** Les deux spécialités conservées, dans l'ordre de sélection. */
function spesConservees(state) {
  return state.specialites.choisies.filter((id) => id !== state.specialites.abandonnee);
}

/* ----------------------------------------------------------------------------
   2. PROFIL : académies + liaison des champs
   --------------------------------------------------------------------------- */

/** Remplit la liste déroulante des académies (ordre alphabétique de bacData). */
export function remplirAcademies(state, data) {
  const select = $("#select-academie");
  for (const academie of data.academies) {
    const option = document.createElement("option");
    option.value = academie;
    option.textContent = academie;
    select.appendChild(option);
  }
  select.value = state.profil.academie || "";
}

/** Relie les champs du profil à l'état. `onChange` = recalcul + sauvegarde. */
export function bindProfil(state, onChange) {
  $("#input-prenom").value = state.profil.prenom || "";
  $("#input-nom").value = state.profil.nom || "";

  $("#input-prenom").addEventListener("input", (e) => { state.profil.prenom = e.target.value; onChange(); });
  $("#input-nom").addEventListener("input", (e) => { state.profil.nom = e.target.value; onChange(); });
  $("#select-academie").addEventListener("change", (e) => { state.profil.academie = e.target.value; onChange(); });

  // Objectif (radios)
  for (const radio of document.querySelectorAll('#chips-objectif input[name="objectif"]')) {
    radio.checked = Number(radio.value) === Number(state.profil.objectif);
    radio.addEventListener("change", () => {
      state.profil.objectif = Number(radio.value);
      onChange();
    });
  }
}

/* ----------------------------------------------------------------------------
   3. SPÉCIALITÉS
   --------------------------------------------------------------------------- */

/**
 * Affiche les 13 spécialités (cases à cocher, 3 max) et les radios
 * d'abandon. `onParcours` = reconstruction des notes + recalcul.
 */
export function renderSpecialites(state, data, onParcours) {
  const conteneur = $("#liste-specialites");
  conteneur.innerHTML = "";
  const pleines = state.specialites.choisies.length >= 3;

  for (const spe of data.specialites) {
    const choisie = state.specialites.choisies.includes(spe.id);
    const label = document.createElement("label");
    label.className = "chip" + (!choisie && pleines ? " chip--disabled" : "");
    label.innerHTML = `<input type="checkbox" value="${spe.id}" ${choisie ? "checked" : ""}
      ${!choisie && pleines ? "disabled" : ""}><span>${spe.label}</span>`;

    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) {
        state.specialites.choisies.push(spe.id);
      } else {
        state.specialites.choisies = state.specialites.choisies.filter((id) => id !== spe.id);
        if (state.specialites.abandonnee === spe.id) state.specialites.abandonnee = null;
      }
      renderSpecialites(state, data, onParcours); // re-render (max 3, radios)
      onParcours();
    });
    conteneur.appendChild(label);
  }

  /* Radios d'abandon : uniquement parmi les 3 choisies */
  const abandon = $("#liste-abandon");
  abandon.innerHTML = "";
  if (state.specialites.choisies.length < 3) {
    abandon.innerHTML = `<p class="card__note">Choisis d'abord tes 3 spécialités.</p>`;
  }
  for (const id of state.specialites.choisies) {
    const spe = data.specialites.find((s) => s.id === id);
    const label = document.createElement("label");
    label.className = "chip chip--danger";
    label.innerHTML = `<input type="radio" name="abandon" value="${id}"
      ${state.specialites.abandonnee === id ? "checked" : ""}><span>${spe.label}</span>`;
    label.querySelector("input").addEventListener("change", () => {
      state.specialites.abandonnee = id;
      onParcours();
    });
    abandon.appendChild(label);
  }
}

/* ----------------------------------------------------------------------------
   4. OPTIONS
   --------------------------------------------------------------------------- */

/** Affiche les options par année, avec les règles de compatibilité. */
export function renderOptions(state, data, onParcours) {
  const mathsConservee = spesConservees(state).includes("maths");
  const mathsAbandonnee = state.specialites.abandonnee === "maths";

  for (const annee of ["premiere", "terminale"]) {
    const conteneur = $(`#options-${annee}`);
    conteneur.innerHTML = "";

    for (const opt of data.options) {
      if (!opt.annees.includes(annee)) continue; // pas proposée cette année-là

      // Conditions réglementaires (grisées si non remplies)
      let bloquee = false;
      if (opt.condition === "speMathsConservee" && !mathsConservee) bloquee = true;
      if (opt.condition === "speMathsAbandonnee" && !mathsAbandonnee) bloquee = true;

      const cochee = state.options[annee].includes(opt.id);
      const label = document.createElement("label");
      label.className = "chip" + (bloquee ? " chip--disabled" : "");
      label.innerHTML = `<input type="checkbox" value="${opt.id}"
        ${cochee ? "checked" : ""} ${bloquee && !cochee ? "disabled" : ""}>
        <span>${opt.label}</span>`;

      label.querySelector("input").addEventListener("change", (e) => {
        if (e.target.checked) state.options[annee].push(opt.id);
        else state.options[annee] = state.options[annee].filter((id) => id !== opt.id);
        onParcours();
      });
      conteneur.appendChild(label);
    }
  }
}

/* ----------------------------------------------------------------------------
   5. NOTES : construction des lignes de saisie
   --------------------------------------------------------------------------- */

/**
 * Fabrique une ligne de note.
 * @param {object} p - { cle, label, meta, statut, valeur, mode, onSaisie }
 *   statut : "acquis" | "projete" | "avenir"  (code visuel de la marge)
 *   mode   : "simple" (1 champ) | "trimestres" (3 champs)
 */
function ligneNote(p, regles) {
  const ligne = document.createElement("div");
  ligne.className = `note-row note-row--${p.statut} card`;

  const info = document.createElement("div");
  info.className = "note-row__info";
  info.innerHTML = `<p class="note-row__label">${p.label}</p>
                    <p class="note-row__meta">${p.meta}</p>`;
  ligne.appendChild(info);

  const zone = document.createElement("div");
  zone.className = "note-row__input" + (p.mode === "trimestres" ? " note-row__input--triple" : "");

  /** Met à jour la marge (statut visuel) selon la présence d'une note. */
  const majStatut = (rempli) => {
    ligne.classList.remove("note-row--acquis", "note-row--projete", "note-row--avenir");
    ligne.classList.add(`note-row--${rempli ? p.statutRempli || p.statut : "avenir"}`);
  };

  if (p.mode === "trimestres") {
    /* Trois champs T1/T2/T3 ; la moyenne annuelle se calcule seule */
    const objet = typeof p.valeur === "object" && p.valeur !== null ? p.valeur : {};
    for (const t of ["t1", "t2", "t3"]) {
      const champ = document.createElement("input");
      champ.type = "text";
      champ.inputMode = "decimal";
      champ.placeholder = t.toUpperCase();
      champ.setAttribute("aria-label", `${p.label}, trimestre ${t.slice(1)}`);
      champ.value = versChamp(objet[t]);
      champ.addEventListener("input", () => {
        const note = parseNote(champ.value, regles);
        champ.classList.toggle("is-invalid", champ.value.trim() !== "" && note === null);
        champ.setAttribute("aria-invalid", champ.classList.contains("is-invalid"));
        p.onSaisie(t, note, (moyenne) => {
          info.querySelector(".note-row__meta").innerHTML =
            `${p.meta} · Moyenne auto : <strong>${fmt(moyenne)}</strong>`;
          majStatut(moyenne !== null);
        });
      });
      zone.appendChild(champ);
    }
  } else {
    /* Un seul champ « moyenne » ou note d'épreuve */
    const champ = document.createElement("input");
    champ.type = "text";
    champ.inputMode = "decimal";
    champ.placeholder = "—";
    champ.setAttribute("aria-label", `${p.label}, note sur 20`);
    champ.value = versChamp(p.valeur);
    champ.addEventListener("input", () => {
      const note = parseNote(champ.value, regles);
      champ.classList.toggle("is-invalid", champ.value.trim() !== "" && note === null);
      champ.setAttribute("aria-invalid", champ.classList.contains("is-invalid"));
      p.onSaisie(null, note);
      majStatut(note !== null);
    });
    zone.appendChild(champ);
    const sur = document.createElement("span");
    sur.className = "note-row__sur";
    sur.textContent = "/20";
    zone.appendChild(sur);
  }

  ligne.appendChild(zone);
  return ligne;
}

/**
 * (Re)construit les trois volets de notes selon le parcours de l'élève.
 * `onNote` = recalcul + sauvegarde (appelé à chaque frappe valide).
 */
export function renderNotes(state, data, onNote) {
  const { regles } = data;
  const conserves = spesConservees(state);
  const nomSpe = (id) => (data.specialites.find((s) => s.id === id) || { label: id }).label;
  const nomOpt = (id) => (data.options.find((o) => o.id === id) || { label: id }).label;

  /* --- Volet 1 : épreuves anticipées (passées en Première) ------------- */
  const listeEA = $("#liste-ea");
  listeEA.innerHTML = "";
  for (const ep of data.epreuvesTerminales.filter((e) => e.annee === "premiere")) {
    listeEA.appendChild(ligneNote({
      label: ep.label,
      meta: `Coef ${ep.coef} · Épreuve passée`,
      statut: state.notes.epreuves[ep.id] != null ? "acquis" : "avenir",
      statutRempli: "acquis",
      valeur: state.notes.epreuves[ep.id],
      mode: "simple",
      onSaisie: (_, note) => { state.notes.epreuves[ep.id] = note; onNote(); },
    }, regles));
  }

  /* --- Volets 2 et 3 : contrôle continu ---------------------------------- */
  construireCC("premiere", "#liste-cc1", "acquis");
  construireCC("terminale", "#liste-cct", "projete");

  function construireCC(annee, cible, statutRempli) {
    const liste = $(cible);
    liste.innerHTML = "";
    const notes = annee === "premiere" ? state.notes.ccPremiere : state.notes.ccTerminale;
    // Le mode « 3 trimestres » ne concerne que les VRAIS bulletins (Première).
    // Les hypothèses de Terminale restent une moyenne simple : ce sont des
    // estimations, modifiables au fil de l'année.
    const enTrimestres = annee === "premiere" && state.saisieCC === "trimestres";

    /* Matières du tronc commun de l'année */
    for (const cc of data.controleContinu) {
      const coef = annee === "premiere" ? cc.coefPremiere : cc.coefTerminale;
      if (coef === 0) continue;

      const label = cc.id === "spe-abandonnee"
        ? `${nomSpe(state.specialites.abandonnee || "?")} <span class="badge badge--marge">spé abandonnée</span>`
        : cc.label;
      // La spé abandonnée n'existe que si elle est désignée
      if (cc.id === "spe-abandonnee" && !state.specialites.abandonnee) continue;

      liste.appendChild(fabriquerLigneCC(cc.id, label, coef));
    }

    /* Options suivies cette année-là */
    for (const idOption of state.options[annee]) {
      liste.appendChild(fabriquerLigneCC(
        `opt-${idOption}`,
        `${nomOpt(idOption)} <span class="badge">option</span>`,
        data.optionCoefParAnnee
      ));
    }

    function fabriquerLigneCC(cle, label, coef) {
      const meta = `Coef ${coef} (${annee === "premiere" ? "1<sup>re</sup>" : "T<sup>le</sup>"}) · ${annee === "premiere" ? "Bulletin" : "Hypothèse"}`;
      const valeur = notes[cle];
      const rempli = normaliserNote(valeur ?? null, true, regles) !== null;

      if (enTrimestres) {
        return ligneNote({
          label, meta,
          statut: rempli ? statutRempli : "avenir",
          statutRempli,
          valeur, mode: "trimestres",
          onSaisie: (trimestre, note, majMeta) => {
            // La note devient un objet {t1,t2,t3} (représentation trimestres)
            if (typeof notes[cle] !== "object" || notes[cle] === null) notes[cle] = {};
            if (note === null) delete notes[cle][trimestre];
            else notes[cle][trimestre] = note;
            majMeta(normaliserNote(notes[cle], true, regles));
            onNote();
          },
        }, regles);
      }

      return ligneNote({
        label, meta,
        statut: rempli ? statutRempli : "avenir",
        statutRempli,
        // En mode « moyenne », un objet trimestres existant est affiché
        // via sa moyenne calculée (modifiable : la saisie remplace l'objet)
        valeur: typeof valeur === "object" && valeur !== null
          ? normaliserNote(valeur, true, regles)
          : valeur,
        mode: "simple",
        onSaisie: (_, note) => {
          if (note === null) delete notes[cle];
          else notes[cle] = note;
          onNote();
        },
      }, regles);
    }
  }

  /* --- Volet 3 (suite) : épreuves finales de Terminale ------------------- */
  const listeEpreuves = $("#liste-epreuves-terminale");
  listeEpreuves.innerHTML = "";
  for (const ep of data.epreuvesTerminales.filter((e) => e.annee === "terminale")) {
    let label = ep.label;
    if (ep.id === "spe1") label = conserves[0] ? nomSpe(conserves[0]) : "Spécialité 1";
    if (ep.id === "spe2") label = conserves[1] ? nomSpe(conserves[1]) : "Spécialité 2";

    listeEpreuves.appendChild(ligneNote({
      label,
      meta: `Coef ${ep.coef} · Épreuve finale — hypothèse`,
      statut: state.notes.epreuves[ep.id] != null ? "projete" : "avenir",
      statutRempli: "projete",
      valeur: state.notes.epreuves[ep.id],
      mode: "simple",
      onSaisie: (_, note) => { state.notes.epreuves[ep.id] = note; onNote(); },
    }, regles));
  }
}

/* ----------------------------------------------------------------------------
   6. ERREURS DE PARCOURS (validerParcours)
   --------------------------------------------------------------------------- */
export function afficherErreurs(erreurs) {
  const bloc1 = $("#err-specialites");
  const bloc2 = $("#err-options");
  const speErreurs = erreurs.filter((e) => e.includes("spécialité") && !e.includes("option") && !e.includes("»"));
  const optErreurs = erreurs.filter((e) => !speErreurs.includes(e));

  bloc1.textContent = speErreurs.join(" ");
  bloc1.hidden = speErreurs.length === 0;
  bloc2.textContent = optErreurs.join(" ");
  bloc2.hidden = optErreurs.length === 0;
}

/* ----------------------------------------------------------------------------
   7. RÉSULTATS & BANDEAU
   --------------------------------------------------------------------------- */

/** Remplit l'écran Résultats à partir de calculerTout(). */
export function renderResultats(state, resultats, data) {
  const { synthese, minimales, scenarios, faisabilite, conseils } = resultats;

  /* Carte-copie */
  $("#res-moyenne").innerHTML = synthese.moyenneProjetee === null
    ? "—" : `${fmt(synthese.moyenneProjetee, 2)}<small>/20</small>`;
  $("#res-acquis").textContent = `${fmt(synthese.pointsAcquis, 1)} pts`;
  $("#res-restants").textContent = `${fmt(synthese.pointsRestantsMax, 0)} pts`;
  $("#res-coef").textContent = synthese.coefTotal;
  $("#res-mention").textContent = synthese.mentionActuelle ? synthese.mentionActuelle.label : "—";
  $("#res-mention-max").textContent = synthese.meilleureMentionPossible
    ? synthese.meilleureMentionPossible.label : "—";
  $("#res-faisabilite").textContent = faisabilite === null ? "—" : `${faisabilite} %`;

  /* Avertissement : liste NOMMÉE des moyennes non renseignées */
  const avertissement = $("#res-avertissement");
  if (minimales.lignesSupposees.length > 0) {
    const libelles = minimales.lignesSupposees
      .map((l) => `${l.label} (${l.annee === "premiere" ? "1re" : "Tle"})`)
      .join(", ");
    avertissement.innerHTML = `<strong>Non renseignées</strong> — supposées à `
      + `${fmt(minimales.hypotheseDefaut)}/20 dans le calcul de l'objectif : ${libelles}.`;
    avertissement.hidden = false;
  } else {
    avertissement.hidden = true;
  }

  /* Notes minimales pour l'objectif */
  const mention = data.mentions.find((m) => m.seuil === Number(state.profil.objectif));
  $("#titre-minimales").textContent =
    `Pour atteindre ${state.profil.objectif}/20${mention && mention.seuil >= 10 && mention.id !== "admis" ? ` (mention ${mention.label})` : ""}`;

  const texte = $("#texte-minimales");
  const liste = $("#liste-minimales");
  liste.innerHTML = "";

  if (minimales.dejaGaranti) {
    texte.innerHTML = `🎉 Ton objectif est <strong>déjà garanti</strong> par tes notes et hypothèses actuelles.`;
  } else if (!minimales.accessible) {
    texte.innerHTML = `Cet objectif n'est <strong>mathématiquement plus atteignable</strong> : il faudrait ${fmt(minimales.noteUniforme)}/20 de moyenne. `
      + `La meilleure moyenne encore possible est <strong>${fmt(synthese.moyenneFinaleMax, 2)}/20</strong>.`;
  } else {
    texte.innerHTML = `Il te faut en moyenne <strong>${fmt(minimales.noteUniforme)}/20</strong> sur les épreuves de Terminale.`;
    const equilibre = scenarios.find((s) => s.id === "equilibre");
    const notes = equilibre && equilibre.notes
      ? equilibre.notes
      : minimales.epreuvesCibles.map((e) => ({ ...e, note: minimales.noteUniforme }));
    for (const n of notes) {
      const li = document.createElement("li");
      li.innerHTML = `<span>${n.label} <small>(coef ${n.coef})</small></span>
                      <strong class="num">${fmt(n.note)}</strong>`;
      liste.appendChild(li);
    }
  }

  /* Scénarios */
  const conteneurScenarios = $("#liste-scenarios");
  conteneurScenarios.innerHTML = "";
  $("#carte-scenarios").hidden = scenarios.length === 0;

  const badges = {
    realiste:    { classe: "badge--ok",    texte: "réaliste" },
    ambitieux:   { classe: "",             texte: "ambitieux" },
    exigeant:    { classe: "badge--warn",  texte: "exigeant" },
    impossible:  { classe: "badge--marge", texte: "impossible" },
    indetermine: { classe: "",             texte: "—" },
  };

  for (const scenario of scenarios) {
    const badge = badges[scenario.qualification] || badges.indetermine;
    const article = document.createElement("article");
    article.className = "scenario" + (scenario.id === "equilibre" ? " is-open" : "");
    let detail = "";
    if (scenario.notes) {
      detail = `<p class="scenario__notes">` + scenario.notes
        .map((n) => `<span>${n.label} <strong class="num">${fmt(n.note)}</strong></span>`)
        .join("") + `</p>`;
    } else {
      detail = `<p class="scenario__notes">Impossible sans dépasser 20/20 quelque part.</p>`;
    }
    article.innerHTML = `
      <header class="scenario__head">
        <h3>${scenario.nom}</h3><span class="badge ${badge.classe}">${badge.texte}</span>
      </header>
      <p class="scenario__desc">${scenario.description}</p>
      ${detail}`;
    conteneurScenarios.appendChild(article);
  }

  /* Conseils de l'assistant */
  const conteneurConseils = $("#liste-conseils");
  conteneurConseils.innerHTML = "";
  for (const conseil of conseils) {
    const li = document.createElement("li");
    li.dataset.niveau = conseil.niveau;
    li.textContent = conseil.texte;
    conteneurConseils.appendChild(li);
  }

  /* v1.1 : rattrapage + comparateur de notes cibles */
  renderRattrapage(state, resultats, data);
  renderComparateur(state, resultats, data);
}

/** Met à jour le bandeau sticky de synthèse. */
export function renderBandeau(state, resultats) {
  const { synthese } = resultats;
  $("#bandeau-moyenne").textContent = fmt(synthese.moyenneProjetee, 2);
  $("#bandeau-acquis").textContent = `${fmt(synthese.pointsAcquis, 0)} pts`;
  $("#bandeau-mention").textContent = synthese.mentionActuelle
    ? synthese.mentionActuelle.court : "—";
  $("#bandeau-objectif").textContent = libelleObjectif(Number(state.profil.objectif));
}

/* ----------------------------------------------------------------------------
   8. ONGLETS DE L'ÉCRAN NOTES (accessibles : clic + flèches clavier)
   --------------------------------------------------------------------------- */
export function initTabs() {
  const onglets = [...document.querySelectorAll(".tab")];

  function activer(onglet) {
    for (const t of onglets) {
      const actif = t === onglet;
      t.classList.toggle("is-active", actif);
      t.setAttribute("aria-selected", String(actif));
      t.tabIndex = actif ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !actif;
    }
    onglet.focus();
  }

  for (const onglet of onglets) {
    onglet.addEventListener("click", () => activer(onglet));
    onglet.addEventListener("keydown", (e) => {
      const index = onglets.indexOf(onglet);
      if (e.key === "ArrowRight") activer(onglets[(index + 1) % onglets.length]);
      if (e.key === "ArrowLeft")  activer(onglets[(index - 1 + onglets.length) % onglets.length]);
    });
  }
}

/* ----------------------------------------------------------------------------
   9. TABLEAU DE BORD — 4 graphiques Chart.js (étapes 4-5)
   ---------------------------------------------------------------------------
   Chart.js est chargé en global (window.Chart) depuis assets/libs/.

   Architecture « fabriques » : chaque graphique est décrit par une FONCTION
   qui produit une configuration Chart.js fraîche. La même fabrique sert :
     · au petit format du tableau de bord ;
     · à l'agrandissement plein écran (modale) ;
     · à l'export PDF (rendu hors écran, thème clair forcé).
   Chart.js mutant ses objets de configuration, chaque instance reçoit
   ainsi sa propre copie — aucun conflit entre les rendus.
   --------------------------------------------------------------------------- */

/** Instances Chart.js vivantes du tableau de bord, par id de canvas. */
const graphiques = {};

/** Dernières fabriques construites (réutilisées par la modale de zoom). */
let fabriquesCourantes = null;

/** Lit une variable CSS du thème courant (ex. "--accent"). */
function couleurTheme(nom) {
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
}

/** Palette de séries : lisible sur les deux thèmes. */
const PALETTE = [
  "#4A66D8", "#8CA0F4", "#2BB673", "#E8B931",
  "#E4536B", "#8B5CF6", "#38BDF8", "#F97362", "#94A3B8",
];

/**
 * Construit les 4 fabriques de graphiques pour l'état courant.
 * Les couleurs du thème sont lues AU MOMENT de l'appel : pour un rendu
 * en thème clair forcé (PDF), basculer data-theme avant d'appeler.
 * @returns {Array<{id: string, titre: string, fabrique: () => object}>}
 */
export function configsDashboard(state, resultats, data) {
  const { grille, synthese, minimales } = resultats;

  const accent = couleurTheme("--accent");
  const ok     = couleurTheme("--ok");
  const warn   = couleurTheme("--warn");
  const marge  = couleurTheme("--marge");
  const ligne  = couleurTheme("--line");
  const encre  = couleurTheme("--ink");
  const encre2 = couleurTheme("--ink-2");
  const surface = couleurTheme("--surface");
  const police = getComputedStyle(document.body).fontFamily;

  /* --- Données du donut des coefficients -------------------------------- */
  const parId = (id) => grille.find((l) => l.id === id);
  const sommeCoefs = (filtre) => grille.filter(filtre).reduce((s, l) => s + l.coef, 0);
  const groupes = [
    { label: "Français (écrit + oral)", coef: 10 },
    { label: "Maths anticipées",        coef: 2 },
    { label: parId("spe1")?.label ?? "Spécialité 1", coef: 16 },
    { label: parId("spe2")?.label ?? "Spécialité 2", coef: 16 },
    { label: "Philosophie", coef: 8 },
    { label: "Grand oral",  coef: 8 },
    { label: "Contrôle continu (tronc commun)",
      coef: sommeCoefs((l) => l.categorie === "cc" && !l.id.startsWith("spe-abandonnee")) },
    { label: "Spé abandonnée (CC)",
      coef: sommeCoefs((l) => l.id.startsWith("spe-abandonnee")) },
  ];
  const coefOptions = sommeCoefs((l) => l.categorie === "option");
  if (coefOptions > 0) groupes.push({ label: "Options", coef: coefOptions });

  /* --- Données de la barre de points ------------------------------------ */
  const pointsMax = 20 * synthese.coefTotal;
  const pointsRestants = pointsMax - synthese.pointsAcquis - synthese.pointsProjetes;

  /* --- Données de la jauge d'objectif ------------------------------------ */
  const objectifPoints = Number(state.profil.objectif) * synthese.coefTotal;
  const atteint = Math.min(synthese.pointsAcquis + synthese.pointsProjetes, objectifPoints);
  const pourcentage = objectifPoints > 0 ? Math.round((atteint / objectifPoints) * 100) : 0;

  /* --- Données des mentions : on interroge simplement le moteur ---------- */
  const seuils = data.mentions.filter((m) => m.seuil >= 10).sort((a, b) => a.seuil - b.seuil);
  const requises = seuils.map((m) => notesMinimales(m.seuil, grille, data).noteUniforme);

  const configs = [
    {
      id: "chart-coefs",
      titre: "Répartition des coefficients",
      fabrique: () => ({
        type: "doughnut",
        data: {
          labels: groupes.map((g) => g.label),
          datasets: [{
            data: groupes.map((g) => g.coef),
            backgroundColor: PALETTE,
            borderColor: surface,
            borderWidth: 2,
          }],
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10.5 } } },
            tooltip: { callbacks: {
              label: (ctx) => ` coef ${ctx.parsed} (${Math.round(ctx.parsed / synthese.coefTotal * 100)} %)`,
            } },
          },
        },
      }),
    },
    {
      id: "chart-points",
      titre: "Points acquis, projetés et restants",
      fabrique: () => ({
        type: "bar",
        data: {
          labels: [`Points / ${pointsMax}`],
          datasets: [
            { label: "Acquis (1re)",   data: [synthese.pointsAcquis],       backgroundColor: accent },
            { label: "Projetés (Tle)", data: [synthese.pointsProjetes],     backgroundColor: PALETTE[1] },
            { label: "Restants (max)", data: [Math.max(0, pointsRestants)], backgroundColor: ligne },
          ],
        },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, max: pointsMax, grid: { display: false } },
            y: { stacked: true, display: false },
          },
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label} : ${Math.round(ctx.parsed.x)} pts` } },
          },
        },
      }),
    },
    {
      id: "chart-progression",
      titre: "Progression vers l'objectif",
      fabrique: () => ({
        type: "doughnut",
        data: {
          labels: ["Atteint (acquis + hypothèses)", "Reste à gagner"],
          datasets: [{
            data: [atteint, Math.max(0, objectifPoints - atteint)],
            backgroundColor: [pourcentage >= 100 ? ok : accent, ligne],
            borderWidth: 0,
          }],
        },
        options: {
          maintainAspectRatio: false,
          cutout: "72%",
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => ` ${Math.round(ctx.parsed)} pts` } },
          },
        },
        plugins: [{
          /* Plugin maison : pourcentage au centre de la jauge */
          id: "texte-centre",
          afterDraw(chart) {
            const { ctx, chartArea } = chart;
            const cx = (chartArea.left + chartArea.right) / 2;
            const cy = (chartArea.top + chartArea.bottom) / 2;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = encre;
            ctx.font = `800 26px ${police}`;
            ctx.fillText(`${pourcentage} %`, cx, cy - 4);
            ctx.fillStyle = encre2;
            ctx.font = `600 10px ${police}`;
            ctx.fillText(`de l'objectif ${state.profil.objectif}/20`, cx, cy + 16);
            ctx.restore();
          },
        }],
      }),
    },
    {
      id: "chart-mentions",
      titre: "Note moyenne requise en Terminale, par mention",
      fabrique: () => ({
        type: "bar",
        data: {
          labels: seuils.map((m) => `${m.label} (≥${m.seuil})`),
          datasets: [{
            label: "Note requise /20 en Terminale",
            data: requises.map((n) => Math.max(0, Math.min(20, n))),
            backgroundColor: requises.map((n) =>
              n > 20 ? marge
              : synthese.moyenneActuelle !== null && n <= synthese.moyenneActuelle ? ok
              : n > 16 ? warn : accent),
            borderRadius: 6,
          }],
        },
        options: {
          maintainAspectRatio: false,
          scales: { y: { min: 0, max: 20, ticks: { stepSize: 5 } } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              label: (ctx) => {
                const reel = requises[ctx.dataIndex];
                return reel > 20
                  ? ` Inaccessible (il faudrait ${reel.toFixed(1).replace(".", ",")}/20)`
                  : ` ${reel.toFixed(1).replace(".", ",")}/20 de moyenne requise`;
              },
            } },
          },
        },
      }),
    },
  ];

  /* --- 5e graphique (v1.1) : évolution de la moyenne épinglée ------------ */
  if (state.historique && state.historique.length > 0) {
    const points = state.historique;
    configs.push({
      id: "chart-historique",
      titre: "Évolution de ma moyenne projetée",
      fabrique: () => ({
        type: "line",
        data: {
          labels: points.map((p) =>
            new Date(p.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })),
          datasets: [{
            label: "Moyenne projetée /20",
            data: points.map((p) => p.moyenne),
            borderColor: accent,
            backgroundColor: accent,
            pointRadius: 3,
            tension: 0.3,
          }],
        },
        options: {
          maintainAspectRatio: false,
          scales: { y: {
            min: Math.max(0, Math.floor(Math.min(...points.map((p) => p.moyenne)) - 1)),
            max: Math.min(20, Math.ceil(Math.max(...points.map((p) => p.moyenne)) + 1)),
          } },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              label: (ctx) => ` ${ctx.parsed.y.toFixed(2).replace(".", ",")}/20`,
            } },
          },
        },
      }),
    });
  }

  return configs;
}

/** Crée (ou remplace) un graphique dans le canvas donné. */
function creerGraphique(idCanvas, config) {
  if (typeof window === "undefined" || !window.Chart) return; // lib absente (tests)
  const canvas = document.getElementById(idCanvas);
  if (!canvas) return;
  const slot = canvas.closest(".chart-slot");
  if (slot) slot.classList.add("chart-slot--pret");
  if (graphiques[idCanvas]) graphiques[idCanvas].destroy();
  graphiques[idCanvas] = new window.Chart(canvas, config);
}

/**
 * Construit / met à jour les 4 graphiques du tableau de bord.
 * Appelé à l'ouverture de l'écran, à chaque recalcul si l'écran est visible,
 * et au changement de thème.
 */
export function renderDashboard(state, resultats, data) {
  if (typeof window === "undefined" || !window.Chart) return;

  /* Réglages globaux : typographie et couleurs du thème, animations sobres */
  const Chart = window.Chart;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = couleurTheme("--ink-2");
  Chart.defaults.borderColor = couleurTheme("--line");
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  Chart.defaults.animation = reduit ? false : { duration: 350 };

  const carteHistorique = document.getElementById("carte-historique");
  if (carteHistorique) {
    carteHistorique.hidden = !(state.historique && state.historique.length > 0);
  }

  fabriquesCourantes = configsDashboard(state, resultats, data);
  for (const entree of fabriquesCourantes) {
    creerGraphique(entree.id, entree.fabrique());
  }
}

/* ----------------------------------------------------------------------------
   10. MODALE « GRAPHIQUE EN PLEIN ÉCRAN » (étape 5)
   Chaque emplacement de graphique est cliquable (et actionnable au clavier) ;
   le graphique s'ouvre en grand dans une boîte de dialogue accessible.
   --------------------------------------------------------------------------- */

let graphiqueZoom = null;      // instance Chart de la modale
let focusAvantModale = null;   // pour rendre le focus à la fermeture

export function initModaleGraphiques() {
  const modale = document.getElementById("modale-graph");
  if (!modale) return;
  const boutonFermer = document.getElementById("modale-fermer");

  function fermer() {
    modale.hidden = true;
    document.body.classList.remove("no-scroll");
    if (graphiqueZoom) { graphiqueZoom.destroy(); graphiqueZoom = null; }
    if (focusAvantModale) { focusAvantModale.focus(); focusAvantModale = null; }
  }

  boutonFermer.addEventListener("click", fermer);
  modale.addEventListener("click", (e) => { if (e.target === modale) fermer(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modale.hidden) fermer();
  });

  for (const slot of document.querySelectorAll(".card--chart .chart-slot")) {
    slot.tabIndex = 0;
    slot.setAttribute("role", "button");
    slot.setAttribute("aria-label", "Agrandir le graphique en plein écran");

    const ouvrir = () => {
      const canvas = slot.querySelector("canvas");
      const entree = fabriquesCourantes?.find((c) => c.id === canvas.id);
      if (!entree || !window.Chart) return;
      focusAvantModale = document.activeElement;
      document.getElementById("modale-titre").textContent = entree.titre;
      modale.hidden = false;
      document.body.classList.add("no-scroll");
      boutonFermer.focus();
      // Le canvas n'a ses dimensions qu'une fois la modale affichée et le
      // layout calculé : on attend DEUX frames avant de dessiner, sinon
      // Chart.js peindrait dans un canvas 0×0.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (graphiqueZoom) graphiqueZoom.destroy();
        const config = entree.fabrique();
        config.options = { ...config.options, responsive: true, maintainAspectRatio: false };
        graphiqueZoom = new window.Chart(document.getElementById("chart-zoom"), config);
      }));
    };

    slot.addEventListener("click", ouvrir);
    slot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); }
    });
  }
}

/* ----------------------------------------------------------------------------
   11. v1.1 — NOTES CIBLES, COMPARATEUR « ET SI ? », RATTRAPAGE
   --------------------------------------------------------------------------- */

/** Les 4 épreuves de Terminale, cibles du mode manuel. */
const IDS_CIBLES = ["spe1", "spe2", "philo", "grand-oral"];

/**
 * Construit UNE FOIS les champs de notes cibles (écran Résultats).
 * Construits une seule fois pour ne pas perdre le focus pendant la saisie :
 * seuls les verdicts du comparateur sont recalculés à chaque frappe.
 */
export function initCibles(state, data, onChange) {
  const conteneur = $("#liste-cibles");
  conteneur.innerHTML = "";

  for (const id of IDS_CIBLES) {
    const ep = data.epreuvesTerminales.find((e) => e.id === id);
    const ligne = document.createElement("div");
    ligne.className = "note-row note-row--projete card card--flat";
    ligne.innerHTML = `
      <div class="note-row__info">
        <p class="note-row__label" id="lbl-cible-${id}"></p>
        <p class="note-row__meta">Coef ${ep.coef} · Note visée</p>
      </div>
      <div class="note-row__input">
        <input type="text" inputmode="decimal" placeholder="—" id="cible-${id}"
               aria-label="Note cible, ${ep.label ?? id}, sur 20">
        <span class="note-row__sur">/20</span>
      </div>`;
    conteneur.appendChild(ligne);

    const champ = ligne.querySelector("input");
    champ.value = versChamp(state.cibles[id]);
    champ.addEventListener("input", () => {
      const note = parseNote(champ.value, data.regles);
      champ.classList.toggle("is-invalid", champ.value.trim() !== "" && note === null);
      if (note === null) delete state.cibles[id];
      else state.cibles[id] = note;
      onChange();
    });
  }
  majLabelsCibles(state, data);
}

/** Met à jour les intitulés des cibles (les spés portent leur vrai nom). */
export function majLabelsCibles(state, data) {
  const conserves = spesConservees(state);
  const nomSpe = (id) => (data.specialites.find((s) => s.id === id) || { label: "Spécialité" }).label;
  const labels = {
    spe1: conserves[0] ? nomSpe(conserves[0]) : "Spécialité 1",
    spe2: conserves[1] ? nomSpe(conserves[1]) : "Spécialité 2",
    philo: "Philosophie",
    "grand-oral": "Grand oral",
  };
  for (const id of IDS_CIBLES) {
    const element = document.getElementById(`lbl-cible-${id}`);
    if (element) element.textContent = labels[id];
  }
}

/**
 * Comparateur A / B : A = hypothèses actuelles, B = notes cibles.
 * B est calculée en clonant l'état et en interrogeant le moteur — jamais
 * en dupliquant ses formules.
 */
function renderComparateur(state, resultats, data) {
  const a = resultats.synthese;

  /* Clone : les cibles remplacent les hypothèses d'épreuves (champ vide =
     l'hypothèse actuelle est conservée). */
  const clone = JSON.parse(JSON.stringify(state));
  for (const id of IDS_CIBLES) {
    if (state.cibles[id] !== undefined) clone.notes.epreuves[id] = state.cibles[id];
  }
  const b = calculerTout(clone, data).synthese;

  $("#comp-a-moyenne").textContent = fmt(a.moyenneProjetee, 2);
  $("#comp-a-mention").textContent = a.mentionActuelle ? a.mentionActuelle.label : "—";
  $("#comp-b-moyenne").textContent = fmt(b.moyenneProjetee, 2);
  $("#comp-b-mention").textContent = b.mentionActuelle ? b.mentionActuelle.label : "—";

  const delta = (b.moyenneProjetee ?? 0) - (a.moyenneProjetee ?? 0);
  const signe = delta > 0.005 ? "+" : "";
  $("#comp-delta").textContent =
    a.moyenneProjetee === null || b.moyenneProjetee === null || Math.abs(delta) < 0.005
      ? "="
      : `${signe}${fmt(delta, 2)}`;
}

/**
 * Carte rattrapage : visible uniquement en zone 8 ≤ moyenne < 10.
 * L'élève choisit 2 matières parmi les épreuves écrites du 1er groupe ;
 * l'app affiche les notes d'oral nécessaires pour atteindre 10/20.
 */
function renderRattrapage(state, resultats, data) {
  const carte = $("#carte-rattrapage");
  const rattrapage = simulerRattrapage(resultats.grille, data);

  carte.hidden = !rattrapage.concerne;
  if (!rattrapage.concerne) return;

  $("#rattrapage-intro").innerHTML =
    `Avec ${fmt(rattrapage.moyenne, 2)}/20 de moyenne projetée, tu passerais les oraux du
     2d groupe. Il te manque <strong>${fmt(rattrapage.pointsManquants, 0)} points</strong>
     pour atteindre 10/20 — la meilleure note (écrit ou oral) est conservée.
     Choisis les <strong>2 matières</strong> que tu repasserais :`;

  /* Chips de sélection (2 max), persistées dans state.rattrapage */
  const conteneur = $("#rattrapage-matieres");
  conteneur.innerHTML = "";
  state.rattrapage = (state.rattrapage || []).filter((id) =>
    rattrapage.matieres.some((m) => m.id === id));
  const pleines = state.rattrapage.length >= 2;

  for (const matiere of rattrapage.matieres) {
    const choisie = state.rattrapage.includes(matiere.id);
    const label = document.createElement("label");
    label.className = "chip" + (!choisie && pleines ? " chip--disabled" : "");
    label.innerHTML = `<input type="checkbox" value="${matiere.id}"
      ${choisie ? "checked" : ""} ${!choisie && pleines ? "disabled" : ""}>
      <span>${matiere.label} <small>coef ${matiere.coef} · écrit ${fmt(matiere.note)}</small></span>`;
    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) state.rattrapage.push(matiere.id);
      else state.rattrapage = state.rattrapage.filter((id) => id !== matiere.id);
      renderRattrapage(state, resultats, data); // re-render local
    });
    conteneur.appendChild(label);
  }

  /* Verdict */
  const zone = $("#rattrapage-resultat");
  if (state.rattrapage.length !== 2) {
    zone.innerHTML = `<div class="rattrapage__verdict">Sélectionne 2 matières pour
      voir les notes d'oral nécessaires. Astuce : plus le coefficient est
      élevé, moins l'oral doit être haut.</div>`;
    return;
  }

  const paire = state.rattrapage.map((id) => rattrapage.matieres.find((m) => m.id === id));
  const verdict = oralsRattrapage(paire, rattrapage.pointsManquants);
  if (verdict.faisable) {
    zone.innerHTML = `<div class="rattrapage__verdict rattrapage__verdict--ok">
      ✓ Jouable ! Notes d'oral à viser :
      ${verdict.oraux.map((o) => `<strong>${o.label} : ${fmt(o.oral)}/20</strong> (écrit : ${fmt(o.note)})`).join(" · ")}
      </div>`;
  } else {
    zone.innerHTML = `<div class="rattrapage__verdict rattrapage__verdict--ko">
      ✗ Même avec 20/20 aux deux oraux, ces matières ne suffisent pas —
      essaie une combinaison à plus forts coefficients.</div>`;
  }
}
