// Interface « Salon » (itération 1, 25/11/2026) — registre des interfaces,
// navigation interne, aides d'affichage, et la règle du thème : aucun visuel
// en dur dans les composants Salon, tout passe par le jeu de jetons.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  INTERFACES, STYLE_INTERFACE_DEFAUT, estStyleInterface, definitionInterface, salonActif,
  estThemeSalon, paletteV2DuSalon, pageDeLaVue, initiales, duree, minutesTotales,
  tuileLarge, joursDepuis, prenomDuProfil, titreAlbumLong, TITRE_ALBUM_LONG,
  attributsRacine, poserInterfaceSurRacine, normaliserStyleInterface, qualiteDeLaPiste, etatDuSignal, sectionsDiscographie,
} from '../interfaceSalon';
import { CHARGEURS_JETONS } from '../../components/salon/jetons';
import { REGLAGES } from '../reglagesIndex';
import { V2_SETTINGS } from '../v2Settings';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const DOSSIER_SALON = join(__dirname, '..', '..', 'components', 'salon');
const STYLES_SALON = join(__dirname, '..', '..', 'styles', 'roon-like');

describe('registre des interfaces', () => {
  it('l’interface actuelle est la première et le défaut', () => {
    expect(INTERFACES[0].id).toBe('actuelle');
    expect(STYLE_INTERFACE_DEFAUT).toBe('actuelle');
    expect(INTERFACES[0].coquille).toBe('actuelle');
  });

  it('identifiants uniques, libellés traduits en français et en anglais', () => {
    const ids = INTERFACES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const fr = lFr as unknown as Record<string, string>;
    const en = lEn as unknown as Record<string, string>;
    for (const i of INTERFACES) {
      for (const k of [i.libelle, i.aide]) {
        expect(fr[k], k).toBeTruthy();
        expect(en[k], k).toBeTruthy();
      }
    }
  });

  it('chaque coquille Salon désigne un jeu de jetons chargeable, et son fichier existe', () => {
    for (const i of INTERFACES.filter((x) => x.coquille === 'salon')) {
      expect(i.jetons, i.id).toBeTruthy();
      expect(CHARGEURS_JETONS[i.jetons!], i.id).toBeTypeOf('function');
      expect(readdirSync(STYLES_SALON)).toContain(`jetons-${i.jetons}.css`);
    }
  });

  it('une valeur inconnue retombe sur l’interface actuelle', () => {
    expect(estStyleInterface('roon-like')).toBe(true);
    expect(estStyleInterface('inconnue')).toBe(false);
    expect(estStyleInterface(undefined)).toBe(false);
    expect(definitionInterface('inconnue').id).toBe('actuelle');
    expect(salonActif('roon-like')).toBe(true);
    // Itération 7 : l'ancien identifiant « salon » garde le choix de l'utilisateur.
    expect(salonActif('salon')).toBe(true);
    expect(normaliserStyleInterface('salon')).toBe('roon-like');
    expect(normaliserStyleInterface('roon-like')).toBe('roon-like');
    expect(normaliserStyleInterface('inconnue')).toBeNull();
    expect(definitionInterface('salon').id).toBe('roon-like');
    expect(salonActif('actuelle')).toBe(false);
    expect(salonActif(null)).toBe(false);
  });

  it('thème de Salon : clair par défaut, palette v2 assortie', () => {
    expect(estThemeSalon('sombre')).toBe(true);
    expect(estThemeSalon('rose')).toBe(false);
    expect(paletteV2DuSalon('sombre')).toBe('dark-grey');
    expect(paletteV2DuSalon('clair')).toBe('clear-white');
    expect(paletteV2DuSalon(undefined)).toBe('clear-white');
  });
});

describe('le réglage « Interface » est EN TÊTE du premier écran des Réglages', () => {
  it('première section du premier onglet, avec ses deux ancres indexées', () => {
    expect(V2_SETTINGS[0].id).toBe('general');
    expect(V2_SETTINGS[0].sections[0].id).toBe('choixInterface');
    const ids = REGLAGES.filter((r) => r.section === 'choixInterface').map((r) => r.id);
    expect(ids).toEqual(['choix-interface', 'theme-salon']);
  });
});

