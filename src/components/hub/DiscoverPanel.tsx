import React from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Sparkles,
  Server,
  Loader2,
  Download,
  Check,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, Badge, toast } from "@/components/ui";
import {
  useImportGitHubSkill,
  useImportMcpRegistryServer,
  useFeaturedMcpServers,
  useSearchMcpRegistry,
  type McpRegistry,
  type McpRegistryEntry,
} from "@/hooks";

// ────────────────────────────────────────────────────────────────────────────
// Examples — same list the dialog used to keep in InstanceState; lifted up
// so DiscoverPanel can search across it without coupling to the dialog.
// ────────────────────────────────────────────────────────────────────────────

interface ExampleSkill {
  id: string;
  name: string;
  description: string;
  /** Path inside the anthropics/skills repository. */
  path: string;
  tags: string[];
  license: string;
}

const ANTHROPIC_EXAMPLES: ExampleSkill[] = [
  {
    id: "frontend-design",
    name: "Frontend Design",
    description:
      "Create distinctive, production-grade frontend interfaces with high design quality.",
    path: "skills/frontend-design",
    tags: ["design", "frontend", "ui"],
    license: "Apache-2.0",
  },
  {
    id: "mcp-builder",
    name: "MCP Builder",
    description:
      "Guide for creating high-quality MCP servers that enable LLMs to interact with external services.",
    path: "skills/mcp-builder",
    tags: ["mcp", "development", "api"],
    license: "Apache-2.0",
  },
  {
    id: "webapp-testing",
    name: "Web App Testing",
    description:
      "Toolkit for interacting with and testing local web applications using Playwright.",
    path: "skills/webapp-testing",
    tags: ["testing", "playwright", "automation"],
    license: "Apache-2.0",
  },
  {
    id: "algorithmic-art",
    name: "Algorithmic Art",
    description: "Creating algorithmic art using p5.js with seeded randomness.",
    path: "skills/algorithmic-art",
    tags: ["art", "generative", "p5js"],
    license: "Apache-2.0",
  },
  {
    id: "skill-creator",
    name: "Skill Creator",
    description:
      "Guide for creating effective skills that extend Claude's capabilities.",
    path: "skills/skill-creator",
    tags: ["meta", "skill", "guide"],
    license: "Apache-2.0",
  },
  {
    id: "theme-factory",
    name: "Theme Factory",
    description:
      "Create cohesive visual themes for presentations, documents, and web interfaces.",
    path: "skills/theme-factory",
    tags: ["design", "theme", "styling"],
    license: "Apache-2.0",
  },
];

const ANTHROPIC_REPO = {
  owner: "anthropics",
  repo: "skills",
  branch: "main",
};

// ────────────────────────────────────────────────────────────────────────────
// Federated result shape — both Examples and Registry entries are flattened
// into this so the result list is a single, uniform render.
// ────────────────────────────────────────────────────────────────────────────

type DiscoverFilter = "all" | "examples" | "registry";

