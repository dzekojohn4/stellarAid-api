import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { BrowseCampaignsQueryDto, BrowseCampaignsResponseDto } from './dto/browse-campaigns.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCampaign(userId: string, dto: CreateCampaignDto) {
    const milestoneCreates = (dto.milestones || []).map((m) => ({
      title: m.title,
      description: m.description ?? null,
      targetAmount: m.targetAmount ?? undefined,
      dueDate: m.dueDate ? new Date(m.dueDate) : undefined,
    }));

    const acceptedAssets = parseAcceptedAssets(dto.acceptedAssets);

    return this.prisma.campaign.create({
      data: {
        title: dto.title,
        description: dto.description ?? dto.story ?? '',
        story: dto.story ?? null,
        imageUrl: dto.coverImageUrl ?? undefined,
        category: dto.category ?? undefined,
        goalAmount: dto.goalAmount ?? undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: 'ACTIVE',
        creatorId: userId,
        contractId: dto.contractId ?? undefined,
        acceptedAssets: acceptedAssets.length > 0 ? acceptedAssets : undefined,
        milestones:
          milestoneCreates.length > 0 ? { create: milestoneCreates } : undefined,
      },
      include: { milestones: true },
    });
  }

  async updateCampaign(userId: string, campaignId: string, dto: UpdateCampaignDto) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        title: dto.title ?? campaign.title,
        description: dto.description ?? dto.story ?? campaign.description,
        story: dto.story ?? campaign.story,
        imageUrl: dto.coverImageUrl ?? campaign.imageUrl,
      },
    });
  }

  /**
   * Browse public campaigns with pagination, filtering, and sorting
   * Excludes DRAFT campaigns from public listing
   */
  async browseCampaigns(
    query: BrowseCampaignsQueryDto,
  ): Promise<BrowseCampaignsResponseDto> {
    const { page, limit, category, status, search, sortBy } = query;
    const skip = (page - 1) * limit;

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      if (trimmedSearch.length < 3) {
        throw new BadRequestException('Search must be at least 3 characters');
      }
      return this.browseCampaignsWithFullTextSearch({
        page,
        limit,
        skip,
        category,
        status,
        search: trimmedSearch,
      });
    }

    const where: Prisma.CampaignWhereInput = {
      status: { not: 'DRAFT' },
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

    let orderBy: Prisma.CampaignOrderByWithRelationInput;
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

    const [total, campaigns] = await this.prisma.$transaction([
      this.prisma.campaign.count({ where }),
      this.prisma.campaign.findMany({
        where,
        select: campaignBrowseSelect(),
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    return { data: campaigns, total, page, limit };
  }

  async getFeaturedCampaigns() {
    return this.prisma.campaign.findMany({
      where: {
        isFeatured: true,
        status: { not: 'DRAFT' },
      },
      select: campaignBrowseSelect(),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 6,
    });
  }

  async featureCampaign(campaignId: string) {
    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) {
        throw new NotFoundException('Campaign not found');
      }

      if (campaign.isFeatured) {
        return campaign;
      }

      const featuredCount = await tx.campaign.count({
        where: { isFeatured: true },
      });
      if (featuredCount >= 6) {
        throw new BadRequestException('Maximum 6 featured campaigns allowed');
      }

      return tx.campaign.update({
        where: { id: campaignId },
        data: { isFeatured: true },
      });
    });
  }

  async recalculateCampaignStats(campaignId: string) {
    const agg = await this.prisma.donation.aggregate({
      where: {
        campaignId,
        status: 'CONFIRMED',
      },
      _sum: { amount: true },
    });

    const raisedAmount = agg._sum.amount ?? new Prisma.Decimal(0);

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { raisedAmount },
    });
  }

  /**
   * Get campaign statistics (GET /campaigns/:id/stats)
   */
  async getCampaignStats(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const totals = await this.prisma.donation.aggregate({
      where: { campaignId, status: 'CONFIRMED' },
      _sum: { amount: true },
      _count: { donorId: true },
      _avg: { amount: true },
    });

    const uniqueAssets = await this.prisma.donation.findMany({
      where: { campaignId, status: 'CONFIRMED' },
      select: { assetCode: true },
      distinct: ['assetCode'],
    });

    const donationsPerDay = await this.prisma.$queryRaw<
      { date: string; count: bigint; total: number }[]
    >`
      SELECT
        TO_CHAR(d."createdAt", 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count,
        SUM(d.amount)::decimal AS total
      FROM donations d
      WHERE d."campaignId" = ${campaignId}::uuid
        AND d."createdAt" >= ${thirtyDaysAgo}
      GROUP BY TO_CHAR(d."createdAt", 'YYYY-MM-DD')
      ORDER BY date ASC
    `;

    const topDonors = await this.prisma.donation.groupBy({
      by: ['donorId'],
      where: { campaignId, status: 'CONFIRMED' },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    });

    return {
      campaignId,
      totalRaised: Number(totals._sum.amount ?? 0),
      donorCount: totals._count.donorId,
      uniqueAssets: uniqueAssets.map((r) => r.assetCode),
      avgDonation: Number(totals._avg.amount ?? 0),
      donationsPerDay: donationsPerDay.map((r) => ({
        date: r.date,
        count: Number(r.count),
        total: Number(r.total),
      })),
      topDonors: topDonors.map((r) => ({
        donorId: r.donorId,
        totalDonated: Number(r._sum.amount ?? 0),
        donationCount: r._count,
      })),
    };
  }

  /**
   * Create a campaign update (POST /campaigns/:id/updates)
   * Only the campaign creator can post updates.
   * Triggers a notification to all campaign donors.
   */
  async createUpdate(
    campaignId: string,
    creatorId: string,
    dto: { title: string; content: string; imageUrls?: string[] },
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.creatorId !== creatorId) {
      throw new ForbiddenException('Only the campaign creator can post updates');
    }

    const update = await this.prisma.update.create({
      data: {
        campaignId,
        creatorId,
        title: dto.title,
        content: dto.content,
        imageUrls: dto.imageUrls?.length ? dto.imageUrls : undefined,
      },
    });

    // Trigger notifications to all campaign donors
    await this.notifyCampaignDonors(campaignId, update.title);

    return update;
  }

  /**
   * Soft-delete a campaign update (DELETE /campaigns/:id/updates/:updateId)
   * Creator or admin can delete. Sets deletedAt and returns 204.
   */
  async deleteUpdate(
    campaignId: string,
    updateId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    const update = await this.prisma.update.findUnique({
      where: { id: updateId },
    });

    if (!update || update.campaignId !== campaignId) {
      throw new NotFoundException('Update not found for this campaign');
    }

    if (update.deletedAt) {
      throw new NotFoundException('Update not found');
    }

    if (!isAdmin && update.creatorId !== userId) {
      throw new ForbiddenException('Only the creator or an admin can delete updates');
    }

    await this.prisma.update.update({
      where: { id: updateId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Create notifications for all distinct donors of a campaign.
   */
  private async notifyCampaignDonors(campaignId: string, updateTitle: string): Promise<void> {
    const donors = await this.prisma.donation.findMany({
      where: { campaignId, status: 'CONFIRMED' },
      select: { donorId: true },
      distinct: ['donorId'],
    });

    if (donors.length === 0) return;

    const notificationData = donors.map((d) => ({
      userId: d.donorId,
      type: 'CAMPAIGN_UPDATED' as const,
      title: 'Campaign Update',
      message: `A new update "${updateTitle}" has been posted for a campaign you donated to.`,
      relatedId: campaignId,
    }));

    await this.prisma.notification.createMany({
      data: notificationData,
    });
  }

  private async browseCampaignsWithFullTextSearch(input: {
    page: number;
    limit: number;
    skip: number;
    category?: string;
    status?: string;
    search: string;
  }): Promise<BrowseCampaignsResponseDto> {
    const { page, limit, skip, category, status, search } = input;

    const filters = sqlCampaignFilters({ category, status });

    const [countRow, rankedRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: number }[]>`        SELECT COUNT(*)::int AS count
        FROM campaigns c
        WHERE ${filters.whereSql}
          AND to_tsvector('english',
            coalesce(c.title, '') || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.story, '')
          ) @@ plainto_tsquery('english', ${search})
      `,
      this.prisma.$queryRaw<{ id: string; rank: number }[]>`        SELECT c.id,
          ts_rank(
            to_tsvector('english',
              coalesce(c.title, '') || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.story, '')
            ),
            plainto_tsquery('english', ${search})
          ) AS rank
        FROM campaigns c
        WHERE ${filters.whereSql}
          AND to_tsvector('english',
            coalesce(c.title, '') || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.story, '')
          ) @@ plainto_tsquery('english', ${search})
        ORDER BY rank DESC, c."createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
    ]);

    const total = countRow[0]?.count ?? 0;
    const ids = rankedRows.map((r) => r.id);
    if (ids.length === 0) {
      return { data: [], total, page, limit };
    }

    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: ids } },
      select: campaignBrowseSelect(),
    });

    const byId = new Map(campaigns.map((c) => [c.id, c]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];

    return { data: ordered, total, page, limit };
  }
}

function campaignBrowseSelect() {
  return {
    id: true,
    title: true,
    description: true,
    story: true,
    goalAmount: true,
    raisedAmount: true,
    status: true,
    creatorId: true,
    startDate: true,
    endDate: true,
    imageUrl: true,
    category: true,
    isFeatured: true,
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
  } satisfies Prisma.CampaignSelect;
}

function parseAcceptedAssets(values?: string[]) {
  if (!values || values.length === 0) return [];

  return values
    .map((v) => String(v).trim())
    .filter(Boolean)
    .map((v) => {
      if (v.toUpperCase() === 'XLM') {
        return { assetType: 'native' as const };
      }
      const [code, issuer] = v.split(':');
      if (!code || !issuer) return null;
      return { assetType: 'credit' as const, code, issuer };
    })
    .filter(Boolean) as Array<
    | { assetType: 'native' }
    | { assetType: 'credit'; code: string; issuer: string }
  >;
}

function sqlCampaignFilters(input: { category?: string; status?: string }) {
  const whereParts: Prisma.Sql[] = [Prisma.sql`c.status <> 'DRAFT'`];

  if (input.status) {
    whereParts.push(Prisma.sql`c.status = ${input.status}`);
  }

  if (input.category) {
    whereParts.push(Prisma.sql`c.category ILIKE ${input.category}`);
  }

  const whereSql =
    whereParts.length === 1
      ? whereParts[0]
      : Prisma.sql`${Prisma.join(whereParts, Prisma.sql` AND `)}`;

  return { whereSql };
}
