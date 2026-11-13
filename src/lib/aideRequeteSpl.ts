/**
 * Les tableaux de l'aide de la « Requête avancée » des playlists
 * intelligentes (AideRequeteSplV2) : chaque ligne associe une ÉCRITURE de la
 * grammaire du serveur (tune-smart-http/src/requete_texte.rs) à la clé qui
 * l'explique. Les écritures ne se traduisent pas : un utilisateur allemand
 * tape `annee:1955..1965`, pas sa traduction.
 */
/** La page complète du guide sur le site (lien « Documentation complète »). */
export const DOC_REQUETE_AVANCEE = 'https://mozaiklabs.fr/docs/smart-playlist-query';

export type Ligne = { ecriture: string; labelKey: string };

export const OPERATEURS: Ligne[] = [
  { ecriture: ':', labelKey: 'v2.spl.reqDoc.opDeuxPoints' },
  { ecriture: '=', labelKey: 'v2.spl.reqDoc.opEgal' },
  { ecriture: '!=', labelKey: 'v2.spl.reqDoc.opDifferent' },
  { ecriture: '>  >=  <  <=', labelKey: 'v2.spl.reqDoc.opCompare' },
  { ecriture: 'annee:1955..1965', labelKey: 'v2.spl.reqDoc.opPlage' },
];

export const COMBINAISONS: Ligne[] = [
  { ecriture: 'a b · a et b · and · &', labelKey: 'v2.spl.reqDoc.coEt' },
  { ecriture: 'a ou b · or · |', labelKey: 'v2.spl.reqDoc.coOu' },
  { ecriture: 'non a · not · ! · -a', labelKey: 'v2.spl.reqDoc.coNon' },
  { ecriture: '( … )', labelKey: 'v2.spl.reqDoc.coGroupe' },
];

