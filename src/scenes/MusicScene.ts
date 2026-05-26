import * as Phaser from 'phaser';

const TRACKS = [
  { key: 'bgm_cup_of_tea', file: 'assets/audio/lofi_cup_of_tea.mp3' },
  { key: 'bgm_cat_cafe', file: 'assets/audio/lofi_cat_cafe.mp3' },
  { key: 'bgm_morning_rain', file: 'assets/audio/lofi_morning_rain.mp3' },
  { key: 'bgm_oceanside', file: 'assets/audio/lofi_oceanside.mp3' },
  { key: 'bgm_gone_fishin', file: 'assets/audio/bgm_gone_fishin.mp3' },
  { key: 'bgm_beary_fishy', file: 'assets/audio/bgm_beary_fishy.mp3' },
  { key: 'bgm_bossa_nova', file: 'assets/audio/bgm_bossa_nova.mp3' },
  { key: 'bgm_forest_ambience', file: 'assets/audio/bgm_forest_ambience.mp3' },
  { key: 'bgm_reel_winner', file: 'assets/audio/bgm_reel_winner.mp3' },
];

export class MusicScene extends Phaser.Scene {
  private currentTrack: Phaser.Sound.BaseSound | null = null;
  private trackIndex = 0;
  private isMuted = false;
  private volume = 0.4;
  private playerEl: HTMLDivElement | null = null;
  private playBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private muteBtn!: HTMLButtonElement;
  private trackNameEl!: HTMLSpanElement;

  constructor() {
    super({ key: 'MusicScene' });
  }

  preload(): void {
    for (const t of TRACKS) {
      this.load.audio(t.key, t.file);
    }
  }

