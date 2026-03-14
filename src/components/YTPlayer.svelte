<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ytPlayerState, _registerYTPlayer } from '../lib/stores/ytPlayer';

  let containerDiv: HTMLDivElement;
  let player: any = null;
  let pendingVideoId: string | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  function startProgressTimer() {
    stopProgressTimer();
    progressTimer = setInterval(() => {
      if (player?.getPlayerState?.() === 1) { // 1 = YT.PlayerState.PLAYING
        ytPlayerState.update(s => ({
          ...s,
          currentTime: player.getCurrentTime?.() ?? s.currentTime,
          duration: player.getDuration?.() ?? s.duration,
        }));
      }
    }, 1000);
  }

  function stopProgressTimer() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function initPlayer() {
    if (!containerDiv) return;
    const YT = (window as any).YT;
    player = new YT.Player(containerDiv, {
      width: '1',
      height: '1',
      playerVars: {
        autoplay: 1,
        controls: 0,
        playsinline: 1,
        rel: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          player.mute(); // IFrame is visual-only — audio routed via DLNA
          if (pendingVideoId) {
            player.loadVideoById(pendingVideoId);
            pendingVideoId = null;
          }
        },
        onStateChange: (event: any) => {
          const PlayerState = (window as any).YT.PlayerState;
          switch (event.data) {
            case PlayerState.PLAYING:
              ytPlayerState.update(s => ({
                ...s,
                playing: true,
                duration: player.getDuration?.() ?? s.duration,
              }));
              startProgressTimer();
              break;
            case PlayerState.PAUSED:
              ytPlayerState.update(s => ({ ...s, playing: false }));
              stopProgressTimer();
              break;
            case PlayerState.ENDED:
              ytPlayerState.update(s => ({ ...s, playing: false, currentTime: 0 }));
              stopProgressTimer();
              break;
          }
        },
        onError: (event: any) => {
          console.error('[YTPlayer] error code:', event.data);
          ytPlayerState.update(s => ({ ...s, playing: false }));
          stopProgressTimer();
        },
      },
    });
  }

  onMount(() => {
    _registerYTPlayer({
      play: (videoId: string) => {
        if (player) {
          player.loadVideoById(videoId);
        } else {
          pendingVideoId = videoId;
        }
      },
      pause: () => player?.pauseVideo(),
      resume: () => player?.playVideo(),
      seekTo: (seconds: number) => player?.seekTo(seconds, true),
      setVolume: (vol: number) => player?.setVolume(vol),
    });

    // Register global callback before loading script
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prev?.();
      initPlayer();
    };

    if ((window as any).YT?.Player) {
      // Script already loaded (e.g. hot reload)
      initPlayer();
    } else if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
    // else: script already loading, onYouTubeIframeAPIReady will fire
  });

  onDestroy(() => {
    stopProgressTimer();
    player?.destroy();
    player = null;
  });
</script>

<!-- Hidden off-screen container — the YT API replaces this div with an iframe -->
<div
  bind:this={containerDiv}
  style="position: fixed; top: -9999px; left: -9999px; width: 1px; height: 1px; pointer-events: none; overflow: hidden; z-index: -1;"
  aria-hidden="true"
></div>
