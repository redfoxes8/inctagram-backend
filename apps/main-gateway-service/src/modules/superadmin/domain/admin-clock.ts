export abstract class AdminClock {
  abstract now(): Date;
}

export const ADMIN_IDLE_MS = 30 * 60 * 1000;
export const ADMIN_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const ADMIN_TOUCH_MS = 60 * 1000;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_ATTEMPTS = 5;
