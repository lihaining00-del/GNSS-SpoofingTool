import { ParseResult } from '../types';

export const parseGNSSLog = async (file: File): Promise<ParseResult> => {
  return new Promise(async (resolve, reject) => {
    try {
      // Create a worker instance
      // Using new URL(..., import.meta.url) is the standard ESM way to load workers
      const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), {
        type: 'module'
      });

      worker.onmessage = (e) => {
        resolve(e.data);
        worker.terminate(); // Cleanup after task
      };

      worker.onerror = (err) => {
        console.error("Worker error:", err);
        reject(err);
        worker.terminate();
      };

      // Read file as ArrayBuffer to transfer to worker
      const arrayBuffer = await file.arrayBuffer();
      
      // Post message with Zero-Copy transfer
      worker.postMessage({ buffer: arrayBuffer }, [arrayBuffer]);
      
    } catch (err) {
      reject(err);
    }
  });
};