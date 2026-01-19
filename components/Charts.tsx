import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  AreaChart,
  Area,
  ReferenceLine,
  ComposedChart,
  Cell
} from 'recharts';
import { GNSSDataPoint } from '../types';

interface ChartProps {
  data: GNSSDataPoint[];
  disabled?: boolean;
  deviceType?: 'X20P' | 'A7P' | 'X5';
}

// 1. Top Chart: Spoofing State (SEC-SIG)
export const SpoofingChart: React.FC<ChartProps> = ({ data, disabled = false, deviceType }) => {
  const getSpoofLabel = (state: number) => {
    switch(state) {
      case 0: return 'Unknown';
      case 1: return 'Safe';
      case 2: return 'Indicated';
      case 3: return 'Confirmed';
      default: return 'Unknown';
    }
  };

  const getSourceLabel = () => {
    if (disabled) return '(N/A)';
    if (deviceType === 'X5') return '(SBF-RFStatus)';
    return '(UBX-SEC-SIG)';
  };

  return (
    <div className="flex-1 w-full bg-slate-800 rounded-t-lg p-4 border-x border-t border-slate-700 shadow-sm relative flex flex-col">
      <h3 className="text-slate-300 text-xs font-bold uppercase mb-2 flex items-center gap-2 flex-none">
        <span className={`w-2 h-2 rounded-full ${disabled ? 'bg-slate-600' : 'bg-indigo-500'}`}></span> 
        1. Spoofing Detection {getSourceLabel()}
      </h3>
      <div className="relative w-full flex-1 min-h-0">
        {disabled && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-800/80 backdrop-blur-[1px]">
            <span className="text-slate-500 text-sm font-mono border border-slate-600 px-3 py-1 rounded">Not Supported on Device</span>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={disabled ? [] : data} syncId="gnssSync">
            <defs>
              <linearGradient id="spoofGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="timestamp" hide />
            <YAxis 
              domain={[0, 3]} 
              tickCount={4} 
              stroke="#94a3b8" 
              fontSize={10}
              tickFormatter={(val) => {
                if(val === 0) return '?';
                if(val === 1) return 'SAFE';
                if(val === 2) return 'WARN';
                if(val === 3) return 'ALRT';
                return val;
              }}
            />
            {!disabled && (
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
                formatter={(value: number) => [getSpoofLabel(value), "State"]}
              />
            )}
            <Area 
              type="stepAfter" 
              dataKey="secSigState" 
              stroke="#f43f5e" 
              fill="url(#spoofGradient)" 
              strokeWidth={2}
            />
            <ReferenceLine y={2} stroke="#fb7185" strokeDasharray="3 3" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// 2. Middle Chart: Signal Strength (Top 3 Avg from GSV or NAV-SIG)
export const SignalChart: React.FC<ChartProps> = ({ data }) => {
  const hasGsvData = data.some(d => (d.gpsTop3AvgCn0 || 0) > 0);
  const dataKey = hasGsvData ? "gpsTop3AvgCn0" : "gpsL1Cn0";
  const label = hasGsvData ? "Top 3 Avg C/N0" : "L1 Avg C/N0";

  return (
    <div className="flex-1 w-full bg-slate-800 p-4 border-x border-t border-slate-700 flex flex-col relative">
      <h3 className="text-slate-300 text-xs font-bold uppercase mb-2 flex items-center gap-2 flex-none">
        <span className="w-2 h-2 rounded-full bg-sky-500"></span> 2. GPS Signal Strength ({label})
      </h3>
      <div className="relative w-full flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} syncId="gnssSync">
             <defs>
              <linearGradient id="cnoGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="timestamp" hide />
            <YAxis stroke="#94a3b8" domain={[0, 55]} label={{ value: 'dB-Hz', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
              formatter={(val: number) => [val, label]}
            />
            <Area 
              type="monotone" 
              dataKey={dataKey} 
              stroke="#38bdf8" 
              fill="url(#cnoGradient)"
              strokeWidth={2} 
              name={label}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// 3. Bottom Chart: Fix Status (Using GGA Quality with Color Coding)
export const FixStatusChart: React.FC<ChartProps> = ({ data }) => {
  const getFixLabel = (val: number) => {
      switch(val) {
          case 0: return 'Invalid';
          case 1: return 'SPS (1)';
          case 2: return 'DGPS (2)';
          case 4: return 'RTK Fix (4)';
          case 5: return 'RTK Flt (5)';
          case 6: return 'DR (6)';
          default: return `Type ${val}`;
      }
  };

  const getFixColor = (val: number) => {
      switch(val) {
          case 0: return '#ef4444'; // Red - Invalid
          case 1: return '#f59e0b'; // Orange - Standard
          case 2: return '#10b981'; // Green - DGPS
          case 4: return '#8b5cf6'; // Purple - RTK Fixed
          case 5: return '#3b82f6'; // Blue - RTK Float
          case 6: return '#94a3b8'; // Gray - DR
          default: return '#64748b';
      }
  };

  return (
    <div className="flex-1 w-full bg-slate-800 rounded-b-lg p-4 border border-slate-700 shadow-sm flex flex-col relative">
      <h3 className="text-slate-300 text-xs font-bold uppercase mb-2 flex items-center gap-2 flex-none">
        <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 3. Fix Quality (NMEA GGA)
      </h3>
      <div className="relative w-full flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} syncId="gnssSync">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="timestamp" 
              stroke="#94a3b8" 
              fontSize={12} 
              tick={{fontSize: 10}}
              minTickGap={30}
            />
            <YAxis 
              stroke="#94a3b8" 
              domain={[0, 6]} 
              tickCount={7}
              width={70}
              tickFormatter={(val) => getFixLabel(val)}
              fontSize={10}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(val: number) => [getFixLabel(val), "Quality"]}
            />
            {/* Main Line connecting points */}
            <Line 
              type="stepAfter" 
              dataKey="fixQuality" 
              stroke="#475569" 
              strokeWidth={1} 
              dot={false}
              name="Connection"
              activeDot={false}
            />
            {/* Colored Dots indicating status */}
            <Scatter dataKey="fixQuality" name="Status">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getFixColor(entry.fixQuality || 0)} />
              ))}
            </Scatter>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};