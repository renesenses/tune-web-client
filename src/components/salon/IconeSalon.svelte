<script lang="ts" module>
  /**
   * Pictogrammes de l'interface « Salon » : ceux de la bibliothèque d'icônes
   * du client (`@lucide/svelte`, importés un par un), sous des noms de rôle.
   * Changer une icône = changer une ligne de cette table.
   */
  import IHouse from '@lucide/svelte/icons/house';
  import ILayoutGrid from '@lucide/svelte/icons/layout-grid';
  import ISearch from '@lucide/svelte/icons/search';
  import IRadio from '@lucide/svelte/icons/radio';
  import IClockPlus from '@lucide/svelte/icons/clock-plus';
  import ITag from '@lucide/svelte/icons/tag';
  import IListClock from '@lucide/svelte/icons/list-clock';
  import IDisc3 from '@lucide/svelte/icons/disc-3';
  import IUserRound from '@lucide/svelte/icons/user-round';
  import IFileMusic from '@lucide/svelte/icons/file-music';
  import IMic from '@lucide/svelte/icons/mic';
  import IFolder from '@lucide/svelte/icons/folder';
  import ICloud from '@lucide/svelte/icons/cloud';
  import IHeart from '@lucide/svelte/icons/heart';
  import ISettings from '@lucide/svelte/icons/settings';
  import IPlus from '@lucide/svelte/icons/plus';
  import IEllipsis from '@lucide/svelte/icons/ellipsis';
  import IChevronLeft from '@lucide/svelte/icons/chevron-left';
  import IChevronRight from '@lucide/svelte/icons/chevron-right';
  import IChevronDown from '@lucide/svelte/icons/chevron-down';
  import IBookmark from '@lucide/svelte/icons/bookmark';
  import IPlay from '@lucide/svelte/icons/play';
  import IPause from '@lucide/svelte/icons/pause';
  import ISkipBack from '@lucide/svelte/icons/skip-back';
  import ISkipForward from '@lucide/svelte/icons/skip-forward';
  import IListMusic from '@lucide/svelte/icons/list-music';
  import IRepeat from '@lucide/svelte/icons/repeat';
  import IShuffle from '@lucide/svelte/icons/shuffle';
  import ISpeaker from '@lucide/svelte/icons/speaker';
  import IVolume2 from '@lucide/svelte/icons/volume-2';
  import ILink from '@lucide/svelte/icons/link';

  export const ICONES = {
    accueil: IHouse,
    genres: ILayoutGrid,
    recherche: ISearch,
    radio: IRadio,
    plusTard: IClockPlus,
    etiquette: ITag,
    historique: IListClock,
    albums: IDisc3,
    artistes: IUserRound,
    morceaux: IFileMusic,
    podcasts: IMic,
    dossier: IFolder,
    services: ICloud,
    favoris: IHeart,
    reglages: ISettings,
    plus: IPlus,
    points: IEllipsis,
    retour: IChevronLeft,
    suivant: IChevronRight,
    bas: IChevronDown,
    signet: IBookmark,
    lecture: IPlay,
    pause: IPause,
    precedent: ISkipBack,
    prochain: ISkipForward,
    file: IListMusic,
    repeter: IRepeat,
    aleatoire: IShuffle,
    enceinte: ISpeaker,
    volume: IVolume2,
    lien: ILink,
  } as const;
  export type NomIcone = keyof typeof ICONES;
</script>

<script lang="ts">
  let { nom, taille = 18, trait = 1.6, plein = false }: { nom: NomIcone; taille?: number; trait?: number; plein?: boolean } = $props();
  const Icone = $derived(ICONES[nom]);
</script>

<Icone size={taille} strokeWidth={trait} fill={plein ? 'currentColor' : 'none'} aria-hidden="true" />
