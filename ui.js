/* ============================================================================
   Bac Simulator — ui.js
   ----------------------------------------------------------------------------
   COUCHE DE RENDU : construit le DOM dynamique (spécialités, options, lignes
   de notes adaptées au parcours) et affiche les résultats.

   Règle d'or : ui.js LIT l'état et les résultats produits par calculator.js,
   il ne calcule jamais lui-même (à part du formatage d'affichage).

   Les graphiques Chart.js arrivent à l'étape 4.
   ============================================================================ */

import { parseNote, normaliserNote } from "./calculator.js";

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
    const enTrimestres = state.saisieCC === "trimestres";

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

  /* Avertissement : lignes supposées (moyennes manquantes) */
  const avertissement = $("#res-avertissement");
  if (minimales.lignesSupposees.length > 0) {
    avertissement.textContent = `${minimales.lignesSupposees.length} moyenne(s) non renseignée(s) : `
      + `elles sont supposées égales à ${fmt(minimales.hypotheseDefaut)}/20 dans le calcul de l'objectif.`;
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
