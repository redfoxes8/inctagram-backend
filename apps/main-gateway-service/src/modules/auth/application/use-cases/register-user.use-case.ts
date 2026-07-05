import { randomBytes, randomUUID } from 'crypto';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { RegisterUserDto } from '../../api/dto/register-user.dto';
import { IEmailAdapter } from '../interfaces/email.adapter.interface';
import { IUsersRepository } from '../../../users/domain/interfaces/users.repository.interface';
import { IPasswordService } from '../../../users/application/interfaces/password.service.interface';
import { UserEntity } from '../../../users/domain/user.entity';
import { EmailConfirmationEntity } from '../../domain/email-confirmation.entity';
import { IEmailConfirmationRepository } from '../../domain/interfaces/email-confirmation.repository.interface';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CoreConfig } from '../../../../../../../libs/common/src/core.config';
import { IProfileRepository } from '../../../users/domain/interfaces/user-profile.repository.interface';
import { ProfileEntity } from '../../../users/domain/profile.entity';

export class RegisterUserCommand {
  constructor(public dto: RegisterUserDto) {}
}

@CommandHandler(RegisterUserCommand)
export class RegisterUserUseCase implements ICommandHandler<RegisterUserCommand, void | string> {
  constructor(
    private readonly usersRepository: IUsersRepository,
    private readonly passwordService: IPasswordService,
    private readonly emailAdapter: IEmailAdapter,
    private readonly emailConfirmationRepository: IEmailConfirmationRepository,
    private readonly coreConfig: CoreConfig,
    private readonly profileRepository: IProfileRepository,
  ) {}

  public async execute({ dto }: RegisterUserCommand): Promise<void | string> {
    const existingUser: UserEntity | null = await this.usersRepository.findByEmail(dto.email);
    const passwordHash: string = await this.passwordService.hashPassword(dto.password);
    const confirmationCode: string = this.generateConfirmationCode();

    const existingUserUsername: ProfileEntity | null = await this.profileRepository.findByUsername(
      dto.username,
    );
    if (existingUserUsername) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'User with this username is already registered',
      });
    }

    if (existingUser && existingUser.isConfirmed) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'User with this email is already registered',
      });
    }

    if (existingUser) {
      existingUser.updateCredentials({
        email: dto.email,
        passwordHash,
      });

      const updatedUser: UserEntity = await this.usersRepository.update(existingUser);

      await this.emailConfirmationRepository.deleteByUserId(updatedUser.id);
      await this.emailConfirmationRepository.save(
        new EmailConfirmationEntity({
          id: randomUUID(),
          userId: updatedUser.id,
          confirmationCode,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        }),
      );
      if (this.coreConfig.env == 'test') {
        return confirmationCode;
      }
      await this.emailAdapter.sendRegistrationCode(updatedUser.email, confirmationCode);
      return;
    }

    const user: UserEntity = UserEntity.createNew(dto.email, passwordHash);
    await this.usersRepository.save(user);

    const profile: ProfileEntity = ProfileEntity.createNew(user.id, dto.username);
    await this.profileRepository.save(profile);

    const emailConfirmation: EmailConfirmationEntity = EmailConfirmationEntity.createNew(
      user.id,
      confirmationCode,
    );
    await this.emailConfirmationRepository.save(emailConfirmation);

    if (this.coreConfig.env == 'test') {
      return confirmationCode;
    }
    await this.emailAdapter.sendRegistrationCode(user.email, confirmationCode);
    return;
  }

  private generateConfirmationCode(): string {
    return randomBytes(3).toString('hex').toUpperCase();
  }
}
