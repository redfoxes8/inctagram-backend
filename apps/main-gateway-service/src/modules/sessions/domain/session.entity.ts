import {
  BaseDomainEntity,
  type BaseDomainEntityProps,
} from '../../../../../../libs/common/src/domain/base.domain.entity';

export type SessionEntityProps = BaseDomainEntityProps<string> & {
  userId: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  iat: number;
  exp: number;
};

export class SessionEntity extends BaseDomainEntity<string> {
  userId: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  iat: number; // iat = lastActiveDate
  exp: number;

  constructor(data: SessionEntityProps) {
    super(data);
    this.userId = data.userId;
    this.deviceId = data.deviceId;
    this.deviceName = data.deviceName;
    this.ip = data.ip;
    this.iat = data.iat;
    this.exp = data.exp;
  }

  public updateSession(iat: number, exp: number, ip: string): void {
    this.iat = iat;
    this.exp = exp;
    this.ip = ip;
    this.touch();
  }
}
