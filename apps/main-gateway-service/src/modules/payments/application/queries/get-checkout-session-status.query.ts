import { GetCheckoutSessionStatusResponseDto } from '../../api/dto/get-checkout-session-status.response';

export type GetCheckoutSessionStatusQueryDto = Readonly<{
  userId: string;
  checkoutSessionId: string;
}>;

export type GetCheckoutSessionStatusResult = GetCheckoutSessionStatusResponseDto;
