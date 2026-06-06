// Uzbek Latin ↔ Cyrillic transliteration

const LATIN_TO_CYR = [
  // Ko'p harfli birikma — avval
  ["O'", 'Ў'], ["o'", 'ў'],
  ["G'", 'Ғ'], ["g'", 'ғ'],
  ['SH', 'Ш'], ['Sh', 'Ш'], ['sh', 'ш'],
  ['CH', 'Ч'], ['Ch', 'Ч'], ['ch', 'ч'],
  ['NG', 'НГ'], ['Ng', 'Нг'], ['ng', 'нг'],
  ['TS', 'ТС'], ['Ts', 'Тс'], ['ts', 'тс'],
  // Apostrof → ъ (ma'lumot → маълумот)
  ["'", 'ъ'],
  // Yagona harflar
  ['A', 'А'], ['a', 'а'],
  ['B', 'Б'], ['b', 'б'],
  ['D', 'Д'], ['d', 'д'],
  ['E', 'Е'], ['e', 'е'],
  ['F', 'Ф'], ['f', 'ф'],
  ['G', 'Г'], ['g', 'г'],
  ['H', 'Ҳ'], ['h', 'ҳ'],
  ['I', 'И'], ['i', 'и'],
  ['J', 'Ж'], ['j', 'ж'],
  ['K', 'К'], ['k', 'к'],
  ['L', 'Л'], ['l', 'л'],
  ['M', 'М'], ['m', 'м'],
  ['N', 'Н'], ['n', 'н'],
  ['O', 'О'], ['o', 'о'],
  ['P', 'П'], ['p', 'п'],
  ['Q', 'Қ'], ['q', 'қ'],
  ['R', 'Р'], ['r', 'р'],
  ['S', 'С'], ['s', 'с'],
  ['T', 'Т'], ['t', 'т'],
  ['U', 'У'], ['u', 'у'],
  ['V', 'В'], ['v', 'в'],
  ['W', 'В'], ['w', 'в'],
  ['X', 'Х'], ['x', 'х'],
  ['Y', 'Й'], ['y', 'й'],
  ['Z', 'З'], ['z', 'з'],
];

const CYR_TO_LATIN = [
  ['Ў', "O'"], ['ў', "o'"],
  ['Ғ', "G'"], ['ғ', "g'"],
  ['Ш', 'Sh'],  ['ш', 'sh'],
  ['Ч', 'Ch'],  ['ч', 'ch'],
  ['Ъ', "'"],   ['ъ', "'"],
  ['А', 'A'],   ['а', 'a'],
  ['Б', 'B'],   ['б', 'b'],
  ['В', 'V'],   ['в', 'v'],
  ['Г', 'G'],   ['г', 'g'],
  ['Д', 'D'],   ['д', 'd'],
  ['Е', 'E'],   ['е', 'e'],
  ['Ё', 'Yo'],  ['ё', 'yo'],
  ['Ж', 'J'],   ['ж', 'j'],
  ['З', 'Z'],   ['з', 'z'],
  ['И', 'I'],   ['и', 'i'],
  ['Й', 'Y'],   ['й', 'y'],
  ['К', 'K'],   ['к', 'k'],
  ['Қ', 'Q'],   ['қ', 'q'],
  ['Л', 'L'],   ['л', 'l'],
  ['М', 'M'],   ['м', 'm'],
  ['Н', 'N'],   ['н', 'n'],
  ['Нг', 'ng'], ['НГ', 'NG'],
  ['О', 'O'],   ['о', 'o'],
  ['П', 'P'],   ['п', 'p'],
  ['Р', 'R'],   ['р', 'r'],
  ['С', 'S'],   ['с', 's'],
  ['Т', 'T'],   ['т', 't'],
  ['У', 'U'],   ['у', 'u'],
  ['Ф', 'F'],   ['ф', 'f'],
  ['Х', 'X'],   ['х', 'x'],
  ['Ҳ', 'H'],   ['ҳ', 'h'],
  ['Ц', 'Ts'],  ['ц', 'ts'],
  ['Ч', 'Ch'],  ['ч', 'ch'],
  ['Ш', 'Sh'],  ['ш', 'sh'],
  ['Э', 'E'],   ['э', 'e'],
  ['Ю', 'Yu'],  ['ю', 'yu'],
  ['Я', 'Ya'],  ['я', 'ya'],
];

function latinToCyrillic(str) {
  if (!str || typeof str !== 'string') return str;
  let result = str;
  for (const [from, to] of LATIN_TO_CYR) {
    result = result.split(from).join(to);
  }
  return result;
}

function cyrillicToLatin(str) {
  if (!str || typeof str !== 'string') return str;
  let result = str;
  for (const [from, to] of CYR_TO_LATIN) {
    result = result.split(from).join(to);
  }
  return result;
}

// Texnik fieldlar — transliteratsiya qilinmaydi
const SKIP_FIELDS = new Set([
  'id', 'order_id', 'service_id', 'user_id', 'worker_id', 'driver_id',
  'assigned_worker_id', 'assigned_driver_id', 'collected_by',
  'status', 'payment_status', 'role', 'unit_type',
  'phone', 'login', 'password', 'fcm_token',
  'pickup_date', 'delivery_date', 'created_at', 'updated_at', 'collected_at',
  'token', 'key', 'value',
]);

function transliterateObj(obj, fn) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return fn(obj);
  if (Array.isArray(obj)) return obj.map(item => transliterateObj(item, fn));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = SKIP_FIELDS.has(k) ? v : transliterateObj(v, fn);
    }
    return out;
  }
  return obj;
}

module.exports = { latinToCyrillic, cyrillicToLatin, transliterateObj };
