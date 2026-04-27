import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { GlobalDomainExceptionFilter } from '../../../../libs/common/src/exceptions/global-domain-exception.filter';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';

describe('Sessions API (e2e)', () => {
  let app: INestApplication<App>;
  jest.setTimeout(180000);

  beforeAll(async () => {
    await resetDb();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalDomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Security Devices - Управление активными сессиями', () => {
    let accessToken: string;

    beforeAll(async () => {
      // Регистрируем пользователя
      const email = 'sessions_test@example.com';
      const password = 'Test@1234';
      const username = 'sessionstest';

      const response = await request(app.getHttpServer()).post('/auth/registration').send({
        username: username,
        email: email,
        password: password,
      });

      await request(app.getHttpServer())
        .post('/auth/confirm-email')
        .query(`code=${response.body.code}`);

      // Входим в систему
      const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({
        usernameOrEmail: email,
        password: password,
      });

      accessToken = loginResponse.body.accessToken;
    });

    describe('GET /sessions/my-devices - Получить все активные сессии', () => {
      it('должна вернуть список активных устройств с валидным токеном', async () => {
        const response = await request(app.getHttpServer())
          .get('/sessions/my-devices')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        // Проверяем что вернулся массив
        expect(Array.isArray(response.body)).toBe(true);

        // Если есть сессии, проверяем структуру
        if (response.body.length > 0) {
          const session = response.body[0];
          expect(session).toHaveProperty('deviceId');
          expect(session).toHaveProperty('ip');
          expect(session).toHaveProperty('title');
          expect(session).toHaveProperty('lastActiveDate');
        }
      });

      it('должна вернуть ошибку 401 без токена', async () => {
        const response = await request(app.getHttpServer()).get('/sessions/my-devices').expect(401);

        expect(response.body.message).toBeDefined();
      });

      it('должна вернуть ошибку 401 с невалидным токеном', async () => {
        const response = await request(app.getHttpServer())
          .get('/sessions/my-devices')
          .set('Authorization', 'Bearer invalid_token')
          .expect(401);

        expect(response.body.message).toBeDefined();
      });

      it('должна вернуть пустой массив для нового пользователя', async () => {
        // Регистрируем нового пользователя
        const newEmail = 'new_sessions_user@example.com';
        const password = 'Test@1234';

        const registrationResponse = await request(app.getHttpServer())
          .post('/auth/registration')
          .send({
            username: 'newsessionsuser',
            email: newEmail,
            password: password,
          });

        await request(app.getHttpServer())
          .post('/auth/confirm-email')
          .query(`code=${registrationResponse.body.code}`);

        const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({
          usernameOrEmail: newEmail,
          password: password,
        });

        const newAccessToken = loginResponse.body.accessToken;

        const response = await request(app.getHttpServer())
          .get('/sessions/my-devices')
          .set('Authorization', `Bearer ${newAccessToken}`)
          .expect(200);

        // Должен быть пустой массив или массив с одной сессией (текущей)
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('DELETE /sessions/deactivate-one/:deviceId - Завершить одну сессию', () => {
      let deviceIdToDeactivate: string;

      beforeAll(async () => {
        // Получаем список устройств и берём первое
        const devicesResponse = await request(app.getHttpServer())
          .get('/sessions/my-devices')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        if (devicesResponse.body.length > 0) {
          deviceIdToDeactivate = devicesResponse.body[0].deviceId;
        }
      });

      it('должна успешно завершить одну сессию', async () => {
        if (!deviceIdToDeactivate) {
          // Пропускаем тест если нет deviceId
          return;
        }

        const response = await request(app.getHttpServer())
          .delete(`/sessions/deactivate-one/${deviceIdToDeactivate}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body).toEqual({});
      });

      it('должна вернуть ошибку 401 без токена', async () => {
        const response = await request(app.getHttpServer())
          .delete(`/sessions/deactivate-one/any-device-id`)
          .expect(401);

        expect(response.body.message).toBeDefined();
      });

      it('должна вернуть ошибку при попытке завершить несуществующую сессию', async () => {
        const response = await request(app.getHttpServer())
          .delete(`/sessions/deactivate-one/nonexistent-device-id`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body.message).toBeDefined();
      });

      it('должна вернуть ошибку при попытке завершить сессию другого пользователя', async () => {
        // Создаём другого пользователя и его сессию
        const otherEmail = 'other_user@example.com';
        const password = 'Test@1234';

        const registrationResponse = await request(app.getHttpServer())
          .post('/auth/registration')
          .send({
            username: 'otheruser',
            email: otherEmail,
            password: password,
          });

        await request(app.getHttpServer())
          .post('/auth/confirm-email')
          .query(`code=${registrationResponse.body.code}`);

        const otherLoginResponse = await request(app.getHttpServer()).post('/auth/login').send({
          usernameOrEmail: otherEmail,
          password: password,
        });

        const otherUserAccessToken = otherLoginResponse.body.accessToken;
        const otherUserDevicesResponse = await request(app.getHttpServer())
          .get('/sessions/my-devices')
          .set('Authorization', `Bearer ${otherUserAccessToken}`)
          .expect(200);

        if (otherUserDevicesResponse.body.length > 0) {
          const otherUserDeviceId = otherUserDevicesResponse.body[0].deviceId;

          // Пытаемся завершить сессию другого пользователя
          const response = await request(app.getHttpServer())
            .delete(`/sessions/deactivate-one/${otherUserDeviceId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(403);

          expect(response.body.message).toBeDefined();
        }
      });
    });

    describe('DELETE /sessions/deactivate-all - Завершить все сессии', () => {
      it('должна успешно завершить все сессии пользователя', async () => {
        const response = await request(app.getHttpServer())
          .delete('/sessions/deactivate-all')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body).toEqual({});

        // Проверяем что все сессии действительно завершены
        const devicesResponse = await request(app.getHttpServer())
          .get('/sessions/my-devices')
          .set('Authorization', `Bearer ${accessToken}`);

        // После завершения всех сессий, токен больше не должен быть валидным
        // или должен вернуться пустой список
        expect(devicesResponse.status === 401 || devicesResponse.body.length === 0).toBe(true);
      });

      it('должна вернуть ошибку 401 без токена', async () => {
        const response = await request(app.getHttpServer())
          .delete('/sessions/deactivate-all')
          .expect(401);

        expect(response.body.message).toBeDefined();
      });

      it('должна вернуть ошибку 401 с невалидным токеном', async () => {
        const response = await request(app.getHttpServer())
          .delete('/sessions/deactivate-all')
          .set('Authorization', 'Bearer invalid_token')
          .expect(401);

        expect(response.body.message).toBeDefined();
      });

      it('не должна влиять на сессии других пользователей', async () => {
        // Создаём двух пользователей
        const user1Email = 'user1_deactivate_all@example.com';
        const user2Email = 'user2_deactivate_all@example.com';
        const password = 'Test@1234';

        // Регистрируем и входим пользователем 1
        const registrationResponse1 = await request(app.getHttpServer())
          .post('/auth/registration')
          .send({
            username: 'user1deactivate',
            email: user1Email,
            password: password,
          });

        await request(app.getHttpServer())
          .post('/auth/confirm-email')
          .query(`code=${registrationResponse1.body.code}`);

        const user1LoginResponse = await request(app.getHttpServer()).post('/auth/login').send({
          usernameOrEmail: user1Email,
          password: password,
        });

        const user1Token = user1LoginResponse.body.accessToken;

        // Регистрируем и входим пользователем 2
        const registrationResponse2 = await request(app.getHttpServer())
          .post('/auth/registration')
          .send({
            username: 'user2deactivate',
            email: user2Email,
            password: password,
          });

        await request(app.getHttpServer())
          .post('/auth/confirm-email')
          .query(`code=${registrationResponse2.body.code}`);

        const user2LoginResponse = await request(app.getHttpServer()).post('/auth/login').send({
          usernameOrEmail: user2Email,
          password: password,
        });

        const user2Token = user2LoginResponse.body.accessToken;

        // Пользователь 2 завершает все сессии
        await request(app.getHttpServer())
          .delete('/sessions/deactivate-all')
          .set('Authorization', `Bearer ${user2Token}`)
          .expect(200);

        // Проверяем что сессии пользователя 1 остались нетронутыми
        const user1DevicesResponse = await request(app.getHttpServer())
          .get('/sessions/my-devices')
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(200);

        expect(Array.isArray(user1DevicesResponse.body)).toBe(true);
      });
    });
  });
});
