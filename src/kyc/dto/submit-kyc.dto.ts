import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { KycDocumentType } from '../schemas/kyc.schema';

export class SubmitKycDto {
  @IsEnum(KycDocumentType)
  @IsNotEmpty()
  documentType!: KycDocumentType;
}
