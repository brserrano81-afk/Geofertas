import { test, expect } from '@playwright/test';
import { HomePage } from '../pom/HomePage';

test.describe('Geofertas Smoke Suite', () => {
  test('A Home deve carregar sem erros críticos', async ({ page }) => {
    const homePage = new HomePage(page);
    
    // Captura erros de console
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await homePage.goto();

    // Verifica elementos básicos
    await expect(homePage.tickerSection).toBeVisible();
    await expect(homePage.ctaCompareList).toBeVisible();
    
    // Verifica título
    await expect(page).toHaveTitle(/Economiza Facil/i);

    // No MVP atual, aceitamos avisos, mas não erros que quebrem a página
    // Nota: Ignoramos avisos de variáveis de ambiente não configuradas (VITE_WHATSAPP_ENTRY_URL)
    const criticalErrors = consoleErrors.filter(err => !err.includes('VITE_WHATSAPP_ENTRY_URL'));
    expect(criticalErrors).toHaveLength(0);
  });

  test('Rotas do MVP devem redirecionar para a Home no estado atual', async ({ page }) => {
    const routesToTest = ['/criar-lista', '/resultado-lista', '/resultado-lista'];
    
    for (const route of routesToTest) {
      await page.goto(route);
      await expect(page).toHaveURL(/.*\/$/); // Deve redirecionar para a raiz
    }
  });
});
