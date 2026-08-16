export class PaymentHistoryItemResponseDto {
  transactionId: string;
  createdAt: string;
  paidAt: string | null;
  amountMinor: number;
  currency: string;
  productId: string;
  productName: string;
  billingInterval: string;
  billingIntervalCount: number;
  provider: string;
  kind: string;
  status: string;
}

export class GetPaymentHistoryResponseDto {
  items: PaymentHistoryItemResponseDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  pagesCount: number;
}
