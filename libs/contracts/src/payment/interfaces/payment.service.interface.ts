import { Observable } from 'rxjs';

import {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  ProcessWebhookEventRequest,
  ProcessWebhookEventResponse,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
  GetPaymentHistoryRequest,
  GetPaymentHistoryResponse,
  ToggleAutoRenewRequest,
  ToggleAutoRenewResponse,
  GetCheckoutSessionStatusRequest,
  GetCheckoutSessionStatusResponse,
} from '../../generated/payment';

export abstract class IPaymentServiceClient {
  abstract createCheckoutSession(
    request: CreateCheckoutSessionRequest,
  ): Observable<CreateCheckoutSessionResponse>;

  abstract processWebhookEvent(
    request: ProcessWebhookEventRequest,
  ): Observable<ProcessWebhookEventResponse>;

  abstract getSubscriptions(request: GetSubscriptionsRequest): Observable<GetSubscriptionsResponse>;

  abstract getPaymentHistory(
    request: GetPaymentHistoryRequest,
  ): Observable<GetPaymentHistoryResponse>;

  abstract toggleAutoRenew(request: ToggleAutoRenewRequest): Observable<ToggleAutoRenewResponse>;

  abstract getCheckoutSessionStatus(
    request: GetCheckoutSessionStatusRequest,
  ): Observable<GetCheckoutSessionStatusResponse>;
}
