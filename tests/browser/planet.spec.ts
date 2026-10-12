import { expect, test } from '@playwright/test';

test('explore, launch, share, setup and keyboard controls', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Small ships. Big universe.' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('LOCAL DEMO · NO REAL DEPLOYMENTS')).toBeVisible();
  await page.screenshot({ path: 'test-results/planet-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Try a launch' }).click();
  await expect(
    page.getByRole('complementary', { name: 'Little Orbit project details' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/launch=sim-0-0/);
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible();
  await page.getByRole('button', { name: 'Close project details' }).click();
  await page.getByRole('searchbox').fill('palette');
  await expect(page.locator('.directory-project')).toHaveCount(1);
  await page.locator('.directory-project').click();
  await expect(page.getByRole('heading', { name: 'Palette Lab', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close project details' }).click();
  await page.getByRole('button', { name: 'Add your project' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause planet rotation' }).click();
  await expect(page.getByRole('button', { name: 'Resume planet rotation' })).toBeVisible();
});

test('deep link, mobile and reduced motion remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?launch=sim-0-0');
  await expect(page.getByRole('heading', { name: 'Little Orbit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reduced motion' })).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({ path: 'test-results/planet-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Close project details' }).click();
  await page.getByRole('searchbox').fill('maya');
  await expect(page.locator('.directory-project')).toHaveCount(1);
});

test('WebGL failure preserves the accessible project directory', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (/webgl/.test(type)) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto('./');
  await expect(page.getByText('A quieter view of the planet.')).toBeVisible();
  await page.getByRole('searchbox').fill('field');
  await expect(page.locator('.directory-project')).toHaveCount(1);
  await page.locator('.directory-project').click();
  await expect(page.getByRole('heading', { name: 'Field Notes', exact: true })).toBeVisible();
});
