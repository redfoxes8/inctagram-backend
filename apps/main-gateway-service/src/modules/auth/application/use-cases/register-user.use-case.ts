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

export class RegisterUserCommand {
  constructor(public dto: RegisterUserDto) {}
}

@CommandHandler(RegisterUserCommand)
export class RegisterUserUseCase implements ICommandHandler<RegisterUserCommand, void | string> {
  constructor(
    private usersRepository: IUsersRepository,
    private passwordService: IPasswordService,
    private emailAdapter: IEmailAdapter,
    private emailConfirmationRepository: IEmailConfirmationRepository,
    private coreConfig: CoreConfig,
  ) {}

  public async execute({ dto }: RegisterUserCommand): Promise<void | string> {
    const existingUser = await this.usersRepository.findByEmail(dto.email);
    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const confirmationCode = this.generateConfirmationCode();

    const existingUserUsername: UserEntity | null =
      await this.usersRepository.findByUsernameOrEmail(dto.username);
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
        username: dto.username,
        email: dto.email,
        passwordHash,
      });

      const updatedUser = await this.usersRepository.update(existingUser);

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

    const user = new UserEntity({
      id: randomUUID(),
      username: dto.username,
      email: dto.email,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      isConfirmed: false,
    });

    const savedUser = await this.usersRepository.save(user);

    await this.emailConfirmationRepository.save(
      new EmailConfirmationEntity({
        id: randomUUID(),
        userId: savedUser.id,
        confirmationCode,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    if (this.coreConfig.env == 'test') {
      return confirmationCode;
    }
    await this.emailAdapter.sendRegistrationCode(savedUser.email, confirmationCode);
    return;
  }

  private generateConfirmationCode(): string {
    return randomBytes(3).toString('hex').toUpperCase();
  }
}
