// Supported AI hold languages — Hindi, English, Bengali, Tamil only
export interface Lang {
  code: string;
  name: string;       // native name
  bcp47: string;      // browser SR/TTS lang code
  greeting: string;   // initial greeting in this language
}

export const LANGUAGES: Lang[] = [
  { code: "en", name: "English", bcp47: "en-IN", greeting: "Hi! I'm Zentord. Our support agent will join in just a moment. While you wait, can you tell me what you need help with?" },
  { code: "hi", name: "हिन्दी", bcp47: "hi-IN", greeting: "नमस्ते! मैं Zentord हूँ। हमारा सहायता एजेंट कुछ ही पलों में आएगा। तब तक, बताइए आपको किस चीज़ में मदद चाहिए?" },
  { code: "bn", name: "বাংলা", bcp47: "bn-IN", greeting: "নমস্কার! আমি Zentord। আমাদের সাপোর্ট এজেন্ট শীঘ্রই যোগ দেবেন। ততক্ষণ পর্যন্ত, বলুন আপনার কী সাহায্য দরকার?" },
  { code: "ta", name: "தமிழ்", bcp47: "ta-IN", greeting: "வணக்கம்! நான் Zentord. எங்கள் ஆதரவு முகவர் சில நிமிடங்களில் இணைவார். அதுவரை, உங்களுக்கு என்ன உதவி தேவை என்று சொல்லுங்கள்?" },
];

export const findLanguage = (code: string) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
