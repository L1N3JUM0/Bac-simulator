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
  buildGrille, calculerSynthese, simulerRattrapage, oralsRattrapage,
  paireRattrapageValide,
} from "./calculator.js";
import {
  analyserObjectif, qualifierEffort, LIBELLES_CONFIANCE,
} from "./optimizer.js";

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
   1 bis. ANIMATION DES NOMBRES (v1.2)
   ---------------------------------------------------------------------------
   Un chiffre qui se met à jour d'un coup n'est pas lu ; un chiffre qui défile
   attire l'œil sur ce qui vient de changer. L'animation est COURTE (420 ms),
   annulable, et totalement désactivée si l'utilisateur a demandé moins de
   mouvement. La valeur finale est écrite dans tous les cas : aucune animation
   ne peut laisser un affichage faux.
   --------------------------------------------------------------------------- */

/** L'utilisateur a-t-il demandé à réduire les animations ? */
function mouvementReduit() {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** Animations en cours, indexées par élément (pour pouvoir les interrompre). */
const animations = new WeakMap();

/**
 * Fait défiler un nombre de sa valeur actuelle vers `cible`.
 * @param {HTMLElement} element
 * @param {number|null} cible
 * @param {function} formater - (valeur) => texte affiché
 */
function animerNombre(element, cible, formater) {
  if (!element) return;

  const precedent = animations.get(element);
  if (precedent) cancelAnimationFrame(precedent.frame);

  const depart = precedent ? precedent.valeur : Number(element.dataset.valeur ?? cible ?? 0);

  if (cible === null || cible === undefined || Number.isNaN(cible)) {
    animations.delete(element);
    delete element.dataset.valeur;
    element.textContent = formater(null);
    return;
  }

  // Pas d'animation si mouvement réduit, ou si l'écart est insignifiant
  if (mouvementReduit() || Math.abs(cible - depart) < 0.01) {
    animations.delete(element);
    element.dataset.valeur = String(cible);
    element.textContent = formater(cible);
    return;
  }

  const DUREE = 420;
  const debut = performance.now();
  const etat = { valeur: depart, frame: 0 };
  animations.set(element, etat);

  const pas = (maintenant) => {
    const avancement = Math.min(1, (maintenant - debut) / DUREE);
    // Sortie douce : rapide au début, se pose à la fin
    const adouci = 1 - Math.pow(1 - avancement, 3);
    etat.valeur = depart + (cible - depart) * adouci;
    element.textContent = formater(etat.valeur);

    if (avancement < 1) {
      etat.frame = requestAnimationFrame(pas);
    } else {
      animations.delete(element);
      element.dataset.valeur = String(cible);
      element.textContent = formater(cible); // valeur exacte, sans arrondi d'animation
    }
  };
  etat.frame = requestAnimationFrame(pas);
}

/**
 * Onde au point de contact sur tous les boutons (délégation : un seul écouteur
 * pour toute l'application, y compris les boutons créés plus tard).
 */
export function initMicroInteractions() {
  if (typeof document === "undefined") return;
  document.addEventListener("pointerdown", (evenement) => {
    if (mouvementReduit()) return;
    const bouton = evenement.target.closest(".btn");
    if (!bouton || bouton.disabled) return;

    const cadre = bouton.getBoundingClientRect();
    bouton.style.setProperty("--onde-x", `${evenement.clientX - cadre.left}px`);
    bouton.style.setProperty("--onde-y", `${evenement.clientY - cadre.top}px`);
    bouton.classList.remove("is-onde");
    void bouton.offsetWidth;              // force le redémarrage de l'animation
    bouton.classList.add("is-onde");
    setTimeout(() => bouton.classList.remove("is-onde"), 560);
  });
}

/** Entier avec espace fine insécable comme séparateur de milliers. */
function entier(valeur) {
  if (valeur === null || Number.isNaN(valeur)) return "—";
  return Math.round(valeur).toLocaleString("fr-FR").replace(/\u202F|\u00A0/g, "\u202F");
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
    const avant = ligne.className;
    ligne.classList.remove("note-row--acquis", "note-row--projete", "note-row--avenir");
    ligne.classList.add(`note-row--${rempli ? p.statutRempli || p.statut : "avenir"}`);

    /* v1.2 — Retour visuel : la ligne s'éclaire brièvement au moment où la
       note devient valide (et seulement à ce moment-là, pas à chaque frappe). */
    if (rempli && avant !== ligne.className && !mouvementReduit()) {
      ligne.classList.remove("is-validee");
      void ligne.offsetWidth;
      ligne.classList.add("is-validee");
      setTimeout(() => ligne.classList.remove("is-validee"), 660);
    }
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

  /* Chiffres animés */
  animerNombre($("#bandeau-moyenne"), synthese.moyenneProjetee, (v) => fmt(v, 2));
  animerNombre($("#bandeau-acquis"), synthese.pointsAcquis, (v) =>
    v === null ? "—" : `${entier(v)} pts`);

  $("#bandeau-mention").textContent = synthese.mentionActuelle
    ? synthese.mentionActuelle.court : "—";
  $("#bandeau-objectif").textContent = libelleObjectif(Number(state.profil.objectif));

  renderJauge(synthese);
}

/**
 * Barre « points du bac déjà acquis », lue sur 2 000 points.
 * Trois zones : acquis (plein), encore en jeu (hachuré), perdu/non atteignable
 * (vide). Le repère à 50 % matérialise les 1 000 points de l'admission.
 */
function renderJauge(synthese) {
  const piste = $("#jauge-barre");
  if (!piste) return;

  const partAcquise = Math.max(0, Math.min(1, synthese.partSecurisee || 0));
  const partEnJeu = Math.max(0, Math.min(1 - partAcquise, synthese.partEnJeu || 0));
  const pourcentage = Math.round(partAcquise * 100);

  $("#jauge-remplissage").style.width = `${partAcquise * 100}%`;
  $("#jauge-enjeu").style.left = `${partAcquise * 100}%`;
  $("#jauge-enjeu").style.width = `${partEnJeu * 100}%`;

  piste.setAttribute("aria-valuenow", String(pourcentage));
  piste.setAttribute(
    "aria-valuetext",
    `${entier(synthese.pointsAcquis)} points acquis sur ${entier(synthese.pointsMaxTotal)}, soit ${pourcentage} %`
  );

  animerNombre($("#jauge-texte"), synthese.pointsAcquis, (v) =>
    `${entier(v)} / ${entier(synthese.pointsMaxTotal)}`);

  /* Message honnête : on rappelle que seules les notes obtenues comptent,
     et on situe l'élève par rapport aux 1 000 points de l'admission. */
  const note = $("#jauge-note");
  if (note) {
    const manque = synthese.seuilAdmission - synthese.pointsAcquis;
    if (synthese.pointsAcquis <= 0) {
      note.textContent = "Saisis tes épreuves anticipées et tes bulletins de Première pour voir tes premiers points.";
    } else if (manque > 0) {
      note.textContent = `Il te manque ${entier(manque)} points pour atteindre les `
        + `${entier(synthese.seuilAdmission)} points de l'admission — il en reste `
        + `${entier(synthese.pointsRestantsMax)} en jeu.`;
    } else {
      note.textContent = `Les ${entier(synthese.seuilAdmission)} points de l'admission sont déjà acquis, `
        + `quoi qu'il arrive en Terminale.`;
    }
  }
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

/**
 * v1.3 — Le comparateur « Et si… » couvre désormais TOUTES les épreuves,
 * anticipées comprises. Un élève de Première veut pouvoir tester « et si
 * j'avais eu 15 au français ? » : s'en tenir aux 4 épreuves de Terminale
 * privait le simulateur de la moitié de son public.
 *
 * Les épreuves déjà notées restent affichées : la cible sert alors à simuler
 * une note différente de celle obtenue (utile avant les résultats officiels).
 */
function idsCibles(data) {
  return data.epreuvesTerminales.map((e) => e.id);
}

/**
 * Construit UNE FOIS les champs de notes cibles (écran Résultats).
 * Construits une seule fois pour ne pas perdre le focus pendant la saisie :
 * seuls les verdicts du comparateur sont recalculés à chaque frappe.
 */
export function initCibles(state, data, onChange) {
  const conteneur = $("#liste-cibles");
  conteneur.innerHTML = "";

  for (const id of idsCibles(data)) {
    const ep = data.epreuvesTerminales.find((e) => e.id === id);
    const anticipee = ep.annee === "premiere";
    const ligne = document.createElement("div");
    ligne.className = "note-row note-row--projete card card--flat";
    ligne.innerHTML = `
      <div class="note-row__info">
        <p class="note-row__label" id="lbl-cible-${id}"></p>
        <p class="note-row__meta">Coef ${ep.coef} · ${anticipee ? "Épreuve anticipée" : "Note visée"}</p>
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
  };
  for (const id of idsCibles(data)) {
    const element = document.getElementById(`lbl-cible-${id}`);
    if (!element) continue;
    const ep = data.epreuvesTerminales.find((e) => e.id === id);
    element.textContent = labels[id] || (ep ? ep.label : id);
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
  /* v1.2 — On ne clone plus l'état entier et on ne relance plus calculerTout()
     (qui recalculait scénarios et conseils pour rien) : seules les notes
     d'épreuves changent, et seule la synthèse est affichée. Coût divisé par
     ~10 à chaque frappe. */
  const clone = {
    ...state,
    notes: { ...state.notes, epreuves: { ...state.notes.epreuves } },
  };
  for (const id of idsCibles(data)) {
    if (state.cibles[id] !== undefined) clone.notes.epreuves[id] = state.cibles[id];
  }
  const b = calculerSynthese(buildGrille(clone, data), data);

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

  /* v1.2 — On mémorise la case qui avait le focus AVANT de reconstruire la
     liste : sans cela, le focus retombait sur <body> à chaque coche et il
     devenait impossible de sélectionner deux matières au clavier. */
  const focusAvant = document.activeElement;
  const idFocus = focusAvant && conteneur.contains(focusAvant) ? focusAvant.value : null;

  conteneur.innerHTML = "";
  state.rattrapage = (state.rattrapage || []).filter((id) =>
    rattrapage.matieres.some((m) => m.id === id));
  const pleines = state.rattrapage.length >= 2;

  for (const matiere of rattrapage.matieres) {
    const choisie = state.rattrapage.includes(matiere.id);

    /* Règle 2027 : maths anticipée et spécialité mathématiques ne peuvent pas
       être les deux oraux. On désactive la seconde dès que la première est
       cochée, plutôt que de laisser faire puis afficher une erreur. */
    let incompatible = false;
    if (!choisie && state.rattrapage.length === 1) {
      const dejaChoisie = rattrapage.matieres.find((m) => m.id === state.rattrapage[0]);
      incompatible = dejaChoisie
        ? !paireRattrapageValide([dejaChoisie, matiere]).valide
        : false;
    }
    const bloquee = !choisie && (pleines || incompatible);

    const label = document.createElement("label");
    label.className = "chip" + (bloquee ? " chip--disabled" : "");
    if (incompatible) {
      label.title = "Incompatible avec la matière déjà sélectionnée "
                  + "(maths anticipée et spécialité mathématiques s'excluent).";
    }
    label.innerHTML = `<input type="checkbox" value="${matiere.id}"
      ${choisie ? "checked" : ""} ${bloquee ? "disabled" : ""}>
      <span>${matiere.label} <small>coef ${matiere.coef} · écrit ${fmt(matiere.note)}</small></span>`;
    label.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) state.rattrapage.push(matiere.id);
      else state.rattrapage = state.rattrapage.filter((id) => id !== matiere.id);
      renderRattrapage(state, resultats, data); // re-render local
    });
    conteneur.appendChild(label);
  }

  /* Restitution du focus sur la même case (ou, si elle est devenue
     désactivée, sur la première case encore actionnable). */
  if (idFocus) {
    const memeCase = conteneur.querySelector(`input[value="${idFocus}"]`);
    if (memeCase && !memeCase.disabled) memeCase.focus();
    else {
      const secours = conteneur.querySelector("input:not(:disabled)");
      if (secours) secours.focus();
    }
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

  /* Garde-fou : une sauvegarde antérieure peut contenir une paire devenue
     interdite. On le dit clairement plutôt que d'afficher un calcul faux. */
  const legalite = paireRattrapageValide(paire);
  if (!legalite.valide && legalite.message) {
    zone.innerHTML = `<div class="rattrapage__verdict rattrapage__verdict--ko">
      ✗ ${legalite.message}</div>`;
    return;
  }

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

/* ----------------------------------------------------------------------------
   12. v1.3 — ÉCRAN STRATÉGIE
   ---------------------------------------------------------------------------
   Tout le calcul vient d'optimizer.js. Cette section ne fait qu'afficher, et
   surtout : elle EXPLIQUE. Un chiffre sans raisonnement ne sert à rien à un
   élève — chaque chemin proposé dit d'où il vient.
   --------------------------------------------------------------------------- */

/** Objectif actuellement optimisé (indépendant de l'objectif du profil).
    Conservé dans state.ui pour survivre à un rechargement de la page. */
let objectifStrategie = null;

/** Référence à l'état courant, pour les écouteurs construits une seule fois. */
let etatCourant = null;

/** Rend l'écran Stratégie complet. */
export function renderStrategie(state, resultats, data, onChange) {
  const conteneur = $("#ecran-strategie");
  if (!conteneur) return;

  const seuils = data.mentions.map((m) => m.seuil).filter((s) => s >= 10);
  if (objectifStrategie === null) {
    objectifStrategie = Number(state.ui.objectifStrategie)
      || Number(state.profil.objectif) || 12;
  }
  if (!seuils.includes(objectifStrategie)) seuils.push(objectifStrategie);
  seuils.sort((a, b) => a - b);

  etatCourant = state;
  renderObjectifsStrategie(seuils, data, onChange);

  const analyse = analyserObjectif(
    objectifStrategie, resultats.grille, resultats.synthese, state
  );

  renderRequis(analyse, resultats.synthese);
  renderConfiance(analyse, state, onChange);
  renderChemins(analyse);
  renderRentabilite(analyse, resultats.synthese);
}

/** Sélecteur d'objectif : on optimise pour n'importe quelle mention. */
function renderObjectifsStrategie(seuils, data, onChange) {
  const zone = $("#strategie-objectifs");
  if (!zone || zone.dataset.construit === "1") {
    if (zone) majSelectionObjectif(zone);
    return;
  }
  zone.innerHTML = "";
  for (const seuil of seuils) {
    const mention = data.mentions.find((m) => m.seuil === seuil);
    const label = document.createElement("label");
    label.className = "chip";
    label.innerHTML = `<input type="radio" name="strategie-objectif" value="${seuil}">
      <span>${mention ? mention.court : `${seuil}/20`} <small>≥ ${seuil}</small></span>`;
    label.querySelector("input").addEventListener("change", () => {
      objectifStrategie = seuil;
      etatCourant.ui.objectifStrategie = seuil;   // mémorisé d'une visite à l'autre
      onChange();
    });
    zone.appendChild(label);
  }
  zone.dataset.construit = "1";
  majSelectionObjectif(zone);
}

function majSelectionObjectif(zone) {
  for (const entree of zone.querySelectorAll("input")) {
    entree.checked = Number(entree.value) === objectifStrategie;
  }
}

/** Rappel chiffré de ce qu'il reste à aller chercher. */
function renderRequis(analyse, synthese) {
  const zone = $("#strategie-requis");
  if (!zone) return;

  const { requis } = analyse;
  if (requis.coefLeviers === 0) {
    zone.textContent = "Toutes tes notes sont saisies : il n'y a plus rien à optimiser.";
    return;
  }
  const moyenneNecessaire = requis.surLeviers / requis.coefLeviers;
  if (requis.surLeviers <= 0) {
    zone.textContent = `Objectif déjà tenu par tes notes actuelles : `
      + `${entier(requis.pointsFixes)} points sont acquis ou projetés sur les `
      + `${entier(requis.total)} nécessaires.`;
    return;
  }
  zone.textContent =
    `Il te reste ${entier(requis.surLeviers)} points à aller chercher sur `
    + `${requis.coefLeviers} coefficients, soit ${fmt(moyenneNecessaire, 2)} de moyenne `
    + `sur ce qu'il te reste à passer.`;
}

/** Curseur de confiance : trois crans par matière encore en jeu. */
function renderConfiance(analyse, state, onChange) {
  const zone = $("#liste-confiance");
  if (!zone) return;

  /* Reconstruction complète seulement si la liste des leviers a changé —
     sinon on perd le focus à chaque clic. */
  const empreinte = analyse.leviers.map((l) => l.id).join("|");
  if (zone.dataset.empreinte === empreinte) {
    for (const groupe of zone.querySelectorAll("[data-levier]")) {
      const courant = state.confiance[groupe.dataset.levier] || "neutre";
      for (const bouton of groupe.querySelectorAll("button")) {
        const actif = bouton.dataset.niveau === courant;
        bouton.classList.toggle("is-actif", actif);
        bouton.setAttribute("aria-pressed", String(actif));
      }
    }
    return;
  }

  zone.innerHTML = "";
  if (analyse.leviers.length === 0) {
    zone.innerHTML = `<p class="ecran__sub">Plus aucune note à venir : tout est déjà saisi.</p>`;
    zone.dataset.empreinte = empreinte;
    return;
  }

  for (const levier of analyse.leviers) {
    const ligne = document.createElement("div");
    ligne.className = "confiance-row";
    ligne.dataset.levier = levier.id;

    const niveaux = ["fort", "neutre", "fragile"].map((niveau) => {
      const actif = (state.confiance[levier.id] || "neutre") === niveau;
      return `<button type="button" class="confiance-btn${actif ? " is-actif" : ""}"
        data-niveau="${niveau}" aria-pressed="${actif}">${LIBELLES_CONFIANCE[niveau]}</button>`;
    }).join("");

    ligne.innerHTML = `
      <div class="confiance-row__info">
        <p class="confiance-row__label">${levier.label}</p>
        <p class="confiance-row__meta">Coef ${levier.coef} · niveau de départ estimé ${fmt(levier.base, 1)}</p>
      </div>
      <div class="confiance-row__choix" role="group"
           aria-label="Niveau en ${levier.label}">${niveaux}</div>`;

    ligne.querySelectorAll("button").forEach((bouton) => {
      bouton.addEventListener("click", () => {
        state.confiance[levier.id] = bouton.dataset.niveau;
        onChange();
        /* Le focus reste sur le bouton cliqué : la liste n'est pas reconstruite */
        bouton.focus();
      });
    });
    zone.appendChild(ligne);
  }
  zone.dataset.empreinte = empreinte;
}

/** Les trois chemins, du plus facile au plus exigeant. */
function renderChemins(analyse) {
  const zone = $("#liste-strategies");
  if (!zone) return;
  zone.innerHTML = "";

  if (analyse.leviers.length === 0) {
    zone.innerHTML = `<p class="ecran__sub">Aucun levier disponible.</p>`;
    return;
  }

  analyse.strategies.forEach((strategie, rang) => {
    const effort = qualifierEffort(strategie.effortMoyen, strategie.faisable);
    const carte = document.createElement("article");
    carte.className = `strat card card--flat strat--${effort.niveau}`
      + (rang === 0 && strategie.faisable ? " strat--recommandee" : "");

    const titres = [strategie.label, ...(strategie.labelsFusionnes || [])].join(" · ");

    const lignes = strategie.notes
      .slice()
      .sort((a, b) => b.coef - a.coef)
      .map((n) => {
        const signe = n.delta > 0.05 ? `+${fmt(n.delta, 1)}` : "=";
        return `<li class="strat__note">
          <span class="strat__matiere">${n.label}</span>
          <span class="strat__meta">coef ${n.coef}</span>
          <strong class="strat__valeur num">${fmt(n.note, 1)}</strong>
          <span class="strat__delta">${signe}</span>
        </li>`;
      }).join("");

    const entete = rang === 0 && strategie.faisable
      ? `<p class="strat__rang">Chemin le plus facile</p>` : "";

    const verdict = strategie.faisable
      ? `<p class="strat__detail">${effort.detail}</p>`
      : `<p class="strat__detail">Il manque ${entier(strategie.manque)} points, `
        + `même avec 20 partout.</p>`;

    carte.innerHTML = `
      ${entete}
      <header class="strat__entete">
        <h3 class="strat__titre">${titres}</h3>
        <span class="strat__badge strat__badge--${effort.niveau}">${effort.label}</span>
      </header>
      <p class="strat__description">${strategie.description}</p>
      <ul class="strat__notes">${lignes}</ul>
      ${verdict}`;
    zone.appendChild(carte);
  });
}

/** Classement de rentabilité : où un point rapporte le plus. */
function renderRentabilite(analyse, synthese) {
  const zone = $("#liste-rentabilite");
  if (!zone) return;
  zone.innerHTML = "";

  const medailles = ["🥇", "🥈", "🥉"];
  const top = analyse.rentabilite.slice(0, 5);

  for (const [rang, levier] of top.entries()) {
    const element = document.createElement("li");
    element.className = "rentab__item";
    element.innerHTML = `
      <span class="rentab__rang" aria-hidden="true">${medailles[rang] || "•"}</span>
      <span class="rentab__label">${levier.label}
        <small>coef ${levier.coef} · ${LIBELLES_CONFIANCE[levier.confiance].toLowerCase()}</small></span>
      <span class="rentab__gain">+1 point&nbsp;=&nbsp;<strong>+${fmt(levier.gainMoyenne, 2)}</strong>
        <small>sur ta moyenne</small></span>`;
    zone.appendChild(element);
  }

  const note = $("#rentab-note");
  if (!note) return;
  if (top.length === 0) {
    note.textContent = "";
    return;
  }
  const premier = top[0];
  const dernier = top[top.length - 1];
  const rapport = dernier.rendement > 0 ? premier.rendement / dernier.rendement : 1;
  note.textContent = rapport > 1.2
    ? `À effort égal, un point gagné en ${premier.label} te rapporte `
      + `${fmt(rapport, 1)} fois plus qu'en ${dernier.label}.`
    : `Tes matières restantes ont un rendement comparable : aucune ne mérite `
      + `d'être sacrifiée aux autres.`;
}
