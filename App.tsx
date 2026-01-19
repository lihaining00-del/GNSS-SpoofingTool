import React, { useState, useCallback } from 'react';
import { parseGNSSLog } from './services/parser';
import { GNSSDataPoint } from './types';
import { DevicePanel } from './components/DevicePanel';

interface DeviceState {
  data: GNSSDataPoint[];
  msgCounts: Record<string, number>;
  fileName: string | null;
  isParsing: boolean;
}

const initialState: DeviceState = {
  data: [],
  msgCounts: {},
  fileName: null,
  isParsing: false
};

export default function App() {
  // State for 3 separate devices
  const [x20p, setX20p] = useState<DeviceState>(initialState);
  const [a7p, setA7p] = useState<DeviceState>(initialState);
  const [x5, setX5] = useState<DeviceState>(initialState);

  const handleUpload = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>, 
    setDeviceState: React.Dispatch<React.SetStateAction<DeviceState>>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDeviceState(prev => ({ ...prev, isParsing: true, fileName: file.name }));
    
    try {
      const result = await parseGNSSLog(file);
      setDeviceState({
        data: result.data,
        msgCounts: result.messageCounts,
        fileName: file.name,
        isParsing: false
      });
    } catch (error) {
      console.error("Parse error", error);
      setDeviceState(prev => ({ ...prev, isParsing: false }));
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-6 font-sans">
      <header className="max-w-[1600px] mx-auto mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 tracking-tight">
            GNSS Forensics Workbench
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Comparative Analysis: u-blox X20P vs Kisilicon A7P vs Mosaic X5
          </p>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto h-[calc(100vh-140px)]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            {/* Column 1: u-blox X20P */}
            <DevicePanel 
                title="u-blox X20P" 
                deviceType="X20P"
                data={x20p.data}
                fileName={x20p.fileName}
                msgCounts={x20p.msgCounts}
                isParsing={x20p.isParsing}
                onUpload={(e) => handleUpload(e, setX20p)}
            />

            {/* Column 2: Kisilicon A7P (NMEA) */}
            <DevicePanel 
                title="Kisilicon A7P" 
                deviceType="A7P"
                data={a7p.data}
                fileName={a7p.fileName}
                msgCounts={a7p.msgCounts}
                isParsing={a7p.isParsing}
                onUpload={(e) => handleUpload(e, setA7p)}
            />

            {/* Column 3: Septentrio Mosaic X5 */}
            <DevicePanel 
                title="Mosaic X5" 
                deviceType="X5"
                data={x5.data}
                fileName={x5.fileName}
                msgCounts={x5.msgCounts}
                isParsing={x5.isParsing}
                onUpload={(e) => handleUpload(e, setX5)}
            />
          </div>
      </main>
    </div>
  );
}
