"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Calculator, FlaskConical, RefreshCw, Utensils } from "lucide-react";
import { AlbionItemIcon } from "@/app/components/albion-item-icon";
import { standardCraftingFocusEfficiency } from "@/lib/crafting/focus";

type Recipe = { id: string; outputItemId: string; name: string; tier: number | null; enchantment: number; category: "Food" | "Potions"; family: string; outputQuantity: number; ingredientCount: number };
type Ingredient = { itemId: string; itemName: string; quantityRequired: number; quantityReturned: number; netQuantityConsumed: number; unitPrice: string | null; priceSource: string | null; totalCost: string; returnValue: string; priceAgeMinutes: number | null };
type Summary = { outputItemId: string; runs: number; outputQuantity: number; outputUnitPrice: string | null; outputPriceSource: string | null; outputPriceAgeMinutes: number | null; materialCost: string; returnedMaterialValue: string; netMaterialCost: string; stationFee: string; grossRevenue: string; taxes: string; setupFees: string; investment: string; netProfit: string; roiBasisPoints: number | null; focusCost: number | null; ingredients: Ingredient[]; confidence: "LOW" | "MEDIUM" | "HIGH"; warnings: string[] };
type Result = { outputItemName: string; result: { withoutFocus: Summary; withFocus: Summary; extraProfitFromFocus: string; profitPerFocus: number | null; warnings: string[] } };

const cities = ["Bridgewatch", "Caerleon", "Fort Sterling", "Lymhurst", "Martlock", "Thetford"];

