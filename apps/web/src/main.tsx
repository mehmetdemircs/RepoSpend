import React from "react";
import ReactDOM from "react-dom/client";
import { ArrowDownUp, Bot, Boxes, Calculator, ChartNoAxesCombined, CircleDollarSign, Code2, Columns3, Command, Copy, Database, Download, ExternalLink, Filter, Folder, Info, LayoutDashboard, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Server, Settings, Terminal, TriangleAlert, X } from "lucide-react";
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
  type AgentFrictionRepo,
  type ApiData,
  type BreakdownRow,
  type BreakdownTab,
  type DashboardResponse,
  type DisplaySettings,
  type FilterSortMode,
  type Filters,
  type InsightItem,
  type KeyInsight,
  type MetricBreakdownRow,
  type MetricKey,
  type ModelPricing,
  type PickerIcon,
  type PickerOption,
  type PopoverPosition,
  type PricingProviderFilter,
  type PricingResponse,
  type PricingRow,
  type PricingViewFilter,
  type QuickSessionFilter,
  type RangePreset,
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
  type RtkCoverageGap,
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
  type TokenStats,
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
import "./styles.css";
const chartTooltipStyle = {
  background: "#0f172a",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 10,
  color: "#e5e7eb",
};
const chartTooltipLabelStyle = { color: "#f8fafc", fontWeight: 700 };
const chartTooltipItemStyle = { color: "#e5e7eb" };

