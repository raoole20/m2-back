import { PartialType } from '@nestjs/swagger';
import { CreateChannelDto } from './create-channel.dto.js';

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}