export const GROUPES: { titreKey: string; lignes: Ligne[] }[] = [
  {
    titreKey: 'v2.spl.reqDoc.titreTexte',
    lignes: [
      { ecriture: 'titre', labelKey: 'v2.spl.reqDoc.chTitre' },
      { ecriture: 'artiste', labelKey: 'v2.spl.reqDoc.chArtiste' },
      { ecriture: 'interprete', labelKey: 'v2.spl.reqDoc.chInterprete' },
      { ecriture: 'artiste_album', labelKey: 'v2.spl.reqDoc.chArtisteAlbum' },
      { ecriture: 'album', labelKey: 'v2.spl.reqDoc.chAlbum' },
      { ecriture: 'genre', labelKey: 'v2.spl.reqDoc.chGenre' },
      { ecriture: 'compositeur', labelKey: 'v2.spl.reqDoc.chCompositeur' },
      { ecriture: 'chef', labelKey: 'v2.spl.reqDoc.chChef' },
      { ecriture: 'ensemble · orchestre', labelKey: 'v2.spl.reqDoc.chEnsemble' },
      { ecriture: 'oeuvre', labelKey: 'v2.spl.reqDoc.chOeuvre' },
      { ecriture: 'label', labelKey: 'v2.spl.reqDoc.chLabel' },
      { ecriture: 'format', labelKey: 'v2.spl.reqDoc.chFormat' },
      { ecriture: 'version', labelKey: 'v2.spl.reqDoc.chVersion' },
      { ecriture: 'commentaire', labelKey: 'v2.spl.reqDoc.chCommentaire' },
      { ecriture: 'source', labelKey: 'v2.spl.reqDoc.chSource' },
      { ecriture: 'dossier', labelKey: 'v2.spl.reqDoc.chDossier' },
    ],
  },
  {
    titreKey: 'v2.spl.reqDoc.titreNombre',
    lignes: [
      { ecriture: 'annee', labelKey: 'v2.spl.reqDoc.chAnnee' },
      { ecriture: 'annee_originale', labelKey: 'v2.spl.reqDoc.chAnneeOriginale' },
      { ecriture: 'frequence', labelKey: 'v2.spl.reqDoc.chFrequence' },
      { ecriture: 'bits', labelKey: 'v2.spl.reqDoc.chBits' },
      { ecriture: 'duree', labelKey: 'v2.spl.reqDoc.chDuree' },
      { ecriture: 'pistes', labelKey: 'v2.spl.reqDoc.chPistes' },
      { ecriture: 'numero', labelKey: 'v2.spl.reqDoc.chNumero' },
      { ecriture: 'disque', labelKey: 'v2.spl.reqDoc.chDisque' },
      { ecriture: 'bpm', labelKey: 'v2.spl.reqDoc.chBpm' },
      { ecriture: 'note', labelKey: 'v2.spl.reqDoc.chNote' },
      { ecriture: 'note_album', labelKey: 'v2.spl.reqDoc.chNoteAlbum' },
      { ecriture: 'ecoutes', labelKey: 'v2.spl.reqDoc.chEcoutes' },
    ],
  },
  {
    titreKey: 'v2.spl.reqDoc.titreDate',
    lignes: [
      { ecriture: 'ajout · ajoute', labelKey: 'v2.spl.reqDoc.chAjout' },
      { ecriture: 'derniere_ecoute', labelKey: 'v2.spl.reqDoc.chDerniereEcoute' },
    ],
  },
  {
    titreKey: 'v2.spl.reqDoc.titreAutres',
    lignes: [
      { ecriture: 'favori', labelKey: 'v2.spl.reqDoc.chFavori' },
      { ecriture: 'favori:album · favori:artiste', labelKey: 'v2.spl.reqDoc.chFavoriAlbum' },
      { ecriture: 'jamais_ecoute', labelKey: 'v2.spl.reqDoc.chJamaisEcoute' },
      { ecriture: 'etiquette:7', labelKey: 'v2.spl.reqDoc.chEtiquette' },
      { ecriture: 'collection:… · playlist:…', labelKey: 'v2.spl.reqDoc.chCollection' },
      { ecriture: 'hires:verifie · conforme · douteux · non_analyse', labelKey: 'v2.spl.reqDoc.chHires' },
      { ecriture: 'ia:oui · ia:non', labelKey: 'v2.spl.reqDoc.chIa' },
      { ecriture: 'pochette:vide', labelKey: 'v2.spl.reqDoc.chPochette' },
    ],
  },
  {
    titreKey: 'v2.spl.reqDoc.titreCredits',
    lignes: [
      { ecriture: 'credit(artiste: "Bill Evans", instrument: piano)', labelKey: 'v2.spl.reqDoc.chCredit' },
    ],
  },
];

export const DATES: Ligne[] = [
  { ecriture: 'derniere_ecoute:30j', labelKey: 'v2.spl.reqDoc.daJours' },
  { ecriture: 'derniere_ecoute:jamais', labelKey: 'v2.spl.reqDoc.daJamais' },
  { ecriture: 'derniere_ecoute<2025-01-01', labelKey: 'v2.spl.reqDoc.daAvant' },
  { ecriture: 'ajout>2026-10-01', labelKey: 'v2.spl.reqDoc.daApres' },
  { ecriture: 'ajout:2026-01-01..2026-06-30', labelKey: 'v2.spl.reqDoc.daPlage' },
];

export const EXEMPLES: Ligne[] = [
  { ecriture: 'genre:jazz annee:1955..1965', labelKey: 'v2.spl.reqDoc.exJazz' },
  { ecriture: 'credit(artiste: "Bill Evans", instrument: piano)', labelKey: 'v2.spl.reqDoc.exBillEvans' },
  { ecriture: 'favori jamais_ecoute', labelKey: 'v2.spl.reqDoc.exFavoris' },
  { ecriture: '(compositeur:Bach ou compositeur:Haendel) duree>10min', labelKey: 'v2.spl.reqDoc.exBach' },
  { ecriture: 'ecoutes>=5 derniere_ecoute<2025-01-01', labelKey: 'v2.spl.reqDoc.exOublies' },
  { ecriture: 'bits:24 frequence>=88200 non hires:douteux', labelKey: 'v2.spl.reqDoc.exHires' },
  { ecriture: 'genre:classique non credit(role: producer)', labelKey: 'v2.spl.reqDoc.exClassique' },
  { ecriture: 'ajout:30j source:local', labelKey: 'v2.spl.reqDoc.exAjouts' },
];
