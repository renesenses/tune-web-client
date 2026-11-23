<script lang="ts">
  /**
   * Les pictogrammes de l'écran « État du serveur » (maquette de Levente,
   * 15/11/2026). Trait `currentColor`, 24 × 24 : la couleur vient du jeton
   * de l'élément parent, clair comme sombre. Décoratifs (`aria-hidden`) :
   * chaque carte porte déjà son titre en texte.
   */
  let { nom, taille = 22 }: { nom: string; taille?: number } = $props();

  const TRACES: Record<string, string[]> = {
    // Analyse de la bibliothèque : un livre ouvert.
    scan: ['M2 5.5c3-1.3 6.5-1.3 10 .8 3.5-2.1 7-2.1 10-.8V19c-3-1.3-6.5-1.3-10 .8-3.5-2.1-7-2.1-10-.8z', 'M12 6.3v13.5'],
    // Analyses du signal (CLAP, plage dynamique) : une onde.
    onde: ['M2 12h3', 'M5 12l2-6 3 12 3-15 3 15 2-6', 'M18 12h4'],
    // ReplayGain : des barres de niveau.
    niveaux: ['M5 20V11', 'M9 20V6', 'M13 20V9', 'M17 20V13', 'M21 20V4'],
    // Empreintes (audio et AcoustID).
    empreinte: ['M6.5 6.8A7.5 7.5 0 0 1 19.5 12v2', 'M4.5 10.5A7.5 7.5 0 0 0 4.5 13', 'M8.5 19.5c.9-2 1.5-4.4 1.5-7a2 2 0 0 1 4 0c0 3-.6 5.7-1.6 8', 'M16.5 18.8c.4-1.3.7-2.8.9-4.3', 'M7 12.5c0 1.8-.3 3.4-.9 4.8'],
    // Enrichissement des métadonnées : des couches.
    couches: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5'],
    // Portraits d'artistes.
    portrait: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c1-4 4.5-6 8-6s7 2 8 6'],
    // Pochettes d'albums.
    image: ['M4 4h16v16H4z', 'M4 16l5-5 4 4 2.5-2.5L20 17', 'M15.5 9.5a1.5 1.5 0 1 0 0-.01'],
    // Logos de labels.
    etiquette: ['M3 12V4h8l10 10-8 8z', 'M7.5 8.5a1 1 0 1 0 0-.01'],
    // Bandeau : en ligne, albums, titres, taille.
    valide: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M7.5 12.5l3 3 6-6.5'],
    alerte: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 7v6', 'M12 16.5v.01'],
    note: ['M9 18V5l11-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
    disque: ['M3 6h18v12H3z', 'M7 14h.01', 'M11 14h6'],
    // Blocs du bas.
    thermometre: ['M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z', 'M12 17.5v-6'],
    hautParleur: ['M4 9h4l5-4v14l-5-4H4z', 'M16.5 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12'],
    journal: ['M6 2h9l5 5v15H6z', 'M14 2v6h6', 'M9 13h7', 'M9 17h7'],
    wifi: ['M2 8.5a15 15 0 0 1 20 0', 'M5.5 12a10 10 0 0 1 13 0', 'M9 15.5a5 5 0 0 1 6 0', 'M12 19h.01'],
    actualiser: ['M20 11a8 8 0 0 0-14.6-4.5L3 9', 'M3 4v5h5', 'M4 13a8 8 0 0 0 14.6 4.5L21 15', 'M21 20v-5h-5'],
    puce: ['M7 7h10v10H7z', 'M10 2v3', 'M14 2v3', 'M10 19v3', 'M14 19v3', 'M2 10h3', 'M2 14h3', 'M19 10h3', 'M19 14h3'],
  };

  /** Identifiant de carte → pictogramme. Une carte inconnue reçoit la puce. */
  const PAR_CARTE: Record<string, string> = {
    scan: 'scan', clap: 'onde', rg: 'niveaux', dr: 'onde', fp: 'empreinte', acoustid: 'empreinte',
    enrich: 'couches', covers: 'portrait', albumCovers: 'image', labelLogos: 'etiquette',
  };

  const traces = $derived(TRACES[nom] ?? TRACES[PAR_CARTE[nom] ?? 'puce']);
</script>

<svg class="icone-etat" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  {#each traces as d (d)}<path {d} />{/each}
</svg>

<style>
  .icone-etat{flex:none; display:block}
</style>
