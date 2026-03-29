// Profanity and slur filter for player name moderation.
// This file contains offensive terms solely for the purpose of filtering them
// from user-generated content to protect players.

// Words that are always banned when found as a substring (clearly offensive,
// unlikely to appear in normal names).
const SUBSTRING_BANNED = [
  // Racial slurs
  'nigger', 'nigga', 'niglet', 'nigguh', 'nikka', 'niga',
  'chink', 'chinky',
  'spick', 'spik',
  'kike', 'kyke',
  'wetback',
  'beaner',
  'gook', 'gooky',
  'coon', 'coonie',
  'darkie', 'darky',
  'porchmonkey', 'porch monkey',
  'junglebunny', 'jungle bunny',
  'towelhead', 'towel head',
  'cameljockey', 'camel jockey',
  'raghead', 'rag head',
  'sandnigger', 'sand nigger',
  'zipperhead',
  'slanteye', 'slant eye',
  'redskin',

  // Homophobic / transphobic slurs
  'faggot', 'faggit', 'faget', 'fagot',
  'tranny', 'trannie',
  'shemale', 'she male',
  'sodomite',

  // Profanity (long enough to not false-positive)
  'fuck', 'fucker', 'fuckin', 'fucking', 'fucked', 'fuckface', 'fuckhead',
  'fuckwit', 'fuckboy', 'fuckwad', 'motherfucker', 'motherfuckin', 'mofo',
  'shit', 'shithead', 'shitface', 'shitty', 'bullshit', 'horseshit',
  'asshole', 'arsehole',
  'bitch', 'biatch',
  'bastard',
  'goddamn', 'goddammit',
  'dickhead', 'dickface', 'dickweed',
  'cocksucker', 'cocksuck',
  'cunt', 'cunty',
  'twat',
  'wanker',
  'douchebag',
  'slut', 'slutty',
  'whore',
  'skank', 'skanky',

  // Common misspellings / evasions
  'fuk', 'fuq', 'phuck', 'phuk',
  'sh1t', 'shyt',
  'b1tch',

  // Sexual terms
  'dildo',
  'blowjob', 'blow job',
  'handjob', 'hand job',
  'cumshot', 'cum shot',
  'cumming',
  'jizz',
  'hentai',
  'porn', 'porno', 'pornhub',
  'pussy',
  'buttfuck', 'butt fuck',
  'rapist', 'raping',
  'molest', 'molester',
  'pedophile', 'pedo', 'paedo', 'paedophile',

  // Hate speech
  'neonazi', 'neo nazi',
  'hitler',
  'ku klux',
  'whitepower', 'white power',
  'whitesupremacy', 'white supremacy',
  'seigheil', 'sieg heil',
  'genocide',
  'retard', 'retarded',
  'mongoloid',
  'killyourself', 'kill yourself',

  // Misc offensive
  'scumbag',
  'jackass',
];

// Words that are only banned as a whole name or exact match (short words
// that commonly appear as substrings in normal names like "Grass", "Bass",
// "Classic", "Shelly", "Discord", etc.)
const EXACT_BANNED = [
  'ass', 'arse',
  'fag',
  'dyke',
  'homo',
  'spic',
  'wog',
  'cum',
  'dick',
  'cock',
  'damn', 'dammit',
  'hell',
  'crap',
  'piss', 'pissed',
  'wank',
  'tosser',
  'bellend',
  'knob', 'knobhead',
  'prick',
  'douche',
  'penis', 'peen',
  'vagina', 'vag',
  'tits', 'titty', 'titties',
  'boobs', 'boobies',
  'anal', 'anus',
  'rape',
  'nazi',
  'heil',
  'kkk', 'kys',
  'tard',
  'spaz', 'spazz',
  'cripple',
  'turd',
  'scum',
  'negro',
  'cracker',
  'honky', 'honkey',
  'gringo',
  'halfbreed', 'half breed',
  'paki',
  'queer',
  'orgasm',
  'holocaust',
  'ladyboy', 'lady boy',
  'buttboy', 'butt boy',
];

// Leet speak substitution map: character -> what it could represent
const LEET_MAP = {
  '@': 'a',
  '4': 'a',
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  '$': 's',
  '5': 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g',
  '|': 'l',
  '(': 'c',
  '<': 'c',
};

// Characters that are commonly inserted between letters to evade filters
const SEPARATOR_REGEX = /[\s.\-_*~`'",;:!?\/\\|#^+=(){}\[\]<>]+/g;

// Friendly replacement names
const FRIENDLY_NAMES = [
  'Player', 'Blobby', 'Grappler', 'Chomper', 'Squishy',
  'Bouncer', 'Zoomer', 'Nibbler', 'Gobbler', 'Snapper',
  'Drifter', 'Roller', 'Hopper', 'Dasher', 'Glider',
  'Spinner', 'Floater', 'Wobbler', 'Tumbler', 'Skipper',
];

/**
 * Normalize a string by applying leet speak substitutions
 * and lowercasing.
 */
function normalize(str) {
  let result = str.toLowerCase();

  // Multi-char leet subs first
  result = result.replace(/ph/g, 'f');
  result = result.replace(/vv/g, 'w');

  // Single-char leet subs
  let normalized = '';
  for (const ch of result) {
    normalized += LEET_MAP[ch] || ch;
  }

  return normalized;
}

/**
 * Strip separator characters that might be inserted between letters.
 */
function stripSeparators(str) {
  return str.replace(SEPARATOR_REGEX, '');
}

/**
 * Generate a random friendly name.
 */
function randomFriendlyName() {
  const name = FRIENDLY_NAMES[Math.floor(Math.random() * FRIENDLY_NAMES.length)];
  const num = Math.floor(Math.random() * 900) + 100; // 100-999
  return `${name}${num}`;
}

/**
 * Check if a string contains any banned word.
 * Uses substring matching for clearly offensive terms and exact matching
 * for short words that commonly appear inside normal names.
 */
function containsBannedWord(name) {
  const lower = name.toLowerCase();
  const normalized = normalize(name);
  const stripped = stripSeparators(lower);
  const strippedNormalized = stripSeparators(normalized);

  const variants = [lower, normalized, stripped, strippedNormalized];

  // Substring check for clearly offensive words
  for (const banned of SUBSTRING_BANNED) {
    for (const variant of variants) {
      if (variant.includes(banned)) {
        return true;
      }
    }
  }

  // Exact match check for short/ambiguous words (compare against the
  // fully stripped & normalized variants as "the whole name")
  for (const banned of EXACT_BANNED) {
    for (const variant of variants) {
      if (variant === banned) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Clean a player name. If it contains any banned/offensive term,
 * replace it with a random friendly name. Otherwise return as-is.
 *
 * @param {string} name - The player's chosen name
 * @returns {string} The cleaned name
 */
export function cleanName(name) {
  if (!name || typeof name !== 'string') {
    return randomFriendlyName();
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return randomFriendlyName();
  }

  if (containsBannedWord(trimmed)) {
    return randomFriendlyName();
  }

  return trimmed;
}
