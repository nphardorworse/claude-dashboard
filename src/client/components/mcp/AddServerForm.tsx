import { useState, useCallback } from "react";
import { Button } from "~/client/components/ui/button";
import { Input } from "~/client/components/ui/input";

type AddServerFormProps = {
  onSubmit: (server: {
    name: string;
    command: string;
    args: string[];
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

export const AddServerForm = ({ onSubmit, onCancel }: AddServerFormProps) => {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsString, setArgsString] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedName = name.trim();
      const trimmedCommand = command.trim();

      if (!trimmedName) {
        setError("Server name is required");
        return;
      }
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
        setError(err instanceof Error ? err.message : "Failed to add server");
      } finally {
        setIsSubmitting(false);
      }
    },
    [name, command, argsString, onSubmit]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">
        Add MCP Server
      </h3>

      <div className="flex flex-col gap-3">
        <FormField
          label="Name"
          value={name}
          onChange={setName}
          placeholder="my-server"
        />
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
