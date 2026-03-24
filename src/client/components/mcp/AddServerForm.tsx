import { useState, useCallback } from "react";

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
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 ${isMonospace ? "font-mono" : ""}`}
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
        .split(",")
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
      className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
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
          label="Args (comma-separated)"
          value={argsString}
          onChange={setArgsString}
          placeholder="--port, 3000"
          isMonospace
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? "Adding..." : "Add Server"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
