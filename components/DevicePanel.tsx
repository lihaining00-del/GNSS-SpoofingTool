import React, { useMemo } from 'react';
import { GNSSDataPoint } from '../types';
import { SpoofingChart, SignalChart, FixStatusChart } from './Charts';

interface DevicePanelProps {
  title: string;
  deviceType: 'X20P' | 'A7P' | 'X5';
  data: GNSSDataPoint[];
  fileName: string | null;
  msgCounts: Record<string, number>;
  isParsing: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const DevicePanel: React.FC<DevicePanelProps> = ({
  title,
  deviceType,
  data,
  fileName,
  msgCounts,
  isParsing,
  onUpload
}) => {
  const hasData = data.length > 0;
  
  // Calculate device-specific stats
  // A7P doesn't have spoofing detection messages, so we shouldn't flag it as safe or alert based on UBX messages
  const isSpoofingSupported = deviceType === 'X20P' || deviceType === 'X5'; 

  // Extract Spoofing Events (Contiguous segments where State >= 2)
  const spoofingEvents = useMemo(() => {
    if (!hasData) return [];
    const events: {start: string, end: string, maxState: number, count: number}[] = [];
    let current = null;

    data.forEach(d => {
        // Check for spoofing (State 2=Indicated, 3=Confirmed)
        const s1 = d.spoofingState || 0;
        const s2 = d.secSigState || 0;
        const state = Math.max(s1, s2);
        
        if (state >= 2) {
            if (!current) {
                current = { start: d.timestamp, end: d.timestamp, maxState: state, count: 1 };
            } else {
                current.end = d.timestamp;
                current.maxState = Math.max(current.maxState, state);
                current.count++;
            }
        } else {
            if (current) {
                events.push(current);
                current = null;
            }
        }
    });
    if (current) events.push(current);
    return events;
  }, [data]);

  const handleExport = () => {
    if (!hasData) return;
    const headers = ['Timestamp', 'TimeSec', 'Lat', 'Lon', 'Alt', 'FixQual', 'Sats', 'L1_CN0', 'SpoofState', 'SecSigState'];
    const csvContent = [
        headers.join(','),
        ...data.map(d => [
            d.timestamp,
            d.timeSeconds,
            d.lat || '',
            d.lon || '',
            d.alt || '',
            d.fixQuality,
            d.satellitesUsed,
            d.gpsL1Cn0,
            d.spoofingState,
            d.secSigState
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${deviceType}_analysis.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-slate-800/20 rounded-xl border border-slate-700/50 p-4">
      {/* Header Section */}
      <div className="mb-4 flex-none">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold text-slate-200">{title}</h2>
          <div className="flex gap-2">
             {hasData && (
                <button 
                    onClick={handleExport}
                    className="bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 text-xs text-white py-1.5 px-3 rounded shadow-sm transition-all flex items-center gap-1"
                    title="Export CSV"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export
                </button>
            )}
            <div className="relative group">
                <input
                    type="file"
                    accept=".txt,.ubx,.nmea,.log,.sbf"
                    onChange={onUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <button className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-slate-200 py-1.5 px-3 rounded shadow-sm transition-all flex items-center gap-2 group-hover:border-cyan-500/50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {fileName ? 'Change' : 'Upload'}
                </button>
            </div>
          </div>
        </div>
        
        {fileName ? (
            <div className="text-xs text-slate-400 font-mono truncate" title={fileName}>
                Loaded: {fileName}
            </div>
        ) : (
            <div className="text-xs text-slate-500 italic">No file loaded</div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {hasData ? (
            <div className="flex flex-col h-full">
                {/* Stats Grid - 3 cols (Duration, Points, Msgs) */}
                <div className="grid grid-cols-3 gap-2 flex-none mb-4">
                     <div className="bg-slate-800 p-2 rounded border border-slate-700">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Duration</p>
                        <p className="text-sm font-mono text-white">
                            {(data[data.length-1].timeSeconds / 60).toFixed(1)}m
                        </p>
                    </div>
                     <div className="bg-slate-800 p-2 rounded border border-slate-700">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Points</p>
                        <p className="text-sm font-mono text-white">{data.length}</p>
                    </div>
                     <div className="bg-slate-800 p-2 rounded border border-slate-700">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Msgs</p>
                        <p className="text-sm font-mono text-indigo-400">
                            {(Object.values(msgCounts) as number[]).reduce((a, b) => a + b, 0)}
                        </p>
                    </div>
                </div>

                {/* Charts */}
                <div className="flex-1 flex flex-col min-h-0 gap-2">
                    <SpoofingChart 
                        data={data} 
                        disabled={!isSpoofingSupported} 
                        deviceType={deviceType}
                    />
                    <SignalChart data={data} />
                    <FixStatusChart data={data} />

                    {/* Spoofing Extraction List */}
                    {spoofingEvents.length > 0 && (
                        <div className="bg-slate-900/50 rounded border border-red-900/50 overflow-hidden flex-none max-h-32 overflow-y-auto">
                            <div className="bg-red-900/20 px-3 py-1 text-[10px] font-bold text-red-400 uppercase tracking-wider sticky top-0 backdrop-blur-sm">
                                Spoofing Detected ({spoofingEvents.length} events)
                            </div>
                            <table className="w-full text-xs text-left">
                                <thead className="text-slate-500 border-b border-slate-800">
                                    <tr>
                                        <th className="px-3 py-1">Start</th>
                                        <th className="px-3 py-1">End</th>
                                        <th className="px-3 py-1">Level</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {spoofingEvents.map((evt, idx) => (
                                        <tr key={idx} className="hover:bg-red-500/5 transition-colors">
                                            <td className="px-3 py-1 text-slate-300 font-mono">{evt.start}</td>
                                            <td className="px-3 py-1 text-slate-300 font-mono">{evt.end}</td>
                                            <td className="px-3 py-1">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${evt.maxState === 3 ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
                                                    {evt.maxState === 3 ? 'ALERT' : 'WARN'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <div className="h-full flex flex-col items-center justify-center bg-slate-800/10 rounded-xl border border-dashed border-slate-700/50 p-6">
               {isParsing ? (
                  <div className="text-indigo-400 flex flex-col items-center">
                       <svg className="animate-spin h-6 w-6 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                       </svg>
                       <span className="text-xs">Parsing...</span>
                  </div>
               ) : (
                   <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-slate-500 text-xs">Upload {deviceType} Log</p>
                   </div>
               )}
            </div>
        )}
      </div>
    </div>
  );
};