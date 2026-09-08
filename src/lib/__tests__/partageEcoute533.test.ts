/**
 * #533 — « Partager » de l'écran « En écoute » ne faisait rien, en silence.
 *
 * Deux défauts, et le second seul suffisait à tout casser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { texteDePartage, partageUtilisable, type CartePartage } from '../partageEcoute';

/** Ce que le serveur rend RÉELLEMENT (`routes/playback.rs`, `share_now_playing`). */
const CARTE: CartePartage = {
  token: 'a1b2',
  url: '/shared/a1b2',
  track: {
    title: 'Oye Como Va', artist_name: 'Santana', album_title: 'Abraxas',
    cover_path: '/covers/x.jpg', source: 'local',
  },
};

describe('Le texte de partage', () => {
  it('se compose des champs que le serveur envoie vraiment', () => {
    expect(texteDePartage(CARTE, 'http://192.168.1.18:8888'))
      .toBe('Oye Como Va — Santana (Abraxas)\nhttp://192.168.1.18:8888/shared/a1b2');
  });

  it('🔴 ne cherche PAS un champ `text` — il n’existe pas', () => {
    // C'était le défaut : `card.text` valait `undefined`, et c'est cela qui
    // partait au presse-papiers. Même la méthode corrigée, le partage aurait
    // collé « undefined ».
    const brut = JSON.stringify(CARTE);
    expect(brut).not.toContain('"text"');
    expect(texteDePartage(CARTE)).not.toContain('undefined');
  });

  it('une radio sans album ne laisse pas de parenthèses vides', () => {
    const radio = { ...CARTE, track: { title: 'Le Cours de l’Histoire', artist_name: 'France Culture' } };
    expect(texteDePartage(radio, 'http://x')).toBe('Le Cours de l’Histoire — France Culture\nhttp://x/shared/a1b2');
  });

  it('un titre seul reste partageable', () => {
    expect(texteDePartage({ token: '', url: '', track: { title: 'Inconnu' } })).toBe('Inconnu');
  });

  it('le lien relatif devient absolu, et une seule barre les sépare', () => {
    expect(texteDePartage(CARTE, 'http://x/')).toContain('http://x/shared/a1b2');
  });

  it('🔴 rien à coller n’est PAS un partage', () => {
    // Un presse-papiers vide, un message de succès : c'est le même mensonge
    // que le ticket décrit, sous une autre forme.
    expect(partageUtilisable(null)).toBe(false);
    expect(partageUtilisable({ token: '', url: '', track: {} })).toBe(false);
    expect(partageUtilisable(CARTE)).toBe(true);
  });
});

describe('🔴 L’appel lui-même', () => {
  const api = readFileSync('src/lib/api.ts', 'utf8');
  const ecran = readFileSync('src/components/NowPlaying.svelte', 'utf8');

  it('part en POST — la route est déclarée `post("/{id}/share")`', () => {
    const bloc = api.slice(api.indexOf('export function shareNowPlaying'), api.indexOf('export function transferPlayback'));
    expect(bloc).toContain("method: 'POST'");
  });

  it('l’écran passe par le composeur, pas par un champ inventé', () => {
    expect(ecran).toContain('texteDePartage(carte, location.origin)');
    expect(ecran).not.toContain('card.text');
  });

  it('🔴 un échec se DIT, il ne meurt plus dans la console', () => {
    const bloc = ecran.slice(ecran.indexOf('async function handleShare'), ecran.indexOf('async function loadNpCredits'));
    expect(bloc).toContain("notifications.error($t('nowplaying.shareError'");
  });
});
