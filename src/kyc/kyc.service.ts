import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Kyc, KycDocument } from './schemas/kyc.schema';
import { KycReviewStatus } from './schemas/kyc.schema';
import { UsersService } from '../users/users.service';
import { KycStatus } from '../users/schemas/user.schema';

@Injectable()
export class KycService {
  constructor(
    @InjectModel(Kyc.name) private readonly kycModel: Model<KycDocument>,
    private readonly usersService: UsersService,
  ) {}

  async findByUserId(userId: string): Promise<KycDocument | null> {
    return this.kycModel.findOne({ userId }).exec();
  }

  async create(userId: string, documentType: string, documentUrl: string): Promise<KycDocument> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user already has a pending or approved KYC submission
    const existingKyc = await this.findByUserId(userId);
    if (existingKyc && (existingKyc.status === KycReviewStatus.PENDING || existingKyc.status === KycReviewStatus.APPROVED)) {
      throw new ConflictException('You already have a pending or approved KYC submission');
    }

    // Create new KYC document
    const kyc = await this.kycModel.create({
      userId,
      documentType,
      documentUrl,
      status: KycReviewStatus.PENDING,
      submittedAt: new Date(),
    });

    // Update user's KYC status to pending
    await this.usersService.update(userId, { kycStatus: KycStatus.PENDING });

    return kyc;
  }

  async findById(id: string): Promise<KycDocument | null> {
    return this.kycModel.findById(id).exec();
  }

  async findAll(): Promise<KycDocument[]> {
    return this.kycModel.find().exec();
  }

  async updateStatus(id: string, status: KycReviewStatus, reviewNote?: string): Promise<KycDocument | null> {
    const updateData: any = {
      status,
      reviewedAt: new Date(),
    };

    if (reviewNote) {
      updateData.reviewNote = reviewNote;
    }

    const kyc = await this.kycModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    
    if (kyc) {
      // Update user's KYC status based on review result
      const userKycStatus = status === KycReviewStatus.APPROVED 
        ? KycStatus.APPROVED 
        : status === KycReviewStatus.REJECTED 
          ? KycStatus.REJECTED 
          : KycStatus.PENDING;
      
      await this.usersService.update(kyc.userId, { kycStatus: userKycStatus });
    }

    return kyc;
  }
}
