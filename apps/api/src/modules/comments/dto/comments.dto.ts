import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { COMMENT_LIMITS } from '@trifylli/shared';

/** Το κοινό έγγραφο (π.χ. `drasi:<id>:item:<id>`). */
export class CommentsQueryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  document!: string;
}

class CommentAnchorDto {
  @ApiProperty()
  @IsString()
  @MaxLength(COMMENT_LIMITS.anchor)
  start!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(COMMENT_LIMITS.anchor)
  end!: string;
}

export class CreateCommentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  document!: string;

  @ApiPropertyOptional({ description: 'Το κείμενο μέσα στο έγγραφο (`description`, `block:<id>`…)' })
  @IsOptional()
  @IsString()
  @MaxLength(COMMENT_LIMITS.field)
  field?: string | null;

  @ApiPropertyOptional({ type: CommentAnchorDto, description: 'Η φράση: relative positions του Yjs (base64)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommentAnchorDto)
  anchor?: CommentAnchorDto | null;

  /** Κόβεται στο όριο — δεν απορρίπτεται. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  quote?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(COMMENT_LIMITS.body)
  body!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMMENT_LIMITS.mentions)
  @IsUUID(undefined, { each: true })
  mentionIds?: string[];

  @ApiPropertyOptional({ description: 'Απάντηση σε αυτό το σχόλιο' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class EditCommentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(COMMENT_LIMITS.body)
  body!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(COMMENT_LIMITS.mentions)
  @IsUUID(undefined, { each: true })
  mentionIds?: string[];
}

export class ResolveCommentDto {
  @ApiProperty()
  @IsBoolean()
  resolved!: boolean;
}
