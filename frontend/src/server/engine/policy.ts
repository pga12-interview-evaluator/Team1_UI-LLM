import "server-only";

/** 00 §16 knob table. Frozen into policy_snapshot at session creation. */
export const POLICY_BY_PRESSURE = {
  calm: {
    probe_budget_base: 1,
    probe_hard_cap_per_question: 3,
    interview_probe_pool_factor: 1.25,
    callbacks_max: 1,
    reconciliations_max: 1,
    premises_max: 0,
    mutations_per_case_max: 1,
    l3_attempts_per_interview_max: 1,
    ladder_policy: "to_bar",
    non_linear_entry_share: 0,
    anchor_first_on_resume_claims: false,
    behavioral_boost_max: 0,
  },
  standard: {
    probe_budget_base: 2,
    probe_hard_cap_per_question: 4,
    interview_probe_pool_factor: 1.5,
    callbacks_max: 2,
    reconciliations_max: 2,
    premises_max: 1,
    mutations_per_case_max: 2,
    l3_attempts_per_interview_max: 2,
    ladder_policy: "bar_plus_one",
    non_linear_entry_share: 0.5,
    anchor_first_on_resume_claims: true,
    behavioral_boost_max: 1,
  },
  intense: {
    probe_budget_base: 3,
    probe_hard_cap_per_question: 4,
    interview_probe_pool_factor: 1.75,
    callbacks_max: 3,
    reconciliations_max: 3,
    premises_max: 2,
    mutations_per_case_max: 3,
    l3_attempts_per_interview_max: 3,
    ladder_policy: "until_ceiling",
    non_linear_entry_share: 1.0,
    anchor_first_on_resume_claims: true,
    behavioral_boost_max: 1,
  },
} as const;

export type PressureLevel = keyof typeof POLICY_BY_PRESSURE;

export function policySnapshot(pressure: PressureLevel) {
  return {
    policy_version: "pl-2026-09",
    pressure_level: pressure,
    ...POLICY_BY_PRESSURE[pressure],
    reserve_pct: 0.1,
    reserve_min_minutes: 4,
    max_answer_seconds: 180,
    case_max_answer_seconds: 240,
    candidate_message_max_words: 45,
    verbatim_question_max_words: 60,
  };
}

/** 00 §19 fixed scripts. English is canonical; Hindi served when interview_language starts with "hi". */
const SCRIPTS_EN = {
  opening_disclosure:
    "Before we begin: this interview is conducted by an AI interviewer. I will mostly ask questions and I will not give feedback or reactions to your answers during the interview. That is the same for every candidate and is not a signal about how you are doing. At any time you may ask me to repeat or rephrase a question, ask for a short break, tell me if you need any adjustment to how the interview runs, or stop. You do not need to name companies or share confidential figures; describe the work in your own words.",
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
};

const SCRIPTS_HI: typeof SCRIPTS_EN = {
  opening_disclosure:
    "शुरू करने से पहले: यह साक्षात्कार एक AI इंटरव्यूअर द्वारा लिया जा रहा है। मैं मुख्यतः प्रश्न पूछूँगा और साक्षात्कार के दौरान आपके उत्तरों पर कोई प्रतिक्रिया या फ़ीडबैक नहीं दूँगा। यह हर उम्मीदवार के लिए समान है और इसका आपके प्रदर्शन से कोई संबंध नहीं है। आप किसी भी समय प्रश्न दोहराने या दूसरे शब्दों में कहने के लिए कह सकते हैं, छोटा विराम ले सकते हैं, साक्षात्कार के तरीके में किसी समायोजन की ज़रूरत बता सकते हैं, या रोक सकते हैं। आपको कंपनियों के नाम या गोपनीय आँकड़े बताने की आवश्यकता नहीं है; काम को अपने शब्दों में बताइए।",
  candidate_questions_opener:
    "मेरे प्रश्न यहाँ समाप्त होते हैं। क्या भूमिका या कंपनी के बारे में आपका कोई प्रश्न है? मैं दी गई जानकारी के आधार पर उत्तर दे सकता हूँ।",
  candidate_questions_unknown: "मेरे पास यह जानकारी नहीं है; भर्ती टीम इसका उत्तर दे सकती है।",
  another_question: "क्या आपका कोई और प्रश्न है?",
  questions_later_line: "आपके प्रश्नों के लिए अंत में समय होगा।",
  closing:
    "आज आपके समय के लिए धन्यवाद। भर्ती टीम अगले चरणों के बारे में आपसे संपर्क करेगी। साक्षात्कार यहाँ समाप्त होता है।",
  escalate_closing:
    "धन्यवाद। हम साक्षात्कार यहाँ रोकते हैं और टीम का एक सदस्य सीधे आपसे संपर्क करेगा।",
  no_single_expected_answer_line:
    "कोई एक अपेक्षित उत्तर नहीं है। जैसा आपने वास्तव में किया, उसी तरह बताइए।",
  idk_ack: "समझ गया।",
  correction_line: "ठीक है। इस संशोधन के साथ निर्णय कैसे बदलता है?",
  hidden_info_line: "मैं मूल्यांकन का विवरण साझा नहीं कर सकता।",
  hint_line: "जिस दिशा में आपको सही लगे, उसी दिशा में उत्तर दीजिए।",
  skip_line: "हम इस पर बाद में वापस आ सकते हैं।",
  accommodation_line: "बिल्कुल। [CHANGE] क्या मैं प्रश्न दोहरा दूँ?",
  confidentiality_line: "वास्तविक नाम या आँकड़े बताने की ज़रूरत नहीं; उसका स्वरूप बताइए।",
  reconciliation_join_line: "इन दोनों को जोड़कर समझाइए।",
  assume_line: "जो मानना ज़रूरी हो मान लीजिए और अपनी धारणाएँ बताइए।",
  go_ahead_line: "आगे बढ़िए।",
  take_your_time: "अपना समय लीजिए।",
  break_resume_line: "जब आप तैयार हों तो बताइए।",
  rephrase_offer_line: "अपना समय लीजिए। क्या मैं प्रश्न दूसरे शब्दों में कहूँ?",
};

export const ACCOMMODATION_EFFECT_EN: Record<string, string> = {
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

export function scriptsFor(language: string): typeof SCRIPTS_EN {
  return language.toLowerCase().startsWith("hi") ? SCRIPTS_HI : SCRIPTS_EN;
}

/** Banned phrases (00 §18, candidate_message). Used by the H8 guard before anything reaches the DTO. */
export const BANNED_PATTERNS: RegExp[] = [
  /\b(great|excellent|perfect|exactly|nice|interesting|impressive|absolutely|definitely|fantastic|awesome|well said|well explained|good point|spot on|love that|makes sense|thanks for sharing|I appreciate)\b/i,
  /\b(that's okay|that's fine|no worries|don't worry|not quite|are you sure|wow)\b/i,
  /\b(verify|verified|prove|claimed|contradiction|inconsistent)\b/i,
  /\b(earlier you said|you said|you mentioned earlier)\b/i,
  /\b(ChatGPT|rehearsed|nervous|eye contact|hesitat\w*)\b/i,
  /\b(score|rubric|probe|budget|escalat\w*|evaluation)\b/i,
  /\b(let's try something easier|don't you think|wouldn't it be better to|tell me more|can you elaborate|be more specific)\b/i,
];

export function violatesGuard(message: string): string | null {
  for (const pattern of BANNED_PATTERNS) {
    const match = pattern.exec(message);
    if (match) return match[0];
  }
  if ((message.match(/\?/g) ?? []).length > 2) return "multiple questions";
  return null;
}
