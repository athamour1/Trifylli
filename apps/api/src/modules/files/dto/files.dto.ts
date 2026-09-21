import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { FilePurpose, KladosType } from '@trifylli/shared';

export class UploadFileDto {
  @IsString()
  @IsIn(Object.values(FilePurpose))
  purpose!: string;

  /** Κενό ⇒ αρχείο επιπέδου Τοπικού (μόνο υπερδιαχειριστής). */
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;
}
