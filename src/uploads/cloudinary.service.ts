import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

@Injectable()
export class CloudinaryService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(file: Express.Multer.File): Promise<UploadResult> {
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type not allowed. Accepted: ${ALLOWED_TYPES.join(', ')}`);
    }

    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: 'StellarAid', resource_type: 'image' },
          (error, result) => {
            if (error || !result) {
              return reject(new InternalServerErrorException('Image upload failed'));
            }
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              width: result.width,
              height: result.height,
            });
          },
        )
        .end(file.buffer);
    });
  }
}