describe('navigation de Salon', () => {
  it('vues de Tune → pages Salon', () => {
    expect(pageDeLaVue('home')).toEqual({ page: 'accueil' });
    expect(pageDeLaVue('library')).toEqual({ page: 'albums' });
    expect(pageDeLaVue('library', { album: 12 })).toEqual({ page: 'album', id: 12 });
    expect(pageDeLaVue('library', { artiste: 3 })).toEqual({ page: 'artiste', id: 3 });
    expect(pageDeLaVue('genres')).toEqual({ page: 'genres' });
    expect(pageDeLaVue('queue')).toEqual({ page: 'file' });
    expect(pageDeLaVue('settings')).toEqual({ page: 'tune', vue: 'settings' });
  });
});

describe('aides d’affichage', () => {
  it('initiales', () => {
    expect(initiales('Abdullah Ibrahim')).toBe('AI');
    expect(initiales('-M-')).toBe('M');
    expect(initiales('Adele')).toBe('AD');
    expect(initiales('')).toBe('?');
  });
  it('durées', () => {
    expect(duree(235000)).toBe('3:55');
    expect(duree(3_725_000)).toBe('1:02:05');
    expect(duree(null)).toBe('0:00');
    expect(minutesTotales([60000, 90000, null])).toBe(3);
  });
  it('mosaïque des genres : une tuile large par rangée, qui glisse', () => {
    const larges = Array.from({ length: 9 }, (_, i) => tuileLarge(i));
    expect(larges).toEqual([true, false, false, false, true, false, false, false, true]);
  });
  it('jours depuis l’ajout, en secondes ou en millisecondes', () => {
    const maintenant = Date.UTC(2026, 10, 25, 12);
    expect(joursDepuis(maintenant / 1000 - 3 * 86400, maintenant)).toBe(3);
    expect(joursDepuis(maintenant - 86_400_000, maintenant)).toBe(1);
    expect(joursDepuis(null, maintenant)).toBeNull();
  });
  it('titre d’album long : au-delà du seuil seulement, espaces de bord ignorés', () => {
    expect(titreAlbumLong('I Am Alicia')).toBe(false);
    expect(titreAlbumLong(null)).toBe(false);
    expect(titreAlbumLong('x'.repeat(TITRE_ALBUM_LONG))).toBe(false);
    expect(titreAlbumLong(`  ${'x'.repeat(TITRE_ALBUM_LONG)}  `)).toBe(false);
    expect(titreAlbumLong('A Night at Birdland (Two Original Albums Plus Bonus)')).toBe(true);
  });
  it('prénom du profil', () => {
    expect(prenomDuProfil({ name: 'bertrand@exemple.fr', display_name: 'Bertrand' })).toBe('Bertrand');
    expect(prenomDuProfil({ name: 'bertrand@exemple.fr' })).toBe('bertrand');
    expect(prenomDuProfil(null)).toBe('');
  });
});

describe('thème : aucun visuel en dur dans les composants Salon', () => {
  const fichiers = readdirSync(DOSSIER_SALON).filter((f) => f.endsWith('.svelte'));
  it.each(fichiers)('%s — pas de couleur, de taille de texte ni de rayon littéral', (f) => {
    const style = readFileSync(join(DOSSIER_SALON, f), 'utf8').split('<style>')[1] ?? '';
    expect(style.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g), 'couleur en dur').toBeNull();
    expect(style.match(/font-size:\s*(?:calc\()?\d/g), 'taille de texte en dur').toBeNull();
    expect(style.match(/border-radius:\s*\d+px/g), 'rayon en dur').toBeNull();
    expect(style.match(/box-shadow:\s*\d/g), 'ombre en dur').toBeNull();
  });
  it('la mise en page et l’habillage des Réglages ne portent aucune couleur', () => {
    for (const f of ['mise-en-page.css', 'reglages.css', 'ecrans-tune.css']) {
      const css = readFileSync(join(STYLES_SALON, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g), f).toBeNull();
    }
  });
});

