import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Setup Swagger documentation for the main gateway service.
 */
export function swaggerSetup(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Inctagram API')
    .setDescription('The official API documentation for Inctagram social network.')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refreshToken', {
      type: 'apiKey',
      in: 'cookie',
      description: 'Cookie for refreshing access tokens',
    })
    .addOAuth2({
      type: 'oauth2',
      flows: {
        authorizationCode: {
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          scopes: {
            email: 'Access your email',
            profile: 'Access your profile information',
          },
        },
      },
    })
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  });

  // Custom CSS for High-Contrast Dark Theme and Branding
  const customCss = `
    body {
      background-color: #0b0b0b !important;
      margin: 0;
    }
    .swagger-ui {
      filter: none !important;
      background-color: #0b0b0b;
    }
    .swagger-ui .info .title, .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info table {
      color: #ffffff !important;
    }
    .swagger-ui .opblock-tag {
      color: #ffffff !important;
      border-bottom: 1px solid #333 !important;
    }
    .swagger-ui .opblock .opblock-summary-operation-id, .swagger-ui .opblock .opblock-summary-path, .swagger-ui .opblock .opblock-summary-description {
      color: #e0e0e0 !important;
    }
    .swagger-ui .opblock-description-wrapper p, .swagger-ui .tabli a, .swagger-ui .opblock-title_normal {
      color: #d0d0d0 !important;
    }
    .swagger-ui .response-col_status, .swagger-ui .response-col_links {
      color: #ffffff !important;
    }
    .swagger-ui section.models h4, .swagger-ui section.models h4 span {
      color: #ffffff !important;
    }
    .swagger-ui .model-title {
      color: #49cc90 !important;
    }
    .swagger-ui .model {
      color: #e0e0e0 !important;
    }
    .swagger-ui .topbar {
      background-color: #000000 !important;
      border-bottom: 1px solid #3f51b5 !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5);
    }
    .swagger-ui .topbar-wrapper img {
      content: url('https://img.icons8.com/color/48/instagram-new--v1.png');
      width: 36px;
      height: 36px;
    }
    .swagger-ui .topbar-wrapper::before {
      content: 'Inctagram';
      color: #ffffff;
      font-weight: 700;
      font-size: 1.4rem;
      margin-right: 12px;
      letter-spacing: -0.5px;
    }
    .swagger-ui .btn.authorize {
      color: #49cc90 !important;
      border-color: #49cc90 !important;
      background: transparent !important;
    }
    .swagger-ui .btn.authorize svg {
      fill: #49cc90 !important;
    }
    .swagger-ui input, .swagger-ui select, .swagger-ui textarea {
      background: #1a1a1a !important;
      color: #ffffff !important;
      border: 1px solid #333 !important;
    }
    .swagger-ui .opblock.opblock-get { background: rgba(97, 175, 254, 0.1) !important; border-color: #61affe !important; }
    .swagger-ui .opblock.opblock-post { background: rgba(73, 204, 144, 0.1) !important; border-color: #49cc90 !important; }
    .swagger-ui .opblock.opblock-delete { background: rgba(249, 62, 62, 0.1) !important; border-color: #f93e3e !important; }
    .swagger-ui .opblock.opblock-put { background: rgba(252, 161, 48, 0.1) !important; border-color: #fca130 !important; }
    .swagger-ui .scheme-container {
      background: #0b0b0b !important;
      box-shadow: none !important;
      border-bottom: 1px solid #333 !important;
    }
    .swagger-ui .expand-operation, .swagger-ui .opblock-control-arrow {
      fill: #ffffff !important;
    }
  `;

  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'Inctagram API Documentation',
    customfavIcon: 'https://img.icons8.com/color/48/instagram-new--v1.png',
    customCss: customCss,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      defaultModelsExpandDepth: -1,
      tagsSorter: (a: string, b: string) => {
        const order = ['Auth', 'Sessions', 'Users', 'Gateway', 'Testing'];
        const indexA = order.indexOf(a);
        const indexB = order.indexOf(b);

        if (indexA !== -1 || indexB !== -1) {
          return (indexA === -1 ? order.length : indexA) - (indexB === -1 ? order.length : indexB);
        }

        return a.localeCompare(b);
      },
    },
  });
}
