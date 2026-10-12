import { expect, test } from '@playwright/test';
const site = process.env.LIVE_SITE_URL;
test.skip(!site, 'Set LIVE_SITE_URL to verify a production build against the real API');
test.use({ video: 'on' });

test('real verified launch, history and full arrival remain usable', async ({ page, request }) => {
  const response = await request.get('https://ship-it-api.coform.workers.dev/v1/world');
  expect(response.ok()).toBe(true);
  const world = await response.json();
  expect(world.launches.length).toBeGreaterThan(0);
  const launch = world.launches[0];
  await page.goto(`${site}?launch=${encodeURIComponent(launch.id)}`);
  await expect(page.getByRole('heading', { name: 'Ship-It', exact: true })).toBeVisible();
  await expect(page.getByText('GitHub deployment success', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Replay launch ' + launch.id, exact: true }),
  ).toBeVisible();
  await expect(page.locator('.demo-status')).toHaveText('APPROACH', { timeout: 12000 });
  await page.screenshot({ path: 'test-results/real-launch-approach.png', fullPage: true });
  await expect(page.locator('.demo-status')).toHaveText('CELEBRATING', { timeout: 5000 });
  await page.screenshot({ path: 'test-results/real-launch-landing.png', fullPage: true });
  await expect(page.locator('.demo-status')).toHaveText('READY FOR ARRIVALS', { timeout: 5000 });
  await expect(page.getByRole('link', { name: 'Visit site' })).toBeVisible();
  await page.getByRole('button', { name: 'Close project details' }).click();
  await page.getByRole('button', { name: 'Try a launch' }).click();
  await expect(page.getByText('LOCAL DEMO · NO REAL DEPLOYMENTS')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exit sandbox' })).toBeVisible();
});

test('production API outage and empty world have useful states', async ({ page }) => {
  await page.route('**/v1/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.goto(site!);
  await expect(page.getByRole('alert').first()).toContainText('temporarily unavailable');
  await page.unroute('**/v1/**');
  await page.route('**/v1/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('/world')
          ? { projects: [], launches: [], nextCursor: null }
          : { items: [], nextCursor: null },
      ),
    }),
  );
  await page.reload();
  await expect(page.getByText('The sky is quiet. Your project could be the first.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try a launch' })).toBeEnabled();
});
