import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsService } from './contracts.service';
import { ContractTransactionsQueryDto } from './dto/contract-transactions-query.dto';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('contracts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get(':contractId/transactions')
  async getContractTransactions(
    @Param('contractId') contractId: string,
    @Query() query: ContractTransactionsQueryDto,
  ) {
    return this.contractsService.getContractTransactions(
      contractId,
      query.limit,
      query.cursor,
    );
  }
}
