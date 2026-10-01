# Μικρή εικόνα bootstrap: το στατικό binary του Garage πάνω σε alpine (busybox
# shell/awk), ώστε να τρέξει το idempotent bootstrap script.
FROM dxflrs/garage:v1.1.0 AS garage
FROM alpine:3.20
COPY --from=garage /garage /usr/local/bin/garage
COPY bootstrap.sh /bootstrap.sh
RUN chmod +x /bootstrap.sh
ENTRYPOINT ["/bin/sh", "/bootstrap.sh"]
