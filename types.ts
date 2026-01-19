export interface GNSSDataPoint {
  timestamp: string; // HH:MM:SS
  timeSeconds: number; // Seconds since start
  lat?: number;
  lon?: number;
  alt?: number;
  fixQuality?: number; // From NMEA
  satellitesUsed?: number; // From GGA
  gpsTrackedCount?: number; // Count of GPS SVs in view (GSV)
  
  // Signal Analysis
  avgCn0?: number; // Average Signal-to-Noise
  gpsL1Cn0?: number; // Specific GPS L1 Average from UBX-NAV-SIG
  gpsTop3AvgCn0?: number; // Avg of Top 3 Max CN0 GPS satellites (from GSV)
  maxCn0?: number;
  
  // Security & Status
  spoofingState?: number; // 0: Unknown, 1: No Spoofing, 2: Spoofing!, 3: Multiple (from NAV-STATUS)
  secSigState?: number; // 0: Unknown, 1: No Spoofing, 2: Indicated, 3: Confirmed (from SEC-SIG)
  
  // PVT Details
  fixType?: number; // 0=NoFix, 2=2D, 3=3D, 4=GNSS+DR, 5=Time
  gnssFixOK?: boolean; // Bit 0 of flags in NAV-PVT
}

export interface SatelliteInfo {
  prn: string;
  elevation: number;
  azimuth: number;
  snr: number; // C/N0
  system: 'GPS' | 'GLONASS' | 'Galileo' | 'BeiDou' | 'Unknown';
}

export interface ParseResult {
  data: GNSSDataPoint[];
  rawText: string;
  messageCounts: Record<string, number>;
}

export interface LogAnalysisSummary {
  fileName: string;
  startTime: string;
  endTime: string;
  totalDuration: string;
  totalEpochs: number;
  avgL1CN0: number;
  spoofingIndicators: {
    label: string;
    detected: boolean;
    confidence: number; // 0-100
    details: string;
  }[];
  positions: { lat: number; lon: number }[];
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  PARSING = 'PARSING',
  ANALYZING_AI = 'ANALYZING_AI',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}
