<script lang="ts">
  /** Pictogramme d'une zone, dérivé de son TYPE de sortie.
   *
   *  Remplace l'icône unique que la barre de lecture affichait pour toutes les
   *  zones (FabienM, forum #1460) : « on ne sait plus sur quel appareil la
   *  musique joue ».
   *
   *  ⚠️ Aucune marque n'est représentée ici, et c'est délibéré : la demande
   *  initiale portait sur une bibliothèque de logos, écartée à l'arbitrage
   *  (tune-server-rust#1858) parce que les logos ne sont pas libres de droits
   *  et que Tune est distribué. Ces tracés sont des formes génériques —
   *  écran, enceinte, téléviseur — et n'imitent aucun logo de protocole.
   *
   *  Le dessin ne dit que le GENRE d'appareil. Le protocole se lit en toutes
   *  lettres à côté (`zoneTypeLabel`), et l'appareil par son nom
   *  (`zoneDeviceName`). Deux zones du même genre portent donc le même
   *  dessin : c'est le texte qui les sépare.
   */
  import { zoneIconKind } from '../lib/zoneIdentity';
  import type { OutputType } from '../lib/types';

  interface Props {
    type?: OutputType | null;
    size?: number;
  }
  let { type = null, size = 20 }: Props = $props();

  let kind = $derived(zoneIconKind(type));
</script>

<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if kind === 'desktop'}
    <!-- Ordinateur : la carte son est dans la machine. -->
    <rect x="2.5" y="4.5" width="19" height="12" rx="1.5" />
    <path d="M8.5 20h7" />
    <path d="M12 16.5V20" />
  {:else if kind === 'browser'}
    <!-- Onglet de navigateur : le son sort d'ici, pas d'un appareil. -->
    <rect x="2.5" y="4" width="19" height="16" rx="1.5" />
    <path d="M2.5 8.5h19" />
    <circle cx="5.75" cy="6.25" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="8" cy="6.25" r="0.6" fill="currentColor" stroke="none" />
  {:else if kind === 'tv'}
    <!-- Téléviseur ou dongle sur pied : ce que sont le plus souvent une
         destination AirPlay ou Cast. -->
    <rect x="2.5" y="4" width="19" height="12.5" rx="1.5" />
    <path d="M8.5 20l3.5-3.5 3.5 3.5" />
  {:else if kind === 'multiroom'}
    <!-- Plusieurs enceintes : une zone Snapcast en pilote un groupe. -->
    <rect x="2.5" y="4" width="8" height="16" rx="1.5" />
    <rect x="13.5" y="4" width="8" height="16" rx="1.5" />
    <circle cx="6.5" cy="14" r="2.4" />
    <circle cx="17.5" cy="14" r="2.4" />
  {:else}
    <!-- Enceinte ou ampli au bout du réseau : DLNA, BluOS, Sonos, OpenHome. -->
    <rect x="5" y="2.5" width="14" height="19" rx="2" />
    <circle cx="12" cy="15" r="3.2" />
    <circle cx="12" cy="6.75" r="1.15" />
  {/if}
</svg>
