import { useState, useEffect, useCallback, useMemo } from "react";
import type { SkillInfo, SkillsResponse } from "../../../shared/types";
import { apiFetch, buildScopedUrl, getProjectDisplayName } from "../../lib/api";
import { useToast } from "../shared/use-toast";
import { PageShell } from "../layout/PageShell";
import { ScopeBanner } from "../shared/ScopeBanner";
import { CategoryFilter, type CategoryItem } from "../plugins/CategoryFilter";
import { SkillGrid } from "./SkillGrid";
import { Input } from "~/client/components/ui/input";

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return String(tokens);
};

const SummaryBar = ({
  activeCount,
  totalCount,
  totalEstimatedTokens,
}: {
  activeCount: number;
  totalCount: number;
  totalEstimatedTokens: number;
}) => {
  return (
    <div className="rounded-xl bg-[var(--surface-raised)] ring-1 ring-[var(--border-hairline)] px-5 py-3.5">
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-zinc-100">{activeCount}</span>
          {" of "}
          <span className="font-semibold text-zinc-100">{totalCount}</span>
          {" skills active"}
          <span className="mx-2 text-zinc-500">|</span>
          <span className="text-zinc-400">
            ~{formatTokenCount(totalEstimatedTokens)} tokens/turn
          </span>
        </p>
    </div>
  );
};

type StatusFilterOption = "all" | "active" | "inactive";

const STATUS_OPTIONS: { value: StatusFilterOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const StatusFilter = ({
  active,
  onChange,
}: {
  active: StatusFilterOption;
  onChange: (value: StatusFilterOption) => void;
}) => {
  return (
    <div className="flex h-9 rounded-lg border border-[var(--border-accent)] bg-[var(--surface-raised)]">
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 text-xs font-medium transition-colors ${
            active === opt.value
              ? "bg-[var(--overlay-medium)] text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          } ${opt.value === "all" ? "rounded-l-lg" : ""} ${opt.value === "inactive" ? "rounded-r-lg" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

const LoadingState = () => {
  return (
    <div className="flex items-center gap-2 py-12 text-zinc-400">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      <span className="text-sm">Loading skills...</span>
    </div>
  );
};

const ErrorState = ({ message }: { message: string }) => {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
      <p className="text-sm text-red-400">Failed to load skills: {message}</p>
    </div>
  );
};

const fetchSkills = async (
  projectPath: string | null
): Promise<SkillsResponse> => {
  const url = buildScopedUrl("/api/skills", projectPath);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
};

const toggleSkill = async (
  skillId: string,
  enabled: boolean,
  projectPath: string | null
): Promise<void> => {
  const url = buildScopedUrl("/api/skills/toggle", projectPath);
  const response = await apiFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillId, enabled }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
};

type SkillsPageProps = {
  projectPath?: string | null;
  onClearProject?: () => void;
};

export const SkillsPage = ({ projectPath = null, onClearProject }: SkillsPageProps) => {
  const { toast } = useToast();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const activeCount = useMemo(() => skills.filter((s) => s.enabled).length, [skills]);
  const totalEstimatedTokens = useMemo(
    () => skills.filter((s) => s.enabled).reduce((sum, s) => sum + s.estimatedTokens, 0),
    [skills]
  );

  const loadSkills = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await fetchSkills(projectPath);
      setSkills(data.skills);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    loadSkills(true);
  }, [loadSkills]);

  const handleToggle = useCallback(
    async (skillId: string, enabled: boolean) => {
      setTogglingIds((prev) => new Set([...prev, skillId]));

      setSkills((prev) =>
        prev.map((s) =>
          s.id === skillId
            ? { ...s, enabled, enableSource: "project" as const }
            : s
        )
      );

      try {
        await toggleSkill(skillId, enabled, projectPath);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Toggle failed", "error");
        await loadSkills(false);
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(skillId);
          return next;
        });
      }
    },
    [projectPath, loadSkills, toast]
  );

  const categories = useMemo((): CategoryItem[] => {
    const items: CategoryItem[] = [];
    const seen = new Set<string>();
    for (const skill of skills) {
      if (skill.source === "plugin" && skill.pluginName) {
        const key = `plugin:${skill.pluginName}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({ value: `Plugin: ${skill.pluginName}`, label: skill.pluginName, prefix: "PLG" });
        }
      } else if (skill.source === "user" && !seen.has("user")) {
        seen.add("user");
        items.push({ value: "User", label: "User", prefix: "USR" });
      } else if (skill.source === "project" && !seen.has("project")) {
        seen.add("project");
        items.push({ value: "Project", label: "Project", prefix: "PRJ" });
      }
    }
    return items.sort((a, b) => a.label.localeCompare(b.label));
  }, [skills]);

  const filteredSkills = useMemo(() => {
    let result = skills;

    if (activeCategory !== "All") {
      result = result.filter((s) => {
        if (activeCategory === "User") return s.source === "user";
        if (activeCategory === "Project") return s.source === "project";
        if (activeCategory.startsWith("Plugin: ")) {
          return s.source === "plugin" && s.pluginName === activeCategory.slice(8);
        }
        return true;
      });
    }

    if (statusFilter === "active") {
      result = result.filter((s) => s.enabled);
    } else if (statusFilter === "inactive") {
      result = result.filter((s) => !s.enabled);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [skills, activeCategory, statusFilter, searchQuery]);

  const pageTitle = projectPath
    ? `Skills (${getProjectDisplayName(projectPath)})`
    : "Skills";

  return (
    <PageShell title={pageTitle}>
      <div className="flex flex-col gap-4">
        <ScopeBanner projectPath={projectPath} configType="skills" onClear={onClearProject} />

        {isLoading && <LoadingState />}

        {error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <>
            <SummaryBar
              activeCount={activeCount}
              totalCount={skills.length}
              totalEstimatedTokens={totalEstimatedTokens}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                className="flex-1"
              />
              <StatusFilter active={statusFilter} onChange={setStatusFilter} />
            </div>

            {categories.length > 1 && (
              <CategoryFilter
                categories={categories}
                active={activeCategory}
                onChange={setActiveCategory}
              />
            )}

            <SkillGrid
              skills={filteredSkills}
              onToggle={handleToggle}
              togglingIds={togglingIds}
            />
          </>
        )}
      </div>
    </PageShell>
  );
};
