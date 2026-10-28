import { expect, test, type Page } from '@playwright/test';

const TEN_THIRDS = '3.333333333333333333333333333333333';
const BIG = '1234567890123456789012345678901234'; // 34 digits, the operand limit

const entry = (page: Page) => page.locator('.display-entry');
const key = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Wait for React to mount (and register its keyboard listener) before typing.
  await expect(entry(page)).toHaveText('0');
});

test('adds 0.1 and 0.2 exactly through the real API', async ({ page }) => {
  const response = page.waitForResponse('**/api/v1/calculate');
  await page.keyboard.type('0.1+0.2');
  await page.keyboard.press('Enter');

  expect(await (await response).json()).toEqual({ result: '0.3', rounded: false });
  await expect(entry(page)).toHaveText('0.3');
  await expect(page.getByText('≈ rounded to 34 digits')).toHaveCount(0);
});

test('divides 10 by 3 to a rounded 34-digit result, shown in history and the inspector', async ({ page }) => {
  for (const name of ['1', '0', 'divide', '3', 'equals']) await key(page, name).click();

  await expect(entry(page)).toHaveText(TEN_THIRDS);
  await expect(page.getByText('≈ rounded to 34 digits')).toBeVisible();
  await expect(page.locator('.history-row').first()).toContainText('10 ÷ 3');
  await expect(page.getByText('{"operation":"divide","operands":["10","3"]}')).toBeVisible();
});

test('shows the API error when dividing by zero', async ({ page }) => {
  await page.keyboard.type('1250.75/0');
  await page.keyboard.press('Enter');

  await expect(page.locator('.display-error')).toHaveText('Cannot divide by zero.');
  await expect(page.locator('.inspector-meta--error')).toHaveText('← 422');
});

test.describe('on a phone', () => {
  const width = 390;
  test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });

  test('chains 34-digit operands without hiding results or scrolling sideways', async ({ page }) => {
    await page.keyboard.type(`${BIG}+${BIG}`);
    await page.keyboard.press('Enter');
    await expect(entry(page)).toHaveText('2469135780246913578024691357802468');

    await page.getByRole('button', { name: 'History' }).click();
    const row = page.locator('.history-row').first();
    await expect(row).toBeVisible();

    // A mobile layout viewport grows with overflowing content, so compare
    // against the device width rather than window.innerWidth.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
    const value = await row.locator('.history-value').boundingBox();
    expect(value?.width ?? 0).toBeGreaterThan(100);
  });
});
