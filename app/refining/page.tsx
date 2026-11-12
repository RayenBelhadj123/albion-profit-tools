"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Factory, RefreshCw } from "lucide-react";
import { AlbionItemIcon } from "@/app/components/albion-item-icon";
import { AdvancedSettings, CalculatorCity, CalculatorField, CalculatorSection, CalculatorStatus, PriceSource } from "@/app/components/calculator-workspace";
import { getMarketFeeRates, type MarketSaleMethod } from "@/lib/market/fees";
import { refiningRecipes } from "@/lib/refining/recipes";
import { refiningFocusEfficiency } from "@/lib/crafting/focus";

type CraftSummary = {
  outputItemId: string;
  outputQuality: number;
  runs: number;
  outputQuantity: number;
  materialCost: string;
  returnedMaterialValue: string;
  netMaterialCost: string;
  stationFee: string;
  grossRevenue: string;
  taxes: string;
  setupFees: string;
  investment: string;
  netProfit: string;
  roiBasisPoints: number | null;
  profitPerFocus: number | null;
  inputWeightGrams: number | null;
  outputWeightGrams: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  warnings: string[];
  ingredients: Array<{
    itemId: string;
    itemName: string;
    quantityRequired: number;
    quantityReturned: number;
    netQuantityConsumed: number;
    unitPrice: string | null;
    priceSource: string | null;
  }>;
};

type RefiningResult = {
  recipeId: string;
  recipeLabel: string;
  outputItemName: string;
  bonusCity: string;
  refiningCity: string;
  result: {
    withoutFocus: CraftSummary;
    withFocus: CraftSummary;
    extraProfitFromFocus: string;
    profitPerFocus: number | null;
    maxPrimaryMaterialUnitPrice: string | null;
    primaryMaterialItemId: string | null;
    targetRoiBasisPoints: number;
    warnings: string[];
  };
};

