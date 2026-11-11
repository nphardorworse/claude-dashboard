import { createReadStream } from "fs";
import { createInterface } from "readline";

/**
 * Stream a .jsonl file line by line, calling `onEntry` for each line that
 * parses as JSON. Memory stays bounded to one line regardless of file size.
 *
 * Never read a transcript whole (readFile + split): single sessions exceed
 * 1.5GB, and a few whole-file reads in parallel push the V8 heap past its
 * ~4GB limit and crash the server with OOM.
 *
 * Returns false if the file could not be read.
 */
export const forEachJsonlEntry = async <T>(
  filePath: string,
  onEntry: (entry: T) => void,
): Promise<boolean> => {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let entry: T;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      onEntry(entry);
    }
    return true;
  } catch {
    return false;
  } finally {
    rl.close();
  }
};
