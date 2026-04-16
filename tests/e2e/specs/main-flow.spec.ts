import { test, expect } from '@playwright/test';
import { HomePage } from '../pom/HomePage';

test.describe('Geofertas Main Flow', () => {
  test('O usuário deve conseguir ver mercados e ofertas na Home', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    // Valida seções principais de dados
    await expect(homePage.topMarketsSection).toBeVisible();
    await expect(homePage.liveFeedSection).toBeVisible();

    // Valida se há pelo menos um card de mercado ou oferta (dados reais ou fallback)
    const marketCards = page.locator('div[style*="background: rgba(255, 255, 255, 0.16)"], div[style*="background: rgba(255, 255, 255, 0.07)"]');
    await expect(marketCards.first()).toBeVisible();
  });

  test('O CTA de comparação deve levar à seção correta', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.clickCompareCTA();
    
    // Verifica se a âncora #cta-final está visível
    const ctaFinalSection = page.locator('#cta-final');
    await expect(ctaFinalSection).toBeInViewport();
  });
});
