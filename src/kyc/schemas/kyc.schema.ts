import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type KycDocument = Kyc & Document;

export enum KycDocumentType {
  ID_CARD = 'id_card',
  PASSPORT = 'passport',
  DRIVERS_LICENSE = 'drivers_license',
  UTILITY_BILL = 'utility_bill',
  BANK_STATEMENT = 'bank_statement',
  OTHER = 'other',
}

export enum KycReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({
  collection: 'kyc_documents',
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret: Record<string, unknown>) => {
      const idSource = ret._id as { toString(): string } | undefined;
      ret.id = idSource?.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class Kyc {
  @Prop({ type: String, required: true })
  userId!: string;

  @Prop({ type: String, enum: Object.values(KycDocumentType), required: true })
  documentType!: KycDocumentType;

  @Prop({ type: String, required: true })
  documentUrl!: string;

  @Prop({ type: String, enum: Object.values(KycReviewStatus), default: KycReviewStatus.PENDING })
  status!: KycReviewStatus;

  @Prop({ type: Date, default: Date.now })
  submittedAt!: Date;

  @Prop({ type: Date, default: null })
  reviewedAt!: Date | null;

  @Prop({ type: String, default: null })
  reviewNote!: string | null;
}

export const KycSchema = SchemaFactory.createForClass(Kyc);
