export class ToggleAutoRenewResponseDto {
  success: boolean;

  autoRenew: boolean;

  nextBillingAt: string | null;

  providerStatus: string | null;
}
