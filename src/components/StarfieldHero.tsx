import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Volume2, VolumeX } from 'lucide-react';

interface StarfieldHeroProps {
  onBegin: () => void;
}

/**
 * Tries to start an HTMLAudio element pointing at /cosmic-ambient.mp3 first.
 * If that file is missing (404 / decode error), falls back to a procedural
 * Web Audio synth drone — a slow A-minor chord with detuning LFOs through a
 * lowpass filter. Either way the result is an ambient cosmic bed that fades
 * in gently so it never jumps at the user.
 */
function createAmbientLayer(): { stop: () => void; setMuted: (muted: boolean) => void } {
  let stopped = false;
  let mutedFlag = false;
  let htmlAudio: HTMLAudioElement | null = null;
  let audioCtx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let synthNodes: { osc: OscillatorNode; lfo: OscillatorNode }[] = [];
  const TARGET_VOL = 0.32;

  const startSynth = () => {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(audioCtx.destination);

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.5;
      filter.connect(masterGain);

      // Soft A minor 7-ish chord — gentle, contemplative, "space" tonality
      const freqs = [110, 164.81, 220, 277.18, 329.63];
      freqs.forEach((freq, i) => {
        const osc = audioCtx!.createOscillator();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;

        // Slow vibrato per voice for shimmer
        const lfo = audioCtx!.createOscillator();
        lfo.frequency.value = 0.04 + Math.random() * 0.06; // 0.04-0.10 Hz
        const lfoGain = audioCtx!.createGain();
        lfoGain.gain.value = 1.2 + Math.random() * 1.5;
        lfo.connect(lfoGain).connect(osc.frequency);

        const oscGain = audioCtx!.createGain();
        oscGain.gain.value = 0.13 - i * 0.012; // upper voices quieter
        osc.connect(oscGain).connect(filter);

        osc.start();
        lfo.start();
        synthNodes.push({ osc, lfo });
      });

      // 6-second fade in
      masterGain.gain.setTargetAtTime(mutedFlag ? 0 : TARGET_VOL, audioCtx.currentTime, 2);
    } catch (err) {
      console.warn('Synth ambient failed:', err);
    }
  };

  // Try the MP3 first
  htmlAudio = new Audio('/cosmic-ambient.mp3');
  htmlAudio.loop = true;
  htmlAudio.volume = 0;
  htmlAudio.preload = 'auto';

  const playPromise = htmlAudio.play();
  if (playPromise) {
    playPromise.then(() => {
      if (stopped) { htmlAudio?.pause(); return; }
      // Fade in over ~3s
      let v = 0;
      const fadeId = window.setInterval(() => {
        if (!htmlAudio || stopped) { window.clearInterval(fadeId); return; }
        v = Math.min(TARGET_VOL, v + TARGET_VOL / 30);
        htmlAudio.volume = mutedFlag ? 0 : v;
        if (v >= TARGET_VOL) window.clearInterval(fadeId);
      }, 100);
    }).catch(() => {
      // MP3 not present or autoplay denied — fall back to synth
      htmlAudio?.pause();
      htmlAudio = null;
      if (!stopped) startSynth();
    });
  }

  return {
    stop: () => {
      stopped = true;
      if (htmlAudio) {
        try { htmlAudio.pause(); } catch {}
        htmlAudio.src = '';
        htmlAudio = null;
      }
      if (audioCtx && masterGain) {
        try {
          masterGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.5);
          window.setTimeout(() => {
            synthNodes.forEach(({ osc, lfo }) => { try { osc.stop(); lfo.stop(); } catch {} });
            try { audioCtx?.close(); } catch {}
          }, 1000);
        } catch {}
      }
    },
    setMuted: (muted: boolean) => {
      mutedFlag = muted;
      if (htmlAudio) htmlAudio.volume = muted ? 0 : TARGET_VOL;
      if (audioCtx && masterGain) {
        masterGain.gain.setTargetAtTime(muted ? 0 : TARGET_VOL, audioCtx.currentTime, 0.5);
      }
    },
  };
}

