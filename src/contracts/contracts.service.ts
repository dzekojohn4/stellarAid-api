import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Inject, CACHE_MANAGER } from '@nestjs/common';
import { Server, StrKey } from '@stellar/stellar-sdk';

@Injectable()
export class ContractsService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async getContractTransactions(contractId: string, limit = 20, cursor?: string) {
    if (!StrKey.isValidEd25519PublicKey(contractId)) {
      throw new BadRequestException('Invalid Stellar contract ID');
    }

    const cacheKey = `contract-transactions:${contractId}:${limit}:${cursor ?? 'start'}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon.stellar.org';
    const server = new Server(horizonUrl);

    const query = server
      .operations()
      .forAccount(contractId)
      .limit(limit)
      .order('desc');

    if (cursor) {
      query.cursor(cursor);
    }

    try {
      const response = await query.call();
      const records = response.records as Array<Record<string, any>>;

      const data = records.map((record) => ({
        type: record.type,
        amount: record.amount ?? null,
        asset: this.formatAsset(record),
        from: record.from ?? null,
        to: record.to ?? null,
        timestamp: record.created_at,
        txHash: record.transaction_hash,
      }));

      const nextCursor = records.length > 0 ? records[records.length - 1].paging_token : null;
      const result = { data, nextCursor };

      await this.cacheManager.set(cacheKey, result, 60);
      return result;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to fetch transactions from Stellar Horizon: ${error?.message ?? 'unknown error'}`,
      );
    }
  }

  private formatAsset(record: Record<string, any>): string | null {
    if (record.asset_type === 'native') {
      return 'XLM';
    }

    if (record.asset_code && record.asset_issuer) {
      return `${record.asset_code}:${record.asset_issuer}`;
    }

    return null;
  }
}
