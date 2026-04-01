import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ChannelType } from '@prisma/client';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';

import { WebhooksService } from './webhooks.service.js';

/**
 * NOTE: main.ts must be configured with `rawBody: true` in NestFactory.create()
 * to make request.rawBody available.
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
    @InjectQueue('message-inbound')
    private readonly messageInboundQueue: Queue,
  ) {}

  @Get(':channelType/:channelId')
  @ApiExcludeEndpoint()
  handleVerification(
    @Param('channelType') channelTypeParam: string,
    @Param('channelId') channelId: string,
    @Query() query: Record<string, string>,
  ): string {
    const channelType = this.parseChannelType(channelTypeParam);

    const result = this.webhooksService.handleVerification(
      channelType,
      channelId,
      query,
    );

    if (result === null) {
      throw new BadRequestException('Verification failed');
    }

    return result;
  }

  @Post('new-chat')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleNewChat(
    @Body() body: Record<string, unknown>,
  ): Promise<{ status: string }> {
    this.logger.log('Webhook new-chat received');

    const instance = body.instance as string | undefined;
    const data = body.data as Record<string, unknown> | undefined;
    const key = data?.key as Record<string, unknown> | undefined;
    const remoteJid = key?.remoteJid as string | undefined;
    const fromMe = key?.fromMe as boolean | undefined;

    if (!instance || !remoteJid) {
      this.logger.warn('new-chat webhook: missing instance or remoteJid');
      return { status: 'ignored' };
    }

    if (fromMe) {
      return { status: 'ignored' };
    }

    // Strip @s.whatsapp.net / @g.us suffix to get the raw number
    const number = remoteJid.split('@')[0];

    const evolutionUrl = this.configService.get<string>(
      'EVOLUTION_API_URL',
      'http://evolution-api:8080',
    );
    const evolutionKey = this.configService.get<string>(
      'EVOLUTION_API_KEY',
      '',
    );

    try {
      const response = await fetch(
        `${evolutionUrl}/message/sendText/${instance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evolutionKey,
          },
          body: JSON.stringify({ number, text: 'hola esto es un nuevo chat' }),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`Evolution API error (${response.status}): ${err}`);
      } else {
        this.logger.log(`Message sent to ${number} via instance ${instance}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to call Evolution API: ${(error as Error).message}`,
      );
    }

    return { status: 'ok' };
  }

  @Post(':channelType/:channelId')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleInbound(
    @Param('channelType') channelTypeParam: string,
    @Param('channelId') channelId: string,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    const channelType = this.parseChannelType(channelTypeParam);

    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException(
        'Raw body not available. Ensure rawBody is enabled in NestFactory.create options.',
      );
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }

    const result = await this.webhooksService.processInboundWebhook(
      channelType,
      channelId,
      rawBody,
      headers,
    );

    if (result.messages.length > 0) {
      await this.messageInboundQueue.add('process', result, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      });
    }

    return { status: 'ok' };
  }

  private parseChannelType(value: string): ChannelType {
    const upper = value.toUpperCase();
    if (!Object.values(ChannelType).includes(upper as ChannelType)) {
      throw new BadRequestException(`Invalid channel type: ${value}`);
    }
    return upper as ChannelType;
  }
}
