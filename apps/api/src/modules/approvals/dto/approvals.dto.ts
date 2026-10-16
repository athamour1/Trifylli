import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { COMMENT_LIMITS } from '@trifylli/shared';

/** Το κοινό έγγραφο (π.χ. `drasi:<id>:item:<id>`). */
export class ApprovalDocumentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  document!: string;
}

/** «Επιστροφή»: πίσω στο πρόχειρο, με σχόλιο για το τι να διορθωθεί. */
export class ApprovalReturnDto extends ApprovalDocumentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(COMMENT_LIMITS.body)
  note!: string;
}

export class ApprovalSummaryQueryDto {
  @ApiProperty()
  @IsUUID()
  drasi!: string;
}
