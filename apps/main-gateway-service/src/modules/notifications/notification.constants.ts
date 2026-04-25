export const NOTIFICATION_CLIENT = 'NOTIFICATION_CLIENT';

export enum NotificationEvents {
  RegistrationEmailSent = 'RegistrationEmailSent',
  PasswordRecoveryEmailSent = 'PasswordRecoveryEmailSent',
}

export type RegistrationEmailSentPayload = {
  email: string;
  confirmationCode: string;
};

export type PasswordRecoveryEmailSentPayload = {
  email: string;
  recoveryCode: string;
};
