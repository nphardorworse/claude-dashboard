import { createReadStream } from "fs";
import { createInterface } from "readline";

/**
 * Yield each non-empty line of a .jsonl file, trimmed. Memory stays bounded to
 * one line regardless of file size. Throws if the file cannot be read.
 *
 * Never read a transcript whole (readFile + split): single sessions exceed
 * 1.5GB, and a few whole-file reads in parallel push the V8 heap past its
 * ~4GB limit and crash the server with OOM.
 */
export async function* readJsonlLines(filePath: string): AsyncGenerator<string> {
  const input = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed) yield trimmed;
    }
  } finally {
    rl.close();
    // Release the file handle now even when the consumer stopped early, so
    // the file can be renamed or deleted right away (Windows holds it open).
    input.destroy();
  }
}

/**
 * Stream a .jsonl file line by line, calling `onEntry` for each line that
 * parses as JSON. `onMalformed` is called for each non-empty line that is not
 * valid JSON. Returns false if the file could not be read.
 */
export const forEachJsonlEntry = async <T>(
  filePath: string,
  onEntry: (entry: T) => void,
  onMalformed?: () => void,
): Promise<boolean> => {
  try {
    for await (const line of readJsonlLines(filePath)) {
      let entry: T;
      try {
        entry = JSON.parse(line);
      } catch {
        onMalformed?.();
        continue;
      }
      onEntry(entry);
    }
    return true;
  } catch {
    return false;
  }
};
