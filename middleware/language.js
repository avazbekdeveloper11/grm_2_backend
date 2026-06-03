const { latinToCyrillic, cyrillicToLatin, transliterateObj } = require('../services/transliterate');

function languageMiddleware(req, res, next) {
  const lang = (req.headers['x-language'] || 'latin').toLowerCase();
  req.language = lang; // 'latin' yoki 'cyrillic'

  // res.json ni patch qilamiz — javobni avtomatik o'giramiz
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    if (lang === 'cyrillic') {
      return originalJson(transliterateObj(data, latinToCyrillic));
    }
    if (lang === 'latin') {
      return originalJson(transliterateObj(data, cyrillicToLatin));
    }
    return originalJson(data);
  };

  next();
}

module.exports = { languageMiddleware };
