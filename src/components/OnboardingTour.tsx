import { useState, useEffect, useLayoutEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Wand2, Rewind, Filter, FileText, X, ArrowRight } from 'lucide-react';

interface OnboardingTourProps {
  onDismiss: () => void;
}

interface Step {
  selector: string;
  icon: ReactNode;
  title: string;
  body: string;
  // Where to place the caption relative to the highlighted element
  preferred: 'right' | 'left' | 'top' | 'bottom';
  padding?: number; // extra room around the highlight ring
}

const STEPS: Step[] = [
  {
    selector: '[data-onboarding="mic"]',
    icon: <Mic className="w-4 h-4" />,
    title: '1. Start the conversation',
    body: 'Tap the green microphone in the left chat panel to record. Or open the More menu and pick "Run sample data" to preview with a real meeting.',
    preferred: 'right',
    padding: 12,
  },
  {
    selector: '[data-onboarding="canvas"]',
    icon: <Wand2 className="w-4 h-4" />,
    title: '2. Right-click any bubble',
    body: 'Right-click an idea to open its action menu — generate similar AI ideas, merge into another bubble, view details, or delete.',
    preferred: 'top',
    padding: 4,
  },
  {
    selector: '[data-onboarding="consolidate"]',
    icon: <Filter className="w-4 h-4" />,
    title: '3. Consolidate findings',
    body: 'After a few ideas, click Consolidate. The AI groups them into the core themes your group converged on. Original stays untouched — switch back via the filter menu.',
    preferred: 'bottom',
    padding: 8,
  },
  {
    selector: '[data-onboarding="timeline"]',
    icon: <Rewind className="w-4 h-4" />,
    title: '4. Replay the timeline',
    body: 'Click Timeline to scrub through the meeting and see how ideas emerged over time. Read-only — your bubbles stay safe.',
    preferred: 'right',
    padding: 6,
  },
  {
    selector: '[data-onboarding="tabs"]',
    icon: <FileText className="w-4 h-4" />,
    title: '5. Reflect & improve',
    body: 'Open Evaluation Matrix to score each idea on impact and effort. Open Meeting Report for a post-discussion summary, observations, and next steps for the team.',
    preferred: 'bottom',
    padding: 6,
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GAP = 16;
const cardWidth = () => Math.min(340, (typeof window !== 'undefined' ? window.innerWidth - 32 : 340));
const cardHeight = () => 220;

function placeCaption(rect: Rect, preferred: Step['preferred']): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tries: Step['preferred'][] = [preferred, 'right', 'bottom', 'top', 'left'];

  for (const dir of tries) {
    let left = 0, top = 0;
    if (dir === 'right') {
      left = rect.left + rect.width + GAP;
      top = rect.top + rect.height / 2 - cardHeight() / 2;
    } else if (dir === 'left') {
      left = rect.left - cardWidth() - GAP;
      top = rect.top + rect.height / 2 - cardHeight() / 2;
    } else if (dir === 'top') {
      left = rect.left + rect.width / 2 - cardWidth() / 2;
      top = rect.top - cardHeight() - GAP;
    } else {
      left = rect.left + rect.width / 2 - cardWidth() / 2;
      top = rect.top + rect.height + GAP;
    }
    if (left >= 12 && top >= 12 && left + cardWidth() <= vw - 12 && top + cardHeight() <= vh - 12) {
      return { top, left };
    }
  }

  // Fallback: clamp into viewport
  return {
    top: Math.max(12, Math.min(vh - cardHeight() - 12, rect.top + rect.height + GAP)),
    left: Math.max(12, Math.min(vw - cardWidth() - 12, rect.left)),
  };
}

export function OnboardingTour({ onDismiss }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(current.selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = current.padding ?? 8;
      setRect({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    };
    // Two-frame measure: the target may not be laid out instantly on first render
    measure();
    const id1 = requestAnimationFrame(measure);
    const id2 = setTimeout(measure, 80);
    return () => { cancelAnimationFrame(id1); clearTimeout(id2); };
  }, [step, current.selector, current.padding, tick]);

  useEffect(() => {
    const onResize = () => setTick(t => t + 1);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, []);

  const finish = () => {
    try { localStorage.setItem('groupstorming_onboarded', '1'); } catch {}
    onDismiss();
  };

  const caption = rect ? placeCaption(rect, current.preferred) : { top: 80, left: 80 };

  return (
    <div className="fixed inset-0 z-[120] pointer-events-none">
      {/* Dim everything OUTSIDE the highlight using 4 absolutely-positioned panels.
          The highlight area itself stays fully un-dimmed so the user can clearly
          see what feature is being explained — and even click it. */}
      {rect && (
        <>
          {/* Top band */}
          <div className="absolute left-0 top-0 right-0 bg-zinc-900/55 pointer-events-auto"
               style={{ height: Math.max(0, rect.top) }} />
          {/* Bottom band */}
          <div className="absolute left-0 right-0 bottom-0 bg-zinc-900/55 pointer-events-auto"
               style={{ top: rect.top + rect.height }} />
          {/* Left band (only as tall as highlight) */}
          <div className="absolute bg-zinc-900/55 pointer-events-auto"
               style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
          {/* Right band */}
          <div className="absolute bg-zinc-900/55 pointer-events-auto"
               style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />

          {/* Highlight ring + glow — does NOT cover the feature */}
          <motion.div
            key={`ring-${step}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="absolute rounded-2xl pointer-events-none"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              border: '2px solid rgba(255,255,255,0.85)',
              boxShadow: '0 0 0 4px rgba(154,183,211,0.45), 0 0 60px rgba(223,204,241,0.55), 0 0 30px rgba(189,208,196,0.45)',
            }}
          />
        </>
      )}

      {/* Caption card */}
      <motion.div
        key={`card-${step}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="absolute bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 p-5 pointer-events-auto"
        style={{ top: caption.top, left: caption.left, width: cardWidth() }}
      >
        <button
          onClick={finish}
          className="absolute top-2 right-2 p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          title="Skip tour"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-lg text-white" style={{ background: 'linear-gradient(135deg, #3EB489, #aba6de)' }}>
            {current.icon}
          </div>
          <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <h3 className="text-base font-serif font-bold text-zinc-900 mb-1.5">{current.title}</h3>
        <p className="text-[12px] text-zinc-600 leading-relaxed mb-4">{current.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={finish}
            className="text-[11px] font-bold text-zinc-400 hover:text-zinc-700 uppercase tracking-wider"
          >
            Skip
          </button>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? 'bg-zinc-900' : 'bg-zinc-300'}`} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="text-[11px] font-bold text-zinc-500 hover:text-zinc-900 uppercase tracking-wider"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => isLast ? finish() : setStep(step + 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-[11px] font-bold uppercase tracking-wider shadow-md"
                style={{ background: 'linear-gradient(135deg, #3EB489, #aba6de)' }}
              >
                {isLast ? 'Done' : 'Next'}
                {!isLast && <ArrowRight className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
