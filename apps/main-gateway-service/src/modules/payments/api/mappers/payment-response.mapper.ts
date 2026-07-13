import {
  GetPaymentHistoryResponse,
  GetSubscriptionsResponse,
} from '../../../../../../../libs/contracts/src';
import { GetPaymentHistoryResponseDto } from '../dto/get-payment-history.response';
import { GetSubscriptionsResponseDto } from '../dto/get-subscriptions.response';
// TODO:
// После завершения Payment MS заменить прямое копирование
// на полноценный mapping gRPC -> REST DTO,
// включая преобразование Timestamp -> ISO string.
export class PaymentResponseMapper {
  static toGetPaymentHistory(response: GetPaymentHistoryResponse): GetPaymentHistoryResponseDto {
    return {
      items: response.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        provider: item.provider,
        amount: item.amount,
        currency: item.currency,
        paymentDate: item.paymentDate?.seconds
          ? new Date(Number(item.paymentDate.seconds) * 1000).toISOString()
          : '',
        subscriptionEndDate: item.subscriptionEndDate?.seconds
          ? new Date(Number(item.subscriptionEndDate.seconds) * 1000).toISOString()
          : '',
      })),

      totalCount: response.totalCount,

      page: response.page,

      pageSize: response.pageSize,

      pagesCount: response.pagesCount,
    };
  }

  static toGetSubscriptions(response: GetSubscriptionsResponse): GetSubscriptionsResponseDto {
    return {
      subscriptions: response.subscriptions.map((subscription) => ({
        id: subscription.id,

        productId: subscription.productId,

        provider: subscription.provider,

        status: subscription.status,

        autoRenew: subscription.autoRenew,

        startDate: subscription.startDate?.seconds
          ? new Date(Number(subscription.startDate.seconds) * 1000).toISOString()
          : '',

        endDate: subscription.endDate?.seconds
          ? new Date(Number(subscription.endDate.seconds) * 1000).toISOString()
          : '',
      })),
    };
  }
}
