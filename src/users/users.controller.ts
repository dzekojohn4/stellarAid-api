import { Controller, Get, Res, NotFoundException, UseGuards, Request } from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { sendSuccess, sendError } from '../utils/response.util';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/kyc')
  @UseGuards(JwtAuthGuard)
  async getKycStatus(@Request() req, @Res() res: Response): Promise<Response> {
    try {
      const user = req.user;

      if (!user.kycSubmissionDate) {
        return sendError(res, 'No KYC submission found', 404);
      }

      const kycData = {
        status: user.kycStatus,
        submissionDate: user.kycSubmissionDate,
        reviewNotes: user.kycReviewNotes,
      };

      return sendSuccess(res, kycData, 'KYC status retrieved successfully');
    } catch (err) {
      return sendError(res, 'Failed to retrieve KYC status', 500);
    }
  }
}
