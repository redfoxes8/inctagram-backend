import { UpdateProfileDto } from '../../api/dto/update-profile.dto';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ProfileEntity } from '../../domain/profile.entity';
import { IProfileRepository } from '../../domain/interfaces/user-profile.repository.interface';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { parse } from 'date-fns';

export class UpdateProfileCommand {
  constructor(
    public dto: UpdateProfileDto,
    public userId: string,
  ) {}
}

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileUseCase implements ICommandHandler<UpdateProfileCommand, void> {
  constructor(private readonly profileRepository: IProfileRepository) {}

  async execute({ dto, userId }: UpdateProfileCommand): Promise<void> {
    const profile: ProfileEntity | null = await this.profileRepository.findByUserId(userId);
    if (!profile) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'User profile not found',
      });
    }

    if (dto.username) {
      const profileWithProvidedUsername: ProfileEntity | null =
        await this.profileRepository.findByUsername(dto.username);

      if (profileWithProvidedUsername) {
        throw new DomainException({
          code: DomainExceptionCode.BadRequest,
          message: 'Username already taken',
        });
      }
    }

    const dateOfBirthParse: Date | null = dto.dateOfBirth
      ? parse(dto.dateOfBirth, 'dd.MM.yyyy', new Date())
      : null;

    profile.updateProfileInfo({
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: dateOfBirthParse,
      country: dto.country,
      city: dto.city,
      aboutMe: dto.aboutMe,
    });

    await this.profileRepository.save(profile);
    return;
  }
}