interface DiscoverResult {
  /** Stable across renders so React keys / selection sets stay consistent. */
  id: string;
  origin: "example" | "registry";
  name: string;
  description: string;
  tags: string[];
  author?: string;
  /** Outbound link the user can open in their browser. */
  external?: string;
  /** The raw record from the source — used to dispatch the right import call. */
  raw: ExampleSkill | McpRegistryEntry;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

/**
 * `DiscoverPanel` is the unified browse + search experience that replaces the
 * old `Examples` and `Registry` tabs. It's a single search box that fans out
 * to every searchable source we know about (right now: Anthropic Examples
 * and the MCP registries). The grid below the box shows merged results,
 * filterable by source.
 *
 * Imports are dispatched per-result through the existing GitHub /
 * MCP-registry hooks — no new backend work needed.
 */
export const DiscoverPanel: React.FC = () => {
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = React.useState("");
  const [filter, setFilter] = React.useState<DiscoverFilter>("all");
  const [selectedRegistry, setSelectedRegistry] = React.useState<
    McpRegistry | undefined
  >(undefined);

  // Track per-result import state. Sets, not React Query state, because the
  // mutations themselves are shared across many entries.
  const [importingIds, setImportingIds] = React.useState<Set<string>>(new Set());
  const [importedIds, setImportedIds] = React.useState<Set<string>>(new Set());
  const [errorById, setErrorById] = React.useState<Record<string, string>>({});

  const importGithub = useImportGitHubSkill();
  const importRegistry = useImportMcpRegistryServer();

  // Backend results. When the search box is empty we fall back to featured.
  const { data: featuredRegistry = [], isLoading: loadingFeatured } =
    useFeaturedMcpServers(selectedRegistry);
  const { data: searchedRegistry = [], isLoading: searching } =
    useSearchMcpRegistry(searchTerm, selectedRegistry);

  // ────────── Build the merged result list ──────────

  const exampleMatches = React.useMemo<DiscoverResult[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    const matches = ANTHROPIC_EXAMPLES.filter((e) => {
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
    return matches.map<DiscoverResult>((e) => ({
      id: `example:${e.id}`,
      origin: "example",
      name: e.name,
      description: e.description,
      tags: e.tags,
      author: "Anthropic",
      external: `https://github.com/anthropics/skills/tree/main/${e.path}`,
      raw: e,
    }));
  }, [searchTerm]);

  const registryMatches = React.useMemo<DiscoverResult[]>(() => {
    const list = searchTerm ? searchedRegistry : featuredRegistry;
    return list.map<DiscoverResult>((entry) => ({
      id: `registry:${entry.id}`,
      origin: "registry",
      name: entry.name,
      description: entry.description,
      tags: entry.tags,
      author: entry.author,
      external: entry.repository || entry.homepage,
      raw: entry,
    }));
  }, [searchTerm, featuredRegistry, searchedRegistry]);

  const allResults = React.useMemo<DiscoverResult[]>(() => {
    switch (filter) {
      case "examples":
        return exampleMatches;
      case "registry":
        return registryMatches;
      case "all":
      default:
        return [...exampleMatches, ...registryMatches];
    }
  }, [filter, exampleMatches, registryMatches]);

  const isLoading = filter !== "examples" && (searching || loadingFeatured);

  // ────────── Importers ──────────

  const markImporting = (id: string, v: boolean) =>
    setImportingIds((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleImport = async (result: DiscoverResult) => {
    if (importingIds.has(result.id) || importedIds.has(result.id)) return;
    markImporting(result.id, true);
    setErrorById((prev) => {
      const next = { ...prev };
      delete next[result.id];
      return next;
    });

    try {
      if (result.origin === "example") {
        const ex = result.raw as ExampleSkill;
        await importGithub.mutateAsync({
          owner: ANTHROPIC_REPO.owner,
          repo: ANTHROPIC_REPO.repo,
          path: ex.path,
          branch: ANTHROPIC_REPO.branch,
        });
      } else {
        const entry = result.raw as McpRegistryEntry;
        await importRegistry.mutateAsync(entry);
      }
      setImportedIds((prev) => new Set(prev).add(result.id));
      toast.success(t("discover.toast.imported", { name: result.name }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorById((prev) => ({ ...prev, [result.id]: message }));
      toast.error(t("discover.toast.failed", { name: result.name }), message);
    } finally {
      markImporting(result.id, false);
    }
  };

  // ────────── Render ──────────

  const filterChips: Array<{ id: DiscoverFilter; label: string; count: number }> = [
    { id: "all", label: t("discover.filter.all"), count: exampleMatches.length + registryMatches.length },
    { id: "examples", label: t("discover.filter.examples"), count: exampleMatches.length },
    { id: "registry", label: t("discover.filter.registry"), count: registryMatches.length },
  ];

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("discover.placeholder")}
          className="pl-9"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              filter === chip.id
                ? "border-accent-blue bg-accent-blue/10 text-accent-blue"
                : "border-border-default text-text-secondary hover:border-border-hover"
            )}
          >
            {chip.label}
            <span className="ml-1 tabular-nums opacity-70">{chip.count}</span>
          </button>
        ))}