const viewMeta: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "Overview", subtitle: "Your local AI coding activity at a glance" },
  sessions: { title: "Sessions", subtitle: "Inspect metadata, surfaces, outcomes, commands, and parse status" },
  sessionDetail: { title: "Session Detail", subtitle: "One local AI coding session, with signals and token shape" },
  repos: { title: "Repos", subtitle: "Compare local AI coding usage, API-equivalent cost, productivity, and warnings by Git repository" },
  repoDetail: { title: "Repo Detail", subtitle: "Focused repository usage, sessions, warnings, and command signals" },
  commands: { title: "Agent Friction", subtitle: "Command signals that separate blocking issues from harmless shell exits" },
  insights: { title: "Usage Health", subtitle: "What looks good, what needs attention, and why" },
  rtk: { title: "RTK Insights", subtitle: "Token savings from RTK command proxy" },
  settings: { title: "Settings", subtitle: "Local pricing and dashboard configuration" },
};

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
  const [activeView, setActiveView] = React.useState<ViewKey>(initialUrlState.activeView);
  const [pricingDraft, setPricingDraft] = React.useState<Record<string, ModelPricing>>({});
  const [pricingStatus, setPricingStatus] = React.useState<string | null>(null);
  const [filterSortMode, setFilterSortMode] = React.useState<FilterSortMode>(() => readFilterSortMode());
  const [displaySettings, setDisplaySettings] = React.useState<DisplaySettings>(() => readDisplaySettings());
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const suppressNextUrlSync = React.useRef(false);

  const query = React.useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length) params.set(key, value.join(","));
      } else if (value) {
        params.set(key, value);
      }
    });
    return params.toString();
  }, [filters]);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchJson<DashboardResponse>(`/api/dashboard?${query}`)
      .then((dashboard) => {
        if (!mounted) return;
        setData(dashboard);
        if (!query) setFilterOptionsData(dashboard);
        else {
          void fetchJson<DashboardResponse>("/api/dashboard")
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
  }, [query]);

  React.useEffect(() => {
    const repoSource = filterOptionsData ?? data;
    if (repoSource && selectedRepo && !repoSource.repos.some((repo) => repo.id === selectedRepo)) {
      setSelectedRepo(null);
    }
  }, [data, filterOptionsData, selectedRepo]);

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
    setDisplaySettings((current) => ({ ...current, ...next }));
  }, []);

  const optionSource = filterOptionsData ?? data;
  const sourceOptions = buildSourcePickerOptions(optionSource?.sources ?? data?.sources ?? [], optionSource?.sessions ?? data?.sessions ?? [], filters.source, filterSortMode);
  const repoOptions = buildGroupPickerOptions(optionSource?.repos ?? [], filters.repo, filterSortMode, "repo");
  const modelOptions = buildGroupPickerOptions(optionSource?.models ?? [], filters.model, filterSortMode, "model");
  const appOptions = buildGroupPickerOptions(optionSource?.sourceApps ?? [], filters.sourceApp, filterSortMode, "app");

  const navigateToView = React.useCallback((view: ViewKey) => setActiveView(view), []);
  const openSession = React.useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
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
          <NavButton icon={<Folder />} label="Repos" active={activeView === "repos" || activeView === "repoDetail"} onClick={() => navigateToView("repos")} />
          <NavButton icon={<Terminal />} label="Sessions" active={activeView === "sessions" || activeView === "sessionDetail"} onClick={() => navigateToView("sessions")} />
          <NavButton icon={<TriangleAlert />} label="Agent Friction" active={activeView === "commands"} onClick={() => navigateToView("commands")} />
          <NavButton icon={<Info />} label="Insights" active={activeView === "insights"} onClick={() => navigateToView("insights")} />
          <NavButton icon={<Command />} label="RTK" active={activeView === "rtk"} onClick={() => navigateToView("rtk")} />
          <NavButton icon={<Settings />} label="Settings" active={activeView === "settings"} onClick={() => navigateToView("settings")} />
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-label">Quick links</div>
          <QuickLink href="https://chatgpt.com/codex/cloud/settings/analytics#usage" label="Codex usage" />
          <QuickLink href="https://claude.ai/settings/usage" label="Claude usage" />
          <QuickLink href="https://github.com/mehmetdemircs/RepoSpend" label="GitHub repo" />
        </div>

        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <div>Read-only</div>
            <span>local sources</span>
          </div>
          <button className="icon-button" onClick={() => window.location.reload()} title="Refresh" type="button">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </aside>

      <section className="content-shell">
        <PageHeader view={activeView} />
        {activeView === "dashboard" || activeView === "sessions" || activeView === "repos" || activeView === "repoDetail" || activeView === "commands" || activeView === "insights" ? (
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
        {!error && loading ? <LoadingState compact={Boolean(data)} /> : null}

        {error ? <ErrorState message={error} /> : null}
        {!error && activeView === "dashboard" && !loading && data && data.sessions.length === 0 ? (
          <div className="mt-4 space-y-4">
            <DataHealthCard data={data} onOpenSettings={() => navigateToView("settings")} />
            <EmptyState data={data} />
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
              setPricingStatus(`Saved pricing to ${saved.path ?? "local pricing file"}. Refreshing cost estimates...`);
              window.setTimeout(() => window.location.reload(), 250);
            }}
            onReset={() => {
              setPricingDraft(data.pricing.models);
              setPricingStatus("Reset unsaved edits.");
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
              setPricingStatus(`${result.removed ? "Removed" : "No local data found at"} ${result.path}. Reloading...`);
              window.setTimeout(() => window.location.reload(), 350);
            }}
          />
        ) : null}

        {!error && data && activeView === "insights" ? <InsightsPage data={data} onNavigate={navigateToView} /> : null}

        {!error && data && activeView === "sessions" ? <SessionsPage data={data} displaySettings={displaySettings} setDisplaySettings={updateDisplaySettings} onOpenSession={openSession} /> : null}

        {!error && data && activeView === "sessionDetail" ? (
          <SessionDetailPage
            session={findSessionById(filterOptionsData ?? data, selectedSessionId)}
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

        {!error && data && activeView === "commands" ? <AgentFrictionPage data={data} onOpenRepo={openRepo} onOpenSession={openSession} displaySettings={displaySettings} setDisplaySettings={updateDisplaySettings} /> : null}

        {!error && data && activeView === "rtk" ? <RtkDashboard gain={data.rtkGain} pricing={data.pricing} displaySettings={displaySettings} /> : null}

        {!error && data && data.sessions.length > 0 && activeView === "dashboard" ? (
          <div className="mt-4 space-y-4">
            <OverviewKpis data={data} onOpenRepo={openRepo} />
            <SecondaryMetrics summary={data.summary} />
            <SourceBreakdownPanel data={data} />

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
              <ChartPanel title={`${metricLabel(metric)} over time`}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={[...data.days].sort((a, b) => a.id.localeCompare(b.id))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} />
                    <YAxis tickFormatter={(value) => metricTick(metric, Number(value))} width={62} tick={{ fill: "#94a3b8" }} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(value) => tooltipMetric(metric, Number(value))} />
                    <Legend />
                    <Line type="monotone" dataKey={metric} name={metricLabel(metric)} stroke="#6d5dfc" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartPanel>

              <div className="overview-chart-pair">
                <ChartPanel title={`Models: ${metricLabel(metric)}`}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={groupUsageForChart(data.models, metric, displaySettings.chartGroupLimit)} layout="vertical" margin={{ left: 16, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
                      <XAxis type="number" tickFormatter={(value) => metricTick(metric, Number(value))} tick={{ fill: "#94a3b8" }} />
                      <YAxis dataKey="label" type="category" width={170} tickFormatter={(value) => compactModelLabel(String(value))} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(value) => tooltipMetric(metric, Number(value))} />
                      <Bar dataKey={metric} name={metricLabel(metric)} fill="#6d5dfc" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel title={`${metricLabel(metric)} by repo`}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={groupUsageForChart(data.repos, metric, displaySettings.chartGroupLimit)} margin={{ left: 8, right: 8, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
                      <XAxis dataKey="label" angle={-30} textAnchor="end" height={70} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                      <YAxis tickFormatter={(value) => metricTick(metric, Number(value))} width={62} tick={{ fill: "#94a3b8" }} />
                      <Tooltip contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} formatter={(value) => tooltipMetric(metric, Number(value))} />
                      <Bar dataKey={metric} name={metricLabel(metric)}>
                        {groupUsageForChart(data.repos, metric, displaySettings.chartGroupLimit).map((_, index) => (
                          <Cell key={index} fill={colors[index % colors.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <RecentSessionsPanel sessions={recentSessions(data.sessions).slice(0, 6)} onOpenSession={openSession} />
              <KeyInsightsPanel insights={data.health.keyInsights.slice(0, 4)} compact />
            </div>

            <TopRepositoriesSection data={data} onOpenRepos={() => navigateToView("repos")} onOpenRepo={openRepo} pageSize={displaySettings.tablePageSize} />
            <WasteSignalsSection data={data} onOpenSessions={() => navigateToView("sessions")} />

            <div className="panel overflow-hidden">
              <div className="panel-heading">
                <div>
                  <h2>{data.summary.knownCostSessions > 0 ? "Highest Estimated Cost Sessions" : "Largest Sessions"}</h2>
                  <p className="text-sm text-slate-600">Sessions to inspect first for estimated API-equivalent cost, token volume, or productivity signals.</p>
                </div>
              </div>
              <ExpensiveSessionsTable sessions={topSessions(data.sessions, data.summary.knownCostSessions > 0)} pageSize={displaySettings.tablePageSize} onOpenSession={openSession} onOpenRepo={openRepo} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <DataHealthCard data={data} onOpenSettings={() => navigateToView("settings")} />
              <TokenAccuracyCard data={data} compact />
            </div>
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
      <div className="panel repo-compact-filters">
        <div className="repo-compact-filter-row">
          <DateRangePicker value={rangePreset} onChange={updatePreset} />
          <FilterPillPicker icon={<Server />} iconKind="source" label="Source" values={filters.source} onChange={(value) => toggleFilter("source", value)} options={sources} />
          <FilterPillPicker icon={<Terminal />} iconKind="app" label="App" values={filters.sourceApp} onChange={(value) => toggleFilter("sourceApp", value)} options={sourceApps} collapsedLimit={8} />
          <FilterPillPicker icon={<Filter />} iconKind="model" label="Model" values={filters.model} onChange={(value) => toggleFilter("model", value)} options={models} collapsedLimit={10} />
          <details className="repo-more-filters">
            <summary>
              <Settings className="h-4 w-4" aria-hidden />
              More filters
            </summary>
            <div className="repo-more-filter-body">
              <FilterPillPicker icon={<Boxes />} iconKind="repo" label="Scoped repo" values={[selectedRepo]} onChange={(value) => toggleFilter("repo", value)} options={repos} />
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
    <div className="panel p-3">
      <div className="filter-grid">
        <FilterPillPicker icon={<Server />} iconKind="source" label="Source" values={filters.source} onChange={(value) => toggleFilter("source", value)} options={sources} />
        <FilterPillPicker icon={<Terminal />} iconKind="app" label="App" values={filters.sourceApp} onChange={(value) => toggleFilter("sourceApp", value)} options={sourceApps} collapsedLimit={8} />
        <FilterPillPicker icon={<Boxes />} iconKind="repo" label="Repo" values={repoNavigationMode && selectedRepo ? [selectedRepo] : filters.repo} onChange={(value) => toggleFilter("repo", value)} options={repos} collapsedLimit={12} />
        <FilterPillPicker icon={<Filter />} iconKind="model" label="Model" values={filters.model} onChange={(value) => toggleFilter("model", value)} options={models} collapsedLimit={10} />
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

function PageHeader({ view }: { view: ViewKey }) {
  const meta = viewMeta[view];
  return (
    <header className="page-header">
      <div>
        <h2>{meta.title}</h2>
        <p>{meta.subtitle}</p>
      </div>
      <div className="page-header-badge">
        <span className="status-dot" />
        Local-first · no telemetry
      </div>
    </header>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactElement; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick} type="button">
      {React.cloneElement(icon, { className: "h-4 w-4" })}
      <span>{label}</span>
    </button>
  );
}

function OverviewKpis({ data, onOpenRepo }: { data: ApiData; onOpenRepo: (repoId: string) => void }) {
  const summary = data.summary;
  const hasKnownCost = summary.knownCostSessions > 0;
  const topRepo = data.repos[0];
  const usefulPct = summary.sessionCount > 0 ? (summary.sessionCount - summary.noCodeChangeSessions) / summary.sessionCount : 0;
  const commandIssueRate = summary.shellCommandCount > 0 ? summary.importantCommandFailures / summary.shellCommandCount : 0;
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
          body="Total token usage loaded from local source sessions in the current dashboard filter."
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
      detail: "Estimate only. Not your actual subscription bill.",
      icon: <CircleDollarSign />,
      strong: true,
      help: <CostBreakdownPopover value={summary.estimatedCostUsd} breakdown={summary} />,
    },
    {
      label: "Top Repo",
      value: topRepo ? <button className="kpi-link" type="button" onClick={() => onOpenRepo(topRepo.id)}>{topRepo.label}</button> : "No repo",
      detail: topRepo ? <span><TokenValue value={topRepo.totalTokens} /> · <CostValue value={topRepo.estimatedCostUsd} /></span> : "No repository usage in this view",
      icon: <Folder />,
      strong: true,
    },
    {
      label: "Sessions",
      value: <CountValue value={summary.sessionCount} noun="session" />,
      detail: summary.skippedZeroTokenSessions > 0 ? `${count(summary.skippedZeroTokenSessions, "zero-token placeholder")} skipped` : "Token-bearing local sessions",
      icon: <Terminal />,
    },
    {
      label: "Sessions With File Edits",
      value: <CountValue value={summary.sessionCount - summary.noCodeChangeSessions} noun="session" />,
      detail: summary.sessionCount > 0 ? `${percent(usefulPct)} of sessions have detected file edits` : "No sessions in this view",
      icon: <ChartNoAxesCombined />,
    },
    {
      label: "Important Command Issue Rate",
      value: <PercentValue value={commandIssueRate} />,
      detail: summary.shellCommandCount > 0 ? `${count(summary.importantCommandFailures, "important issue")} of ${count(summary.shellCommandCount, "command")}` : "No shell commands detected",
      icon: <TriangleAlert />,
      help: (
        <MetricHelpPopover
          title="Important command issue rate"
          mainValue={percent(commandIssueRate)}
          body="Share of detected shell commands that RepoSpend classified as blocking, repeated, or token-expensive command issues."
          note="Harmless non-zero exits such as search misses and file-existence probes are not counted here."
          breakdown={[
            { label: "Important issues", value: count(summary.importantCommandFailures, "issue") },
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

function SecondaryMetrics({ summary }: { summary: Summary }) {
  return (
    <div className="secondary-metric-grid">
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
      <MiniStat label="No-edit sessions" value={<CountValue value={summary.noCodeChangeSessions} noun="session" />} />
    </div>
  );
}

function SourceBreakdownPanel({ data }: { data: ApiData }) {
  const [tab, setTab] = React.useState<BreakdownTab>("providers");
  const rows = usageBreakdownRows(data, tab).filter((row) => row.totalTokens > 0 || row.estimatedCostUsd !== undefined);
  const tabs: Array<{ value: BreakdownTab; label: string }> = [
    { value: "providers", label: "AI providers" },
    { value: "apps", label: "Apps" },
  ];
  return (
    <section className="panel source-breakdown-panel">
      <div className="panel-heading breakdown-heading">
        <div className="breakdown-heading-text">
          <h2>{tabs.find((item) => item.value === tab)?.label ?? "AI providers"}</h2>
          <p className="text-sm text-slate-600">Sources scanned: {data.sources.map((source) => source.label).join(", ")}</p>
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
            <MiniStat label="API-equivalent cost" value={<CostValue value={row.estimatedCostUsd} />} />
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
  const sourceLabels = data.sources.filter((source) => source.available).map((source) => source.label).join(", ") || "No active sources";
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
        <MiniStat label="Sessions scanned" value={<CountValue value={data.scan.sessionFileCount} noun="file" />} />
        <MiniStat label="Repos discovered" value={<CountValue value={data.scan.repoCount} noun="repo" />} />
        <MiniStat label="Parser issues" value={data.scan.parseFailureCount ? <CountValue value={data.scan.parseFailureCount} noun="issue" /> : "No parser issues found"} />
        <MiniStat label="Last scan" value={formatDateTime(data.scan.lastScannedAt)} />
        <MiniStat label="Source" value={sourceLabels} />
      </div>
    </section>
  );
}

function TokenAccuracyCard({ data, compact = false }: { data: ApiData; compact?: boolean }) {
  const stats = tokenStats(data);
  return (
    <section className={`panel token-accuracy-card ${compact ? "token-accuracy-compact" : ""}`}>
      <div className="token-accuracy-main">
        <div className="flex items-start gap-3">
          <Database className="mt-1 h-5 w-5 text-teal" aria-hidden />
          <div>
            <h2>Token Counting</h2>
            <p>Using source-specific token records without summing repeated cumulative checkpoints.</p>
            {!compact ? (
              <p className="mt-1 text-xs text-slate-500">
                Codex token_count events may be cumulative. RepoSpend avoids overcounting by using the final valid checkpoint per session when cumulative checkpoints are detected.
              </p>
            ) : null}
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

function RecentSessionsPanel({ sessions, onOpenSession }: { sessions: Session[]; onOpenSession: (sessionId: string) => void }) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-heading">
        <h2>Recent Sessions</h2>
        <span className="text-xs text-slate-500">Recent activity worth scanning</span>
      </div>
      <div className="session-list">
        {sessions.length ? sessions.map((session) => (
          <button className="session-row session-row-rich session-row-button" type="button" key={session.id} onClick={() => onOpenSession(session.id)}>
            <div className="session-icon">
              <Terminal className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</div>
              <div className="truncate text-xs text-slate-500">
                {session.repoName} · {sourceLabel(session.sourceClient)} · {session.sourceApp || surfaceLabel(session.detectedSurface)} · {session.startedAt ? session.startedAt.slice(0, 10) : "Unknown date"}
              </div>
              <BadgeRow labels={sessionBadges(session)} />
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold"><TokenValue value={session.totalTokens} showUnit={false} /></div>
              <div className="text-xs text-slate-500"><CostValue value={session.estimatedCostUsd} /></div>
            </div>
          </button>
        )) : <p className="p-4 text-sm text-slate-600">No sessions in this view.</p>}
      </div>
    </div>
  );
}

function TopRepositoriesSection({ data, onOpenRepos, onOpenRepo, pageSize }: { data: ApiData; onOpenRepos: () => void; onOpenRepo: (repoId: string) => void; pageSize: number }) {
  const rows = repoRows(data).slice(0, Math.min(pageSize, 10));
  return (
    <section className="panel overflow-hidden">
      <div className="panel-heading">
        <div>
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-teal" aria-hidden />
            <h2>Top Repositories</h2>
          </div>
          <p className="text-sm text-slate-600">Repo-level usage is the main RepoSpend view: tokens, API-equivalent cost, sessions, edits, command friction, and token intensity.</p>
        </div>
        <button className="button" type="button" onClick={onOpenRepos}>Open Repos</button>
      </div>
      <div className="p-4">
        {rows.length ? <RepoTable repos={rows} onSelect={onOpenRepo} selectedRepo={null} compact pageSize={Math.min(pageSize, 10)} /> : <p className="text-sm text-slate-600">No repositories matched this filter.</p>}
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
        <div className="panel p-5">
          <div className="flex items-start gap-3">
            <div className="flex items-start gap-3">
              <Terminal className="mt-1 h-5 w-5 text-slate-500" aria-hidden />
              <div>
                <h2 className="text-base font-semibold">RTK Insights</h2>
                <p className="mt-1 text-sm text-slate-600">RTK data is unavailable. {gain.error ?? "Install or configure the rtk command proxy to see local token savings here."}</p>
                <p className="mt-1 text-xs text-slate-500">This page is global and does not use RepoSpend filters.</p>
              </div>
            </div>
          </div>
        </div>
        <RtkExplainer />
        <RtkCoverageGaps gain={gain} />
        <RtkRecommendedActions actions={recommendedActions} />
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

      <div className="grid gap-4 xl:grid-cols-2">
        <RtkCoverageGaps gain={gain} />
        <RtkRecommendedActions actions={recommendedActions} />
      </div>

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
              : "RepoSpend cannot read local RTK activity yet. Install or enable the RTK command proxy to see command-output token savings."}
          </p>
          {!detected ? <p className="mt-1 text-xs">Try running <code>rtk gain --history</code> in your terminal to confirm RTK is installed and producing a local report.</p> : null}
          {detected && gain.rtkCodexHookStatus === "unknown" ? <p className="mt-1 text-xs">Codex hook status is unknown from the current RTK report.</p> : null}
        </div>
      </div>
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
      <table className={compact ? "compact-table" : undefined}>
        <thead>
          <tr>
            <SortableTh label="Repo" column="repo" sort={sort} setSort={setSort} />
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
            <tr key={repo.id} onClick={() => onSelect(repo.id)} className={`clickable-row ${selectedRepo === repo.id ? "selected" : ""}`}>
              <td className="font-medium">{repo.label}</td>
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
  const [visibleColumns, setVisibleColumns] = React.useState<SessionColumnKey[]>(defaultSessionColumns);

  React.useEffect(() => {
    setActiveTab("overview");
    setSessionSearch("");
    setQuickFilter("");
  }, [repo?.id]);

  if (!repo) {
    return (
      <div className="panel p-5">
        <h2 className="text-base font-semibold">Repo Detail</h2>
        <p className="mt-2 text-sm text-slate-600">No repo selected. Select a repo to inspect token shape, warnings, and recent sessions.</p>
      </div>
    );
  }
  const row = repoRowsFromGroup(repo, sessions);
  const warnings = buildWarnings(row, sessions);
  const concentration = repoCostConcentration(row, sessions);
  const topWarning = concentration.extreme ? "expensive_session_concentration" : warnings[0];
  const reviewSessions = topSessionsToReview(sessions, row);
  const filteredSessions = sessions.filter((session) => sessionMatchesSearch(session, sessionSearch) && sessionMatchesRepoQuickFilter(session, quickFilter, sessions));
  const tabs: Array<{ key: RepoDetailTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "sessions", label: "Sessions" },
    { key: "cost", label: "Cost & Tokens" },
    { key: "files", label: "Files" },
    { key: "commands", label: "Commands" },
    { key: "metadata", label: "Metadata" },
  ];
  const commandTotals = repoCommandTotals(sessions);
  const topModel = repoModelBreakdown(sessions, row)[0];
  const tokenIntensity = tokenIntensityInterpretation(row);
  return (
    <div className="repo-detail-page">
      <section className="panel repo-hero">
        <div className="repo-hero-main">
          <div className="repo-hero-eyebrow">{dateRangeLabel}</div>
          <h2>{repo.label}</h2>
          <p>
            {repo.label} — {count(row.sessionCount, "session")} · {money(row.estimatedCostUsd)} estimated · {tokens(row.totalTokens)} · {count(row.fileEditCount, "file")} edited
          </p>
          <p className="repo-hero-warning">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            Top warning: {topWarning ? readableWarning(topWarning) : "No major repo warning detected in this filtered view."}
          </p>
          <p className="repo-cost-note">Estimated API-equivalent cost. This is not your actual subscription bill.</p>
        </div>
        <div className="repo-hero-metrics">
          <MiniStat label="Estimated cost" value={<CostValue value={row.estimatedCostUsd} breakdown={row} />} />
          <MiniStat label="Total tokens" value={<TokenValue value={row.totalTokens} />} />
          <MiniStat label="Sessions" value={<CountValue value={row.sessionCount} noun="session" />} />
          <MiniStat label="Files edited" value={<CountValue value={row.fileEditCount} noun="file" />} />
        </div>
      </section>

      <div className="repo-detail-tabs" role="tablist" aria-label="Repository detail sections">
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
        <div className="repo-tab-body">
          <div className="repo-overview-grid">
            <RepoDiagnosisCard repo={row} sessions={sessions} concentration={concentration} topModel={topModel} />
            <RepoCostConcentrationCard concentration={concentration} sessions={sessions} {...(onOpenSession ? { onOpenSession } : {})} />
          </div>
          <div className="repo-detail-summary">
            <MiniStat label="Estimated cost" value={<CostValue value={row.estimatedCostUsd} breakdown={row} />} />
            <MiniStat label="Total tokens" value={<TokenValue value={row.totalTokens} />} />
            <MiniStat label="Files edited" value={<CountValue value={row.fileEditCount} noun="file" />} />
            <MiniStat label="Command issues" value={<CountValue value={row.failedCommandCount} noun="issue" />} />
            <MiniStat label="Tokens per edit" value={<TokenIntensityValue label={row.tokenRoiLabel} title={row.tokenRoiTitle} />} />
            <MiniStat label="Interpretation" value={tokenIntensity} />
            <MiniStat label="Top model" value={topModel ? topModel.label : "Unknown"} />
            <MiniStat label="Cache reuse" value={<PercentValue value={row.inputTokens ? row.cachedInputTokens / row.inputTokens : 0} />} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <TopSessionsToReviewCard sessions={reviewSessions} {...(onOpenSession ? { onOpenSession } : {})} />
            <RepoWarningsCard warnings={warnings} />
          </div>
          <RepoComparisonCard repo={row} allRepos={allRepos} />
        </div>
      ) : null}

      {activeTab === "sessions" ? (
        <div className="panel overflow-hidden">
          <div className="panel-heading">
            <div>
              <h2>Sessions</h2>
              <p className="text-sm text-slate-600">Sorted, searchable sessions for this repo. Cost outliers are highlighted.</p>
            </div>
            <div className="panel-actions">
              <SessionColumnPicker columns={visibleColumns} setColumns={setVisibleColumns} />
            </div>
          </div>
          <div className="session-controls">
            <label className="search-field">
              <Search className="h-4 w-4" aria-hidden />
              <input value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="Search sessions..." />
            </label>
            <div className="quick-filter-row">
              <button className={`quick-filter ${quickFilter === "" ? "active" : ""}`} type="button" onClick={() => setQuickFilter("")}>All</button>
              {([
                ["expensive", "Expensive"],
                ["partial", "Partial"],
                ["longRunning", "Long-running"],
                ["commandIssues", "Command issues"],
                ["opusOnly", "Opus only"],
              ] as Array<[RepoSessionQuickFilter, string]>).map(([value, label]) => (
                <button
                  className={`quick-filter ${quickFilter === value ? "active" : ""}`}
                  disabled={!sessions.some((session) => sessionMatchesRepoQuickFilter(session, value, sessions))}
                  key={value}
                  type="button"
                  onClick={() => setQuickFilter(value)}
                >
                  {label}
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
            />
          ) : <EmptyPanel title="No sessions matched this filter." text="Try clearing search or quick filters." />}
        </div>
      ) : null}

      {activeTab === "cost" ? <RepoCostTokensTab repo={row} sessions={sessions} /> : null}
      {activeTab === "files" ? <RepoFilesTab repo={row} sessions={sessions} /> : null}
      {activeTab === "commands" ? <RepoCommandsTab sessions={sessions} commandTotals={commandTotals} {...(onOpenSession ? { onOpenSession } : {})} /> : null}
      {activeTab === "metadata" ? <RepoMetadataTab repo={row} sessions={sessions} data={data} /> : null}
      </div>
  );
}

function RepoDiagnosisCard({ repo, sessions, concentration, topModel }: { repo: RepoRow; sessions: Session[]; concentration: RepoCostConcentration; topModel: RepoModelSpend | undefined }) {
  const sentence = repoDiagnosisSentence(repo, sessions, concentration, topModel);
  return (
    <div className="detail-card repo-diagnosis-card">
      <h3>Repo diagnosis</h3>
      <p className="repo-diagnosis-text">{sentence}</p>
      <div className="repo-diagnosis-points">
        <span>{topModel ? `${topModel.label} drives ${percent(topModel.costShare)} of known repo cost.` : "Model cost driver is unavailable."}</span>
        <span>{repo.failedCommandCount > 0 ? `${count(repo.failedCommandCount, "important command issue")} detected.` : "No important command issues were detected."}</span>
        <span>{repo.fileEditCount > 0 ? "File edit counts were detected, but stable paths may be unavailable." : "No file edits were detected in this filtered view."}</span>
      </div>
    </div>
  );
}

function RepoCostConcentrationCard({ concentration, sessions, onOpenSession }: { concentration: RepoCostConcentration; sessions: Session[]; onOpenSession?: (sessionId: string) => void }) {
  const maxCost = Math.max(...concentration.topSessions.map((session) => session.estimatedCostUsd ?? 0), 0);
  return (
    <div className={`detail-card repo-concentration-card ${concentration.extreme ? "repo-warning-card" : ""}`}>
      <h3>Cost concentration</h3>
      <div className="repo-concentration-stats">
        <MiniStat label="Most expensive session" value={<CostValue value={concentration.topSessionCost} />} />
        <MiniStat label="Top session share" value={<PercentValue value={concentration.topSessionShare} />} />
        <MiniStat label="Top 3 sessions" value={<CostValue value={concentration.topThreeCost} />} />
        <MiniStat label="Top 3 share" value={<PercentValue value={concentration.topThreeShare} />} />
      </div>
      {concentration.extreme ? <p className="warning-text mt-3">Cost concentration is very high. One session accounts for most of this repo’s estimated cost.</p> : null}
      <div className="repo-concentration-list">
        {concentration.topSessions.map((session) => {
          const width = maxCost > 0 && session.estimatedCostUsd !== undefined ? Math.max(4, (session.estimatedCostUsd / maxCost) * 100) : 0;
          return (
            <button className="repo-concentration-row" key={session.id} type="button" onClick={() => onOpenSession?.(session.id)}>
              <span title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</span>
              <strong><CostValue value={session.estimatedCostUsd} session={session} /></strong>
              <div className="repo-bar"><div style={{ width: `${Math.min(width, 100)}%`, background: "#f59e0b" }} /></div>
            </button>
          );
        })}
        {!sessions.length ? <p className="text-sm text-slate-600">No sessions matched this repo.</p> : null}
      </div>
    </div>
  );
}

function TopSessionsToReviewCard({ sessions, onOpenSession }: { sessions: RepoReviewSession[]; onOpenSession?: (sessionId: string) => void }) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-heading">
        <div>
          <h2>Top sessions to review</h2>
          <p className="text-sm text-slate-600">Picked by cost, duration, outcome, command issues, and unusual token volume.</p>
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
              <span><TokenValue value={session.totalTokens} /></span>
              <span>{formatDuration(session.durationMs)}</span>
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

function RepoWarningsCard({ warnings }: { warnings: string[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-heading">
        <h2>Estimated cost warnings</h2>
      </div>
      <div className="repo-warning-list">
        {warnings.length ? warnings.map((warning) => (
          <div className="repo-warning-row" key={warning}>
            <TriangleAlert className="h-4 w-4 text-amber" aria-hidden />
            <span>{readableWarning(warning)}</span>
          </div>
        )) : <p className="p-4 text-sm text-slate-600">No repo warnings detected.</p>}
      </div>
    </div>
  );
}

function RepoComparisonCard({ repo, allRepos }: { repo: RepoRow; allRepos: RepoRow[] }) {
  if (allRepos.length <= 1) return null;
  const ranked = [...allRepos].sort((a, b) => nullableNumber(b.estimatedCostUsd) - nullableNumber(a.estimatedCostUsd));
  const rank = ranked.findIndex((item) => item.id === repo.id) + 1;
  const totalCost = allRepos.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0);
  const share = totalCost > 0 && repo.estimatedCostUsd !== undefined ? repo.estimatedCostUsd / totalCost : 0;
  return (
    <div className="detail-card">
      <h3>Compared to other repos</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <MiniStat label="Cost rank" value={rank ? `#${rank} of ${allRepos.length}` : "Unknown"} />
        <MiniStat label="Share of filtered cost" value={<PercentValue value={share} />} />
        <MiniStat label="Most expensive repo" value={ranked[0]?.label ?? "Unknown"} />
      </div>
    </div>
  );
}

function RepoCostTokensTab({ repo, sessions }: { repo: RepoRow; sessions: Session[] }) {
  const modelRows = repoModelBreakdown(sessions, repo);
  const dayRows = repoDailyBreakdown(sessions);
  return (
    <div className="repo-tab-body">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="detail-card">
          <h3>Token breakdown</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <MiniStat label="Total input" value={<TokenValue value={repo.inputTokens} />} />
            <MiniStat label="Cached input" value={<TokenValue value={repo.cachedInputTokens} />} />
            <MiniStat label="Output" value={<TokenValue value={repo.outputTokens} />} />
            <MiniStat label="Reasoning" value={<TokenValue value={repo.reasoningTokens} />} />
          </div>
        </div>
        <div className="detail-card">
          <h3>Cache usage</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <MiniStat label="Cache reuse" value={<PercentValue value={repo.inputTokens ? repo.cachedInputTokens / repo.inputTokens : 0} />} />
            <MiniStat label="Cached input" value={<TokenValue value={repo.cachedInputTokens} />} />
            <MiniStat label="Total input" value={<TokenValue value={repo.inputTokens} />} />
            <MiniStat label="Sessions" value={<CountValue value={repo.sessionCount} noun="session" />} />
          </div>
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
              <Bar dataKey="estimatedCostUsd" name="Estimated cost" fill="#2dd4bf" />
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
        </div>
      </div>
    </div>
  );
}

function RepoFilesTab({ repo, sessions }: { repo: RepoRow; sessions: Session[] }) {
  const edited = sessions.reduce((sum, session) => sum + (session.fileEditCount ?? 0), 0);
  const read = sessions.reduce((sum, session) => sum + (session.fileReadCount ?? 0), 0);
  return (
    <div className="repo-tab-body">
      <div className="detail-card">
        <h3>Files edited/read</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <MiniStat label="Files edited" value={<CountValue value={edited} noun="file" />} />
          <MiniStat label="Files read" value={<CountValue value={read} noun="file" />} />
          <MiniStat label="Sessions with edits" value={<CountValue value={sessions.filter((session) => (session.fileEditCount ?? 0) > 0).length} noun="session" />} />
          <MiniStat label="Tokens per edit" value={<TokenIntensityValue label={repo.tokenRoiLabel} title={repo.tokenRoiTitle} />} />
        </div>
        {edited > 0 ? (
          <div className="compact-warning mt-4">
            File edit counts were detected, but stable file paths are unavailable for this log format.
            <details>
              <summary>Learn more</summary>
              <p>RepoSpend can count file reads and edits from local session metadata, but some source formats do not persist stable per-file paths. Source limitations and raw paths are listed in Metadata.</p>
            </details>
          </div>
        ) : <p className="mt-3 text-sm text-slate-600">No file edits were detected for this repo in the current filtered view.</p>}
      </div>
    </div>
  );
}

function RepoCommandsTab({ sessions, commandTotals, onOpenSession }: { sessions: Session[]; commandTotals: RepoCommandTotals; onOpenSession?: (sessionId: string) => void }) {
  const reviewSessions = sessions.filter(sessionNeedsCommandReview).slice(0, 8);
  const issueSamples = sessions.flatMap((session) => (session.commandIssueSamples ?? []).map((issue) => ({ session, issue })));
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
        {commandTotals.important === 0 ? <p className="success-state mt-4">No important command issues detected.</p> : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="detail-card">
          <h3>Important command issues</h3>
          <div className="mt-3 space-y-2">
            {issueSamples.filter(({ issue }) => issue.severity === "critical" || issue.severity === "warning").slice(0, 8).map(({ session, issue }, index) => (
              <div className="issue-row" key={`${session.id}-${issue.command}-${index}`}>
                <div>
                  <div className="font-mono text-xs text-slate-100" title={issue.command}>{shortCommand(issue.command)}</div>
                  <p className="mt-1 text-xs text-slate-500">{issue.reason}</p>
                </div>
                <div className="issue-row-badges">
                  <Badge label={readableIssueLabel(issue.category)} />
                  <Badge label={`${issue.impact} impact`} />
                </div>
              </div>
            ))}
            {!issueSamples.some(({ issue }) => issue.severity === "critical" || issue.severity === "warning") ? <p className="text-sm text-slate-600">No important command issue samples were available.</p> : null}
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

function RepoMetadataTab({ repo, sessions, data }: { repo: RepoRow; sessions: Session[]; data: ApiData }) {
  const sourcePaths = [...new Set(sessions.map((session) => session.sourcePath).filter(Boolean))];
  const rawPaths = [...new Set(sessions.map((session) => session.repoRoot).filter(Boolean))];
  return (
    <div className="repo-tab-body">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="detail-card">
          <h3>Repo grouping</h3>
          <div className="metadata-list mt-3">
            <MetadataRow label="Repo" value={repo.label} />
            <MetadataRow label="Repo root" value={shortPath(repo.id)} title={repo.id} />
            <MetadataRow label="Grouping method" value="Git repository root when available; otherwise source-local fallback." />
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
        <div className="detail-card">
          <h3>Raw paths</h3>
          <div className="metadata-list mt-3">
            {rawPaths.slice(0, 8).map((path) => <MetadataRow key={path} label="Repo path" value={shortPath(path)} title={path} />)}
            {!rawPaths.length ? <MetadataRow label="Repo path" value="Unavailable" /> : null}
          </div>
        </div>
        <div className="detail-card">
          <h3>Data source files</h3>
          <div className="metadata-list mt-3">
            {sourcePaths.slice(0, 8).map((path) => <MetadataRow key={path} label="Source file" value={shortPath(path)} title={path} />)}
            {!sourcePaths.length ? <MetadataRow label="Source file" value="Unavailable" /> : null}
          </div>
        </div>
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
      <table className="sessions-table">
        <thead>
          <tr>
            {!compact ? <SortableTh label="Repo" column="repo" sort={sort} setSort={setSort} /> : null}
            {!compact ? <SortableTh label="Source / App" column="app" sort={sort} setSort={setSort} /> : null}
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
            {hasColumn("commandIssues") ? <SortableTh label="Command issues" column="failed" sort={sort} setSort={setSort} /> : null}
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
              className={`${selectedSessionId === session.id ? "selected" : ""} ${isCostOutlier(session, costOutlierThreshold) ? "cost-outlier-row" : ""} ${onSelectSession ? "clickable-row" : ""}`}
            >
              {!compact ? <td>{session.repoName}</td> : null}
              {!compact ? <td><div className="source-app-cell"><SourceBadge source={session.sourceClient} /><AppLabel app={session.sourceApp} surface={session.detectedSurface} /></div></td> : null}
              <td className="max-w-72 truncate font-medium" title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</td>
              <td><OutcomeBadge outcome={session.sessionOutcome} /></td>
              <td>{session.model ?? "Unknown"}</td>
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

function SessionDetailPanel({ session }: { session: Session | undefined }) {
  const [activeTab, setActiveTab] = React.useState<SessionDetailTab>("overview");
  const [timelineSearch, setTimelineSearch] = React.useState("");
  const [timelineRole, setTimelineRole] = React.useState<TimelineRoleFilter>("all");
  const [expandedTimelineItems, setExpandedTimelineItems] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    setActiveTab("overview");
    setTimelineSearch("");
    setTimelineRole("all");
    setExpandedTimelineItems(new Set());
  }, [session?.id]);

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
        <MiniStat label="Model" value={session.model ?? "Unknown"} />
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
            <SessionDetailCard title="Highlights">
              {positives.length ? <SignalList items={positives} /> : <p className="detail-muted">No strong positive signals were detected from local metadata.</p>}
            </SessionDetailCard>
            <SessionDetailCard title="Needs attention">
              {concerns.length ? <SignalList items={concerns} /> : <p className="detail-muted">No obvious issues detected for this session.</p>}
            </SessionDetailCard>
            <SessionDetailCard title="Session activity">
              <div className="session-mini-grid">
                <MiniStat label="Messages" value={<CountValue value={session.messageCount} noun="message" />} />
                <MiniStat label="Prompts" value={<CountValue value={session.userPromptCount ?? 0} noun="prompt" />} />
                <MiniStat label="Assistant replies" value={<CountValue value={session.assistantMessageCount ?? 0} noun="reply" />} />
                <MiniStat label="Tool calls" value={<CountValue value={session.toolCallCount ?? 0} noun="tool call" />} />
                <MiniStat label="Command issues" value={<CountValue value={importantCommandFailures(session)} noun="issue" />} />
                <MiniStat label="Outcome" value={<OutcomeBadge outcome={session.sessionOutcome} />} />
              </div>
            </SessionDetailCard>
            <SessionDetailCard title="Token breakdown">
              <TokenBreakdownGrid session={session} />
            </SessionDetailCard>
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
                <MiniStat label="Repo" value={session.repoName} />
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
            <SessionDetailCard className="session-card-wide" title="Command diagnostics">
              {commandIssueSamples.length ? (
                <div className="space-y-2">
                  {commandIssueSamples.map((issue, index) => (
                    <div className="issue-row" key={`${issue.command}-${index}`}>
                      <div>
                        <div className="font-mono text-xs text-slate-100" title={issue.command}>{shortCommand(issue.command)}</div>
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
                <p className="detail-muted">No command issue detail was available in this local session log.</p>
              )}
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
            <SessionDetailCard title="Repo, branch, provider, source file">
              <div className="metadata-list">
                <MetadataRow label="Repo" value={session.repoName} title={session.repoRoot} />
                <MetadataRow label="Repo root" value={shortPath(session.repoRoot)} title={session.repoRoot} />
                <MetadataRow label="Branch" value={session.gitBranch ?? "Unknown"} />
                <MetadataRow label="Provider" value={session.provider ?? "Unknown"} />
                <MetadataRow label="Source" value={sourceLabel(session.sourceClient)} />
                <MetadataRow label="App / surface" value={session.sourceApp || surfaceLabel(session.detectedSurface)} />
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

function MetadataRow({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
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
  descriptors.push(importantCommandFailures(session) === 0 ? "and no command issues" : `and ${count(importantCommandFailures(session), "command issue")}`);
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

function SessionDetailPage({ session, onBack }: { session: Session | undefined; onBack: () => void }) {
  return (
    <section className="mt-4 space-y-4">
      <button className="text-button" type="button" onClick={onBack}>Back to sessions</button>
      <SessionDetailPanel session={session} />
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

function EmptyState({ data }: { data: ApiData }) {
  const sourceLabels = data.sources.map((source) => source.label).join(", ") || "Codex, Claude Code";
  const sourcePaths = data.sources.flatMap((source) => source.paths);
  return (
    <div className="panel mt-4 p-6">
      <div className="flex items-start gap-3">
        <Search className="mt-1 h-5 w-5 text-amber" aria-hidden />
        <div>
          <h2 className="text-base font-semibold">RepoSpend could not find local usage sessions yet.</h2>
          <p className="mt-1 text-sm text-slate-600">Sources scanned: {sourceLabels}. Run Codex or Claude Code locally, then refresh the scan. RepoSpend reads local files read-only and never mutates source data.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.sourceStats.map((source) => (
              <MiniStat key={source.sourceId ?? source.homePath ?? source.sessionsPath} label={source.sourceLabel ?? "Source"} value={source.sessionsExists || source.projectsExists || source.stateExists ? "Found" : "Missing"} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {sourcePaths.map((sourcePath) => <code className="inline-code" key={sourcePath}>{shortPath(sourcePath)}</code>)}
          </div>
          <p className="mt-3 text-sm text-slate-600">If history persistence is disabled or sessions are stored elsewhere, local usage may be unavailable to RepoSpend.</p>
          <button className="button mt-3" type="button" onClick={() => window.location.reload()}>Refresh scan</button>
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

function LoadingState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`panel loading-state ${compact ? "loading-state-compact" : ""}`}>
      <div className="loading-state-inner">
        <RefreshCw className="loading-state-icon animate-spin" aria-hidden />
        <div>
          <h2>{compact ? "Updating dashboard data" : "Loading local AI coding usage"}</h2>
          <p>
            {compact
              ? "Refreshing local session totals for the current filters."
              : "RepoSpend is scanning local Codex and Claude Code files, then grouping each session by Git repository."}
          </p>
        </div>
      </div>
    </div>
  );
}

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "pricing", label: "Pricing" },
  { id: "sources", label: "Data Sources" },
  { id: "tokens", label: "Token Counting" },
  { id: "privacy", label: "Privacy" },
  { id: "advanced", label: "Advanced" },
];

const apiEquivalentCopy = "RepoSpend shows API-equivalent cost estimates. This is not your actual bill. Local Codex and Claude Code logs may include token counts, but they do not always include your real subscription, credit, cache, or provider billing details.";

function SettingsStatusBanner({ data }: { data: ApiData }) {
  const codex = sourceImportedSessions(data, "codex");
  const claude = sourceImportedSessions(data, "claude");
  return (
    <div className="settings-status-banner">
      <div>
        <div className="settings-status-title">Local scan complete</div>
        <p>
          {count(codex, "Codex session")}, {count(claude, "Claude session")}, {count(data.scan.parseFailureCount, "parse issue")}.
        </p>
      </div>
      <button className="button" type="button" onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4" aria-hidden />
        Rescan local logs
      </button>
    </div>
  );
}

function SettingsPricingTab({
  data,
  draft,
  setDraft,
  status,
  onSave,
  onReset,
}: {
  data: ApiData;
  draft: Record<string, ModelPricing>;
  setDraft: (draft: Record<string, ModelPricing>) => void;
  status: string | null;
  onSave: () => Promise<void>;
  onReset: () => void;
}) {
  const [newModel, setNewModel] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [providerFilter, setProviderFilter] = React.useState<PricingProviderFilter>("all");
  const [viewFilter, setViewFilter] = React.useState<PricingViewFilter>("used");
  const usedModels = React.useMemo(() => new Set(data.models.map((model) => model.id)), [data.models]);
  const usageCounts = React.useMemo(() => new Map(data.models.map((model) => [model.id, model.sessionCount])), [data.models]);
  const rows = pricingRows(draft, data.models);

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
    if (viewFilter === "missing" && !missing) return false;
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

      <div className="pricing-toolbar">
        <label className="search-field pricing-search">
          <Search className="h-4 w-4" aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search model names" />
        </label>
        <div className="pricing-filter-group" aria-label="Provider filter">
          {([
            ["all", "All providers"],
            ["openai", "OpenAI"],
            ["claude", "Claude"],
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
            ["missing", "Missing prices"],
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
              <th>Cache write</th>
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
                    <div className="font-medium">{row.model}</div>
                    <div className="pricing-model-meta">
                      {usedModels.has(row.model) ? `${count(usageCounts.get(row.model) ?? 0, "session")} in current scan` : "Unused in current scan"}
                      {row.inherited && row.sourceModel ? <span>Uses {row.sourceModel} pricing</span> : null}
                      {pricingMissing(row) ? <span className="warning-text">Missing price</span> : null}
                    </div>
                  </div>
                </td>
                <PriceInput value={row.pricing.inputPerMillion} onChange={(value) => updatePrice(row.model, "inputPerMillion", value)} />
                <PriceInput value={row.pricing.cacheCreationInputPerMillion} onChange={(value) => updatePrice(row.model, "cacheCreationInputPerMillion", value)} />
                <PriceInput value={row.pricing.cachedInputPerMillion} onChange={(value) => updatePrice(row.model, "cachedInputPerMillion", value)} />
                <PriceInput value={row.pricing.outputPerMillion} onChange={(value) => updatePrice(row.model, "outputPerMillion", value)} />
                <PriceInput value={row.pricing.reasoningOutputPerMillion} onChange={(value) => updatePrice(row.model, "reasoningOutputPerMillion", value)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleRows.length === 0 ? <p className="settings-empty-note">No models match the current filters.</p> : null}
      <div className="settings-supporting-copy">
        <p>Rates are USD per 1M tokens. Saving writes local RepoSpend settings under <code>~/.repospend/</code> unless <code>repospend.config.json</code> sets <code>pricingPath</code>.</p>
        {(data.pricing.info.sourceUrls ?? [{ label: data.pricing.info.sourceName, url: data.pricing.info.sourceUrl }]).map((source) => (
          <a className="text-button" href={source.url} key={source.url}>{source.label}</a>
        ))}
        {status ? <p className="font-semibold text-teal">{status}</p> : null}
      </div>
    </div>
  );
}

function SettingsDataSourcesTab({ data }: { data: ApiData }) {
  const sourceWarnings = data.sources.flatMap((source) => source.warnings);
  return (
    <div className="settings-tab-panel">
      <div className="settings-section-header">
        <div>
          <h2>Data sources</h2>
          <p>RepoSpend reads Codex and Claude Code logs locally and read-only, then groups sessions by Git repository where possible.</p>
        </div>
      </div>
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
      <div className="token-accuracy-grid settings-token-grid">
        <MiniStat label="Aggregation method" value={stats.methodLabel} />
        <MiniStat label="Confidence" value={stats.confidenceLabel} />
        <MiniStat label="Token checkpoints" value={<CountValue value={stats.tokenSnapshots} noun="checkpoint" />} />
        <MiniStat label="Sessions with token data" value={<CountValue value={stats.sessionsWithTokenData} noun="session" />} />
        <MiniStat label="Missing token data" value={<CountValue value={stats.sessionsMissingTokenData} noun="session" />} />
      </div>
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
        <InfoPanel title="Read-only source logs" text="RepoSpend reads local Codex and Claude Code logs but does not modify them." />
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
}: {
  data: ApiData;
  filterSortMode: FilterSortMode;
  setFilterSortMode: (mode: FilterSortMode) => void;
  displaySettings: DisplaySettings;
  setDisplaySettings: (settings: Partial<DisplaySettings>) => void;
  onClearLocalData: () => Promise<void>;
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
  onClearLocalData,
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
  onClearLocalData: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("pricing");

  return (
    <section className="settings-page mt-4">
      <SettingsStatusBanner data={data} />
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
          <SettingsPricingTab data={data} draft={draft} setDraft={setDraft} status={status} onSave={onSave} onReset={onReset} />
        ) : null}
        {activeTab === "sources" ? <SettingsDataSourcesTab data={data} /> : null}
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

function SessionsPage({ data, displaySettings, setDisplaySettings, onOpenSession }: { data: ApiData; displaySettings: DisplaySettings; setDisplaySettings: (settings: Partial<DisplaySettings>) => void; onOpenSession: (sessionId: string) => void }) {
  const [search, setSearch] = React.useState("");
  const [quickFilter, setQuickFilter] = React.useState<QuickSessionFilter | "">("");
  const [visibleColumns, setVisibleColumns] = React.useState<SessionColumnKey[]>(defaultSessionColumns);
  const filteredSessions = React.useMemo(
    () => data.sessions.filter((session) => sessionMatchesSearch(session, search) && sessionMatchesQuickFilter(session, quickFilter)),
    [data.sessions, quickFilter, search],
  );
  const quickOptions: Array<{ value: QuickSessionFilter; label: string }> = [
    { value: "highToken", label: "High token" },
    { value: "failedCommands", label: "Command issues" },
    { value: "noEdits", label: "No edits" },
    { value: "completed", label: "Completed" },
    { value: "partial", label: "Partial" },
    { value: "vscode", label: "VS Code" },
    { value: "terminal", label: "Terminal" },
    { value: "unknownSurface", label: "Unknown surface" },
  ];
  return (
    <section className="mt-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Loaded sessions" value={<CountValue value={filteredSessions.length} noun="session" />} />
        <MiniStat label="Prompts" value={<CountValue value={data.summary.userPromptCount} noun="prompt" />} />
        <MiniStat label="Shell commands" value={<CountValue value={data.summary.shellCommandCount} noun="command" />} />
        <MiniStat label="File edits detected" value={<CountValue value={data.summary.fileEditCount} noun="edit" />} />
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Session Inventory</h2>
            <p className="text-sm text-slate-600">Local metadata parsed from source threads and session files.</p>
          </div>
          <div className="panel-actions">
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
      <div className="secondary-metric-grid">
        <MiniStat label="Repos discovered" value={<CountValue value={rows.length} noun="repo" />} />
        <MiniStat label="Top estimated cost repo" value={topRepo ? topRepo.label : "None"} />
        <MiniStat label="Top repo share" value={<PercentValue value={topRepoShare} />} />
        <MiniStat label="Repos with command issues" value={<CountValue value={reposWithIssues} noun="repo" />} />
        <MiniStat label="Unpriced token sessions" value={<CountValue value={missingPricingSessions} noun="session" />} />
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Repositories</h2>
            <p className="text-sm text-slate-600">Compare local AI coding usage by Git repository root. Nested working directories are merged into their parent repo.</p>
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

function RepoDetailPage({ data, selectedRepo, dateRangeLabel, pageSize, onBack, onOpenSession }: { data: ApiData; selectedRepo: string | null; dateRangeLabel: string; pageSize: number; onBack: () => void; onOpenSession: (sessionId: string) => void }) {
  const rows = repoRows(data);
  const selected = selectedRepo ? rows.find((repo) => repo.id === selectedRepo) : undefined;
  return (
    <section className="mt-4 space-y-4">
      <button className="text-button" type="button" onClick={onBack}>Back to repos</button>
      <RepoDetail repo={selected} sessions={selected?.sessions ?? []} allRepos={rows} data={data} dateRangeLabel={dateRangeLabel} pageSize={pageSize} onOpenSession={onOpenSession} />
    </section>
  );
}

function activateClickableRow(event: React.KeyboardEvent, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

function AgentFrictionPage({ data, onOpenRepo, onOpenSession, displaySettings, setDisplaySettings }: { data: ApiData; onOpenRepo: (repoId: string) => void; onOpenSession: (sessionId: string) => void; displaySettings: DisplaySettings; setDisplaySettings: (settings: Partial<DisplaySettings>) => void }) {
  const reviewSessions = data.sessions.filter(sessionNeedsCommandReview);
  const harmlessSessions = data.sessions.filter((session) => importantCommandFailures(session) === 0 && ((session.harmlessNonZeroEvents ?? 0) > 0 || (session.exploratoryMisses ?? 0) > 0));
  const affectedRepos = agentFrictionRepos(data.sessions);
  const repoPager = usePagination(affectedRepos, displaySettings.tablePageSize);
  const reviewPager = usePagination(reviewSessions, displaySettings.tablePageSize);
  const harmlessPager = usePagination(harmlessSessions, displaySettings.tablePageSize);
  const topRepo = affectedRepos[0];
  return (
    <section className="mt-4 space-y-4">
      <div className="panel command-health-note">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-1 h-5 w-5 text-amber" aria-hidden />
          <div>
            <h2>How Agent Friction is classified</h2>
            <p>
              Many shell commands return a non-zero exit during normal exploration. RepoSpend separates blocking failures from harmless non-zero exits and focuses on repeated, blocking, or token-expensive command issues.
            </p>
            <p>
              Search misses, optional file probes, and Git diff checks are treated as low severity unless other evidence suggests they blocked progress. Builds, tests, installs, permissions, auth, database, deploy, and repeated failures are treated as important signals.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="Important failures" value={<CountValue value={data.summary.importantCommandFailures} noun="issue" />} />
        <MiniStat label="Repeated failure clusters" value={<CountValue value={data.summary.repeatedFailureClusters} noun="cluster" />} />
        <MiniStat label="Harmless non-zero exits" value={<CountValue value={data.summary.harmlessNonZeroEvents + data.summary.exploratoryMisses} noun="event" />} />
        <MiniStat label="Sessions needing review" value={<CountValue value={reviewSessions.length} noun="session" />} />
        <MiniStat label="Top affected repo" value={topRepo ? topRepo.repoName : "None"} />
      </div>
      <p className="text-xs text-slate-500">Total non-zero command events: {count(data.summary.nonZeroCommandEvents, "event")}.</p>

      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Command Signals by Repo</h2>
            <p className="text-sm text-slate-600">Repos where important command issues, harmless exits, or repeated clusters appear in the current filtered view.</p>
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
                  <th>Repo</th>
                  <th>Important failures</th>
                  <th>Harmless non-zero exits</th>
                  <th>Repeated clusters</th>
                  <th>Sessions needing review</th>
                  <th>Top failure type</th>
                  <th>Impact</th>
                  <th>API-equivalent cost</th>
                </tr>
              </thead>
              <tbody>
                {repoPager.items.map((repo) => (
                  <tr className="clickable-row" key={repo.repoRoot} role="button" tabIndex={0} onClick={() => onOpenRepo(repo.repoRoot)} onKeyDown={(event) => activateClickableRow(event, () => onOpenRepo(repo.repoRoot))}>
                    <td className="font-medium">{repo.repoName}</td>
                    <td><CountValue value={repo.importantFailures} noun="issue" showUnit={false} /></td>
                    <td><CountValue value={repo.harmlessNonZeroEvents} noun="event" showUnit={false} /></td>
                    <td><CountValue value={repo.repeatedFailureClusters} noun="cluster" showUnit={false} /></td>
                    <td><CountValue value={repo.sessionsNeedingReview} noun="session" showUnit={false} /></td>
                    <td>{failureTypeLabel(repo.topFailureType)}</td>
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
            <p className="text-sm text-slate-600">No important command issues detected. Some harmless non-zero shell exits may still exist.</p>
          </div>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-heading">
          <div>
            <h2>Sessions Needing Review</h2>
            <p className="text-sm text-slate-600">Sessions with important failures, repeated clusters, high non-zero rates, or command issues in high-token work.</p>
          </div>
        </div>
        {reviewSessions.length ? (
          <div className="table-wrap">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Repo</th>
                  <th>Outcome</th>
                  <th>Important failures</th>
                  <th>Harmless exits</th>
                  <th>Top failure type</th>
                  <th>Impact</th>
                  <th>Total tokens</th>
                  <th>Files edited</th>
                </tr>
              </thead>
              <tbody>
                {reviewPager.items.map((session) => (
                  <tr className="clickable-row" key={session.id} role="button" tabIndex={0} onClick={() => onOpenSession(session.id)} onKeyDown={(event) => activateClickableRow(event, () => onOpenSession(session.id))}>
                    <td className="max-w-80 truncate font-medium" title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</td>
                    <td>{session.repoName}</td>
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
        ) : <p className="p-4 text-sm text-slate-600">No important command issues detected. Some harmless non-zero shell exits may still exist.</p>}
      </div>

      <details className="panel overflow-hidden">
        <summary className="advanced-summary">Harmless / ignored non-zero events</summary>
        {harmlessSessions.length ? (
          <div className="table-wrap">
            <table className="compact-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Repo</th>
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

function KeyInsightsPanel({ insights, compact = false }: { insights: KeyInsight[]; compact?: boolean }) {
  return (
    <section className="panel overflow-hidden">
      <div className="panel-heading">
        <div>
          <h2>Key Insights</h2>
          {!compact ? <p className="text-sm text-slate-600">The fastest read on where usage went and what to inspect first.</p> : null}
        </div>
      </div>
      <div className={`${compact ? "key-insights-list" : "key-insights-grid"} p-4`}>
        {insights.length ? insights.map((insight) => (
          <div className={`key-insight key-insight-${insight.tone ?? "neutral"}`} key={insight.text}>
            <div className="key-insight-topline">
              <span>{insight.label}</span>
              {insight.metric ? <strong>{insight.metric}</strong> : null}
            </div>
            <p>{insight.text}</p>
          </div>
        )) : <p className="text-sm text-slate-600">No insights available for this filtered view yet.</p>}
      </div>
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

function ExpensiveSessionsTable({ sessions, pageSize, onOpenSession, onOpenRepo }: { sessions: Session[]; pageSize: number; onOpenSession: (sessionId: string) => void; onOpenRepo: (repoId: string) => void }) {
  const [sort, setSort] = React.useState<{ key: SessionSortKey; direction: SortDirection }>({ key: "cost", direction: "desc" });
  const sortedSessions = React.useMemo(() => sortSessionRows(sessions, sort), [sessions, sort]);
  const pager = usePagination(sortedSessions, pageSize);
  return (
    <div className="table-wrap">
      <table className="expensive-table">
        <thead>
          <tr>
            <SortableTh label="Repo" column="repo" sort={sort} setSort={setSort} />
            <SortableTh label="Session" column="session" sort={sort} setSort={setSort} />
            <SortableTh label="Source / App" column="app" sort={sort} setSort={setSort} />
            <th>Outcome</th>
            <SortableTh label="Model" column="model" sort={sort} setSort={setSort} />
            <SortableTh label="Started" column="started" sort={sort} setSort={setSort} />
            <SortableTh label="Duration" column="duration" sort={sort} setSort={setSort} />
            <SortableTh label="API-equivalent cost" column="cost" sort={sort} setSort={setSort} />
            <SortableTh label="Total tokens" column="tokens" sort={sort} setSort={setSort} />
            <SortableTh label="Files edited" column="files" sort={sort} setSort={setSort} />
            <SortableTh label="Command issues" column="failed" sort={sort} setSort={setSort} />
            <th>Warnings</th>
          </tr>
        </thead>
        <tbody>
          {pager.items.map((session) => (
            <tr className="clickable-row" key={session.id} role="button" tabIndex={0} onClick={() => onOpenSession(session.id)} onKeyDown={(event) => activateClickableRow(event, () => onOpenSession(session.id))}>
              <td>
                <button className="row-link-button" type="button" onClick={(event) => {
                  event.stopPropagation();
                  onOpenRepo(session.repoRoot || session.repoName);
                }}>{session.repoName}</button>
              </td>
              <td className="max-w-80 truncate font-medium" title={sessionDisplayTitle(session)}>{sessionDisplayTitle(session)}</td>
              <td><div className="source-app-cell"><SourceBadge source={session.sourceClient} /><AppLabel app={session.sourceApp} surface={session.detectedSurface} /></div></td>
              <td><OutcomeBadge outcome={session.sessionOutcome} /></td>
              <td>{session.model ?? "Unknown"}</td>
              <td>{session.startedAt ? session.startedAt.slice(0, 10) : "Unknown"}</td>
              <td>{formatDuration(session.durationMs)}</td>
              <td><CostValue value={session.estimatedCostUsd} session={session} /></td>
              <td><TokenValue value={session.totalTokens} showUnit={false} /></td>
              <td><CountValue value={session.fileEditCount ?? 0} noun="file" showUnit={false} /></td>
              <td><CountValue value={importantCommandFailures(session)} noun="issue" showUnit={false} /></td>
              <td><BadgeRow labels={sessionBadges(session).filter((label) => label !== outcomeLabel(session.sessionOutcome))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <PaginationControls page={pager.page} pageCount={pager.pageCount} total={sortedSessions.length} pageSize={pageSize} onPageChange={pager.setPage} />
    </div>
  );
}

function InsightsPage({ data, onNavigate }: { data: ApiData; onNavigate: (view: ViewKey) => void }) {
  const insights = data.health.signals;
  const good = insights.filter((item) => item.tone === "good");
  const attention = insights.filter((item) => item.tone === "attention");
  return (
    <section className="mt-4 space-y-4">
      <div className="health-summary-row">
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
          <InsightColumn title="Already healthy" empty="No healthy signals yet. Load usage or widen the filters." items={good} onNavigate={onNavigate} />
          <InsightColumn title="Needs attention" empty="No major issues detected in this filtered view." items={attention} onNavigate={onNavigate} />
        </div>
      </div>
    </section>
  );
}

function InsightColumn({ title, empty, items, onNavigate }: { title: string; empty: string; items: InsightItem[]; onNavigate: (view: ViewKey) => void }) {
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
                <button className="text-button mt-2" type="button" onClick={() => onNavigate(item.actionTarget!)}>
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

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mt-4 border border-rose/30 bg-rose/5 p-4 text-sm text-rose">
      <strong>Unable to load RepoSpend data.</strong> {message}
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

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
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
              <PickerIconView kind={option.icon ?? iconKind} label={option.label} />
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
  filters.source.forEach((value) => chips.push({ key: "source", label: "Source", value, displayValue: sources.find((source) => source.value === value)?.label ?? value }));
  filters.sourceApp.forEach((value) => chips.push({ key: "sourceApp", label: "App", value, displayValue: sourceApps.find((app) => app.value === value)?.label ?? value }));
  filters.repo.forEach((value) => chips.push({ key: "repo", label: "Repo", value, displayValue: repos.find((repo) => repo.value === value)?.label ?? value }));
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
      {chips.length === 0 && !hasCustomDate ? <span className="active-filter-empty">No source, app, repo, or model filters applied.</span> : null}
      {hasAnyFilter ? <button className="text-button active-filter-reset" type="button" onClick={onResetAll}>Reset filters</button> : null}
    </div>
  );
}

function Select({ icon, label, value, onChange, options }: { icon: React.ReactElement; label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="field">
      <span>{React.cloneElement(icon, { className: "h-4 w-4" })}{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
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
      <AppIcon app={label} surface={surface} />
      <span>{label}</span>
    </span>
  );
}

function SourceBadge({ source, label }: { source: Session["sourceClient"]; label?: string }) {
  const display = label ?? sourceLabel(source);
  return (
    <span className={`source-badge source-badge-${source}`} title={`Source: ${display}`}>
      <AppIcon app={display} />
      <span>{display}</span>
    </span>
  );
}

function PickerIconView({ kind, label }: { kind: PickerIcon; label: string }) {
  if (label === "All") return <Boxes className="h-4 w-4" aria-hidden />;
  if (kind === "source") return <AppIcon app={label} />;
  if (kind === "app") return <AppIcon app={label} />;
  if (kind === "repo") return <Folder className="h-4 w-4" aria-hidden />;
  if (label.toLowerCase().includes("claude")) return <ClaudeIcon />;
  if (label.toLowerCase().includes("gpt")) return <CodexIcon />;
  return <Bot className="h-4 w-4" aria-hidden />;
}

function AppIcon({ app, surface }: { app?: string; surface?: Session["detectedSurface"] }) {
  const kind = (app || surface || "").toLowerCase();
  if (kind.includes("desktop local agent") || surface === "local_agent") return <ClaudeDesktopIcon />;
  if (kind.includes("claude")) return <ClaudeIcon />;
  if (kind.includes("vs code") || kind.includes("vscode") || surface === "vscode_extension") return <VsCodeIcon />;
  if (kind.includes("codex app") || kind.includes("subagent") || surface === "codex_app_cloud") return <CodexAppIcon />;
  if (kind.includes("codex") || kind.includes("agent")) return <CodexIcon />;
  if (kind.includes("exec") || surface === "codex_exec") return <Code2 className="h-4 w-4" aria-hidden />;
  if (kind.includes("terminal") || kind.includes("cli") || surface === "terminal_cli") return <Terminal className="h-4 w-4" aria-hidden />;
  if (!app) return <Boxes className="h-4 w-4" aria-hidden />;
  return <Command className="h-4 w-4" aria-hidden />;
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

function ClaudeDesktopIcon() {
  return (
    <svg className="brand-icon claude-desktop-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="3.2" y="4" width="17.6" height="12.4" rx="2.4" fill="currentColor" opacity="0.22" />
      <path d="M6 6.9h12v6.6H6V6.9Z" fill="currentColor" opacity="0.42" />
      <path d="M12 7.5 13.35 10.1l2.9-.55-1.95 2.05 1.95 2.05-2.9-.55L12 15.7l-1.35-2.6-2.9.55 1.95-2.05-1.95-2.05 2.9.55L12 7.5Z" fill="currentColor" />
      <path d="M9.4 18.2h5.2l.55 1.8h-6.3l.55-1.8Z" fill="currentColor" opacity="0.74" />
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

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="button" href={href} target="_blank" rel="noreferrer">
      <ExternalLink className="h-4 w-4" aria-hidden />
      <span>{label}</span>
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

function Badge({ label, title }: { label: string; title?: string }) {
  const className = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return <span className={`status-badge status-${className}`} title={title}>{label.replaceAll("_", " ")}</span>;
}

function OutcomeBadge({ outcome }: { outcome: Session["sessionOutcome"] }) {
  return <Badge label={outcomeLabel(outcome)} title={outcomeTitle(outcome)} />;
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
  const labels = warnings.map(readableWarning).filter((warning) => warning !== "Command issues detected");
  if (commandIssueCount > 0) labels.unshift(`${count(commandIssueCount, "command issue")} detected`);
  if (!labels.length) return <span className="text-xs text-slate-500">None</span>;
  return <BadgeRow labels={labels} />;
}

function prioritizeBadges(labels: string[]): string[] {
  const priority = ["Command issue", "Command issues detected", "High token", "No edits", "Unknown repo", "Repo unverified", "Unknown surface", "Files edited", "Partial", "Completed"];
  return [...new Set(labels)].sort((a, b) => {
    const aIndex = priority.indexOf(a);
    const bIndex = priority.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex) || a.localeCompare(b);
  });
}

function MiniStat({ label, value, help }: { label: string; value: React.ReactNode; help?: React.ReactNode }) {
  return (
    <div className="border border-line bg-white p-3">
      <div className="mini-stat-label">{label}{help}</div>
      <div className="mt-1 font-semibold">{value}</div>
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

function importantCommandFailures(session: Session): number {
  return session.importantCommandFailures ?? session.failedToolCallCount ?? 0;
}

function sessionDisplayTitle(session: Session): string {
  const explicitTitle = session.title?.trim();
  if (explicitTitle) return explicitTitle;
  const firstPrompt = session.promptTimeline?.find((item) => item.role === "user" && item.text.trim())?.text.trim();
  if (firstPrompt) return truncateText(firstPrompt.replace(/\s+/g, " "), 120);
  return `Session ${session.id.slice(0, 8)}`;
}

function polishCostLanguage(value: string): string {
  return value
    .replace(/\bSpend is concentrated\b/g, "Estimated API-equivalent cost is concentrated")
    .replace(/\bspend is concentrated\b/g, "estimated API-equivalent cost is concentrated")
    .replace(/\bSpend\b/g, "Estimated API-equivalent cost")
    .replace(/\bspend\b/g, "estimated API-equivalent cost")
    .replace(/\bspent\b/g, "estimated");
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function sessionNeedsCommandReview(session: Session): boolean {
  const important = importantCommandFailures(session);
  const nonZero = session.nonZeroCommandEvents ?? important;
  const commandCount = session.shellCommandCount ?? 0;
  const nonZeroRate = commandCount > 0 ? nonZero / commandCount : 0;
  return important > 0
    || (session.repeatedFailureClusters ?? 0) > 0
    || (commandCount >= 4 && nonZeroRate >= 0.5)
    || (session.totalTokens >= 1_000_000 && nonZero > 0)
    || ((session.sessionOutcome === "partial" || session.sessionOutcome === "failed") && nonZero > 0);
}

function issueImpactLabel(impact: Session["commandIssueImpact"] | undefined): string {
  if (impact === "high") return "High";
  if (impact === "medium") return "Medium";
  if (impact === "low") return "Low";
  return "None";
}

function rtkHookLabel(status: RtkGain["rtkCodexHookStatus"]): string {
  if (status === "active") return "Active";
  if (status === "not_detected") return "Not detected";
  return "Unknown";
}

function failureTypeLabel(type: string | undefined): string {
  if (!type) return "None";
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function strongerImpact(current: Session["commandIssueImpact"] | undefined, next: Session["commandIssueImpact"] | undefined): Session["commandIssueImpact"] {
  const order = { none: 0, low: 1, medium: 2, high: 3 };
  const currentValue = order[current ?? "none"];
  const nextValue = order[next ?? "none"];
  return nextValue > currentValue ? (next ?? "none") : (current ?? "none");
}

function dominantFailureType(current: string | undefined, next: string | undefined): string | undefined {
  if (!current) return next;
  if (!next) return current;
  return current;
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

async function clearLocalData(): Promise<{ path: string; removed: boolean }> {
  const response = await fetch("/api/settings/local-data", { method: "DELETE" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<{ path: string; removed: boolean }>;
}

function repoRows(data: ApiData): RepoRow[] {
  return data.repos.map((repo) => ({
    ...repo,
    sessions: repo.sessions ?? data.sessions.filter((session) => session.repoRoot === repo.id),
    fileEditCount: repo.fileEditCount ?? 0,
    failedCommandCount: repo.failedCommandCount ?? 0,
    tokenRoiLabel: repo.tokenRoiLabel ?? "No edits",
    tokenRoiTitle: repo.tokenRoiTitle ?? "Tokens per edit cannot be computed because no file edits were detected for this repo.",
  }));
}

function repoRowsFromGroup(repo: UsageGroup, sessions: Session[]): RepoRow {
  const fileEditCount = sessions.reduce((sum, session) => sum + (session.fileEditCount ?? 0), 0);
  const failedCommandCount = sessions.reduce((sum, session) => sum + importantCommandFailures(session), 0);
  const tokensPerEdit = fileEditCount > 0 ? Math.round(repo.totalTokens / fileEditCount) : undefined;
  const warnings = [...new Set([...repo.warnings, ...sessions.flatMap((session) => session.warnings), ...repoProductWarnings(repo, sessions)])];
  return {
    ...repo,
    warnings,
    fileEditCount,
    failedCommandCount,
    tokenRoiLabel: tokensPerEdit === undefined ? "No edits" : `${tokens(tokensPerEdit)} / edit`,
    tokenRoiTitle: tokensPerEdit === undefined
      ? "Tokens per edit cannot be computed because no file edits were detected for this repo."
      : "Tokens per edit estimates how much token volume was used for each detected file edit. Lower is usually more efficient.",
  };
}

function repoCostConcentration(repo: RepoRow, sessions: Session[]): RepoCostConcentration {
  const knownCostSessions = topSessions(sessions.filter((session) => session.estimatedCostUsd !== undefined), true);
  const totalCost = repo.estimatedCostUsd ?? knownCostSessions.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0);
  const topSessionCost = knownCostSessions[0]?.estimatedCostUsd;
  const topThree = knownCostSessions.slice(0, 3);
  const topThreeCostValue = topThree.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0);
  const topSessionShare = totalCost > 0 && topSessionCost !== undefined ? topSessionCost / totalCost : 0;
  const topThreeShare = totalCost > 0 ? topThreeCostValue / totalCost : 0;
  return {
    topSessionCost,
    topSessionShare,
    topThreeCost: topThree.length ? Number(topThreeCostValue.toFixed(6)) : undefined,
    topThreeShare,
    topSessions: knownCostSessions.length ? topThree : topSessions(sessions, false).slice(0, 3),
    extreme: topSessionShare >= 0.5,
  };
}

function topSessionsToReview(sessions: Session[], repo: RepoRow): RepoReviewSession[] {
  const picks = new Map<string, RepoReviewSession>();
  const add = (session: Session | undefined, reason: string) => {
    if (!session) return;
    const existing = picks.get(session.id);
    picks.set(session.id, { session, reason: existing ? `${existing.reason}; ${reason.toLowerCase()}` : reason });
  };
  const costSorted = topSessions(sessions, sessions.some((session) => session.estimatedCostUsd !== undefined));
  add(costSorted[0], "Highest estimated cost");
  add([...sessions].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))[0], "Longest duration");
  add(sessions.find((session) => session.sessionOutcome === "partial" || session.sessionOutcome === "failed"), "Partial or failed outcome");
  add([...sessions].sort((a, b) => importantCommandFailures(b) - importantCommandFailures(a))[0], "Command issues");
  const tokenOutlier = [...sessions].sort((a, b) => b.totalTokens - a.totalTokens)[0];
  if (tokenOutlier && isTokenOutlier(tokenOutlier, sessions)) add(tokenOutlier, "Unusual token volume");
  return [...picks.values()]
    .filter(({ session }) => session.totalTokens > 0 || session.estimatedCostUsd !== undefined || session.durationMs !== undefined || sessionNeedsCommandReview(session))
    .sort((a, b) => reviewReasonPriority(a.reason) - reviewReasonPriority(b.reason) || nullableNumber(b.session.estimatedCostUsd) - nullableNumber(a.session.estimatedCostUsd))
    .slice(0, Math.min(6, Math.max(repo.sessionCount, 0)));
}

function reviewReasonPriority(reason: string): number {
  if (reason.includes("Highest")) return 0;
  if (reason.includes("Command")) return 1;
  if (reason.includes("Partial")) return 2;
  if (reason.includes("Unusual")) return 3;
  return 4;
}

function isTokenOutlier(session: Session, sessions: Session[]): boolean {
  if (session.totalTokens >= 1_000_000) return true;
  const average = sessions.length ? sessions.reduce((sum, item) => sum + item.totalTokens, 0) / sessions.length : 0;
  return average > 0 && session.totalTokens >= average * 2.5;
}

function repoModelBreakdown(sessions: Session[], repo: RepoRow): RepoModelSpend[] {
  const rows = new Map<string, RepoModelSpend>();
  const totalCost = repo.estimatedCostUsd ?? sessions.reduce((sum, session) => sum + (session.estimatedCostUsd ?? 0), 0);
  for (const session of sessions) {
    const id = session.model ?? "Unknown model";
    const row = rows.get(id) ?? { id, label: id, sessionCount: 0, totalTokens: 0, estimatedCostUsd: undefined, costShare: 0 };
    row.sessionCount += 1;
    row.totalTokens += session.totalTokens;
    if (session.estimatedCostUsd !== undefined) row.estimatedCostUsd = Number(((row.estimatedCostUsd ?? 0) + session.estimatedCostUsd).toFixed(6));
    rows.set(id, row);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, costShare: totalCost > 0 && row.estimatedCostUsd !== undefined ? row.estimatedCostUsd / totalCost : 0 }))
    .sort((a, b) => nullableNumber(b.estimatedCostUsd) - nullableNumber(a.estimatedCostUsd) || b.totalTokens - a.totalTokens);
}

function repoDailyBreakdown(sessions: Session[]): Array<{ id: string; label: string; estimatedCostUsd: number; totalTokens: number }> {
  const rows = new Map<string, { id: string; label: string; estimatedCostUsd: number; totalTokens: number }>();
  for (const session of sessions) {
    const id = (session.startedAt ?? session.endedAt ?? "Unknown").slice(0, 10);
    const row = rows.get(id) ?? { id, label: id, estimatedCostUsd: 0, totalTokens: 0 };
    row.estimatedCostUsd += session.estimatedCostUsd ?? 0;
    row.totalTokens += session.totalTokens;
    rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id)).map((row) => ({ ...row, estimatedCostUsd: Number(row.estimatedCostUsd.toFixed(6)) }));
}

function repoCommandTotals(sessions: Session[]): RepoCommandTotals {
  return {
    important: sessions.reduce((sum, session) => sum + importantCommandFailures(session), 0),
    harmless: sessions.reduce((sum, session) => sum + (session.harmlessNonZeroEvents ?? 0) + (session.exploratoryMisses ?? 0), 0),
    repeated: sessions.reduce((sum, session) => sum + (session.repeatedFailureClusters ?? 0), 0),
  };
}

function repoDiagnosisSentence(repo: RepoRow, sessions: Session[], concentration: RepoCostConcentration, topModel: RepoModelSpend | undefined): string {
  const parts: string[] = [];
  if (concentration.extreme) {
    parts.push("Most estimated API-equivalent cost came from one expensive session");
  } else if (topModel) {
    parts.push(`Most estimated API-equivalent cost is driven by ${topModel.label}`);
  } else {
    parts.push("Estimated API-equivalent cost is spread across the loaded sessions");
  }
  if (topModel && concentration.extreme) parts.push(`running ${topModel.label}`);
  const commandText = repo.failedCommandCount > 0 ? `${count(repo.failedCommandCount, "important command issue")} were detected` : "No important command issues were detected";
  const fileText = repo.fileEditCount > 0
    ? "File path analysis is limited because this log format may not include stable file paths"
    : "No file edits were detected in this filtered view";
  if (!sessions.length) return "No sessions matched this repository in the current filters.";
  return `${parts.join(" ")}. ${commandText}. ${fileText}.`;
}

function tokenIntensityInterpretation(repo: RepoRow): string {
  if (repo.fileEditCount <= 0) return "No file edits detected";
  const value = repo.totalTokens / repo.fileEditCount;
  if (value >= 1_000_000) return "High token use per file edit";
  if (value <= 100_000) return "Low token use per file edit";
  return "Moderate token use per file edit";
}

function repoCostDriverExplanation(repo: RepoRow, topModel: RepoModelSpend | undefined): string {
  if (repo.estimatedCostUsd === undefined) return "API-equivalent cost is unavailable because this repo is missing pricing coverage or token splits.";
  if (topModel && topModel.costShare >= 0.5) {
    return `${topModel.label} is the main cost driver at ${money(topModel.estimatedCostUsd)} across ${count(topModel.sessionCount, "session")}, representing ${percent(topModel.costShare)} of known repo cost.`;
  }
  const dominantToken = [
    { label: "input", value: repo.inputTokens },
    { label: "cached input", value: repo.cachedInputTokens },
    { label: "output", value: repo.outputTokens },
    { label: "reasoning", value: repo.reasoningTokens },
  ].sort((a, b) => b.value - a.value)[0] ?? { label: "tokens", value: repo.totalTokens };
  return `No single model dominates known cost. The largest token bucket is ${dominantToken.label} at ${tokens(dominantToken.value)}.`;
}

function agentFrictionRepos(sessions: Session[]): AgentFrictionRepo[] {
  const groups = new Map<string, AgentFrictionRepo>();
  for (const session of sessions) {
    const importantFailures = importantCommandFailures(session);
    const harmlessNonZeroEvents = (session.harmlessNonZeroEvents ?? 0) + (session.exploratoryMisses ?? 0);
    const repeatedFailureClusters = session.repeatedFailureClusters ?? 0;
    if (importantFailures === 0 && harmlessNonZeroEvents === 0 && repeatedFailureClusters === 0) continue;
    const existing = groups.get(session.repoRoot) ?? {
      repoRoot: session.repoRoot,
      repoName: session.repoName,
      importantFailures: 0,
      harmlessNonZeroEvents: 0,
      repeatedFailureClusters: 0,
      sessionsNeedingReview: 0,
      topFailureType: undefined,
      impact: "none",
      totalTokens: 0,
      estimatedCostUsd: undefined,
    };
    existing.importantFailures += importantFailures;
    existing.harmlessNonZeroEvents += harmlessNonZeroEvents;
    existing.repeatedFailureClusters += repeatedFailureClusters;
    existing.sessionsNeedingReview += sessionNeedsCommandReview(session) ? 1 : 0;
    existing.totalTokens += session.totalTokens;
    existing.topFailureType = dominantFailureType(existing.topFailureType, session.topFailureType);
    existing.impact = strongerImpact(existing.impact, session.commandIssueImpact);
    if (session.estimatedCostUsd !== undefined) {
      existing.estimatedCostUsd = Number(((existing.estimatedCostUsd ?? 0) + session.estimatedCostUsd).toFixed(6));
    }
    groups.set(session.repoRoot, existing);
  }
  return [...groups.values()].sort((a, b) => b.importantFailures - a.importantFailures || b.repeatedFailureClusters - a.repeatedFailureClusters || b.totalTokens - a.totalTokens);
}

function repoProductWarnings(repo: UsageGroup, sessions: Session[]): string[] {
  const warnings: string[] = [];
  if (sessions.some((session) => (session.fileEditCount ?? 0) === 0 && session.totalTokens >= 1_000_000)) warnings.push("high-token no-edit");
  if (sessions.some((session) => importantCommandFailures(session) > 0)) warnings.push("command issues");
  if (repo.estimatedCostUsd === undefined && repo.totalTokens > 0) warnings.push("unknown pricing");
  if (repo.inputTokens > 0 && repo.cachedInputTokens / repo.inputTokens < 0.1) warnings.push("low cache rate");
  return warnings;
}

function sessionBadges(session: Session): string[] {
  const badges: string[] = [];
  const outcome = outcomeLabel(session.sessionOutcome);
  if (importantCommandFailures(session) > 0) badges.push("Command issue");
  if (session.totalTokens >= 1_000_000) badges.push("High token");
  if ((session.fileEditCount ?? 0) === 0 && outcome !== "No edits") badges.push("No edits");
  if (session.warnings.includes("repo_unverified_no_git_root")) badges.push("Unknown repo");
  if ((session.detectedSurface ?? "unknown") === "unknown") badges.push("Unknown surface");
  if ((session.fileEditCount ?? 0) > 0) badges.push("Files edited");
  badges.push(outcome);
  if (session.estimatedCostUsd === undefined && session.totalTokens > 0) badges.push("Unknown pricing");
  if (session.warnings.includes("missing_token_breakdown")) badges.push("Unknown tokens");
  return [...new Set(badges)].filter((badge) => badge && badge !== "Unknown");
}

function readableWarning(warning: string): string {
  const normalized = warning.toLowerCase();
  if (normalized === "expensive_session_concentration") return "Cost concentration is very high. One session accounts for most of this repo’s estimated cost.";
  if (normalized === "failed commands" || normalized === "command issues") return "Important command issues were detected in this repo.";
  if (normalized === "repo_unverified_no_git_root") return "Repo grouping is unverified because no Git root was detected.";
  if (normalized === "unknown_pricing") return "Some sessions cannot be priced because token splits or pricing coverage are missing.";
  if (normalized === "missing_token_breakdown") return "Some sessions are missing detailed token breakdowns.";
  if (normalized === "low_cache_rate") return "Cache reuse is low, so input tokens may be driving more estimated cost.";
  if (normalized === "output_heavy_sessions") return "Output tokens are unusually high compared with total token volume.";
  if (normalized === "high-token no-edit") return "A high-token session had no detected file edits.";
  return warning.replaceAll("_", " ");
}

function pricingRows(draft: Record<string, ModelPricing>, models: UsageGroup[]): PricingRow[] {
  const usedModels = models.map((model) => model.id).filter((model) => model !== "unknown-model");
  const modelNames = [...new Set([...usedModels, ...Object.keys(draft).sort()])];
  return modelNames.map((model) => ({ model, ...resolvePricingForModel(model, draft) }));
}

function pricingProvider(model: string): "openai" | "claude" | "custom" {
  const normalized = model.toLowerCase();
  if (normalized.includes("claude")) return "claude";
  if (normalized.startsWith("gpt-") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4") || normalized.startsWith("codex") || normalized.includes("openai")) return "openai";
  return "custom";
}

function pricingMissing(row: PricingRow): boolean {
  const pricing = row.pricing;
  return !positiveRate(pricing.inputPerMillion) || !positiveRate(pricing.outputPerMillion);
}

function positiveRate(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolvePricingForModel(model: string, draft: Record<string, ModelPricing>): Omit<PricingRow, "model"> {
  const lower = model.toLowerCase();
  const exactModel = draft[model] ? model : draft[lower] ? lower : undefined;
  const exactPricing = exactModel ? draft[exactModel] : undefined;
  if (isUsableModelPricing(exactPricing)) {
    return { pricing: exactPricing, sourceModel: exactModel, inherited: false };
  }
  const familyModel = claudePricingFamily(lower, draft);
  if (familyModel) {
    return { pricing: draft[familyModel]!, sourceModel: familyModel, inherited: familyModel !== model && familyModel !== lower };
  }
  return {
    pricing: exactPricing ?? {
      inputPerMillion: 0,
      cacheCreationInputPerMillion: 0,
      cachedInputPerMillion: 0,
      outputPerMillion: 0,
      reasoningOutputPerMillion: 0,
    },
    sourceModel: exactModel,
    inherited: false,
  };
}

function claudePricingFamily(model: string, draft: Record<string, ModelPricing>): string | undefined {
  const families = [
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-opus-4-5",
    "claude-opus-4-1",
    "claude-opus-4",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-sonnet-4",
    "claude-haiku-4-5",
    "claude-3-5-haiku",
  ];
  return families.find((candidate) => (model === candidate || model.startsWith(`${candidate}-`)) && isUsableModelPricing(draft[candidate]));
}

function compactModelLabel(model: string): string {
  const normalized = model.toLowerCase();
  const claudeBase = [
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-opus-4-5",
    "claude-opus-4-1",
    "claude-opus-4",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-sonnet-4",
    "claude-haiku-4-5",
    "claude-3-5-haiku",
  ].find((candidate) => normalized === candidate || normalized.startsWith(`${candidate}-`));
  if (claudeBase) return claudeBase.replace("claude-", "").replace(/-/g, " ");
  return model.length > 24 ? `${model.slice(0, 21)}...` : model;
}

function isUsableModelPricing(pricing: ModelPricing | undefined): pricing is ModelPricing {
  return positiveRate(pricing?.inputPerMillion) && positiveRate(pricing?.outputPerMillion);
}

function sourceImportedSessions(data: ApiData, sourceId: "codex" | "claude"): number {
  return data.sourceStats
    .filter((source) => source.sourceId === sourceId)
    .reduce((sum, source) => sum + (source.sessionsImported ?? 0), 0);
}

function sourceHomePath(source: ApiData["sourceStats"][number]): string {
  return source.homePath ?? source.codexHome ?? source.claudeHome ?? "Unknown";
}

function sourcePrimaryDataFound(source: ApiData["sourceStats"][number]): boolean {
  return Boolean(source.stateExists || source.sessionsExists || source.projectsExists || source.historyExists);
}

function sourceDetectedPaths(source: ApiData["sourceStats"][number], data: ApiData): string[] {
  const statusPaths = data.sources.find((status) => status.id === source.sourceId)?.paths ?? [];
  const paths = [
    source.homePath,
    source.codexHome,
    source.claudeHome,
    source.statePath,
    source.sessionsPath,
    source.projectsPath,
    source.historyPath,
    ...statusPaths,
  ].filter((value): value is string => Boolean(value));
  return [...new Set(paths)];
}

function tokenStats(data: ApiData): TokenStats {
  const methodCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = {};
  let tokenSnapshots = 0;
  let sessionsWithTokenData = 0;
  for (const session of data.sessions) {
    const method = session.tokenAggregationMethod ?? "unknown";
    const confidence = session.tokenConfidence ?? "low";
    methodCounts[method] = (methodCounts[method] ?? 0) + 1;
    confidenceCounts[confidence] = (confidenceCounts[confidence] ?? 0) + 1;
    tokenSnapshots += session.tokenSnapshotCount ?? 0;
    if (session.totalTokens > 0) sessionsWithTokenData += 1;
  }
  const topMethod = topEntry(methodCounts)?.[0] ?? "unknown";
  const topConfidence = topEntry(confidenceCounts)?.[0] ?? "low";
  return {
    methodLabel: aggregationMethodLabel(topMethod),
    confidenceLabel: confidenceLabel(topConfidence),
    tokenSnapshots,
    sessionsWithTokenData,
    sessionsMissingTokenData: Math.max(data.scan.rawSessionCount - sessionsWithTokenData, 0),
    methodCounts,
    confidenceCounts,
  };
}

function usageBreakdownRows(data: ApiData, tab: BreakdownTab): BreakdownRow[] {
  if (tab === "apps") return usageByApp(data);
  return usageBySource(data);
}

function usageBySource(data: ApiData): BreakdownRow[] {
  const labels = new Map(data.sources.map((source) => [source.id, source.label]));
  const rows = new Map<string, BreakdownRow>();
  for (const source of data.sources) {
    rows.set(source.id, { id: source.id, label: source.label, source: source.id, sessionCount: 0, totalTokens: 0, estimatedCostUsd: undefined, missingTokenSessions: 0 });
  }
  for (const session of data.sessions) {
    const row = rows.get(session.sourceClient) ?? {
      id: session.sourceClient,
      label: labels.get(session.sourceClient) ?? sourceLabel(session.sourceClient),
      source: session.sourceClient,
      sessionCount: 0,
      totalTokens: 0,
      estimatedCostUsd: undefined,
      missingTokenSessions: 0,
    };
    row.sessionCount += 1;
    row.totalTokens += session.totalTokens;
    row.missingTokenSessions += session.totalTokens > 0 ? 0 : 1;
    if (session.estimatedCostUsd !== undefined) row.estimatedCostUsd = Number(((row.estimatedCostUsd ?? 0) + session.estimatedCostUsd).toFixed(6));
    rows.set(session.sourceClient, row);
  }
  return [...rows.values()];
}

function usageByApp(data: ApiData): BreakdownRow[] {
  return groupSessionsForBreakdown(data.sessions, (session) => session.sourceApp || surfaceLabel(session.detectedSurface), (session) => session.sourceApp || surfaceLabel(session.detectedSurface));
}

function groupSessionsForBreakdown(sessions: Session[], keyFn: (session: Session) => string, labelFn: (session: Session) => string, iconLabelFn = labelFn): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const session of sessions) {
    const id = keyFn(session);
    const row = rows.get(id) ?? {
      id,
      label: labelFn(session),
      iconLabel: iconLabelFn(session),
      sessionCount: 0,
      totalTokens: 0,
      estimatedCostUsd: undefined,
      missingTokenSessions: 0,
    };
    row.sessionCount += 1;
    row.totalTokens += session.totalTokens;
    row.missingTokenSessions += session.totalTokens > 0 ? 0 : 1;
    if (session.estimatedCostUsd !== undefined) row.estimatedCostUsd = Number(((row.estimatedCostUsd ?? 0) + session.estimatedCostUsd).toFixed(6));
    rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.label.localeCompare(b.label));
}

function topEntry(record: Record<string, number>): [string, number] | undefined {
  return Object.entries(record).sort((a, b) => b[1] - a[1])[0];
}

function aggregationMethodLabel(method: string): string {
  if (method === "final_snapshot") return "Final checkpoint";
  if (method === "delta_sum") return "Delta sum";
  if (method === "direct_usage") return "Direct usage";
  if (method === "estimated") return "Estimated";
  return "Unknown";
}

function confidenceLabel(confidence: string): string {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  return "Low";
}

function cacheRate(repo: UsageGroup): number {
  return repo.inputTokens > 0 ? repo.cachedInputTokens / repo.inputTokens : 0;
}

function sortRepoRows(repos: RepoRow[], sort: { key: RepoSortKey; direction: SortDirection }): RepoRow[] {
  return [...repos].sort((a, b) => applyDirection(compareRepo(a, b, sort.key), sort.direction));
}

function compareRepo(a: RepoRow, b: RepoRow, key: RepoSortKey): number {
  if (key === "repo") return a.label.localeCompare(b.label);
  if (key === "cost") return nullableNumber(a.estimatedCostUsd) - nullableNumber(b.estimatedCostUsd);
  if (key === "tokens") return a.totalTokens - b.totalTokens;
  if (key === "input") return a.inputTokens - b.inputTokens;
  if (key === "cached") return a.cachedInputTokens - b.cachedInputTokens;
  if (key === "output") return a.outputTokens - b.outputTokens;
  if (key === "reasoning") return a.reasoningTokens - b.reasoningTokens;
  if (key === "sessions") return a.sessionCount - b.sessionCount;
  if (key === "files") return a.fileEditCount - b.fileEditCount;
  if (key === "failed") return a.failedCommandCount - b.failedCommandCount;
  if (key === "roi") return tokenRoiSortValue(a) - tokenRoiSortValue(b);
  if (key === "warnings") return a.warnings.length - b.warnings.length;
  return cacheRate(a) - cacheRate(b);
}

function tokenRoiSortValue(repo: RepoRow): number {
  if (repo.fileEditCount === 0) return Number.POSITIVE_INFINITY;
  return repo.totalTokens / repo.fileEditCount;
}

function sortSessionRows(sessions: Session[], sort: { key: SessionSortKey; direction: SortDirection }): Session[] {
  return [...sessions].sort((a, b) => applyDirection(compareSession(a, b, sort.key), sort.direction));
}

function compareSession(a: Session, b: Session, key: SessionSortKey): number {
  if (key === "repo") return a.repoName.localeCompare(b.repoName);
  if (key === "app") return `${sourceLabel(a.sourceClient)} ${a.sourceApp}`.localeCompare(`${sourceLabel(b.sourceClient)} ${b.sourceApp}`);
  if (key === "session") return (a.title ?? a.id).localeCompare(b.title ?? b.id);
  if (key === "model") return (a.model ?? "Unknown").localeCompare(b.model ?? "Unknown");
  if (key === "started") return (a.startedAt ?? "").localeCompare(b.startedAt ?? "");
  if (key === "cost") return nullableNumber(a.estimatedCostUsd) - nullableNumber(b.estimatedCostUsd);
  if (key === "tokens") return a.totalTokens - b.totalTokens;
  if (key === "input") return a.inputTokens - b.inputTokens;
  if (key === "cached") return a.cachedInputTokens - b.cachedInputTokens;
  if (key === "output") return a.outputTokens - b.outputTokens;
  if (key === "reasoning") return a.reasoningTokens - b.reasoningTokens;
  if (key === "duration") return (a.durationMs ?? 0) - (b.durationMs ?? 0);
  if (key === "prompts") return (a.userPromptCount ?? 0) - (b.userPromptCount ?? 0);
  if (key === "commands") return (a.shellCommandCount ?? 0) - (b.shellCommandCount ?? 0);
  if (key === "files") return (a.fileEditCount ?? 0) - (b.fileEditCount ?? 0);
  if (key === "failed") return importantCommandFailures(a) - importantCommandFailures(b);
  if (key === "warnings") return a.warnings.length - b.warnings.length;
  return a.messageCount - b.messageCount;
}

function sessionMatchesSearch(session: Session, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    session.title,
    session.id,
    session.repoName,
    session.sourceApp,
    surfaceLabel(session.detectedSurface),
    session.model,
    outcomeLabel(session.sessionOutcome),
    ...session.warnings.map(readableWarning),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

function sessionMatchesQuickFilter(session: Session, filter: QuickSessionFilter | ""): boolean {
  if (!filter) return true;
  if (filter === "highToken") return session.totalTokens >= 1_000_000;
  if (filter === "failedCommands") return importantCommandFailures(session) > 0;
  if (filter === "noEdits") return (session.fileEditCount ?? 0) === 0;
  if (filter === "completed") return session.sessionOutcome === "completed";
  if (filter === "partial") return session.sessionOutcome === "partial";
  if (filter === "vscode") return session.detectedSurface === "vscode_extension" || session.sourceApp.toLowerCase().includes("vs code");
  if (filter === "terminal") return session.detectedSurface === "terminal_cli" || session.sourceApp.toLowerCase().includes("terminal");
  return (session.detectedSurface ?? "unknown") === "unknown";
}

function sessionMatchesRepoQuickFilter(session: Session, filter: RepoSessionQuickFilter | "", sessions: Session[]): boolean {
  if (!filter) return true;
  if (filter === "expensive") return isCostOutlier(session, sessionCostOutlierThreshold(sessions));
  if (filter === "partial") return session.sessionOutcome === "partial" || session.sessionOutcome === "failed";
  if (filter === "longRunning") return isLongRunningSession(session, sessions);
  if (filter === "commandIssues") return importantCommandFailures(session) > 0 || (session.repeatedFailureClusters ?? 0) > 0;
  return (session.model ?? "").toLowerCase().includes("opus");
}

function sessionCostOutlierThreshold(sessions: Session[]): number | undefined {
  const costs = sessions.map((session) => session.estimatedCostUsd).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  if (costs.length < 3) return costs.at(-1);
  const average = costs.reduce((sum, value) => sum + value, 0) / costs.length;
  return Math.max(average * 2, costs[Math.floor(costs.length * 0.75)] ?? average);
}

function isCostOutlier(session: Session, threshold: number | undefined): boolean {
  return threshold !== undefined && session.estimatedCostUsd !== undefined && session.estimatedCostUsd >= threshold && session.estimatedCostUsd > 0;
}

function isLongRunningSession(session: Session, sessions: Session[]): boolean {
  const durations = sessions.map((item) => item.durationMs ?? 0).filter((value) => value > 0);
  if (!session.durationMs || !durations.length) return false;
  const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return session.durationMs >= Math.max(60 * 60_000, average * 1.75);
}

function insightSeverity(item: InsightItem): "Info" | "Warning" | "Critical" {
  if (item.critical) return "Critical";
  if (item.tone === "attention") return "Warning";
  return "Info";
}

function applyDirection(value: number, direction: SortDirection): number {
  return direction === "asc" ? value : -value;
}

function nullableNumber(value: number | undefined): number {
  return value ?? Number.NEGATIVE_INFINITY;
}

function usePagination<T>(items: T[], pageSize: number): { page: number; pageCount: number; items: T[]; setPage: (page: number) => void } {
  const safePageSize = Math.max(1, pageSize);
  const [page, setPageState] = React.useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  React.useEffect(() => {
    setPageState(1);
  }, [items.length, safePageSize]);
  const setPage = React.useCallback((nextPage: number) => {
    setPageState(Math.min(Math.max(1, nextPage), pageCount));
  }, [pageCount]);
  const safePage = Math.min(page, pageCount);
  return {
    page: safePage,
    pageCount,
    items: items.slice((safePage - 1) * safePageSize, safePage * safePageSize),
    setPage,
  };
}

function topSessions(sessions: Session[], hasKnownCost: boolean): Session[] {
  return [...sessions].sort((a, b) => (hasKnownCost ? nullableNumber(b.estimatedCostUsd) - nullableNumber(a.estimatedCostUsd) : b.totalTokens - a.totalTokens));
}

function recentSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => (b.startedAt ?? b.endedAt ?? "").localeCompare(a.startedAt ?? a.endedAt ?? ""));
}

function findSessionById(data: ApiData, sessionId: string | null): Session | undefined {
  if (!sessionId) return undefined;
  return data.sessions.find((session) => session.id === sessionId);
}

function parseTokenAmount(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.replaceAll(",", "").match(/([\d.]+)\s*([kmb])?/i);
  if (!match?.[1]) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === "b" ? 1_000_000_000 : unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1;
  return Math.round(base * multiplier);
}

function parseDurationAmount(value?: string): number {
  if (!value) return 0;
  const normalized = value.trim().toLowerCase();
  const minutesSeconds = normalized.match(/([\d.]+)m(?:(\d+(?:\.\d+)?)s)?/);
  if (minutesSeconds?.[1]) {
    return Number(minutesSeconds[1]) * 60_000 + Number(minutesSeconds[2] ?? 0) * 1000;
  }
  const match = normalized.match(/([\d.]+)\s*(ms|s|m|h)?/);
  if (!match?.[1]) return 0;
  const base = Number(match[1]);
  const unit = match[2] ?? "ms";
  if (unit === "h") return base * 3_600_000;
  if (unit === "m") return base * 60_000;
  if (unit === "s") return base * 1000;
  return base;
}

function rtkAvoidedCostRate(pricing: PricingResponse): number {
  return pricing.models["gpt-5.5"]?.inputPerMillion ?? pricing.models["gpt-5"]?.inputPerMillion ?? Object.values(pricing.models)[0]?.inputPerMillion ?? 5;
}

function estimateAvoidedCostUsd(tokensAvoided: number | undefined, pricing: PricingResponse): number | undefined {
  if (tokensAvoided === undefined) return undefined;
  return Number(((tokensAvoided / 1_000_000) * rtkAvoidedCostRate(pricing)).toFixed(6));
}

function readableCommandName(command: string): string {
  return command.replace(/\s+/g, " ").trim();
}

function shortCommand(command: string): string {
  const readable = readableCommandName(command);
  return readable.length > 96 ? `${readable.slice(0, 96)}...` : readable;
}

function readableIssueLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sortedRtkCommands(commands: RtkCommand[], sort: { key: RtkCommandSortKey; direction: SortDirection }): RtkCommand[] {
  return [...commands].sort((a, b) => {
    let value = 0;
    if (sort.key === "command") value = a.command.localeCompare(b.command);
    if (sort.key === "count") value = (a.count ?? 0) - (b.count ?? 0);
    if (sort.key === "saved") value = (parseTokenAmount(a.saved) ?? 0) - (parseTokenAmount(b.saved) ?? 0);
    if (sort.key === "reduction") value = (a.averageSavedPercent ?? -1) - (b.averageSavedPercent ?? -1);
    if (sort.key === "runtime") value = parseDurationAmount(a.time) - parseDurationAmount(b.time);
    return sort.direction === "asc" ? value : -value;
  });
}

function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function parseRecentRtkCommand(line: string): { time?: string; command: string; savings?: string } {
  const [time, rest = line] = line.split("•").map((part) => part.trim());
  const savings = rest.match(/(-?\d+(?:\.\d+)?%\s*\([^)]+\))$/)?.[1];
  const command = savings ? rest.slice(0, -savings.length).trim() : rest;
  return {
    ...(time && time !== rest ? { time } : {}),
    command: readableCommandName(command),
    ...(savings ? { savings } : {}),
  };
}

function rtkRecommendedActions({
  gain,
  topCommand,
  commandsProcessed,
  savingsRate,
  coverageGaps,
}: {
  gain: RtkGain;
  topCommand: RtkCommand | undefined;
  commandsProcessed: number | undefined;
  savingsRate: number | undefined;
  coverageGaps: RtkCoverageGap[];
}): string[] {
  const actions: string[] = [];
  const topGap = [...coverageGaps].sort((a, b) => (parseTokenAmount(b.estimatedSavings) ?? 0) - (parseTokenAmount(a.estimatedSavings) ?? 0))[0];
  if (topGap) {
    actions.push(`${topGap.command} is the biggest discovered coverage gap; use ${topGap.rtkEquivalent ?? "the matching RTK wrapper"} when possible.`);
  } else if (gain.rtkDiscoverAvailable === false) {
    actions.push("Coverage discovery could not run locally, so RepoSpend can only show RTK gain data for now.");
  }
  if (gain.rtkCodexHookStatus === "unknown" || gain.rtkCodexHookStatus === undefined) {
    actions.push("Codex hook status is unknown; check RTK hook setup if Codex commands are not being compressed.");
  }
  if (topCommand?.count && topCommand.count >= 25) {
    actions.push(`${readableCommandName(topCommand.command)} appears often; review whether agents are repeating that command more than needed.`);
  }
  if (commandsProcessed && savingsRate !== undefined && savingsRate >= 50) {
    actions.push("RTK savings are high, so your local command proxy setup appears to be working well.");
  }
  return actions;
}

function sessionPositiveSignals(session: Session): string[] {
  const items: string[] = [];
  if ((session.fileEditCount ?? 0) > 0) items.push(`${count(session.fileEditCount ?? 0, "file edit")} detected.`);
  if (importantCommandFailures(session) === 0) items.push("No important command issues detected.");
  if (session.parseStatus === "ok") items.push("Local session log parsed cleanly.");
  if (session.tokenConfidence === "high") items.push("Token counting confidence is high.");
  if (session.inputTokens > 0 && session.cachedInputTokens / session.inputTokens >= 0.5) items.push("Cached input reuse was strong.");
  if (session.repoRoot && !session.repoRoot.includes("unverified")) items.push("Session resolved to a repository.");
  return items;
}

function sessionConcernSignals(session: Session): string[] {
  const items: string[] = [];
  const commandIssues = importantCommandFailures(session);
  if (commandIssues > 0) items.push(`${count(commandIssues, "important command issue")} to inspect.`);
  if (session.sessionOutcome === "partial" || session.sessionOutcome === "failed") items.push(`Outcome is ${outcomeLabel(session.sessionOutcome).toLowerCase()}; check whether the work completed.`);
  if ((session.fileEditCount ?? 0) === 0 && session.totalTokens > 1_000_000) items.push("High-token session with no detected file edits.");
  if (session.estimatedCostUsd === undefined && session.totalTokens > 0) items.push("API-equivalent cost unavailable because pricing or token split is missing.");
  if (session.parseStatus && session.parseStatus !== "ok") items.push("Parser reported issues for this session.");
  if (session.detectedSurface === "unknown") items.push("Surface could not be detected from local logs.");
  if (session.repoName.toLowerCase().includes("unknown") || session.warnings.includes("repo_unverified_no_git_root")) items.push("Repo grouping is unverified because no Git root was detected.");
  if ((session.tokenSnapshotCount ?? 0) === 0 && session.totalTokens === 0) items.push("No token checkpoints were available.");
  return items;
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
