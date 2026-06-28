import {
  Controller,
  Post,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KycService } from './kyc.service';
import { KycDocumentType } from './schemas/kyc.schema';
import { sendSuccess, sendError } from '../utils/response.util';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly kycService: KycService) {}

  @Post('me/kyc')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('document', {
      fileFilter: (req, file, callback) => {
        const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new BadRequestException('Only PDF, JPG, and PNG files are allowed'), false);
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async submitKyc(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      if (!file) {
        return sendError(res, 'Document file is required', HttpStatus.BAD_REQUEST);
      }

      const documentType = req.body.documentType;
      if (!documentType || !Object.values(KycDocumentType).includes(documentType)) {
        return sendError(res, 'Invalid document type. Must be one of: passport, national_id, drivers_license', HttpStatus.BAD_REQUEST);
      }

      // For now, we'll use the file path as the document URL
      // In production, this should be uploaded to cloud storage (S3, etc.)
      const documentUrl = file.path;

      const kyc = await this.kycService.create(req.user._id.toString(), documentType, documentUrl);

      return sendSuccess(
        res,
        {
          id: kyc._id?.toString(),
          documentType: kyc.documentType,
          status: kyc.status,
          submittedAt: kyc.createdAt,
        },
        'KYC document submitted successfully',
        HttpStatus.CREATED,
      );
    } catch (err) {
      if (err instanceof BadRequestException) {
        return sendError(res, err.message, HttpStatus.BAD_REQUEST);
      }
      throw err;
    }
  }
}