// Itération 6 — l'app ENTIÈRE prend l'allure de Salon : l'interface active est
// posée sur <html>, et une couche commune habille les écrans de Tune.
describe('interface posée sur <html>', () => {
  function racine() {
    const a = new Map<string, string>();
    return {
      a,
      setAttribute: (k: string, v: string) => void a.set(k, v),
      removeAttribute: (k: string) => void a.delete(k),
    } as unknown as HTMLElement & { a: Map<string, string> };
  }
  it('rien pour l’interface actuelle', () => {
    expect(attributsRacine('actuelle', 'sombre')).toBeNull();
    expect(attributsRacine(undefined, undefined)).toBeNull();
  });
  it('le jeu de jetons et le thème pour Salon ; thème inconnu → clair', () => {
    expect(attributsRacine('roon-like', 'sombre')).toEqual({ interface: 'roon-like', theme: 'sombre' });
    expect(attributsRacine('roon-like', 'rose')).toEqual({ interface: 'roon-like', theme: 'clair' });
    expect(attributsRacine('salon', 'clair')).toEqual({ interface: 'roon-like', theme: 'clair' });
  });
  it('pose puis retire les deux attributs', () => {
    const r = racine();
    poserInterfaceSurRacine('roon-like', 'sombre', r);
    expect(r.a.get('data-interface')).toBe('roon-like');
    expect(r.a.get('data-salon-theme')).toBe('sombre');
    poserInterfaceSurRacine('actuelle', 'sombre', r);
    expect(r.a.size).toBe(0);
  });
});

/** Les sélecteurs d'une liste, coupés aux virgules hors parenthèses. */
function auPremierNiveau(liste: string): string[] {
  const parts: string[] = [];
  let prof = 0, debut = 0;
  for (let i = 0; i < liste.length; i++) {
    const c = liste[i];
    if (c === '(') prof++;
    else if (c === ')') prof--;
    else if (c === ',' && prof === 0) { parts.push(liste.slice(debut, i)); debut = i + 1; }
  }
  parts.push(liste.slice(debut));
  return parts;
}

