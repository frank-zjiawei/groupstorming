import React, { useState } from 'react';
import { EvaluatedIdea } from '../types';
import { motion } from 'motion/react';
import { Crosshair, Info, ArrowRight } from 'lucide-react';

interface EaseImpactMatrixProps {
  ideas: EvaluatedIdea[];
}

export function EaseImpactMatrix({ ideas }: EaseImpactMatrixProps) {
  const [selectedIdea, setSelectedIdea] = useState<EvaluatedIdea | null>(null);

  if (ideas.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-400">
        <p>Run the evaluation to populate the matrix.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6">
      <div className="flex-1 bg-white border border-zinc-200 rounded-xl shadow-sm flex flex-col relative overflow-hidden">
        {/* Title */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <h3 className="font-bold text-zinc-800 uppercase tracking-widest text-xs">Impact-Effort Graph</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#cf7d65]" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Impact</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#839958]" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Implementation</span>
            </div>
          </div>
        </div>
        
        {/* Matrix Container */}
        <div className="flex-1 relative mt-12 mx-12 mb-12">
          {/* Quadrant Labels - Centered in domains */}
          <div className="absolute top-[25%] left-[25%] -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none opacity-30">
            <p className="text-[10px] font-bold text-zinc-400 uppercase leading-tight">Hard to Implement<br/>High Impact</p>
            <p className="text-[8px] font-mono mt-1 italic">"Major Projects"</p>
          </div>
          <div className="absolute top-[25%] left-[75%] -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none opacity-30">
            <p className="text-[10px] font-bold text-zinc-400 uppercase leading-tight">Easy to Implement<br/>High Impact</p>
            <p className="text-[8px] font-mono mt-1 italic">"Quick Wins"</p>
          </div>
          <div className="absolute top-[75%] left-[25%] -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none opacity-30">
            <p className="text-[10px] font-bold text-zinc-400 uppercase leading-tight">Hard to Implement<br/>Low Impact</p>
            <p className="text-[8px] font-mono mt-1 italic">"Kill / Discard"</p>
          </div>
          <div className="absolute top-[75%] left-[75%] -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none opacity-30">
            <p className="text-[10px] font-bold text-zinc-400 uppercase leading-tight">Easy to Implement<br/>Low Impact</p>
            <p className="text-[8px] font-mono mt-1 italic">"Fill-ins"</p>
          </div>

          {/* Axes */}
          <div className="absolute inset-0 border-l-2 border-[#cf7d65]/40 border-b-2 border-[#839958]/40 pointer-events-none"></div>
          
          {/* Quadrant Lines */}
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-zinc-100 pointer-events-none"></div>
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-zinc-100 pointer-events-none"></div>
          
          {/* Axis Titles */}
          <div className="absolute -left-12 top-1/2 -translate-y-1/2 -rotate-90 font-bold text-[#cf7d65] text-[10px] tracking-widest uppercase">
            Impact
          </div>
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 font-bold text-[#839958] text-[10px] tracking-widest uppercase">
            Implementation
          </div>

        {/* Dots */}
          {ideas.map((idea, i) => (
            <motion.div
              key={idea.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className={`absolute w-8 h-8 -ml-4 -mb-4 rounded-full flex items-center justify-center cursor-pointer shadow-md border-2 transition-all hover:scale-125 z-10 ${selectedIdea?.id === idea.id ? 'bg-[#cf7d65] border-white text-white z-20' : 'bg-white border-zinc-200 text-zinc-500'}`}
              style={{
                left: `${idea.ease}%`,
                bottom: `${idea.impact}%`
              }}
              onClick={() => setSelectedIdea(idea)}
            >
              <span className="text-xs font-bold">{i + 1}</span>
            </motion.div>
          ))}
        </div>

        {/* Priority Legend */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-100 grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-sm bg-[#cf7d65]" />
              <span className="text-[9px] font-bold text-zinc-700 uppercase tracking-tight">Quick Wins (High Impact, Easy)</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight pl-3">Top priority; provides high value with minimal effort.</p>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-sm bg-[#cf7d65] opacity-60" />
              <span className="text-[9px] font-bold text-zinc-700 uppercase tracking-tight">Major Projects (High Impact, Hard)</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight pl-3">Strategic initiatives requiring planning and resources.</p>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-sm bg-[#839958] opacity-60" />
              <span className="text-[9px] font-bold text-zinc-700 uppercase tracking-tight">Fill-ins (Low Impact, Easy)</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight pl-3">Low priority; do if resources are available.</p>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-sm bg-zinc-300" />
              <span className="text-[9px] font-bold text-zinc-700 uppercase tracking-tight">Kill/Discard (Low Impact, Hard)</span>
            </div>
            <p className="text-[9px] text-zinc-500 font-medium leading-tight pl-3">Avoid or discard; consume resources for little gain.</p>
          </div>
        </div>
      </div>

      <div className="w-80 bg-zinc-50 border border-zinc-200 rounded-xl p-5 overflow-y-auto">
        <h3 className="font-bold text-zinc-800 mb-4 flex items-center gap-2">
          <Info className="w-4 h-4 text-[#cf7d65]" />
          Idea Details
        </h3>
        
        {!selectedIdea ? (
           <p className="text-sm text-zinc-500 italic">Select an idea point on the graph to view its detailed evaluation and real-world comparisons.</p>
        ) : (
           <div className="space-y-5">
             <div>
               <div className="inline-block bg-[#cf7d65]/10 text-[#cf7d65] text-xs px-2 py-1 rounded font-bold mb-2">Idea #{ideas.indexOf(selectedIdea) + 1}</div>
               <h4 className="text-lg font-bold text-zinc-900 leading-tight">{selectedIdea.summary}</h4>
               <p className="text-sm text-zinc-600 mt-2">{selectedIdea.description}</p>
             </div>
             
             <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-200">
               <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-sm">
                 <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Ease</p>
                 <p className="text-xl font-mono font-bold text-[#839958]">{selectedIdea.ease}%</p>
               </div>
               <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-sm">
                 <p className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Impact</p>
                 <p className="text-xl font-mono font-bold text-[#cf7d65]">{selectedIdea.impact}%</p>
               </div>
             </div>

             <div className="bg-[#839958] rounded-xl p-4 text-white shadow-md relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Crosshair className="w-16 h-16" />
               </div>
               <p className="text-[10px] uppercase font-bold text-white/60 tracking-wider mb-2">Market Comparison</p>
               <h5 className="font-bold text-sm mb-1 leading-snug">{selectedIdea.similarIndustryIdea}</h5>
               <div className="flex mt-3 gap-2 items-start">
                   <ArrowRight className="w-4 h-4 shrink-0 text-amber-300 mt-0.5" />
                   <p className="text-xs text-white/90">{selectedIdea.similarIdeaOutcome}</p>
               </div>
             </div>
           </div>
        )}
      </div>
    </div>
  );
}
