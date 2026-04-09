import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SessionMeta,
  SessionsResponse,
  SnapshotDetailResponse,
  SnapshotListResponse,
  SnapshotMeta,
  TranscriptResponse,
} from "../../../shared/types";
import { apiFetch, buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { PageShell } from "../layout/PageShell";
import { Button } from "~/client/components/ui/button";
import { Card, CardContent } from "~/client/components/ui/card";
import { Input } from "~/client/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/client/components/ui/tabs";
import { GlobeIcon, FolderIcon, XIcon } from "../shared/NavIcons";
import { SessionPicker } from "./SessionPicker";
import { TranscriptView } from "./TranscriptView";
import type { TranscriptFilter, TranscriptOrder } from "./TranscriptView";
import { SnapshotPicker } from "./SnapshotPicker";

type TranscriptsPageProps = {
  projectPath?: string | null;
  onClearProject?: () => void;
};

type TranscriptTab = "live" | "snapshots";

const fetchSessions = async (
  projectPath: string | null,
): Promise<SessionMeta[]> => {
  const url = buildScopedUrl("/api/sessions", projectPath);
  const res = await apiFetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data: SessionsResponse = await res.json();
  return data.sessions;
};

const fetchTranscript = async (
  sessionId: string,
  projectPath: string | null,
): Promise<TranscriptResponse> => {
  const url = buildScopedUrl(
    `/api/transcripts/session/${encodeURIComponent(sessionId)}`,
    projectPath,
  );
  const res = await apiFetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
};

const fetchSnapshots = async (
  projectPath: string | null,
): Promise<SnapshotMeta[]> => {
  const url = buildScopedUrl("/api/transcripts/snapshots", projectPath);
  const res = await apiFetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data: SnapshotListResponse = await res.json();
  return data.snapshots;
};

const fetchSnapshotDetail = async (
  snapshotId: string,
): Promise<SnapshotDetailResponse> => {
  const res = await apiFetch(
    `/api/transcripts/snapshots/${encodeURIComponent(snapshotId)}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
};

const saveSnapshot = async (
  sessionId: string,
  projectPath: string,
  note: string,
  conversationOnly: boolean,
): Promise<SnapshotMeta> => {
  const res = await apiFetch("/api/transcripts/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, projectPath, note, conversationOnly }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { meta: SnapshotMeta };
  return data.meta;
};

const deleteSnapshot = async (snapshotId: string): Promise<void> => {
  const res = await apiFetch(
    `/api/transcripts/snapshots/${encodeURIComponent(snapshotId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
};

const importSnapshot = async (file: File): Promise<SnapshotMeta> => {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "Selected file is not valid JSON. Please pick a snapshot file exported from this dashboard.",
    );
  }
  const res = await apiFetch("/api/transcripts/snapshots/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { meta: SnapshotMeta };
  return data.meta;
};

type SpawnResult = {
  sessionId: string;
  command: string;
};

const spawnSession = async (snapshotId: string): Promise<SpawnResult> => {
  const res = await apiFetch(
    `/api/transcripts/snapshots/${encodeURIComponent(snapshotId)}/spawn`,
    { method: "POST" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<SpawnResult>;
};

// ─── Scope banner ──────────────────────────────────────────

type ScopeBannerProps = {
  projectPath: string | null;
  onClear?: () => void;
};

const TranscriptsScopeBanner = ({ projectPath, onClear }: ScopeBannerProps) => {
  const name = getProjectDisplayName(projectPath);

  if (!name) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-[var(--overlay-subtle)] px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">
            <GlobeIcon />
          </span>
          <span className="text-xs font-medium text-zinc-400">Global</span>
        </div>
        <span className="font-mono text-xs text-zinc-500">
          showing all sessions across projects
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-blue-500/10 px-4 py-2 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]">
      <div className="flex items-center gap-2">
        <span className="text-blue-400">
          <FolderIcon />
        </span>
        <span className="text-xs font-medium text-blue-300">{name}</span>
        <span className="text-xs text-blue-400/60">project sessions only</span>
      </div>
      {onClear && (
        <button
          onClick={onClear}
          className="relative ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-blue-400/60 transition-snappy hover:bg-blue-400/10 hover:text-blue-300 active:scale-[0.96]"
          title="Return to global view"
        >
          <XIcon size={12} />
        </button>
      )}
    </div>
  );
};

// ─── Main component ────────────────────────────────────────

export const TranscriptsPage = ({
  projectPath = null,
  onClearProject,
}: TranscriptsPageProps) => {
  const [tab, setTab] = useState<TranscriptTab>("live");

  // Live sessions
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionMeta | null>(
    null,
  );
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  // Filter / order (shared across live and snapshot views)
  const [filter, setFilter] = useState<TranscriptFilter>("all");
  const [order, setOrder] = useState<TranscriptOrder>("asc");

  // Snapshot save state
  const [snapshotNote, setSnapshotNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Snapshots tab
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotMeta | null>(
    null,
  );
  const [snapshotTranscript, setSnapshotTranscript] =
    useState<TranscriptResponse | null>(null);
  const [snapshotDetailLoading, setSnapshotDetailLoading] = useState(false);
  const [snapshotDetailError, setSnapshotDetailError] = useState<string | null>(
    null,
  );

  // Per-action errors for snapshot operations — shown inline near each action
  // so they don't blank out the snapshot list in the sidebar.
  const [actionError, setActionError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [spawnMessage, setSpawnMessage] = useState<string | null>(null);

  // Import file input ref
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // ── Load sessions on scope change ──

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const data = await fetchSessions(projectPath);
      setSessions(data);
      // Auto-select the most recent session if none chosen yet
      if (data.length > 0 && !selectedSession) {
        const newest = [...data].sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        )[0];
        setSelectedSession(newest);
      }
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSessionsLoading(false);
    }
    // selectedSession intentionally omitted — we only auto-select on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  useEffect(() => {
    setSelectedSession(null);
    setTranscript(null);
  }, [projectPath]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ── Load transcript when selection changes ──

  useEffect(() => {
    if (!selectedSession) {
      setTranscript(null);
      return;
    }
    let cancelled = false;
    setTranscriptLoading(true);
    setTranscriptError(null);

    const run = async () => {
      try {
        const data = await fetchTranscript(
          selectedSession.sessionId,
          selectedSession.projectPath,
        );
        if (!cancelled) setTranscript(data);
      } catch (err) {
        if (!cancelled) {
          setTranscriptError(
            err instanceof Error ? err.message : "Unknown error",
          );
          setTranscript(null);
        }
      } finally {
        if (!cancelled) setTranscriptLoading(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [selectedSession]);

  // ── Load snapshots list ──

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true);
    setSnapshotsError(null);
    try {
      const data = await fetchSnapshots(projectPath);
      setSnapshots(data);
    } catch (err) {
      setSnapshotsError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSnapshotsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    setSelectedSnapshot(null);
    setSnapshotTranscript(null);
    // Clear per-action state so stale errors/messages don't leak across scopes
    setActionError(null);
    setImportError(null);
    setCopyError(null);
    setCopyMessage(null);
    setSaveError(null);
    setSaveMessage(null);
  }, [projectPath]);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  // ── Load snapshot detail when selection changes ──

  useEffect(() => {
    // Clear per-action state so a stale message from the previously selected
    // snapshot doesn't leak into the new selection's header (especially
    // spawnMessage, which contains a session ID tied to the prior snapshot).
    setActionError(null);
    setCopyError(null);
    setCopyMessage(null);
    setSpawnMessage(null);
    if (!selectedSnapshot) {
      setSnapshotTranscript(null);
      return;
    }
    let cancelled = false;
    setSnapshotDetailLoading(true);
    setSnapshotDetailError(null);

    const run = async () => {
      try {
        const data = await fetchSnapshotDetail(selectedSnapshot.id);
        if (!cancelled) setSnapshotTranscript(data.transcript);
      } catch (err) {
        if (!cancelled) {
          setSnapshotDetailError(
            err instanceof Error ? err.message : "Unknown error",
          );
          setSnapshotTranscript(null);
        }
      } finally {
        if (!cancelled) setSnapshotDetailLoading(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [selectedSnapshot]);

  // ── Snapshot save handler ──

  const handleSaveSnapshot = useCallback(
    async (conversationOnly: boolean) => {
      if (!selectedSession) return;
      setIsSaving(true);
      setSaveError(null);
      setSaveMessage(null);
      let saved = false;
      try {
        await saveSnapshot(
          selectedSession.sessionId,
          selectedSession.projectPath,
          snapshotNote.trim(),
          conversationOnly,
        );
        saved = true;
        setSnapshotNote("");
        setSaveMessage(
          conversationOnly ? "Conversation-only snapshot saved." : "Snapshot saved.",
        );
        window.setTimeout(() => setSaveMessage(null), 3000);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsSaving(false);
      }
      // Refresh list after save resolves; list-load errors surface via snapshotsError,
      // not saveError, so a successful save isn't misreported as a failure.
      if (saved) await loadSnapshots();
    },
    [loadSnapshots, selectedSession, snapshotNote],
  );

  // ── Snapshot delete handler ──

  const handleDeleteSnapshot = useCallback(
    async (snapshot: SnapshotMeta) => {
      setActionError(null);
      let deleted = false;
      try {
        await deleteSnapshot(snapshot.id);
        deleted = true;
        if (selectedSnapshot?.id === snapshot.id) {
          setSelectedSnapshot(null);
          setSnapshotTranscript(null);
        }
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to delete snapshot",
        );
      }
      if (deleted) await loadSnapshots();
    },
    [loadSnapshots, selectedSnapshot],
  );

  // ── Export handler ──

  const handleExportSnapshot = useCallback(async () => {
    if (!selectedSnapshot) return;
    setActionError(null);
    try {
      const res = await apiFetch(
        `/api/transcripts/snapshots/${encodeURIComponent(selectedSnapshot.id)}/export`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snapshot-${selectedSnapshot.sessionId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to export snapshot",
      );
    }
  }, [selectedSnapshot]);

  // ── Import handler ──

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsImporting(true);
      setImportError(null);
      let imported = false;
      try {
        await importSnapshot(file);
        imported = true;
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : "Failed to import snapshot",
        );
      } finally {
        setIsImporting(false);
        // Reset file input so the same file can be re-selected
        if (importInputRef.current) importInputRef.current.value = "";
      }
      if (imported) await loadSnapshots();
    },
    [loadSnapshots],
  );

  // ── Spawn handler — creates a new session from snapshot JSONL ──

  const handleSpawnSession = useCallback(async () => {
    if (!selectedSnapshot) return;
    setSpawnMessage(null);
    setActionError(null);
    try {
      const result = await spawnSession(selectedSnapshot.id);
      setSpawnMessage(result.command);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to spawn session",
      );
    }
  }, [selectedSnapshot]);

  // ── Copy conversation as readable text ──

  const handleCopyContext = useCallback(async () => {
    if (!snapshotTranscript) return;
    const lines: string[] = [];
    for (const entry of snapshotTranscript.entries) {
      if (entry.role === "user" && entry.text.trim()) {
        lines.push(`[User]\n${entry.text.trim()}`);
      } else if (entry.role === "assistant" && entry.text.trim()) {
        lines.push(`[Assistant]\n${entry.text.trim()}`);
      } else if (entry.role === "summary" && entry.text.trim()) {
        lines.push(`[Summary]\n${entry.text.trim()}`);
      }
    }
    const text = lines.join("\n\n---\n\n");
    setCopyError(null);
    setCopyMessage(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Copied to clipboard.");
      window.setTimeout(() => setCopyMessage(null), 3000);
    } catch (err) {
      setCopyError(
        err instanceof Error ? err.message : "Failed to copy to clipboard.",
      );
    }
  }, [snapshotTranscript]);

  const handleTabChange = useCallback((value: string) => {
    setTab(value as TranscriptTab);
  }, []);

  const pageTitle = projectPath
    ? `Transcripts (${getProjectDisplayName(projectPath)})`
    : "Transcripts";

  const sessionCount = useMemo(() => sessions.length, [sessions]);

  return (
    <PageShell title={pageTitle}>
      <div className="flex flex-col gap-4">
        <TranscriptsScopeBanner
          projectPath={projectPath}
          onClear={onClearProject}
        />

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-zinc-400">
              View the full text content of any Claude Code session and save
              immutable snapshots so the transcript is preserved even if the
              session gets compacted, rotated, or removed.
            </p>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="live">
              Sessions {sessionCount > 0 ? `(${sessionCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="snapshots">
              Snapshots {snapshots.length > 0 ? `(${snapshots.length})` : ""}
            </TabsTrigger>
          </TabsList>

          {/* ─── Sessions tab ─── */}

          <TabsContent value="live">
            {sessionsLoading && (
              <div className="flex items-center gap-2 py-8 text-zinc-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
                <span className="text-sm">Loading sessions…</span>
              </div>
            )}

            {sessionsError && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
                <p className="text-sm text-red-400">
                  Failed to load sessions: {sessionsError}
                </p>
              </div>
            )}

            {!sessionsLoading && !sessionsError && sessions.length === 0 && (
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs text-zinc-500">
                    No sessions found{projectPath ? " for this project" : ""}.
                  </p>
                </CardContent>
              </Card>
            )}

            {!sessionsLoading && !sessionsError && sessions.length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
                <div className="h-[72vh] min-h-[400px]">
                  <SessionPicker
                    sessions={sessions}
                    selectedSessionId={selectedSession?.sessionId ?? null}
                    onSelect={setSelectedSession}
                  />
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  {selectedSession && (
                    <>
                      {/* Session header */}
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            {selectedSession.sessionName && (
                              <span className="text-sm font-semibold text-zinc-100">
                                {selectedSession.sessionName}
                              </span>
                            )}
                            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                              Session ID
                            </span>
                            <code className="select-all rounded bg-[var(--overlay-subtle)] px-2 py-0.5 font-mono text-xs text-zinc-200">
                              {selectedSession.sessionId}
                            </code>
                            <span className="text-[10px] text-zinc-500">
                              Resume: <code className="font-mono text-zinc-400">claude --resume {selectedSession.sessionId}</code>
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Snapshot save */}
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                                Save snapshot
                              </p>
                              <p className="mt-1 text-xs text-zinc-400">
                                Archives the session content so it survives
                                compaction or rotation.
                              </p>
                            </div>
                            <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[240px]">
                              <Input
                                type="text"
                                value={snapshotNote}
                                onChange={(e) => setSnapshotNote(e.target.value)}
                                placeholder="Optional note (e.g. 'pre-refactor')"
                                className="flex-1 text-xs"
                                maxLength={500}
                                disabled={isSaving}
                              />
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleSaveSnapshot(false)}
                                disabled={isSaving || !transcript}
                              >
                                {isSaving ? "Saving…" : "Save Full"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSaveSnapshot(true)}
                                disabled={isSaving || !transcript}
                                title="Save only user prompts and assistant text responses (no tool calls/results)"
                              >
                                {isSaving ? "Saving…" : "Save Conversation Only"}
                              </Button>
                            </div>
                          </div>
                          {saveError && (
                            <p className="mt-2 text-xs text-red-400">{saveError}</p>
                          )}
                          {saveMessage && (
                            <p className="mt-2 text-xs text-green-400">
                              {saveMessage}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}

                  {transcriptLoading && (
                    <div className="flex items-center gap-2 py-8 text-zinc-400">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
                      <span className="text-sm">Loading transcript…</span>
                    </div>
                  )}

                  {transcriptError && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
                      <p className="text-sm text-red-400">
                        Failed to load transcript: {transcriptError}
                      </p>
                    </div>
                  )}

                  {!transcriptLoading && !transcriptError && transcript && (
                    <TranscriptView
                      transcript={transcript}
                      filter={filter}
                      onFilterChange={setFilter}
                      order={order}
                      onOrderChange={setOrder}
                    />
                  )}

                  {!selectedSession && (
                    <Card>
                      <CardContent className="p-5">
                        <p className="text-xs text-zinc-500">
                          Select a session from the list to view its transcript.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ─── Snapshots tab ─── */}

          <TabsContent value="snapshots">
            {/* Single hoisted file input — avoids duplicate refs across branches */}
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
              <div className="h-[72vh] min-h-[400px]">
                <SnapshotPicker
                  snapshots={snapshots}
                  selectedSnapshotId={selectedSnapshot?.id ?? null}
                  onSelect={setSelectedSnapshot}
                  onDelete={handleDeleteSnapshot}
                  isLoading={snapshotsLoading}
                  error={snapshotsError}
                />
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                {selectedSnapshot && (
                  <>
                    {/* Snapshot header — mirrors the session header */}
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          {selectedSnapshot.sessionName && (
                            <span className="text-sm font-semibold text-zinc-100">
                              {selectedSnapshot.sessionName}
                            </span>
                          )}
                          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                            Session ID
                          </span>
                          <code className="select-all rounded bg-[var(--overlay-subtle)] px-2 py-0.5 font-mono text-xs text-zinc-200">
                            {selectedSnapshot.sessionId}
                          </code>
                          <span className="text-[10px] text-zinc-500">
                            Resume: <code className="font-mono text-zinc-400">claude --resume {selectedSnapshot.sessionId}</code>
                          </span>
                          {selectedSnapshot.conversationOnly && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-amber-500/20">
                              conversation only
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="xs" onClick={handleExportSnapshot}>
                            Export
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={handleSpawnSession}
                            disabled={selectedSnapshot.conversationOnly}
                            title={
                              selectedSnapshot.conversationOnly
                                ? "Cannot spawn from a conversation-only snapshot — save a full snapshot first"
                                : "Create a new session seeded with this snapshot's conversation"
                            }
                          >
                            Spawn Session
                          </Button>
                          <Button variant="outline" size="xs" onClick={handleCopyContext} disabled={!snapshotTranscript}>
                            Copy as Text
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => importInputRef.current?.click()}
                            disabled={isImporting}
                          >
                            {isImporting ? "Importing…" : "Import"}
                          </Button>
                          {selectedSnapshot.note && (
                            <span className="ml-1 text-xs text-zinc-400">
                              {selectedSnapshot.note}
                            </span>
                          )}
                        </div>
                        {actionError && (
                          <p className="mt-2 text-xs text-red-400">{actionError}</p>
                        )}
                        {importError && (
                          <p className="mt-2 text-xs text-red-400">{importError}</p>
                        )}
                        {copyError && (
                          <p className="mt-2 text-xs text-red-400">{copyError}</p>
                        )}
                        {copyMessage && (
                          <p className="mt-2 text-xs text-green-400">{copyMessage}</p>
                        )}
                        {spawnMessage && (
                          <div className="mt-2 flex items-center gap-2">
                            <code className="select-all rounded bg-[var(--overlay-subtle)] px-2 py-1 font-mono text-xs text-green-400">
                              {spawnMessage}
                            </code>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}

                {snapshotDetailLoading && (
                  <div className="flex items-center gap-2 py-8 text-zinc-400">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
                    <span className="text-sm">Loading snapshot…</span>
                  </div>
                )}

                {snapshotDetailError && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
                    <p className="text-sm text-red-400">
                      Failed to load snapshot: {snapshotDetailError}
                    </p>
                  </div>
                )}

                {!snapshotDetailLoading &&
                  !snapshotDetailError &&
                  snapshotTranscript && (
                    <TranscriptView
                      transcript={snapshotTranscript}
                      filter={filter}
                      onFilterChange={setFilter}
                      order={order}
                      onOrderChange={setOrder}
                    />
                  )}

                {!selectedSnapshot && (
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-3">
                        <p className="text-xs text-zinc-500">
                          {snapshots.length === 0
                            ? "No snapshots saved yet. Open a session and click \"Save Full\" or \"Save Conversation Only\" to archive its transcript."
                            : "Select a snapshot from the list to view its transcript."}
                        </p>
                        <div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => importInputRef.current?.click()}
                            disabled={isImporting}
                          >
                            {isImporting ? "Importing…" : "Import Snapshot"}
                          </Button>
                        </div>
                        {importError && (
                          <p className="text-xs text-red-400">{importError}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
};
