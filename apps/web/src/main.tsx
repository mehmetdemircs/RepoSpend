import React from "react";
import ReactDOM from "react-dom/client";
import { AppWindow, ArrowDownUp, Blocks, Bot, BrainCircuit, Calculator, ChartNoAxesCombined, CircleDollarSign, Code2, Columns3, Command, Copy, Cpu, Database, Download, ExternalLink, Filter, FolderGit2, FolderOpen, Github, GitBranch, Info, LayoutDashboard, LayoutPanelTop, MonitorCog, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Settings, Sparkles, SquareTerminal, Terminal, TriangleAlert, X } from "lucide-react";
import { isUsableModelPricing, resolvePricingForModel } from "@repospend/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartLimitOptions,
  colors,
  defaultSessionColumns,
  metricOptions,
  pageSizeOptions,
  rangeOptions,
  sessionColumnOptions,
  type ApiData,
  type AgentFrictionRepo,
  type BreakdownTab,
  type DashboardResponse,
  type DisplaySettings,
  type FilterSortMode,
  type Filters,
  type InsightItem,
  type MetricBreakdownRow,
  type MetricKey,
  type ModelSortKey,
  type ModelUsageRow,
  type ModelPricing,
  type PickerIcon,
  type PickerOption,
  type PopoverPosition,
  type PricingProviderFilter,
  type PricingResponse,
  type PricingViewFilter,
  type QuickSessionFilter,
  type RangePreset,
  type RepoSpendConfig,
  type RepoCommandTotals,
  type RepoCostConcentration,
  type RepoDetailTab,
  type RepoModelSpend,
  type RepoReviewSession,
  type RepoRow,
  type RepoSessionQuickFilter,
  type RepoSortKey,
  type RtkCommand,
  type RtkCommandSortKey,
  type RtkGain,
  type RtkUnhandledCommand,
  type Session,
  type SessionColumnKey,
  type SessionDetailTab,
  type SessionSortKey,
  type SettingsTab,
  type SortDirection,
  type Summary,
  type TimelineRoleFilter,
  type UsageGroup,
  type ViewKey,
} from "./app-types";
import { compactNumber, count, countExact, currencyCompact, formatDateTime, formatDuration, money, percent, percentExact, shortPath, tokens, tokensExact } from "./format";
import { buildUrlPath, buildUrlSearch, parseUrlState } from "./url-state";
import {
  buildGroupPickerOptions,
  buildSourcePickerOptions,
  dateInputValue,
  downloadText,
  groupUsageForChart,
  metricLabel,
  metricTick,
  outcomeLabel,
  outcomeTitle,
  presetRange,
  rangeLabel,
  readDisplaySettings,
  readFilterSortMode,
  sourceLabel,
  surfaceLabel,
  toggleFilterValue,
  tooltipMetric,
  uniquePickerOptions,
} from "./ui-utils";
import {
  agentFrictionRepos,
  aggregationMethodLabel,
  breakdownCostLabel,
  compactModelLabel,
  confidenceLabel,
  cursorSourceEnabled,
  estimateAvoidedCostUsd,
  exportReposCsv,
  exportSessionsCsv,
  failureTypeLabel,
  findSessionById,
  importantCommandFailures,
  insightSeverity,
  isCostOutlier,
  issueImpactLabel,
  listText,
  modelUsageRows,
  nullableNumber,
  parseRecentRtkCommand,
  parseTokenAmount,
  polishCostLanguage,
  pricingMissing,
  pricingProvider,
  pricingRows,
  readableCommandName,
  readableIssueLabel,
  readableWarning,
  relativeTimeLabel,
  repoCommandTotals,
  repoCostConcentration,
  repoCostDriverExplanation,
  repoDailyBreakdown,
  repoModelBreakdown,
  repoRows,
  repoRowsFromGroup,
  rtkAvoidedCostRate,
  rtkHookLabel,
  rtkRecommendedActions,
  sessionBadges,
  sessionConcernSignals,
  sessionCostOutlierThreshold,
  sessionDisplayTitle,
  sessionMatchesQuickFilter,
  sessionMatchesRepoQuickFilter,
  sessionMatchesSearch,
  sessionNeedsCommandReview,
  sessionPositiveSignals,
  shortCommand,
  sortedRtkCommands,
  sortModelRows,
  sortRepoRows,
  sortSessionRows,
  sourceDetectedPaths,
  sourceEmptyFix,
  sourceHomePath,
  sourceImportedSessions,
  sourcePrimaryDataFound,
  tokenStats,
  topDashboardActions,
  topSessionsToReview,
  usageBreakdownRows,
  usePagination,
} from "./selectors";
import "./styles.css";
const chartTooltipStyle = {
  background: "#0f172a",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 10,
  color: "#e5e7eb",
};
const chartTooltipLabelStyle = { color: "#f8fafc", fontWeight: 700 };
const chartTooltipItemStyle = { color: "#e5e7eb" };
const positiveBarMinPointSize = (value: number | null | undefined) => (typeof value === "number" && value > 0 ? 3 : 0);

const viewMeta: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "Overview", subtitle: "Your local AI coding activity at a glance" },
  sessions: { title: "Sessions", subtitle: "Inspect metadata, surfaces, outcomes, commands, and parse status" },
  sessionDetail: { title: "Session Detail", subtitle: "One local AI coding session, with signals and token shape" },
  repos: { title: "Repos / folders", subtitle: "Compare local AI coding usage, API-equivalent cost, productivity, and warnings by Git repo or inferred folder" },
  repoDetail: { title: "Repo / folder detail", subtitle: "Focused repo or folder usage, sessions, warnings, and command signals" },
  models: { title: "Models", subtitle: "Compare model token shape, API-equivalent cost, cache reuse, and repo concentration" },
  commands: { title: "Agent Friction", subtitle: "Possible failed commands separated from harmless shell exits" },
  insights: { title: "Usage Health", subtitle: "What looks good, what needs attention, and why" },
  rtk: { title: "RTK Insights", subtitle: "Token savings from RTK command proxy" },
  settings: { title: "Settings", subtitle: "Local pricing and dashboard configuration" },
};

const viewIcons: Record<ViewKey, React.ReactElement> = {
  dashboard: <LayoutDashboard />,
  sessions: <Terminal />,
  sessionDetail: <Terminal />,
  repos: <FolderGit2 />,
  repoDetail: <FolderGit2 />,
  models: <BrainCircuit />,
  commands: <TriangleAlert />,
  insights: <Info />,
  rtk: <Command />,
  settings: <Settings />,
};

const repoDetailSessionColumns: SessionColumnKey[] = ["commands", "commandIssues", "edits"];

type SessionSearchIntent = { search: string; key: number };

