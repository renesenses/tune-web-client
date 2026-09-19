import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Lecture YouTube — le module yt-dlp géré par le serveur, porté de l'ancienne
 * interface (seul écran qui savait l'installer) vers la section Streaming v2.
 *
 * La CONNEXION YouTube n'est pas portée, et c'est voulu : les routes dédiées
 * (`/streaming/youtube/auth/device-code`, `/poll`) et la route générique que
 * ce client emploie aboutissent au même gestionnaire serveur (`service_auth`).
 */
const V2 = readFileSync('src/components/v2/SettingsV2.svelte', 'utf8');
const debut = V2.indexOf("{:else if s.id === 'streaming'}");
const bloc = V2.slice(debut, V2.indexOf('{:else if s.id ===', debut + 1));
const corps = (nom: string) => {
  const i = V2.indexOf(`async function ${nom}(`);
  expect(i, `fonction introuvable : ${nom}`).toBeGreaterThan(-1);
  return V2.slice(i, V2.indexOf('\n  }\n', i));
};

describe('le module de lecture YouTube s’installe depuis Streaming', () => {
  it('la section dit s’il est prêt, et sinon offre de l’installer', () => {
    expect(bloc).toContain('{#if ytInstalled}');
    expect(bloc).toContain('onclick={enableYoutubePlayback}');
    expect(corps('enableYoutubePlayback')).toContain('api.enableYoutubePlayback()');
  });

  it('🔴 l’installation est SONDÉE jusqu’à sa fin — sinon « en cours » pour toujours', () => {
    expect(corps('enableYoutubePlayback')).toMatch(/ytPoll = setInterval\(refreshYoutubePlayback, \d+\)/);
    expect(corps('refreshYoutubePlayback')).toMatch(/if \(ytStatus !== 'downloading' && ytPoll\) \{ clearInterval\(ytPoll\)/);
  });

  it('l’état est lu à l’ouverture, et la sonde s’arrête quand l’écran se ferme', () => {
    const i = V2.indexOf('void refreshYoutubePlayback();');
    expect(i).toBeGreaterThan(-1);
    expect(V2.slice(i, i + 200)).toContain('return () => { if (ytPoll) { clearInterval(ytPoll)');
  });

  it('un échec d’installation est affiché', () => {
    expect(bloc).toContain("{#if ytStatus.startsWith('failed')}");
  });
});
