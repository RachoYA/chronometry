// Jest setup file
// Увеличенный таймаут для тестов с БД
jest.setTimeout(30000);

// Mock для console.log чтобы не засорять вывод тестов
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Подавляем вывод в консоль во время тестов
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  // Восстанавливаем console после тестов
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});
