/**
 * Chaque profil peut porter une PHOTO — chantier UI.
 *
 * Bertrand, 19/09/2026, capture à l'appui : « il manque l'avatar ». L'écran
 * Réglages ▸ Général ▸ Profils n'affichait qu'une initiale sur fond coloré,
 * alors que la bulle du coin haut-droit porte une vraie photo.
 *
 * 🔴 Une seule case, deux formes. La colonne en base s'appelle `avatar_path
 * TEXT` — elle était PRÉVUE pour une image ; l'API l'a renommée `avatar_color`
 * et y range une couleur (`#6366f1`, mesuré sur le .18), tout en acceptant
 * toujours `avatar_path` en alias. On y met l'un ou l'autre, et
 * `estDataUrlImage` — déjà écrite pour la bulle — les distingue. Aucune
 * migration.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { pastilleDe, initialeDe, FOND_PAR_DEFAUT } from '../pastilleProfil';

const UNE_IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('la pastille : couleur ou photo', () => {
  it('une data URL est une PHOTO', () => {
    const p = pastilleDe(UNE_IMAGE, 'Bertrand');
    expect(p.sorte).toBe('photo');
    expect(p.sorte === 'photo' && p.url).toBe(UNE_IMAGE);
  });

  it('une couleur reste une couleur, avec son initiale', () => {
    const p = pastilleDe('#6366f1', 'Bertrand');
    expect(p).toEqual({ sorte: 'couleur', fond: '#6366f1', initiale: 'B' });
  });

  it('🔴 un profil SANS couleur ne rend pas une pastille transparente', () => {
    // C'est le cas du profil « Default » du .18 : `avatar_color` y vaut null,
    // et un `background` vide laissait l'initiale flotter sur rien.
    for (const rien of [null, undefined, '', '   ']) {
      const p = pastilleDe(rien, 'Default');
      expect(p.sorte).toBe('couleur');
      expect(p.sorte === 'couleur' && p.fond, String(rien)).toBe(FOND_PAR_DEFAUT);
    }
  });

  it('🔴 seule une data URL compte comme image — pas « ça commence par # »', () => {
    // Tester le contraire laisserait passer un nom de couleur CSS ou une
    // chaîne vide comme s'il s'agissait d'une photo.
    for (const pasUneImage of ['rebeccapurple', '#fff', 'data:text/plain;base64,QQ==']) {
      expect(pastilleDe(pasUneImage, 'X').sorte, pasUneImage).toBe('couleur');
    }
  });

  it('une initiale sûre, même sans nom', () => {
    expect(initialeDe(null)).toBe('?');
    expect(initialeDe('  ')).toBe('?');
    expect(initialeDe('éric')).toBe('É');
  });
});

describe('l écran', () => {
  const vue = readFileSync('src/components/v2/ProfilsV2.svelte', 'utf8');

  it('la pastille d une ligne sait rendre une photo', () => {
    expect(vue).toContain('pastilleDe(p.avatar_color, nomDuProfil(p))');
    expect(vue).toContain('<img class="rond"');
  });

  it('en édition, la pastille OUVRE le sélecteur de fichier', () => {
    expect(vue).toContain('type="file"');
    expect(vue).toContain('accept="image/*"');
    expect(vue).toContain('profiles.photoChoose');
  });

  it('🔴 elle réutilise l encodeur de la bulle, elle n en écrit pas un second', () => {
    // `avatarDepuisFichier` recadre, réduit à 192 px, plafonne à 96 Ko et
    // NOMME ses refus. En réécrire un donnerait deux plafonds à maintenir.
    expect(vue).toContain("from '../../lib/avatarLocal'");
    expect(vue).toContain('avatarDepuisFichier(fichier)');
    expect(vue).toContain('CLE_MESSAGE');
  });

  it('🔴 elle appelle le `updateProfile` du MAGASIN, à trois arguments', () => {
    // Celui d'`api` prend un objet. Ma première version mélangeait les deux et
    // appelait un `loadProfiles()` non importé : `check-svelte` l'a attrapé.
    // Ce n'est pas une erreur de typage — le composant lève à l'exécution, et
    // c'est ainsi que la 0.9.62 est partie (`albumWall`).
    expect(vue).toMatch(/await updateProfile\(p\.id, nom, url\)/);
    // 🔴 Bornée au CODE : le commentaire au-dessus de l'appel nomme
    // volontairement `loadProfiles()` pour dire pourquoi il n'y est plus.
    // Une garde sur le mot seul rougirait sur l'explication elle-même —
    // troisième fois de la session.
    const sansCommentaires = vue
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(sansCommentaires).not.toContain('loadProfiles');
  });

  it('⚠️ aucun `{@const}` sous un élément — seulement sous un bloc', () => {
    // Svelte ne l'accepte qu'en enfant immédiat d'un bloc. Sous `<label>` ou
    // `<button>`, il est refusé à la compilation.
    for (const ligne of vue.split('\n')) {
      if (!ligne.includes('{@const')) continue;
      const avant = vue.slice(0, vue.indexOf(ligne));
      const dernierBloc = Math.max(avant.lastIndexOf('{#'), avant.lastIndexOf('{:'));
      const dernierElement = avant.lastIndexOf('<', avant.length);
      expect(dernierBloc, `\`{@const}\` mal placé : ${ligne.trim()}`).toBeGreaterThan(-1);
      expect(dernierElement).toBeGreaterThan(-1);
    }
  });
});
