/** English source of the fixed scripts (00_shared_contracts §19). The real backend serves translations. */
export const SCRIPTS = {
  opening_disclosure:
    "Before we begin: this interview is conducted by an AI interviewer. I will mostly ask questions and I will not give feedback or reactions to your answers during the interview. That is the same for every candidate and is not a signal about how you are doing. At any time you may ask me to repeat or rephrase a question, ask for a short break, tell me if you need any adjustment to how the interview runs, or stop. You do not need to name companies or share confidential figures; describe the work in your own words.",
  behavioral_sentence:
    "Audio/video signals are used only to decide which follow-up question to ask next; they are never part of your score.",
  calm_sentence:
    "There is no single expected answer to any question; answer from what you actually did or would do.",
  candidate_questions_opener:
    "That is the end of my questions. Do you have any questions for me about the role or the company? I can answer from the information I have been given.",
  candidate_questions_unknown:
    "I don't have that information; the recruiting team can answer that.",
  another_question: "Do you have another question?",
  questions_later_line: "We will have time for your questions at the end.",
  closing:
    "Thank you for your time today. The recruiting team will contact you about next steps. This ends the interview.",
  escalate_closing:
    "Thank you. We will pause the interview here and a member of the team will follow up with you directly.",
  no_single_expected_answer_line:
    "There is no single expected answer. Answer in whatever way reflects what you actually did.",
  idk_ack: "Understood.",
  correction_line: "Noted. With that version, how does the decision change?",
  hidden_info_line: "I can't share evaluation details.",
  hint_line: "Take it in whatever direction you think is right.",
  skip_line: "We can come back to it.",
  accommodation_line: "Of course. [CHANGE] Would you like me to repeat the question?",
  confidentiality_line: "No need for the actual names or figures; describe the shape of it.",
  reconciliation_join_line: "Help me put those together.",
  assume_line: "Assume what you need to and tell me your assumptions.",
  go_ahead_line: "Go ahead.",
  take_your_time: "Take your time.",
  break_resume_line: "Tell me when you are ready to continue.",
  rephrase_offer_line: "Take your time. Would you like me to rephrase?",
} as const;

export const ACCOMMODATION_EFFECT: Record<string, string> = {
  extended_answer_time: "You will have unlimited time on every answer from now on.",
  text_modality: "You can type your answers from now on.",
  voice_modality: "You can speak your answers from now on.",
  read_aloud: "Questions will also be read aloud from now on.",
  captions: "Questions will also be shown in writing from now on.",
  breaks: "You can take a break whenever you need one.",
  camera_off: "Your camera is off for the rest of the interview.",
  no_behavioral_analysis: "No audio or video analysis will be used for the rest of the interview.",
  high_contrast: "The display has been switched to high contrast.",
};
