export const COMMUNITY_OFF_TOPIC_ERROR =
  "This content is not related to this community, so you shouldn't post this.";

export const COMMUNITY_PROFANITY_ERROR =
  'Your post contains inappropriate or abusive language. Please keep discussions respectful and civic-minded.';

export const COMMUNITY_TEXT_ONLY_ERROR =
  'Only plain text discussions are allowed in this community. Please remove links, URLs, or embedded code.';

const PROFANITY_PATTERNS: RegExp[] = [
  /\b(fuck|fucking|fucked|fucker|shit|shitty|bitch|bastard|asshole|dickhead|cunt|motherfucker|slut|whore|dumbass|bullshit|wtf|stfu|idiot|moron|stupid|shut\s*up|kill\s+yourself|hate\s+speech|trash\s+people)\b/i,
  /\b(mc|bc|madarchod|behenchod|chutiya|harami|kamina|lanjakodaka|puka|dengey|erripuka|modda)\b/i,
];

const URL_OR_HTML_PATTERN =
  /(https?:\/\/|www\.|<script|<iframe|<img|<a\s|data:image\/|javascript:)/i;

export interface LocalCommunityValidationResult {
  valid: boolean;
  containsProfanity: boolean;
  isTextOnly: boolean;
  errorMessage?: string;
}

export function validateCommunityPostTextLocally(rawText: string): LocalCommunityValidationResult {
  const text = rawText.trim();

  if (text.length < 10) {
    return {
      valid: false,
      containsProfanity: false,
      isTextOnly: true,
      errorMessage: 'Please write at least 10 characters to share a meaningful constitutional or legal thought.',
    };
  }

  if (text.length > 1000) {
    return {
      valid: false,
      containsProfanity: false,
      isTextOnly: true,
      errorMessage: 'Posts must be 1,000 characters or fewer.',
    };
  }

  if (URL_OR_HTML_PATTERN.test(text)) {
    return {
      valid: false,
      containsProfanity: false,
      isTextOnly: false,
      errorMessage: COMMUNITY_TEXT_ONLY_ERROR,
    };
  }

  const hasProfanity = PROFANITY_PATTERNS.some((pattern) => pattern.test(text));
  if (hasProfanity) {
    return {
      valid: false,
      containsProfanity: true,
      isTextOnly: true,
      errorMessage: COMMUNITY_PROFANITY_ERROR,
    };
  }

  return {
    valid: true,
    containsProfanity: false,
    isTextOnly: true,
  };
}
