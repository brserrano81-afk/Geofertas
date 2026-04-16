import { test, expect } from '@playwright/test';
import { HomePage } from '../pom/HomePage';

test.describe('Geofertas Visual Regression', () => {
  test('A Home deve manter a consistência visual', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    // Tira um print da página inteira para comparação
    // Nota: A primeira execução criará o baseline
    await expect(page).toHaveScreenshot('home-desktop.png', {
      fullPage: true,
      mask: [homePage.tickerSection], // Mascara o ticker pois ele está em constante movimento
      maxDiffPixelRatio: 0.1
    });
  });

  test('A Home deve ser responsiva no mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const homePage = new HomePage(page);
    await homePage.goto();

    await expect(page).toHaveScreenshot('home-mobile.png', {
      fullPage: true,
      mask: [homePage.tickerSection],
      maxDiffPixelRatio: 0.1
    });
  });
});
