import { PartialType } from '@nestjs/swagger';
import { CreateAiContextDto } from './create-ai-context.dto.js';

export class UpdateAiContextDto extends PartialType(CreateAiContextDto) {}
