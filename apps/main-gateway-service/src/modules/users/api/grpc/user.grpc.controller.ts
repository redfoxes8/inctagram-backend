import { ExportPaymentUserProfilesQuery } from '../../application/queries/export-payment-user-profiles.query';
import type { PaymentProfileExportPage } from '../../../../../../../libs/contracts/src/events/payment-user-profile-export';
import type {
  ExportPaymentUserProfilesRequest,
  ExportPaymentUserProfilesResponse,
} from '../../../../../../../libs/contracts/src/generated/user';
import { Controller, UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { GetUserByIdGrpcQuery } from '../../application/queries/get-user-by-id-grpc.query';
import { GetNotificationRecipientContextQuery } from '../../application/queries/get-notification-recipient-context.query';
import { UserGrpcMapper } from './mappers/user.grpc.mapper';
import { UserGrpcDto } from './dto/user-grpc.dto';
import {
  GetUserByIdRequest,
  GetUserByIdResponse,
  GetNotificationRecipientContextRequest,
  GetNotificationRecipientContextResponse,
  UserServiceController,
  UserServiceControllerMethods,
} from '../../../../../../../libs/contracts/src/generated/user';
import { GrpcExceptionInterceptor } from '../../../../../../../libs/common/src/exceptions/grpc-exception.interceptor';

@Controller()
@UseInterceptors(GrpcExceptionInterceptor)
@UserServiceControllerMethods()
export class UserGrpcController implements UserServiceController {
  constructor(private readonly queryBus: QueryBus) {}

  async exportPaymentUserProfiles(
    request: ExportPaymentUserProfilesRequest,
  ): Promise<ExportPaymentUserProfilesResponse> {
    const page: PaymentProfileExportPage = await this.queryBus.execute(
      new ExportPaymentUserProfilesQuery(request),
    );
    return {
      ...page,
      items: page.items.map((item) => ({ ...item, username: item.username ?? undefined })),
    };
  }

  async getUserById(request: GetUserByIdRequest): Promise<GetUserByIdResponse> {
    const user: UserGrpcDto = await this.queryBus.execute(new GetUserByIdGrpcQuery(request.userId));

    return UserGrpcMapper.toGetUserByIdResponse(user);
  }

  async getNotificationRecipientContext(
    request: GetNotificationRecipientContextRequest,
  ): Promise<GetNotificationRecipientContextResponse> {
    const context: UserGrpcDto = await this.queryBus.execute(
      new GetNotificationRecipientContextQuery(request.userId),
    );

    return UserGrpcMapper.toNotificationRecipientContextResponse(context);
  }
}
