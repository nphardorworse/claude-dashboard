import { useState, useCallback } from "react";

type AddHookFormProps = {
  availableEvents: string[];
  onSubmit: (data: {
    event: string;
    matcher: string;
    command: string;
    timeout?: number;
  }) => Promise<void>;
  onCancel: () => void;
};

export const AddHookForm = ({
  availableEvents,
  onSubmit,
  onCancel,
}: AddHookFormProps) => {
  const [event, setEvent] = useState(availableEvents[0] ?? "");
  const [matcher, setMatcher] = useState("*");
  const [command, setCommand] = useState("");
  const [timeoutStr, setTimeoutStr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEventChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setEvent(e.target.value);
    },
    []
  );

  const handleMatcherChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMatcher(e.target.value);
    },
    []
  );

  const handleCommandChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCommand(e.target.value);
    },
    []
  );

  const handleTimeoutChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTimeoutStr(e.target.value);
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!event || !command.trim()) {
        setError("Event and command are required");
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const timeout =
          timeoutStr.trim() !== "" ? parseInt(timeoutStr, 10) : undefined;

        if (timeout != null && isNaN(timeout)) {
          setError("Timeout must be a valid number");
          setIsSubmitting(false);
          return;
        }

        await onSubmit({
          event,
          matcher: matcher.trim() || "*",
          command: command.trim(),
          timeout,
        });

        setCommand("");
        setTimeoutStr("");
        setMatcher("*");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add hook");
      } finally {
        setIsSubmitting(false);
      }
    },
    [event, matcher, command, timeoutStr, onSubmit]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">
        Add New Hook
      </h3>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Event</label>
            <select
              value={event}
              onChange={handleEventChange}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-blue-500"
            >
              {availableEvents.map((evt) => (
                <option key={evt} value={evt}>
                  {evt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              Matcher
            </label>
            <input
              type="text"
              value={matcher}
              onChange={handleMatcherChange}
              placeholder="*"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              Command
            </label>
            <input
              type="text"
              value={command}
              onChange={handleCommandChange}
              placeholder="/path/to/script.sh"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">
              Timeout (ms)
            </label>
            <input
              type="number"
              value={timeoutStr}
              onChange={handleTimeoutChange}
              placeholder="optional"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !command.trim()}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Adding..." : "Add Hook"}
          </button>
        </div>
      </div>
    </form>
  );
};
