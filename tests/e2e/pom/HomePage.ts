import { expect, type Locator, type Page } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly ctaCompareList: Locator;
  readonly whatsappButton: Locator;
  readonly topMarketsSection: Locator;
  readonly liveFeedSection: Locator;
  readonly tickerSection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.ctaCompareList = page.getByRole('link', { name: /Comparar minha lista/i }).first();
    this.whatsappButton = page.getByText(/Falar no WhatsApp/i);
    this.topMarketsSection = page.getByText(/Top mercados monitorados/i);
    this.liveFeedSection = page.getByText(/Feed de ofertas/i);
    this.tickerSection = page.locator('div').filter({ hasText: /Economiza Facil/ }).first();
  }

  async goto() {
    await this.page.goto('/');
    // Espera a página carregar (o seletor do ticker é um bom sinal de que o JS rodou)
    await expect(this.page.getByText(/Economiza Facil/i).first()).toBeVisible({ timeout: 15000 });
  }

  async clickCompareCTA() {
    await this.ctaCompareList.click();
    // Como redireciona para um ID interno no momento, verificamos a URL
    await expect(this.page).toHaveURL(/.*#cta-final/);
  }
}
