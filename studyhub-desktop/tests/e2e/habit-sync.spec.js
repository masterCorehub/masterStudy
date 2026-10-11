import { test, expect } from 'playwright/test';
import { preparePreview, previewState } from './fixtures/calendarPreview.js';

test('desktop stale database events and reload preserve habit completion and course deletion', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const oldHabit = { id: 'sync-habit', title: 'Sync habit', createdAt: 10, completedDates: [] };
  const old = { ...previewState, habits: { list: [oldHabit] }, courses: [{ id: 'deleted-course', title: 'Deleted', modules: [], lessons: [] }] };
  const current = {
    ...previewState, courses: [],
    habits: { list: [{ ...oldHabit, completedDates: ['2026-10-08'], updatedAt: 100, completionChanges: { '2026-10-08': { completed: true, updatedAt: 100 } } }] },
    entityDeletionTombstones: [{ id: 'course::deleted-course', entityType: 'course', entityId: 'deleted-course', deletedAt: 100, updatedAt: 100 }],
  };
  await page.addInitScript(old => {
    window.studyhubDesktop = {
      studyDatabase: { load: async () => ({ state: old }), save: async () => ({}) },
      onStudyDataChanged: callback => { window.triggerStaleSnapshot = callback; return () => {}; },
    };
  }, old);
  await preparePreview(page, { state: current });
  await page.goto('http://studyhub.test');
  await expect.poll(() => page.evaluate(() => typeof window.triggerStaleSnapshot)).toBe('function');
  const check = async () => {
    await expect.poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('studyhub-storage-v2')).state;
      return { dates: state.habits.list.find(h => h.id === 'sync-habit').completedDates,
        resurrected: state.courses.some(c => c.id === 'deleted-course') };
    })).toEqual({ dates: ['2026-10-08'], resurrected: false });
  };
  await check();
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.triggerStaleSnapshot()); await check(); }
  await page.reload();
  await check();
  expect(errors).toEqual([]);
});
