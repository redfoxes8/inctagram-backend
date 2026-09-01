import {
  BaseDomainEntity,
  type BaseDomainEntityProps,
} from '../../../../../../libs/common/src/domain/base.domain.entity';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { randomUUID } from 'crypto';

export type UserProfileEntityProps = BaseDomainEntityProps<string> & {
  userId: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
  country: string | null;
  city: string | null;
  aboutMe: string | null;
  avatarFileId: string | null;
  avatarUrl: string | null;
};

type UpdateProfileProps = {
  username: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: Date | null;
  country: string | null;
  city: string | null;
  aboutMe: string | null;
};

export class ProfileEntity extends BaseDomainEntity<string> {
  public readonly userId: string;
  public username: string;
  public firstName: string | null;
  public lastName: string | null;
  public dateOfBirth: Date | null;
  public country: string | null;
  public city: string | null;
  public aboutMe: string | null;
  public avatarFileId: string | null;
  public avatarUrl: string | null;

  constructor(data: UserProfileEntityProps) {
    super(data);
    this.userId = data.userId;
    this.username = data.username;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.dateOfBirth = data.dateOfBirth;
    this.country = data.country;
    this.city = data.city;
    this.aboutMe = data.aboutMe;
    this.avatarFileId = data.avatarFileId;
    this.avatarUrl = data.avatarUrl;
  }

  public static createNew(userId: string, username: string): ProfileEntity {
    return new this({
      id: randomUUID(),
      userId: userId,
      username: username,
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      country: null,
      city: null,
      aboutMe: null,
      avatarFileId: null,
      avatarUrl: null,
    });
  }

  public setAvatar(avatarFileId: string, avatarUrl: string): string | null {
    const previousAvatarFileId = this.avatarFileId;
    this.avatarFileId = avatarFileId;
    this.avatarUrl = avatarUrl;
    this.touch();

    return previousAvatarFileId;
  }

  public removeAvatar(): string | null {
    const previousAvatarFileId = this.avatarFileId;
    this.avatarFileId = null;
    this.avatarUrl = null;
    this.touch();

    return previousAvatarFileId;
  }

  public updateProfileInfo(newInfo: UpdateProfileProps): void {
    this.username = newInfo.username;
    this.firstName = newInfo.firstName;
    this.lastName = newInfo.lastName;
    this.dateOfBirth = newInfo.dateOfBirth;
    this.country = newInfo.country;
    this.city = newInfo.city;
    this.aboutMe = newInfo.aboutMe;

    this.ensureAgeRequirement();
    this.touch();
    return;
  }

  private ensureAgeRequirement(): void {
    if (!this.dateOfBirth) {
      return;
    }

    const minimumAge = 13;
    const today = new Date();
    const age = today.getUTCFullYear() - this.dateOfBirth.getUTCFullYear();
    const monthDifference = today.getUTCMonth() - this.dateOfBirth.getUTCMonth();
    const hasBirthdayPassed =
      monthDifference > 0 ||
      (monthDifference === 0 && today.getUTCDate() >= this.dateOfBirth.getUTCDate());

    const isOldEnough = age > minimumAge || (age === minimumAge && hasBirthdayPassed);

    if (isOldEnough) {
      return;
    }

    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'User must be at least 13 years old',
    });
  }
}
