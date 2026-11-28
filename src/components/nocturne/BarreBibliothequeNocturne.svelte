<script lang="ts">
  /**
   * Colonne « Bibliothèque » : rubriques, collections (filtres de Tune sur la
   * liste des albums), technique et système repliés. Une entrée n'apparaît que
   * si Tune a l'écran ou le filtre correspondant.
   */
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import House from '@lucide/svelte/icons/house';
  import Disc3 from '@lucide/svelte/icons/disc-3';
  import User from '@lucide/svelte/icons/user';
  import Music2 from '@lucide/svelte/icons/music-2';
  import Tag from '@lucide/svelte/icons/tag';
  import Tags from '@lucide/svelte/icons/tags';
  import ListMusic from '@lucide/svelte/icons/list-music';
  import Activity from '@lucide/svelte/icons/activity';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import Circle from '@lucide/svelte/icons/circle';
  import Heart from '@lucide/svelte/icons/heart';
  import Clock from '@lucide/svelte/icons/clock';
  import ImageOff from '@lucide/svelte/icons/image-off';
  import Copy from '@lucide/svelte/icons/copy';
  import AudioLines from '@lucide/svelte/icons/audio-lines';
  import Disc from '@lucide/svelte/icons/disc';
  import FileAudio from '@lucide/svelte/icons/file-audio';
  import ChartBar from '@lucide/svelte/icons/chart-bar';
  import FilePen from '@lucide/svelte/icons/file-pen';
  import Folder from '@lucide/svelte/icons/folder';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { albums as albumsBibliotheque } from '../../lib/stores/library';
  import { favoriteAlbumIds } from '../../lib/stores/profile';
  import { ecranNocturne, ouvrirRubrique, ouvrirTune, type EcranNocturne, type CleCollection } from './navigationNocturne';
  import { albumsDeCollection, LIBELLE_COLLECTION } from './triNocturne';

  interface Props { integree: boolean }
  let { integree }: Props = $props();

  type Entree = { cle: string; libelle: string; icone: typeof House; aller: () => void; actif: boolean; compte?: number | null; tune?: boolean };

  let nbPlaylists = $state<number | null>(null);
  $effect(() => {
    if (!integree) return;
    api.getPlaylists(500).then((l) => (nbPlaylists = l.length)).catch(() => {});
  });

  const ouverts = $state<Record<string, boolean>>({ biblio: true, collection: true, technique: false, systeme: false });

  function estEcran(e: EcranNocturne): boolean {
    return JSON.stringify($ecranNocturne) === JSON.stringify(e);
  }
  function collection(cle: CleCollection, icone: typeof House): Entree {
    const libelle = $t(LIBELLE_COLLECTION[cle]);
    const e: EcranNocturne = { nom: 'collection', cle };
    return {
      cle, libelle, icone, aller: () => ouvrirRubrique(e), actif: estEcran(e),
      compte: albumsDeCollection($albumsBibliotheque, cle, $favoriteAlbumIds).length,
    };
  }
  function tune(cle: string, libelle: string, icone: typeof House, vue: string, onglet?: string): Entree {
    const c = $ecranNocturne;
    const actif = c.nom === 'tune' && c.vue === vue && (c.onglet ?? null) === (onglet ?? null);
    return { cle, libelle, icone, aller: () => ouvrirTune(vue, onglet), actif, tune: true };
  }

  const sections = $derived.by(() => {
    const tr = $t;
    const biblio: Entree[] = [
      { cle: 'accueil', libelle: tr('nav.home'), icone: House, aller: () => ouvrirRubrique({ nom: 'accueil' }), actif: estEcran({ nom: 'accueil' }) },
      { cle: 'albums', libelle: tr('common.albums'), icone: Disc3, aller: () => ouvrirRubrique({ nom: 'albums' }), actif: estEcran({ nom: 'albums' }) },
      { cle: 'artistes', libelle: tr('common.artists'), icone: User, aller: () => ouvrirRubrique({ nom: 'artistes' }), actif: estEcran({ nom: 'artistes' }) },
      { cle: 'genres', libelle: tr('nav.genres'), icone: Music2, aller: () => ouvrirRubrique({ nom: 'genres' }), actif: estEcran({ nom: 'genres' }) || $ecranNocturne.nom === 'genre' },
      tune('labels', tr('v2.lib.tabLabels'), Tag, 'library', 'labels'),
      tune('etiquettes', tr('v2.nav.tags'), Tags, 'tags'),
      { ...tune('playlists', tr('nav.playlists'), ListMusic, 'playlists'), compte: nbPlaylists },
    ];
    const coll: Entree[] = [
      collection('hires', Activity),
      collection('dsd', CircleDot),
      collection('mono', Circle),
      collection('favoris', Heart),
      collection('recents', Clock),
      collection('sansPochette', ImageOff),
      collection('doublons', Copy),
    ];
    const tech: Entree[] = [
      collection('multicanal', AudioLines),
      collection('cd', Disc),
      collection('compresse', FileAudio),
    ];
    const sys: Entree[] = [
      tune('stats', tr('statsBibliotheque.titre'), ChartBar, 'statsbibliotheque'),
      tune('meta', tr('v2.meta.title'), FilePen, 'metadata'),
      tune('dossiers', tr('nav.browse'), Folder, 'browse'),
    ];
    const garder = (l: Entree[]) => l;
    return [
      { id: 'biblio', titre: tr('nav.library'), entrees: garder(biblio) },
      { id: 'collection', titre: tr('v2.hist.ctx.collection'), entrees: coll.filter((e) => e.compte || e.actif) },
      { id: 'technique', titre: tr('nocturne.biblio.technique'), entrees: tech.filter((e) => e.compte || e.actif) },
      { id: 'systeme', titre: tr('settings.tabSystem'), entrees: garder(sys) },
    ].filter((s) => s.entrees.length);
  });
