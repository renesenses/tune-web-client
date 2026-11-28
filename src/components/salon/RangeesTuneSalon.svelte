<script lang="ts">
  /**
   * Les rangées de l'accueil de Tune, au bas de l'accueil Roon-like
   * (retouche du 27/11/2026) : chaque widget en « bande » de la disposition
   * du profil devient une rangée Salon — titre, flèches, « Plus », pochettes
   * alignées. Une rangée vide ne s'affiche pas.
   *
   * La disposition est celle de l'accueil de Tune (préférence `home_widgets`
   * du profil, sinon `DISPOSITION_DEFAUT`) : ce que l'utilisateur a rangé là
   * se retrouve ici, dans le même ordre.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { currentProfileId } from '../../lib/stores/profile';
  import { albums } from '../../lib/stores/library';
  import { zones } from '../../lib/stores/zones';
  import { allerA } from '../../lib/stores/salon';
  import { DISPOSITION_DEFAUT, widgetParId, type Element, type Widget } from '../../lib/accueilWidgets';
  import { remplacerAliasWidgets } from '../../lib/widgetsService';
  import { rangeesDeLAccueil } from '../../lib/accueilRoonLike';
  import { ouvrirElementSalon } from '../../lib/ouvrirElementSalon';
  import RangeeSalon from './RangeeSalon.svelte';
  import CarteAlbumSalon from './CarteAlbumSalon.svelte';
  import type { Album } from '../../lib/types';

  /** Où mène « Plus » : l'écran de Tune qui porte toute la liste. */
  const PLUS: Record<string, string> = {
    'reprendre': 'history', 'recemment-ecoutes': 'history', 'ecoutes-frequentes': 'history',
    'favoris': 'favorites', 'favoris-artistes': 'favorites', 'favoris-pistes': 'favorites',
    'favoris-playlists': 'playlists', 'favoris-smart-playlists': 'smartplaylists',
    'favoris-collections': 'collections', 'favoris-smart-collections': 'collections',
    'podcasts-abonnements': 'podcasts', 'top-radios': 'radios', 'radios-artistes': 'radios',
    'zones': 'zonemanager', 'qobuz-selection': 'streaming', 'tops': 'tableaudebord',
  };

  let rangees = $state<{ w: Widget; elements: Element[] | null }[]>([]);
  /** Une rangée qui n'a rien rendu en 12 s se cache. */
  const DELAI_MS = 12_000;
  /** Les classements (« Vos tops ») : un onglet par colonne présente. */
  let ongletsTops = $state<Record<string, string>>({});
  const COLONNES_TOPS = ['artistes', 'albums', 'titres'] as const;
  function colonnesDe(els: Element[]): string[] {
    return COLONNES_TOPS.filter((c) => els.some((e) => (e as { colonne?: string }).colonne === c));
  }

  onMount(() => {
    let vivant = true;
    (async () => {
      const pid = get(currentProfileId);
      let disposition: string[] = [...DISPOSITION_DEFAUT];
      if (pid != null) {
        try {
          const prefs = await api.getProfilePreferences(pid);
          const d = prefs?.home_widgets;
          if (Array.isArray(d) && d.length) disposition = remplacerAliasWidgets(d.filter((x: unknown) => typeof x === 'string'));
        } catch { /* préférences illisibles : le défaut */ }
      }
      const ws = rangeesDeLAccueil(disposition, widgetParId);
      if (!vivant) return;
      rangees = ws.map((w) => ({ w, elements: null }));
      // Toutes à la fois, chacune bornée : une rangée lente ne retient pas
      // les autres (elle se cache si elle n'a rien rendu à temps).
      await Promise.all(ws.map(async (w) => {
        let els: Element[] = [];
        try {
          els = (await Promise.race([
            Promise.resolve(w.charger({ profileId: pid, albums: get(albums), zones: get(zones), langue: get(locale) })),
            new Promise<Element[]>((_, rej) => setTimeout(() => rej(new Error('delai')), DELAI_MS)),
          ])) ?? [];
        } catch { els = []; }
        if (vivant) rangees = rangees.map((r) => (r.w.id === w.id ? { ...r, elements: els } : r));
      }));
    })();
    return () => { vivant = false; };
  });

  const ouvrir = ouvrirElementSalon;
  /** Une pochette d'élément, sous la forme qu'attend la carte Salon. */
  const carte = (e: Element) => ({ id: null, title: e.titre, artist_name: e.sous ?? null, cover_path: e.cover ?? null } as unknown as Album);
</script>

{#each rangees as r (r.w.id)}
  {#if r.elements === null || r.elements.length}
    {@const cols = r.w.forme === 'tops' && r.elements ? colonnesDe(r.elements) : []}
    {@const col = ongletsTops[r.w.id] ?? cols[0] ?? null}
    {@const visibles = cols.length && r.elements ? r.elements.filter((e) => (e as { colonne?: string }).colonne === col) : r.elements}
    <RangeeSalon titre={$t(r.w.cleTitre as any)}
      onglets={cols.map((c) => ({ id: c, libelle: $t(`roonLike.accueil.top.${c}` as any) }))}
      ongletActif={col} onOnglet={(id) => (ongletsTops = { ...ongletsTops, [r.w.id]: id })}
      onPlus={PLUS[r.w.id] ? () => allerA({ page: 'tune', vue: PLUS[r.w.id] }) : null}>
      {#if visibles === null}
        <p class="attente">{$t('roonLike.chargement' as any)}</p>
      {:else}
        {#each visibles as e (e.id)}
          <div class="carte-tune" data-rangee-tune={r.w.id}><CarteAlbumSalon album={carte(e)} onOuvrir={() => ouvrir(e)} /></div>
        {/each}
      {/if}
    </RangeeSalon>
  {/if}
{/each}

<style>
  .attente { color: inherit; opacity: .75; margin: 0; grid-column: 1 / -1; }
  .carte-tune { display: contents; }
</style>
