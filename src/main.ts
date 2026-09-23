import './styles/tune-theme.css';
import ShellV2 from './components/v2/ShellV2.svelte';
import { mount } from 'svelte';
import { get } from 'svelte/store';
import { preferences } from './lib/stores/preferences';
import { preparerLocale } from './lib/i18n';
// Une seule interface. L'ancienne coquille — `App.svelte` et les 51
// composants qu'elle seule montait (dont 28 écrans), le paramètre `?v2` et la
// clé `tune-interface` — a été retirée le 19/09/2026 : phase 5 de la bascule
// ouverte le 14/09 (#1257). Douze composants qui portaient une capacité sans
// équivalent ont été SAUVÉS avant, dans `partages/` et `v2-heritage/`.
//
// 🔴 Il n'y a PLUS de filet. `?v2=0` ramenait à l'ancienne interface quand un
// écran de la nouvelle devenait inatteignable ; il ne ramène plus rien, parce
// qu'il n'y a plus où aller. Ce n'était pas séparable : le drapeau ne servait
// qu'à monter `App`.
//
// 🔴 LA LANGUE AVANT LA COQUILLE (tune-server-rust#4800, cause 4). Les onze
// dictionnaires ne sont plus dans le bundle principal : chacun est un chunk
// chargé à la demande. On attend celui de la langue enregistrée — et
// l'anglais, langue de repli — AVANT de monter, sinon le premier rendu
// afficherait des clés nues (`nav.library`) le temps du transfert. La langue
// vient du même magasin que `ShellV2` lit ensuite dans son `$effect` ; si le
// profil serveur en apporte une autre, `locale.set` chargera son chunk puis
// basculera. Un chunk qui n'arrive pas ne bloque pas le montage : `preparerLocale`
// se résout toujours.
preparerLocale(get(preferences).language ?? 'fr').then(() => {
  mount(ShellV2, {
    target: document.getElementById('app')!,
  });
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
