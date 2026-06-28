import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { User } from '../users/schemas/user.schema';

describe('AdminService', () => {
  let service: AdminService;

  const mockSave = jest.fn();
  const mockFindById = jest.fn();

  const mockUserModel = {
    findById: mockFindById,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('softDelete()', () => {
    it('sets deletedAt and saves when user exists', async () => {
      const fakeUser = { deletedAt: null, save: mockSave };
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(fakeUser) });
      mockSave.mockResolvedValue(fakeUser);

      await service.softDelete('user-id-123');

      expect(mockFindById).toHaveBeenCalledWith('user-id-123');
      expect(fakeUser.deletedAt).toBeInstanceOf(Date);
      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.softDelete('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user is already soft-deleted (not returned by query middleware)', async () => {
      // Mongoose pre-find middleware excludes deletedAt != null docs, so findById returns null
      mockFindById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.softDelete('deleted-user-id')).rejects.toThrow(NotFoundException);
    });
  });
});
