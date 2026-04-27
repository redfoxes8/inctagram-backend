import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { resetDb } from '../../../../libs/common/src/testing/reset-db';
import { GlobalDomainExceptionFilter } from '../../../../libs/common/src/exceptions/global-domain-exception.filter';

describe('Auth API (e2e)', () => {
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

  describe('POST /auth/registration - Регистрация пользователя', () => {
    it('должна успешно зарегистрировать нового пользователя', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/registration')
        .send({
          username: 'testuser999888',
          email: 'testuser11@example.com',
          password: 'Test@1234',
          passwordConfirmation: 'Test@1234',
        })
        .expect(201);

      expect(response.body.code).toBeDefined();
    });

    it('должна вернуть ошибку при регистрации с некорректным email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/registration')
        .send({
          username: 'testuser12',
          email: 'invalid-email',
          password: 'Test@1234',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при регистрации с коротким паролем', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/registration')
        .send({
          username: 'testuser13',
          email: 'testuser13@example.com',
          password: 'Test', // Слишком короткий
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при регистрации с пустыми полями', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/registration')
        .send({
          username: '',
          email: '',
          password: '',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при регистрации с коротким username', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/registration')
        .send({
          username: 'usr', // Минимум 6 символов
          email: 'testuser14@example.com',
          password: 'Test@1234',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при регистрации с password без спецсимволов', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/registration')
        .send({
          username: 'testuser15',
          email: 'testuser15@example.com',
          password: 'Test1234', // Нет спецсимволов
        })
        .expect(400);
      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /auth/login - Вход в систему', () => {
    const validEmail = 'asdasgreasf@example.com';
    const validUsername = 'asdasgreasf';
    const validPassword = 'Test@1234';

    const validEmail2 = 'ergergeeasg@example.com';
    const validUsername2 = 'ergergeeasg';
    const validPassword2 = 'Test2@1234';

    let code: string;

    beforeAll(async () => {
      // Регистрируем пользователя для тестов входа
      const res1 = await request(app.getHttpServer()).post('/auth/registration').send({
        username: validUsername,
        email: validEmail,
        password: validPassword,
      });

      await request(app.getHttpServer()).post('/auth/registration').send({
        username: validUsername2,
        email: validEmail2,
        password: validPassword2,
      });
      code = res1.body.code;
    });

    it('должен подтвердить имейл', async () => {
      await request(app.getHttpServer())
        .post(`/auth/confirm-email`)
        .query(`code=${code}`)
        .expect(302);
    });

    it('должна вернуть ошибку при входе с не подтверждённым email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          usernameOrEmail: validEmail2,
          password: validPassword2,
        })
        .expect(401);
      expect(response.body.message).toBeDefined();
    });

    it('должна успешно выполнить вход с email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          usernameOrEmail: validEmail,
          password: validPassword,
        })
        .expect(200);

      // Проверяем что вернулся accessToken
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.accessToken).toBeTruthy();

      // Проверяем что установился refreshToken в cookie
      const refreshTokenCookie: string = response.headers['set-cookie'];
      expect(refreshTokenCookie).toBeDefined();
    });

    it('должна успешно выполнить вход с username', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          usernameOrEmail: validUsername,
          password: validPassword,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.accessToken).toBeTruthy();
    });

    it('должна вернуть ошибку при входе с неправильным паролем', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          usernameOrEmail: validEmail,
          password: 'WrongPassword@123',
        })
        .expect(401);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при входе с несуществующим email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          usernameOrEmail: 'nonexistent@example.com',
          password: validPassword,
        })
        .expect(401);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при входе с пустыми полями', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          usernameOrEmail: '',
          password: '',
        })
        .expect(401);
      expect(response.body).toBeDefined();
    });
  });

  describe('POST /auth/logout - Выход из системы', () => {
    let accessToken: string;

    beforeAll(async () => {
      // Регистрируем и входим
      const email = 'logout_test@example.com';
      const password = 'Test@1234';

      const response = await request(app.getHttpServer()).post('/auth/registration').send({
        username: 'logouttest',
        email: email,
        password: password,
      });

      await request(app.getHttpServer())
        .post('/auth/confirm-email')
        .query(`code=${response.body.code}`);

      const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({
        usernameOrEmail: email,
        password: password,
      });
      expect(loginResponse.body.accessToken).toBeDefined();

      accessToken = loginResponse.body.accessToken;
    });

    it('должна успешно выполнить выход с валидным токеном', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('должна вернуть ошибку при logout без токена', async () => {
      const response = await request(app.getHttpServer()).post('/auth/logout').expect(401);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при logout с невалидным токеном', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', 'Bearer invalid_token')
        .expect(401);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /auth/password-recovery - Восстановление пароля', () => {
    const recoveryEmail = 'recovery_test@example.com';

    beforeAll(async () => {
      await request(app.getHttpServer()).post('/auth/registration').send({
        username: 'recoverytest',
        email: recoveryEmail,
        password: 'Test@1234',
      });
    });

    it('должна успешно отправить письмо на восстановление пароля', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-recovery')
        .send({
          email: recoveryEmail,
        })
        .expect(200);

      expect(response.body.code).toBeDefined();
    });

    it('должна не выбросить ошибку для несуществующего email (по соображениям безопасности)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-recovery')
        .send({
          email: 'nonexistent_recovery@example.com',
        })
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('должна вернуть ошибку при некорректном email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-recovery')
        .send({
          email: 'not-an-email',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при пустом email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/password-recovery')
        .send({
          email: '',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /auth/change-password - Смена пароля', () => {
    let recoveryCode: string;
    const changePasswordEmail = 'change_password_test@example.com';

    beforeAll(async () => {
      await request(app.getHttpServer()).post('/auth/registration').send({
        username: 'changepasstest',
        email: changePasswordEmail,
        password: 'Test@1234',
      });

      const response = await request(app.getHttpServer())
        .post('/auth/password-recovery')
        .send({
          email: changePasswordEmail,
        })
        .expect(200);
      recoveryCode = response.body.code;
    });

    it('должна успешно изменить пароль с валидным кодом восстановления', async () => {
      console.log(recoveryCode);
      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          recoveryCode: recoveryCode,
          newPassword: 'Test@1234',
        })
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('должна вернуть ошибку при смене пароля с невалидным кодом', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          recoveryCode: 'invalid-code',
          newPassword: 'NewTest@1234',
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при смене пароля на невалидный пароль', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          recoveryCode: recoveryCode,
          newPassword: 'weak', // Слишком слабый пароль
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /auth/confirm-email - Подтверждение email', () => {
    it('должна редиректить на frontend при валидном коде подтверждения', async () => {
      const registrationResponse = await request(app.getHttpServer())
        .post('/auth/registration')
        .send({
          username: 'confirmEmailTest2',
          email: 'confirm-email-testing@example.com',
          password: 'Test@1234',
        });

      const code: string = registrationResponse.body.code;

      const response = await request(app.getHttpServer())
        .post('/auth/confirm-email')
        .query({ code: code })
        .expect(302);
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      expect(response.headers.location).toContain(`${frontendUrl}/auth/sign-in?confirmed=true`);
    });

    it('должна вернуть ошибку при невалидном коде подтверждения', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/confirm-email')
        .query({ code: 'invalid-code' })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('должна вернуть ошибку при отсутствии кода подтверждения', async () => {
      const response = await request(app.getHttpServer()).post('/auth/confirm-email').expect(400);

      expect(response.body.message).toBeDefined();
    });
  });
});
