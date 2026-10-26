<script lang="ts">
  // La section « Radios » de la recherche globale — tune-server-rust#7045.
  //
  // « Mes radios » ET l'annuaire dans UNE liste, sans doublon (voir
  // `lib/rechercheRadios.ts`). Les gestes sont ceux de l'écran Radio
  // (`RadioAnnuaire`) : écouter, mettre en favori, ajouter à « Mes radios ».
  import * as api from '../../lib/api';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { entreeApres, type EntreeRadio } from '../../lib/rechercheRadios';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { t, locale } from '../../lib/i18n';
  import { currentZone } from '../../lib/stores/zones';
  import { browserPlay } from '../../lib/stores/browserAudio';
  import { estZoneJouableIci } from '../../lib/zoneNavigateurProprietaire';
  import { signalerZoneNavigateurJoueeAilleurs } from '../../lib/zoneNavigateurRevendication';
  import { radioGenreRayon, radioGenreLabel } from '../../lib/radioGenres';
  import { nomDuPays } from '../../lib/paysAffichage';
  import { notifications } from '../../lib/stores/notifications';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';

  let { entrees, reste = 0 }: { entrees: EntreeRadio[]; reste?: number } = $props();

  // Les modifications locales (ajout, favori) priment sur la liste reçue
  // jusqu'à la prochaine recherche.
  let retouches = $state<Record<string, EntreeRadio>>({});
  const lignes = $derived(entrees.map((e) => retouches[e.cle] ?? e));

  const libelleGenre = (cle: string) => {
    const rayon = radioGenreRayon({ genre: cle });
    return rayon ? radioGenreLabel(rayon, (k) => $t(k as any)) : cle;
  };
  const sousTitre = (e: EntreeRadio) =>
    [e.genre ? libelleGenre(e.genre) : null, e.pays ? nomDuPays(e.pays, $locale, e.pays) : null]
      .filter(Boolean)
      .join(' · ');

  async function ecouter(e: EntreeRadio) {
    const zid = zoneRequise();
    if (zid == null) return;
    try {
      const res: any = e.idLocal != null
        ? await api.playRadio(e.idLocal, zid)
        : await api.jouerDepuisAnnuaire(e.idAnnuaire!, zid);
      // Zone navigateur : la page lit elle-même le flux que le serveur rend.
      if (estZoneJouableIci($currentZone) && res?.stream_url) browserPlay(res.stream_url, false, zid);
      else if (res?.stream_url) {
        const url = res.stream_url as string;
        signalerZoneNavigateurJoueeAilleurs($currentZone, () => browserPlay(url, true, zid));
      }
    } catch {
      notifications.error($t('v2.radio.dir.playFailed' as any).replace('{name}', e.nom));
    }
  }

  async function ajouter(e: EntreeRadio, favori: boolean) {
    if (!e.idAnnuaire) return;
    try {
      const st = await api.ajouterDepuisAnnuaire(e.idAnnuaire, favori);
      retouches = { ...retouches, [e.cle]: entreeApres(e, st) };
      if (!favori) notifications.success($t('v2.radio.dir.added' as any).replace('{name}', e.nom));
    } catch (err: any) {
      notifications.error(err?.message ?? $t('common.error' as any));
    }
  }

  async function basculerFavori(e: EntreeRadio) {
    try {
      if (e.idLocal != null) {
        const st = await api.updateRadio(e.idLocal, { favorite: !e.favori });
        retouches = { ...retouches, [e.cle]: entreeApres(e, st) };
      } else {
        await ajouter(e, true);
      }
    } catch (err: any) {
      notifications.error(err?.message ?? $t('common.error' as any));
    }
  }
</script>

<div class="grille">
  {#each lignes as e (e.cle)}
    <div class="fiche">
      <span class="vignette">
        <PochetteActions
          favoriExterne={{ actif: e.favori, basculer: () => basculerFavori(e) }}
          onLire={() => ecouter(e)}
          onOuvrir={() => ecouter(e)}
          nom={e.nom}
        >
          <AlbumArt coverPath={e.logo} albumId={null} size={0} alt={e.nom} fallbackInitials={e.nom?.slice(0, 1)} />
        </PochetteActions>
      </span>
      <span class="nm" use:bulleTexte>{e.nom}</span>
      <span class="gn" use:bulleTexte>{sousTitre(e)}</span>
      <span class="pied">
        {#if e.codec}<span class="tk">{e.codec}{e.bitrate ? ` ${e.bitrate}` : ''}</span>{/if}
        {#if e.idLocal != null}
          <span class="dedans">{$t('v2.radio.dir.inMine' as any)}</span>
        {:else}
          <button class="ajout" onclick={() => ajouter(e, false)} title={$t('v2.radio.dir.add' as any)} aria-label={`${$t('v2.radio.dir.add' as any)} — ${e.nom}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        {/if}
      </span>
    </div>
  {/each}
</div>
{#if reste > 0}
  <p class="reste">{$t('v2.rech.radiosMore' as any).replace('{n}', String(reste))}</p>
{/if}

<style>
  .grille{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:20px}
  .fiche{position:relative; display:flex; flex-direction:column; min-width:0}
  .vignette{position:relative; display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden;
    box-shadow:var(--v2-sh-card); transition:.18s}
  .fiche:hover .vignette{box-shadow:0 10px 24px var(--v2-glow)}
  .nm{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .gn{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .pied{display:flex; align-items:center; gap:6px; margin-top:4px; min-height:22px}
  .tk{font:9.5px var(--v2-mono); color:var(--v2-acc2)}
  .dedans{margin-left:auto; font:600 9.5px var(--v2-mono); color:var(--v2-txt3)}
  .ajout{margin-left:auto; width:24px; height:24px; border-radius:50%; border:1px solid var(--v2-line2);
    background:transparent; color:var(--v2-txt2); cursor:pointer; display:grid; place-items:center}
  .ajout:hover{color:var(--v2-acc1); border-color:var(--v2-acc1)}
  .ajout svg{width:13px; height:13px}
  .reste{margin:12px 0 0; font:11.5px var(--v2-sans); color:var(--v2-txt3)}
</style>
