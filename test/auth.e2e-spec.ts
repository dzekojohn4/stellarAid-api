import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Keypair } from '@stellar/stellar-sdk';

const mockPrisma = {
  user: {
    upsert: jest.fn().mockResolvedValue({
      id: 'test-user-id',
      walletAddress: '',
      role: 'USER',
      displayName: 'Test User',
    }),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const keypair = Keypair.random();
  const walletAddress = keypair.publicKey();

  beforeAll(async () => {
    mockPrisma.user.upsert.mockResolvedValue({
      id: 'test-user-id',
      walletAddress,
      role: 'USER',
      displayName: 'Test User',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /auth/challenge', () => {
    it('returns a challenge nonce for a valid wallet address', async () => {
      const res = await request(app.getHttpServer())
        .get(`/auth/challenge?walletAddress=${walletAddress}`)
        .expect(200);

      expect(res.body).toHaveProperty('challenge');
      expect(res.body.challenge).toMatch(/^stellaraid:login:[a-f0-9]{32}:\d+$/);
    });

    it('returns 400 for an invalid wallet address', async () => {
      await request(app.getHttpServer())
        .get('/auth/challenge?walletAddress=invalid-address')
        .expect(400);
    });

    it('returns 400 when walletAddress is missing', async () => {
      await request(app.getHttpServer())
        .get('/auth/challenge')
        .expect(400);
    });
  });

  describe('POST /auth/verify', () => {
    it('returns JWT for valid Ed25519 signature', async () => {
      const challengeRes = await request(app.getHttpServer())
        .get(`/auth/challenge?walletAddress=${walletAddress}`)
        .expect(200);

      const { challenge } = challengeRes.body as { challenge: string };
      const signedChallenge = Buffer.from(
        keypair.sign(Buffer.from(challenge)),
      ).toString('base64');

      const res = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ walletAddress, signedChallenge, challenge })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.tokenType).toBe('Bearer');
    });

    it('returns 401 for invalid signature', async () => {
      const challengeRes = await request(app.getHttpServer())
        .get(`/auth/challenge?walletAddress=${walletAddress}`)
        .expect(200);

      const { challenge } = challengeRes.body as { challenge: string };
      const wrongKeypair = Keypair.random();
      const signedChallenge = Buffer.from(
        wrongKeypair.sign(Buffer.from(challenge)),
      ).toString('base64');

      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ walletAddress, signedChallenge, challenge })
        .expect(401);
    });

    it('returns 400 for missing fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ walletAddress })
        .expect(400);
    });
  });

  describe('Protected routes', () => {
    it('returns 401 on protected endpoint without JWT', async () => {
      await request(app.getHttpServer())
        .get('/users/me')
        .expect(401);
    });

    it('returns success on protected endpoint with valid JWT', async () => {
      const challengeRes = await request(app.getHttpServer())
        .get(`/auth/challenge?walletAddress=${walletAddress}`)
        .expect(200);

      const { challenge } = challengeRes.body as { challenge: string };
      const signedChallenge = Buffer.from(
        keypair.sign(Buffer.from(challenge)),
      ).toString('base64');

      const loginRes = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ walletAddress, signedChallenge, challenge })
        .expect(201);

      const { accessToken } = loginRes.body as { accessToken: string };

      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect([200, 404]).toContain(res.status);
    });
  });
});
