/* Deterministic browser regression: real UI, explicitly fixture-backed API. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node.js CommonJS QA entrypoint. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:3100';
const output = process.env.QA_OUTPUT || 'output/playwright/scanner';

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const calls = [], errors = [], timings = [], checks = [];
  let postCount = 0, failNextPost = false, holdPostMs = 0;
  const rows = [1, 2, 5].flatMap(quality => Array.from({ length: 130 }, (_, i) => ({
    itemId: `T4_TEST_${i}`, itemName: `Test item ${String(i).padStart(3, '0')}`, category: i % 2 ? 'Armor' : 'Weapons', quality,
    sourceCity: i % 2 ? 'THETFORD' : 'BRIDGEWATCH', destinationCity: 'BLACK_MARKET', purchasePrice: '100000', expectedSalePrice: '200000',
    recommendedQuantity: 10, totalWeightGrams: 10000, investment: '1000000', grossRevenue: '2000000', marketValue: '2000000',
    taxes: '80000', setupFees: '0', netProfit: '920000', roiBasisPoints: 9200, profitPerKgSilver: 92000, profitPerMinuteSilver: null,
    sourcePriceAgeMinutes: 5, destinationPriceAgeMinutes: 5, score: 100, confidence: 'MEDIUM', isProfitable: true,
    warnings: ['Quantity unknown'], purchasePriceSource: 'PUBLIC', salePriceSource: 'PUBLIC',
    purchasePriceLabel: 'Public API', salePriceLabel: 'Public API',
  })));
  const result = opportunities => ({ opportunities, scannedAt: new Date().toISOString(), scannedItems: 130, scannedMarkets: 6, evaluatedRoutes: 390, freshPriceRows: 390 });
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/render.albiononline.com/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e2e8f0"/></svg>' }));
  await page.route('**/api/items?**', r => r.fulfill({ json: { count: 130, categories: ['Weapons', 'Armor'], items: [] } }));
  await page.route('**/api/black-market-flips**', async route => {
    const req = route.request();
    const params = req.method() === 'POST' ? JSON.parse(req.postData()) : Object.fromEntries(new URL(req.url()).searchParams);
    calls.push({ method: req.method(), params });
    if (req.method() === 'GET') {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (params.server !== 'EUROPE') return route.fulfill({ status: 404, json: { error: 'No fixture coverage for this server' } }).catch(() => {});
      let selected = rows.filter(r => r.destinationCity === params.destinationCity);
      if (params.restoreQuality !== undefined) selected = selected.filter(r => params.restoreQuality === '0' ? r.quality <= 4 : r.quality === Number(params.restoreQuality));
      return route.fulfill({ json: result(selected) }).catch(() => {});
    }
    postCount++;
    await new Promise(resolve => setTimeout(resolve, holdPostMs || 100));
    if (failNextPost) { failNextPost = false; return route.fulfill({ status: 503, json: { error: 'Fixture upstream unavailable' } }).catch(() => {}); }
    const ids = params.itemIds ? params.itemIds.split(',') : Array.from({ length: 50 }, (_, i) => `T4_TEST_${i}`);
    const data = result(rows.filter(r => ids.includes(r.itemId)));
    if (params.rollingCursor !== undefined) data.rollingCoverage = { itemIds: ids, completedItems: params.rollingCursor ? 100 : 50, totalItems: 130, nextCursor: params.rollingCursor ? 'T4_TEST_100' : 'T4_TEST_50' };
    return route.fulfill({ contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'started', scannedItems: ids.length, scannedMarkets: 6 })}\n${JSON.stringify({ type: 'complete', data })}\n` }).catch(() => {});
  });
  const combo = name => page.getByRole('combobox', { name, exact: true });
  const field = name => page.getByRole('spinbutton', { name, exact: true });
  const metric = () => page.getByRole('region', { name: 'Opportunity summary' }).locator('article').first().locator('p').nth(1);
  async function countIs(expected) {
    await page.waitForFunction(n => {
      const e = document.querySelector('[aria-label="Opportunity summary"] article p:nth-child(2)');
      return e && Number(e.textContent.replace(/\D/g, '')) === n;
    }, expected, { timeout: 10000 });
  }
  async function local(name, action, expected) {
    const n = calls.length, started = performance.now();
    await action(); if (expected !== undefined) await countIs(expected);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    timings.push({ name, milliseconds: Math.round(performance.now() - started) });
    await page.waitForTimeout(80);
    assert.equal(calls.length, n, `${name} triggered a network request`);
    assert.equal(await page.getByRole('progressbar', { name: 'Loading saved Black Market coverage' }).count(), 0, `${name} restarted restore UI`);
    checks.push(name);
  }
  try {
    await page.goto(`${base}/black-market`);
    await countIs(130);
    await page.waitForTimeout(300);
    const initialRestores = calls.length;
    await local('quality uses loaded pool', () => combo('Item quality').selectOption('2'), 130);
    await local('all ordinary qualities exclude Masterpiece', () => combo('Item quality').selectOption('0'), 260);
    await local('Masterpiece is locally selectable', () => combo('Item quality').selectOption('5'), 130);
    await local('return to normal quality', () => combo('Item quality').selectOption('1'), 130);
    await local('origin filter', () => combo('Origin market').selectOption('BRIDGEWATCH'), 65);
    await local('origin reset', () => combo('Origin market').selectOption('ALL'), 130);
    await local('category filter', () => combo('Filter results by category').selectOption('Armor'), 65);
    await local('category reset', () => combo('Filter results by category').selectOption('ALL'), 130);
    await local('minimum profit is per unit, not total', () => field('Minimum silver profit per unit').fill('100000'), 0);
    await local('exact per-unit threshold passes', () => field('Minimum silver profit per unit').fill('92000'), 130);
    await local('Premium recalculates and filters locally', () => combo('Premium status').selectOption('STANDARD'), 0);
    await local('restore Premium locally', () => combo('Premium status').selectOption('PREMIUM'), 130);
    await local('ROI filter', () => field('Minimum profit percentage').fill('100'), 0);
    await local('ROI reset', () => field('Minimum profit percentage').fill('20'), 130);
    await local('origin freshness filter', () => field('Maximum origin age (minutes)').fill('1'), 0);
    await local('origin freshness reset', () => field('Maximum origin age (minutes)').fill('60'), 130);
    await local('target freshness filter', () => field('Maximum target age (minutes)').fill('1'), 0);
    await local('target freshness reset', () => field('Maximum target age (minutes)').fill('1440'), 130);
    await local('sort dropdown', () => combo('Sort opportunities by').selectOption('item'), 130);
    await local('sort direction', () => page.getByRole('button', { name: /^Sort by Item\./ }).click(), 130);
    await field('Minimum silver profit per unit').fill('0');
    await page.getByRole('button', { name: 'Next results page', exact: true }).first().click();
    const rolling = page.getByRole('checkbox', { name: 'Rolling coverage: priority matches + catalog batches', exact: true });
    await rolling.check();
    await page.waitForFunction(() => document.body.innerText.includes('Next batch in'), undefined, { timeout: 10000 });
    assert.match(await page.getByRole('navigation', { name: 'Results pages' }).first().innerText(), /Page 2 of/);
    assert.equal(await page.getByRole('button', { name: 'Cancel coverage', exact: true }).count(), 0, 'Rolling job used manual loading UI');
    checks.push('rolling preserves pagination and manual loading state');
    await rolling.uncheck();
    const beforeCold = calls.length;
    await combo('Server').selectOption('ASIA');
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole('button', { name: /^Copy item ID/ }).count(), 0, 'Europe rows leaked into missing Asia coverage');
    assert(calls.length > beforeCold, 'Cold market did not request coverage');
    const beforeWarm = calls.length;
    await combo('Server').selectOption('EUROPE'); await countIs(130);
    assert.equal(calls.length, beforeWarm, 'Warm market was not reused');
    checks.push('cold market isolation and warm-market reuse');
    failNextPost = true;
    await page.getByRole('button', { name: 'Fast scan last coverage', exact: true }).click();
    await page.getByText('Fixture upstream unavailable', { exact: true }).waitFor();
    await countIs(130);
    checks.push('failed refresh retains completed data');
    holdPostMs = 800;
    await page.getByRole('button', { name: 'Fast scan last coverage', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel coverage', exact: true }).waitFor();
    await combo('Server').selectOption('AMERICAS');
    await page.waitForTimeout(1000);
    assert.equal(await page.getByRole('button', { name: /^Copy item ID/ }).count(), 0, 'Late Europe stream contaminated Americas');
    await combo('Server').selectOption('EUROPE'); await countIs(130);
    checks.push('market change aborts manual scan and rejects late stream');
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Horizontal mobile overflow');
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    checks.push('390px mobile layout has no horizontal overflow');
    // A small separate pool makes scheduler priority rotation deterministic.
    const priorityPage = await context.newPage();
    const priorityCalls = [];
    priorityPage.setDefaultTimeout(10000);
    await priorityPage.route('**/render.albiononline.com/**', r => r.fulfill({ status: 204 }));
    await priorityPage.route('**/api/items?**', r => r.fulfill({ json: { count: 130, categories: ['Weapons'] } }));
    await priorityPage.route('**/api/black-market-flips**', async route => {
      const request = route.request();
      const params = request.method() === 'POST' ? JSON.parse(request.postData()) : Object.fromEntries(new URL(request.url()).searchParams);
      priorityCalls.push({ method: request.method(), params });
      const data = result(rows.filter(r => r.itemId === 'T4_TEST_0'));
      if (request.method() === 'GET') return route.fulfill({ json: data });
      if (params.rollingCursor !== undefined) data.rollingCoverage = { itemIds: ['T4_TEST_0'], completedItems: 50, totalItems: 130, nextCursor: 'T4_TEST_50' };
      return route.fulfill({ contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'complete', data })}\n` });
    });
    await priorityPage.goto(`${base}/black-market`);
    await priorityPage.getByText(/Loaded .*saved opportunities/).waitFor();
    await priorityPage.getByText('Paste item IDs instead', { exact: true }).click();
    const selectedIds = priorityPage.getByPlaceholder('T4_BAG,T5_BAG', { exact: true });
    await selectedIds.fill('T8_SELECTED_A');
    const priorityToggle = priorityPage.getByRole('checkbox', { name: 'Rolling coverage: priority matches + catalog batches', exact: true });
    await priorityToggle.check();
    await priorityPage.getByText(/Next batch in/).waitFor();
    await selectedIds.fill('T8_SELECTED_B');
    await priorityPage.getByRole('combobox', { name: 'Item quality', exact: true }).selectOption('2');
    const deadline = Date.now() + 16000;
    while (priorityCalls.filter(c => c.method === 'POST').length < 3 && Date.now() < deadline) await priorityPage.waitForTimeout(100);
    await priorityToggle.uncheck();
    const priorityPosts = priorityCalls.filter(c => c.method === 'POST');
    assert(priorityPosts.length >= 3, 'Stable scheduler did not complete alternating jobs');
    assert(priorityPosts[0].params.itemIds.includes('T8_SELECTED_A'));
    assert.equal(priorityPosts[1].params.rollingCursor, '', 'Quality change restarted the queue at priority');
    assert(priorityPosts[2].params.itemIds.includes('T8_SELECTED_B'), 'Scheduler captured stale selected IDs');
    assert(!priorityPosts[2].params.itemIds.includes('T8_SELECTED_A'), 'Removed selection remained in priority closure');
    checks.push('stable rolling queue reads latest selected IDs after quality changes');
    await priorityPage.close();
    assert.deepEqual(errors, [], 'Browser JavaScript errors');
    const report = { fixtureBacked: true, base, initialRestores, requests: calls.length, postCount, checks, timings, javascriptErrors: errors, visibleCount: await metric().innerText() };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
