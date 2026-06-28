import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Kyc, KycDocument, KycReviewStatus } from './schemas/kyc.schema';
import { User, UserDocument, KycStatus } from './schemas/user.schema';

@Injectable()
export class KycService {
  constructor(
    @InjectModel(Kyc.name) private readonly kycModel: Model<KycDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findByUserId(userId: string): Promise<KycDocument | null> {
    return this.kycModel.findOne({ userId }).exec();
  }

  async create(userId: string, documentType: string, documentUrl: string): Promise<KycDocument> {
    // Check if user exists
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user already has a pending or approved KYC submission
    const existingKyc = await this.findByUserId(userId);
    if (existingKyc && (existingKyc.status === KycReviewStatus.PENDING || existingKyc.status === KycReviewStatus.APPROVED)) {
      throw new ConflictException('KYC document already submitted or approved');
    }

    // Create new KYC submission
    const kyc = await this.kycModel.create({
      userId,
      documentType,
      documentUrl,
      status: KycReviewStatus.PENDING,
    });

    // Update user's kycStatus to pending
    await this.userModel.findByIdAndUpdate(userId, { kycStatus: KycStatus.PENDING });

    return kyc;
  }
}
