// src/utils/translate.js

let translationCache = JSON.parse(localStorage.getItem("translations") || "{}");

export async function translateText(text, targetLang) {
  if (!text || !targetLang) return text;

  // Check cache first
  if (translationCache[targetLang]?.[text]) {
    return translationCache[targetLang][text];
  }

  try {
    const res = await fetch("https://libretranslate.com/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "en",
        target: targetLang,
        format: "text",
      }),
    });

    const data = await res.json();

    // Save to cache
    translationCache[targetLang] = translationCache[targetLang] || {};
    translationCache[targetLang][text] = data.translatedText;

    localStorage.setItem(
      "translations",
      JSON.stringify(translationCache)
    );

    return data.translatedText;
  } catch (e) {
    console.error("Translation error:", e);
    return text; // fallback
  }
}

export async function translatePage(langCode) {
  const elements = document.querySelectorAll("[data-i18n]");

  for (let el of elements) {
    const originalText = el.getAttribute("data-i18n");
    if (!originalText) continue;

    const translated = await translateText(originalText, langCode);
    el.innerText = translated;
  }

  // RTL / LTR Layout Change
  const rtlLangs = ["ar", "ur", "fa"];
  document.documentElement.dir = rtlLangs.includes(langCode ? "rtl" : "ltr");
}
