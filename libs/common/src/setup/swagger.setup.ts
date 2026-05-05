import { INestApplication, Logger } from '@nestjs/common';

export type SwaggerSetupOptions = {
  title: string;
  description: string;
  version: string;
  path?: string;
  siteTitle?: string;
  enableBearerAuth?: boolean;
};

type DocumentBuilderLike = {
  setTitle(title: string): DocumentBuilderLike;
  setDescription(description: string): DocumentBuilderLike;
  setVersion(version: string): DocumentBuilderLike;
  addBearerAuth(authOptions: Record<string, unknown>, name: string): DocumentBuilderLike;
  build(): Record<string, unknown>;
};

type SwaggerModuleLike = {
  createDocument(app: INestApplication, config: Record<string, unknown>): unknown;
  setup(
    path: string,
    app: INestApplication,
    document: unknown,
    options?: Record<string, unknown>,
  ): void;
};

const logger = new Logger('SwaggerSetup');

export function setupSwagger(app: INestApplication, options: SwaggerSetupOptions): void {
  try {
    const swaggerModule = require('@nestjs/swagger') as {
      DocumentBuilder: new () => DocumentBuilderLike;
      SwaggerModule: SwaggerModuleLike;
    };

    const { DocumentBuilder, SwaggerModule } = swaggerModule;
    const documentBuilder = new DocumentBuilder()
      .setTitle(options.title)
      .setDescription(options.description)
      .setVersion(options.version);

    if (options.enableBearerAuth ?? true) {
      documentBuilder.addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'bearer',
      );
    }

    const document = SwaggerModule.createDocument(app, documentBuilder.build());
    SwaggerModule.setup(options.path ?? 'api', app, document, {
      customSiteTitle: options.siteTitle ?? options.title,
    });
  } catch (error: unknown) {
    logger.warn(
      'Swagger is enabled, but @nestjs/swagger is not installed. Skipping Swagger setup.',
    );
  }
}
