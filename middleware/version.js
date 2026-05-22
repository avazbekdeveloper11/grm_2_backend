const MIN_VERSION = '1.1.8';

function parseVersion(v) {
  return (v || '0.0.0').split('.').map(Number);
}

function isVersionOk(v) {
  const app = parseVersion(v);
  const min = parseVersion(MIN_VERSION);
  for (let i = 0; i < 3; i++) {
    if (app[i] > min[i]) return true;
    if (app[i] < min[i]) return false;
  }
  return true; // teng bo'lsa ham OK
}

function requireVersion(req, res, next) {
  // Login va health endpointlari uchun tekshirma
  if (req.path === '/login' || req.path === '/health') return next();

  const v = req.headers['x-app-version'];
  if (!v || !isVersionOk(v)) {
    return res.status(426).json({
      error: `Ilovangiz eskirgan. Yangi versiyani yuklab oling (minimum ${MIN_VERSION}).`,
      min_version: MIN_VERSION,
      your_version: v || 'nomalum',
    });
  }
  next();
}

module.exports = { requireVersion };
