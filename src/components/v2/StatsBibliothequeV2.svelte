<!--
  STATISTIQUES DE LA BIBLIOTHÈQUE — web#2653 (serveur : tune-server-rust#7849).

  Quatre répartitions de `GET /library/stats` (`distributions`) : formats,
  fréquences d'échantillonnage (kHz), décennies, rôles de crédit (pistes et
  personnes). Chaque barre donne la valeur exacte et son pourcentage ;
  l'inconnu est affiché tel quel, en dernier.

  Un clic ouvre la Bibliothèque filtrée quand le filtre existe déjà : Format
  et Fréquence (`pendingLibraryFiltre`). Il n'y a pas de filtre par décennie
  ni par rôle : ces barres ne sont pas cliquables.

  web#2782 — `embarquee` : l'écran est rendu DANS la Bibliothèque, sous sa
  barre d'onglets (l'onglet « Statistiques ») ; il n'y porte pas de titre.

  Serveur plus ancien (clé absente) ou lecture échouée côté serveur (`null`) :
  l'écran le dit, sans planter. La logique est dans
  `lib/repartitionsBibliotheque`, testée sans Svelte.

  Go du 13/11 — chaque carte Artistes / Genres porte un champ de recherche
  qui cherche dans TOUT le classement (`GET /library/stats/rankings`), pas
  seulement dans les cent premiers affichés ; chaque ligne montre son rang
  dans le classement complet. Un clic sur un nom ouvre la page de l'artiste
  (`ouvrirArtisteDepuis`) ou le genre dans la Bibliothèque
  (`tune:v2-facette`, le chemin du panneau Genres et des Favoris).
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import * as api from '../../lib/api';
  import { t, tn, locale } from '../../lib/i18n';
  import { activeView, pendingLibraryFiltre } from '../../lib/stores/navigation';
  import {
    CLES_REPARTITION, lireRepartitions, lignesRepartition,
    type CleRepartition, type FiltreBibliotheque, type LigneRepartition, type Repartitions,
  } from '../../lib/repartitionsBibliotheque';
  // tune-server-rust#8264 — artistes et genres classés par nombre de pistes.
  import {
    CLES_CLASSEMENT, PARAM_CLASSEMENT, estTronque, filtrerLocalement, lireClassements, lireRecherche, numeroter,
    type CleClassement, type Classements, type EntreeTrouvee, type ResultatRecherche,
  } from '../../lib/classementsBibliotheque';
  import { ouvrirArtisteDepuis } from '../../lib/ouvrirArtisteDepuis';

  const TITRES: Record<CleRepartition, string> = {
    by_codec: 'statsBibliotheque.codecs',
    by_sample_rate: 'statsBibliotheque.frequences',
    by_decade: 'statsBibliotheque.decennies',
    by_credit_role: 'statsBibliotheque.roles',
  };
  const TITRES_CLASSEMENT: Record<CleClassement, string> = {
    by_artist: 'statsBibliotheque.artistes',
    by_genre: 'statsBibliotheque.genres',
  };

  let { embarquee = false }: { embarquee?: boolean } = $props();

  let etat = $state<'chargement' | 'pret' | 'indisponible' | 'erreur'>('chargement');
  let repartitions = $state<Repartitions | null>(null);
  let totaux = $state<{ tracks: number; albums: number; artists: number } | null>(null);
  let classements = $state<Classements | null>(null);

  // Go du 13/11 — la recherche de chaque carte de classement.
  const PLACEHOLDERS: Record<CleClassement, string> = {
    by_artist: 'statsBibliotheque.chercherArtiste',
    by_genre: 'statsBibliotheque.chercherGenre',
  };
  let recherche = $state<Record<CleClassement, string>>({ by_artist: '', by_genre: '' });
  let resultats = $state<Record<CleClassement, ResultatRecherche | null>>({ by_artist: null, by_genre: null });
  /** La recherche s'est repliée sur les entrées reçues (serveur plus ancien). */
  let rechercheLocale = $state<Record<CleClassement, boolean>>({ by_artist: false, by_genre: false });
  const minuteries: Partial<Record<CleClassement, ReturnType<typeof setTimeout>>> = {};
  const jetons: Record<CleClassement, number> = { by_artist: 0, by_genre: 0 };

  function surRecherche(cle: CleClassement, valeur: string) {
    recherche[cle] = valeur;
    clearTimeout(minuteries[cle]);
    if (!valeur.trim()) {
      jetons[cle]++;
      resultats[cle] = null;
      rechercheLocale[cle] = false;
      return;
    }
    minuteries[cle] = setTimeout(() => void chercher(cle, valeur), 250);
  }

  async function chercher(cle: CleClassement, q: string) {
    const jeton = ++jetons[cle];
    let r: ResultatRecherche | null = null;
    let locale_ = false;
    try {
      r = lireRecherche(await api.chercherClassement(PARAM_CLASSEMENT[cle], q.trim()));
    } catch {
      r = null;
    }
    if (!r) {
      const c = classements?.[cle];
      if (c) { r = filtrerLocalement(c, q); locale_ = true; }
    }
    // Une frappe plus récente a pris la main : cette réponse est périmée.
    if (jeton !== jetons[cle]) return;
    resultats[cle] = r;
    rechercheLocale[cle] = locale_;
  }

  async function ouvrirEntree(cle: CleClassement, valeur: string) {
    if (cle === 'by_artist') {
      await ouvrirArtisteDepuis({ name: valeur }, 'library');
      return;
    }
    activeView.set('library');
    await tick();
    window.dispatchEvent(new CustomEvent('tune:v2-facette', { detail: { onglet: 'genres', valeur } }));
  }

  onMount(async () => {
    try {
      const s = await api.getLibraryStats();
      totaux = { tracks: s?.tracks ?? 0, albums: s?.albums ?? 0, artists: s?.artists ?? 0 };
      repartitions = lireRepartitions(s);
      classements = lireClassements(s);
      etat = repartitions ? 'pret' : 'indisponible';
    } catch {
      etat = 'erreur';
    }
  });

  function libelleRole(role: string): string {
    const cle = `credits.${role}`;
    const traduit = $t(cle as any);
    return traduit && traduit !== cle ? traduit : role.charAt(0).toUpperCase() + role.slice(1);
  }

  function lignes(cle: CleRepartition): LigneRepartition[] {
    if (!repartitions) return [];
    return lignesRepartition(cle, repartitions[cle], $locale, {
      inconnu: $t('statsBibliotheque.inconnu' as any),
      decennie: $t('statsBibliotheque.decennie' as any),
      role: libelleRole,
    });
  }

  function nombre(n: number): string {
    try { return new Intl.NumberFormat($locale).format(n); } catch { return String(n); }
  }

  const texteTotaux = $derived(totaux
    ? $t('statsBibliotheque.totaux' as any)
      .replace('{tracks}', nombre(totaux.tracks))
      .replace('{albums}', nombre(totaux.albums))
      .replace('{artists}', nombre(totaux.artists))
    : null);

  function filtrer(f: FiltreBibliotheque) {
    pendingLibraryFiltre.set(f);
    activeView.set('library');
  }
