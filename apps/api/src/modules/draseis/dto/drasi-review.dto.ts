import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DrasiReviewAudience, DrasiReviewKind } from '@trifylli/shared';

export class ReviewQuestionDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Κενό ⇒ νέα ερώτηση· με id κρατά τις απαντήσεις της.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  text!: string;

  @ApiPropertyOptional({ description: 'Βοηθητικό κείμενο κάτω από την ερώτηση.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ enum: DrasiReviewKind, default: DrasiReviewKind.TEXT })
  @IsOptional()
  @IsEnum(DrasiReviewKind)
  kind?: DrasiReviewKind;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Επιλογές (CHOICE/CHECKBOX).' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'Ετικέτα αριστερού άκρου κλίμακας.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  scaleLow?: string | null;

  @ApiPropertyOptional({ description: 'Ετικέτα δεξιού άκρου κλίμακας.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  scaleHigh?: string | null;
}

/** Αντικαθιστά τις ερωτήσεις (με τη σειρά που δίνονται)· όσες λείπουν σβήνονται μαζί με τις απαντήσεις τους. */
export class SetReviewQuestionsDto {
  @ApiProperty({ type: [ReviewQuestionDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ReviewQuestionDto)
  questions!: ReviewQuestionDto[];
}

/** Οι ρυθμίσεις της φόρμας — όλα προαιρετικά, αλλάζει ό,τι σταλεί. */
export class UpdateReviewSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptingResponses?: boolean;

  @ApiPropertyOptional({ description: 'Ανώνυμη: ονόματα πουθενά — ούτε στη λήψη.' })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @ApiPropertyOptional({ enum: DrasiReviewAudience })
  @IsOptional()
  @IsEnum(DrasiReviewAudience)
  audience?: DrasiReviewAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowEdit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSummary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  confirmationMessage?: string;
}

export class ReviewAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, description: 'Κλίμακες.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  value?: number | null;

  @ApiPropertyOptional({ description: 'Κείμενο ή η μία επιλογή.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Πλαίσια ελέγχου.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  choices?: string[];
}

export class SetReviewAnswersDto {
  @ApiProperty({ type: [ReviewAnswerDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ReviewAnswerDto)
  answers!: ReviewAnswerDto[];
}
