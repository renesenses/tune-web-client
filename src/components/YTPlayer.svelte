<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ytPlayerState, ytVideoRect, hideYTVideo, _registerYTPlayer } from '../lib/stores/ytPlayer';

  let wrapperDiv: HTMLDivElement;
  let containerDiv: HTMLDivElement;
  let player: any = null;
  let pendingVideoId: string | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;

  // Reactive style for wrapper: off-screen or positioned over NowPlaying artwork
  let wrapperStyle = $derived.by(() => {
    const rect = $ytVideoRect;
    const show = $ytPlayerState.showVideo;
    if (show && rect) {
      return `position: fixed; top: ${rect.top}px; left: ${rect.left}px; width: ${rect.width}px; height: ${rect.height}px; z-index: 200; border-radius: var(--radius-lg); overflow: hidden; pointer-events: auto;`;
    }
    return 'position: fixed; top: -9999px; left: -9999px; width: 1px; height: 1px; pointer-events: none; overflow: hidden; z-index: -1;';
  });

  function startProgressTimer() {
    stopProgressTimer();
    progressTimer = setInterval(() => {
      if (player?.getPlayerState?.() === 1) {
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
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        playsinline: 1,
        rel: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          player.mute(); // Always muted — audio routed via DLNA
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

    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prev?.();
      initPlayer();
    };

    if ((window as any).YT?.Player) {
      initPlayer();
    } else if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });

  onDestroy(() => {
    stopProgressTimer();
    player?.destroy();
    player = null;
  });
</script>

<!--
  Wrapper: off-screen when hidden, positioned over NowPlaying artwork when visible.
  containerDiv is replaced by the YT API with an iframe, but stays inside wrapperDiv.
-->
<div bind:this={wrapperDiv} style={wrapperStyle} aria-hidden={!$ytPlayerState.showVideo}>
  <div bind:this={containerDiv} style="width: 100%; height: 100%;"></div>
</div>

<style>
  /* Force the YT-generated iframe to fill its wrapper */
  div :global(iframe) {
    width: 100% !important;
    height: 100% !important;
    display: block;
  }
</style>
