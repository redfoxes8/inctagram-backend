export enum NotificationEvents {
  RegistrationEmailSent = 'RegistrationEmailSent',
  PasswordRecoveryEmailSent = 'PasswordRecoveryEmailSent',
}

export enum MailTemplates {
  BaseLayout = 'base-layout',
  RegistrationConfirmation = 'registration-confirmation',
  PasswordRecovery = 'password-recovery',
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
};
