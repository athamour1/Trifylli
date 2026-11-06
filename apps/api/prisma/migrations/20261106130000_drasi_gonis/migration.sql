-- Δράση: το γράμμα προς τους γονείς και η εξάρτυση (κοινά έγγραφα).
ALTER TABLE "drasi" ADD COLUMN "parentLetter" TEXT;
ALTER TABLE "drasi" ADD COLUMN "exartysi" JSONB;
