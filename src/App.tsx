import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, GitCommitHorizontal, Mic, MicOff, Briefcase, Network, Target, BookOpen, PenTool, Library, Sparkles, MessageCircle, BarChart, FileText, Calendar, Frown, Users, ZoomIn, ZoomOut, Search, Pencil, Check, Undo2, X, Trash2, Eye, Wand2, AlertCircle, ScrollText, Copy, Download, Lightbulb, ToggleLeft, ToggleRight, HeartHandshake, FlaskConical, GitMerge, Play, Pause, Rewind, Radio, MoreHorizontal, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Filter } from 'lucide-react';

function GroupstormingLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="5.5" fill="currentColor" fillOpacity="0.55" />
      <circle cx="15" cy="9" r="5.5" fill="currentColor" fillOpacity="0.55" />
      <circle cx="12" cy="15" r="5.5" fill="currentColor" fillOpacity="0.7" />
    </svg>
  );
}
import { Synthesis, Message, BubbleState, BubbleLink, TimelineEvent, EvaluatedIdea, MeetingReport } from './types';
import { generateSynthesis, evaluateIdeasMatrix, generateFeedbackReport, brainstormSimilarIdeas, evaluateCollaborationHealth, CollaborationNudge, distillCoreIdeas } from './services/ai';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveAgent } from './hooks/useLiveAgent';
import { THINKING_TEMPLATES } from './data/templates';
import { SAMPLE_MEETING, SAMPLE_MEETING_META } from './data/sample_meeting';
import { BUBBLE_PALETTE, TEXT_PALETTE, AI_BUBBLE_COLOR, AI_TEXT_COLOR, DISTILLED_BUBBLE_COLOR, DISTILLED_TEXT_COLOR, colorIndexFor, isAIAuthor, isDistilledAuthor } from './data/contributorPalette';
import { SynthesisGraph } from './components/SynthesisGraph';
import { TimelineView } from './components/TimelineView';
import { LiveBubbles } from './components/LiveBubbles';
import { EaseImpactMatrix } from './components/EaseImpactMatrix';
import { PostMeetingReportView } from './components/PostMeetingReport';
import { StarfieldHero } from './components/StarfieldHero';
import { OnboardingTour } from './components/OnboardingTour';

