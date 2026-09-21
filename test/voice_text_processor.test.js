const assert = require('assert');
const { processVoiceText } = require('../voice_widget/voice_text_processor');

console.log('Запуск тестов voice_text_processor.js...');

// Тест 1: Базовая пунктуация на русском
{
  const raw = 'привет как дела знак вопроса отлично точка';
  // В нашем маппинге: 'вопросительный знак', 'точка'
  const raw2 = 'привет как дела вопросительный знак отлично точка';
  const res = processVoiceText(raw2);
  console.log('Тест 1 результат:', res);
  assert.strictEqual(res, 'Привет как дела? Отлично.');
}

// Тест 2: Запятые, тире, восклицательный знак
{
  const raw = 'слушай запятая это просто потрясающе восклицательный знак мы сделали тире отличную работу точка';
  const res = processVoiceText(raw);
  console.log('Тест 2 результат:', res);
  assert.strictEqual(res, 'Слушай, это просто потрясающе! Мы сделали — отличную работу.');
}

// Тест 3: Перенос строки и авто-капитализация
{
  const raw = 'первая строка точка новая строка вторая строка точка новый абзац третья строка';
  const res = processVoiceText(raw);
  console.log('Тест 3 результат:\n' + res);
  assert.strictEqual(res, 'Первая строка.\nВторая строка.\n\nТретья строка');
}

// Тест 4: Кавычки и двоеточие
{
  const raw = 'он сказал двоеточие открыть кавычки привет мир закрыть кавычки точка';
  const res = processVoiceText(raw);
  console.log('Тест 4 результат:', res);
  assert.strictEqual(res, 'Он сказал: «привет мир».');
}

// Тест 5: Отключение умной пунктуации
{
  const raw = 'привет точка';
  const res = processVoiceText(raw, { smartPunctuation: false, autoCapitalize: false });
  assert.strictEqual(res, 'привет точка');
}

// Тест 6: Английские команды
{
  const raw = 'hello world exclamation mark new line this is great period';
  const res = processVoiceText(raw);
  console.log('Тест 6 результат:\n' + res);
  assert.strictEqual(res, 'Hello world!\nThis is great.');
}

console.log('✓ Все тесты voice_text_processor.js успешно пройдены!');
