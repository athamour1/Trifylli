import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DrasiReviewKind } from '@trifylli/shared';

export class ReviewQuestionDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Κενό ⇒ νέα ερώτηση· με id κρατά τις απαντήσεις της.' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(300)
  text!: string;

  @ApiPropertyOptional({ enum: DrasiReviewKind, default: DrasiReviewKind.TEXT })
  @IsOptional()
  @IsEnum(DrasiReviewKind)
  kind?: DrasiReviewKind;
}

/** Αντικαθιστά τις ερωτήσεις (με τη σειρά που δίνονται)· όσες λείπουν σβήνονται μαζί με τις απαντήσεις τους. */
export class SetReviewQuestionsDto {
  @ApiProperty({ type: [ReviewQuestionDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ReviewQuestionDto)
  questions!: ReviewQuestionDto[];
}

export class ReviewAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  questionId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  value?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string | null;
}

export class SetReviewAnswersDto {
  @ApiProperty({ type: [ReviewAnswerDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ReviewAnswerDto)
  answers!: ReviewAnswerDto[];
}
