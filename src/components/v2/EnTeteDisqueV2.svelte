<script lang="ts">
  /**
   * L'en-tête « Disque N » d'une liste de pistes — #1431, actif depuis
   * web#2221.
   *
   * « Comment lire un seul CD d'un coffret ? » (demande d'un utilisateur
   * relayée par Bertrand le 19/10/2026). Actif — album d'au moins deux
   * disques, écran qui sait jouer une tranche —, l'en-tête porte « Lire le
   * disque », un menu « … » (« Lire ensuite », « Ajouter à la file ») et la
   * durée du disque. Inactif, c'est le libellé d'avant, au pixel près.
   *
   * Composant à part, et non un fragment de `ListePistesV2` : le menu est un
   * menu de DISQUE, pas un menu de piste — les lignes de la liste n'en portent
   * toujours qu'un, celui de `PisteActions` (garde `uniformitePiste1848`).
   * Il réemploie `MenuPisteV2` pour ne pas recopier un menu ancré.
   */
  import { t } from '../../lib/i18n';
  import { formatDuration } from '../../lib/utils';
  import { ICONES } from '../../lib/menuPiste';
  import { dureeDuDisqueMs, type GesteDisque } from '../../lib/lectureDisque';
  import type { EnTeteDisque } from '../../lib/enTetesDisque';
  import type { Track } from '../../lib/types';
  import MenuPisteV2 from './MenuPisteV2.svelte';

  interface Props {
    entete: EnTeteDisque;
    /** Faux : le libellé seul, comme avant web#2221. */
    actif: boolean;
    /** Les pistes de CE disque, dans l'ordre de la liste. */
    pistes: Track[];
    onGeste?: ((geste: GesteDisque) => void) | null;
  }
  let { entete, actif, pistes, onGeste = null }: Props = $props();

  const libelle = $derived($t('library.disc' as any).replace('{num}', String(entete.disque)));
  const avecNum = (cle: string) => $t(cle as any).replace('{num}', String(entete.disque));
  const duree = $derived(actif ? dureeDuDisqueMs(pistes) : 0);

  let menu = $state<{ ancre: DOMRect; bouton: HTMLElement } | null>(null);
  function basculer(ev: MouseEvent): void {
    const b = ev.currentTarget as HTMLElement;
    menu = menu ? null : { ancre: b.getBoundingClientRect(), bouton: b };
  }
  function fermer(): void {
    const b = menu?.bouton;
    menu = null;
    b?.focus();
  }
</script>

<div class="dischead" class:actif data-disque={entete.disque}>
  <span class="discno">{libelle}</span>
  {#if entete.sousTitre}<span class="discsub">{entete.sousTitre}</span>{/if}
  {#if actif}
    {#if duree}<span class="discdur" data-disque-duree>{formatDuration(duree)}</span>{/if}
    <span class="discacts">
      <button class="discplay" type="button" data-disque-lire
        aria-label={avecNum('v2.liste.disc.playAria')}
        onclick={() => onGeste?.('lire')}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={ICONES.play}/></svg>
        {$t('v2.liste.disc.play' as any)}
      </button>
      <button class="discplus" type="button" data-disque-plus aria-haspopup="menu"
        aria-expanded={menu != null}
        aria-label={avecNum('v2.liste.disc.more')} title={avecNum('v2.liste.disc.more')}
        onclick={basculer}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
        </svg>
      </button>
    </span>
    {#if menu}
      <MenuPisteV2 ancre={menu.ancre} focusInitial onClose={fermer} entrees={[
        { cle: 'v2.album.playNext', icone: ICONES.next, faire: () => onGeste?.('ensuite') },
        { cle: 'v2.album.addQueue', icone: ICONES.queue, faire: () => onGeste?.('file') },
      ]} />
    {/if}
  {/if}
</div>

<style>
  /* #1431 — l'en-tête de disque : une ligne de texte, hors de la grille des
     colonnes (il n'a pas de cellules), la forme de `.dischead` d'Oxygen. */
  .dischead{display:flex; align-items:baseline; gap:10px; padding:14px 10px 4px}
  .discno{font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
    color:var(--v2-txt3)}
  .discsub{font-size:12px; color:var(--v2-txt2)}
  /* web#2221 — l'en-tête ACTIF : « Disque 2 · sous-titre · 52 min », puis
     les gestes calés à droite. */
  .dischead.actif{align-items:center}
  .dischead.actif .discsub::before, .discdur::before{content:'· '; color:var(--v2-txt3)}
  .discdur{font-size:12px; color:var(--v2-txt3); font-variant-numeric:tabular-nums}
  .discacts{margin-left:auto; display:flex; align-items:center; gap:4px}
  .discplay, .discplus{display:inline-flex; align-items:center; gap:6px; height:28px; border:0;
    border-radius:var(--v2-r-pill); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans)}
  .discplay{padding:0 10px}
  .discplus{width:28px; justify-content:center; padding:0}
  .discplay svg, .discplus svg{width:14px; height:14px; flex:0 0 auto}
  .discplay:hover, .discplus:hover, .discplus[aria-expanded='true']{background:var(--v2-hover); color:var(--v2-txt)}
  .discplay:focus-visible, .discplus:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
</style>
