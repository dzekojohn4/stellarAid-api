import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';

const testCampaign = {
  id: 'campaign-e2e-1',
  title: 'E2E Test Campaign',
  description: 'A campaign for E2E testing',
  goalAmount: 10000,
  raisedAmount: 0,
  status: 'ACTIVE',
  creatorId: 'creator-user-id',
  milestones: [],
  creator: { id: 'creator-user-id', displayName: 'Creator', avatarUrl: null, walletAddress: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN' },
  _count: { donations: 0, milestones: 0 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockPrisma = {
  campaign: {
    create: jest.fn().mockResolvedValue(testCampaign),
    findUnique: jest.fn().mockResolvedValue(testCampaign),
    findMany: jest.fn().mockResolvedValue([testCampaign]),
    update: jest.fn().mockResolvedValue(testCampaign),
    count: jest.fn().mockResolvedValue(1),
  },
  user: {
    upsert: jest.fn().mockResolvedValue({ id: 'creator-user-id', walletAddress: '', role: 'USER', displayName: 'Creator' }),
    findUnique: jest.fn().mockResolvedValue({ id: 'creator-user-id', walletAddress: '', role: 'USER' }),
  },
  donation: {
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  update: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  $transaction: jest.fn().mockResolvedValue([1, [testCampaign]]),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

describe('Campaigns (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let authToken: string;

  const creatorKeypair = Keypair.random();

  beforeAll(async () => {
    mockPrisma.user.upsert.mockImplementation(({ create }: { create: { walletAddress: string } }) =>
      Promise.resolve({ id: 'creator-user-id', walletAddress: create?.walletAddress ?? '', role: 'USER', displayName: 'Creator' }),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    authToken = jwtService.sign({ sub: 'creator-user-id', walletAddress: creatorKeypair.publicKey(), role: 'USER' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /campaigns', () => {
    it('creates campaign and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'E2E Test Campaign',
          description: 'A campaign for E2E testing',
          goalAmount: 10000,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('E2E Test Campaign');
    });

    it('returns 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/campaigns')
        .send({ title: 'Unauthorized' })
        .expect(401);
    });
  });

  describe('GET /campaigns', () => {
    it('returns paginated campaign list', async () => {
      const res = await request(app.getHttpServer())
        .get('/campaigns')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('GET /campaigns/:id', () => {
    it('returns the correct campaign by id', async () => {
      const res = await request(app.getHttpServer())
        .get('/campaigns/campaign-e2e-1')
        .expect(200);

      expect(res.body.id).toBe('campaign-e2e-1');
    });

    it('returns 404 for unknown campaign id', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get('/campaigns/nonexistent-id')
        .expect(404);
    });
  });

  describe('PATCH /campaigns/:id', () => {
    it('rejects update from a non-creator', async () => {
      const nonCreatorToken = jwtService.sign({
        sub: 'other-user-id',
        walletAddress: Keypair.random().publicKey(),
        role: 'USER',
      });

      await request(app.getHttpServer())
        .patch('/campaigns/campaign-e2e-1')
        .set('Authorization', `Bearer ${nonCreatorToken}`)
        .send({ title: 'Unauthorized Update' })
        .expect(400);
    });
  });
});