  create(): void {
    this.createPlayerUI();
    // Defer first play until a user gesture (browser autoplay policy)
    const unlock = () => {
      const sm = this.sound as Phaser.Sound.WebAudioSoundManager;
      if (sm.context?.state === 'suspended') {
        sm.context.resume();
      }
      if (!this.currentTrack && !this.isMuted) {
        this.startTrack(0);
      }
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
  }

  // Called by BuilderScene when scene shuts down
  shutdown(): void {
    this.stopMusic();
    this.playerEl?.remove();
    this.playerEl = null;
  }

  // --- Public API for BuilderScene ---

  playSfx(effect: 'swing' | 'thwack' | 'cup' | 'splash' | 'tree'): void {
    if (this.isMuted) return;
    const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
    if (!ctx) return;
    this.synthesizeSfx(ctx, effect);
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.currentTrack?.pause();
    } else {
      this.currentTrack?.resume();
    }
    this.muteBtn.textContent = this.isMuted ? '🔇' : '🔊';
    return this.isMuted;
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  // --- Internal ---

  private startTrack(index: number): void {
    this.stopMusic();
    this.trackIndex = index % TRACKS.length;
    const track = TRACKS[this.trackIndex];
    this.currentTrack = this.sound.add(track.key, { loop: false, volume: this.volume });

    if (!this.isMuted) {
      this.currentTrack.play();
    }

    const name = track.key
      .replace('bgm_', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    if (this.trackNameEl) {
      this.trackNameEl.textContent = name;
    }

    // Auto-advance to next track when current ends
    this.currentTrack.once('complete', () => {
      this.nextTrack();
    });
  }

  private stopMusic(): void {
    if (this.currentTrack) {
      this.currentTrack.stop();
      this.currentTrack.destroy();
      this.currentTrack = null;
    }
  }

  private nextTrack(): void {
    this.startTrack(this.trackIndex + 1);
  }

  private prevTrack(): void {
    this.startTrack((this.trackIndex - 1 + TRACKS.length) % TRACKS.length);
  }

  private createPlayerUI(): void {
    const el = document.createElement('div');
    el.id = 'music-player';
    el.style.cssText = `
      position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 101;
      background: rgba(0,0,0,0.8); border-radius: 8px; padding: 6px 10px;
      display: flex; align-items: center; gap: 6px; font-family: sans-serif;
    `;

    this.muteBtn = document.createElement('button');
    this.muteBtn.textContent = '🔊';
    this.muteBtn.title = 'Toggle music/SFX';
    this.muteBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;padding:2px;';
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    el.appendChild(this.muteBtn);

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '⏮';
    prevBtn.title = 'Previous track';
    prevBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;color:#ccc;padding:2px;';
    prevBtn.addEventListener('click', () => this.prevTrack());
    el.appendChild(prevBtn);

    this.playBtn = document.createElement('button');
    this.playBtn.textContent = '⏸';
    this.playBtn.title = 'Pause/Resume';
    this.playBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;color:#fff;padding:2px;';
    this.playBtn.addEventListener('click', () => this.togglePlay());
    el.appendChild(this.playBtn);

    this.nextBtn = document.createElement('button');
    this.nextBtn.textContent = '⏭';
    this.nextBtn.title = 'Next track';
    this.nextBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;color:#ccc;padding:2px;';
    this.nextBtn.addEventListener('click', () => this.nextTrack());
    el.appendChild(this.nextBtn);

    this.trackNameEl = document.createElement('span');
    this.trackNameEl.textContent = '—';
    this.trackNameEl.style.cssText = 'color:#aaa;font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    el.appendChild(this.trackNameEl);

    document.body.appendChild(el);
    this.playerEl = el;
  }

  private togglePlay(): void {
    if (!this.currentTrack) return;
    if (this.isMuted) return;
    if (this.currentTrack.isPlaying) {
      this.currentTrack.pause();
      this.playBtn.textContent = '▶';
    } else {
      this.currentTrack.resume();
      this.playBtn.textContent = '⏸';
    }
  }

  // Synthesize simple SFX using Web Audio API (no external files needed)
  private synthesizeSfx(ctx: AudioContext, effect: string): void {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    switch (effect) {
      case 'swing': {
        // Quick whoosh — white noise burst + pitch sweep
        const bufSize = ctx.sampleRate * 0.15;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufSize);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        filter.Q.value = 2;

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        src.connect(filter);
        filter.connect(gain);
        src.start(now);
        break;
      }
      case 'thwack': {
        // Ball hit — short sharp thwack
        const tBuf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
        const tData = tBuf.getChannelData(0);
        for (let i = 0; i < tData.length; i++) {
          const t = i / tData.length;
          tData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.6;
        }
        const tSrc = ctx.createBufferSource();
        tSrc.buffer = tBuf;

        const tFilter = ctx.createBiquadFilter();
        tFilter.type = 'lowpass';
        tFilter.frequency.setValueAtTime(2000, now);
        tFilter.frequency.exponentialRampToValueAtTime(300, now + 0.08);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        tSrc.connect(tFilter);
        tFilter.connect(gain);
        tSrc.start(now);
        break;
      }
      case 'cup': {
        // Ball dropping into cup — hollow thud
        const cBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
        const cData = cBuf.getChannelData(0);
        for (let i = 0; i < cData.length; i++) {
          const t = i / cData.length;
          const freq = 120 + Math.sin(t * Math.PI * 8) * 40 * (1 - t);
          cData[i] = Math.sin(2 * Math.PI * freq * t) * Math.pow(1 - t, 2) * 0.4;
        }
        const cSrc = ctx.createBufferSource();
        cSrc.buffer = cBuf;

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        cSrc.connect(gain);
        cSrc.start(now);
        break;
      }
      case 'splash': {
        // Water splash
        const sBufSize = ctx.sampleRate * 0.4;
        const sBuf = ctx.createBuffer(1, sBufSize, ctx.sampleRate);
        const sData = sBuf.getChannelData(0);
        for (let i = 0; i < sBufSize; i++) {
          const t = i / sBufSize;
          sData[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - t * 1.5) * 0.5;
        }
        const sSrc = ctx.createBufferSource();
        sSrc.buffer = sBuf;

        const sFilter = ctx.createBiquadFilter();
        sFilter.type = 'bandpass';
        sFilter.frequency.setValueAtTime(600, now);
        sFilter.frequency.exponentialRampToValueAtTime(100, now + 0.4);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        sSrc.connect(sFilter);
        sFilter.connect(gain);
        sSrc.start(now);
        break;
      }
      case 'tree': {
        // Ball hitting leaves — rustle
        const rBufSize = ctx.sampleRate * 0.2;
        const rBuf = ctx.createBuffer(1, rBufSize, ctx.sampleRate);
        const rData = rBuf.getChannelData(0);
        for (let i = 0; i < rBufSize; i++) {
          const t = i / rBufSize;
          rData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2) * 0.3;
        }
        const rSrc = ctx.createBufferSource();
        rSrc.buffer = rBuf;

        const rFilter = ctx.createBiquadFilter();
        rFilter.type = 'highpass';
        rFilter.frequency.setValueAtTime(2000, now);
        rFilter.frequency.exponentialRampToValueAtTime(500, now + 0.2);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        rSrc.connect(rFilter);
        rFilter.connect(gain);
        rSrc.start(now);
        break;
      }
    }
  }
}
