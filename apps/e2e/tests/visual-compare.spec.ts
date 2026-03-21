import { test } from '@playwright/test';

test('capture website pages for comparison', async ({ browser }) => {
  // Capture marketing website at localhost:3002
  const websiteCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const websitePage = await websiteCtx.newPage();

  await websitePage.goto('http://localhost:3002', { waitUntil: 'networkidle' });
  await websitePage.waitForTimeout(2000);
  await websitePage.screenshot({ path: 'screenshots/website-hero.png', fullPage: false });

  // Scroll to features
  await websitePage.evaluate(() => document.querySelector('#features')?.scrollIntoView({ behavior: 'instant' }));
  await websitePage.waitForTimeout(1000);
  await websitePage.screenshot({ path: 'screenshots/website-features.png', fullPage: false });

  await websiteCtx.close();
});

test('capture dashboard pages with data', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'testuser@tandemu.dev');
  await page.fill('input[type="password"]', 'tandem123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Screenshot every page
  const pages = [
    { name: 'dashboard', path: '/' },
    { name: 'activity', path: '/activity' },
    { name: 'friction-map', path: '/friction-map' },
    { name: 'teams', path: '/teams' },
    { name: 'integrations', path: '/integrations' },
    { name: 'settings', path: '/settings' },
  ];

  for (const p of pages) {
    await page.goto(`http://localhost:3000${p.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `screenshots/app-${p.name}.png`, fullPage: true });
  }

  // Also capture login page fresh
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/app-login.png', fullPage: true });

  await ctx.close();
});