        {/* Registry source selector — only meaningful when registry is in scope */}
        {filter !== "examples" && (
          <select
            value={selectedRegistry ?? ""}
            onChange={(e) =>
              setSelectedRegistry((e.target.value || undefined) as McpRegistry | undefined)
            }
            className="ml-auto h-6 rounded-md border border-border-default bg-bg-secondary px-2 text-[11px] text-text-secondary focus:border-accent-blue focus:outline-none"
          >
            <option value="">{t("discover.allRegistries")}</option>
            <option value="glama">Glama</option>
            <option value="mcpso">mcp.so</option>
            <option value="mcpserversorg">mcpservers.org</option>
            <option value="smithery">Smithery</option>
          </select>
        )}
      </div>

      {/* Results list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : allResults.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-default px-4 py-12 text-center text-sm text-text-muted">
          {t("discover.noResults")}
        </div>
      ) : (
        <div className="space-y-2">
          {allResults.map((result) => (
            <DiscoverResultCard
              key={result.id}
              result={result}
              isImporting={importingIds.has(result.id)}
              isImported={importedIds.has(result.id)}
              error={errorById[result.id]}
              onImport={() => handleImport(result)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Result card
// ────────────────────────────────────────────────────────────────────────────

interface DiscoverResultCardProps {
  result: DiscoverResult;
  isImporting: boolean;
  isImported: boolean;
  error?: string;
  onImport: () => void;
}

const DiscoverResultCard: React.FC<DiscoverResultCardProps> = ({
  result,
  isImporting,
  isImported,
  error,
  onImport,
}) => {
  const { t } = useTranslation();

  const OriginIcon = result.origin === "example" ? Sparkles : Server;
  const originLabel =
    result.origin === "example"
      ? t("discover.filter.examples")
      : t("discover.filter.registry");

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        isImported
          ? "border-accent-green/30 bg-accent-green/5"
          : "border-border-default bg-bg-secondary/50 hover:border-border-hover hover:bg-bg-secondary"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            result.origin === "example"
              ? "bg-accent-purple/10 text-accent-purple"
              : "bg-accent-blue/10 text-accent-blue"
          )}
        >
          {isImported ? (
            <Check className="h-4 w-4 text-accent-green" />
          ) : (
            <OriginIcon className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-text-primary">
              {result.name}
            </span>
            <Badge variant="outline" className="h-4 px-1 py-0 text-[10px]">
              {originLabel}
            </Badge>
            {result.external && (
              <a
                href={result.external}
                target="_blank"
                rel="noreferrer noopener"
                className="text-text-muted transition-colors hover:text-text-primary"
                title={result.external}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {result.author && (
            <div className="text-[10px] text-text-muted">
              {t("skillCard.by")} {result.author}
            </div>
          )}
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
            {result.description}
          </p>
          {result.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {result.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        {error && (
          <span className="flex items-center gap-1 text-[10px] text-accent-red">
            <AlertCircle className="h-3 w-3" />
            {t("discover.importFailed")}
          </span>
        )}
        <Button
          size="sm"
          variant={isImported ? "outline" : "default"}
          className={cn(
            "h-7 text-xs",
            isImported && "text-accent-green hover:bg-accent-green/5"
          )}
          onClick={onImport}
          disabled={isImporting || isImported}
        >
          {isImporting ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : isImported ? (
            <Check className="mr-1 h-3 w-3" />
          ) : (
            <Download className="mr-1 h-3 w-3" />
          )}
          {isImporting
            ? t("discover.importing")
            : isImported
            ? t("discover.imported")
            : t("discover.import")}
        </Button>
      </div>
    </div>
  );
};
