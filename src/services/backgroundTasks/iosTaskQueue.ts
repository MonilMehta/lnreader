import { DeviceEventEmitter } from 'react-native';
import type {
  NativeBackgroundTaskRecord,
  NativeBackgroundTasksModule,
} from '@modules/native-background-tasks/src/NativeBackgroundTasksModule';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import { showToast } from '@utils/showToast';

export const IOS_BACKGROUND_TASKS_STORE_KEY = 'IOS_BACKGROUND_TASK_RECORDS';
let activeTaskId: string | undefined;
let initialized = false;

const readTasks = () =>
  getMMKVObject<NativeBackgroundTaskRecord[]>(IOS_BACKGROUND_TASKS_STORE_KEY) ??
  [];
const saveTasks = (tasks: NativeBackgroundTaskRecord[]) =>
  setMMKVObject(IOS_BACKGROUND_TASKS_STORE_KEY, tasks);
const updateTask = (id: string, patch: Partial<NativeBackgroundTaskRecord>) => {
  const tasks = readTasks();
  const task = tasks.find(item => item.id === id);
  if (!task) throw new Error(`Unknown background task: ${id}`);
  Object.assign(task, patch, { updatedAt: Date.now() });
  saveTasks(tasks);
};
const removeTask = (id: string) =>
  saveTasks(readTasks().filter(task => task.id !== id));

// ponytail: one foreground worker protects shared EPUB/backup scratch paths;
// add native iOS background scheduling when execution with the app closed is needed.
const runNextTask = async () => {
  if (activeTaskId) return;
  const task = readTasks().find(item => item.state === 'queued');
  if (!task) return;
  activeTaskId = task.id;
  updateTask(task.id, { state: 'running', attempt: task.attempt + 1 });
  try {
    const { runHeadlessBackgroundTask } =
      require('./headlessTask') as typeof import('./headlessTask');
    const { backgroundTasks } =
      require('./backgroundTasks') as typeof import('./backgroundTasks');
    await backgroundTasks.refresh();
    await runHeadlessBackgroundTask({ taskId: task.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await iosBackgroundTasks.fail(task.id, message, false);
    showToast(message);
  } finally {
    activeTaskId = undefined;
    scheduleNextTask();
  }
};
const scheduleNextTask = () => setTimeout(() => void runNextTask(), 0);
const unsupportedSchedule = async () => {
  throw new Error(
    'Automatic background scheduling is not available on iOS. Run updates and backups with the app open.',
  );
};

export const iosBackgroundTasks: NativeBackgroundTasksModule = {
  async getTasks() {
    if (!initialized) {
      // An interrupted JS execution cannot be resumed blindly: keep its checkpoint
      // and let the user resume it after the database and plugins are ready.
      saveTasks(
        readTasks().map(task =>
          task.state === 'running' ? { ...task, state: 'paused' } : task,
        ),
      );
      initialized = true;
      scheduleNextTask();
    }
    return readTasks().filter(task =>
      ['queued', 'running', 'paused'].includes(task.state),
    );
  },
  async getTask(id) {
    return readTasks().find(task => task.id === id) ?? null;
  },
  async enqueue(type, payload, title, description, allowsDuplicates) {
    const tasks = readTasks();
    const existing = tasks.find(task => task.type === type);
    if (!allowsDuplicates && existing) return existing.id;
    const now = Date.now();
    const id = `ios-${now}-${Math.random().toString(36).slice(2)}`;
    saveTasks([
      ...tasks,
      {
        id,
        type,
        payload,
        title,
        description,
        state: 'queued',
        attempt: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    scheduleNextTask();
    return id;
  },
  async pause(id) {
    updateTask(id, { state: 'paused' });
    if (activeTaskId === id) {
      DeviceEventEmitter.emit('LNReaderTaskInterrupted', {
        taskId: id,
        action: 'pause',
      });
    }
  },
  async resume(id) {
    if (activeTaskId === id) {
      throw new Error('Task is still pausing; try again shortly');
    }
    updateTask(id, { state: 'queued' });
    scheduleNextTask();
  },
  async cancel(id) {
    if (activeTaskId === id) {
      updateTask(id, { state: 'cancelled' });
      DeviceEventEmitter.emit('LNReaderTaskInterrupted', {
        taskId: id,
        action: 'cancel',
      });
    } else {
      removeTask(id);
    }
  },
  async updateProgress(id, progress, progressText) {
    updateTask(id, {
      progress: progress < 0 ? undefined : progress,
      progressText,
    });
  },
  async updateCheckpoint(id, checkpoint) {
    updateTask(id, { checkpoint });
  },
  async complete(id) {
    removeTask(id);
  },
  async fail(id, error) {
    const task = readTasks().find(item => item.id === id);
    if (task?.state === 'paused') updateTask(id, { progressText: error });
    else removeTask(id);
  },
  scheduleLibraryUpdates: unsupportedSchedule,
  async cancelLibraryUpdates() {},
  scheduleAutomaticBackups: unsupportedSchedule,
  async cancelAutomaticBackups() {},
};
