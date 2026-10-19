-- Ενημέρωση για καταγραφή συνεδριών και analytics: έκδοση κειμένου και ώρα αποδοχής.
ALTER TABLE "user" ADD COLUMN "trackingNoticeVersion" INTEGER;
ALTER TABLE "user" ADD COLUMN "trackingNoticeAcceptedAt" TIMESTAMP(3);
