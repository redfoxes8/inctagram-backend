export class PaymentHistoryItemResponseDto {
  id: string;

  productName: string;

  provider: string;

  amount: string;

  currency: string;

  paymentDate: string;

  subscriptionEndDate: string;
}

export class GetPaymentHistoryResponseDto {
  items: PaymentHistoryItemResponseDto[];

  totalCount: number;

  page: number;

  pageSize: number;

  pagesCount: number;
}
