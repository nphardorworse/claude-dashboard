import { useState, useEffect, useCallback } from "react";
import { apiFetch, buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { useToast } from "../shared/use-toast";
import { Button } from "~/client/components/ui/button";
import { PageShell } from "../layout/PageShell";
import { ScopeBanner } from "../shared/ScopeBanner";
import { ProfileCard } from "./ProfileCard";
import { ProfileEditor } from "./ProfileEditor";
import type { ProfileEntry, HooksMap } from "../../../shared/types";

type ProfilesResponse = {
  profiles: ProfileEntry[];
  activeProfile: string | null;
  error?: string;
};

type EditorState =
  | { kind: "closed" }
  | {
      kind: "create";
      prefill?: {
        plugins: Record<string, boolean>;
        skills: Record<string, boolean>;
        hooks: HooksMap;
        enabledMcpServers: string[];
        disabledMcpServers: string[];
      };
    }
  | { kind: "edit"; profile: ProfileEntry };

/* ─── Sub-components ──────────────────────────── */

const ActiveSummary = ({
  activeProfile,
  activeEntry,
}: {
  activeProfile: string | null;
  activeEntry: ProfileEntry | null;
}) => {
  if (activeProfile == null || !activeEntry) {
    return <p className="text-sm text-zinc-400">Active: Custom configuration</p>;
  }

  const parts = [`${activeEntry.pluginCount} plugins`];
  if (activeEntry.skillCount > 0) parts.push(`${activeEntry.skillCount} skills`);
  if (activeEntry.hookEventCount > 0) parts.push(`${activeEntry.hookEventCount} hooks`);
  if (activeEntry.mcpServerCount > 0) parts.push(`${activeEntry.mcpServerCount} MCP`);

  return (
    <p className="text-sm text-zinc-400">
      Active: {activeProfile} ({parts.join(", ")})
    </p>
  );
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
  onEdit: (profile: ProfileEntry) => void;
  onDelete: (name: string) => Promise<void>;
}) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {profiles.map((profile) => (
      <ProfileCard
        key={profile.name}
        name={profile.name}
        description={profile.description}
        pluginCount={profile.pluginCount}
        skillCount={profile.skillCount}
        hookEventCount={profile.hookEventCount}
        mcpServerCount={profile.mcpServerCount}
        plugins={profile.plugins}
        skills={profile.skills}
        hooks={profile.hooks}
        enabledMcpServers={profile.enabledMcpServers}
        disabledMcpServers={profile.disabledMcpServers}
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
        const res = await apiFetch(url, {
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
        const res = await apiFetch(`/api/profiles/${encodeURIComponent(name)}`, {
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
    async (
      name: string,
      description: string,
      plugins: Record<string, boolean>,
      skills: Record<string, boolean>,
      hooks: HooksMap,
      enabledMcpServers: string[],
      disabledMcpServers: string[]
    ) => {
      const exists = profiles.some((p) => p.name === name);
      if (exists) {
        throw new Error(`Profile "${name}" already exists`);
      }

      const url = buildScopedUrl("/api/profiles", projectPath);
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, description, plugins, skills, hooks,
          enabledMcpServers, disabledMcpServers,
        }),
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
    async (
      name: string,
      description: string,
      plugins: Record<string, boolean>,
      skills: Record<string, boolean>,
      hooks: HooksMap,
      enabledMcpServers: string[],
      disabledMcpServers: string[]
    ) => {
      const res = await apiFetch(`/api/profiles/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description, plugins, skills, hooks,
          enabledMcpServers, disabledMcpServers,
        }),
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
    try {
      const [pluginsRes, skillsRes, hooksRes, mcpRes] = await Promise.all([
        fetch(buildScopedUrl("/api/plugins", projectPath)),
        fetch(buildScopedUrl("/api/skills", projectPath)),
        fetch(buildScopedUrl("/api/hooks", projectPath)),
        fetch(buildScopedUrl("/api/mcp/catalog", projectPath)),
      ]);

      const pluginsData = pluginsRes.ok ? await pluginsRes.json() : { plugins: [] };
      const skillsData = skillsRes.ok ? await skillsRes.json() : { skills: [] };
      const hooksData = hooksRes.ok ? await hooksRes.json() : { hooks: {} };
      const mcpData = mcpRes.ok ? await mcpRes.json() : { groups: [] };

      const plugins: Record<string, boolean> = {};
      for (const p of pluginsData.plugins ?? []) {
        if (p.enabled) plugins[p.id] = true;
      }

      const skills: Record<string, boolean> = {};
      for (const s of skillsData.skills ?? []) {
        if (s.enabled) skills[s.id] = true;
      }

      const enabledMcpServers: string[] = [];
      const disabledMcpServers: string[] = [];
      for (const group of mcpData.groups ?? []) {
        for (const entry of group.entries ?? []) {
          if (group.origin === "global-disabled") {
            disabledMcpServers.push(entry.name);
          } else {
            // All other origins (global, plugin, project, personal) are active
            enabledMcpServers.push(entry.name);
          }
        }
      }

      setEditor({
        kind: "create",
        prefill: { plugins, skills, hooks: hooksData.hooks ?? {}, enabledMcpServers, disabledMcpServers },
      });
    } catch {
      setEditor({ kind: "create" });
    }
  }, [projectPath]);

  const handleOpenEdit = useCallback((profile: ProfileEntry) => {
    setEditor({ kind: "edit", profile });
  }, []);

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
    const emptyPrefill = {
      plugins: {} as Record<string, boolean>,
      skills: {} as Record<string, boolean>,
      hooks: {} as HooksMap,
      enabledMcpServers: [] as string[],
      disabledMcpServers: [] as string[],
    };
    const prefill = editor.kind === "create"
      ? (editor.prefill ?? emptyPrefill)
      : emptyPrefill;

    return (
      <PageShell title={pageTitle}>
        <ProfileEditor
          key={isEdit ? editor.profile.name : "create"}
          mode={isEdit ? "edit" : "create"}
          projectPath={projectPath}
          initialName={isEdit ? editor.profile.name : ""}
          initialDescription={isEdit ? editor.profile.description : ""}
          initialPlugins={isEdit ? editor.profile.plugins : prefill.plugins}
          initialSkills={isEdit ? editor.profile.skills : prefill.skills}
          initialHooks={isEdit ? editor.profile.hooks : prefill.hooks}
          initialEnabledMcpServers={isEdit ? editor.profile.enabledMcpServers : prefill.enabledMcpServers}
          initialDisabledMcpServers={isEdit ? editor.profile.disabledMcpServers : prefill.disabledMcpServers}
          onSave={isEdit ? handleUpdateProfile : handleCreateProfile}
          onCancel={handleCloseEditor}
        />
      </PageShell>
    );
  }

  const activeEntry = profiles.find((p) => p.isActive) ?? null;

  return (
    <PageShell title={pageTitle}>
      <div className="flex flex-col gap-6">
        <ScopeBanner projectPath={projectPath} configType="plugins" onClear={onClearProject} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <ActiveSummary
            activeProfile={activeProfile}
            activeEntry={activeEntry}
          />

          <div className="flex gap-2">
            <Button
              onClick={handleOpenCreate}
            >
              <PlusIcon />
              New Profile
            </Button>
            <Button
              onClick={handleSaveCurrent}
              variant="secondary"
              title="Snapshot current settings into a new profile"
            >
              <SnapshotIcon />
              Save Current
            </Button>
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
