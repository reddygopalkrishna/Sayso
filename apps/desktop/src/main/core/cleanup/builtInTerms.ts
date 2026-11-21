import type { DictionaryTerm } from './dictionary.ts';

/**
 * Names people say all the time that speech-to-text gets wrong, with the usual mishearings.
 * Used with your own dictionary (your entries win when they overlap). Words that are also
 * ordinary English ("cloud", "cursor", "type script") are left out on purpose.
 */
const NAMES: ReadonlyArray<readonly [phrase: string, heardAs: readonly string[]]> = [
  [
    'ChatGPT',
    [
      'chat gpt',
      'chat g p t',
      'chat g pt',
      'chart gpt',
      'charge gpt',
      'chat gbt',
      'chatgbt',
      'chagpt',
      'chag pt',
      'chat jpt',
    ],
  ],
  ['OpenAI', ['open ai', 'open a i']],
  ['GitHub', ['git hub', 'get hub']],
  ['Gemini', []],
  ['Anthropic', []],
  ['Claude Code', ['cloud code', 'clod code', 'claud code', 'clawed code']],
  ['Codex', ['code x']],
  ['Groq', []],
  ['Perplexity', []],
  ['Copilot', ['co pilot', 'co-pilot']],
  ['LinkedIn', ['linked in']],
  ['YouTube', ['you tube']],
  ['WhatsApp', ['whats app', "what's app"]],
  ['JavaScript', ['java script']],
  ['macOS', ['mac os']],
];

/**
 * Indian places, services and brands that speech-to-text often gets wrong, with the usual
 * mishearings. A name on its own (no mishearings) is still listed: it fixes the capital letters
 * ("hyderabad" → "Hyderabad") and tells the AI to keep it as written.
 */
const INDIA: ReadonlyArray<readonly [phrase: string, heardAs: readonly string[]]> = [
  // Places
  ['Hyderabad', ['hydrabad', 'hyderbad', 'hyderabaad']],
  ['Secunderabad', ['secunderbad', 'secundrabad']],
  ['Bengaluru', []],
  ['Mumbai', []],
  ['Chennai', []],
  ['Kolkata', []],
  ['Pune', []],
  ['Ahmedabad', []],
  ['Visakhapatnam', ['vishakhapatnam', 'visakapatnam']],
  ['Vijayawada', []],
  ['Warangal', []],
  ['Gachibowli', ['gachi bowli', 'gatchibowli', 'gachibowly']],
  ['HITEC City', ['hitech city', 'hi tech city', 'hi-tech city']],
  ['Madhapur', []],
  ['Banjara Hills', []],
  ['Jubilee Hills', []],
  ['Kukatpally', []],
  // Payments and banks
  ['UPI', ['u p i']],
  ['PhonePe', ['phone pe', 'phone pay', 'phonepay']],
  ['Paytm', ['pay tm', 'pay t m', 'paytem']],
  ['Google Pay', ['gpay', 'g pay']],
  ['BHIM', []],
  ['NEFT', ['n e f t']],
  ['RTGS', ['r t g s']],
  ['IMPS', ['i m p s']],
  ['IFSC', ['i f s c']],
  ['HDFC', ['h d f c']],
  ['ICICI', ['i c i c i', 'icic']],
  ['SBI', ['s b i']],
  ['Kotak', []],
  // Government and identity
  ['Aadhaar', ['aadhar', 'adhar', 'adhaar', 'aadhaar card']],
  ['DigiLocker', ['digi locker']],
  ['IRCTC', ['i r c t c']],
  ['EPFO', ['e p f o']],
  ['GST', ['g s t']],
  ['UMANG', []],
  // Everyday apps and companies
  ['Zomato', []],
  ['Swiggy', ['swigy']],
  ['Rapido', []],
  ['Flipkart', ['flip kart']],
  ['Myntra', []],
  ['Meesho', []],
  ['Zepto', []],
  ['Blinkit', []],
  ['BigBasket', ['big basket']],
  ['Jio', []],
  ['Airtel', []],
  ['Infosys', []],
  ['Wipro', []],
  ['TCS', ['t c s']],
  ['Equal AI', ['equal a i']],
  // Common first names, so they come out spelled and capitalised
  ['Venkatesh', []],
  ['Srinivas', ['sri nivas']],
  ['Lakshmi', []],
  ['Keshav', []],
  ['Akhilesh', []],
  ['Priya', []],
  ['Deepa', []],
];

export const BUILT_IN_TERMS: readonly DictionaryTerm[] = [...NAMES, ...INDIA].flatMap(
  ([phrase, heardAs]) => [
    { phrase, spokenAs: null },
    ...heardAs.map((spokenAs) => ({ phrase, spokenAs })),
  ],
);
