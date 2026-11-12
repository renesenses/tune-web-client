<script lang="ts">
  /**
   * web#2736 — le bouton Lecture SCINDÉ des fiches album, collection et
   * playlist.
   *
   * Bertrand, 09/11/2026 : « un seul bouton Lecture, avec un menu déroulant ».
   * La partie principale lance la lecture ; la flèche ▾ déroule « Lire
   * ensuite » et « Ajouter à la file d'attente », qui quittent donc la rangée
   * de boutons (et le menu « … »).
   *
   *     [ ▶ Lecture | ▾ ]
   *              ▾ Lire ensuite
   *                Ajouter à la file d'attente
   *
   * rc12 — Bertrand, 12/11/2026 : « un seul bouton Play pour Play / Shuffle /
   * Lire ensuite / Ajouter à la file, sur toutes les vues concernées ». Le menu
   * porte désormais EXACTEMENT ces trois choix, dans cet ordre :
   *
   *     [ ▶ Lecture | ▾ ]
   *              ▾ Lecture aléatoire
   *                Lire ensuite
   *                Ajouter à la file d'attente
   *
   * C'est LE composant de lecture de toutes les fiches et cartes : le bouton
   * « ⤮ » séparé disparaît des vues qui l'utilisent (son `data-*` d'origine
   * suit l'entrée de menu, `attrsAleatoire`). Un geste absent pour un objet
   * (rien à mettre en file) n'a pas d'entrée — jamais d'entrée grisée sans
   * raison.
   *
   * La flèche a son PROPRE nom accessible et le motif « menu button » de
   * `BoutonMenuV2` : ↓ / Entrée l'ouvrent, ↑ / ↓ parcourent, Échap referme et
   * rend le focus à la flèche. Les deux entrées gardent les `data-*`
   * (`data-lire-ensuite`, `data-ajouter-file`) dont les épreuves se servent.
   */
  import { t } from '../../lib/i18n';
  import { ICONES, type EntreeMenu } from '../../lib/menuPiste';
  import BoutonMenuV2 from './BoutonMenuV2.svelte';

  /** Largeur du menu ▾ : « Ajouter à la file d'attente » sur une ligne, même en Grande. */
  const LARGEUR_MENU_LECTURE = 264;

  interface Geste {
    faire: () => void;
    /** Une requête est en cours : l'entrée reste, grisée. */
    desactive?: boolean;
    /** Clé i18n de l'infobulle (#2151 : ce que le geste FAIT). */
    bulle?: string;
  }
  interface Props {
    onLire: () => void;
    /** Clé i18n du libellé principal (« Lire », « Tout lire »…). */
    cle: string;
    /** Clé i18n de l'infobulle de la partie principale. */
    cleBulle?: string;
    desactive?: boolean;
    /** rc12 — « Lecture aléatoire », première entrée du menu. */
    aleatoire?: Geste | null;
    /** Absent : l'entrée n'apparaît pas (rien à mettre en file). */
    ensuite?: Geste | null;
    file?: Geste | null;
    /** `data-*` propre à l'entrée « Lecture aléatoire » de CET écran (les épreuves s'en servent). */
    attrsAleatoire?: Record<string, string | boolean>;
    /** Texte ajouté au libellé principal (« Tout lire (42) »). */
    suffixe?: string;
    /** Classe(s) ou `data-*` en plus sur la partie principale (crochets des épreuves d'un écran). */
    classeLire?: string;
    attrsLire?: Record<string, string | boolean>;
    /** Format réduit (carte de grille, ligne de résultat) : icône seule, sans libellé visible. */
    compact?: boolean;
  }
  let {
    onLire, cle, cleBulle, desactive = false, aleatoire = null, ensuite = null, file = null,
    attrsAleatoire = {}, compact = false, classeLire = '', attrsLire = {}, suffixe = '',
  }: Props = $props();

  function entrees(): EntreeMenu[] {
    const l: EntreeMenu[] = [];
    if (aleatoire) l.push({ cle: 'v2.menu.shufflePlay', icone: ICONES.shuffle, faire: aleatoire.faire,
      desactive: aleatoire.desactive, bulle: aleatoire.bulle, attrs: { 'data-lecture-aleatoire': true, ...attrsAleatoire } });
    if (ensuite) l.push({ cle: 'v2.album.playNext', icone: ICONES.next, faire: ensuite.faire,
      desactive: ensuite.desactive, bulle: ensuite.bulle, attrs: { 'data-lire-ensuite': true } });
    if (file) l.push({ cle: 'v2.menu.addToQueue', icone: ICONES.queue, faire: file.faire,
      desactive: file.desactive, bulle: file.bulle, attrs: { 'data-ajouter-file': true } });
    return l;
  }
  const aUneFleche = $derived(!!(aleatoire || ensuite || file));
