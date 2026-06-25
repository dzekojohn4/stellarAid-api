import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthVerifyController } from './auth-verify.controller';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Keypair } from '@stellar/stellar-sdk';

const mockJwt = { sign: jest.fn().mockReturnValue('mock-jwt-token') };
const mockConfig = { get: jest.fn().mockReturnValue('') };
const mockPrisma = {
  user: {
    upsert: jest.fn(),
  },
};

describe('AuthVerifyController', () => {
  let controller: AuthVerifyController;

  const keypair = Keypair.random();
  const walletAddress = keypair.publicKey();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthVerifyController],
      providers: [
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<AuthVerifyController>(AuthVerifyController);
    jest.clearAllMocks();
    mockJwt.sign.mockReturnValue('mock-jwt-token');
    mockConfig.get.mockReturnValue('');
    mockPrisma.user.upsert.mockResolvedValue({
      id: 'user-1',
      walletAddress,
      role: 'USER',
    });
  });

  it('returns JWT for valid Ed25519 signature', async () => {
    const challenge = 'stellaraid:login:abc123:1700000000';
    const signedChallenge = Buffer.from(keypair.sign(Buffer.from(challenge))).toString('base64');

    const result = await controller.verify({ walletAddress, signedChallenge, challenge });

    expect(result.accessToken).toBe('mock-jwt-token');
    expect(result.tokenType).toBe('Bearer');
  });

  it('throws 401 for invalid signature', async () => {
    const challenge = 'stellaraid:login:abc123:1700000000';
    const wrongKeypair = Keypair.random();
    const signedChallenge = Buffer.from(wrongKeypair.sign(Buffer.from(challenge))).toString('base64');

    await expect(
      controller.verify({ walletAddress, signedChallenge, challenge }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws 400 for missing signed challenge', async () => {
    await expect(
      controller.verify({ walletAddress, signedChallenge: '', challenge: 'some-challenge' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws 400 for missing challenge', async () => {
    await expect(
      controller.verify({ walletAddress, signedChallenge: 'sig', challenge: '' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws 400 for invalid wallet address', async () => {
    await expect(
      controller.verify({ walletAddress: 'invalid', signedChallenge: 'sig', challenge: 'chal' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('assigns ADMIN role when wallet is on admin allowlist', async () => {
    const challenge = 'stellaraid:login:abc123:1700000000';
    const signedChallenge = Buffer.from(keypair.sign(Buffer.from(challenge))).toString('base64');

    mockConfig.get.mockReturnValue(walletAddress);
    mockPrisma.user.upsert.mockResolvedValue({ id: 'user-1', walletAddress, role: 'ADMIN' });

    const result = await controller.verify({ walletAddress, signedChallenge, challenge });

    expect(result.accessToken).toBe('mock-jwt-token');
    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN' }),
    );
  });
});
