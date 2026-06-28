import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { Kyc, KycSchema } from './schemas/kyc.schema';
import { UsersService } from './users.service';
import { KycService } from './kyc.service';
import { UsersController } from './users.controller';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [
    JwtAuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Kyc.name, schema: KycSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, KycService],
  exports: [UsersService, KycService, MongooseModule],
})
export class UsersModule {}
