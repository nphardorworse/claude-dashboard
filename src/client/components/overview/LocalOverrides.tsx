import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "../../lib/api";
import { useToast } from "../shared/use-toast";
import { XIcon } from "../shared/NavIcons";
import { Button } from "~/client/components/ui/button";
import { Input } from "~/client/components/ui/input";

type LocalSettings = {
  permissions?: { allow?: string[] };
  [key: string]: unknown;
};

const fetchLocalSettings = async (): Promise<LocalSettings> => {
  const res = await fetch("/api/config/global-local");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const savePermissions = async (allow: string[]): Promise<void> => {
  const res = await apiFetch("/api/config/global-local/permissions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allow }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

type PermissionItemProps = {
  permission: string;
  onRemove: (perm: string) => void;
};

const PermissionItem = ({ permission, onRemove }: PermissionItemProps) => {
  const handleRemove = useCallback(() => onRemove(permission), [onRemove, permission]);

  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] px-3 py-1.5">
      <span className="font-mono text-xs text-zinc-300">{permission}</span>
      <Button variant="ghost" size="icon-xs" onClick={handleRemove} title="Remove">
        <XIcon size={12} />
      </Button>
    </div>
  );
};

export const LocalOverrides = () => {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [editedPermissions, setEditedPermissions] = useState<string[]>([]);
  const [newPerm, setNewPerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await fetchLocalSettings();
      const perms = data.permissions?.allow ?? [];
      setPermissions(perms);
      setEditedPermissions(perms);
    } catch {
      // Silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemove = useCallback((perm: string) => {
    setEditedPermissions((prev) => prev.filter((p) => p !== perm));
  }, []);

  const handleAdd = useCallback(() => {
    const trimmed = newPerm.trim();
    if (!trimmed || editedPermissions.includes(trimmed)) return;
    setEditedPermissions((prev) => [...prev, trimmed]);
    setNewPerm("");
  }, [newPerm, editedPermissions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
    },
    [handleAdd]
  );

  const handleNewPermChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setNewPerm(e.target.value),
    []
  );

  const hasChanges = useMemo(() => {
    if (editedPermissions.length !== permissions.length) return true;
    return editedPermissions.some((p, i) => p !== permissions[i]);
  }, [editedPermissions, permissions]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await savePermissions(editedPermissions);
      setPermissions(editedPermissions);
      toast("Global permissions saved", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setIsSaving(false);
    }
  }, [editedPermissions, toast]);

  if (isLoading) return null;

  return (
    <div className="rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--border-hairline)] p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">
            Global Local Overrides
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            ~/.claude/settings.local.json — machine-specific, gitignored
          </p>
        </div>
        {hasChanges && (
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium text-zinc-400">Allowed Permissions</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {editedPermissions.map((perm) => (
            <PermissionItem key={perm} permission={perm} onRemove={handleRemove} />
          ))}
          {editedPermissions.length === 0 && (
            <p className="py-1 text-xs text-zinc-500">No permissions configured</p>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <Input
            type="text"
            value={newPerm}
            onChange={handleNewPermChange}
            onKeyDown={handleKeyDown}
            placeholder="e.g. Bash(npm run *)"
            className="flex-1 font-mono text-xs"
          />
          <Button variant="secondary" size="sm" className="shrink-0" onClick={handleAdd} disabled={!newPerm.trim()}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
};