interface Dot {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  phase: number;
}

// Palette mixes the Innovation Lab cosmic tones with the bubble visualization's
// signature pastels — so the landing visually previews the main app aesthetic.
const COLORS = [
  // Cosmic / atmospheric
  '#7B8FBC',
  '#9AB7D3',
  '#A8C5A1',
  '#D4A86A',
  '#E8C580',
  '#E8E4F0',
  // Bubble pastels (saturated for visibility on dark bg)
  '#bdd0c4', // sage
  '#9ab7d3', // dusty blue
  '#f5d2d3', // rose
  '#f7e1d3', // peach
  '#dfccf1', // lavender
  // App accent — vivid green from logo
  '#3EB489',
];

const DOT_DENSITY = 1100; // one dot per ~1100 px² of viewport
const REPEL_RADIUS = 180;
const SPRING = 0.04;
const DAMPING = 0.86;
const WIGGLE_AMPLITUDE = 8;

export function StarfieldHero({ onBegin }: StarfieldHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: -10000, y: -10000, active: false });
  const rafRef = useRef<number>(0);
  const ambientRef = useRef<{ stop: () => void; setMuted: (m: boolean) => void } | null>(null);
  const [muted, setMuted] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);

  // Audio: start cosmic ambient bed on first mouse move (browser autoplay
  // policies require user interaction). Cleans up automatically on unmount.
  useEffect(() => {
    const onFirstInteraction = () => {
      if (ambientRef.current) return;
      ambientRef.current = createAmbientLayer();
      setAudioStarted(true);
    };
    window.addEventListener('mousemove', onFirstInteraction, { once: true });
    window.addEventListener('touchstart', onFirstInteraction, { once: true });
    window.addEventListener('keydown', onFirstInteraction, { once: true });

    return () => {
      window.removeEventListener('mousemove', onFirstInteraction);
      window.removeEventListener('touchstart', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction);
      if (ambientRef.current) {
        ambientRef.current.stop();
        ambientRef.current = null;
      }
    };
  }, []);

  // Reflect mute toggle into the audio layer
  useEffect(() => {
    if (ambientRef.current) ambientRef.current.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const buildDots = (w: number, h: number) => {
      const count = Math.max(800, Math.floor((w * h) / DOT_DENSITY));
      const dots: Dot[] = [];
      for (let i = 0; i < count; i++) {
        const homeX = Math.random() * w;
        const homeY = Math.random() * h;
        dots.push({
          homeX,
          homeY,
          x: homeX,
          y: homeY,
          vx: 0,
          vy: 0,
          r: 0.6 + Math.random() * 1.6,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          phase: Math.random() * Math.PI * 2,
        });
      }
      dotsRef.current = dots;
    };

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildDots(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };
    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) {
        mouseRef.current.x = t.clientX;
        mouseRef.current.y = t.clientY;
        mouseRef.current.active = true;
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    const tick = (t: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);
      // Subtle background gradient — keeps the void feeling, not pure black
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 1.2);
      grad.addColorStop(0, '#08070d');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const mouseActive = mouseRef.current.active;
      const repelSq = REPEL_RADIUS * REPEL_RADIUS;

      const dots = dotsRef.current;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];

        // Idle wiggle — slow drift around home position
        const wiggleX = Math.sin(t * 0.0007 + d.phase) * WIGGLE_AMPLITUDE;
        const wiggleY = Math.cos(t * 0.0009 + d.phase * 1.3) * WIGGLE_AMPLITUDE;
        const targetX = d.homeX + wiggleX;
        const targetY = d.homeY + wiggleY;

        // Spring force toward wiggling home
        d.vx += (targetX - d.x) * SPRING;
        d.vy += (targetY - d.y) * SPRING;

        // Mouse repulsion: stronger close to cursor, fades to zero at REPEL_RADIUS
        if (mouseActive) {
          const dx = d.x - mx;
          const dy = d.y - my;
          const distSq = dx * dx + dy * dy;
          if (distSq < repelSq && distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            // Quadratic falloff so the void edge is soft
            const falloff = 1 - dist / REPEL_RADIUS;
            const force = falloff * falloff * 6;
            d.vx += (dx / dist) * force;
            d.vy += (dy / dist) * force;
          }
        }

        d.vx *= DAMPING;
        d.vy *= DAMPING;
        d.x += d.vx;
        d.y += d.vy;

        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden cursor-pointer select-none"
      onClick={onBegin}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Mute toggle — only shows once audio has actually started */}
      {audioStarted && (
        <button
          onClick={(e) => { e.stopPropagation(); setMuted(prev => !prev); }}
          className="absolute top-5 right-5 z-50 p-2.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white/70 hover:text-white transition-colors pointer-events-auto"
          title={muted ? 'Unmute ambient music' : 'Mute ambient music'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center"
      >
        <h1
          className="starfield-title text-6xl md:text-7xl font-serif font-bold tracking-tight mb-4 drop-shadow-2xl pointer-events-auto cursor-pointer"
        >
          Groupstorming
        </h1>
        <p className="text-white/70 text-sm md:text-base font-medium max-w-md leading-relaxed mb-10 drop-shadow-lg">
          Visualize how a group thinks together — ideas, threads, and tensions, mapped in real time.
        </p>
        <motion.div
          animate={{
            scale: [1, 1.04, 1],
            opacity: [0.85, 1, 0.85],
          }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          whileHover={{ scale: 1.12, opacity: 1 }}
          className="starfield-pill flex items-center gap-3 px-8 py-3 rounded-full border border-white/30 bg-white/5 backdrop-blur-sm pointer-events-auto cursor-pointer"
        >
          <span className="starfield-pill-text text-white text-xs font-bold uppercase tracking-[0.3em]">Click anywhere to begin</span>
        </motion.div>
      </motion.div>

      <style>{`
        @keyframes starfield-gradient-shift {
          0%   { background-position:   0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position:   0% 50%; }
        }
        .starfield-title {
          color: white;
          background-image: linear-gradient(90deg, #bdd0c4, #9ab7d3, #dfccf1, #f5d2d3, #f7e1d3, #3EB489, #bdd0c4);
          background-size: 300% 100%;
          background-position: 50% 50%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: white;
          transition: -webkit-text-fill-color 0.4s ease;
        }
        .starfield-title:hover {
          -webkit-text-fill-color: transparent;
          animation: starfield-gradient-shift 4s ease-in-out infinite;
        }
        .starfield-pill {
          position: relative;
          transition: border-color 0.4s ease, box-shadow 0.4s ease;
        }
        .starfield-pill::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 9999px;
          padding: 2px;
          background: linear-gradient(90deg, #bdd0c4, #9ab7d3, #dfccf1, #f5d2d3, #f7e1d3, #3EB489, #bdd0c4);
          background-size: 300% 100%;
          opacity: 0;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          transition: opacity 0.35s ease;
          pointer-events: none;
        }
        .starfield-pill:hover {
          border-color: transparent;
          box-shadow: 0 0 30px rgba(189, 208, 196, 0.3), 0 0 60px rgba(223, 204, 241, 0.2);
        }
        .starfield-pill:hover::before {
          opacity: 1;
          animation: starfield-gradient-shift 3s linear infinite;
        }
        .starfield-pill:hover .starfield-pill-text {
          background-image: linear-gradient(90deg, #bdd0c4, #9ab7d3, #dfccf1, #f5d2d3, #f7e1d3, #3EB489);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: starfield-gradient-shift 3s linear infinite;
        }
      `}</style>
    </div>
  );
}
