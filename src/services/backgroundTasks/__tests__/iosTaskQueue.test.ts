import {
  iosBackgroundTasks as tasks,
  IOS_BACKGROUND_TASKS_STORE_KEY,
} from '../iosTaskQueue';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';
import { runHeadlessBackgroundTask } from '../headlessTask';
import type { NativeBackgroundTaskRecord } from '@modules/native-background-tasks/src/NativeBackgroundTasksModule';

jest.mock('@utils/mmkv/mmkv', () => ({
  getMMKVObject: jest.fn(),
  setMMKVObject: jest.fn(),
}));
jest.mock('@utils/showToast', () => ({ showToast: jest.fn() }));
jest.mock('../headlessTask', () => ({ runHeadlessBackgroundTask: jest.fn() }));
jest.mock('../backgroundTasks', () => ({
  backgroundTasks: { refresh: jest.fn() },
}));

it('recovers interrupted work, preserves checkpoints and executes queued work serially', async () => {
  jest.useFakeTimers();
  let records: NativeBackgroundTaskRecord[] = [
    {
      id: 'interrupted',
      type: 'epub',
      title: 'Import',
      payload: '{}',
      state: 'running',
      attempt: 1,
      createdAt: 1,
      updatedAt: 1,
      checkpoint: 'chapter-2',
    },
  ];
  jest
    .mocked(getMMKVObject)
    .mockImplementation(() => JSON.parse(JSON.stringify(records)));
  jest.mocked(setMMKVObject).mockImplementation((key, value) => {
    expect(key).toBe(IOS_BACKGROUND_TASKS_STORE_KEY);
    records = value as NativeBackgroundTaskRecord[];
  });
  try {
    expect((await tasks.getTasks())[0].state).toBe('paused');
    expect((await tasks.getTask('interrupted'))?.checkpoint).toBe('chapter-2');
    const first = await tasks.enqueue(
      'download',
      '{}',
      'Download',
      '',
      false,
      'default',
    );
    expect(
      await tasks.enqueue('download', '{}', 'Duplicate', '', false, 'default'),
    ).toBe(first);
    const second = await tasks.enqueue(
      'backup',
      '{}',
      'Backup',
      '',
      false,
      'default',
    );
    let finish: (() => void) | undefined;
    jest.mocked(runHeadlessBackgroundTask).mockImplementation(
      ({ taskId }) =>
        new Promise<void>(resolve => {
          finish = () => {
            void tasks.complete(taskId, 'Done');
            resolve();
          };
        }),
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(jest.mocked(showToast).mock.calls).toEqual([]);
    expect(runHeadlessBackgroundTask).toHaveBeenCalledTimes(1);
    expect(runHeadlessBackgroundTask).toHaveBeenLastCalledWith({
      taskId: first,
    });
    expect((await tasks.getTask(second))?.state).toBe('queued');
    finish!();
    await jest.advanceTimersByTimeAsync(1);
    expect(runHeadlessBackgroundTask).toHaveBeenLastCalledWith({
      taskId: second,
    });
    finish!();
    await jest.advanceTimersByTimeAsync(1);
    await tasks.resume('interrupted');
    await tasks.pause('interrupted');
    expect((await tasks.getTask('interrupted'))?.checkpoint).toBe('chapter-2');
    await tasks.cancel('interrupted');
    expect(await tasks.getTasks()).toEqual([]);
    jest
      .mocked(runHeadlessBackgroundTask)
      .mockRejectedValueOnce(new Error('Startup failed'));
    await tasks.enqueue('backup', '{}', 'Backup', '', false, 'default');
    await jest.advanceTimersByTimeAsync(1);
    expect(await tasks.getTasks()).toEqual([]);
    expect(showToast).toHaveBeenCalledWith('Startup failed');
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
