import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthChallengeController } from './auth-challenge.controller';

describe('AuthChallengeController', () => {
  let controller: AuthChallengeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthChallengeController],
    }).compile();

    controller = module.get<AuthChallengeController>(AuthChallengeController);
  });

  const VALID_WALLET = 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

  it('returns a unique nonce for each call', () => {
    // Use a valid Ed25519 public key (56-char G-prefixed Stellar address)
    const validWallet = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
    const result1 = controller.getChallenge(validWallet);
    const result2 = controller.getChallenge(validWallet);

    expect(result1.challenge).toBeDefined();
    expect(result2.challenge).toBeDefined();
    expect(result1.challenge).not.toBe(result2.challenge);
  });

  it('challenge format includes stellaraid:login prefix and timestamp', () => {
    const validWallet = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
    const { challenge } = controller.getChallenge(validWallet);

    expect(challenge).toMatch(/^stellaraid:login:[a-f0-9]{32}:\d+$/);
  });

  it('throws BadRequestException for missing wallet address', () => {
    expect(() => controller.getChallenge('')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for invalid Stellar address', () => {
    expect(() => controller.getChallenge('not-a-stellar-address')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for address with wrong prefix', () => {
    expect(() => controller.getChallenge('SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')).toThrow(
      BadRequestException,
    );
  });
});
