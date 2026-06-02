import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CampaignStats, DonationsPerDay, TopDonor } from './interfaces/campaign-stats.interface';
import { BrowseCampaignsQueryDto, BrowseCampaignsResponseDto } from './dto/browse-campaigns.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { MilestoneResponseDto } from './dto/milestone-response.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const totals = await this.prisma.donation.aggregate({
      where: { campaignId },
      _sum: { amount: true },
      _avg: { amount: true },
    });

    const assetRows = await this.prisma.donation.findMany({
      where: { campaignId },
      distinct: ['assetCode'],
      select: { assetCode: true },
    });

    const perDayRows = await this.prisma.$queryRaw<
      { date: string; count: string; total: string }[]
    >
      `SELECT TO_CHAR("donatedAt", 'YYYY-MM-DD') AS date, COUNT(*) AS count, SUM("amount") AS total
      FROM "donations"
      WHERE "campaignId" = ${campaignId}
      AND "donatedAt" >= ${thirtyDaysAgo}
      GROUP BY date
      ORDER BY date ASC`;

    const topDonorRows = await this.prisma.donation.groupBy({
      by: ['donorId'],
      where: { campaignId },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });

    const donationsPerDay: DonationsPerDay[] = perDayRows.map((row) => ({
      date: row.date,
      count: parseInt(row.count, 10),
      total: parseFloat(row.total),
    }));

    const topDonors: TopDonor[] = topDonorRows.map((row) => ({
      donorId: row.donorId,
      totalDonated: parseFloat(row._sum.amount?.toString() ?? '0'),
      donationCount: row._count._all,
    }));

    return {
      campaignId,
      totalRaised: parseFloat(totals._sum.amount?.toString() ?? '0'),
      donorCount: topDonorRows.length,
      uniqueAssets: assetRows.map((row) => row.assetCode),
      avgDonation: parseFloat(totals._avg.amount?.toString() ?? '0'),
      donationsPerDay,
      topDonors,
    };
  }

  async getCampaignMilestones(campaignId: string): Promise<MilestoneResponseDto[]> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const milestones = await this.prisma.milestone.findMany({
      where: { campaignId },
      include: {
        statusHistory: {
          orderBy: { changedAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return milestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
      targetAmount: milestone.targetAmount.toString(),
      status: milestone.status,
      dueDate: milestone.dueDate,
      completedAt: milestone.completedAt,
      txHash: milestone.txHash,
      statusHistory: milestone.statusHistory.map((entry) => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        changedAt: entry.changedAt,
      })),
    }));
  }

  async createCampaign(userId: string, dto: CreateCampaignDto) {
    const campaign = await this.prisma.campaign.create({
      data: {
        title: dto.title,
        description: dto.description ?? dto.story ?? '',
        goalAmount: new Prisma.Decimal(dto.goalAmount ?? '0'),
        creatorId: userId,
        imageUrl: dto.coverImageUrl,
        category: dto.category,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        milestones: dto.milestones
          ? {
              create: dto.milestones.map((milestone) => ({
                title: milestone.title,
                description: milestone.description,
                targetAmount: new Prisma.Decimal(milestone.targetAmount ?? '0'),
                dueDate: milestone.dueDate ? new Date(milestone.dueDate) : undefined,
                status: 'LOCKED',
                statusHistory: {
                  create: {
                    toStatus: 'LOCKED',
                  },
                },
              })),
            }
          : undefined,
      },
    });

    return campaign;
  }

  async updateCampaign(userId: string, campaignId: string, dto: UpdateCampaignDto) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    if (campaign.creatorId !== userId) {
      throw new ForbiddenException('You are not allowed to update this campaign');
    }

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        title: dto.title ?? campaign.title,
        description: dto.description ?? dto.story ?? campaign.description,
        imageUrl: dto.coverImageUrl ?? campaign.imageUrl,
      },
    });

    return updated;
  }

  async browseCampaigns(
    query: BrowseCampaignsQueryDto,
  ): Promise<BrowseCampaignsResponseDto> {
    const { page, limit, category, status, search, sortBy } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CampaignWhereInput = {
      status: {
        not: 'DRAFT',
      },
    };

    if (category) {
      where.category = {
        equals: category,
        mode: 'insensitive',
      };
    }

    if (status) {
      where.status = status as any;
    }

    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    let orderBy: Prisma.CampaignOrderByWithRelationInput = {};
    switch (sortBy) {
      case 'mostFunded':
        orderBy = { raisedAmount: 'desc' };
        break;
      case 'endingSoon':
        orderBy = { endDate: 'asc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
    }

    const total = await this.prisma.campaign.count({ where });

    const campaigns = await this.prisma.campaign.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        goalAmount: true,
        raisedAmount: true,
        status: true,
        creatorId: true,
        startDate: true,
        endDate: true,
        imageUrl: true,
        category: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            walletAddress: true,
          },
        },
        _count: {
          select: {
            donations: true,
            milestones: true,
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    });

    return {
      data: campaigns,
      total,
      page,
      limit,
    };
  }
}
