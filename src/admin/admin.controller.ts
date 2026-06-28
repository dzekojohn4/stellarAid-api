import {
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminService } from './admin.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { sendError, sendSuccess } from '../utils/response.util';

@Controller('api/admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: JwtPayload,
    @Res() res: Response,
  ): Promise<Response> {
    if (currentUser.sub === id) {
      return sendError(res, 'Admins cannot delete their own account', HttpStatus.FORBIDDEN);
    }

    try {
      await this.adminService.softDelete(id);
      return sendSuccess(res, null, 'User account deleted successfully', HttpStatus.OK);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return sendError(res, err.message, HttpStatus.NOT_FOUND);
      }
      if (err instanceof ForbiddenException) {
        return sendError(res, err.message, HttpStatus.FORBIDDEN);
      }
      throw err;
    }
  }
}
