import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Ο μύθος της δράσης· κενό κείμενο ⇒ σβήνει. */
export class UpdateMythosDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Η ιστορία — Markdown.' })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  text?: string | null;
}

export class CreateCharacterDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Το lore του ρόλου — Markdown.' })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  lore?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Το στέλεχος (id συμμετέχοντα) που τον παίζει.' })
  @IsOptional()
  @IsUUID()
  participantId?: string;
}

export class UpdateCharacterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  lore?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  participantId?: string | null;
}

/** Η σειρά των ρόλων — όλα τα ids, με τη νέα σειρά. */
export class OrderCharactersDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
