export function createTranslator(bundles, initialLang = 'en') {
  let currentLang = initialLang;

  function t(key, vars) {
    const s = (bundles[currentLang] && bundles[currentLang][key])
           ?? (bundles.en && bundles.en[key])
           ?? key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  }

  return {
    t,
    setLang(lang) { currentLang = lang; },
    getLang() { return currentLang; },
  };
}
