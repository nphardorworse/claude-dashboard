import { useState, useEffect, useCallback } from "react";
import { buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { useToast } from "../shared/Toast";
import { PageShell } from "../layout/PageShell";
import { ScopeBanner } from "../shared/ScopeBanner";
import { ProfileCard } from "./ProfileCard";
import { ProfileEditor } from "./ProfileEditor";

type ProfileEntry = {
  name: string;
  description: string;
  pluginCount: number;
  plugins: Record<string, boolean>;
  isActive: boolean;
};

type ProfilesResponse = {
  profiles: ProfileEntry[];
  activeProfile: string | null;
  error?: string;
};

type EditorState =
  | { kind: "closed" }
  | { kind: "create"; prefill?: Record<string, boolean> }
  | { kind: "edit"; profile: ProfileEntry };

/* ─── Sub-components ──────────────────────────── */

const ActiveSummary = ({
  activeProfile,
  pluginCount,
}: {
  activeProfile: string | null;
  pluginCount: number | null;
}) => {
  const label =
    activeProfile != null
      ? `Active: ${activeProfile} (${pluginCount} plugins)`
      : "Active: Custom configuration";

  return <p className="text-sm text-zinc-400">{label}</p>;
};

const ProfileGrid = ({
  profiles,
  switchingName,
  onActivate,
  onEdit,
  onDelete,
}: {
  profiles: ProfileEntry[];
  switchingName: string | null;
  onActivate: (name: string) => void;
  onEdit: (name: string, description: string, plugins: Record<string, boolean>) => void;
  onDelete: (name: string) => Promise<void>;
}) => (
  <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
    {profiles.map((profile) => (
      <ProfileCard
        key={profile.name}
        name={profile.name}
        description={profile.description}
        pluginCount={profile.pluginCount}
        plugins={profile.plugins}
        isActive={profile.isActive}
        isSwitching={switchingName === profile.name}
        onActivate={onActivate}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ))}
  </div>
);

/* ─── Action buttons ──────────────────────────── */

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SnapshotIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/* ─── Page ────────────────────────────────────── */

type ProfilesPageProps = {
  projectPath?: string | null;
  onClearProject?: () => void;
};

export const ProfilesPage = ({ projectPath = null, onClearProject }: ProfilesPageProps) => {
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingName, setSwitchingName] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({ kind: "closed" });
  const { toast } = useToast();

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = buildScopedUrl("/api/profiles", projectPath);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: ProfilesResponse = await res.json();
      if (data.error) throw new Error(data.error);

      setProfiles(data.profiles);
      setActiveProfile(data.activeProfile);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  /* ─── Handlers ──────────────────────────────── */

  const handleActivate = useCallback(
    async (name: string) => {
      setSwitchingName(name);
      try {
        const url = buildScopedUrl("/api/profiles/switch", projectPath);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileName: name }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast(`Switched to "${name}"`, "success");
        await fetchProfiles();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to switch", "error");
      } finally {
        setSwitchingName(null);
      }
    },
    [fetchProfiles, projectPath, toast]
  );

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        toast(`Deleted "${name}"`, "success");
        await fetchProfiles();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to delete", "error");
      }
    },
    [fetchProfiles, toast]
  );

  const handleCreateProfile = useCallback(
    async (name: string, description: string, plugins: Record<string, boolean>) => {
      // Client-side duplicate check
      const exists = profiles.some((p) => p.name === name);
      if (exists) {
        throw new Error(`Profile "${name}" already exists`);
      }

      const url = buildScopedUrl("/api/profiles", projectPath);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, plugins }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast(`Created "${name}"`, "success");
      setEditor({ kind: "closed" });
      await fetchProfiles();
    },
    [fetchProfiles, projectPath, toast, profiles]
  );

  const handleUpdateProfile = useCallback(
    async (name: string, description: string, plugins: Record<string, boolean>) => {
      const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, plugins }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast(`Updated "${name}"`, "success");
      setEditor({ kind: "closed" });
      await fetchProfiles();
    },
    [fetchProfiles, toast]
  );

  const handleOpenCreate = useCallback(() => {
    setEditor({ kind: "create" });
  }, []);

  const handleSaveCurrent = useCallback(async () => {
    // Fetch current effective plugins and pre-fill the editor
    try {
      const url = buildScopedUrl("/api/plugins", projectPath);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const plugins: Record<string, boolean> = {};
      for (const p of data.plugins ?? []) {
        if (p.enabled) plugins[p.id] = true;
      }
      setEditor({ kind: "create", prefill: plugins });
    } catch {
      // Fallback: open blank editor
      setEditor({ kind: "create" });
    }
  }, [projectPath]);

  const handleOpenEdit = useCallback(
    (name: string, description: string, plugins: Record<string, boolean>) => {
      setEditor({
        kind: "edit",
        profile: {
          name,
          description,
          plugins,
          pluginCount: Object.values(plugins).filter(Boolean).length,
          isActive: false,
        },
      });
    },
    []
  );

  const handleCloseEditor = useCallback(() => {
    setEditor({ kind: "closed" });
  }, []);

  /* ─── Render ────────────────────────────────── */

  const pageTitle = projectPath
    ? `Profiles (${getProjectDisplayName(projectPath)})`
    : "Profiles";

  if (isLoading) {
    return (
      <PageShell title={pageTitle}>
        <p className="text-sm text-zinc-500">Loading profiles...</p>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title={pageTitle}>
        <p className="text-sm text-red-400">{error}</p>
      </PageShell>
    );
  }

  // Show editor full-page when open
  if (editor.kind !== "closed") {
    const isEdit = editor.kind === "edit";
    const prefill = editor.kind === "create" ? (editor.prefill ?? {}) : {};
    return (
      <PageShell title={pageTitle}>
        <ProfileEditor
          key={isEdit ? editor.profile.name : "create"}
          mode={isEdit ? "edit" : "create"}
          projectPath={projectPath}
          initialName={isEdit ? editor.profile.name : ""}
          initialDescription={isEdit ? editor.profile.description : ""}
          initialPlugins={isEdit ? editor.profile.plugins : prefill}
          onSave={isEdit ? handleUpdateProfile : handleCreateProfile}
          onCancel={handleCloseEditor}
        />
      </PageShell>
    );
  }

  const activeEntry = profiles.find((p) => p.isActive);
  const activePluginCount = activeEntry?.pluginCount ?? null;

  return (
    <PageShell title={pageTitle}>
      <div className="flex flex-col gap-6">
        <ScopeBanner projectPath={projectPath} configType="plugins" onClear={onClearProject} />

        <div className="flex items-center justify-between">
          <ActiveSummary
            activeProfile={activeProfile}
            pluginCount={activePluginCount}
          />

          <div className="flex gap-2">
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-snappy hover:bg-blue-500"
            >
              <PlusIcon />
              New Profile
            </button>
            <button
              onClick={handleSaveCurrent}
              className="flex items-center gap-2 rounded-lg bg-[var(--overlay-subtle)] px-4 py-2 text-sm font-medium text-zinc-300 ring-1 ring-[var(--border-hairline)] transition-snappy hover:bg-[var(--overlay-medium)]"
              title="Snapshot current settings into a new profile"
            >
              <SnapshotIcon />
              Save Current
            </button>
          </div>
        </div>

        <ProfileGrid
          profiles={profiles}
          switchingName={switchingName}
          onActivate={handleActivate}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
        />
      </div>
    </PageShell>
  );
};
