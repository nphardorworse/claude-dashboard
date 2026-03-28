import { useState, useCallback } from "react";
import { Button } from "~/client/components/ui/button";
import { Card, CardContent } from "~/client/components/ui/card";
import { Input } from "~/client/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/client/components/ui/select";

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
    (value: string) => {
      setEvent(value);
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
          timeoutStr.trim() !== "" ? Number(timeoutStr.trim()) : undefined;

        if (timeout != null && (!Number.isFinite(timeout) || !Number.isInteger(timeout) || timeout <= 0)) {
          setError("Timeout must be a positive integer");
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
    <Card>
      <form onSubmit={handleSubmit}>
        <CardContent className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">
        Add New Hook
      </h3>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="hook-event-select" className="mb-1 block text-xs text-zinc-400">Event</label>
            <Select value={event} onValueChange={handleEventChange}>
              <SelectTrigger id="hook-event-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {availableEvents.map((evt) => (
                    <SelectItem key={evt} value={evt}>
                      {evt}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="hook-matcher" className="mb-1 block text-xs text-zinc-400">
              Matcher
            </label>
            <Input
              id="hook-matcher"
              type="text"
              value={matcher}
              onChange={handleMatcherChange}
              placeholder="*"
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <div>
            <label htmlFor="hook-command" className="mb-1 block text-xs text-zinc-400">
              Command
            </label>
            <Input
              id="hook-command"
              type="text"
              value={command}
              onChange={handleCommandChange}
              placeholder="/path/to/script.sh"
              className="font-mono"
            />
          </div>

          <div>
            <label htmlFor="hook-timeout" className="mb-1 block text-xs text-zinc-400">
              Timeout (ms)
            </label>
            <Input
              id="hook-timeout"
              type="number"
              value={timeoutStr}
              onChange={handleTimeoutChange}
              placeholder="optional"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !command.trim()}
          >
            {isSubmitting ? "Adding..." : "Add Hook"}
          </Button>
        </div>
      </div>
        </CardContent>
      </form>
    </Card>
  );
};
