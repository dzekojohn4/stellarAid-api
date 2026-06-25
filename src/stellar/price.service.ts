import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

const PRICE_CACHE_KEY = 'stellar:prices';
const PRICE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface StellarPrices {
  xlm: { usd: number };
  usdc: { usd: number };
  updatedAt: string;
}

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshPrices(): Promise<void> {
    try {
      const prices = await this.fetchFromCoinGecko();
      await this.cache.set(PRICE_CACHE_KEY, prices, PRICE_TTL_MS);
      this.logger.log(`Prices updated: XLM=${prices.xlm.usd}, USDC=${prices.usdc.usd}`);
    } catch (err) {
      this.logger.warn(`Price fetch failed, keeping last known price: ${err.message}`);
    }
  }

  async getPrices(): Promise<StellarPrices | null> {
    const cached = await this.cache.get<StellarPrices>(PRICE_CACHE_KEY);
    if (cached) return cached;

    // On cache miss, fetch immediately
    try {
      const prices = await this.fetchFromCoinGecko();
      await this.cache.set(PRICE_CACHE_KEY, prices, PRICE_TTL_MS);
      return prices;
    } catch (err) {
      this.logger.warn(`Price fetch failed on demand: ${err.message}`);
      return null;
    }
  }

  private async fetchFromCoinGecko(): Promise<StellarPrices> {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=stellar%2Cusd-coin&vs_currencies=usd';
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`CoinGecko responded with ${res.status}`);

    const data = (await res.json()) as Record<string, { usd: number }>;
    return {
      xlm: { usd: data['stellar']?.usd ?? 0 },
      usdc: { usd: data['usd-coin']?.usd ?? 1 },
      updatedAt: new Date().toISOString(),
    };
  }
}
