import { GNSSDataPoint, ParseResult } from '../types';

export const parseGNSSLog = async (file: File): Promise<ParseResult> => {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const totalLength = arrayBuffer.byteLength;
  
  const dataPoints: GNSSDataPoint[] = [];
  const messageCounts: Record<string, number> = {};
  
  let currentEpoch: Partial<GNSSDataPoint> = {
    spoofingState: 0,
    secSigState: 0,
    gpsL1Cn0: 0,
    gpsTop3AvgCn0: 0,
    gpsTrackedCount: 0,
    satellitesUsed: 0
  };
  
  // State persistence
  let lastSecSigState = 0;
  let lastGpsL1Cn0 = 0;
  let lastFixType = 0;
  let lastGnssFixOK = false;
  let startTime = 0;
  let lastSbfTow = -1; // Track SBF Time of Week to handle epoch flushing
  
  // Buffer for GSV/SBF accumulation within a single epoch
  let currentEpochGpsSnrs: number[] = [];
  // Use a Set to track unique GPS satellites (PRN) to avoid double counting
  let currentEpochGpsSvs = new Set<number>(); // Tracked (GSV)
  let currentEpochGpsUsedSvs = new Set<number>(); // Used in Fix (GSA)

  const incrementMsgCount = (type: string) => {
    messageCounts[type] = (messageCounts[type] || 0) + 1;
  };

  // Helper to parse time from NMEA (hhmmss.ss)
  const parseNmeaTime = (timeStr: string) => {
    if (!timeStr || timeStr.length < 6) return 0;
    const hours = parseInt(timeStr.slice(0, 2));
    const minutes = parseInt(timeStr.slice(2, 4));
    const seconds = parseFloat(timeStr.slice(4));
    return hours * 3600 + minutes * 60 + seconds;
  };

  // Helper: Calculate Top 3 Avg CN0 for GPS
  const calculateTop3Avg = (snrs: number[]) => {
    if (snrs.length === 0) return 0;
    const sorted = snrs.sort((a, b) => b - a); // Descending
    const top3 = sorted.slice(0, 3);
    const sum = top3.reduce((a, b) => a + b, 0);
    return parseFloat((sum / top3.length).toFixed(1));
  };

  // Helper: Flush current epoch to dataPoints
  const flushEpoch = () => {
    if (currentEpoch.timeSeconds !== undefined) {
        const top3Avg = calculateTop3Avg(currentEpochGpsSnrs);
        
        // If we found specific GPS used satellites via GSA, use that count. 
        // Otherwise fallback to GGA total count (if GSA wasn't present or parsed).
        const gpsUsedCount = currentEpochGpsUsedSvs.size > 0 
            ? currentEpochGpsUsedSvs.size 
            : (currentEpoch.satellitesUsed || 0);

        const gpsTrackedCount = currentEpochGpsSvs.size;
        
        dataPoints.push({
          ...currentEpoch,
          secSigState: currentEpoch.secSigState || lastSecSigState, // Use current if set (from SBF), else last
          gpsL1Cn0: lastGpsL1Cn0 || currentEpoch.gpsL1Cn0,
          gpsTop3AvgCn0: top3Avg, 
          gpsTrackedCount: gpsTrackedCount, // GPS Tracked (In View)
          satellitesUsed: gpsUsedCount,     // GPS Used (In Fix)
          fixType: currentEpoch.fixType ?? lastFixType,
          gnssFixOK: currentEpoch.gnssFixOK ?? lastGnssFixOK
        } as GNSSDataPoint);

        // Update persistence
        if (currentEpoch.secSigState !== undefined) lastSecSigState = currentEpoch.secSigState;
        if (currentEpoch.gpsL1Cn0 !== undefined) lastGpsL1Cn0 = currentEpoch.gpsL1Cn0;
        if (currentEpoch.fixType !== undefined) lastFixType = currentEpoch.fixType;
        if (currentEpoch.gnssFixOK !== undefined) lastGnssFixOK = currentEpoch.gnssFixOK;
     }
     
     // Reset buffers
     currentEpochGpsSnrs = [];
     currentEpochGpsSvs.clear();
     currentEpochGpsUsedSvs.clear();

     // Prepare next epoch (retain some state if needed, or mostly clean)
     currentEpoch = {
        spoofingState: 0,
        secSigState: lastSecSigState,
        gpsL1Cn0: lastGpsL1Cn0,
        gpsTop3AvgCn0: 0,
        gpsTrackedCount: 0,
        satellitesUsed: 0,
        fixType: lastFixType,
        gnssFixOK: lastGnssFixOK
     };
  };

  let i = 0;
  let extractedText = "";
  const textLimit = 50000;

  while (i < totalLength) {
    const byte = uint8Array[i];

    // --- 1. NMEA Handling ($) ---
    if (byte === 0x24 && (i + 1 >= totalLength || uint8Array[i+1] !== 0x40)) { // Check it's NOT SBF ($@)
      let lineEnd = -1;
      for (let j = i + 1; j < Math.min(i + 500, totalLength); j++) {
        if (uint8Array[j] === 0x0A || uint8Array[j] === 0x0D) {
          lineEnd = j;
          break;
        }
      }

      if (lineEnd !== -1) {
        const lineBuffer = uint8Array.slice(i, lineEnd);
        const line = new TextDecoder().decode(lineBuffer).trim();
        
        if (extractedText.length < textLimit) extractedText += line + "\n";

        // Identify NMEA type
        const commaIdx = line.indexOf(',');
        if (commaIdx > 0) {
            const msgType = line.substring(0, commaIdx);
            incrementMsgCount(msgType); 
        }

        // --- GSA Parsing (DOP and Active Satellites) ---
        // Determines specifically which satellites are used in the fix
        if (line.includes('GSA')) {
            const parts = line.split('*')[0].split(',');
            // Format: $GPGSA,A,3,01,02,03,,,,,,,,,,3.5,2.1,1.8
            // Index 3 to 14 are PRNs
            if (parts.length > 3) {
                 for (let k = 3; k <= 14; k++) {
                     const prnStr = parts[k];
                     if (prnStr && prnStr !== '') {
                         const prn = parseInt(prnStr);
                         // GPS PRNs are 1-32. SBAS are 33-64 (often mapped to 120+). GLONASS 65-96.
                         // We strictly only count 1-32 for "GPS Used"
                         if (!isNaN(prn) && prn >= 1 && prn <= 32) {
                             currentEpochGpsUsedSvs.add(prn);
                         }
                     }
                 }
            }
        }

        // --- GSV Parsing (Satellites in View) ---
        // Support all standard Talkers, but FILTER for GPS.
        if (line.includes('GSV')) {
            const parts = line.split('*')[0].split(',');
            if (parts.length > 3) {
                const talker = parts[0].slice(1, 3); // GP, GN, GL, etc.
                
                // Groups of 4: PRN, El, Az, SNR starting at index 4
                // Field index: 0=ID, 1=TotMsgs, 2=MsgNum, 3=SatsInView, 4=PRN1...
                for (let k = 4; k < parts.length; k += 4) {
                    // Safety check to ensure we have a full block of 4
                    if (k + 3 >= parts.length) break;

                    const prn = parseInt(parts[k]);
                    const snr = parseInt(parts[k+3]);
                    
                    if (!isNaN(prn) && !isNaN(snr) && snr > 0) {
                        // FILTER: Only count GPS satellites.
                        // Talker GP is always GPS. 
                        // Talker GN with PRN 1-32 is GPS.
                        const isGPS = (talker === 'GP') || (talker === 'GN' && prn >= 1 && prn <= 32);

                        if (isGPS) {
                             currentEpochGpsSvs.add(prn);
                             currentEpochGpsSnrs.push(snr);
                        }
                    }
                }
            }
        }

        // --- GGA Parsing (Position & Time - Starts/Ends Epoch) ---
        // Uses split(',') instead of strict regex to handle empty fields (e.g. no fix)
        // Structure: $xxGGA,time,lat,NS,lon,EW,quality,numSV,HDOP,alt,altUnit...
        if (line.includes('GGA')) {
           const parts = line.split('*')[0].split(',');
           if (parts.length >= 10) {
              const timeStr = parts[1];
              
              // Only process if we have a valid time string
              if (timeStr && timeStr.length >= 6) {
                  // Finalize previous epoch
                  flushEpoch();

                  const latRaw = parseFloat(parts[2]);
                  const latDir = parts[3];
                  const lonRaw = parseFloat(parts[4]);
                  const lonDir = parts[5];
                  const fixQuality = parseInt(parts[6]);
                  // Note: GGA satsUsed is total satellites (GPS+GLO+GAL etc).
                  // We store it as a fallback, but GSA parsing will overwrite it with GPS-only count if available.
                  const satsUsedTotal = parseInt(parts[7]); 
                  const alt = parseFloat(parts[9]);

                  let lat = undefined;
                  let lon = undefined;

                  // Parse lat/lon only if valid numbers
                  if (!isNaN(latRaw) && !isNaN(lonRaw) && latDir && lonDir) {
                      const latDeg = Math.floor(latRaw / 100);
                      const latMin = latRaw % 100;
                      lat = (latDeg + latMin / 60) * (latDir === 'S' ? -1 : 1);
                      
                      const lonDeg = Math.floor(lonRaw / 100);
                      const lonMin = lonRaw % 100;
                      lon = (lonDeg + lonMin / 60) * (lonDir === 'W' ? -1 : 1);
                  }

                  const tSecs = parseNmeaTime(timeStr);
                  if (startTime === 0 && tSecs > 0) startTime = tSecs;

                  currentEpoch.timestamp = `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
                  currentEpoch.timeSeconds = startTime > 0 ? tSecs - startTime : 0;
                  currentEpoch.lat = lat;
                  currentEpoch.lon = lon;
                  currentEpoch.alt = isNaN(alt) ? undefined : alt;
                  currentEpoch.fixQuality = isNaN(fixQuality) ? 0 : fixQuality;
                  // Temporary store total, will be overridden by GSA logic in flushEpoch if GSA exists
                  currentEpoch.satellitesUsed = isNaN(satsUsedTotal) ? 0 : satsUsedTotal;
              }
           }
        }
        
        i = lineEnd + 1;
        continue;
      }
    }

    // --- 2. UBX Handling (0xB5 0x62) ---
    if (byte === 0xB5 && i + 1 < totalLength && uint8Array[i+1] === 0x62) {
      if (i + 6 <= totalLength) {
        const msgClass = uint8Array[i+2];
        const msgId = uint8Array[i+3];
        const len = uint8Array[i+4] + (uint8Array[i+5] << 8);

        if (i + 6 + len + 2 <= totalLength) {
          const payload = uint8Array.slice(i + 6, i + 6 + len);
          const msgKey = `UBX-0x${msgClass.toString(16).toUpperCase().padStart(2,'0')}-0x${msgId.toString(16).toUpperCase().padStart(2,'0')}`;
          
          let readableName = msgKey;
          if (msgClass === 0x01 && msgId === 0x07) readableName = "UBX-NAV-PVT";
          else if (msgClass === 0x01 && msgId === 0x43) readableName = "UBX-NAV-SIG";
          else if (msgClass === 0x27 && msgId === 0x09) readableName = "UBX-SEC-SIG";
          else if (msgClass === 0x01 && msgId === 0x03) readableName = "UBX-NAV-STATUS";
          
          incrementMsgCount(readableName);

          // A. UBX-SEC-SIG (0x27 0x09)
          if (msgClass === 0x27 && msgId === 0x09) {
             const version = payload[0];
             if (version === 2) {
               const flags = payload[1];
               const spfState = (flags >> 4) & 0x03;
               currentEpoch.secSigState = spfState;
             } else if (len >= 8 && version === 1) {
                   const spfState = payload[6];
                   currentEpoch.secSigState = spfState;
             }
          }

          // B. UBX-NAV-SIG (0x01 0x43)
          else if (msgClass === 0x01 && msgId === 0x43) {
             if (len >= 8) {
               const numSigs = payload[5];
               let l1CnoSum = 0;
               let l1Count = 0;
               for (let s = 0; s < numSigs; s++) {
                 const base = 8 + (s * 16);
                 if (base + 16 <= len) {
                   const gnssId = payload[base];
                   const sigId = payload[base + 1];
                   const cno = payload[base + 2];
                   if (gnssId === 0 && sigId === 0) {
                     l1CnoSum += cno;
                     l1Count++;
                   }
                 }
               }
               if (l1Count > 0) {
                 currentEpoch.gpsL1Cn0 = parseFloat((l1CnoSum / l1Count).toFixed(1));
               }
             }
          }

          // C. UBX-NAV-PVT (0x01 0x07)
          else if (msgClass === 0x01 && msgId === 0x07) {
             if (len >= 22) {
               const fixType = payload[20];
               const flags = payload[21];
               const gnssFixOK = (flags & 0x01) === 1;
               currentEpoch.fixType = fixType;
               currentEpoch.gnssFixOK = gnssFixOK;
             }
          }
          
          // D. UBX-NAV-STATUS
          else if (msgClass === 0x01 && msgId === 0x03) {
             if (len >= 16) {
               const flags2 = payload[13];
               const spoofDetState = (flags2 >> 3) & 0x03;
               currentEpoch.spoofingState = spoofDetState;
             }
          }

          i += 6 + len + 2; 
          continue;
        }
      }
    }

    // --- 3. SBF Handling ($@) ---
    // Header (8 bytes): Sync(2, $ @), CRC(2), ID(2), Length(2)
    // ID: Bits 0-12 Block Number, 13-15 Revision
    if (byte === 0x24 && i + 1 < totalLength && uint8Array[i+1] === 0x40) {
         if (i + 8 <= totalLength) {
             const idBytes = uint8Array.slice(i+4, i+6);
             const blockId = idBytes[0] | (idBytes[1] << 8);
             const blockNumber = blockId & 0x1FFF;
             
             const lenBytes = uint8Array.slice(i+6, i+8);
             const length = lenBytes[0] | (lenBytes[1] << 8);

             if (i + length <= totalLength) {
                 const payload = uint8Array.slice(i+8, i+length);
                 // Header is 8 bytes. Payload starts after header.
                 // Time stamps (TOW u4, WNc u2) are always first 6 bytes of payload for blocks with time.
                 
                 const tow = payload[0] | (payload[1] << 8) | (payload[2] << 16) | (payload[3] << 24);
                 
                 // If TOW changed and is valid, flush previous epoch
                 if (tow !== 4294967295) {
                    if (lastSbfTow !== -1 && tow !== lastSbfTow) {
                        flushEpoch();
                    }
                    lastSbfTow = tow;
                    
                    // Set timestamp from SBF if not already set by NMEA this epoch
                    if (!currentEpoch.timestamp) {
                         const tSecs = tow / 1000;
                         if (startTime === 0) startTime = tSecs;
                         currentEpoch.timeSeconds = tSecs - startTime;
                         const hours = Math.floor((tSecs % 86400) / 3600);
                         const mins = Math.floor((tSecs % 3600) / 60);
                         const secs = Math.floor(tSecs % 60);
                         currentEpoch.timestamp = `${hours.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
                    }
                 }

                 // SBF: RFStatus (4092)
                 if (blockNumber === 4092) {
                     incrementMsgCount("SBF-RFStatus");
                     // Offset in payload: TOW(4)+WNc(2)+N(1)+SBLen(1) = 8 bytes.
                     // Byte 8 is Flags.
                     if (payload.length > 8) {
                        const flags = payload[8];
                        const spoofing = (flags & 0x01) !== 0; // Bit 0
                        // Map to shared state: 1=Safe, 3=Confirmed Spoofing (Alert)
                        currentEpoch.secSigState = spoofing ? 3 : 1;
                     }
                 }
                 
                 // SBF: PVTGeodetic (4007)
                 else if (blockNumber === 4007) {
                     incrementMsgCount("SBF-PVTGeodetic");
                     // Payload: TOW(4)+WNc(2)+Mode(1)+Error(1) = 8 bytes.
                     // Lat (8 bytes, float64) at index 8
                     // Lon (8 bytes, float64) at index 16
                     // Height (8 bytes, float64) at index 24
                     if (payload.length >= 24) {
                        const latBuf = payload.slice(8, 16).buffer;
                        const lonBuf = payload.slice(16, 24).buffer;
                        // Need to ensure alignment or copy slice
                        const latVal = new Float64Array(latBuf)[0];
                        const lonVal = new Float64Array(lonBuf)[0];
                        
                        // -2e10 is Do-Not-Use
                        if (latVal > -1e10 && lonVal > -1e10) {
                            currentEpoch.lat = latVal * 180 / Math.PI; // SBF uses Radians
                            currentEpoch.lon = lonVal * 180 / Math.PI;
                            currentEpoch.fixQuality = 1; // Assume valid fix if position valid
                        }
                     }
                 }

                 // SBF: MeasEpoch (4027)
                 else if (blockNumber === 4027) {
                     incrementMsgCount("SBF-MeasEpoch");
                     // Parse GPS L1 C/N0
                     // Payload Header: TOW(4)+WNc(2)=6 bytes
                     // N1(1) @6, SB1Len(1) @7, SB2Len(1) @8, CommonFlags(1) @9
                     // CumClkJumps(1) @10, Reserved(1) @11
                     // Type1 Sub-blocks start @12
                     
                     if (payload.length > 12) {
                         const n1 = payload[6];
                         const sb1Len = payload[7];
                         const sb2Len = payload[8];
                         let ptr = 12;

                         for (let k = 0; k < n1; k++) {
                             if (ptr + 19 > payload.length) break;
                             
                             const type = payload[ptr+1];
                             const sigType = type & 0x1F; // Lower 5 bits
                             
                             // GPS L1CA is signal type 0
                             if (sigType === 0) {
                                 const cn0Raw = payload[ptr+15];
                                 if (cn0Raw !== 255) {
                                     // GPS L1CA (0) is "1 or 2"? No. 
                                     // Manual: "C/N0 = CN0*0.25 if signal number is 1 or 2" (GPS L1P, GPS L2P)
                                     // "C/N0 = CN0*0.25+10 otherwise"
                                     // So for Sig 0, it's *0.25 + 10
                                     const cn0Val = cn0Raw * 0.25 + 10;
                                     currentEpochGpsSnrs.push(cn0Val);
                                     
                                     const svid = payload[ptr+2];
                                     currentEpochGpsSvs.add(svid);
                                     
                                     // For SBF, if we are tracking it, we assume it's used if fix is valid for simplicity
                                     // or we can just count it as tracked. 
                                     // The user issue was specific to NMEA A7P "Used" count.
                                     // SBF PVTGeodetic has NrSV field, but we are in MeasEpoch here.
                                     // We will let SBF behave as is (Used = Tracked approximate or derived from PVT info if parsed)
                                     // Actually, let's keep SBF simple: Tracked = View. Used needs PVT block info.
                                     // PVTGeodetic has NrSV at byte 40 (TOW+WNc+Mode+Error+Lat+Lon+Alt+Undulation+Vn+Ve+Vu+COG+RxClkBias+RxClkDrift+TimeSystem+Datum+NrSV)
                                 }
                             }
                             
                             const n2 = payload[ptr+19];
                             ptr += sb1Len + (n2 * sb2Len);
                         }
                     }
                 }
                 
                 // SBF: PVTGeodetic (4007) - Extract NrSV
                 // Re-visiting 4007 to extract NrSV (Number of satellites used in PVT)
                 if (blockNumber === 4007 && payload.length >= 41) {
                     // Byte 40 is NrSV (u1)
                     // Header (8) + 40 = 48th byte in raw stream, or index 40 in payload array
                     const nrSv = payload[40];
                     if (nrSv !== 255) {
                         currentEpoch.satellitesUsed = nrSv;
                     }
                 }
                 
                 i += length;
                 continue;
             }
         }
    }

    i++;
  }

  // Push final epoch
  flushEpoch();

  return { data: dataPoints, rawText: extractedText, messageCounts };
};
