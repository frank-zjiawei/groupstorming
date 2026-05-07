import React, { useRef, useState } from 'react';
import { TimelineEvent } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { GitCommitHorizontal, MessageCircle, ArrowRight } from 'lucide-react';

interface TimelineProps {
  events: TimelineEvent[];
}

function stringToColor(str: string): string {
  if (str.toLowerCase().includes('ai')) return 'hsl(45, 93%, 47%)'; // yellow-500 equivalent
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export function TimelineView({ events }: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // scroll-fast multiplier
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  if (events.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center shadow-sm">
          <GitCommitHorizontal className="w-8 h-8 text-zinc-400" />
        </div>
        <p className="text-sm font-sans text-zinc-500 text-center max-w-sm">
          No ideas have been captured yet. Start the live agent and discuss ideas.
        </p>
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      className={`flex-1 w-full overflow-x-auto relative flex items-center py-8 custom-scrollbar ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
    >
      <div className="min-w-max px-16 relative flex items-center h-full min-h-[480px]">
        {/* Continuous Horizontal Line */}
        <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-zinc-200 z-0 -translate-y-1/2"></div>
        
        <div className="flex gap-10 relative z-10 items-center">
          <AnimatePresence>
            {events.map((event, index) => {
              const isNewIdea = event.type === 'new_idea';
              const color = stringToColor(event.author);
              const isTop = index % 2 === 0;
              
              return (
                <motion.div 
                  key={event.id}
                  initial={{ opacity: 0, x: 20, y: isTop ? 10 : -10 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  className="relative shrink-0 w-80 h-[480px]"
                >
                  {/* Dot mapped on the line */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 border-4 border-white rounded-full bg-white">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-inner"
                      style={{ backgroundColor: color }}
                    >
                      {event.author.substring(0, 3).toUpperCase()}
                    </div>
                  </div>

                  {/* Content Wrapper */}
                  <div className={`absolute w-full flex flex-col items-center z-10 ${isTop ? 'bottom-1/2 pb-8' : 'top-1/2 pt-8'}`}>
                    {/* Vertical Connector Line */}
                    <div className={`absolute left-1/2 w-0.5 bg-zinc-300 z-0 ${isTop ? 'bottom-0 h-8' : 'top-0 h-8'} -translate-x-1/2`}></div>
                    
                    {/* Content Card */}
                    <div className="w-full bg-white p-5 rounded-2xl border border-zinc-200 shadow-xl shadow-zinc-200/40 relative group overflow-hidden z-10">
                      {isNewIdea && (
                        <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl">
                          New Idea
                        </div>
                      )}
                      {!isNewIdea && (
                        <div className="absolute top-0 right-0 bg-teal-500 text-white text-[10px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" /> Built On
                        </div>
                      )}

                      <div className="flex items-center gap-2 mb-3 mt-1">
                        <MessageCircle className="w-4 h-4 text-zinc-400" />
                        <span className="text-[11px] font-mono font-medium text-zinc-500 uppercase tracking-widest truncate max-w-[120px]">{event.author}</span>
                        <span className="text-[11px] text-zinc-400 whitespace-nowrap">&bull; {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <h4 className="text-lg font-serif font-bold text-zinc-900 mb-2 leading-snug">{event.summary}</h4>
                      
                      {event.originalText && (
                        <div className="mt-4 pt-3 border-t border-zinc-100">
                          <p className="text-sm text-zinc-600 leading-relaxed italic border-l-2 border-indigo-200 pl-3 line-clamp-4">
                            "{event.originalText}"
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
