"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Calculator, RefreshCw } from "lucide-react";

import { AlbionItemIcon } from "@/app/components/albion-item-icon";
import { getMarketFeeRates, type MarketSaleMethod } from "@/lib/market/fees";
import { standardCraftingFocusEfficiency } from "@/lib/crafting/focus";
import { RAYEN_CRAFTING_CATEGORIES } from "@/lib/crafting/rayen-catalog";

type RecipeOption = {
  id: string;
  outputItemId: string;
  name: string;
  tier: number | null;
  enchantment: number;
  category: string;
  ingredientCount: number;
};

type IngredientResult = {
  itemId: string;
  itemName: string;
  quantityRequired: number;
  quantityReturned: number;
  netQuantityConsumed: number;
  unitPrice: string | null;
  priceSource: string | null;
  totalCost: string;
  returnValue: string;
  priceAgeMinutes: number | null;
};

type CraftSummary = {
  outputItemId: string;
  outputQuality: number;
  runs: number;
  outputQuantity: number;
  outputUnitPrice: string | null;
  outputPriceSource: string | null;
  outputPriceAgeMinutes: number | null;
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
  focusCost: number | null;
  profitPerFocus: number | null;
  inputWeightGrams: number | null;
  outputWeightGrams: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  warnings: string[];
  ingredients: IngredientResult[];
};

type CraftResult = {
  recipeId: string;
  outputItemName: string;
  materialBuyMethod: "INSTANT_BUY" | "BUY_ORDER";
  saleMethod: MarketSaleMethod;
  isPremium: boolean;
  result: {
    withoutFocus: CraftSummary;
    withFocus: CraftSummary;
    extraProfitFromFocus: string;
    profitPerFocus: number | null;
    warnings: string[];
  };
};

const cities = ["Bridgewatch", "Caerleon", "Fort Sterling", "Lymhurst", "Martlock", "Thetford"];