export default function App() {
  const [showStarfield, setShowStarfield] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState({
    date: new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    contributors: '',
    goal: '',
  });
  const [context, setContext] = useState("This is a brainstorming session about improving student engagement in online learning.");
  
  const [messages, setMessages] = useState<Message[]>([]);

  const [inputText, setInputText] = useState('');
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [suggestedFramework, setSuggestedFramework] = useState<{id: string, reason: string} | null>(null);
  
  // View states
  const [activeView, setActiveView] = useState<'bubbles' | 'synthesis' | 'timeline' | 'matrix' | 'report'>('bubbles');
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<{title: string, message: string} | null>(null);
  
  // Live Bubble states
  const [bubbles, setBubbles] = useState<BubbleState[]>([]);
  const [links, setLinks] = useState<BubbleLink[]>([]);
  const [selectedBubble, setSelectedBubble] = useState<BubbleState | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);

  // Post-meeting states
  const [evaluatedIdeas, setEvaluatedIdeas] = useState<EvaluatedIdea[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [meetingReport, setMeetingReport] = useState<MeetingReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  // Elapsed Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Goal editing
  const [isEditingGoal, setIsEditingGoal] = useState(false);

  // Inline rename of a detected speaker (e.g. "Speaker 1" → "Frank").
  // Replaces the author across messages, bubbles, timeline, distilled, etc.
  const [editingContributor, setEditingContributor] = useState<string | null>(null);
  const [editingContributorValue, setEditingContributorValue] = useState('');

  const renameAuthor = (oldName: string, rawNewName: string) => {
    const newName = rawNewName.trim();
    if (!newName || newName === oldName) {
      setEditingContributor(null);
      return;
    }
    pushSnapshot();
    setMessages(prev => prev.map(m => (m.author === oldName ? { ...m, author: newName } : m)));
    setBubbles(prev => prev.map(b => ({
      ...b,
      contributors: b.contributors.map(c => (c === oldName ? newName : c)),
    })));
    setLinks(prev => prev); // links don't reference contributors
    setTimelineEvents(prev => prev.map(e => (e.author === oldName ? { ...e, author: newName } : e)));
    if (distilledBubbles) {
      setDistilledBubbles(prev => prev ? prev.map(b => ({
        ...b,
        contributors: b.contributors.map(c => (c === oldName ? newName : c)),
      })) : null);
    }
    setEditingContributor(null);
  };

  // Transcript modal
  const [showTranscript, setShowTranscript] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Footer "More" stack popup (Run Sample / Transcript)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Collapsible left sidebar
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // First-run onboarding tour (4-step intro). Skipped if user has seen it before.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem('groupstorming_onboarded') !== '1'; } catch { return false; }
  });

  // Collaboration coach (separate agent — Whack Pack guidance)
  const [coachEnabled, setCoachEnabled] = useState(false);
  const [activeNudge, setActiveNudge] = useState<CollaborationNudge | null>(null);
  const lastNudgeTimeRef = useRef<number>(0);
  const coachRunningRef = useRef(false);
  const coachInputRef = useRef<{ messages: Message[]; context: string; elapsedSeconds: number }>({
    messages: [],
    context: '',
    elapsedSeconds: 0,
  });

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; bubbleId: string } | null>(null);

  // Merge mode: when user picks "Merge with..." from menu, next bubble click is the target
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);

  // Distillation — keep BOTH original and distilled sets, switch via filter
  const [isDistilling, setIsDistilling] = useState(false);
  const [distilledBubbles, setDistilledBubbles] = useState<BubbleState[] | null>(null);
  const [viewMode, setViewMode] = useState<'original' | 'distilled'>('original');

  // Canvas-level search + filter (separate from sidebar transcript search)
  const [canvasSearchOpen, setCanvasSearchOpen] = useState(false);
  const [canvasSearchTerm, setCanvasSearchTerm] = useState('');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  // Timeline scrubber
  const [timelineMode, setTimelineMode] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Undo history: snapshot bubbles + links + timelineEvents
  type Snapshot = { bubbles: BubbleState[]; links: BubbleLink[]; timelineEvents: TimelineEvent[] };
  const undoStackRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const pushSnapshot = useCallback(() => {
    undoStackRef.current.push({
      bubbles: bubbles.map(b => ({ ...b })),
      links: links.map(l => ({ ...l })),
      timelineEvents: timelineEvents.map(e => ({ ...e })),
    });
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
    setCanUndo(true);
  }, [bubbles, links, timelineEvents]);

  const handleUndo = useCallback(() => {
    const snap = undoStackRef.current.pop();
    if (!snap) {
      setCanUndo(false);
      return;
    }
    setBubbles(snap.bubbles);
    setLinks(snap.links);
    setTimelineEvents(snap.timelineEvents);
    setCanUndo(undoStackRef.current.length > 0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo]);

  // Keep the coach's view of latest state in a ref (so the interval can read it
  // without restarting every second when elapsedSeconds ticks).
  useEffect(() => {
    coachInputRef.current = { messages, context, elapsedSeconds };
  }, [messages, context, elapsedSeconds]);

  // Timeline auto-play uses a ref to track the current min/max so the interval
  // doesn't restart every time a new bubble arrives.
  const timelineRangeRef = useRef({ minTime: 0, maxTime: 0 });

  useEffect(() => {
    if (!isPlaying || !timelineMode) return;
    const stepMs = 80;
    const interval = setInterval(() => {
      const { minTime: minT, maxTime: maxT } = timelineRangeRef.current;
      const span = Math.max(maxT - minT, 1);
      const advancePerStep = span / 60;
      setScrubTime(prev => {
        const next = (prev ?? minT) + advancePerStep;
        if (next >= maxT) {
          setIsPlaying(false);
          return maxT;
        }
        return next;
      });
    }, stepMs);
    return () => clearInterval(interval);
  }, [isPlaying, timelineMode]);

  // Collaboration coach — periodic check while enabled.
  useEffect(() => {
    if (!coachEnabled || !hasStarted) return;

    const tick = async () => {
      if (coachRunningRef.current) return;
      if (Date.now() - lastNudgeTimeRef.current < 8 * 60 * 1000 && lastNudgeTimeRef.current !== 0) return;
      const { messages: m, context: c, elapsedSeconds: e } = coachInputRef.current;
      if (m.length < 8) return;

      coachRunningRef.current = true;
      try {
        const nudge = await evaluateCollaborationHealth(m, c, e);
        if (nudge) {
          setActiveNudge(nudge);
          lastNudgeTimeRef.current = Date.now();
        }
      } catch (err: any) {
        if (err?.message !== 'QUOTA_EXCEEDED') {
          console.error('Collab coach failed:', err);
        }
      } finally {
        coachRunningRef.current = false;
      }
    };

    const interval = setInterval(tick, 4 * 60 * 1000);
    return () => clearInterval(interval);
  }, [coachEnabled, hasStarted]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (hasStarted) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [hasStarted]);

  const formatElapsed = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    return `${hrs.toString().padStart(2, '0')} hr ${mins.toString().padStart(2, '0')} min`;
  };

  const [isQuerying, setIsQuerying] = useState(false);
  const [showPositiveWarning, setShowPositiveWarning] = useState(false);

  const KILLER_PHRASES = [
    "whatever",
    "i'm fine with whatever",
    "fine",
    "we've tried that before",
    "we've always done it this way",
    "that's stupid",
    "not that again",
    "where'd you dig that one up",
    "it can't be done",
    "that's too risky",
    "what if they don't like it",
    "we'll be the laughingstock of the industry",
    "i know a person who tried it and got fired",
    "that costs too much",
    "that will take too long",
    "it isn't in the budget",
    "good thought, but impractical",
    "that's not our job",
    "that's not our problem",
    "let's put that on the back burner",
    "let's form a committee",
    "don't rock the boat",
    "terrible idea"
  ];

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.author === 'AI' || lastMessage.author === 'AI Facilitator' || lastMessage.author === 'Query') return;

    const lowerText = lastMessage.text.toLowerCase();
    
    // Check for "fine" with word boundaries to avoid catching "fine-tuning" or "refined"
    const hasFine = /\bfine\b/.test(lowerText);
    const hasOtherPhrases = KILLER_PHRASES.some(phrase => {
      if (phrase === 'fine') return false; // Handled separately
      return lowerText.includes(phrase.toLowerCase());
    });

    if (hasFine || hasOtherPhrases) {
      setShowPositiveWarning(true);
      const timer = setTimeout(() => setShowPositiveWarning(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);

  const handleStartSession = () => {
    if (isFirstTimeUser) {
      try { localStorage.removeItem('groupstorming_onboarded'); } catch {}
      setShowOnboarding(true);
    }
    setHasStarted(true);
  };


  const handleMergeBubbles = (sourceId: string, targetId: string) => {
    if (timelineMode) return; // Timeline is read-only — exit first
    pushSnapshot();
    const mergedId = Date.now().toString() + Math.random();
    
    setBubbles(prev => {
       const source = prev.find(b => b.id === sourceId);
       const target = prev.find(b => b.id === targetId);
       if (!source || !target) return prev;

       const mergedBubble: BubbleState = {
          id: mergedId,
          summary: `Unified: ${source.summary} + ${target.summary}`.slice(0, 30) + '...',
          x: (source.x + target.x) / 2,
          y: (source.y + target.y) / 2,
          radius: Math.min(150, Math.sqrt(source.radius**2 + target.radius**2) + 20), 
          contributors: Array.from(new Set([...source.contributors, ...target.contributors])),
          originalText: `${source.originalText || ''}\n---\n${target.originalText || ''}`,
          isPill: true,
          mergedFrom: [source, target]
       };

       return [...prev.filter(b => b.id !== sourceId && b.id !== targetId), mergedBubble];
    });

    setLinks(prevLinks => {
       return prevLinks.map(link => {
          const newSource = (link.source === sourceId || link.source === targetId) ? mergedId : link.source;
          const newTarget = (link.target === sourceId || link.target === targetId) ? mergedId : link.target;
          return { source: newSource, target: newTarget };
       }).filter(link => link.source !== link.target);
    });
  };

  const handleUnmergeBubbles = (mergedBubble: BubbleState) => {
    if (timelineMode) return;
    if (!mergedBubble.mergedFrom || mergedBubble.mergedFrom.length === 0) return;
    pushSnapshot();

    setBubbles(prev => {
       const others = prev.filter(b => b.id !== mergedBubble.id);
       // Spread the original bubbles slightly
       const resettedOriginals = mergedBubble.mergedFrom!.map((b, i) => ({
          ...b,
          x: mergedBubble.x + (i === 0 ? -40 : 40),
          y: mergedBubble.y,
          fx: null,
          fy: null
       }));
       return [...others, ...resettedOriginals];
    });

    setLinks(prev => {
       const originals = mergedBubble.mergedFrom!;
       const primaryId = originals[0].id;
       
       return prev.map(l => {
          // If link was to/from the merged bubble, redirect it to one of the originals
          const newSource = l.source === mergedBubble.id ? primaryId : l.source;
          const newTarget = l.target === mergedBubble.id ? primaryId : l.target;
          return { source: newSource, target: newTarget };
       });
    });
  };

  const handleBubbleRightClick = (bubbleId: string, clientX: number, clientY: number) => {
     if (timelineMode) return; // Read-only during scrub
     setContextMenu({ bubbleId, x: clientX, y: clientY });
  };

  const triggerAIBrainstorm = async (bubbleId: string) => {
     if (timelineMode) return;
     setContextMenu(null);
     pushSnapshot();

     setBubbles(prev => prev.map(b =>
        b.id === bubbleId ? { ...b, contributors: [...b.contributors, 'AI Brainstorming...'] } : b
     ));

     const targetBubble = bubbles.find(b => b.id === bubbleId);
     if (!targetBubble) return;

     try {
        const rawIdeas = await brainstormSimilarIdeas(targetBubble.summary, context);
        // Force max 3 words per label so they fit inside the bubble.
        const trimWords = (s: string) => s.split(/\s+/).slice(0, 3).join(' ');
        const ideas = rawIdeas.slice(0, 3).map(trimWords);

        const newIds = ideas.map(() => Date.now().toString() + Math.random().toString());
        const now = Date.now();

        setBubbles(prev => {
           let newBubbles = [...prev];
           newBubbles = newBubbles.map(b => b.id === bubbleId ? { ...b, contributors: b.contributors.filter(c => c !== 'AI Brainstorming...') } : b);

           const generatedNodes = ideas.map((idea, i) => {
             // Spread children further apart so each gets its own visual cloud.
             const angle = (i / Math.max(ideas.length, 1)) * Math.PI * 1.2 - Math.PI * 0.6;
             const distance = 220;
             return {
               id: newIds[i],
               summary: idea,
               x: targetBubble.x + Math.cos(angle) * distance,
               y: targetBubble.y + Math.sin(angle) * distance,
               radius: 80,
               contributors: ["AI Brainstorm"],
               originalText: `AI generated real-world example similar to: ${targetBubble.summary}`,
               timestamp: now,
             };
           });

           return [...newBubbles, ...generatedNodes];
        });

        setLinks(prev => [
           ...prev,
           ...newIds.map(id => ({ source: bubbleId, target: id, timestamp: now }))
        ]);
     } catch (err: any) {
        if (err.message === 'QUOTA_EXCEEDED') {
           setError({
              title: "AI Brainstorming Limit",
              message: "You've reached the temporary AI limit. Please try again in 1-2 minutes or use the existing ideas."
           });
        }
        setBubbles(prev => prev.map(b =>
           b.id === bubbleId ? { ...b, contributors: b.contributors.filter(c => c !== 'AI Brainstorming...') } : b
        ));
     }
  };

  const deleteBubble = (bubbleId: string) => {
     if (timelineMode) return;
     setContextMenu(null);
     pushSnapshot();
     setBubbles(prev => prev.filter(b => b.id !== bubbleId));
     setLinks(prev => prev.filter(l => l.source !== bubbleId && l.target !== bubbleId));
  };

  const startMergeMode = (bubbleId: string) => {
     if (timelineMode) return;
     setContextMenu(null);
     setMergeSourceId(bubbleId);
  };

  const handleDistill = async () => {
     if (timelineMode) return;
     if (bubbles.length < 2 || isDistilling) return;
     setIsDistilling(true);
     try {
        const summaries = bubbles.map(b => ({
           id: b.id,
           summary: b.summary,
           contributors: b.contributors,
           originalText: b.originalText,
        }));
        const distilled = await distillCoreIdeas(summaries, context);
        if (distilled.length === 0) {
           setError({ title: "Nothing to consolidate", message: "The AI couldn't find clear themes — try adding more ideas first." });
           return;
        }

        // Build the consolidated set arranged in a circle around the center.
        // Original bubbles stay untouched — switch via the filter menu.
        const cx = 500;
        const cy = 320;
        const r = Math.min(240, 80 + distilled.length * 28);
        const newBubbles: BubbleState[] = distilled.map((d, i) => {
           const angle = (i / distilled.length) * Math.PI * 2;
           return {
              id: 'distilled-' + d.id,
              summary: d.summary,
              x: cx + Math.cos(angle) * r,
              y: cy + Math.sin(angle) * r,
              radius: 80,
              contributors: ['Distilled'],
              originalText: `${d.description}\n\nWhy core: ${d.rationale}\n\nDrawn from: ${d.sourceBubbleIds.length} contributing ideas.`,
              timestamp: Date.now(),
           };
        });

        setDistilledBubbles(newBubbles);
        setViewMode('distilled');
        setSpeakerFilter(null); // clear any speaker filter so distilled view is fully visible
        setTimelineEvents(prev => [
           ...prev,
           {
              id: 'distilled-' + Date.now(),
              type: 'new_idea',
              summary: `Consolidated into ${distilled.length} core themes`,
              author: 'AI Distillation',
              timestamp: Date.now(),
              originalText: distilled.map(d => `${d.summary}: ${d.description}`).join('\n'),
           },
        ]);
     } catch (err: any) {
        if (err.message === 'QUOTA_EXCEEDED') {
           setError({ title: "Consolidation unavailable", message: "AI usage limit reached. Try again in 1-2 minutes." });
        } else {
           setError({ title: "Consolidation failed", message: err?.message || "Unknown error — check the console." });
        }
     } finally {
        setIsDistilling(false);
     }
  };


  // Live Agent hooks
  const handleVisualizationAction = (args: any) => {
    if (args.action === 'rule_feedback') {
       return;
    }

    pushSnapshot();

    const newTimelineEvent: TimelineEvent = {
       id: Date.now().toString() + Math.random().toString(),
       type: args.action === 'new_idea' ? 'new_idea' : 'build_on_idea',
       summary: args.ideaSummary || 'Idea',
       author: args.contributor || 'unknown',
       timestamp: Date.now(),
       originalText: args.originalText
    };
    setTimelineEvents(prev => [...prev, newTimelineEvent]);

    if (args.action === 'new_idea') {
      setBubbles(prev => [...prev, {
        id: Date.now().toString() + Math.random().toString(),
        summary: args.ideaSummary || 'New Idea',
        x: Math.random() * 200 + 400,
        y: Math.random() * 100 + 200,
        radius: 65,
        contributors: [args.contributor || 'unknown'],
        originalText: args.originalText,
        timestamp: Date.now(),
      }]);
    } else if (args.action === 'build_on_idea') {
      setBubbles(prev => {
        if (prev.length === 0) return prev;
        
        let targetIndex = prev.length - 1;
        if (args.ideaSummary) {
           const matchIndex = prev.findIndex(b => b.summary.toLowerCase().includes(args.ideaSummary.toLowerCase()));
           if (matchIndex !== -1) {
              targetIndex = matchIndex;
           }
        }

        const parentBubble = prev[targetIndex];
        
        // Create new bubble and link it instead of merging completely
        const newBubble: BubbleState = {
           id: Date.now().toString() + Math.random().toString(),
           summary: args.ideaSummary || 'Extension',
           x: parentBubble.x + (Math.random() - 0.5) * 100,
           y: parentBubble.y + (Math.random() - 0.5) * 100,
           radius: 50, // smaller initially
           contributors: [args.contributor || `participant`],
           originalText: args.originalText,
           timestamp: Date.now(),
        };

        setLinks(prevLinks => [...prevLinks, { source: parentBubble.id, target: newBubble.id, timestamp: Date.now() }]);
        return [...prev, newBubble];
      });
    } else if (args.action === 'merge_ideas') {
      // Optional explicit merge logic 
      // Allows user to drag two bubbles together, or AI to connect them
    }
  };

  const handleNewTranscription = (author: string, text: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      author,
      text,
      timestamp: Date.now()
    }]);

    // Removed local negative catch
  };

  const handleFrameworkSuggested = (id: string, reason: string) => {
     setSuggestedFramework({ id, reason });
     setTimeout(() => setSuggestedFramework(null), 15000);
  };


  const handleRunSample = () => {
    if (isConnected) return;

    setBubbles([]);
    setLinks([]);
    setTimelineEvents([]);
    setEvaluatedIdeas([]);
    setMeetingReport(null);
    setMessages([]);
    setActiveView('bubbles');

    // Pre-fill session metadata so the demo feels like a real meeting
    setSessionMetadata(prev => ({
      ...prev,
      contributors: SAMPLE_MEETING_META.contributors,
      goal: SAMPLE_MEETING_META.goal,
    }));
    setContext(`This is a brainstorming session about: ${SAMPLE_MEETING_META.goal}`);

    let delay = 0;
    SAMPLE_MEETING.forEach((item) => {
      setTimeout(() => {
        handleNewTranscription(item.author, item.text);
        if (item.action) {
          handleVisualizationAction({
            action: item.action,
            ideaSummary: item.summary,
            contributor: item.author,
            originalText: item.text,
            feedbackType: item.feedbackType,
            feedbackMessage: item.feedbackMessage,
          });
        }
      }, delay);
      // Vary playback speed: longer beats for substantive (idea-bearing) turns,
      // tighter for pure dialogue
      delay += item.action ? 1700 : 1100;
    });
  };

  const { isConnected, connect, disconnect, interimTranscript, connectError, clearConnectError } = useLiveAgent(
    handleNewTranscription,
    () => '', // unused — Deepgram provides speaker labels directly
    handleFrameworkSuggested,
    handleVisualizationAction,
    [], // No pre-set contributor names — Deepgram emits "Speaker 1/2/3" labels which user can rename in the sidebar
  );

  // Auto scroll transcript
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript]);

  const handleQueryAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const query = inputText.trim();
    
    handleNewTranscription("Query", query);
    setInputText('');
    setIsQuerying(true);
    
    try {
       const { queryAI } = await import('./services/ai');
       const response = await queryAI(messages, context, query);
       handleNewTranscription("AI", response);
       
       setTimelineEvents(prev => [...prev, {
          id: Date.now().toString(),
          type: 'new_idea',
          summary: "AI Answer",
          author: "AI",
          timestamp: Date.now(),
          originalText: response
       }]);
    } catch (err: any) {
       if (err.message === 'QUOTA_EXCEEDED') {
          setError({ title: "AI Limit Reached", message: "The agent is taking a quick break due to high usage. Please try asking again in a minute." });
       }
       console.error("Failed to query AI", err);
    } finally {
       setIsQuerying(false);
    }
  };

  const handleEvaluateIdeas = async () => {
    if (messages.length === 0) return;
    setIsEvaluating(true);
    setActiveView('matrix');
    processedMessagesCountRef.current = messages.length;
    try {
      const results = await evaluateIdeasMatrix(messages, context);
      setEvaluatedIdeas(results);
    } catch (err: any) {
      if (err.message === 'QUOTA_EXCEEDED') {
        setError({ title: "Matrix Quota Limit", message: "Generating the analysis matrix requires more processing power than currently available. Please wait a minute and switch views back to retry." });
      }
      console.error(err);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleGenerateReport = async () => {
    if (messages.length === 0) return;
    setIsGeneratingReport(true);
    setActiveView('report');
    processedReportMessagesCountRef.current = messages.length;
    try {
      const results = await generateFeedbackReport(messages, context);
      setMeetingReport(results);
    } catch (err: any) {
      if (err.message === 'QUOTA_EXCEEDED') {
        setError({ title: "Report Generation Limit", message: "Meeting summary is unavailable right now due to usage limits. Trying again in 60 seconds usually works." });
      }
      console.error(err);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Auto-run matrix and report when view changes
  const processedMessagesCountRef = useRef(0);
  const processedReportMessagesCountRef = useRef(0);

  useEffect(() => {
    if (activeView === 'matrix' && processedMessagesCountRef.current !== messages.length && messages.length > 0) {
      handleEvaluateIdeas();
    }
  }, [activeView, messages.length]);

  useEffect(() => {
    if (activeView === 'report' && processedReportMessagesCountRef.current !== messages.length && messages.length > 0) {
      handleGenerateReport();
    }
  }, [activeView, messages.length]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      try {
        if (content.trim().startsWith('[')) {
           const parsed = JSON.parse(content);
           if (Array.isArray(parsed)) {
             setMessages(prev => [...prev, ...parsed.map((p, i) => ({
               id: Date.now() + i.toString(),
               author: p.author || 'Uploaded Transcript',
               text: p.text || JSON.stringify(p),
               timestamp: p.timestamp || Date.now()
             }))]);
             return;
           }
        }
      } catch (e) {}

      // Fallback
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      const newMessages = lines.map((text, i) => ({
         id: Date.now() + i.toString(), 
         author: 'Uploaded Transcript', 
         text, 
         timestamp: Date.now()
      }));
      setMessages(prev => [...prev, ...newMessages]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = THINKING_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      if (activeTemplateId === templateId) {
        setActiveTemplateId(null);
        setContext(prev => prev.replace(`\n\nTemplate Framework: ${template.prompt}`, ''));
      } else {
        let newContext = context;
        if (activeTemplateId) {
            const prevTemplate = THINKING_TEMPLATES.find(t => t.id === activeTemplateId);
            if (prevTemplate) {
                newContext = newContext.replace(`\n\nTemplate Framework: ${prevTemplate.prompt}`, '');
            }
        }
        setActiveTemplateId(templateId);
        setContext(`${newContext}\n\nTemplate Framework: ${template.prompt}`);
        setSuggestedFramework(null);
      }
    }
  };

  const handleSynthesize = async () => {
    if (messages.length === 0) return;
    setActiveView('synthesis'); // jump to synthesis view
    setIsSynthesizing(true);
    try {
      const result = await generateSynthesis(messages, context);
      setSynthesis(result);
    } catch (error) {
      console.error(error);
      alert('Failed to generate synthesis. Check console for details.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Build a stable, alphabetically-sorted list of all human contributors seen in
  // the session. Index into a palette by this sort order — guarantees visually
  // distinct colors as long as we have <= palette length contributors.
  // Preserve INSERTION order (not alphabetical) so a rename doesn't shuffle
  // every speaker's color — the renamed entry takes the same slot.
  const knownContributors = (() => {
    const set = new Set<string>();
    messages.forEach(m => {
      if (m.author && !m.author.includes('AI') && m.author !== 'Query' && m.author !== 'Uploaded Transcript') set.add(m.author);
    });
    bubbles.forEach(b => b.contributors.forEach(c => {
      if (c && !c.includes('AI') && c !== 'unknown' && c !== 'Distilled') set.add(c);
    }));
    return Array.from(set);
  })();

  const getAuthorColor = (author: string) => {
    if (author === 'AI' || author === 'AI Facilitator' || isAIAuthor(author)) return AI_TEXT_COLOR;
    if (isDistilledAuthor(author)) return DISTILLED_TEXT_COLOR;
    if (author === 'Uploaded Transcript' || author === 'Query') return 'text-zinc-500';
    return TEXT_PALETTE[colorIndexFor(author, knownContributors)];
  };

  const getAuthorBg = (author: string) => {
    if (isAIAuthor(author)) return AI_BUBBLE_COLOR;
    if (isDistilledAuthor(author)) return DISTILLED_BUBBLE_COLOR;
    if (author === 'Uploaded Transcript' || author === 'Query') return '#a1a1aa';
    return BUBBLE_PALETTE[colorIndexFor(author, knownContributors)];
  };

  if (showStarfield) {
    return <StarfieldHero onBegin={() => setShowStarfield(false)} />;
  }

  if (!hasStarted) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-6 font-sans selection:bg-white/20 overflow-hidden bg-[#08070d]">
        {/* Cosmic backdrop layers — keeps the starfield's atmosphere */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at 30% 20%, rgba(155,183,211,0.18), transparent 55%), radial-gradient(ellipse at 75% 75%, rgba(223,204,241,0.18), transparent 55%), radial-gradient(ellipse at 50% 90%, rgba(62,180,137,0.12), transparent 60%), #08070d'
          }} />
          {/* Static dot field — simpler than the canvas hero, just decorative */}
          <div className="absolute inset-0 opacity-40" style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), radial-gradient(rgba(189,208,196,0.35) 1px, transparent 1px), radial-gradient(rgba(223,204,241,0.3) 1px, transparent 1px)',
            backgroundSize: '180px 180px, 240px 240px, 320px 320px',
            backgroundPosition: '0 0, 60px 90px, 130px 50px',
          }} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-xl bg-white/8 backdrop-blur-2xl rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] border border-white/15 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))' }}
        >
          <div className="p-8 text-white relative overflow-hidden border-b border-white/10" style={{
            background: 'linear-gradient(135deg, rgba(62,180,137,0.45), rgba(171,166,222,0.45))'
          }}>
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full blur-3xl" style={{ background: 'rgba(245,210,211,0.25)' }} />
            <div className="relative z-10">
              <h1 className="text-4xl font-serif font-bold tracking-tight mb-2">Groupstorming</h1>
              <p className="text-white/90 text-sm max-w-sm font-medium leading-relaxed">
                Visualize your Brainstorm Session.
              </p>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Date
                </label>
                <input 
                  type="text"
                  value={sessionMetadata.date}
                  onChange={e => setSessionMetadata({...sessionMetadata, date: e.target.value})}
                  placeholder="e.g. Oct 24, 2024"
                  className="w-full px-4 py-3 bg-white/5 backdrop-blur-sm border border-white/15 rounded-xl focus:ring-2 focus:ring-[#aba6de]/40 focus:border-[#aba6de]/60 outline-none transition-all text-sm font-medium text-white placeholder:text-white/35"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
                  <Target className="w-3 h-3" /> Time / Duration
                </label>
                <input 
                  type="text"
                  value={sessionMetadata.time}
                  onChange={e => setSessionMetadata({...sessionMetadata, time: e.target.value})}
                  placeholder="e.g. 10:00 AM"
                  className="w-full px-4 py-3 bg-white/5 backdrop-blur-sm border border-white/15 rounded-xl focus:ring-2 focus:ring-[#aba6de]/40 focus:border-[#aba6de]/60 outline-none transition-all text-sm font-medium text-white placeholder:text-white/35"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
                <PenTool className="w-3 h-3" /> Goal
              </label>
              <input
                type="text"
                value={sessionMetadata.goal}
                onChange={e => setSessionMetadata({ ...sessionMetadata, goal: e.target.value })}
                placeholder="What do we want to achieve?"
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-sm border border-white/15 rounded-xl focus:ring-2 focus:ring-[#aba6de]/40 focus:border-[#aba6de]/60 outline-none transition-all text-sm font-medium text-white placeholder:text-white/35"
              />
              <p className="text-[10px] text-white/45 italic px-1">
                Speakers are detected automatically when recording. Rename Speaker 1 / 2 / 3 anytime in the sidebar.
              </p>
            </div>

            <label className="flex items-center gap-2.5 px-1 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={isFirstTimeUser}
                onChange={e => setIsFirstTimeUser(e.target.checked)}
                className="w-4 h-4 rounded border-white/30 bg-white/5 text-[#3EB489] focus:ring-2 focus:ring-[#3EB489]/40 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[12px] font-medium text-white/70 group-hover:text-white transition-colors">
                First-time user — show me the intro tour after starting
              </span>
            </label>

            <button
              onClick={handleStartSession}
              className="w-full py-4 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-[#3EB489]/30 hover:shadow-[#3EB489]/50 border border-white/15"
              style={{ background: 'linear-gradient(135deg, #3EB489, #aba6de)' }}
            >
              Start Synthesis Agent
              <GitCommitHorizontal className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Timeline scrubbing — derive what bubbles/links are visible at scrub time
  const allTimestamps = [...bubbles, ...links]
    .map((x: any) => x.timestamp)
    .filter((t): t is number => typeof t === 'number');
  const minTime = allTimestamps.length ? Math.min(...allTimestamps) : 0;
  const maxTime = allTimestamps.length ? Math.max(...allTimestamps) : 0;
  const effectiveScrub = timelineMode && scrubTime !== null ? scrubTime : maxTime || Date.now();
  // viewMode: when 'distilled' we show consolidated themes instead of raw bubbles
  const sourceBubbles = viewMode === 'distilled' && distilledBubbles ? distilledBubbles : bubbles;
  const baseBubbles = timelineMode
    ? sourceBubbles.filter(b => (b.timestamp ?? 0) <= effectiveScrub)
    : sourceBubbles;
  const searchedBubbles = canvasSearchTerm.trim()
    ? baseBubbles.filter(b =>
        b.summary.toLowerCase().includes(canvasSearchTerm.toLowerCase()) ||
        b.contributors.some(c => c.toLowerCase().includes(canvasSearchTerm.toLowerCase()))
      )
    : baseBubbles;
  const visibleBubbles = searchedBubbles;
  const visibleBubbleIds = new Set(visibleBubbles.map(b => b.id));
  // Distilled view has no links — only original mode shows the link graph
  const baseLinks = viewMode === 'distilled'
    ? []
    : (timelineMode
        ? links.filter(l => (l.timestamp ?? 0) <= effectiveScrub)
        : links);
  const visibleLinks = baseLinks.filter(l => visibleBubbleIds.has(l.source) && visibleBubbleIds.has(l.target));

  // Sync the timeline range ref so the (already-mounted) auto-play interval
  // reads the latest min/max each tick. Plain assignment, NOT a hook.
  timelineRangeRef.current = { minTime, maxTime };

  const enterTimelineMode = () => {
    if (bubbles.length === 0) return;
    setTimelineMode(true);
    setScrubTime(maxTime);
    setIsPlaying(false);
  };

  const exitTimelineMode = () => {
    setTimelineMode(false);
    setScrubTime(null);
    setIsPlaying(false);
  };

  const transcriptAsText = messages
    .map(m => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.author}: ${m.text}`)
    .join('\n');

  const downloadTranscript = (format: 'txt' | 'json') => {
    const blob = format === 'json'
      ? new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' })
      : new Blob([transcriptAsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `groupstorming-transcript-${ts}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcriptAsText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden text-zinc-900 font-sans" style={{
      background: 'radial-gradient(ellipse at 15% 10%, rgba(154,183,211,0.18), transparent 50%), radial-gradient(ellipse at 85% 90%, rgba(223,204,241,0.20), transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(189,208,196,0.10), transparent 70%), #fafaf9',
    }}>
      {showOnboarding && <OnboardingTour onDismiss={() => setShowOnboarding(false)} />}
      {/* Soft static dot field — same family as the starfield landing, much subtler */}
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{
        backgroundImage: 'radial-gradient(rgba(154,183,211,0.5) 0.8px, transparent 0.8px), radial-gradient(rgba(223,204,241,0.45) 0.8px, transparent 0.8px), radial-gradient(rgba(189,208,196,0.4) 0.8px, transparent 0.8px)',
        backgroundSize: '200px 200px, 280px 280px, 360px 360px',
        backgroundPosition: '0 0, 70px 110px, 140px 60px',
      }} />

      {/* TRANSCRIPT MODAL */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowTranscript(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ duration: 0.18 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col"
            >
              <div className="bg-gradient-to-br from-[#3EB489] to-[#aba6de] p-5 text-white relative">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-serif font-bold tracking-tight">Session Transcript</h2>
                    <p className="text-white/80 text-xs mt-1">
                      {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                      {sessionMetadata.goal && ` · ${sessionMetadata.goal}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTranscript(false)}
                    className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                <button
                  onClick={copyTranscript}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-700 hover:text-zinc-900 hover:bg-white rounded-md transition-colors border border-zinc-200 bg-white"
                >
                  {copyFeedback ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copyFeedback ? 'Copied' : 'Copy text'}
                </button>
                <button
                  onClick={() => downloadTranscript('txt')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-700 hover:text-zinc-900 hover:bg-white rounded-md transition-colors border border-zinc-200 bg-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .txt
                </button>
                <button
                  onClick={() => downloadTranscript('json')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-700 hover:text-zinc-900 hover:bg-white rounded-md transition-colors border border-zinc-200 bg-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .json
                </button>
                <div className="ml-auto text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">
                  {sessionMetadata.date} · {sessionMetadata.time}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-white">
                {messages.length === 0 ? (
                  <div className="text-center text-zinc-400 text-sm py-12">No transcript yet — start recording or hit Run Sample.</div>
                ) : (
                  messages.map(m => (
                    <div key={m.id} className="group flex items-start gap-3 hover:bg-zinc-50 -mx-2 px-2 py-1 rounded-md transition-colors">
                      <div className="text-[10px] font-mono font-bold text-zinc-400 pt-1 shrink-0 w-16 text-right">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-mono font-bold ${getAuthorColor(m.author)}`}>{m.author}</div>
                        <div className="text-sm text-zinc-700 leading-relaxed">{m.text}</div>
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this message from the transcript?')) {
                            setMessages(prev => prev.filter(x => x.id !== m.id));
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                        title="Remove from transcript"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QUOTA ERROR BANNER */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: -20, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, y: -20, x: '-50%' }}
            className="fixed top-6 left-1/2 z-[100] w-full max-w-md bg-white border border-red-100 shadow-2xl rounded-2xl p-4 flex items-start gap-4 overflow-hidden"
          >
             <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
             <div className="p-2 bg-red-50 rounded-lg">
                <Target className="w-5 h-5 text-red-500" />
             </div>
             <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-zinc-900">{error.title}</h4>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{error.message}</p>
                <button 
                  onClick={() => setError(null)}
                  className="mt-3 text-[10px] font-bold text-red-600 uppercase tracking-widest hover:text-red-700 transition-colors"
                >
                  Dismiss
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* SIDEBAR EXPAND BUTTON — visible only when sidebar is collapsed */}
      <AnimatePresence>
        {sidebarCollapsed && (
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            onClick={() => setSidebarCollapsed(false)}
            className="fixed top-4 left-4 z-50 w-9 h-9 rounded-xl bg-white shadow-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
            title="Show transcript panel"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* LEFT PANEL / SIDEBAR */}
      <motion.div
        animate={{ marginLeft: sidebarCollapsed ? -320 : 0 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="w-80 flex flex-col border-r border-white/40 bg-white/75 backdrop-blur-2xl relative shrink-0 z-10"
      >

        {/* MIC CONNECTION ERROR */}
        <AnimatePresence>
          {connectError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-2 left-2 right-2 z-50 bg-white border border-red-200 shadow-2xl rounded-xl p-3 flex items-start gap-2"
            >
              <div className="p-1 bg-red-50 rounded-lg shrink-0">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-[11px] font-bold text-zinc-900">Microphone unavailable</h4>
                <p className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">{connectError}</p>
              </div>
              <button
                onClick={clearConnectError}
                className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        
        {/* CONCISE SESSION METADATA BLOCK */}
        <div className="p-4 border-b border-zinc-100 bg-gradient-to-br from-[#3EB489] to-[#aba6de] text-white relative">
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            title="Collapse panel"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm text-white">
                <GroupstormingLogo className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-serif font-bold text-white tracking-tight">Groupstorming</h2>
            </div>
            <div className="text-right pr-6">
              <div className="text-[10px] font-mono font-bold text-white/70">{sessionMetadata.date}</div>
              <div className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">{sessionMetadata.time}</div>
              <div className="text-[9px] font-mono font-bold text-white mt-0.5">{formatElapsed(elapsedSeconds)}</div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[9px] font-mono font-bold text-white/80 uppercase tracking-[0.2em]">Session Goal</div>
                {!isEditingGoal && (
                  <button
                    onClick={() => setIsEditingGoal(true)}
                    className="p-1 rounded hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                    title="Edit session goal"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
              {isEditingGoal ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    type="text"
                    value={sessionMetadata.goal}
                    onChange={e => setSessionMetadata({ ...sessionMetadata, goal: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') setIsEditingGoal(false);
                      if (e.key === 'Escape') setIsEditingGoal(false);
                    }}
                    onBlur={() => setIsEditingGoal(false)}
                    placeholder="What do we want to achieve?"
                    className="flex-1 bg-white/15 backdrop-blur-sm border border-white/30 rounded-md px-2 py-1 text-xs font-semibold text-white placeholder:text-white/50 outline-none focus:border-white"
                  />
                  <button
                    onClick={() => setIsEditingGoal(false)}
                    className="p-1 rounded bg-white/20 hover:bg-white/30 text-white"
                    title="Save"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <p className="text-xs font-semibold text-white leading-snug">{sessionMetadata.goal || 'No goal set'}</p>
              )}
            </div>

            {/* COLLABORATION COACH TOGGLE */}
            <div>
              <button
                onClick={() => setCoachEnabled(prev => !prev)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-left"
                title="Periodic guidance from a Whack Pack-based coach. Fires only when the group is clearly stuck or branching without convergence."
              >
                <HeartHandshake className="w-3.5 h-3.5 text-white shrink-0" />
                <span className="text-[10px] font-bold text-white uppercase tracking-wider flex-1">Coach Tips</span>
                {coachEnabled ? (
                  <ToggleRight className="w-4 h-4 text-white" />
                ) : (
                  <ToggleLeft className="w-4 h-4 text-white/60" />
                )}
              </button>
              <div className="text-[9px] text-white/60 italic mt-1 px-1 leading-tight">
                {coachEnabled ? 'Nudges only when truly stuck.' : 'Off — turn on for facilitation hints.'}
              </div>
            </div>
            
            {bubbles.length > 0 && (
              <div>
                <div className="text-[9px] font-mono font-bold text-white/80 uppercase tracking-[0.2em] mb-2">Speakers</div>
                <div className="space-y-1.5">
                  {Array.from(new Set<string>(bubbles.flatMap(b => b.contributors)))
                    .filter(c => c && c !== 'unknown' && c !== 'Distilled')
                    .map(contributor => {
                      const color = getAuthorBg(contributor);
                      const isFiltering = speakerFilter === contributor;
                      const isEditing = editingContributor === contributor;

                      if (isEditing) {
                        return (
                          <div key={contributor} className="flex items-center gap-2 p-1 rounded-md bg-white/15">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <input
                              autoFocus
                              type="text"
                              value={editingContributorValue}
                              onChange={e => setEditingContributorValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') renameAuthor(contributor, editingContributorValue);
                                if (e.key === 'Escape') setEditingContributor(null);
                              }}
                              onBlur={() => renameAuthor(contributor, editingContributorValue)}
                              className="flex-1 min-w-0 bg-white/20 backdrop-blur-sm border border-white/30 rounded px-1.5 py-0.5 text-[11px] font-bold text-white outline-none focus:border-white"
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); renameAuthor(contributor, editingContributorValue); }}
                              className="p-0.5 rounded bg-white/25 hover:bg-white/40 text-white shrink-0"
                              title="Save"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={contributor}
                          className={`group flex items-center gap-2 transition-all p-1 rounded-md ${isFiltering ? 'bg-white/20' : 'hover:bg-white/10'}`}
                        >
                          <button
                            onClick={() => setSpeakerFilter(isFiltering ? null : contributor)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                            title={isFiltering ? `Click to show all speakers` : `Filter canvas to ${contributor} only`}
                          >
                            <div className="w-3 h-3 rounded-full transition-transform group-hover:scale-110 shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-[11px] font-bold text-white tracking-tight truncate">{contributor}</span>
                            {isFiltering && <div className="ml-auto w-1 h-1 bg-white rounded-full" />}
                          </button>
                          <button
                            onClick={() => { setEditingContributor(contributor); setEditingContributorValue(contributor); }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/20 text-white/70 hover:text-white transition-all shrink-0"
                            title={`Rename ${contributor}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                </div>
                <div className="mt-2 text-[8px] text-white/60 italic">Click pencil to rename · click name to filter</div>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-2 border-b border-zinc-100 bg-white flex items-center gap-2 shrink-0 shadow-sm relative">
           <div className="flex-1 flex items-center gap-2 bg-zinc-50 rounded-lg px-2 py-1.5 border border-zinc-200 focus-within:border-[#3EB489]/50 transition-colors">
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <input 
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by keyword or contributor..."
                className="text-[11px] font-medium bg-transparent outline-none flex-1 placeholder:text-zinc-400"
              />
           </div>
        </div>

        {/* Templates static list removed per user request: "tips shouldn't be all displayed, they should show according to communication context" */}
        <AnimatePresence>
          {activeTemplateId && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="p-3 border-b border-zinc-100 shrink-0 overflow-hidden bg-indigo-50/50">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest">
                    <Sparkles className="w-3 h-3" /> Active Template
                  </div>
                  <button onClick={() => handleTemplateSelect(activeTemplateId)} className="text-[10px] text-zinc-500 hover:text-zinc-800 underline">Clear</button>
               </div>
               <div className="mt-2 text-xs font-bold text-zinc-800">{THINKING_TEMPLATES.find(t => t.id === activeTemplateId)?.title}</div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/10 relative">

          {/* COLLABORATION COACH NUDGE */}
          <AnimatePresence>
            {activeNudge && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-gradient-to-br from-amber-50 to-rose-50 border border-amber-200 rounded-xl p-3 shadow-sm"
              >
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 bg-white rounded-lg shrink-0 shadow-sm">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-mono font-bold text-amber-600 uppercase tracking-widest">Coach</span>
                      <span className="text-[9px] font-mono text-amber-400">·</span>
                      <span className="text-[9px] font-mono font-bold text-amber-500 uppercase">{activeNudge.category}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-zinc-800 leading-snug mb-2">{activeNudge.diagnosis}</p>
                    <div className="bg-white/80 rounded-lg p-2.5 border border-amber-100">
                      <div className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest mb-1">{activeNudge.moveName}</div>
                      <p className="text-[12px] text-zinc-700 leading-relaxed italic">"{activeNudge.movePrompt}"</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNudge(null)}
                    className="p-1 rounded hover:bg-amber-100 text-amber-400 hover:text-amber-700 shrink-0 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {suggestedFramework && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute top-4 inset-x-4 z-20 bg-indigo-900 text-white p-4 rounded-xl shadow-xl border border-indigo-700 backdrop-blur-md bg-opacity-95"
              >
                 <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-indigo-300 mt-0.5 shrink-0" />
                    <div>
                       <h4 className="text-sm font-semibold mb-1">Agent Suggestion: {THINKING_TEMPLATES.find(t=>t.id === suggestedFramework.id)?.title}</h4>
                       <p className="text-xs text-indigo-200 mb-3 leading-relaxed">{suggestedFramework.reason}</p>
                       <div className="flex gap-2">
                          <button onClick={() => handleTemplateSelect(suggestedFramework.id)} className="px-3 py-1.5 bg-[#D3D3FF] text-zinc-900 text-xs font-bold rounded-md hover:bg-white transition-colors">Apply Template</button>
                          <button onClick={() => setSuggestedFramework(null)} className="px-3 py-1.5 border border-white/30 text-white text-xs font-medium rounded-md hover:bg-white/10 transition-colors">Dismiss</button>
                       </div>
                    </div>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>

          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
              {sessionMetadata.goal && (
                <div className="text-[11px] text-zinc-400 leading-tight italic">
                  {sessionMetadata.goal}
                </div>
              )}

              <motion.button
                onClick={isConnected ? disconnect : connect}
                data-onboarding="mic"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative w-28 h-28 rounded-full flex items-center justify-center text-white border border-white/30 overflow-hidden"
                style={{
                  background: isConnected
                    ? 'linear-gradient(135deg, rgba(244,114,182,0.85), rgba(239,68,68,0.85))'
                    : 'linear-gradient(135deg, rgba(62,180,137,0.85), rgba(154,183,211,0.85) 50%, rgba(171,166,222,0.85))',
                  boxShadow: isConnected
                    ? '0 6px 30px rgba(244,114,182,0.45), 0 0 0 1px rgba(255,255,255,0.1) inset'
                    : '0 6px 30px rgba(154,183,211,0.45), 0 0 0 1px rgba(255,255,255,0.1) inset',
                }}
                title={isConnected ? 'Stop recording' : 'Start recording'}
              >
                <span className="absolute inset-0 bg-white/10 backdrop-blur-sm pointer-events-none" />
                {!isConnected && (
                  <span className="absolute inset-0 rounded-full bg-[#3EB489] animate-ping opacity-30" />
                )}
                <span className="relative flex items-center justify-center">
                  {isConnected ? <MicOff className="w-12 h-12" /> : <Mic className="w-12 h-12" />}
                </span>
              </motion.button>
              <div className="space-y-1">
                <p className="text-zinc-700 text-sm font-bold tracking-wide">
                  {isConnected ? 'Recording — tap to stop' : 'Tap to start recording'}
                </p>
                <p className="text-zinc-400 text-xs font-medium">
                  Or hit "Run Sample" below to preview
                </p>
              </div>
            </div>
          ) : (
            messages
              .filter(msg => {
                const searchMatch = !searchTerm || (msg.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       msg.author.toLowerCase().includes(searchTerm.toLowerCase()));
                const speakerMatch = !speakerFilter || msg.author === speakerFilter;
                return searchMatch && speakerMatch;
              })
              .map((msg) => (
              <div key={msg.id} className="flex flex-col gap-1.5 w-full">
                <span className={`text-[11px] font-mono font-bold ml-1 ${getAuthorColor(msg.author)}`}>{msg.author}</span>
                <div className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed shadow-sm transition-all ${searchTerm && (msg.text.toLowerCase().includes(searchTerm.toLowerCase()) || msg.author.toLowerCase().includes(searchTerm.toLowerCase())) ? 'ring-2 ring-[#3EB489]/30 bg-white' : 'opacity-80'} ${msg.author === 'AI Facilitator' ? 'bg-indigo-50 border border-indigo-100 text-indigo-900 rounded-tr-sm self-start max-w-[90%]' : msg.author === 'Uploaded Transcript' ? 'bg-zinc-100 border border-zinc-200 text-zinc-700 rounded-lg max-w-[90%]' : 'bg-white border border-zinc-200 text-zinc-800 rounded-tl-sm self-end max-w-[90%]'}`}>
                  {searchTerm ? (
                    msg.text.split(new RegExp(`(${searchTerm})`, 'gi')).map((part, i) => 
                      part.toLowerCase() === searchTerm.toLowerCase() 
                        ? <mark key={i} className="bg-yellow-200 text-zinc-900 rounded px-0.5">{part}</mark> 
                        : part
                    )
                  ) : msg.text}
                </div>
              </div>
            ))
          )}
          
          <AnimatePresence>
            {isConnected && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-1.5 mt-2">
                <span className="text-[11px] font-mono font-medium text-indigo-400 ml-1 flex items-center gap-2">
                   <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                   Agent is listening & transcribing...
                </span>
                {interimTranscript && (
                  <div className="px-4 py-3 rounded-2xl text-[14px] leading-relaxed bg-white/50 border border-zinc-200 text-zinc-400 italic rounded-tl-sm shadow-sm inline-block max-w-[90%]">
                    {interimTranscript}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>

        <div className="px-4 py-2 bg-zinc-50/80 backdrop-blur-sm border-t border-zinc-200 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={isConnected ? disconnect : connect}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
                isConnected
                  ? 'bg-red-50 border-red-100 hover:bg-red-100'
                  : 'bg-[#3EB489]/10 border-[#3EB489]/20 hover:bg-[#3EB489]/20'
              }`}
              title={isConnected ? 'Stop recording' : 'Start recording'}
            >
              {isConnected ? (
                <>
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <MicOff className="w-3 h-3 text-red-700" />
                  <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Recording</span>
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3 text-[#3EB489]" />
                  <span className="text-[10px] font-bold text-[#3EB489] uppercase tracking-wider">Start mic</span>
                </>
              )}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="flex items-center gap-1.5 p-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors border border-zinc-200/50 bg-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
              title="Undo last action (Cmd/Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
            <div className="relative">
              <button
                onClick={() => setMoreMenuOpen(prev => !prev)}
                className={`flex items-center gap-1.5 p-1.5 px-3 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors border ${
                  moreMenuOpen
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border-zinc-200/50 bg-white'
                }`}
                title="More actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
                More
              </button>
              <AnimatePresence>
                {moreMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full mb-2 right-0 z-50 w-52 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-200/60 overflow-hidden p-1.5"
                    >
                      <button
                        onClick={() => { setMoreMenuOpen(false); handleRunSample(); }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-[#D3D3FF]/40 rounded-lg transition-colors text-left"
                      >
                        <Library className="w-4 h-4 text-zinc-500 shrink-0" />
                        <span>Run sample data</span>
                      </button>
                      <button
                        onClick={() => { setMoreMenuOpen(false); setShowTranscript(true); }}
                        disabled={messages.length === 0}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-[#bdd0c4]/30 rounded-lg transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <ScrollText className="w-4 h-4 text-zinc-500 shrink-0" />
                        <span>View transcript</span>
                      </button>
                      <button
                        onClick={() => {
                          setMoreMenuOpen(false);
                          try { localStorage.removeItem('groupstorming_onboarded'); } catch {}
                          setShowOnboarding(true);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-[#dfccf1]/30 rounded-lg transition-colors text-left"
                      >
                        <Sparkles className="w-4 h-4 text-zinc-500 shrink-0" />
                        <span>Show intro tour</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-zinc-200 shrink-0">
          <form onSubmit={handleQueryAI} className="relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Query AI..."
              disabled={isQuerying}
              className="w-full bg-white border border-zinc-200 rounded-full pl-5 pr-12 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow shadow-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isQuerying}
              className="absolute right-2 p-1.5 rounded-full bg-zinc-900 text-white disabled:opacity-50 transition-colors hover:bg-zinc-800"
            >
              {isQuerying ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </motion.div>

      {/* RIGHT VISUALIZATION PANEL */}
      <div className="flex-1 flex flex-col border-l border-white/40 relative z-10">

        {/* RIGHT-CLICK CONTEXT MENU */}
        <AnimatePresence>
          {contextMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setContextMenu(null)}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                style={{
                  left: Math.min(contextMenu.x, window.innerWidth - 240),
                  top: Math.min(contextMenu.y, window.innerHeight - 160),
                }}
                className="fixed z-50 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-200/60 overflow-hidden p-1.5"
              >
                <button
                  onClick={() => triggerAIBrainstorm(contextMenu.bubbleId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-violet-100 hover:text-violet-900 rounded-lg transition-colors text-left"
                >
                  <Wand2 className="w-4 h-4 text-violet-500 shrink-0" />
                  <span>AI: Generate similar ideas</span>
                </button>
                <button
                  onClick={() => startMergeMode(contextMenu.bubbleId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors text-left"
                >
                  <GitMerge className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>Merge with another bubble…</span>
                </button>
                <button
                  onClick={() => {
                    const target = bubbles.find(b => b.id === contextMenu.bubbleId);
                    if (target) setSelectedBubble(target);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors text-left"
                >
                  <Eye className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span>View details</span>
                </button>
                <button
                  onClick={() => deleteBubble(contextMenu.bubbleId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors text-left"
                >
                  <Trash2 className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span>Delete bubble</span>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="px-6 py-4 border-b border-white/40 flex flex-col gap-3 bg-white/60 backdrop-blur-xl shrink-0">
          
           <div data-onboarding="tabs" className="flex items-start gap-4">
             <div className="flex flex-col gap-1">
                <button
                  onClick={() => setActiveView('bubbles')}
                  className={`text-sm font-bold px-4 py-2 rounded-lg transition-all ${activeView === 'bubbles' ? 'bg-[#9ab7d3] text-white' : 'bg-[#9ab7d3]/10 text-zinc-500 hover:bg-[#9ab7d3]/20 hover:text-zinc-800'}`}
                >
                   <div className="flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      Idea Bubbles
                   </div>
                </button>
                {activeView === 'bubbles' && (
                  <p className="text-[11px] text-zinc-500 pl-1 font-medium animate-in fade-in slide-in-from-top-1 duration-300">
                    Live visualization of your brainstorming branching.
                  </p>
                )}
             </div>

             <div className="flex flex-col gap-1">
                <button 
                  onClick={() => setActiveView('timeline')}
                  className={`text-sm font-bold px-4 py-2 rounded-lg transition-all ${activeView === 'timeline' ? 'bg-[#f5d2d3] text-zinc-900' : 'bg-[#f5d2d3]/20 text-zinc-500 hover:bg-[#f5d2d3]/30 hover:text-zinc-800'}`}
                >
                   <div className="flex items-center gap-2">
                      <GitCommitHorizontal className="w-4 h-4" />
                      Timeline
                   </div>
                </button>
                {activeView === 'timeline' && (
                  <p className="text-[11px] text-zinc-500 pl-1 font-medium animate-in fade-in slide-in-from-top-1 duration-300">
                    How ideas and focuses develop chronologically.
                  </p>
                )}
             </div>

             <div className="flex flex-col gap-1">
                <button 
                  onClick={() => setActiveView('matrix')}
                  className={`text-sm font-bold px-4 py-2 rounded-lg transition-all ${activeView === 'matrix' ? 'bg-[#f7e1d3] text-zinc-900' : 'bg-[#f7e1d3]/20 text-zinc-500 hover:bg-[#f7e1d3]/30 hover:text-zinc-800'}`}
                >
                   <div className="flex items-center gap-2">
                      <BarChart className="w-4 h-4" />
                      Evaluation Matrix
                   </div>
                </button>
                {activeView === 'matrix' && (
                  <p className="text-[11px] text-zinc-500 pl-1 font-medium animate-in fade-in slide-in-from-top-1 duration-300">
                    How the ideas fit in the Impact-Effort Matrix.
                  </p>
                )}
             </div>

             <div className="flex flex-col gap-1">
                <button 
                  onClick={() => setActiveView('report')}
                  className={`text-sm font-bold px-4 py-2 rounded-lg transition-all ${activeView === 'report' ? 'bg-[#bdd0c4] text-zinc-900' : 'bg-[#bdd0c4]/20 text-zinc-500 hover:bg-[#bdd0c4]/30 hover:text-zinc-800'}`}
                >
                   <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Meeting Report
                   </div>
                </button>
                {activeView === 'report' && (
                  <p className="text-[11px] text-zinc-500 pl-1 font-medium animate-in fade-in slide-in-from-top-1 duration-300">
                    Comprehensive summary and rubric analysis.
                  </p>
                )}
             </div>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 flex flex-col gap-10 relative">
          
          <AnimatePresence>
          </AnimatePresence>
          
          {activeView === 'bubbles' && (
             <div className="w-full h-full flex flex-col relative">
                {/* CANVAS TOOLBAR — search/filter on left, consolidate on right */}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setCanvasSearchOpen(prev => !prev);
                        if (canvasSearchOpen) setCanvasSearchTerm('');
                      }}
                      className={`flex items-center gap-1.5 p-2 rounded-lg border backdrop-blur-md transition-all ${
                        canvasSearchOpen || canvasSearchTerm
                          ? 'text-[#5b4d8a] border-[#aba6de]/40 shadow-[0_2px_12px_rgba(171,166,222,0.25)]'
                          : 'bg-white/70 text-zinc-500 hover:text-zinc-900 border-zinc-200/60 hover:bg-white'
                      }`}
                      style={(canvasSearchOpen || canvasSearchTerm) ? {
                        background: 'linear-gradient(135deg, rgba(171,166,222,0.22), rgba(154,183,211,0.18))',
                      } : undefined}
                      title="Search bubbles by text or contributor"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                    <AnimatePresence>
                      {canvasSearchOpen && (
                        <motion.input
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: 220, opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          autoFocus
                          type="text"
                          value={canvasSearchTerm}
                          onChange={e => setCanvasSearchTerm(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') {
                              setCanvasSearchTerm('');
                              setCanvasSearchOpen(false);
                            }
                          }}
                          placeholder="Filter bubbles…"
                          className="px-3 py-1.5 text-xs font-medium bg-white border border-zinc-200/60 rounded-lg outline-none focus:border-[#3EB489]/50 focus:ring-1 focus:ring-[#3EB489]/30 placeholder:text-zinc-400"
                        />
                      )}
                    </AnimatePresence>

                    <div className="relative">
                      <button
                        onClick={() => setFilterMenuOpen(prev => !prev)}
                        className={`flex items-center gap-1.5 p-2 rounded-lg border backdrop-blur-md transition-all ${
                          filterMenuOpen || speakerFilter
                            ? 'text-[#5b4d8a] border-[#aba6de]/40 shadow-[0_2px_12px_rgba(171,166,222,0.25)]'
                            : 'bg-white/70 text-zinc-500 hover:text-zinc-900 border-zinc-200/60 hover:bg-white'
                        }`}
                        style={(filterMenuOpen || speakerFilter) ? {
                          background: 'linear-gradient(135deg, rgba(171,166,222,0.22), rgba(154,183,211,0.18))',
                        } : undefined}
                        title="Filter by speaker"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        {speakerFilter && (
                          <span className="text-[10px] font-bold pr-1">{speakerFilter}</span>
                        )}
                      </button>
                      <AnimatePresence>
                        {filterMenuOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setFilterMenuOpen(false)} />
                            <motion.div
                              initial={{ opacity: 0, y: -4, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.97 }}
                              transition={{ duration: 0.12 }}
                              className="absolute top-full mt-2 left-0 z-50 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-200/60 overflow-hidden p-1.5 max-h-[300px] overflow-y-auto"
                            >
                              {distilledBubbles && distilledBubbles.length > 0 && (
                                <>
                                  <div className="px-3 py-1 text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest">View</div>
                                  <button
                                    onClick={() => { setViewMode('original'); setSpeakerFilter(null); setFilterMenuOpen(false); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-[12px] font-medium rounded-lg transition-colors text-left ${
                                      viewMode === 'original' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
                                    }`}
                                  >
                                    <span className="w-2 h-2 rounded-full bg-zinc-400" />
                                    <span className="flex-1">Original ideas</span>
                                    {viewMode === 'original' && <Check className="w-3 h-3 text-[#3EB489]" />}
                                  </button>
                                  <button
                                    onClick={() => { setViewMode('distilled'); setSpeakerFilter(null); setFilterMenuOpen(false); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-[12px] font-medium rounded-lg transition-colors text-left ${
                                      viewMode === 'distilled' ? 'bg-amber-50 text-amber-900' : 'text-zinc-700 hover:bg-zinc-50'
                                    }`}
                                  >
                                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                                    <span className="flex-1">Consolidated findings</span>
                                    {viewMode === 'distilled' && <Check className="w-3 h-3 text-amber-600" />}
                                  </button>
                                  <div className="my-1 border-t border-zinc-100" />
                                </>
                              )}
                              {viewMode === 'original' && (() => {
                                const allContribs = Array.from(new Set<string>(bubbles.flatMap(b => b.contributors)))
                                  .filter(c => c && c !== 'unknown' && c !== 'Distilled');
                                const humans = allContribs.filter(c => !c.includes('AI')).sort();
                                const aiContribs = allContribs.filter(c => c.includes('AI')).sort();
                                return (
                                  <>
                                    <div className="px-3 py-1 text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest">By speaker</div>
                                    <button
                                      onClick={() => { setSpeakerFilter(null); setFilterMenuOpen(false); }}
                                      className={`w-full flex items-center gap-3 px-3 py-2 text-[12px] font-medium rounded-lg transition-colors text-left ${
                                        !speakerFilter ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
                                      }`}
                                    >
                                      <span className="w-2 h-2 rounded-full bg-zinc-400" />
                                      <span>All speakers</span>
                                    </button>
                                    {humans.map(c => {
                                      const isActive = speakerFilter === c;
                                      return (
                                        <button
                                          key={c}
                                          onClick={() => { setSpeakerFilter(isActive ? null : c); setFilterMenuOpen(false); }}
                                          className={`w-full flex items-center gap-3 px-3 py-2 text-[12px] font-medium rounded-lg transition-colors text-left ${
                                            isActive ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
                                          }`}
                                        >
                                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getAuthorBg(c) }} />
                                          <span className="flex-1 truncate">{c}</span>
                                          {isActive && <Check className="w-3 h-3 text-[#3EB489]" />}
                                        </button>
                                      );
                                    })}
                                    {aiContribs.length > 0 && (
                                      <>
                                        <div className="my-1 border-t border-zinc-100" />
                                        <div className="px-3 py-1 text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest">AI</div>
                                        {aiContribs.map(c => {
                                          const isActive = speakerFilter === c;
                                          return (
                                            <button
                                              key={c}
                                              onClick={() => { setSpeakerFilter(isActive ? null : c); setFilterMenuOpen(false); }}
                                              className={`w-full flex items-center gap-3 px-3 py-2 text-[12px] font-medium rounded-lg transition-colors text-left ${
                                                isActive ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'
                                              }`}
                                            >
                                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getAuthorBg(c) }} />
                                              <span className="flex-1 truncate">{c}</span>
                                              {isActive && <Check className="w-3 h-3 text-[#3EB489]" />}
                                            </button>
                                          );
                                        })}
                                      </>
                                    )}
                                  </>
                                );
                              })()}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    {(canvasSearchTerm || speakerFilter) && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {visibleBubbles.length} / {bubbles.length}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {viewMode === 'distilled' && (
                      <span className="text-[10px] font-mono text-amber-700 uppercase tracking-widest">
                        Viewing consolidated findings
                      </span>
                    )}
                    {viewMode === 'original' && (
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                        {bubbles.length < 2 ? 'Add 2+ bubbles' : (distilledBubbles ? 'Re-run consolidation →' : 'Consolidate findings →')}
                      </span>
                    )}
                    <motion.button
                      onClick={handleDistill}
                      disabled={bubbles.length < 2 || isDistilling || timelineMode || viewMode === 'distilled'}
                      data-onboarding="consolidate"
                      whileHover={{ scale: (bubbles.length < 2 || timelineMode || viewMode === 'distilled') ? 1 : 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      className="relative flex items-center gap-2 px-5 py-2 rounded-full text-white shadow-lg text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed border border-white/20 overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, rgba(62,180,137,0.85), rgba(154,183,211,0.85) 50%, rgba(171,166,222,0.85))',
                        boxShadow: '0 4px 20px rgba(154,183,211,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset',
                      }}
                      title={
                        timelineMode ? 'Exit timeline mode to consolidate'
                        : viewMode === 'distilled' ? 'Already viewing consolidated findings — switch to Original to re-run'
                        : bubbles.length < 2 ? 'Need at least 2 bubbles to consolidate'
                        : 'Consolidate ideas into core themes (preserves the original)'
                      }
                    >
                      <span className="absolute inset-0 bg-white/10 backdrop-blur-sm pointer-events-none" />
                      <span className="relative flex items-center gap-2">
                        {isDistilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                        Consolidate
                      </span>
                    </motion.button>
                  </div>
                </div>

                <div data-onboarding="canvas" className="flex-1 min-h-[450px] relative">
                   <LiveBubbles
                     bubbles={visibleBubbles}
                     links={visibleLinks}
                     knownContributors={knownContributors}
                     onBubbleClick={(bubble) => {
                        if (mergeSourceId && bubble.id !== mergeSourceId) {
                           handleMergeBubbles(mergeSourceId, bubble.id);
                           setMergeSourceId(null);
                        } else {
                           setSelectedBubble(bubble);
                        }
                     }}
                     onMergeBubbles={handleMergeBubbles}
                     onBubbleRightClick={handleBubbleRightClick}
                     onBubbleDoubleClick={handleUnmergeBubbles}
                     filterSpeaker={speakerFilter}
                     zoom={zoom}
                   />
                   
                   <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-30">
                      <button
                        onClick={() => setZoom(prev => Math.min(2, prev + 0.1))}
                        className="p-2 bg-white rounded-full shadow-lg border border-zinc-100 text-zinc-500 hover:text-[#3EB489] transition-colors"
                        title="Zoom In"
                      >
                         <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
                        className="p-2 bg-white rounded-full shadow-lg border border-zinc-100 text-zinc-500 hover:text-[#3EB489] transition-colors"
                        title="Zoom Out"
                      >
                         <ZoomOut className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setZoom(1)}
                        className="p-2 bg-white rounded-full shadow-lg border border-zinc-100 text-[10px] font-bold text-zinc-400 hover:text-zinc-600"
                      >
                         1:1
                      </button>
                   </div>

                   {/* TIMELINE TOGGLE — top-left of canvas */}
                   <button
                     onClick={timelineMode ? exitTimelineMode : enterTimelineMode}
                     disabled={bubbles.length === 0}
                     data-onboarding="timeline"
                     className="absolute top-4 left-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg border backdrop-blur-md text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                     style={timelineMode ? {
                       background: 'linear-gradient(135deg, rgba(62,180,137,0.30), rgba(171,166,222,0.30))',
                       borderColor: 'rgba(171,166,222,0.5)',
                       color: '#5b4d8a',
                       boxShadow: '0 2px 14px rgba(154,183,211,0.3)',
                     } : {
                       background: 'rgba(255,255,255,0.7)',
                       borderColor: 'rgba(228,228,231,0.6)',
                       color: '#52525b',
                     }}
                     title="Scrub through the brainstorm history"
                   >
                     {timelineMode ? <Radio className="w-3 h-3" /> : <Rewind className="w-3 h-3" />}
                     {timelineMode ? 'Exit Timeline' : 'Timeline'}
                   </button>

                   {/* TIMELINE SCRUBBER — bottom of canvas, only in timeline mode */}
                   <AnimatePresence>
                     {timelineMode && (
                       <motion.div
                         initial={{ y: 50, opacity: 0 }}
                         animate={{ y: 0, opacity: 1 }}
                         exit={{ y: 50, opacity: 0 }}
                         className="absolute bottom-4 left-4 right-20 z-30 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-zinc-200/60 p-3"
                       >
                         <div className="flex items-center gap-3">
                           <button
                             onClick={() => setIsPlaying(prev => !prev)}
                             className="relative shrink-0 w-9 h-9 rounded-full text-white flex items-center justify-center border border-white/30 overflow-hidden"
                             style={{
                               background: 'linear-gradient(135deg, rgba(62,180,137,0.85), rgba(154,183,211,0.85) 50%, rgba(171,166,222,0.85))',
                               boxShadow: '0 2px 10px rgba(154,183,211,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset',
                             }}
                             title={isPlaying ? 'Pause' : 'Play'}
                           >
                             <span className="absolute inset-0 bg-white/10 backdrop-blur-sm pointer-events-none" />
                             <span className="relative flex items-center justify-center">
                               {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                             </span>
                           </button>
                           <div className="flex-1 flex flex-col gap-1">
                             <div className="flex justify-between text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest">
                               <span>{minTime ? new Date(minTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}</span>
                               <span className="text-zinc-700">
                                 {visibleBubbles.length} / {bubbles.length} bubbles · {scrubTime ? new Date(scrubTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}
                               </span>
                               <span>{maxTime ? new Date(maxTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}</span>
                             </div>
                             <input
                               type="range"
                               min={minTime}
                               max={maxTime}
                               step={Math.max(1, (maxTime - minTime) / 200)}
                               value={scrubTime ?? maxTime}
                               onChange={e => {
                                 setScrubTime(Number(e.target.value));
                                 setIsPlaying(false);
                               }}
                               className="w-full accent-[#3EB489]"
                             />
                           </div>
                           <button
                             onClick={() => { setScrubTime(minTime); setIsPlaying(true); }}
                             className="shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                             title="Replay from beginning"
                           >
                             <Rewind className="w-3 h-3" />
                           </button>
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>

                   {/* MERGE MODE HINT */}
                   <AnimatePresence>
                     {mergeSourceId && (
                       <motion.div
                         initial={{ opacity: 0, y: -10 }}
                         animate={{ opacity: 1, y: 0 }}
                         exit={{ opacity: 0, y: -10 }}
                         className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-blue-600 text-white rounded-full shadow-xl px-4 py-2 flex items-center gap-2"
                       >
                         <GitMerge className="w-3.5 h-3.5" />
                         <span className="text-[11px] font-bold uppercase tracking-wider">
                           Click another bubble to merge into "{bubbles.find(b => b.id === mergeSourceId)?.summary || 'source'}"
                         </span>
                         <button
                           onClick={() => setMergeSourceId(null)}
                           className="ml-1 p-1 rounded-full hover:bg-white/20 transition-colors"
                           title="Cancel merge"
                         >
                           <X className="w-3 h-3" />
                         </button>
                       </motion.div>
                     )}
                   </AnimatePresence>
                </div>
                
                <AnimatePresence>
                   {selectedBubble && (
                     <motion.div 
                       initial={{ opacity: 0, x: 20 }}
                       animate={{ opacity: 1, x: 0 }}
                       exit={{ opacity: 0, x: 20 }}
                       className="absolute top-16 right-4 w-80 bg-white p-0 rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden z-20 flex flex-col"
                     >
                       <div className="bg-zinc-900 px-5 py-4 flex items-center justify-between">
                          <h3 className="text-white font-serif font-bold text-base leading-tight truncate">{selectedBubble.summary}</h3>
                          <button 
                            onClick={() => setSelectedBubble(null)}
                            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white rounded-md transition-colors bg-white/10 hover:bg-white/20"
                          >
                            &times;
                          </button>
                       </div>

                       <div className="p-5 flex flex-col gap-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">Contributors</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedBubble.contributors.map((c,i) => (
                                 <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-bold ${c === 'AI' || c.includes('AI') ? 'bg-yellow-100 text-yellow-800' : 'bg-indigo-100 text-indigo-800'}`}>{c}</span>
                              ))}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                             <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100 pb-1 flex items-center gap-1.5">
                                <Library className="w-3 h-3" />
                                Related Transcript
                             </span>
                             <div className="text-sm text-zinc-600 leading-relaxed max-h-64 overflow-y-auto pr-2 custom-scrollbar bg-zinc-50 p-4 rounded-xl border border-zinc-100 italic">
                               {selectedBubble.originalText 
                                  ? selectedBubble.originalText.split('\n').map((para, i) => <p key={i} className="mb-2 last:mb-0 text-zinc-700">"{para}"</p>)
                                  : <p className="italic text-zinc-400">No raw transcript available for this synthesis.</p>
                               }
                             </div>
                          </div>
                          
                          <div className="flex justify-end pt-2">
                            <button 
                              onClick={() => setSelectedBubble(null)}
                              className="text-xs font-bold text-zinc-900 hover:text-black underline underline-offset-4 decoration-[#D3D3FF] decoration-2"
                            >
                              Close Details
                            </button>
                          </div>
                       </div>
                     </motion.div>
                   )}
                </AnimatePresence>
             </div>
          )}

          {activeView === 'timeline' && (
             <div className="w-full h-full flex flex-col">
                <TimelineView events={timelineEvents} />
             </div>
          )}

          {activeView === 'matrix' && (
             <div className="w-full h-full flex flex-col">
                {isEvaluating ? (
                   <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-[#cf7d65] bg-[#cf7d65]/5 rounded-2xl border-2 border-[#cf7d65]/20 border-dashed backdrop-blur-sm">
                      <Loader2 className="w-10 h-10 animate-spin" />
                      <p className="font-mono text-sm font-bold uppercase tracking-wider">Evaluating Ideas & Finding Similar Market Concepts...</p>
                   </div>
                ) : (
                  <EaseImpactMatrix ideas={evaluatedIdeas} />
                )}
             </div>
          )}

          {activeView === 'report' && (
             <div className="w-full h-full flex flex-col">
                {isGeneratingReport ? (
                   <div className="flex-1 flex flex-col items-center justify-center space-y-4 text-[#bdd0c4] bg-[#bdd0c4]/5 rounded-2xl border-2 border-[#bdd0c4]/20 border-dashed backdrop-blur-sm">
                      <Loader2 className="w-10 h-10 animate-spin" />
                      <p className="font-mono text-sm font-bold uppercase tracking-wider">Analyzing Rubrics & Generating Meeting Report...</p>
                   </div>
                ) : (
                  meetingReport ? <PostMeetingReportView report={meetingReport} /> : (
                     <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4">
                       <div className="w-16 h-16 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center shadow-sm">
                         <FileText className="w-8 h-8 text-zinc-400" />
                       </div>
                       <p className="text-sm font-sans text-zinc-500 text-center max-w-sm">
                          Run the post meeting report generator to summarize meeting rubrics.
                       </p>
                     </div>
                  )
                )}
             </div>
          )}

        </div>
      </div>
    </div>
  );
}
