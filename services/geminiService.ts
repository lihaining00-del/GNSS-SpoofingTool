import { GoogleGenAI } from "@google/genai";
import { GNSSDataPoint } from "../types";

// Helper to calculate basic stats for the prompt
const calculateStats = (data: GNSSDataPoint[]) => {
  const cn0Values = data.map(d => d.avgCn0 || 0).filter(v => v > 0);
  const avgCn0 = cn0Values.length ? (cn0Values.reduce((a, b) => a + b, 0) / cn0Values.length).toFixed(1) : "N/A";
  
  const fixTypes = data.map(d => d.fixQuality);
  const fixQualityCounts = fixTypes.reduce((acc, curr) => {
    acc[curr || 0] = (acc[curr || 0] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return { avgCn0, fixQualityCounts, dataPoints: data.length };
};

export const analyzeLogWithGemini = async (
  rawLogSnippet: string,
  parsedData: GNSSDataPoint[]
): Promise<string> => {
  if (!process.env.API_KEY) {
    return "Error: API Key is missing. Please check your environment configuration.";
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const stats = calculateStats(parsedData);

  const prompt = `
    You are a world-class GNSS/GPS Forensics Expert. I have a u-blox GNSS log file.
    
    Here is a statistical summary of the parsed NMEA data:
    - Total Data Points: ${stats.dataPoints}
    - Average L1 C/N0 (Signal Strength): ${stats.avgCn0} dB-Hz
    - Fix Quality Counts (0=Invalid, 1=GPS, 2=DGPS, 4=RTK, etc): ${JSON.stringify(stats.fixQualityCounts)}
    
    Here is a snippet of the raw log file (first 50KB):
    \`\`\`
    ${rawLogSnippet.slice(0, 3000)}...
    \`\`\`

    Please analyze this data for signs of spoofing or signal anomalies. 
    1. Check for unrealistic C/N0 values (e.g., all satellites exactly equal or perfectly flat).
    2. Check for missing NMEA sentences that are usually present.
    3. Check for jumps in position or time (if evident in the snippet).
    4. Look for proprietary u-blox messages (UBX) that might indicate spoofing status (e.g., $GNTXT, spoofing detected).

    Provide a concise report in Markdown format.
    Structure:
    - **Overall Spoofing Confidence**: (Low/Medium/High)
    - **Signal Analysis**: Comments on C/N0.
    - **Anomalies Detected**: Specific observations.
    - **Recommendations**: What to check next.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 1024 } // Use a small thinking budget for deeper analysis of log patterns
      }
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return "Analysis failed due to an API error. Please try again.";
  }
};
