/* ============================================================================
   Bac Simulator — pdf.js
   ----------------------------------------------------------------------------
   EXPORT PDF : bilan complet de la simulation — identité, synthèse, grille
   des notes et coefficients, objectif, scénarios, et les 4 graphiques.

   Bibliothèque : jsPDF (window.jspdf), embarquée dans assets/libs/ →
   fonctionne hors ligne. Les graphiques sont re-rendus HORS ÉCRAN en thème
   clair forcé (lisibilité sur papier), via les mêmes fabriques que le
   tableau de bord, puis insérés en image.
   ============================================================================ */

import { configsDashboard } from "./ui.js";

/* Géométrie A4 en points : 595 × 842 */
const PAGE_LARGEUR = 595;
const PAGE_HAUTEUR = 842;
const MARGE = 48;
const LARGEUR_UTILE = PAGE_LARGEUR - 2 * MARGE;

/** Formatage français d'un nombre. */
const fmt = (x, dec = 2) =>
  x === null || x === undefined ? "—" : x.toFixed(dec).replace(".", ",");

/**
 * Rend un graphique hors écran (800×500) et renvoie son image PNG.
 * `animation: false` → le rendu est synchrone, la capture est immédiate.
 */
function imageGraphique(entree) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 500;
  const config = entree.fabrique();
  config.options = {
    ...config.options,
    responsive: false,
    animation: false,
    devicePixelRatio: 1,
  };
  // Fond blanc opaque (le canvas est transparent par défaut)
  config.plugins = [
    ...(config.plugins || []),
    { id: "fond-blanc", beforeDraw(c) {
      c.ctx.save(); c.ctx.fillStyle = "#FFFFFF";
      c.ctx.fillRect(0, 0, c.width, c.height); c.ctx.restore();
    } },
  ];
  const chart = new window.Chart(canvas, config);
  const url = canvas.toDataURL("image/png");
  chart.destroy();
  return url;
}

/**
 * Génère et télécharge le bilan PDF.
 * @param {object} state     - état de l'application
 * @param {object} resultats - sortie de calculerTout()
 * @param {object} data      - BAC_DATA
 */
