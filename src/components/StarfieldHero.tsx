import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

interface StarfieldHeroProps {
  onBegin: () => void;
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
