<script lang="ts">
  /**
   * Retour de Didier (rc13.90) — « Avant la mesure » : une courte liste de
   * contrôle en tête de la mesure au micro, avec l'état de chaque point
   * quand l'écran le connaît.
   *
   *  1. PURE : la mesure le contourne elle-même puis le rétablit
   *     (tune-server-rust, mesure en PURE) — rien à faire ;
   *  2. lecture : la mesure remplace la file de la zone par son balayage,
   *     donc la lecture en cours s'arrête ;
   *  3. niveau : renvoi au bouton « Tester le niveau » (test de niveau,
   *     rc14), sans le dupliquer ;
   *  4. entrée : celle où le micro est branché, dans la liste ;
   *  5. placement : place d'écoute, hauteur d'oreille, orientation selon
   *     le fichier d'étalonnage ;
   *  6. Windows (retour de Didier, 17 h 51) : WASAPI, 48 kHz, entrée de
   *     l'interface, zone WASAPI et non ASIO. Le serveur dit sa pile de
   *     capture (`GET /microphones` → `pile`, `wasapi` sous Windows) : la
   *     ligne ne paraît que sous Windows, ou, pile encore inconnue,
   *     précédée de « Sous Windows ».
   *
   * Composant à part : `CorrectionPieceV2` le place d'une ligne.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { zones } from '../../lib/stores/zones';
  import { texteOrientation } from '../../lib/correctionPieceProtocole';

  let { zoneId, micro, etalonnage, pile = null }: {
    zoneId: number | null;
    /** La pile de capture du serveur (`wasapi`, `alsa`, `coreaudio`…), `null` tant qu'elle est inconnue. */
    pile?: string | null;
    /** Le libellé du micro choisi, ou `null`. */
    micro: string | null;
    etalonnage: string | null;
  } = $props();

  const tr = (cle: string) => $t(cle as any);

  /** `null` : inconnu (serveur ancien, zone absente) — le point est dit sans état. */
  let pure = $state<boolean | null>(null);
  $effect(() => {
    const zid = zoneId;
    pure = null;
    if (zid == null) return;
    api.getAudiophileMode(zid).then((m) => { if (zoneId === zid) pure = !!m?.enabled; }, () => {});
  });

  const etat = $derived($zones.find((z) => z.id === zoneId)?.state ?? null);
  const joue = $derived(etat === 'playing' || etat === 'buffering');
</script>

<div class="avant" data-room="avant-mesure">
  <div class="titre">{tr('v2.room.beforeTitle')}</div>
  <ol>
    <li data-avant="pure">
      <span>{tr('v2.room.beforePure')}</span>
      {#if pure != null}<span class="etat" data-etat={pure ? 'actif' : 'inactif'}>{tr(pure ? 'v2.room.beforePureOn' : 'v2.room.beforePureOff')}</span>{/if}
    </li>
    <li data-avant="lecture">
      <span>{tr('v2.room.beforePlayback')}</span>
      {#if etat != null}<span class="etat" class:attention={joue} data-etat={joue ? 'joue' : 'arretee'}>{tr(joue ? 'v2.room.beforePlaying' : 'v2.room.beforeIdle')}</span>{/if}
    </li>
    <li data-avant="niveau"><span>{tr('v2.room.beforeLevel')}</span></li>
    <li data-avant="entree">
      <span>{tr('v2.room.beforeInput')}</span>
      <span class="etat" class:attention={!micro} data-etat={micro ? 'choisie' : 'aucune'}>{micro ?? tr('v2.room.beforeNoInput')}</span>
    </li>
    <li data-avant="placement">
      <span>{tr('v2.room.beforePosition').replace('{orientation}', texteOrientation(etalonnage, tr))}</span>
    </li>
    {#if pile == null || pile === 'wasapi'}
      <li data-avant="windows" data-certain={pile === 'wasapi' ? 'oui' : 'non'}>
        <span>{tr(pile === 'wasapi' ? 'v2.room.beforeWindows' : 'v2.room.beforeWindowsMaybe')}</span>
      </li>
    {/if}
  </ol>
</div>

<style>
  .avant{border:1px solid var(--v2-line2); border-radius:10px; padding:10px 14px; display:flex; flex-direction:column; gap:6px}
  .titre{font:600 calc(12.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  ol{margin:0; padding-left:20px; display:flex; flex-direction:column; gap:4px;
    font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt2)}
  li span + .etat{margin-left:8px}
  .etat{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}
  .etat.attention{color:var(--v2-acc-tint)}
</style>
