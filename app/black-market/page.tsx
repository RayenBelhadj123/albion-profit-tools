"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { Activity, ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ChevronsUpDown, Copy, Plus, Search, Square, X } from "lucide-react";

import { ScannerSession } from "@/lib/market/scanner-session";
import { defaultSortDirection, meetsScannerThresholds, rankProgressiveOpportunities, type Opportunity, type SortDirection, type SortKey } from "@/lib/market/scanner-view";
import { repriceMarketOpportunity } from "@/lib/transport/reprice-market-opportunity";
import { AlbionItemIcon } from "@/app/components/albion-item-icon";
import { getMarketFeeRates, type MarketSaleMethod } from "@/lib/market/fees";
import { LiveCoverageQueue, replaceScannedOpportunities, type CoverageJob, type RollingCoverageProgress } from "@/lib/market/live-coverage-queue";

type FlipsResponse = {
  opportunities: Opportunity[];
  scannedAt: string;
  scannedItems: number;
  scannedMarkets: number;
  evaluatedRoutes: number;
  freshPriceRows: number;
  fallbackPriceRows?: number;
  estimatedPriceRows?: number;
  missingPriceRows?: number;
  cachedAt?: string;
  restoredFromCache?: boolean;
  rollingCoverage?: RollingCoverageProgress & { itemIds: string[] };
};

type CatalogSummary = { count: number; categories: string[] };
type ItemSearchResult = { id: string; name: string | null; tier: number | null; enchantment: number; category: string };
type AlbionServer = "EUROPE" | "AMERICAS" | "ASIA";
type RoyalCity = "BRIDGEWATCH" | "CAERLEON" | "FORT_STERLING" | "LYMHURST" | "MARTLOCK" | "THETFORD";
type OriginCity = "ALL" | RoyalCity;
type DestinationCity = "BLACK_MARKET" | RoyalCity;
type ScanMode = "FULL" | "LAST_RESULTS" | "ROLLING";
type ItemQuality = "0" | "1" | "2" | "3" | "4" | "5";
const royalCityOptions: Array<{ value: RoyalCity; label: string }> = [
  { value: "BRIDGEWATCH", label: "Bridgewatch" },
  { value: "CAERLEON", label: "Caerleon" },
  { value: "FORT_STERLING", label: "Fort Sterling" },
  { value: "LYMHURST", label: "Lymhurst" },
  { value: "MARTLOCK", label: "Martlock" },
  { value: "THETFORD", label: "Thetford" },
];
const RESULTS_PER_PAGE = 100;
type LiveCoverageStatus = { completedItems: number; totalItems: number; completedPasses: number; message: string };
type ScanProgress = {
  phase: "combined";
  completedBatches: number;
  totalBatches: number;
  processedItems: number;
  totalItems: number;
  elapsedMilliseconds: number;
  cachedBatches: number;
  freshPriceRows: number;
  fallbackPriceRows: number;
  estimatedPriceRows: number;
  missingPriceRows: number;
};
type StreamEvent =
  | { type: "started"; scannedItems: number; scannedMarkets: number }
  | ({ type: "progress"; evaluatedRoutes: number; opportunities: Opportunity[] } & ScanProgress)
  | { type: "complete"; data: FlipsResponse }
  | { type: "error"; message: string };

