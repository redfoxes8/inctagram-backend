export interface IAuthRequestInfo extends Express.Request {
  user: {
    userId: string;
    deviceId: string;
  };
}
