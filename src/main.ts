import './styles/tune-theme.css';
import ShellV2 from './components/v2/ShellV2.svelte';
import { mount } from 'svelte';

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
const app = mount(ShellV2, {
  target: document.getElementById('app')!,
});

export default app;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
