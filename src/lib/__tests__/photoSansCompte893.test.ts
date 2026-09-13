// 🔴 `renesenses/tune-web-client#893` — deux testeurs (fils 1681 et 1676) ont
// demandé à se donner une photo, à un jour d'intervalle.
//
// CE QUI A ÉTÉ LIVRÉ, ET QUI RESTE
// ---------------------------------
// La photo est attachée à un compte mozaiklabs.fr : montrée seulement si elle
// appartient au compte ouvert, effacée de l'écran à la déconnexion, jamais
// héritée par le compte suivant. Tout cela est juste.
//
// 🔴 CE QUI MANQUAIT
// Sur un serveur SANS nuage configuré, personne ne peut jamais ouvrir de
// compte — donc personne ne peut jamais se donner de photo. C'est la situation
// EXACTE des deux demandeurs, et le refus les renvoyait vers un écran de
// connexion qui n'existe pas chez eux. La fiche le dit depuis #947 et #951 ;
// l'arbitrage a été rendu le 12/09 : sans compte possible, la photo est locale.
//
// MESURÉ le 12/09/2026 sur la .18 en v0.9.147 :
//
//   GET /cloud/sso/status
//     → { configured: true, connected: true, user: { email, display_name, … } }
//
// `configured` sépare « pas de compte OUVERT » de « pas de compte POSSIBLE ».
// `AvatarMenu` le lisait DÉJÀ — pour offrir ou non « Se connecter » — mais la
// photo ne le consultait pas.
//
// CONTRE-ÉPREUVE : chaque bloc rejoue la règle d'AVANT sur le même état et
// montre ce qu'elle en faisait.
import { describe, expect, it } from 'vitest';
import {
  peutChoisirPhoto, photoAAfficher, proprietairePourNouvellePhoto,
  type EtatCompte,
} from '../proprietaireAvatar';

const SANS_NUAGE: EtatCompte = { configured: false, connected: false, identite: '' };
const NUAGE_DECONNECTE: EtatCompte = { configured: true, connected: false, identite: '' };
const NUAGE_ALICE: EtatCompte = { configured: true, connected: true, identite: 'alice@x.test' };
const NUAGE_BOB: EtatCompte = { configured: true, connected: true, identite: 'bob@x.test' };

describe('#893 — sans nuage configuré, la photo est LOCALE', () => {
  it('🔴 on peut en poser une : c’est tout le ticket', () => {
    expect(peutChoisirPhoto(SANS_NUAGE)).toBe('oui');
  });

  it('elle n’est attachée à personne — aucun compte ne viendra la réclamer', () => {
    expect(proprietairePourNouvellePhoto(SANS_NUAGE)).toBe('');
  });

  it('et elle s’affiche', () => {
    expect(photoAAfficher(SANS_NUAGE, { image: 'data:x', compte: '' })).toBe('data:x');
  });

  it('CONTRE-ÉPREUVE : la règle d’avant la refusait pour toujours', () => {
    // `if (!ssoConnected) { refuser }` — sans nuage, `connected` est FAUX à
    // jamais, donc le refus était définitif.
    const avant = (e: EtatCompte) => (e.connected ? 'oui' : 'connexion');
    expect(avant(SANS_NUAGE), 'le témoin ne reproduit pas le refus').toBe('connexion');
    expect(peutChoisirPhoto(SANS_NUAGE)).toBe('oui');
  });
});

describe('#893 — avec un nuage, RIEN ne change', () => {
  it('déconnecté, le refus reste juste — « Se connecter » est dans le panneau', () => {
    expect(peutChoisirPhoto(NUAGE_DECONNECTE)).toBe('connexion');
  });

  it('connecté, la photo est attachée au compte', () => {
    expect(peutChoisirPhoto(NUAGE_ALICE)).toBe('oui');
    expect(proprietairePourNouvellePhoto(NUAGE_ALICE)).toBe('alice@x.test');
  });

  it('🔴 un AUTRE compte n’hérite pas de la photo du précédent', () => {
    const rangee = { image: 'data:alice', compte: 'alice@x.test' };
    expect(photoAAfficher(NUAGE_ALICE, rangee)).toBe('data:alice');
    expect(photoAAfficher(NUAGE_BOB, rangee), 'Bob voit la photo d’Alice').toBe('');
  });

  it('🔴 la déconnexion rend le dégradé, sans détruire la photo', () => {
    const rangee = { image: 'data:alice', compte: 'alice@x.test' };
    expect(photoAAfficher(NUAGE_DECONNECTE, rangee)).toBe('');
    // Elle attend le retour de son compte : rien n'est effacé.
    expect(photoAAfficher(NUAGE_ALICE, rangee)).toBe('data:alice');
  });
});

describe('#893 — le cas qui se glisse entre les deux', () => {
  it('🔴 un nuage RETIRÉ ne rend pas la photo d’un compte à l’écran', () => {
    // Le serveur peut perdre son `client_id` entre deux démarrages. La photo
    // marquée d'un compte resterait sinon affichée, alors que plus personne ne
    // peut ouvrir ce compte pour la retirer.
    const rangee = { image: 'data:alice', compte: 'alice@x.test' };
    expect(photoAAfficher(SANS_NUAGE, rangee)).toBe('');
  });

  it('une photo locale survit à l’ARRIVÉE d’un nuage, sans se montrer', () => {
    const locale = { image: 'data:local', compte: '' };
    expect(photoAAfficher(SANS_NUAGE, locale)).toBe('data:local');
    // Nuage configuré ensuite : elle n'appartient à aucun compte, donc elle
    // s'efface de l'écran — mais les préférences la gardent.
    expect(photoAAfficher(NUAGE_ALICE, locale)).toBe('');
  });

  it('aucune photo rangée : rien à montrer, quel que soit l’état', () => {
    for (const e of [SANS_NUAGE, NUAGE_DECONNECTE, NUAGE_ALICE]) {
      expect(photoAAfficher(e, { image: '', compte: '' })).toBe('');
    }
  });

  it('un nuage connecté SANS identité est traité comme déconnecté', () => {
    // `email` et `display_name` tous deux vides : on ne sait pas à qui
    // attacher la photo, donc on ne l'attache pas.
    const bancal: EtatCompte = { configured: true, connected: true, identite: '' };
    expect(peutChoisirPhoto(bancal)).toBe('connexion');
    expect(photoAAfficher(bancal, { image: 'data:x', compte: 'alice@x.test' })).toBe('');
  });
});

describe('#893 — l’écran s’en sert vraiment', () => {
  const lire = async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    return readFileSync(resolve(__dirname, '../../components/v2/AvatarMenu.svelte'), 'utf-8');
  };

  it('les trois règles sont appelées, aucune n’est recopiée', async () => {
    const src = await lire();
    expect(src).toContain('photoAAfficher(etatCompte,');
    expect(src).toContain("peutChoisirPhoto(etatCompte) === 'connexion'");
    expect(src).toContain('proprietairePourNouvellePhoto(etatCompte)');
  });

  it('🔴 `configured` est bien passé — sans lui la règle ne peut pas trancher', async () => {
    const src = await lire();
    const i = src.indexOf('const etatCompte = $derived');
    expect(i, 'l’état du compte a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(i, src.indexOf('});', i));
    expect(bloc).toContain('configured: ssoConfigured');
    expect(bloc).toContain('connected: ssoConnected');
  });
});
