import { useState, useCallback } from "react";
import { Button } from "~/client/components/ui/button";
import { Input } from "~/client/components/ui/input";

type ServerMode = "command" | "url";

type AddServerFormProps = {
  onSubmit: (server: {
    name: string;
    command?: string;
    url?: string;
    args?: string[];
  }) => Promise<void>;
  onCancel: () => void;
};

const FormField = ({
  label,
  value,
  onChange,
  placeholder,
  isMonospace,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  isMonospace?: boolean;
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-400">
        {label}
      </label>
      <Input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={isMonospace ? "font-mono" : ""}
      />
    </div>
  );
};

const ModeToggle = ({
  mode,
  onChange,
}: {
  mode: ServerMode;
  onChange: (mode: ServerMode) => void;
}) => (
  <div className="mb-3 flex gap-1 rounded-md bg-zinc-800/50 p-0.5">
    {(["command", "url"] as const).map((m) => (
      <button
        key={m}
        type="button"
        onClick={() => onChange(m)}
        className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
          mode === m
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        {m === "command" ? "Command" : "URL"}
      </button>
    ))}
  </div>
);

export const AddServerForm = ({ onSubmit, onCancel }: AddServerFormProps) => {
  const [mode, setMode] = useState<ServerMode>("command");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsString, setArgsString] = useState("");
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setError("Server name is required");
        return;
      }

      if (mode === "command") {
        const trimmedCommand = command.trim();
        if (!trimmedCommand) {
          setError("Command is required");
          return;
        }
        const args = argsString
          .split(/\s+/)
          .map((a) => a.trim())
          .filter((a) => a.length > 0);

        setIsSubmitting(true);
        try {
          await onSubmit({ name: trimmedName, command: trimmedCommand, args });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to add server"
          );
        } finally {
          setIsSubmitting(false);
        }
      } else {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) {
          setError("URL is required");
          return;
        }

        setIsSubmitting(true);
        try {
          await onSubmit({ name: trimmedName, url: trimmedUrl });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Failed to add server"
          );
        } finally {
          setIsSubmitting(false);
        }
      }
    },
    [name, mode, command, argsString, url, onSubmit]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">
        Add MCP Server
      </h3>

      <ModeToggle mode={mode} onChange={setMode} />

      <div className="flex flex-col gap-3">
        <FormField
          label="Name"
          value={name}
          onChange={setName}
          placeholder="my-server"
        />
        {mode === "command" ? (
          <>
            <FormField
              label="Command"
              value={command}
              onChange={setCommand}
              placeholder="npx -y @some/mcp-server"
              isMonospace
            />
            <FormField
              label="Args (space-separated)"
              value={argsString}
              onChange={setArgsString}
              placeholder="--port 3000"
              isMonospace
            />
          </>
        ) : (
          <FormField
            label="URL"
            value={url}
            onChange={setUrl}
            placeholder="http://127.0.0.1:9000/mcp"
            isMonospace
          />
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Adding..." : "Add Server"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