export default function CraftingPage() {
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [recipeId, setRecipeId] = useState("recipe-t4-bag");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [tierFilter, setTierFilter] = useState("ALL");
  const [enchantmentFilter, setEnchantmentFilter] = useState("ALL");
  const [server, setServer] = useState("EUROPE");
  const [quality, setQuality] = useState("1");
  const [runs, setRuns] = useState("10");
  const [materialCity, setMaterialCity] = useState("Bridgewatch");
  const [craftCity, setCraftCity] = useState("Lymhurst");
  const [sellCity, setSellCity] = useState("Caerleon");
  const [noFocusRate, setNoFocusRate] = useState("1870");
  const [focusRate, setFocusRate] = useState("4500");
  const [focusCost, setFocusCost] = useState("");
  const [masteryLevel, setMasteryLevel] = useState("0");
  const [itemSpecLevel, setItemSpecLevel] = useState("0");
  const [siblingSpecLevels, setSiblingSpecLevels] = useState("0");
  const [stationFee, setStationFee] = useState("500");
  const [isPremium, setIsPremium] = useState(true);
  const [materialBuyMethod, setMaterialBuyMethod] = useState<"INSTANT_BUY" | "BUY_ORDER">("INSTANT_BUY");
  const [saleMethod, setSaleMethod] = useState<MarketSaleMethod>("FAST_SELL");
  const [setupFee, setSetupFee] = useState("0");
  const [famePerRun, setFamePerRun] = useState("");
  const [journalCapacity, setJournalCapacity] = useState("");
  const [data, setData] = useState<CraftResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let active = true;
    async function loadRecipes() {
      const response = await fetch("/api/crafting/recipes?limit=2500");
      if (!response.ok) return;
      const json = (await response.json()) as { recipes: RecipeOption[] };
      if (active) {
        setRecipes(json.recipes);
        setRecipeId((current) => json.recipes.some((recipe) => recipe.id === current)
          ? current
          : json.recipes[0]?.id ?? "");
      }
    }
    void loadRecipes();
    return () => { active = false; };
  }, []);

  const visibleRecipes = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return recipes.filter(
      (recipe) =>
        (category === "ALL" || recipe.category === category) &&
        (tierFilter === "ALL" || recipe.tier === Number(tierFilter)) &&
        (enchantmentFilter === "ALL" || recipe.enchantment === Number(enchantmentFilter)) &&
        (!query || recipe.name.toLowerCase().includes(query) || recipe.outputItemId.toLowerCase().includes(query)),
    );
  }, [category, deferredSearch, enchantmentFilter, recipes, tierFilter]);
  const activeRecipeId = visibleRecipes.some((recipe) => recipe.id === recipeId)
    ? recipeId
    : visibleRecipes[0]?.id ?? "";
  const selectedRecipe = recipes.find((recipe) => recipe.id === activeRecipeId) ?? null;

  async function calculate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/crafting/calculate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipeId: activeRecipeId,
          server,
          outputQuality: quality,
          runs,
          materialCity,
          craftCity,
          sellCity,
          materialBuyMethod,
          saleMethod,
          isPremium,
          noFocusReturnRateBasisPoints: noFocusRate,
          focusReturnRateBasisPoints: focusRate,
          focusCost: focusCost ? Number(focusCost) : null,
          focusCostEfficiency,
          stationFeePer100Nutrition: stationFee,
          setupFeeSilver: setupFee,
        }),
      });
      const json = (await response.json()) as CraftResult & { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Crafting request failed.");
      setData(json);
    } catch (craftError) {
      setError(craftError instanceof Error ? craftError.message : "Calculation failed.");
    } finally {
      setLoading(false);
    }
  }

  const comparison = data?.result ?? null;
  const feeRates = getMarketFeeRates({ isPremium, saleMethod });
  const focusCostEfficiency = standardCraftingFocusEfficiency({
    masteryLevel: Number(masteryLevel),
    itemSpecializationLevel: Number(itemSpecLevel),
    siblingSpecializationLevels: Number(siblingSpecLevels),
  });
  const booksNeeded = Number(famePerRun) > 0 && Number(journalCapacity) > 0
    ? Math.ceil((Number(runs) * Number(famePerRun)) / Number(journalCapacity))
    : null;

  return (
    <main className="mx-auto grid max-w-[1600px] gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Crafting Sheet</h1>
          <p className="mt-2 text-sm text-slate-600">Spreadsheet-style crafting comparison based on the RAYEN sheet: editable assumptions above, material rows and focus results below.</p>
        </div>
        <button className="primary-button" onClick={calculate} disabled={loading || !activeRecipeId}>
          {loading ? <RefreshCw className="animate-spin" size={16} /> : <Calculator size={16} />}
          Calculate sheet
        </button>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
        <SheetTitle>Item and market settings</SheetTitle>
        <div className="grid gap-px bg-slate-200 lg:grid-cols-8">
          <SheetCell label="Search craftable items" wide><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Bag, sword, armor…" /></SheetCell>
          <SheetCell label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">All RAYEN categories</option>{RAYEN_CRAFTING_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></SheetCell>
          <SheetCell label="Tier"><select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="ALL">All tiers (T4-T8)</option>{[4,5,6,7,8].map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}</select></SheetCell>
          <SheetCell label="Enchantment"><select value={enchantmentFilter} onChange={(event) => setEnchantmentFilter(event.target.value)}><option value="ALL">All enchantments</option>{[0,1,2,3,4].map((enchantment) => <option key={enchantment} value={enchantment}>.{enchantment}</option>)}</select></SheetCell>
          <SheetCell label="Item to craft" wide>
            <select value={activeRecipeId} onChange={(event) => setRecipeId(event.target.value)}>
              {visibleRecipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name} ({recipe.outputItemId})</option>)}
            </select>
          </SheetCell>
          <SheetCell label="Server"><select value={server} onChange={(event) => setServer(event.target.value)}><option>EUROPE</option><option>AMERICAS</option><option>ASIA</option></select></SheetCell>
          <SheetCell label="Quality"><select value={quality} onChange={(event) => setQuality(event.target.value)}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{["Normal","Good","Outstanding","Excellent","Masterpiece"][value - 1]}</option>)}</select></SheetCell>
        </div>
        <div className={`grid max-h-72 gap-2 overflow-y-auto border-t border-slate-300 bg-slate-50 p-3 transition-opacity sm:grid-cols-2 lg:grid-cols-4 ${search !== deferredSearch ? "opacity-60" : "opacity-100"}`} aria-busy={search !== deferredSearch}>
          {visibleRecipes.slice(0, 100).map((recipe) => <button type="button" key={recipe.id} onClick={() => setRecipeId(recipe.id)} className={`deferred-list-item flex items-center gap-3 rounded-lg border p-2 text-left transition-colors ${recipe.id === activeRecipeId ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-300"}`}><AlbionItemIcon itemId={recipe.outputItemId} size="md" showLabel={false} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{recipe.name}</span><span className="block text-xs text-slate-500">{recipe.category} · T{recipe.tier ?? "?"}.{recipe.enchantment}</span></span></button>)}
          {visibleRecipes.length > 100 ? <p className="p-2 text-xs text-slate-500">Showing the first 100 matches. Narrow the category, tier, enchantment, or search.</p> : null}
        </div>
        <div className="grid gap-px border-t border-slate-300 bg-slate-200 md:grid-cols-4 lg:grid-cols-8">
          <SheetCell label="Runs"><input inputMode="numeric" value={runs} onChange={(event) => setRuns(event.target.value)} /></SheetCell>
          <SheetCell label="Buy materials"><CitySelect value={materialCity} onChange={setMaterialCity} /></SheetCell>
          <SheetCell label="Craft in"><CitySelect value={craftCity} onChange={setCraftCity} /></SheetCell>
          <SheetCell label="Sell in"><CitySelect value={sellCity} onChange={setSellCity} /></SheetCell>
          <SheetCell label="No-focus return %"><BasisPointInput value={noFocusRate} onChange={setNoFocusRate} /></SheetCell>
          <SheetCell label="Focus return %"><BasisPointInput value={focusRate} onChange={setFocusRate} /></SheetCell>
          <SheetCell label="Focus cost"><input inputMode="numeric" value={focusCost} onChange={(event) => setFocusCost(event.target.value)} placeholder="Recipe default" /></SheetCell>
          <SheetCell label="Fee / 100 nutrition"><input inputMode="numeric" value={stationFee} onChange={(event) => setStationFee(event.target.value)} /></SheetCell>
        </div>
        <div className="grid gap-px border-t border-slate-300 bg-slate-200 md:grid-cols-4">
          <SheetCell label="Crafting mastery (0–100)"><input inputMode="numeric" value={masteryLevel} onChange={(event) => setMasteryLevel(event.target.value)} /></SheetCell>
          <SheetCell label="Selected item spec (0–100)"><input inputMode="numeric" value={itemSpecLevel} onChange={(event) => setItemSpecLevel(event.target.value)} /></SheetCell>
          <SheetCell label="Other specs total"><input inputMode="numeric" value={siblingSpecLevels} onChange={(event) => setSiblingSpecLevels(event.target.value)} placeholder="Sum of sibling spec levels" /></SheetCell>
          <div className="bg-emerald-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Focus cost efficiency</p><p className="mt-1 text-xl font-semibold text-emerald-900">{focusCostEfficiency.toLocaleString()}</p><p className="text-xs text-emerald-800">Specs reduce focus cost; they do not change the selected return rate.</p></div>
        </div>
        <div className="grid gap-px border-t border-slate-300 bg-slate-200 md:grid-cols-4 lg:grid-cols-6">
          <SheetCell label="Material pricing"><select value={materialBuyMethod} onChange={(event) => setMaterialBuyMethod(event.target.value as "INSTANT_BUY" | "BUY_ORDER")}><option value="INSTANT_BUY">Instant buy (sell order)</option><option value="BUY_ORDER">Place buy order</option></select></SheetCell>
          <SheetCell label="Output sale"><select value={saleMethod} onChange={(event) => setSaleMethod(event.target.value as MarketSaleMethod)}><option value="FAST_SELL">Quick sell</option><option value="SELL_ORDER">Place sell order</option></select></SheetCell>
          <SheetCell label="Account"><select value={isPremium ? "PREMIUM" : "STANDARD"} onChange={(event) => setIsPremium(event.target.value === "PREMIUM")}><option value="PREMIUM">Premium</option><option value="STANDARD">No Premium</option></select></SheetCell>
          <SheetCell label="Extra fixed fee"><input inputMode="numeric" value={setupFee} onChange={(event) => setSetupFee(event.target.value)} /></SheetCell>
          <div className="bg-white p-3 lg:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Selected recipe</p>
            <div className="mt-1 flex items-center gap-3 text-sm font-semibold">
              {selectedRecipe ? <AlbionItemIcon itemId={selectedRecipe.outputItemId} size="sm" showLabel={false} /> : null}
              <span>{selectedRecipe?.name ?? "Loading recipes…"}</span>
              <span className="font-normal text-slate-500">{selectedRecipe?.ingredientCount ?? 0} materials</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{basisPoints(feeRates.salesTaxBasisPoints)} sales tax{feeRates.setupFeeBasisPoints ? ` + ${basisPoints(feeRates.setupFeeBasisPoints)} sell-order fee` : " · no sell-order fee"}</p>
          </div>
        </div>
        <div className="grid gap-px border-t border-slate-300 bg-slate-200 md:grid-cols-3">
          <SheetCell label="Crafting fame per run"><input inputMode="numeric" value={famePerRun} onChange={(event) => setFamePerRun(event.target.value)} placeholder="From Destiny Board / item" /></SheetCell>
          <SheetCell label="Journal fame capacity"><input inputMode="numeric" value={journalCapacity} onChange={(event) => setJournalCapacity(event.target.value)} placeholder="Selected journal capacity" /></SheetCell>
          <div className="bg-white p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Books needed</p><p className="mt-1 text-xl font-semibold">{booksNeeded ?? "Enter fame values"}</p><p className="text-xs text-slate-500">Rounded up for {runs || 0} runs; use the journal tier you plan to fill.</p></div>
        </div>
        {error ? <p className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
      </section>

      {comparison && data ? <CraftingResults data={data} /> : <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Choose an item and calculate to fill the crafting sheet.</section>}
    </main>
  );
}