</script>

<section class="v2-stats-biblio tune-v2" class:embarquee data-stats-bibliotheque>
  {#if !embarquee}
    <header class="v2-top">
      <div class="v2-titres">
        <h1>{$t('statsBibliotheque.titre' as any)}</h1>
      </div>
      {#if texteTotaux}
        <div class="v2-actions">
          <div class="meta">{texteTotaux}</div>
        </div>
      {/if}
    </header>
  {/if}
  <div class="scroll">
    {#if embarquee && texteTotaux}<div class="meta solo">{texteTotaux}</div>{/if}
    {#if etat === 'chargement'}
      <p class="etat">{$t('v2.common.loading' as any)}</p>
    {:else if etat === 'erreur'}
      <p class="etat err">{$t('statsBibliotheque.erreur' as any)}</p>
    {:else if etat === 'indisponible'}
      <p class="etat" data-stats-indisponible>{$t('statsBibliotheque.indisponible' as any)}</p>
    {:else}
      <div class="grille">
        {#each CLES_REPARTITION as cle (cle)}
          {@const ls = lignes(cle)}
          {@const max = ls.reduce((m, l) => Math.max(m, l.tracks), 0)}
          <article class="repartition" data-repartition={cle}>
            <h2>{$t(TITRES[cle] as any)}</h2>
            {#if cle === 'by_credit_role'}
              <p class="aide">{$t('statsBibliotheque.rolesAide' as any)}</p>
            {/if}
            {#if !ls.length}
              <p class="etat">{$t('statsBibliotheque.vide' as any)}</p>
            {:else}
              <ul class="barres">
                {#each ls as l, i (i)}
                  {@const filtre = l.filtre}
                  <li class:inconnu={l.inconnu}>
                    {#if filtre}
                      <button class="nom cliquable" data-filtre title={$t('statsBibliotheque.filtrer' as any)}
                        onclick={() => filtrer(filtre)}>{l.label}</button>
                    {:else}
                      <span class="nom" title={l.label}>{l.label}</span>
                    {/if}
                    <span class="piste"><span class="jauge" style:width="{max ? Math.max((l.tracks / max) * 100, 1) : 0}%"></span></span>
                    <span class="val" data-valeur>
                      {$t('statsBibliotheque.pistes' as any).replace('{n}', l.tracksTexte)}
                      {#if l.peopleTexte !== undefined}
                        · {$t('statsBibliotheque.personnes' as any).replace('{n}', l.peopleTexte)}
                      {/if}
                      <em>{l.pourcentageTexte}</em>
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </article>
        {/each}
        {#if classements}
          {#each CLES_CLASSEMENT as cle (cle)}
            {@const c = classements[cle]}
            {#if c}
              {@const res = resultats[cle]}
              {@const lignesC = res ? res.items : numeroter(c)}
              {@const max = lignesC.reduce((m, l) => Math.max(m, l.tracks), 0)}
              <article class="repartition" data-classement={cle}>
                <h2>{$t(TITRES_CLASSEMENT[cle] as any)}</h2>
                <div class="recherche">
                  <input type="search" data-recherche-classement={cle}
                    placeholder={$t(PLACEHOLDERS[cle] as any)} aria-label={$t(PLACEHOLDERS[cle] as any)}
                    value={recherche[cle]} oninput={(e) => surRecherche(cle, (e.currentTarget as HTMLInputElement).value)} />
                </div>
                {#if res}
                  <p class="aide" data-resultats>{$tn('statsBibliotheque.resultats' as any, res.matched).replace('{total}', nombre(res.total))}</p>
                  {#if rechercheLocale[cle] && estTronque(c)}
                    <p class="aide" data-recherche-locale>{$t('statsBibliotheque.rechercheLimitee' as any).replace('{n}', nombre(c.items.length))}</p>
                  {/if}
                {:else if estTronque(c)}
                  <p class="aide">{$t('statsBibliotheque.premiersSur' as any).replace('{n}', nombre(c.items.length)).replace('{total}', nombre(c.total))}</p>
                {/if}
                {#if !lignesC.length}
                  {#if res}
                    <p class="etat">{$t('statsBibliotheque.aucunResultat' as any)}</p>
                  {:else}
                    <p class="etat">{$t('statsBibliotheque.vide' as any)}</p>
                  {/if}
                {:else}
                  <ul class="barres classement">
                    {#each lignesC as l (l.rank)}
                      {@render ligneClassement(cle, l, max)}
                    {/each}
                  </ul>
                {/if}
              </article>
            {/if}
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</section>

{#snippet ligneClassement(cle: CleClassement, l: EntreeTrouvee, max: number)}
  <li>
    <span class="rang" data-rang>{nombre(l.rank)}</span>
    <button class="nom cliquable" data-ouvrir={cle} title={cle === 'by_artist' ? $t('statsBibliotheque.ouvrirArtiste' as any) : $t('statsBibliotheque.ouvrirGenre' as any)}
      onclick={() => ouvrirEntree(cle, l.value)}>{l.value}</button>
    <span class="piste"><span class="jauge" style:width="{max ? Math.max((l.tracks / max) * 100, 1) : 0}%"></span></span>
    <span class="val" data-valeur>{$t('statsBibliotheque.pistes' as any).replace('{n}', nombre(l.tracks))}</span>
  </li>
{/snippet}

<style>
  .v2-stats-biblio{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .v2-stats-biblio.embarquee{flex:1; min-height:0; height:auto}
  .meta{margin-left:auto; font:calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .meta.solo{padding:8px 30px 0}
  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .etat{margin:0; padding:16px 30px; color:var(--v2-txt3); font-size:calc(13px * var(--v2-txt-echelle, 1)); max-width:760px}
  .etat.err{color:var(--v2-danger)}
  .grille{display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:18px; padding:12px 30px}
  .repartition{border:1px solid var(--v2-line2); border-radius:12px; padding:14px 0 16px; min-width:0}
  .repartition h2{margin:0 0 10px; padding:0 18px; font:600 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .repartition .etat{padding:4px 18px}
  .aide{margin:-4px 0 10px; padding:0 18px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .barres{list-style:none; margin:0; padding:0 18px; display:flex; flex-direction:column; gap:7px}
  .barres li{display:grid; grid-template-columns:120px minmax(40px,1fr) auto; align-items:center; gap:10px; min-width:0}
  .nom{min-width:0; font:400 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt); overflow:hidden; text-overflow:ellipsis;
    white-space:nowrap; text-align:left}
  .cliquable{background:none; border:0; padding:0; cursor:pointer; text-decoration:underline dotted; color:var(--v2-txt)}
  .cliquable:hover{color:var(--v2-acc1)}
  .inconnu .nom{font-style:italic; color:var(--v2-txt3)}
  .piste{height:9px; border-radius:5px; overflow:hidden; background:var(--v2-hover)}
  .jauge{display:block; height:100%; border-radius:5px; background:var(--v2-acc1)}
  .inconnu .jauge{background:var(--v2-txt3)}
  .val{font:500 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt2); font-variant-numeric:tabular-nums; white-space:nowrap}
  .val em{font-style:normal; color:var(--v2-txt3); margin-left:6px}
  .recherche{padding:0 18px 10px}
  .recherche input{width:100%; box-sizing:border-box; padding:6px 10px; border-radius:8px; border:1px solid var(--v2-line2);
    background:var(--v2-bg); color:var(--v2-txt); font:400 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .recherche input:focus{outline:none; border-color:var(--v2-acc1)}
  .barres.classement li{grid-template-columns:auto 120px minmax(40px,1fr) auto}
  .rang{min-width:2.4em; text-align:right; font:500 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3);
    font-variant-numeric:tabular-nums}
  @media (max-width: 640px) {
    .grille{grid-template-columns:1fr; padding:10px 16px}
    .barres li{grid-template-columns:84px minmax(30px,1fr) auto}
    .barres.classement li{grid-template-columns:auto 84px minmax(30px,1fr) auto}
  }
</style>
