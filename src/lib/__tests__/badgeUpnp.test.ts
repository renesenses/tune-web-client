// @vitest-environment jsdom
//
// Badge `UPNP` — arbitrage de Bertrand du 14/09/2026 (D1bis du chantier #2219,
// `docs/chantiers/unifier-serveurs-upnp-et-bibliotheque.md` côté serveur) :
//
//   une piste venue d'un serveur UPnP porte le badge `UPNP`, comme une piste
//   Qobuz porte `QOBUZ`. Pas « local », et pas un badge par serveur.
//
// `ServiceBadge` est une TABLE FIXE : `services[source] ?? null`. Une source
// absente de la table ne rend rien du tout — `source = 'upnp'` n'affichait donc
// AUCUN badge.
//
// Deux propriétés, et la seconde compte autant que la première :
//
//   1. `source = 'upnp'` rend bien un badge, et il porte le texte `UPNP` ;
//   2. une source absente ou nulle ne rend PAS `LOCAL`. Un repli `?? 'local'`
//      chez l'appelant affiche « LOCAL » sur une piste distante dont la source
//      n'est pas encore lue : un mensonge affiché, pire que l'absence de badge.
//
// 🔴 CE TÉMOIN MONTE LE COMPOSANT, il ne lit pas sa table : c'est le texte
// réellement peint que l'on regarde. Le second volet, lui, ne peut être que
// textuel — le mensonge vit chez l'APPELANT, dans l'expression qu'il passe.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ServiceBadge from '../../components/partages/ServiceBadge.svelte';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

let monte: Record<string, any> | null = null;
let hote: HTMLElement | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
});

/** Monte le badge pour une source donnée et rend le texte réellement peint. */
function peint(source: string | null | undefined): string {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ServiceBadge, { target: hote, props: { source, compact: true } });
  flushSync();
  return (hote.textContent ?? '').trim();
}

describe('Badge UPNP (D1bis, 14/09/2026)', () => {
  it("une piste de source `upnp` porte le badge UPNP", () => {
    expect(peint('upnp')).toBe('UPNP');
  });

  it('le badge UPNP sort habillé, comme les sept autres', () => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ServiceBadge, { target: hote, props: { source: 'upnp' } });
    flushSync();
    const el = hote.querySelector('.service-badge');
    expect(el, 'aucun badge rendu').not.toBeNull();
    // La classe porte la source : c'est elle qui applique couleur, fond et
    // bordure. Sans la règle CSS correspondante le badge sortirait nu.
    expect(el!.classList.contains('upnp')).toBe(true);
    expect(lire('src/components/partages/ServiceBadge.svelte')).toContain('.service-badge.upnp');
  });

  it("une source absente, nulle ou inconnue ne rend AUCUN badge — surtout pas LOCAL", () => {
    for (const s of [null, undefined, '', 'serveur-du-salon', 'inconnu']) {
      const texte = peint(s);
      expect(texte, `source ${JSON.stringify(s)}`).toBe('');
      expect(texte, `source ${JSON.stringify(s)} ne doit pas mentir en LOCAL`).not.toContain(
        'LOCAL',
      );
      if (monte) unmount(monte);
      monte = null;
      hote?.remove();
      hote = null;
    }
  });

  it("les sept badges d'origine sont intacts", () => {
    const attendus: Record<string, string> = {
      tidal: 'TIDAL',
      qobuz: 'QOBUZ',
      deezer: 'DEEZER',
      spotify: 'SPOTIFY',
      youtube: 'YT',
      amazon: 'AMAZON',
      local: 'LOCAL',
      bandcamp: 'BANDCAMP',
    };
    for (const [src, nom] of Object.entries(attendus)) {
      expect(peint(src), src).toBe(nom);
      if (monte) unmount(monte);
      monte = null;
      hote?.remove();
      hote = null;
    }
  });
});

describe("Aucun appelant de ServiceBadge ne replie sur 'local'", () => {
  // Les sites d'AFFICHAGE vivants, mesurés le 19/09/2026 après la phase 5 —
  // tous les appelants de <ServiceBadge> sauf `QualiteAlbum` (arbitrage du
  // 05/09 — « avec Local d'ailleurs ! », gardé par `retoursQuerite.test.ts`),
  // qui n'est pas un repli d'affichage de provenance.
  const APPELANTS = [
    'src/components/partages/AlbumArt.svelte',
    'src/components/partages/NowPlaying.svelte',
    'src/components/partages/TransportBar.svelte',
    'src/components/v2/DiscographieCommune.svelte',
    'src/components/v2/SearchV2.svelte',
    'src/components/v2/VersionsPistePanneau.svelte',
    // Appelant ajouté le 18/09/2026 par #1113 : la pastille de provenance sur
    // chaque ligne du tableau de pistes. Elle passe `p.source` telle quelle —
    // une piste dont la source n'est pas lue ne doit pas se dire « LOCAL ».
    'src/components/v2/ListePistesV2.svelte',
  ];


  for (const f of APPELANTS) {
    it(`${f} ne passe pas de repli 'local' à <ServiceBadge>`, () => {
      const fautes = lire(f)
        .split('\n')
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => /<ServiceBadge[^>]*\?\?\s*['"]local['"]/.test(l))
        .map(([n, l]) => `${f}:${n}: ${l.trim()}`);
      expect(fautes, fautes.join('\n')).toEqual([]);
    });
  }

  // Retiré en phase 5 : ce témoin lisait `components/SearchView.svelte`, où le
  // repli n'était pas posé sur la balise mais en amont, sur l'entrée `_sources`
  // (`_source ?? 'local'`), et où la branche locale peignait un `<span>LOCAL</span>`
  // EN DUR. L'écran de recherche actuel (`v2/SearchV2.svelte`) n'a ni cette
  // entrée ni ce span : ses seuls `source ?? 'local'` servent au COMPTAGE, au
  // filtrage et aux clés de liste — la catégorie que ce témoin exemptait déjà.
  // Le rebaser tel quel donnerait un vert qui ne garde rien ; la boucle
  // ci-dessus, elle, couvre bien SearchV2 pour la forme qui peint.
});
