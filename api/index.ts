import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import helmet from 'helmet';
import * as compression from 'compression';

// Cache app instance để tránh khởi tạo lại mỗi request
let cachedApp: any = null;

async function createNestApp() {
  // Nếu đã có app cached, trả về luôn
  if (cachedApp) {
    return cachedApp;
  }

  console.log('🚀 Creating NestJS app...');

  // Tạo NestJS application
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'], // Giảm log cho serverless
  });

  // Security middlewares
  app.use(helmet());
  app.use(compression());

  // CORS configuration
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true' || false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global prefix
  app.setGlobalPrefix(process.env.API_PREFIX || 'api');

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger configuration - chỉ enable khi cần
  const shouldEnableSwagger = 
    process.env.SWAGGER_ENABLED === 'true' || 
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV !== 'production';

  if (shouldEnableSwagger) {
    const config = new DocumentBuilder()
      .setTitle(process.env.SWAGGER_TITLE || 'Student API')
      .setDescription(process.env.SWAGGER_DESCRIPTION || 'Student Management API Documentation')
      .setVersion(process.env.SWAGGER_VERSION || '1.0.0')
      .addTag(process.env.SWAGGER_TAG || 'student-api')
      .addBearerAuth()
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    console.log('📚 Swagger enabled at /api/docs');
  }

  // Initialize app (quan trọng cho serverless)
  await app.init();

  // Cache app instance
  cachedApp = app;
  
  console.log('✅ NestJS app created and cached');
  return app;
}

// Serverless handler function
export default async function handler(req: any, res: any) {
  try {
    console.log(`📡 ${req.method} ${req.url}`);
    
    // Tạo hoặc lấy cached NestJS app
    const app = await createNestApp();
    
    // Lấy Express instance từ NestJS app
    const httpAdapter = app.getHttpAdapter();
    const expressApp = httpAdapter.getInstance();
    
    // Xử lý request thông qua Express
    return expressApp(req, res);
    
  } catch (error) {
    console.error('❌ Serverless handler error:', error);
    
    res.status(500).json({
      statusCode: 500,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
}