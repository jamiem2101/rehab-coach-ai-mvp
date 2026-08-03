# Rehab Coach AI MVP

Mobile-first browser prototype for a clinician-supervised knee rehab app.

The prototype is intentionally static so it can run free on GitHub Pages. It uses the browser camera, attempts on-device pose tracking with MediaPipe, gives live form cues, tracks reps/points/streaks, and shows a mock clinician triage dashboard.

## What is included

- Patient exercise view
- Camera-based pose tracking for hip/knee/ankle
- Live form feedback and optional voice cues
- Five knee rehab exercises
- Pain check-in and sharp-pain flag
- Gamified points/streaks
- Mock clinician dashboard
- Triage alerts for pain, repeated form errors, missed sessions, and completed sessions

## Clinical safety position

This is a demo and workflow prototype. It is not a medical device, diagnostic tool, autonomous physiotherapist, or patient-ready product. A real product would need clinician validation, consent flows, data protection controls, clinical governance, audit trails, and regulatory review.

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

Camera access usually needs HTTPS on a phone, so the local browser may require demo mode.

## Deploy free on GitHub Pages

1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, `app.js`, `.nojekyll`, and this `README.md`.
3. Go to `Settings -> Pages`.
4. Set source to `Deploy from a branch`.
5. Select `main` and `/root`.
6. Wait for GitHub to publish the site.
7. Open the GitHub Pages URL on a smartphone.

## Recommended MVP pathway

Start with clinician-prescribed knee rehab rather than general rehab. It is easier to demonstrate because hip/knee/ankle angles can be tracked visually using a normal phone camera, the exercises require little equipment, and triage rules are easier to explain.

## Next build steps

- Add real clinician/patient accounts with Supabase or Firebase.
- Store sessions and alerts in a database.
- Add clinician-created exercise prescriptions.
- Run validation with physiotherapists before any real patient testing.
- Add consent, privacy notices, and audit logs.