describe('couche commune des écrans de Tune (ecrans-tune.css)', () => {
  const css = readFileSync(join(STYLES_SALON, 'ecrans-tune.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selecteurs = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .map((m) => m[1].trim())
    .filter((s) => s && !s.startsWith('@'))
    .flatMap((s) => auPremierNiveau(s).map((x) => x.trim()));
  it('chaque règle est limitée à Salon (`:root[data-interface="roon-like"]`)', () => {
    expect(selecteurs.length).toBeGreaterThan(20);
    for (const s of selecteurs) expect(s, s).toMatch(/^:root\[data-interface="roon-like"\]/);
  });
  it('TESS (rc14) et les Réglages (écran de référence) sont exclus de chaque règle portant sur les écrans montés', () => {
    for (const s of selecteurs.filter((x) => x.includes('.vue-tune') && !x.includes('::-webkit-scrollbar'))) {
      expect(s, s).toContain('.vue-tune:not([data-vue="tess"], [data-vue="settings"])');
    }
  });
  it('aucune taille de texte, aucun rayon ni aucune ombre en dur', () => {
    expect(css.match(/font-size:\s*(?:calc\()?\d/g)).toBeNull();
    expect(css.match(/border-radius:\s*\d+px/g)).toBeNull();
    expect(css.match(/box-shadow:\s*\d/g)).toBeNull();
  });
  it('la coquille Salon la charge, et la popup de configuration de TESS y est montée', () => {
    const shell = readFileSync(join(DOSSIER_SALON, 'ShellSalon.svelte'), 'utf8');
    expect(shell).toContain("styles/roon-like/ecrans-tune.css");
    expect(shell).toContain('data-vue={$activeView}');
    expect(shell).toContain('<PopupConfiguration />');
  });
});

describe('Roon-like : nom cité, marque mentionnée', () => {
  it('libellé « Roon-like », description et mention de marque dans chaque langue', () => {
    const def = INTERFACES.find((i) => i.id === 'roon-like')!;
    expect(def.mention).toBe('roonLike.reglage.mentionMarque');
    const dossier = join(__dirname, '..', 'locales');
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.ts') && x !== 'index.ts')) {
      const src = readFileSync(join(dossier, f), 'utf8');
      expect(src, f).toContain('"roonLike.reglage.roonLike": "Roon-like"');
      expect(src.match(/"roonLike\.reglage\.roonLikeAide": "[^"]*Roon/), f).toBeTruthy();
      expect(src.match(/"roonLike\.reglage\.mentionMarque": "[^"]*Roon Labs[^"]*Roon Labs/), f).toBeTruthy();
    }
  });
});

// Itération 8 (27/11/2026) — Lecture en cours façon Roon-like, vues sans
// écran, marge des écrans de Tune, panneau OAAT traduit.
describe('itération 8', () => {
  it('« Lecture en cours » ouvre la page Roon-like ; les vues sans écran ouvrent leur écran de Tune', () => {
    expect(pageDeLaVue('nowplaying')).toEqual({ page: 'lecture' });
    expect(pageDeLaVue('services')).toEqual({ page: 'tune', vue: 'streaming' });
    expect(pageDeLaVue('bandcamp')).toEqual({ page: 'tune', vue: 'streaming' });
    expect(pageDeLaVue('radiofavorites')).toEqual({ page: 'tune', vue: 'radios' });
    expect(pageDeLaVue('genretree')).toEqual({ page: 'tune', vue: 'genretree' });
    const shell = readFileSync(join(DOSSIER_SALON, 'ShellSalon.svelte'), 'utf8');
    expect(shell).toContain('<LectureSalon />');
    expect(shell).toContain('<GenreTreeView />');
    // Retouche démo : la progression (temps, barre déplaçable) sur la page.
    const lecture = readFileSync(join(DOSSIER_SALON, 'LectureSalon.svelte'), 'utf8');
    expect(lecture).toContain('<SeekBar positionMs={$seekPositionMs}');
  });
  it('qualité de la piste et état du signal, sans rien inventer', () => {
    expect(qualiteDeLaPiste({ format: 'flac', sample_rate: 96000, bit_depth: 24 })).toBe('FLAC · 96 kHz · 24 bit');
    expect(qualiteDeLaPiste({ format: 'flac', sample_rate: 44100, bit_depth: 16 })).toBe('FLAC · 44.1 kHz · 16 bit');
    expect(qualiteDeLaPiste({ format: null })).toBe('');
    expect(qualiteDeLaPiste(null)).toBe('');
    expect(etatDuSignal({ bit_perfect: true })).toBe('bitPerfect');
    expect(etatDuSignal({ bit_perfect: false, lossless: true })).toBe('sansPerte');
    expect(etatDuSignal({ bit_perfect: false, lossless: false })).toBe('traite');
    expect(etatDuSignal(null)).toBeNull();
  });
  it('les écrans de Tune s’alignent sur la marge de page (jeton, pas de valeur en dur)', () => {
    const css = readFileSync(join(STYLES_SALON, 'ecrans-tune.css'), 'utf8');
    expect(css).toMatch(/> :not\(\.popup-config\) \{\s*margin-inline: var\(--s-retrait-ecran\);/);
    const jetons = readFileSync(join(STYLES_SALON, 'jetons-roon-like.css'), 'utf8');
    expect(jetons).toContain('--s-retrait-ecran: calc(var(--s-marge-page) - var(--s-gouttiere-tune));');
  });
  it('panneau OAAT : aucun texte anglais en dur, chaque clé traduite', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'partages', 'OaatGroupsPanel.svelte'), 'utf8');
    const balisage = src.split('</script>')[1].split('<style>')[0];
    // `(?<!=)` : le `>` d'une flèche `() =>` n'est pas du texte.
    expect(balisage.match(/(?<!=)>\s*[A-Za-z][^<{]*</g)).toBeNull();
    expect(balisage.match(/placeholder="[A-Za-z]/g)).toBeNull();
    const cles = [...balisage.matchAll(/'(oaat\.[a-zA-Z.]+)'/g)].map((m) => m[1]);
    expect(cles.length).toBeGreaterThan(10);
    const fr = lFr as unknown as Record<string, string>;
    for (const k of cles) expect(fr[k], k).toBeTruthy();
  });
});

describe('discographie en sections (27/11/2026)', () => {
  it('albums principaux, singles et EP, compilations ; sections vides absentes', () => {
    type A = { id: number; release_type?: string | null; inferred_release_type?: string | null; is_compilation?: boolean | null };
    const a: A[] = [
      { id: 1, release_type: 'album' }, { id: 2, release_type: 'Single' }, { id: 3, inferred_release_type: 'ep' },
      { id: 4, is_compilation: true }, { id: 5 }, { id: 6, release_type: 'compilation' },
    ];
    expect(sectionsDiscographie(a).map((s) => [s.section, s.albums.map((x) => x.id)])).toEqual([
      ['albums', [1, 5]], ['singles', [2, 3]], ['compilations', [4, 6]],
    ]);
    const seul: { id: number; release_type?: string | null }[] = [{ id: 1 }];
    expect(sectionsDiscographie(seul).map((s) => s.section)).toEqual(['albums']);
    expect(sectionsDiscographie([])).toEqual([]);
  });
});