function App() {
  const initialUrlState = React.useMemo(() => parseUrlState(), []);
  const [data, setData] = React.useState<ApiData | null>(null);
  const [filterOptionsData, setFilterOptionsData] = React.useState<ApiData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [rangePreset, setRangePreset] = React.useState<RangePreset>(initialUrlState.rangePreset);
  const [filters, setFilters] = React.useState<Filters>(initialUrlState.filters);
  const [metric, setMetric] = React.useState<MetricKey>(initialUrlState.metric);
  const [selectedRepo, setSelectedRepo] = React.useState<string | null>(initialUrlState.selectedRepo);
  const [selectedSessionId, setSelectedSessionId] = React.useState<string | null>(initialUrlState.selectedSessionId);
  const [sessionDetailInitialTab, setSessionDetailInitialTab] = React.useState<SessionDetailTab>("overview");
  const [activeView, setActiveView] = React.useState<ViewKey>(initialUrlState.activeView);
  const [pricingDraft, setPricingDraft] = React.useState<Record<string, ModelPricing>>({});
  const [pricingStatus, setPricingStatus] = React.useState<string | null>(null);
  const [sessionSearchIntent, setSessionSearchIntent] = React.useState<SessionSearchIntent | null>(null);
  const [filterSortMode, setFilterSortMode] = React.useState<FilterSortMode>(() => readFilterSortMode());
  const [displaySettings, setDisplaySettings] = React.useState<DisplaySettings>(() => readDisplaySettings());
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [refreshNonce, setRefreshNonce] = React.useState(0);
  const suppressNextUrlSync = React.useRef(false);
  const backgroundWarmStarted = React.useRef(false);

  const query = React.useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length) params.set(key, value.join(","));
      } else if (value) {
        params.set(key, value);
      }
    });
    if (displaySettings.splitSourceApps) params.set("splitSourceApps", "true");
    return params.toString();
  }, [displaySettings.splitSourceApps, filters]);
  const filterOptionsQuery = React.useMemo(() => {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (displaySettings.splitSourceApps) params.set("splitSourceApps", "true");
    return params.toString();
  }, [displaySettings.splitSourceApps, filters.from, filters.to]);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchJson<DashboardResponse>(`/api/dashboard?${query}`)
      .then((dashboard) => {
        if (!mounted) return;
        setData(dashboard);
        if (query === filterOptionsQuery) setFilterOptionsData(dashboard);
        else {
          void fetchJson<DashboardResponse>(`/api/dashboard${filterOptionsQuery ? `?${filterOptionsQuery}` : ""}`)
            .then((optionDashboard) => {
              if (mounted) setFilterOptionsData(optionDashboard);
            })
            .catch(() => {
              if (mounted) setFilterOptionsData(dashboard);
            });
        }
      })
      .catch((apiError: unknown) => {
        if (mounted) setError(apiError instanceof Error ? apiError.message : String(apiError));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [filterOptionsQuery, query, refreshNonce]);

  React.useEffect(() => {
    const repoSource = filterOptionsData ?? data;
    if (repoSource && selectedRepo && !repoSource.repos.some((repo) => repo.id === selectedRepo)) {
      setSelectedRepo(null);
    }
  }, [data, filterOptionsData, selectedRepo]);

  React.useEffect(() => {
    if (!filterOptionsData) return;
    const availableSources = new Set<string>(filterOptionsData.sessions.map((session) => session.sourceClient));
    const availableSourceApps = new Set(filterOptionsData.sourceApps.map((app) => app.label));
    const availableRepos = new Set(filterOptionsData.repos.flatMap((repo) => [repo.id, repo.label]));
    const availableModels = new Set(filterOptionsData.models.flatMap((model) => [model.id, model.label]));
    const modelIdByLabel = new Map(filterOptionsData.models.map((model) => [model.label, model.id]));
    const nextFilters = {
      ...filters,
      source: filters.source.filter((source) => availableSources.has(source)),
      sourceApp: filters.sourceApp.filter((app) => availableSourceApps.has(app)),
      repo: filters.repo.filter((repo) => availableRepos.has(repo)),
      model: filters.model.map((model) => modelIdByLabel.get(model) ?? model).filter((model) => availableModels.has(model)),
    };
    if (
      nextFilters.source.length !== filters.source.length
      || nextFilters.sourceApp.length !== filters.sourceApp.length
      || nextFilters.repo.length !== filters.repo.length
      || nextFilters.model.length !== filters.model.length
    ) {
      setFilters(nextFilters);
    }
  }, [filterOptionsData, filters]);

  React.useEffect(() => {
    const handlePopState = () => {
      const state = parseUrlState();
      suppressNextUrlSync.current = true;
      setActiveView(state.activeView);
      setRangePreset(state.rangePreset);
      setFilters(state.filters);
      setMetric(state.metric);
      setSelectedRepo(state.selectedRepo);
      setSelectedSessionId(state.selectedSessionId);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  React.useEffect(() => {
    const nextPath = buildUrlPath({ activeView, selectedRepo, selectedSessionId });
    const nextSearch = buildUrlSearch({ filters, rangePreset, metric });
    const nextUrl = `${nextPath}${nextSearch}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (suppressNextUrlSync.current) {
      suppressNextUrlSync.current = false;
      return;
    }
    if (nextUrl !== currentUrl) {
      window.history.pushState(null, "", nextUrl);
    }
  }, [activeView, filters, rangePreset, metric, selectedRepo, selectedSessionId]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem("repospend.filterSortMode", filterSortMode);
    } catch {
      // Local-only preference persistence is optional; the dashboard still works without it.
    }
  }, [filterSortMode]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem("repospend.displaySettings.v2", JSON.stringify(displaySettings));
    } catch {
      // Local-only preference persistence is optional; the dashboard still works without it.
    }
  }, [displaySettings]);

  const updateDisplaySettings = React.useCallback((next: Partial<DisplaySettings>) => {
    if (next.splitSourceApps !== undefined) {
      setFilters((current) => ({ ...current, sourceApp: [] }));
    }
    setDisplaySettings((current) => ({ ...current, ...next }));
  }, []);

  const refetchDashboard = React.useCallback(() => {
    setRefreshNonce((current) => current + 1);
  }, []);

  const rescanLocalLogs = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void clearParseCache().finally(refetchDashboard);
  }, [refetchDashboard]);

  React.useEffect(() => {
    if (!data || backgroundWarmStarted.current || rangePreset !== "last7" || hasNonDateFilters(filters)) return;
    const timeout = window.setTimeout(() => {
      backgroundWarmStarted.current = true;
      void warmParseCache({ preset: "last30", splitSourceApps: displaySettings.splitSourceApps });
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [data, displaySettings.splitSourceApps, filters, rangePreset]);

  const optionSource = filterOptionsData ?? data;
  const pickerSortMode: FilterSortMode = "usage";
  const sourceOptions = buildSourcePickerOptions(optionSource?.sources ?? data?.sources ?? [], optionSource?.sessions ?? data?.sessions ?? [], filters.source, pickerSortMode);
  const repoOptions = buildGroupPickerOptions(optionSource?.repos ?? [], filters.repo, pickerSortMode, "repo");
  const modelOptions = buildGroupPickerOptions(optionSource?.models ?? [], filters.model, pickerSortMode, "model");
  const appOptions = buildGroupPickerOptions(optionSource?.sourceApps ?? [], filters.sourceApp, pickerSortMode, "app");
  const filterBarVisible = viewShowsFiltersBar(activeView);
  const hiddenFilterNotice = !filterBarVisible ? compactHiddenFilterNotice(filters, rangePreset) : null;

  const navigateToView = React.useCallback((view: ViewKey) => setActiveView(view), []);
  const openSessionsWithSearch = React.useCallback((search: string) => {
    setSessionSearchIntent({ search, key: Date.now() });
    setActiveView("sessions");
  }, []);
  const clearSessionSearchIntent = React.useCallback(() => {
    setSessionSearchIntent(null);
  }, []);
  const openSession = React.useCallback((sessionId: string, initialTab: SessionDetailTab = "overview") => {
    setSelectedSessionId(sessionId);
    setSessionDetailInitialTab(initialTab);
    setActiveView("sessionDetail");
  }, []);
  const openRepo = React.useCallback((repoId: string) => {
    setSelectedRepo(repoId);
    setFilters((current) => ({ ...current, repo: [repoId] }));
    setActiveView("repoDetail");
  }, []);

  React.useEffect(() => {
    if (data?.pricing.models) setPricingDraft(data.pricing.models);
  }, [data?.pricing.models]);

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <ChartNoAxesCombined className="h-6 w-6" aria-hidden />
          </div>
          <div className="brand-text">
            <h1>RepoSpend</h1>
            <p>Local analytics</p>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          <NavButton icon={<LayoutDashboard />} label="Overview" active={activeView === "dashboard"} onClick={() => navigateToView("dashboard")} />
          <NavButton icon={<FolderGit2 />} label="Repos / folders" active={activeView === "repos" || activeView === "repoDetail"} onClick={() => navigateToView("repos")} />
          <NavButton icon={<BrainCircuit />} label="Models" active={activeView === "models"} onClick={() => navigateToView("models")} />
          <NavButton icon={<Terminal />} label="Sessions" active={activeView === "sessions" || activeView === "sessionDetail"} onClick={() => navigateToView("sessions")} />
          <NavButton icon={<TriangleAlert />} label="Agent Friction" active={activeView === "commands"} onClick={() => navigateToView("commands")} badge={data && data.summary.importantCommandFailures > 0 ? compactNumber(data.summary.importantCommandFailures) : undefined} />
          <NavButton icon={<Info />} label="Insights" active={activeView === "insights"} onClick={() => navigateToView("insights")} badge={data && data.health.attentionCount > 0 ? compactNumber(data.health.attentionCount) : undefined} />
          <NavButton icon={<Command />} label="RTK" active={activeView === "rtk"} onClick={() => navigateToView("rtk")} />
          <NavButton icon={<Settings />} label="Settings" active={activeView === "settings"} onClick={() => navigateToView("settings")} />
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-label">Quick links</div>
          <div className="quick-links">
            <QuickLink href="https://chatgpt.com/codex/cloud/settings/analytics#usage" label="Codex usage" icon={<CodexIcon />} tone="codex" />
            <QuickLink href="https://claude.ai/settings/usage" label="Claude usage" icon={<ClaudeIcon />} tone="claude" />
            <QuickLink href="https://github.com/settings/billing/summary" label="Copilot billing" icon={<Github className="h-4 w-4" aria-hidden />} tone="github" />
            {cursorSourceEnabled(data) ? <QuickLink href="https://cursor.com/dashboard/usage" label="Cursor usage" icon={<Code2 className="h-4 w-4" aria-hidden />} tone="cursor" /> : null}
            <QuickLink href="https://github.com/mehmetdemircs/RepoSpend" label="GitHub repo" icon={<Github className="h-4 w-4" aria-hidden />} tone="github" />
            <QuickLink href="https://www.npmjs.com/package/repospend" label="npm package" icon={<NpmIcon />} tone="npm" />
          </div>
        </div>

        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <div>Read-only</div>
            <span>{data?.appVersion ? `v${data.appVersion} · local sources` : "local sources"}</span>
          </div>
          <button className="icon-button" onClick={rescanLocalLogs} title="Refresh" aria-label="Refresh local scan" type="button">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </aside>

      <section className="content-shell">
        <PageHeader
          view={activeView}
          data={data}
          filterNotice={hiddenFilterNotice}
          onRefresh={rescanLocalLogs}
          onResetFilters={() => {
            setRangePreset("last7");
            setFilters({ source: [], sourceApp: [], repo: [], model: [], ...presetRange("last7") });
            if (activeView === "repoDetail") {
              setSelectedRepo(null);
              setActiveView("repos");
            }
          }}
        />
        {filterBarVisible ? (
          <FiltersBar
            filters={filters}
            setFilters={setFilters}
            rangePreset={rangePreset}
            setRangePreset={setRangePreset}
            sources={sourceOptions}
            sourceApps={appOptions}
            repos={repoOptions}
            models={modelOptions}
            repoNavigationMode={activeView === "repoDetail"}
            selectedRepo={selectedRepo}
            onRepoNavigate={(repo) => openRepo(repo)}
            onRepoAll={() => {
              setSelectedRepo(null);
              setFilters((current) => ({ ...current, repo: [] }));
              setActiveView("repos");
            }}
          />
        ) : null}
        {!error && loading ? <LoadingState compact={Boolean(data)} data={data} /> : null}

        {error ? <ErrorState message={error} onRetry={rescanLocalLogs} /> : null}
        {!error && activeView === "dashboard" && !loading && data && data.sessions.length === 0 ? (
          <div className="mt-4 space-y-4">
            <DataHealthCard data={data} onOpenSettings={() => navigateToView("settings")} />
            <EmptyState data={data} onRefresh={rescanLocalLogs} />
          </div>
        ) : null}

        {!error && data && activeView === "settings" ? (
          <SettingsPage
            data={data}
            draft={pricingDraft}
            setDraft={setPricingDraft}
            status={pricingStatus}
            filterSortMode={filterSortMode}
            setFilterSortMode={setFilterSortMode}
            displaySettings={displaySettings}
            setDisplaySettings={updateDisplaySettings}
            onSave={async () => {
              setPricingStatus("Saving local pricing...");
              const saved = await savePricing(pricingDraft);
              setData({ ...data, pricing: saved });
              setPricingDraft(saved.models);
              setPricingStatus(`Saved pricing to ${saved.path ?? "local pricing file"}. Refreshing cost estimates...`);
              refetchDashboard();
            }}
            onReset={() => {
              setPricingDraft(data.pricing.models);
              setPricingStatus("Reset unsaved edits.");
            }}
            onSaveConfig={async (nextConfig) => {
              setPricingStatus("Saving local source settings...");
              const saved = await saveConfig(nextConfig);
              setData({ ...data, config: saved.config, configPath: saved.path });
              setPricingStatus(`Saved source settings to ${saved.path}. Refreshing local scan...`);
              refetchDashboard();
            }}
            onClearLocalData={async () => {
              setPricingStatus("Clearing RepoSpend local data...");
              const result = await clearLocalData();
              try {
                window.localStorage.removeItem("repospend.filterSortMode");
                window.localStorage.removeItem("repospend.displaySettings.v2");
              } catch {
                // Local browser preferences are optional.
              }
              setFilterSortMode(readFilterSortMode());
              setDisplaySettings(readDisplaySettings());
              setPricingStatus(`${result.removed ? "Removed" : "No local data found at"} ${result.path}. Refreshing local scan...`);
              refetchDashboard();
            }}
            onClearParseCache={async () => {
              setPricingStatus("Clearing RepoSpend parse cache...");
              const result = await clearParseCache();
              setPricingStatus(`${result.removed ? "Removed parse cache at" : "No parse cache found at"} ${result.path}. Refreshing full scan...`);
              refetchDashboard();
            }}
            onReviewUnpricedSessions={() => openSessionsWithSearch("cannot be priced")}
            onRescan={rescanLocalLogs}
          />
        ) : null}

        {!error && data && activeView === "insights" ? <InsightsPage data={data} onNavigate={navigateToView} onReviewUnpricedSessions={() => openSessionsWithSearch("cannot be priced")} /> : null}

        {!error && data && activeView === "sessions" ? (
          <SessionsPage
            data={data}
            displaySettings={displaySettings}
            setDisplaySettings={updateDisplaySettings}
            onOpenSession={openSession}
            searchIntent={sessionSearchIntent}
            onSearchIntentConsumed={clearSessionSearchIntent}
          />
        ) : null}

        {!error && data && activeView === "sessionDetail" ? (
          <SessionDetailPage
            session={findSessionById(filterOptionsData ?? data, selectedSessionId)}
            initialTab={sessionDetailInitialTab}
            onBack={() => navigateToView("sessions")}
          />
        ) : null}

        {!error && data && activeView === "repos" ? <ReposPage data={data} onSelectRepo={openRepo} selectedRepo={selectedRepo} displaySettings={displaySettings} setDisplaySettings={updateDisplaySettings} /> : null}

        {!error && data && activeView === "repoDetail" ? (
          <RepoDetailPage
            data={data}
            selectedRepo={selectedRepo}
            dateRangeLabel={rangeLabel(rangePreset, filters)}
            pageSize={displaySettings.tablePageSize}
            onBack={() => navigateToView("repos")}
            onOpenSession={openSession}
          />
        ) : null}

        {!error && data && activeView === "models" ? (
          <ModelsPage
            data={data}
            displaySettings={displaySettings}
            setDisplaySettings={updateDisplaySettings}
            onOpenRepo={openRepo}
            onOpenSession={openSession}
            onFilterModel={(modelId) => setFilters((current) => ({ ...current, model: [modelId] }))}
          />
        ) : null}

        {!error && data && activeView === "commands" ? <AgentFrictionPage data={data} onOpenRepo={openRepo} onOpenSession={openSession} displaySettings={displaySettings} setDisplaySettings={updateDisplaySettings} /> : null}

        {!error && data && activeView === "rtk" ? <RtkDashboard gain={data.rtkGain} pricing={data.pricing} displaySettings={displaySettings} /> : null}

        {!error && data && data.sessions.length > 0 && activeView === "dashboard" ? (
          <div className="mt-4 space-y-4">
            <OverviewKpis data={data} onOpenRepo={openRepo} />

            <div className="panel p-3">
              <div className="display-control-row">
                <Select
                  icon={<Calculator />}
                  label="Chart metric"
                  value={metric}
                  onChange={(value) => setMetric(value as MetricKey)}
                  options={metricOptions}
                />
                <LimitSelect
                  label="Chart groups"
                  value={displaySettings.chartGroupLimit}
                  options={chartLimitOptions}
                  onChange={(value) => updateDisplaySettings({ chartGroupLimit: value })}
                />
              </div>
            </div>

            <div className="overview-chart-stack">
              <MetricTimelinePanel data={data} metric={metric} />

              <div className="overview-chart-pair">
                <ChartPanel title={`Models: ${metricLabel(metric)}`} className="overview-chart-panel">
                  <ResponsiveContainer width="100%" height={284}>
                    <BarChart data={groupUsageForChart(data.models, metric, displaySettings.chartGroupLimit)} layout="vertical" margin={{ left: 16, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
                      <XAxis type="number" tickFormatter={(value) => metricTick(metric, Number(value))} tick={{ fill: "#94a3b8" }} />
                      <YAxis dataKey="label" type="category" width={170} tickFormatter={(value) => compactModelLabel(String(value))} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(value) => tooltipMetric(metric, Number(value))} />
                      <Bar dataKey={metric} name={metricLabel(metric)} fill="#6d5dfc" minPointSize={positiveBarMinPointSize} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel title={`${metricLabel(metric)} by repo`} className="overview-chart-panel">
                  <ResponsiveContainer width="100%" height={284}>
                    <BarChart data={groupUsageForChart(data.repos, metric, displaySettings.chartGroupLimit)} margin={{ left: 8, right: 8, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
                      <XAxis dataKey="label" angle={-30} textAnchor="end" height={70} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                      <YAxis tickFormatter={(value) => metricTick(metric, Number(value))} width={62} tick={{ fill: "#94a3b8" }} />
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(value) => tooltipMetric(metric, Number(value))} />
                      <Bar dataKey={metric} name={metricLabel(metric)} minPointSize={positiveBarMinPointSize}>
                        {groupUsageForChart(data.repos, metric, displaySettings.chartGroupLimit).map((repo) => (
                          <Cell key={repo.id} fill={stableEntityColor(repo.id)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </div>
            </div>

            <TopActionsCard data={data} onNavigate={navigateToView} onOpenRepo={openRepo} onOpenSession={openSession} />
            <SecondaryMetrics summary={data.summary} />
            <SourceBreakdownPanel data={data} />
            <TopRepositoriesSection data={data} onOpenRepos={() => navigateToView("repos")} onOpenRepo={openRepo} pageSize={displaySettings.tablePageSize} />
            <WasteSignalsSection data={data} onOpenSessions={() => navigateToView("sessions")} />
          </div>
        ) : null}
      </section>
    </main>
  );
}

function FiltersBar({
  filters,
  setFilters,
  rangePreset,
  setRangePreset,
  sources,
  sourceApps,
  repos,
  models,
  repoNavigationMode = false,
  selectedRepo,
  onRepoNavigate,
  onRepoAll,
}: {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  rangePreset: RangePreset;
  setRangePreset: (preset: RangePreset) => void;
  sources: PickerOption[];
  sourceApps: PickerOption[];
  repos: PickerOption[];
  models: PickerOption[];
  repoNavigationMode?: boolean;
  selectedRepo?: string | null;
  onRepoNavigate?: (repo: string) => void;
  onRepoAll?: () => void;
}) {
  const toggleFilter = (key: "source" | "sourceApp" | "repo" | "model", value: string) => {
    if (key === "repo" && repoNavigationMode) {
      if (!value) {
        onRepoAll?.();
      } else {
        onRepoNavigate?.(value);
      }
      return;
    }
    setFilters({ ...filters, [key]: toggleFilterValue(filters[key], value) });
  };
  const resetFilters = () => {
    setRangePreset("last7");
    setFilters({ source: [], sourceApp: [], repo: [], model: [], ...presetRange("last7") });
    if (repoNavigationMode) onRepoAll?.();
  };
  const updatePreset = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset !== "custom") {
      setFilters({ ...filters, ...presetRange(preset) });
    }
  };
  const displayedFilters = repoNavigationMode && selectedRepo ? { ...filters, repo: [selectedRepo] } : filters;
  if (repoNavigationMode && selectedRepo) {
    return (
      <div className="panel repo-compact-filters filter-panel">
        <div className="repo-compact-filter-row">
          <DateRangePicker value={rangePreset} onChange={updatePreset} />
          <FilterDropdown icon={<Bot />} iconKind="source" label="AI providers" values={filters.source} onChange={(value) => toggleFilter("source", value)} options={sources} />
          <FilterDropdown icon={<LayoutPanelTop />} iconKind="app" label="Apps / surfaces" values={filters.sourceApp} onChange={(value) => toggleFilter("sourceApp", value)} options={sourceApps} collapsedLimit={8} />
          <FilterDropdown icon={<BrainCircuit />} iconKind="model" label="Model" values={filters.model} onChange={(value) => toggleFilter("model", value)} options={models} collapsedLimit={10} align="end" />
          <details className="repo-more-filters">
            <summary>
              <Settings className="h-4 w-4" aria-hidden />
              More filters
            </summary>
            <div className="repo-more-filter-body">
              <FilterPillPicker icon={<FolderGit2 />} iconKind="repo" label="Scoped repo / folder" values={[selectedRepo]} onChange={(value) => toggleFilter("repo", value)} options={repos} />
              {rangePreset === "custom" ? (
                <div className="repo-custom-dates">
                  <DateInput label="From" value={dateInputValue(filters.from)} onChange={(value) => setFilters({ ...filters, from: value })} />
                  <DateInput label="To" value={dateInputValue(filters.to)} onChange={(value) => setFilters({ ...filters, to: value })} />
                </div>
              ) : (
                <div className="text-xs text-slate-500">{rangeLabel(rangePreset, filters)}</div>
              )}
              <ActiveFiltersSummary
                filters={displayedFilters}
                rangePreset={rangePreset}
                sources={sources}
                sourceApps={sourceApps}
                repos={repos}
                models={models}
                onClearValue={(key, value) => {
                  if (key === "repo") {
                    onRepoAll?.();
                    return;
                  }
                  setFilters({ ...filters, [key]: filters[key].filter((item) => item !== value) });
                }}
                onResetDate={() => {
                  setRangePreset("last7");
                  setFilters({ ...filters, ...presetRange("last7") });
                }}
                onResetAll={resetFilters}
              />
            </div>
          </details>
        </div>
        {rangePreset !== "custom" ? <div className="repo-filter-date-note">{rangeLabel(rangePreset, filters)}</div> : null}
      </div>
    );
  }
  return (
    <div className="panel p-3 filter-panel">
      <div className="filter-grid">
        <FilterDropdown icon={<Bot />} iconKind="source" label="AI providers" values={filters.source} onChange={(value) => toggleFilter("source", value)} options={sources} />
        <FilterDropdown icon={<LayoutPanelTop />} iconKind="app" label="Apps / surfaces" values={filters.sourceApp} onChange={(value) => toggleFilter("sourceApp", value)} options={sourceApps} collapsedLimit={8} />
        <FilterDropdown icon={<FolderGit2 />} iconKind="repo" label="Repos / folders" values={repoNavigationMode && selectedRepo ? [selectedRepo] : filters.repo} onChange={(value) => toggleFilter("repo", value)} options={repos} collapsedLimit={12} />
        <FilterDropdown icon={<BrainCircuit />} iconKind="model" label="Model" values={filters.model} onChange={(value) => toggleFilter("model", value)} options={models} collapsedLimit={10} align="end" />
        <DateRangePicker value={rangePreset} onChange={updatePreset} />
      </div>
      {rangePreset === "custom" ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <DateInput label="From" value={dateInputValue(filters.from)} onChange={(value) => setFilters({ ...filters, from: value })} />
          <DateInput label="To" value={dateInputValue(filters.to)} onChange={(value) => setFilters({ ...filters, to: value })} />
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-500">{rangeLabel(rangePreset, filters)}</div>
      )}
      <ActiveFiltersSummary
        filters={displayedFilters}
        rangePreset={rangePreset}
        sources={sources}
        sourceApps={sourceApps}
        repos={repos}
        models={models}
        onClearValue={(key, value) => {
          if (key === "repo" && repoNavigationMode) {
            onRepoAll?.();
            return;
          }
          setFilters({ ...filters, [key]: filters[key].filter((item) => item !== value) });
        }}
        onResetDate={() => {
          setRangePreset("last7");
          setFilters({ ...filters, ...presetRange("last7") });
        }}
        onResetAll={resetFilters}
      />
    </div>
  );
}

function PageHeader({
  view,
  data,
  filterNotice,
  onRefresh,
  onResetFilters,
}: {
  view: ViewKey;
  data: ApiData | null;
  filterNotice?: string | null;
  onRefresh: () => void;
  onResetFilters: () => void;
}) {
  const meta = viewMeta[view];
  return (
    <header className="page-header">
      <div className="page-title-lockup">
        <span className="page-title-icon">{React.cloneElement(viewIcons[view], { className: "h-5 w-5", "aria-hidden": true })}</span>
        <div>
          <h2>{meta.title}</h2>
          <p>{meta.subtitle}</p>
          {filterNotice ? (
            <div className="page-filter-notice" aria-label="Current dashboard filters">
              <span>{filterNotice}</span>
              <button className="text-button" type="button" onClick={onResetFilters}>Reset</button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="page-header-actions">
        <div className="page-header-badge" title={data?.scan.lastScannedAt ? `Last scanned ${formatDateTime(data.scan.lastScannedAt)}` : "Waiting for first scan"}>
          <span className="status-dot" />
          {data?.scan.lastScannedAt ? `Last scan ${formatDateTime(data.scan.lastScannedAt)}` : "Local-first · no telemetry"}
        </div>
        <button className="icon-button" onClick={onRefresh} title="Refresh local scan" aria-label="Refresh local scan" type="button">
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </header>
  );
}

function NavButton({ icon, label, active, onClick, badge }: { icon: React.ReactElement; label: string; active: boolean; onClick: () => void; badge?: string | undefined }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} type="button">
      {React.cloneElement(icon, { className: "h-4 w-4" })}
      <span>{label}</span>
      {badge ? <strong className="nav-badge">{badge}</strong> : null}
    </button>
  );
}

type TimelineGranularity = "day" | "hour";
type TimelineRow = UsageGroup & { chartLabel: string; fullLabel: string; chartValue: number };

function MetricTimelinePanel({ data, metric }: { data: ApiData; metric: MetricKey }) {
  const timeline = React.useMemo(() => buildMetricTimeline(data, metric), [data, metric]);
  const metricName = metricLabel(metric);

  return (
    <ChartPanel title={timeline.title} className="overview-chart-panel timeline-chart-panel">
      <div className="timeline-context-row">
        <TimelineContextItem label="Granularity" value={count(timeline.rows.length, timeline.granularity === "hour" ? "active hour" : "active day")} />
        <TimelineContextItem label="Peak" value={timeline.peak ? `${timeline.peak.fullLabel} · ${formatTimelineMetric(metric, timeline.peak.chartValue)}` : "No activity"} />
        <TimelineContextItem label="Average" value={formatTimelineMetric(metric, timeline.averageValue)} />
      </div>

      <ResponsiveContainer width="100%" height={timeline.sparse ? 232 : 248}>
        {timeline.sparse ? (
          <BarChart data={timeline.rows} margin={{ left: 8, right: 16, bottom: timeline.rows.length > 2 ? 34 : 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
            <XAxis dataKey="chartLabel" angle={timeline.rows.length > 2 ? -18 : 0} textAnchor={timeline.rows.length > 2 ? "end" : "middle"} height={timeline.rows.length > 2 ? 62 : 36} tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <YAxis tickFormatter={(value) => metricTick(metric, Number(value))} width={62} tick={{ fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              itemStyle={chartTooltipItemStyle}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""}
              formatter={(value) => tooltipMetric(metric, Number(value))}
            />
            <Bar dataKey="chartValue" name={metricName} radius={[5, 5, 0, 0]} minPointSize={positiveBarMinPointSize}>
              {timeline.rows.map((_, index) => (
                <Cell key={index} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        ) : (
          <LineChart data={timeline.rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
            <XAxis dataKey="chartLabel" tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <YAxis tickFormatter={(value) => metricTick(metric, Number(value))} width={62} tick={{ fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={chartTooltipLabelStyle}
              itemStyle={chartTooltipItemStyle}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""}
              formatter={(value) => tooltipMetric(metric, Number(value))}
            />
            <Legend />
            <Line type="monotone" dataKey="chartValue" name={metricName} stroke="#2dd4bf" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </ChartPanel>
  );
}

function TimelineContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="timeline-context-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildMetricTimeline(data: ApiData, metric: MetricKey): { title: string; granularity: TimelineGranularity; rows: TimelineRow[]; sparse: boolean; peak: TimelineRow | undefined; averageValue: number } {
  const dayRows = buildTimelineRows(data.days, metric, "day");
  const hourRows = buildTimelineRows(data.hours, metric, "hour");
  const useHours = dayRows.length <= 3 && hourRows.length >= 4;
  const granularity: TimelineGranularity = useHours ? "hour" : "day";
  const rows = useHours ? hourRows : dayRows;
  const peak = [...rows].sort((a, b) => b.chartValue - a.chartValue)[0];
  const averageValue = rows.length ? rows.reduce((sum, row) => sum + row.chartValue, 0) / rows.length : 0;
  const title = useHours ? `${metricLabel(metric)} by active hour` : rows.length <= 3 ? `${metricLabel(metric)} by active day` : `${metricLabel(metric)} over time`;
  return { title, granularity, rows, sparse: useHours || rows.length <= 3, peak, averageValue };
}

function buildTimelineRows(groups: UsageGroup[], metric: MetricKey, granularity: TimelineGranularity): TimelineRow[] {
  return [...groups]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((group) => ({
      ...group,
      chartLabel: granularity === "hour" ? formatHourBucket(group.id, "short") : formatDayBucket(group.id, "short"),
      fullLabel: granularity === "hour" ? formatHourBucket(group.id, "long") : formatDayBucket(group.id, "long"),
      chartValue: timelineMetricValue(group, metric),
    }));
}

function timelineMetricValue(group: UsageGroup, metric: MetricKey): number {
  return metric === "estimatedCostUsd" ? group.estimatedCostUsd ?? 0 : group[metric];
}

function formatTimelineMetric(metric: MetricKey, value: number): string {
  return metric === "estimatedCostUsd" ? money(value) : tokens(Math.round(value));
}

function formatDayBucket(value: string, length: "short" | "long"): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, length === "short" ? { month: "short", day: "numeric" } : { dateStyle: "medium" });
}

function formatHourBucket(value: string, length: "short" | "long"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, length === "short" ? { month: "short", day: "numeric", hour: "numeric" } : { dateStyle: "medium", timeStyle: "short" });
}

function OverviewKpis({ data, onOpenRepo }: { data: ApiData; onOpenRepo: (repoId: string) => void }) {
  const summary = data.summary;
  const hasKnownCost = summary.knownCostSessions > 0;
  const topRepo = data.repos[0];
  const commandIssueRate = summary.shellCommandCount > 0 ? summary.importantCommandFailures / summary.shellCommandCount : 0;
  const costTierBadge = overviewServiceTierBadge(data);
  const items: Array<{ label: string; value: React.ReactNode; detail?: React.ReactNode; icon: React.ReactElement; strong?: boolean; help?: React.ReactNode }> = [
    {
      label: "Total Tokens",
      value: <TokenValue value={summary.totalTokens} />,
      detail: summary.skippedZeroTokenSessions > 0
        ? <span title={`${countExact(summary.sessionCount, "session")}, ${countExact(summary.skippedZeroTokenSessions, "zero-token session")} skipped`}>{count(summary.sessionCount, "session")}, {count(summary.skippedZeroTokenSessions, "zero-token session")} skipped</span>
        : <CountValue value={summary.sessionCount} noun="session" />,
      icon: <Database />,
      strong: true,
      help: (
        <MetricHelpPopover
          title="Total tokens"
          mainValue={tokens(summary.totalTokens)}
          body="Total token usage loaded from local AI provider sessions in the current dashboard filter."
          note="RepoSpend avoids overcounting cumulative Codex token checkpoints by using the final valid checkpoint per session where available."
          breakdown={[
            { label: "Input", value: tokens(summary.inputTokens) },
            { label: "Cached input", value: tokens(summary.cachedInputTokens) },
            { label: "Output", value: tokens(summary.outputTokens) },
            { label: "Reasoning", value: tokens(summary.reasoningTokens) },
          ]}
        />
      ),
    },
    {
      label: "API-equivalent Cost",
      value: <CostValue value={summary.estimatedCostUsd} label={hasKnownCost ? money(summary.estimatedCostUsd) : "Needs token split"} />,
      detail: (
        <span className="kpi-detail-stack">
          <span>Estimate only. Not your actual subscription bill.</span>
          {costTierBadge}
        </span>
      ),
      icon: <CircleDollarSign />,
      strong: true,
      help: <CostBreakdownPopover value={summary.estimatedCostUsd} breakdown={summary} />,
    },
    {
      label: "Top repo / folder",
      value: topRepo ? <button className="kpi-link" type="button" onClick={() => onOpenRepo(topRepo.id)}>{topRepo.label}</button> : "No repo or folder",
      detail: topRepo ? <span><TokenValue value={topRepo.totalTokens} /> · <CostValue value={topRepo.estimatedCostUsd} /></span> : "No repo or folder usage in this view",
      icon: <FolderGit2 />,
      strong: true,
    },
    {
      label: "Possible Failed Command Rate",
      value: <PercentValue value={commandIssueRate} />,
      detail: summary.shellCommandCount > 0 ? `${count(summary.importantCommandFailures, "flagged command")} of ${count(summary.shellCommandCount, "command")}` : "No shell commands detected",
      icon: <TriangleAlert />,
      help: (
        <MetricHelpPopover
          title="Possible failed command rate"
          mainValue={percent(commandIssueRate)}
          body="Share of detected shell commands that RepoSpend classified as blocking, repeated, or token-expensive failures."
          note="Harmless non-zero exits such as search misses and file-existence probes are not counted here."
          breakdown={[
            { label: "Flagged commands", value: count(summary.importantCommandFailures, "command") },
            { label: "Shell commands", value: count(summary.shellCommandCount, "command") },
            { label: "Harmless exits", value: count(summary.harmlessNonZeroEvents + summary.exploratoryMisses, "event") },
          ]}
        />
      ),
    },
  ];
  return (
    <div className="primary-kpi-grid">
      {items.map((item) => (
        <div className={`panel kpi-card ${item.strong ? "kpi-card-strong" : ""}`} key={item.label}>
          <div className="flex items-center justify-between gap-3">
            <span className="kpi-label">{item.label}{item.help}</span>
            <span className="kpi-icon">{React.cloneElement(item.icon, { className: "h-4 w-4" })}</span>
          </div>
          <div className="kpi-value">
            {item.value}
          </div>
          {item.detail ? <div className="kpi-detail">{item.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

function overviewServiceTierBadge(data: ApiData): React.ReactNode {
  const codex = data.sourceStats.find((source) => source.sourceId === "codex" && source.serviceTier);
  if (codex?.serviceTier) {
    return (
      <Badge
        label={`Codex ${serviceTierLabel(codex.serviceTier)} config`}
        title={codex.serviceTierDetail ?? "Current Codex config service tier. Historical Codex sessions do not reliably store this per session."}
        tone={serviceTierTone(codex.serviceTier)}
      />
    );
  }

  const claude = data.sourceStats.find((source) => source.sourceId === "claude" && source.serviceTier);
  if (!claude?.serviceTier) return null;
  return (
    <Badge
      label={`Claude ${serviceTierLabel(claude.serviceTier)} observed`}
      title={claude.serviceTierDetail ?? "Claude service tier observed in local usage records."}
      tone={serviceTierTone(claude.serviceTier)}
    />
  );
}

function sessionServiceTierMetadata(session: Session): React.ReactNode {
  if (session.serviceTier) {
    return (
      <Badge
        label={serviceTierLabel(session.serviceTier)}
        title={session.serviceTierDetail}
        tone={serviceTierTone(session.serviceTier)}
      />
    );
  }
  if (session.sourceClient === "codex") return "Not recorded per session";
  return "Unknown";
}

function serviceTierLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized === "mixed") return "Mixed";
  if (normalized === "fast") return "Fast";
  if (normalized === "priority") return "Priority";
  if (normalized === "standard") return "Standard";
  return normalized.split(/[-_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function serviceTierTone(value: string): BadgeTone {
  const normalized = value.trim().toLowerCase();
  return normalized === "fast" || normalized === "mixed" ? "warning" : "info";
}

function TopActionsCard({ data, onNavigate, onOpenRepo, onOpenSession }: { data: ApiData; onNavigate: (view: ViewKey) => void; onOpenRepo: (repoId: string) => void; onOpenSession: (sessionId: string, initialTab?: SessionDetailTab) => void }) {
  const actions = topDashboardActions(data);
  if (!actions.length) return null;
  return (
    <section className="panel top-actions-card">
      <div className="panel-heading">
        <div>
          <h2>Start here</h2>
          <p className="text-sm text-slate-600">Highest-leverage checks for the current filters.</p>
        </div>
      </div>
      <div className="top-actions-list">
        {actions.map((action) => (
          <button
            className="top-action-row"
            key={action.label}
            type="button"
            onClick={() => {
              if (action.sessionId) onOpenSession(action.sessionId, action.sessionTab);
              else if (action.repoId) onOpenRepo(action.repoId);
              else onNavigate(action.view);
            }}
          >
            <span className={`top-action-icon top-action-${action.tone}`}>{React.cloneElement(action.icon, { className: "h-4 w-4", "aria-hidden": true })}</span>
            <span>
              <strong>{action.label}</strong>
              <small>{action.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SecondaryMetrics({ summary }: { summary: Summary }) {
  const sessionsWithFileEdits = Math.max(summary.sessionCount - summary.noCodeChangeSessions, 0);
  const usefulPct = summary.sessionCount > 0 ? sessionsWithFileEdits / summary.sessionCount : 0;
  return (
    <div className="secondary-metric-grid">
      <MiniStat label="Sessions" value={<CountValue value={summary.sessionCount} noun="session" />} />
      <MiniStat label="File-edit sessions" value={<CountValue value={sessionsWithFileEdits} noun="session" />} detail={summary.sessionCount > 0 ? `${percent(usefulPct)} of sessions` : "No sessions in this view"} />
      <MiniStat label="Total input tokens" value={<TokenValue value={summary.inputTokens} />} />
      <MiniStat label="Output tokens" value={<TokenValue value={summary.outputTokens} />} />
      <MiniStat label="Reasoning tokens" value={<TokenValue value={summary.reasoningTokens} />} />
      <MiniStat
        label="Cached input %"
        value={<PercentValue value={summary.cachedInputPct} />}
        help={(
          <MetricHelpPopover
            title="Cached input percentage"
            mainValue={percent(summary.cachedInputPct)}
            body="How much of the input token volume Codex reported as cached input in the current filter."
            note="Cached input can reduce API-equivalent cost depending on the local pricing table."
            breakdown={[
              { label: "Cached input", value: tokens(summary.cachedInputTokens) },
              { label: "Total input", value: tokens(summary.inputTokens) },
            ]}
          />
        )}
      />
      <MiniStat label="Files edited" value={<CountValue value={summary.fileEditCount} noun="file" />} />
      <MiniStat label="Commands run" value={<CountValue value={summary.shellCommandCount} noun="command" />} />
    </div>
  );
}

function SourceBreakdownPanel({ data }: { data: ApiData }) {
  const [tab, setTab] = React.useState<BreakdownTab>("providers");
  const rows = usageBreakdownRows(data, tab).filter((row) => row.sessionCount > 0 || row.totalTokens > 0 || row.estimatedCostUsd !== undefined);
  const tabs: Array<{ value: BreakdownTab; label: string }> = [
    { value: "providers", label: "AI providers" },
    { value: "apps", label: "Apps / surfaces" },
  ];
  return (
    <section className="panel source-breakdown-panel">
      <div className="panel-heading breakdown-heading">
        <div className="breakdown-heading-text">
          <h2>{tabs.find((item) => item.value === tab)?.label ?? "AI providers"}</h2>
          <p className="text-sm text-slate-600">Providers scanned: {data.sources.map((source) => source.label).join(", ")}</p>
        </div>
        <div className="breakdown-tabs" role="tablist" aria-label="Usage breakdown">
          {tabs.map((item) => (
            <button className={tab === item.value ? "active" : ""} key={item.value} type="button" onClick={() => setTab(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="source-breakdown-grid">
        {rows.map((row) => (
          <div className="source-breakdown-row" key={row.id}>
            {row.source ? <SourceBadge source={row.source} label={row.label} /> : <AppLabel app={row.iconLabel ?? row.label} surface={row.id as Session["detectedSurface"]} />}
            <MiniStat label="Sessions" value={<CountValue value={row.sessionCount} noun="session" />} />
            <MiniStat label="Tokens" value={<TokenValue value={row.totalTokens} />} />
            <MiniStat label="API-equivalent cost" value={<CostValue value={row.estimatedCostUsd} label={breakdownCostLabel(row)} />} />
            <MiniStat label="Missing token data" value={<CountValue value={row.missingTokenSessions} noun="session" />} />
          </div>
        ))}
        {!rows.length ? <p className="p-2 text-sm text-slate-600">No token-bearing usage in this breakdown for the current filter.</p> : null}
      </div>
      {data.sources.some((source) => source.id === "claude" && source.available) ? (
        <p className="source-note">Claude Code data found, but token details may be incomplete depending on local files. Cost is API-equivalent where token counts and pricing are available.</p>
      ) : null}
    </section>
  );
}

function DataHealthCard({ data, onOpenSettings }: { data: ApiData; onOpenSettings: () => void }) {
  const sourceLabels = data.sources.filter((source) => source.available).map((source) => source.label).join(", ") || "No active providers";
  const confidence = data.confidence;
  return (
    <section className="panel data-health-card">
      <div className="data-health-main">
        <div className="flex items-start gap-3">
          <Info className="mt-1 h-5 w-5 text-teal" aria-hidden />
          <div>
            <h2>Data Health</h2>
            <p>RepoSpend reads local logs only. No telemetry, no cloud sync, no login.</p>
          </div>
        </div>
        <button className="button" type="button" onClick={onOpenSettings}>View data sources</button>
      </div>
      <div className="data-health-grid">
        <MiniStat label="Data confidence" value={`${confidence.label} (${confidence.score}/100)`} />
        <MiniStat label="Token coverage" value={<PercentValue value={confidence.tokenDataPct} />} />
        <MiniStat label="Pricing coverage" value={<PercentValue value={confidence.pricingCoveragePct} />} />
        <MiniStat label="Sessions scanned" value={<CountValue value={data.scan.sessionFileCount} noun="file" />} />
        <MiniStat label="Repos / folders discovered" value={<CountValue value={data.scan.repoCount} noun="item" />} />
        <MiniStat label="Parser issues" value={data.scan.parseFailureCount ? <CountValue value={data.scan.parseFailureCount} noun="issue" /> : "No parser issues found"} />
        <MiniStat label="Last scan" value={formatDateTime(data.scan.lastScannedAt)} />
        <MiniStat label="AI providers" value={sourceLabels} />
      </div>
      {confidence.issues.length ? (
        <div className="confidence-issue-list compact-confidence-list">
          {confidence.issues.slice(0, 3).map((issue) => (
            <div className="confidence-issue-row" key={issue.id}>
              <Badge label={issue.tone} />
              <span>{issue.title}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TokenAccuracyCard({ data }: { data: ApiData }) {
  const stats = tokenStats(data);
  return (
    <section className="panel token-accuracy-card">
      <div className="token-accuracy-main">
        <div className="flex items-start gap-3">
          <Database className="mt-1 h-5 w-5 text-teal" aria-hidden />
          <div>
            <h2>Token Counting</h2>
            <p>Using provider-specific token records without summing repeated cumulative checkpoints.</p>
            <p className="mt-1 text-xs text-slate-500">
              Codex token_count events may be cumulative. RepoSpend avoids overcounting by using the final valid checkpoint per session when cumulative checkpoints are detected.
            </p>
          </div>
        </div>
      </div>
      <div className="token-accuracy-grid">
        <MiniStat
          label="Aggregation"
          value={stats.methodLabel}
          help={(
            <MetricHelpPopover
              title="Token aggregation method"
              mainValue={stats.methodLabel}
              body="How RepoSpend counted tokens for the sessions in this view."
              note="A token checkpoint is a Codex token_count reading captured during a session. Because these readings may be cumulative, RepoSpend prefers the final valid checkpoint instead of summing repeated readings."
              breakdown={[
                { label: "Checkpoints parsed", value: count(stats.tokenSnapshots, "checkpoint") },
                { label: "Sessions with token data", value: count(stats.sessionsWithTokenData, "session") },
                { label: "Missing token data", value: count(stats.sessionsMissingTokenData, "session") },
              ]}
            />
          )}
        />
        <MiniStat label="Confidence" value={stats.confidenceLabel} />
        <MiniStat label="Token checkpoints" value={<CountValue value={stats.tokenSnapshots} noun="checkpoint" />} />
        <MiniStat label="Sessions with token data" value={<CountValue value={stats.sessionsWithTokenData} noun="session" />} />
        <MiniStat label="Missing token data" value={<CountValue value={stats.sessionsMissingTokenData} noun="session" />} />
      </div>
    </section>
  );
}

function TopRepositoriesSection({ data, onOpenRepos, onOpenRepo, pageSize }: { data: ApiData; onOpenRepos: () => void; onOpenRepo: (repoId: string) => void; pageSize: number }) {
  const rows = repoRows(data).slice(0, Math.min(pageSize, 10));
  return (
    <section className="panel overflow-hidden">
      <div className="panel-heading">
        <div>
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-teal" aria-hidden />
            <h2>Top repos / folders</h2>
          </div>
          <p className="text-sm text-slate-600">Repo/folder-level usage is the main RepoSpend view: tokens, API-equivalent cost, sessions, edits, command friction, and token intensity.</p>
        </div>
        <button className="button" type="button" onClick={onOpenRepos}>Open repos / folders</button>
      </div>
      <div className="p-4">
        {rows.length ? <RepoTable repos={rows} onSelect={onOpenRepo} selectedRepo={null} compact pageSize={Math.min(pageSize, 10)} /> : <p className="text-sm text-slate-600">No repos or folders matched this filter.</p>}
      </div>
    </section>
  );
}

function RtkDashboard({ gain, pricing, displaySettings }: { gain: RtkGain; pricing: PricingResponse; displaySettings: DisplaySettings }) {
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);
  const topSavingsCommands = gain.rtkTopSavingsCommands ?? gain.topCommands;
  const recentActivity = gain.rtkRecentActivity ?? gain.recentCommands;
  const coverageGaps = gain.rtkCoverageGaps ?? [];
  const unhandledCommands = gain.rtkUnhandledCommands ?? [];
  const commandsProcessed = gain.rtkCommandsProcessed ?? gain.totalCommands;
  const savingsRateValue = gain.rtkSavingsRate ?? gain.savedPercent;
  const tokensSaved = gain.rtkTokensSaved ?? gain.tokensSaved;
  const averageCommandRuntime = gain.rtkAverageCommandRuntime ?? gain.averageExecTime;
  const avoidedTokens = parseTokenAmount(tokensSaved);
  const withoutRtkTokens = parseTokenAmount(gain.inputTokens) ?? ((parseTokenAmount(gain.outputTokens) ?? 0) + (avoidedTokens ?? 0) || undefined);
  const withRtkTokens = parseTokenAmount(gain.outputTokens) ?? (withoutRtkTokens !== undefined && avoidedTokens !== undefined ? Math.max(withoutRtkTokens - avoidedTokens, 0) : undefined);
  const avoidedCost = estimateAvoidedCostUsd(avoidedTokens, pricing);
  const topCommandNames = topSavingsCommands.slice(0, 3).map((command) => readableCommandName(command.command));
  const topSavingCommand = sortedRtkCommands(topSavingsCommands, { key: "saved", direction: "desc" })[0];
  const summaryItems = [
    avoidedTokens !== undefined && commandsProcessed !== undefined ? `RTK avoided about ${tokens(avoidedTokens)} across ${count(commandsProcessed, "command")}.` : undefined,
    topCommandNames.length ? `Most savings came from ${listText(topCommandNames)}.` : undefined,
    savingsRateValue !== undefined ? `Average command reduction was ${savingsRateValue.toFixed(1)}%.` : undefined,
    averageCommandRuntime ? `Average command runtime was ${averageCommandRuntime}.` : undefined,
    topSavingCommand?.command ? `Top saving command: ${readableCommandName(topSavingCommand.command)}.` : undefined,
  ].filter(Boolean);
  const recommendedActions = rtkRecommendedActions({
    gain,
    topCommand: topSavingCommand,
    commandsProcessed,
    savingsRate: savingsRateValue,
    coverageGaps,
  });

  if (!gain.available) {
    return (
      <section className="mt-4 space-y-4">
        <RtkHealthBanner gain={gain} />
        <RtkInstallGuide />
        <RtkExplainer />
        <RtkStatusSection gain={gain} />
      </section>
    );
  }

  return (
    <section className="mt-4 space-y-4">
      <RtkHealthBanner gain={gain} />
      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>RTK Insights</h2>
            <p className="text-sm text-slate-600">Token savings from RTK command proxy.</p>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Tokens avoided" value={avoidedTokens === undefined ? tokensSaved ?? "Unknown" : <TokenValue value={avoidedTokens} />} />
            <MiniStat
              label="Estimated cost avoided"
              value={avoidedCost === undefined ? "Unavailable" : money(avoidedCost)}
              help={(
                <MetricHelpPopover
                  title="Estimated cost avoided"
                  mainValue={avoidedCost === undefined ? "Unavailable" : money(avoidedCost)}
                  body="Approximate API-equivalent cost avoided from RTK-compressed command output."
                  note="This is an estimate from avoided input-context tokens and local pricing assumptions, not a bill or billing credit."
                  breakdown={[
                    { label: "Tokens avoided", value: avoidedTokens === undefined ? "Unavailable" : tokens(avoidedTokens) },
                    { label: "Assumed rate", value: `$${rtkAvoidedCostRate(pricing).toFixed(2)} / 1M input tokens` },
                  ]}
                  footer={<a className="text-button" href="/settings">View pricing assumptions</a>}
                />
              )}
            />
            <MiniStat
              label="Average reduction"
              value={savingsRateValue === undefined ? "Unknown" : `${savingsRateValue.toFixed(1)}%`}
              help={(
                <MetricHelpPopover
                  title="Average reduction"
                  mainValue={savingsRateValue === undefined ? "Unknown" : `${savingsRateValue.toFixed(1)}%`}
                  body="RTK savings rate comes from the local rtk gain report."
                  note="This is an estimate of avoided LLM context tokens, not a billing credit or invoice adjustment."
                  breakdown={[
                    { label: "Estimated tokens saved", value: tokensSaved ?? "Unavailable" },
                    { label: "Commands processed", value: commandsProcessed === undefined ? "Unknown" : count(commandsProcessed, "command") },
                  ]}
                />
              )}
            />
            <MiniStat label="Optimised commands" value={commandsProcessed === undefined ? "Unknown" : <CountValue value={commandsProcessed} noun="command" />} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RtkImpactCard withoutRtkTokens={withoutRtkTokens} withRtkTokens={withRtkTokens} avoidedTokens={avoidedTokens} savingsRate={savingsRateValue} />
        <div className="panel p-4">
          <div className="panel-inline-heading">
            <Info className="h-4 w-4 text-teal" aria-hidden />
            <h2>Plain English summary</h2>
          </div>
          {summaryItems.length ? (
            <ul className="plain-summary-list mt-3">
              {summaryItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-600">The current local RTK report does not include enough summary data yet.</p>}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Top RTK Commands</h2>
            <p className="text-sm text-slate-600">Commands where RTK changed token volume the most.</p>
          </div>
        </div>
        <div className="p-4">
          {topSavingsCommands.length ? <RtkCommandTable commands={topSavingsCommands} pageSize={displaySettings.tablePageSize} /> : <p className="text-sm text-slate-600">No RTK command savings breakdown reported.</p>}
        </div>
      </div>

      <RtkFollowUpGrid gain={gain} actions={recommendedActions} />

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="panel overflow-hidden">
          <div className="panel-heading">
            <h2>Recent RTK Activity</h2>
            <span className="text-xs text-slate-500">Latest local RTK command history</span>
          </div>
          <div className="p-4">
            {recentActivity.length ? <RecentCommandList commands={recentActivity} /> : <p className="text-sm text-slate-600">No recent RTK activity reported.</p>}
          </div>
        </div>
        <RtkUnhandledCommands commands={unhandledCommands} />
      </div>

      <RtkExplainer />
      <RtkStatusSection gain={gain} />

      <details className="panel overflow-hidden">
        <summary className="advanced-summary">Developer details</summary>
        <div className="developer-details-actions">
          <button className="button" type="button" onClick={() => copyText(gain.raw, setCopyStatus)}>
            <Copy className="h-4 w-4" aria-hidden />
            Copy raw report
          </button>
          <button className="button" type="button" onClick={() => downloadText("repospend-rtk-report.txt", gain.raw)}>
            <Download className="h-4 w-4" aria-hidden />
            Download raw report
          </button>
          {copyStatus ? <span className="text-xs text-slate-500">{copyStatus}</span> : null}
        </div>
        <pre className="raw-output">{gain.raw}</pre>
      </details>
    </section>
  );
}

function RtkFollowUpGrid({ gain, actions }: { gain: RtkGain; actions: string[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <RtkCoverageGaps gain={gain} />
      <RtkRecommendedActions actions={actions} />
    </div>
  );
}

function RtkStatusSection({ gain }: { gain: RtkGain }) {
  return (
    <div className="panel p-4">
      <div className="panel-inline-heading">
        <Command className="h-4 w-4 text-plum" aria-hidden />
        <h2>Diagnostics</h2>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <MiniStat label="RTK detected" value={(gain.rtkDetected ?? gain.available) ? "Detected" : "Not detected"} />
        <MiniStat label="RTK version" value={gain.rtkVersion ?? "Unknown"} />
        <MiniStat label="Codex hook" value={rtkHookLabel(gain.rtkCodexHookStatus)} />
        <MiniStat label="Last RTK activity" value={gain.rtkLastActivityAt ? formatDateTime(gain.rtkLastActivityAt) : "Unknown"} />
        <MiniStat label="Data source" value={gain.rtkDataSource ?? "rtk gain output unavailable"} />
      </div>
      {!gain.rtkVersion ? <p className="mt-2 text-xs text-slate-500">RTK version is unavailable because the local report did not expose it or `rtk --version` could not be read.</p> : null}
      {gain.rtkCodexHookStatus === "unknown" || gain.rtkCodexHookStatus === undefined ? <p className="mt-1 text-xs text-slate-500">Codex hook status is unknown because the current local RTK report does not expose hook state.</p> : null}
    </div>
  );
}

function RtkHealthBanner({ gain }: { gain: RtkGain }) {
  const detected = gain.available && (gain.rtkDetected ?? true);
  return (
    <div className={`panel rtk-health-banner ${detected ? "rtk-health-good" : "rtk-health-critical"}`}>
      <div className="flex items-start gap-3">
        {detected ? <Info className="mt-1 h-5 w-5" aria-hidden /> : <TriangleAlert className="mt-1 h-5 w-5" aria-hidden />}
        <div>
          <h2>{detected ? "RTK detected" : "RTK is not detected"}</h2>
          <p>
            {detected
              ? "RepoSpend can read local RTK activity, so token-savings insights are available."
              : "RepoSpend cannot find RTK data on this machine. Install RTK and connect it to your AI tool to track how many tokens it saves on command output."}
          </p>
          {!detected ? <p className="mt-1 text-xs">Try running <code>rtk gain --history</code> in your terminal to confirm RTK is installed and producing a local report.</p> : null}
          {detected && gain.rtkCodexHookStatus === "unknown" ? <p className="mt-1 text-xs">Codex hook status is unknown from the current RTK report.</p> : null}
        </div>
      </div>
    </div>
  );
}

type OsPlatform = "windows" | "unix";

function detectOs(): OsPlatform {
  return navigator.userAgent.toLowerCase().includes("win") ? "windows" : "unix";
}

const rtkInitOptions: Array<{ tool: string; cmd: string }> = [
  { tool: "Claude Code / Copilot", cmd: "rtk init -g" },
  { tool: "Gemini CLI", cmd: "rtk init -g --gemini" },
  { tool: "Codex", cmd: "rtk init -g --codex" },
  { tool: "Windsurf", cmd: "rtk init --agent windsurf" },
  { tool: "Cline / Roo Code", cmd: "rtk init --agent cline" },
  { tool: "Kilo Code", cmd: "rtk init --agent kilocode" },
  { tool: "Google Antigravity", cmd: "rtk init --agent antigravity" },
  { tool: "Hermes", cmd: "rtk init --agent hermes" },
];

function RtkInstallGuide() {
  const [os, setOs] = React.useState<OsPlatform>(detectOs);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    }).catch(() => {});
  }

  const installCmd = os === "windows"
    ? "winget install -e --id rtk-ai.rtk"
    : "curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh";

  return (
    <div className="panel p-4">
      <div className="panel-inline-heading">
        <Download className="h-4 w-4 text-teal" aria-hidden />
        <h2>Install RTK</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">RTK is a single binary with no dependencies. Three steps to enable token savings tracking.</p>

      <div className="breakdown-tabs mt-3">
        <button type="button" className={os === "windows" ? "active" : ""} onClick={() => setOs("windows")}>Windows</button>
        <button type="button" className={os === "unix" ? "active" : ""} onClick={() => setOs("unix")}>macOS / Linux</button>
      </div>

      <ol className="mt-4 space-y-5">
        <li>
          <p className="text-sm font-medium text-slate-400">1. Install the binary</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="rtk-install-cmd">{installCmd}</code>
            <button type="button" className="button shrink-0" onClick={() => copy(installCmd, "install")}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copiedKey === "install" ? "Copied" : "Copy"}
            </button>
          </div>
        </li>

        <li>
          <p className="text-sm font-medium text-slate-400">2. Wire up your AI tool</p>
          <div className="mt-1.5 space-y-1.5">
            {rtkInitOptions.map(({ tool, cmd }) => (
              <div key={cmd} className="rtk-init-row">
                <span className="rtk-tool-label">{tool}</span>
                <code className="rtk-install-cmd">{cmd}</code>
                <button type="button" className="button shrink-0" onClick={() => copy(cmd, cmd)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copiedKey === cmd ? "Copied" : "Copy"}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Restart your AI tool after running the relevant command.</p>
        </li>

        <li>
          <p className="text-sm font-medium text-slate-400">3. Verify</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="rtk-install-cmd">rtk gain</code>
            <button type="button" className="button shrink-0" onClick={() => copy("rtk gain", "verify")}>
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copiedKey === "verify" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">If you see token stats, RTK is working. Refresh this page to load your data.</p>
        </li>
      </ol>
    </div>
  );
}

function RtkExplainer() {
  return (
    <div className="panel p-4">
      <div className="panel-inline-heading">
        <Info className="h-4 w-4 text-teal" aria-hidden />
        <h2>What RTK does</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        RTK wraps common developer commands and compresses their output before it reaches the LLM context. RepoSpend reads local RTK activity and estimates how many tokens were avoided.
      </p>
    </div>
  );
}

function RtkImpactCard({
  withoutRtkTokens,
  withRtkTokens,
  avoidedTokens,
  savingsRate,
}: {
  withoutRtkTokens: number | undefined;
  withRtkTokens: number | undefined;
  avoidedTokens: number | undefined;
  savingsRate: number | undefined;
}) {
  const maxValue = Math.max(withoutRtkTokens ?? 0, withRtkTokens ?? 0, avoidedTokens ?? 0);
  return (
    <div className="panel p-4">
      <div className="panel-inline-heading">
        <ChartNoAxesCombined className="h-4 w-4 text-plum" aria-hidden />
        <h2>RTK Impact</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">Command output tokens before RTK compression versus the smaller output sent onward.</p>
      <div className="rtk-impact-stats">
        <MiniStat label="Before RTK" value={withoutRtkTokens === undefined ? "Unavailable" : <TokenValue value={withoutRtkTokens} />} />
        <MiniStat label="After RTK" value={withRtkTokens === undefined ? "Unavailable" : <TokenValue value={withRtkTokens} />} />
        <MiniStat label="Saved" value={avoidedTokens === undefined ? "Unavailable" : <TokenValue value={avoidedTokens} />} />
      </div>
      <div className="rtk-impact-bars">
        <RtkImpactBar label="Original command output" value={withoutRtkTokens} maxValue={maxValue} tone="before" />
        <RtkImpactBar label="RTK output sent" value={withRtkTokens} maxValue={maxValue} tone="after" />
        <RtkImpactBar label="Avoided tokens" value={avoidedTokens} maxValue={maxValue} tone="saved" />
      </div>
      <div className="rtk-impact-footer">
        <span>Reduction</span>
        <strong>{savingsRate === undefined ? "Unavailable" : `${savingsRate.toFixed(1)}%`}</strong>
      </div>
    </div>
  );
}

function RtkImpactBar({ label, value, maxValue, tone }: { label: string; value: number | undefined; maxValue: number; tone: "before" | "after" | "saved" }) {
  const width = value !== undefined && maxValue > 0 ? Math.max(2, (value / maxValue) * 100) : 0;
  return (
    <div className="rtk-impact-row">
      <div className="rtk-impact-label">
        <span>{label}</span>
        <strong>{value === undefined ? "Unavailable" : tokens(value)}</strong>
      </div>
      <div className={`rtk-impact-track rtk-impact-${tone}`}>
        {value === undefined ? null : <div style={{ width: `${Math.min(width, 100)}%` }} />}
      </div>
    </div>
  );
}

function RtkRecommendedActions({ actions }: { actions: string[] }) {
  return (
    <div className="panel p-4">
      <div className="panel-inline-heading">
        <TriangleAlert className="h-4 w-4 text-amber-400" aria-hidden />
        <h2>Recommended next actions</h2>
      </div>
      {actions.length ? (
        <ul className="action-list mt-3">
          {actions.map((action) => <li key={action}>{action}</li>)}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-600">No RTK follow-up actions found from this report.</p>
      )}
    </div>
  );
}

function RtkCoverageGaps({ gain }: { gain: RtkGain }) {
  const gaps = gain.rtkCoverageGaps ?? [];
  return (
    <div className="panel overflow-hidden">
      <div className="panel-heading">
        <div>
          <h2>RTK Coverage Gaps</h2>
          <p className="text-sm text-slate-600">Commands found by local <code>rtk discover --all --since 7</code> that could be routed through RTK.</p>
        </div>
        <span className="text-xs text-slate-500">{gain.rtkDiscoverSummary ?? "Local discovery"}</span>
      </div>
      <div className="p-4">
        {gaps.length ? (
          <div className="table-wrap">
            <table className="compact-table rtk-coverage-table">
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Runs</th>
                  <th>Use RTK</th>
                  <th>Saveable tokens</th>
                </tr>
              </thead>
              <tbody>
                {gaps.slice(0, 8).map((gap) => (
                  <tr key={`${gap.command}-${gap.rtkEquivalent}`}>
                    <td className="font-mono text-xs" title={gap.command}>{gap.command}</td>
                    <td>{gap.count === undefined ? "Unknown" : <CountValue value={gap.count} noun="run" />}</td>
                    <td>{gap.rtkEquivalent ?? "Unknown"}</td>
                    <td>{gap.estimatedSavings ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            {gain.rtkDiscoverAvailable === false
              ? `Coverage discovery could not run locally${gain.rtkDiscoverError ? `: ${gain.rtkDiscoverError}` : "."}`
              : "No RTK coverage gaps were reported by local discovery."}
          </p>
        )}
      </div>
    </div>
  );
}

function RtkUnhandledCommands({ commands }: { commands: RtkUnhandledCommand[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-heading">
        <div>
          <h2>Unhandled Commands</h2>
          <p className="text-sm text-slate-600">Commands seen locally that RTK may not optimise yet.</p>
        </div>
      </div>
      <div className="p-4">
        {commands.length ? (
          <div className="table-wrap">
            <table className="compact-table">
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Runs</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                {commands.slice(0, 8).map((command) => (
                  <tr key={`${command.command}-${command.example}`}>
                    <td className="font-mono text-xs">{command.command}</td>
                    <td>{command.count === undefined ? "Unknown" : <CountValue value={command.count} noun="run" />}</td>
                    <td className="max-w-96 truncate font-mono text-xs" title={command.example}>{command.example ?? "No example"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-600">No unhandled command suggestions were reported by local discovery.</p>}
      </div>
    </div>
  );
}

function RtkCommandTable({ commands, pageSize }: { commands: RtkCommand[]; pageSize: number }) {
  const [sort, setSort] = React.useState<{ key: RtkCommandSortKey; direction: SortDirection }>({ key: "saved", direction: "desc" });
  const sorted = React.useMemo(() => sortedRtkCommands(commands, sort), [commands, sort]);
  const pager = usePagination(sorted, pageSize);
  return (
    <div className="table-wrap">
      <table className="compact-table">
        <thead>
          <tr>
            <SortableTh label="Command" column="command" sort={sort} setSort={setSort} />
            <SortableTh label="Runs" column="count" sort={sort} setSort={setSort} />
            <SortableTh label="Tokens avoided" column="saved" sort={sort} setSort={setSort} />
            <SortableTh label="Avg reduction" column="reduction" sort={sort} setSort={setSort} />
            <SortableTh label="Avg runtime" column="runtime" sort={sort} setSort={setSort} />
          </tr>
        </thead>
        <tbody>
          {pager.items.map((command) => (
            <tr key={`${command.command}-${command.saved}-${command.time}`}>
              <td className="font-mono text-xs" title={command.command}>{readableCommandName(command.command)}</td>
              <td>{command.count === undefined ? "Unknown" : <CountValue value={command.count} noun="run" />}</td>
              <td>{command.saved ?? "Unknown"}</td>
              <td>{command.averageSavedPercent === undefined ? "Unknown" : `${command.averageSavedPercent.toFixed(1)}%`}</td>
              <td>{command.time ?? "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls page={pager.page} pageCount={pager.pageCount} total={sorted.length} pageSize={pageSize} onPageChange={pager.setPage} />
    </div>
  );
}

function RecentCommandList({ commands }: { commands: string[] }) {
  return (
    <ul className="recent-rtk-list">
      {commands.map((command) => {
        const parsed = parseRecentRtkCommand(command);
        return (
          <li className="recent-rtk-item" key={command}>
            <span className="recent-rtk-time">{parsed.time ?? "Recent"}</span>
            <span className="recent-rtk-command" title={parsed.command}>{parsed.command}</span>
            <span className="recent-rtk-savings">{parsed.savings ?? "No savings reported"}</span>
          </li>
        );
      })}
    </ul>
  );
}

function RepoTable({
  repos,
  onSelect,
  selectedRepo,
  compact = false,
  pageSize,
  onPageSizeChange,
}: {
  repos: RepoRow[];
  onSelect: (repoId: string) => void;
  selectedRepo: string | null;
  compact?: boolean;
  pageSize: number;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const [sort, setSort] = React.useState<{ key: RepoSortKey; direction: SortDirection }>({ key: "cost", direction: "desc" });
  const sortedRepos = React.useMemo(() => sortRepoRows(repos, sort), [repos, sort]);
  const pager = usePagination(sortedRepos, pageSize);
  return (
    <div className="table-wrap">
      <table className={compact ? "compact-table repo-table" : "repo-table"}>
        <thead>
          <tr>
            <SortableTh label="Repo / folder" column="repo" sort={sort} setSort={setSort} />
            <SortableTh label="API-equivalent cost" column="cost" sort={sort} setSort={setSort} />
            <SortableTh label="Total tokens" column="tokens" sort={sort} setSort={setSort} />
            <SortableTh label="Sessions" column="sessions" sort={sort} setSort={setSort} />
            {!compact ? <SortableTh label="Total input" column="input" sort={sort} setSort={setSort} /> : null}
            {!compact ? <SortableTh label="Cached input" column="cached" sort={sort} setSort={setSort} /> : null}
            {!compact ? <SortableTh label="Output" column="output" sort={sort} setSort={setSort} /> : null}
            {!compact ? <SortableTh label="Reasoning" column="reasoning" sort={sort} setSort={setSort} /> : null}
            <SortableTh label="Files edited" column="files" sort={sort} setSort={setSort} />
            <SortableTh label="Tokens per edit" column="roi" sort={sort} setSort={setSort} />
            {!compact ? <SortableTh label="Cache hit" column="cache" sort={sort} setSort={setSort} /> : null}
            <SortableTh label="Warnings" column="warnings" sort={sort} setSort={setSort} />
          </tr>
        </thead>
        <tbody>
          {pager.items.map((repo) => (
            <tr
              key={repo.id}
              onClick={() => onSelect(repo.id)}
              onKeyDown={(event) => activateClickableRow(event, () => onSelect(repo.id))}
              className={`clickable-row ${selectedRepo === repo.id ? "selected" : ""}`}
              role="button"
              tabIndex={0}
            >
              <td className="font-medium"><RepoLabel name={repo.label} verified={repo.verified === true} /></td>
              <td><CostValue value={repo.estimatedCostUsd} breakdown={repo} /></td>
              <td><TokenValue value={repo.totalTokens} showUnit={false} /></td>
              <td><CountValue value={repo.sessionCount} noun="session" showUnit={false} /></td>
              {!compact ? <td><TokenValue value={repo.inputTokens} showUnit={false} /></td> : null}
              {!compact ? <td><TokenValue value={repo.cachedInputTokens} showUnit={false} /></td> : null}
              {!compact ? <td><TokenValue value={repo.outputTokens} showUnit={false} /></td> : null}
              {!compact ? <td><TokenValue value={repo.reasoningTokens} showUnit={false} /></td> : null}
              <td><CountValue value={repo.fileEditCount} noun="file" showUnit={false} /></td>
              <td><TokenIntensityValue label={repo.tokenRoiLabel} title={repo.tokenRoiTitle} /></td>
              {!compact ? <td><PercentValue value={repo.inputTokens ? repo.cachedInputTokens / repo.inputTokens : 0} /></td> : null}
              <td><RepoWarningBadges warnings={repo.warnings} commandIssueCount={repo.failedCommandCount} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls
        page={pager.page}
        pageCount={pager.pageCount}
        total={sortedRepos.length}
        pageSize={pageSize}
        onPageChange={pager.setPage}
        {...(onPageSizeChange ? { pageSizeOptions, onPageSizeChange } : {})}
      />
    </div>
  );
}

function RepoDetail({ repo, sessions, allRepos, data, dateRangeLabel, pageSize, onOpenSession }: { repo: UsageGroup | undefined; sessions: Session[]; allRepos: RepoRow[]; data: ApiData; dateRangeLabel: string; pageSize: number; onOpenSession?: (sessionId: string) => void }) {
  const [activeTab, setActiveTab] = React.useState<RepoDetailTab>("overview");
  const [sessionSearch, setSessionSearch] = React.useState("");
  const [quickFilter, setQuickFilter] = React.useState<RepoSessionQuickFilter | "">("");
  const [visibleColumns, setVisibleColumns] = React.useState<SessionColumnKey[]>(repoDetailSessionColumns);

  React.useEffect(() => {
    setActiveTab("overview");
    setSessionSearch("");
    setQuickFilter("");
  }, [repo?.id]);

  if (!repo) {
    return (
      <div className="panel p-5">
        <h2 className="text-base font-semibold">Repo / folder detail</h2>
        <p className="mt-2 text-sm text-slate-600">No repo or folder selected. Select one to inspect token shape, warnings, and recent sessions.</p>
      </div>
    );
  }
  const row = repoRowsFromGroup(repo, sessions);
  const warnings = buildWarnings(row, sessions);
  const concentration = repoCostConcentration(row, sessions);
  const primaryIssue = primaryRepoIssue(warnings, concentration);
  const reviewSessions = topSessionsToReview(sessions, row);
  const filteredSessions = sessions.filter((session) => sessionMatchesSearch(session, sessionSearch) && sessionMatchesRepoQuickFilter(session, quickFilter, sessions));
  const tabs: Array<{ key: RepoDetailTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "sessions", label: "Sessions" },
    { key: "commands", label: "Commands" },
    { key: "metadata", label: "Metadata" },
  ];
  const commandTotals = repoCommandTotals(sessions);
  const topModel = repoModelBreakdown(sessions, row)[0];
  const warningDetails = prioritizeRepoWarningDetails(warnings.map(repoWarningDetail));
  const quickFilterOptions: Array<{ value: RepoSessionQuickFilter; label: string; count: number }> = ([
    ["expensive", "Expensive"],
    ["partial", "Partial"],
    ["longRunning", "Long-running"],
    ["commandIssues", "Command issues"],
    ["opusOnly", "Opus only"],
  ] as Array<[RepoSessionQuickFilter, string]>).map(([value, label]) => ({
    value,
    label,
    count: sessions.filter((session) => sessionMatchesRepoQuickFilter(session, value, sessions)).length,
  }));
  return (
    <div className="repo-detail-page">
      <RepoRecordHeader repo={row} dateRangeLabel={dateRangeLabel} primaryIssue={primaryIssue} topModel={topModel} commandTotals={commandTotals} />

      <div className="repo-detail-tabs" role="tablist" aria-label="Repo or folder detail sections">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.key ? "active" : ""}
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="repo-tab-body repo-basic-overview">
          <div className="repo-basic-workbench">
            <RepoAttentionCard
              repo={row}
              concentration={concentration}
              reviewSessions={reviewSessions}
              warningDetails={warningDetails}
              {...(onOpenSession ? { onOpenSession } : {})}
              onSelectTab={setActiveTab}
            />
            <RepoFactsCard concentration={concentration} topModel={topModel} warningDetails={warningDetails} onSelectTab={setActiveTab} />
          </div>
          <RepoCostTokensOverview repo={row} sessions={sessions} />
          <TopSessionsToReviewCard sessions={reviewSessions.slice(0, 4)} compact {...(onOpenSession ? { onOpenSession } : {})} />
          <RepoComparisonCard repo={row} allRepos={allRepos} />
        </div>
      ) : null}

      {activeTab === "sessions" ? (
        <div className="panel overflow-hidden">
          <div className="panel-heading">
            <div>
              <h2>Sessions</h2>
              <p className="text-sm text-slate-600">Sorted, searchable sessions for this repo or folder. Cost outliers are highlighted.</p>
            </div>
            <div className="panel-actions">
              <SessionColumnPicker columns={visibleColumns} setColumns={setVisibleColumns} />
            </div>
          </div>
          <div className="session-controls">
            <label className="search-field">
              <span className="sr-only">Search sessions</span>
              <Search className="h-4 w-4" aria-hidden />
              <input value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="Search sessions..." />
            </label>
            <div className="quick-filter-row">
              <button className={`quick-filter ${quickFilter === "" ? "active" : ""}`} type="button" onClick={() => setQuickFilter("")}>All <span>{sessions.length}</span></button>
              {quickFilterOptions.map(({ value, label, count: filterCount }) => (
                <button
                  className={`quick-filter ${quickFilter === value ? "active" : ""}`}
                  disabled={filterCount === 0}
                  key={value}
                  type="button"
                  onClick={() => setQuickFilter(value)}
                >
                  {label} <span>{filterCount}</span>
                </button>
              ))}
            </div>
          </div>
          {filteredSessions.length ? (
            <SessionsTable
              sessions={filteredSessions}
              pageSize={pageSize}
              {...(onOpenSession ? { onSelectSession: onOpenSession } : {})}
              visibleColumns={visibleColumns}
              compact
            />
          ) : <EmptyPanel title="No sessions matched this filter." text="Try clearing search or quick filters." />}
        </div>
      ) : null}

      {activeTab === "commands" ? <RepoCommandsTab sessions={sessions} commandTotals={commandTotals} {...(onOpenSession ? { onOpenSession } : {})} /> : null}
      {activeTab === "metadata" ? <RepoMetadataTab repo={row} sessions={sessions} data={data} /> : null}
      </div>
  );
}

function RepoRecordHeader({
  repo,
  dateRangeLabel,
  primaryIssue,
  topModel,
  commandTotals,
}: {
  repo: RepoRow;
  dateRangeLabel: string;
  primaryIssue: RepoWarningDetail | undefined;
  topModel: RepoModelSpend | undefined;
  commandTotals: RepoCommandTotals;
}) {
  const cacheReuse = repo.inputTokens ? repo.cachedInputTokens / repo.inputTokens : 0;
  return (
    <section className="repo-record-header">
      <div className="repo-record-main">
        <div className="repo-record-eyebrow">{dateRangeLabel}</div>
        <h2><RepoLabel name={repo.label} verified={repo.verified === true} /></h2>
        <p>{count(repo.sessionCount, "session")} · {count(repo.fileEditCount, "file")} edited · {tokens(repo.totalTokens)}</p>
        <p className={`repo-record-issue ${primaryIssue ? `repo-record-issue-${primaryIssue.tone}` : "repo-record-issue-good"}`}>
          {primaryIssue ? <TriangleAlert className="h-4 w-4" aria-hidden /> : <Info className="h-4 w-4" aria-hidden />}
          <span>{primaryIssue ? `${primaryIssue.title}: ${primaryIssue.detail}` : "No major review item detected in this filtered view."}</span>
        </p>
      </div>
      <dl className="repo-record-stats" aria-label="Repo summary">
        <div>
          <dt>Estimated cost</dt>
          <dd><CostValue value={repo.estimatedCostUsd} breakdown={repo} /></dd>
        </div>
        <div>
          <dt>Sessions</dt>
          <dd><CountValue value={repo.sessionCount} noun="session" /></dd>
        </div>
        <div>
          <dt>Cache reuse</dt>
          <dd><PercentValue value={cacheReuse} /></dd>
        </div>
        <div>
          <dt>Top model</dt>
          <dd>{topModel ? compactModelLabel(topModel.label) : "Unknown"}</dd>
        </div>
        <div className={commandTotals.important > 0 ? "repo-record-stat-warning" : undefined}>
          <dt>Command issues</dt>
          <dd><CountValue value={commandTotals.important} noun="issue" /></dd>
        </div>
      </dl>
    </section>
  );
}

function RepoAttentionCard({
  repo,
  concentration,
  reviewSessions,
  warningDetails,
  onOpenSession,
  onSelectTab,
}: {
  repo: RepoRow;
  concentration: RepoCostConcentration;
  reviewSessions: RepoReviewSession[];
  warningDetails: RepoWarningDetail[];
  onOpenSession?: (sessionId: string) => void;
  onSelectTab: (tab: RepoDetailTab) => void;
}) {
  const topSession = concentration.topSessions[0] ?? reviewSessions[0]?.session;
  const dataNoteCount = warningDetails.filter((warning) => warning.category === "data" || warning.category === "normalization").length;
  const pricingCount = warningDetails.filter((warning) => warning.category === "pricing").length;
  const hasReviewItems = repo.failedCommandCount > 0 || topSession || dataNoteCount > 0 || pricingCount > 0;
  return (
    <section className="repo-basic-panel repo-attention-card">
      <div className="panel-heading">
        <div>
          <h2>Needs review</h2>
          <p className="text-sm text-slate-600">The shortest path to what deserves attention in this repo or folder.</p>
        </div>
      </div>
      {hasReviewItems ? (
        <div className="repo-attention-list">
          <div className={`repo-attention-row ${repo.failedCommandCount > 0 ? "attention-critical" : "attention-good"}`}>
            <span className="attention-step">1</span>
            <TriangleAlert className="h-4 w-4" aria-hidden />
            <div>
              <strong>{repo.failedCommandCount > 0 ? `Review ${count(repo.failedCommandCount, "possible failed command")}` : "No possible failed commands"}</strong>
              <span>{repo.failedCommandCount > 0 ? "Start here because command failures are the clearest friction signal." : "No command review needed in this filtered view."}</span>
            </div>
            <button className="button compact-button" type="button" onClick={() => onSelectTab("commands")} disabled={repo.failedCommandCount === 0}>Commands</button>
          </div>
          {topSession ? (
            <div className={`repo-attention-row ${concentration.extreme ? "attention-warning" : ""}`}>
              <span className="attention-step">2</span>
              <CircleDollarSign className="h-4 w-4" aria-hidden />
              <div>
                <strong>Open top cost session <CostValue value={topSession.estimatedCostUsd} session={topSession} /></strong>
                <span title={sessionDisplayTitle(topSession)}>{sessionDisplayTitle(topSession)}</span>
              </div>
              <button className="button compact-button" type="button" onClick={() => onOpenSession?.(topSession.id)}>Open</button>
            </div>
          ) : null}
          {pricingCount > 0 ? (
            <div className="repo-attention-row attention-warning">
              <span className="attention-step">{topSession ? "3" : "2"}</span>
              <Calculator className="h-4 w-4" aria-hidden />
              <div>
                <strong>{count(pricingCount, "pricing gap")}</strong>
                <span>Some API-equivalent costs need token splits, model metadata, or pricing coverage.</span>
              </div>
              <button className="button compact-button" type="button" onClick={() => onSelectTab("metadata")}>Details</button>
            </div>
          ) : null}
          {dataNoteCount > 0 ? (
            <div className="repo-attention-row attention-info">
              <span className="attention-step">{topSession || pricingCount > 0 ? "4" : "2"}</span>
              <Info className="h-4 w-4" aria-hidden />
              <div>
                <strong>{count(dataNoteCount, "data note")}</strong>
                <span>Local log caveats explain how RepoSpend interpreted this activity.</span>
              </div>
              <button className="button compact-button" type="button" onClick={() => onSelectTab("metadata")}>Metadata</button>
            </div>
          ) : null}
        </div>
      ) : <p className="success-state">No review items detected in this filtered view.</p>}
    </section>
  );
}

function RepoFactsCard({ concentration, topModel, warningDetails, onSelectTab }: { concentration: RepoCostConcentration; topModel: RepoModelSpend | undefined; warningDetails: RepoWarningDetail[]; onSelectTab: (tab: RepoDetailTab) => void }) {
  const dataNoteCount = warningDetails.filter((warning) => warning.category === "data" || warning.category === "normalization").length;
  const pricingCount = warningDetails.filter((warning) => warning.category === "pricing").length;
  return (
    <section className="repo-basic-panel repo-facts-card">
      <div className="repo-basic-panel-heading">
        <h2>At a glance</h2>
        <p>Useful context without opening another tab.</p>
      </div>
      <dl className="repo-facts-list">
        <div>
          <dt>Top model</dt>
          <dd>{topModel ? `${topModel.label} · ${percent(topModel.costShare)} of known cost` : "Unknown"}</dd>
        </div>
        <div>
          <dt>Top 3 sessions</dt>
          <dd>{percent(concentration.topThreeShare)} of known cost</dd>
        </div>
        <div>
          <dt>Data notes</dt>
          <dd>{dataNoteCount || pricingCount ? `${count(dataNoteCount + pricingCount, "note")}` : "None"}</dd>
        </div>
      </dl>
      {dataNoteCount || pricingCount ? (
        <button className="text-button repo-facts-link" type="button" onClick={() => onSelectTab("metadata")}>
          View local data details
        </button>
      ) : null}
    </section>
  );
}

function RepoCostTokensOverview({ repo, sessions }: { repo: RepoRow; sessions: Session[] }) {
  const modelRows = repoModelBreakdown(sessions, repo);
  const dayRows = repoDailyBreakdown(sessions);
  const topModel = modelRows[0];
  return (
    <section className="repo-overview-usage-section">
      <div className="repo-overview-section-heading">
        <h2>Cost and tokens</h2>
        <p>{repoCostDriverExplanation(repo, topModel)}</p>
      </div>
      <div className="detail-card repo-cost-summary-card">
        <div className="repo-cost-summary-main">
          <h3>Cost shape</h3>
          <p>Cached input is part of total input, so this view shows reuse as a proportion instead of adding cached tokens again.</p>
          <RepoTokenShareBar inputTokens={repo.inputTokens} cachedInputTokens={repo.cachedInputTokens} />
        </div>
        <div className="repo-cost-summary-stats">
            <MiniStat label="Estimated API-equivalent cost" value={<CostValue value={repo.estimatedCostUsd} breakdown={repo} />} />
            <MiniStat label="Total tokens" value={<TokenValue value={repo.totalTokens} />} />
            <MiniStat label="Cache reuse" value={<PercentValue value={repo.inputTokens ? repo.cachedInputTokens / repo.inputTokens : 0} />} />
            <MiniStat label="Output" value={<TokenValue value={repo.outputTokens} />} />
            <MiniStat label="Reasoning" value={<TokenValue value={repo.reasoningTokens} />} />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <ChartPanel title="Estimated API-equivalent cost over time">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dayRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis tickFormatter={(value) => currencyCompact(Number(value))} width={62} tick={{ fill: "#94a3b8" }} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(value) => money(Number(value))} />
              <Line type="monotone" dataKey="estimatedCostUsd" name="Estimated cost" stroke="#6d5dfc" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Model breakdown">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={modelRows.slice(0, 8)} layout="vertical" margin={{ left: 16, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
              <XAxis type="number" tickFormatter={(value) => currencyCompact(Number(value))} tick={{ fill: "#94a3b8" }} />
              <YAxis dataKey="label" type="category" width={130} tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(value) => money(Number(value))} />
              <Bar dataKey="estimatedCostUsd" name="Estimated cost" fill="#2dd4bf" minPointSize={positiveBarMinPointSize} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="detail-card">
          <h3>Model cost drivers</h3>
          <div className="repo-model-list">
            {modelRows.map((model) => (
              <div className="repo-model-row" key={model.id}>
                <strong>{model.label}</strong>
                <span>{money(model.estimatedCostUsd)} · {percent(model.costShare)} of repo cost · {count(model.sessionCount, "session")}</span>
              </div>
            ))}
            {!modelRows.length ? <p className="text-sm text-slate-600">No model breakdown is available.</p> : null}
          </div>
        </div>
        <div className="detail-card">
          <h3>Cost driver explanation</h3>
          <p className="mt-2 text-sm text-slate-600">{repoCostDriverExplanation(repo, modelRows[0])}</p>
          <p className="mt-3 text-xs text-slate-500">Estimated API-equivalent cost is not your actual subscription bill.</p>
        </div>
      </div>
    </section>
  );
}

function RepoTokenShareBar({ inputTokens, cachedInputTokens }: { inputTokens: number; cachedInputTokens: number }) {
  if (inputTokens <= 0) return <p className="repo-token-share-empty">No input token data is available for this filtered view.</p>;
  const cached = Math.min(Math.max(cachedInputTokens, 0), inputTokens);
  const uncached = Math.max(inputTokens - cached, 0);
  const cachedPct = cached / inputTokens;
  const uncachedPct = uncached / inputTokens;
  return (
    <div className="repo-token-share">
      <div className="repo-token-share-track" aria-label={`Input token split: ${percent(uncachedPct)} uncached input, ${percent(cachedPct)} cached input`}>
        <span className="repo-token-share-uncached" style={{ width: `${uncachedPct * 100}%` }} />
        <span className="repo-token-share-cached" style={{ width: `${cachedPct * 100}%` }} />
      </div>
      <div className="repo-token-share-legend">
        <span><i className="repo-token-share-dot repo-token-share-dot-uncached" />Uncached input <strong><TokenValue value={uncached} /></strong></span>
        <span><i className="repo-token-share-dot repo-token-share-dot-cached" />Cached input <strong><TokenValue value={cached} /></strong></span>
      </div>
    </div>
  );
}

function TopSessionsToReviewCard({ sessions, compact = false, onOpenSession }: { sessions: RepoReviewSession[]; compact?: boolean; onOpenSession?: (sessionId: string) => void }) {
  return (
    <div className="repo-basic-panel overflow-hidden">
      <div className="panel-heading">
        <div>
          <h2>Top sessions to review</h2>
          <p className="text-sm text-slate-600">{compact ? "The three sessions most worth opening first." : "Picked by cost, duration, outcome, possible failed commands, and unusual token volume."}</p>
        </div>
      </div>
      <div className="repo-review-list">
        {sessions.map(({ session, reason }) => (
          <div className="repo-review-row" key={session.id}>
            <div className="repo-review-main">
              <strong title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</strong>
              <span>{reason}</span>
            </div>
            <div className="repo-review-metrics">
              <span><CostValue value={session.estimatedCostUsd} session={session} /></span>
              {!compact ? <span><TokenValue value={session.totalTokens} /></span> : null}
              {!compact ? <span>{formatDuration(session.durationMs)}</span> : null}
              <OutcomeBadge outcome={session.sessionOutcome} />
              <button className="button" type="button" onClick={() => onOpenSession?.(session.id)}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open
              </button>
            </div>
          </div>
        ))}
        {!sessions.length ? <p className="p-4 text-sm text-slate-600">No sessions need review in this filtered view.</p> : null}
      </div>
    </div>
  );
}

type RepoWarningCategory = "review" | "pricing" | "data" | "normalization";
type RepoWarningTone = "critical" | "warning" | "info";

type RepoWarningDetail = {
  key: string;
  title: string;
  detail: string;
  category: RepoWarningCategory;
  categoryLabel: string;
  tone: RepoWarningTone;
  actionLabel: string;
};

function primaryRepoIssue(warnings: string[], concentration: RepoCostConcentration): RepoWarningDetail | undefined {
  const details = prioritizeRepoWarningDetails(warnings.map(repoWarningDetail));
  const concentrationDetail = concentration.extreme ? repoWarningDetail("expensive_session_concentration") : undefined;
  const candidates = concentrationDetail ? [concentrationDetail, ...details] : details;
  return candidates.find((warning) => warning.category !== "normalization" && warning.tone !== "info");
}

function prioritizeRepoWarningDetails(details: RepoWarningDetail[]): RepoWarningDetail[] {
  const priority: Record<RepoWarningCategory, number> = { review: 0, pricing: 1, data: 2, normalization: 3 };
  const tonePriority: Record<RepoWarningTone, number> = { critical: 0, warning: 1, info: 2 };
  const unique = new Map<string, RepoWarningDetail>();
  details.forEach((detail) => {
    if (!unique.has(detail.key)) unique.set(detail.key, detail);
  });
  return [...unique.values()].sort((a, b) => priority[a.category] - priority[b.category] || tonePriority[a.tone] - tonePriority[b.tone] || a.title.localeCompare(b.title));
}

function repoWarningDetail(warning: string): RepoWarningDetail {
  const normalized = warning.toLowerCase();
  const normalizedText = normalized.replace(/[:_]+/g, " ");
  const fallback = {
    key: warning,
    title: capitalizeSentence(warning.replaceAll("_", " ")),
    detail: readableWarning(warning),
    category: "data" as const,
    categoryLabel: "Data caveat",
    tone: "info" as const,
    actionLabel: "Review context",
  };
  if (normalizedText === "expensive session concentration") {
    return { key: warning, title: "Cost concentrated in one session", detail: "One session accounts for most of this repo or folder's estimated API-equivalent cost.", category: "review", categoryLabel: "Needs review", tone: "warning", actionLabel: "Top sessions" };
  }
  if (normalizedText === "failed commands" || normalizedText === "command issues") {
    return { key: warning, title: "Possible failed commands", detail: "Command or tool failures were detected in sessions for this repo or folder.", category: "review", categoryLabel: "Needs review", tone: "critical", actionLabel: "Commands tab" };
  }
  if (normalizedText === "high-token no-edit") {
    return { key: warning, title: "High-token session without edits", detail: "At least one high-token session has no detected file edits; it may be research, missing path data, or expensive stuck work.", category: "review", categoryLabel: "Needs review", tone: "warning", actionLabel: "Session review" };
  }
  if (normalizedText === "low cache rate") {
    return { key: warning, title: "Low cache reuse", detail: "Input tokens may be driving more estimated cost because cache reuse is low in this filtered view.", category: "review", categoryLabel: "Needs review", tone: "warning", actionLabel: "Token shape" };
  }
  if (normalizedText === "output heavy sessions") {
    return { key: warning, title: "Output-heavy sessions", detail: "Output tokens are unusually high compared with total token volume.", category: "review", categoryLabel: "Needs review", tone: "info", actionLabel: "Token shape" };
  }
  if (normalizedText === "unknown pricing" || normalizedText === "unknown cost") {
    return { key: warning, title: "Some sessions cannot be priced", detail: "Token splits, model metadata, or pricing coverage are missing, so some API-equivalent costs are unavailable.", category: "pricing", categoryLabel: "Pricing incomplete", tone: "warning", actionLabel: "Pricing review" };
  }
  if (normalizedText === "missing token breakdown") {
    return { key: warning, title: "Missing token breakdowns", detail: "Some local session records do not include enough detail to split tokens by input, cache, output, or reasoning.", category: "data", categoryLabel: "Data caveat", tone: "warning", actionLabel: "Session review" };
  }
  if (normalizedText === "claude synthetic zero usage") {
    return { key: warning, title: "Claude synthetic usage marker", detail: "Claude only persisted a local zero-usage placeholder, so RepoSpend cannot recover real model or token counts for those sessions.", category: "data", categoryLabel: "Data caveat", tone: "warning", actionLabel: "No local fix" };
  }
  if (normalizedText === "repo unverified no git root") {
    return { key: warning, title: "Repo grouping unverified", detail: "RepoSpend could not verify the Git root from local metadata, so grouping may be based on an inferred folder.", category: "data", categoryLabel: "Data caveat", tone: "info", actionLabel: "Path check" };
  }
  if (normalizedText === "copilot missing cwd") {
    return { key: warning, title: "Copilot missing workspace", detail: "GitHub Copilot did not include a local workspace path, so the session is grouped under Unknown repo/folder.", category: "data", categoryLabel: "Data caveat", tone: "info", actionLabel: "No local fix" };
  }
  if (normalizedText === "copilot partial token breakdown") {
    return { key: warning, title: "Partial Copilot token split", detail: "GitHub Copilot exposed only partial token breakdowns for some local records.", category: "data", categoryLabel: "Data caveat", tone: "warning", actionLabel: "Session review" };
  }
  if (normalizedText === "claude session split by activity day") {
    return { key: warning, title: "Claude session split by activity day", detail: "Claude activity crossed day or model boundaries, so RepoSpend split it to keep daily totals accurate.", category: "normalization", categoryLabel: "Normalization note", tone: "info", actionLabel: "No action needed" };
  }
  if (normalizedText === "duplicate or stale token snapshots skipped") {
    return { key: warning, title: "Duplicate token snapshots skipped", detail: "RepoSpend skipped repeated or stale token records to avoid double-counting usage.", category: "normalization", categoryLabel: "Normalization note", tone: "info", actionLabel: "No action needed" };
  }
  if (normalizedText === "token direct usage ignored after cumulative snapshot") {
    return { key: warning, title: "Token snapshots de-duplicated", detail: "Direct token usage was ignored after a cumulative snapshot to avoid double-counting.", category: "normalization", categoryLabel: "Normalization note", tone: "info", actionLabel: "No action needed" };
  }
  if (normalizedText.startsWith("invalid token snapshots")) {
    return { key: warning, title: "Invalid token snapshots skipped", detail: "Malformed token snapshots were skipped while counting tokens.", category: "normalization", categoryLabel: "Normalization note", tone: "warning", actionLabel: "Source data" };
  }
  if (normalizedText === "copilot duplicate session merged") {
    return { key: warning, title: "Duplicate Copilot fragments merged", detail: "RepoSpend merged duplicate GitHub Copilot session fragments before aggregating usage.", category: "normalization", categoryLabel: "Normalization note", tone: "info", actionLabel: "No action needed" };
  }
  if (normalizedText === "model inferred from import source") {
    return { key: warning, title: "Model inferred from metadata", detail: "Model name was inferred from local import metadata because the primary session record did not include it.", category: "normalization", categoryLabel: "Normalization note", tone: "info", actionLabel: "No action needed" };
  }
  return fallback;
}

function RepoComparisonCard({ repo, allRepos }: { repo: RepoRow; allRepos: RepoRow[] }) {
  if (allRepos.length <= 1) return null;
  const ranked = [...allRepos].sort((a, b) => nullableNumber(b.estimatedCostUsd) - nullableNumber(a.estimatedCostUsd));
  const rank = ranked.findIndex((item) => item.id === repo.id) + 1;
  const totalCost = allRepos.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0);
  const share = totalCost > 0 && repo.estimatedCostUsd !== undefined ? repo.estimatedCostUsd / totalCost : 0;
  return (
    <div className="detail-card">
      <h3>Compared to other repos / folders</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <MiniStat label="Cost rank" value={rank ? `#${rank} of ${allRepos.length}` : "Unknown"} />
        <MiniStat label="Share of filtered cost" value={<PercentValue value={share} />} />
        <MiniStat label="Most expensive repo / folder" value={ranked[0]?.label ?? "Unknown"} />
      </div>
    </div>
  );
}

function RepoCommandsTab({ sessions, commandTotals, onOpenSession }: { sessions: Session[]; commandTotals: RepoCommandTotals; onOpenSession?: (sessionId: string) => void }) {
  const reviewSessions = sessions.filter(sessionNeedsCommandReview).slice(0, 8);
  const issueSamples = sessions.flatMap((session) => (session.commandIssueSamples ?? []).map((issue) => ({ session, issue })));
  const issueClusters = repoCommandIssueClusters(issueSamples).slice(0, 8);
  return (
    <div className="repo-tab-body">
      <div className="detail-card">
        <h3>Command summary</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <MiniStat label="Important issues" value={<CountValue value={commandTotals.important} noun="issue" />} />
          <MiniStat label="Harmless exits" value={<CountValue value={commandTotals.harmless} noun="event" />} />
          <MiniStat label="Repeated clusters" value={<CountValue value={commandTotals.repeated} noun="cluster" />} />
          <MiniStat label="Sessions to review" value={<CountValue value={reviewSessions.length} noun="session" />} />
        </div>
        {commandTotals.important === 0 ? <p className="success-state mt-4">No possible failed commands detected.</p> : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="detail-card">
          <h3>Possible failed command clusters</h3>
          <div className="mt-3 space-y-2">
            {issueClusters.map((cluster) => (
              <div className="issue-row command-cluster-row" key={cluster.command}>
                <div>
                  <div className="font-mono text-xs text-slate-100" title={cluster.command}>{shortCommand(cluster.command)}</div>
                  <p className="mt-1 text-xs text-slate-500">{cluster.reason}</p>
                </div>
                <div className="issue-row-badges">
                  <Badge label={count(cluster.count, "event")} />
                  <Badge label={count(cluster.sessionIds.size, "session")} />
                  <Badge label={readableIssueLabel(cluster.category)} />
                  <Badge label={`${cluster.impact} impact`} />
                </div>
              </div>
            ))}
            {!issueClusters.length ? <p className="text-sm text-slate-600">No possible failed command samples were available.</p> : null}
          </div>
        </div>
        <div className="detail-card">
          <h3>Sessions to review</h3>
          <div className="repo-model-list">
            {reviewSessions.map((session) => (
              <button className="repo-model-row buttonless-row" key={session.id} type="button" onClick={() => onOpenSession?.(session.id)}>
                <strong>{sessionDisplayTitle(session)}</strong>
                <span>{count(importantCommandFailures(session), "issue")} · {count(session.repeatedFailureClusters ?? 0, "cluster")} · {formatDuration(session.durationMs)}</span>
              </button>
            ))}
            {!reviewSessions.length ? <p className="text-sm text-slate-600">No sessions need command review.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type RepoCommandIssueSample = { session: Session; issue: NonNullable<Session["commandIssueSamples"]>[number] };
type RepoCommandIssueCluster = {
  command: string;
  reason: string;
  category: NonNullable<Session["commandIssueSamples"]>[number]["category"];
  impact: NonNullable<Session["commandIssueSamples"]>[number]["impact"];
  severity: NonNullable<Session["commandIssueSamples"]>[number]["severity"];
  count: number;
  sessionIds: Set<string>;
};

function repoCommandIssueClusters(samples: RepoCommandIssueSample[]): RepoCommandIssueCluster[] {
  const priority = { critical: 0, warning: 1, info: 2, ignored: 3, none: 4 } satisfies Record<RepoCommandIssueCluster["severity"], number>;
  const clusters = new Map<string, RepoCommandIssueCluster>();
  samples
    .filter(({ issue }) => issue.severity === "critical" || issue.severity === "warning")
    .forEach(({ session, issue }) => {
      const key = issue.command;
      const existing = clusters.get(key);
      if (!existing) {
        clusters.set(key, {
          command: issue.command,
          reason: issue.reason,
          category: issue.category,
          impact: issue.impact,
          severity: issue.severity,
          count: 1,
          sessionIds: new Set([session.id]),
        });
        return;
      }
      existing.count += 1;
      existing.sessionIds.add(session.id);
      if (priority[issue.severity] < priority[existing.severity]) {
        existing.reason = issue.reason;
        existing.category = issue.category;
        existing.impact = issue.impact;
        existing.severity = issue.severity;
      }
    });
  return [...clusters.values()].sort((a, b) => priority[a.severity] - priority[b.severity] || b.count - a.count || b.sessionIds.size - a.sessionIds.size || a.command.localeCompare(b.command));
}

function RepoMetadataTab({ repo, sessions, data }: { repo: RepoRow; sessions: Session[]; data: ApiData }) {
  const sourcePaths = [...new Set(sessions.map((session) => session.sourcePath).filter(Boolean))];
  const rawPaths = [...new Set(sessions.map((session) => session.repoRoot).filter(Boolean))];
  const edited = sessions.reduce((sum, session) => sum + (session.fileEditCount ?? 0), 0);
  const read = sessions.reduce((sum, session) => sum + (session.fileReadCount ?? 0), 0);
  const sessionsWithEdits = sessions.filter((session) => (session.fileEditCount ?? 0) > 0).length;
  return (
    <div className="repo-tab-body">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="detail-card">
          <h3>Repo / folder grouping</h3>
          <div className="metadata-list mt-3">
            <MetadataRow label="Repo / folder" value={repo.label} />
            <MetadataRow label="Root path" value={shortPath(repo.id)} title={repo.id} />
            <MetadataRow label="Grouping method" value="Git repo root when available; otherwise folder/path fallback." />
            <MetadataRow label="Sessions" value={count(repo.sessionCount, "session")} />
          </div>
        </div>
        <div className="detail-card">
          <h3>Local scan metadata</h3>
          <div className="metadata-list mt-3">
            <MetadataRow label="Last scan" value={formatDateTime(data.scan.lastScannedAt)} />
            <MetadataRow label="Session files scanned" value={count(data.scan.sessionFileCount, "file")} />
            <MetadataRow label="Raw events" value={count(data.scan.rawEventCount, "event")} />
            <MetadataRow label="Parse failures" value={count(data.scan.parseFailureCount, "failure")} />
          </div>
        </div>
        <div className="detail-card xl:col-span-2">
          <h3>Source format limitations</h3>
          <p className="mt-2 text-sm text-slate-600">Estimated API-equivalent cost depends on local token splits and pricing coverage. Some log formats expose file edit counts without stable file paths, so file-level analysis may be limited even when edit counts are present.</p>
        </div>
        <div className="detail-card xl:col-span-2">
          <h3>File activity</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <MiniStat label="Files edited" value={<CountValue value={edited} noun="file" />} />
            <MiniStat label="Files read" value={<CountValue value={read} noun="file" />} />
            <MiniStat label="Sessions with edits" value={<CountValue value={sessionsWithEdits} noun="session" />} />
            <MiniStat label="Tokens per edit" value={<TokenIntensityValue label={repo.tokenRoiLabel} title={repo.tokenRoiTitle} />} />
          </div>
          {edited > 0 ? (
            <div className="compact-warning mt-4">
              File edit counts were detected, but stable file paths are unavailable for this log format.
              <details>
                <summary>Learn more</summary>
                <p>RepoSpend can count file reads and edits from local session metadata, but some source formats do not persist stable per-file paths.</p>
              </details>
            </div>
          ) : <p className="mt-3 text-sm text-slate-600">No file edits were detected for this repo or folder in the current filtered view.</p>}
        </div>
        <details className="detail-card metadata-disclosure">
          <summary>
            <span>Raw paths</span>
            <small>{count(rawPaths.length, "path")}</small>
          </summary>
          <div className="metadata-list mt-3">
            {rawPaths.slice(0, 8).map((path) => <MetadataRow key={path} label="Repo/folder path" value={shortPath(path)} title={path} />)}
            {!rawPaths.length ? <MetadataRow label="Repo/folder path" value="Unavailable" /> : null}
          </div>
        </details>
        <details className="detail-card metadata-disclosure">
          <summary>
            <span>Data source files</span>
            <small>{count(sourcePaths.length, "file")}</small>
          </summary>
          <div className="metadata-list mt-3">
            {sourcePaths.slice(0, 8).map((path) => <MetadataRow key={path} label="Source file" value={shortPath(path)} title={path} />)}
            {!sourcePaths.length ? <MetadataRow label="Source file" value="Unavailable" /> : null}
          </div>
        </details>
      </div>
    </div>
  );
}

function SessionsTable({
  sessions,
  compact = false,
  pageSize,
  selectedSessionId,
  onSelectSession,
  visibleColumns = defaultSessionColumns,
  onPageSizeChange,
}: {
  sessions: Session[];
  compact?: boolean;
  pageSize: number;
  selectedSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  visibleColumns?: SessionColumnKey[];
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const [sort, setSort] = React.useState<{ key: SessionSortKey; direction: SortDirection }>({ key: "cost", direction: "desc" });
  const sortedSessions = React.useMemo(() => sortSessionRows(sessions, sort), [sessions, sort]);
  const pager = usePagination(sortedSessions, pageSize);
  const hasColumn = React.useCallback((column: SessionColumnKey) => visibleColumns.includes(column), [visibleColumns]);
  const costOutlierThreshold = React.useMemo(() => sessionCostOutlierThreshold(sessions), [sessions]);
  return (
    <div className="table-wrap">
      <table className={`sessions-table ${compact ? "compact-table" : ""}`}>
        <thead>
          <tr>
            {!compact ? <SortableTh label="Repo / folder" column="repo" sort={sort} setSort={setSort} /> : null}
            {!compact ? <SortableTh label="Provider / app/surface" column="app" sort={sort} setSort={setSort} /> : null}
            <SortableTh label="Session" column="session" sort={sort} setSort={setSort} />
            <th>Outcome</th>
            <SortableTh label="Model" column="model" sort={sort} setSort={setSort} />
            <SortableTh label="Started" column="started" sort={sort} setSort={setSort} />
            <SortableTh label="Duration" column="duration" sort={sort} setSort={setSort} />
            <SortableTh label="API-equivalent cost" column="cost" sort={sort} setSort={setSort} />
            <SortableTh label="Total" column="tokens" sort={sort} setSort={setSort} />
            {!compact && hasColumn("input") ? <SortableTh label="Total input" column="input" sort={sort} setSort={setSort} /> : null}
            {!compact && hasColumn("cached") ? <SortableTh label="Cached" column="cached" sort={sort} setSort={setSort} /> : null}
            {!compact && hasColumn("output") ? <SortableTh label="Output" column="output" sort={sort} setSort={setSort} /> : null}
            {!compact && hasColumn("reasoning") ? <SortableTh label="Reasoning" column="reasoning" sort={sort} setSort={setSort} /> : null}
            {hasColumn("messages") ? <SortableTh label="Messages" column="messages" sort={sort} setSort={setSort} /> : null}
            {hasColumn("prompts") ? <SortableTh label="Prompts" column="prompts" sort={sort} setSort={setSort} /> : null}
            {hasColumn("commands") ? <SortableTh label="Commands" column="commands" sort={sort} setSort={setSort} /> : null}
            {hasColumn("commandIssues") ? <SortableTh label="Possible failed commands" column="failed" sort={sort} setSort={setSort} /> : null}
            {hasColumn("edits") ? <SortableTh label="Edits" column="files" sort={sort} setSort={setSort} /> : null}
            {hasColumn("parse") ? <th>Parse</th> : null}
            {!compact && hasColumn("tokenMethod") ? <th>Token method</th> : null}
            {!compact && hasColumn("confidence") ? <th>Confidence</th> : null}
            {!compact && hasColumn("checkpoints") ? <th>Checkpoints</th> : null}
          </tr>
        </thead>
        <tbody>
          {pager.items.map((session) => (
            <tr
              key={session.id}
              onClick={() => onSelectSession?.(session.id)}
              onKeyDown={onSelectSession ? (event) => activateClickableRow(event, () => onSelectSession(session.id)) : undefined}
              className={`${selectedSessionId === session.id ? "selected" : ""} ${isCostOutlier(session, costOutlierThreshold) ? "cost-outlier-row" : ""} ${onSelectSession ? "clickable-row" : ""}`}
              role={onSelectSession ? "button" : undefined}
              tabIndex={onSelectSession ? 0 : undefined}
            >
              {!compact ? <td><RepoLabel name={session.repoName} verified={sessionIsRepoVerified(session)} /></td> : null}
              {!compact ? <td><div className="source-app-cell"><SourceBadge source={session.sourceClient} /><AppLabel app={session.sourceApp} surface={session.detectedSurface} /></div></td> : null}
              <td className="max-w-72 truncate font-medium" title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</td>
              <td><OutcomeBadge outcome={session.sessionOutcome} /></td>
              <td><ModelLabel model={sessionDisplayModel(session)} /></td>
              <td>{session.startedAt ? session.startedAt.slice(0, 10) : "Unknown"}</td>
              <td>{formatDuration(session.durationMs)}</td>
              <td><CostValue value={session.estimatedCostUsd} session={session} /></td>
              <td><TokenValue value={session.totalTokens} showUnit={false} /></td>
              {!compact && hasColumn("input") ? <td><TokenValue value={session.inputTokens} showUnit={false} /></td> : null}
              {!compact && hasColumn("cached") ? <td><TokenValue value={session.cachedInputTokens} showUnit={false} /></td> : null}
              {!compact && hasColumn("output") ? <td><TokenValue value={session.outputTokens} showUnit={false} /></td> : null}
              {!compact && hasColumn("reasoning") ? <td><TokenValue value={session.reasoningTokens} showUnit={false} /></td> : null}
              {hasColumn("messages") ? <td><CountValue value={session.messageCount} noun="message" showUnit={false} /></td> : null}
              {hasColumn("prompts") ? <td><CountValue value={session.userPromptCount ?? 0} noun="prompt" showUnit={false} /></td> : null}
              {hasColumn("commands") ? <td><CountValue value={session.shellCommandCount ?? 0} noun="command" showUnit={false} /></td> : null}
              {hasColumn("commandIssues") ? <td><CountValue value={importantCommandFailures(session)} noun="issue" showUnit={false} /></td> : null}
              {hasColumn("edits") ? <td><CountValue value={session.fileEditCount ?? 0} noun="edit" showUnit={false} /></td> : null}
              {hasColumn("parse") ? <td><Badge label={session.parseStatus ?? "unknown"} title={(session.parseErrors ?? []).join("\n") || "No parse errors"} /></td> : null}
              {!compact && hasColumn("tokenMethod") ? <td><Badge label={aggregationMethodLabel(session.tokenAggregationMethod ?? "unknown")} /></td> : null}
              {!compact && hasColumn("confidence") ? <td><Badge label={session.tokenConfidence ?? "low"} /></td> : null}
              {!compact && hasColumn("checkpoints") ? <td><CountValue value={session.tokenSnapshotCount ?? 0} noun="checkpoint" showUnit={false} /></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls
        page={pager.page}
        pageCount={pager.pageCount}
        total={sortedSessions.length}
        pageSize={pageSize}
        onPageChange={pager.setPage}
        {...(onPageSizeChange ? { pageSizeOptions, onPageSizeChange } : {})}
      />
    </div>
  );
}

function SessionDetailPanel({ session, initialTab = "overview" }: { session: Session | undefined; initialTab?: SessionDetailTab }) {
  const [activeTab, setActiveTab] = React.useState<SessionDetailTab>(initialTab);
  const [timelineSearch, setTimelineSearch] = React.useState("");
  const [timelineRole, setTimelineRole] = React.useState<TimelineRoleFilter>("all");
  const [expandedTimelineItems, setExpandedTimelineItems] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    setActiveTab(initialTab);
    setTimelineSearch("");
    setTimelineRole("all");
    setExpandedTimelineItems(new Set());
  }, [initialTab, session?.id]);

  if (!session) {
    return (
      <div className="panel p-5">
        <h2 className="text-base font-semibold">Session details</h2>
        <p className="mt-2 text-sm text-slate-600">No session selected. Select a row to inspect one session.</p>
      </div>
    );
  }
  const positives = sessionPositiveSignals(session);
  const concerns = sessionConcernSignals(session);
  const importantIssues = (session.commandIssueSamples ?? []).filter((issue) => issue.severity === "critical" || issue.severity === "warning");
  const commandIssueSamples = importantIssues.length ? importantIssues : (session.commandIssueSamples ?? []).slice(0, 6);
  const hasCommandReview = importantCommandFailures(session) > 0;
  const promptTimeline = session.promptTimeline ?? [];
  const tabs: Array<{ key: SessionDetailTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "timeline", label: "Timeline" },
    { key: "files", label: "Files & Commands" },
    { key: "tokens", label: "Tokens & Cost" },
    { key: "metadata", label: "Metadata" },
  ];
  const filteredTimeline = promptTimeline.filter((item) => {
    const matchesRole = timelineRole === "all" || item.role === timelineRole;
    const matchesSearch = !timelineSearch.trim() || item.text.toLowerCase().includes(timelineSearch.trim().toLowerCase());
    return matchesRole && matchesSearch;
  });
  const toggleTimelineItem = (id: string) => {
    setExpandedTimelineItems((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="panel session-detail-panel overflow-hidden">
      <div className="session-detail-heading">
        <div>
          <div className="session-detail-eyebrow">Session summary</div>
          <h2 title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</h2>
          <div className="session-summary-meta">
            <OutcomeBadge outcome={session.sessionOutcome} />
            <span>{sourceLabel(session.sourceClient)}</span>
            <span>{session.sourceApp || surfaceLabel(session.detectedSurface)}</span>
            <span>{formatDuration(session.durationMs)}</span>
            <span>{money(session.estimatedCostUsd)} estimated</span>
          </div>
          <p>{sessionSummarySentence(session)}</p>
        </div>
        <BadgeRow labels={sessionBadges(session)} />
      </div>

      <div className="session-key-metrics">
        <MiniStat label="Estimated cost" value={<CostValue value={session.estimatedCostUsd} session={session} />} />
        <MiniStat label="Total tokens" value={<TokenValue value={session.totalTokens} />} />
        <MiniStat label="Duration" value={formatDuration(session.durationMs)} />
        <MiniStat label="Model" value={<ModelLabel model={sessionDisplayModel(session)} />} />
        <MiniStat label="File edits" value={<CountValue value={session.fileEditCount ?? 0} noun="edit" />} />
        <MiniStat label="Commands" value={<CountValue value={session.shellCommandCount ?? 0} noun="command" />} />
      </div>

      <div className="session-detail-tabs" role="tablist" aria-label="Session detail sections">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.key ? "active" : ""}
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="session-detail-body">
        {activeTab === "overview" ? (
          <div className="session-tab-grid">
            {hasCommandReview ? (
              <SessionDetailCard className="session-card-wide" title="Why this session was flagged">
                <CommandReviewEvidence session={session} issues={commandIssueSamples} />
              </SessionDetailCard>
            ) : null}
            <SessionDetailCard title="Highlights">
              {positives.length ? <SignalList items={positives} /> : <p className="detail-muted">No strong positive signals were detected from local metadata.</p>}
            </SessionDetailCard>
            <SessionDetailCard title="Review before action">
              {concerns.length ? <SignalList items={concerns} /> : <p className="detail-muted">No obvious issues detected for this session.</p>}
            </SessionDetailCard>
            <SessionDetailCard title="Session activity">
              <div className="session-mini-grid">
                <MiniStat label="Messages" value={<CountValue value={session.messageCount} noun="message" />} />
                <MiniStat label="Prompts" value={<CountValue value={session.userPromptCount ?? 0} noun="prompt" />} />
                <MiniStat label="Assistant replies" value={<CountValue value={session.assistantMessageCount ?? 0} noun="reply" />} />
                <MiniStat label="Tool calls" value={<CountValue value={session.toolCallCount ?? 0} noun="tool call" />} />
                <MiniStat label="Possible failed commands" value={<CountValue value={importantCommandFailures(session)} noun="command" />} />
                <MiniStat
                  label="Compactions"
                  value={<CompactionSummary compaction={session.compaction} />}
                  help={compactionHelpText(session.compaction)}
                />
                <MiniStat label="Outcome" value={<OutcomeBadge outcome={session.sessionOutcome} />} />
              </div>
            </SessionDetailCard>
            <SessionDetailCard title="Token breakdown">
              <TokenBreakdownGrid session={session} />
            </SessionDetailCard>
            {session.compaction && session.compaction.count > 0 ? (
              <SessionDetailCard className="session-card-wide" title="Compaction events">
                <CompactionEventList compaction={session.compaction} />
              </SessionDetailCard>
            ) : null}
          </div>
        ) : null}

        {activeTab === "timeline" ? (
          <div className="session-tab-stack">
            <div className="session-timeline-toolbar">
              <label className="search-field session-timeline-search">
                <Search className="h-4 w-4" aria-hidden />
                <input value={timelineSearch} onChange={(event) => setTimelineSearch(event.target.value)} placeholder="Search timeline" />
              </label>
              <div className="session-filter-buttons" aria-label="Timeline filter">
                {([
                  ["all", "All"],
                  ["user", "Prompts"],
                  ["assistant", "Assistant"],
                ] as Array<[TimelineRoleFilter, string]>).map(([filter, label]) => (
                  <button className={timelineRole === filter ? "active" : ""} key={filter} type="button" onClick={() => setTimelineRole(filter)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {filteredTimeline.length ? (
              <ol className="timeline-list session-message-list">
                {filteredTimeline.map((item, index) => {
                  const id = `${item.role}-${item.timestamp ?? "step"}-${index}`;
                  const expanded = expandedTimelineItems.has(id);
                  return (
                    <li key={id}>
                      <div className="timeline-meta">
                        <Badge label={item.role === "user" ? "Prompt" : "Assistant"} />
                        <span>{item.timestamp ? formatDateTime(item.timestamp) : `Step ${index + 1}`}</span>
                      </div>
                      <p className={expanded ? "expanded" : ""}>{item.text}</p>
                      {item.text.length > 280 ? (
                        <button className="text-button mt-2" type="button" onClick={() => toggleTimelineItem(id)}>
                          {expanded ? "Collapse message" : "Expand full message"}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="detail-muted">No timeline messages matched this view, or prompt text was not exposed by this local session log format.</p>
            )}
          </div>
        ) : null}

        {activeTab === "files" ? (
          <div className="session-tab-grid">
            <SessionDetailCard title="Files edited/read">
              <div className="session-mini-grid">
                <MiniStat label="Files edited" value={<CountValue value={session.fileEditCount ?? 0} noun="edit" />} />
                <MiniStat label="Files read" value={<CountValue value={session.fileReadCount ?? 0} noun="read" />} />
                <MiniStat label="Repo / folder" value={session.repoName} />
                <MiniStat label="Branch" value={session.gitBranch ?? "Unknown"} />
              </div>
            </SessionDetailCard>
            <SessionDetailCard title="Commands run">
              <div className="session-mini-grid">
                <MiniStat label="Shell commands" value={<CountValue value={session.shellCommandCount ?? 0} noun="command" />} />
                <MiniStat label="Tool calls" value={<CountValue value={session.toolCallCount ?? 0} noun="tool call" />} />
                <MiniStat label="Non-zero events" value={<CountValue value={session.nonZeroCommandEvents ?? 0} noun="event" />} />
                <MiniStat label="Harmless exits" value={<CountValue value={(session.harmlessNonZeroEvents ?? 0) + (session.exploratoryMisses ?? 0)} noun="event" />} />
              </div>
            </SessionDetailCard>
            <SessionDetailCard className="session-card-wide" title="Possible failed command evidence">
              <CommandReviewEvidence session={session} issues={commandIssueSamples} />
            </SessionDetailCard>
          </div>
        ) : null}

        {activeTab === "tokens" ? (
          <div className="session-tab-grid">
            <SessionDetailCard title="Token breakdown">
              <TokenBreakdownGrid session={session} />
            </SessionDetailCard>
            <SessionDetailCard title="Cache reuse">
              <div className="session-mini-grid">
                <MiniStat label="Cache reuse" value={<PercentValue value={session.inputTokens ? session.cachedInputTokens / session.inputTokens : 0} />} />
                <MiniStat label="Cached input" value={<TokenValue value={session.cachedInputTokens} />} />
                <MiniStat label="Total input" value={<TokenValue value={session.inputTokens} />} />
                <MiniStat label="Confidence" value={<Badge label={confidenceLabel(session.tokenConfidence ?? "low")} />} />
              </div>
              <p className="detail-muted mt-3">{cacheReuseDetail(session)}</p>
            </SessionDetailCard>
            <SessionDetailCard className="session-card-wide" title="Cost driver explanation">
              <p className="detail-muted">{costDriverExplanation(session)}</p>
              <div className="session-mini-grid mt-3">
                <MiniStat label="API-equivalent cost" value={<CostValue value={session.estimatedCostUsd} session={session} />} />
                <MiniStat label="Aggregation" value={<Badge label={aggregationMethodLabel(session.tokenAggregationMethod ?? "unknown")} />} />
                <MiniStat label="Token readings" value={<CountValue value={session.tokenSnapshotCount ?? 0} noun="reading" />} />
                <MiniStat label="Raw token total" value={session.rawTokenTotal === undefined ? "Unknown" : <TokenValue value={session.rawTokenTotal} />} />
              </div>
            </SessionDetailCard>
          </div>
        ) : null}

        {activeTab === "metadata" ? (
          <div className="session-tab-grid">
            <SessionDetailCard title="Repo / folder, branch, provider, source file">
              <div className="metadata-list">
                <MetadataRow label="Repo / folder" value={session.repoName} title={session.repoRoot} />
                <MetadataRow label="Root path" value={shortPath(session.repoRoot)} title={session.repoRoot} />
                <MetadataRow label="Branch" value={session.gitBranch ?? "Unknown"} />
                <MetadataRow label="Provider" value={session.provider ?? "Unknown"} />
                <MetadataRow label="AI provider" value={sourceLabel(session.sourceClient)} />
                <MetadataRow label="App / surface" value={session.sourceApp || surfaceLabel(session.detectedSurface)} />
                <MetadataRow label="Service tier" value={sessionServiceTierMetadata(session)} />
                <MetadataRow label="Source file" value={shortPath(session.sourcePath)} title={session.sourcePath} />
              </div>
            </SessionDetailCard>
            <SessionDetailCard title="Raw records">
              <div className="session-mini-grid">
                <MiniStat label="Raw records" value={<CountValue value={session.rawEventCount ?? 0} noun="record" />} />
                <MiniStat label="Messages" value={<CountValue value={session.messageCount} noun="message" />} />
                <MiniStat label="Started" value={formatDateTime(session.startedAt)} />
                <MiniStat label="Ended" value={formatDateTime(session.endedAt)} />
              </div>
            </SessionDetailCard>
            <SessionDetailCard className="session-card-wide" title="Debug details">
              <div className="metadata-list">
                <MetadataRow label="Session id" value={session.id} title={session.id} />
                <MetadataRow label="Parse status" value={session.parseStatus ?? "Unknown"} />
                <MetadataRow label="Token method" value={aggregationMethodLabel(session.tokenAggregationMethod ?? "unknown")} />
                <MetadataRow label="Surface confidence" value={session.surfaceConfidence ?? "Unknown"} />
                <MetadataRow label="Surface reason" value={session.surfaceReason ?? "Unknown"} />
                <MetadataRow label="Warnings" value={session.warnings.length ? session.warnings.map(readableWarning).join(", ") : "None"} />
                <MetadataRow label="Parse errors" value={(session.parseErrors ?? []).length ? (session.parseErrors ?? []).join(", ") : "None"} />
              </div>
            </SessionDetailCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SessionDetailCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`detail-card session-detail-card ${className}`}>
      <h3>{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SignalList({ items }: { items: string[] }) {
  return (
    <ul className="signal-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function TokenBreakdownGrid({ session }: { session: Session }) {
  return (
    <div className="session-mini-grid">
      <MiniStat label="Total input" value={<TokenValue value={session.inputTokens} />} />
      <MiniStat label="Cached input" value={<TokenValue value={session.cachedInputTokens} />} />
      <MiniStat label="Output" value={<TokenValue value={session.outputTokens} />} />
      <MiniStat label="Reasoning" value={<TokenValue value={session.reasoningTokens} />} />
    </div>
  );
}

function MetadataRow({ label, value, title }: { label: string; value: React.ReactNode; title?: string | undefined }) {
  return (
    <div className="metadata-row">
      <span>{label}</span>
      <strong title={title}>{value}</strong>
    </div>
  );
}

function sessionSummarySentence(session: Session): string {
  const descriptors: string[] = [];
  if (session.totalTokens >= 1_000_000) descriptors.push("High-token session");
  else descriptors.push(`${tokens(session.totalTokens)} session`);
  descriptors.push(`with ${cacheReuseLabel(session)} cache reuse`);
  descriptors.push(importantCommandFailures(session) === 0 ? "and no possible failed commands" : `and ${count(importantCommandFailures(session), "possible failed command")}`);
  return `${descriptors.join(" ")}.`;
}

function cacheReuseLabel(session: Session): string {
  const rate = session.inputTokens ? session.cachedInputTokens / session.inputTokens : 0;
  if (rate >= 0.5) return "strong";
  if (rate >= 0.2) return "moderate";
  if (session.inputTokens > 0) return "low";
  return "unknown";
}

function cacheReuseDetail(session: Session): string {
  const rate = session.inputTokens ? session.cachedInputTokens / session.inputTokens : 0;
  if (!session.inputTokens) return "Cache reuse cannot be calculated because input token data is missing.";
  return `${percent(rate)} of input tokens were reported as cached input. Strong reuse usually means the model was able to reuse existing context efficiently.`;
}

function costDriverExplanation(session: Session): string {
  if (session.estimatedCostUsd === undefined) return "API-equivalent cost is unavailable because this session is missing pricing coverage or a token split.";
  const rows = [
    { label: "input", value: session.inputTokens },
    { label: "cached input", value: session.cachedInputTokens },
    { label: "output", value: session.outputTokens },
    { label: "reasoning", value: session.reasoningTokens },
  ].sort((a, b) => b.value - a.value);
  const top = rows[0] ?? { label: "input", value: session.inputTokens };
  return `The largest token bucket was ${top.label} at ${tokens(top.value)}. Cost is estimated from local token counts and the local pricing table, so it is an API-equivalent estimate rather than an invoice.`;
}

function SessionDetailPage({ session, initialTab, onBack }: { session: Session | undefined; initialTab: SessionDetailTab; onBack: () => void }) {
  return (
    <section className="mt-4 space-y-4">
      <button className="text-button" type="button" onClick={onBack}>Back to sessions</button>
      <SessionDetailPanel session={session} initialTab={initialTab} />
    </section>
  );
}

function SortableTh<T extends string>({
  label,
  column,
  sort,
  setSort,
}: {
  label: string;
  column: T;
  sort: { key: T; direction: SortDirection };
  setSort: (sort: { key: T; direction: SortDirection }) => void;
}) {
  const active = sort.key === column;
  return (
    <th>
      <button
        className={`sort-header ${active ? "active" : ""}`}
        onClick={() => setSort({ key: column, direction: active && sort.direction === "desc" ? "asc" : "desc" })}
        type="button"
      >
        <span>{label}</span>
        <ArrowDownUp className="h-3 w-3" aria-hidden />
        {active ? <span className="sr-only">sorted {sort.direction}</span> : null}
      </button>
    </th>
  );
}

function EmptyState({ data, onRefresh }: { data: ApiData; onRefresh: () => void }) {
  const sourceLabels = data.sources.map((source) => source.label).join(", ") || "Codex, Claude Code, GitHub Copilot";
  const sourcePaths = data.sources.flatMap((source) => source.paths);
  return (
    <div className="panel mt-4 p-6">
      <div className="flex items-start gap-3">
        <Search className="mt-1 h-5 w-5 text-amber" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">RepoSpend could not find local usage sessions yet.</h2>
          <p className="mt-1 text-sm text-slate-600">Providers scanned: {sourceLabels}. Run Codex, Claude Code, or GitHub Copilot locally, then refresh the scan. RepoSpend reads local files read-only and never mutates source data.</p>
          <div className="source-checklist mt-4">
            {data.sourceStats.map((source) => (
              <div className="source-check-row" key={source.sourceId ?? source.homePath ?? source.sessionsPath ?? source.statePath ?? "source"}>
                <div>
                  <strong>{source.sourceLabel ?? "Source"}</strong>
                  <span title={sourceHomePath(source)}>{shortPath(sourceHomePath(source))}</span>
                </div>
                <Badge label={sourcePrimaryDataFound(source) ? "Path found" : "Path missing"} />
                <Badge label={(source.sessionsImported ?? 0) > 0 ? `${count(source.sessionsImported ?? 0, "session")} imported` : "No sessions imported"} />
                <span className="source-check-fix">{sourceEmptyFix(source)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {sourcePaths.map((sourcePath) => <code className="inline-code" key={sourcePath}>{shortPath(sourcePath)}</code>)}
          </div>
          <p className="mt-3 text-sm text-slate-600">If history persistence is disabled or sessions are stored elsewhere, local usage may be unavailable to RepoSpend.</p>
          <button className="button mt-3" type="button" onClick={onRefresh}>Refresh scan</button>
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            {data.sources.flatMap((source) => source.warnings).map((warning) => (
              <p className="warning-text" key={warning}>{warning}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState({ compact = false, data }: { compact?: boolean; data?: ApiData | null }) {
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const startedAtRef = React.useRef(Date.now());

  React.useEffect(() => {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(timer);
  }, [compact]);

  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const cursorEnabled = cursorSourceEnabled(data);
  const stages = [
    { label: "Discovering local source files", detail: cursorEnabled ? "Codex, Claude Code, GitHub Copilot, Cursor, and RTK paths" : "Codex, Claude Code, GitHub Copilot, and RTK paths" },
    { label: "Parsing sessions and token checkpoints", detail: "Reading transcripts and local SQLite/vscdb data" },
    { label: "Grouping by repo or inferred folder", detail: "Resolving cwd paths, models, warnings, and surfaces" },
    { label: "Estimating API-equivalent cost", detail: "Applying local pricing and dashboard filters" },
  ];
  const sourceRows = [
    { id: "codex", label: "Codex", detail: "CLI sessions and token checkpoints", count: data ? sourceImportedSessions(data, "codex") : 0 },
    { id: "claude", label: "Claude Code", detail: "Project JSONL transcripts and history", count: data ? sourceImportedSessions(data, "claude") : 0 },
    { id: "copilot", label: "GitHub Copilot", detail: "OpenTelemetry exports and VS Code chat transcripts", count: data ? sourceImportedSessions(data, "copilot") : 0 },
    ...(cursorEnabled ? [{ id: "cursor", label: "Cursor", detail: "Experimental JSONL and SQLite/vscdb discovery", count: data ? sourceImportedSessions(data, "cursor") : 0 }] : []),
    { id: "rtk", label: "RTK", detail: "Local token-savings report when available", count: data?.rtkGain?.available ? 1 : 0 },
  ];

  return (
    <div className={`panel loading-state ${compact ? "loading-state-compact" : ""}`}>
      <div className="loading-state-inner">
        <RefreshCw className="loading-state-icon animate-spin" aria-hidden />
        <div>
          <h2>{compact ? "Refreshing local scan" : "Loading local AI coding usage"}</h2>
          <p>
            {compact
              ? `Keeping the previous dashboard visible while RepoSpend rescans local files. ${elapsedSeconds}s elapsed.`
              : `RepoSpend is scanning local files, then grouping each session by Git repo or inferred folder. ${elapsedSeconds}s elapsed.`}
          </p>
          <div className="loading-source-grid" aria-label="Local scan sources">
            {sourceRows.map((source) => (
              <div className="loading-source-row" key={source.id}>
                <span className={`loading-source-dot loading-source-dot-${source.id}`} />
                <span>
                  <strong>{source.label}</strong>
                  <small>{data ? `${count(source.count, source.id === "rtk" ? "local report" : "previous session")} · ${source.detail}` : source.detail}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="loading-stage-list" aria-label="Scan work checklist">
            {stages.map((stage) => (
              <div className="loading-stage-row" key={stage.label}>
                <span aria-hidden />
                <div>
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </div>
              </div>
            ))}
          </div>
          {elapsedSeconds >= 12 ? (
            <p className="loading-state-note">Longer scans usually mean RepoSpend is reading a large local transcript set. Results will replace this view as soon as the scan finishes.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "pricing", label: "Pricing" },
  { id: "sources", label: "Data Sources" },
  { id: "doctor", label: "Data Doctor" },
  { id: "tokens", label: "Token Counting" },
  { id: "privacy", label: "Privacy" },
  { id: "advanced", label: "Advanced" },
];

const apiEquivalentCopy = "RepoSpend shows API-equivalent cost estimates. This is not your actual bill. Local Codex, Claude Code, and GitHub Copilot data may include token counts, but they do not always include your real subscription, credit, cache, or provider billing details.";

function SettingsStatusBanner({ data, onRescan }: { data: ApiData; onRescan: () => void }) {
  const codex = sourceImportedSessions(data, "codex");
  const claude = sourceImportedSessions(data, "claude");
  const copilot = sourceImportedSessions(data, "copilot");
  const cursor = sourceImportedSessions(data, "cursor");
  const sourceCounts = [count(codex, "Codex session"), count(claude, "Claude Code session"), count(copilot, "Copilot session")];
  if (cursorSourceEnabled(data)) sourceCounts.push(count(cursor, "Cursor session"));
  return (
    <div className="settings-status-banner">
      <div>
        <div className="settings-status-title">Local scan complete</div>
        <p>
          {sourceCounts.join(", ")}, {count(data.scan.parseFailureCount, "parse issue")}.
        </p>
      </div>
      <button className="button" type="button" onClick={onRescan}>
        <RefreshCw className="h-4 w-4" aria-hidden />
        Rescan local logs
      </button>
    </div>
  );
}

type PricingGapReason = "missingPrice" | "missingTokenDetail" | "missingModel" | "other";
type PricingGapSummary = {
  total: number;
  missingPrice: number;
  missingTokenDetail: number;
  missingModel: number;
  other: number;
  missingPriceModels: string[];
};

function PricingGapPanel({ gap, onReviewUnpricedSessions }: { gap: PricingGapSummary; onReviewUnpricedSessions: () => void }) {
  const hasGaps = gap.total > 0;
  const modelText = gap.missingPriceModels.length ? ` for ${listText(gap.missingPriceModels.slice(0, 3))}${gap.missingPriceModels.length > 3 ? " and more" : ""}` : "";
  return (
    <div className={`pricing-gap-panel ${hasGaps ? "pricing-gap-attention" : "pricing-gap-good"}`}>
      <div>
        <div className="pricing-gap-eyebrow">{hasGaps ? "Pricing gap triage" : "Pricing coverage"}</div>
        <h3>{hasGaps ? `${count(gap.total, "token-bearing session")} cannot show API-equivalent cost` : "All token-bearing sessions can be priced"}</h3>
        <p>
          {gap.missingPrice > 0
            ? `${count(gap.missingPrice, "session")} need usable model rates${modelText}.`
            : "Every used model with detailed token data has a usable rate."}
          {" "}
          {gap.missingTokenDetail > 0
            ? `${count(gap.missingTokenDetail, "session")} are missing detailed token splits, so adding prices will not fix those rows.`
            : "No token-split gaps were detected."}
          {" "}
          {gap.other > 0 ? `${count(gap.other, "session")} need session review after the next scan because the model rate looks usable but no cost was produced.` : null}
        </p>
      </div>
      <div className="pricing-gap-stats" aria-label="Unpriced session causes">
        <PricingGapStat label="Missing rates" value={gap.missingPrice} />
        <PricingGapStat label="Token detail" value={gap.missingTokenDetail} />
        <PricingGapStat label="Model missing" value={gap.missingModel} />
        <PricingGapStat label="Review" value={gap.other} />
      </div>
      {hasGaps ? (
        <button className="button" type="button" onClick={onReviewUnpricedSessions}>
          Review unpriced sessions
        </button>
      ) : null}
    </div>
  );
}

function PricingGapStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="pricing-gap-stat">
      <span>{label}</span>
      <strong>{compactNumber(value)}</strong>
    </div>
  );
}

function pricingGapSummary(sessions: Session[], draft: Record<string, ModelPricing>): PricingGapSummary {
  const summary: PricingGapSummary = {
    total: 0,
    missingPrice: 0,
    missingTokenDetail: 0,
    missingModel: 0,
    other: 0,
    missingPriceModels: [],
  };
  const modelIds = new Set<string>();
  for (const session of sessions) {
    if (session.estimatedCostUsd !== undefined || session.totalTokens <= 0) continue;
    summary.total += 1;
    const reason = pricingGapReason(session, draft);
    if (reason === "missingPrice") {
      summary.missingPrice += 1;
      if (session.model) modelIds.add(session.model);
    } else if (reason === "missingTokenDetail") {
      summary.missingTokenDetail += 1;
    } else if (reason === "missingModel") {
      summary.missingModel += 1;
    } else {
      summary.other += 1;
    }
  }
  summary.missingPriceModels = [...modelIds].sort();
  return summary;
}

function pricingGapReason(session: Session, draft: Record<string, ModelPricing>): PricingGapReason {
  if (session.warnings.includes("missing_token_breakdown") || session.warnings.includes("unknown_cost") || session.warnings.includes("cursor_cost_not_estimated_from_prompt_tokens") || session.warnings.includes("copilot_partial_token_breakdown") || !sessionHasDetailedTokenInputs(session)) {
    return "missingTokenDetail";
  }
  const model = session.model?.trim();
  if (!model || model === "unknown-model") return "missingModel";
  return isUsableModelPricing(resolvePricingForModel(model, draft).pricing) ? "other" : "missingPrice";
}

function sessionHasDetailedTokenInputs(session: Session): boolean {
  return session.inputTokens > 0
    || session.cachedInputTokens > 0
    || (session.cacheCreationInputTokens ?? 0) > 0
    || session.outputTokens > 0
    || session.reasoningTokens > 0;
}

function SettingsPricingTab({
  data,
  draft,
  setDraft,
  status,
  onSave,
  onReset,
  onReviewUnpricedSessions,
}: {
  data: ApiData;
  draft: Record<string, ModelPricing>;
  setDraft: (draft: Record<string, ModelPricing>) => void;
  status: string | null;
  onSave: () => Promise<void>;
  onReset: () => void;
  onReviewUnpricedSessions: () => void;
}) {
  const [newModel, setNewModel] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [providerFilter, setProviderFilter] = React.useState<PricingProviderFilter>("all");
  const [viewFilter, setViewFilter] = React.useState<PricingViewFilter>("used");
  const usedModels = React.useMemo(() => new Set(data.models.map((model) => model.id)), [data.models]);
  const usageCounts = React.useMemo(() => new Map(data.models.map((model) => [model.id, model.sessionCount])), [data.models]);
  const rows = pricingRows(draft, data.models);
  const pricingGap = React.useMemo(() => pricingGapSummary(data.sessions, draft), [data.sessions, draft]);

  const updatePrice = (model: string, key: keyof ModelPricing, value: string) => {
    const parsed = value === "" ? undefined : Number(value);
    const basePricing = resolvePricingForModel(model, draft).pricing;
    setDraft({
      ...draft,
      [model]: {
        ...basePricing,
        [key]: parsed === undefined || Number.isFinite(parsed) ? parsed : draft[model]?.[key],
      } as ModelPricing,
    });
  };
  const addModel = () => {
    const model = newModel.trim();
    if (!model) return;
    setDraft({
      ...draft,
      [model]: draft[model] ?? {
        inputPerMillion: 0,
        cacheCreationInput5mPerMillion: 0,
        cacheCreationInput1hPerMillion: 0,
        cacheCreationInputPerMillion: 0,
        cachedInputPerMillion: 0,
        outputPerMillion: 0,
        reasoningOutputPerMillion: 0,
      },
    });
    setNewModel("");
    setViewFilter("all");
  };
  const visibleRows = rows.filter((row) => {
    const model = row.model.toLowerCase();
    const used = usedModels.has(row.model);
    const provider = pricingProvider(row.model);
    const missing = pricingMissing(row);
    const matchesSearch = !search.trim() || model.includes(search.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (providerFilter !== "all" && provider !== providerFilter) return false;
    if (viewFilter === "used" && !used) return false;
    if (viewFilter === "missing" && (!missing || !used)) return false;
    return true;
  });
  const hiddenUnused = rows.filter((row) => !usedModels.has(row.model)).length;
  const visibleUnused = visibleRows.filter((row) => !usedModels.has(row.model)).length;
  const pricingPath = data.pricing.path ?? "~/.repospend/pricing.json";

  return (
    <div className="settings-tab-panel">
      <div className="settings-section-header">
        <div>
          <h2>Model pricing</h2>
          <p>{apiEquivalentCopy}</p>
        </div>
        <div className="settings-primary-actions">
          <button className="button" type="button" onClick={onReset}>Reset edits</button>
          <button className="button active-button" type="button" onClick={() => void onSave()}>Save pricing</button>
        </div>
      </div>

      <PricingGapPanel gap={pricingGap} onReviewUnpricedSessions={onReviewUnpricedSessions} />

      <div className="pricing-toolbar">
        <label className="search-field pricing-search">
          <Search className="h-4 w-4" aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search model names" />
        </label>
        <div className="pricing-filter-group" aria-label="Model family filter">
          {([
            ["all", "All families"],
            ["openai", "OpenAI"],
            ["claude", "Claude"],
            ["google", "Google"],
            ["copilot", "GitHub-tuned"],
            ["custom", "Custom"],
          ] as Array<[PricingProviderFilter, string]>).map(([filter, label]) => (
            <button key={filter} className={`quick-filter ${providerFilter === filter ? "active" : ""}`} type="button" onClick={() => setProviderFilter(filter)}>
              {label}
            </button>
          ))}
        </div>
        <div className="pricing-filter-group" aria-label="Model view">
          {([
            ["used", "Used models"],
            ["missing", "Used missing prices"],
            ["all", "All models"],
          ] as Array<[PricingViewFilter, string]>).map(([filter, label]) => (
            <button key={filter} className={`quick-filter ${viewFilter === filter ? "active" : ""}`} type="button" onClick={() => setViewFilter(filter)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="pricing-add-row">
        <input className="input" placeholder="Add model id, e.g. gpt-5.5-custom" value={newModel} onChange={(event) => setNewModel(event.target.value)} />
        <button className="button" type="button" onClick={addModel}>Add model</button>
      </div>

      <div className="pricing-meta-row">
        <MiniStat label="Pricing file" value={<span title={pricingPath}>{shortPath(pricingPath)}</span>} />
        <MiniStat label="Models shown" value={`${visibleRows.length} of ${rows.length}`} />
        <MiniStat label="Used models" value={<CountValue value={data.models.length} noun="model" />} />
        <MiniStat label="Hidden unused" value={<CountValue value={Math.max(hiddenUnused - visibleUnused, 0)} noun="model" />} />
      </div>

      <div className="table-wrap settings-table-wrap">
        <table className="pricing-table spacious-pricing-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Input</th>
              <th>Cache write 5m</th>
              <th>Cache write 1h</th>
              <th>Cached input</th>
              <th>Output</th>
              <th>Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.model}>
                <td>
                  <div className="pricing-model-cell">
                  <div className="font-medium"><ModelLabel model={row.model} /></div>
                    <div className="pricing-model-meta">
                      {usedModels.has(row.model) ? `${count(usageCounts.get(row.model) ?? 0, "session")} in current scan` : "Unused in current scan"}
                      {row.inherited && row.sourceModel ? <span>Uses {row.sourceModel} pricing</span> : null}
                      {pricingMissing(row) ? <span className="warning-text">Missing price</span> : null}
                    </div>
                  </div>
                </td>
                <PriceInput value={row.pricing.inputPerMillion} onChange={(value) => updatePrice(row.model, "inputPerMillion", value)} />
                <PriceInput value={row.pricing.cacheCreationInput5mPerMillion ?? row.pricing.cacheCreationInputPerMillion} onChange={(value) => updatePrice(row.model, "cacheCreationInput5mPerMillion", value)} />
                <PriceInput value={row.pricing.cacheCreationInput1hPerMillion ?? row.pricing.cacheCreationInputPerMillion} onChange={(value) => updatePrice(row.model, "cacheCreationInput1hPerMillion", value)} />
                <PriceInput value={row.pricing.cachedInputPerMillion} onChange={(value) => updatePrice(row.model, "cachedInputPerMillion", value)} />
                <PriceInput value={row.pricing.outputPerMillion} onChange={(value) => updatePrice(row.model, "outputPerMillion", value)} />
                <PriceInput value={row.pricing.reasoningOutputPerMillion} onChange={(value) => updatePrice(row.model, "reasoningOutputPerMillion", value)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleRows.length === 0 ? (
        <p className="settings-empty-note">
          {viewFilter === "missing"
            ? "No used models are missing usable rates. If sessions still cannot be priced, review them for missing token splits or missing model metadata."
            : "No models match the current filters."}
        </p>
      ) : null}
      <div className="settings-supporting-copy">
        <p>Rates are USD per 1M tokens. Claude cache writes are priced by the TTL recorded in local usage: 5-minute writes use the 5m rate, 1-hour writes use the 1h rate, and unsplit cache writes fall back to the legacy cache-write rate when present. Saving writes local RepoSpend settings under <code>~/.repospend/</code> unless <code>repospend.config.json</code> sets <code>pricingPath</code>.</p>
        {(data.pricing.info.sourceUrls ?? [{ label: data.pricing.info.sourceName, url: data.pricing.info.sourceUrl }]).map((source) => (
          <a className="text-button" href={source.url} key={source.url}>{source.label}</a>
        ))}
        {status ? <p className="font-semibold text-teal">{status}</p> : null}
      </div>
    </div>
  );
}

function SettingsDataSourcesTab({ data, status, onSaveConfig }: { data: ApiData; status: string | null; onSaveConfig: (config: RepoSpendConfig) => Promise<void> }) {
  const sourceWarnings = data.sources.flatMap((source) => source.warnings);
  const cursorEnabled = cursorSourceEnabled(data);
  const nextCursorConfig: RepoSpendConfig = {
    ...data.config,
    experimentalSources: {
      ...data.config.experimentalSources,
      cursor: !cursorEnabled,
    },
  };
  return (
    <div className="settings-tab-panel">
      <div className="settings-section-header">
        <div>
          <h2>Data sources</h2>
          <p>RepoSpend reads Codex, Claude Code, and GitHub Copilot local data read-only, then groups sessions by Git repo where possible and folder/path fallback otherwise.</p>
        </div>
      </div>
      <label className="settings-toggle-card">
        <input
          type="checkbox"
          checked={cursorEnabled}
          onChange={() => void onSaveConfig(nextCursorConfig)}
        />
        <span className="settings-toggle-copy">
          <strong>Enable experimental Cursor source</strong>
          <span>Cursor local transcripts often omit reliable tokens, model names, timestamps, and cost. RepoSpend keeps this source off by default because accurate Cursor usage usually requires account-backed usage data rather than local files alone.</span>
        </span>
      </label>
      {status ? <p className="font-semibold text-teal">{status}</p> : null}
      <div className="source-card-grid">
        {data.sourceStats.map((source) => (
          <div className="settings-source-card" key={source.sourceId ?? source.codexHome ?? source.claudeHome ?? source.sessionsPath ?? source.statePath ?? "source"}>
            <div className="settings-source-card-header">
              <div>
                <h3>{source.sourceLabel ?? "Unknown source"}</h3>
                <p title={sourceHomePath(source)}>{shortPath(sourceHomePath(source))}</p>
              </div>
              <span className="status-badge">Read only</span>
            </div>
            <div className="settings-source-metrics">
              <MiniStat label="Session files" value={<CountValue value={source.sessionFileCount} noun="file" />} />
              <MiniStat label="Imported sessions" value={<CountValue value={source.sessionsImported ?? 0} noun="session" />} />
              <MiniStat label="Parse issues" value={source.parseFailureCount ? <CountValue value={source.parseFailureCount} noun="issue" /> : "None"} />
              <MiniStat label="Primary data" value={sourcePrimaryDataFound(source) ? "Found" : "Not found"} />
              {source.sourceId === "cursor" ? <MiniStat label="SQLite/vscdb files" value={<CountValue value={source.databaseFileCount ?? 0} noun="file" />} /> : null}
              {source.sourceId === "copilot" ? <MiniStat label="OTEL files" value={<CountValue value={source.otelFileCount ?? 0} noun="file" />} /> : null}
              {source.sourceId === "copilot" ? <MiniStat label="VS Code transcripts" value={<CountValue value={source.transcriptFileCount ?? 0} noun="file" />} /> : null}
              {source.sourceId === "copilot" ? <MiniStat label="CLI state files" value={<CountValue value={source.sessionStateFileCount ?? 0} noun="file" />} /> : null}
              {source.serviceTier ? <MiniStat label="Service tier" value={<Badge label={serviceTierLabel(source.serviceTier)} title={source.serviceTierDetail} tone={serviceTierTone(source.serviceTier)} />} /> : null}
              <MiniStat label="Read-only status" value="Read only" />
              <MiniStat label="Last scan" value={formatDateTime(source.lastScannedAt)} />
            </div>
            <details className="settings-details">
              <summary>Show detected paths</summary>
              <div className="settings-path-list">
                {sourceDetectedPaths(source, data).map((sourcePath) => (
                  <code key={sourcePath} className="inline-code">{sourcePath}</code>
                ))}
              </div>
            </details>
          </div>
        ))}
      </div>
      {sourceWarnings.length ? <p className="warning-text">{sourceWarnings.slice(0, 4).join(" · ")}</p> : null}
    </div>
  );
}

function SettingsTokenCountingTab({ data }: { data: ApiData }) {
  const stats = tokenStats(data);
  return (
    <div className="settings-tab-panel">
      <div className="settings-section-header">
        <div>
          <h2>Token counting</h2>
          <p>Token counts come from local Codex and Claude Code logs. Those logs may be incomplete, so RepoSpend shows the best available count rather than inventing missing billing details.</p>
        </div>
      </div>
      <TokenAccuracyCard data={data} />
      <section className="settings-info-panel">
        <h2>Comparison notes</h2>
        <p>RepoSpend may differ from ccusage, Tokscale, and similar tools for a few expected reasons:</p>
        <ul className="settings-note-list">
          <li>Claude Desktop/local-agent sessions are included when local files exist; many CLI tools focus on <code>~/.claude/projects</code>.</li>
          <li>Cache reads and cache writes stay under input in RepoSpend totals instead of being added again as separate headline tokens.</li>
          <li>Claude cache writes use the recorded 5-minute or 1-hour TTL rate when that split is present.</li>
          <li>Codex reasoning output is separated from visible output so reasoning is priced once.</li>
        </ul>
      </section>
      <details className="settings-details">
        <summary>Show method breakdown</summary>
        <div className="settings-detail-grid">
          {Object.entries(stats.methodCounts).map(([method, value]) => (
            <MiniStat key={method} label={aggregationMethodLabel(method)} value={<CountValue value={value} noun="session" />} />
          ))}
          {Object.entries(stats.confidenceCounts).map(([confidence, value]) => (
            <MiniStat key={confidence} label={`${confidenceLabel(confidence)} confidence`} value={<CountValue value={value} noun="session" />} />
          ))}
        </div>
      </details>
    </div>
  );
}

function SettingsDataDoctorTab({ data }: { data: ApiData }) {
  const confidence = data.confidence;
  const issueSummary = confidence.issues.length === 1
    ? "1 item needs attention before this scan is fully trustworthy."
    : `${count(confidence.issues.length, "item")} need attention before this scan is fully trustworthy.`;
  return (
    <div className="settings-tab-panel">
      <div className="settings-section-header">
        <div>
          <h2>Data doctor</h2>
          <p>Scan confidence is based on local source discovery, token coverage, pricing coverage, repo grouping, parser issues, and token-counting confidence.</p>
        </div>
        <Badge label={`${confidence.label} confidence`} />
      </div>
      <div className="doctor-score-panel">
        <div>
          <span className="doctor-score-label">Confidence score</span>
          <strong>{confidence.score}/100</strong>
        </div>
        <p>{confidence.issues.length ? issueSummary : "No data-confidence issues detected in the current filtered view."}</p>
      </div>
      <div className="settings-detail-grid">
        <MiniStat label="Token coverage" value={<span>{percent(confidence.tokenDataPct)} · {confidence.tokenDataSessions}/{confidence.sessionCount}</span>} />
        <MiniStat label="Pricing coverage" value={<span>{percent(confidence.pricingCoveragePct)} · {confidence.pricedTokenSessions}/{confidence.tokenDataSessions}</span>} />
        <MiniStat label="High-confidence tokens" value={<span>{percent(confidence.highConfidenceTokenPct)} · {confidence.highConfidenceTokenSessions}/{confidence.tokenDataSessions}</span>} />
        <MiniStat label="Verified repo grouping" value={<span>{percent(confidence.verifiedRepoPct)} · {confidence.verifiedRepoSessions}/{confidence.sessionCount}</span>} />
        <MiniStat label="Unpriced token sessions" value={<CountValue value={confidence.unpricedTokenSessions} noun="session" />} />
        <MiniStat label="Missing token sessions" value={<CountValue value={confidence.missingTokenSessions} noun="session" />} />
        <MiniStat label="Unknown surfaces" value={<CountValue value={confidence.unknownSurfaceSessions} noun="session" />} />
        <MiniStat label="Source warnings" value={<CountValue value={confidence.sourceWarningCount} noun="warning" />} />
      </div>
      <div className="confidence-issue-list">
        {confidence.issues.map((issue) => (
          <div className={`confidence-issue-row confidence-${issue.tone}`} key={issue.id}>
            <Badge label={issue.tone} />
            <div>
              <strong>{issue.title}</strong>
              <p>{issue.detail}</p>
              {issue.affectedSessionIds.length ? <span>{count(issue.affectedSessionIds.length, "affected session")}</span> : null}
            </div>
          </div>
        ))}
        {!confidence.issues.length ? <p className="settings-empty-note">Everything RepoSpend can verify locally looks healthy for this filtered view.</p> : null}
      </div>
    </div>
  );
}

function SettingsPrivacyTab() {
  return (
    <div className="settings-tab-panel">
      <div className="settings-section-header">
        <div>
          <h2>Privacy</h2>
          <p>RepoSpend is local-first: no telemetry, no login, no cloud sync, and read-only access to source logs.</p>
        </div>
      </div>
      <div className="privacy-grid">
        <InfoPanel title="Local-first" text="Scans run against files on this machine. RepoSpend does not upload prompts, session content, token counts, or pricing settings." />
        <InfoPanel title="No account required" text="There is no RepoSpend login and no cloud workspace to sync with." />
        <InfoPanel title="Read-only source logs" text="RepoSpend reads local Codex and Claude Code files but does not modify them. Experimental sources stay off unless enabled in Data Sources." />
      </div>
    </div>
  );
}

function SettingsAdvancedTab({
  data,
  filterSortMode,
  setFilterSortMode,
  displaySettings,
  setDisplaySettings,
  onClearLocalData,
  onClearParseCache,
}: {
  data: ApiData;
  filterSortMode: FilterSortMode;
  setFilterSortMode: (mode: FilterSortMode) => void;
  displaySettings: DisplaySettings;
  setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  onClearLocalData: () => Promise<void>;
  onClearParseCache: () => Promise<void>;
}) {
  const stats = tokenStats(data);
  return (
    <div className="settings-tab-panel">
      <div className="settings-section-header">
        <div>
          <h2>Advanced</h2>
          <p>Operational details and local dashboard preferences.</p>
        </div>
      </div>
      <div className="advanced-settings-grid">
        <div className="settings-subsection">
          <h3>Dashboard preferences</h3>
          <div className="settings-control-grid">
            <label className="field">
              <span><Filter className="h-4 w-4" />Filter order</span>
              <select value={filterSortMode} onChange={(event) => setFilterSortMode(event.target.value as FilterSortMode)}>
                <option value="usage">Usage, high to low</option>
                <option value="name">Name, A to Z</option>
              </select>
            </label>
            <LimitSelect
              label="Chart groups"
              value={displaySettings.chartGroupLimit}
              options={chartLimitOptions}
              onChange={(value) => setDisplaySettings({ chartGroupLimit: value })}
            />
            <LimitSelect
              label="Rows per page"
              value={displaySettings.tablePageSize}
              options={pageSizeOptions}
              onChange={(value) => setDisplaySettings({ tablePageSize: value })}
            />
            <label className="settings-toggle-card">
              <input
                type="checkbox"
                checked={displaySettings.splitSourceApps}
                onChange={(event) => setDisplaySettings({ splitSourceApps: event.target.checked })}
              />
              <span className="settings-toggle-copy">
                <strong>Split apps / surfaces by provider</strong>
                <span>Shows VS Code and Terminal as separate entries for each AI provider instead of grouping them together.</span>
              </span>
            </label>
          </div>
        </div>

        <div className="settings-subsection">
          <div className="panel-inline-heading">
            <Database className="h-4 w-4 text-teal" aria-hidden />
            <h3>Parser Health</h3>
          </div>
          <div className="parser-health-grid mt-3">
            <MiniStat label="Session files scanned" value={<CountValue value={data.scan.sessionFileCount} noun="file" />} />
            <MiniStat label="Sessions imported" value={<CountValue value={data.scan.sessionCount} noun="session" />} />
            <MiniStat label="Sessions skipped" value={<CountValue value={data.scan.zeroTokenSessionCount} noun="session" />} />
            <MiniStat label="Parse issues" value={<CountValue value={data.scan.parseFailureCount} noun="issue" />} />
            <MiniStat label="Token checkpoints found" value={<CountValue value={stats.tokenSnapshots} noun="checkpoint" />} />
            <MiniStat label="Sessions with token data" value={<CountValue value={stats.sessionsWithTokenData} noun="session" />} />
            <MiniStat label="Missing token data" value={<CountValue value={stats.sessionsMissingTokenData} noun="session" />} />
            <MiniStat label="Last scan" value={formatDateTime(data.scan.lastScannedAt)} />
          </div>
        </div>
      </div>

      <div className="panel settings-cache-zone p-4">
        <div>
          <h2>Parse cache</h2>
          <p>
            RepoSpend caches parsed session summaries under <code>~/.repospend/cache</code> so unchanged local transcripts load quickly. Clear this cache to force a full reparse without removing pricing or source settings.
          </p>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => void onClearParseCache()}
        >
          Clear parse cache
        </button>
      </div>

      <div className="panel red-zone settings-danger-zone p-4">
        <div>
          <h2>Danger zone</h2>
          <p>
            This only removes RepoSpend-owned local settings under <code>~/.repospend/</code>. It does not touch Codex logs in <code>~/.codex</code> or Claude Code logs in <code>~/.claude</code>.
          </p>
        </div>
        <button
          className="button danger-button"
          type="button"
          onClick={() => {
            if (window.confirm("Clear RepoSpend local data under ~/.repospend and reload? Codex and Claude Code source data will not be touched.")) {
              void onClearLocalData();
            }
          }}
        >
          Clear local RepoSpend data
        </button>
      </div>
    </div>
  );
}

function InfoPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="settings-info-panel">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

function SettingsPage({
  data,
  draft,
  setDraft,
  status,
  filterSortMode,
  setFilterSortMode,
  displaySettings,
  setDisplaySettings,
  onSave,
  onReset,
  onSaveConfig,
  onClearLocalData,
  onClearParseCache,
  onReviewUnpricedSessions,
  onRescan,
}: {
  data: ApiData;
  draft: Record<string, ModelPricing>;
  setDraft: (draft: Record<string, ModelPricing>) => void;
  status: string | null;
  filterSortMode: FilterSortMode;
  setFilterSortMode: (mode: FilterSortMode) => void;
  displaySettings: DisplaySettings;
  setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  onSave: () => Promise<void>;
  onReset: () => void;
  onSaveConfig: (config: RepoSpendConfig) => Promise<void>;
  onClearLocalData: () => Promise<void>;
  onClearParseCache: () => Promise<void>;
  onReviewUnpricedSessions: () => void;
  onRescan: () => void;
}) {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("pricing");

  return (
    <section className="settings-page mt-4">
      <SettingsStatusBanner data={data} onRescan={onRescan} />
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="panel settings-panel">
        {activeTab === "pricing" ? (
          <SettingsPricingTab data={data} draft={draft} setDraft={setDraft} status={status} onSave={onSave} onReset={onReset} onReviewUnpricedSessions={onReviewUnpricedSessions} />
        ) : null}
        {activeTab === "sources" ? <SettingsDataSourcesTab data={data} status={status} onSaveConfig={onSaveConfig} /> : null}
        {activeTab === "doctor" ? <SettingsDataDoctorTab data={data} /> : null}
        {activeTab === "tokens" ? <SettingsTokenCountingTab data={data} /> : null}
        {activeTab === "privacy" ? <SettingsPrivacyTab /> : null}
        {activeTab === "advanced" ? (
          <SettingsAdvancedTab
            data={data}
            filterSortMode={filterSortMode}
            setFilterSortMode={setFilterSortMode}
            displaySettings={displaySettings}
            setDisplaySettings={setDisplaySettings}
            onClearLocalData={onClearLocalData}
            onClearParseCache={onClearParseCache}
          />
        ) : null}
      </div>
    </section>
  );
}

function PriceInput({ value, onChange }: { value: number | undefined; onChange: (value: string) => void }) {
  return (
    <td>
      <input className="price-input" min="0" step="0.001" type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </td>
  );
}

function SessionColumnPicker({ columns, setColumns }: { columns: SessionColumnKey[]; setColumns: React.Dispatch<React.SetStateAction<SessionColumnKey[]>> }) {
  const [open, setOpen] = React.useState(false);
  const grouped = React.useMemo(() => {
    return sessionColumnOptions.reduce<Record<string, Array<(typeof sessionColumnOptions)[number]>>>((groups, option) => {
      groups[option.group] = groups[option.group] ? [...(groups[option.group] ?? []), option] : [option];
      return groups;
    }, {});
  }, []);
  const toggle = (key: SessionColumnKey) => {
    setColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };
  return (
    <div className="column-menu-wrap">
      <button className="button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Columns3 className="h-4 w-4" aria-hidden />
        Columns
      </button>
      {open ? (
        <div className="column-menu" role="menu">
          <div className="column-menu-header">
            <span>Visible columns</span>
            <button className="text-button" type="button" onClick={() => setColumns(defaultSessionColumns)}>Reset</button>
          </div>
          {Object.entries(grouped).map(([group, options]) => (
            <div className="column-menu-group" key={group}>
              <div className="column-menu-label">{group}</div>
              {options.map((option) => (
                <label className="column-menu-option" key={option.key}>
                  <input type="checkbox" checked={columns.includes(option.key)} onChange={() => toggle(option.key)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SessionsPage({ data, displaySettings, setDisplaySettings, onOpenSession, searchIntent, onSearchIntentConsumed }: { data: ApiData; displaySettings: DisplaySettings; setDisplaySettings: (settings: Partial<DisplaySettings>) => void; onOpenSession: (sessionId: string) => void; searchIntent?: SessionSearchIntent | null; onSearchIntentConsumed: () => void }) {
  const [search, setSearch] = React.useState("");
  const [quickFilter, setQuickFilter] = React.useState<QuickSessionFilter | "">("");
  const [visibleColumns, setVisibleColumns] = React.useState<SessionColumnKey[]>(defaultSessionColumns);
  React.useEffect(() => {
    if (!searchIntent) return;
    setSearch(searchIntent.search);
    setQuickFilter("");
    onSearchIntentConsumed();
  }, [onSearchIntentConsumed, searchIntent]);
  const filteredSessions = React.useMemo(
    () => data.sessions.filter((session) => sessionMatchesSearch(session, search) && sessionMatchesQuickFilter(session, quickFilter)),
    [data.sessions, quickFilter, search],
  );
  const filteredTokens = filteredSessions.reduce((sum, session) => sum + session.totalTokens, 0);
  const filteredKnownCost = filteredSessions.reduce<number | undefined>((sum, session) => {
    if (session.estimatedCostUsd === undefined) return sum;
    return Number(((sum ?? 0) + session.estimatedCostUsd).toFixed(6));
  }, undefined);
  const filteredCommands = filteredSessions.reduce((sum, session) => sum + (session.shellCommandCount ?? 0), 0);
  const filteredEdits = filteredSessions.reduce((sum, session) => sum + (session.fileEditCount ?? 0), 0);
  const filteredReviewSessions = filteredSessions.filter(sessionNeedsCommandReview).length;
  const costOutlierThreshold = React.useMemo(() => sessionCostOutlierThreshold(filteredSessions), [filteredSessions]);
  const costOutlierCount = filteredSessions.filter((session) => isCostOutlier(session, costOutlierThreshold)).length;
  const quickOptions: Array<{ value: QuickSessionFilter; label: string }> = [
    { value: "highToken", label: "High token" },
    { value: "failedCommands", label: "Possible failed commands" },
    { value: "noEdits", label: "No edits" },
    { value: "completed", label: "Completed" },
    { value: "partial", label: "Partial" },
    { value: "vscode", label: "VS Code" },
    { value: "terminal", label: "Terminal" },
    { value: "unknownSurface", label: "Unknown surface" },
  ];
  return (
    <section className="mt-4 space-y-4">
      <div className="page-summary-panel">
        <MiniStat label="Loaded sessions" value={<CountValue value={filteredSessions.length} noun="session" />} />
        <MiniStat label="Total tokens" value={<TokenValue value={filteredTokens} />} />
        <MiniStat label="API-equivalent cost" value={<CostValue value={filteredKnownCost} />} />
        <MiniStat label="Sessions needing review" value={<CountValue value={filteredReviewSessions} noun="session" />} />
        <MiniStat label="File edits detected" value={<CountValue value={filteredEdits} noun="edit" />} />
        <MiniStat label="Commands run" value={<CountValue value={filteredCommands} noun="command" />} />
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Session Inventory</h2>
            <p className="text-sm text-slate-600">Local metadata parsed from source threads and session files.</p>
          </div>
          <div className="panel-actions">
            <button className="button" type="button" onClick={() => exportSessionsCsv(filteredSessions)}>
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </button>
            <SessionColumnPicker columns={visibleColumns} setColumns={setVisibleColumns} />
          </div>
        </div>
        <div className="session-controls">
          <label className="search-field">
            <Search className="h-4 w-4" aria-hidden />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sessions..." />
          </label>
          <div className="quick-filter-row">
            <button className={`quick-filter ${quickFilter === "" ? "active" : ""}`} type="button" onClick={() => setQuickFilter("")}>All</button>
            {quickOptions.map((option) => {
              const countForFilter = data.sessions.filter((session) => sessionMatchesQuickFilter(session, option.value)).length;
              return (
                <button
                  className={`quick-filter ${quickFilter === option.value ? "active" : ""}`}
                  disabled={countForFilter === 0}
                  key={option.value}
                  type="button"
                  onClick={() => setQuickFilter(option.value)}
                  title={countForFilter === 0 ? "No matching sessions in this view" : `${countForFilter} matching sessions`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <ResultsSummary shown={filteredSessions.length} total={data.sessions.length} itemLabel="sessions" />
          {costOutlierCount > 0 ? (
            <div className="session-table-legend" aria-label="Session table legend">
              <span className="session-legend-item">
                <span className="session-legend-swatch session-legend-cost" aria-hidden />
                {count(costOutlierCount, "cost outlier")}
              </span>
            </div>
          ) : null}
        </div>
        {filteredSessions.length ? (
          <SessionsTable
            sessions={filteredSessions}
            pageSize={displaySettings.tablePageSize}
            onSelectSession={onOpenSession}
            visibleColumns={visibleColumns}
            onPageSizeChange={(value) => setDisplaySettings({ tablePageSize: value })}
          />
        ) : <EmptyPanel title="No sessions matched this filter." text="Try clearing the search box, quick filter, or top dashboard filters." />}
      </div>
    </section>
  );
}

function ReposPage({ data, onSelectRepo, selectedRepo, displaySettings, setDisplaySettings }: { data: ApiData; onSelectRepo: (repoId: string) => void; selectedRepo: string | null; displaySettings: DisplaySettings; setDisplaySettings: (settings: Partial<DisplaySettings>) => void }) {
  const rows = repoRows(data);
  const topRepo = rows[0];
  const reposWithIssues = rows.filter((repo) => repo.failedCommandCount > 0).length;
  const missingPricingSessions = data.sessions.filter((session) => session.estimatedCostUsd === undefined && session.totalTokens > 0).length;
  const topRepoShare = topRepo && data.summary.estimatedCostUsd ? (topRepo.estimatedCostUsd ?? 0) / data.summary.estimatedCostUsd : 0;
  return (
    <section className="mt-4 space-y-4">
      <div className="page-summary-panel">
        <MiniStat label="Repos / folders discovered" value={<CountValue value={rows.length} noun="item" />} />
        <MiniStat label="Top estimated cost repo / folder" value={topRepo ? topRepo.label : "None"} />
        <MiniStat label="Top repo/folder share" value={<PercentValue value={topRepoShare} />} />
        <MiniStat label="Repos / folders with possible failed commands" value={<CountValue value={reposWithIssues} noun="item" />} />
        <MiniStat label="Unpriced token sessions" value={<CountValue value={missingPricingSessions} noun="session" />} />
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Repos / folders</h2>
            <p className="text-sm text-slate-600">Compare local AI coding usage by confirmed Git repo root or inferred folder. Nested working directories are merged into their parent repo/folder when a Git root is available.</p>
          </div>
          <div className="panel-actions">
            <button className="button" type="button" onClick={() => exportReposCsv(rows)}>
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </button>
            <ResultsSummary shown={rows.length} total={rows.length} itemLabel="repos / folders" />
          </div>
        </div>
        <RepoTable
          repos={rows}
          onSelect={onSelectRepo}
          selectedRepo={selectedRepo}
          pageSize={displaySettings.tablePageSize}
          {...(rows.length > 25 ? { onPageSizeChange: (value: number) => setDisplaySettings({ tablePageSize: value }) } : {})}
        />
      </div>
    </section>
  );
}


function ModelsPage({
  data,
  displaySettings,
  setDisplaySettings,
  onOpenRepo,
  onOpenSession,
  onFilterModel,
}: {
  data: ApiData;
  displaySettings: DisplaySettings;
  setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  onOpenRepo: (repoId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onFilterModel: (modelId: string) => void;
}) {
  const [modelMetric, setModelMetric] = React.useState<MetricKey>("totalTokens");
  const rows = modelUsageRows(data);
  const topModel = rows[0];
  const modelsWithUnknownCost = rows.filter((model) => model.estimatedCostUsd === undefined && model.totalTokens > 0).length;
  const bestCache = [...rows].sort((a, b) => b.cacheRate - a.cacheRate)[0];
  const topInputModel = [...rows].sort((a, b) => b.inputTokens - a.inputTokens)[0];
  const topCachedModel = [...rows].sort((a, b) => b.cachedInputTokens - a.cachedInputTokens)[0];
  const topOutputModel = [...rows].sort((a, b) => b.outputTokens - a.outputTokens)[0];
  const topReasoningModel = [...rows].sort((a, b) => b.reasoningTokens - a.reasoningTokens)[0];
  const modelShareRows = React.useMemo(
    () => [...rows]
      .map((row) => ({ id: row.id, label: row.label, value: timelineMetricValue(row, modelMetric) }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, displaySettings.chartGroupLimit),
    [displaySettings.chartGroupLimit, modelMetric, rows],
  );
  const modelShareTotal = React.useMemo(() => rows.reduce((sum, row) => sum + Math.max(timelineMetricValue(row, modelMetric), 0), 0), [modelMetric, rows]);
  return (
    <section className="mt-4 space-y-4">
      <div className="page-summary-panel">
        <MiniStat label="Models used" value={<CountValue value={rows.length} noun="model" />} />
        <MiniStat label="Top estimated cost model" value={topModel ? <ModelLabel model={topModel.label} /> : "None"} />
        <MiniStat label="Top model share" value={<PercentValue value={topModel && data.summary.estimatedCostUsd ? (topModel.estimatedCostUsd ?? 0) / data.summary.estimatedCostUsd : 0} />} />
        <MiniStat label="Best cache reuse" value={bestCache ? <span>{bestCache.label} · <PercentValue value={bestCache.cacheRate} /></span> : "None"} />
        <MiniStat label="Unpriced token models" value={<CountValue value={modelsWithUnknownCost} noun="model" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <ChartPanel
          title={`Models: ${metricLabel(modelMetric)}`}
          className="overview-chart-panel model-chart-panel"
          actions={(
            <Select
              icon={<Calculator />}
              label="Chart metric"
              value={modelMetric}
              onChange={(value) => setModelMetric(value as MetricKey)}
              options={metricOptions}
            />
          )}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={groupUsageForChart(rows, modelMetric, displaySettings.chartGroupLimit)} layout="vertical" margin={{ left: 16, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
              <XAxis type="number" tickFormatter={(value) => metricTick(modelMetric, Number(value))} tick={{ fill: "#94a3b8" }} />
              <YAxis dataKey="label" type="category" width={170} tickFormatter={(value) => compactModelLabel(String(value))} tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(value) => tooltipMetric(modelMetric, Number(value))} />
              <Bar dataKey={modelMetric} name={metricLabel(modelMetric)} fill={modelMetric === "estimatedCostUsd" ? "#f59e0b" : "#2dd4bf"} minPointSize={positiveBarMinPointSize} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <div className="panel model-shape-panel">
          <div className="panel-heading">
            <div>
              <h2>Model distribution</h2>
              <p className="text-sm text-slate-600">Share of {metricLabel(modelMetric).toLowerCase()} in this filtered view.</p>
            </div>
          </div>
          <ModelShareList rows={modelShareRows} total={modelShareTotal} metric={modelMetric} />
          <div className="model-shape-list">
            <MiniStat label="Highest input" value={topInputModel ? <span>{topInputModel.label} · <TokenValue value={topInputModel.inputTokens} /></span> : "None"} />
            <MiniStat label="Largest cached input" value={topCachedModel && topCachedModel.cachedInputTokens > 0 ? <span>{topCachedModel.label} · <TokenValue value={topCachedModel.cachedInputTokens} /></span> : "None"} />
            <MiniStat label="Highest output" value={topOutputModel ? <span>{topOutputModel.label} · <TokenValue value={topOutputModel.outputTokens} /></span> : "None"} />
            <MiniStat label="Highest reasoning" value={topReasoningModel ? <span>{topReasoningModel.label} · <TokenValue value={topReasoningModel.reasoningTokens} /></span> : "None"} />
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Models</h2>
            <p className="text-sm text-slate-600">Compare each model by input tokens, cached input, output, reasoning, sessions, API-equivalent cost, cache reuse, and repo concentration.</p>
          </div>
          <div className="panel-actions">
            <LimitSelect label="Rows" value={displaySettings.tablePageSize} options={pageSizeOptions} onChange={(value) => setDisplaySettings({ tablePageSize: value })} />
            <ResultsSummary shown={rows.length} total={rows.length} itemLabel="models" />
          </div>
        </div>
        <ModelTable rows={rows} pageSize={displaySettings.tablePageSize} onOpenRepo={onOpenRepo} onOpenSession={onOpenSession} onFilterModel={onFilterModel} />
      </div>
    </section>
  );
}

function ModelShareList({ rows, total, metric }: { rows: Array<{ id: string; label: string; value: number }>; total: number; metric: MetricKey }) {
  if (!rows.length || total <= 0) {
    return <p className="model-share-empty">No positive values for this metric.</p>;
  }
  return (
    <div className="model-share-list">
      {rows.map((row) => {
        const share = row.value / total;
        const [valueLabel] = tooltipMetric(metric, row.value);
        return (
          <div className="model-share-row" key={row.id}>
            <div className="model-share-copy">
              <ModelLabel model={row.label} />
              <strong>{valueLabel}</strong>
            </div>
            <div className="model-share-track" aria-hidden>
              <div style={{ width: `${Math.max(1, Math.min(share * 100, 100))}%` }} />
            </div>
            <span>{percent(share)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ModelTable({
  rows,
  pageSize,
  onOpenRepo,
  onOpenSession,
  onFilterModel,
}: {
  rows: ModelUsageRow[];
  pageSize: number;
  onOpenRepo: (repoId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onFilterModel: (modelId: string) => void;
}) {
  const [sort, setSort] = React.useState<{ key: ModelSortKey; direction: SortDirection }>({ key: "cost", direction: "desc" });
  const sortedRows = React.useMemo(() => sortModelRows(rows, sort), [rows, sort]);
  const pager = usePagination(sortedRows, pageSize);
  return (
    <div className="table-wrap">
      <table className="model-table">
        <thead>
          <tr>
            <SortableTh label="Model" column="model" sort={sort} setSort={setSort} />
            <th>Provider</th>
            <SortableTh label="API-equivalent cost" column="cost" sort={sort} setSort={setSort} />
            <SortableTh label="Total tokens" column="tokens" sort={sort} setSort={setSort} />
            <SortableTh label="Total input" column="input" sort={sort} setSort={setSort} />
            <SortableTh label="Cached input" column="cached" sort={sort} setSort={setSort} />
            <SortableTh label="Output" column="output" sort={sort} setSort={setSort} />
            <SortableTh label="Reasoning" column="reasoning" sort={sort} setSort={setSort} />
            <SortableTh label="Sessions" column="sessions" sort={sort} setSort={setSort} />
            <SortableTh label="Cache hit" column="cache" sort={sort} setSort={setSort} />
            <SortableTh label="Top repo / folder" column="repo" sort={sort} setSort={setSort} />
            <SortableTh label="Latest activity" column="activity" sort={sort} setSort={setSort} />
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {pager.items.map((model) => (
            <tr key={model.id}>
              <td className="font-medium"><ModelLabel model={model.label} /></td>
              <td><Badge label={model.providerLabel} /></td>
              <td><CostValue value={model.estimatedCostUsd} breakdown={model} /></td>
              <td><TokenValue value={model.totalTokens} showUnit={false} /></td>
              <td><TokenValue value={model.inputTokens} showUnit={false} /></td>
              <td><TokenValue value={model.cachedInputTokens} showUnit={false} /></td>
              <td><TokenValue value={model.outputTokens} showUnit={false} /></td>
              <td><TokenValue value={model.reasoningTokens} showUnit={false} /></td>
              <td><CountValue value={model.sessionCount} noun="session" showUnit={false} /></td>
              <td><PercentValue value={model.cacheRate} /></td>
              <td>
                {model.topRepo ? (
                  <button className="row-link-button" type="button" onClick={() => onOpenRepo(model.topRepo!.id)}>
                    <RepoLabel name={model.topRepo.label} verified={model.topRepo.verified === true} />
                  </button>
                ) : "None"}
              </td>
              <td>
                {model.latestSession ? (
                  <button className="row-link-button" type="button" onClick={() => onOpenSession(model.latestSession!.id)}>
                    {relativeTimeLabel(model.latestSession.startedAt ?? model.latestSession.endedAt)}
                  </button>
                ) : "Unknown"}
              </td>
              <td>
                <button className="button compact-button" type="button" onClick={() => onFilterModel(model.id)}>
                  Filter
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls page={pager.page} pageCount={pager.pageCount} total={sortedRows.length} pageSize={pageSize} onPageChange={pager.setPage} />
    </div>
  );
}

function RepoDetailPage({ data, selectedRepo, dateRangeLabel, pageSize, onBack, onOpenSession }: { data: ApiData; selectedRepo: string | null; dateRangeLabel: string; pageSize: number; onBack: () => void; onOpenSession: (sessionId: string) => void }) {
  const rows = repoRows(data);
  const selected = selectedRepo ? rows.find((repo) => repo.id === selectedRepo) : undefined;
  return (
    <section className="mt-4 space-y-4">
      <button className="text-button" type="button" onClick={onBack}>Back to repos / folders</button>
      <RepoDetail repo={selected} sessions={selected?.sessions ?? []} allRepos={rows} data={data} dateRangeLabel={dateRangeLabel} pageSize={pageSize} onOpenSession={onOpenSession} />
    </section>
  );
}

function activateClickableRow(event: React.KeyboardEvent, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

type CommandIssueSampleView = NonNullable<Session["commandIssueSamples"]>[number];

function primaryCommandIssue(session: Session): CommandIssueSampleView | undefined {
  const samples = session.commandIssueSamples ?? [];
  return samples.find((issue) => issue.severity === "critical" || issue.severity === "warning") ?? samples[0];
}

function sortCommandReviewSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const issueDelta = importantCommandFailures(b) - importantCommandFailures(a);
    if (issueDelta !== 0) return issueDelta;
    const clusterDelta = (b.repeatedFailureClusters ?? 0) - (a.repeatedFailureClusters ?? 0);
    if (clusterDelta !== 0) return clusterDelta;
    return b.totalTokens - a.totalTokens;
  });
}

function knownCostTotal(sessions: Session[]): number | undefined {
  const known = sessions.filter((session) => session.estimatedCostUsd !== undefined);
  if (!known.length) return undefined;
  return Number(known.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0).toFixed(6));
}

function commandIssueDisplayText(issue: CommandIssueSampleView): string {
  const command = issue.command.trim();
  if (!command || command.startsWith("{") || command.startsWith("[") || command.includes('"timestamp"')) {
    return `${failureTypeLabel(issue.category)} signal`;
  }
  return shortCommand(command);
}

function commandIssueTitle(issue: CommandIssueSampleView): string {
  const command = issue.command.trim();
  if (!command || command.startsWith("{") || command.startsWith("[") || command.includes('"timestamp"')) {
    return issue.reason;
  }
  return `${command}\n${issue.reason}`;
}

function CommandReviewEvidence({ session, issues }: { session: Session; issues: CommandIssueSampleView[] }) {
  const possibleFailures = importantCommandFailures(session);
  return (
    <div className="command-review-evidence">
      <p>
        RepoSpend flagged {count(possibleFailures, "possible failed command")} from local command/tool records. Review this evidence before treating it as a repo bug.
      </p>
      {issues.length ? (
        <div className="space-y-2">
          {issues.map((issue, index) => (
            <div className="issue-row" key={`${issue.command}-${index}`}>
              <div>
                <div className="font-mono text-xs text-slate-100" title={commandIssueTitle(issue)}>{commandIssueDisplayText(issue)}</div>
                <p className="mt-1 text-xs text-slate-500">{issue.reason}</p>
              </div>
              <div className="issue-row-badges">
                <Badge label={readableIssueLabel(issue.category)} />
                <Badge label={readableIssueLabel(issue.severity)} />
                <Badge label={`${issue.impact} impact`} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="detail-muted">No command evidence was available in this local session log.</p>
      )}
      <p className="command-review-note">
        This is a triage signal, not a verdict. If the evidence is a search miss or unrelated output text, treat it as harmless.
      </p>
    </div>
  );
}

function AgentFrictionActionPanel({
  topRepo,
  topSession,
  reviewCost,
  onOpenRepo,
  onOpenSession,
}: {
  topRepo: AgentFrictionRepo | undefined;
  topSession: Session | undefined;
  reviewCost: number | undefined;
  onOpenRepo: (repoId: string) => void;
  onOpenSession: (sessionId: string, initialTab?: SessionDetailTab) => void;
}) {
  const topIssue = topSession ? primaryCommandIssue(topSession) : undefined;
  const hasReview = Boolean(topRepo || topSession);
  const failureLabel = failureTypeLabel(topRepo?.topFailureType ?? topIssue?.category);
  return (
    <div className={`friction-action-panel ${hasReview ? "friction-action-attention" : "friction-action-good"}`}>
      <div className="friction-action-copy">
        <div className="friction-action-eyebrow">{hasReview ? "Start with this repo" : "No action needed"}</div>
        <h2>
          {topRepo
            ? `Possible ${failureLabel} failures in ${topRepo.repoName}`
            : topSession
              ? `Possible ${failureLabel} failure in ${topSession.repoName}`
            : "No possible failed commands detected"}
        </h2>
        <p>
          {hasReview
            ? `${count(topRepo?.importantFailures ?? importantCommandFailures(topSession!), "flagged command")} across ${count(topRepo?.sessionsNeedingReview ?? 1, "session")}. Known API-equivalent cost in sessions to review: ${money(reviewCost)}.`
            : "Non-zero shell exits in this filtered view are either absent or classified as harmless exploration."}
        </p>
        {topIssue ? <p className="friction-action-command" title={commandIssueTitle(topIssue)}>{commandIssueDisplayText(topIssue)}</p> : null}
      </div>
      {hasReview ? (
        <div className="friction-action-buttons">
          {topRepo ? <button className="button" type="button" onClick={() => onOpenRepo(topRepo.repoRoot)}>Open repo</button> : null}
          {topSession ? <button className="button active-button" type="button" onClick={() => onOpenSession(topSession.id, "files")}>Open evidence</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function CommandSignalCell({ session }: { session: Session }) {
  const issue = primaryCommandIssue(session);
  if (!issue) {
    return <span className="text-xs text-slate-500">Review command evidence</span>;
  }
  return (
    <div className="command-signal-cell">
      <div className="command-signal-command" title={commandIssueTitle(issue)}>{commandIssueDisplayText(issue)}</div>
      <p>{issue.reason}</p>
    </div>
  );
}

function AgentFrictionPage({ data, onOpenRepo, onOpenSession, displaySettings, setDisplaySettings }: { data: ApiData; onOpenRepo: (repoId: string) => void; onOpenSession: (sessionId: string, initialTab?: SessionDetailTab) => void; displaySettings: DisplaySettings; setDisplaySettings: (settings: Partial<DisplaySettings>) => void }) {
  const reviewSessions = data.sessions.filter(sessionNeedsCommandReview);
  const sortedReviewSessions = sortCommandReviewSessions(reviewSessions);
  const harmlessSessions = data.sessions.filter((session) => importantCommandFailures(session) === 0 && ((session.harmlessNonZeroEvents ?? 0) > 0 || (session.exploratoryMisses ?? 0) > 0));
  const affectedRepos = agentFrictionRepos(data.sessions);
  const repoPager = usePagination(affectedRepos, displaySettings.tablePageSize);
  const reviewPager = usePagination(sortedReviewSessions, displaySettings.tablePageSize);
  const harmlessPager = usePagination(harmlessSessions, displaySettings.tablePageSize);
  const topRepo = affectedRepos[0];
  const topReviewRepo = affectedRepos.find((repo) => repo.importantFailures > 0 || repo.repeatedFailureClusters > 0 || repo.sessionsNeedingReview > 0);
  const topReviewSession = topReviewRepo ? sortedReviewSessions.find((session) => session.repoRoot === topReviewRepo.repoRoot) ?? sortedReviewSessions[0] : sortedReviewSessions[0];
  const reviewCost = knownCostTotal(reviewSessions);
  return (
    <section className="mt-4 space-y-4">
      <AgentFrictionActionPanel topRepo={topReviewRepo} topSession={topReviewSession} reviewCost={reviewCost} onOpenRepo={onOpenRepo} onOpenSession={onOpenSession} />
      <div className="page-summary-panel">
        <MiniStat label="Possible failed commands" value={<CountValue value={data.summary.importantCommandFailures} noun="command" />} />
        <MiniStat label="Repeated failure clusters" value={<CountValue value={data.summary.repeatedFailureClusters} noun="cluster" />} />
        <MiniStat label="Harmless non-zero exits" value={<CountValue value={data.summary.harmlessNonZeroEvents + data.summary.exploratoryMisses} noun="event" />} />
        <MiniStat label="Sessions needing review" value={<CountValue value={reviewSessions.length} noun="session" />} />
        <MiniStat label="Known cost under review" value={<CostValue value={reviewCost} />} />
        <MiniStat label="Top affected repo / folder" value={topRepo ? topRepo.repoName : "None"} />
      </div>
      <p className="text-xs text-slate-500">Total non-zero command events: {count(data.summary.nonZeroCommandEvents, "event")}.</p>

      <details className="panel command-health-note">
        <summary className="advanced-summary">
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-amber" aria-hidden />
            How possible failed commands are classified
          </span>
        </summary>
        <div className="command-health-note-body">
          <p>
            Many shell commands return a non-zero exit during normal exploration. RepoSpend separates blocking failures from harmless non-zero exits and focuses on repeated, blocking, or token-expensive command failures.
          </p>
          <p>
            Search misses, optional file probes, and Git diff checks are treated as low severity unless other evidence suggests they blocked progress. Builds, tests, installs, permissions, auth, database, deploy, and repeated failures are treated as important signals.
          </p>
        </div>
      </details>

      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Command signals by repo / folder</h2>
            <p className="text-sm text-slate-600">Repos or folders where possible failed commands, harmless exits, or repeated clusters appear in the current filtered view.</p>
          </div>
          <div className="panel-actions">
            <LimitSelect label="Rows" value={displaySettings.tablePageSize} options={pageSizeOptions} onChange={(value) => setDisplaySettings({ tablePageSize: value })} />
          </div>
        </div>
        {affectedRepos.length ? (
          <div className="table-wrap">
            <table className="command-health-table">
              <thead>
                <tr>
                  <th>Repo / folder</th>
                  <th>Possible failed commands</th>
                  <th>Harmless non-zero exits</th>
                  <th>Repeated clusters</th>
                  <th>Sessions needing review</th>
                  <th>Start here</th>
                  <th>Impact</th>
                  <th>API-equivalent cost</th>
                </tr>
              </thead>
              <tbody>
                {repoPager.items.map((repo) => (
                  <tr className="clickable-row" key={repo.repoRoot} role="button" tabIndex={0} onClick={() => onOpenRepo(repo.repoRoot)} onKeyDown={(event) => activateClickableRow(event, () => onOpenRepo(repo.repoRoot))}>
                    <td className="font-medium"><RepoLabel name={repo.repoName} verified={false} /></td>
                    <td><CountValue value={repo.importantFailures} noun="issue" showUnit={false} /></td>
                    <td><CountValue value={repo.harmlessNonZeroEvents} noun="event" showUnit={false} /></td>
                    <td><CountValue value={repo.repeatedFailureClusters} noun="cluster" showUnit={false} /></td>
                    <td><CountValue value={repo.sessionsNeedingReview} noun="session" showUnit={false} /></td>
                    <td>
                      <div className="friction-inspect-cell">
                        <span>{failureTypeLabel(repo.topFailureType)}</span>
                        <small>{repo.sessionsNeedingReview > 0 ? `Review ${count(repo.sessionsNeedingReview, "session")}` : "Mostly harmless exits"}</small>
                      </div>
                    </td>
                    <td><Badge label={issueImpactLabel(repo.impact)} /></td>
                    <td><CostValue value={repo.estimatedCostUsd} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls page={repoPager.page} pageCount={repoPager.pageCount} total={affectedRepos.length} pageSize={displaySettings.tablePageSize} onPageChange={repoPager.setPage} />
          </div>
        ) : (
          <div className="p-4">
            <p className="text-sm text-slate-600">No possible failed commands detected. Some harmless non-zero shell exits may still exist.</p>
          </div>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Sessions to Review</h2>
            <p className="text-sm text-slate-600">Sessions with possible failed commands, repeated clusters, high non-zero rates, or command signals in high-token work.</p>
          </div>
        </div>
        {reviewSessions.length ? (
          <div className="table-wrap">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Repo / folder</th>
                  <th>Flagged command evidence</th>
                  <th>Outcome</th>
                  <th>Possible failed commands</th>
                  <th>Harmless exits</th>
                  <th>Top failure type</th>
                  <th>Impact</th>
                  <th>Total tokens</th>
                  <th>Files edited</th>
                </tr>
              </thead>
              <tbody>
                {reviewPager.items.map((session) => (
                  <tr className="clickable-row" key={session.id} role="button" tabIndex={0} onClick={() => onOpenSession(session.id, "files")} onKeyDown={(event) => activateClickableRow(event, () => onOpenSession(session.id, "files"))}>
                    <td className="max-w-80 truncate font-medium" title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</td>
                    <td><RepoLabel name={session.repoName} verified={sessionIsRepoVerified(session)} /></td>
                    <td><CommandSignalCell session={session} /></td>
                    <td><OutcomeBadge outcome={session.sessionOutcome} /></td>
                    <td><CountValue value={importantCommandFailures(session)} noun="issue" showUnit={false} /></td>
                    <td><CountValue value={(session.harmlessNonZeroEvents ?? 0) + (session.exploratoryMisses ?? 0)} noun="event" showUnit={false} /></td>
                    <td>{failureTypeLabel(session.topFailureType)}</td>
                    <td><Badge label={issueImpactLabel(session.commandIssueImpact)} /></td>
                    <td><TokenValue value={session.totalTokens} showUnit={false} /></td>
                    <td><CountValue value={session.fileEditCount ?? 0} noun="edit" showUnit={false} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls page={reviewPager.page} pageCount={reviewPager.pageCount} total={reviewSessions.length} pageSize={displaySettings.tablePageSize} onPageChange={reviewPager.setPage} />
          </div>
        ) : <p className="p-4 text-sm text-slate-600">No possible failed commands detected. Some harmless non-zero shell exits may still exist.</p>}
      </div>

      <details className="panel overflow-hidden">
        <summary className="advanced-summary">Harmless / ignored non-zero events</summary>
        {harmlessSessions.length ? (
          <div className="table-wrap">
            <table className="compact-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Repo / folder</th>
                  <th>Harmless exits</th>
                  <th>Exploratory misses</th>
                  <th>Total non-zero</th>
                </tr>
              </thead>
              <tbody>
                {harmlessPager.items.map((session) => (
                  <tr className="clickable-row" key={session.id} role="button" tabIndex={0} onClick={() => onOpenSession(session.id)} onKeyDown={(event) => activateClickableRow(event, () => onOpenSession(session.id))}>
                    <td className="max-w-96 truncate font-medium" title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</td>
                    <td>{session.repoName}</td>
                    <td><CountValue value={session.harmlessNonZeroEvents ?? 0} noun="event" showUnit={false} /></td>
                    <td><CountValue value={session.exploratoryMisses ?? 0} noun="miss" showUnit={false} /></td>
                    <td><CountValue value={session.nonZeroCommandEvents ?? 0} noun="event" showUnit={false} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls page={harmlessPager.page} pageCount={harmlessPager.pageCount} total={harmlessSessions.length} pageSize={displaySettings.tablePageSize} onPageChange={harmlessPager.setPage} />
          </div>
        ) : <p className="p-4 text-sm text-slate-600">No harmless non-zero events were detected in this filtered view.</p>}
      </details>
    </section>
  );
}

function WasteSignalsSection({ data, onOpenSessions }: { data: ApiData; onOpenSessions: () => void }) {
  const signals = data.health.wasteSignals;
  return (
    <section className="panel overflow-hidden">
      <div className="panel-heading">
        <div>
          <h2>Needs Attention</h2>
          <p className="text-sm text-slate-600">Waste and friction signals that may be worth reviewing before broad conclusions.</p>
        </div>
        <button className="button" type="button" onClick={onOpenSessions}>Open Sessions</button>
      </div>
      <div className="waste-grid p-4">
        {signals.length ? signals.map((signal) => (
            <div className="waste-card" key={signal.title}>
            <div className="text-xs uppercase text-slate-500">{polishCostLanguage(signal.title)}</div>
            <div className="mt-1 text-lg font-semibold">{signal.value}</div>
            <p className="mt-1 text-sm text-slate-600">{polishCostLanguage(signal.detail)}</p>
          </div>
        )) : (
          <div className="waste-card waste-good">
            <div className="text-xs uppercase text-slate-500">Waste signals</div>
            <div className="mt-1 text-lg font-semibold">Clear</div>
            <p className="mt-1 text-sm text-slate-600">No obvious waste signals detected in this period.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function InsightsPage({ data, onNavigate, onReviewUnpricedSessions }: { data: ApiData; onNavigate: (view: ViewKey) => void; onReviewUnpricedSessions: () => void }) {
  const insights = data.health.signals;
  const good = insights.filter((item) => item.tone === "good");
  const attention = insights.filter((item) => item.tone === "attention");
  const handleAction = (item: InsightItem) => {
    if (item.id === "unknown-cost") {
      onReviewUnpricedSessions();
      return;
    }
    if (item.actionTarget) onNavigate(item.actionTarget);
  };
  return (
    <section className="mt-4 space-y-4">
      <div className="page-summary-panel">
        <MiniStat label="Healthy checks" value={<CountValue value={data.health.healthyCount} noun="check" />} />
        <MiniStat label="Needs attention" value={<CountValue value={data.health.attentionCount} noun="item" />} />
        <MiniStat label="Critical issues" value={<CountValue value={data.health.criticalCount} noun="issue" />} />
        <MiniStat label="Sessions affected" value={<CountValue value={data.health.affectedSessionCount} noun="session" />} />
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Usage Health</h2>
            <p className="text-sm text-slate-600">A quick read on what is already working and what to improve next.</p>
          </div>
          <span className="text-xs text-slate-500">Based on the current dashboard filters</span>
        </div>
        <div className="insights-grid p-4">
          <InsightColumn title="Already healthy" empty="No healthy signals yet. Load usage or widen the filters." items={good} onAction={handleAction} />
          <InsightColumn title="Needs attention" empty="No major issues detected in this filtered view." items={attention} onAction={handleAction} />
        </div>
      </div>
    </section>
  );
}

function InsightColumn({ title, empty, items, onAction }: { title: string; empty: string; items: InsightItem[]; onAction: (item: InsightItem) => void }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div className={`insight-card ${item.tone === "good" ? "insight-good" : "insight-attention"}`} key={item.title}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`severity-pill severity-${insightSeverity(item).toLowerCase()}`}>{insightSeverity(item)}</span>
                    <div className="font-semibold">{polishCostLanguage(item.title)}</div>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{polishCostLanguage(item.detail)}</p>
                </div>
                {item.metric ? <span className="insight-metric">{item.metric}</span> : null}
              </div>
              {item.action ? <p className="mt-2 text-xs font-semibold text-slate-700">{polishCostLanguage(item.action)}</p> : null}
              {item.actionTarget ? (
                <button className="text-button mt-2" type="button" onClick={() => onAction(item)}>
                  {item.actionLabel ?? "Open"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{empty}</p>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="panel error-state mt-4" role="alert">
      <TriangleAlert className="mt-0.5 h-5 w-5" aria-hidden />
      <div>
        <strong>Unable to load RepoSpend data.</strong>
        <p>{message}</p>
        <button className="button mt-3" type="button" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Retry scan
        </button>
      </div>
    </div>
  );
}

function ResultsSummary({ shown, total, itemLabel }: { shown: number; total: number; itemLabel: string }) {
  const filtered = shown !== total;
  return (
    <div className="results-summary" aria-live="polite">
      <strong>{compactNumber(shown)}</strong>
      <span>{filtered ? `of ${compactNumber(total)} ${itemLabel}` : itemLabel}</span>
    </div>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-panel">
      <div className="font-semibold">{title}</div>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}

function hasNonDateFilters(filters: Filters): boolean {
  return filters.source.length > 0 || filters.sourceApp.length > 0 || filters.repo.length > 0 || filters.model.length > 0;
}

function viewShowsFiltersBar(view: ViewKey): boolean {
  return view === "dashboard" || view === "sessions" || view === "repos" || view === "models" || view === "commands" || view === "insights";
}

function compactHiddenFilterNotice(filters: Filters, rangePreset: RangePreset): string | null {
  const nonDateCount = filters.source.length + filters.sourceApp.length + filters.repo.length + filters.model.length;
  const hasCustomDate = rangePreset !== "last7" && rangePreset !== "all";
  if (!nonDateCount && !hasCustomDate) return null;
  const dateLabel = rangePreset === "custom"
    ? `${dateInputValue(filters.from) || "Any start"} to ${dateInputValue(filters.to) || "now"}`
    : rangeOptions.find((option) => option.value === rangePreset)?.label ?? "Custom dates";
  const filterLabel = nonDateCount ? `${nonDateCount} filter${nonDateCount === 1 ? "" : "s"}` : "No extra filters";
  return `Filtered view · ${dateLabel} · ${filterLabel}`;
}

function ChartPanel({ title, children, className = "", actions }: { title: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <div className={`panel chart-panel overflow-hidden ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {actions ? <div className="panel-actions chart-panel-actions">{actions}</div> : null}
      </div>
      <div className="chart-panel-body p-3">{children}</div>
    </div>
  );
}

function stableEntityColor(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return colors[hash % colors.length] ?? "#2dd4bf";
}

function FilterDropdown({
  icon,
  iconKind,
  label,
  values,
  onChange,
  options,
  collapsedLimit = 5,
  align = "start",
}: {
  icon: React.ReactElement;
  iconKind: PickerIcon;
  label: string;
  values: string[];
  onChange: (value: string) => void;
  options: PickerOption[];
  collapsedLimit?: number;
  align?: "start" | "end";
}) {
  const id = React.useId();
  const ref = React.useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const summary = filterDropdownSummary(values, options);

  React.useEffect(() => {
    if (!open) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeForPeer = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("repospend:filter-dropdown-open", closeForPeer);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("repospend:filter-dropdown-open", closeForPeer);
    };
  }, [id, open]);

  return (
    <details
      className={`filter-dropdown filter-dropdown-align-${align}`}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (nextOpen) window.dispatchEvent(new CustomEvent("repospend:filter-dropdown-open", { detail: id }));
      }}
      open={open}
      ref={ref}
    >
      <summary onClick={(event) => {
        event.preventDefault();
        setOpen((current) => {
          const nextOpen = !current;
          if (nextOpen) window.dispatchEvent(new CustomEvent("repospend:filter-dropdown-open", { detail: id }));
          return nextOpen;
        });
      }}>
        <span className="filter-dropdown-label">
          {React.cloneElement(icon, { className: "h-4 w-4", "aria-hidden": true })}
          {label}
        </span>
        <span className={`filter-dropdown-value ${values.length ? "active" : ""}`}>{summary}</span>
      </summary>
      <div className="filter-dropdown-body">
        <FilterPillPicker icon={icon} iconKind={iconKind} label={label} values={values} onChange={onChange} options={options} collapsedLimit={collapsedLimit} />
      </div>
    </details>
  );
}

function filterDropdownSummary(values: string[], options: PickerOption[]): string {
  if (!values.length) return "All";
  const labels = values.map((value) => options.find((option) => option.value === value)?.label ?? value);
  if (labels.length === 1) return labels[0]!;
  return `${labels[0]} +${labels.length - 1}`;
}

function FilterPillPicker({
  icon,
  iconKind,
  label,
  values,
  onChange,
  options,
  collapsedLimit = 5,
}: {
  icon: React.ReactElement;
  iconKind: PickerIcon;
  label: string;
  values: string[];
  onChange: (value: string) => void;
  options: PickerOption[];
  collapsedLimit?: number;
}) {
  const [visibleLimit, setVisibleLimit] = React.useState(collapsedLimit);
  const [search, setSearch] = React.useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const selectedOptions = options.filter((option) => values.includes(option.value));
  const remainingOptions = options.filter((option) => !values.includes(option.value));
  const matchingSelected = selectedOptions;
  const matchingRemaining = normalizedSearch
    ? remainingOptions.filter((option) => option.label.toLowerCase().includes(normalizedSearch) || option.value.toLowerCase().includes(normalizedSearch))
    : remainingOptions;
  const visibleRemaining = matchingRemaining.slice(0, visibleLimit);
  const visibleOptions = uniquePickerOptions([...matchingSelected, ...visibleRemaining]);
  const hiddenCount = Math.max(matchingRemaining.length - visibleRemaining.length, 0);
  const increment = Math.min(5, hiddenCount);

  React.useEffect(() => {
    setVisibleLimit(collapsedLimit);
  }, [collapsedLimit, normalizedSearch, options.length]);

  return (
    <div className="field app-picker-field">
      <span>{React.cloneElement(icon, { className: "h-4 w-4" })}{label}</span>
      <label className="filter-search-field">
        <Search className="h-3.5 w-3.5" aria-hidden />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}...`} />
      </label>
      <div className="app-picker" role="group" aria-label={`${label} filter`}>
        <button
          className={`app-pill ${values.length === 0 ? "active" : ""}`}
          onClick={() => onChange("")}
          type="button"
          aria-pressed={values.length === 0}
          title={`Show all ${label.toLowerCase()} values`}
        >
          <PickerIconView kind={iconKind} label="All" />
          <span>All</span>
        </button>
        {visibleOptions.map((option) => {
          const active = values.includes(option.value);
          return (
            <button
              className={`app-pill ${active ? "active" : ""}`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
              aria-pressed={active}
              title={option.usage === undefined ? (active ? `Remove ${option.label}` : `Add ${option.label}`) : `${option.label}: ${tokensExact(option.usage)} in this option set`}
            >
              <PickerIconView kind={option.icon ?? iconKind} label={option.label} verified={option.verified === true} />
              <span>{option.label}</span>
            </button>
          );
        })}
        {hiddenCount > 0 ? (
          <button className="app-pill more-pill" type="button" onClick={() => setVisibleLimit((current) => current + 5)}>
            <span>+{increment} more</span>
          </button>
        ) : visibleLimit > collapsedLimit && matchingRemaining.length > collapsedLimit ? (
          <button className="app-pill more-pill" type="button" onClick={() => setVisibleLimit(collapsedLimit)}>
            <span>Show less</span>
          </button>
        ) : normalizedSearch && visibleOptions.length === 0 ? (
          <span className="filter-empty">No matches</span>
        ) : null}
      </div>
    </div>
  );
}

function ActiveFiltersSummary({
  filters,
  rangePreset,
  sources,
  sourceApps,
  repos,
  models,
  onClearValue,
  onResetDate,
  onResetAll,
}: {
  filters: Filters;
  rangePreset: RangePreset;
  sources: PickerOption[];
  sourceApps: PickerOption[];
  repos: PickerOption[];
  models: PickerOption[];
  onClearValue: (key: "source" | "sourceApp" | "repo" | "model", value: string) => void;
  onResetDate: () => void;
  onResetAll: () => void;
}) {
  const chips: Array<{ key: "source" | "sourceApp" | "repo" | "model"; label: string; value: string; displayValue: string }> = [];
  filters.source.forEach((value) => chips.push({ key: "source", label: "AI provider", value, displayValue: sources.find((source) => source.value === value)?.label ?? value }));
  filters.sourceApp.forEach((value) => chips.push({ key: "sourceApp", label: "App / surface", value, displayValue: sourceApps.find((app) => app.value === value)?.label ?? value }));
  filters.repo.forEach((value) => chips.push({ key: "repo", label: "Repo / folder", value, displayValue: repos.find((repo) => repo.value === value)?.label ?? value }));
  filters.model.forEach((value) => chips.push({ key: "model", label: "Model", value, displayValue: models.find((model) => model.value === value)?.label ?? value }));
  const hasCustomDate = rangePreset !== "last7";
  const hasAnyFilter = chips.length > 0 || hasCustomDate;
  return (
    <div className="active-filters">
      <span className="active-filter-label">Active filters</span>
      <button className={`active-filter-chip ${!hasAnyFilter ? "muted" : ""}`} type="button" onClick={hasCustomDate ? onResetDate : undefined}>
        Date: {rangeOptions.find((option) => option.value === rangePreset)?.label ?? "Custom"}
        {hasCustomDate ? <span aria-hidden>×</span> : null}
      </button>
      {chips.map((chip) => (
        <button className="active-filter-chip" key={`${chip.key}-${chip.value}`} type="button" onClick={() => onClearValue(chip.key, chip.value)}>
          {chip.label}: {chip.displayValue}
          <span aria-hidden>×</span>
        </button>
      ))}
      {chips.length === 0 && !hasCustomDate ? <span className="active-filter-empty">All providers, apps, repos, and models</span> : null}
      {hasAnyFilter ? <button className="text-button active-filter-reset" type="button" onClick={onResetAll}>Reset filters</button> : null}
    </div>
  );
}

function Select({ icon, label, value, onChange, options }: { icon: React.ReactElement; label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="field">
      <span>{React.cloneElement(icon, { className: "h-4 w-4" })}{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {value === "" && !options.some((option) => option.value === "") ? <option value="">All</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function DateRangePicker({ value, onChange }: { value: RangePreset; onChange: (value: RangePreset) => void }) {
  const quickRanges: Array<{ value: RangePreset; label: string }> = [
    { value: "last24", label: "24h" },
    { value: "last7", label: "7d" },
    { value: "last30", label: "30d" },
    { value: "all", label: "All" },
  ];
  return (
    <div className="field date-range-picker">
      <span><Filter className="h-4 w-4" aria-hidden />Date range</span>
      <div className="date-range-select-row">
        <select value={value} onChange={(event) => onChange(event.target.value as RangePreset)} aria-label="Date range">
          {rangeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="date-range-shortcuts" aria-label="Quick date ranges">
        {quickRanges.map((option) => (
          <button className={value === option.value ? "active" : ""} key={option.value} type="button" onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LimitSelect({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (value: number) => void }) {
  return (
    <label className="limit-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function PaginationControls({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  pageSizeOptions: sizeOptions,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
}) {
  if (total <= pageSize && !onPageSizeChange) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="pagination-controls">
      <span>Showing {start}-{end} of {total}</span>
      <div className="pagination-buttons">
        <button className="button" type="button" disabled={page <= 1} onClick={() => onPageChange(1)}>First</button>
        <button className="button" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</button>
        <span>Page {page} / {pageCount}</span>
        <button className="button" type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
        <button className="button" type="button" disabled={page >= pageCount} onClick={() => onPageChange(pageCount)}>Last</button>
        {onPageSizeChange && sizeOptions ? (
          <label className="pagination-size">
            <span>Rows</span>
            <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
              {sizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}

function AppLabel({ app, surface }: { app?: string; surface?: Session["detectedSurface"] }) {
  const label = app || surfaceLabel(surface);
  const surfaceText = surfaceLabel(surface);
  const title = app && surfaceText !== "Unknown" && app !== surfaceText
    ? `App: ${app}. Surface: ${surfaceText}.`
    : `App: ${label}.`;
  return (
    <span className="app-label" title={title}>
      <SurfaceIcon app={label} surface={surface} />
      <span>{label}</span>
    </span>
  );
}

function SourceBadge({ source, label }: { source: Session["sourceClient"]; label?: string }) {
  const display = label ?? sourceLabel(source);
  return (
    <span className="source-badge" title={`AI provider: ${display}`}>
      <ProviderIcon provider={source} label={display} />
      <span>{display}</span>
    </span>
  );
}

function ModelLabel({ model }: { model?: string | undefined }) {
  const label = model ?? "Unknown";
  return (
    <span className="inline-flex items-center gap-1">
      <ModelIcon model={model} />
      <span>{label}</span>
    </span>
  );
}

function sessionDisplayModel(session: Session): string | undefined {
  if (!session.model && session.warnings.includes("claude_synthetic_zero_usage")) return "Claude synthetic / no usage";
  return session.model;
}

function sessionIsRepoVerified(session: Session): boolean {
  return !session.warnings.includes("repo_unverified_no_git_root");
}

function RepoLabel({ name, verified }: { name: string; verified: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {verified ? <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {name}
    </span>
  );
}

function PickerIconView({ kind, label, verified }: { kind: PickerIcon; label: string; verified?: boolean }) {
  if (label === "All") return <AllPickerIcon kind={kind} />;
  if (kind === "source") return <ProviderIcon label={label} />;
  if (kind === "app") return <SurfaceIcon app={label} />;
  if (kind === "repo") return verified ? <GitBranch className="h-4 w-4" aria-hidden /> : <FolderOpen className="h-4 w-4" aria-hidden />;
  return <ModelIcon model={label} />;
}

function AllPickerIcon({ kind }: { kind: PickerIcon }) {
  if (kind === "source") return <Bot className="h-4 w-4" aria-hidden />;
  if (kind === "app") return <LayoutPanelTop className="h-4 w-4" aria-hidden />;
  if (kind === "repo") return <FolderGit2 className="h-4 w-4" aria-hidden />;
  return <BrainCircuit className="h-4 w-4" aria-hidden />;
}

function ProviderIcon({ provider, label }: { provider?: Session["sourceClient"]; label?: string }) {
  const kind = (label || provider || "").toLowerCase();
  if (provider === "codex" || kind.includes("codex") || kind.includes("openai")) return <CodexIcon />;
  if (provider === "claude" || kind.includes("claude") || kind.includes("anthropic")) return <ClaudeIcon />;
  if (provider === "copilot" || kind.includes("copilot") || kind.includes("github")) return <Github className="h-4 w-4" aria-hidden />;
  if (provider === "cursor" || kind.includes("cursor")) return <Code2 className="h-4 w-4" aria-hidden />;
  if (provider === "gemini-cli" || kind.includes("gemini")) return <Sparkles className="h-4 w-4" aria-hidden />;
  if (provider === "opencode" || kind.includes("opencode")) return <Code2 className="h-4 w-4" aria-hidden />;
  return <Bot className="h-4 w-4" aria-hidden />;
}

function SurfaceIcon({ app, surface }: { app?: string; surface?: Session["detectedSurface"] }) {
  const kind = (app || surface || "").toLowerCase();
  if (kind.includes("codex on vs code") || kind.includes("codex on vscode")) return <CompositeAppIcon source="codex" surface="vscode" />;
  if (kind.includes("codex on terminal") || kind.includes("codex on cli")) return <CompositeAppIcon source="codex" surface="terminal" />;
  if (kind.includes("claude code on vs code") || kind.includes("claude code on vscode")) return <CompositeAppIcon source="claude" surface="vscode" />;
  if (kind.includes("claude code on terminal") || kind.includes("claude code on cli")) return <CompositeAppIcon source="claude" surface="terminal" />;
  if (kind.includes("github copilot on vs code") || kind.includes("github copilot on vscode") || kind.includes("copilot on vs code") || kind.includes("copilot on vscode")) return <CompositeAppIcon source="copilot" surface="vscode" />;
  if (kind.includes("github copilot cli") || kind.includes("copilot cli") || kind.includes("copilot on terminal")) return <CompositeAppIcon source="copilot" surface="terminal" />;
  if (kind.includes("cursor")) return <Code2 className="h-4 w-4" aria-hidden />;
  if (kind.includes("copilot")) return <Github className="h-4 w-4" aria-hidden />;
  if (kind.includes("desktop local agent") || kind.includes("desktop app") || surface === "local_agent") return <AppWindow className="h-4 w-4" aria-hidden />;
  if (kind.includes("claude")) return <ClaudeIcon />;
  if (kind.includes("vs code") || kind.includes("vscode") || surface === "vscode_extension") return <VsCodeIcon />;
  if (kind.includes("codex app") || kind.includes("subagent") || surface === "codex_app_cloud") return <CodexAppIcon />;
  if (kind.includes("codex") || kind.includes("agent")) return <CodexIcon />;
  if (kind.includes("exec") || surface === "codex_exec") return <Code2 className="h-4 w-4" aria-hidden />;
  if (kind.includes("terminal") || kind.includes("cli") || surface === "terminal_cli") return <SquareTerminal className="h-4 w-4" aria-hidden />;
  if (!app) return <Blocks className="h-4 w-4" aria-hidden />;
  return <MonitorCog className="h-4 w-4" aria-hidden />;
}

function ModelIcon({ model }: { model?: string | undefined }) {
  const kind = (model ?? "").toLowerCase();
  if (kind.includes("claude") || kind.includes("opus") || kind.includes("sonnet") || kind.includes("haiku")) return <ClaudeIcon />;
  if (kind.includes("gpt") || kind.includes("o1") || kind.includes("o3") || kind.includes("o4") || kind.includes("openai")) return <CodexIcon />;
  if (kind.includes("gemini")) return <Sparkles className="h-4 w-4" aria-hidden />;
  if (kind.includes("unknown") || !kind) return <Cpu className="h-4 w-4" aria-hidden />;
  return <BrainCircuit className="h-4 w-4" aria-hidden />;
}

function CompositeAppIcon({ source, surface }: { source: "codex" | "claude" | "copilot"; surface: "vscode" | "terminal" }) {
  return (
    <span className={`combo-icon combo-icon-${source}-${surface}`} aria-hidden>
      <span className="combo-icon-main">
        {surface === "vscode" ? <VsCodeIcon /> : <SquareTerminal className="brand-icon terminal-combo-icon" aria-hidden />}
      </span>
      <span className="combo-icon-corner">
        {source === "codex" ? <CodexIcon /> : source === "claude" ? <ClaudeIcon /> : <Github className="brand-icon" aria-hidden />}
      </span>
    </span>
  );
}

function VsCodeIcon() {
  return (
    <svg className="brand-icon vscode-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M17.85 2.7 8.6 11.1 3.35 7.1 2 8.05v7.9l1.35.95 5.25-4 9.25 8.4L22 19.55V4.45L17.85 2.7Z" fill="#007ACC" />
      <path d="M17.85 7.05 11.2 12l6.65 4.95V7.05Z" fill="#1F9CF0" />
      <path d="M3.35 7.1 8.6 12l-5.25 4.9L2 15.95v-7.9l1.35-.95Z" fill="#40B6FF" />
    </svg>
  );
}

function CodexIcon() {
  return (
    <svg className="brand-icon codex-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" opacity="0.16" />
      <path d="M8.4 7.7 4.9 11.2a1.1 1.1 0 0 0 0 1.6l3.5 3.5 1.25-1.25L6.9 12l2.75-3.05L8.4 7.7Z" fill="currentColor" />
      <path d="M15.6 7.7 14.35 8.95 17.1 12l-2.75 3.05 1.25 1.25 3.5-3.5a1.1 1.1 0 0 0 0-1.6l-3.5-3.5Z" fill="currentColor" />
      <path d="M11.15 17.2 13.2 6.8h1.65L12.8 17.2h-1.65Z" fill="currentColor" />
    </svg>
  );
}

function CodexAppIcon() {
  return (
    <svg className="brand-icon codex-app-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="5.2" fill="#f8fafc" />
      <rect x="5.7" y="6.1" width="12.6" height="11.8" rx="4.2" fill="url(#codexAppGradient)" />
      <path d="M9.4 9.1 7.3 11.2a1.1 1.1 0 0 0 0 1.6l2.1 2.1 1.08-1.08L8.9 12l1.58-1.82L9.4 9.1Z" fill="white" opacity="0.92" />
      <path d="M14.6 9.1 13.52 10.18 15.1 12l-1.58 1.82 1.08 1.08 2.1-2.1a1.1 1.1 0 0 0 0-1.6l-2.1-2.1Z" fill="white" opacity="0.92" />
      <path d="M11.4 15.1 12.6 8.9h1.25l-1.2 6.2H11.4Z" fill="white" opacity="0.92" />
      <defs>
        <linearGradient id="codexAppGradient" x1="5.7" y1="6.1" x2="18.3" y2="17.9" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ClaudeIcon() {
  return (
    <svg className="brand-icon claude-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.2" fill="currentColor" />
      <path d="M12 5.3v13.4M12 5.3v13.4M5.3 12h13.4M7.3 7.3l9.4 9.4M16.7 7.3l-9.4 9.4M8.1 5.9l7.8 12.2M15.9 5.9 8.1 18.1M5.9 8.1l12.2 7.8M18.1 8.1 5.9 15.9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" fill="white" />
    </svg>
  );
}

function NpmIcon() {
  return (
    <svg className="brand-icon npm-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="2.5" y="6" width="19" height="12" rx="2" fill="currentColor" />
      <path d="M5.6 15.2V8.8h12.8v6.4h-3.2v-4h-1.6v4H5.6Z" fill="#fff" />
    </svg>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function QuickLink({ href, label, icon, tone }: { href: string; label: string; icon: React.ReactNode; tone: "codex" | "claude" | "cursor" | "github" | "npm" }) {
  return (
    <a className={`quick-link quick-link-${tone}`} href={href} target="_blank" rel="noreferrer" title={label}>
      <span className="quick-link-icon" aria-hidden>{icon}</span>
      <span className="quick-link-label">{label}</span>
      <ExternalLink className="quick-link-external h-3.5 w-3.5" aria-hidden />
    </a>
  );
}

function MetricHelpPopover({
  title,
  mainValue,
  body,
  note,
  breakdown,
  footer,
  trigger,
}: {
  title: string;
  mainValue?: React.ReactNode;
  body: string;
  note?: string;
  breakdown?: MetricBreakdownRow[] | undefined;
  footer?: React.ReactNode;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [position, setPosition] = React.useState<PopoverPosition>({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement | HTMLSpanElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<number | undefined>(undefined);

  const updatePosition = React.useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    const canOpenRight = window.innerWidth - rect.right > width + 18;
    const canOpenLeft = rect.left > width + 18;
    const left = canOpenRight
      ? rect.right + 10
      : canOpenLeft
        ? rect.left - width - 10
        : Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
    const top = Math.min(Math.max(12, rect.top - 12), window.innerHeight - 240);
    setPosition({ top: Math.max(12, top), left });
  }, []);

  const show = React.useCallback((nextPinned = false) => {
    window.clearTimeout(closeTimer.current);
    updatePosition();
    setOpen(true);
    if (nextPinned) setPinned(true);
  }, [updatePosition]);

  const close = React.useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    setPinned(false);
  }, []);

  const scheduleClose = React.useCallback(() => {
    if (pinned) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }, [pinned]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    const handleLayout = () => updatePosition();
    document.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointer);
    window.addEventListener("resize", handleLayout);
    window.addEventListener("scroll", handleLayout, true);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("resize", handleLayout);
      window.removeEventListener("scroll", handleLayout, true);
    };
  }, [close, open, updatePosition]);

  React.useLayoutEffect(() => {
    if (!open || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const nextTop = Math.min(Math.max(12, position.top), Math.max(12, window.innerHeight - rect.height - 12));
    const nextLeft = Math.min(Math.max(12, position.left), Math.max(12, window.innerWidth - rect.width - 12));
    if (Math.abs(nextTop - position.top) > 1 || Math.abs(nextLeft - position.left) > 1) setPosition((current) => ({ ...current, top: nextTop, left: nextLeft }));
  }, [open, position.left, position.top]);

  React.useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const popover = open ? (
    <div
      className="metric-popover"
      ref={popoverRef}
      style={{ top: position.top, left: position.left }}
      role="dialog"
      aria-label={title}
      onMouseEnter={() => window.clearTimeout(closeTimer.current)}
      onMouseLeave={scheduleClose}
    >
      <div className="metric-popover-header">
        <div>
          <div className="metric-popover-title">{title}</div>
          {mainValue !== undefined ? <div className="metric-popover-value">{mainValue}</div> : null}
        </div>
        {pinned ? (
          <button className="metric-popover-close" type="button" onClick={close} aria-label="Close popover">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="metric-popover-body">{body}</p>
      {note ? <p className="metric-popover-note">{note}</p> : null}
      {breakdown?.length ? (
        <div className="metric-popover-section">
          {breakdown.map((row) => (
            <div className="metric-popover-row" key={row.label}>
              <span>{row.label}</span>
              <strong title={row.detail}>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {footer ? <div className="metric-popover-footer">{footer}</div> : null}
    </div>
  ) : null;

  if (trigger) {
    return (
      <>
        <span
          className="metric-popover-trigger-wrap"
          ref={triggerRef as React.RefObject<HTMLSpanElement>}
          onMouseEnter={() => show(false)}
          onMouseLeave={scheduleClose}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (pinned && open) close();
            else show(true);
          }}
        >
          {trigger}
        </span>
        {popover}
      </>
    );
  }

  return (
    <>
      <button
        className="metric-help-button"
        type="button"
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        onMouseEnter={() => show(false)}
        onMouseLeave={scheduleClose}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pinned && open) close();
          else show(true);
        }}
        aria-label={`About ${title}`}
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {popover}
    </>
  );
}

function CostBreakdownPopover({
  value,
  session,
  breakdown,
  trigger,
}: {
  value: number | undefined;
  session?: Session | undefined;
  breakdown?: Pick<Summary, "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens"> | undefined;
  trigger?: React.ReactNode;
}) {
  const tokenBreakdown = session ?? breakdown;
  const rows = tokenBreakdown
    ? [
      { label: "Total input", value: tokens(tokenBreakdown.inputTokens), detail: tokensExact(tokenBreakdown.inputTokens) },
      { label: "Cached input", value: tokens(tokenBreakdown.cachedInputTokens), detail: tokensExact(tokenBreakdown.cachedInputTokens) },
      { label: "Output", value: tokens(tokenBreakdown.outputTokens), detail: tokensExact(tokenBreakdown.outputTokens) },
      { label: "Reasoning", value: tokens(tokenBreakdown.reasoningTokens), detail: tokensExact(tokenBreakdown.reasoningTokens) },
    ]
    : undefined;
  return (
    <MetricHelpPopover
      title="API-equivalent cost"
      mainValue={value === undefined ? "Unavailable" : money(value)}
      body="Estimated from local token counts using RepoSpend's local pricing table."
      note="This is not your actual subscription bill. Subscription users may not pay this amount directly."
      breakdown={rows}
      footer={<a className="text-button" href="/settings">View pricing assumptions</a>}
      trigger={trigger}
    />
  );
}

function CostValue({ value, label, session, breakdown }: { value: number | undefined; label?: string; session?: Session; breakdown?: Pick<Summary, "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningTokens"> }) {
  return (
    <CostBreakdownPopover value={value} session={session} breakdown={breakdown} trigger={<span className="value-with-detail cost-value">{label ?? money(value)}</span>} />
  );
}

function TokenValue({ value, showUnit = true }: { value: number; showUnit?: boolean }) {
  return (
    <span className="value-with-detail" title={tokensExact(value)}>
      {showUnit ? tokens(value) : compactNumber(value)}
    </span>
  );
}

function CountValue({ value, noun, showUnit = true }: { value: number; noun: string; showUnit?: boolean }) {
  return (
    <span className="value-with-detail" title={countExact(value, noun)}>
      {showUnit ? count(value, noun) : compactNumber(value)}
    </span>
  );
}

function PercentValue({ value }: { value: number }) {
  return (
    <span className="value-with-detail" title={percentExact(value)}>
      {percent(value)}
    </span>
  );
}

function TokenIntensityValue({ label, title }: { label: string; title: string }) {
  return (
    <MetricHelpPopover
      title="Tokens per edit"
      mainValue={label}
      body="Tokens per edit estimates how many tokens were used for each detected file edit."
      note={title}
      trigger={<span className="value-with-detail">{label}</span>}
    />
  );
}

type BadgeTone = "critical" | "warning" | "info" | "good" | "neutral";
type WarningBadgeItem = { label: string; title: string; tone: BadgeTone };

function Badge({ label, title, tone }: { label: string; title?: string | undefined; tone?: BadgeTone | undefined }) {
  const className = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const toneClass = tone ? ` badge-${tone}` : "";
  return <span className={`status-badge status-${className}${toneClass}`} title={title}>{label.replaceAll("_", " ")}</span>;
}

function OutcomeBadge({ outcome }: { outcome: Session["sessionOutcome"] }) {
  const tone: BadgeTone = outcome === "completed" ? "good" : outcome === "failed" || outcome === "partial" ? "warning" : "neutral";
  return <Badge label={outcomeLabel(outcome)} title={outcomeTitle(outcome)} tone={tone} />;
}

function BadgeRow({ labels }: { labels: string[] }) {
  if (!labels.length) return <span className="text-xs text-slate-500">No warnings</span>;
  const prioritized = prioritizeBadges(labels);
  const visibleCount = prioritized.length > 3 ? 2 : 3;
  const visible = prioritized.slice(0, visibleCount);
  const hiddenLabels = prioritized.slice(visible.length);
  const hiddenLabel = hiddenLabels.length === 1 ? hiddenLabels[0] : undefined;
  return (
    <div className="badge-row">
      {visible.map((label) => (
        <Badge key={label} label={label} />
      ))}
      {hiddenLabel ? <Badge label={hiddenLabel} /> : null}
      {hiddenLabels.length > 1 ? <span className="status-badge" title={hiddenLabels.join("\n")}>+{hiddenLabels.length} more</span> : null}
    </div>
  );
}

function RepoWarningBadges({ warnings, commandIssueCount }: { warnings: string[]; commandIssueCount: number }) {
  let badges = warnings.map(repoWarningBadgeItem);
  if (commandIssueCount > 0) {
    badges = badges.filter((badge) => badge.label !== "Command issues" && badge.label !== "Possible failed commands");
    badges.unshift({
      label: count(commandIssueCount, "possible failed command"),
      title: `${count(commandIssueCount, "possible failed command")} detected in this repo or folder.`,
      tone: "critical",
    });
  }
  const prioritized = prioritizeWarningBadges(badges);
  if (!prioritized.length) return <span className="text-xs text-slate-500">None</span>;
  const visibleCount = prioritized.length > 3 ? 2 : 3;
  const visible = prioritized.slice(0, visibleCount);
  const hidden = prioritized.slice(visible.length);
  const hiddenLabel = hidden.length === 1 ? hidden[0] : undefined;
  return (
    <div className="badge-row warning-badge-row">
      {visible.map((badge) => (
        <Badge key={`${badge.label}-${badge.tone}`} label={badge.label} title={badge.title} tone={badge.tone} />
      ))}
      {hiddenLabel ? <Badge label={hiddenLabel.label} title={hiddenLabel.title} tone={hiddenLabel.tone} /> : null}
      {hidden.length > 1 ? (
        <Badge
          label={`+${hidden.length} more`}
          title={hidden.map((badge) => `${badge.label}: ${badge.title}`).join("\n")}
          tone="neutral"
        />
      ) : null}
    </div>
  );
}

function prioritizeBadges(labels: string[]): string[] {
  const priority = ["Possible failed command", "Command issue", "Command issues detected", "High token", "No edits", "Unknown repo/folder", "Repo/folder unverified", "Unknown surface", "Files edited", "Partial", "Completed"];
  return [...new Set(labels)].sort((a, b) => {
    const aIndex = priority.indexOf(a);
    const bIndex = priority.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex) || a.localeCompare(b);
  });
}

function repoWarningBadgeItem(warning: string): WarningBadgeItem {
  const normalized = warning.toLowerCase().replace(/[:_]+/g, " ");
  const title = readableWarning(warning);
  if (normalized === "expensive session concentration") return { label: "Cost concentration", title, tone: "warning" };
  if (normalized === "failed commands" || normalized === "command issues") return { label: "Possible failed commands", title, tone: "critical" };
  if (normalized === "repo unverified no git root") return { label: "Repo unverified", title, tone: "info" };
  if (normalized === "copilot missing cwd") return { label: "Missing workspace", title, tone: "info" };
  if (normalized === "claude synthetic zero usage") return { label: "Synthetic marker", title, tone: "warning" };
  if (normalized === "unknown pricing" || normalized === "unknown cost") return { label: "Unpriced", title, tone: "warning" };
  if (normalized === "missing token breakdown") return { label: "Missing token split", title, tone: "warning" };
  if (normalized === "low cache rate") return { label: "Low cache", title, tone: "warning" };
  if (normalized === "output heavy sessions") return { label: "Output heavy", title, tone: "info" };
  if (normalized === "high-token no-edit") return { label: "High-token no-edit", title, tone: "warning" };
  if (normalized === "claude session split by activity day") return { label: "Day split", title, tone: "info" };
  if (normalized === "duplicate or stale token snapshots skipped") return { label: "Stale snapshots", title, tone: "info" };
  if (normalized === "token direct usage ignored after cumulative snapshot") return { label: "Token snapshots", title, tone: "info" };
  if (normalized.startsWith("invalid token snapshots")) return { label: "Invalid snapshots", title, tone: "warning" };
  if (normalized === "copilot partial token breakdown") return { label: "Partial token split", title, tone: "warning" };
  if (normalized === "copilot duplicate session merged") return { label: "Merged duplicate", title, tone: "info" };
  if (normalized === "model inferred from import source") return { label: "Inferred model", title, tone: "info" };
  return { label: capitalizeSentence(warning.replaceAll("_", " ")), title, tone: "info" };
}

function prioritizeWarningBadges(badges: WarningBadgeItem[]): WarningBadgeItem[] {
  const priority: Record<BadgeTone, number> = { critical: 0, warning: 1, info: 2, good: 3, neutral: 4 };
  const unique = new Map<string, WarningBadgeItem>();
  badges.forEach((badge) => {
    if (!unique.has(badge.label)) unique.set(badge.label, badge);
  });
  return [...unique.values()].sort((a, b) => priority[a.tone] - priority[b.tone] || a.label.localeCompare(b.label));
}

function capitalizeSentence(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}` : trimmed;
}

function CompactionSummary({ compaction }: { compaction: Session["compaction"] }) {
  if (!compaction || compaction.count === 0) {
    return <span className="text-slate-500">None</span>;
  }
  const parts: string[] = [];
  if (compaction.autoCount > 0) parts.push(`${compaction.autoCount} auto`);
  if (compaction.manualCount > 0) parts.push(`${compaction.manualCount} manual`);
  return (
    <span>
      {compaction.count}
      {parts.length ? <span className="ml-1 text-xs font-normal text-slate-500">({parts.join(", ")})</span> : null}
    </span>
  );
}

function compactionHelpText(compaction: Session["compaction"]): React.ReactNode {
  if (!compaction || compaction.count === 0) {
    return <span className="ml-1 text-xs text-slate-400" title="No context compactions were observed in this session.">ℹ</span>;
  }
  const title = `${compaction.count} compaction event${compaction.count === 1 ? "" : "s"} — ${compaction.autoCount} auto, ${compaction.manualCount} manual. Auto compactions are triggered when the context window fills up; manual compactions are user-initiated via /compact.`;
  return <span className="ml-1 text-xs text-slate-400" title={title}>ℹ</span>;
}

function CompactionEventList({ compaction }: { compaction: NonNullable<Session["compaction"]> }) {
  if (!compaction.events.length) {
    return (
      <p className="detail-muted">
        {compaction.count} compaction{compaction.count === 1 ? "" : "s"} ({compaction.autoCount} auto, {compaction.manualCount} manual). No timestamps were recorded for individual events.
      </p>
    );
  }
  return (
    <ol className="space-y-2 text-sm">
      {compaction.events.map((event, index) => (
        <li className="flex items-center justify-between gap-3 border border-line bg-white px-3 py-2" key={`${event.timestamp ?? "no-ts"}-${index}`}>
          <span className="font-mono text-xs text-slate-600">{event.timestamp ? formatDateTime(event.timestamp) : `Event ${index + 1}`}</span>
          <Badge label={event.trigger === "manual" ? "Manual (/compact)" : "Auto"} />
        </li>
      ))}
    </ol>
  );
}

function MiniStat({ label, value, help, detail }: { label: string; value: React.ReactNode; help?: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="mini-stat">
      <div className="mini-stat-label">{label}{help}</div>
      <div className="mini-stat-value">{value}</div>
      {detail ? <div className="mini-stat-detail">{detail}</div> : null}
    </div>
  );
}

function buildWarnings(repo: UsageGroup, sessions: Session[]): string[] {
  const warnings = new Set(repo.warnings);
  const knownCosts = sessions.filter((session) => session.estimatedCostUsd !== undefined);
  const totalCost = knownCosts.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0);
  const maxCost = Math.max(0, ...knownCosts.map((session) => session.estimatedCostUsd ?? 0));
  if (totalCost > 0 && maxCost / totalCost > 0.5) warnings.add("expensive_session_concentration");
  if (repo.inputTokens > 0 && repo.cachedInputTokens / repo.inputTokens < 0.1) warnings.add("low_cache_rate");
  if (repo.totalTokens > 0 && repo.outputTokens / repo.totalTokens > 0.5) warnings.add("output_heavy_sessions");
  if (sessions.some((session) => session.estimatedCostUsd === undefined)) warnings.add("unknown_pricing");
  return [...warnings].sort();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function savePricing(models: Record<string, ModelPricing>): Promise<PricingResponse> {
  const response = await fetch("/api/settings/pricing", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ models }),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<PricingResponse>;
}

async function saveConfig(config: RepoSpendConfig): Promise<{ path: string; config: RepoSpendConfig }> {
  const response = await fetch("/api/settings/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<{ path: string; config: RepoSpendConfig }>;
}

async function clearLocalData(): Promise<{ path: string; removed: boolean }> {
  const response = await fetch("/api/settings/local-data", { method: "DELETE" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<{ path: string; removed: boolean }>;
}

async function clearParseCache(): Promise<{ path: string; removed: boolean }> {
  const response = await fetch("/api/settings/cache", { method: "DELETE" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<{ path: string; removed: boolean }>;
}

async function warmParseCache({ preset, splitSourceApps }: { preset: "last30"; splitSourceApps: boolean }): Promise<void> {
  const params = new URLSearchParams({ preset });
  if (splitSourceApps) params.set("splitSourceApps", "true");
  await fetch(`/api/cache/warm?${params}`, { method: "POST" });
}


async function copyText(value: string, setStatus: (status: string | null) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    setStatus("Copied");
    window.setTimeout(() => setStatus(null), 1800);
  } catch {
    setStatus("Copy failed");
    window.setTimeout(() => setStatus(null), 1800);
  }
}


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