export default function RefiningPage() {
  const [recipeId, setRecipeId] = useState("refine-t4-leather-0");
  const [resourceFilter, setResourceFilter] = useState("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [enchantmentFilter, setEnchantmentFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [runs, setRuns] = useState("100");
  const [materialCity, setMaterialCity] = useState("Martlock");
  const [refiningCity, setRefiningCity] = useState("Martlock");
  const [sellCity, setSellCity] = useState("Caerleon");
  const [stationFee, setStationFee] = useState("250");
  const [tierSpecs, setTierSpecs] = useState<Record<number, string>>({ 4: "0", 5: "0", 6: "0", 7: "0", 8: "0" });
  const [materialBuyMethod, setMaterialBuyMethod] = useState<"INSTANT_BUY" | "BUY_ORDER">("INSTANT_BUY");
  const [saleMethod, setSaleMethod] = useState<MarketSaleMethod>("FAST_SELL");
  const [isPremium, setIsPremium] = useState(true);
  const [targetRoi, setTargetRoi] = useState("0");
  const [data, setData] = useState<RefiningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  async function calculateForRecipe(selectedRecipeId: string) {
    if (!selectedRecipeId) return;
    setRecipeId(selectedRecipeId);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/refining/calculate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipeId: selectedRecipeId,
          runs,
          materialCity,
          refiningCity,
          sellCity,
          materialBuyMethod,
          saleMethod,
          isPremium,
          stationFeePer100Nutrition: stationFee,
          targetRoiBasisPoints: Math.round(Number(targetRoi) * 100).toString(),
          focusCostEfficiency,
        }),
      });
      const json = (await response.json()) as RefiningResult & { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Refining request failed.");
      }
      setData(json);
    } catch (refiningError) {
      setError(
        refiningError instanceof Error ? refiningError.message : "Calculation failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  const result = data?.result ?? null;
  const feeRates = getMarketFeeRates({ isPremium, saleMethod });
  const selectedRecipe = refiningRecipes.find((recipe) => recipe.id === recipeId) ?? refiningRecipes[0];
  const numericTierSpecs = Object.fromEntries(
    Object.entries(tierSpecs).map(([tier, level]) => [Number(tier), Number(level)]),
  );
  const focusCostEfficiency = refiningFocusEfficiency(selectedRecipe?.tier ?? 4, numericTierSpecs);
  const visibleRecipes = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return refiningRecipes.filter((recipe) =>
      (resourceFilter === "ALL" || recipe.resourceType === resourceFilter) &&
      (tierFilter === "ALL" || recipe.tier === Number(tierFilter)) &&
      (enchantmentFilter === "ALL" || recipe.enchantment === Number(enchantmentFilter)) &&
      (!query || recipe.label.toLowerCase().includes(query) || recipe.outputItemId.toLowerCase().includes(query)),
    );
  }, [deferredSearch, enchantmentFilter, resourceFilter, tierFilter]);
  const activeRecipeId = visibleRecipes.some((recipe) => recipe.id === recipeId)
    ? recipeId
    : visibleRecipes[0]?.id ?? "";
  const activeRecipe = refiningRecipes.find((recipe) => recipe.id === activeRecipeId) ?? null;

  function chooseRecipe(nextId: string) {
    setRecipeId(nextId);
    const nextRecipe = refiningRecipes.find((recipe) => recipe.id === nextId);
    if (nextRecipe) setRefiningCity(displayCity(nextRecipe.bonusCity));
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <Factory className="text-emerald-700" size={28} />
          <h1 className="text-3xl font-semibold tracking-tight">
            Refining Calculator
          </h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Inspired by Albion refining calculators: compare no-focus and focus
          returns, account for station fees and tax, and calculate the maximum
          primary raw-material price for your target ROI.
        </p>
      </section>

      <CalculatorSection title="1. Choose what to refine" description="Pick a resource family, then narrow by tier or enchantment only when needed.">
        <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Resource family">
          {[{ value: "ALL", label: "All" }, { value: "LEATHER", label: "Leather" }, { value: "PLANKS", label: "Planks" }, { value: "METALBAR", label: "Metal bars" }, { value: "CLOTH", label: "Cloth" }, { value: "STONEBLOCK", label: "Stone blocks" }].map((resource) => <button key={resource.value} type="button" aria-pressed={resourceFilter === resource.value} onClick={() => setResourceFilter(resource.value)} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${resourceFilter === resource.value ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300"}`}>{resource.label}</button>)}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <CalculatorField label="Find item"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Leather, cloth, T7..." /></CalculatorField>
          <label className="field-label">Tier<select className="field-input" value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="ALL">All tiers</option>{[4,5,6,7,8].map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}</select></label>
          <label className="field-label">Enchantment<select className="field-input" value={enchantmentFilter} onChange={(event) => setEnchantmentFilter(event.target.value)}><option value="ALL">All enchantments</option>{[0,1,2,3,4].map((enchantment) => <option key={enchantment} value={enchantment}>.{enchantment}</option>)}</select></label>
          <div className="flex items-end"><button type="button" className="secondary-button w-full" onClick={() => { setSearch(""); setTierFilter("ALL"); setEnchantmentFilter("ALL"); }}>Clear filters</button></div>
        </div>
        <div className={`grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 transition-opacity sm:grid-cols-2 lg:grid-cols-4 ${search !== deferredSearch ? "opacity-60" : "opacity-100"}`} aria-busy={search !== deferredSearch}>
          {visibleRecipes.map((recipe) => <button type="button" key={recipe.id} onClick={() => chooseRecipe(recipe.id)} className={`deferred-list-item flex items-center gap-3 rounded-lg border p-2 text-left transition-colors ${recipe.id === activeRecipeId ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200" : "border-slate-200 bg-white hover:border-emerald-300"}`}><AlbionItemIcon itemId={recipe.outputItemId} size="md" showLabel={false} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{recipe.label}</span><span className="block text-xs text-slate-500">{formatResourceType(recipe.resourceType)} · T{recipe.tier}.{recipe.enchantment}</span></span></button>)}
          {visibleRecipes.length === 0 ? <p className="p-3 text-sm text-slate-500">No refining items match these filters.</p> : null}
        </div>
        {activeRecipe ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><AlbionItemIcon itemId={activeRecipe.outputItemId} size="lg" showLabel={false} /><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Selected item</p><p className="font-semibold text-emerald-950">{activeRecipe.label}</p><p className="text-xs text-emerald-800">Best refining city: {displayCity(activeRecipe.bonusCity)}</p></div></div> : null}
        </div>
      </CalculatorSection>

      <CalculatorSection title="2. Set amount and cities" description="Defaults follow the selected item's refining bonus city.">
        <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-6">
          <label className="field-label">
            Runs
            <input
              className="field-input"
              inputMode="numeric"
              value={runs}
              onChange={(event) => setRuns(event.target.value)}
            />
          </label>
          <CalculatorCity label="Buy inputs" value={materialCity} onChange={setMaterialCity} />
          <CalculatorCity label="Refine in" value={refiningCity} onChange={setRefiningCity} />
          <CalculatorCity label="Sell output" value={sellCity} onChange={setSellCity} />
          <label className="field-label">
            Fee / 100 nutrition
            <input
              className="field-input"
              inputMode="numeric"
              value={stationFee}
              onChange={(event) => setStationFee(event.target.value)}
            />
          </label>
        </div>
        </div>
      </CalculatorSection>

      <CalculatorSection title="3. Calculate profit" description="The result keeps showing while fresh market prices are loaded.">
        <div className="grid gap-4">
        <AdvancedSettings summary="market methods, fees, ROI, and T4-T8 specs">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="field-label">Material pricing<select className="field-input" value={materialBuyMethod} onChange={(event) => setMaterialBuyMethod(event.target.value as "INSTANT_BUY" | "BUY_ORDER")}><option value="INSTANT_BUY">Quick buy</option><option value="BUY_ORDER">Buy order</option></select></label>
          <label className="field-label">Output sale<select className="field-input" value={saleMethod} onChange={(event) => setSaleMethod(event.target.value as MarketSaleMethod)}><option value="FAST_SELL">Quick sell</option><option value="SELL_ORDER">Sell order</option></select></label>
          <label className="field-label">Account<select className="field-input" value={isPremium ? "PREMIUM" : "STANDARD"} onChange={(event) => setIsPremium(event.target.value === "PREMIUM")}><option value="PREMIUM">Premium</option><option value="STANDARD">No Premium</option></select></label>
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><span className="block font-bold">Market fees</span>{basisPoints(feeRates.salesTaxBasisPoints)} tax{feeRates.setupFeeBasisPoints ? ` + ${basisPoints(feeRates.setupFeeBasisPoints)} listing fee` : " · no listing fee"}</div>
        </div>
        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3 lg:grid-cols-6">
          {[4, 5, 6, 7, 8].map((tier) => <label className="field-label" key={tier}>T{tier} refining spec<input className="field-input" inputMode="numeric" min="0" max="100" value={tierSpecs[tier] ?? "0"} onChange={(event) => setTierSpecs((current) => ({ ...current, [tier]: event.target.value }))} /></label>)}
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><span className="block font-bold">Focus efficiency</span><span className="text-lg font-semibold">{focusCostEfficiency.toLocaleString()}</span><span className="block">Applied to selected T{selectedRecipe?.tier ?? 4} recipe</span></div>
        </div>
        <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
          <label className="field-label">
            Target ROI %
            <input
              className="field-input"
              inputMode="decimal"
              value={targetRoi}
              onChange={(event) => setTargetRoi(event.target.value)}
            />
          </label>
        </div>
        </AdvancedSettings>
        <div className="flex justify-end"><button className="primary-button w-full sm:w-auto" onClick={() => void calculateForRecipe(activeRecipeId)} disabled={loading || !activeRecipeId}>{loading ? <RefreshCw className="animate-spin" size={16} /> : <Factory size={16} />}{loading ? "Refreshing prices..." : "Calculate selected item"}</button></div>
        <CalculatorStatus loading={loading} error={error} />
        </div>
      </CalculatorSection>

      {result ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="panel flex flex-wrap items-center gap-4 rounded-lg p-5 lg:col-span-2">
            <AlbionItemIcon itemId={result.withoutFocus.outputItemId} quality={result.withoutFocus.outputQuality} size="lg" showLabel={false} />
            <div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Refining recipe</p><h2 className="text-xl font-semibold">{data?.outputItemName}</h2><p className="font-mono text-xs text-slate-500">{result.withoutFocus.outputItemId}</p></div>
            <div className="ml-auto rounded-lg bg-emerald-50 px-4 py-3 text-sm"><span className="block text-xs font-bold uppercase text-emerald-700">Bonus city</span><span className="font-semibold">{data?.bonusCity}</span></div>
          </div>
          <RefiningPanel title="Without Focus" result={result.withoutFocus} />
          <RefiningPanel title="With Focus" result={result.withFocus} />
          <div className="panel rounded-lg p-5 lg:col-span-2">
            <h2 className="font-semibold">Focus And Buy Ceiling</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <Metric label="Extra profit" value={silver(result.extraProfitFromFocus)} />
              <Metric label="Silver / focus (SpF)" value={result.profitPerFocus ?? "n/a"} />
              <Metric
                label="Primary material"
                value={result.primaryMaterialItemId ?? "n/a"}
              />
              <Metric
                label="Max primary price"
                value={silver(result.maxPrimaryMaterialUnitPrice)}
              />
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-600">
              {result.warnings.join(", ") || "No warnings"}
            </p>
          </div>
        </section>
      ) : (
        <CalculatorStatus emptyText="Choose a refining item and calculate to see focus comparison, profit, and input price ceilings." />
      )}
    </main>
  );
}

function RefiningPanel({ title, result }: { title: string; result: CraftSummary }) {
  return (
    <div className="panel rounded-lg p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <div className="mt-2">
            <AlbionItemIcon itemId={result.outputItemId} size="sm" />
          </div>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold">
          {result.confidence}
        </span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Metric label="Material cost" value={silver(result.materialCost)} />
        <Metric label="Return value" value={silver(result.returnedMaterialValue)} />
        <Metric label="Station fee" value={silver(result.stationFee)} />
        <Metric label="Revenue" value={silver(result.grossRevenue)} />
        <Metric label="Market fees" value={silver((BigInt(result.taxes) + BigInt(result.setupFees)).toString())} />
        <Metric label="Profit" value={silver(result.netProfit)} />
        <Metric label="ROI" value={basisPoints(result.roiBasisPoints)} />
        <Metric label="Input weight" value={grams(result.inputWeightGrams)} />
        <Metric label="Output weight" value={grams(result.outputWeightGrams)} />
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="py-2">Input</th>
              <th className="py-2">Required</th>
              <th className="py-2">Returned</th>
              <th className="py-2">Consumed</th>
              <th className="py-2">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.ingredients.map((ingredient) => (
              <tr key={ingredient.itemId}>
                <td className="py-2">
                  <span className="flex items-center gap-2"><AlbionItemIcon itemId={ingredient.itemId} size="sm" showLabel={false} /><span><span className="block font-semibold">{ingredient.itemName}</span><span className="block font-mono text-[10px] text-slate-500">{ingredient.itemId}</span></span></span>
                </td>
                <td className="py-2">{ingredient.quantityRequired}</td>
                <td className="py-2">{ingredient.quantityReturned}</td>
                <td className="py-2">{ingredient.netQuantityConsumed}</td>
                <td className="py-2">
                  {silver(ingredient.unitPrice)}
                  <span className="mt-1 block"><PriceSource source={ingredient.priceSource} /></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-600">
        {result.warnings.join(", ") || "No warnings"}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function silver(value: string | null) {
  if (value === null) return "missing";
  return Number(value).toLocaleString();
}

function basisPoints(value: number | null) {
  if (value === null) return "n/a";
  return `${(value / 100).toFixed(2)}%`;
}

function grams(value: number | null) {
  if (value === null) return "unknown";
  return `${value.toLocaleString()} g`;
}

function displayCity(city: string) {
  return city.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatResourceType(value: string) {
  if (value === "METALBAR") return "Metal Bar";
  if (value === "STONEBLOCK") return "Stone Block";
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
