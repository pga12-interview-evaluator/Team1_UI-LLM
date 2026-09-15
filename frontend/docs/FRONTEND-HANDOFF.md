# Interviewly frontend handoff

## Run and review

`cd frontend && npm install && npm run dev` opens the development workspace at http://localhost:3000.

- `/`: responsive practice dashboard; recent sessions are browser-local metadata.
- `/setup`: resume upload and interview settings. No email or invite required.
- `/i/{token}`: consent, device check, disclosure, questions, voice/text answers, live camera, screen sharing, recording, breaks and accommodations.
- `/recordings`: local recording playback, download, and deletion.
- `/console`: requisitions, sessions, transcripts, reports, and human decisions. In development + mock mode, the login screen has **Enter development workspace**, which issues a signed HttpOnly cookie without email/password. `/api/mock/console/dev-login` returns 404 in production. Existing sign-in remains available.
- `/guide`: preparation, device, and recording instructions.

## What works now vs what the service must supply

The app defaults to its existing scripted mock engine, **not Gemini**. New setup sessions have unique tokens and preserve role, language, duration, style, and candidate label. The mock validates the uploaded file but intentionally neither persists nor parses resumes. Questions and reports still use the finance fixture regardless of role; the UI labels this explicitly. It does not claim resume analysis has occurred.

In real mode, existing candidate and reviewer calls use `NEXT_PUBLIC_API_BASE_URL`. The Gemini Python runtime and voice-to-text modules in this repository are not HTTP implementations of these contracts yet. Team services must provide the BFF in `api-contract.md`, including transcription and final report generation. Keep Gemini credentials server-side. Do not import Python prompt packs or expose evaluator outputs on the candidate channel.

## New creation endpoint for the BFF

`POST /candidate/sessions`, multipart/form-data, responds `201`:

```json
{ "session_id": "S_...", "invite_token": "inv_...", "mode": "real" }
```

Fields are defined and validated in `src/lib/api/schemas/setup.ts`:

| Field              | Contract                                                      |
| ------------------ | ------------------------------------------------------------- |
| resume             | File; PDF, DOCX, TXT; nonempty; max 10 MiB                    |
| candidate_name     | Trimmed string, 1–100 characters                              |
| job_title          | Trimmed string, 2–150 characters                              |
| job_description    | Optional content, empty string allowed, max 20,000 characters |
| duration_minutes   | 20, 30, 45, 60                                                |
| interview_style    | mixed, technical, behavioral, case                            |
| seniority          | intern, junior, mid, senior, lead, manager                    |
| interview_language | en-IN, hi-IN                                                  |

The real service should validate content/signatures and upload size at the ingress, extract and redact resume text, create the candidate blueprint, and return a session that begins at `awaiting_consent`. This public practice creation route needs server-side rate limits and abuse controls before internet deployment. Candidate names/resumes must remain untrusted data in Gemini prompts. Return the existing `{code,message}` error shape; the form retains inputs on failure.

## Interview and media integration

Existing endpoints remain compatible: consent → device-ready → start → answers, requests and SSE events. Responses still pass the strict candidate DTO allowlist. Transcription and per-answer analysis run on the backend; the browser renders the returned next question, never internal scores or evaluator directives.

Answer audio: `/candidate/sessions/{token}/media` uploads sequential MediaRecorder chunks with `turn_index` and `sequence`. The frontend now waits for all chunks, including the final one, before submitting `media_ref` in the answer. Chunks from a recorder are a continuous container stream: concatenate in sequence before decoding, not each chunk independently. The service must aggregate by session + turn and apply behavioral consent separately from transcription consent. An upload failure fails the answer instead of silently submitting a stale reference.

## Full session recording

`useSessionRecording` captures a 1280×720 canvas at 10 fps. Shared screen is fitted to the canvas, camera is inset, and the microphone is cloned into the recording. Without screen sharing, it records the current question as text and the camera inset. Browser-supported WebM or MP4 is selected. Screen/tab audio and the speech-synthesis voice are **not** captured. Browser speech synthesis is an optional question read-aloud control, not the Gemini voice service.

- Starts once the live session has recording consent and devices are available. Screen sharing always needs a separate user gesture and browser picker.
- Browser cancellation and unsupported devices produce recoverable messages.
- Pauses on interview breaks, resumes after a break, and stops on closure/escalation. Manual pause and save are available.
- Camera-off accommodation removes camera content. Typed-only setup does not reacquire camera/mic; screen-only recording can be started explicitly.
- Saves the final Blob to IndexedDB in the current origin, with playback/download in `/recordings`. No server recording upload is implemented or claimed.
- If storage fails, a direct download remains available in the studio. Media is buffered in memory until finalization: long sessions need sufficient memory and an open tab. Reload/crash before saving can lose the current recording; a browser leave warning is installed while recording/saving. Browser storage can be cleared or evicted; users should download important recordings.

For production cloud recording, replace the local persistence boundary with authenticated, resumable object-storage uploads and retention policy from the owning team. Keep screen/camera recording separate from answer-ASR chunks. A completed recording's upload and retrieval API has not been defined by the team yet.

## Deployment

The existing standalone Next.js Dockerfile is retained. Build with the real API URL only after the BFF implements the contracts. Use HTTPS for browser media APIs, same-origin routing where possible, and appropriate CORS/auth for a separate origin. `Permissions-Policy` allows camera/mic for self; CSP permits `blob:` playback. Set real cookie secrets and replace mock authentication for production. No cloud deployment has been performed as part of this frontend refinement.

## Validation

`npm run check`, `npm run build`, and Playwright cover the existing candidate/reviewer flows plus responsive workspace navigation, upload rejection, session creation, camera/recording controls, denied screen sharing, downloadable playable recordings, persistence across reload, and deletion. Synthetic browser devices test the capture path; a real webcam/screen picker and long recording should also be tried on the deployment browser before release.

### Per-request security policy

The root layout uses `force-dynamic`: the proxy creates a fresh CSP nonce per request, so static prerendered pages would emit scripts without a matching nonce and fail hydration in production (the login screen could be blank). All UI routes now render per request. The production browser suite exercises this behavior.

