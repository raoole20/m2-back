import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ChannelProvider } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { CurrentTenant } from '../../common/decorators/tenant.decorator.js';
import { ChannelsService } from './channels.service.js';
import {
  EvolutionService,
  EvolutionInstanceExistsError,
  type EvolutionInstanceResponse,
  type EvolutionConnectionState,
} from './evolution.service.js';

@ApiTags('Evolution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('channels')
export class EvolutionController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly evolutionService: EvolutionService,
  ) {}

  @Post(':channelId/evolution/connect')
  @ApiOperation({ summary: 'Create Evolution instance (or reuse existing) and return QR/state' })
  @ApiResponse({ status: 201, description: 'Instance ensured; webhook registered; QR or connection state returned' })
  @ApiResponse({ status: 400, description: 'Channel is not an Evolution provider' })
  async connect(
    @CurrentTenant() tenantId: string,
    @Param('channelId') channelId: string,
  ): Promise<EvolutionInstanceResponse> {
    const { credentials, baseUrl } =
      await this.getEvolutionCredentials(tenantId, channelId);

    let result: EvolutionInstanceResponse;
    try {
      result = await this.evolutionService.createInstance(
        credentials.instanceName,
        credentials.apiKey,
        baseUrl,
      );
    } catch (error) {
      if (error instanceof EvolutionInstanceExistsError) {
        result = await this.evolutionService.connectInstance(
          credentials.instanceName,
          credentials.apiKey,
          baseUrl,
        );
      } else {
        throw error;
      }
    }

    const callbackUrl = `http://api:3000/webhooks/whatsapp/${channelId}?token=${credentials.apiKey}`;
    await this.evolutionService.setWebhook(
      credentials.instanceName,
      credentials.apiKey,
      callbackUrl,
      baseUrl,
    );

    this.channelsService
      .syncEvolutionContacts(tenantId, channelId)
      .catch(() => undefined);

    return result;
  }

  @Get(':channelId/evolution/qr')
  @ApiOperation({ summary: 'Get current QR code for WhatsApp connection' })
  @ApiResponse({ status: 200, description: 'QR code data returned' })
  @ApiResponse({ status: 400, description: 'Channel is not an Evolution provider' })
  async getQrCode(
    @CurrentTenant() tenantId: string,
    @Param('channelId') channelId: string,
  ): Promise<EvolutionInstanceResponse> {
    const { credentials, baseUrl } =
      await this.getEvolutionCredentials(tenantId, channelId);

    const result = await this.evolutionService.connectInstance(
      credentials.instanceName,
      credentials.apiKey,
      baseUrl,
    );

    return result;
  }

  @Get(':channelId/evolution/status')
  @ApiOperation({ summary: 'Get Evolution instance connection status' })
  @ApiResponse({ status: 200, description: 'Connection status returned' })
  @ApiResponse({ status: 400, description: 'Channel is not an Evolution provider' })
  async getStatus(
    @CurrentTenant() tenantId: string,
    @Param('channelId') channelId: string,
  ): Promise<EvolutionConnectionState> {
    const { credentials, baseUrl } =
      await this.getEvolutionCredentials(tenantId, channelId);

    const result = await this.evolutionService.getConnectionStatus(
      credentials.instanceName,
      credentials.apiKey,
      baseUrl,
    );

    return result;
  }

  @Post(':channelId/evolution/sync-contacts')
  @ApiOperation({ summary: 'Sync contacts from paired device phonebook' })
  @ApiResponse({ status: 200, description: 'Contacts synchronized' })
  @ApiResponse({ status: 400, description: 'Channel is not an Evolution provider' })
  async syncContacts(
    @CurrentTenant() tenantId: string,
    @Param('channelId') channelId: string,
  ): Promise<{ imported: number; updated: number; total: number }> {
    return this.channelsService.syncEvolutionContacts(tenantId, channelId);
  }

  private async getEvolutionCredentials(
    tenantId: string,
    channelId: string,
  ): Promise<{
    credentials: { instanceName: string; apiKey: string };
    baseUrl?: string;
  }> {
    const channel = await this.channelsService.findOne(tenantId, channelId);

    if (channel.provider !== ChannelProvider.EVOLUTION) {
      throw new BadRequestException(
        'This endpoint is only available for Evolution provider channels',
      );
    }

    const credentials = channel.credentials as Record<string, string>;

    if (!credentials.instanceName || !credentials.apiKey) {
      throw new BadRequestException(
        'Channel credentials must include instanceName and apiKey',
      );
    }

    return {
      credentials: {
        instanceName: credentials.instanceName,
        apiKey: credentials.apiKey,
      },
      baseUrl: credentials.evolutionApiUrl,
    };
  }
}
