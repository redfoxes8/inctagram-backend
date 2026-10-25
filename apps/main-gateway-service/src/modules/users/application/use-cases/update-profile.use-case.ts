import { UpdateProfileDto } from '../../api/rest/dto/update-profile.dto';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ProfileEntity } from '../../domain/profile.entity';
import { IProfileRepository } from '../../domain/interfaces/user-profile.repository.interface';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { parse } from 'date-fns';
import { ITransactionManager } from '../../../../common/interfaces/transaction-manager.interface';

export class UpdateProfileCommand {
  constructor(
    public dto: UpdateProfileDto,
    public userId: string,
  ) {}
}

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileUseCase implements ICommandHandler<UpdateProfileCommand, void> {
  constructor(
    private readonly profileRepository: IProfileRepository,
    private readonly transactions: ITransactionManager,
  ) {}

  async execute({ dto, userId }: UpdateProfileCommand): Promise<void> {
    return this.transactions.execute(async (transaction) => {
      const profile: ProfileEntity | null = await this.profileRepository.lockByUserId({
        userId,
        transaction,
      });
      if (!profile) {
        throw new DomainException({
          code: DomainExceptionCode.NotFound,
          message: 'User profile not found',
        });
      }

      if (dto.username) {
        const profileWithProvidedUsername: ProfileEntity | null =
          await this.profileRepository.findByUsername(dto.username);

        if (profileWithProvidedUsername && profileWithProvidedUsername.id !== profile.id) {
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

      await this.profileRepository.save(profile, transaction);
      return;
    });
  }
}