</script>

<aside class="noc-biblio" aria-label={$t('nav.library')}>
  {#each sections as s (s.id)}
    <section>
      <button type="button" class="noc-biblio-titre" aria-expanded={ouverts[s.id]} onclick={() => (ouverts[s.id] = !ouverts[s.id])}>
        <span class="noc-biblio-chevron" class:ferme={!ouverts[s.id]}><ChevronDown size={11} /></span>{s.titre}
      </button>
      {#if ouverts[s.id]}
        <ul>
          {#each s.entrees as e (e.cle)}
            {@const Icone = e.icone}
            <li>
              <button type="button" class:actif={e.actif} onclick={e.aller}>
                <Icone size={13} />
                <span class="noc-biblio-libelle" title={e.libelle}>{e.libelle}</span>
                {#if e.compte != null && e.compte > 0}<span class="noc-biblio-compte">{e.compte}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</aside>

<style>
  .noc-biblio {
    position: relative;
    width: var(--noc-largeur-biblio);
    height: 100%;
    overflow-y: auto;
    padding: 14px 0 20px;
    background: var(--noc-surface-2);
    border-right: 1px solid var(--noc-ligne);
    scrollbar-width: none;
  }
  section + section { margin-top: 12px; }
  .noc-biblio-titre {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 14px;
    border: 0;
    background: none;
    color: var(--noc-texte-3);
    font: inherit;
    font-size: var(--noc-taille-section-tiroir);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .noc-biblio-chevron { display: inline-flex; transition: transform var(--noc-duree); }
  .noc-biblio-chevron.ferme { transform: rotate(-90deg); }
  ul { list-style: none; margin: 2px 0 0; padding: 0 6px; }
  li button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--noc-rayon-petit);
    background: none;
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-petit);
    text-align: left;
    cursor: pointer;
  }
  li button :global(svg) { flex: 0 0 auto; color: var(--noc-texte-2); }
  li button:hover { background: var(--noc-surface-3); }
  li button.actif { background: var(--noc-surface-3); box-shadow: inset 2px 0 0 var(--noc-ambre); }
  li button.actif :global(svg) { color: var(--noc-ambre); }
  .noc-biblio-libelle { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .noc-biblio-compte { color: var(--noc-texte-2); /* itération 12 : AA sur la colonne */ font-size: var(--noc-taille-mini); font-variant-numeric: tabular-nums; }
</style>
