# «Log in with Authentik» στο GlitchTip: δημιουργεί/ενημερώνει τον OIDC provider
# (allauth SocialApp) από το περιβάλλον — αντί για χειροκίνητο Django admin.
# Τρέχει σε κάθε `up` από το one-shot `glitchtip-sso`:
#   ./manage.py shell < configure-sso.py
# Χωρίς GLITCHTIP_OIDC_ISSUER δεν κάνει τίποτα. Ο client στο Authentik:
# infra/authentik/glitchtip-oidc.yaml. Βλ. docs/monitoring.md §3.
import os

from allauth.socialaccount.models import SocialAccount, SocialApp
from django.contrib.auth import get_user_model

issuer = os.environ.get("GLITCHTIP_OIDC_ISSUER", "").strip()
secret = os.environ.get("GLITCHTIP_OIDC_CLIENT_SECRET", "").strip()

if not issuer or not secret:
    print("[glitchtip-sso] χωρίς GLITCHTIP_OIDC_ISSUER/SECRET — τίποτα.")
else:
    app, created = SocialApp.objects.update_or_create(
        provider="openid_connect",
        provider_id="authentik",
        defaults={
            "name": "Authentik",
            "client_id": "glitchtip",
            "secret": secret,
            "key": "",
            # Χωρίς τελικό «/»: το allauth προσθέτει μόνο του το /.well-known/….
            "settings": {"server_url": issuer.rstrip("/")},
        },
    )
    print(f"[glitchtip-sso] {'δημιουργήθηκε' if created else 'ενημερώθηκε'}: {app.name} → {issuer}")

    # Κάθε χρήστης του GlitchTip δένεται με τον λογαριασμό του Authentik με το
    # ίδιο email (το Authentik στέλνει `sub` = email — glitchtip-oidc.yaml). Το UI
    # του GlitchTip δεν έχει «σύνδεσε λογαριασμό», και η εγγραφή είναι κλειστή:
    # χωρίς αυτό κανείς δεν θα έμπαινε με SSO. Νέος χρήστης (createsuperuser) ⇒
    # δένεται στο επόμενο `up` (ή: docker compose … up glitchtip-sso).
    linked = 0
    for user in get_user_model().objects.exclude(email=""):
        _, new = SocialAccount.objects.get_or_create(
            provider="authentik", uid=user.email, defaults={"user": user, "extra_data": {}}
        )
        linked += int(new)
    print(f"[glitchtip-sso] νέες συνδέσεις λογαριασμών: {linked}")
