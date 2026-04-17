import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
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
    @InjectQueue('message-inbound')
    private readonly messageInboundQueue: Queue,
  ) {}

  @Get(':channelType/:channelId')
  @ApiExcludeEndpoint()
  async handleVerification(
    @Param('channelType') channelTypeParam: string,
    @Param('channelId') channelId: string,
    @Query() query: Record<string, string>,
  ): Promise<string> {
    const channelType = this.parseChannelType(channelTypeParam);

    const result = await this.webhooksService.handleVerification(
      channelType,
      channelId,
      query,
    );

    if (result === null) {
      throw new BadRequestException('Verification failed');
    }

    return result;
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
