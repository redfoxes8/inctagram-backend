import { ApiProperty } from '@nestjs/swagger';

export class SessionViewModel {
  @ApiProperty({ description: 'IP address of the device', example: '192.168.1.1' })
  ip: string;

  @ApiProperty({ description: 'Device title (Browser / OS)', example: 'Chrome / Windows' })
  title: string;

  @ApiProperty({ description: 'Last active date in ISO format', example: '2023-10-10T14:48:00.000Z' })
  lastActiveDate: string;

  @ApiProperty({ description: 'Unique device identifier', example: '123e4567-e89b-12d3-a456-426614174000' })
  deviceId: string;
}

export abstract class ISessionsQueryRepository {
  abstract getAllActiveSessions(userId: string): Promise<SessionViewModel[]>;
}
