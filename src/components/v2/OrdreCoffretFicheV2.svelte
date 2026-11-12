<script lang="ts">
  /**
   * « Réordonner les albums » d'un coffret DÉJÀ composé à la main —
   * tune-server-rust#8571 (fil 2763, go de Bertrand du 12/11/2026).
   *
   * Lit l'ordre actuel (`GET /library/coffrets/{id}/ordre`), le laisse
   * changer (glisser-déposer, ou Monter / Descendre au clavier) et
   * l'enregistre d'un geste (`PUT`) : le serveur renumérote les disques, les
   * disques de chaque album restent dans leur ordre.
   *
   * La fiche n'ouvre ce panneau que si sa sonde (`ordre_coffret`) l'annonce :
   * un serveur antérieur ne connaît pas la route. Un coffret qui ne retient
   * plus l'album de chacun de ses disques (409 `ordre_indisponible`) dit
   * pourquoi, au lieu de montrer une liste qu'on ne pourrait pas enregistrer.
   */
  import { t as tr } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import * as api from '../../lib/api';
  import { notifications } from '../../lib/stores/notifications';
  import OrdreCoffretListeV2 from './OrdreCoffretListeV2.svelte';
  import {
    deplacerDans, estOrdreCoffret, ordreChange, type MembreCoffret,
  } from '../../lib/ordreCoffret';

  let { coffretId, onFermer, onEnregistre }: {
    coffretId: number;
    onFermer: () => void;
    onEnregistre: () => void;
  } = $props();

  let membres = $state<MembreCoffret[]>([]);
  let origine = $state<number[]>([]);
  let etat = $state<'chargement' | 'pret' | 'indisponible' | 'erreur'>('chargement');
  let enCours = $state(false);

  $effect(() => {
    const id = coffretId;
    let vivant = true;
    etat = 'chargement';
    api.getOrdreCoffret(id)
      .then((r) => {
        if (!vivant) return;
        if (!estOrdreCoffret(r)) { etat = 'erreur'; return; }
        membres = r.membres;
        origine = r.membres.map((m) => m.membre);
        etat = 'pret';
      })
      .catch((e: any) => {
        if (!vivant) return;
        etat = e?.status === 409 ? 'indisponible' : 'erreur';
      });
    return () => { vivant = false; };
  });

  const elements = $derived(membres.map((m) => ({
    cle: m.membre,
    titre: m.titre,
    detail: $tr('v2.meta.compilTracks' as any).replace('{count}', $formatNombre(m.pistes ?? 0)),
    disques: Math.max(1, m.disques.length),
  })));
  const modifie = $derived(ordreChange(origine, membres.map((m) => m.membre)));

  function deplacer(de: number, vers: number) {
    membres = deplacerDans(membres, de, vers);
  }

  async function enregistrer() {
    if (!modifie || enCours) return;
    enCours = true;
    try {
      await api.reordonnerCoffret(coffretId, membres.map((m) => m.membre));
      notifications.success($tr('v2.album.boxReorderDone' as any));
      onEnregistre();
    } catch {
      notifications.error($tr('v2.album.boxReorderError' as any));
    }
    enCours = false;
  }
</script>

<section class="cforf" data-ordre-coffret-fiche aria-labelledby="cforf-titre">
  <h3 id="cforf-titre">{$tr('v2.album.boxReorder' as any)}</h3>
  {#if etat === 'chargement'}
    <p class="cforf-etat">{$tr('v2.tool.loading' as any)}</p>
  {:else if etat === 'indisponible'}
    <p class="cforf-etat" data-ordre-indisponible>{$tr('v2.album.boxReorderUnavailable' as any)}</p>
  {:else if etat === 'erreur'}
    <p class="cforf-etat">{$tr('v2.album.boxReorderError' as any)}</p>
  {:else}
    <OrdreCoffretListeV2 {elements} ondeplacer={deplacer}
      etiquette={$tr('v2.box.orderList' as any)} desactive={enCours} />
  {/if}
  <div class="cforf-actions">
    {#if etat === 'pret'}
      <button type="button" class="cforf-enregistrer" data-enregistrer-ordre
        disabled={!modifie || enCours} onclick={enregistrer}>{$tr('v2.album.boxReorderSave' as any)}</button>
    {/if}
    <button type="button" class="cforf-annuler" data-annuler-ordre onclick={onFermer}>{$tr('v2.edition.cancel' as any)}</button>
  </div>
</section>

<style>
  .cforf{display:flex; flex-direction:column; gap:8px; padding:4px 0 12px}
  .cforf h3{margin:0; font-size:calc(15px * var(--v2-txt-echelle, 1)); font-weight:700}
  .cforf-etat{margin:0; font-size:calc(13px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .cforf-actions{display:flex; gap:12px; flex-wrap:wrap}
  .cforf-enregistrer, .cforf-annuler{height:44px; padding:0 22px; border-radius:var(--v2-r-pill); cursor:pointer;
    font:700 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .cforf-enregistrer{border:0; color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .cforf-enregistrer:disabled{opacity:.5; cursor:default}
  .cforf-annuler{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt)}
</style>