export function genererPDF(state, resultats, data) {
  if (!window.jspdf || !window.Chart) {
    window.alert("L'export PDF nécessite les bibliothèques embarquées (jsPDF, Chart.js).");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const { grille, synthese, minimales, scenarios, faisabilite } = resultats;
  let y = MARGE;

  /* ---- Aides de mise en page --------------------------------------------- */
  function assurerPlace(hauteur) {
    if (y + hauteur > PAGE_HAUTEUR - MARGE - 20) { doc.addPage(); y = MARGE; }
  }
  function titreSection(texte) {
    assurerPlace(34);
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(43, 73, 195);
    doc.text(texte, MARGE, y);
    doc.setDrawColor(226, 230, 240);
    doc.line(MARGE, y + 6, PAGE_LARGEUR - MARGE, y + 6);
    y += 24;
    doc.setTextColor(24, 32, 70);
  }
  function ligneCleValeur(cle, valeur, x, largeur) {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(91, 100, 134);
    doc.text(cle, x, y);
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(24, 32, 70);
    doc.text(String(valeur), x, y + 13, { maxWidth: largeur });
  }

  /* ---- En-tête ------------------------------------------------------------ */
  doc.setFillColor(43, 73, 195);
  doc.roundedRect(MARGE, y, 34, 34, 8, 8, "F");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(255, 255, 255);
  doc.text("/20", MARGE + 17, y + 21, { align: "center" });
  doc.setFontSize(19).setTextColor(24, 32, 70);
  doc.text("Bac Simulator — Bilan de simulation", MARGE + 46, y + 15);
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(91, 100, 134);
  const nom = [state.profil.prenom, state.profil.nom].filter(Boolean).join(" ") || "Élève";
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  doc.text(
    `${nom}${state.profil.academie ? " · Académie de " + state.profil.academie : ""} · Session ${data.session} · Généré le ${date}`,
    MARGE + 46, y + 30
  );
  y += 56;

  /* ---- Synthèse ------------------------------------------------------------ */
  titreSection("Synthèse");
  const colonne = LARGEUR_UTILE / 3;
  const synthLignes = [
    ["Moyenne projetée", `${fmt(synthese.moyenneProjetee)} /20`],
    ["Points acquis (Première)", `${fmt(synthese.pointsAcquis, 1)} pts`],
    ["Points restants (max)", `${fmt(synthese.pointsRestantsMax, 0)} pts`],
    ["Coefficient total", String(synthese.coefTotal)],
    ["Mention projetée", synthese.mentionActuelle ? synthese.mentionActuelle.label : "—"],
    ["Meilleure mention possible", synthese.meilleureMentionPossible ? synthese.meilleureMentionPossible.label : "—"],
    ["Objectif", `${state.profil.objectif}/20`],
    ["Note requise en Terminale", minimales.accessible ? `${fmt(minimales.noteUniforme, 1)} /20` : "inaccessible"],
    ["Indice de faisabilité", faisabilite === null ? "—" : `${faisabilite} %`],
  ];
  for (let i = 0; i < synthLignes.length; i += 3) {
    assurerPlace(34);
    for (let j = 0; j < 3 && i + j < synthLignes.length; j++) {
      ligneCleValeur(synthLignes[i + j][0], synthLignes[i + j][1], MARGE + j * colonne, colonne - 10);
    }
    y += 34;
  }

  /* ---- Grille des notes ------------------------------------------------------ */
  titreSection("Notes et coefficients");
  const STATUTS = { acquis: "Acquis", projete: "Hypothèse", avenir: "À venir" };
  const colonnes = [
    { titre: "Matière / épreuve", x: MARGE, largeur: 250 },
    { titre: "Année", x: MARGE + 260, largeur: 70 },
    { titre: "Coef", x: MARGE + 330, largeur: 50 },
    { titre: "Note /20", x: MARGE + 380, largeur: 60 },
    { titre: "Statut", x: MARGE + 440, largeur: 60 },
  ];
  function enTeteTableau() {
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(91, 100, 134);
    for (const c of colonnes) doc.text(c.titre.toUpperCase(), c.x, y);
    y += 6;
    doc.setDrawColor(226, 230, 240);
    doc.line(MARGE, y, PAGE_LARGEUR - MARGE, y);
    y += 12;
  }
  enTeteTableau();
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(24, 32, 70);
  for (const ligne of grille) {
    assurerPlace(16);
    if (y === MARGE) enTeteTableau(); // nouvel en-tête après saut de page
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(24, 32, 70);
    doc.text(doc.splitTextToSize(ligne.label, 250)[0], colonnes[0].x, y);
    doc.text(ligne.annee === "premiere" ? "Première" : "Terminale", colonnes[1].x, y);
    doc.text(String(ligne.coef), colonnes[2].x, y);
    doc.setFont("helvetica", "bold");
    doc.text(ligne.note === null ? "—" : fmt(ligne.note), colonnes[3].x, y);
    doc.setFont("helvetica", "normal").setTextColor(91, 100, 134);
    doc.text(STATUTS[ligne.statut] || "", colonnes[4].x, y);
    doc.setTextColor(24, 32, 70);
    y += 15;
  }
  y += 6;

  /* ---- Scénarios --------------------------------------------------------------- */
  if (scenarios.length > 0) {
    titreSection(`Scénarios pour atteindre ${state.profil.objectif}/20`);
    const QUALIF = { realiste: "réaliste", ambitieux: "ambitieux", exigeant: "exigeant", impossible: "impossible", indetermine: "" };
    for (const scenario of scenarios) {
      assurerPlace(40);
      doc.setFont("helvetica", "bold").setFontSize(10.5);
      doc.text(`${scenario.nom} (${QUALIF[scenario.qualification]})`, MARGE, y);
      y += 13;
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(91, 100, 134);
      const detail = scenario.notes
        ? scenario.notes.map((n) => `${n.label} : ${fmt(n.note, 1)}`).join("   ·   ")
        : "Impossible sans dépasser 20/20 quelque part.";
      doc.text(doc.splitTextToSize(detail, LARGEUR_UTILE), MARGE, y);
      doc.setTextColor(24, 32, 70);
      y += 20;
    }
  }

  /* ---- Graphiques (thème clair forcé, rendus hors écran) ------------------------ */
  const themeAvant = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = "clair";
  const configs = configsDashboard(state, resultats, data);
  document.documentElement.dataset.theme = themeAvant;

  titreSection("Graphiques");
  const largeurImage = (LARGEUR_UTILE - 16) / 2;   // 2 par ligne
  const hauteurImage = largeurImage * 500 / 800;
  for (let i = 0; i < configs.length; i += 2) {
    assurerPlace(hauteurImage + 30);
    for (let j = 0; j < 2 && i + j < configs.length; j++) {
      const entree = configs[i + j];
      const x = MARGE + j * (largeurImage + 16);
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(24, 32, 70);
      doc.text(entree.titre, x, y);
      doc.addImage(imageGraphique(entree), "PNG", x, y + 6, largeurImage, hauteurImage);
    }
    y += hauteurImage + 30;
  }

  /* ---- Pied de page sur chaque page ------------------------------------------------ */
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(91, 100, 134);
    doc.text(
      "Simulation indicative générée par Bac Simulator — ne constitue pas un résultat officiel.",
      MARGE, PAGE_HAUTEUR - 24
    );
    doc.text(`${page} / ${totalPages}`, PAGE_LARGEUR - MARGE, PAGE_HAUTEUR - 24, { align: "right" });
  }

  doc.save("bac-simulator-bilan.pdf");
}
