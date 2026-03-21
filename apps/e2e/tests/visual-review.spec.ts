import { test } from '@playwright/test';

const PAGES = [
  { name: '01-login', path: '/login' },
  { name: '02-register', path: '/register' },
  // After login:
  { name: '03-dashboard', path: '/' },
  { name: '04-friction-map', path: '/friction-map' },
  { name: '05-teams', path: '/teams' },
  { name: '06-integrations', path: '/integrations' },
  { name: '07-settings', path: '/settings' },
];

test('visual review - login page', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/01-login.png', fullPage: true });
});

test('visual review - register page', async ({ page }) => {
  await page.goto('/register');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/02-register.png', fullPage: true });
});

test('visual review - authenticated pages', async ({ page }) => {
  // Login first
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[type="email"]', 'testuser@tandem.dev');
  await page.fill('input[type="password"]', 'tandem123');
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Screenshot each authenticated page
  const authPages = [
    { name: '03-dashboard', path: '/' },
    { name: '04-friction-map', path: '/friction-map' },
    { name: '05-teams', path: '/teams' },
    { name: '06-integrations', path: '/integrations' },
    { name: '07-settings', path: '/settings' },
  ];

  for (const p of authPages) {
    await page.goto(p.path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/${p.name}.png`, fullPage: true });
  }
});
