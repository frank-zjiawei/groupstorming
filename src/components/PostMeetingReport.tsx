import React from 'react';
import { MeetingReport } from '../types';
import { Target, TrendingUp } from 'lucide-react';

export function PostMeetingReportView({ report }: { report: MeetingReport }) {
  if (!report) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      
      <div className="bg-white rounded-2xl p-8 border border-zinc-200 shadow-sm">
        <h2 className="text-2xl font-serif font-bold text-zinc-900 mb-4">Post-Meeting Report</h2>
        <div className="border-b border-zinc-100 pb-6 mb-6">
          <p className="text-zinc-600 leading-relaxed text-lg">
            {report.overview}
          </p>
        </div>

        <h3 className="font-bold text-zinc-800 mb-4 flex items-center gap-2">
          Meeting Observations
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {report.observations.map((obs, i) => {
            return (
              <div key={i} className="p-4 rounded-xl border border-zinc-200 bg-[#cdd4b1]/10 text-zinc-800 relative overflow-hidden">
                <div className="flex items-center gap-3 mb-2">
                  <Target className="w-5 h-5 shrink-0 text-[#cdd4b1]" />
                  <h4 className="font-bold text-sm tracking-wide">{obs.topic}</h4>
                </div>
                <p className="text-xs opacity-90 leading-relaxed font-medium">
                  {obs.factualData}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 bg-[#a9c9cf]/5 p-6 rounded-xl border border-[#a9c9cf]/20">
          <h3 className="font-bold text-zinc-800 mb-4 flex items-center gap-2">
             <TrendingUp className="w-5 h-5 text-[#a9c9cf]" />
             Key Takeaways & Action Items
          </h3>
          <ul className="space-y-3">
             {report.keyTakeaways.map((takeaway, i) => (
               <li key={i} className="flex gap-3 text-sm text-zinc-700 items-start">
                 <span className="w-6 h-6 rounded-full bg-white border border-zinc-300 flex items-center justify-center shrink-0 font-mono text-xs font-bold text-zinc-500">
                   {i+1}
                 </span>
                 <span className="mt-0.5 leading-relaxed">{takeaway}</span>
               </li>
             ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
