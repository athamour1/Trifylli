-- AddForeignKey
ALTER TABLE "yliko_checkout" ADD CONSTRAINT "yliko_checkout_kladosId_fkey" FOREIGN KEY ("kladosId") REFERENCES "klados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
