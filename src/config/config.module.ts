import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import databaseConfig from './database.config';
import redisConfig from './redis.config';
import mailerConfig from './mailer.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '..', '..', '.env'),
      load: [databaseConfig, redisConfig, mailerConfig],
    }),
  ],
})
export class AppConfigModule {}