function CraftingResults({ data }: { data: CraftResult }) {
  const comparison = data.result;
  const noFocus = comparison.withoutFocus;
  const focus = comparison.withFocus;
  return (
    <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <SheetTitle>Recipe</SheetTitle>
      <div className="grid gap-4 bg-slate-50 p-4 lg:grid-cols-[minmax(240px,0.8fr)_auto_minmax(0,2fr)] lg:items-center">
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-white p-3">
          <AlbionItemIcon itemId={noFocus.outputItemId} quality={noFocus.outputQuality} size="lg" showLabel={false} />
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wide text-emerald-700">Crafted item</span>
            <span className="block font-semibold">{data.outputItemName}</span>
            <span className="block truncate font-mono text-[11px] text-slate-500">{noFocus.outputItemId}</span>
            <span className="block text-xs text-slate-500">{noFocus.outputQuantity} output from {noFocus.runs} runs</span>
          </span>
        </div>
        <span className="hidden text-2xl font-bold text-slate-400 lg:block">←</span>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {noFocus.ingredients.map((ingredient) => (
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3" key={ingredient.itemId}>
              <AlbionItemIcon itemId={ingredient.itemId} size="md" showLabel={false} />
              <span className="min-w-0">
                <span className="block font-semibold">{ingredient.itemName}</span>
                <span className="block truncate font-mono text-[11px] text-slate-500">{ingredient.itemId}</span>
                <span className="block text-xs font-bold text-amber-800">{ingredient.quantityRequired / Math.max(1, noFocus.runs)} per run · {ingredient.quantityRequired} total</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <SheetTitle>Materials</SheetTitle>
      <div className="overflow-x-auto">
        <table className="craft-sheet w-full min-w-[1150px] border-collapse text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-white">
            <tr><th>Material</th><th>Unit price</th><th>Source</th><th>Age</th><th>Required</th><th>Returned<br/>no focus</th><th>Consumed<br/>no focus</th><th>Returned<br/>focus</th><th>Consumed<br/>focus</th><th>Total cost</th><th>Focus return value</th></tr>
          </thead>
          <tbody>
            {noFocus.ingredients.map((ingredient, index) => {
              const focused = focus.ingredients[index];
              return <tr key={ingredient.itemId} className="border-t border-slate-200">
                <td><AlbionItemIcon itemId={ingredient.itemId} size="sm" showLabel={false} /><span className="ml-2 inline-block align-middle"><span className="block font-semibold">{ingredient.itemName}</span><span className="block font-mono text-[11px] text-slate-500">{ingredient.itemId}</span></span></td>
                <NumberCell value={silver(ingredient.unitPrice)} />
                <td>{sourceLabel(ingredient.priceSource)}</td>
                <td>{age(ingredient.priceAgeMinutes)}</td>
                <NumberCell value={ingredient.quantityRequired} />
                <NumberCell value={ingredient.quantityReturned} tone="amber" />
                <NumberCell value={ingredient.netQuantityConsumed} />
                <NumberCell value={focused?.quantityReturned ?? 0} tone="emerald" />
                <NumberCell value={focused?.netQuantityConsumed ?? 0} />
                <NumberCell value={silver(ingredient.totalCost)} />
                <NumberCell value={silver(focused?.returnValue ?? "0")} tone="emerald" />
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      <SheetTitle>Profit comparison</SheetTitle>
      <div className="overflow-x-auto">
        <table className="craft-sheet w-full min-w-[1250px] border-collapse text-sm">
          <thead className="bg-slate-800 text-xs uppercase text-white"><tr><th>Method</th><th>Output price</th><th>Price source</th><th>Age</th><th>Output qty</th><th>Material cost</th><th>Return value</th><th>Station fee</th><th>Market fees</th><th>Investment</th><th>Revenue</th><th>Profit</th><th>ROI</th><th>Profit/focus</th><th>Confidence</th></tr></thead>
          <tbody>
            <ProfitRow label="Without focus" result={noFocus} />
            <ProfitRow label="With focus" result={focus} focused />
          </tbody>
        </table>
      </div>
      <div className="grid gap-px border-t border-slate-300 bg-slate-200 sm:grid-cols-3">
        <SummaryCell label="Extra profit from focus" value={silver(comparison.extraProfitFromFocus)} />
        <SummaryCell label="Silver / focus (SpF)" value={comparison.profitPerFocus?.toLocaleString() ?? "n/a"} />
        <SummaryCell label="Warnings" value={comparison.warnings.join(", ") || "None"} small />
      </div>
    </section>
  );
}

function ProfitRow({ label, result, focused = false }: { label: string; result: CraftSummary; focused?: boolean }) {
  return <tr className="border-t border-slate-200">
    <td className={`font-bold ${focused ? "text-emerald-700" : ""}`}>{label}</td>
    <NumberCell value={silver(result.outputUnitPrice)} />
    <td>{sourceLabel(result.outputPriceSource)}</td><td>{age(result.outputPriceAgeMinutes)}</td>
    <NumberCell value={result.outputQuantity} /><NumberCell value={silver(result.materialCost)} /><NumberCell value={silver(result.returnedMaterialValue)} tone={focused ? "emerald" : "amber"} />
    <NumberCell value={silver(result.stationFee)} /><NumberCell value={silver((BigInt(result.taxes) + BigInt(result.setupFees)).toString())} /><NumberCell value={silver(result.investment)} /><NumberCell value={silver(result.grossRevenue)} />
    <NumberCell value={silver(result.netProfit)} tone={Number(result.netProfit) >= 0 ? "emerald" : "red"} /><NumberCell value={basisPoints(result.roiBasisPoints)} tone={Number(result.netProfit) >= 0 ? "emerald" : "red"} />
    <NumberCell value={result.profitPerFocus?.toLocaleString() ?? "n/a"} /><td><Confidence value={result.confidence} /></td>
  </tr>;
}

function SheetTitle({ children }: { children: React.ReactNode }) { return <h2 className="bg-emerald-800 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white">{children}</h2>; }
function SheetCell({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`grid gap-1 bg-amber-50 p-3 ${wide ? "lg:col-span-2" : ""}`}><span className="text-[11px] font-bold uppercase tracking-wide text-amber-900">{label}</span><span className="[&>input]:w-full [&>input]:bg-white [&>input]:px-2 [&>input]:py-1.5 [&>select]:w-full [&>select]:bg-white [&>select]:px-2 [&>select]:py-1.5">{children}</span></label>; }
function CitySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <select value={value} onChange={(event) => onChange(event.target.value)}>{cities.map((city) => <option key={city}>{city}</option>)}</select>; }
function BasisPointInput({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <input inputMode="numeric" value={(Number(value) / 100).toString()} onChange={(event) => onChange(String(Math.round(Number(event.target.value || 0) * 100)))} />; }
function NumberCell({ value, tone }: { value: string | number; tone?: "emerald" | "amber" | "red" }) { const color = tone === "emerald" ? "bg-emerald-50 text-emerald-800" : tone === "amber" ? "bg-amber-50 text-amber-900" : tone === "red" ? "bg-red-50 text-red-700" : ""; return <td className={`text-right tabular-nums ${color}`}>{value}</td>; }
function SummaryCell({ label, value, small = false }: { label: string; value: string; small?: boolean }) { return <div className="bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className={`mt-1 font-semibold ${small ? "text-xs" : "text-xl"}`}>{value}</p></div>; }
function Confidence({ value }: { value: CraftSummary["confidence"] }) { const color = value === "HIGH" ? "bg-emerald-100 text-emerald-800" : value === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"; return <span className={`rounded px-2 py-1 text-xs font-bold ${color}`}>{value}</span>; }
function sourceLabel(value: string | null) { return value?.replaceAll("_", " ").toLowerCase() ?? "missing"; }
function silver(value: string | null) { return value === null ? "missing" : Number(value).toLocaleString(); }
function basisPoints(value: number | null) { return value === null ? "n/a" : `${(value / 100).toFixed(2)}%`; }
function age(value: number | null) { return value === null ? "unknown" : `${value}m`; }