export default function CookingPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeId, setRecipeId] = useState("");
  const [category, setCategory] = useState<"ALL" | "Food" | "Potions">("Food");
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("ALL");
  const [family, setFamily] = useState("ALL");
  const [enchantment, setEnchantment] = useState("ALL");
  const [server, setServer] = useState("EUROPE");
  const [runs, setRuns] = useState("10");
  const [materialCity, setMaterialCity] = useState("Caerleon");
  const [craftCity, setCraftCity] = useState("Caerleon");
  const [sellCity, setSellCity] = useState("Caerleon");
  const [noFocusRate, setNoFocusRate] = useState("1520");
  const [focusRate, setFocusRate] = useState("4350");
  const [focusCost, setFocusCost] = useState("");
  const [masteryLevel, setMasteryLevel] = useState("0");
  const [itemSpecLevel, setItemSpecLevel] = useState("0");
  const [siblingSpecLevels, setSiblingSpecLevels] = useState("0");
  const [stationFee, setStationFee] = useState("500");
  const [materialBuyMethod, setMaterialBuyMethod] = useState("INSTANT_BUY");
  const [saleMethod, setSaleMethod] = useState("FAST_SELL");
  const [isPremium, setIsPremium] = useState(true);
  const [maxDataAgeMinutes, setMaxDataAgeMinutes] = useState("1440");
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let active = true;
    void fetch("/api/consumables/recipes").then(async (response) => {
      if (!response.ok) throw new Error("Could not load consumable recipes.");
      const json = await response.json() as { recipes: Recipe[] };
      if (active) { setRecipes(json.recipes); setRecipeId((current) => current || json.recipes[0]?.id || ""); }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load recipes."); });
    return () => { active = false; };
  }, []);

  const families = useMemo(() => Array.from(new Set(recipes
    .filter((recipe) => category === "ALL" || recipe.category === category)
    .map((recipe) => recipe.family))).sort(), [category, recipes]);
  const visibleRecipes = useMemo(() => recipes.filter((recipe) =>
    (category === "ALL" || recipe.category === category) &&
    (family === "ALL" || recipe.family === family) &&
    (tier === "ALL" || recipe.tier === Number(tier)) &&
    (enchantment === "ALL" || recipe.enchantment === Number(enchantment)) &&
    (!deferredSearch.trim() || `${recipe.name} ${recipe.outputItemId}`.toLowerCase().includes(deferredSearch.trim().toLowerCase())),
  ), [category, deferredSearch, enchantment, family, recipes, tier]);
  const activeRecipeId = visibleRecipes.some((recipe) => recipe.id === recipeId)
    ? recipeId
    : visibleRecipes[0]?.id ?? "";
  const selected = recipes.find((recipe) => recipe.id === activeRecipeId) ?? null;
  const focusCostEfficiency = standardCraftingFocusEfficiency({
    masteryLevel: Number(masteryLevel),
    itemSpecializationLevel: Number(itemSpecLevel),
    siblingSpecializationLevels: Number(siblingSpecLevels),
  });

  async function calculate() {
    if (!activeRecipeId) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/crafting/calculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        recipeId: activeRecipeId, server, materialCity, craftCity, sellCity, materialBuyMethod, saleMethod, isPremium,
        outputQuality: 1, runs, noFocusReturnRateBasisPoints: noFocusRate, focusReturnRateBasisPoints: focusRate,
        focusCost: focusCost ? Number(focusCost) : null, focusCostEfficiency, useFocusComparison: true,
        stationFeePer100Nutrition: stationFee, setupFeeSilver: "0", maxDataAgeMinutes,
      }) });
      const json = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Calculation failed.");
      setData(json);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Calculation failed."); }
    finally { setLoading(false); }
  }

  return <main className="mx-auto grid max-w-[1500px] gap-5 px-4 py-7 sm:px-6 lg:px-8">
    <section className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wide text-emerald-700">Consumables workshop</p><h1 className="mt-1 text-3xl font-semibold">Cooking & Potions</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Compare ingredient cost, resource returns, focus, station fees, taxes, live selling prices, and profit for food and potions.</p></div><button className="primary-button" disabled={!activeRecipeId || loading} onClick={() => void calculate()}>{loading ? <RefreshCw className="animate-spin" size={16} /> : <Calculator size={16} />}Calculate</button></section>

    <section className="panel grid gap-4 rounded-lg p-5">
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
        {(["Food", "Potions", "ALL"] as const).map((value) => <button key={value} type="button" onClick={() => { setCategory(value); setFamily("ALL"); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${category === value ? "bg-emerald-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>{value === "ALL" ? "All consumables" : value}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Field label="Family"><select value={family} onChange={(e) => setFamily(e.target.value)}><option value="ALL">All families</option>{families.map((value) => <option key={value}>{value}</option>)}</select></Field>
        <Field label="Search"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Stew, omelette, poison…" /></Field>
        <Field label="Tier"><select value={tier} onChange={(e) => setTier(e.target.value)}><option value="ALL">All tiers</option>{[2,3,4,5,6,7,8].map((value) => <option key={value} value={value}>Tier {value}</option>)}</select></Field>
        <Field label="Enchantment"><select value={enchantment} onChange={(e) => setEnchantment(e.target.value)}><option value="ALL">All enchantments</option>{[0,1,2,3,4].map((value) => <option key={value} value={value}>.{value}</option>)}</select></Field>
        <Field label="Server"><select value={server} onChange={(e) => setServer(e.target.value)}><option>EUROPE</option><option>AMERICAS</option><option>ASIA</option></select></Field>
        <Field label="Runs"><input type="number" min="1" value={runs} onChange={(e) => setRuns(e.target.value)} /></Field>
        <Field label="Maximum price age"><select value={maxDataAgeMinutes} onChange={(e) => setMaxDataAgeMinutes(e.target.value)}><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440">24 hours</option><option value="10080">7 days</option></select></Field>
      </div>
      <div className={`grid max-h-72 gap-2 overflow-y-auto rounded-lg bg-slate-50 p-3 transition-opacity sm:grid-cols-2 lg:grid-cols-4 ${search !== deferredSearch ? "opacity-60" : "opacity-100"}`} aria-busy={search !== deferredSearch}>
        {visibleRecipes.slice(0, 120).map((recipe) => <button key={recipe.id} type="button" onClick={() => setRecipeId(recipe.id)} className={`deferred-list-item flex items-center gap-3 rounded-lg border p-2 text-left transition-colors ${recipe.id === activeRecipeId ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-300"}`}><AlbionItemIcon itemId={recipe.outputItemId} showLabel={false} /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{recipe.name}</span><span className="block text-xs text-slate-500">{recipe.family} | T{recipe.tier}.{recipe.enchantment} | makes {recipe.outputQuantity}</span></span></button>)}
        {visibleRecipes.length > 120 ? <p className="p-3 text-xs text-slate-500 sm:col-span-2 lg:col-span-4">Showing the first 120 matches. Narrow the family, tier, enchantment, or search.</p> : null}
        {visibleRecipes.length === 0 ? <p className="p-4 text-sm text-slate-500">No matching consumable recipes.</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Buy ingredients in"><City value={materialCity} setValue={setMaterialCity} /></Field><Field label="Cook/brew in"><City value={craftCity} setValue={setCraftCity} /></Field><Field label="Sell in"><City value={sellCity} setValue={setSellCity} /></Field><Field label="Ingredient purchase"><select value={materialBuyMethod} onChange={(e) => setMaterialBuyMethod(e.target.value)}><option value="INSTANT_BUY">Instant buy</option><option value="BUY_ORDER">Buy order estimate</option></select></Field><Field label="Selling method"><select value={saleMethod} onChange={(e) => setSaleMethod(e.target.value)}><option value="FAST_SELL">Quick sell</option><option value="SELL_ORDER">Sell order</option></select></Field><Field label="Premium"><select value={isPremium ? "yes" : "no"} onChange={(e) => setIsPremium(e.target.value === "yes")}><option value="yes">Premium</option><option value="no">No Premium</option></select></Field><Field label="Station fee / 100 nutrition"><input type="number" min="0" value={stationFee} onChange={(e) => setStationFee(e.target.value)} /></Field><Field label="Focus cost override"><input type="number" min="1" value={focusCost} onChange={(e) => setFocusCost(e.target.value)} placeholder="Use recipe and specs" /></Field><Field label="No-focus return %"><Percent value={noFocusRate} setValue={setNoFocusRate} /></Field><Field label="Focus return %"><Percent value={focusRate} setValue={setFocusRate} /></Field></div>
      <div className="grid gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Cooking/alchemy mastery"><input type="number" min="0" max="100" value={masteryLevel} onChange={(e) => setMasteryLevel(e.target.value)} /></Field><Field label="Selected recipe spec"><input type="number" min="0" max="100" value={itemSpecLevel} onChange={(e) => setItemSpecLevel(e.target.value)} /></Field><Field label="Other recipe specs total"><input type="number" min="0" value={siblingSpecLevels} onChange={(e) => setSiblingSpecLevels(e.target.value)} /></Field><div><p className="text-xs font-bold uppercase text-indigo-700">Focus cost efficiency</p><p className="mt-2 text-2xl font-semibold text-indigo-950">{focusCostEfficiency.toLocaleString()}</p><p className="mt-1 text-xs text-indigo-700">Used with the recipe base focus cost.</p></div></div>
      {selected ? <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><AlbionItemIcon itemId={selected.outputItemId} size="lg" showLabel={false} /><div><p className="font-semibold">{selected.name}</p><p className="text-xs text-slate-600">{selected.outputItemId} · {selected.ingredientCount} ingredients</p></div></div> : null}
      {error ? <p className="rounded bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>

    {data ? <Results data={data} /> : <section className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Select a recipe and calculate to see profit with and without focus.</section>}
  </main>;
}

function Results({ data }: { data: Result }) {
  const noFocus = data.result.withoutFocus;
  const focus = data.result.withFocus;
  return <section className="grid gap-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      <Card label="No-focus profit" value={silver(noFocus.netProfit)} tone={BigInt(noFocus.netProfit) >= 0n ? "good" : "bad"} />
      <Card label="Focus profit" value={silver(focus.netProfit)} tone={BigInt(focus.netProfit) >= 0n ? "good" : "bad"} />
      <Card label="Extra profit from focus" value={silver(data.result.extraProfitFromFocus)} />
      <Card label="No-focus ROI" value={pct(noFocus.roiBasisPoints)} />
      <Card label="Focus ROI" value={pct(focus.roiBasisPoints)} />
      <Card label="Profit per focus" value={data.result.profitPerFocus?.toLocaleString() ?? "unknown"} />
    </div>
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table><thead><tr><th>Ingredient</th><th>Required</th><th>Returned</th><th>Net consumed</th><th>Unit price</th><th>Price source</th><th>Total cost</th><th>Freshness</th></tr></thead><tbody>{focus.ingredients.map((ingredient) => <tr key={ingredient.itemId}><td><span className="flex items-center gap-2"><AlbionItemIcon itemId={ingredient.itemId} size="sm" showLabel={false}/><span><b>{ingredient.itemName}</b><small className="block text-slate-500">{ingredient.itemId}</small></span></span></td><td>{ingredient.quantityRequired}</td><td>{ingredient.quantityReturned}</td><td>{ingredient.netQuantityConsumed}</td><td>{silver(ingredient.unitPrice)}</td><td>{sourceLabel(ingredient.priceSource)}</td><td>{silver(ingredient.totalCost)}</td><td>{freshness(ingredient.priceAgeMinutes)}</td></tr>)}</tbody></table></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card label="Output quantity" value={noFocus.outputQuantity.toLocaleString()} /><Card label="Material cost" value={silver(noFocus.materialCost)} /><Card label="Returned value (focus)" value={silver(focus.returnedMaterialValue)} /><Card label="Net material cost (focus)" value={silver(focus.netMaterialCost)} /><Card label="Station fee" value={silver(noFocus.stationFee)} /><Card label="Gross revenue" value={silver(noFocus.grossRevenue)} /><Card label="Taxes & setup" value={silver((BigInt(noFocus.taxes) + BigInt(noFocus.setupFees)).toString())} /><Card label="Output price" value={silver(noFocus.outputUnitPrice)} /><Card label="Output source" value={sourceLabel(noFocus.outputPriceSource)} /><Card label="Output freshness" value={freshness(noFocus.outputPriceAgeMinutes)} /><Card label="Investment" value={silver(noFocus.investment)} /><Card label="Confidence" value={noFocus.confidence} /></div>
    {data.result.warnings.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-semibold text-amber-950">Check before cooking or brewing</p><div className="mt-2 flex flex-wrap gap-2">{data.result.warnings.map((warning) => <span key={warning} className="rounded bg-white px-2 py-1 text-xs text-amber-900">{warning}</span>)}</div></div> : null}
  </section>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field-label">{label}<span className="[&>input]:field-input [&>select]:field-input">{children}</span></label>}
function City({value,setValue}:{value:string;setValue:(x:string)=>void}){return <select value={value} onChange={(e)=>setValue(e.target.value)}>{cities.map(x=><option key={x}>{x}</option>)}</select>}
function Percent({value,setValue}:{value:string;setValue:(x:string)=>void}){return <input type="number" min="0" max="100" step="0.1" value={Number(value)/100} onChange={(e)=>setValue(String(Math.round(Number(e.target.value)*100)))}/>}
function Card({label,value,tone}:{label:string;value:string;tone?:"good"|"bad"}){const Icon=label.includes("focus")?FlaskConical:Utensils;return <article className={`rounded-lg border p-4 ${tone==="good"?"border-emerald-200 bg-emerald-50":tone==="bad"?"border-red-200 bg-red-50":"border-slate-200 bg-white"}`}><Icon size={18} className="text-emerald-700"/><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></article>}
function silver(x:string|null){return x===null?"missing":Number(x).toLocaleString()}
function pct(x:number|null){return x===null?"n/a":`${(x/100).toFixed(2)}%`}
function freshness(minutes:number|null){return minutes===null?"unknown":minutes<60?`${minutes}m`:`${Math.round(minutes/60)}h`}
function sourceLabel(source:string|null){return source?.replaceAll("_", " ").toLowerCase() ?? "missing"}
