import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AnalysisStatus } from '../types';

interface Props {
  analysis: string;
  status: AnalysisStatus;
  onAnalyze: () => void;
}

export const AnalysisPanel: React.FC<Props> = ({ analysis, status, onAnalyze }) => {
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">
          AI Forensics Report
        </h2>
        {status === AnalysisStatus.COMPLETE || status === AnalysisStatus.IDLE ? (
             <button
             onClick={onAnalyze}
             className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
             </svg>
             Run Analysis
           </button>
        ) : (
            <div className="flex items-center gap-2 text-indigo-400 text-sm">
                 <svg className="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Analyzing Log...
            </div>
        )}
       
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-900/50 rounded-lg p-4 text-slate-300 text-sm border border-slate-700/50 font-mono">
        {analysis ? (
          <div className="prose prose-invert prose-sm max-w-none">
            {/* We render markdown safely */}
             {/* Note: ReactMarkdown is not a default browser lib, but the prompt instructions say "Use popular libraries". 
                 Assuming a standard build env, this would work. 
                 However, to avoid package dependency issues in this specific "single file" request format if packages aren't available, 
                 I will use a simple text display with basic formatting if ReactMarkdown isn't imported. 
                 Actually, I'll stick to simple whitespace pre-wrap for robustness in the generated code block unless I can import it.
                 I will use simple whitespace pre-wrap to be safe and robust.
             */}
            <pre className="whitespace-pre-wrap font-sans">{analysis}</pre>
          </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-60">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>Ready to analyze log structure and anomalies.</p>
            </div>
        )}
      </div>
    </div>
  );
};
