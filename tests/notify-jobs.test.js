process.env.NODE_ENV = 'test';
process.env.USE_MEMORY_DB = 'true';

describe('notifyJobsService (memory mode)', () => {
  test('enqueueJob runs a registered handler with payload', async () => {
    const notifyJobsService = require('../src/services/notifyJobsService');

    const payload = { eventId: 'evt-1', userId: 'user-1', lat: 9.0765, lng: 7.3986, message: 'help' };
    let seen = null;

    notifyJobsService.registerHandler('test-panic-notify', async (jobPayload) => {
      seen = jobPayload;
    });

    await notifyJobsService.enqueueJob('test-panic-notify', payload);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(seen).toEqual(payload);
  });
});
