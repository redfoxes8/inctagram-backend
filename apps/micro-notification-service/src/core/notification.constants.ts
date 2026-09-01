export enum NotificationEvents {
  RegistrationEmailSent = 'RegistrationEmailSent',
  PasswordRecoveryEmailSent = 'PasswordRecoveryEmailSent',
  PaymentSucceededEmailSent = 'PaymentSucceededEmailSent',
  PaymentFailedEmailSent = 'PaymentFailedEmailSent',
  SubscriptionExpiredEmailSent = 'SubscriptionExpiredEmailSent',
}

export enum MailTemplates {
  BaseLayout = 'base-layout',
  RegistrationConfirmation = 'registration-confirmation',
  PasswordRecovery = 'password-recovery',
  PaymentSucceeded = 'payment-succeeded',
  PaymentFailed = 'payment-failed',
  SubscriptionExpired = 'subscription-expired',
  SubscriptionQueued = 'subscription-queued',
  SubscriptionActivated = 'subscription-activated',
  AutoRenewChanged = 'auto-renew-changed',
}

export type NotificationMessageSettings = {
  template: MailTemplates;
  subject: string;
};

export const NOTIFICATION_MESSAGE_REGISTRY: Record<
  NotificationEvents,
  NotificationMessageSettings
> = {
  [NotificationEvents.RegistrationEmailSent]: {
    template: MailTemplates.RegistrationConfirmation,
    subject: 'Inctagram | Email Confirmation',
  },
  [NotificationEvents.PasswordRecoveryEmailSent]: {
    template: MailTemplates.PasswordRecovery,
    subject: 'Inctagram | Password Recovery',
  },
  [NotificationEvents.PaymentSucceededEmailSent]: {
    template: MailTemplates.PaymentSucceeded,
    subject: 'Payment succeeded',
  },
  [NotificationEvents.PaymentFailedEmailSent]: {
    template: MailTemplates.PaymentFailed,
    subject: 'Inctagram | Payment Failed',
  },
  [NotificationEvents.SubscriptionExpiredEmailSent]: {
    template: MailTemplates.SubscriptionExpired,
    subject: 'Inctagram | Subscription Expired',
  },
};