export default function BlackMarketPage() {
  const [server, setServer] = useState<AlbionServer>("EUROPE");
  const [originCity, setOriginCity] = useState<OriginCity>("ALL");
  const [destinationCity, setDestinationCity] = useState<DestinationCity>("BLACK_MARKET");
  const [isPremium, setIsPremium] = useState(true);
  const [saleMethod, setSaleMethod] = useState<MarketSaleMethod>("FAST_SELL");
  const [quality, setQuality] = useState<ItemQuality>("1");
  const [itemIds, setItemIds] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemMatches, setItemMatches] = useState<ItemSearchResult[]>([]);
  const [category, setCategory] = useState("ALL");
  const [categories, setCategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("combined");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [maxSourceDataAgeMinutes, setMaxSourceDataAgeMinutes] = useState("60");
  const [maxDestinationDataAgeMinutes, setMaxDestinationDataAgeMinutes] = useState("1440");
  const [minimumProfit, setMinimumProfit] = useState("25000");
  const [minimumRoiPercent, setMinimumRoiPercent] = useState("20");
  const [showAllPriceMatches, setShowAllPriceMatches] = useState(false);
  const [catalogSize, setCatalogSize] = useState<number | null>(null);
  const marketKey = `${server}:${destinationCity}:${saleMethod}`;
  const [session] = useState(() => new ScannerSession<FlipsResponse>());
  const [storedData, setStoredData] = useState<{ key: string; value: FlipsResponse | null } | null>(null);
  const data = storedData?.key === marketKey ? storedData.value : null;
  const setData = useCallback((next: SetStateAction<FlipsResponse | null>) => {
    setStoredData((current) => ({ key: marketKey, value: typeof next === "function"
      ? next(current?.key === marketKey ? current.value : null) : next }));
  }, [marketKey]);
  const [restoringCoverage, setRestoringCoverage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [liveScan, setLiveScan] = useState(false);
  const [liveCoverageStatus, setLiveCoverageStatus] = useState<LiveCoverageStatus | null>(null);
  const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanOpportunitiesFound, setScanOpportunitiesFound] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const scanInProgress = useRef(false);
  const abortController = useRef<AbortController | null>(null);
  const automaticScanController = useRef<AbortController | null>(null);
  const completedData = useRef<FlipsResponse | null>(null);
  const scanOpportunityKeys = useRef(new Set<string>());
  const copyResetTimer = useRef<number | null>(null);

  const buildScanParams = useCallback(() => {
    const params = new URLSearchParams({
      server,
      sourceCity: "BRIDGEWATCH",
      destinationCity,
      allSources: "true",
      isPremium: "true",
      saleMethod,
      quality: "6",
      sortBy: "combined",
      maxSourceDataAgeMinutes: "10080",
      maxDestinationDataAgeMinutes: "10080",
      minimumRoiBasisPoints: "0",
      minimumProfitSilver: "0",
      showAllPriceMatches: "true",
    });
    return params;
  }, [destinationCity, saleMethod, server]);

  const scan = useCallback(async (mode: ScanMode = "FULL", job?: CoverageJob): Promise<FlipsResponse | null | undefined> => {
    const operation = session.begin("scan");
    if (!operation) return;
    scanInProgress.current = true;
    const controller = operation.controller;
    const accepts = () => session.accepts(operation);
    abortController.current = controller;
    if (job) automaticScanController.current = controller;
    let finishedResult: FlipsResponse | null = null;
    setRestoringCoverage(false);
    if (job) setBackgroundLoading(true);
    else setLoading(true);
    setProgress(null);
    scanOpportunityKeys.current.clear();
    setScanOpportunitiesFound(0);
    if (!job) {
      setNotice(null);
      setError(null);
    }
    try {
      const params = buildScanParams();
      const isFullCoverage = mode === "FULL" && !itemIds.trim();
      let requestedItemIds = itemIds.split(",").map((id) => id.trim()).filter(Boolean);
      if (requestedItemIds.length > 500 && !job) throw new Error("Select at most 500 items for a manual fast scan.");
      if (job?.kind === "ROLLING") {
        params.set("rollingCursor", job.cursor);
        requestedItemIds = [];
      } else if (job?.kind === "PRIORITY") {
        requestedItemIds = job.itemIds;
      }
      if (requestedItemIds.length) params.set("itemIds", requestedItemIds.join(","));
      if (mode === "LAST_RESULTS" && !requestedItemIds.length && !job) {
        const lastItemIds = Array.from(new Set(
          (completedData.current?.opportunities ?? []).map((opportunity) => opportunity.itemId),
        )).slice(0, 500);
        if (lastItemIds.length > 0) {
          requestedItemIds = lastItemIds;
          params.set("itemIds", lastItemIds.join(","));
          setNotice(`Adaptive refresh: checking ${lastItemIds.length.toLocaleString()} items from your saved coverage.`);
        }
      }
      params.set("stream", "true");
      const response = await fetch("/api/black-market-flips", {
        method: "POST",
        headers: {
          accept: "application/x-ndjson",
          "content-type": "application/json",
        },
        body: JSON.stringify(Object.fromEntries(params)),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const json = (await response.json()) as { error?: string };
        throw new Error(json.error ?? "Market scan failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let totalItems = 0;
      let scannedMarkets = 0;
      let completed = false;

      const handleEvent = (event: StreamEvent) => {
        if (!accepts()) return;
        if (event.type === "started") {
          totalItems = event.scannedItems;
          scannedMarkets = event.scannedMarkets;
          setProgress({ phase: "combined", completedBatches: 0, totalBatches: 0, processedItems: 0, totalItems, elapsedMilliseconds: 0, cachedBatches: 0, freshPriceRows: 0, fallbackPriceRows: 0, estimatedPriceRows: 0, missingPriceRows: 0 });
          setData((current) => current ?? {
            opportunities: [],
            scannedAt: new Date().toISOString(),
            scannedItems: totalItems,
            scannedMarkets,
            evaluatedRoutes: 0,
            freshPriceRows: 0,
            fallbackPriceRows: 0,
            estimatedPriceRows: 0,
            missingPriceRows: 0,
          });
          return;
        }
        if (event.type === "progress") {
          for (const opportunity of event.opportunities) {
            scanOpportunityKeys.current.add(`${opportunity.itemId}\u0000${opportunity.quality}\u0000${opportunity.sourceCity}\u0000${opportunity.destinationCity}`);
          }
          setScanOpportunitiesFound(scanOpportunityKeys.current.size);
          setProgress({
            phase: event.phase,
            completedBatches: event.completedBatches,
            totalBatches: event.totalBatches,
            processedItems: event.processedItems,
            totalItems: event.totalItems,
            elapsedMilliseconds: event.elapsedMilliseconds,
            cachedBatches: event.cachedBatches,
            freshPriceRows: event.freshPriceRows,
            fallbackPriceRows: event.fallbackPriceRows,
            estimatedPriceRows: event.estimatedPriceRows,
            missingPriceRows: event.missingPriceRows,
          });
          if (!completedData.current) {
            setData((current) => ({
              opportunities: mergeOpportunities(current?.opportunities ?? [], event.opportunities),
              scannedAt: current?.scannedAt ?? new Date().toISOString(),
              scannedItems: totalItems,
              scannedMarkets,
              evaluatedRoutes: event.evaluatedRoutes,
              freshPriceRows: event.freshPriceRows,
              fallbackPriceRows: event.fallbackPriceRows,
              estimatedPriceRows: event.estimatedPriceRows,
              missingPriceRows: event.missingPriceRows,
            }));
          }
          return;
        }
        if (event.type === "error") throw new Error(event.message);
        if (job?.kind === "ROLLING" && !event.data.rollingCoverage) throw new Error("Rolling coverage progress is missing. Please reload the app.");
        completed = true;
        finishedResult = event.data;
        setProgress((current) => current ? { ...current, completedBatches: current.totalBatches, processedItems: current.totalItems } : current);
        if (isFullCoverage) {
          completedData.current = event.data;
          setData(event.data);
          setLastScannedAt(new Date(event.data.scannedAt));
          session.save(operation, event.data);
          if (!job) setNotice("Full coverage completed and saved. This is now the snapshot restored after a page refresh.");
          return;
        }
        const checkedIds = event.data.rollingCoverage?.itemIds ?? requestedItemIds;
        const updated = {
          ...(completedData.current ?? event.data),
          opportunities: replaceScannedOpportunities(completedData.current?.opportunities ?? [], event.data.opportunities, checkedIds),
        };
        completedData.current = updated;
        setData(updated);
        session.save(operation, updated);
        if (!job) setNotice("Fast scan completed. Refreshed prices are visible for this session; the saved coverage and its date remain unchanged until full coverage completes.");
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handleEvent(JSON.parse(line) as StreamEvent);
        }
        if (done) break;
      }
      if (buffer.trim()) handleEvent(JSON.parse(buffer) as StreamEvent);
      if (!completed && !controller.signal.aborted) throw new Error("Market scan ended before completion.");
      return accepts() ? finishedResult : undefined;
    } catch (scanError) {
      if (accepts()) {
        if (completedData.current) setData(completedData.current);
        if (!job) setError(scanError instanceof Error ? scanError.message : "Scan failed.");
      }
      return accepts() ? null : undefined;
    } finally {
      if (automaticScanController.current === controller) automaticScanController.current = null;
      if (session.finish(operation)) {
        abortController.current = null;
        scanInProgress.current = false;
        setLoading(false);
        setBackgroundLoading(false);
      }
    }
  }, [buildScanParams, itemIds, session, setData]);

  const cancelScan = useCallback(() => {
    setLiveScan(false);
    setLiveCoverageStatus(null);
    setNotice(completedData.current ? "Coverage cancelled. The last completed results are still shown." : "Coverage cancelled. Partial results are still shown.");
    session.cancel();
    abortController.current = null;
    automaticScanController.current = null;
    scanInProgress.current = false;
    setLoading(false);
    setBackgroundLoading(false);
  }, [session]);

  const cancelAutomaticScan = useCallback(() => {
    const controller = automaticScanController.current;
    // Only release the automatic operation that still owns the scan state.
    if (!controller || abortController.current !== controller) return;
    session.cancel();
    automaticScanController.current = null;
    abortController.current = null;
    scanInProgress.current = false;
    setBackgroundLoading(false);
  }, [session]);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      const response = await fetch("/api/items?summary=true");
      if (!response.ok) return;
      const summary = (await response.json()) as CatalogSummary;
      if (active) {
        setCatalogSize(summary.count);
        setCategories(summary.categories);
      }
    }
    void loadCatalog().catch(() => { if (active) setError("Could not load the item catalog."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (itemSearch.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: itemSearch.trim(), limit: "8" });
      void fetch(`/api/items?${params}`, { signal: controller.signal })
        .then(async (response) => response.ok ? response.json() as Promise<{ items: ItemSearchResult[] }> : { items: [] })
        .then((result) => setItemMatches(result.items))
        .catch(() => undefined);
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [itemSearch]);

  // Market handlers invalidate work synchronously, before a late stream can run.
  const switchMarket = useCallback((nextServer: AlbionServer, nextDestination: DestinationCity, nextMethod: MarketSaleMethod) => {
    const cached = session.select(`${nextServer}:${nextDestination}:${nextMethod}`);
    completedData.current = cached ?? null;
    abortController.current = null;
    automaticScanController.current = null;
    scanInProgress.current = false;
    setLoading(false);
    setBackgroundLoading(false);
    setProgress(null);
    setNotice(null);
    setError(null);
    setLastScannedAt(cached ? new Date(cached.scannedAt) : null);
    setServer(nextServer);
    setDestinationCity(nextDestination);
    setSaleMethod(nextMethod);
  }, [session]);

  useEffect(() => {
    async function restoreLatestScan() {
      const cached = session.select(marketKey);
      completedData.current = cached ?? null;
      setData(cached ?? null);
      setLastScannedAt(cached ? new Date(cached.scannedAt) : null);
      setRestoringCoverage(!cached);
      if (cached) return;
      const operation = session.begin("restore");
      if (!operation) return;
      const params = buildScanParams();
      params.set("latest", "true");
      // Restore the entire all-quality pool once. Display settings never load slices.
      try {
        const response = await fetch(`/api/black-market-flips?${params}`, { signal: operation.controller.signal });
        if (!session.accepts(operation) || response.status === 404) return;
        if (!response.ok) throw new Error("Could not restore the latest scan.");
        const restored = (await response.json()) as FlipsResponse;
        if (!session.accepts(operation)) return;
        completedData.current = restored;
        session.save(operation, restored);
        setData(restored);
        setLastScannedAt(new Date(restored.scannedAt));
        setNotice(`Loaded ${restored.opportunities.length.toLocaleString()} saved opportunities. Refresh to check newer public prices.`);
      } catch (restoreError) {
        if (session.accepts(operation)) setError(restoreError instanceof Error ? restoreError.message : "Could not restore the latest scan.");
      } finally {
        if (session.finish(operation)) setRestoringCoverage(false);
      }
    }
    void restoreLatestScan();
    return () => session.cancel();
  }, [buildScanParams, marketKey, session, setData]);

  const scanRef = useRef(scan);
  const restoringCoverageRef = useRef(restoringCoverage);
  const selectedIdsRef = useRef(itemIds);
  useEffect(() => { scanRef.current = scan; }, [scan]);
  useEffect(() => { restoringCoverageRef.current = restoringCoverage; }, [restoringCoverage]);
  useEffect(() => { selectedIdsRef.current = itemIds; }, [itemIds]);

  useEffect(() => {
    if (!liveScan) return;
    const queue = new LiveCoverageQueue();
    let stopped = false;
    let timer: number;
    const report = (message: string) => {
      if (!stopped) setLiveCoverageStatus({ completedItems: queue.completedItems, totalItems: queue.totalItems, completedPasses: queue.completedPasses, message });
    };
    const schedule = (delay: number) => { if (!stopped) timer = window.setTimeout(() => void tick(), delay); };
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden" || !navigator.onLine || restoringCoverageRef.current || scanInProgress.current) {
        report(!navigator.onLine ? "Paused · offline" : document.visibilityState === "hidden" ? "Paused · tab hidden" : "Waiting for the current operation");
        schedule(1_000);
        return;
      }
      const selected = selectedIdsRef.current.split(",").map((id) => id.trim()).filter(Boolean);
      const priorityIds = [...selected, ...(completedData.current?.opportunities ?? []).map((row) => row.itemId)];
      const job = queue.next(priorityIds);
      report(job.kind === "ROLLING" ? "Checking the next catalog batch" : `Refreshing ${job.itemIds.length} priority items`);
      const started = Date.now();
      const result = await scanRef.current(job.kind === "ROLLING" ? "ROLLING" : "LAST_RESULTS", job);
      if (stopped) return;
      if (result === undefined) { schedule(1_000); return; }
      if (result === null) {
        queue.fail();
        report(`Retrying the same batch in ${Math.ceil(queue.delayMs / 1_000)}s`);
      } else {
        queue.complete(job, Date.now() - started, result.rollingCoverage);
        report(`Next batch in ${Math.ceil(queue.delayMs / 1_000)}s`);
      }
      schedule(queue.delayMs);
    };
    schedule(0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      cancelAutomaticScan();
    };
  }, [cancelAutomaticScan, liveScan, marketKey]);

  useEffect(() => () => {
    abortController.current?.abort();
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
  }, []);

  const pricedOpportunities = useMemo(() => (data?.opportunities ?? []).map((row) =>
    repriceMarketOpportunity(row, isPremium, saleMethod)), [data, isPremium, saleMethod]);
  const matchingCoverageCount = useMemo(() => pricedOpportunities.filter((item) =>
    (originCity === "ALL" || item.sourceCity === originCity) &&
    (quality === "0" ? item.quality >= 1 && item.quality <= 4 : item.quality === Number(quality)) &&
    (category === "ALL" || item.category === category),
  ).length, [category, pricedOpportunities, originCity, quality]);
  const opportunities = useMemo(() => {
    const minimumProfitSilver = parseNonnegativeBigInt(minimumProfit);
    const minimumRoiBasisPoints = Math.max(0, Math.round(parseNonnegativeNumber(minimumRoiPercent) * 100));
    const maximumSourceAge = parsePositiveNumber(maxSourceDataAgeMinutes, 60);
    const maximumDestinationAge = parsePositiveNumber(maxDestinationDataAgeMinutes, 1_440);
    const matchingOrigin = originCity === "ALL"
      ? pricedOpportunities
      : pricedOpportunities.filter((item) => item.sourceCity === originCity);
    const matchingQuality = quality === "0"
      ? matchingOrigin.filter((item) => item.quality >= 1 && item.quality <= 4)
      : matchingOrigin.filter((item) => item.quality === Number(quality));
    const matchingCategory = category === "ALL"
      ? matchingQuality
      : matchingQuality.filter((item) => item.category === category);
    const matchingThresholds = showAllPriceMatches
      ? matchingCategory
      : matchingCategory.filter((item) =>
          meetsScannerThresholds(item, minimumProfitSilver, minimumRoiBasisPoints, maximumSourceAge, maximumDestinationAge),
        );
    return rankProgressiveOpportunities(
      matchingThresholds,
      sortBy,
      maximumSourceAge,
      maximumDestinationAge,
      sortDirection,
    );
  }, [category, pricedOpportunities, maxDestinationDataAgeMinutes, maxSourceDataAgeMinutes, minimumProfit, minimumRoiPercent, originCity, quality, showAllPriceMatches, sortBy, sortDirection]);
  const resultSummary = useMemo(() => summarizeOpportunities(opportunities), [opportunities]);
  const feeRates = getMarketFeeRates({ isPremium, saleMethod });
  const totalPages = Math.max(1, Math.ceil(opportunities.length / RESULTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * RESULTS_PER_PAGE;
  const visibleOpportunities = opportunities.slice(pageStart, pageStart + RESULTS_PER_PAGE);
  const hasSavedCoverage = lastScannedAt !== null;
  const selectedItemIds = itemIds.split(",").map((value) => value.trim()).filter(Boolean);
  const rollingCoverageProgress = liveCoverageStatus?.totalItems
    ? Math.min(100, (liveCoverageStatus.completedItems / liveCoverageStatus.totalItems) * 100)
    : 0;
  const addTargetItem = (itemId: string) => {
    setItemIds(Array.from(new Set([...selectedItemIds, itemId])).join(","));
    setItemSearch("");
    setItemMatches([]);
  };
  const removeTargetItem = (itemId: string) => setItemIds(selectedItemIds.filter((value) => value !== itemId).join(","));
  const changeLiveScan = (enabled: boolean) => {
    setLiveScan(enabled);
    if (!enabled) {
      cancelAutomaticScan();
      setLiveCoverageStatus(null);
    }
  };
  const changePage = useCallback((nextPage: number) => {
    setPage(nextPage);
    document.getElementById("black-market-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const changeSort = useCallback((nextSort: SortKey) => {
    if (nextSort === sortBy) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortBy(nextSort);
    setSortDirection(defaultSortDirection(nextSort));
  }, [sortBy]);
  const changeThreshold = useCallback((update: (value: string) => void, value: string) => {
    update(value);
    setShowAllPriceMatches(false);
  }, []);
  const copyItemId = useCallback(async (itemId: string) => {
    try {
      await navigator.clipboard.writeText(itemId);
      setCopiedItemId(itemId);
      if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => {
        setCopiedItemId(null);
        copyResetTimer.current = null;
      }, 1_500);
    } catch {
      setError("Could not copy the item ID. Please copy it manually.");
    }
  }, []);

  return (
    <main className="mx-auto grid max-w-[1600px] gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Market Route Scanner</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Choose an origin and destination, including the Black Market, then rank transport opportunities by profit, ROI, market value, weight efficiency, and data freshness.
        </p>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-3 rounded-lg px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Activity className={liveScan ? "text-emerald-600" : "text-slate-400"} size={17} />
          {restoringCoverage ? "Loading saved market coverage…" : loading ? (lastScannedAt ? "Refreshing prices · showing the last completed coverage" : "Building market coverage…") : liveScan ? "Rolling market coverage active" : "Market coverage ready"}
        </div>
        <div className="text-xs text-slate-500">
          {catalogSize === null ? "Loading catalog" : `${catalogSize.toLocaleString()} catalog items`}
          {lastScannedAt ? ` · Full coverage ${lastScannedAt.toLocaleString()}` : ""}
        </div>
      </section>

      {restoringCoverage ? <section className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-blue-950" aria-live="polite">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Preparing Black Market coverage</p>
            <p className="mt-1 text-sm text-blue-800">Loading the saved snapshot or rebuilding it from prices stored on this PC. No new market scan is running.</p>
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-blue-700">Loading</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-100" role="progressbar" aria-label="Loading saved Black Market coverage">
          <div className="coverage-loading-bar h-full w-1/3 rounded-full bg-blue-600" />
        </div>
      </section> : null}

      <section className="panel grid gap-4 rounded-lg p-5">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <label className="field-label">Server<select className="field-input" value={server} onChange={(event) => switchMarket(event.target.value as AlbionServer, destinationCity, saleMethod)}><option value="EUROPE">Europe</option><option value="AMERICAS">Americas</option><option value="ASIA">Asia</option></select></label>
          <label className="field-label">Origin market<select className="field-input" value={originCity} onChange={(event) => { const nextOrigin = event.target.value as OriginCity; setOriginCity(nextOrigin); if (nextOrigin !== "ALL" && nextOrigin === destinationCity) switchMarket(server, "BLACK_MARKET", "FAST_SELL"); }}><option value="ALL">All royal cities</option>{royalCityOptions.map((city) => <option key={city.value} value={city.value}>{city.label}</option>)}</select></label>
          <label className="field-label">Destination market<select className="field-input" value={destinationCity} onChange={(event) => { const nextDestination = event.target.value as DestinationCity; switchMarket(server, nextDestination, nextDestination === "BLACK_MARKET" ? "FAST_SELL" : saleMethod); }}><option value="BLACK_MARKET">Black Market</option>{royalCityOptions.map((city) => <option key={city.value} value={city.value} disabled={originCity === city.value}>{city.label}</option>)}</select></label>
          <label className="field-label">Filter results by category<select className="field-input" value={category} onChange={(event) => { setCategory(event.target.value); }}><option value="ALL">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="field-label">Item quality<select className="field-input" value={quality} onChange={(event) => { setQuality(event.target.value as ItemQuality); }}><option value="0">Any quality (no Masterpiece)</option><option value="1">Normal</option><option value="2">Good</option><option value="3">Outstanding</option><option value="4">Excellent</option><option value="5">Masterpiece only</option></select></label>
          {restoringCoverage
            ? <button className="secondary-button self-end" disabled><Activity className="animate-spin" size={15} />Loading saved coverage</button>
            : loading || backgroundLoading
            ? <button className="secondary-button self-end" onClick={cancelScan}><Square size={15} />Cancel coverage</button>
            : <button className="primary-button self-end" onClick={() => void scan(hasSavedCoverage ? "LAST_RESULTS" : "FULL")}><Search size={16} />{selectedItemIds.length ? `Fast scan ${selectedItemIds.length} selected` : hasSavedCoverage ? "Fast scan last coverage" : "Create first coverage"}</button>}
        </div>
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="field-label relative">Quick item search
              <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input className="field-input pl-9" value={itemSearch} onChange={(event) => { setItemSearch(event.target.value); if (event.target.value.trim().length < 2) setItemMatches([]); }} placeholder="Type an item name or ID…" /></span>
              {itemMatches.length > 0 ? <span className="absolute left-0 right-0 top-full z-20 mt-1 grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">{itemMatches.map((item) => <button type="button" key={item.id} onClick={() => addTargetItem(item.id)} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-emerald-50"><span><span className="block text-sm font-semibold">{item.name ?? item.id}</span><span className="block font-mono text-[11px] text-slate-500">{item.id} · {item.category}</span></span><Plus size={15} className="text-emerald-700" /></button>)}</span> : null}
            </label>
            <p className="text-xs leading-5 text-slate-500">Select a few items for a fast one-batch scan. Leave the list empty to scan the entire catalog.</p>
          </div>
          {selectedItemIds.length > 0 ? <div className="flex flex-wrap gap-2">{selectedItemIds.map((itemId) => <span key={itemId} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-xs font-semibold text-emerald-900">{itemId}<button type="button" onClick={() => removeTargetItem(itemId)} aria-label={`Remove ${itemId}`}><X size={13} /></button></span>)}<button type="button" className="text-xs font-semibold text-slate-500 underline" onClick={() => setItemIds("")}>Clear all</button></div> : null}
          <details><summary className="cursor-pointer text-xs font-semibold text-slate-600">Paste item IDs instead</summary><input className="field-input mono mt-2" value={itemIds} onChange={(event) => setItemIds(event.target.value)} placeholder="T4_BAG,T5_BAG" /></details>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          <label className="field-label">Sort opportunities by<select className="field-input" value={sortBy} onChange={(event) => changeSort(event.target.value as SortKey)}><option value="combined">Combined score</option><option value="item">Item name</option><option value="route">Route</option><option value="fees">Market fees</option><option value="profit">Silver profit</option><option value="roi">Profit percentage</option><option value="profitPerKg">Profit per kilogram</option><option value="marketValue">Market value</option><option value="sourceFreshness">Newest origin data</option><option value="destinationFreshness">Newest target data</option></select></label>
          <label className="field-label">Maximum origin age (minutes)<input className="field-input" type="number" inputMode="numeric" min="1" step="1" value={maxSourceDataAgeMinutes} onFocus={(event) => event.currentTarget.select()} onChange={(event) => changeThreshold(setMaxSourceDataAgeMinutes, event.target.value)} /></label>
          <label className="field-label">Maximum target age (minutes)<input className="field-input" type="number" inputMode="numeric" min="1" step="1" value={maxDestinationDataAgeMinutes} onFocus={(event) => event.currentTarget.select()} onChange={(event) => changeThreshold(setMaxDestinationDataAgeMinutes, event.target.value)} /></label>
          <label className="field-label">Minimum silver profit per unit<input className="field-input" type="number" inputMode="numeric" min="0" step="1" value={minimumProfit} onFocus={(event) => event.currentTarget.select()} onChange={(event) => changeThreshold(setMinimumProfit, event.target.value)} /></label>
          <label className="field-label">Minimum profit percentage<input className="field-input" type="number" inputMode="decimal" min="0" step="0.01" value={minimumRoiPercent} onFocus={(event) => event.currentTarget.select()} onChange={(event) => changeThreshold(setMinimumRoiPercent, event.target.value)} /></label>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_2fr]">
          <label className="field-label">Premium status<select className="field-input" value={isPremium ? "PREMIUM" : "STANDARD"} onChange={(event) => setIsPremium(event.target.value === "PREMIUM")}><option value="PREMIUM">Premium</option><option value="STANDARD">No Premium</option></select></label>
          <label className="field-label">Sale method<select className="field-input" value={saleMethod} onChange={(event) => switchMarket(server, destinationCity, event.target.value as MarketSaleMethod)}><option value="FAST_SELL">Fast sell to buy order</option><option value="SELL_ORDER" disabled={destinationCity === "BLACK_MARKET"}>Create sell order</option></select></label>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong>{basisPoints(feeRates.totalFeeBasisPoints)} total market fees</strong>
            <span className="mt-1 block text-xs leading-5">{basisPoints(feeRates.salesTaxBasisPoints)} sales tax{feeRates.setupFeeBasisPoints > 0 ? ` + ${basisPoints(feeRates.setupFeeBasisPoints)} sell-order setup fee` : " · no setup fee"}. {saleMethod === "FAST_SELL" ? "Uses the destination's highest buy order." : "Uses the destination's lowest sell order; the sale is not guaranteed."}</span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex min-h-10 items-center gap-3 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={showAllPriceMatches} onChange={(event) => { setShowAllPriceMatches(event.target.checked); }} /><span>Show every origin/target price match<span className="block text-xs font-normal text-slate-500">Ignores profit, ROI, and freshness limits. Editing any limit turns this off.</span></span></label>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <label className="flex min-h-6 items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={liveScan} onChange={(event) => changeLiveScan(event.target.checked)} />Rolling coverage: priority matches + catalog batches</label>
            <p className="mt-1 text-xs text-slate-500">Small batches alternate with saved matches. New batches pause in hidden tabs or offline; retries slow down after errors. Keep this page open.</p>
            {liveScan && liveCoverageStatus ? <div className="mt-2" aria-live="polite">
              <div className="mb-1 flex flex-wrap justify-between gap-1 text-[11px] font-semibold text-slate-500"><span>{liveCoverageStatus.message}</span><span>{liveCoverageStatus.completedItems.toLocaleString()} / {liveCoverageStatus.totalItems.toLocaleString()} checked · {liveCoverageStatus.completedPasses} completed passes</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Catalog items checked this pass" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rollingCoverageProgress)}><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-linear" style={{ width: `${rollingCoverageProgress}%` }} /></div>
            </div> : null}
          </div>
        </div>
        {loading && progress ? <ScanProgressView progress={progress} foundOpportunities={scanOpportunitiesFound} /> : null}
        {notice ? <p className="text-sm font-medium text-blue-700">{notice}</p> : null}
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      </section>

      <section className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-5 text-blue-950 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h2 className="font-semibold">Improve live Albion Data coverage</h2>
          <p className="mt-1 text-sm leading-6">Run the official community client while playing, then open the in-game markets and item orders you need. The client only uploads markets you actually load; this site does not capture game traffic itself.</p>
        </div>
        <a className="secondary-button bg-white" href="https://www.albion-online-data.com/client" target="_blank" rel="noreferrer">Official client page</a>
      </section>

      {data ? <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Opportunity summary">
        <MetricCard label="Matching opportunities" value={opportunities.length.toLocaleString()} />
        <MetricCard label="Best silver profit" value={resultSummary.bestProfit.toLocaleString()} />
        <MetricCard label="Best profit percentage" value={basisPoints(resultSummary.bestRoiBasisPoints)} />
        <MetricCard label="Best profit per kilogram" value={silverNumber(resultSummary.bestProfitPerKgSilver)} />
      </section> : null}

      <section className="panel scroll-mt-4 overflow-hidden rounded-lg" id="black-market-results">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{showAllPriceMatches ? "All market price matches" : "Best route opportunities"}</h2>
              {opportunities.length > 0 ? <p className="mt-1 text-xs text-slate-500">Showing {pageStart + 1}–{Math.min(pageStart + RESULTS_PER_PAGE, opportunities.length)} of {opportunities.length.toLocaleString()} opportunities</p> : null}
            </div>
            {opportunities.length > RESULTS_PER_PAGE ? <Pagination page={currentPage} totalPages={totalPages} onPageChange={changePage} /> : null}
          </div>
          {data ? <div className="mt-1 text-xs text-slate-500">
            <p>{data.scannedItems.toLocaleString()} items · {data.scannedMarkets} origin markets · {data.evaluatedRoutes.toLocaleString()} opportunities evaluated · {data.freshPriceRows.toLocaleString()} live price rows · {(data.fallbackPriceRows ?? 0).toLocaleString()} last-known rows · {(data.estimatedPriceRows ?? 0).toLocaleString()} historical estimates · {(data.missingPriceRows ?? 0).toLocaleString()} missing rows</p>
            {(data.estimatedPriceRows ?? 0) > 0 ? <p className="mt-1 text-amber-700">Low-data mode uses conservative 7-day history when a live or last-known value is absent. A historical destination estimate is not a live buy order; verify it in game before transporting.</p> : null}
            {(data.missingPriceRows ?? 0) > 0 ? <p className="mt-1 text-amber-700">Missing means no usable live, last-known, private, or historical price was available for that item and market.</p> : null}
          </div> : null}
        </div>
        <div className="grid gap-3 p-3 md:hidden" aria-label="Mobile opportunity results">
          {visibleOpportunities.map((item) => <MobileOpportunityCard
            item={item}
            copied={copiedItemId === item.itemId}
            key={`${item.itemId}-${item.quality}-${item.sourceCity}-${item.destinationCity}`}
            onCopy={() => void copyItemId(item.itemId)}
          />)}
          {opportunities.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            {restoringCoverage ? "Loading saved Black Market opportunities…" : matchingCoverageCount > 0 ? `${matchingCoverageCount.toLocaleString()} saved matches are hidden by the current limits.` : data ? "No usable saved prices match this city, quality, and category." : "Run full coverage to collect market opportunities."}
            {!restoringCoverage && matchingCoverageCount > 0 ? <button type="button" className="secondary-button mt-4 w-full" onClick={() => { setShowAllPriceMatches(true); }}>Show all saved matches</button> : null}
          </div> : null}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1550px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase text-slate-500 shadow-sm"><tr>
              <SortableHeader label="Item" sortKey="item" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation="Albion item name, tier or enchantment ID, category, and quality." />
              <SortableHeader label="Route" sortKey="route" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation="Origin market where you buy and destination market where you sell." />
              <SortableHeader label="Origin sell" sortKey="purchasePrice" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation="Lowest observed sell order at the origin market." />
              <SortableHeader label={saleMethod === "FAST_SELL" ? "Destination buy" : "Destination sell"} sortKey="expectedSalePrice" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation={saleMethod === "FAST_SELL" ? "Highest observed buy order used for an immediate sale." : "Lowest observed sell order used as the target listing price."} />
              <SortableHeader label="Qty" sortKey="quantity" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation="Estimated units that fit your carrying capacity. Verify public stock availability in-game." />
              <SortableHeader label="Investment" sortKey="investment" currentSort={sortBy} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="Fees" sortKey="fees" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation="Sales tax plus any sell-order setup fee." />
              <SortableHeader label="Profit" sortKey="profit" currentSort={sortBy} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="ROI" sortKey="roi" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation="Return on investment: net profit divided by investment after tax." />
              <SortableHeader label="Profit/kg" sortKey="profitPerKg" currentSort={sortBy} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="Market value" sortKey="marketValue" currentSort={sortBy} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="Origin freshness" sortKey="sourceFreshness" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation="Age of the origin market sell-price observation." />
              <SortableHeader label="Target freshness" sortKey="destinationFreshness" currentSort={sortBy} direction={sortDirection} onSort={changeSort} explanation="Age of the destination market buy or sell-price observation." />
              <SortableHeader label="Score" sortKey="combined" currentSort={sortBy} direction={sortDirection} onSort={changeSort} />
              <SortableHeader label="Confidence" sortKey="confidence" currentSort={sortBy} direction={sortDirection} onSort={changeSort} />
              <th className="px-4 py-3">Warnings</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visibleOpportunities.map((item) => <tr className="transition-colors hover:bg-emerald-50/40" key={`${item.itemId}-${item.quality}-${item.sourceCity}-${item.destinationCity}`}>
                <td className="px-4 py-3"><button className="group flex min-w-56 items-center gap-3 rounded-md p-1 text-left transition hover:bg-emerald-100/70 focus-visible:outline-2 focus-visible:outline-emerald-600" type="button" onClick={() => void copyItemId(item.itemId)} title={`Copy ${item.itemId}`} aria-label={`Copy item ID ${item.itemId}`}><AlbionItemIcon itemId={item.itemId} quality={item.quality} size="lg" showLabel={false} /><span className="min-w-0 flex-1"><span className="block max-w-48 font-semibold leading-5">{item.itemName}</span><span className="block truncate font-mono text-[11px] text-slate-500">{item.itemId}</span><span className="block text-xs text-slate-500">{item.category} · Quality {item.quality}</span><span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">{copiedItemId === item.itemId ? <><Check size={12} />Copied</> : <><Copy size={12} />Click to copy ID</>}</span></span></button></td>
                <td className="px-4 py-3 font-medium"><span className="whitespace-nowrap">{cityName(item.sourceCity)} → {cityName(item.destinationCity)}</span></td>
                <td className="px-4 py-3">{silver(item.purchasePrice)}<Source label={item.purchasePriceLabel} /></td>
                <td className="px-4 py-3">{silver(item.expectedSalePrice)}<Source label={item.salePriceLabel} /></td>
                <td className="px-4 py-3">{item.recommendedQuantity}</td><td className="px-4 py-3">{silver(item.investment)}</td><td className="px-4 py-3">{silver((BigInt(item.taxes) + BigInt(item.setupFees)).toString())}</td><td className="px-4 py-3 font-semibold">{silver(item.netProfit)}</td><td className="px-4 py-3">{basisPoints(item.roiBasisPoints)}</td><td className="px-4 py-3">{silverNumber(item.profitPerKgSilver)}</td><td className="px-4 py-3">{silver(item.marketValue)}</td><td className="px-4 py-3 text-xs">{formatFreshness(item.sourcePriceAgeMinutes)}</td><td className="px-4 py-3 text-xs">{formatFreshness(item.destinationPriceAgeMinutes)}</td><td className="px-4 py-3 font-bold text-emerald-700">{item.score.toFixed(2)}</td><td className="px-4 py-3"><Confidence value={item.confidence} /></td><td className="px-4 py-3"><Warnings values={item.warnings} /></td>
              </tr>)}
              {opportunities.length === 0 ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={16}>
                {restoringCoverage
                  ? <span>Loading saved Black Market opportunities…</span>
                  : matchingCoverageCount > 0
                  ? <div className="grid justify-items-center gap-3"><span>{matchingCoverageCount.toLocaleString()} saved result(s) for this city, quality, and category are hidden by profit, percentage, or freshness filters.</span><button type="button" className="secondary-button" onClick={() => { setShowAllPriceMatches(true); }}>Show all saved matches</button></div>
                  : data
                    ? <span>No usable saved source price exists for {originCity === "ALL" ? "the selected cities" : cityName(originCity)} with this quality and category. Open that city market with the Albion Data client running, then complete a new full coverage.</span>
                    : <span>Run full coverage to collect market opportunities.</span>}
              </td></tr> : null}
            </tbody>
          </table>
        </div>
        {opportunities.length > RESULTS_PER_PAGE ? <div className="flex justify-end border-t border-slate-200 px-5 py-4"><Pagination page={currentPage} totalPages={totalPages} onPageChange={changePage} /></div> : null}
      </section>
    </main>
  );
}

function Source({ label = "Public/unknown" }: { label?: string }) {
  const className = label === "Live public" ? "bg-emerald-50 text-emerald-800" : label.startsWith("Private") ? "bg-violet-50 text-violet-800" : label === "Missing" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800";
  return <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>;
}

function MobileOpportunityCard({ item, copied, onCopy }: { item: Opportunity; copied: boolean; onCopy: () => void }) {
  return <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start gap-3 border-b border-slate-100 p-4">
      <AlbionItemIcon itemId={item.itemId} quality={item.quality} size="lg" showLabel={false} />
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-5 text-slate-900">{item.itemName}</h3>
        <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{item.itemId}</p>
        <p className="mt-1 text-xs font-medium text-slate-600">{cityName(item.sourceCity)} → {cityName(item.destinationCity)}</p>
      </div>
      <button className="secondary-button min-h-11 shrink-0 px-3" type="button" onClick={onCopy} aria-label={`Copy item ID ${item.itemId}`}>
        {copied ? <Check size={17} /> : <Copy size={17} />}
      </button>
    </div>
    <div className="grid grid-cols-2 gap-px bg-slate-100">
      <MobileValue label="Origin sell" value={silver(item.purchasePrice)} detail={item.purchasePriceLabel} />
      <MobileValue label="Destination buy" value={silver(item.expectedSalePrice)} detail={item.salePriceLabel} />
      <MobileValue label="Net profit" value={silver(item.netProfit)} accent />
      <MobileValue label="Profit percentage" value={basisPoints(item.roiBasisPoints)} accent />
    </div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-xs">
      <MobileDetail label="Quantity" value={item.recommendedQuantity.toLocaleString()} />
      <MobileDetail label="Investment" value={silver(item.investment)} />
      <MobileDetail label="Profit / kg" value={silverNumber(item.profitPerKgSilver)} />
      <MobileDetail label="Market value" value={silver(item.marketValue)} />
      <MobileDetail label="Origin freshness" value={formatFreshness(item.sourcePriceAgeMinutes)} />
      <MobileDetail label="Target freshness" value={formatFreshness(item.destinationPriceAgeMinutes)} />
    </dl>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
      <div className="flex items-center gap-2"><Confidence value={item.confidence} /><span className="text-xs font-bold text-emerald-700">Score {item.score.toFixed(2)}</span></div>
      <Warnings values={item.warnings} />
    </div>
  </article>;
}

function MobileValue({ label, value, detail, accent = false }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return <div className="bg-white p-3">
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-base font-bold tabular-nums ${accent ? "text-emerald-700" : "text-slate-900"}`}>{value}</p>
    {detail ? <p className="mt-1 truncate text-[10px] text-slate-500">{detail}</p> : null}
  </div>;
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-800">{value}</dd></div>;
}
function Confidence({ value }: { value: Opportunity["confidence"] }) { const className = value === "HIGH" ? "bg-emerald-50 text-emerald-800" : value === "MEDIUM" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"; return <span className={`rounded px-2 py-1 text-xs font-bold ${className}`}>{value}</span>; }
function Warnings({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-xs text-slate-500">None</span>;
  return <div className="flex max-w-48 flex-wrap gap-1">{values.map((value) => <span key={value} className={`rounded px-2 py-1 text-xs font-semibold ${value === "Quantity unknown" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{value}</span>)}</div>;
}
function silver(value: string | null) { return value === null ? "missing" : Number(value).toLocaleString(); }
function silverNumber(value: number | null) { return value === null ? "n/a" : `${Math.round(value).toLocaleString()} silver`; }
function basisPoints(value: number | null) { return value === null ? "n/a" : `${(value / 100).toFixed(2)}%`; }
function cityName(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatFreshness(value: number | null) { return value === null ? "unknown" : `${value} min old`; }

function MetricCard({ label, value }: { label: string; value: string }) {
  return <article className="panel min-w-0 rounded-lg px-3 py-3 sm:px-5 sm:py-4">
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p>
    <p className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-900 sm:mt-2 sm:text-2xl">{value}</p>
  </article>;
}

function summarizeOpportunities(items: Opportunity[]) {
  let bestProfit = 0n;
  let bestRoiBasisPoints: number | null = null;
  let bestProfitPerKgSilver: number | null = null;
  for (const item of items) {
    const profit = BigInt(item.netProfit);
    if (profit > bestProfit) bestProfit = profit;
    if (item.roiBasisPoints !== null && (bestRoiBasisPoints === null || item.roiBasisPoints > bestRoiBasisPoints)) bestRoiBasisPoints = item.roiBasisPoints;
    if (item.profitPerKgSilver !== null && (bestProfitPerKgSilver === null || item.profitPerKgSilver > bestProfitPerKgSilver)) bestProfitPerKgSilver = item.profitPerKgSilver;
  }
  return { bestProfit, bestRoiBasisPoints, bestProfitPerKgSilver };
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  return <nav className="flex items-center gap-2" aria-label="Results pages">
    <button className="secondary-button px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40" type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous results page"><ChevronLeft size={15} /></button>
    <span className="min-w-24 text-center text-xs font-semibold text-slate-600">Page {page} of {totalPages}</span>
    <button className="secondary-button px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40" type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next results page"><ChevronRight size={15} /></button>
  </nav>;
}

function SortableHeader({ label, sortKey, currentSort, direction, onSort, explanation }: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  direction: SortDirection;
  onSort: (sortKey: SortKey) => void;
  explanation?: string;
}) {
  const active = currentSort === sortKey;
  const SortIcon = active ? direction === "asc" ? ArrowUp : ArrowDown : ChevronsUpDown;
  return <th className="px-4 py-3" title={explanation}>
    <button className={`flex items-center gap-1.5 whitespace-nowrap font-bold transition hover:text-emerald-700 ${active ? "text-emerald-700" : ""}`} type="button" onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}${explanation ? `. ${explanation}` : ""}`}>
      {label}<SortIcon aria-hidden="true" size={14} />
    </button>
  </th>;
}

function ScanProgressView({ progress, foundOpportunities }: { progress: ScanProgress; foundOpportunities: number }) {
  const percentage = progress.totalBatches > 0
    ? Math.min(100, Math.round((progress.completedBatches / progress.totalBatches) * 100))
    : 0;
  const remainingMilliseconds = progress.completedBatches > 0
    ? (progress.elapsedMilliseconds / progress.completedBatches) * (progress.totalBatches - progress.completedBatches)
    : null;
  return <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4" data-testid="scan-progress" aria-live="polite">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Market scan in progress</p>
        <p className="mt-1 text-sm font-semibold text-slate-700">Checking origin sell orders and destination buy orders</p>
      </div>
      <span className="min-w-14 text-right text-2xl font-bold tabular-nums text-emerald-700" data-testid="scan-progress-percent">{percentage}%</span>
    </div>
    <div
      className="h-4 overflow-hidden rounded-full border border-emerald-200 bg-white shadow-inner"
      data-testid="scan-progress-bar"
      role="progressbar"
      aria-label="Market route scan progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      aria-valuetext={`${percentage}% complete`}
    >
      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-300 ease-out" style={{ width: `${percentage}%` }} />
    </div>
    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 xl:grid-cols-6">
      <ProgressMetric label="Items" value={`${progress.processedItems.toLocaleString()} / ${progress.totalItems.toLocaleString()}`} />
      <ProgressMetric label="Batches" value={progress.totalBatches > 0 ? `${progress.completedBatches} / ${progress.totalBatches}` : "Preparing"} />
      <ProgressMetric label="Opportunities" value={foundOpportunities.toLocaleString()} />
      <ProgressMetric label="Live rows" value={progress.freshPriceRows.toLocaleString()} />
      <ProgressMetric label="Fallback rows" value={progress.fallbackPriceRows.toLocaleString()} />
      <ProgressMetric label="Estimates" value={progress.estimatedPriceRows.toLocaleString()} />
      <ProgressMetric label="Missing rows" value={progress.missingPriceRows.toLocaleString()} />
      <ProgressMetric label="Time" value={`${formatDuration(progress.elapsedMilliseconds)} elapsed · ${formatEta(remainingMilliseconds)}`} />
    </div>
  </div>;
}

function ProgressMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-white/80 px-3 py-2 shadow-sm">
    <span className="block font-bold uppercase tracking-wide text-slate-500">{label}</span>
    <span className="mt-1 block font-semibold tabular-nums text-slate-800">{value}</span>
  </div>;
}

function mergeOpportunities(current: Opportunity[], incoming: Opportunity[]) {
  const byRoute = new Map(current.map((item) => [`${item.itemId}\u0000${item.quality}\u0000${item.sourceCity}\u0000${item.destinationCity}`, item]));
  for (const item of incoming) byRoute.set(`${item.itemId}\u0000${item.quality}\u0000${item.sourceCity}\u0000${item.destinationCity}`, item);
  return Array.from(byRoute.values());
}

function parseNonnegativeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
function parsePositiveNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function parseNonnegativeBigInt(value: string) {
  try {
    const normalized = value.trim();
    return /^\d+$/.test(normalized) ? BigInt(normalized) : 0n;
  } catch {
    return 0n;
  }
}
function formatEta(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "estimating time";
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `about ${seconds}s remaining`;
  return `about ${Math.ceil(seconds / 60)}m remaining`;
}
function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