</script>

<div class="bl" class:seul={!aUneFleche} class:compact data-bouton-lecture>
  <button type="button" class="bl-lire {classeLire}" {...attrsLire} onclick={onLire} disabled={desactive}
    title={cleBulle ? $t(cleBulle as any) : (compact ? $t(cle as any) : undefined)}
    aria-label={compact ? $t(cle as any) : undefined} data-lecture-principale>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8V4z"/></svg>{#if !compact}{$t(cle as any)}{suffixe}{/if}
  </button>
  {#if aUneFleche}
    <!-- Recette rc12 (13/11) — à 208 px (la largeur par défaut), « Ajouter à
         la file d'attente » passait sur deux lignes, et davantage en taille
         de texte Grande ou en allemand. -->
    <BoutonMenuV2 {entrees} etiquette={$t('v2.menu.playOptions' as any)} largeur={LARGEUR_MENU_LECTURE}>
      {#snippet declencheur(p)}
        <button class="bl-fleche" {...p} data-lecture-options
          aria-label={$t('v2.menu.playOptions' as any)} title={$t('v2.menu.playOptions' as any)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      {/snippet}
    </BoutonMenuV2>
  {/if}
</div>

<style>
  /* `--bl-h` : un en-tête compact (playlist) le règle à 36px. */
  .bl{display:inline-flex; align-items:stretch; height:var(--bl-h, 44px); border-radius:var(--v2-r-pill, 999px);
    background:linear-gradient(135deg, var(--v2-acc1), var(--v2-acc2)); box-shadow:0 6px 18px var(--v2-glow-strong, transparent);
    flex:0 0 auto}
  .bl button{display:inline-flex; align-items:center; border:0; background:transparent; cursor:pointer;
    color:var(--v2-on-acc, #fff); font:700 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans, inherit)}
  .bl-lire{gap:9px; padding:0 16px 0 20px; border-radius:var(--v2-r-pill, 999px) 0 0 var(--v2-r-pill, 999px)}
  .bl.seul .bl-lire{padding-right:20px; border-radius:var(--v2-r-pill, 999px)}
  .bl .bl-fleche{padding:0 12px 0 10px; border-left:1px solid color-mix(in srgb, var(--v2-on-acc, #fff) 35%, transparent);
    border-radius:0 var(--v2-r-pill, 999px) var(--v2-r-pill, 999px) 0}
  .bl button:hover:not(:disabled){background:color-mix(in srgb, var(--v2-on-acc, #fff) 14%, transparent)}
  .bl button:focus-visible{outline:2px solid var(--v2-on-acc, #fff); outline-offset:-4px}
  .bl button:disabled{opacity:.55; cursor:default}
  .bl svg{width:16px; height:16px}
  /* rc12 — même forme, en petit, pour une carte ou une ligne : ▶ | ▾ */
  .bl.compact{height:var(--bl-h, 32px)}
  .bl.compact .bl-lire{padding:0 8px 0 11px}
  .bl.compact.seul .bl-lire{padding:0 11px}
  .bl.compact .bl-fleche{padding:0 7px 0 5px}
  .bl.compact svg{width:14px; height:14px}
</style>
