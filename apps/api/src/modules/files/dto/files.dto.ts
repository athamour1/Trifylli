import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { FilePurpose, KladosType } from '@trifylli/shared';

export class UploadFileDto {
  @IsString()
  @IsIn(Object.values(FilePurpose))
  purpose!: string;

  /** Κενό ⇒ αρχείο επιπέδου Τοπικού (μόνο υπερδιαχειριστής). */
  @IsOptional()
  @IsEnum(KladosType)
  kladosType?: KladosType;

  /**
   * Εικόνα σε κοινό έγγραφο (π.χ. `drasi:<id>:item:<id>`): ανεβάζει όποιος γράφει
   * στο έγγραφο και τη βλέπει όποιος το βλέπει — όχι ο κλάδος.
   */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  collabDocument?: string;

  /**
   * Απόδειξη δράσης (ταμείο, πληρωμή, αγορά υλικού): την ανεβάζει όποιος
   * καταχωρεί εκεί και τη βλέπει όποιος βλέπει το ταμείο της — όχι ο κλάδος.
   */
  @IsOptional()
  @IsUUID()
  drasiId?: string;
}
