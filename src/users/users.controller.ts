import {
  Controller,
  Get,
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

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { KycService } from './kyc.service';
import { KycDocumentType } from './schemas/kyc.schema';
import { sendSuccess, sendError } from '../utils/response.util';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly kycService: KycService,
  ) {}

  @Get('me/kyc')
  async getKycStatus(
    @Request() req: any,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const user = req.user;

      if (!user.kycSubmissionDate) {
        return sendError(res, 'No KYC submission found', HttpStatus.NOT_FOUND);
      }

      return sendSuccess(
        res,
        {
          status: user.kycStatus,
          submissionDate: user.kycSubmissionDate,
          reviewNotes: user.kycReviewNotes,
        },
        'KYC status retrieved successfully',
      );
    } catch (err) {
      return sendError(
        res,
        'Failed to retrieve KYC status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('me/kyc')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('document', {
      fileFilter: (req, file, callback) => {
        const allowedMimes = [
          'application/pdf',
          'image/jpeg',
          'image/jpg',
          'image/png',
        ];

        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              'Only PDF, JPG, and PNG files are allowed',
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
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
        return sendError(
          res,
          'Document file is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const documentType = req.body.documentType;

      if (
        !documentType ||
        !Object.values(KycDocumentType).includes(documentType)
      ) {
        return sendError(
          res,
          'Invalid document type. Must be one of: passport, national_id, drivers_license',
          HttpStatus.BAD_REQUEST,
        );
      }

      const documentUrl = file.path;

      const kyc = await this.kycService.create(
        req.user._id.toString(),
        documentType,
        documentUrl,
      );

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