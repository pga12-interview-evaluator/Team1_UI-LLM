/**
 * UI chrome strings only. Interview questions and fixed scripts arrive from the backend already
 * translated (session.interview_language). Keys are stable identifiers; add locales here.
 */
export const en = {
  common: {
    appName: "AI Interview",
    loading: "Loading…",
    retry: "Retry",
    back: "Back",
    continue: "Continue",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    yes: "Yes",
    no: "No",
    optional: "optional",
    required: "required",
    errorTitle: "Something went wrong",
    errorBody:
      "Your progress is saved on our side. Please try again; if it keeps happening, contact the recruiting team.",
    offline: "You appear to be offline. Reconnecting…",
    skipToContent: "Skip to main content",
  },
  consent: {
    title: "Before you begin",
    intro:
      "This interview is conducted by an AI interviewer. Please read and confirm the following. You can stop at any time.",
    noticeLabel:
      "I understand this interview is conducted by an AI interviewer and my answers will be assessed.",
    recordingLabel:
      "I consent to audio and video being recorded and transcribed for this interview.",
    behavioralLabel:
      "I consent to audio/video signals being used only to choose the next follow-up question. They are never part of my score.",
    behavioralHelp:
      "Optional. If you decline, the interview runs the same way without any audio/video analysis.",
    modalityHint:
      "You may answer by voice or by typing. You can switch at any time by asking for an adjustment.",
    submit: "Confirm and continue",
    privacyNote:
      "You do not need to name companies or share confidential figures; describe the work in your own words.",
  },
  device: {
    title: "Check your setup",
    micLabel: "Microphone",
    camLabel: "Camera",
    micOk: "Microphone detected",
    camOk: "Camera detected",
    denied: "Permission denied. You can still continue by typing your answers.",
    notFound: "No device found. You can still continue by typing your answers.",
    testMic: "Speak to test your microphone",
    levelLabel: "Input level",
    cameraOff: "Continue with camera off",
    cameraSkipped:
      "Camera is not available, so the interview will run with your microphone only.",
    proceed: "Everything looks fine — continue",
    textOnly: "Continue with typed answers only",
  },
  disclosure: {
    title: "How this interview works",
    begin: "Begin the interview",
  },
  interview: {
    yourAnswer: "Your answer",
    typePlaceholder: "Type your answer here…",
    submit: "Submit answer",
    submitting: "Submitting…",
    recording: "Recording",
    startRecording: "Start speaking",
    stopRecording: "Finish answer",
    switchToText: "Type instead",
    switchToVoice: "Speak instead",
    timeLeft: "Time left for this answer",
    autoSubmitSoon: "Your answer will be submitted in 10 seconds.",
    interviewerLabel: "Interviewer",
    evaluating: "Noted.",
    bridge1: "Noted.",
    bridge2: "Let me follow up on one part of that.",
    bridge3: "Moving to a different area.",
    liveCaptions: "Live captions",
    captionsHint: "Automatic captions of your own speech. They are not the record of your answer.",
    phase: { interview: "Interview", your_questions: "Your questions", closing: "Closing" },
    rights: {
      title: "You can always",
      repeat: "Repeat",
      rephrase: "Rephrase",
      break: "Take a break",
      adjustment: "Adjustment",
      stop: "Stop",
      repeatHelp: "Hear the question again",
      rephraseHelp: "Ask for different wording",
      breakHelp: "Pause for a moment",
      adjustmentHelp: "Change how the interview runs",
      stopHelp: "End the interview",
    },
    paused: {
      title: "Paused",
      body: "Tell me when you are ready to continue.",
      resume: "I am ready to continue",
    },
    stopConfirm: {
      title: "End the interview?",
      body: "This ends the interview now. A member of the team will follow up with you directly. You can also take a break instead.",
      confirm: "Yes, end the interview",
      breakInstead: "Take a break instead",
    },
    adjustment: {
      title: "Adjust how the interview runs",
      body: "Choose what should change. It applies immediately and you will not be asked why.",
      apply: "Apply",
      codes: {
        extended_answer_time: "More time to answer (no answer timer)",
        text_modality: "Type my answers instead of speaking",
        voice_modality: "Speak my answers instead of typing",
        read_aloud: "Read questions aloud",
        captions: "Show questions in writing",
        breaks: "Allow breaks whenever I need",
        camera_off: "Turn my camera off",
        no_behavioral_analysis: "No audio/video analysis",
        high_contrast: "High-contrast display",
        human_interviewer: "I need a human interviewer",
      },
    },
    closing: {
      title: "Interview complete",
      body: "Thank you for your time. The recruiting team will contact you about next steps.",
      canClose: "You can close this window.",
    },
    escalated: {
      title: "Interview paused",
      body: "A member of the team will follow up with you directly. You can close this window.",
    },
    questionsPhaseHint: "You can ask about the role or the company. Type your question below.",
  },
  console: {
    title: "Interview console",
    nav: {
      dashboard: "Dashboard",
      requisitions: "Requisitions",
      sessions: "Sessions",
      audit: "Audit log",
      logout: "Log out",
    },
    login: {
      title: "Sign in to the console",
      email: "Work email",
      password: "Password",
      submit: "Sign in",
      failed: "Sign-in failed.",
    },
  },
};

export type Dictionary = typeof en;

/** Hindi UI chrome (Devanagari). Interview content itself is translated by the backend. */
export const hi: Dictionary = {
  ...en,
  common: {
    ...en.common,
    loading: "लोड हो रहा है…",
    retry: "फिर से कोशिश करें",
    continue: "आगे बढ़ें",
    cancel: "रद्द करें",
    close: "बंद करें",
  },
  consent: {
    ...en.consent,
    title: "शुरू करने से पहले",
    submit: "पुष्टि करें और आगे बढ़ें",
  },
  interview: {
    ...en.interview,
    yourAnswer: "आपका उत्तर",
    typePlaceholder: "यहाँ अपना उत्तर लिखें…",
    submit: "उत्तर भेजें",
    rights: {
      ...en.interview.rights,
      title: "आप कभी भी",
      repeat: "दोहराएँ",
      rephrase: "दूसरे शब्दों में",
      break: "विराम",
      adjustment: "समायोजन",
      stop: "रोकें",
    },
  },
};

export const dictionaries = { en, hi } as const;
export type Locale = keyof typeof dictionaries;

export function resolveLocale(languageTag: string | undefined): Locale {
  const primary = (languageTag ?? "en").toLowerCase().split("-")[0];
  return primary === "hi" ? "hi" : "en";
}
